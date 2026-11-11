package cloud.sheetbot.agent.user

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
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
 * 은행 및 금융사 앱의 무료 푸시 알림(Notification)과 카카오톡(일반/단톡/알림톡)을 실시간 감지하여 자동 동기화하는 상주 서비스
 */
class BankNotificationListener : NotificationListenerService() {
    companion object {
        private const val TAG = "BankNotiListener"
        const val PUSH_CHANNEL_ID = "sheetbot_push_alerts"
        private const val KAKAO_HISTORY_PREFS = "kakao_synced_history_prefs"

        // 📧 기본 감지 대상 주요 메일 앱 패키지 맵 (Gmail, 네이버 메일, 다음 메일, 삼성 이메일, Outlook, 네이버웍스, 카카오워크)
        val SUPPORTED_EMAIL_PACKAGES: Map<String, String> = mapOf(
            "com.google.android.gm" to "Gmail",
            "com.nhn.android.mail" to "네이버 메일",
            "net.daum.android.mail" to "다음 메일",
            "com.samsung.android.email.provider" to "삼성 이메일",
            "com.microsoft.office.outlook" to "Outlook",
            "com.worksmobile.android" to "네이버웍스",
            "com.kakao.enterprise.kakaowork" to "카카오워크"
        )

        @Volatile
        var isListenerConnected: Boolean = false
            private set

        // 5초 이내 동일 알림 중복 감지 방지 캐시 (최대 50개 보관)
        private val recentCache = Collections.synchronizedMap(
            object : LinkedHashMap<String, Long>(50, 0.75f, true) {
                override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?): Boolean {
                    return size > 50
                }
            }
        )

        @Volatile
        private var activeInstance: BankNotificationListener? = null

