package cloud.sheetbot.agent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.Collections
import java.util.LinkedHashMap

/**
 * 은행 및 금융사 앱의 무료 푸시 알림(Notification)을 실시간 감지하여 자동 입금 처리하는 상주 서비스
 */
class BankNotificationListener : NotificationListenerService() {
    companion object {
        private const val TAG = "BankNotiListener"
        const val PUSH_CHANNEL_ID = "sheetbot_push_alerts"

        // 5초 이내 동일 알림 중복 감지 방지 캐시 (최대 50개 보관)
        private val recentCache = Collections.synchronizedMap(
            object : LinkedHashMap<String, Long>(50, 0.75f, true) {
                override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?): Boolean {
                    return size > 50
                }
            }
        )
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO)
    private lateinit var prefs: PreferencesManager

    override fun onCreate() {
        super.onCreate()
        prefs = PreferencesManager(this)
        Log.i(TAG, "BankNotificationListener 서비스가 초기화되었습니다.")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: return

        // 1. 지원 금융 앱 여부 확인
        if (!BankPushParser.isSupportedBank(packageName)) {
            return
        }

        // 2. 계정 연동 및 푸시 감지 설정 확인
        if (!prefs.isPaired || !prefs.isPushDetectionEnabled) {
            return
        }

        val userEmail = prefs.userEmail
        if (userEmail.isNullOrBlank()) return

        try {
            val extras = sbn.notification.extras ?: return
            val title = extras.getString(Notification.EXTRA_TITLE)
                ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            val text = extras.getString(Notification.EXTRA_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
                ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""

            // 3. 입금 알림 여부 정밀 판별
            if (!BankPushParser.isDepositNotification(title, text)) {
                return
            }

            // 4. 5초 이내 중복 방어
            val dedupeKey = "$packageName:$title:$text"
            val now = System.currentTimeMillis()
            val lastSeen = recentCache[dedupeKey] ?: 0L
            if (now - lastSeen < 5000L) {
                Log.d(TAG, "5초 이내 동일한 금융 푸시 중복 감지 - 무시합니다.")
                return
            }
            recentCache[dedupeKey] = now

            val bankName = BankPushParser.SUPPORTED_BANK_PACKAGES[packageName] ?: "금융사"
            Log.i(TAG, "🔔 [$bankName 푸시 감지] 제목: '$title' / 내용: '$text'")

            // 5. 서버 웹훅 규격의 가상 SMS로 변환 후 비동기 전송
            val simulatedSms = BankPushParser.convertToSimulatedSms(packageName, title, text)

            serviceScope.launch {
                try {
                    val result = ApiClient.sendBankWebhook(
                        webhookUrl = prefs.webhookUrl,
                        fallbackWebhookUrl = prefs.fallbackWebhookUrl,
                        sender = "PUSH:$bankName",
                        smsText = simulatedSms,
                        userEmail = userEmail
                    )

                    if (result.success) {
                        Log.i(TAG, "[$bankName 푸시 웹훅 전송 성공] 상태=${result.statusCode}")
                        // 6. 로컬 상태 기록
                        val logSummary = "[$bankName 푸시] ${text.take(60)}"
                        prefs.lastDetectedDeposit = logSummary

                        showNotification(title, text, true, bankName)

                        // 7. 0원 영수증 SMS 자동 회신
                        if (prefs.isReceiptSmsEnabled && !result.replySmsPhone.isNullOrBlank() && !result.replySmsText.isNullOrBlank()) {
                            val isSent = SmsSenderUtil.sendSms(this@BankNotificationListener, result.replySmsPhone, result.replySmsText)
                            if (isSent) {
                                Log.i(TAG, "📲 [푸시 연계 영수증 SMS 발송 성공] 수신: ${result.replySmsPhone}")
                            }
                        }

                        // 8. TTS 음성 안내
                        if (prefs.isTtsEnabled) {
                            val voiceMsg = result.ttsText ?: "$bankName 입금이 감지되어 충전이 완료되었습니다."
                            TtsManager.speak(this@BankNotificationListener, voiceMsg)
                        }
                    } else {
                        Log.w(TAG, "⚠️ [$bankName 푸시 웹훅 전송 실패] 오프라인 대기열에 저장: 상태=${result.statusCode}")
                        DepositQueueManager.enqueueDeposit(
                            this@BankNotificationListener,
                            "PUSH:$bankName",
                            simulatedSms,
                            userEmail,
                            "push"
                        )
                        showNotification(title, text, false, bankName)
                        if (prefs.isTtsEnabled) {
                            TtsManager.speak(this@BankNotificationListener, "서버 연결 불안정으로 $bankName 입금 내역이 오프라인 대기열에 저장되었습니다.")
                        }
                    }

                    // 9. UI 화면 갱신 브로드캐스트
                    val updateIntent = Intent(SmsReceiver.ACTION_DEPOSIT_DETECTED).apply {
                        putExtra("smsBody", "[$bankName 푸시] $text")
                        putExtra("sender", bankName)
                        putExtra("success", result.success)
                        setPackage(packageName)
                    }
                    sendBroadcast(updateIntent)
                } catch (e: Exception) {
                    Log.e(TAG, "푸시 웹훅 처리 중 예외 발생 -> 오프라인 대기열 저장", e)
                    DepositQueueManager.enqueueDeposit(
                        this@BankNotificationListener,
                        "PUSH:$bankName",
                        simulatedSms,
                        userEmail,
                        "push"
                    )
                    showNotification(title, text, false, bankName)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "onNotificationPosted 파싱 오류", e)
        }
    }

    private fun showNotification(title: String, text: String, isSuccess: Boolean, bankName: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                PUSH_CHANNEL_ID,
                "SheetBot 금융 푸시 알림",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "은행 앱 푸시 알림이 감지되어 토큰 충전이 완료되었을 때 알립니다."
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }

        val notiTitle = if (isSuccess) "🔔 [$bankName 푸시감지] 무통장 입금 자동 충전 완료!" else "⚠️ [$bankName 푸시감지] 오프라인 대기열 안전 보관"

        val notification = NotificationCompat.Builder(this, PUSH_CHANNEL_ID)
            .setContentTitle(notiTitle)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        manager.notify((System.currentTimeMillis() % 100000).toInt(), notification)
    }
}
