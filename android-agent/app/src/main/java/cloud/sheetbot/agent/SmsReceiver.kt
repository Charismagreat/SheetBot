package cloud.sheetbot.agent

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "SmsReceiver"
        const val DEPOSIT_CHANNEL_ID = "sheetbot_deposit_alerts"
        const val ACTION_DEPOSIT_DETECTED = "cloud.sheetbot.agent.DEPOSIT_DETECTED"

        // 주요 은행 대표번호 목록
        private val BANK_NUMBERS = setOf(
            "1599-3333", "15993333", // 카카오뱅크
            "1599-4905", "15994905", // 토스뱅크
            "1588-9999", "1599-9999", "15889999", "15999999", // KB국민
            "1577-8000", "1599-8000", "15778000", "15998000", // 신한
            "1588-5000", "1599-5000", "15885000", "15995000", // 우리
            "1599-1111", "1588-1111", "15991111", "15881111", // 하나
            "1588-2100", "1544-2100", "15882100", "15442100", // 농협
            "1566-2566", "1588-2588", "15662566", "15882588", // IBK기업
            "1522-1000", "15221000"  // 케이뱅크
        )

        private val BANK_KEYWORDS = listOf(
            "카카오뱅크", "토스뱅크", "국민은행", "신한은행", "우리은행", "하나은행", "농협", "기업은행", "케이뱅크",
            "KB국민", "신한", "우리", "하나", "IBK"
        )
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val prefs = PreferencesManager(context)
        val userEmail = prefs.userEmail

        if (!prefs.isPaired || userEmail.isNullOrBlank()) {
            Log.w(TAG, "앱이 시트봇 계정에 연동되지 않아 SMS 처리를 건너뜁니다.")
            return
        }

        try {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            if (messages.isNullOrEmpty()) return

            val sender = messages[0].originatingAddress ?: ""
            val fullBody = messages.joinToString("") { it.messageBody ?: "" }

            Log.d(TAG, "SMS 수신 감지: $sender / ${fullBody.take(40)}...")

            // 1. 은행 발신번호 또는 본문 은행 키워드 확인
            val cleanSender = sender.replace("-", "").trim()
            val isBankSender = BANK_NUMBERS.any { it.replace("-", "") == cleanSender }
            val hasBankKeyword = BANK_KEYWORDS.any { fullBody.contains(it) }

            if (!isBankSender && !hasBankKeyword) {
                Log.d(TAG, "은행 발신 문자가 아니므로 무시합니다. ($sender)")
                return
            }

            // 2. '입금' 키워드 포함 여부 확인
            if (!fullBody.contains("입금")) {
                Log.d(TAG, "은행 문자이지만 입금 내역이 아니므로 무시합니다.")
                return
            }

            Log.i(TAG, "🎯 유효한 은행 입금 SMS 감지! 시트봇 웹훅으로 즉시 전송합니다. (발신: $sender)")

            // 3. 백그라운드 비동기 웹훅 전송
            val pendingResult = goAsync()
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val result = ApiClient.sendBankWebhook(
                        webhookUrl = prefs.webhookUrl,
                        sender = sender,
                        smsText = fullBody,
                        userEmail = userEmail
                    )

                    Log.i(TAG, "웹훅 전송 결과: 성공=${result.success}, 상태코드=${result.statusCode}")

                    // 4. 로컬 상태 저장 및 알림
                    val logSummary = "${sender}: ${fullBody.replace("\n", " ").take(60)}"
                    prefs.lastDetectedDeposit = logSummary

                    showDepositNotification(context, fullBody, result.success)

                    // UI 갱신용 브로드캐스트 발송
                    val updateIntent = Intent(ACTION_DEPOSIT_DETECTED).apply {
                        putExtra("smsBody", fullBody)
                        putExtra("sender", sender)
                        putExtra("success", result.success)
                        setPackage(context.packageName)
                    }
                    context.sendBroadcast(updateIntent)
                } catch (e: Exception) {
                    Log.e(TAG, "웹훅 전송 중 예외 발생", e)
                } finally {
                    pendingResult.finish()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "onReceive SMS 파싱 오류", e)
        }
    }

    private fun showDepositNotification(context: Context, body: String, isSuccess: Boolean) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                DEPOSIT_CHANNEL_ID,
                "SheetBot 입금 확인 알림",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "은행 입금 문자가 감지되어 시트봇 토큰 충전이 완료되었을 때 알립니다."
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }

        val title = if (isSuccess) "🔔 [입금감지] 무통장 입금 자동 확인 완료!" else "⚠️ [입금감지] 웹훅 전송 실패"
        val snippet = body.replace("\n", " ").take(80)

        val notification = NotificationCompat.Builder(context, DEPOSIT_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(snippet)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.ic_input_add)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        manager.notify((System.currentTimeMillis() % 100000).toInt(), notification)
    }
}
