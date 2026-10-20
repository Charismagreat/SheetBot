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

/**
 * ⚡ 파일투시트(FileToSheet) 직결 페어링 및 Ingest API 클라이언트
 *
 * 공식 가이드 기술 명세서(SheetBot_Mobile_Integration_Guide.md) 준수:
 * - API 1: GET /api/inbox/{token} (토큰 유효성 및 대상 시트 페어링 검증)
 * - API 2 [방식 A]: POST /api/inbox/{token} (Multipart/Form-Data 사진/바이너리 파일 직결 전송)
 * - API 2 [방식 B]: POST /api/inbox/{token} (Application/JSON 정형 데이터 직접 전송)
 */
data class FtsPairingResult(
    val success: Boolean,
    val valid: Boolean = false,
    val token: String = "",
    val endpoint: String = "",
    val sheetName: String = "",
    val projectName: String = "",
    val projectId: String = "",
    val message: String? = null,
    val error: String? = null
)

data class FtsDefaultSheet(
    val type: String,
    val sheetName: String,
    val token: String,
    val webhookUrl: String
)

data class FtsVerifyResult(
    val success: Boolean,
    val message: String? = null,
    val projectId: String? = null,
    val projectName: String? = null,
    val defaultSheets: List<FtsDefaultSheet> = emptyList(),
    val error: String? = null
)

data class FtsEnsureSheetResult(
    val success: Boolean,
    val isNew: Boolean = false,
    val projectId: String? = null,
    val projectName: String? = null,
    val sheetType: String? = null,
    val sheetName: String? = null,
    val token: String? = null,
    val webhookUrl: String? = null,
    val error: String? = null
)

data class FtsUploadResult(
    val success: Boolean,
    val message: String? = null,
    val targetSheet: String? = null,
    val projectId: String? = null,
    val token: String? = null,
    val data: JSONObject? = null,
    val error: String? = null
)

object FileToSheetClient {
    private const val TAG = "FileToSheetClient"
    const val FTS_OFFICIAL_DOMAIN = "https://file2sheet.cloud"
    const val FTS_TUNNEL_BASE = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/FileToSheet"

    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /**
     * ⚡ 파일투시트 Ingest 엔드포인트 지능형 정규화
     * - QR코드에서 전달된 endpoint가 0.0.0.0, 127.0.0.1, localhost 등 사설/루프백 주소이거나 비어있을 경우,
     *   즉시 작동하는 공용 터널 URL로 자동 보정.
     * - 구 도메인(filetosheet.com) 오타/미등록 주소도 공식 터널/도메인으로 안전 보정.
     */
    fun normalizeEndpoint(rawEndpoint: String?, token: String): String {
        val trimmed = rawEndpoint?.trim().orEmpty()
        val cleanToken = token.trim()
        if (trimmed.isBlank() ||
            trimmed.contains("0.0.0.0") ||
            trimmed.contains("localhost") ||
            trimmed.contains("127.0.0.1") ||
            trimmed.contains("filetosheet.com")
        ) {
            return if (cleanToken.isNotBlank()) "$FTS_TUNNEL_BASE/api/inbox/$cleanToken" else FTS_TUNNEL_BASE
        }
        return trimmed
    }

    /**
     * 보조 터널 폴백 엔드포인트 계산
     */
    fun getTunnelFallbackEndpoint(endpoint: String, token: String? = null): String {
        val cleanToken = token?.takeIf { it.isNotBlank() }
            ?: endpoint.substringAfterLast("/inbox/").substringBefore("?").trim()
        return if (cleanToken.isNotBlank()) "$FTS_TUNNEL_BASE/api/inbox/$cleanToken" else FTS_TUNNEL_BASE
    }

    /**
     * API 1. 토큰 유효성 및 페어링 검증 (GET)
     * URL: {endpoint} 또는 공식 터널/도메인
     */
    suspend fun verifyPairing(endpoint: String): FtsPairingResult = withContext(Dispatchers.IO) {
        val primaryResult = doVerifyPairing(endpoint)
        if (primaryResult.success && primaryResult.valid) {
            return@withContext primaryResult
        }

        // 1차 시도 실패 시 (예: file2sheet.cloud DNS 전파 중이거나 사설 IP), 공용 터널로 자동 폴백 재시도
        if (!endpoint.contains("tunneling-service.onrender.com")) {
            val fallbackUrl = getTunnelFallbackEndpoint(endpoint)
            if (fallbackUrl.isNotBlank() && fallbackUrl != endpoint) {
                Log.w(TAG, "🔄 [FTS 페어링 터널 폴백 시도] $endpoint -> $fallbackUrl")
                val fallbackResult = doVerifyPairing(fallbackUrl)
                if (fallbackResult.success && fallbackResult.valid) {
                    return@withContext fallbackResult.copy(endpoint = fallbackUrl)
                }
            }
        }
        return@withContext primaryResult
    }

