package cloud.sheetbot.agent.user

import android.os.Build
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

object ApiClient {
    private const val TAG = "SheetBotApiClient"
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private fun nowKstStr(): String =
        java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.KOREA).format(java.util.Date())

    // 1차 메인 호스트: 이지데스크 운영 공식 터널 (Zero-Latency 즉시 직결)
    const val PRIMARY_HOST = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot"
    // 2차 백업 호스트
    const val FALLBACK_HOST = "https://sheetbot.cloud"

    // 모든 요청에 이용자 세션(visitorSessionId) 및 이메일 헤더를 자동 주입하고,
    // 서버 응답에 갱신된 x-visitor-session-id 헤더가 있으면 자동으로 Preferences에 동기화하는 인터셉터
    private val sessionInterceptor = okhttp3.Interceptor { chain ->
        val original = chain.request()
        val reqBuilder = original.newBuilder()
        try {
            val prefs = PreferencesManager(SheetBotApp.appContext)
            val sid = prefs.visitorSessionId
            if (!sid.isNullOrBlank()) {
                if (original.header("x-visitor-session-id") == null) {
                    reqBuilder.header("x-visitor-session-id", sid)
                }
                if (original.header("x-egdesk-visitor-session") == null) {
                    reqBuilder.header("x-egdesk-visitor-session", sid)
                }
            }
            val email = prefs.userEmail
            if (!email.isNullOrBlank() && original.header("x-sheetbot-user-email") == null) {
                reqBuilder.header("x-sheetbot-user-email", email)
            }
        } catch (_: Exception) {}

        val response = chain.proceed(reqBuilder.build())
        try {
            val returnedSid = response.header("x-visitor-session-id")
                ?: response.header("x-egdesk-visitor-session")
            if (!returnedSid.isNullOrBlank()) {
                val prefs = PreferencesManager(SheetBotApp.appContext)
                if (prefs.visitorSessionId != returnedSid) {
                    prefs.visitorSessionId = returnedSid
                }
            }
        } catch (_: Exception) {}
        response
    }

    // 빠른 2단계 폴백을 위한 타임아웃 최적화 (1차 서버 장애 시 3.5초 내 2차로 즉시 전환)
    // ★ [Zero-Stale Connection] 터널 프록시의 유휴 커넥션 풀 재사용으로 인한 간헐적 HTTP 400 (0B) 오탐 원천 차단
    private val client = OkHttpClient.Builder()
        .connectionPool(okhttp3.ConnectionPool(0, 1, TimeUnit.MILLISECONDS))
        .addInterceptor(sessionInterceptor)
        .connectTimeout(3500, TimeUnit.MILLISECONDS)
        .readTimeout(6000, TimeUnit.MILLISECONDS)
        .writeTimeout(4000, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(true)
        .build()

    // 파일 업로드, AI OCR/요약 및 구글 시트 연동을 위한 대기 타임아웃 클라이언트
    // ★ [Zero-Stale Connection] 터널 프록시의 소켓 반폐쇄/유휴 재사용 멈춤 현상(60초 타임아웃)을 원천 방지하기 위해 ConnectionPool을 0으로 설정하여 항상 깨끗한 직통 새 소켓 사용
    private val longTimeoutClient = client.newBuilder()
        .connectionPool(okhttp3.ConnectionPool(0, 1, TimeUnit.MILLISECONDS))
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /**
     * QR코드 또는 핀코드로 시트봇 서버에 기기 페어링 요청
     * 1차: sheetbot.cloud -> 실패 시 2차: tunneling-service/p/SheetBot 자동 폴백
     */
    suspend fun pairDevice(
        userEmail: String,
        token: String? = null,
        pinCode: String? = null,
        visitorSessionId: String? = null
    ): PairResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "페어링 요청 실패"
        val effectiveSid = visitorSessionId?.takeIf { it.isNotBlank() }
            ?: try { PreferencesManager(SheetBotApp.appContext).visitorSessionId } catch (_: Exception) { null }

        for ((index, host) in hosts.withIndex()) {
            val endpoint = "$host/api/user/agent2/pair"
            Log.i(TAG, "[이용자 페어링 시도 ${index + 1}/${hosts.size}] 엔드포인트: $endpoint")

            try {
                val json = JSONObject().apply {
                    put("userEmail", userEmail)
                    if (!token.isNullOrBlank()) put("token", token)
                    if (!pinCode.isNullOrBlank()) put("pinCode", pinCode)
                    if (!effectiveSid.isNullOrBlank()) put("visitorSessionId", effectiveSid)
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
                    val resolvedSid = resJson.optString("visitorSessionId", "").takeIf { it.isNotBlank() }
                        ?: response.header("x-visitor-session-id")
                        ?: effectiveSid
                    if (!resolvedSid.isNullOrBlank()) {
                        try { PreferencesManager(SheetBotApp.appContext).visitorSessionId = resolvedSid } catch (_: Exception) {}
                    }
                    Log.i(TAG, "🎉 [페어링 성공] 호스트: $host (sid=${resolvedSid ?: "none"})")
                    return@withContext PairResult(
                        success = true,
                        userEmail = resJson.optString("userEmail", userEmail),
                        deviceToken = resJson.optString("deviceId", resJson.optString("deviceToken", "")),
                        visitorSessionId = resolvedSid,
                        requiresWorkspaceOAuth = resJson.optBoolean("requiresWorkspaceOAuth", false),
                        oauthStartUrl = resJson.optString("oauthStartUrl", "").takeIf { it.isNotBlank() },
                        webhookUrl = resJson.optString("webhookUrl", "$PRIMARY_HOST/api/user/agent2/inbound-sms"),
                        fallbackWebhookUrl = resJson.optString("fallbackWebhookUrl", "$FALLBACK_HOST/api/user/agent2/inbound-sms"),
                        heartbeatUrl = resJson.optString("heartbeatUrl", "$PRIMARY_HOST/api/user/agent2/heartbeat"),
                        fallbackHeartbeatUrl = resJson.optString("fallbackHeartbeatUrl", "$FALLBACK_HOST/api/user/agent2/heartbeat"),
                        message = resJson.optString("message", "구글 시트 연동 성공")
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
     * Google 원클릭 로그인(Sign in with Google) 기반 0초 자동 페어링 (v1.8.0)
     */
    suspend fun pairWithGoogle(
        idToken: String?,
        userEmail: String?,
        deviceModel: String = "${Build.MANUFACTURER} ${Build.MODEL}",
        appVersion: String = "2.0.1",
        referralCode: String? = null,
        visitorSessionId: String? = null
    ): PairResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "구글 로그인 페어링 실패"
        val effectiveSid = visitorSessionId?.takeIf { it.isNotBlank() }
            ?: try { PreferencesManager(SheetBotApp.appContext).visitorSessionId } catch (_: Exception) { null }

        for ((index, host) in hosts.withIndex()) {
            val endpoint = "$host/api/user/agent2/pair-google"
            Log.i(TAG, "[구글 로그인 페어링 시도 ${index + 1}/${hosts.size}] 엔드포인트: $endpoint")

            try {
                val json = JSONObject().apply {
                    if (!idToken.isNullOrBlank()) put("idToken", idToken)
                    if (!userEmail.isNullOrBlank()) put("userEmail", userEmail)
                    if (!effectiveSid.isNullOrBlank()) put("visitorSessionId", effectiveSid)
                    put("deviceModel", deviceModel)
                    put("appVersion", appVersion)
                    if (!referralCode.isNullOrBlank()) put("referralCode", referralCode.trim())
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
                    val finalEmail = resJson.optString("userEmail", userEmail ?: "")
                    val refMsg = resJson.optString("referralMessage", "")
                    val resolvedSid = resJson.optString("visitorSessionId", "").takeIf { it.isNotBlank() }
                        ?: response.header("x-visitor-session-id")
                        ?: effectiveSid
                    if (!resolvedSid.isNullOrBlank()) {
                        try { PreferencesManager(SheetBotApp.appContext).visitorSessionId = resolvedSid } catch (_: Exception) {}
                    }
                    Log.i(TAG, "🎉 [구글 로그인 페어링 성공] 이메일: $finalEmail ($host, sid=${resolvedSid ?: "none"})")
                    return@withContext PairResult(
                        success = true,
                        userEmail = finalEmail,
                        deviceToken = resJson.optString("deviceId", resJson.optString("deviceToken", resJson.optString("token", ""))),
                        visitorSessionId = resolvedSid,
                        requiresWorkspaceOAuth = resJson.optBoolean("requiresWorkspaceOAuth", false),
                        oauthStartUrl = resJson.optString("oauthStartUrl", "").takeIf { it.isNotBlank() },
                        webhookUrl = resJson.optString("webhookUrl", "$PRIMARY_HOST/api/user/agent2/inbound-sms"),
                        fallbackWebhookUrl = resJson.optString("fallbackWebhookUrl", "$FALLBACK_HOST/api/user/agent2/inbound-sms"),
                        heartbeatUrl = resJson.optString("heartbeatUrl", "$PRIMARY_HOST/api/user/agent2/heartbeat"),
                        fallbackHeartbeatUrl = resJson.optString("fallbackHeartbeatUrl", "$FALLBACK_HOST/api/user/agent2/heartbeat"),
                        message = if (refMsg.isNotBlank()) "$refMsg\n구글 계정 연동 성공" else resJson.optString("message", "구글 계정 연동 성공"),
                        referralMessage = if (refMsg.isNotBlank()) refMsg else null
                    )
                } else {
                    val errMsg = resJson.optString("error", "HTTP ${response.code}")
                    lastError = "[$host] $errMsg"
                    Log.w(TAG, "구글 페어링 실패 ($host): $errMsg")
                }
            } catch (e: Exception) {
                lastError = "[$host] ${e.localizedMessage ?: "네트워크 연결 불가"}"
                Log.w(TAG, "구글 페어링 예외 ($host): ${e.message}")
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
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        var ftsSuccess = false
        if (prefs?.isDestinationFileToSheet == true) {
            val rowData = JSONObject().apply {
                put("일시", nowKstStr())
                put("구분", if (smsText.contains("출금") || smsText.contains("승인") || smsText.contains("결제")) "결제/출금" else "입금")
                put("금융사/채널", sender.removePrefix("PUSH:"))
                put("계좌/카드번호", "-")
                put("고객/가맹점명", "-")
                put("금액", Regex("""([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원""").find(smsText)?.groupValues?.getOrNull(1) ?: "-")
                put("거래내용", smsText)
                put("수신기기", "${Build.MANUFACTURER} ${Build.MODEL}")
            }
            val ftsRes = FileToSheetClient.syncCardRowToFts("payment_sms", rowData, memo = smsText)
            ftsSuccess = ftsRes.success
            if (!prefs.isDestinationGoogleSheet || !prefs.hasGoogleAccount) {
                return@withContext WebhookResult(
                    statusCode = if (ftsSuccess) 200 else 500,
                    success = ftsSuccess,
                    message = ftsRes.message ?: ftsRes.error ?: "파일투시트 기록 완료"
                )
            }
        }

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
                    put("message", smsText)
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

                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", true)) {
                    Log.i(TAG, "✅ [웹훅 전송 성공] 대상: $targetUrl")
                    val replySmsObj = resJson.optJSONObject("replySms")
                    val replyPhone = replySmsObj?.optString("recipientPhone")?.takeIf { it.isNotBlank() }
                    val replyText = replySmsObj?.optString("message")?.takeIf { it.isNotBlank() }
                    val ttsText = resJson.optString("ttsText").takeIf { it.isNotBlank() }
                    val depositorName = resJson.optString("depositorName").takeIf { it.isNotBlank() }
                    val amountKrw = resJson.optLong("amountKrw", 0L)

                    return@withContext WebhookResult(
                        statusCode = response.code,
                        success = true,
                        message = resJson.optString("message", "전송 완료 (HTTP ${response.code})"),
                        replySmsPhone = replyPhone,
                        replySmsText = replyText,
                        ttsText = ttsText,
                        depositorName = depositorName,
                        amountKrw = amountKrw
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
     * - 터널 인바운드 레이트리밋(HTTP 429)은 서버 및 터널이 정상 가동 중임을 의미하므로 온라인으로 판정
     */
    suspend fun pingServer(): PingResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val endpoint = "$host/api/wallet/agent/version"
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
                        return@withContext PingResult(
                            isOnline = true,
                            latencyMs = elapsed,
                            connectedHost = host
                        )
                    }
                    // 동일 터널 레이트리밋(429)이 아닌데 1차 실패한 경우에만 다음 호스트 폴백
                    Log.w(TAG, "서버 핑 비정상 응답 HTTP ${response.code} ($endpoint)")
                }
            } catch (e: Exception) {
                Log.w(TAG, "서버 핑 확인 실패 ($host): ${e.message}")
            }
        }
        PingResult(isOnline = false, error = "서버 및 터널 응답 없음")
    }

    // 웹사이트 헬스체크 전용 클라이언트 (3분 주기 점검 시 유휴 소켓 재사용으로 인한 HTTP 400 오탐 원천 차단)
    private val healthCheckClient = client.newBuilder()
        .connectionPool(okhttp3.ConnectionPool(0, 1, TimeUnit.MILLISECONDS))
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(6, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /**
     * 감시 대상 웹사이트(홈페이지/쇼핑몰) 실시간 헬스체크 (HEAD 또는 GET)
     */
    suspend fun checkWebsiteHealth(targetUrl: String): WebsiteCheckResult = withContext(Dispatchers.IO) {
        val trimmed = targetUrl.trim()
        if (trimmed.isBlank()) {
            return@withContext WebsiteCheckResult(
                isOnline = false,
                statusCode = 0,
                responseTimeMs = 0L,
                errorMessage = "감시 대상 URL이 비어 있습니다."
            )
        }

        var normalizedUrl = trimmed
        if (!normalizedUrl.startsWith("http://", ignoreCase = true) && !normalizedUrl.startsWith("https://", ignoreCase = true)) {
            normalizedUrl = "https://$normalizedUrl"
        }

        val startTime = System.currentTimeMillis()
        try {
            // 1단계: 가벼운 HEAD 요청 시도 (유휴 소켓 재사용 방지 및 리소스 즉시 해제)
            val headRequest = Request.Builder()
                .url(normalizedUrl)
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) SheetBotSentinel/1.0")
                .header("Cache-Control", "no-cache")
                .header("Connection", "close")
                .head()
                .build()

            var statusCode = 0
            var statusMsg = ""
            try {
                healthCheckClient.newCall(headRequest).execute().use { res ->
                    statusCode = res.code
                    statusMsg = res.message
                }
            } catch (_: Exception) {
                statusCode = 0
            }

            // HEAD가 실패하거나 2xx/3xx/429가 아닌 경우(HTTP 400, 403, 404, 405 등 프록시/터널의 HEAD 거부 포함) 즉시 GET으로 재검증
            if (statusCode !in 200..399 && statusCode != 429) {
                val getRequest = Request.Builder()
                    .url(normalizedUrl)
                    .header("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) SheetBotSentinel/1.0")
                    .header("Cache-Control", "no-cache")
                    .header("Connection", "close")
                    .get()
                    .build()
                healthCheckClient.newCall(getRequest).execute().use { res ->
                    statusCode = res.code
                    statusMsg = res.message
                }
            }

            // sheetbot.cloud 도메인 감시 중 일시적 프록시 지연/400 발생 시 공식 핑 엔드포인트로 한 번 더 교차 검증
            if (statusCode !in 200..399 && statusCode != 429 && normalizedUrl.contains("sheetbot.cloud", ignoreCase = true)) {
                val pingRes = pingServer()
                if (pingRes.isOnline) {
                    statusCode = 200
                    statusMsg = "OK"
                }
            }

            val elapsed = System.currentTimeMillis() - startTime
            val isOk = statusCode in 200..399 || statusCode == 429

            WebsiteCheckResult(
                isOnline = isOk,
                statusCode = statusCode,
                responseTimeMs = elapsed,
                errorMessage = if (!isOk) "HTTP $statusCode $statusMsg".trim() else null,
                checkedUrl = normalizedUrl
            )
        } catch (e: Exception) {
            val elapsed = System.currentTimeMillis() - startTime
            val err = e.localizedMessage ?: e.message ?: "연결 시간 초과 또는 네트워크 오류"
            WebsiteCheckResult(
                isOnline = false,
                statusCode = 0,
                responseTimeMs = elapsed,
                errorMessage = err,
                checkedUrl = normalizedUrl
            )
        }
    }

    /**
     * 휴대폰 자체의 외부 인터넷 정상 연결 여부 교차 검증 (False Alarm 오탐 방지)
     * Google generate_204 핑 확인
     */
    suspend fun verifyInternetConnectivity(): Boolean = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("https://www.google.com/generate_204")
                .header("User-Agent", "SheetBotSentinel/1.0")
                .get()
                .build()
            client.newCall(request).execute().use { response ->
                response.isSuccessful || response.code == 204
            }
        } catch (_: Exception) {
            // 보조 검증: 시트봇 서버 핑 시도
            try {
                val ping = pingServer()
                ping.isOnline
            } catch (_: Exception) {
                false
            }
        }
    }

    /**
     * 웹사이트 다운타임 감시 결과 및 장애/복구 이력을 구글 시트에 자동 기록
     */
    suspend fun logWebsiteMonitorStatus(
        userEmail: String,
        targetUrl: String,
        statusCode: Int,
        responseTimeMs: Long,
        statusMessage: String,
        isCrossCheckOk: Boolean = true
    ): Boolean = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        var ftsSuccess = false
        if (prefs?.isDestinationFileToSheet == true) {
            val rowData = JSONObject().apply {
                put("점검일시", nowKstStr())
                put("대상URL", targetUrl)
                put("상태코드", statusCode)
                put("응답시간", "${responseTimeMs}ms")
                put("장애여부", if (statusCode in 200..399) "정상" else "장애감지")
                put("비고", statusMessage)
            }
            val ftsRes = FileToSheetClient.syncCardRowToFts("website_monitor", rowData, memo = statusMessage)
            ftsSuccess = ftsRes.success
            if (!prefs.isDestinationGoogleSheet || !prefs.hasGoogleAccount) {
                return@withContext ftsSuccess
            }
        }

        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val endpoint = "$host/api/user/website-monitor/log"
            try {
                val json = JSONObject().apply {
                    put("userEmail", userEmail)
                    put("targetUrl", targetUrl)
                    put("statusCode", statusCode)
                    put("responseTimeMs", responseTimeMs)
                    put("statusMessage", statusMessage)
                    put("isCrossCheckOk", isCrossCheckOk)
                    put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
                }
                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val request = Request.Builder().url(endpoint).post(body).build()
                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful || response.code == 429) {
                        return@withContext true
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "웹사이트 모니터링 시트 로깅 실패 ($host): ${e.message}")
            }
        }
        false
    }

    /**
     * 백그라운드 생존 신호(Heartbeat) 전송 (1차 실패 시 2차 폴백)
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
                add("$FALLBACK_HOST/api/user/agent2/heartbeat")
            }
        }

        for (targetUrl in targets) {
            try {
                val json = JSONObject().apply {
                    put("userEmail", userEmail)
                    put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
                    put("appVersion", "1.5.0")
                    if (batteryLevel != null) put("batteryLevel", batteryLevel)
                    if (isCharging != null) put("isCharging", isCharging)
                }

                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val request = Request.Builder()
                    .url(targetUrl)
                    .post(body)
                    .build()

                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful || response.code == 429) {
                        return@withContext true
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Heartbeat 실패 ($targetUrl): ${e.message}")
            }
        }
        false
    }

    /**
     * 이용자 스마트폰에 수신된 고객 SMS를 시트봇 서버 대장으로 전송 및 스마트 주문 매칭 응답 파싱
     */
    suspend fun sendInboundSms(
        userEmail: String,
        sender: String,
        message: String,
        deviceId: String? = null
    ): SmsSyncResult = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        var ftsSuccess = false
        if (prefs?.isDestinationFileToSheet == true) {
            val rowData = JSONObject().apply {
                put("일시", nowKstStr())
                put("구분", "수신")
                put("상대방이름", "-")
                put("전화번호", sender)
                put("메시지내용", message)
                put("기기명", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL}")
            }
            val ftsRes = FileToSheetClient.syncCardRowToFts("sms_sync", rowData, memo = message)
            ftsSuccess = ftsRes.success
            if (!prefs.isDestinationGoogleSheet || !prefs.hasGoogleAccount) {
                return@withContext SmsSyncResult(success = ftsSuccess)
            }
        }

        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("sender", sender)
            put("message", message)
            put("deviceId", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/agent2/inbound-sms"
            try {
                val request = Request.Builder().url(endpoint).post(body).build()
                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", true)) {
                    Log.i(TAG, "✅ [고객 문자 수신 동기화 성공] 호스트: $host ($sender)")
                    val replySmsObj = resJson.optJSONObject("replySms")
                    val replyPhone = replySmsObj?.optString("recipientPhone")?.takeIf { it.isNotBlank() }
                    val replyText = replySmsObj?.optString("message")?.takeIf { it.isNotBlank() }
                    val ttsText = resJson.optString("ttsText").takeIf { it.isNotBlank() }
                    val depositorName = resJson.optString("depositorName").takeIf { it.isNotBlank() }
                    val amountKrw = resJson.optLong("amountKrw", 0L)

                    return@withContext SmsSyncResult(
                        success = true,
                        replySmsPhone = replyPhone,
                        replySmsText = replyText,
                        depositorName = depositorName,
                        amountKrw = amountKrw,
                        ttsText = ttsText
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "수신 문자 동기화 실패 ($host): ${e.message}")
            }
        }
        SmsSyncResult(success = false)
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
     * 1순위: GitHub Releases 공식 API 실시간 직접 조회 (릴리즈 즉시 0초 반영)
     * 2순위: SheetBot 서버 /api/user/agent2/version 교차 검증
     */
    suspend fun fetchLatestVersion(): VersionInfo? = withContext(Dispatchers.IO) {
        var bestVersion: VersionInfo? = null

        // 1. GitHub Releases 공식 API 실시간 직접 조회 (가장 정확한 1순위 소스)
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
            val ghJson = try { JSONObject(ghStr) } catch (_: Exception) { JSONObject() }
            val rawTag = ghJson.optString("tag_name", "")
            val cleanVersion = rawTag.replace(Regex("^(user-)?v?", RegexOption.IGNORE_CASE), "").trim()
            val body = ghJson.optString("body", "")
            val assets = ghJson.optJSONArray("assets")
            var downloadUrl = ""
            if (assets != null) {
                for (i in 0 until assets.length()) {
                    val asset = assets.getJSONObject(i)
                    val name = asset.optString("name", "")
                    if (name.contains("sheetbotagent", ignoreCase = true) && name.endsWith(".apk")) {
                        downloadUrl = asset.optString("browser_download_url", "")
                        break
                    }
                }
            }
            if (cleanVersion.isNotBlank()) {
                val calculatedCode = parseVersionToCode(cleanVersion)
                val finalUrl = if (downloadUrl.isNotBlank()) downloadUrl else "https://github.com/Charismagreat/SheetBot/releases/latest/download/SheetBotAgent.apk"
                bestVersion = VersionInfo(
                    latestVersionCode = calculatedCode,
                    latestVersionName = cleanVersion,
                    apkUrl = finalUrl,
                    fallbackApkUrl = "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
                    releaseNotes = body
                )
                Log.i(TAG, "🎉 [GitHub 실시간 최신 버전 확인 성공] v$cleanVersion (URL: $finalUrl)")
            }
        } catch (e: Exception) {
            Log.w(TAG, "GitHub 릴리즈 직접 조회 경고: ${e.message}")
        }

        // 2. 서버 엔드포인트 교차 확인
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val endpoint = "$host/api/user/agent2/version"
            try {
                val request = Request.Builder().url(endpoint).get().build()
                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val sName = resJson.optString("latestVersionName", "1.0.0")
                    val sCode = resJson.optInt("latestVersionCode", 1)
                    val sApk = resJson.optString("apkUrl", "")
                    val sFallback = resJson.optString("fallbackApkUrl", "")
                    val sNotes = resJson.optString("releaseNotes", "")

                    if (bestVersion == null) {
                        bestVersion = VersionInfo(
                            latestVersionCode = sCode,
                            latestVersionName = sName,
                            apkUrl = sApk,
                            fallbackApkUrl = sFallback,
                            releaseNotes = sNotes
                        )
                    }
                    break
                }
            } catch (e: Exception) {
                Log.w(TAG, "서버 버전 확인 실패 ($host): ${e.message}")
            }
        }

        bestVersion
    }

    private fun parseVersionToCode(versionName: String): Int {
        return try {
            val clean = versionName.replace(Regex("^(user-)?v?", RegexOption.IGNORE_CASE), "").trim()
            val parts = clean.split(".")
            val major = parts.getOrNull(0)?.toIntOrNull() ?: 2
            val minor = parts.getOrNull(1)?.toIntOrNull() ?: 1
            val patch = parts.getOrNull(2)?.toIntOrNull() ?: 76
            if (major == 2 && minor == 1) {
                97 + (patch - 76)
            } else {
                major * 10000 + minor * 100 + patch
            }
        } catch (_: Exception) {
            97
        }
    }

    /**
     * 서버의 미발송 영수증 대기열(Outbox Queue) 조회
     */
    suspend fun fetchPendingReceipts(userEmail: String?): List<PendingReceipt> = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val baseEndpoint = "$host/api/wallet/agent/pending-receipts"
            val endpoint = if (!userEmail.isNullOrBlank()) {
                val enc = java.net.URLEncoder.encode(userEmail, "UTF-8")
                "$baseEndpoint?email=$enc"
            } else {
                baseEndpoint
            }
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
                        val itemLogId = item.optString("logId", "")
                        list.add(
                            PendingReceipt(
                                id = item.optLong("id", 0L),
                                logId = if (itemLogId.isNotBlank()) itemLogId else null,
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
    suspend fun markReceiptSent(id: Long, success: Boolean = true, logId: String? = null): Boolean = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val endpoint = "$host/api/wallet/agent/pending-receipts"
            try {
                val json = JSONObject().apply {
                    put("id", id)
                    if (!logId.isNullOrBlank()) {
                        put("logId", logId)
                    }
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
     * 통화 녹음 파일 구글 드라이브 및 [SheetBot] 통화 녹음 대장 시트 자동 업로드
     */
    suspend fun uploadCallRecording(
        file: File,
        fileName: String,
        contactName: String,
        callTime: String,
        userEmail: String,
        folderName: String = "[SheetBot] 통화 녹음",
        autoRecordSheet: Boolean = true,
        channelCount: Int = 2
    ): UploadRecordingResult = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        if (prefs?.isDestinationFileToSheet == true) {
            val ftsRes = FileToSheetClient.syncCardFileToFts(
                cardIdOrType = "call_recording",
                file = file,
                mimeType = "audio/mp4",
                memo = "$contactName ($callTime)",
                ocrType = "CALL_RECORDING",
                customFileName = fileName,
                contactName = contactName,
                callTime = callTime
            )
            if (!prefs.isDestinationGoogleSheet || !prefs.hasGoogleAccount) {
                return@withContext UploadRecordingResult(
                    success = ftsRes.success,
                    fileName = fileName,
                    error = ftsRes.error
                )
            }
        }

        // 1. [1순위] 통화 녹음 전용 청크 분할 업로드 (/api/user/recordings/chunks → 서버 재조립 후 녹음 파이프라인)
        try {
            val chunkResult = ChunkedUploader.uploadCallRecordingChunked(
                file = file,
                fileName = fileName,
                userEmail = userEmail,
                contactName = contactName,
                callTime = callTime,
                folderName = folderName,
                autoRecordSheet = autoRecordSheet,
                channelCount = channelCount
            )
            if (chunkResult.success) {
                Log.i(TAG, "🎉 [통화 녹음 청크 업로드 성공] $fileName (channels=$channelCount) -> $folderName")
                return@withContext UploadRecordingResult(
                    success = true,
                    fileId = chunkResult.fileId,
                    fileName = chunkResult.fileName ?: fileName,
                    webViewLink = chunkResult.webViewLink,
                    spreadsheetUrl = chunkResult.spreadsheetUrl
                )
            } else {
                Log.w(TAG, "통화 녹음 청크 업로드 실패: ${chunkResult.error}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "통화 녹음 청크 업로드 예외: ${e.message}")
        }

        // 2. [2순위 폴백] 기존 단일 Base64 업로드
        //    이지데스크 프록시가 요청 본문을 10MB까지만 보존하므로, base64(약 4/3배 팽창) 후 10MB를 넘는 파일은
        //    잘려서 서버 JSON 파싱이 실패합니다. → 7MB 이하 파일만 폴백 허용
        val maxSingleUploadBytes = 7L * 1024 * 1024
        if (file.length() > maxSingleUploadBytes) {
            return@withContext UploadRecordingResult(
                success = false,
                error = "청크 업로드 실패 (파일 ${file.length() / 1024 / 1024}MB는 단일 업로드 한도 7MB 초과). 네트워크 확인 후 재시도해 주세요."
            )
        }
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val fileBytes = file.readBytes()
        val base64Str = android.util.Base64.encodeToString(fileBytes, android.util.Base64.NO_WRAP)

        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("fileName", fileName)
            put("contactName", contactName)
            put("callTime", callTime)
            put("folderName", folderName)
            put("autoRecordSheet", autoRecordSheet)
            put("channelCount", channelCount)
            put("fileBase64", base64Str)
        }
        val requestBody = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        var lastErr = "구글 드라이브 업로드 실패"
        for (host in hosts) {
            val endpoint = "$host/api/user/recordings/upload"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .post(requestBody)
                    .build()
                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    Log.i(TAG, "🎉 [통화 녹음 업로드 성공] $fileName -> $folderName")
                    return@withContext UploadRecordingResult(
                        success = true,
                        fileId = resJson.optString("fileId").takeIf { it.isNotBlank() },
                        fileName = resJson.optString("fileName", fileName),
                        webViewLink = resJson.optString("webViewLink").takeIf { it.isNotBlank() },
                        spreadsheetUrl = resJson.optString("spreadsheetUrl").takeIf { it.isNotBlank() }
                    )
                } else {
                    val msg = resJson.optString("error", "HTTP ${response.code}")
                    lastErr = "$host: $msg"
                    Log.w(TAG, "통화 녹음 업로드 실패 ($host): $msg")
                }
            } catch (e: Exception) {
                lastErr = "$host: ${e.message}"
                Log.w(TAG, "통화 녹음 업로드 통신 예외 ($host): ${e.message}")
            }
        }
        UploadRecordingResult(success = false, error = lastErr)
    }

    /**
     * 스마트폰 회의 녹음 파일 구글 드라이브 및 [SheetBot] 회의록 대장 자동 업로드
     */
    suspend fun uploadMeetingRecording(
        file: File,
        fileName: String,
        topic: String,
        meetingTime: String,
        userEmail: String,
        folderName: String = "[SheetBot] 회의 녹음"
    ): UploadRecordingResult = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        if (prefs?.isDestinationFileToSheet == true) {
            val ftsRes = FileToSheetClient.syncCardFileToFts(
                cardIdOrType = "meeting_recording",
                file = file,
                mimeType = "audio/mp4",
                memo = "$topic ($meetingTime)",
                ocrType = "MEETING_RECORDING",
                customFileName = fileName,
                contactName = topic,
                callTime = meetingTime
            )
            if (!prefs.isDestinationGoogleSheet || !prefs.hasGoogleAccount) {
                return@withContext UploadRecordingResult(
                    success = ftsRes.success,
                    fileName = fileName,
                    error = ftsRes.error
                )
            }
        }
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val fileBytes = file.readBytes()
        val base64Str = android.util.Base64.encodeToString(fileBytes, android.util.Base64.NO_WRAP)

        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("fileName", fileName)
            put("topic", topic)
            put("meetingTime", meetingTime)
            put("folderName", folderName)
            put("fileBase64", base64Str)
        }
        val requestBody = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        var lastErr = "회의 녹음 구글 드라이브 업로드 실패"
        for (host in hosts) {
            val endpoint = "$host/api/user/meetings/upload"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .post(requestBody)
                    .build()
                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    Log.i(TAG, "🎉 [회의 녹음 업로드 성공] $fileName -> $folderName")
                    return@withContext UploadRecordingResult(
                        success = true,
                        fileId = resJson.optString("fileId").takeIf { it.isNotBlank() },
                        fileName = resJson.optString("fileName", fileName),
                        webViewLink = resJson.optString("webViewLink").takeIf { it.isNotBlank() },
                        spreadsheetUrl = resJson.optString("spreadsheetUrl").takeIf { it.isNotBlank() }
                    )
                } else {
                    val msg = resJson.optString("error", "HTTP ${response.code}")
                    lastErr = "$host: $msg"
                    Log.w(TAG, "회의 녹음 업로드 실패 ($host): $msg")
                }
            } catch (e: Exception) {
                lastErr = "$host: ${e.message}"
                Log.w(TAG, "회의 녹음 업로드 통신 예외 ($host): ${e.message}")
            }
        }
        UploadRecordingResult(success = false, error = lastErr)
    }

    data class CompanyResearchResult(
        val success: Boolean,
        val companyName: String = "",
        val domain: String = "",
        val businessNumber: String = "",
        val docUrl: String = "",
        val sheetUrl: String = "",
        val taxStatus: String = "",
        val employeeCount: String = "",
        val avgSalary: String = "",
        val contractSummary: String = "",
        val grantsSummary: String = "",
        val summary: String = "",
        val error: String? = null
    )

    /**
     * 기업 심층 리서치 및 구글 리서치 보고서 문서화 요청
     */
    suspend fun requestCompanyResearch(
        companyName: String,
        domain: String,
        userEmail: String
    ): CompanyResearchResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("companyName", companyName)
            put("domain", domain)
        }
        val requestBody = json.toString().toRequestBody(JSON_MEDIA_TYPE)
        var lastErr = "기업 리서치 요청 실패"

        for (host in hosts) {
            val endpoint = "$host/api/user/company-research"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .post(requestBody)
                    .build()
                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    return@withContext CompanyResearchResult(
                        success = true,
                        companyName = resJson.optString("companyName", companyName),
                        domain = resJson.optString("domain", domain),
                        businessNumber = resJson.optString("businessNumber", ""),
                        docUrl = resJson.optString("docUrl", ""),
                        sheetUrl = resJson.optString("sheetUrl", ""),
                        taxStatus = resJson.optString("taxStatus", "-"),
                        employeeCount = resJson.optString("employeeCount", "-"),
                        avgSalary = resJson.optString("avgSalary", "-"),
                        contractSummary = resJson.optString("contractSummary", "-"),
                        grantsSummary = resJson.optString("grantsSummary", "-"),
                        summary = resJson.optString("summary", "")
                    )
                } else {
                    val msg = resJson.optString("error", "HTTP ${response.code}")
                    lastErr = "$host: $msg"
                }
            } catch (e: Exception) {
                lastErr = "$host: ${e.message}"
            }
        }
        CompanyResearchResult(success = false, error = lastErr)
    }

    /**
     * AI 법률·계약 자문, 독소 조항 분석 및 심층 보고서 요청 (사진/파일 첨부 지원)
     */
    suspend fun requestLawAdvisory(
        query: String,
        userEmail: String,
        file: File? = null,
        fileName: String? = null,
        mimeType: String = "image/jpeg"
    ): LawAdvisoryResult = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        val isFts = prefs?.isDestinationFileToSheet == true
        val isGoogle = prefs?.isDestinationGoogleSheet == true && prefs.hasGoogleAccount
        val effectiveFileName = fileName?.takeIf { it.isNotBlank() } ?: file?.name ?: "법률자문질의"

        // 1. 시트봇 서버(/api/user/law-advisory) 법제처 법령 & 대법원 판례 분석 시도
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastErr = "법률 자문 요청 실패"
        var serverResult: LawAdvisoryResult? = null

        for (host in hosts) {
            val endpoint = "$host/api/user/law-advisory"
            try {
                val request = if (file != null && file.exists()) {
                    val actualMime = mimeType.toMediaTypeOrNull() ?: "application/octet-stream".toMediaTypeOrNull()!!
                    val fileBody = file.asRequestBody(actualMime)
                    val multipartBody = MultipartBody.Builder()
                        .setType(MultipartBody.FORM)
                        .addFormDataPart("userEmail", userEmail)
                        .addFormDataPart("query", query)
                        .addFormDataPart("file", effectiveFileName, fileBody)
                        .build()

                    Request.Builder()
                        .url(endpoint)
                        .post(multipartBody)
                        .build()
                } else {
                    val json = JSONObject().apply {
                        put("userEmail", userEmail)
                        put("query", query)
                    }
                    Request.Builder()
                        .url(endpoint)
                        .post(json.toString().toRequestBody(JSON_MEDIA_TYPE))
                        .build()
                }

                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    serverResult = LawAdvisoryResult(
                        success = true,
                        advisoryId = resJson.optString("advisoryId", ""),
                        executiveSummary = resJson.optString("executiveSummary", ""),
                        lawTitle = resJson.optString("lawTitle", ""),
                        lawLink = resJson.optString("lawLink", ""),
                        caseNumber = resJson.optString("caseNumber", ""),
                        rulingSummary = resJson.optString("rulingSummary", ""),
                        reportUrl = resJson.optString("reportUrl", ""),
                        sheetUrl = resJson.optString("sheetUrl", ""),
                        fileDriveUrl = resJson.optString("fileDriveUrl", ""),
                        documentSummary = resJson.optString("documentSummary", "")
                    )
                    break
                } else {
                    val msg = resJson.optString("error", "HTTP ${response.code}")
                    lastErr = "$host: $msg"
                }
            } catch (e: Exception) {
                lastErr = "$host: ${e.message}"
            }
        }

        // 2. 파일투시트(FileToSheet) 연동 시 원본 서류 파일 및 법률 검토 결과 동시 업로드
        if (isFts) {
            val prebuiltRow = serverResult?.let { sr ->
                JSONObject().apply {
                    put("검토일시", nowKstStr())
                    put("문서/질의제목", query.ifBlank { effectiveFileName })
                    put("법률검토요약", sr.executiveSummary.ifBlank { sr.documentSummary })
                    put("리스크수준", if (sr.lawTitle.isNotBlank()) "법령: ${sr.lawTitle}" else "주의 🟡")
                    put("권고사항", sr.rulingSummary.ifBlank { "판례: ${sr.caseNumber}" })
                }
            }

            val ftsRes = if (file != null && file.exists()) {
                FileToSheetClient.syncCardFileToFts(
                    cardIdOrType = "law_advisory",
                    file = file,
                    mimeType = mimeType,
                    memo = query.ifBlank { effectiveFileName },
                    ocrType = "LAW_ADVISORY",
                    customFileName = effectiveFileName,
                    rowData = prebuiltRow
                )
            } else {
                val fallbackRow = prebuiltRow ?: JSONObject().apply {
                    put("검토일시", nowKstStr())
                    put("문서/질의제목", query)
                    put("법률검토요약", query)
                    put("리스크수준", "검토요청")
                    put("권고사항", "모바일 법률 질의 접수")
                }
                FileToSheetClient.syncCardRowToFts(
                    cardIdOrType = "law_advisory",
                    rowData = fallbackRow,
                    memo = query
                )
            }

            if (serverResult != null) {
                return@withContext serverResult
            }
            if (ftsRes.success) {
                val dataObj = ftsRes.data
                val summaryStr = dataObj?.optString("법률검토요약")?.takeIf { it.isNotBlank() }
                    ?: "첨부 서류 및 법률 질의가 파일투시트 [법률계약검토대장]에 적재되었습니다."
                val riskStr = dataObj?.optString("리스크수준")?.takeIf { it.isNotBlank() } ?: "AI 계약 검토"
                val recStr = dataObj?.optString("권고사항")?.takeIf { it.isNotBlank() } ?: "파일투시트 시트 참조"
                return@withContext LawAdvisoryResult(
                    success = true,
                    executiveSummary = "$summaryStr\n\n[권고사항] $recStr",
                    lawTitle = riskStr,
                    caseNumber = effectiveFileName,
                    rulingSummary = recStr
                )
            } else if (!isGoogle) {
                return@withContext LawAdvisoryResult(
                    success = false,
                    error = ftsRes.error ?: lastErr
                )
            }
        }

        serverResult ?: LawAdvisoryResult(success = false, error = lastErr)
    }

    /**
     * ✍️ AI 네이버 블로그 자동 포스팅 및 원고 집필 요청 (사진 복수 첨부 + 벤치마킹 URL 3개 스크래핑 분석)
     */
    suspend fun requestBlogAutomation(
        topic: String,
        keywords: String,
        refUrl1: String = "",
        refUrl2: String = "",
        refUrl3: String = "",
        naverBlogId: String = "",
        files: List<File> = emptyList(),
        userEmail: String
    ): BlogPostResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastErr = "블로그 포스팅 원고 작성 요청 실패"

        for (host in hosts) {
            val endpoint = "$host/api/user/blog/post"
            try {
                val multipartBuilder = MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart("userEmail", userEmail)
                    .addFormDataPart("topic", topic)
                    .addFormDataPart("keywords", keywords)
                    .addFormDataPart("refUrl1", refUrl1)
                    .addFormDataPart("refUrl2", refUrl2)
                    .addFormDataPart("refUrl3", refUrl3)
                    .addFormDataPart("naverBlogId", naverBlogId)

                for (f in files) {
                    if (f.exists()) {
                        val fileBody = f.asRequestBody("image/jpeg".toMediaTypeOrNull())
                        multipartBuilder.addFormDataPart("files", f.name, fileBody)
                    }
                }

                val request = Request.Builder()
                    .url(endpoint)
                    .post(multipartBuilder.build())
                    .build()

                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val tagsArray = resJson.optJSONArray("tags")
                    val tagsList = mutableListOf<String>()
                    if (tagsArray != null) {
                        for (i in 0 until tagsArray.length()) {
                            tagsList.add(tagsArray.optString(i))
                        }
                    }

                    return@withContext BlogPostResult(
                        success = true,
                        blogId = resJson.optString("blogId", ""),
                        title = resJson.optString("title", ""),
                        summary = resJson.optString("summary", ""),
                        charCount = resJson.optInt("charCount", 0),
                        imageCount = resJson.optInt("imageCount", 0),
                        reportUrl = resJson.optString("reportUrl", ""),
                        sheetUrl = resJson.optString("sheetUrl", ""),
                        naverPostUrl = resJson.optString("naverPostUrl", ""),
                        naverBlogId = resJson.optString("naverBlogId", naverBlogId),
                        naverBlogUrl = resJson.optString("naverBlogUrl", ""),
                        naverWriteUrl = resJson.optString("naverWriteUrl", ""),
                        driveFolderUrl = resJson.optString("driveFolderUrl", ""),
                        tags = tagsList
                    )
                } else {
                    val msg = resJson.optString("error", "HTTP ${response.code}")
                    lastErr = "$host: $msg"
                }
            } catch (e: Exception) {
                lastErr = "$host: ${e.message}"
            }
        }
        BlogPostResult(success = false, error = lastErr)
    }

    /**
     * 📸 AI 인스타그램 피드 캡션 및 해시태그 생성 요청 (사진 복수 첨부 + 벤치마킹 링크 분석)
     */
    suspend fun requestInstagramAutomation(
        topic: String,
        keywords: String,
        tone: String = "감성 & 친근한 후기",
        refUrl1: String = "",
        refUrl2: String = "",
        refUrl3: String = "",
        instagramId: String = "",
        files: List<File> = emptyList(),
        userEmail: String
    ): InstagramPostResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastErr = "인스타그램 콘텐츠 생성 요청 실패"

        for (host in hosts) {
            val endpoint = "$host/api/user/instagram/post"
            try {
                val multipartBuilder = MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart("userEmail", userEmail)
                    .addFormDataPart("topic", topic)
                    .addFormDataPart("keywords", keywords)
                    .addFormDataPart("tone", tone)
                    .addFormDataPart("refUrl1", refUrl1)
                    .addFormDataPart("refUrl2", refUrl2)
                    .addFormDataPart("refUrl3", refUrl3)
                    .addFormDataPart("instagramId", instagramId)

                for (f in files) {
                    if (f.exists()) {
                        val fileBody = f.asRequestBody("image/jpeg".toMediaTypeOrNull())
                        multipartBuilder.addFormDataPart("files", f.name, fileBody)
                    }
                }

                val request = Request.Builder()
                    .url(endpoint)
                    .post(multipartBuilder.build())
                    .build()

                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    return@withContext InstagramPostResult(
                        success = true,
                        instagramId = resJson.optString("instagramId", ""),
                        hook = resJson.optString("hook", ""),
                        caption = resJson.optString("caption", ""),
                        hashtags = resJson.optString("hashtags", ""),
                        summary = resJson.optString("summary", ""),
                        imageCount = resJson.optInt("imageCount", 0),
                        reportUrl = resJson.optString("reportUrl", ""),
                        sheetUrl = resJson.optString("sheetUrl", ""),
                        instagramPostUrl = resJson.optString("instagramPostUrl", ""),
                        instagramHandle = resJson.optString("instagramHandle", instagramId),
                        instagramAccountUrl = resJson.optString("instagramAccountUrl", ""),
                        driveFolderUrl = resJson.optString("driveFolderUrl", "")
                    )
                } else {
                    val msg = resJson.optString("error", "HTTP ${response.code}")
                    lastErr = "$host: $msg"
                }
            } catch (e: Exception) {
                lastErr = "$host: ${e.message}"
            }
        }
        InstagramPostResult(success = false, error = lastErr)
    }

    /**
     * 🌐 AI 모바일 홈페이지 생성 요청 (사진 복수 첨부 + AI 맞춤 카피/메뉴 구성)
     */
    suspend fun requestCreateMobileSite(
        title: String,
        category: String = "카페 / 베이커리",
        description: String = "",
        phone: String = "",
        address: String = "",
        businessHours: String = "매일 10:00 ~ 22:00",
        notice: String = "",
        themeColor: String = "emerald",
        files: List<File> = emptyList(),
        userEmail: String
    ): MobileSiteResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastErr = "모바일 홈페이지 생성 요청 실패"

        for (host in hosts) {
            val endpoint = "$host/api/user/site"
            try {
                val multipartBuilder = MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart("userEmail", userEmail)
                    .addFormDataPart("title", title)
                    .addFormDataPart("category", category)
                    .addFormDataPart("description", description)
                    .addFormDataPart("phone", phone)
                    .addFormDataPart("address", address)
                    .addFormDataPart("businessHours", businessHours)
                    .addFormDataPart("notice", notice)
                    .addFormDataPart("themeColor", themeColor)

                for (f in files) {
                    if (f.exists()) {
                        val fileBody = f.asRequestBody("image/jpeg".toMediaTypeOrNull())
                        multipartBuilder.addFormDataPart("files", f.name, fileBody)
                    }
                }

                val request = Request.Builder()
                    .url(endpoint)
                    .post(multipartBuilder.build())
                    .build()

                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    return@withContext MobileSiteResult(
                        success = true,
                        siteId = resJson.optString("siteId", ""),
                        title = resJson.optString("title", ""),
                        slogan = resJson.optString("slogan", ""),
                        description = resJson.optString("description", ""),
                        category = resJson.optString("category", ""),
                        siteUrl = resJson.optString("siteUrl", ""),
                        sheetUrl = resJson.optString("sheetUrl", ""),
                        notice = resJson.optString("notice", ""),
                        bannerCount = resJson.optInt("bannerCount", 0),
                        driveFolderUrl = resJson.optString("driveFolderUrl", "")
                    )
                } else {
                    val msg = resJson.optString("error", "HTTP ${response.code}")
                    lastErr = "$host: $msg"
                }
            } catch (e: Exception) {
                lastErr = "$host: ${e.message}"
            }
        }
        MobileSiteResult(success = false, error = lastErr)
    }

    /**
     * 🌐 AI 모바일 홈페이지 정보 실시간 수정 (공지, 영업시간, 연락처 등)
     */
    suspend fun requestUpdateMobileSite(
        siteId: String,
        notice: String? = null,
        businessHours: String? = null,
        phone: String? = null,
        address: String? = null,
        slogan: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("siteId", siteId)
            notice?.let { put("notice", it) }
            businessHours?.let { put("businessHours", it) }
            phone?.let { put("phone", it) }
            address?.let { put("address", it) }
            slogan?.let { put("slogan", it) }
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/site"
            try {
                val request = Request.Builder().url(endpoint).put(body).build()
                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    return@withContext true
                }
            } catch (e: Exception) {
                Log.w(TAG, "홈페이지 수정 실패 ($host): ${e.message}")
            }
        }
        false
    }

    /**
     * 사진 및 일반 파일 구글 드라이브 및 [SheetBot] 파일 업로드 대장 시트 업로드 (AI OCR 지원)
     */
    suspend fun uploadGenericFile(
        file: File,
        fileName: String,
        mimeType: String,
        userEmail: String,
        folderName: String = "[SheetBot] 파일 보관함",
        memo: String = "스마트폰 시트봇 에이전트 업로드",
        autoRecordSheet: Boolean = true,
        ocrType: String? = null
    ): UploadGenericFileResult = withContext(Dispatchers.IO) {
        // 1. [1순위] 터널 안심 청크 분할 업로드 (ChunkedUploader)
        try {
            val chunkResult = ChunkedUploader.uploadFileChunked(
                file = file,
                fileName = fileName,
                mimeType = mimeType,
                userEmail = userEmail,
                folderName = folderName,
                memo = memo,
                autoRecordSheet = autoRecordSheet,
                ocrType = ocrType
            )
            if (chunkResult.success) {
                Log.i(TAG, "🎉 [파일 청크 업로드 성공] $fileName -> $folderName (ocr: $ocrType)")
                val jobId = chunkResult.jobId
                val status = chunkResult.status

                if (ocrType.equals("BUSINESS_CARD", ignoreCase = true) && status == "PROCESSING" && jobId != null) {
                    Log.i(TAG, "⏳ [명함 비동기 수거 시작] jobId: $jobId -> 타임아웃 없는 안전 폴링 개시")
                    return@withContext pollBusinessCardStatus(jobId, fileName, folderName)
                }

                return@withContext UploadGenericFileResult(
                    success = true,
                    fileId = chunkResult.fileId,
                    fileName = chunkResult.fileName ?: fileName,
                    folderName = chunkResult.folderName ?: folderName,
                    webViewLink = chunkResult.webViewLink,
                    spreadsheetUrl = chunkResult.spreadsheetUrl,
                    message = chunkResult.message ?: "업로드 완료",
                    ocrType = chunkResult.ocrType ?: ocrType,
                    ocrData = chunkResult.ocrData,
                    jobId = jobId,
                    status = status
                )
            } else {
                Log.w(TAG, "파일 청크 업로드 실패, 기존 단일 업로드로 폴백: ${chunkResult.error}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "파일 청크 업로드 예외, 단일 업로드 폴백: ${e.message}")
        }

        // 2. [2순위 폴백] 기존 단일 Base64 업로드
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val fileBytes = file.readBytes()
        val base64Str = android.util.Base64.encodeToString(fileBytes, android.util.Base64.NO_WRAP)

        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("fileName", fileName)
            put("folderName", folderName)
            put("memo", memo)
            put("autoRecordSheet", autoRecordSheet)
            put("deviceId", "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
            put("fileBase64", base64Str)
            put("mimeType", mimeType)
            if (!ocrType.isNullOrBlank()) {
                put("ocrType", ocrType)
            }
        }
        val requestBody = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        var lastError = "구글 드라이브 파일 업로드에 실패했습니다."

        for (host in hosts) {
            val endpoint = "$host/api/user/files/upload"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .header("Connection", "close")
                    .post(requestBody)
                    .build()
                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    Log.i(TAG, "🎉 [파일 업로드 성공] $fileName -> $folderName (ocr: $ocrType)")
                    val jobId = resJson.optString("jobId").takeIf { it.isNotBlank() }
                    val status = resJson.optString("status")

                    // 만약 명함이고 백그라운드 분석 중(PROCESSING)이면 비동기 폴링으로 안전 수거 (Zero-Timeout)
                    if (ocrType.equals("BUSINESS_CARD", ignoreCase = true) && status == "PROCESSING" && jobId != null) {
                        Log.i(TAG, "⏳ [명함 비동기 수거 시작] jobId: $jobId -> 타임아웃 없는 안전 폴링 개시")
                        return@withContext pollBusinessCardStatus(jobId, fileName, folderName)
                    }

                    return@withContext UploadGenericFileResult(
                        success = true,
                        fileId = resJson.optString("fileId").takeIf { it.isNotBlank() },
                        fileName = resJson.optString("fileName", fileName),
                        folderName = resJson.optString("folderName", folderName),
                        webViewLink = resJson.optString("webViewLink").takeIf { it.isNotBlank() },
                        spreadsheetUrl = resJson.optString("spreadsheetUrl").takeIf { it.isNotBlank() },
                        message = resJson.optString("message", "업로드 완료"),
                        ocrType = resJson.optString("ocrType").takeIf { it.isNotBlank() } ?: ocrType,
                        ocrData = resJson.optJSONObject("ocrData"),
                        jobId = jobId,
                        status = status
                    )
                } else {
                    val msg = resJson.optString("error", "HTTP ${response.code}")
                    lastError = msg
                    Log.w(TAG, "파일 업로드 실패 ($host): $msg")
                }
            } catch (e: Exception) {
                lastError = e.message ?: "통신 오류"
                Log.w(TAG, "파일 업로드 통신 예외 ($host): ${e.message}")
                // 만약 SocketTimeoutException 등 서버 처리 중 발생한 소켓 타임아웃이라면,
                // 이미 서버에 데이터가 도달하여 백그라운드에서 처리 중일 가능성이 높으므로
                // 중복 업로드를 방지하기 위해 2차 호스트로 동일 파일 재전송을 중단합니다.
                if (e is java.net.SocketTimeoutException) {
                    Log.w(TAG, "⏳ 소켓 타임아웃 감지 -> 중복 업로드 방지를 위해 추가 호스트 재전송 중단")
                    break
                }
            }
        }
        UploadGenericFileResult(success = false, error = lastError)
    }

    /**
     * 명함 AI OCR 비동기 작업 수거 (Zero-Timeout 아키텍처)
     * 1.5초 간격으로 가볍게 확인하여 타임아웃 없이 100% 안전하게 결과를 회수합니다.
     */
    suspend fun pollBusinessCardStatus(
        jobId: String,
        fallbackFileName: String = "명함",
        fallbackFolderName: String = "[SheetBot] 명함 보관함"
    ): UploadGenericFileResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val maxAttempts = 60 // 1.5초 * 60회 = 최대 90초 대기 (일시적 구글 지연 시에도 타임아웃 오류 방지)

        for (attempt in 1..maxAttempts) {
            kotlinx.coroutines.delay(1500)

            for (host in hosts) {
                val endpoint = "$host/api/user/files/card-status?jobId=$jobId"
                try {
                    val request = Request.Builder().url(endpoint).get().build()
                    val response = client.newCall(request).execute()
                    val resStr = response.body?.string() ?: ""
                    val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                    if (response.isSuccessful && resJson.optBoolean("success", false)) {
                        val status = resJson.optString("status")
                        if (status == "COMPLETED") {
                            Log.i(TAG, "🎉 [명함 AI 분석 수거 완료] attempt: $attempt, jobId: $jobId")
                            return@withContext UploadGenericFileResult(
                                success = true,
                                fileName = resJson.optString("fileName", fallbackFileName),
                                folderName = resJson.optString("folderName", fallbackFolderName),
                                spreadsheetUrl = resJson.optString("spreadsheetUrl").takeIf { it.isNotBlank() },
                                message = resJson.optString("message", "명함 분석 완료"),
                                ocrType = "BUSINESS_CARD",
                                ocrData = resJson.optJSONObject("ocrData"),
                                jobId = jobId,
                                status = "COMPLETED"
                            )
                        } else if (status == "FAILED") {
                            val err = resJson.optString("error", "명함 분석 실패")
                            Log.w(TAG, "명함 분석 실패 판정: $err")
                            return@withContext UploadGenericFileResult(
                                success = false,
                                error = err,
                                jobId = jobId,
                                status = "FAILED"
                            )
                        }
                        // 아직 PROCESSING 중이면 다음 시도로 계속
                        break
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "명함 상태 폴링 통신 예외 ($host): ${e.message}")
                }
            }
        }

        UploadGenericFileResult(
            success = false,
            error = "AI 분석 대기 시간이 초과되었습니다.",
            jobId = jobId,
            status = "TIMEOUT"
        )
    }

    /**
     * 웹 링크 및 유튜브 영상 구글 시트 자동 스크랩 및 AI 요약
     */
    suspend fun bookmarkLink(
        userEmail: String,
        url: String,
        rawText: String? = null,
        memo: String = "스마트폰 공유하기(Share) 스크랩",
        deviceId: String? = null
    ): BookmarkResult = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        if (prefs?.isDestinationFileToSheet == true) {
            val categoryLabel = if (url.contains("youtube.com") || url.contains("youtu.be")) "🎬 유튜브" else "🌐 웹사이트"
            val rowData = JSONObject().apply {
                put("등록일시", nowKstStr())
                put("구분", categoryLabel)
                put("제목", rawText?.takeIf { it.isNotBlank() } ?: url)
                put("URL", url)
                put("출처", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL}")
                put("AI요약", rawText ?: "")
                put("메모", memo)
            }
            val ftsRes = FileToSheetClient.syncCardRowToFts("link_scrap", rowData, memo = memo)
            if (!prefs.isDestinationGoogleSheet || !prefs.hasGoogleAccount) {
                return@withContext BookmarkResult(
                    success = ftsRes.success,
                    category = categoryLabel,
                    title = rawText?.takeIf { it.isNotBlank() } ?: url,
                    url = url,
                    message = ftsRes.message ?: "파일투시트 스크랩 완료",
                    error = ftsRes.error
                )
            }
        }

        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("url", url)
            put("rawText", rawText ?: "")
            put("memo", memo)
            put("deviceId", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/links/bookmark"
            try {
                val request = Request.Builder().url(endpoint).post(body).build()
                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    Log.i(TAG, "🎉 [링크 스크랩 성공] $url (${resJson.optString("title")})")
                    return@withContext BookmarkResult(
                        success = true,
                        category = resJson.optString("category", "🌐 웹사이트"),
                        title = resJson.optString("title", url),
                        url = resJson.optString("url", url),
                        siteName = resJson.optString("siteName"),
                        aiSummary = resJson.optString("aiSummary"),
                        spreadsheetUrl = resJson.optString("spreadsheetUrl").takeIf { it.isNotBlank() },
                        message = resJson.optString("message", "스크랩 완료")
                    )
                } else {
                    val msg = resJson.optString("error", "HTTP ${response.code}")
                    Log.w(TAG, "링크 스크랩 실패 ($host): $msg")
                }
            } catch (e: Exception) {
                Log.w(TAG, "링크 스크랩 통신 예외 ($host): ${e.message}")
            }
        }
        BookmarkResult(success = false, error = "링크 스크랩 처리에 실패했습니다.")
    }

    /**
     * 스마트폰 자연어(음성/텍스트) 명령으로 파투(FileToSheet) 시트 및 구글 시트 제어/질의/문자발송 구동 (v2.4.34)
     */
    suspend fun executeAiCommand(
        userEmail: String,
        command: String,
        spreadsheetId: String? = null,
        deviceId: String? = null,
        phoneNumber: String? = null,
        projectId: String? = null,
        token: String? = null
    ): AiCommandResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val cleanPhone = phoneNumber?.replace(Regex("[^0-9]"), "") ?: ""
        val json = JSONObject().apply {
            if (userEmail.isNotBlank()) put("userEmail", userEmail)
            if (cleanPhone.isNotBlank()) put("phoneNumber", cleanPhone)
            if (!projectId.isNullOrBlank()) put("projectId", projectId)
            if (!token.isNullOrBlank()) put("token", token)
            put("command", command)
            if (!spreadsheetId.isNullOrBlank()) put("spreadsheetId", spreadsheetId)
            put("deviceId", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/commands/execute"
            try {
                val reqBuilder = Request.Builder().url(endpoint).post(body)
                if (userEmail.isNotBlank()) reqBuilder.addHeader("x-sheetbot-user-email", userEmail)
                if (cleanPhone.isNotBlank()) reqBuilder.addHeader("x-user-phone", cleanPhone)
                if (!projectId.isNullOrBlank()) reqBuilder.addHeader("x-fts-project-id", projectId)
                val request = reqBuilder.build()
                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    Log.i(TAG, "🎉 [자연어 명령 실행 성공] $command")
                    val detailsObj = resJson.optJSONObject("details")
                    val canPromote = resJson.optBoolean("canPromote", detailsObj?.optBoolean("canPromote", false) ?: false)
                    val suggestedTitle = resJson.optString("suggestedFunctionTitle", detailsObj?.optString("suggestedFunctionTitle", "") ?: "")
                    val targetSheetId = resJson.optString("spreadsheetId", detailsObj?.optString("spreadsheetId", "") ?: "")

                    val matchedRowsArr = resJson.optJSONArray("matchedRows")
                        ?: detailsObj?.optJSONObject("result")?.optJSONArray("matchedRows")
                        ?: detailsObj?.optJSONArray("matchedRows")
                    val parsedMatchedRows = mutableListOf<FtsSearchMatchedRow>()
                    if (matchedRowsArr != null) {
                        for (i in 0 until matchedRowsArr.length()) {
                            val mObj = matchedRowsArr.optJSONObject(i) ?: continue
                            val fieldsArr = mObj.optJSONArray("matchedFields")
                            val fieldsList = mutableListOf<Pair<String, String>>()
                            if (fieldsArr != null) {
                                for (fIdx in 0 until fieldsArr.length()) {
                                    val fObj = fieldsArr.optJSONObject(fIdx) ?: continue
                                    val fk = fObj.optString("key", "").trim()
                                    val fv = fObj.optString("value", "").trim()
                                    if (fk.isNotEmpty() && fv.isNotEmpty()) {
                                        fieldsList.add(fk to fv)
                                    }
                                }
                            }
                            val headersArr = mObj.optJSONArray("headers")
                            val headersList = mutableListOf<String>()
                            if (headersArr != null) {
                                for (hIdx in 0 until headersArr.length()) {
                                    val h = headersArr.optString(hIdx, "").trim()
                                    if (h.isNotEmpty()) headersList.add(h)
                                }
                            }
                            parsedMatchedRows.add(
                                FtsSearchMatchedRow(
                                    projectId = mObj.optString("projectId", ""),
                                    projectName = mObj.optString("projectName", "시트봇 연동 장부"),
                                    sheetName = mObj.optString("sheetName", ""),
                                    rowNumber = mObj.optInt("rowNumber", 1),
                                    rawRowIndex = mObj.optInt("rawRowIndex", 0),
                                    serialNumber = mObj.optString("serialNumber", ""),
                                    approvalStatus = mObj.optString("approvalStatus", "PENDING"),
                                    primaryTitle = mObj.optString("primaryTitle", ""),
                                    primarySubtitle = mObj.optString("primarySubtitle", ""),
                                    timestampText = mObj.optString("timestampText", ""),
                                    amountText = mObj.optString("amountText", ""),
                                    phoneNumber = mObj.optString("phoneNumber", ""),
                                    audioFileName = mObj.optString("audioFileName", ""),
                                    matchedFields = fieldsList,
                                    rowJson = mObj.optJSONObject("rowJson") ?: JSONObject(),
                                    headers = headersList
                                )
                            )
                        }
                    }

                    val kwArr = resJson.optJSONArray("queryKeywords") ?: detailsObj?.optJSONArray("queryKeywords")
                    val kwList = mutableListOf<String>()
                    if (kwArr != null) {
                        for (i in 0 until kwArr.length()) {
                            val k = kwArr.optString(i, "").trim()
                            if (k.isNotEmpty()) kwList.add(k)
                        }
                    }

                    return@withContext AiCommandResult(
                        success = true,
                        command = resJson.optString("command", command),
                        actionType = resJson.optString("actionType", "GENERAL_ASSIST"),
                        explanation = resJson.optString("explanation", "명령이 처리되었습니다."),
                        spokenResult = resJson.optString("spokenResult", "요청하신 시트 명령이 완료되었습니다."),
                        canPromote = canPromote,
                        suggestedFunctionTitle = suggestedTitle.takeIf { it.isNotBlank() },
                        spreadsheetId = targetSheetId.takeIf { it.isNotBlank() },
                        matchedProjectsCount = resJson.optInt("matchedProjectsCount", detailsObj?.optInt("matchedProjectsCount", 0) ?: 0),
                        matchedSheetsCount = resJson.optInt("matchedSheetsCount", detailsObj?.optInt("matchedSheetsCount", 0) ?: 0),
                        totalMatchedCount = resJson.optInt("totalMatchedCount", detailsObj?.optInt("totalMatchedCount", parsedMatchedRows.size) ?: parsedMatchedRows.size),
                        queryKeywords = kwList,
                        matchedRows = parsedMatchedRows,
                        details = detailsObj
                    )
                } else {
                    val msg = resJson.optString("error", "HTTP ${response.code}")
                    Log.w(TAG, "자연어 명령 실행 실패 ($host): $msg")
                }
            } catch (e: Exception) {
                Log.w(TAG, "자연어 명령 실행 통신 예외 ($host): ${e.message}")
            }
        }
        AiCommandResult(success = false, error = "자연어 시트 명령 실행에 실패했습니다.")
    }

    /**
     * 선체험 1회성 작업을 구글 시트 상단 메뉴 및 Apps Script 영구 함수로 승격(Promote) (v2.2.7)
     */
    suspend fun promoteCommandToScript(
        userEmail: String,
        command: String,
        spreadsheetId: String? = null,
        functionTitle: String? = null
    ): CommandPromoteResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("command", command)
            if (!spreadsheetId.isNullOrBlank()) put("spreadsheetId", spreadsheetId)
            if (!functionTitle.isNullOrBlank()) put("functionTitle", functionTitle)
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/commands/promote"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .post(body)
                    .build()

                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    Log.i(TAG, "🎉 [영구 스크립트 승격 성공] ${resJson.optString("functionTitle")}")
                    return@withContext CommandPromoteResult(
                        success = true,
                        functionName = resJson.optString("functionName"),
                        functionTitle = resJson.optString("functionTitle"),
                        message = resJson.optString("message", "구글 시트 메뉴에 영구 등록되었습니다!"),
                        spokenResult = resJson.optString("spokenResult")
                    )
                } else {
                    val msg = resJson.optString("error", "HTTP ${response.code}")
                    Log.w(TAG, "영구 스크립트 승격 실패 ($host): $msg")
                }
            } catch (e: Exception) {
                Log.w(TAG, "영구 스크립트 승격 통신 예외 ($host): ${e.message}")
            }
        }
        CommandPromoteResult(success = false, error = "영구 스크립트 등록에 실패했습니다.")
    }

    /**
     * 연동 대장 및 스크립트 기반 실행 가능 추천 명령(Capabilities) 조회 (v2.2.6)
     */
    suspend fun fetchCommandCapabilities(userEmail: String): CommandCapabilitiesResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val encodedEmail = java.net.URLEncoder.encode(userEmail, "UTF-8")

        for (host in hosts) {
            val endpoint = "$host/api/user/commands/capabilities?userEmail=$encodedEmail"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .get()
                    .build()

                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val rawSuggestions = resJson.optJSONArray("suggestions") ?: JSONArray()
                    val suggestionsList = mutableListOf<CommandSuggestionItem>()

                    for (i in 0 until rawSuggestions.length()) {
                        val sObj = rawSuggestions.optJSONObject(i) ?: continue
                        suggestionsList.add(
                            CommandSuggestionItem(
                                id = sObj.optString("id", "s_$i"),
                                type = sObj.optString("type", "SHEET_QUERY"),
                                label = sObj.optString("label", ""),
                                command = sObj.optString("command", ""),
                                description = sObj.optString("description", ""),
                                functionName = sObj.optString("functionName").takeIf { it.isNotBlank() },
                                projectName = sObj.optString("projectName").takeIf { it.isNotBlank() }
                            )
                        )
                    }

                    return@withContext CommandCapabilitiesResult(
                        success = true,
                        suggestions = suggestionsList,
                        totalProjects = resJson.optInt("totalProjects", 0)
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "추천 명령 조회 통신 예외 ($host): ${e.message}")
            }
        }
        CommandCapabilitiesResult(success = false, error = "추천 명령 목록 조회 실패")
    }

    /**
     * 문자(SMS/LMS) 송수신 내역 구글 시트 실시간 자동 기록
     */
    suspend fun sendSmsSync(
        userEmail: String,
        direction: String, // "INBOUND" 또는 "OUTBOUND"
        phoneNumber: String,
        contactName: String?,
        message: String,
        deviceId: String? = null,
        sheetTitle: String = "[SheetBot] 스마트폰 문자(SMS) 송수신 대장"
    ): SmsSyncResult = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        var ftsSuccess = false
        if (prefs?.isDestinationFileToSheet == true) {
            val dirLabel = if (direction.equals("OUTBOUND", ignoreCase = true)) "발신" else "수신"
            val rowData = JSONObject().apply {
                put("일시", nowKstStr())
                put("구분", dirLabel)
                put("상대방이름", contactName?.takeIf { it.isNotBlank() } ?: "미등록 연락처")
                put("전화번호", phoneNumber)
                put("메시지내용", message)
                put("기기명", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL}")
            }
            val ftsRes = FileToSheetClient.syncCardRowToFts("sms_sync", rowData, memo = message)
            ftsSuccess = ftsRes.success
            if (ftsSuccess) {
                Log.i(TAG, "✅ [FTS 문자($dirLabel) 대장 기록 성공] 상대방: $phoneNumber")
            }
            if (!prefs.isDestinationGoogleSheet || !prefs.hasGoogleAccount) {
                return@withContext SmsSyncResult(success = ftsSuccess)
            }
        }

        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("direction", direction)
            put("phoneNumber", phoneNumber)
            put("contactName", contactName ?: "")
            put("message", message)
            put("deviceId", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
            put("sheetTitle", sheetTitle)
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/messages/sms"
            try {
                val request = Request.Builder().url(endpoint).post(body).build()
                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", true)) {
                    Log.i(TAG, "✅ [문자($direction) 시트 동기화 성공] 상대방: $phoneNumber, 호스트: $host")
                    val replySmsObj = resJson.optJSONObject("replySms")
                    val replyPhone = replySmsObj?.optString("recipientPhone")?.takeIf { it.isNotBlank() }
                    val replyText = replySmsObj?.optString("message")?.takeIf { it.isNotBlank() }
                    val ttsText = resJson.optString("ttsText").takeIf { it.isNotBlank() }
                    val depositorName = resJson.optString("depositorName").takeIf { it.isNotBlank() }
                    val amountKrw = resJson.optLong("amountKrw", 0L)

                    return@withContext SmsSyncResult(
                        success = true,
                        replySmsPhone = replyPhone,
                        replySmsText = replyText,
                        depositorName = depositorName,
                        amountKrw = amountKrw,
                        ttsText = ttsText
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "문자($direction) 시트 동기화 예외 ($host): ${e.message}")
            }
        }
        SmsSyncResult(success = false)
    }

    /**
     * 통화 종료 후 발송된 모바일 명함 구글 드라이브 [SheetBot] 모바일 명함 발송 대장 시트 실시간 기록
     */
    suspend fun sendBusinessCardSync(
        userEmail: String,
        recipientPhone: String,
        contactName: String?,
        sendMode: String = "스마트 웹 명함(0원)",
        cardContentOrUrl: String,
        status: String = "전송 완료",
        deviceId: String? = null,
        sheetTitle: String = "[SheetBot] 모바일 명함 발송 대장"
    ): Boolean = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        var ftsSuccess = false
        if (prefs?.isDestinationFileToSheet == true) {
            val rowData = JSONObject().apply {
                put("발송일시", nowKstStr())
                put("수신자명", contactName?.takeIf { it.isNotBlank() } ?: "미등록 연락처")
                put("전화번호", recipientPhone)
                put("발송문구", "[$sendMode] $cardContentOrUrl")
                put("상태", status)
            }
            val ftsRes = FileToSheetClient.syncCardRowToFts("call_ended_card", rowData, memo = cardContentOrUrl)
            ftsSuccess = ftsRes.success
            if (ftsSuccess) {
                Log.i(TAG, "✅ [FTS 모바일 명함 발송 대장 기록 성공] 상대방: $recipientPhone")
            }
            if (!prefs.isDestinationGoogleSheet || !prefs.hasGoogleAccount) {
                return@withContext ftsSuccess
            }
        }

        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("recipientPhone", recipientPhone)
            put("contactName", contactName ?: "미등록 연락처")
            put("sendMode", sendMode)
            put("cardContentOrUrl", cardContentOrUrl)
            put("status", status)
            put("deviceId", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
            put("sheetTitle", sheetTitle)
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/messages/business-card"
            try {
                val request = Request.Builder().url(endpoint).post(body).build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    Log.i(TAG, "✅ [모바일 명함 대장 시트 동기화 성공] 상대방: $recipientPhone, 호스트: $host")
                    return@withContext true
                }
            } catch (e: Exception) {
                Log.w(TAG, "모바일 명함 대장 시트 동기화 예외 ($host): ${e.message}")
            }
        }
        false
    }

    /**
     * 고객 영수증 문자 발송 내역 구글 드라이브 [SheetBot] 고객 영수증 문자 발송 대장 시트 실시간 기록
     */
    suspend fun sendReceiptSmsSync(
        userEmail: String,
        recipientPhone: String,
        customerName: String = "고객",
        amount: Long = 0L,
        receiptContent: String,
        status: String = "전송 완료",
        deviceId: String? = null,
        sheetTitle: String = "[SheetBot] 고객 영수증 문자 발송 대장"
    ): Boolean = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        var ftsSuccess = false
        if (prefs?.isDestinationFileToSheet == true) {
            val rowData = JSONObject().apply {
                put("발송일시", nowKstStr())
                put("고객명", customerName)
                put("전화번호", recipientPhone)
                put("결제금액", amount)
                put("발송문구", receiptContent)
                put("상태", status)
            }
            val ftsRes = FileToSheetClient.syncCardRowToFts("receipt_sms", rowData, memo = receiptContent, amount = amount)
            ftsSuccess = ftsRes.success
            if (ftsSuccess) {
                Log.i(TAG, "✅ [FTS 영수증 문자 발송 대장 기록 성공] 수신: $recipientPhone")
            }
            if (!prefs.isDestinationGoogleSheet || !prefs.hasGoogleAccount) {
                return@withContext ftsSuccess
            }
        }

        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("recipientPhone", recipientPhone)
            put("customerName", customerName)
            put("amount", amount)
            put("receiptContent", receiptContent)
            put("status", status)
            put("deviceId", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
            put("sheetTitle", sheetTitle)
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/messages/receipt-sms"
            try {
                val request = Request.Builder().url(endpoint).post(body).build()
                val response = longTimeoutClient.newCall(request).execute()
                if (response.isSuccessful) {
                    Log.i(TAG, "✅ [고객 영수증 문자 대장 시트 동기화 성공] 수신: $recipientPhone, 호스트: $host")
                    return@withContext true
                }
            } catch (e: Exception) {
                Log.w(TAG, "고객 영수증 문자 대장 시트 동기화 예외 ($host): ${e.message}")
            }
        }
        false
    }

    /**
     * 카카오톡 수신 메시지 구글 시트 실시간 자동 기록
     */
    suspend fun sendKakaoSync(
        userEmail: String,
        chatRoomName: String,
        sender: String,
        isGroupChat: Boolean,
        message: String,
        deviceId: String? = null,
        sheetTitle: String = "[SheetBot] 카카오톡 메시지 대장"
    ): Boolean = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        var ftsSuccess = false
        if (prefs?.isDestinationFileToSheet == true) {
            val nowStr = nowKstStr()
            val roomOrSender = if (isGroupChat && chatRoomName.isNotBlank()) "[$chatRoomName] $sender" else sender.ifBlank { chatRoomName }
            val rowData = JSONObject().apply {
                put("수신일시", nowStr)
                put("채팅방/발신자", roomOrSender)
                put("메시지내용", message)
                put("기기명", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL}")
                put("동기화일시", nowStr)
            }
            val ftsRes = FileToSheetClient.syncCardRowToFts("kakao_sync", rowData, memo = message)
            ftsSuccess = ftsRes.success
            if (ftsSuccess) {
                Log.i(TAG, "✅ [FTS 카카오톡 대화 대장 기록 성공] 방/발신자: $roomOrSender")
            }
            if (!prefs.isDestinationGoogleSheet || !prefs.hasGoogleAccount) {
                return@withContext ftsSuccess
            }
        }

        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("chatRoomName", chatRoomName)
            put("sender", sender)
            put("isGroupChat", isGroupChat)
            put("message", message)
            put("deviceId", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
            put("sheetTitle", sheetTitle)
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/messages/kakao"
            try {
                val request = Request.Builder().url(endpoint).post(body).build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    Log.i(TAG, "✅ [카카오톡 시트 동기화 성공] 방: $chatRoomName / 발신자: $sender, 호스트: $host")
                    return@withContext true
                }
            } catch (e: Exception) {
                Log.w(TAG, "카카오톡 시트 동기화 예외 ($host): ${e.message}")
            }
        }
        false
    }

    /**
     * 📧 수신 이메일(Gmail/네이버/다음/삼성/Outlook 등) 시트 기록 및 AI 할 일 자동 추출 동기화
     */
    suspend fun sendEmailSync(
        userEmail: String,
        mailApp: String,
        sender: String,
        senderEmail: String = "",
        subject: String,
        bodyPreview: String,
        deviceId: String? = null,
        sheetTitle: String = "[SheetBot] 이메일 수신 대장"
    ): Boolean = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        var ftsSuccess = false
        val senderDisplay = if (senderEmail.isNotBlank() && !sender.contains(senderEmail)) {
            "$sender <$senderEmail>"
        } else {
            sender.ifBlank { senderEmail.ifBlank { "발신자 미상" } }
        }

        if (prefs?.isDestinationFileToSheet == true) {
            val nowStr = nowKstStr()
            val rowData = JSONObject().apply {
                put("수신일시", nowStr)
                put("메일앱/계정", mailApp)
                put("발신자", senderDisplay)
                put("메일제목", subject.ifBlank { "(제목 없음)" })
                put("본문요약", bodyPreview.ifBlank { subject })
                put("기기명", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL}")
            }
            val ftsRes = FileToSheetClient.syncCardRowToFts(
                "email_sync",
                rowData,
                memo = "[제목] $subject\n$bodyPreview"
            )
            ftsSuccess = ftsRes.success
            if (ftsSuccess) {
                Log.i(TAG, "✅ [FTS 이메일수신대장 기록 성공] 앱: $mailApp / 발신자: $senderDisplay")
            }
        }

        val shouldRecordGoogleSheet = prefs?.isDestinationGoogleSheet == true && prefs.hasGoogleAccount
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("userPhone", prefs?.ftsPhoneNumber ?: "")
            put("ftsProjectId", prefs?.ftsProjectId ?: "")
            put("mailApp", mailApp)
            put("sender", sender)
            put("senderEmail", senderEmail)
            put("subject", subject)
            put("bodyPreview", bodyPreview)
            put("deviceId", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
            put("sheetTitle", sheetTitle)
            put("autoRecordSheet", shouldRecordGoogleSheet)
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/messages/email"
            try {
                val request = Request.Builder().url(endpoint).post(body).build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    Log.i(TAG, "✅ [이메일 동기화 및 AI 할 일 추출 요청 성공] 발신자: $senderDisplay, 호스트: $host")
                    return@withContext true
                }
            } catch (e: Exception) {
                Log.w(TAG, "이메일 시트/할일 동기화 예외 ($host): ${e.message}")
            }
        }
        ftsSuccess
    }

    /**
     * 카카오톡 대화 내용 내보내기(.txt) 파일 일괄 파싱 및 구글 시트 구간 덮어쓰기 (v2.1.11)
     */
    suspend fun importKakaoChat(
        userEmail: String,
        textContent: String,
        fileName: String = "KakaoTalkChats.txt",
        sheetTitle: String = "[SheetBot] 카카오톡 메시지 대장"
    ): KakaoImportResult = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        val isFts = prefs?.isDestinationFileToSheet == true
        val isGoogle = prefs?.isDestinationGoogleSheet == true && prefs.hasGoogleAccount
        var ftsImportResult: KakaoImportResult? = null

        // 🌟 파일투시트(FileToSheet) 연동 시 원본 .txt 파일 및 파싱된 대화 내역 일괄 업로드
        if (isFts) {
            val cleanName = fileName.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "KakaoTalkChats.txt" }
            val tempTxtFile = File(SheetBotApp.appContext.cacheDir, cleanName)
            try {
                tempTxtFile.writeText(textContent, Charsets.UTF_8)
                val ftsRes = FileToSheetClient.syncCardFileToFts(
                    cardIdOrType = "kakao_sync",
                    file = tempTxtFile,
                    mimeType = "text/plain",
                    memo = "카카오톡 대화 파일 가져오기 ($cleanName)",
                    ocrType = "KAKAO_CHAT",
                    customFileName = cleanName
                )
                if (ftsRes.success) {
                    val count = if (ftsRes.insertedCount > 0) ftsRes.insertedCount else ftsRes.rowsCount
                    ftsImportResult = KakaoImportResult(
                        success = true,
                        chatRoomName = ftsRes.chatRoomName ?: cleanName.removeSuffix(".txt"),
                        totalCount = if (ftsRes.totalCount > 0) ftsRes.totalCount else count,
                        insertedCount = count,
                        startDate = ftsRes.startDate,
                        endDate = ftsRes.endDate,
                        message = ftsRes.message ?: "파일투시트 카카오톡대화대장 적재 완료"
                    )
                } else {
                    ftsImportResult = KakaoImportResult(
                        success = false,
                        error = ftsRes.error ?: "파일투시트 카카오톡 대화 파일 업로드 실패"
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "파일투시트 카톡 대화 파일 업로드 예외: ${e.message}")
                ftsImportResult = KakaoImportResult(success = false, error = e.localizedMessage)
            } finally {
                try {
                    if (tempTxtFile.exists()) tempTxtFile.delete()
                } catch (_: Exception) {}
            }

            if (!isGoogle && ftsImportResult != null) {
                return@withContext ftsImportResult
            }
        }

        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("textContent", textContent)
            put("fileName", fileName)
            put("sheetTitle", sheetTitle)
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/messages/kakao/import"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .post(body)
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .build()
                val response = longTimeoutClient.newCall(request).execute()
                val resBody = response.body?.string() ?: ""
                if (response.isSuccessful && resBody.isNotBlank()) {
                    val resJson = JSONObject(resBody)
                    val isSuccess = resJson.optBoolean("success", false)
                    if (isSuccess) {
                        return@withContext KakaoImportResult(
                            success = true,
                            chatRoomName = resJson.optString("chatRoomName", ""),
                            totalCount = resJson.optInt("totalCount", 0),
                            insertedCount = resJson.optInt("insertedCount", 0),
                            startDate = resJson.optString("startDate", ""),
                            endDate = resJson.optString("endDate", ""),
                            sheetUrl = resJson.optString("sheetUrl", ""),
                            message = resJson.optString("message", "")
                        )
                    } else if (ftsImportResult?.success == true) {
                        return@withContext ftsImportResult
                    } else {
                        return@withContext KakaoImportResult(
                            success = false,
                            error = resJson.optString("error", "카카오톡 대화 파싱에 실패했습니다.")
                        )
                    }
                } else if (!response.isSuccessful && resBody.isNotBlank()) {
                    if (ftsImportResult?.success == true) return@withContext ftsImportResult
                    val errJson = JSONObject(resBody)
                    return@withContext KakaoImportResult(
                        success = false,
                        error = errJson.optString("error", "HTTP ${response.code}")
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "카카오톡 대화 가져오기 예외 ($host): ${e.message}")
            }
        }
        ftsImportResult ?: KakaoImportResult(success = false, error = "서버와의 통신에 실패했습니다. 네트워크를 확인해 주세요.")
    }

    /**
     * 부재중 전화(Missed Call) 감지 및 자동 회신 내역 구글 시트 실시간 자동 기록
     */
    suspend fun sendMissedCallSync(
        userEmail: String,
        callerPhone: String,
        contactName: String?,
        callTime: String,
        autoReplied: Boolean,
        replyMessage: String,
        deviceId: String? = null,
        sheetTitle: String = "[SheetBot] 부재중 전화 대장"
    ): Boolean = withContext(Dispatchers.IO) {
        val prefs = try { PreferencesManager(SheetBotApp.appContext) } catch (_: Exception) { null }
        var ftsSuccess = false
        if (prefs?.isDestinationFileToSheet == true) {
            val statusLabel = if (autoReplied) "자동 회신 완료" else "기록 완료(미발송)"
            val rowData = JSONObject().apply {
                put("부재중일시", callTime)
                put("발신번호", callerPhone)
                put("연락처이름", contactName?.takeIf { it.isNotBlank() } ?: "미등록 연락처")
                put("자동회신내용", replyMessage)
                put("회신상태", statusLabel)
                put("기기명", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL}")
            }
            val ftsRes = FileToSheetClient.syncCardRowToFts("missed_call", rowData, memo = replyMessage)
            ftsSuccess = ftsRes.success
            if (ftsSuccess) {
                Log.i(TAG, "✅ [FTS 부재중 전화 대장 기록 성공] 발신: $callerPhone ($statusLabel)")
            }
            if (!prefs.isDestinationGoogleSheet || !prefs.hasGoogleAccount) {
                return@withContext ftsSuccess
            }
        }

        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("callerPhone", callerPhone)
            put("contactName", contactName ?: "")
            put("callTime", callTime)
            put("autoReplied", autoReplied)
            put("replyMessage", replyMessage)
            put("deviceId", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
            put("sheetTitle", sheetTitle)
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/calls/missed"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .post(body)
                    .header("x-sheetbot-user-email", userEmail)
                    .build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    Log.i(TAG, "✅ [부재중 전화 시트 동기화 성공] 발신: $callerPhone, 호스트: $host")
                    return@withContext true
                }
            } catch (e: Exception) {
                Log.w(TAG, "부재중 전화 시트 동기화 예외 ($host): ${e.message}")
            }
        }
        false
    }

    /**
     * 회원 토큰 지갑 잔액 및 등급 실시간 조회 (v1.9.0)
     * GET /api/wallet/balance?userEmail={email}
     */
    suspend fun fetchWalletBalance(userEmail: String): WalletBalanceResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "토큰 잔액 조회 실패"

        for ((index, host) in hosts.withIndex()) {
            val endpoint = "$host/api/wallet/balance?userEmail=${java.net.URLEncoder.encode(userEmail, "UTF-8")}"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .get()
                    .header("Cache-Control", "no-cache")
                    .build()

                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val balance = resJson.optLong("balanceTokens", 0L)
                    val tier = resJson.optString("tier", "FREE")
                    Log.i(TAG, "💰 [토큰 잔액 조회 성공] $userEmail: ${balance}개 (Tier: $tier)")
                    return@withContext WalletBalanceResult(
                        success = true,
                        userEmail = userEmail,
                        balanceTokens = balance,
                        tier = tier
                    )
                } else {
                    val errMsg = resJson.optString("error", "HTTP ${response.code}")
                    lastError = "[$host] $errMsg"
                }
            } catch (e: Exception) {
                lastError = "[$host] ${e.localizedMessage ?: "네트워크 연결 불가"}"
            }
        }
        WalletBalanceResult(success = false, error = lastError)
    }

    /**
     * 인앱 토큰 다이렉트 충전 세션 발급 요청 (v1.9.0)
     * POST /api/wallet/direct-deposit
     */
    suspend fun requestDirectDeposit(
        userEmail: String,
        userName: String,
        packageId: String,
        depositorName: String,
        phoneNumber: String? = null
    ): DepositSessionResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "충전 세션 발급 실패"

        for ((index, host) in hosts.withIndex()) {
            val endpoint = "$host/api/wallet/direct-deposit"
            try {
                val json = JSONObject().apply {
                    put("userEmail", userEmail)
                    put("userName", userName)
                    put("packageId", packageId)
                    put("depositorName", depositorName)
                    if (!phoneNumber.isNullOrBlank()) {
                        put("phoneNumber", phoneNumber)
                    }
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
                    val bankObj = resJson.optJSONObject("bank") ?: JSONObject()
                    val pkgObj = resJson.optJSONObject("package") ?: JSONObject()
                    Log.i(TAG, "💳 [충전 세션 발급 성공] 금액: ${resJson.optInt("amountKrw")}원, 입금자: $depositorName")

                    return@withContext DepositSessionResult(
                        success = true,
                        requestId = resJson.optString("requestId", ""),
                        depositCode = resJson.optString("depositCode", ""),
                        depositorName = resJson.optString("depositorName", depositorName),
                        amountKrw = resJson.optInt("amountKrw", 0),
                        originalAmountKrw = resJson.optInt("originalAmountKrw", 0),
                        discountKrw = resJson.optInt("discountKrw", 0),
                        tokensToCredit = pkgObj.optInt("totalTokens", 0),
                        bankName = bankObj.optString("bankName", "카카오뱅크"),
                        accountNumber = bankObj.optString("accountNumber", "3333-12-1695965"),
                        accountHolder = bankObj.optString("accountHolder", "차호석"),
                        tossUrl = resJson.optString("tossUrl", ""),
                        qrImageUrl = resJson.optString("qrImageUrl", ""),
                        expiresAt = resJson.optString("expiresAt", "")
                    )
                } else {
                    val errMsg = resJson.optString("error", "HTTP ${response.code}")
                    lastError = "[$host] $errMsg"
                }
            } catch (e: Exception) {
                lastError = "[$host] ${e.localizedMessage ?: "네트워크 연결 불가"}"
            }
        }
        DepositSessionResult(success = false, error = lastError)
    }

    /**
     * 회원 고유 추천 코드 및 친구 초대 실적 조회 (v2.0.0)
     * GET /api/wallet/referral?userEmail={email}
     */
    suspend fun fetchReferralInfo(userEmail: String): ReferralInfoResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "추천 정보 조회 실패"

        for ((index, host) in hosts.withIndex()) {
            val endpoint = "$host/api/wallet/referral?userEmail=${java.net.URLEncoder.encode(userEmail, "UTF-8")}"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .get()
                    .header("Cache-Control", "no-cache")
                    .build()

                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    Log.i(TAG, "🎁 [추천 정보 조회 성공] ${resJson.optString("myCode")}")
                    return@withContext ReferralInfoResult(
                        success = true,
                        userEmail = userEmail,
                        myCode = resJson.optString("myCode", ""),
                        inviteUrl = resJson.optString("inviteUrl", ""),
                        apkInviteUrl = resJson.optString("apkInviteUrl", ""),
                        shareText = resJson.optString("shareText", ""),
                        inviteCount = resJson.optInt("inviteCount", 0),
                        earnedTokens = resJson.optInt("earnedTokens", 0),
                        hasClaimedReward = resJson.optBoolean("hasClaimedReward", false)
                    )
                } else {
                    val errMsg = resJson.optString("error", "HTTP ${response.code}")
                    lastError = "[$host] $errMsg"
                }
            } catch (e: Exception) {
                lastError = "[$host] ${e.localizedMessage ?: "네트워크 연결 불가"}"
            }
        }
        ReferralInfoResult(success = false, error = lastError)
    }

    /**
     * 친구 추천인 코드 등록 및 10,000 보너스 토큰 수령 (v2.0.0)
     * POST /api/wallet/referral/claim
     */
    suspend fun claimReferralReward(
        inviteeEmail: String,
        referralCode: String,
        deviceId: String = "${Build.MANUFACTURER} ${Build.MODEL}"
    ): ReferralClaimResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "초대 코드 등록 실패"

        for ((index, host) in hosts.withIndex()) {
            val endpoint = "$host/api/wallet/referral/claim"
            try {
                val json = JSONObject().apply {
                    put("inviteeEmail", inviteeEmail)
                    put("referralCode", referralCode.trim())
                    put("deviceId", deviceId)
                    put("channel", "MOBILE_AGENT")
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
                    Log.i(TAG, "🎉 [추천 보너스 수령 성공] $inviteeEmail -> ${resJson.optString("message")}")
                    return@withContext ReferralClaimResult(
                        success = true,
                        message = resJson.optString("message", "10,000 토큰이 지급되었습니다!"),
                        rewardTokens = resJson.optInt("rewardTokens", 10000),
                        inviterEmail = resJson.optString("inviterEmail", "")
                    )
                } else {
                    val errMsg = resJson.optString("message", resJson.optString("error", "HTTP ${response.code}"))
                    lastError = errMsg
                }
            } catch (e: Exception) {
                lastError = "[$host] ${e.localizedMessage ?: "네트워크 연결 불가"}"
            }
        }
        ReferralClaimResult(success = false, error = lastError)
    }

    /**
     * 기능 스위치 ON 시 구글 스프레드시트 대장 및 헤더 선제 생성 (Eager Provisioning, v2.1.2)
     */
    suspend fun provisionSheet(
        userEmail: String,
        sheetType: String,
        sheetTitle: String? = null,
        folderName: String? = null
    ): ProvisionSheetResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "구글 시트 생성 요청 실패"

        for (host in hosts) {
            val endpoint = "$host/api/user/sheets/provision"
            try {
                val json = JSONObject().apply {
                    put("userEmail", userEmail)
                    put("sheetType", sheetType)
                    if (!sheetTitle.isNullOrBlank()) {
                        put("sheetTitle", sheetTitle)
                    }
                    if (!folderName.isNullOrBlank()) {
                        put("folderName", folderName)
                    }
                }
                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val request = Request.Builder()
                    .url(endpoint)
                    .post(body)
                    .build()

                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val isNew = resJson.optBoolean("isNew", false)
                    val spreadsheetUrl = resJson.optString("spreadsheetUrl", "")
                    val title = resJson.optString("title", sheetTitle ?: "")
                    Log.i(TAG, "📊 [시트 선제 생성 완료] $sheetType -> $title ($spreadsheetUrl, isNew=$isNew)")
                    return@withContext ProvisionSheetResult(
                        success = true,
                        isNew = isNew,
                        spreadsheetId = resJson.optString("spreadsheetId", "").takeIf { it.isNotBlank() },
                        spreadsheetUrl = spreadsheetUrl.takeIf { it.isNotBlank() },
                        folderId = resJson.optString("folderId", "").takeIf { it.isNotBlank() },
                        folderUrl = resJson.optString("folderUrl", "").takeIf { it.isNotBlank() },
                        folderName = resJson.optString("folderName", "").takeIf { it.isNotBlank() },
                        title = title,
                        message = resJson.optString("message", "구글 스프레드시트 대장이 준비되었습니다.")
                    )
                } else {
                    val errCode = resJson.optString("errorCode", "").takeIf { it.isNotBlank() }
                    val oauthUrl = resJson.optString("oauthUrl", "").takeIf { it.isNotBlank() }
                    lastError = resJson.optString("error", "HTTP ${response.code}")
                    if (errCode == "GOOGLE_OAUTH_REQUIRED" || response.code == 403) {
                        return@withContext ProvisionSheetResult(
                            success = false,
                            error = lastError,
                            errorCode = errCode ?: "GOOGLE_OAUTH_REQUIRED",
                            oauthUrl = oauthUrl
                        )
                    }
                }
            } catch (e: Exception) {
                lastError = "[$host] ${e.localizedMessage ?: "통신 오류"}"
            }
        }
        ProvisionSheetResult(success = false, error = lastError)
    }

    /**
     * 기존 구글 스프레드시트에 신규 탭(서식 포함) 추가 및 연동 바인딩
     */
    suspend fun addTabToSpreadsheet(
        userEmail: String,
        spreadsheetUrlOrId: String,
        tabName: String = "문자발송목록",
        sheetType: String = "SHEET_SMS_CHECKBOX"
    ): AddTabResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "기존 시트 탭 추가 요청 실패"

        for (host in hosts) {
            val endpoint = "$host/api/user/sheets/add-tab"
            try {
                val json = JSONObject().apply {
                    put("userEmail", userEmail)
                    put("spreadsheetUrlOrId", spreadsheetUrlOrId)
                    put("tabName", tabName)
                    put("sheetType", sheetType)
                }
                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val request = Request.Builder()
                    .url(endpoint)
                    .post(body)
                    .build()

                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val spreadsheetUrl = resJson.optString("spreadsheetUrl", "")
                    val sheetTitle = resJson.optString("sheetTitle", "")
                    val returnedTab = resJson.optString("tabName", tabName)
                    val isNewTab = resJson.optBoolean("isNewTab", false)
                    Log.i(TAG, "➕ [기존 시트 탭 추가 완료] $sheetTitle -> $returnedTab ($spreadsheetUrl)")
                    return@withContext AddTabResult(
                        success = true,
                        spreadsheetId = resJson.optString("spreadsheetId", "").takeIf { it.isNotBlank() },
                        spreadsheetUrl = spreadsheetUrl.takeIf { it.isNotBlank() },
                        sheetTitle = sheetTitle,
                        tabName = returnedTab,
                        isNewTab = isNewTab,
                        message = resJson.optString("message", "시트에 탭이 추가되었습니다.")
                    )
                } else {
                    lastError = resJson.optString("error", "HTTP ${response.code}")
                }
            } catch (e: Exception) {
                lastError = "[$host] ${e.localizedMessage ?: "통신 오류"}"
            }
        }
        AddTabResult(success = false, error = lastError)
    }

    /**
     * 사장님 상호명/프로필 조회 (type: "order" 또는 "estimate")
     */
    suspend fun getBusinessProfile(email: String, type: String = "order"): BusinessProfileResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "프로필 조회 실패"

        for (host in hosts) {
            val endpoint = "$host/api/user/quote/image?email=$email&type=$type"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .get()
                    .build()
                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    return@withContext BusinessProfileResult(
                        success = true,
                        businessName = resJson.optString("businessName", ""),
                        phone = resJson.optString("phone", ""),
                        imageUrl = resJson.optString("imageUrl", resJson.optString("quoteImageUrl", ""))
                    )
                } else {
                    lastError = resJson.optString("error", "HTTP ${response.code}")
                }
            } catch (e: Exception) {
                lastError = e.localizedMessage ?: "통신 오류"
            }
        }
        BusinessProfileResult(success = false, error = lastError)
    }

    /**
     * 사장님 상호명/프로필 실시간 업데이트
     */
    suspend fun updateBusinessProfile(email: String, businessName: String, phone: String = ""): Boolean = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val endpoints = listOf("/api/user/profile", "/api/user/quote/catalog")
        for (host in hosts) {
            for (path in endpoints) {
                val endpoint = "$host$path"
                try {
                    val json = JSONObject().apply {
                        put("email", email)
                        put("businessName", businessName)
                        if (phone.isNotBlank()) put("phone", phone)
                    }
                    val request = Request.Builder()
                        .url(endpoint)
                        .post(json.toString().toRequestBody(JSON_MEDIA_TYPE))
                        .build()
                    val response = client.newCall(request).execute()
                    val resStr = response.body?.string() ?: ""
                    val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                    if (response.isSuccessful && resJson.optBoolean("success", false)) {
                        Log.i(TAG, "🏢 [상호명 업데이트 성공] $businessName ($email via $path)")
                        return@withContext true
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "[$endpoint] 상호명 업데이트 예외: ${e.message}")
                }
            }
        }
        false
    }

    /**
     * 주문/견적 웹앱 및 카카오톡 미리보기용 대표 이미지 파일 업로드 (type: "order" 또는 "estimate")
     */
    suspend fun uploadQuoteImage(
        fileBytes: ByteArray,
        fileName: String,
        mimeType: String,
        userEmail: String,
        type: String = "order"
    ): UploadQuoteImageResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val base64Str = android.util.Base64.encodeToString(fileBytes, android.util.Base64.NO_WRAP)
        val json = JSONObject().apply {
            put("email", userEmail)
            put("userEmail", userEmail)
            put("fileName", fileName)
            put("type", type)
            put("imageBase64", "data:$mimeType;base64,$base64Str")
        }
        val requestBody = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        var lastError = "이미지 업로드 실패"
        for (host in hosts) {
            val endpoint = "$host/api/user/quote/image"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .post(requestBody)
                    .build()
                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val imageUrl = resJson.optString("imageUrl", "")
                    val bName = resJson.optString("businessName", "")
                    Log.i(TAG, "📷 [${if (type == "estimate") "견적" else "주문"} 대표 이미지 업로드 성공] $imageUrl")
                    return@withContext UploadQuoteImageResult(
                        success = true,
                        imageUrl = imageUrl,
                        businessName = bName,
                        message = resJson.optString("message", "대표 이미지가 등록되었습니다.")
                    )
                } else {
                    lastError = resJson.optString("error", "HTTP ${response.code}")
                }
            } catch (e: Exception) {
                lastError = e.localizedMessage ?: "네트워크 통신 오류"
                Log.w(TAG, "[$endpoint] 이미지 업로드 예외: ${e.message}")
            }
        }
        UploadQuoteImageResult(success = false, error = lastError)
    }

    /**
     * 스마트폰 연락처 목록 구글 시트 대장 동기화
     * POST /api/user/contacts/sync
     */
    suspend fun syncContacts(
        userEmail: String,
        contacts: List<ContactDto>,
        isFullSync: Boolean = true,
        deviceId: String? = null
    ): ContactSyncResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "연락처 동기화 실패"

        val contactsArray = org.json.JSONArray()
        for (c in contacts) {
            val item = JSONObject().apply {
                put("id", c.id)
                put("name", c.name)
                put("mobile", c.mobile)
                put("extraPhone", c.extraPhone)
                put("email", c.email)
                put("company", c.company)
                put("title", c.title)
                put("note", c.note)
                put("address", c.address)
                put("updatedAt", c.updatedAt)
            }
            contactsArray.put(item)
        }

        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("deviceId", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
            put("isFullSync", isFullSync)
            put("contacts", contactsArray)
        }
        val requestBody = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/contacts/sync"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .post(requestBody)
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .build()
                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val totalCount = resJson.optInt("totalCount", contacts.size)
                    val insertedCount = resJson.optInt("insertedCount", 0)
                    val updatedCount = resJson.optInt("updatedCount", 0)
                    val sheetUrl = resJson.optString("spreadsheetUrl", "")
                    Log.i(TAG, "📇 [연락처 구글 시트 동기화 성공] 총 ${totalCount}건 (추가: $insertedCount, 수정: $updatedCount)")
                    return@withContext ContactSyncResult(
                        success = true,
                        totalCount = totalCount,
                        insertedCount = insertedCount,
                        updatedCount = updatedCount,
                        spreadsheetUrl = sheetUrl,
                        message = resJson.optString("message", "연락처 동기화 완료")
                    )
                } else {
                    lastError = resJson.optString("error", "HTTP ${response.code}")
                }
            } catch (e: Exception) {
                lastError = e.localizedMessage ?: "네트워크 통신 오류"
                Log.w(TAG, "[$endpoint] 연락처 동기화 통신 예외: ${e.message}")
            }
        }
        ContactSyncResult(success = false, error = lastError)
    }

    /**
     * 수신 전화 시 고객 시트 정보 및 직전 통화 AI 요약 조회 (In-Call Summary)
     * 1차: PRIMARY_HOST -> 2차: FALLBACK_HOST
     */
    suspend fun fetchCallSummary(
        userEmail: String,
        callerPhone: String
    ): CallSummaryResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "고객 정보 조회 실패"

        for (host in hosts) {
            val endpoint = "$host/api/user/calls/summary"
            try {
                val json = JSONObject().apply {
                    put("userEmail", userEmail)
                    put("callerPhone", callerPhone)
                }
                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val request = Request.Builder()
                    .url(endpoint)
                    .post(body)
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .build()

                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val tasksList = mutableListOf<TaskItemDto>()
                    val pArray = resJson.optJSONArray("pendingTasks")
                    if (pArray != null) {
                        for (i in 0 until pArray.length()) {
                            val tObj = pArray.optJSONObject(i) ?: continue
                            tasksList.add(
                                TaskItemDto(
                                    id = tObj.optLong("id", 0L),
                                    title = tObj.optString("title", ""),
                                    dueDate = tObj.optString("dueDate", null),
                                    priority = tObj.optString("priority", "NORMAL ⚪"),
                                    badgeText = tObj.optString("badgeText", null),
                                    sourceType = tObj.optString("sourceType", "SMS")
                                )
                            )
                        }
                    }

                    return@withContext CallSummaryResult(
                        success = true,
                        found = resJson.optBoolean("found", false),
                        phone = resJson.optString("phone", callerPhone),
                        cleanPhone = resJson.optString("cleanPhone", ""),
                        name = resJson.optString("name", "신규 연락처"),
                        company = resJson.optString("company", ""),
                        position = resJson.optString("position", ""),
                        memo = resJson.optString("memo", ""),
                        lastCallTime = resJson.optString("lastCallTime", ""),
                        lastCallSummary = resJson.optString("lastCallSummary", ""),
                        actionItems = resJson.optString("actionItems", ""),
                        pendingTasks = tasksList,
                        lastMissedCallTime = resJson.optString("lastMissedCallTime", ""),
                        rawJson = resStr
                    )
                } else {
                    lastError = resJson.optString("error", "HTTP ${response.code}")
                }
            } catch (e: Exception) {
                lastError = e.localizedMessage ?: "네트워크 연결 불가"
            }
        }
        CallSummaryResult(success = false, phone = callerPhone, error = lastError)
    }

    /**
     * 스마트 통합 할 일 허브 목록 조회 (GET /api/user/tasks)
     */
    suspend fun fetchTasks(
        userEmail: String,
        status: String = "ALL",
        source: String = "ALL",
        phoneNumber: String? = null,
        projectId: String? = null
    ): TaskListResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "할 일 목록 조회 실패"
        val cleanPhone = phoneNumber?.replace("[^0-9]".toRegex(), "").orEmpty()

        for (host in hosts) {
            val query = buildString {
                append("status=").append(status)
                append("&source=").append(source)
                if (cleanPhone.isNotBlank()) append("&phoneNumber=").append(cleanPhone)
                if (!projectId.isNullOrBlank()) append("&projectId=").append(java.net.URLEncoder.encode(projectId, "UTF-8"))
            }
            val endpoint = "$host/api/user/tasks?$query"
            try {
                val reqBuilder = Request.Builder()
                    .url(endpoint)
                    .get()
                if (userEmail.isNotBlank()) reqBuilder.addHeader("x-sheetbot-user-email", userEmail)
                if (cleanPhone.isNotBlank()) reqBuilder.addHeader("x-user-phone", cleanPhone)
                if (!projectId.isNullOrBlank()) reqBuilder.addHeader("x-fts-project-id", projectId)

                val response = client.newCall(reqBuilder.build()).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val taskList = mutableListOf<TaskItemDto>()
                    val tasksArr = resJson.optJSONArray("tasks")
                    if (tasksArr != null) {
                        fun JSONObject.optCleanNullable(key: String): String? {
                            if (isNull(key)) return null
                            val v = optString(key, "").trim()
                            return if (v.isEmpty() || v.equals("null", ignoreCase = true) || v.equals("undefined", ignoreCase = true)) null else v
                        }
                        for (i in 0 until tasksArr.length()) {
                            val obj = tasksArr.optJSONObject(i) ?: continue
                            val cleanTitle = obj.optCleanNullable("title") ?: continue
                            taskList.add(
                                TaskItemDto(
                                    id = obj.optLong("id", 0L),
                                    title = cleanTitle,
                                    description = obj.optCleanNullable("description"),
                                    contactName = obj.optCleanNullable("contact_name"),
                                    contactPhone = obj.optCleanNullable("contact_phone"),
                                    dueDate = obj.optCleanNullable("due_date"),
                                    priority = obj.optCleanNullable("priority") ?: "NORMAL ⚪",
                                    status = obj.optCleanNullable("status") ?: "PENDING",
                                    badgeText = obj.optCleanNullable("badge_text"),
                                    sourceType = obj.optCleanNullable("source_type") ?: "SMS",
                                    createdAt = obj.optCleanNullable("created_at") ?: "",
                                    deepLink = obj.optCleanNullable("deep_link")
                                )
                            )
                        }
                    }

                    val computedPending = taskList.count { it.status == "PENDING" }
                    val computedDone = taskList.count { it.status == "DONE" }
                    return@withContext TaskListResult(
                        success = true,
                        tasks = taskList,
                        totalCount = resJson.optInt("totalCount", taskList.size),
                        pendingCount = resJson.optInt("pendingCount", computedPending),
                        doneCount = resJson.optInt("doneCount", computedDone),
                        spreadsheetUrl = resJson.optString("spreadsheetUrl", null)
                    )
                } else {
                    lastError = resJson.optString("error", "HTTP ${response.code}")
                }
            } catch (e: Exception) {
                lastError = e.localizedMessage ?: "네트워크 연결 불가"
            }
        }

        TaskListResult(success = false, error = lastError)
    }

    /**
     * 할 일 완료 상태 토글 (PATCH /api/user/tasks)
     */
    suspend fun toggleTaskStatus(
        userEmail: String,
        taskId: Long,
        nextStatus: String,
        title: String? = null,
        phoneNumber: String? = null,
        projectId: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val cleanPhone = phoneNumber?.replace("[^0-9]".toRegex(), "").orEmpty()
        for (host in hosts) {
            val endpoint = "$host/api/user/tasks"
            try {
                val json = JSONObject().apply {
                    put("taskId", taskId)
                    put("status", nextStatus)
                    if (!title.isNullOrBlank()) put("title", title)
                    if (cleanPhone.isNotBlank()) put("phoneNumber", cleanPhone)
                    if (!projectId.isNullOrBlank()) put("projectId", projectId)
                }
                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val reqBuilder = Request.Builder()
                    .url(endpoint)
                    .patch(body)
                if (userEmail.isNotBlank()) reqBuilder.addHeader("x-sheetbot-user-email", userEmail)
                if (cleanPhone.isNotBlank()) reqBuilder.addHeader("x-user-phone", cleanPhone)
                if (!projectId.isNullOrBlank()) reqBuilder.addHeader("x-fts-project-id", projectId)

                val response = client.newCall(reqBuilder.build()).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    return@withContext true
                }
            } catch (_: Exception) {}
        }
        false
    }

    /**
     * 신규 할 일 수동 등록 (POST /api/user/tasks)
     */
    suspend fun createTask(
        userEmail: String,
        title: String,
        contactName: String? = null,
        contactPhone: String? = null,
        dueDate: String? = null,
        priority: String = "HIGH 🟡",
        badgeText: String = "모바일 등록",
        phoneNumber: String? = null,
        projectId: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val cleanPhone = phoneNumber?.replace("[^0-9]".toRegex(), "").orEmpty()
        for (host in hosts) {
            val endpoint = "$host/api/user/tasks"
            try {
                val json = JSONObject().apply {
                    put("title", title)
                    if (!contactName.isNullOrBlank()) put("contactName", contactName)
                    if (!contactPhone.isNullOrBlank()) put("contactPhone", contactPhone)
                    if (!dueDate.isNullOrBlank()) put("dueDate", dueDate)
                    put("priority", priority)
                    put("badgeText", badgeText)
                    if (cleanPhone.isNotBlank()) put("phoneNumber", cleanPhone)
                    if (!projectId.isNullOrBlank()) put("projectId", projectId)
                }
                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val reqBuilder = Request.Builder()
                    .url(endpoint)
                    .post(body)
                if (userEmail.isNotBlank()) reqBuilder.addHeader("x-sheetbot-user-email", userEmail)
                if (cleanPhone.isNotBlank()) reqBuilder.addHeader("x-user-phone", cleanPhone)
                if (!projectId.isNullOrBlank()) reqBuilder.addHeader("x-fts-project-id", projectId)

                val response = client.newCall(reqBuilder.build()).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    return@withContext true
                }
            } catch (_: Exception) {}
        }
        false
    }

    /**
     * 🤖 할 일(과업) 맥락에 맞춘 AI 추천 답장 문구 3종 생성 (POST /api/user/tasks/suggest-reply)
     */
    suspend fun suggestTaskReplies(
        userEmail: String,
        title: String,
        description: String? = null,
        contactName: String? = null,
        sourceType: String = "SMS",
        phoneNumber: String? = null
    ): List<String> = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val cleanPhone = phoneNumber?.replace("[^0-9]".toRegex(), "").orEmpty()
        val payload = JSONObject().apply {
            put("title", title)
            if (!description.isNullOrBlank()) put("description", description)
            if (!contactName.isNullOrBlank()) put("contactName", contactName)
            put("sourceType", sourceType)
            if (cleanPhone.isNotBlank()) put("phoneNumber", cleanPhone)
        }
        val body = payload.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/tasks/suggest-reply"
            try {
                val reqBuilder = Request.Builder()
                    .url(endpoint)
                    .post(body)
                if (userEmail.isNotBlank()) reqBuilder.addHeader("x-sheetbot-user-email", userEmail)
                if (cleanPhone.isNotBlank()) reqBuilder.addHeader("x-user-phone", cleanPhone)

                client.newCall(reqBuilder.build()).execute().use { res ->
                    val resStr = res.body?.string() ?: ""
                    val json = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                    if (res.isSuccessful && json.optBoolean("success", false)) {
                        val arr = json.optJSONArray("suggestions")
                        if (arr != null && arr.length() > 0) {
                            val list = mutableListOf<String>()
                            for (i in 0 until arr.length()) {
                                val s = arr.optString(i, "").trim()
                                if (s.isNotBlank()) list.add(s)
                            }
                            if (list.isNotEmpty()) return@withContext list
                        }
                    }
                }
            } catch (_: Exception) {}
        }

        // 시트봇 서버 실패 시 파투 서버(/api/inbox/tasks/suggest-reply) 폴백
        for (ftsHost in listOf(FileToSheetClient.FTS_OFFICIAL_DOMAIN, FileToSheetClient.FTS_TUNNEL_BASE)) {
            try {
                val reqBuilder = Request.Builder()
                    .url("$ftsHost/api/inbox/tasks/suggest-reply")
                    .post(body)
                if (cleanPhone.isNotBlank()) reqBuilder.addHeader("x-user-phone", cleanPhone)
                client.newCall(reqBuilder.build()).execute().use { res ->
                    val resStr = res.body?.string() ?: ""
                    val json = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                    if (res.isSuccessful && json.optBoolean("success", false)) {
                        val arr = json.optJSONArray("suggestions")
                        if (arr != null && arr.length() > 0) {
                            val list = mutableListOf<String>()
                            for (i in 0 until arr.length()) {
                                val s = arr.optString(i, "").trim()
                                if (s.isNotBlank()) list.add(s)
                            }
                            if (list.isNotEmpty()) return@withContext list
                        }
                    }
                }
            } catch (_: Exception) {}
        }

        // 최종 로컬 지능형 생성 폴백 (네트워크 단절 시에도 즉시 과업 맞춤형 문구 생성)
        buildSmartLocalSuggestions(title, contactName, sourceType)
    }

    fun buildSmartLocalSuggestions(
        title: String,
        contactName: String?,
        sourceType: String
    ): List<String> {
        val cleanName = contactName
            ?.substringBefore("(")
            ?.replace(Regex("^(고객|상대방)\\s*:\\s*"), "")
            ?.trim()
            ?.takeIf { it.isNotBlank() && it != "미등록 연락처" && it != "미지정 연락처" }
        val namePrefix = if (cleanName != null) "${cleanName}님, " else ""

        // 제목에서 [고객명 (번호)] 및 "본인:", "상대방:" 접두어 제거 후 핵심 키워드 추출
        val strippedTitle = title
            .replace(Regex("^\\[[^\\]]+\\]\\s*"), "")
            .replace(Regex("^(본인|상대방)\\s*:\\s*"), "")
            .replace(Regex("^(상대방으로부터|상대방에게)\\s*"), "")
            .trim()

        return when {
            strippedTitle.contains("API") || strippedTitle.contains("키") -> listOf(
                "안녕하세요 ${namePrefix}말씀하신 API 키 전달해 주시면 확인 후 시스템에 바로 적용하겠습니다.",
                "${namePrefix}API 키 확인 및 적용 완료되는 대로 다시 안내드리겠습니다.",
                "API 키 보내주시면 확인 후 즉시 반영하겠습니다. 감사합니다."
            )
            strippedTitle.contains("견적") || strippedTitle.contains("발주") || strippedTitle.contains("주문") -> listOf(
                "안녕하세요 ${namePrefix}요청하신 주문/견적 내역 확인하여 빠르게 처리해 드리겠습니다.",
                "${namePrefix}말씀해주신 품목 확인 중입니다. 준비되는 대로 바로 안내드리겠습니다.",
                "요청하신 건 접수 완료되었습니다. 확인 후 곧 연락드리겠습니다."
            )
            strippedTitle.contains("결제") || strippedTitle.contains("입금") || strippedTitle.contains("계산서") || strippedTitle.contains("충전") -> listOf(
                "안녕하세요 ${namePrefix}결제/정산 관련 내용 확인 후 안내드리겠습니다.",
                "${namePrefix}말씀하신 결제 건 확인 중입니다. 처리 완료 후 말씀드리겠습니다.",
                "네, 결제 관련 사항 확인 후 바로 연락드리겠습니다."
            )
            strippedTitle.contains("출발") || strippedTitle.contains("도착") || strippedTitle.contains("방문") || strippedTitle.contains("미팅") -> listOf(
                "안녕하세요 ${namePrefix}말씀해주신 시간에 맞춰 미리 준비하고 있겠습니다. 조심히 오세요!",
                "${namePrefix}도착하실 때쯤 연락 주시면 바로 안내해 드리겠습니다.",
                "네, 확인했습니다. 뵙고 자세히 말씀 나누겠습니다!"
            )
            sourceType == "MISSED_CALL" -> listOf(
                "안녕하세요 ${namePrefix}전화를 받지 못해 죄송합니다. 확인 후 곧 연락드리겠습니다.",
                "${namePrefix}현재 통화가 어려워 문자 먼저 드립니다. 용건 남겨주시면 확인 후 전화드리겠습니다.",
                "잠시 후 바로 전화드리겠습니다. 감사합니다."
            )
            sourceType == "CALL_RECORDING" -> listOf(
                "안녕하세요 ${namePrefix}방금 통화 감사드립니다. 말씀 나눈 내용 확인하여 진행 후 연락드리겠습니다.",
                "${namePrefix}통화 중 말씀해주신 사항 꼼꼼히 챙겨서 회신드리겠습니다.",
                "말씀해주신 내용 확인 후 빠르게 처리해 드리겠습니다. 감사합니다."
            )
            else -> listOf(
                "안녕하세요 ${namePrefix}말씀해주신 내용 확인했습니다. 빠르게 처리 후 안내드리겠습니다.",
                "${namePrefix}요청하신 사항 확인 중입니다. 정리되는 대로 곧 회신드리겠습니다.",
                "네, 확인 감사합니다. 곧 다시 연락드리겠습니다."
            )
        }
    }

    /**
     * 🎙️ 내 목소리(화자 성문 프로필) 등록 여부 조회 (GET /api/user/voice-profile)
     */
    suspend fun fetchVoiceProfile(userEmail: String): VoiceProfileResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "성문 프로필 조회 실패"

        for (host in hosts) {
            val endpoint = "$host/api/user/voice-profile"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .get()
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .build()

                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val isEnrolled = resJson.optBoolean("isEnrolled", false)
                    val status = resJson.optString("status", if (isEnrolled) "COMPLETED" else "IDLE")
                    val speakerObj = resJson.optJSONObject("speaker")
                    val speakerName = speakerObj?.optString("name", "본인") ?: if (isEnrolled) "본인" else null
                    return@withContext VoiceProfileResult(
                        success = true,
                        isEnrolled = isEnrolled,
                        status = status,
                        speakerName = speakerName
                    )
                } else {
                    lastError = resJson.optString("error", "HTTP ${response.code}")
                }
            } catch (e: Exception) {
                lastError = e.localizedMessage ?: "네트워크 오류"
            }
        }
        VoiceProfileResult(success = false, error = lastError)
    }

    /**
     * 🎙️ 5초 내 목소리 녹음 샘플 성문 영구 등록 (POST /api/user/voice-profile)
     */
    suspend fun enrollVoiceProfile(
        userEmail: String,
        audioBase64: String,
        fileName: String = "voice_sample.m4a"
    ): VoiceProfileEnrollResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "성문 등록 실패"

        val bodyJson = JSONObject().apply {
            put("userEmail", userEmail)
            put("audioBase64", audioBase64)
            put("fileName", fileName)
            put("displayName", "본인")
        }
        val mediaType = "application/json; charset=utf-8".toMediaType()
        val requestBody = bodyJson.toString().toRequestBody(mediaType)

        for (host in hosts) {
            val endpoint = "$host/api/user/voice-profile"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .post(requestBody)
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .build()

                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val status = resJson.optString("status", "COMPLETED")
                    return@withContext VoiceProfileEnrollResult(
                        success = true,
                        status = status,
                        message = resJson.optString("message", "음성 샘플이 안전하게 접수되었습니다.")
                    )
                } else {
                    lastError = resJson.optString("error", "HTTP ${response.code}")
                }
            } catch (e: Exception) {
                lastError = e.localizedMessage ?: "네트워크 오류"
            }
        }
        VoiceProfileEnrollResult(success = false, error = lastError)
    }

    /**
     * 🎙️ 등록된 성문 프로필 삭제 (DELETE /api/user/voice-profile)
     */
    suspend fun deleteVoiceProfile(userEmail: String): Boolean = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val endpoint = "$host/api/user/voice-profile"
            try {
                val request = Request.Builder()
                    .url(endpoint)
                    .delete()
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .build()

                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    return@withContext true
                }
            } catch (_: Exception) {}
        }
        false
    }

    /**
     * 🛍️ 카드 마켓플레이스 카탈로그 조회 (v2.2.0)
     * - 전체 공개 카드 및 내 계정 전용(Private) 카드 목록 반환
     */
    suspend fun fetchCardCatalog(userEmail: String): MarketplaceCatalogResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "카탈로그 조회 실패"

        for (host in hosts) {
            try {
                val encodedEmail = java.net.URLEncoder.encode(userEmail, "UTF-8")
                val endpoint = "$host/api/user/cards/catalog?email=$encodedEmail"
                val request = Request.Builder()
                    .url(endpoint)
                    .get()
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .build()

                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val cardsArray = resJson.optJSONArray("cards") ?: org.json.JSONArray()
                    val cardsList = mutableListOf<MarketplaceCardItemDto>()
                    for (i in 0 until cardsArray.length()) {
                        val c = cardsArray.optJSONObject(i) ?: continue
                        val manifestStr = c.optJSONObject("manifest")?.toString()
                            ?: c.optString("manifestJson").takeIf { it.isNotBlank() }
                            ?: c.optString("manifest_json").takeIf { it.isNotBlank() }
                        cardsList.add(
                            MarketplaceCardItemDto(
                                key = c.optString("key"),
                                title = c.optString("title"),
                                icon = c.optString("icon"),
                                category = c.optString("category", "all"),
                                categoryName = c.optString("categoryName", "일반"),
                                description = c.optString("description"),
                                badge = c.optString("badge").takeIf { it.isNotBlank() },
                                author = c.optString("author", "시트봇 공식"),
                                isExclusive = c.optBoolean("isExclusive", false),
                                isInstalledByDefault = c.optBoolean("isInstalledByDefault", false),
                                version = c.optString("version", "1.0.0"),
                                manifestJson = manifestStr
                            )
                        )
                    }
                    return@withContext MarketplaceCatalogResult(
                        success = true,
                        totalCount = resJson.optInt("totalCount", cardsList.size),
                        cards = cardsList
                    )
                } else {
                    lastError = resJson.optString("error", "서버 응답 오류 (HTTP ${response.code})")
                }
            } catch (e: Exception) {
                lastError = e.message ?: "네트워크 오류"
                Log.w(TAG, "[카탈로그 조회 예외] host: $host, error: $lastError")
            }
        }
        MarketplaceCatalogResult(success = false, error = lastError)
    }

    /**
     * 💡 맞춤 기능 제작 의뢰 및 신규 카드 출시 알림 예약 서버 DB 전송 (2중 안전망)
     */
    suspend fun submitFeatureRequest(
        requestType: String = "FEATURE_CUSTOM",
        cardKey: String? = null,
        title: String,
        description: String,
        contact: String,
        userEmail: String
    ): FeatureRequestResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "요청 접수 실패"

        val bodyJson = JSONObject().apply {
            put("requestType", requestType)
            put("cardKey", cardKey ?: "")
            put("title", title)
            put("description", description)
            put("contact", contact)
            put("userEmail", userEmail)
        }
        val requestBody = bodyJson.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            try {
                val endpoint = "$host/api/user/cards/request"
                val request = Request.Builder()
                    .url(endpoint)
                    .post(requestBody)
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .build()

                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    return@withContext FeatureRequestResult(
                        success = true,
                        message = resJson.optString("message", "요청이 성공적으로 접수되었습니다.")
                    )
                } else {
                    lastError = resJson.optString("error", "서버 응답 오류 (HTTP ${response.code})")
                }
            } catch (e: Exception) {
                lastError = e.message ?: "네트워크 연결 오류"
            }
        }
        FeatureRequestResult(success = false, error = lastError)
    }

    /**
     * 🛠️ 사용자 맞춤형 동적 카드 생성·등록 API (AI 자연어 설계 또는 안티그라비티 JSON 직접 등록)
     */
    suspend fun createCustomCard(
        userEmail: String,
        prompt: String? = null,
        title: String? = null,
        icon: String? = null,
        description: String? = null,
        manifestJson: String? = null
    ): CustomCardCreateResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "맞춤 카드 생성 실패"

        val bodyJson = JSONObject().apply {
            put("userEmail", userEmail)
            if (!prompt.isNullOrBlank()) put("prompt", prompt)
            if (!title.isNullOrBlank()) put("title", title)
            if (!icon.isNullOrBlank()) put("icon", icon)
            if (!description.isNullOrBlank()) put("description", description)
            if (!manifestJson.isNullOrBlank()) put("manifestJson", manifestJson)
        }
        val requestBody = bodyJson.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            try {
                val endpoint = "$host/api/user/cards/custom"
                val request = Request.Builder()
                    .url(endpoint)
                    .post(requestBody)
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .build()

                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val c = resJson.optJSONObject("card")
                    val createdDto = if (c != null) {
                        val mStr = c.optJSONObject("manifest")?.toString()
                            ?: c.optString("manifestJson").takeIf { it.isNotBlank() }
                        MarketplaceCardItemDto(
                            key = c.optString("key"),
                            title = c.optString("title"),
                            icon = c.optString("icon", "⚡"),
                            category = c.optString("category", "exclusive"),
                            categoryName = c.optString("categoryName", "나만의 맞춤 카드"),
                            description = c.optString("description"),
                            badge = c.optString("badge", "맞춤"),
                            author = c.optString("author", "맞춤 제작"),
                            isExclusive = c.optBoolean("isExclusive", true),
                            isInstalledByDefault = false,
                            version = c.optString("version", "1.0.0"),
                            manifestJson = mStr
                        )
                    } else null

                    return@withContext CustomCardCreateResult(
                        success = true,
                        message = resJson.optString("message", "나만의 카드가 생성되었습니다."),
                        card = createdDto
                    )
                } else {
                    lastError = resJson.optString("error", "서버 응답 오류 (HTTP ${response.code})")
                }
            } catch (e: Exception) {
                lastError = e.message ?: "네트워크 연결 오류"
            }
        }
        CustomCardCreateResult(success = false, error = lastError)
    }

    /**
     * 🚀 동적 카드(Server-Driven Dynamic Card) 실행 API (파일 첨부 + 텍스트 필드 + AI 판독 + 시트 기록)
     */
    suspend fun executeDynamicCard(
        userEmail: String,
        cardKey: String,
        cardTitle: String,
        manifestJson: String?,
        fields: Map<String, String>,
        attachedFile: java.io.File? = null
    ): DynamicCardExecuteResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "동적 카드 실행 실패"

        val fieldsJsonObj = JSONObject()
        fields.forEach { (k, v) -> fieldsJsonObj.put(k, v) }

        for (host in hosts) {
            try {
                val endpoint = "$host/api/cards/dynamic/execute"
                val multipartBuilder = MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart("userEmail", userEmail)
                    .addFormDataPart("cardKey", cardKey)
                    .addFormDataPart("cardTitle", cardTitle)
                    .addFormDataPart("fieldsJson", fieldsJsonObj.toString())

                if (!manifestJson.isNullOrBlank()) {
                    multipartBuilder.addFormDataPart("manifestJson", manifestJson)
                }

                if (attachedFile != null && attachedFile.exists()) {
                    val mime = if (attachedFile.name.endsWith(".png", true)) "image/png" else "image/jpeg"
                    multipartBuilder.addFormDataPart(
                        "file",
                        attachedFile.name,
                        attachedFile.asRequestBody(mime.toMediaTypeOrNull())
                    )
                    multipartBuilder.addFormDataPart("fileName", attachedFile.name)
                }

                val request = Request.Builder()
                    .url(endpoint)
                    .post(multipartBuilder.build())
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .build()

                val response = client.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    return@withContext DynamicCardExecuteResult(
                        success = true,
                        summary = resJson.optString("summary", "성공적으로 처리되었습니다."),
                        message = resJson.optString("message", "시트에 기록되었습니다."),
                        spreadsheetUrl = resJson.optString("spreadsheetUrl").takeIf { it.isNotBlank() },
                        driveFileUrl = resJson.optString("driveFileUrl").takeIf { it.isNotBlank() }
                    )
                } else {
                    lastError = resJson.optString("error", "서버 오류 (HTTP ${response.code})")
                }
            } catch (e: Exception) {
                lastError = e.message ?: "네트워크 오류"
            }
        }
        DynamicCardExecuteResult(success = false, error = lastError)
    }

    /**
     * 🔐 SaaS 휴대폰 인증번호(OTP) 발송 이력을 사용자의 구글 스프레드시트([SheetBot] SaaS 인증발송 대장)에 자동 기록
     */
    suspend fun logSaasOtpToGoogleSheet(
        userEmail: String,
        brandName: String,
        recipientPhone: String,
        purpose: String,
        maskedCode: String,
        status: String,
        elapsedMs: Long = 0L,
        verifiedStatus: String = "⏳ 미인증 (대기중)"
    ): Boolean = withContext(Dispatchers.IO) {
        if (userEmail.isBlank() || userEmail.endsWith("@filetosheet.cloud")) return@withContext false
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val payload = JSONObject().apply {
            put("userEmail", userEmail)
            put("brandName", brandName)
            put("recipientPhone", recipientPhone)
            put("purpose", purpose)
            put("maskedCode", maskedCode)
            put("status", status)
            put("elapsedMs", elapsedMs)
            put("verifiedStatus", verifiedStatus)
            put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
        }
        val body = payload.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/saas-otp/log"
            try {
                val req = Request.Builder()
                    .url(endpoint)
                    .post(body)
                    .addHeader("x-sheetbot-user-email", userEmail)
                    .build()
                client.newCall(req).execute().use { res ->
                    if (res.isSuccessful) return@withContext true
                }
            } catch (_: Exception) {}
        }
        false
    }
}

