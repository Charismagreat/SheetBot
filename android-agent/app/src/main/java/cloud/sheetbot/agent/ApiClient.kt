package cloud.sheetbot.agent

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.ConnectionPool
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.UnknownHostException
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLException

object ApiClient {
    private const val TAG = "SheetBotApiClient"
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    // 1차 메인 호스트 및 2차 이지데스크 터널 폴백 호스트 (DNS/TLS 장애 시에만 사용)
    const val PRIMARY_HOST = "https://sheetbot.cloud"
    const val FALLBACK_HOST = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot"

    // Passive 서버 생존 추적기: 어떤 정상 API든 성공하면 서버 생존 시각과 지연시간 기록
    @Volatile
    var lastServerSuccessAtMs: Long = 0L
        private set

    @Volatile
    var lastServerLatencyMs: Long = 0L
        private set

    @Volatile
    var lastConnectedHost: String = PRIMARY_HOST
        private set

    fun recordServerSuccess(latencyMs: Long, host: String = PRIMARY_HOST) {
        lastServerSuccessAtMs = System.currentTimeMillis()
        lastServerLatencyMs = latencyMs
        lastConnectedHost = host
    }

    fun hasRecentServerSuccess(withinMs: Long): Boolean {
        val last = lastServerSuccessAtMs
        return last > 0L && (System.currentTimeMillis() - last) <= withinMs
    }

    private fun isDnsOrTlsFailure(e: Exception): Boolean {
        return e is UnknownHostException ||
            e is SSLException ||
            e.cause is UnknownHostException ||
            e.cause is SSLException
    }

