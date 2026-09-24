package cloud.sheetbot.agent.user

import android.content.Context
import android.os.Build
import android.telephony.SmsManager
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 0원 영수증 SMS 발송 및 미발송 대기열 처리 전용 유틸리티
 */
object SmsSenderUtil {
    private const val TAG = "SmsSenderUtil"

    /**
     * 지정된 휴대폰 번호로 텍스트/장문 SMS 발송
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

            val parts = smsManager.divideMessage(messageText)
            if (parts.size > 1) {
                smsManager.sendMultipartTextMessage(cleanPhone, null, parts, null, null)
            } else {
                smsManager.sendTextMessage(cleanPhone, null, messageText, null, null)
            }
            Log.i(TAG, "✅ [SMS 발송 성공] 수신자: $cleanPhone / 길이: ${messageText.length}자")
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

            val isSent = sendSms(context, receipt.recipientPhone, receipt.message)
            if (isSent) {
                ApiClient.markReceiptSent(receipt.id, true)
                sentCount++
                Log.i(TAG, "🎉 [대기열 영수증 회신 완료] ID: ${receipt.id}, 입금자: ${receipt.depositorName}, 수신: ${receipt.recipientPhone}")
            } else {
                Log.w(TAG, "⚠️ [대기열 영수증 회신 실패] ID: ${receipt.id}, 수신: ${receipt.recipientPhone}")
            }
        }

        sentCount
    }
}
