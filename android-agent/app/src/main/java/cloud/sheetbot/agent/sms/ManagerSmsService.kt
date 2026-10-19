package cloud.sheetbot.agent.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import cloud.sheetbot.agent.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** 포그라운드 서비스: 5초마다 서버 큐를 폴링해 인증번호 SMS를 발송하고 결과를 보고 */
class ManagerSmsService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var loop: Job? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var prefs: ManagerSmsPrefs

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = ManagerSmsPrefs(this)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground("대기 중")
        if (!prefs.isPaired) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sheetbot:manager-sms").apply { acquire() }
        }
        if (loop?.isActive != true) loop = scope.launch { pollLoop() }
        return START_STICKY
    }

    private suspend fun pollLoop() {
        while (scope.isActive) {
            flushPendingReports()
            when (val r = ManagerSmsApi.fetchQueue(prefs)) {
                is QueueResult.Unauthorized -> {
                    // 관리자가 기기를 폐기함 → 페어링 해제 후 종료
                    prefs.clearPairing()
                    setStatus("페어링이 해제되었습니다. 다시 페어링하세요.")
                    stopSelf()
                    return
                }
                is QueueResult.Ok -> {
                    setStatus(if (r.jobs.isEmpty()) "서버 연결됨 · 대기 중" else "발송 처리 중 (${r.jobs.size}건)")
                    for (job in r.jobs) handle(job)
                }
                is QueueResult.Error -> setStatus("서버 연결 오류: ${r.message}")
            }
            delay(5_000L)
        }
    }

    private suspend fun handle(job: SmsJob) {
        if (prefs.isHandled(job.id)) return // 이미 발송 시도한 작업은 재발송하지 않음
        prefs.markHandled(job.id)           // 발송 직전에 기록 → 크래시 시에도 중복 발송 방지

        val result = ManagerSmsSender.send(this, job.recipient, job.message)
        prefs.addPendingReport(ManagerSmsPrefs.PendingReport(job.id, result.success, result.error))
        flushPendingReports()
        setStatus(if (result.success) "발송 완료 (ID ${job.id})" else "발송 실패: ${result.error}")
    }

    private suspend fun flushPendingReports() {
        for (p in prefs.pendingReports()) {
            if (ManagerSmsApi.report(prefs, p.id, p.success, p.error)) prefs.removePendingReport(p.id)
        }
    }

    private fun setStatus(text: String) {
        prefs.lastStatus = text
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTI_ID, buildNotification(text))
    }

    private fun startAsForeground(text: String) {
        val n = buildNotification(text)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTI_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTI_ID, n)
        }
    }

    private fun buildNotification(text: String): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("SheetBot 인증번호 SMS 발송")
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "인증번호 SMS 발송 서비스", NotificationManager.IMPORTANCE_LOW)
            )
        }
    }

    override fun onDestroy() {
        scope.cancel()
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL_ID = "manager_sms"
        private const val NOTI_ID = 4101

        fun start(context: Context) {
            val i = Intent(context, ManagerSmsService::class.java)
            androidx.core.content.ContextCompat.startForegroundService(context, i)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ManagerSmsService::class.java))
        }
    }
}
