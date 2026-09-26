package cloud.sheetbot.agent.user

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

        // 카카오톡 수신 메시지 감지 및 구글 시트 동기화
        if (packageName == "com.kakao.talk") {
            handleKakaoNotification(sbn)
            return
        }

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

    /**
     * 카카오톡 수신 알림 정밀 파싱 및 구글 시트 동기화
     */
    private fun handleKakaoNotification(sbn: StatusBarNotification) {
        if (!prefs.isPaired || !prefs.isKakaoSheetSyncEnabled) return
        val userEmail = prefs.userEmail ?: return

        try {
            val extras = sbn.notification.extras ?: return
            val rawTitle = extras.getString(Notification.EXTRA_TITLE)
                ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            val rawText = extras.getString(Notification.EXTRA_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
                ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
            val rawSubText = extras.getString(Notification.EXTRA_SUB_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""

            if (rawText.isBlank()) return

            // 1. 단체방 vs 1:1 대화 분리 파싱
            var chatRoomName = rawTitle.trim()
            var sender = rawTitle.trim()
            var message = rawText.trim()
            var isGroupChat = false

            if (rawSubText.isNotBlank()) {
                // 서브텍스트가 있으면 대화방 이름이 서브텍스트이고 타이틀이 발신자
                chatRoomName = rawSubText.trim()
                sender = rawTitle.trim()
                isGroupChat = true
            } else if (rawText.contains(": ")) {
                // 본문에 '발신자: 내용' 형태로 들어오는 경우 (단톡방)
                val parts = rawText.split(": ", limit = 2)
                if (parts.size == 2 && parts[0].length <= 20) {
                    sender = parts[0].trim()
                    message = parts[1].trim()
                    chatRoomName = rawTitle.trim()
                    isGroupChat = true
                }
            }

            // 2. 사생활 보호 필터 검사
            val filter = prefs.kakaoTargetFilter.trim()
            if (!matchesKakaoFilter(chatRoomName, sender, filter)) {
                Log.d(TAG, "카카오톡 필터 제외: $chatRoomName / $sender")
                return
            }

            // 3. 3초 이내 동일 알림 중복 감지 방어
            val dedupeKey = "kakao:$chatRoomName:$sender:$message"
            val now = System.currentTimeMillis()
            val lastSeen = recentCache[dedupeKey] ?: 0L
            if (now - lastSeen < 3000L) {
                return
            }
            recentCache[dedupeKey] = now

            Log.i(TAG, "💬 [카카오톡 감지] 방: '$chatRoomName' / 발신자: '$sender' / 내용: '${message.take(30)}...'")

            // 4. 비동기 구글 시트 동기화
            serviceScope.launch {
                try {
                    val isSynced = ApiClient.sendKakaoSync(
                        userEmail = userEmail,
                        chatRoomName = chatRoomName,
                        sender = sender,
                        isGroupChat = isGroupChat,
                        message = message,
                        sheetTitle = prefs.kakaoDriveSheetTitle
                    )

                    if (isSynced) {
                        Log.i(TAG, "🎉 [카카오톡 시트 기록 완료] $chatRoomName ($sender)")

                        // UI 로그 갱신 브로드캐스트
                        val updateIntent = Intent(SmsReceiver.ACTION_SMS_RECEIVED).apply {
                            putExtra("smsBody", "[카톡 $chatRoomName] $sender: $message")
                            putExtra("sender", sender)
                            putExtra("success", true)
                            setPackage(packageName)
                        }
                        sendBroadcast(updateIntent)

                        if (prefs.isTtsEnabled) {
                            TtsManager.speak(this@BankNotificationListener, "${sender}님의 카카오톡 메시지가 구글 시트에 기록되었습니다.")
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "카카오톡 시트 동기화 예외", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "카카오톡 알림 파싱 오류", e)
        }
    }

    private fun matchesKakaoFilter(chatRoomName: String, sender: String, filter: String): Boolean {
        if (filter.isBlank()) return true
        val keywords = filter.split(",", ";", " ").map { it.trim() }.filter { it.isNotBlank() }
        val cleanRoom = chatRoomName.replace(" ", "").lowercase()
        val cleanSender = sender.replace(" ", "").lowercase()

        for (kw in keywords) {
            val cleanKw = kw.replace(" ", "").lowercase()
            if (cleanRoom.contains(cleanKw) || cleanSender.contains(cleanKw) || chatRoomName.contains(kw) || sender.contains(kw)) {
                return true
            }
        }
        return false
    }
}

