package cloud.sheetbot.agent.sms

import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class SmsJob(val id: Long, val recipient: String, val message: String, val source: String)

sealed class QueueResult {
    data class Ok(val jobs: List<SmsJob>) : QueueResult()
    object Unauthorized : QueueResult()
    data class Error(val message: String) : QueueResult()
}

data class PairInfo(val server: String, val token: String)

object ManagerSmsApi {
    private val JSON = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    /** sheetbot-manager://pair?server=https://...&token=... 파싱. https 서버만 허용. */
    fun parsePairUri(raw: String): PairInfo? {
        val uri = try { Uri.parse(raw.trim()) } catch (_: Exception) { return null }
        if (uri.scheme != "sheetbot-manager" || uri.host != "pair") return null
        val server = uri.getQueryParameter("server")?.trimEnd('/') ?: return null
        val token = uri.getQueryParameter("token") ?: return null
        if (!server.startsWith("https://") || token.isBlank()) return null
        return PairInfo(server, token)
    }

    /** 1회용 페어링 토큰 → 기기 키 교환. 성공 시 Prefs 에 저장. */
    suspend fun pair(prefs: ManagerSmsPrefs, info: PairInfo, model: String, appVersion: String): Result<String> =
        withContext(Dispatchers.IO) {
            try {
                val body = JSONObject()
                    .put("token", info.token)
                    .put("deviceModel", model)
                    .put("appVersion", appVersion)
                    .toString().toRequestBody(JSON)
                val req = Request.Builder().url("${info.server}/api/manager-agent/pair").post(body).build()
                client.newCall(req).execute().use { res ->
                    val json = try { JSONObject(res.body?.string() ?: "") } catch (_: Exception) { JSONObject() }
                    if (res.isSuccessful && json.optBoolean("success")) {
                        prefs.server = info.server
                        prefs.deviceKey = json.getString("deviceKey")
                        prefs.deviceId = json.optString("deviceId")
                        prefs.label = json.optString("label")
                        Result.success(json.optString("label", "매니저 폰"))
                    } else {
                        Result.failure(Exception(json.optString("error", "페어링 실패 (HTTP ${res.code})")))
                    }
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    suspend fun fetchQueue(prefs: ManagerSmsPrefs): QueueResult = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder()
                .url("${prefs.server}/api/manager-agent/sms-queue?limit=3")
                .header("x-manager-device-key", prefs.deviceKey ?: "")
                .get().build()
            client.newCall(req).execute().use { res ->
                if (res.code == 401) return@withContext QueueResult.Unauthorized
                val json = try { JSONObject(res.body?.string() ?: "") } catch (_: Exception) { JSONObject() }
                if (!res.isSuccessful || !json.optBoolean("success")) {
                    return@withContext QueueResult.Error("HTTP ${res.code}")
                }
                val arr = json.optJSONArray("items")
                val jobs = (0 until (arr?.length() ?: 0)).map {
                    val o = arr!!.getJSONObject(it)
                    SmsJob(
                        id = o.getLong("id"),
                        recipient = o.optString("recipient"),
                        message = o.optString("message"),
                        source = o.optString("sourceService", "FileToSheet"),
                    )
                }
                QueueResult.Ok(jobs)
            }
        } catch (e: Exception) {
            QueueResult.Error(e.message ?: "network error")
        }
    }

    /** @return true: 서버가 결과를 확정(성공 또는 재시도 무의미한 4xx). false: 재시도 필요 */
    suspend fun report(prefs: ManagerSmsPrefs, id: Long, success: Boolean, error: String?): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val body = JSONObject()
                    .put("dispatchId", id)
                    .put("success", success)
                    .apply { if (error != null) put("error", error) }
                    .toString().toRequestBody(JSON)
                val req = Request.Builder()
                    .url("${prefs.server}/api/manager-agent/sms-queue/report")
                    .header("x-manager-device-key", prefs.deviceKey ?: "")
                    .post(body).build()
                client.newCall(req).execute().use { res -> res.isSuccessful || res.code in 400..499 }
            } catch (_: Exception) {
                false
            }
        }
}
