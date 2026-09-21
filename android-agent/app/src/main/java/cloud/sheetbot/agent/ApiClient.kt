package cloud.sheetbot.agent

import android.os.Build
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object ApiClient {
    private const val TAG = "SheetBotApiClient"
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    /**
     * QR코드 또는 핀코드로 시트봇 서버에 기기 페어링 요청
     */
    suspend fun pairDevice(
        userEmail: String,
        token: String? = null,
        pinCode: String? = null
    ): PairResult = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject().apply {
                put("userEmail", userEmail)
                if (!token.isNullOrBlank()) put("token", token)
                if (!pinCode.isNullOrBlank()) put("pinCode", pinCode)
                put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
                put("appVersion", "1.0.0")
            }

            val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
            val request = Request.Builder()
                .url("https://sheetbot.cloud/api/wallet/agent/pair")
                .post(body)
                .build()

            val response = client.newCall(request).execute()
            val resStr = response.body?.string() ?: ""
            val resJson = JSONObject(resStr)

            if (response.isSuccessful && resJson.optBoolean("success", false)) {
                PairResult(
                    success = true,
                    userEmail = resJson.optString("userEmail", userEmail),
                    deviceToken = resJson.optString("deviceToken", ""),
                    webhookUrl = resJson.optString("webhookUrl", "https://sheetbot.cloud/api/wallet/bank-webhook"),
                    heartbeatUrl = resJson.optString("heartbeatUrl", "https://sheetbot.cloud/api/wallet/agent/heartbeat"),
                    message = resJson.optString("message", "연동 성공")
                )
            } else {
                PairResult(
                    success = false,
                    error = resJson.optString("error", "페어링 실패: HTTP ${response.code}")
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "pairDevice error", e)
            PairResult(success = false, error = e.localizedMessage ?: "네트워크 오류")
        }
    }

    /**
     * 입금 SMS 감지 시 시트봇 실시간 웹훅으로 암호화 전송
     */
    suspend fun sendBankWebhook(
        webhookUrl: String,
        sender: String,
        smsText: String,
        userEmail: String
    ): WebhookResult = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject().apply {
                put("sender", sender)
                put("smsText", smsText)
                put("userEmail", userEmail)
                put("source", "android_native_agent")
                put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
                put("timestamp", System.currentTimeMillis())
            }

            val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
            val request = Request.Builder()
                .url(webhookUrl)
                .post(body)
                .build()

            val response = client.newCall(request).execute()
            val resStr = response.body?.string() ?: ""
            val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

            WebhookResult(
                statusCode = response.code,
                success = response.isSuccessful && resJson.optBoolean("success", true),
                message = resJson.optString("message", "전송 완료 (HTTP ${response.code})")
            )
        } catch (e: Exception) {
            Log.e(TAG, "sendBankWebhook error", e)
            WebhookResult(statusCode = 0, success = false, message = e.localizedMessage ?: "통신 오류")
        }
    }

    /**
     * 백그라운드 생존 신호(Heartbeat) 전송
     */
    suspend fun sendHeartbeat(
        heartbeatUrl: String,
        userEmail: String
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject().apply {
                put("userEmail", userEmail)
                put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
                put("appVersion", "1.0.0")
            }

            val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
            val request = Request.Builder()
                .url(heartbeatUrl)
                .post(body)
                .build()

            val response = client.newCall(request).execute()
            response.isSuccessful
        } catch (e: Exception) {
            Log.w(TAG, "sendHeartbeat warning: ${e.message}")
            false
        }
    }
}

data class PairResult(
    val success: Boolean,
    val userEmail: String? = null,
    val deviceToken: String? = null,
    val webhookUrl: String? = null,
    val heartbeatUrl: String? = null,
    val message: String? = null,
    val error: String? = null
)

data class WebhookResult(
    val statusCode: Int,
    val success: Boolean,
    val message: String
)