data class FeatureRequestResult(
    val success: Boolean,
    val message: String = "",
    val error: String? = null
)

data class TaskItemDto(
    val id: Long,
    val title: String,
    val description: String? = null,
    val contactName: String? = null,
    val contactPhone: String? = null,
    val dueDate: String? = null,
    val priority: String = "NORMAL ⚪",
    val status: String = "PENDING",
    val badgeText: String? = null,
    val sourceType: String = "SMS",
    val createdAt: String = "",
    val deepLink: String? = null
)

data class TaskListResult(
    val success: Boolean,
    val tasks: List<TaskItemDto> = emptyList(),
    val totalCount: Int = 0,
    val pendingCount: Int = 0,
    val doneCount: Int = 0,
    val spreadsheetUrl: String? = null,
    val error: String? = null
)

data class VoiceProfileResult(
    val success: Boolean,
    val isEnrolled: Boolean = false,
    val status: String? = null,
    val speakerName: String? = null,
    val error: String? = null
)

data class VoiceProfileEnrollResult(
    val success: Boolean,
    val status: String? = null,
    val message: String? = null,
    val error: String? = null
)

data class CallSummaryResult(
    val success: Boolean,
    val found: Boolean = false,
    val phone: String = "",
    val cleanPhone: String = "",
    val name: String = "",
    val company: String = "",
    val position: String = "",
    val memo: String = "",
    val lastCallTime: String = "",
    val lastCallSummary: String = "",
    val actionItems: String = "",
    val pendingTasks: List<TaskItemDto> = emptyList(),
    val lastMissedCallTime: String = "",
    val rawJson: String? = null,
    val error: String? = null
)

