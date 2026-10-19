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
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /**
     * API 1. 토큰 유효성 및 페어링 검증 (GET)
     * URL: {endpoint} 또는 https://filetosheet.com/api/inbox/{token}
     */
    suspend fun verifyPairing(endpoint: String): FtsPairingResult = withContext(Dispatchers.IO) {
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
                FtsPairingResult(
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
                FtsPairingResult(
                    success = false,
                    valid = false,
                    error = errMsg
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "🚨 [FTS 페어링 예외] ${e.message}", e)
            FtsPairingResult(
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
            val devId = deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL}"
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
                FtsUploadResult(
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
                FtsUploadResult(
                    success = false,
                    error = errMsg
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "🚨 [FTS 파일 전송 예외] ${e.message}", e)
            FtsUploadResult(
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
}
