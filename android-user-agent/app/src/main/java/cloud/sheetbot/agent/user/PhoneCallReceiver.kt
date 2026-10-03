package cloud.sheetbot.agent.user

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.CallLog
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * 스마트폰 전화 상태(수신/통화/종료) 감지 브로드캐스트 리시버
 * 1. 부재중 전화(Missed Call) 감지 시 0원 스마트 안내 문자 자동 회신 및 구글 시트 대장 기록
 * 2. 통화 종료(Call Ended) 시 모바일 명함/안내 문자 원터치 발송 액션 제공
 */
class PhoneCallReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "PhoneCallReceiver"
        const val MISSED_CALL_CHANNEL_ID = "sheetbot_missed_call_channel"
        const val ACTION_SEND_BUSINESS_CARD = "cloud.sheetbot.agent.user.ACTION_SEND_BUSINESS_CARD"
        const val EXTRA_TARGET_PHONE = "target_phone"
        const val EXTRA_CONTACT_NAME = "contact_name"

        // 정적 상태 보관 (단일 수신/통화 세션 추적)
        @Volatile
        private var lastState = TelephonyManager.EXTRA_STATE_IDLE
        @Volatile
        private var savedIncomingNumber: String? = null
        @Volatile
        private var isIncomingAnswered = false
        @Volatile
        private var callStartTime = 0L

        // 부재중 전화 단일 동시 처리 보장 원자적 락 (중복 인텐트 진입 원천 차단)
        private val isMissedCallProcessing = AtomicBoolean(false)
        private val lastMissedCallTriggerTime = AtomicLong(0L)

        // 15초 멱등성 캐시 (동일 번호 부재중 중복 감지 방지 - 정규화된 번호 기준)
        private val recentMissedCalls = ConcurrentHashMap<String, Long>()

        /**
         * 모바일 명함 문자 즉시 전송 (웹 명함 링크 모드)
         */
        fun sendBusinessCardSms(context: Context, phoneNumber: String, contactName: String?, onComplete: ((Boolean) -> Unit)? = null) {
            val prefs = PreferencesManager(context)
            val template = prefs.businessCardSmsTemplate.trim()
            val webLink = prefs.businessCardWebLink.trim()
            val finalMessage = if (webLink.isNotBlank() && !template.contains(webLink)) {
                "$template\n▶ 모바일 명함: $webLink"
            } else {
                template
            }
            val userEmail = prefs.userEmail

            CoroutineScope(Dispatchers.IO).launch {
                val isSent = SmsSenderUtil.sendSms(context, phoneNumber, finalMessage)
                if (isSent) {
                    Log.i(TAG, "🎉 [모바일 명함 발송 성공] 대상: $phoneNumber")
                    if (prefs.isTtsEnabled) {
                        TtsManager.speak(context, "상대방에게 모바일 명함이 성공적으로 발송되었습니다.")
                    }

                    // [SheetBot] 모바일 명함 발송 대장에 실시간 기록
                    if (!userEmail.isNullOrBlank()) {
                        ApiClient.sendBusinessCardSync(
                            userEmail = userEmail,
                            recipientPhone = phoneNumber,
                            contactName = contactName,
                            sendMode = "스마트 웹 명함(0원)",
                            cardContentOrUrl = finalMessage,
                            status = "전송 완료"
                        )
                    }

                    // 구글 시트 일반 문자 대장에도 발신 기록 동기화
                    if (!userEmail.isNullOrBlank() && prefs.isSmsSheetSyncEnabled) {
                        ApiClient.sendSmsSync(
                            userEmail = userEmail,
                            direction = "OUTBOUND",
                            phoneNumber = phoneNumber,
                            contactName = contactName,
                            message = finalMessage,
                            sheetTitle = prefs.smsDriveSheetTitle
                        )
                    }
                }
                onComplete?.invoke(isSent)
            }

            // 알림 닫기
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.cancel(2001)
        }

        /**
         * 시스템 CallLog.Calls에서 최근 60초 이내에 발생한 최신 부재중 통화(MISSED_TYPE) 조회 (Fallback 안전망)
         */
        fun getLatestMissedCallFromLog(context: Context): Triple<String, String?, String>? {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
                Log.w(TAG, "CallLog 조회를 위한 READ_CALL_LOG 권한이 부여되지 않았습니다.")
                return null
            }
            try {
                val cursor = context.contentResolver.query(
                    CallLog.Calls.CONTENT_URI,
                    arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.CACHED_NAME, CallLog.Calls.DATE, CallLog.Calls.TYPE),
                    "${CallLog.Calls.TYPE} = ?",
                    arrayOf(CallLog.Calls.MISSED_TYPE.toString()),
                    "${CallLog.Calls.DATE} DESC"
                )
                cursor?.use {
                    if (it.moveToFirst()) {
                        val dateMillis = it.getLong(it.getColumnIndexOrThrow(CallLog.Calls.DATE))
                        if (System.currentTimeMillis() - dateMillis < 60_000) {
                            val number = it.getString(it.getColumnIndexOrThrow(CallLog.Calls.NUMBER)) ?: ""
                            val cachedName = it.getString(it.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME))
                            val timeStr = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA).format(Date(dateMillis))
                            if (number.isNotBlank()) {
                                return Triple(number, cachedName, timeStr)
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "CallLog 조회 중 예외: ${e.message}")
            }
            return null
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action

        // 1. 모바일 명함 원터치 발송 브로드캐스트 처리
        if (action == ACTION_SEND_BUSINESS_CARD) {
            val phone = intent.getStringExtra(EXTRA_TARGET_PHONE) ?: return
            val name = intent.getStringExtra(EXTRA_CONTACT_NAME)
            sendBusinessCardSms(context, phone, name)
            return
        }

        // 2. 전화 상태(PHONE_STATE) 감지
        if (action == TelephonyManager.ACTION_PHONE_STATE_CHANGED) {
            val stateStr = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
            val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

            if (!number.isNullOrBlank()) {
                savedIncomingNumber = number
            }

            handlePhoneStateChange(context, stateStr, savedIncomingNumber)
        }
    }

    private fun handlePhoneStateChange(context: Context, stateStr: String, phoneNumber: String?) {
        if (stateStr == lastState) return

        val prefs = PreferencesManager(context)
        val userEmail = prefs.userEmail

        when (stateStr) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                // 벨이 울리는 중 (수신 전화 인입)
                isIncomingAnswered = false
                callStartTime = System.currentTimeMillis()
                Log.d(TAG, "📞 [전화 수신 링 인입] 번호: $phoneNumber")
            }

            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                // 통화 연결됨 (전화 받음)
                isIncomingAnswered = true
                Log.d(TAG, "🗣️ [통화 연결 시작] 번호: $phoneNumber")
            }

            TelephonyManager.EXTRA_STATE_IDLE -> {
                // 통화 종료 또는 미수신 상태 전환
                val wasRingingNotAnswered = (lastState == TelephonyManager.EXTRA_STATE_RINGING && !isIncomingAnswered)
                val wasOffhook = (lastState == TelephonyManager.EXTRA_STATE_OFFHOOK)
                val candidatePhone = phoneNumber ?: savedIncomingNumber

                if (wasRingingNotAnswered) {
                    // ★ 부재중 전화(Missed Call) 1차 감지! (벨 울림 -> 받지 않고 끊김)
                    if (prefs.isPaired && !userEmail.isNullOrBlank()) {
                        triggerMissedCallHandling(context, prefs, userEmail, candidatePhone)
                    }
                } else if (wasOffhook) {
                    // ★ 통화 정상 종료 (Call Ended) 감지! (수신/발신 통화 모두 지원)
                    val endedPhone = candidatePhone
                    if (!endedPhone.isNullOrBlank() && prefs.isCallEndedCardPromptEnabled) {
                        showCallEndedCardPrompt(context, endedPhone)
                    }

                    // ★ 통화 종료 즉시 녹음 자동 업로드 트리거 (3.5초 스마트 I/O 딜레이 후 실행)
                    if (prefs.isCallRecordingSyncEnabled && prefs.isCallEndedAutoUploadEnabled && prefs.isPaired) {
                        triggerAutoRecordingUpload(context, prefs)
                    }
                } else if (!isIncomingAnswered && prefs.isPaired && !userEmail.isNullOrBlank()) {
                    // 벨이 울렸으나 상태 순서가 누락되어 IDLE로 곧바로 진입한 경우를 위한 안전망 (최근 60초 이내 링 시작 이력 확인)
                    val now = System.currentTimeMillis()
                    if (callStartTime > 0 && (now - callStartTime < 60_000)) {
                        triggerMissedCallHandling(context, prefs, userEmail, candidatePhone)
                    }
                }

                // 세션 리셋
                isIncomingAnswered = false
                savedIncomingNumber = null
                callStartTime = 0L
            }
        }

        lastState = stateStr
    }

    /**
     * 부재중 전화 감지 처리: 인텐트 번호 검증 및 CallLog Fallback 안전망 경유 후 구글 시트 대장 기록
     */
    private fun triggerMissedCallHandling(context: Context, prefs: PreferencesManager, userEmail: String, directPhone: String?) {
        val now = System.currentTimeMillis()
        if (now - lastMissedCallTriggerTime.get() < 5_000) {
            Log.i(TAG, "⏳ [5초 원자적 쿨다운] 최근 5초 이내에 이미 부재중 처리가 시작되었습니다. 중복 트리거 차단.")
            return
        }
        if (!isMissedCallProcessing.compareAndSet(false, true)) {
            Log.i(TAG, "⏳ [동시 처리 방어] 부재중 전화 처리가 이미 백그라운드에서 진행 중입니다. 중복 코루틴 생성 방지.")
            return
        }
        lastMissedCallTriggerTime.set(now)

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                var finalPhone = directPhone?.trim() ?: ""
                var resolvedName: String? = null
                var resolvedCallTime: String? = null

                // 인텐트 번호가 비어있으면 800ms 대기 후 시스템 CallLog에서 최신 부재중 전화 복구
                if (finalPhone.isBlank()) {
                    delay(800)
                    val fromLog = getLatestMissedCallFromLog(context)
                    if (fromLog != null) {
                        finalPhone = fromLog.first
                        resolvedName = fromLog.second
                        resolvedCallTime = fromLog.third
                        Log.i(TAG, "📋 [CallLog Fallback 성공] 복구된 부재중 번호: $finalPhone, 이름: $resolvedName")
                    }
                }

                if (finalPhone.isBlank()) {
                    Log.w(TAG, "부재중 전화를 감지했으나 전화번호를 획득하지 못해 처리를 건너뜁니다.")
                    return@launch
                }

                // 15초 멱등성 검사 (정규화된 숫자 번호 기준 동일 번호 중복 처리 방지)
                val normalizedPhone = finalPhone.replace(Regex("[^0-9]"), "")
                val procTime = System.currentTimeMillis()
                val lastProcessed = recentMissedCalls[normalizedPhone] ?: 0L
                if (procTime - lastProcessed < 15_000) {
                    Log.i(TAG, "⏳ [15초 멱등성 방어] 이미 처리된 부재중 전화입니다: $finalPhone (정규화: $normalizedPhone)")
                    return@launch
                }
                recentMissedCalls[normalizedPhone] = procTime

                // 오래된 캐시 정리 (60초 경과 항목 제거)
                recentMissedCalls.entries.removeIf { procTime - it.value > 60_000 }

                handleMissedCall(context, prefs, userEmail, finalPhone, resolvedName, resolvedCallTime)
            } catch (e: Exception) {
                Log.e(TAG, "부재중 전화 핸들링 중 오류", e)
            } finally {
                // 5초 후 처리 락 해제
                CoroutineScope(Dispatchers.IO).launch {
                    delay(5000)
                    isMissedCallProcessing.set(false)
                }
                pendingResult.finish()
            }
        }
    }

    /**
     * 부재중 전화 최종 처리: 0원 자동 회신 문자 발송 및 구글 시트 대장 기록
     */
    private suspend fun handleMissedCall(
        context: Context,
        prefs: PreferencesManager,
        userEmail: String,
        phone: String,
        fallbackName: String? = null,
        fallbackTime: String? = null
    ) {
        val contactName = ContactHelper.getContactName(context, phone) ?: fallbackName
        val callTime = fallbackTime ?: SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA).format(Date())
        val replyTemplate = prefs.missedCallReplyTemplate

        Log.i(TAG, "🚨 [부재중 전화 최종 처리] 번호: $phone / 이름: $contactName / 일시: $callTime")

        var autoReplied = false
        if (prefs.isMissedCallAutoReplyEnabled && replyTemplate.isNotBlank()) {
            // 0원 안내 문자 자동 회신
            autoReplied = SmsSenderUtil.sendSms(context, phone, replyTemplate)
            if (autoReplied) {
                Log.i(TAG, "📲 [부재중 자동 회신 완료] $phone")
                if (prefs.isTtsEnabled) {
                    TtsManager.speak(context, "부재중 전화가 감지되어 고객님께 안내 문자를 자동 회신했습니다.")
                }
            }
        }

        // 구글 시트 [SheetBot] 부재중 전화 대장에 기록
        val isSynced = ApiClient.sendMissedCallSync(
            userEmail = userEmail,
            callerPhone = phone,
            contactName = contactName,
            callTime = callTime,
            autoReplied = autoReplied,
            replyMessage = if (autoReplied) replyTemplate else "미발송",
            sheetTitle = prefs.missedCallDriveSheetTitle
        )

        showMissedCallNotification(context, contactName ?: phone, autoReplied)
    }

    /**
     * 통화 종료 직후 모바일 명함 원터치 발송 Heads-up 알림 표출
     */
    private fun showCallEndedCardPrompt(context: Context, phoneNumber: String) {
        val contactName = ContactHelper.getContactName(context, phoneNumber)
        val displayName = contactName ?: phoneNumber
        val prefs = PreferencesManager(context)

        ensureNotificationChannel(context)

        val isMmsMode = prefs.businessCardSendMode == "MMS_IMAGE"
        val imagePath = prefs.businessCardImagePath
        val imageFile = if (imagePath.isNotBlank()) File(imagePath) else null
        val hasValidImage = imageFile != null && imageFile.exists() && imageFile.length() > 0

        val (contentPrompt, actionLabel, pendingSend) = if (isMmsMode && hasValidImage) {
            // [방안 2: 사진 직접 첨부 MMS 모드]
            val cleanPhone = phoneNumber.replace(Regex("[^0-9+]"), "").trim()
            val imageUri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", imageFile!!)
            val template = prefs.businessCardSmsTemplate.trim()

            val mmsIntent = Intent(Intent.ACTION_SEND).apply {
                type = "image/*"
                putExtra("address", cleanPhone)
                putExtra(Intent.EXTRA_PHONE_NUMBER, cleanPhone)
                putExtra("sms_body", template)
                putExtra(Intent.EXTRA_TEXT, template)
                putExtra(Intent.EXTRA_STREAM, imageUri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            val pending = PendingIntent.getActivity(
                context,
                (System.currentTimeMillis() % 10000).toInt(),
                mmsIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            Triple(
                "방금 통화한 상대방에게 등록된 명함/포스터 사진(MMS)과 소개글을 보내시겠습니까?",
                "🖼️ 모바일 명함(사진) 전송",
                pending
            )
        } else {
            // [방안 1: 스마트 웹 명함 링크 모드 (0원 무료)]
            val sendIntent = Intent(context, PhoneCallReceiver::class.java).apply {
                action = ACTION_SEND_BUSINESS_CARD
                putExtra(EXTRA_TARGET_PHONE, phoneNumber)
                putExtra(EXTRA_CONTACT_NAME, contactName)
            }
            val pending = PendingIntent.getBroadcast(
                context,
                (System.currentTimeMillis() % 10000).toInt(),
                sendIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            Triple(
                "방금 통화한 상대방에게 스마트 모바일 명함(0원 무료)을 보내시겠습니까?",
                "💼 모바일 명함 즉시 발송",
                pending
            )
        }

        val notification = NotificationCompat.Builder(context, MISSED_CALL_CHANNEL_ID)
            .setContentTitle("💼 [통화 종료] $displayName")
            .setContentText(contentPrompt)
            .setSmallIcon(android.R.drawable.ic_menu_send)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .addAction(android.R.drawable.ic_menu_send, actionLabel, pendingSend)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(2001, notification)
    }



    private fun showMissedCallNotification(context: Context, nameOrPhone: String, autoReplied: Boolean) {
        ensureNotificationChannel(context)
        val replyStatus = if (autoReplied) "자동 회신 완료" else "대장 기록 완료"

        val notification = NotificationCompat.Builder(context, MISSED_CALL_CHANNEL_ID)
            .setContentTitle("📞 [부재중 전화 감지] $nameOrPhone")
            .setContentText("$replyStatus (구글 시트 [SheetBot] 부재중 전화 대장 기록)")
            .setSmallIcon(android.R.drawable.sym_call_missed)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify((System.currentTimeMillis() % 100000).toInt(), notification)
    }

    private fun ensureNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                MISSED_CALL_CHANNEL_ID,
                "SheetBot 전화 및 통화 알림",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "부재중 전화 및 통화 종료 명함 발송 알림을 제공합니다."
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }
    }

    /**
     * 통화 종료 직후 3.5초 스마트 I/O 딜레이 후 통화 녹음 파일 자동 동기화 트리거
     */
    private fun triggerAutoRecordingUpload(context: Context, prefs: PreferencesManager) {
        // Wi-Fi 전용 옵션 검사
        if (prefs.isRecordingUploadOnlyOnWifi && !isWifiConnected(context)) {
            Log.d(TAG, "📶 [통화 녹음 자동 업로드 건너뜀] Wi-Fi 전용 옵션 활성화됨 (현재 모바일 데이터 상태)")
            return
        }

        Log.i(TAG, "🎙️ [통화 종료 감지] 3.5초 후 통화 녹음 파일 자동 동기화 개시 예정...")
        // ⚡ [Zero-ANR]: OS 대기(goAsync) 없이 즉각 반환하고, 백그라운드 코루틴에서 무중단 실행
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // 스마트폰 오디오 인코딩 및 파일 시스템 finalize 대기 (3.5초)
                kotlinx.coroutines.delay(3500L)

                Log.i(TAG, "🚀 [통화 종료 후 자동 동기화 시작] 녹음 파일 스캔 및 업로드 진행")
                val result = CallRecordingManager.scanAndUploadNewRecordings(context, forceReupload = false)

                if (result.uploadedCount > 0) {
                    Log.i(TAG, "✅ [통화 녹음 자동 업로드 완료] 업로드 건수: ${result.uploadedCount}개")
                    showRecordingUploadSuccessNotification(context, result.uploadedCount)
                    if (prefs.isTtsEnabled) {
                        TtsManager.speak(context, "통화 녹음 파일이 구글 시트 대장에 자동 업로드되었습니다.")
                    }
                } else {
                    Log.d(TAG, "ℹ️ [통화 녹음 자동 동기화 완료] 새로 생성된 대상 녹음 파일 없음: ${result.message}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "통화 종료 후 녹음 자동 동기화 중 오류", e)
            }
        }
    }

    private fun isWifiConnected(context: Context): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val network = cm?.activeNetwork ?: return false
                val caps = cm.getNetworkCapabilities(network) ?: return false
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)
            } else {
                @Suppress("DEPRECATION")
                val info = cm?.activeNetworkInfo
                @Suppress("DEPRECATION")
                info?.type == android.net.ConnectivityManager.TYPE_WIFI && info.isConnected
            }
        } catch (e: Exception) {
            false
        }
    }

    private fun showRecordingUploadSuccessNotification(context: Context, count: Int) {
        ensureNotificationChannel(context)
        val notification = NotificationCompat.Builder(context, MISSED_CALL_CHANNEL_ID)
            .setContentTitle("🎙️ [통화 녹음 자동 백업]")
            .setContentText("방금 종료된 통화 녹음(${count}건)이 구글 드라이브 및 시트 대장에 자동 기록되었습니다.")
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify((System.currentTimeMillis() % 100000).toInt(), notification)
    }
}
