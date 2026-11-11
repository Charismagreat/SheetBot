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
     * 한국 이동통신사(SKT/KT/LGU+) 기준 문자열의 EUC-KR 바이트 수 계산
     * - 한글/특수문자: 2바이트, 영문/숫자/공백: 1바이트
     * - 80바이트 이하: 단문(SMS), 80바이트 초과: 장문(LMS/MMS)
     */
    fun getSmsByteCount(text: String): Int {
        if (text.isEmpty()) return 0
        return try {
            text.toByteArray(java.nio.charset.Charset.forName("EUC-KR")).size
        } catch (_: Exception) {
            text.fold(0) { acc, ch -> acc + if (ch.code > 127) 2 else 1 }
        }
    }

    /**
     * 한국 이동통신사(SKT/KT/LGU+) 단문 SMS 규격(EUC-KR 80바이트 이하) 안전 절단 함수
     * 80바이트를 초과하는 글자수는 한글 깨짐 없이 글자 단위로 깔끔하게 제거(Truncate)
     */
    fun trimToSmsSafeBytes(text: String, maxBytes: Int = 80): String {
        if (text.isBlank()) return ""
        val charset = try {
            java.nio.charset.Charset.forName("EUC-KR")
        } catch (_: Exception) {
            Charsets.UTF_8
        }

        val rawBytes = text.toByteArray(charset)
        if (rawBytes.size <= maxBytes) {
            return text
        }

        val sb = StringBuilder()
        var currentBytes = 0

        for (ch in text) {
            val chBytes = try {
                ch.toString().toByteArray(charset).size
            } catch (_: Exception) {
                if (ch.code > 127) 2 else 1
            }
            if (currentBytes + chBytes > maxBytes) {
                break // 80바이트 초과하는 글자수는 깔끔하게 제거
            }
            sb.append(ch)
            currentBytes += chBytes
        }

        return sb.toString().trimEnd()
    }

    /**
     * 80바이트를 초과하는 장문 메시지를 한글 깨짐 없이 한국 통신사 규격(파트당 안전 바이트 이하)으로 분할
     * - 안드로이드 기본 divideMessage()는 UCS-2 70자(140바이트) 기준이라 한글 41~70자(82~140바이트)를
     *   1개 파트(단문 sendTextMessage)로 처리하여 초과 글자가 잘리거나 실패할 수 있으므로,
     *   80바이트 초과 시 반드시 2개 이상의 파트로 분할하여 LMS/MMS(sendMultipartTextMessage) 전환을 보장합니다.
     */
    fun divideForKoreanMmsOrMultipart(smsManager: SmsManager, text: String, maxBytesPerPart: Int = 76): ArrayList<String> {
        val charset = try {
            java.nio.charset.Charset.forName("EUC-KR")
        } catch (_: Exception) {
            Charsets.UTF_8
        }

        val byteSplitParts = ArrayList<String>()
        val sb = StringBuilder()
        var currentBytes = 0

        for (ch in text) {
            val chBytes = try {
                ch.toString().toByteArray(charset).size
            } catch (_: Exception) {
                if (ch.code > 127) 2 else 1
            }
            if (currentBytes + chBytes > maxBytesPerPart && sb.isNotEmpty()) {
                byteSplitParts.add(sb.toString())
                sb.clear()
                currentBytes = 0
            }
            sb.append(ch)
            currentBytes += chBytes
        }
        if (sb.isNotEmpty()) {
            byteSplitParts.add(sb.toString())
        }

        val systemParts = try {
            smsManager.divideMessage(text)
        } catch (_: Exception) {
            null
        }

        // 시스템 분할 결과가 2파트 이상이면서 모든 파트가 80바이트 이하인 경우 시스템 분할 사용, 그 외에는 한국형 바이트 분할 사용
        if (systemParts != null && systemParts.size >= 2 && systemParts.all { getSmsByteCount(it) <= 80 }) {
            return systemParts
        }
        return byteSplitParts
    }

    private fun resolveSmsManager(context: Context): SmsManager {
        val subId = try {
            android.telephony.SubscriptionManager.getDefaultSmsSubscriptionId()
        } catch (_: Exception) {
            android.telephony.SubscriptionManager.INVALID_SUBSCRIPTION_ID
        }
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val base = context.getSystemService(SmsManager::class.java)
            if (base != null && subId != android.telephony.SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
                try {
                    base.createForSubscriptionId(subId)
                } catch (_: Exception) {
                    base
                }
            } else {
                base ?: @Suppress("DEPRECATION") SmsManager.getDefault()
            }
        } else {
            @Suppress("DEPRECATION")
            if (subId != android.telephony.SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
                try {
                    SmsManager.getSmsManagerForSubscriptionId(subId)
                } catch (_: Exception) {
                    SmsManager.getDefault()
                }
            } else {
                SmsManager.getDefault()
            }
        }
    }

    /**
     * 지정된 휴대폰 번호로 문자 발송
     * - EUC-KR 80바이트 이하: 단문(SMS) 발송
     * - EUC-KR 80바이트 초과: 글자 잘림 없이 장문(MMS/LMS) 모드로 자동 전환하여 전문 발송
     * @param truncateTo80Bytes true인 경우에만 80바이트 단문으로 강제 절단 (기본값 false: 초과 시 MMS/장문 전환)
     * @return Pair(성공여부, 실제발송전문)
     */
    fun sendSmsDetailed(
        context: Context,
        phoneNumber: String,
        messageText: String,
        truncateTo80Bytes: Boolean = false
    ): Pair<Boolean, String> {
        return try {
            val cleanPhone = phoneNumber.replace(Regex("[^0-9+]"), "").trim()
            if (cleanPhone.isBlank() || messageText.isBlank()) {
                Log.w(TAG, "전화번호 또는 메시지가 비어 있어 발송할 수 없습니다.")
                return Pair(false, messageText)
            }

            // 🛡️ 상대방 번호가 한국 휴대전화가 아닌 경우(유선전화, 대표번호, 인터넷전화 등) SMS 발송 원천 제외
            if (!ContactHelper.isMobilePhoneNumber(cleanPhone)) {
                Log.w(TAG, "⏭️ [문자 발송 제외] 한국 휴대전화 번호가 아닙니다: $cleanPhone (유선전화/대표번호 등 문자 수신 불가 번호 자동 제외)")
                return Pair(false, messageText)
            }

            val smsManager = resolveSmsManager(context)

            val textToSend = if (truncateTo80Bytes) {
                trimToSmsSafeBytes(messageText, 80)
            } else {
                messageText.trim()
            }
            val byteCount = getSmsByteCount(textToSend)

            if (byteCount <= 80) {
                smsManager.sendTextMessage(cleanPhone, null, textToSend, null, null)
                Log.i(TAG, "✅ [SMS 단문 발송 성공] 수신자: $cleanPhone / ${byteCount}B / 전문: $textToSend")
            } else {
                val parts = divideForKoreanMmsOrMultipart(smsManager, textToSend, 76)
                smsManager.sendMultipartTextMessage(cleanPhone, null, parts, null, null)
                Log.i(TAG, "✅ [장문 MMS/LMS 전환 발송 성공] 수신자: $cleanPhone / ${byteCount}B (${parts.size}파트 전환) / 전문: $textToSend")
            }

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

            Pair(true, textToSend)
        } catch (e: Exception) {
            Log.e(TAG, "❌ [문자 발송 실패] 수신자: $phoneNumber / 에러: ${e.message}", e)
            Pair(false, messageText)
        }
    }

    /**
     * 지정된 휴대폰 번호로 텍스트 SMS 단문 안전 발송 (기존 호출 호환용)
     */
    fun sendSms(context: Context, phoneNumber: String, messageText: String): Boolean {
        return sendSmsDetailed(context, phoneNumber, messageText).first
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
        if (!prefs.isReceiptSmsEnabled && !prefs.isSheetSmsCheckboxEnabled) {
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

            // 🛡️ 휴대전화가 아닌 경우 대기열 무한 재시도 방지를 위해 완료(스킵) 처리 후 건너뜀
            if (!ContactHelper.isMobilePhoneNumber(receipt.recipientPhone)) {
                Log.w(TAG, "⏭️ [대기열 영수증 제외] 상대방 번호가 휴대전화가 아닙니다: ${receipt.recipientPhone} (ID: ${receipt.id}, 유선/대표번호 자동 제외)")
                ApiClient.markReceiptSent(receipt.id, false, receipt.logId)
                continue
            }

            val isExplicitReceipt = receipt.amountKrw > 0
            val msgToSend = if (!isExplicitReceipt && receipt.message.isNotBlank()) {
                receipt.message
            } else if (isExplicitReceipt && prefs.receiptSmsTemplate.isNotBlank()) {
                formatReceiptMessage(
                    template = prefs.receiptSmsTemplate,
                    customerName = receipt.depositorName,
                    amountKrw = receipt.amountKrw.toLong()
                )
            } else if (receipt.message.isNotBlank()) {
                receipt.message
            } else {
                formatReceiptMessage(
                    template = prefs.receiptSmsTemplate,
                    customerName = receipt.depositorName,
                    amountKrw = 0L
                )
            }


            val (isSent, finalMsg) = sendSmsDetailed(context, receipt.recipientPhone, msgToSend)
            if (isSent) {
                ApiClient.markReceiptSent(receipt.id, true, receipt.logId)
                val email = prefs.userEmail
                if (!email.isNullOrBlank()) {
                    ApiClient.sendReceiptSmsSync(
                        userEmail = email,
                        recipientPhone = receipt.recipientPhone,
                        customerName = receipt.depositorName,
                        amount = receipt.amountKrw.toLong(),
                        receiptContent = finalMsg,
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

    /**
     * 🔐 내 SaaS 휴대폰 로그인 인증(OTP) 0원 중계기 대기열을 조회하여 즉시 SMS 발송 및 대장 기록
     * @return 발송 성공한 OTP 건수
     */
    suspend fun processPendingSaasOtps(context: Context): Int = withContext(Dispatchers.IO) {
        val prefs = PreferencesManager(context)
        if (!prefs.isSaasOtpRelayEnabled) {
            return@withContext 0
        }

        val pendingItems = FileToSheetClient.fetchPendingSaasOtps(prefs)
        if (pendingItems.isEmpty()) {
            return@withContext 0
        }

        Log.i(TAG, "🔐 [SaaS OTP 중계기] 대기 중인 인증번호 ${pendingItems.size}건 감지! 즉시 발송 개시")
        var sentCount = 0

        for (item in pendingItems) {
            val startMs = System.currentTimeMillis()
            val (isSent, _) = sendSmsDetailed(context, item.recipientPhone, item.message)
            val elapsedMs = (System.currentTimeMillis() - startMs).coerceAtLeast(1L)

            // 1. 파일투시트 서버에 발송 완료 ACK 보고 (SaaS인증발송대장 상태 업데이트 및 API 대기 즉시 해제)
            FileToSheetClient.ackSaasOtpDispatch(
                prefs = prefs,
                requestId = item.requestId,
                success = isSent,
                errorMessage = if (isSent) null else "단말기 SMS 발송 실패"
            )

            // 2. 구글 시트 목적지가 함께 활성화된 경우 구글 시트 [SheetBot] SaaS 인증발송 대장에도 기록
            val email = prefs.userEmail
            if (prefs.isDestinationGoogleSheet && prefs.hasGoogleAccount && !email.isNullOrBlank()) {
                ApiClient.logSaasOtpToGoogleSheet(
                    userEmail = email,
                    brandName = item.brandName,
                    recipientPhone = item.recipientPhone,
                    purpose = item.purpose,
                    maskedCode = item.maskedCode,
                    status = if (isSent) "✅ 발송성공" else "❌ 발송실패",
                    elapsedMs = elapsedMs
                )
            }

            if (isSent) {
                sentCount++
                LocalLogManager.getInstance(context).addLog(
                    "🔐 SaaS OTP 발송 [${item.brandName}]",
                    "수신: ${item.recipientPhone} (${item.purpose} / ${item.maskedCode})",
                    true
                )
            } else {
                LocalLogManager.getInstance(context).addLog(
                    "⚠️ SaaS OTP 발송 실패 [${item.brandName}]",
                    "수신: ${item.recipientPhone} (SMS 권한/번호 확인 필요)",
                    false
                )
            }
        }

        sentCount
    }
}
