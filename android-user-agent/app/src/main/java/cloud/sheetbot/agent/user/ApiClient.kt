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
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

object ApiClient {
    private const val TAG = "SheetBotApiClient"
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    // 1차 메인 호스트: 이지데스크 운영 공식 터널 (Zero-Latency 즉시 직결)
    const val PRIMARY_HOST = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot"
    // 2차 백업 호스트
    const val FALLBACK_HOST = "https://sheetbot.cloud"

    // 빠른 2단계 폴백을 위한 타임아웃 최적화 (1차 서버 장애 시 3.5초 내 2차로 즉시 전환)
    private val client = OkHttpClient.Builder()
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
        pinCode: String? = null
    ): PairResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "페어링 요청 실패"

        for ((index, host) in hosts.withIndex()) {
            val endpoint = "$host/api/user/agent2/pair"
            Log.i(TAG, "[이용자 페어링 시도 ${index + 1}/${hosts.size}] 엔드포인트: $endpoint")

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
                        deviceToken = resJson.optString("deviceId", resJson.optString("deviceToken", "")),
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
        referralCode: String? = null
    ): PairResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "구글 로그인 페어링 실패"

        for ((index, host) in hosts.withIndex()) {
            val endpoint = "$host/api/user/agent2/pair-google"
            Log.i(TAG, "[구글 로그인 페어링 시도 ${index + 1}/${hosts.size}] 엔드포인트: $endpoint")

            try {
                val json = JSONObject().apply {
                    if (!idToken.isNullOrBlank()) put("idToken", idToken)
                    if (!userEmail.isNullOrBlank()) put("userEmail", userEmail)
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
                    Log.i(TAG, "🎉 [구글 로그인 페어링 성공] 이메일: $finalEmail ($host)")
                    return@withContext PairResult(
                        success = true,
                        userEmail = finalEmail,
                        deviceToken = resJson.optString("token", ""),
                        webhookUrl = resJson.optString("webhookUrl", "$PRIMARY_HOST/api/webhooks/dispatch"),
                        fallbackWebhookUrl = resJson.optString("fallbackWebhookUrl", "$FALLBACK_HOST/api/webhooks/dispatch"),
                        heartbeatUrl = "$PRIMARY_HOST/api/user/agent2/heartbeat",
                        fallbackHeartbeatUrl = "$FALLBACK_HOST/api/user/agent2/heartbeat",
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
     */
    suspend fun pingServer(): PingResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val endpoint = "$host/api/wallet/agent/version"
            try {
                val request = Request.Builder().url(endpoint).get().build()
                val startTime = System.currentTimeMillis()
                val response = client.newCall(request).execute()
                val elapsed = System.currentTimeMillis() - startTime
                if (response.isSuccessful) {
                    return@withContext PingResult(
                        isOnline = true,
                        latencyMs = elapsed,
                        connectedHost = host
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "서버 핑 확인 실패 ($host): ${e.message}")
            }
        }
        PingResult(isOnline = false, error = "서버 및 터널 응답 없음")
    }

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
            // 1단계: 가벼운 HEAD 요청 시도
            val headRequest = Request.Builder()
                .url(normalizedUrl)
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) SheetBotSentinel/1.0")
                .head()
                .build()

            var response = try {
                client.newCall(headRequest).execute()
            } catch (_: Exception) {
                null
            }

            // HEAD가 지원되지 않거나 405 Method Not Allowed인 경우 GET으로 재시도
            if (response == null || response.code == 405) {
                val getRequest = Request.Builder()
                    .url(normalizedUrl)
                    .header("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) SheetBotSentinel/1.0")
                    .get()
                    .build()
                response = client.newCall(getRequest).execute()
            }

            val elapsed = System.currentTimeMillis() - startTime
            val statusCode = response.code
            val isOk = response.isSuccessful || statusCode in 200..399

            WebsiteCheckResult(
                isOnline = isOk,
                statusCode = statusCode,
                responseTimeMs = elapsed,
                errorMessage = if (!isOk) "HTTP $statusCode ${response.message}" else null,
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
            val response = client.newCall(request).execute()
            response.isSuccessful || response.code == 204
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
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    return@withContext true
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
     * 이용자 스마트폰에 수신된 고객 SMS를 시트봇 서버 대장으로 전송 및 스마트 주문 매칭 응답 파싱
     */
    suspend fun sendInboundSms(
        userEmail: String,
        sender: String,
        message: String,
        deviceId: String? = null
    ): SmsSyncResult = withContext(Dispatchers.IO) {
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
        // 1. [1순위] 터널 안심 청크 분할 업로드 (ChunkedUploader)
        try {
            val chunkResult = ChunkedUploader.uploadFileChunked(
                file = file,
                fileName = fileName,
                mimeType = "audio/m4a",
                userEmail = userEmail,
                folderName = folderName,
                autoRecordSheet = autoRecordSheet,
                isCallRecording = true,
                contactName = contactName,
                callTime = callTime,
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
                Log.w(TAG, "통화 녹음 청크 업로드 실패, 기존 단일 업로드로 폴백: ${chunkResult.error}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "통화 녹음 청크 업로드 예외, 단일 업로드 폴백: ${e.message}")
        }

        // 2. [2순위 폴백] 기존 단일 Base64 업로드
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
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastErr = "법률 자문 요청 실패"

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
                        .addFormDataPart("file", fileName ?: file.name, fileBody)
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
                    return@withContext LawAdvisoryResult(
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
                } else {
                    val msg = resJson.optString("error", "HTTP ${response.code}")
                    lastErr = "$host: $msg"
                }
            } catch (e: Exception) {
                lastErr = "$host: ${e.message}"
            }
        }
        LawAdvisoryResult(success = false, error = lastErr)
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
     * 스마트폰 자연어(음성/텍스트) 명령으로 구글 시트 Apps Script 원격 구동 (v1.7)
     */
    suspend fun executeAiCommand(
        userEmail: String,
        command: String,
        spreadsheetId: String? = null,
        deviceId: String? = null
    ): AiCommandResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val json = JSONObject().apply {
            put("userEmail", userEmail)
            put("command", command)
            if (!spreadsheetId.isNullOrBlank()) put("spreadsheetId", spreadsheetId)
            put("deviceId", deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
        }
        val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (host in hosts) {
            val endpoint = "$host/api/user/commands/execute"
            try {
                val request = Request.Builder().url(endpoint).post(body).build()
                val response = longTimeoutClient.newCall(request).execute()
                val resStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    Log.i(TAG, "🎉 [자연어 명령 실행 성공] $command")
                    return@withContext AiCommandResult(
                        success = true,
                        command = resJson.optString("command", command),
                        actionType = resJson.optString("actionType", "GENERAL_ASSIST"),
                        explanation = resJson.optString("explanation", "명령이 처리되었습니다."),
                        spokenResult = resJson.optString("spokenResult", "요청하신 시트 명령이 완료되었습니다."),
                        details = resJson.optJSONObject("details")
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
     * 카카오톡 대화 내용 내보내기(.txt) 파일 일괄 파싱 및 구글 시트 구간 덮어쓰기 (v2.1.11)
     */
    suspend fun importKakaoChat(
        userEmail: String,
        textContent: String,
        fileName: String = "KakaoTalkChats.txt",
        sheetTitle: String = "[SheetBot] 카카오톡 메시지 대장"
    ): KakaoImportResult = withContext(Dispatchers.IO) {
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
                    } else {
                        return@withContext KakaoImportResult(
                            success = false,
                            error = resJson.optString("error", "카카오톡 대화 파싱에 실패했습니다.")
                        )
                    }
                } else if (!response.isSuccessful && resBody.isNotBlank()) {
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
        KakaoImportResult(success = false, error = "서버와의 통신에 실패했습니다. 네트워크를 확인해 주세요.")
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
                    lastError = resJson.optString("error", "HTTP ${response.code}")
                }
            } catch (e: Exception) {
                lastError = "[$host] ${e.localizedMessage ?: "통신 오류"}"
            }
        }
        ProvisionSheetResult(success = false, error = lastError)
    }

    /**
     * 사장님 상호명/프로필 조회
     */
    suspend fun getBusinessProfile(email: String): BusinessProfileResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "프로필 조회 실패"

        for (host in hosts) {
            val endpoint = "$host/api/user/profile?email=$email"
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
     * 견적 웹앱 및 카카오톡 미리보기용 대표 이미지 파일 업로드
     */
    suspend fun uploadQuoteImage(
        fileBytes: ByteArray,
        fileName: String,
        mimeType: String,
        userEmail: String
    ): UploadQuoteImageResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        val base64Str = android.util.Base64.encodeToString(fileBytes, android.util.Base64.NO_WRAP)
        val json = JSONObject().apply {
            put("email", userEmail)
            put("userEmail", userEmail)
            put("fileName", fileName)
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
                    Log.i(TAG, "📷 [견적 대표 이미지 업로드 성공] $imageUrl")
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
                Log.w(TAG, "[$endpoint] 견적 이미지 업로드 예외: ${e.message}")
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
        source: String = "ALL"
    ): TaskListResult = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        var lastError = "할 일 목록 조회 실패"

        for (host in hosts) {
            val endpoint = "$host/api/user/tasks?status=$status&source=$source"
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
                    val taskList = mutableListOf<TaskItemDto>()
                    val tasksArr = resJson.optJSONArray("tasks")
                    if (tasksArr != null) {
                        for (i in 0 until tasksArr.length()) {
                            val obj = tasksArr.optJSONObject(i) ?: continue
                            taskList.add(
                                TaskItemDto(
                                    id = obj.optLong("id", 0L),
                                    title = obj.optString("title", ""),
                                    description = obj.optString("description", null),
                                    contactName = obj.optString("contact_name", null),
                                    contactPhone = obj.optString("contact_phone", null),
                                    dueDate = obj.optString("due_date", null),
                                    priority = obj.optString("priority", "NORMAL ⚪"),
                                    status = obj.optString("status", "PENDING"),
                                    badgeText = obj.optString("badge_text", null),
                                    sourceType = obj.optString("source_type", "SMS"),
                                    createdAt = obj.optString("created_at", "")
                                )
                            )
                        }
                    }

                    return@withContext TaskListResult(
                        success = true,
                        tasks = taskList,
                        totalCount = resJson.optInt("totalCount", taskList.size),
                        pendingCount = resJson.optInt("pendingCount", 0),
                        doneCount = resJson.optInt("doneCount", 0),
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
        nextStatus: String
    ): Boolean = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
        for (host in hosts) {
            val endpoint = "$host/api/user/tasks"
            try {
                val json = JSONObject().apply {
                    put("taskId", taskId)
                    put("status", nextStatus)
                }
                val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
                val request = Request.Builder()
                    .url(endpoint)
                    .patch(body)
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
     * 신규 할 일 수동 등록 (POST /api/user/tasks)
     */
    suspend fun createTask(
        userEmail: String,
        title: String,
        contactName: String? = null,
        contactPhone: String? = null,
        dueDate: String? = null,
        priority: String = "HIGH 🟡",
        badgeText: String = "모바일 등록"
    ): Boolean = withContext(Dispatchers.IO) {
        val hosts = listOf(PRIMARY_HOST, FALLBACK_HOST)
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
                    return@withContext true
                }
            } catch (_: Exception) {}
        }
        false
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
}

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
    val createdAt: String = ""
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

data class AiCommandResult(
    val success: Boolean,
    val command: String? = null,
    val actionType: String = "GENERAL_ASSIST",
    val explanation: String? = null,
    val spokenResult: String? = null,
    val details: JSONObject? = null,
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
    val error: String? = null
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


