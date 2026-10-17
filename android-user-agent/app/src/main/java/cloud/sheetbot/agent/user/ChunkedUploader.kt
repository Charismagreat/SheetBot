package cloud.sheetbot.agent.user

import android.os.Build
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * 이지데스크 터널 안심 청크 분할 업로드(Tunnel-Safe Chunked Upload) 전담 클라이언트 엔진
 * 
 * - 512KB 바이너리 청크 분할 전송으로 터널 프록시(Render 등)의 60초 타임아웃(504 Gateway Timeout) 원천 차단
 * - 청크별 SHA-256 무결성 검증 헤더(x-chunk-sha256) 탑재
 * - 전송 실패 청크에 대한 최대 3회 지수 백오프 자동 재시도
 * - ApiClient.kt와 분리되어 단일 책임 원칙(SRP) 및 높은 유지보수성 제공
 */
object ChunkedUploader {
    private const val TAG = "ChunkedUploader"
    private const val DEFAULT_CHUNK_SIZE = 512 * 1024 // 512KB
    private const val MAX_RETRIES = 3

    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    private val OCTET_STREAM_MEDIA_TYPE = "application/octet-stream".toMediaType()

    // 청크 전송용 클라이언트 (청크당 0.1~0.5초 소요, 30초 제한)
    private val chunkClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    // 병합 및 최종 비즈니스 처리용 클라이언트 (구글 드라이브/OCR 대기, 90초 제한)
    private val completeClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(90, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /**
     * 파일을 512KB 청크 단위로 분할하여 안전하게 업로드
     */
    suspend fun uploadFileChunked(
        file: File,
        fileName: String,
        mimeType: String,
        userEmail: String,
        folderName: String? = null,
        memo: String? = null,
        autoRecordSheet: Boolean = true,
        ocrType: String? = null,
        isCallRecording: Boolean = false,
        contactName: String? = null,
        callTime: String? = null,
        channelCount: Int = 2,
        onProgress: ((uploadedChunks: Int, totalChunks: Int) -> Unit)? = null
    ): ChunkedUploadResult = withContext(Dispatchers.IO) {
        if (!file.exists() || file.length() == 0L) {
            return@withContext ChunkedUploadResult(
                success = false,
                error = "업로드할 파일이 존재하지 않거나 0바이트입니다: ${file.absolutePath}"
            )
        }

        val totalBytes = file.length()
        val hosts = listOf(ApiClient.PRIMARY_HOST, ApiClient.FALLBACK_HOST)
        var lastError = "청크 분할 파일 업로드에 실패했습니다."

        for (host in hosts) {
            try {
                Log.i(TAG, "🚀 [청크 업로드 개시] $fileName (${totalBytes / 1024} KB, channels=$channelCount) -> $host")

                // ==========================================
                // 1단계: 세션 초기화 (POST /api/user/files/uploads)
                // ==========================================
                val initEndpoint = "$host/api/user/files/uploads"
                val initJson = JSONObject().apply {
                    put("filename", fileName)
                    put("size", totalBytes)
                    put("mimeType", mimeType)
                    put("tableName", "files")
                    put("rowId", 1)
                    put("columnName", "file")
                    put("forceStorageType", "filesystem")
                    put("userEmail", userEmail)
                    if (!folderName.isNullOrBlank()) put("folderName", folderName)
                    if (!ocrType.isNullOrBlank()) put("ocrType", ocrType)
                    if (!memo.isNullOrBlank()) put("memo", memo)
                    put("autoRecordSheet", autoRecordSheet)
                    put("deviceId", "${Build.MANUFACTURER} ${Build.MODEL} (SheetBot Agent)")
                    put("isCallRecording", isCallRecording)
                    if (!contactName.isNullOrBlank()) put("contactName", contactName)
                    if (!callTime.isNullOrBlank()) put("callTime", callTime)
                    put("channelCount", channelCount)
                }

                val initRequest = Request.Builder()
                    .url(initEndpoint)
                    .post(initJson.toString().toRequestBody(JSON_MEDIA_TYPE))
                    .header("x-sheetbot-user-email", userEmail)
                    .build()

                val initResponse = chunkClient.newCall(initRequest).execute()
                val initResStr = initResponse.body?.string() ?: ""
                val initResJson = try { JSONObject(initResStr) } catch (_: Exception) { JSONObject() }

                if (!initResponse.isSuccessful || !initResJson.optBoolean("success", false)) {
                    val errMsg = initResJson.optString("error", "초기화 실패 (HTTP ${initResponse.code})")
                    Log.w(TAG, "[$initEndpoint] 세션 초기화 실패: $errMsg")
                    lastError = errMsg
                    continue
                }

                val uploadId = initResJson.optString("uploadId")
                val chunkSize = initResJson.optInt("chunkSize", DEFAULT_CHUNK_SIZE).coerceAtLeast(64 * 1024)
                val totalChunks = initResJson.optInt(
                    "totalChunks",
                    Math.ceil(totalBytes.toDouble() / chunkSize).toInt()
                )

                Log.i(TAG, "📦 [세션 발급 완료] uploadId: $uploadId, 청크 크기: ${chunkSize / 1024}KB, 총 청크수: $totalChunks")

                // ==========================================
                // 2단계: 청크 분할 순차 전송 (PUT /api/user/files/uploads/:id/chunks/:index)
                // ==========================================
                val buffer = ByteArray(chunkSize)
                var chunksTransferred = 0
                var allChunksSuccess = true

                FileInputStream(file).use { fis ->
                    for (index in 0 until totalChunks) {
                        val bytesRead = fis.read(buffer)
                        if (bytesRead <= 0) break

                        val chunkBytes = if (bytesRead == chunkSize) buffer else buffer.copyOf(bytesRead)
                        val chunkSha = sha256Hex(chunkBytes)
                        val chunkEndpoint = "$host/api/user/files/uploads/$uploadId/chunks/$index"

                        var chunkOk = false
                        var chunkErrMsg = ""

                        for (attempt in 1..MAX_RETRIES) {
                            try {
                                val chunkBody = chunkBytes.toRequestBody(OCTET_STREAM_MEDIA_TYPE)
                                val chunkReq = Request.Builder()
                                    .url(chunkEndpoint)
                                    .put(chunkBody)
                                    .header("Content-Type", "application/octet-stream")
                                    .header("x-chunk-sha256", chunkSha)
                                    .build()

                                val chunkRes = chunkClient.newCall(chunkReq).execute()
                                val chunkResStr = chunkRes.body?.string() ?: ""
                                val chunkResJson = try { JSONObject(chunkResStr) } catch (_: Exception) { JSONObject() }

                                if (chunkRes.isSuccessful && chunkResJson.optBoolean("success", true)) {
                                    chunkOk = true
                                    break
                                } else {
                                    chunkErrMsg = chunkResJson.optString("error", "HTTP ${chunkRes.code}")
                                }
                            } catch (e: Exception) {
                                chunkErrMsg = e.localizedMessage ?: "청크 전송 예외"
                            }

                            if (attempt < MAX_RETRIES) {
                                delay((500L * attempt * attempt)) // 500ms, 2000ms 지수 백오프
                            }
                        }

                        if (!chunkOk) {
                            Log.e(TAG, "❌ 청크 전송 실패 (index=$index): $chunkErrMsg")
                            lastError = "청크 $index 전송 실패: $chunkErrMsg"
                            allChunksSuccess = false
                            break
                        }

                        chunksTransferred++
                        onProgress?.invoke(chunksTransferred, totalChunks)
                    }
                }

                if (!allChunksSuccess) {
                    continue
                }

                // ==========================================
                // 3단계: 병합 완료 및 시트봇 파이프라인 트리거 (POST /api/user/files/uploads/:id/complete)
                // ==========================================
                val completeEndpoint = "$host/api/user/files/uploads/$uploadId/complete"
                val completeReq = Request.Builder()
                    .url(completeEndpoint)
                    .post("{}".toRequestBody(JSON_MEDIA_TYPE))
                    .header("x-sheetbot-user-email", userEmail)
                    .build()

                val completeRes = completeClient.newCall(completeReq).execute()
                val completeResStr = completeRes.body?.string() ?: ""
                val completeJson = try { JSONObject(completeResStr) } catch (_: Exception) { JSONObject() }

                if (completeRes.isSuccessful && completeJson.optBoolean("success", false)) {
                    Log.i(TAG, "🎉 [청크 업로드 & 파이프라인 완벽 완료] $fileName")
                    return@withContext ChunkedUploadResult(
                        success = true,
                        fileId = completeJson.optString("fileId").takeIf { it.isNotBlank() },
                        fileName = completeJson.optString("fileName", fileName),
                        folderName = completeJson.optString("folderName", folderName ?: ""),
                        webViewLink = completeJson.optString("webViewLink").takeIf { it.isNotBlank() },
                        spreadsheetUrl = completeJson.optString("spreadsheetUrl").takeIf { it.isNotBlank() },
                        message = completeJson.optString("message", "업로드 완료"),
                        ocrType = completeJson.optString("ocrType").takeIf { it.isNotBlank() } ?: ocrType,
                        ocrData = completeJson.optJSONObject("ocrData"),
                        jobId = completeJson.optString("jobId").takeIf { it.isNotBlank() },
                        status = completeJson.optString("status").takeIf { it.isNotBlank() },
                        uploadId = uploadId
                    )
                } else {
                    lastError = completeJson.optString("error", "병합 완료 처리 실패 (HTTP ${completeRes.code})")
                    Log.w(TAG, "[$completeEndpoint] complete 처리 실패: $lastError")
                }
            } catch (e: Exception) {
                lastError = e.localizedMessage ?: "통신 중 오류 발생"
                Log.w(TAG, "[$host] 청크 업로드 예외: ${e.message}")
            }
        }

        ChunkedUploadResult(success = false, error = lastError)
    }

    /**
     * 통화 녹음 전용 청크 업로드 (/api/user/recordings/chunks)
     *
     * - 범용 /api/user/files/uploads 경로는 이지데스크 파일 스토리지에만 저장되고(complete 단계 HTTP 500)
     *   통화 녹음 파이프라인(구글 드라이브 / 시트 대장 / AI 분석)을 실행하지 않습니다.
     * - 이 경로는 서버가 2MB 청크를 재조립한 뒤 기존 통화 녹음 파이프라인에 그대로 투입합니다.
     * - 단일 본문 업로드는 이지데스크 프록시의 10MB 본문 제한으로 잘리므로 대용량 녹음은 반드시 이 경로를 사용합니다.
     */
    suspend fun uploadCallRecordingChunked(
        file: File,
        fileName: String,
        userEmail: String,
        contactName: String,
        callTime: String,
        folderName: String,
        autoRecordSheet: Boolean,
        channelCount: Int,
        onProgress: ((uploadedChunks: Int, totalChunks: Int) -> Unit)? = null
    ): ChunkedUploadResult = withContext(Dispatchers.IO) {
        if (!file.exists() || file.length() == 0L) {
            return@withContext ChunkedUploadResult(
                success = false,
                error = "업로드할 파일이 존재하지 않거나 0바이트입니다: ${file.absolutePath}"
            )
        }

        val totalBytes = file.length()
        val hosts = listOf(ApiClient.PRIMARY_HOST, ApiClient.FALLBACK_HOST)
        var lastError = "통화 녹음 청크 업로드에 실패했습니다."

        for (host in hosts) {
            try {
                Log.i(TAG, "🚀 [통화 녹음 청크 업로드 개시] $fileName (${totalBytes / 1024} KB) -> $host")

                // 1단계: 세션 초기화
                val initJson = JSONObject().apply {
                    put("userEmail", userEmail)
                    put("fileName", fileName)
                    put("totalSize", totalBytes)
                    put("contactName", contactName)
                    put("callTime", callTime)
                    put("folderName", folderName)
                    put("autoRecordSheet", autoRecordSheet)
                    put("channelCount", channelCount)
                }
                val initReq = Request.Builder()
                    .url("$host/api/user/recordings/chunks")
                    .post(initJson.toString().toRequestBody(JSON_MEDIA_TYPE))
                    .header("x-sheetbot-user-email", userEmail)
                    .build()
                val initRes = chunkClient.newCall(initReq).execute()
                val initJsonRes = try { JSONObject(initRes.body?.string() ?: "") } catch (_: Exception) { JSONObject() }
                if (!initRes.isSuccessful || !initJsonRes.optBoolean("success", false)) {
                    lastError = initJsonRes.optString("error", "초기화 실패 (HTTP ${initRes.code})")
                    Log.w(TAG, "[$host] 통화 녹음 청크 세션 초기화 실패: $lastError")
                    continue
                }

                val uploadId = initJsonRes.optString("uploadId")
                val chunkSize = initJsonRes.optInt("chunkSize", 2 * 1024 * 1024)
                val totalChunks = initJsonRes.optInt(
                    "totalChunks",
                    Math.ceil(totalBytes.toDouble() / chunkSize).toInt()
                )
                Log.i(TAG, "📦 [통화 녹음 세션 발급] uploadId=$uploadId, chunk=${chunkSize / 1024}KB x $totalChunks")

                // 2단계: 청크 순차 전송 (청크당 최대 3회 재시도)
                val buffer = ByteArray(chunkSize)
                var allOk = true
                FileInputStream(file).use { fis ->
                    for (index in 0 until totalChunks) {
                        // 청크 크기를 정확히 채워 읽기 (read()는 요청보다 적게 반환할 수 있음)
                        var filled = 0
                        while (filled < chunkSize) {
                            val n = fis.read(buffer, filled, chunkSize - filled)
                            if (n <= 0) break
                            filled += n
                        }
                        if (filled <= 0) break
                        val chunkBytes = if (filled == chunkSize) buffer.copyOf() else buffer.copyOf(filled)
                        val chunkSha = sha256Hex(chunkBytes)
                        val partUrl = "$host/api/user/recordings/chunks/$uploadId/parts/$index"

                        var ok = false
                        var errMsg = ""
                        for (attempt in 1..MAX_RETRIES) {
                            try {
                                val req = Request.Builder()
                                    .url(partUrl)
                                    .put(chunkBytes.toRequestBody(OCTET_STREAM_MEDIA_TYPE))
                                    .header("x-chunk-sha256", chunkSha)
                                    .build()
                                val res = chunkClient.newCall(req).execute()
                                val resJson = try { JSONObject(res.body?.string() ?: "") } catch (_: Exception) { JSONObject() }
                                if (res.isSuccessful && resJson.optBoolean("success", false)) {
                                    ok = true
                                    break
                                }
                                errMsg = resJson.optString("error", "HTTP ${res.code}")
                            } catch (e: Exception) {
                                errMsg = e.localizedMessage ?: "청크 전송 예외"
                            }
                            if (attempt < MAX_RETRIES) delay(500L * attempt * attempt)
                        }

                        if (!ok) {
                            Log.e(TAG, "❌ 통화 녹음 청크 전송 실패 (index=$index): $errMsg")
                            lastError = "청크 $index 전송 실패: $errMsg"
                            allOk = false
                            break
                        }
                        onProgress?.invoke(index + 1, totalChunks)
                    }
                }
                if (!allOk) continue

                // 3단계: 재조립 및 통화 녹음 파이프라인 트리거
                val completeReq = Request.Builder()
                    .url("$host/api/user/recordings/chunks/$uploadId/complete")
                    .post("{}".toRequestBody(JSON_MEDIA_TYPE))
                    .header("x-sheetbot-user-email", userEmail)
                    .build()
                val completeRes = completeClient.newCall(completeReq).execute()
                val completeJson = try { JSONObject(completeRes.body?.string() ?: "") } catch (_: Exception) { JSONObject() }
                if (completeRes.isSuccessful && completeJson.optBoolean("success", false)) {
                    Log.i(TAG, "🎉 [통화 녹음 청크 업로드 완료] $fileName")
                    return@withContext ChunkedUploadResult(
                        success = true,
                        fileId = completeJson.optString("fileId").takeIf { it.isNotBlank() },
                        fileName = completeJson.optString("fileName", fileName),
                        folderName = completeJson.optString("folderName", folderName),
                        webViewLink = completeJson.optString("webViewLink").takeIf { it.isNotBlank() },
                        spreadsheetUrl = completeJson.optString("spreadsheetUrl").takeIf { it.isNotBlank() },
                        message = completeJson.optString("message", "업로드 완료"),
                        uploadId = uploadId
                    )
                }
                lastError = completeJson.optString("error", "병합 완료 처리 실패 (HTTP ${completeRes.code})")
                Log.w(TAG, "[$host] 통화 녹음 complete 실패: $lastError")
            } catch (e: Exception) {
                lastError = e.localizedMessage ?: "통신 중 오류 발생"
                Log.w(TAG, "[$host] 통화 녹음 청크 업로드 예외: ${e.message}")
            }
        }

        ChunkedUploadResult(success = false, error = lastError)
    }

    /**
     * 바이트 배열의 SHA-256 해시를 16진수 문자열로 반환
     */
    private fun sha256Hex(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(bytes)
        val sb = StringBuilder()
        for (b in hash) {
            sb.append(String.format("%02x", b))
        }
        return sb.toString()
    }
}

/**
 * 청크 업로드 결과 데이터 모델
 */
data class ChunkedUploadResult(
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
    val status: String? = null,
    val uploadId: String? = null
)
