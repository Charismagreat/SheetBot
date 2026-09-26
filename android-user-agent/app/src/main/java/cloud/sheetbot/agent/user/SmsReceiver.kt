package cloud.sheetbot.agent.user

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

/**
 * 이용자용 SheetBot Agent 전용 SMS 수신 리시버
 * 스마트폰으로 수신된 고객 SMS를 실시간 감지하여 사용자의 구글 시트 대장으로 동기화
 */
class SmsReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "UserSmsReceiver"
        const val SMS_CHANNEL_ID = "sheetbot_user_sms_channel"
        const val ACTION_SMS_RECEIVED = "cloud.sheetbot.agent.user.SMS_RECEIVED"
        const val ACTION_DEPOSIT_DETECTED = "cloud.sheetbot.agent.user.DEPOSIT_DETECTED"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val prefs = PreferencesManager(context)
        val userEmail = prefs.userEmail

        if (!prefs.isPaired || userEmail.isNullOrBlank()) {
            Log.w(TAG, "시트봇 계정에 연동되지 않아 SMS 수신 동기화를 건너뜁니다.")
            return
        }

        try {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            if (messages.isNullOrEmpty()) return

            val sender = messages[0].originatingAddress ?: ""
            val fullBody = messages.joinToString("") { it.messageBody ?: "" }

            Log.i(TAG, "📱 [고객 SMS 수신 감지] 발신: $sender / 본문: ${fullBody.take(40)}...")

            val pendingResult = goAsync()
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val isSynced = ApiClient.sendInboundSms(
                        userEmail = userEmail,
                        sender = sender,
                        message = fullBody
                    )

                    showInboundSmsNotification(context, sender, fullBody, isSynced)

                    if (isSynced) {
                        Log.i(TAG, "✅ [고객 문자 시트 동기화 완료] 발신: $sender")
                        if (prefs.isTtsEnabled) {
                            TtsManager.speak(context, "새로운 고객 문자가 수신되어 구글 시트에 기록되었습니다.")
                        }
                    } else {
                        Log.w(TAG, "⚠️ [고객 문자 동기화 실패] 발신: $sender")
                    }

                    // UI 로그 갱신용 브로드캐스트 발송
                    val updateIntent = Intent(ACTION_SMS_RECEIVED).apply {
                        putExtra("smsBody", fullBody)
                        putExtra("sender", sender)
                        putExtra("success", isSynced)
                        setPackage(context.packageName)
                    }
                    context.sendBroadcast(updateIntent)
                } catch (e: Exception) {
                    Log.e(TAG, "고객 문자 동기화 중 오류 발생", e)
                } finally {
                    pendingResult.finish()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "onReceive SMS 파싱 오류", e)
        }
    }

    private fun showInboundSmsNotification(context: Context, sender: String, body: String, isSuccess: Boolean) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                SMS_CHANNEL_ID,
                "SheetBot 고객 문자 수신 알림",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "고객 문의 문자가 수신되어 구글 시트로 동기화되었을 때 알립니다."
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }

        val statusText = if (isSuccess) "시트 동기화 완료" else "동기화 재시도 대기"
        val title = "💬 [고객 문자] $sender ($statusText)"
        val snippet = body.replace("\n", " ").take(80)

        val notification = NotificationCompat.Builder(context, SMS_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(snippet)
            .setStyle(NotificationCompat.BigTextStyle().bigText("발신: $sender\n\n$body"))
            .setSmallIcon(android.R.drawable.sym_action_chat)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        manager.notify((System.currentTimeMillis() % 100000).toInt(), notification)
    }
}
