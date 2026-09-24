package cloud.sheetbot.agent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
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
        const val EMERGENCY_CHANNEL_ID = "sheetbot_emergency_channel"
        const val NOTIFICATION_ID = 9001
        const val EMERGENCY_NOTIFICATION_ID = 9002

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
        createNotificationChannels()
        startForeground(NOTIFICATION_ID, buildNotification("🟢 실시간 입금 감지 중 (${prefs.userEmail ?: "미연동"})"))
        startHeartbeatLoop()
        startReceiptQueueLoop()
        Log.i(TAG, "KeepAliveService created and foregrounded with 1-min Heartbeat Watchdog.")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val email = prefs.userEmail
        Log.d(TAG, "KeepAliveService onStartCommand (User: $email)")
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
                        if (consecutiveHeartbeatFailures >= 2) {
                            Log.i(TAG, "🎉 서버 통신 정상 복구 감지!")
                            showWatchdogNotification("🟢 서버 통신 복구 완료", "SheetBot 서버와의 연결이 정상화되었습니다.", false)
                            if (prefs.isTtsEnabled) {
                                TtsManager.speak(this@KeepAliveService, "시트봇 서버 연결이 정상 복구되었습니다.")
                            }
                            // 오프라인 큐 즉시 비우기
                            val drained = DepositQueueManager.drainQueue(this@KeepAliveService)
                            if (drained > 0) {
                                Log.i(TAG, "대기열 ${drained}건 서버 자동 전송 완료")
                            }
                            // 포그라운드 노티 복구
                            updateForegroundNotification("🟢 실시간 입금 감지 중 ($email)")
                        }
                        consecutiveHeartbeatFailures = 0
                    } else {
                        consecutiveHeartbeatFailures++
                        Log.w(TAG, "서버 헬스체크 실패 (${consecutiveHeartbeatFailures}회 연속)")

                        // 2회 연속 실패 (2분 경과 시) 비상 경보 발동
                        if (consecutiveHeartbeatFailures >= 2) {
                            triggerEmergencyAlarm()
                        }
                    }
                }
                // 1분(60초)마다 생존 신호 전송 (기존 5분에서 1분으로 단축)
                delay(60 * 1000L)
            }
        }
    }

    /**
     * 잠금화면 화면 켜기 + 비상 경보 팝업 + 고성능 노티피케이션 + TTS 발동
     */
    private fun triggerEmergencyAlarm() {
        Log.e(TAG, "🚨 [서버 다운 비상 경보 발동] 2분 이상 서버 응답 없음")

        // 1. 포그라운드 노티 붉은색 경고로 갱신
        val pendingCount = DepositQueueManager.getPendingCount(this)
        updateForegroundNotification("🔴 서버 연결 두절 (입금 대기열 ${pendingCount}건 로컬 보관 중)")

        // 2. WakeLock으로 꺼진 화면 강제 켜기
        wakeUpScreen()

        // 3. 풀스크린 비상 경보 액티비티 기동
        EmergencyAlarmActivity.start(this)

        // 4. 헤드업 비상 노티피케이션 발행 (잠금화면에서도 볼 수 있도록)
        showEmergencyNotification()

        // 5. TTS 음성 경보 (설정 ON 시)
        if (prefs.isTtsEnabled) {
            TtsManager.speak(this, "주의! 시트봇 서버 연결이 두절되었습니다. 입금 자동 처리가 중단되니 서버 상태를 확인하세요.")
        }
    }

    private fun wakeUpScreen() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            val wl = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                        PowerManager.ACQUIRE_CAUSES_WAKEUP or
                        PowerManager.ON_AFTER_RELEASE,
                "SheetBot:EmergencyWakeLock"
            )
            wl.acquire(10000L) // 10초간 화면 점등 유지
        } catch (e: Exception) {
            Log.w(TAG, "WakeLock 획득 실패: ${e.message}")
        }
    }

    private fun showEmergencyNotification() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val fullScreenIntent = Intent(this, EmergencyAlarmActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this, 1001, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val pendingCount = DepositQueueManager.getPendingCount(this)
        val noti = NotificationCompat.Builder(this, EMERGENCY_CHANNEL_ID)
            .setContentTitle("🚨 [비상 경보] 시트봇 서버 연결 두절!")
            .setContentText("sheetbot.cloud 서버가 응답하지 않습니다. (오프라인 큐: ${pendingCount}건)")
            .setStyle(NotificationCompat.BigTextStyle().bigText(
                "2분 이상 서버 통신이 두절되었습니다.\n" +
                "입금 내역은 스마트폰에 안전하게 임시 보관 중입니다.\n" +
                "관리자 PC에서 서버 또는 터널 가동 상태를 즉시 점검하세요."
            ))
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setAutoCancel(true)
            .build()

        manager.notify(EMERGENCY_NOTIFICATION_ID, noti)
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
                delay(3 * 60 * 1000L)
            }
        }
    }

    private fun updateForegroundNotification(statusText: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(statusText))
    }

    private fun buildNotification(statusText: String? = null): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val userEmail = prefs.userEmail ?: "미연동 (QR 스캔 필요)"
        val text = statusText ?: if (prefs.isPaired) "🟢 실시간 입금 감지 중 ($userEmail)" else "⚠️ 미연동 상태: 앱을 열어 QR을 스캔하세요"

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("시트봇 에이전트 M (SheetBot Agent M)")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            // 1. 일반 상주 채널 (낮은 중요도, 무음)
            val keepAliveChannel = NotificationChannel(
                CHANNEL_ID,
                "SheetBot 백그라운드 감지 상태",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "화면이 꺼져도 24시간 실시간으로 입금 문자를 감지하기 위한 상주 알림입니다."
                setShowBadge(false)
            }
            manager.createNotificationChannel(keepAliveChannel)

            // 2. 비상 경보 채널 (최고 중요도, 헤드업 알림 & 사운드 & 진동)
            val alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build()

            val emergencyChannel = NotificationChannel(
                EMERGENCY_CHANNEL_ID,
                "SheetBot 서버 두절 비상 경보",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "sheetbot.cloud 서버가 다운되거나 연결이 끊어졌을 때 즉시 알립니다."
                enableVibration(true)
                setSound(alarmSound, audioAttributes)
                setShowBadge(true)
            }
            manager.createNotificationChannel(emergencyChannel)
        }
    }
}