data class ContactSyncResult(
    val success: Boolean,
    val totalCount: Int = 0,
    val insertedCount: Int = 0,
    val updatedCount: Int = 0,
    val spreadsheetUrl: String = "",
    val message: String = "",
    val error: String? = null
)


data class UploadQuoteImageResult(
    val success: Boolean,
    val imageUrl: String? = null,
    val businessName: String? = null,
    val message: String? = null,
    val error: String? = null
)

data class BusinessProfileResult(
    val success: Boolean,
    val businessName: String = "",
    val phone: String = "",
    val imageUrl: String = "",
    val error: String? = null
)


data class PairResult(
    val success: Boolean,
    val userEmail: String? = null,
    val deviceToken: String? = null,
    val visitorSessionId: String? = null,
    val requiresWorkspaceOAuth: Boolean = false,
    val oauthStartUrl: String? = null,
    val webhookUrl: String? = null,
    val fallbackWebhookUrl: String? = null,
    val heartbeatUrl: String? = null,
    val fallbackHeartbeatUrl: String? = null,
    val message: String? = null,
    val referralMessage: String? = null,
    val error: String? = null
)


data class WebhookResult(
    val statusCode: Int,
    val success: Boolean,
    val message: String,
    val replySmsPhone: String? = null,
    val replySmsText: String? = null,
    val ttsText: String? = null,
    val depositorName: String? = null,
    val amountKrw: Long = 0L
)