    // ★ [Zero-Stale Connection] 터널 프록시의 유휴 커넥션 풀 재사용으로 인한 간헐적 HTTP 400 (0B) 원천 차단
    private val client = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(0, 1, TimeUnit.MILLISECONDS))
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .writeTimeout(6, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    // 초경량 /api/health 생존 확인 전용 클라이언트
    private val healthCheckClient = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(0, 1, TimeUnit.MILLISECONDS))
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    // 이벤트 기반 SMS 큐 장폴링 전용 클라이언트 (waitMs=25000 + 네트워크 여유 10초)
    private val longPollClient = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(0, 1, TimeUnit.MILLISECONDS))
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(35, TimeUnit.SECONDS)
        .writeTimeout(6, TimeUnit.SECONDS)
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
     * 서버 생존 상태(Ping) 및 지연 시간(ms) 실시간 확인
     * - DB/GitHub/SSR을 전혀 건드리지 않는 초경량 GET /api/health 사용 (<2ms)
     * - 동일 터널(mcp-server-fxkud1) 중복 폭주 방지: DNS/TLS 오류 시에만 FALLBACK_HOST 시도
     */
    suspend fun pingServer(): PingResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "서버 및 터널 응답 없음"
        for ((idx, host) in hosts.withIndex()) {
            val endpoint = "$host/api/health"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .header("Cache-Control", "no-cache")
                    .header("Connection", "close")
                    .get()
                    .build()
                val startTime = System.currentTimeMillis()
                healthCheckClient.newCall(request).execute().use { response ->
                    val elapsed = System.currentTimeMillis() - startTime
                    if (response.isSuccessful || response.code == 429) {
                        recordServerSuccess(elapsed, host)
                        return@withContext PingResult(
                            isOnline = true,
                            latencyMs = elapsed,
                            connectedHost = host
                        )
                    }
                    lastError = "HTTP ${response.code}"
                    Log.w(TAG, "서버 핑 HTTP ${response.code} ($endpoint)")
                }
                // HTTP 응답 자체가 왔다는 것은 DNS/TLS가 정상이며 동일 터널을 탔다는 의미이므로 중복 폴백 생략
                if (idx == 0) break
            } catch (e: Exception) {
                lastError = e.message ?: "연결 실패"
                Log.w(TAG, "서버 핑 확인 실패 ($host): ${e.message}")
                if (idx == 0 && !isDnsOrTlsFailure(e)) break
            }
        }
        PingResult(isOnline = false, error = lastError)
    }

    /**
     * 스마트폰 자체의 외부 인터넷 연결 상태 교차 검증 (Wi-Fi/LTE 전환 및 Doze 오탐 차단)
     */
    suspend fun verifyInternetConnectivity(context: Context? = null): Boolean = withContext(Dispatchers.IO) {
        if (context != null) {
            try {
                val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                val activeNet = cm?.activeNetwork
                val caps = if (activeNet != null) cm.getNetworkCapabilities(activeNet) else null
                if (caps == null || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                    return@withContext false
                }
            } catch (_: Exception) {}
        }
        try {
            val request = Request.Builder()
                .url("https://www.google.com/generate_204")
                .header("Connection", "close")
                .get()
                .build()
            healthCheckClient.newCall(request).execute().use { res ->
                res.isSuccessful || res.code == 204
            }
        } catch (_: Exception) {
            false
        }
    }

    /**
     * 백그라운드 생존 신호(Heartbeat) 전송 (DNS/TLS 장애 시에만 2차 폴백)
     */
    suspend fun sendHeartbeat(
        heartbeatUrl: String,
        fallbackHeartbeatUrl: String? = null,
        userEmail: String,
        batteryLevel: Int? = null,
        isCharging: Boolean? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val targets = buildList {
            add(heartbeatUrl)
            if (!fallbackHeartbeatUrl.isNullOrBlank() && fallbackHeartbeatUrl != heartbeatUrl) {
                add(fallbackHeartbeatUrl)
            } else if (!heartbeatUrl.contains(FALLBACK_HOST)) {
                add("$FALLBACK_HOST/api/wallet/agent/heartbeat")
            }
        }

        for ((idx, targetUrl) in targets.withIndex()) {
            try {
                val json = JSONObject().apply {
                    put("userEmail", userEmail)
                    put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
                    put("appVersion", BuildConfig.VERSION_NAME)
                    if (batteryLevel != null) put("batteryLevel", batteryLevel)
                    if (isCharging != null) put("isCharging", isCharging)
                }

                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val request = Request.Builder()
                    .url(targetUrl)
                    .header("Connection", "close")
                    .post(body)
                    .build()

                val startTime = System.currentTimeMillis()
                client.newCall(request).execute().use { response ->
                    val elapsed = System.currentTimeMillis() - startTime
                    if (response.isSuccessful || response.code == 429) {
                        recordServerSuccess(elapsed, targetUrl)
                        return@withContext true
                    }
                    Log.w(TAG, "Heartbeat HTTP ${response.code} ($targetUrl)")
                }
                if (idx == 0) break
            } catch (e: Exception) {
                Log.w(TAG, "Heartbeat 실패 ($targetUrl): ${e.message}")
                if (idx == 0 && !isDnsOrTlsFailure(e)) break
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

        // 3. 3차 폴백: GitHub Releases 공식 API 직접 조회 (sheetbot.cloud 서버가 꺼져 있어도 항상 성공)
        try {
            val ghEndpoint = "https://api.github.com/repos/Charismagreat/SheetBot/releases/latest"
            val ghReq = Request.Builder()
                .url(ghEndpoint)
                .header("Accept", "application/vnd.github.v3+json")
                .header("User-Agent", "SheetBot-Agent-Android")
                .get()
                .build()
            val ghRes = client.newCall(ghReq).execute()
            val ghStr = ghRes.body?.string() ?: ""
            val ghJson = JSONObject(ghStr)
            val rawTag = ghJson.optString("tag_name", "")
            val cleanVersion = rawTag.removePrefix("v").trim()
            val body = ghJson.optString("body", "")
            val assets = ghJson.optJSONArray("assets")
            var downloadUrl = ""
            if (assets != null) {
                for (i in 0 until assets.length()) {
                    val asset = assets.getJSONObject(i)
                    val name = asset.optString("name", "")
                    if (name.endsWith(".apk") && name.contains("deposit-agent")) {
                        downloadUrl = asset.optString("browser_download_url", "")
                        break
                    }
                }
            }
            if (cleanVersion.isNotBlank()) {
                val calculatedCode = parseVersionToCode(cleanVersion)
                val finalUrl = if (downloadUrl.isNotBlank()) downloadUrl else "https://github.com/Charismagreat/SheetBot/releases/download/$rawTag/sheetbot-deposit-agent.apk"
                Log.i(TAG, "🎉 [GitHub 직통 릴리즈 확인 성공] 최신 버전: v$cleanVersion, URL: $finalUrl")
                return@withContext VersionInfo(
                    latestVersionCode = calculatedCode,
                    latestVersionName = cleanVersion,
                    apkUrl = finalUrl,
                    fallbackApkUrl = finalUrl,
                    releaseNotes = body
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "GitHub 릴리즈 직통 조회 실패: ${e.message}")
        }

        null
    }

    private fun parseVersionToCode(versionName: String): Int {
        return try {
            val parts = versionName.split(".")
            val major = parts.getOrNull(0)?.toIntOrNull() ?: 1
            val minor = parts.getOrNull(1)?.toIntOrNull() ?: 0
            val patch = parts.getOrNull(2)?.toIntOrNull() ?: 0
            if (major == 1 && minor == 5) {
                7 + patch
            } else {
                major * 10000 + minor * 100 + patch
            }
        } catch (_: Exception) {
            999
        }
    }

    /**
     * 서버의 미발송 영수증 대기열(Outbox Queue) 조회
     * - userEmail 필수 전달 (미전달 시 HTTP 400 반복 발생 방지)
     */
    suspend fun fetchPendingReceipts(userEmail: String?): List<PendingReceipt> = withContext(Dispatchers.IO) {
        val cleanEmail = userEmail?.trim()
        if (cleanEmail.isNullOrBlank() || !cleanEmail.contains("@")) {
            return@withContext emptyList()
        }
        val encodedEmail = java.net.URLEncoder.encode(cleanEmail, "UTF-8")
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for ((idx, host) in hosts.withIndex()) {
            val endpoint = "$host/api/wallet/agent/pending-receipts?email=$encodedEmail"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .header("x-sheetbot-user-email", cleanEmail)
                    .header("Connection", "close")
                    .get()
                    .build()
                val startTime = System.currentTimeMillis()
                client.newCall(request).execute().use { response ->
                    val elapsed = System.currentTimeMillis() - startTime
                    val resStr = response.body?.string() ?: ""
                    val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                    if (response.isSuccessful && resJson.optBoolean("success", false)) {
                        recordServerSuccess(elapsed, host)
                        val array = resJson.optJSONArray("pendingReceipts") ?: return@withContext emptyList()
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
                }
                if (idx == 0) break
            } catch (e: Exception) {
                Log.w(TAG, "미발송 영수증 대기열 조회 실패 ($host): ${e.message}")
                if (idx == 0 && !isDnsOrTlsFailure(e)) break
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

    /**
     * 인증번호 SMS 발송 대기열(FileToSheet 브릿지 큐) 이벤트 기반 장폴링 조회
     * - waitMs=25000: 큐가 비어 있으면 서버 메모리에서 최대 25초 대기(유휴 DB 쿼리 0건),
     *   신규 인증번호 적재 시 <100ms 만에 즉시 반환.
     * - @return Pair(통신 성공 여부, 발송 작업 목록)
     */
    suspend fun pollSmsDispatchJobs(
        userEmail: String?,
        deviceToken: String?,
        waitMs: Long = 25000L
    ): Pair<Boolean, List<SmsDispatchJob>> = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for ((idx, host) in hosts.withIndex()) {
            val endpoint = "$host/api/manager-agent/sms-queue?limit=3&waitMs=$waitMs"
            try {
                val reqBuilder = Request.Builder()
                    .url(endpoint)
                    .header("Cache-Control", "no-cache")
                    .header("Connection", "close")
                    .get()
                if (!userEmail.isNullOrBlank()) reqBuilder.header("x-sheetbot-user-email", userEmail)
                if (!deviceToken.isNullOrBlank()) reqBuilder.header("x-sheetbot-device-token", deviceToken)
                val startTime = System.currentTimeMillis()
                val httpClient = if (waitMs > 0L) longPollClient else client
                httpClient.newCall(reqBuilder.build()).execute().use { response ->
                    val elapsed = System.currentTimeMillis() - startTime
                    val resStr = response.body?.string() ?: ""
                    val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                    if (response.isSuccessful && resJson.optBoolean("success", false)) {
                        // 장폴링 완료 자체로 서버 정상 통신 확인됨 (실제 RTT는 짧게 보정)
                        recordServerSuccess(if (waitMs > 0L) minOf(elapsed, 500L) else elapsed, host)
                        val array = resJson.optJSONArray("items") ?: return@withContext Pair(true, emptyList())
                        val list = mutableListOf<SmsDispatchJob>()
                        for (i in 0 until array.length()) {
                            val item = array.getJSONObject(i)
                            list.add(
                                SmsDispatchJob(
                                    id = item.optLong("id", 0L),
                                    recipient = item.optString("recipient", ""),
                                    message = item.optString("message", ""),
                                    sourceService = item.optString("sourceService", "FileToSheet")
                                )
                            )
                        }
                        return@withContext Pair(true, list)
                    }
                    Log.w(TAG, "인증번호 SMS 대기열 응답 오류 HTTP ${response.code} ($host)")
                }
                if (idx == 0) break
            } catch (e: Exception) {
                Log.w(TAG, "인증번호 SMS 대기열 통신 실패 ($host): ${e.message}")
                if (idx == 0 && !isDnsOrTlsFailure(e)) break
            }
        }
        Pair(false, emptyList())
    }

    suspend fun fetchSmsDispatchJobs(userEmail: String?, deviceToken: String?): List<SmsDispatchJob> =
        pollSmsDispatchJobs(userEmail, deviceToken, waitMs = 25000L).second

    /**
     * 인증번호 SMS 발송 결과 서버 보고
     */
    suspend fun reportSmsDispatchJob(
        id: Long,
        success: Boolean,
        error: String? = null,
        userEmail: String? = null,
        deviceToken: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val endpoint = "$host/api/manager-agent/sms-queue/report"
            try {
                val json = JSONObject().apply {
                    put("dispatchId", id)
                    put("success", success)
                    if (!error.isNullOrBlank()) put("error", error)
                }
                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val reqBuilder = Request.Builder().url(endpoint).post(body)
                if (!userEmail.isNullOrBlank()) reqBuilder.header("x-sheetbot-user-email", userEmail)
                if (!deviceToken.isNullOrBlank()) reqBuilder.header("x-sheetbot-device-token", deviceToken)
                val response = client.newCall(reqBuilder.build()).execute()
                if (response.isSuccessful) return@withContext true
            } catch (_: Exception) {
                // failover to fallback
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

data class SmsDispatchJob(
    val id: Long,
    val recipient: String,
    val message: String,
    val sourceService: String
)

data class PingResult(
    val isOnline: Boolean,
    val latencyMs: Long = 0,
    val connectedHost: String = "",
    val error: String? = null
)