    private fun doVerifyPairing(endpoint: String): FtsPairingResult {
        try {
            Log.i(TAG, "🔍 [FTS 페어링 검증] URL: $endpoint")
            val request = Request.Builder()
                .url(endpoint)
                .header("Accept", "application/json")
                .get()
                .build()

            val response = client.newCall(request).execute()
            val bodyString = response.body?.string() ?: ""
            val json = try { JSONObject(bodyString) } catch (_: Exception) { JSONObject() }

            val isSuccess = response.isSuccessful && (json.optBoolean("success", false) || json.optBoolean("valid", false))
            if (isSuccess) {
                val token = json.optString("token", "")
                val sheetName = json.optString("sheetName", "")
                val projectName = json.optString("projectName", "")
                val projectId = json.optString("projectId", "")
                val message = json.optString("message", "페어링 성공")
                Log.i(TAG, "🎉 [FTS 페어링 성공] 시트: $sheetName (프로젝트: $projectName)")
                return FtsPairingResult(
                    success = true,
                    valid = true,
                    token = token,
                    endpoint = endpoint,
                    sheetName = sheetName,
                    projectName = projectName,
                    projectId = projectId,
                    message = message
                )
            } else {
                val errMsg = json.optString("error", "HTTP ${response.code}")
                Log.w(TAG, "⚠️ [FTS 페어링 실패] $errMsg")
                return FtsPairingResult(
                    success = false,
                    valid = false,
                    error = errMsg
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "🚨 [FTS 페어링 예외] ${e.message}", e)
            return FtsPairingResult(
                success = false,
                valid = false,
                error = e.localizedMessage ?: "네트워크 연결 실패"
            )
        }
    }

    /**
     * API 2. [방식 A] 사진/파일 직접 전송 (POST multipart/form-data)
     */
    suspend fun uploadFile(
        endpoint: String,
        file: File,
        mimeType: String = "image/jpeg",
        memo: String? = null,
        ocrType: String? = null,
        deviceId: String? = null
    ): FtsUploadResult = withContext(Dispatchers.IO) {
        val devId = deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL}"
        val primaryResult = doUploadFile(endpoint, file, mimeType, memo, ocrType, devId)
        if (primaryResult.success) {
            return@withContext primaryResult
        }

        // 파일 전송 실패 시 공용 터널로 1회 자동 재시도
        if (!endpoint.contains("tunneling-service.onrender.com")) {
            val fallbackUrl = getTunnelFallbackEndpoint(endpoint)
            if (fallbackUrl.isNotBlank() && fallbackUrl != endpoint) {
                Log.w(TAG, "🔄 [FTS 파일 전송 터널 폴백 시도] $endpoint -> $fallbackUrl")
                return@withContext doUploadFile(fallbackUrl, file, mimeType, memo, ocrType, devId)
            }
        }
        return@withContext primaryResult
    }