        /**
         * 🔄 앱 업데이트(MY_PACKAGE_REPLACED), 재부팅, 프로세스 재시작 시 삼성 One UI 등에서
         * NotificationListenerService 바인딩이 해제되는 현상을 즉시 복구합니다.
         */
        fun ensureListenerBound(context: Context) {
            try {
                val cn = ComponentName(context, BankNotificationListener::class.java)
                context.packageManager.setComponentEnabledSetting(
                    cn,
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP
                )
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    requestRebind(cn)
                }
            } catch (e: Exception) {
                Log.w(TAG, "ensureListenerBound 재바인딩 요청 예외: ${e.message}")
            }
        }

        /**
         * 💬 할 일 허브 / 워크스페이스에서 '카카오톡 열기' 클릭 직전 상단 알림바의 현재 활성 카카오톡 알림을
         * 즉시 스캔하여 KakaoReplySessionCache에 최신 대화방 PendingIntent를 보강합니다.
         */
        fun refreshKakaoSessionCacheNow() {
            try {
                val listener = activeInstance ?: return
                val activeList = listener.activeNotifications ?: return
                for (sbn in activeList) {
                    if (sbn.packageName == "com.kakao.talk") {
                        listener.captureKakaoSessionOnly(sbn)
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "refreshKakaoSessionCacheNow 예외: ${e.message}")
            }
        }
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO)
    private lateinit var prefs: PreferencesManager

    override fun onCreate() {
        super.onCreate()
        activeInstance = this
        prefs = PreferencesManager(this)
        Log.i(TAG, "BankNotificationListener 서비스가 초기화되었습니다.")
    }

    override fun onDestroy() {
        if (activeInstance === this) {
            activeInstance = null
        }
        super.onDestroy()
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        activeInstance = this
        isListenerConnected = true
        Log.i(TAG, "✅ BankNotificationListener 바인딩 연결 완료 -> 상단바 미처리 알림 스캔 시작")
        sweepActiveNotifications()
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        isListenerConnected = false
        Log.w(TAG, "⚠️ BankNotificationListener 연결 해제 감지 -> 즉시 requestRebind 호출")
        ensureListenerBound(this)
    }

    /**
     * 시트 중복 전송 없이 상단바 카카오톡 알림에서 대화방 바로가기(PendingIntent) 세션만 즉시 추출·캐싱합니다.
     */
    internal fun captureKakaoSessionOnly(sbn: StatusBarNotification) {
        try {
            val notification = sbn.notification ?: return
            val extras = notification.extras ?: return
            val rawTitle = extras.getString(Notification.EXTRA_TITLE)
                ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            val rawSubText = extras.getString(Notification.EXTRA_SUB_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""
            val conversationTitle = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()?.trim()
            val isGroupConversationExtra = extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false)
                || extras.getBoolean("android.isGroupConversation", false)

            var chatRoomName = rawTitle.trim()
            var sender = rawTitle.trim()
            if (!conversationTitle.isNullOrBlank()) {
                chatRoomName = conversationTitle
                sender = rawTitle.trim()
            } else if (isGroupConversationExtra && rawSubText.isNotBlank()) {
                chatRoomName = rawSubText.trim()
                sender = rawTitle.trim()
            } else if (rawSubText.isNotBlank() && !rawSubText.contains("알림톡") && !rawSubText.contains("메시지")) {
                chatRoomName = rawSubText.trim()
                sender = rawTitle.trim()
            }
            KakaoReplySessionCache.captureFromNotification(sbn, chatRoomName, sender)
        } catch (_: Exception) {}
    }

    /**
     * 🔍 앱 업데이트 직후 재연결 시 상단 알림바에 남아 있는 최근 카카오톡/알림톡 및 이메일을 스캔하여 누락 없이 자동 수거합니다.
     */
    private fun sweepActiveNotifications() {
        try {
            val activeList = activeNotifications ?: return
            val now = System.currentTimeMillis()
            // 최근 12시간 이내에 도착해 상단바에 남아 있는 카카오톡/이메일 알림만 안전하게 점검
            for (sbn in activeList) {
                if ((now - sbn.postTime) > 12L * 3600L * 1000L) continue
                val pkg = sbn.packageName ?: continue
                if (pkg == "com.kakao.talk") {
                    handleKakaoNotification(sbn, isFromActiveSweep = true)
                } else if (SUPPORTED_EMAIL_PACKAGES.containsKey(pkg)) {
                    handleEmailNotification(sbn, isFromActiveSweep = true)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "상단바 활성 알림 스캔 중 예외: ${e.message}")
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: return

        // 카카오톡 수신 메시지 감지 및 구글 시트 동기화
        if (packageName == "com.kakao.talk") {
            handleKakaoNotification(sbn)
            return
        }

        // 📧 주요 메일 앱(Gmail, 네이버 메일, 다음 메일, 삼성 이메일, Outlook 등) 수신 알림 감지 및 시트/할일 자동 동기화
        if (SUPPORTED_EMAIL_PACKAGES.containsKey(packageName)) {
            handleEmailNotification(sbn)
            return
        }

        // 구글 메시지(Google Messages) 및 삼성 메시지 (RCS & SMS) 알림 감지 및 구글 시트 동기화
        if (packageName == "com.google.android.apps.messaging" || packageName == "com.samsung.android.messaging") {
            handleMessageNotification(sbn)
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
            val text = extractFullNotificationText(extras)

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

                        // 7. 고객 영수증 문자 자동 전송 (설정 ON && 서버에서 대상 번호 회신 시)
                        if (prefs.isReceiptSmsEnabled && !result.replySmsPhone.isNullOrBlank()) {
                            // 🛡️ 상대방 번호가 한국 휴대전화가 아닌 경우(유선전화, 대표번호 등) 영수증 SMS 발송 제외
                            if (!ContactHelper.isMobilePhoneNumber(result.replySmsPhone)) {
                                Log.i(TAG, "⏭️ [푸시 연계 영수증 SMS 제외] 휴대전화가 아닌 번호입니다: ${result.replySmsPhone} (유선/대표번호 자동 제외)")
                            } else {
                                val custName = result.depositorName?.takeIf { it.isNotBlank() } ?: "고객"
                                val custAmount = result.amountKrw

                                // 🎯 [앱 설정 최우선] 고객 발송 영수증 문구 템플릿 란에 설정된 문구를 1순위로 적용
                                val template = prefs.receiptSmsTemplate.takeIf { it.isNotBlank() }
                                    ?: (result.replySmsText?.takeIf { it.isNotBlank() }
                                        ?: "[SheetBot] {고객명}님, {금액} 결제가 정상 확인되었습니다. 이용해 주셔서 감사합니다.")

                                val msgToSend = SmsSenderUtil.formatReceiptMessage(
                                    template = template,
                                    customerName = custName,
                                    amountKrw = custAmount
                                )

                                if (msgToSend.isNotBlank()) {
                                    val (isSent, finalMsg) = SmsSenderUtil.sendSmsDetailed(this@BankNotificationListener, result.replySmsPhone, msgToSend)
                                    val statusLabel = if (isSent) "전송 완료" else "전송 실패"
                                    Log.i(TAG, "📲 [푸시 연계 영수증 SMS $statusLabel] 수신: ${result.replySmsPhone} (고객: $custName) / 내용: $finalMsg")
                                    ApiClient.sendReceiptSmsSync(
                                        userEmail = userEmail,
                                        recipientPhone = result.replySmsPhone,
                                        customerName = custName,
                                        amount = custAmount,
                                        receiptContent = finalMsg,
                                        status = statusLabel
                                    )
                                }
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
                description = "은행 및 페이 푸시 알림이 감지되어 매장 결제 및 매출 대장에 자동 기록되었을 때 알립니다."
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }

        val notiTitle = if (isSuccess) "🔔 [$bankName 푸시감지] 결제 및 매출 대장 기록 완료!" else "⚠️ [$bankName 푸시감지] 오프라인 대기열 안전 보관"

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
     * 📄 알림 Extras에서 요약문("알림톡 도착" 등)에 가려지지 않고 전체 장문(EXTRA_BIG_TEXT / EXTRA_TEXT_LINES / EXTRA_MESSAGES)을 최우선 추출합니다.
     */
    private fun extractFullNotificationText(extras: Bundle): String {
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim().orEmpty()
        val normalText = (extras.getString(Notification.EXTRA_TEXT)
            ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString())?.trim().orEmpty()

        // InboxStyle(EXTRA_TEXT_LINES) 전체 줄 결합
        val textLinesJoined = try {
            extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
                ?.mapNotNull { it?.toString()?.trim()?.takeIf { line -> line.isNotEmpty() } }
                ?.joinToString("\n")
                .orEmpty()
        } catch (_: Exception) {
            ""
        }

        // MessagingStyle 메시지 배열(EXTRA_MESSAGES)에서 가장 최신/상세 본문 추출
        var messagingText = ""
        try {
            @Suppress("DEPRECATION")
            val msgBundles = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
            if (!msgBundles.isNullOrEmpty()) {
                val lastBundle = msgBundles.lastOrNull() as? Bundle
                val mText = lastBundle?.getCharSequence("text")?.toString()?.trim().orEmpty()
                if (mText.length > messagingText.length) {
                    messagingText = mText
                }
            }
        } catch (_: Exception) {}

        // EXTRA_TEXT가 "알림톡 도착" 등 짧은 플레이스홀더이거나 bigText/messagingText/textLinesJoined가 더 긴 경우 가장 상세한 본문 선택
        val candidates = listOf(bigText, textLinesJoined, messagingText, normalText).filter { it.isNotBlank() }
        if (candidates.isEmpty()) return ""
        val nonPlaceholder = candidates.filter {
            it != "알림톡 도착" && it != "메시지가 도착했습니다." && it != "새로운 메시지"
        }
        return (if (nonPlaceholder.isNotEmpty()) nonPlaceholder else candidates).maxByOrNull { it.length } ?: normalText
    }

    /**
     * 구형 단톡방의 '발신자: 내용' 형식인지 정밀 판별합니다.
     * - 알림톡 본문 내 '■ 보험구분: 건강보험', '■ 계좌정보: 카카오뱅크은행' 등의 콜론(': ')이
     *   단톡방 발신자로 오인되어 잘리는 현상을 100% 차단합니다.
     */
    private fun isLikelyLegacyGroupChatPrefix(rawTitle: String, rawText: String): Pair<String, String>? {
        if (!rawText.contains(": ")) return null
        val trimmed = rawText.trim()
        // 대괄호 알림톡 헤더('[국민건강보험공단의 알림]' 등)나 특수기호로 시작하는 알림톡/공지문은 제외
        if (trimmed.startsWith("[") || trimmed.startsWith("■") || trimmed.startsWith("□") ||
            trimmed.startsWith("-") || trimmed.startsWith("※") || trimmed.contains("알림톡")
        ) {
            return null
        }
        val firstLine = trimmed.lineSequence().firstOrNull()?.trim().orEmpty()
        if (!firstLine.contains(": ")) return null

        val parts = trimmed.split(": ", limit = 2)
        if (parts.size != 2) return null
        val candidateSender = parts[0].trim()
        val candidateBody = parts[1].trim()
        if (candidateSender.isEmpty() || candidateSender.length > 15 || candidateBody.isEmpty()) return null

        val nonSenderKeywords = listOf(
            "[", "]", "■", "□", "※", "•", "보험", "계좌", "금액", "납부", "고지", "신청",
            "안내", "결제", "주문", "배송", "일시", "번호", "제목", "구분", "기한", "http"
        )
        if (nonSenderKeywords.any { candidateSender.contains(it, ignoreCase = true) }) {
            return null
        }
        return candidateSender to candidateBody
    }

    /**
     * 카카오톡 수신 알림 정밀 파싱 및 구글 시트/파일투시트 동기화
     */
    private fun handleKakaoNotification(sbn: StatusBarNotification, isFromActiveSweep: Boolean = false) {
        try {
            val notification = sbn.notification ?: return
            val extras = notification.extras ?: return
            val rawTitle = extras.getString(Notification.EXTRA_TITLE)
                ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            val rawText = extractFullNotificationText(extras)
            val rawSubText = extras.getString(Notification.EXTRA_SUB_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""

            if (rawText.isBlank()) return

            // 1. 안드로이드 최신 MessagingStyle 표준 속성 추출 (단체 대화방 감지)
            val conversationTitle = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()?.trim()
            val isGroupConversationExtra = extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false)
                || extras.getBoolean("android.isGroupConversation", false)

            // 2. 단체방 vs 1:1 대화(및 채널 알림톡) 분리 파싱
            var chatRoomName = rawTitle.trim()
            var sender = rawTitle.trim()
            var message = rawText.trim()
            var isGroupChat = false

            // [우선순위 1] 최신 MessagingStyle 대화방 타이틀이 명시된 경우 (가장 정확한 단체방 감지)
            if (!conversationTitle.isNullOrBlank()) {
                chatRoomName = conversationTitle
                sender = rawTitle.trim()
                isGroupChat = true
            }
            // [우선순위 2] 안드로이드 시스템 표준 그룹 대화 플래그가 true인 경우
            else if (isGroupConversationExtra) {
                isGroupChat = true
                if (rawSubText.isNotBlank()) {
                    chatRoomName = rawSubText.trim()
                    sender = rawTitle.trim()
                } else {
                    chatRoomName = "단체 채팅방"
                    sender = rawTitle.trim()
                }
            }
            // [우선순위 3] 서브텍스트에 대화방 이름이 실려오는 구형 방식 (단, '알림톡' 등 시스템 서브텍스트 제외)
            else if (rawSubText.isNotBlank() && !rawSubText.contains("알림톡") && !rawSubText.contains("메시지")) {
                chatRoomName = rawSubText.trim()
                sender = rawTitle.trim()
                isGroupChat = true
            }
            // [우선순위 4] 첫 줄에 순수 '발신자: 내용' 형태로 들어오는 구형 단톡방 방식 (알림톡 콜론 오인 원천 차단)
            else {
                val legacyGroup = isLikelyLegacyGroupChatPrefix(rawTitle, rawText)
                if (legacyGroup != null) {
                    sender = legacyGroup.first
                    message = legacyGroup.second
                    chatRoomName = rawTitle.trim()
                    isGroupChat = true
                }
            }

            // 💬 스마트 통합 할 일 허브에서 즉시 카톡 채팅방 열기 & 직접 답장(RemoteInput)이 가능하도록 세션 캐싱
            KakaoReplySessionCache.captureFromNotification(sbn, chatRoomName, sender)

            if (!prefs.isPaired && !prefs.isFtsPaired) return
            val userEmail = prefs.userEmail ?: ""

            // 영구 중복 방지 스토리지 (상단바 재스캔 및 헤즈업 알림 재호출 시 이미 동기화된 알림톡 중복 적재 차단)
            val historyPrefs = getSharedPreferences(KAKAO_HISTORY_PREFS, Context.MODE_PRIVATE)
            val persistentSig = "k_${chatRoomName}_${sender}_${message.hashCode()}"
            val prevSyncedAt = historyPrefs.getLong(persistentSig, 0L)
            val nowMs = System.currentTimeMillis()
            if (isFromActiveSweep && prevSyncedAt > 0L) {
                return
            }
            if (!isFromActiveSweep && prevSyncedAt > 0L && (nowMs - prevSyncedAt) < 60_000L) {
                return
            }

            // ========================================================
            // [A] 최우선 금융 알림톡 감지 (카카오페이 / 카카오뱅크 송금·입금·결제 알림)
            // - 일반 카카오톡 시트 동기화 스위치나 개인톡 필터와 무관하게,
            //   금융 푸시 감지(isPushDetectionEnabled)가 켜져 있으면 매장 결제 대장에 100% 직행 전송
            // ========================================================
            val isKakaoFinancial = (chatRoomName.contains("카카오페이") || chatRoomName.contains("카카오뱅크") ||
                    sender.contains("카카오페이") || sender.contains("카카오뱅크") ||
                    message.contains("카카오페이") || message.contains("카카오뱅크")) &&
                    BankPushParser.isFinancialNotification(chatRoomName, message)

            if (isKakaoFinancial && prefs.isPushDetectionEnabled) {
                val financialDedupeKey = "financial:kakao:$chatRoomName:$sender:$message"
                val now = System.currentTimeMillis()
                val lastSeen = recentCache[financialDedupeKey] ?: 0L
                if (now - lastSeen >= 4000L) {
                    recentCache[financialDedupeKey] = now
                    val financialOrg = if (chatRoomName.contains("카카오뱅크") || sender.contains("카카오뱅크")) "카카오뱅크" else "카카오페이"
                    val simulatedSms = BankPushParser.convertToSimulatedSms("com.kakao.kakaopay", "[$financialOrg]", message)
                    Log.i(TAG, "💰 [카카오 금융 알림톡 감지] $financialOrg 결제/송금 -> 매장 대장 웹훅 전송")

                    serviceScope.launch {
                            val res = ApiClient.sendBankWebhook(
                                webhookUrl = prefs.webhookUrl,
                                fallbackWebhookUrl = prefs.fallbackWebhookUrl,
                                sender = "PUSH:$financialOrg",
                                smsText = simulatedSms,
                                userEmail = userEmail
                            )
                            Log.i(TAG, "💰 [카카오 알림톡 웹훅 완료] status=${res.statusCode} success=${res.success}")

                            if (res.success) {
                                showNotification("[$financialOrg]", message, true, financialOrg)

                                // 고객 영수증 문자 자동 전송
                                if (prefs.isReceiptSmsEnabled && !res.replySmsPhone.isNullOrBlank()) {
                                    // 🛡️ 상대방 번호가 한국 휴대전화가 아닌 경우(유선전화, 대표번호 등) 영수증 SMS 발송 제외
                                    if (!ContactHelper.isMobilePhoneNumber(res.replySmsPhone)) {
                                        Log.i(TAG, "⏭️ [카카오 푸시 영수증 SMS 제외] 휴대전화가 아닌 번호입니다: ${res.replySmsPhone} (유선/대표번호 자동 제외)")
                                    } else {
                                        val rawReply = res.replySmsText ?: ""
                                        val custName = res.depositorName?.takeIf { it.isNotBlank() } ?: "고객"
                                        val custAmount = res.amountKrw

                                        val msgToSend = if (prefs.receiptSmsTemplate.isNotBlank()) {
                                            SmsSenderUtil.formatReceiptMessage(
                                                template = prefs.receiptSmsTemplate,
                                                customerName = custName,
                                                amountKrw = custAmount
                                            )
                                        } else if (rawReply.isNotBlank()) {
                                            rawReply
                                        } else {
                                            "[SheetBot] ${custName}님, 결제 입금이 확인되었습니다. 감사합니다."
                                        }

                                        if (msgToSend.isNotBlank()) {
                                            val isSent = SmsSenderUtil.sendSms(this@BankNotificationListener, res.replySmsPhone, msgToSend)
                                            if (isSent) {
                                                Log.i(TAG, "📲 [카카오 푸시 연계 영수증 SMS 발송 성공] 수신: ${res.replySmsPhone} (고객: $custName)")
                                                ApiClient.sendReceiptSmsSync(
                                                    userEmail = userEmail,
                                                    recipientPhone = res.replySmsPhone,
                                                    customerName = custName,
                                                    receiptContent = msgToSend,
                                                    status = "전송 완료"
                                                )
                                            }
                                        }
                                    }
                                }

                                if (prefs.isTtsEnabled) {
                                    val voiceMsg = res.ttsText ?: "$financialOrg 결제가 감지되어 대장에 기록되었습니다."
                                    TtsManager.speak(this@BankNotificationListener, voiceMsg)
                                }
                            }
                    }
                }
            }

            // ========================================================
            // [B] 일반 카카오톡 대화방 구글 시트 동기화
            // ========================================================
            if (!prefs.isKakaoSheetSyncEnabled) return

            // 2. 사생활 보호 필터 검사
            val filter = prefs.kakaoTargetFilter.trim()
            if (!matchesKakaoFilter(chatRoomName, sender, filter)) {
                Log.d(TAG, "카카오톡 필터 제외: $chatRoomName / $sender")
                return
            }

            // 3. 15초 이내 동일 알림 중복 감지 방어 (안드로이드 헤즈업 팝업 닫힘 및 알림창 갱신 2중 이벤트 원천 차단)
            val dedupeKey = "kakao:$chatRoomName:$sender:$message"
            val now = System.currentTimeMillis()
            val lastSeen = recentCache[dedupeKey] ?: 0L
            if (now - lastSeen < 15_000L) {
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
                        historyPrefs.edit().putLong(persistentSig, System.currentTimeMillis()).apply()
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

    /**
     * 구글 메시지(Google Messages) 및 삼성 메시지 알림 정밀 감지 (RCS 및 SMS 완벽 지원)
     */
    private fun handleMessageNotification(sbn: StatusBarNotification) {
        try {
            val extras = sbn.notification.extras ?: return
            val rawTitle = extras.getString(Notification.EXTRA_TITLE)
                ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            val rawText = extractFullNotificationText(extras)

            if (rawText.isBlank()) return

            val rawSender = rawTitle.trim()
            val message = rawText.trim()

            // 💬 메시지 알림 세션도 캐싱하여 바로 열기/답장 지원
            KakaoReplySessionCache.captureFromNotification(sbn, rawSender, rawSender)

            if ((!prefs.isPaired && !prefs.isFtsPaired) || !prefs.isSmsSheetSyncEnabled) return
            val userEmail = prefs.userEmail ?: ""

            // 1. 발신자 식별 (전화번호 vs 연락처 이름 분기)
            val isPhone = ContactHelper.isValidPhoneNumber(rawSender)
            val senderPhone: String
            val contactName: String?

            if (isPhone) {
                senderPhone = ContactHelper.formatPhoneNumber(rawSender)
                contactName = ContactHelper.getContactName(this, senderPhone)
            } else {
                // 알림 제목이 주소록 이름(예: "차민서2")인 경우 원본 이름을 보존하고 주소록에서 실제 번호 역조회
                contactName = rawSender
                senderPhone = ContactHelper.getPhoneNumberByName(this, rawSender) ?: ""
            }

            // 2. 15초 이중 중복 방어 (이름, 번호, 원본 발신자 모두 교차 점검하여 SmsReceiver에서 기처리된 건 완벽 차단)
            val identifiers = listOfNotNull(
                senderPhone.takeIf { it.isNotBlank() },
                contactName?.takeIf { it.isNotBlank() }
            )
            if (!SmsDedupeManager.shouldProcessMessage("INBOUND", rawSender, message, identifiers)) {
                Log.d(TAG, "15초 이내 동일한 수신 메시지(알림) 중복 감지 - 무시합니다: $rawSender / $senderPhone")
                return
            }

            // 전화번호도 없고 이름도 없는 경우 무시
            if (senderPhone.isBlank() && contactName.isNullOrBlank()) {
                return
            }

            // 3. 필터 검사
            val filter = prefs.smsTargetFilter.trim()
            val filterTarget = senderPhone.ifBlank { contactName ?: "" }
            if (!matchesSmsFilter(filterTarget, contactName, filter)) {
                Log.d(TAG, "메시지 필터 제외: $filterTarget / $contactName")
                return
            }

            val finalPhoneNumber = senderPhone.ifBlank { "알림:$contactName" }
            Log.i(TAG, "💬 [구글/기본 메시지 알림 감지] 발신: $finalPhoneNumber ($contactName) / 본문: ${message.take(40)}...")

            serviceScope.launch {
                try {
                    val syncResult = ApiClient.sendSmsSync(
                        userEmail = userEmail,
                        direction = "INBOUND",
                        phoneNumber = finalPhoneNumber,
                        contactName = contactName,
                        message = message,
                        sheetTitle = prefs.smsDriveSheetTitle
                    )

                    val isSynced = syncResult.success

                    // 🎯 고객 영수증 문자 자동 전송 (스마트 간편 주문 매칭 시)
                    if (prefs.isReceiptSmsEnabled && !syncResult.replySmsPhone.isNullOrBlank()) {
                        // 🛡️ 상대방 번호가 한국 휴대전화가 아닌 경우(유선전화, 대표번호 등) 영수증 SMS 발송 제외
                        if (!ContactHelper.isMobilePhoneNumber(syncResult.replySmsPhone)) {
                            Log.i(TAG, "⏭️ [메시지 알림 연계 영수증 SMS 제외] 휴대전화가 아닌 번호입니다: ${syncResult.replySmsPhone} (유선/대표번호 자동 제외)")
                        } else {
                            val rawReply = syncResult.replySmsText ?: ""
                            val custName = syncResult.depositorName?.takeIf { it.isNotBlank() } ?: "고객"
                            val custAmount = syncResult.amountKrw

                            val msgToSend = if (prefs.receiptSmsTemplate.isNotBlank()) {
                                SmsSenderUtil.formatReceiptMessage(
                                    template = prefs.receiptSmsTemplate,
                                    customerName = custName,
                                    amountKrw = custAmount
                                )
                            } else if (rawReply.isNotBlank()) {
                                rawReply
                            } else {
                                "[SheetBot] ${custName}님, 결제 입금이 확인되었습니다. 감사합니다."
                            }

                            if (msgToSend.isNotBlank()) {
                                val (isSent, finalMsg) = SmsSenderUtil.sendSmsDetailed(this@BankNotificationListener, syncResult.replySmsPhone, msgToSend)
                                val statusLabel = if (isSent) "전송 완료" else "전송 실패"
                                Log.i(TAG, "📲 [메시지 알림 연계 영수증 SMS $statusLabel] 수신: ${syncResult.replySmsPhone} (고객: $custName) / 내용: $finalMsg")
                                ApiClient.sendReceiptSmsSync(
                                    userEmail = userEmail,
                                    recipientPhone = syncResult.replySmsPhone,
                                    customerName = custName,
                                    amount = custAmount,
                                    receiptContent = finalMsg,
                                    status = statusLabel
                                )
                            }
                        }
                    }

                    if (isSynced) {
                        val who = if (!contactName.isNullOrBlank() && contactName != senderPhone) "$contactName($senderPhone)" else (senderPhone.ifBlank { contactName ?: "알림" })
                        Log.i(TAG, "✅ [구글 메시지/RCS 시트 동기화 완료] $who")
                        if (prefs.isTtsEnabled) {
                            val ttsMsg = syncResult.ttsText ?: "${contactName ?: "고객"}님의 새 메시지가 구글 시트에 기록되었습니다."
                            TtsManager.speak(this@BankNotificationListener, ttsMsg)
                        }

                        // UI 로그 갱신용 브로드캐스트 발송
                        val updateIntent = Intent(SmsReceiver.ACTION_SMS_RECEIVED).apply {
                            putExtra("smsBody", "[수신] ${contactName?.let { "$it: " } ?: ""}$message")
                            val senderLabel: String = contactName ?: senderPhone.ifBlank { "메시지" }
                            putExtra("sender", senderLabel)
                            putExtra("success", true)
                            setPackage(packageName)
                        }
                        sendBroadcast(updateIntent)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "구글 메시지 동기화 오류", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "handleMessageNotification 파싱 오류", e)
        }
    }

    private fun matchesSmsFilter(sender: String, contactName: String?, filter: String): Boolean {
        if (filter.isBlank()) return true
        val keywords = filter.split(",", ";", " ").map { it.trim() }.filter { it.isNotBlank() }
        val cleanSender = sender.replace("-", "").replace(" ", "").lowercase()
        val cleanName = (contactName ?: "").replace(" ", "").lowercase()

        for (kw in keywords) {
            val cleanKw = kw.replace("-", "").replace(" ", "").lowercase()
            if (cleanSender.contains(cleanKw) || cleanName.contains(cleanKw) || (contactName != null && contactName.contains(kw))) {
                return true
            }
        }
        return false
    }

    /**
     * 📧 주요 메일 앱(Gmail, 네이버 메일, 다음 메일, 삼성 이메일, Outlook 등) 수신 푸시 알림 정밀 파싱 및
     * 구글 시트 / 파일투시트 대장 기록 + AI 할 일(Action Item) 자동 추출
     */
    private fun handleEmailNotification(sbn: StatusBarNotification, isFromActiveSweep: Boolean = false) {
        try {
            val notification = sbn.notification ?: return
            // 그룹 요약 알림(예: "새 메일 3통") 또는 진행 중 알림(동기화/발송 중) 제외
            if ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0 || sbn.isOngoing) {
                return
            }

            val packageName = sbn.packageName ?: return
            val mailAppName = SUPPORTED_EMAIL_PACKAGES[packageName] ?: "이메일"
            val extras = notification.extras ?: return

            val rawTitle = (extras.getString(Notification.EXTRA_TITLE)
                ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()).orEmpty().trim()
            val normalText = (extras.getString(Notification.EXTRA_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()).orEmpty().trim()
            val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim().orEmpty()
            val rawSubText = (extras.getString(Notification.EXTRA_SUB_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()
                ?: extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString()).orEmpty().trim()

            val fullText = extractFullNotificationText(extras)
            if (rawTitle.isBlank() && fullText.isBlank()) return

            // 단순 건수 요약 또는 시스템 상태 알림 제외
            val combinedCheck = "$rawTitle $normalText"
            if (Regex("^\\d+\\s*(통|개의|개)\\s*(새\\s*)?(메일|메시지)|새\\s*메일\\s*\\d+\\s*통|동기화\\s*중|메일을\\s*보내는\\s*중|전송\\s*완료").containsMatchIn(combinedCheck)) {
                return
            }

            // 발신자, 제목, 본문 요약 분리
            val sender = rawTitle.ifBlank { mailAppName }
            var subject = normalText
            var bodyPreview = if (bigText.isNotBlank()) bigText else fullText

            if (subject.isNotBlank() && bodyPreview.startsWith(subject)) {
                val remainder = bodyPreview.removePrefix(subject).trim().trimStart('\n', '\r', '-', ':').trim()
                if (remainder.isNotBlank()) {
                    bodyPreview = remainder
                }
            } else if (subject.isBlank() && bodyPreview.contains("\n")) {
                subject = bodyPreview.substringBefore("\n").trim()
                bodyPreview = bodyPreview.substringAfter("\n").trim()
            }
            if (subject.isBlank()) {
                subject = bodyPreview.take(60)
            }

            // 이메일 주소 추출 (발신자 문자열 또는 본문에 포함된 경우)
            val emailRegex = Regex("[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}")
            val senderEmail = emailRegex.find(rawTitle)?.value
                ?: emailRegex.find(bodyPreview)?.value.orEmpty()

            val accountLabel = if (rawSubText.contains("@")) {
                "$mailAppName ($rawSubText)"
            } else {
                mailAppName
            }

            // 📧 할 일 허브에서 '메일 앱 열기' 클릭 시 해당 이메일 알림으로 즉시 점프하도록 PendingIntent 세션 캐싱
            KakaoReplySessionCache.captureFromNotification(sbn, sender, subject.ifBlank { sender })

            if ((!prefs.isPaired && !prefs.isFtsPaired) || !prefs.isEmailSheetSyncEnabled) return
            val userEmail = prefs.userEmail ?: ""

            // 1. 스팸 / 광고 / 뉴스레터 / 일회용 인증번호 자동 차단 필터 (활성화 시)
            val allText = "$sender $subject $bodyPreview"
            if (prefs.isEmailSpamFilterEnabled && isSpamOrSystemEmail(allText)) {
                Log.d(TAG, "📧 [이메일 스팸/시스템 필터 제외] $sender / $subject")
                return
            }

            // 2. 사용자 지정 발신자 / 키워드 필터 검사
            val filter = prefs.emailTargetFilter.trim()
            if (!matchesEmailFilter(sender, senderEmail, subject, bodyPreview, filter)) {
                Log.d(TAG, "📧 [이메일 대상 필터 제외] $sender / $subject")
                return
            }

            // 3. 영구 및 15초 중복 방어
            val historyPrefs = getSharedPreferences(KAKAO_HISTORY_PREFS, Context.MODE_PRIVATE)
            val persistentSig = "em_${packageName}_${sender}_${subject.hashCode()}_${bodyPreview.take(80).hashCode()}"
            val prevSyncedAt = historyPrefs.getLong(persistentSig, 0L)
            val nowMs = System.currentTimeMillis()
            if (isFromActiveSweep && prevSyncedAt > 0L) {
                return
            }
            if (!isFromActiveSweep && prevSyncedAt > 0L && (nowMs - prevSyncedAt) < 60_000L) {
                return
            }

            val dedupeKey = "email:$packageName:$sender:$subject"
            val lastSeen = recentCache[dedupeKey] ?: 0L
            if (nowMs - lastSeen < 15_000L) {
                return
            }
            recentCache[dedupeKey] = nowMs

            Log.i(TAG, "📧 [$accountLabel 수신 감지] 발신: '$sender' / 제목: '$subject'")

            serviceScope.launch {
                try {
                    val isSynced = ApiClient.sendEmailSync(
                        userEmail = userEmail,
                        mailApp = accountLabel,
                        sender = sender,
                        senderEmail = senderEmail,
                        subject = subject,
                        bodyPreview = bodyPreview,
                        sheetTitle = prefs.emailDriveSheetTitle
                    )

                    if (isSynced) {
                        historyPrefs.edit().putLong(persistentSig, System.currentTimeMillis()).apply()
                        Log.i(TAG, "🎉 [이메일 시트 기록 & 할 일 분석 완료] $sender: $subject")

                        val updateIntent = Intent(SmsReceiver.ACTION_SMS_RECEIVED).apply {
                            putExtra("smsBody", "[📧 $mailAppName] $sender: $subject")
                            putExtra("sender", sender)
                            putExtra("success", true)
                            setPackage(this@BankNotificationListener.packageName)
                        }
                        sendBroadcast(updateIntent)

                        if (prefs.isTtsEnabled) {
                            TtsManager.speak(this@BankNotificationListener, "${sender}님의 새 이메일이 시트에 기록되었습니다.")
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "이메일 시트 동기화 예외", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "handleEmailNotification 파싱 오류", e)
        }
    }

    private fun isSpamOrSystemEmail(text: String): Boolean {
        val spamPattern = Regex(
            "(\\(광고\\)|\\[광고\\]|무료수신거부|수신거부|unsubscribe|뉴스레터|newsletter|마케팅\\s*수신|인증번호|보안\\s*코드|확인\\s*코드|verification\\s*code|새로운\\s*기기에서\\s*로그인)",
            RegexOption.IGNORE_CASE
        )
        return spamPattern.containsMatchIn(text)
    }

    private fun matchesEmailFilter(
        sender: String,
        senderEmail: String,
        subject: String,
        body: String,
        filter: String
    ): Boolean {
        if (filter.isBlank()) return true
        val keywords = filter.split(",", ";").map { it.trim() }.filter { it.isNotBlank() }
        if (keywords.isEmpty()) return true
        val combined = "$sender $senderEmail $subject $body".lowercase()
        return keywords.any { kw -> combined.contains(kw.lowercase()) }
    }
}