data class SmsSyncResult(
    val success: Boolean,
    val replySmsPhone: String? = null,
    val replySmsText: String? = null,
    val depositorName: String? = null,
    val amountKrw: Long = 0L,
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
    val logId: String? = null,
    val recipientPhone: String,
    val depositorName: String,
    val amountKrw: Int,
    val tokensToCredit: Int,
    val message: String
)

data class PingResult(
    val isOnline: Boolean,
    val latencyMs: Long = 0,
    val connectedHost: String = "",
    val error: String? = null
)

data class UploadRecordingResult(
    val success: Boolean,
    val fileId: String? = null,
    val fileName: String? = null,
    val webViewLink: String? = null,
    val spreadsheetUrl: String? = null,
    val error: String? = null
)

data class UploadGenericFileResult(
    val success: Boolean,
    val fileId: String? = null,
    val fileName: String? = null,
    val folderName: String? = null,
    val webViewLink: String? = null,
    val spreadsheetUrl: String? = null,
    val message: String? = null,
    val error: String? = null,
    val ocrType: String? = null,
    val ocrData: JSONObject? = null,
    val jobId: String? = null,
    val status: String? = null
)

data class BookmarkResult(
    val success: Boolean,
    val category: String = "🌐 웹사이트",
    val title: String? = null,
    val url: String? = null,
    val siteName: String? = null,
    val aiSummary: String? = null,
    val spreadsheetUrl: String? = null,
    val message: String? = null,
    val error: String? = null
)


