package cloud.sheetbot.agent.user

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
    private var recordingSyncJob: Job? = null
    private var websiteMonitorJob: Job? = null
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
        startForeground(NOTIFICATION_ID, buildNotification("🟢 24시간 실시간 고객 알림 문자 발송 대기 중 (${prefs.userEmail ?: "미연동"})"))
        startHeartbeatLoop()
        startReceiptQueueLoop()
        startRecordingSyncLoop()
        startWebsiteMonitorLoop()
        Log.i(TAG, "KeepAliveService created with SMS, Heartbeat, Call Recording, and Website Monitor Watchdog.")
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
        recordingSyncJob?.cancel()
        websiteMonitorJob?.cancel()
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
                            // 포그라운드 노티 정상 복구 (이용자 친화적 문구)
                            updateForegroundNotification("🟢 24시간 실시간 고객 알림 문자 발송 대기 중 ($email)")
                        }
                        consecutiveHeartbeatFailures = 0
                    } else {
                        consecutiveHeartbeatFailures++
                        Log.w(TAG, "서버 헬스체크 실패 (${consecutiveHeartbeatFailures}회 연속)")

                        // 2회 연속 실패 시 비상 사이렌 대신 조용히 오프라인 상태 노티로만 업데이트 (사용자 불편 방지)
                        if (consecutiveHeartbeatFailures >= 2) {
                            updateForegroundNotification("🟡 오프라인 모드 (네트워크 재연결 대기 중)")
                        }
                    }
                }
                // 1분(60초)마다 생존 신호 전송
                delay(60 * 1000L)
            }
        }
    }

    // ==========================================
    // 🌐 내 웹사이트 실시간 다운타임 모니터링 (Uptime Sentinel)
    // ==========================================
    private var consecutiveWebsiteFailures = 0

    private fun startWebsiteMonitorLoop() {
        websiteMonitorJob?.cancel()
        websiteMonitorJob = serviceScope.launch {
            delay(5000L) // 앱 시작 후 5초 뒤 첫 체크
            while (isActive) {
                try {
                    val isEnabled = prefs.isWebsiteMonitorEnabled
                    val targetUrl = prefs.targetWebsiteUrl.trim()

                    if (isEnabled && targetUrl.isNotBlank()) {
                        val check = ApiClient.checkWebsiteHealth(targetUrl)

                        if (check.isOnline) {
                            if (consecutiveWebsiteFailures >= 2) {
                                Log.i(TAG, "🎉 [웹사이트 복구] $targetUrl 정상 응답 (${check.statusCode}, ${check.responseTimeMs}ms)")
                                showWatchdogNotification("🟢 웹사이트 정상 복구", "$targetUrl 사이트가 정상 복구되었습니다. (HTTP ${check.statusCode})", false)
                                if (prefs.isTtsEnabled) {
                                    TtsManager.speak(this@KeepAliveService, "웹사이트 연결이 정상 복구되었습니다.")
                                }
                                // 구글 시트 대장에 복구 이력 자동 기록
                                val email = prefs.userEmail
                                if (!email.isNullOrBlank()) {
                                    serviceScope.launch {
                                        ApiClient.logWebsiteMonitorStatus(email, targetUrl, check.statusCode, check.responseTimeMs, "정상 복구 완료", true)
                                    }
                                }
                            }
                            consecutiveWebsiteFailures = 0
                            prefs.lastWebsiteCheckStatus = "정상 (HTTP ${check.statusCode}, ${check.responseTimeMs}ms)"
                            prefs.lastWebsiteCheckStatusCode = check.statusCode
                            prefs.lastWebsiteCheckTime = System.currentTimeMillis()
                        } else {
                            // 1차 실패: 스마트폰 인터넷 자체 연결 상태 교차 검증 (False Alarm 방지)
                            val isInternetOk = ApiClient.verifyInternetConnectivity()
                            if (isInternetOk) {
                                // 폰 인터넷은 정상이므로 실제 웹사이트 다운타임으로 판정!
                                consecutiveWebsiteFailures++
                                Log.w(TAG, "🚨 [웹사이트 응답 불가] $targetUrl (${consecutiveWebsiteFailures}회 연속): ${check.errorMessage}")
                                prefs.lastWebsiteCheckStatus = "응답 불가 (${check.errorMessage ?: "HTTP " + check.statusCode})"
                                prefs.lastWebsiteCheckStatusCode = check.statusCode
                                prefs.lastWebsiteCheckTime = System.currentTimeMillis()

                                // 2회 연속 실패 시 비상 경보 발동 (옵트인된 사용자 설정 준수)
                                if (consecutiveWebsiteFailures >= 2) {
                                    triggerWebsiteDownEmergency(targetUrl, check.statusCode, check.errorMessage)
                                }
                            } else {
                                Log.w(TAG, "스마트폰 외부 인터넷 일시 단절 감지 - 웹사이트 알람 유예")
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "웹사이트 모니터링 체크 중 오류: ${e.message}")
                }
                // 3분(180초) 주기로 웹사이트 헬스체크
                delay(180 * 1000L)
            }
        }
    }

    /**
     * 사용자가 등록한 웹사이트 다운 시 비상 경보 발동 (화면 켜기 + 전체화면 팝업 + 알림 + 구글 시트 기록)
     */
    private fun triggerWebsiteDownEmergency(targetUrl: String, statusCode: Int, errorMessage: String?) {
        Log.e(TAG, "🚨 [웹사이트 다운타임 비상 경보 발동] $targetUrl (HTTP $statusCode)")

        // 1. 설정에 따라 화면 켜기
        if (prefs.isWebsiteEmergencyAlarmEnabled) {
            wakeUpScreen()
            EmergencyAlarmActivity.startWebsiteAlarm(this, targetUrl, statusCode, errorMessage)
            if (prefs.isTtsEnabled) {
                TtsManager.speakAlarm(this, "주의! 등록하신 웹사이트에 응답이 없습니다. 서버 가동 상태를 확인하세요.")
            }
        }

        // 2. 비상 헤드업 노티피케이션 발행
        showWebsiteEmergencyNotification(targetUrl, statusCode, errorMessage)

        // 3. 구글 시트 대장에 장애 이력 실시간 자동 기록
        val email = prefs.userEmail
        if (!email.isNullOrBlank()) {
            serviceScope.launch {
                ApiClient.logWebsiteMonitorStatus(email, targetUrl, statusCode, 0L, errorMessage ?: "연결 불가 / 서버 다운", true)
            }
        }
    }

    private fun wakeUpScreen() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            val wl = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                        PowerManager.ACQUIRE_CAUSES_WAKEUP or
                        PowerManager.ON_AFTER_RELEASE,
                "SheetBot:WebsiteEmergencyWakeLock"
            )
            wl.acquire(15000L) // 15초간 화면 점등 유지
        } catch (e: Exception) {
            Log.w(TAG, "WakeLock 획득 실패: ${e.message}")
        }
    }

    private fun showWebsiteEmergencyNotification(targetUrl: String, statusCode: Int, errorMessage: String?) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val fullScreenIntent = Intent(this, EmergencyAlarmActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EmergencyAlarmActivity.EXTRA_TARGET_URL, targetUrl)
            putExtra(EmergencyAlarmActivity.EXTRA_STATUS_CODE, statusCode)
            putExtra(EmergencyAlarmActivity.EXTRA_ERROR_MESSAGE, errorMessage)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this, 1001, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val statusText = if (statusCode > 0) "HTTP $statusCode" else "응답 시간 초과"
        val noti = NotificationCompat.Builder(this, EMERGENCY_CHANNEL_ID)
            .setContentTitle("🚨 [웹사이트 긴급 다운 감지]")
            .setContentText("$targetUrl ($statusText)")
            .setStyle(NotificationCompat.BigTextStyle().bigText(
                "등록하신 웹사이트가 2회 연속 응답하지 않습니다.\n" +
                "• URL: $targetUrl\n" +
                "• 상태: $statusText (${errorMessage ?: "연결 불가"})\n" +
                "• 휴대폰 인터넷은 정상이므로 서버 호스팅 상태를 점검하세요."
            ))
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenPendingIntent, prefs.isWebsiteEmergencyAlarmEnabled)
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
            delay(3000L)
            while (isActive) {
                try {
                    val count = SmsSenderUtil.processPendingReceipts(this@KeepAliveService)
                    if (count > 0) {
                        Log.i(TAG, "🎯 [백그라운드 큐 발송] 미발송 영수증/알림 문자 ${count}건 자동 전송 완료")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "영수증/알림 문자 대기열 자동 발송 중 오류: ${e.message}")
                }
                // 실시간 반응성을 위해 20초마다 대기열 체크 (기존 3분에서 20초로 단축)
                delay(20 * 1000L)
            }
        }
    }

    private fun startRecordingSyncLoop() {
        recordingSyncJob?.cancel()
        recordingSyncJob = serviceScope.launch {
            delay(5000L)
            while (isActive) {
                try {
                    val uploaded = CallRecordingManager.scanAndUploadNewRecordings(this@KeepAliveService)
                    if (uploaded > 0) {
                        Log.i(TAG, "🎙️ [통화 녹음 백업] 신규 통화 녹음 ${uploaded}건 구글 드라이브 업로드 완료")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "통화 녹음 백업 감시 중 오류: ${e.message}")
                }
                // 25초마다 신규 통화 녹음 파일 감시
                delay(25 * 1000L)
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
        val text = statusText ?: if (prefs.isPaired) "🟢 24시간 실시간 고객 알림 문자 발송 대기 중 ($userEmail)" else "⚠️ 미연동 상태: 앱을 열어 QR을 스캔하세요"

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("시트봇 에이전트 (SheetBot Agent)")
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
