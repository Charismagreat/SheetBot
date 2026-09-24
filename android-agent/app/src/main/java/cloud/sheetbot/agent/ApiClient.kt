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

    // 1차 메인 호스트 및 2차 이지데스크 터널 폴백 호스트
    const val PRIMARY_HOST = "https://sheetbot.cloud"
    const val FALLBACK_HOST = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot"

    // 빠른 2단계 폴백을 위한 타임아웃 최적화 (1차 서버 장애 시 3.5초 내 2차로 즉시 전환)
    private val client = OkHttpClient.Builder()
        .connectTimeout(3500, TimeUnit.MILLISECONDS)
        .readTimeout(6000, TimeUnit.MILLISECONDS)
        .writeTimeout(4000, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /**
     * QR코드 또는 핀코드로 시트봇 서버에 기기 페어링 요청
     * 1차: sheetbot.cloud -> 실패 시 2차: tunneling-service/p/SheetBot 자동 폴백
     */
    suspend fun pairDevice(
        userEmail: String,
        token: String? = null,
        pinCode: String? = null
    ): PairResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "페어링 요청 실패"

        for ((index, host) in hosts.withIndex()) {
            val endpoint = "$host/api/wallet/agent/pair"
            Log.i(TAG, "[페어링 시도 ${index + 1}/${hosts.size}] 엔드포인트: $endpoint")

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
                    .url(endpoint)
                    .post(body)
                    .build()

                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    Log.i(TAG, "🎉 [페어링 성공] 호스트: $host")
                    return@withContext PairResult(
                        success = true,
                        userEmail = resJson.optString("userEmail", userEmail),
                        deviceToken = resJson.optString("deviceToken", ""),
                        webhookUrl = resJson.optString("webhookUrl", "$PRIMARY_HOST/api/wallet/bank-webhook"),
                        fallbackWebhookUrl = resJson.optString("fallbackWebhookUrl", "$FALLBACK_HOST/api/wallet/bank-webhook"),
                        heartbeatUrl = resJson.optString("heartbeatUrl", "$PRIMARY_HOST/api/wallet/agent/heartbeat"),
                        fallbackHeartbeatUrl = resJson.optString("fallbackHeartbeatUrl", "$FALLBACK_HOST/api/wallet/agent/heartbeat"),
                        message = resJson.optString("message", "연동 성공")
                    )
                } else {
                    val errMsg = resJson.optString("error", "HTTP ${response.code}")
                    lastError = "[$host] $errMsg"
                    Log.w(TAG, "페어링 실패 ($host): $errMsg, 다음 호스트 폴백 검토")
                }
            } catch (e: Exception) {
                lastError = "[$host] ${e.localizedMessage ?: "네트워크 연결 불가"}"
                Log.w(TAG, "페어링 예외 ($host): ${e.message}, 다음 호스트 폴백 시도")
            }
        }

        PairResult(success = false, error = lastError)
    }

    /**
     * 입금 SMS 감지 시 시트봇 실시간 웹훅으로 암호화 전송
     * 1차 webhookUrl 실패 시 fallbackWebhookUrl로 자동 재전송
     */
    suspend fun sendBankWebhook(
        webhookUrl: String,
        fallbackWebhookUrl: String? = null,
        sender: String,
        smsText: String,
        userEmail: String
    ): WebhookResult = withContext(Dispatchers.IO) {
        val targets = buildList {
            add(webhookUrl)
            if (!fallbackWebhookUrl.isNullOrBlank() && fallbackWebhookUrl != webhookUrl) {
                add(fallbackWebhookUrl)
            } else if (!webhookUrl.contains(FALLBACK_HOST)) {
                add("$FALLBACK_HOST/api/wallet/bank-webhook")
            }
        }

        var lastResult = WebhookResult(statusCode = 0, success = false, message = "웹훅 전송 실패")

        for ((index, targetUrl) in targets.withIndex()) {
            try {
                Log.i(TAG, "[웹훅 전송 ${index + 1}/${targets.size}] 전송 대상: $targetUrl")
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
                    .url(targetUrl)
                    .post(body)
                    .build()

                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", true)) {
                    Log.i(TAG, "✅ [웹훅 전송 성공] 대상: $targetUrl")
                    val replySmsObj = resJson.optJSONObject("replySms")
                    val replyPhone = replySmsObj?.optString("recipientPhone")?.takeIf { it.isNotBlank() }
                    val replyText = replySmsObj?.optString("message")?.takeIf { it.isNotBlank() }
                    val ttsText = resJson.optString("ttsText").takeIf { it.isNotBlank() }

                    return@withContext WebhookResult(
                        statusCode = response.code,
                        success = true,
                        message = resJson.optString("message", "전송 완료 (HTTP ${response.code})"),
                        replySmsPhone = replyPhone,
                        replySmsText = replyText,
                        ttsText = ttsText
                    )
                } else {
                    val msg = resJson.optString("message", "HTTP ${response.code}")
                    Log.w(TAG, "웹훅 수신 오류 ($targetUrl): $msg")
                    lastResult = WebhookResult(statusCode = response.code, success = false, message = msg)
                }
            } catch (e: Exception) {
                Log.w(TAG, "웹훅 전송 예외 ($targetUrl): ${e.message}")
                lastResult = WebhookResult(statusCode = 0, success = false, message = e.localizedMessage ?: "통신 오류")
            }
        }

        lastResult
    }

    /**
     * 백그라운드 생존 신호(Heartbeat) 전송 (1차 실패 시 2차 폴백)
     */
    suspend fun sendHeartbeat(
        heartbeatUrl: String,
        fallbackHeartbeatUrl: String? = null,
        userEmail: String
    ): Boolean = withContext(Dispatchers.IO) {
        val targets = buildList {
            add(heartbeatUrl)
            if (!fallbackHeartbeatUrl.isNullOrBlank() && fallbackHeartbeatUrl != heartbeatUrl) {
                add(fallbackHeartbeatUrl)
            } else if (!heartbeatUrl.contains(FALLBACK_HOST)) {
                add("$FALLBACK_HOST/api/wallet/agent/heartbeat")
            }
        }

        for (targetUrl in targets) {
            try {
                val json = JSONObject().apply {
                    put("userEmail", userEmail)
                    put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
                    put("appVersion", "1.0.0")
                }

                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val request = Request.Builder()
                    .url(targetUrl)
                    .post(body)
                    .build()

                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    return@withContext true
                }
            } catch (e: Exception) {
                Log.w(TAG, "Heartbeat 실패 ($targetUrl): ${e.message}")
            }
        }
        false
    }

    /**
     * 기기 연동 해제 신호 전송 (1차 실패 시 2차 폴백)
     */
    suspend fun unlinkDevice(
        userEmail: String,
        deviceModel: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val endpoint = "$host/api/wallet/agent/unlink"
            try {
                val json = JSONObject().apply {
                    put("userEmail", userEmail)
                    put("deviceModel", deviceModel ?: "${Build.MANUFACTURER} ${Build.MODEL}")
                }
                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val request = Request.Builder().url(endpoint).post(body).build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    Log.i(TAG, "✅ [연동 해제 성공] 호스트: $host")
                    return@withContext true
                }
            } catch (e: Exception) {
                Log.w(TAG, "연동 해제 신호 전송 실패 ($host): ${e.message}")
            }
        }
        false
    }

    /**
     * 최신 앱 버전 및 원클릭 업데이트 정보 확인
     */
    suspend fun fetchLatestVersion(): VersionInfo? = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val endpoint = "$host/api/wallet/agent/version"
            try {
                val request = Request.Builder().url(endpoint).get().build()
                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    return@withContext VersionInfo(
                        latestVersionCode = resJson.optInt("latestVersionCode", 1),
                        latestVersionName = resJson.optString("latestVersionName", "1.0.0"),
                        apkUrl = resJson.optString("apkUrl", ""),
                        fallbackApkUrl = resJson.optString("fallbackApkUrl", ""),
                        releaseNotes = resJson.optString("releaseNotes", "")
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "버전 확인 실패 ($host): ${e.message}")
            }
        }
        null
    }

    /**
     * 서버의 미발송 영수증 대기열(Outbox Queue) 조회
     */
    suspend fun fetchPendingReceipts(userEmail: String?): List<PendingReceipt> = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val endpoint = "$host/api/wallet/agent/pending-receipts"
            try {
                val request = Request.Builder().url(endpoint).get().build()
                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val array = resJson.optJSONArray("pendingReceipts") ?: continue
                    val list = mutableListOf<PendingReceipt>()
                    for (i in 0 until array.length()) {
                        val item = array.getJSONObject(i)
                        list.add(
                            PendingReceipt(
                                id = item.optLong("id", 0L),
                                recipientPhone = item.optString("recipientPhone", ""),
                                depositorName = item.optString("depositorName", ""),
                                amountKrw = item.optInt("amountKrw", 0),
                                tokensToCredit = item.optInt("tokensToCredit", 0),
                                message = item.optString("message", "")
                            )
                        )
                    }
                    return@withContext list
                }
            } catch (e: Exception) {
                Log.w(TAG, "미발송 영수증 대기열 조회 실패 ($host): ${e.message}")
            }
        }
        emptyList()
    }

    /**
     * 영수증 SMS 발송 완료 상태를 서버에 보고
     */
    suspend fun markReceiptSent(id: Long, success: Boolean = true): Boolean = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val endpoint = "$host/api/wallet/agent/pending-receipts"
            try {
                val json = JSONObject().apply {
                    put("id", id)
                    put("success", success)
                }
                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val request = Request.Builder().url(endpoint).post(body).build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) return@withContext true
            } catch (e: Exception) {
                Log.w(TAG, "영수증 발송 완료 마킹 실패 ($host): ${e.message}")
            }
        }
        false
    }
}

data class PairResult(
    val success: Boolean,
    val userEmail: String? = null,
    val deviceToken: String? = null,
    val webhookUrl: String? = null,
    val fallbackWebhookUrl: String? = null,
    val heartbeatUrl: String? = null,
    val fallbackHeartbeatUrl: String? = null,
    val message: String? = null,
    val error: String? = null
)

data class WebhookResult(
    val statusCode: Int,
    val success: Boolean,
    val message: String,
    val replySmsPhone: String? = null,
    val replySmsText: String? = null,
    val ttsText: String? = null
)

data class VersionInfo(
    val latestVersionCode: Int,
    val latestVersionName: String,
    val apkUrl: String,
    val fallbackApkUrl: String,
    val releaseNotes: String
)

data class PendingReceipt(
    val id: Long,
    val recipientPhone: String,
    val depositorName: String,
    val amountKrw: Int,
    val tokensToCredit: Int,
    val message: String
)