data class WalletBalanceResult(
    val success: Boolean,
    val userEmail: String = "",
    val balanceTokens: Long = 0L,
    val tier: String = "FREE",
    val error: String? = null
)

data class DepositSessionResult(
    val success: Boolean,
    val requestId: String = "",
    val depositCode: String = "",
    val depositorName: String = "",
    val amountKrw: Int = 0,
    val originalAmountKrw: Int = 0,
    val discountKrw: Int = 0,
    val tokensToCredit: Int = 0,
    val bankName: String = "카카오뱅크",
    val accountNumber: String = "",
    val accountHolder: String = "",
    val tossUrl: String = "",
    val qrImageUrl: String = "",
    val expiresAt: String = "",
    val error: String? = null
)

data class FtsSearchMatchedRow(
    val projectId: String,
    val projectName: String,
    val sheetName: String,
    val rowNumber: Int,
    val rawRowIndex: Int,
    val serialNumber: String = "",
    val approvalStatus: String = "PENDING",
    val primaryTitle: String,
    val primarySubtitle: String = "",
    val timestampText: String = "",
    val amountText: String = "",
    val phoneNumber: String = "",
    val audioFileName: String = "",
    val matchedFields: List<Pair<String, String>> = emptyList(),
    val rowJson: JSONObject = JSONObject(),
    val headers: List<String> = emptyList()
)