    private fun doUploadFile(
        endpoint: String,
        file: File,
        mimeType: String,
        memo: String?,
        ocrType: String?,
        devId: String
    ): FtsUploadResult {
        try {
            Log.i(TAG, "🚀 [FTS 파일 전송] ${file.name} (${file.length() / 1024} KB) -> $endpoint (ocrType: $ocrType)")
            val multipartBuilder = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                    "file",
                    file.name,
                    file.asRequestBody(mimeType.toMediaTypeOrNull())
                )

            if (!memo.isNullOrBlank()) {
                multipartBuilder.addFormDataPart("memo", memo)
            }
            if (!ocrType.isNullOrBlank()) {
                multipartBuilder.addFormDataPart("ocrType", ocrType)
            }
            multipartBuilder.addFormDataPart("deviceId", devId)

            val request = Request.Builder()
                .url(endpoint)
                .post(multipartBuilder.build())
                .build()

            val response = client.newCall(request).execute()
            val bodyString = response.body?.string() ?: ""
            val json = try { JSONObject(bodyString) } catch (_: Exception) { JSONObject() }

            if (response.isSuccessful && json.optBoolean("success", false)) {
                val message = json.optString("message", "적재 완료")
                val targetSheet = json.optString("targetSheet", "")
                val projectId = json.optString("projectId", "")
                val token = json.optString("token", "")
                val data = json.optJSONObject("data")
                Log.i(TAG, "🎉 [FTS 파일 전송 완료] $message (targetSheet: $targetSheet)")
                return FtsUploadResult(
                    success = true,
                    message = message,
                    targetSheet = targetSheet,
                    projectId = projectId,
                    token = token,
                    data = data
                )
            } else {
                val errMsg = json.optString("error", "HTTP ${response.code}")
                Log.w(TAG, "⚠️ [FTS 파일 전송 실패] $errMsg")
                return FtsUploadResult(
                    success = false,
                    error = errMsg
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "🚨 [FTS 파일 전송 예외] ${e.message}", e)
            return FtsUploadResult(
                success = false,
                error = e.localizedMessage ?: "네트워크 연결 실패"
            )
        }
    }

    /**
     * API 2. [방식 B] 정형 데이터 직접 전송 (POST application/json)
     */
    suspend fun uploadJson(
        endpoint: String,
        fileName: String? = null,
        memo: String? = null,
        amount: Long? = null,
        rowData: JSONObject? = null
    ): FtsUploadResult = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject().apply {
                if (!fileName.isNullOrBlank()) put("fileName", fileName)
                if (!memo.isNullOrBlank()) put("memo", memo)
                if (amount != null) put("amount", amount)
                if (rowData != null) put("rowData", rowData)
            }

            Log.i(TAG, "🚀 [FTS JSON 전송] -> $endpoint : $json")
            val body = json.toString().toRequestBody(JSON_MEDIA_TYPE)
            val request = Request.Builder()
                .url(endpoint)
                .post(body)
                .build()

            val response = client.newCall(request).execute()
            val bodyString = response.body?.string() ?: ""
            val resJson = try { JSONObject(bodyString) } catch (_: Exception) { JSONObject() }

