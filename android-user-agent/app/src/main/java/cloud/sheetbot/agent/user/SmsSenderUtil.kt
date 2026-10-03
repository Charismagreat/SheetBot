package cloud.sheetbot.agent.user

import android.content.Context
import android.os.Build
import android.telephony.SmsManager
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 영수증 문자 전송 및 미발송 대기열 처리 전용 유틸리티
 */
object SmsSenderUtil {
    private const val TAG = "SmsSenderUtil"
    /**
     * 영수증 문구 템플릿 치환 ({고객명}, {이름}, {금액}, {일시} 자동 대입)
     */
    fun formatReceiptMessage(
        template: String,
        customerName: String,
        amountKrw: Long = 0L,
        timeStr: String = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.KOREA).format(java.util.Date())
    ): String {
        if (template.isBlank()) return "[SheetBot] 이용해 주셔서 감사합니다."
        val safeName = if (customerName.isNotBlank() && customerName != "고객") customerName else "고객"
        val formattedAmount = if (amountKrw > 0) {
            java.text.NumberFormat.getInstance(java.util.Locale.KOREA).format(amountKrw) + "원"
        } else ""

        var msg = template
        msg = msg.replace("{고객명}", safeName)
        msg = msg.replace("{이름}", safeName)
        msg = msg.replace("{금액}", formattedAmount)
        msg = msg.replace("{일시}", timeStr)
        return msg.trim()
    }

    /**
     * 지정된 휴대폰 번호로 텍스트 SMS 단문 안전 발송 (한국 통신사 80바이트 단문 최적화)
     * 및 스마트폰 기본 메시지 앱 발신함(Sent Box) 동기화
     */
    fun sendSms(context: Context, phoneNumber: String, messageText: String): Boolean {
        return try {
            val cleanPhone = phoneNumber.replace(Regex("[^0-9+]"), "").trim()
            if (cleanPhone.isBlank() || messageText.isBlank()) {
                Log.w(TAG, "전화번호 또는 메시지가 비어 있어 발송할 수 없습니다.")
                return false
            }

            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }

            // 🛡️ 한국 통신사(SKT/KT/LGU+) 단문 SMS 규격 (한글 40~45자, 80바이트 이하) 안전 보장
            // 90바이트 초과 Multipart SMS는 통신사 SMSC에서 폐기/거부될 수 있으므로 단문으로 안전 압축
            val textToSend = if (messageText.length > 45) {
                Log.w(TAG, "⚠️ 메시지 길이(${messageText.length}자)가 단문 규격을 초과하여 45자 안전 단문으로 압축합니다.")
                messageText.substring(0, 43) + ".."
            } else {
                messageText
            }

            smsManager.sendTextMessage(cleanPhone, null, textToSend, null, null)
            Log.i(TAG, "✅ [SMS 통신망 발송 성공] 수신자: $cleanPhone / 전문: $textToSend")

            // 📁 스마트폰 기본 문자 앱(삼성 메시지 등)의 '보낸 문자함'에 안전 저장
            try {
                val values = android.content.ContentValues().apply {
                    put("address", cleanPhone)
                    put("body", textToSend)
                    put("date", System.currentTimeMillis())
                    put("type", 2) // 2: MESSAGE_TYPE_SENT (발신)
                    put("read", 1)
                }
                context.contentResolver.insert(android.net.Uri.parse("content://sms/sent"), values)
                Log.i(TAG, "📁 [기본 메시지 앱 발신함 저장 완료] $cleanPhone")
            } catch (sentBoxErr: Exception) {
                Log.d(TAG, "발신함 자동 기록 참고 (기본 SMS 앱 권한 차이): ${sentBoxErr.message}")
            }

            true
        } catch (e: Exception) {
            Log.e(TAG, "❌ [SMS 발송 실패] 수신자: $phoneNumber / 에러: ${e.message}", e)
            false
        }
    }

    /**
     * 서버의 미발송 영수증 대기열(Outbox Queue)을 조회하여 순차 발송 후 완료 마킹
     * @return 발송 성공한 영수증 건수
     */
    suspend fun processPendingReceipts(context: Context): Int = withContext(Dispatchers.IO) {
        val prefs = PreferencesManager(context)
        if (!prefs.isPaired) {
            Log.d(TAG, "미연동 상태이므로 영수증 대기열 처리를 건너뜁니다.")
            return@withContext 0
        }
        if (!prefs.isReceiptSmsEnabled) {
            Log.d(TAG, "영수증 SMS 자동 회신 기능이 꺼져 있어 처리를 건너뜁니다.")
            return@withContext 0
        }

        val pendingList = ApiClient.fetchPendingReceipts(prefs.userEmail)
        if (pendingList.isEmpty()) {
            Log.d(TAG, "처리할 미발송 영수증이 없습니다.")
            return@withContext 0
        }

        Log.i(TAG, "📋 미발송 영수증 ${pendingList.size}건 발견. 순차 발송을 개시합니다.")
        var sentCount = 0

        for (receipt in pendingList) {
            if (receipt.recipientPhone.isBlank() || receipt.message.isBlank()) {
                Log.w(TAG, "영수증 정보 불완전 (ID: ${receipt.id}) - 건너뜀")
                continue
            }

            val msgToSend = if (receipt.message.isNotBlank() && !receipt.message.contains("[SheetBot]")) {
                receipt.message
            } else if (prefs.receiptSmsTemplate.isNotBlank()) {
                formatReceiptMessage(
                    template = prefs.receiptSmsTemplate,
                    customerName = receipt.depositorName,
                    amountKrw = receipt.amountKrw.toLong()
                )
            } else {
                receipt.message
            }

            val isSent = sendSms(context, receipt.recipientPhone, msgToSend)
            if (isSent) {
                ApiClient.markReceiptSent(receipt.id, true)
                val email = prefs.userEmail
                if (!email.isNullOrBlank()) {
                    ApiClient.sendReceiptSmsSync(
                        userEmail = email,
                        recipientPhone = receipt.recipientPhone,
                        customerName = receipt.depositorName,
                        amount = receipt.amountKrw.toLong(),
                        receiptContent = msgToSend,
                        status = "전송 완료"
                    )
                }
                sentCount++
                Log.i(TAG, "🎉 [대기열 영수증 회신 완료] ID: ${receipt.id}, 입금자: ${receipt.depositorName}, 수신: ${receipt.recipientPhone}")
            } else {
                Log.w(TAG, "⚠️ [대기열 영수증 회신 실패] ID: ${receipt.id}, 수신: ${receipt.recipientPhone}")
            }
        }

        sentCount
    }
}