data class AiCommandResult(
    val success: Boolean,
    val command: String? = null,
    val actionType: String = "GENERAL_ASSIST",
    val explanation: String? = null,
    val spokenResult: String? = null,
    val canPromote: Boolean = false,
    val suggestedFunctionTitle: String? = null,
    val spreadsheetId: String? = null,
    val matchedProjectsCount: Int = 0,
    val matchedSheetsCount: Int = 0,
    val totalMatchedCount: Int = 0,
    val queryKeywords: List<String> = emptyList(),
    val matchedRows: List<FtsSearchMatchedRow> = emptyList(),
    val details: JSONObject? = null,
    val error: String? = null
)

data class CommandPromoteResult(
    val success: Boolean,
    val functionName: String? = null,
    val functionTitle: String? = null,
    val message: String? = null,
    val spokenResult: String? = null,
    val error: String? = null
)

data class CommandSuggestionItem(
    val id: String,
    val type: String,
    val label: String,
    val command: String,
    val description: String = "",
    val functionName: String? = null,
    val projectName: String? = null
)

data class CommandCapabilitiesResult(
    val success: Boolean,
    val suggestions: List<CommandSuggestionItem> = emptyList(),
    val totalProjects: Int = 0,
    val error: String? = null
)

data class ReferralInfoResult(
    val success: Boolean,
    val userEmail: String = "",
    val myCode: String = "",
    val inviteUrl: String = "",
    val apkInviteUrl: String = "",
    val shareText: String = "",
    val inviteCount: Int = 0,
    val earnedTokens: Int = 0,
    val hasClaimedReward: Boolean = false,
    val error: String? = null
)

