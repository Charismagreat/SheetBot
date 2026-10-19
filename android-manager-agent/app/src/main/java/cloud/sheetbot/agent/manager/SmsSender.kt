package cloud.sheetbot.agent.manager

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.app.PendingIntent
import android.os.Build
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import java.util.UUID

data class SendResult(val success: Boolean, val error: String? = null)

object SmsSender {
    private val MOBILE = Regex("^01[016789]\\d{7,8}$")
    private const val MAX_LEN = 300

    private fun smsManager(context: Context): SmsManager =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION") SmsManager.getDefault()
        }

    /** 통신사 전송 결과(SENT 브로드캐스트)까지 확인한 뒤 결과를 반환 */
    suspend fun send(context: Context, rawPhone: String, text: String): SendResult {
        val phone = rawPhone.replace(Regex("[^0-9]"), "")
        if (!MOBILE.matches(phone)) return SendResult(false, "휴대전화 번호가 아님")
        if (text.isBlank() || text.length > MAX_LEN) return SendResult(false, "메시지 본문이 비었거나 너무 김")
        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.SEND_SMS)
            != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) return SendResult(false, "SEND_SMS 권한 없음")

        val app = context.applicationContext
        val action = "cloud.sheetbot.agent.manager.SMS_SENT_" + UUID.randomUUID()
        val sms = smsManager(app)
        val parts = sms.divideMessage(text)
        val total = parts.size

        val result = withTimeoutOrNull(30_000L) {
            suspendCancellableCoroutine<SendResult> { cont ->
                var done = 0
                lateinit var receiver: BroadcastReceiver
                fun finish(r: SendResult) {
                    try { app.unregisterReceiver(receiver) } catch (_: Exception) {}
                    if (cont.isActive) cont.resumeWith(Result.success(r))
                }
                receiver = object : BroadcastReceiver() {
                    override fun onReceive(c: Context, i: Intent) {
                        if (resultCode != Activity.RESULT_OK) {
                            finish(SendResult(false, "통신사 전송 실패 (code=$resultCode)"))
                        } else if (++done >= total) {
                            finish(SendResult(true))
                        }
                    }
                }
                ContextCompat.registerReceiver(
                    app, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED
                )
                cont.invokeOnCancellation { try { app.unregisterReceiver(receiver) } catch (_: Exception) {} }

                val intents = ArrayList<PendingIntent>()
                for (idx in 0 until total) {
                    intents.add(
                        PendingIntent.getBroadcast(
                            app, idx, Intent(action).setPackage(app.packageName),
                            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                        )
                    )
                }
                try {
                    if (total == 1) sms.sendTextMessage(phone, null, text, intents[0], null)
                    else sms.sendMultipartTextMessage(phone, null, parts, intents, null)
                } catch (e: Exception) {
                    finish(SendResult(false, e.message ?: "SMS 전송 예외"))
                }
            }
        }
        return result ?: SendResult(false, "전송 결과 확인 시간 초과")
    }
}
