package cloud.sheetbot.agent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class KeepAliveService : Service() {
    private val serviceScope = CoroutineScope(Dispatchers.Default + Job())
    private var heartbeatJob: Job? = null
    private var receiptQueueJob: Job? = null
    private lateinit var prefs: PreferencesManager

    companion object {
        private const val TAG = "KeepAliveService"
        const val CHANNEL_ID = "sheetbot_keepalive_channel"
        const val NOTIFICATION_ID = 9001

        fun start(context: Context) {
            val intent = Intent(context, KeepAliveService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, KeepAliveService::class.java)
            context.stopService(intent)
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = PreferencesManager(this)
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        startHeartbeatLoop()
        startReceiptQueueLoop()
        Log.i(TAG, "KeepAliveService created and foregrounded with Receipt Queue monitoring.")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val email = prefs.userEmail
        Log.d(TAG, "KeepAliveService onStartCommand (User: $email)")
        // 시스템에 의해 강제 종료되더라도 자동 재생성 보장
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        heartbeatJob?.cancel()
        receiptQueueJob?.cancel()
        Log.w(TAG, "KeepAliveService destroyed.")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private var consecutiveHeartbeatFailures = 0

    private fun startHeartbeatLoop() {
        heartbeatJob?.cancel()
        heartbeatJob = serviceScope.launch {
            while (isActive) {
                val email = prefs.userEmail
                if (!email.isNullOrBlank()) {
                    val battery = BatteryUtil.getBatteryStatus(this@KeepAliveService)
                    val isSuccess = ApiClient.sendHeartbeat(
                        prefs.heartbeatUrl,
                        prefs.fallbackHeartbeatUrl,
                        email,
                        batteryLevel = battery.level,
                        isCharging = battery.isCharging
                    )

                    if (isSuccess) {
                        if (consecutiveHeartbeatFailures >= 3) {
                            showWatchdogNotification("🟢 서버 통신 복구 완료", "SheetBot 서버 및 터널과의 연결이 정상화되었습니다.", false)
                        }
                        consecutiveHeartbeatFailures = 0
                    } else {
                        consecutiveHeartbeatFailures++
                        Log.w(TAG, "서버 헬스체크 실패 (${consecutiveHeartbeatFailures}회 연속)")
                        if (consecutiveHeartbeatFailures == 3) {
                            showWatchdogNotification(
                                "🚨 SheetBot 서버 통신 두절",
                                "서버 또는 터널 연결이 3회 연속 실패했습니다. 네트워크 상태를 확인하세요.",
                                true
                            )
                            if (prefs.isTtsEnabled) {
                                TtsManager.speak(this@KeepAliveService, "주의! 시트봇 서버 연결이 두절되었습니다.")
                            }
                        }
                    }
                }
                // 5분마다 생존 신호 및 배터리 상태 전송
                delay(5 * 60 * 1000L)
            }
        }
    }

    private fun showWatchdogNotification(title: String, message: String, isWarning: Boolean) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val noti = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setSmallIcon(if (isWarning) android.R.drawable.ic_dialog_alert else android.R.drawable.ic_dialog_info)
            .setPriority(if (isWarning) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .build()
        manager.notify(9003, noti)
    }

    private fun startReceiptQueueLoop() {
        receiptQueueJob?.cancel()
        receiptQueueJob = serviceScope.launch {
            // 앱/서비스 기동 5초 후 1차 즉시 확인
            delay(5000L)
            while (isActive) {
                try {
                    val count = SmsSenderUtil.processPendingReceipts(this@KeepAliveService)
                    if (count > 0) {
                        Log.i(TAG, "🎯 [백그라운드 큐 발송] 미발송 영수증 ${count}건 자동 회신 완료")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "영수증 대기열 자동 발송 중 오류: ${e.message}")
                }
                // 3분(180초)마다 대기열 폴링
                delay(3 * 60 * 1000L)
            }
        }
    }

    private fun buildNotification(): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val userEmail = prefs.userEmail ?: "미연동 (QR 스캔 필요)"
        val statusText = if (prefs.isPaired) "🟢 실시간 입금 감지 중 ($userEmail)" else "⚠️ 미연동 상태: 앱을 열어 QR을 스캔하세요"

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SheetBot 무통장 자동확인기")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SheetBot 백그라운드 감지 상태",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "화면이 꺼져도 24시간 실시간으로 입금 문자를 감지하기 위한 상주 알림입니다."
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
}
