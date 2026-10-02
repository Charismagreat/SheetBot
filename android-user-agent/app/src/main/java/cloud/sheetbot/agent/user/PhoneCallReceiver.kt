package cloud.sheetbot.agent.user

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
        private var lastState = TelephonyManager.EXTRA_STATE_IDLE
        private var savedIncomingNumber: String? = null
        private var isIncomingAnswered = false
        private var callStartTime = 0L
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
                if (lastState == TelephonyManager.EXTRA_STATE_RINGING && !isIncomingAnswered) {
                    // ★ 부재중 전화(Missed Call) 감지! (벨 울림 -> 받지 않고 끊김)
                    val missedPhone = phoneNumber ?: savedIncomingNumber
                    if (!missedPhone.isNullOrBlank() && prefs.isPaired && !userEmail.isNullOrBlank()) {
                        handleMissedCall(context, prefs, userEmail, missedPhone)
                    }
                } else if (lastState == TelephonyManager.EXTRA_STATE_OFFHOOK) {
                    // ★ 통화 정상 종료 (Call Ended) 감지! (수신/발신 통화 모두 지원)
                    val endedPhone = phoneNumber ?: savedIncomingNumber
                    if (!endedPhone.isNullOrBlank() && prefs.isCallEndedCardPromptEnabled) {
                        showCallEndedCardPrompt(context, endedPhone)
                    }

                    // ★ 통화 종료 즉시 녹음 자동 업로드 트리거 (3.5초 스마트 I/O 딜레이 후 실행)
                    if (prefs.isCallRecordingSyncEnabled && prefs.isCallEndedAutoUploadEnabled && prefs.isPaired) {
                        triggerAutoRecordingUpload(context, prefs)
                    }
                }

                // 세션 리셋
                isIncomingAnswered = false
                savedIncomingNumber = null
            }
        }

        lastState = stateStr
    }

    /**
     * 부재중 전화 감지 처리: 0원 자동 회신 문자 발송 및 구글 시트 대장 기록
     */
    private fun handleMissedCall(context: Context, prefs: PreferencesManager, userEmail: String, phone: String) {
        val contactName = ContactHelper.getContactName(context, phone)
        val callTime = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA).format(Date())
        val replyTemplate = prefs.missedCallReplyTemplate

        Log.i(TAG, "🚨 [부재중 전화 감지] 번호: $phone / 이름: $contactName")

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
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
            } catch (e: Exception) {
                Log.e(TAG, "부재중 전화 처리 중 오류", e)
            } finally {
                pendingResult.finish()
            }
        }
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

    /**
     * 모바일 명함 문자 즉시 전송 (웹 명함 링크 모드)
     */
    private fun sendBusinessCardSms(context: Context, phoneNumber: String, contactName: String?) {
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
        }

        // 알림 닫기
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(2001)
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
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // 스마트폰 오디오 인코딩 및 파일 시스템 finalize 대기 (3.5초)
                kotlinx.coroutines.delay(3500L)

                Log.i(TAG, "🚀 [통화 종료 후 자동 동기화 시작] 녹음 파일 스캔 및 업로드 진행")
                val result = CallRecordingManager.syncRecordings(context, forceReupload = false)

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
            } finally {
                pendingResult.finish()
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