data class ReferralClaimResult(
    val success: Boolean,
    val message: String = "",
    val rewardTokens: Int = 10000,
    val inviterEmail: String = "",
    val error: String? = null
)

data class AddTabResult(
    val success: Boolean,
    val spreadsheetId: String? = null,
    val spreadsheetUrl: String? = null,
    val sheetTitle: String? = null,
    val tabName: String? = null,
    val isNewTab: Boolean = false,
    val message: String? = null,
    val error: String? = null
)

data class ProvisionSheetResult(
    val success: Boolean,
    val isNew: Boolean = false,
    val spreadsheetId: String? = null,
    val spreadsheetUrl: String? = null,
    val folderId: String? = null,
    val folderUrl: String? = null,
    val folderName: String? = null,
    val title: String? = null,
    val message: String? = null,
    val error: String? = null,
    val errorCode: String? = null,
    val oauthUrl: String? = null
)

data class WebsiteCheckResult(
    val isOnline: Boolean,
    val statusCode: Int,
    val responseTimeMs: Long,
    val errorMessage: String? = null,
    val checkedUrl: String = ""
)

data class KakaoImportResult(
    val success: Boolean,
    val chatRoomName: String? = null,
    val totalCount: Int = 0,
    val insertedCount: Int = 0,
    val startDate: String? = null,
    val endDate: String? = null,
    val sheetUrl: String? = null,
    val message: String? = null,
    val error: String? = null
)