            if (response.isSuccessful && resJson.optBoolean("success", false)) {
                val message = resJson.optString("message", "적재 완료")
                val targetSheet = resJson.optString("targetSheet", "")
                val projectId = resJson.optString("projectId", "")
                val token = resJson.optString("token", "")
                val data = resJson.optJSONObject("data")
                FtsUploadResult(
                    success = true,
                    message = message,
                    targetSheet = targetSheet,
                    projectId = projectId,
                    token = token,
                    data = data
                )
            } else {
                val errMsg = resJson.optString("error", "HTTP ${response.code}")
                FtsUploadResult(
                    success = false,
                    error = errMsg
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "🚨 [FTS JSON 전송 예외] ${e.message}", e)
            FtsUploadResult(
                success = false,
                error = e.localizedMessage ?: "네트워크 연결 실패"
            )
        }
    }

    /**
     * 📱 휴대폰 인증번호 발송 요청 (POST /api/auth/phone/send-code)
     */
    suspend fun requestPhoneSmsCode(phoneNumber: String): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val cleanPhone = phoneNumber.replace("[^0-9]".toRegex(), "")
        val endpoints = listOf(
            "$FTS_OFFICIAL_DOMAIN/api/auth/phone/send-code",
            "$FTS_TUNNEL_BASE/api/auth/phone/send-code"
        )
        for (ep in endpoints) {
            try {
                val json = JSONObject().apply { put("phoneNumber", cleanPhone) }
                val request = Request.Builder()
                    .url(ep)
                    .post(json.toString().toRequestBody(JSON_MEDIA_TYPE))
                    .build()
                val response = client.newCall(request).execute()
                val bodyStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(bodyStr) } catch (_: Exception) { JSONObject() }
                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val msg = resJson.optString("message", "인증번호가 발송되었습니다.")
                    return@withContext Pair(true, msg)
                }
            } catch (e: Exception) {
                Log.w(TAG, "send-code 실패 ($ep): ${e.message}")
            }
        }
        Pair(false, "인증문자 발송에 실패했습니다. 번호를 확인해 주세요.")
    }

    /**
     * 📱 휴대폰 6자리 인증번호 검증 및 2대 시트(영수증, 명함) 수신 (POST /api/auth/phone/verify-code)
     */
    suspend fun verifyPhoneSmsCode(phoneNumber: String, code: String): FtsVerifyResult = withContext(Dispatchers.IO) {
        val cleanPhone = phoneNumber.replace("[^0-9]".toRegex(), "")
        val cleanCode = code.trim()
        val endpoints = listOf(
            "$FTS_OFFICIAL_DOMAIN/api/auth/phone/verify-code",
            "$FTS_TUNNEL_BASE/api/auth/phone/verify-code"
        )
        for (ep in endpoints) {
            try {
                val json = JSONObject().apply {
                    put("phoneNumber", cleanPhone)
                    put("code", cleanCode)
                }
                val request = Request.Builder()
                    .url(ep)
                    .post(json.toString().toRequestBody(JSON_MEDIA_TYPE))
                    .build()
                val response = client.newCall(request).execute()
                val bodyStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(bodyStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val pId = resJson.optString("projectId", "")
                    val pName = resJson.optString("projectName", "내 비즈니스 장부")
                    val msg = resJson.optString("message", "인증되었습니다.")
                    val defaultSheetsList = mutableListOf<FtsDefaultSheet>()
                    val sheetsArr = resJson.optJSONArray("defaultSheets")
                    if (sheetsArr != null) {
                        for (i in 0 until sheetsArr.length()) {
                            val obj = sheetsArr.getJSONObject(i)
                            defaultSheetsList.add(
                                FtsDefaultSheet(
                                    type = obj.optString("type", ""),
                                    sheetName = obj.optString("sheetName", ""),
                                    token = obj.optString("token", ""),
                                    webhookUrl = obj.optString("webhookUrl", "")
                                )
                            )
                        }
                    }
                    return@withContext FtsVerifyResult(
                        success = true,
                        message = msg,
                        projectId = pId,
                        projectName = pName,
                        defaultSheets = defaultSheetsList
                    )
                } else {
                    val errMsg = resJson.optString("error", "인증번호가 일치하지 않습니다.")
                    return@withContext FtsVerifyResult(success = false, error = errMsg)
                }
            } catch (e: Exception) {
                Log.w(TAG, "verify-code 실패 ($ep): ${e.message}")
            }
        }
        FtsVerifyResult(success = false, error = "인증 서버와 연결할 수 없습니다.")
    }

    /**
     * ⚡ 보관함 카드 활성화 시 온디맨드 시트 자동 생성 (POST /api/inbox/ensure-sheet)
     */
    suspend fun ensureSheet(
        phoneNumber: String,
        projectId: String?,
        sheetType: String,
        customSheetName: String? = null
    ): FtsEnsureSheetResult = withContext(Dispatchers.IO) {
        val cleanPhone = phoneNumber.replace("[^0-9]".toRegex(), "")
        val endpoints = listOf(
            "$FTS_OFFICIAL_DOMAIN/api/inbox/ensure-sheet",
            "$FTS_TUNNEL_BASE/api/inbox/ensure-sheet"
        )
        for (ep in endpoints) {
            try {
                val json = JSONObject().apply {
                    put("phoneNumber", cleanPhone)
                    if (!projectId.isNullOrBlank()) put("projectId", projectId)
                    put("sheetType", sheetType)
                    if (!customSheetName.isNullOrBlank()) put("customSheetName", customSheetName)
                }
                val request = Request.Builder()
                    .url(ep)
                    .post(json.toString().toRequestBody(JSON_MEDIA_TYPE))
                    .build()
                val response = client.newCall(request).execute()
                val bodyStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(bodyStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    return@withContext FtsEnsureSheetResult(
                        success = true,
                        isNew = resJson.optBoolean("isNew", false),
                        projectId = resJson.optString("projectId", ""),
                        projectName = resJson.optString("projectName", ""),
                        sheetType = resJson.optString("sheetType", sheetType),
                        sheetName = resJson.optString("sheetName", ""),
                        token = resJson.optString("token", ""),
                        webhookUrl = resJson.optString("webhookUrl", "")
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "ensure-sheet 실패 ($ep): ${e.message}")
            }
        }
        FtsEnsureSheetResult(success = false, error = "시트 생성 및 연결에 실패했습니다.")
    }
}