data class LawAdvisoryResult(
    val success: Boolean,
    val advisoryId: String = "",
    val executiveSummary: String = "",
    val lawTitle: String = "",
    val lawLink: String = "",
    val caseNumber: String = "",
    val rulingSummary: String = "",
    val reportUrl: String = "",
    val sheetUrl: String = "",
    val fileDriveUrl: String = "",
    val documentSummary: String = "",
    val error: String? = null
)

data class BlogPostResult(
    val success: Boolean,
    val blogId: String = "",
    val title: String = "",
    val summary: String = "",
    val charCount: Int = 0,
    val imageCount: Int = 0,
    val reportUrl: String = "",
    val sheetUrl: String = "",
    val naverPostUrl: String = "",
    val naverBlogId: String = "",
    val naverBlogUrl: String = "",
    val naverWriteUrl: String = "",
    val driveFolderUrl: String = "",
    val tags: List<String> = emptyList(),
    val error: String? = null
)

data class InstagramPostResult(
    val success: Boolean,
    val instagramId: String = "",
    val hook: String = "",
    val caption: String = "",
    val hashtags: String = "",
    val summary: String = "",
    val imageCount: Int = 0,
    val reportUrl: String = "",
    val sheetUrl: String = "",
    val instagramPostUrl: String = "",
    val instagramHandle: String = "",
    val instagramAccountUrl: String = "",
    val driveFolderUrl: String = "",
    val error: String? = null
)

data class MobileSiteResult(
    val success: Boolean,
    val siteId: String = "",
    val title: String = "",
    val slogan: String = "",
    val description: String = "",
    val category: String = "",
    val siteUrl: String = "",
    val sheetUrl: String = "",
    val notice: String = "",
    val bannerCount: Int = 0,
    val driveFolderUrl: String = "",
    val error: String? = null
)

data class MarketplaceCardItemDto(
    val key: String,
    val title: String,
    val icon: String,
    val category: String = "all",
    val categoryName: String = "일반",
    val description: String = "",
    val badge: String? = null,
    val author: String = "시트봇 공식",
    val isExclusive: Boolean = false,
    val isInstalledByDefault: Boolean = false,
    val version: String = "1.0.0",
    val manifestJson: String? = null
)

data class MarketplaceCatalogResult(
    val success: Boolean,
    val totalCount: Int = 0,
    val cards: List<MarketplaceCardItemDto> = emptyList(),
    val error: String? = null
)

data class CustomCardCreateResult(
    val success: Boolean,
    val message: String = "",
    val card: MarketplaceCardItemDto? = null,
    val error: String? = null
)

data class DynamicCardExecuteResult(
    val success: Boolean,
    val summary: String = "",
    val message: String = "",
    val spreadsheetUrl: String? = null,
    val driveFileUrl: String? = null,
    val error: String? = null
)


