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

/**
 * ⚡ 파일투시트(FileToSheet) 직결 페어링 및 Ingest API 클라이언트
 *
 * 공식 가이드 기술 명세서(SheetBot_Mobile_Integration_Guide.md) 준수:
 * - API 1: GET /api/inbox/{token} (토큰 유효성 및 대상 시트 페어링 검증)
 * - API 2 [방식 A]: POST /api/inbox/{token} (Multipart/Form-Data 사진/바이너리 파일 직결 전송)
 * - API 2 [방식 B]: POST /api/inbox/{token} (Application/JSON 정형 데이터 직접 전송)
 * - API 3: POST /api/inbox/ensure-sheet (시트 자동 프로비저닝 & Schema Evolution)
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

data class FtsCardSheetSpec(
    val cardId: String,
    val sheetName: String,
    val headers: List<String>
)

data class FtsEnsureSheetResult(
    val success: Boolean,
    val isNew: Boolean = false,
    val projectId: String? = null,
    val projectName: String? = null,
    val cardId: String? = null,
    val sheetType: String? = null,
    val sheetName: String? = null,
    val headers: List<String> = emptyList(),
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
    const val FTS_TUNNEL_BASE = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1-i01o2oa/p/FileToSheet"
    const val FTS_TUNNEL_BASE_LEGACY = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/FileToSheet"

    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /**
     * 📋 모바일 카드별 파일투시트(FileToSheet) 표준 시트 스키마 레지스트리
     * - POST /api/inbox/ensure-sheet 호출 시 cardId, sheetName, headers 자동 매핑 및 Schema Evolution 지원
     */
    val CARD_SHEET_SPECS: Map<String, FtsCardSheetSpec> = mapOf(
        "receipt_scanner" to FtsCardSheetSpec(
            cardId = "receipt_scanner",
            sheetName = "영수증대장",
            headers = listOf("일련번호", "거래일자", "상호", "품목", "공급가액", "부가가치세", "합계금액", "결제수단")
        ),
        "business_card" to FtsCardSheetSpec(
            cardId = "business_card",
            sheetName = "명함관리",
            headers = listOf("일련번호", "등록일시", "성함", "직함", "회사명", "휴대폰", "이메일", "유선전화", "회사주소", "상세정보")
        ),
        "payment_sms" to FtsCardSheetSpec(
            cardId = "payment_sms",
            sheetName = "결제입금내역",
            headers = listOf("일련번호", "일시", "구분", "금융사/채널", "계좌/카드번호", "고객/가맹점명", "금액", "거래내용", "수신기기")
        ),
        "call_recording" to FtsCardSheetSpec(
            cardId = "call_recording",
            sheetName = "통화녹음대장",
            headers = listOf("일련번호", "통화일시", "상대방", "파일명", "파일크기", "요약내용", "비고")
        ),
        "sms_sync" to FtsCardSheetSpec(
            cardId = "sms_sync",
            sheetName = "문자송수신대장",
            headers = listOf("일련번호", "일시", "구분", "상대방이름", "전화번호", "메시지내용", "기기명")
        ),
        "sheet_sms_checkbox" to FtsCardSheetSpec(
            cardId = "sheet_sms_checkbox",
            sheetName = "체크박스문자발송대장",
            headers = listOf("발송선택", "고객명", "전화번호", "발송할문자내용", "발송상태", "발송일시")
        ),
        "kakao_sync" to FtsCardSheetSpec(
            cardId = "kakao_sync",
            sheetName = "카카오톡대화대장",
            headers = listOf("일련번호", "수신일시", "채팅방/발신자", "메시지내용", "기기명", "동기화일시")
        ),
        "file_upload" to FtsCardSheetSpec(
            cardId = "file_upload",
            sheetName = "파일보관대장",
            headers = listOf("일련번호", "업로드일시", "구분", "파일명", "파일크기", "메모", "기기명")
        ),
        "contacts_backup" to FtsCardSheetSpec(
            cardId = "contacts_backup",
            sheetName = "연락처대장",
            headers = listOf("일련번호", "이름", "휴대전화", "이메일", "회사/상호", "직함/부서", "메모", "주소", "갱신일시")
        ),
        "link_scrap" to FtsCardSheetSpec(
            cardId = "link_scrap",
            sheetName = "링크스크랩대장",
            headers = listOf("일련번호", "등록일시", "구분", "제목", "URL", "출처", "AI요약", "메모")
        ),
        "missed_call" to FtsCardSheetSpec(
            cardId = "missed_call",
            sheetName = "부재중전화대장",
            headers = listOf("일련번호", "부재중일시", "발신번호", "연락처이름", "자동회신내용", "회신상태", "기기명")
        ),
        "quote_order" to FtsCardSheetSpec(
            cardId = "quote_order",
            sheetName = "간편주문대장",
            headers = listOf("일련번호", "주문일시", "고객명", "연락처", "품목내역", "공급가액", "부가가치세", "합계금액", "상태")
        ),
        "estimate_issue" to FtsCardSheetSpec(
            cardId = "estimate_issue",
            sheetName = "견적서발행대장",
            headers = listOf("일련번호", "발행일시", "고객명", "연락처", "견적내용", "공급가액", "부가가치세", "합계금액", "상태")
        ),
        "meeting_recording" to FtsCardSheetSpec(
            cardId = "meeting_recording",
            sheetName = "회의록대장",
            headers = listOf("일련번호", "회의일시", "회의제목", "파일명", "AI요약", "주요결정사항", "비고")
        ),
        "call_ended_card" to FtsCardSheetSpec(
            cardId = "call_ended_card",
            sheetName = "모바일명함발송대장",
            headers = listOf("일련번호", "발송일시", "수신자명", "전화번호", "발송문구", "상태")
        ),
        "receipt_sms" to FtsCardSheetSpec(
            cardId = "receipt_sms",
            sheetName = "영수증문자발송대장",
            headers = listOf("일련번호", "발송일시", "고객명", "전화번호", "결제금액", "발송문구", "상태")
        ),
        "website_monitor" to FtsCardSheetSpec(
            cardId = "website_monitor",
            sheetName = "웹사이트모니터링대장",
            headers = listOf("일련번호", "점검일시", "대상URL", "상태코드", "응답시간", "장애여부", "비고")
        ),
        "company_research" to FtsCardSheetSpec(
            cardId = "company_research",
            sheetName = "기업리서치대장",
            headers = listOf("일련번호", "등록일시", "기업명", "대표자", "업종", "핵심요약", "비고")
        ),
        "law_advisory" to FtsCardSheetSpec(
            cardId = "law_advisory",
            sheetName = "법률계약검토대장",
            headers = listOf("일련번호", "검토일시", "문서/질의제목", "법률검토요약", "리스크수준", "권고사항")
        ),
        "naver_blog" to FtsCardSheetSpec(
            cardId = "naver_blog",
            sheetName = "블로그마케팅대장",
            headers = listOf("일련번호", "발행일시", "포스트제목", "키워드", "블로그URL", "상태")
        ),
        "instagram" to FtsCardSheetSpec(
            cardId = "instagram",
            sheetName = "인스타그램마케팅대장",
            headers = listOf("일련번호", "게시일시", "캡션요약", "해시태그", "게시물URL", "상태")
        ),
        "mobile_site" to FtsCardSheetSpec(
            cardId = "mobile_site",
            sheetName = "모바일홈페이지대장",
            headers = listOf("일련번호", "생성일시", "사이트명", "도메인/URL", "주요메뉴", "상태")
        )
    )

    /**
     * 카드 키(cardPaymentReceipt 등), OCR 타입(RECEIPT 등), 시트 타입을 표준 cardId로 정규화
     */
    fun resolveCanonicalCardId(keyOrType: String?): String {
        val raw = keyOrType?.trim().orEmpty()
        if (raw.isEmpty()) return "receipt_scanner"
        return when (raw.lowercase()) {
            "receipt", "receipt_scanner", "cardreceipt", "cardreceiptscanner" -> "receipt_scanner"
            "business_card", "cardbusinesscard" -> "business_card"
            "call_ended_card", "cardcallended" -> "call_ended_card"
            "payment_sms", "deposit", "payment_push", "cardpaymentreceipt" -> "payment_sms"
            "receipt_sms" -> "receipt_sms"
            "call_recording", "recording", "cardcallrecording" -> "call_recording"
            "meeting", "meeting_recording", "cardmeetingrecording" -> "meeting_recording"
            "sms", "sms_sync", "cardsmssync" -> "sms_sync"
            "sheet_sms_checkbox", "cardsheetsmscheckbox" -> "sheet_sms_checkbox"
            "kakao", "kakao_sync", "cardkakaosync" -> "kakao_sync"
            "file_upload", "generic", "cardfileupload" -> "file_upload"
            "contacts", "contacts_backup", "cardcontactsbackup" -> "contacts_backup"
            "link_bookmark", "link_scrap", "cardlinkscrap" -> "link_scrap"
            "missed_call", "cardmissedcall" -> "missed_call"
            "quote", "quote_order", "cardquotesync" -> "quote_order"
            "estimate", "estimate_issue", "cardestimatesync" -> "estimate_issue"
            "website_monitor", "cardwebsitemonitor" -> "website_monitor"
            "company_research", "cardcompanyresearch" -> "company_research"
            "law_advisory", "cardlawadvisory" -> "law_advisory"
            "naver_blog", "cardblog" -> "naver_blog"
            "instagram", "cardinsta" -> "instagram"
            "mobile_site", "cardsite" -> "mobile_site"
            else -> raw.lowercase()
        }
    }

    /**
     * 카드 키(cardPaymentReceipt 등), OCR 타입(RECEIPT 등), 시트 타입을 표준 FtsCardSheetSpec으로 변환
     */
    fun resolveSheetSpec(keyOrType: String?): FtsCardSheetSpec? {
        val raw = keyOrType?.trim().orEmpty()
        if (raw.isEmpty()) return null
        val canonicalId = resolveCanonicalCardId(raw)
        return CARD_SHEET_SPECS[canonicalId]
    }

    /**
     * ⚡ 파일투시트 Ingest 엔드포인트 지능형 정규화
     * - QR코드에서 전달된 endpoint가 0.0.0.0, 127.0.0.1, localhost 등 사설/루프백 주소이거나 비어있을 경우,
     *   즉시 작동하는 공식 도메인(또는 터널) URL로 자동 보정.
     * - 구 도메인(filetosheet.com) 오타/미등록 주소도 공식 도메인으로 안전 보정.
     * - token이 전달된 경우 항상 /api/inbox/{token} 경로가 정확히 매핑되도록 보장.
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
            return if (cleanToken.isNotBlank()) "$FTS_OFFICIAL_DOMAIN/api/inbox/$cleanToken" else FTS_OFFICIAL_DOMAIN
        }
        if (cleanToken.isNotBlank()) {
            return if (trimmed.contains("/api/inbox/")) {
                val basePrefix = trimmed.substringBefore("/api/inbox/").trimEnd('/')
                "$basePrefix/api/inbox/$cleanToken"
            } else {
                "${trimmed.trimEnd('/')}/api/inbox/$cleanToken"
            }
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
        val primaryResult = doUploadJson(endpoint, fileName, memo, amount, rowData)
        if (primaryResult.success) {
            return@withContext primaryResult
        }

        if (!endpoint.contains("tunneling-service.onrender.com")) {
            val fallbackUrl = getTunnelFallbackEndpoint(endpoint)
            if (fallbackUrl.isNotBlank() && fallbackUrl != endpoint) {
                Log.w(TAG, "🔄 [FTS JSON 전송 터널 폴백 시도] $endpoint -> $fallbackUrl")
                return@withContext doUploadJson(fallbackUrl, fileName, memo, amount, rowData)
            }
        }
        return@withContext primaryResult
    }

    private fun doUploadJson(
        endpoint: String,
        fileName: String?,
        memo: String?,
        amount: Long?,
        rowData: JSONObject?
    ): FtsUploadResult {
        return try {
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
     * ⚡ 파일투시트 시트 자동 프로비저닝 API (POST /api/inbox/ensure-sheet)
     * - 중복 호출 시 이미 존재하는 시트를 찾아 안전하게 재사용 (멱등성 보장)
     * - 모바일 카드가 새 컬럼을 추가해 보내면 기존 시트의 헤더도 자동으로 확장 (Schema Evolution)
     *
     * Request Body:
     * {
     *   "phoneNumber": "01072165884",
     *   "cardId": "receipt_scanner",
     *   "sheetName": "영수증대장",
     *   "headers": ["일련번호", "거래일자", "상호", "품목", "공급가액", "부가가치세", "합계금액", "결제수단"]
     * }
     */
    suspend fun ensureSheet(
        phoneNumber: String,
        cardId: String,
        sheetName: String? = null,
        headers: List<String>? = null,
        projectId: String? = null
    ): FtsEnsureSheetResult = withContext(Dispatchers.IO) {
        val cleanPhone = phoneNumber.replace("[^0-9]".toRegex(), "")
        val spec = resolveSheetSpec(cardId)
        val resolvedCardId = spec?.cardId ?: cardId
        val resolvedSheetName = sheetName?.takeIf { it.isNotBlank() } ?: spec?.sheetName ?: "기본대장"
        val resolvedHeaders = headers?.takeIf { it.isNotEmpty() } ?: spec?.headers ?: listOf("일련번호", "일시", "내용", "비고")

        val endpoints = listOf(
            "$FTS_OFFICIAL_DOMAIN/api/inbox/ensure-sheet",
            "$FTS_TUNNEL_BASE/api/inbox/ensure-sheet"
        )
        var lastError: String? = null
        for (ep in endpoints) {
            try {
                val headersArray = JSONArray()
                resolvedHeaders.forEach { headersArray.put(it) }

                val json = JSONObject().apply {
                    put("phoneNumber", cleanPhone)
                    put("cardId", resolvedCardId)
                    put("sheetName", resolvedSheetName)
                    put("headers", headersArray)
                    if (!projectId.isNullOrBlank()) {
                        put("projectId", projectId)
                    }
                }
                Log.i(TAG, "⚡ [FTS ensure-sheet 요청] $ep -> cardId=$resolvedCardId, sheetName=$resolvedSheetName, headers=${resolvedHeaders.size}개")
                val request = Request.Builder()
                    .url(ep)
                    .post(json.toString().toRequestBody(JSON_MEDIA_TYPE))
                    .build()
                val response = client.newCall(request).execute()
                val bodyStr = response.body?.string() ?: ""
                val resJson = try { JSONObject(bodyStr) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && resJson.optBoolean("success", false)) {
                    val returnedHeaders = mutableListOf<String>()
                    val resHeadersArr = resJson.optJSONArray("headers")
                    if (resHeadersArr != null) {
                        for (i in 0 until resHeadersArr.length()) {
                            val h = resHeadersArr.optString(i, "")
                            if (h.isNotBlank()) returnedHeaders.add(h)
                        }
                    }
                    val pId = if (resJson.has("projectId") && !resJson.isNull("projectId")) {
                        resJson.opt("projectId")?.toString() ?: ""
                    } else ""
                    val tok = resJson.optString("token", "")
                    val rawWebhook = resJson.optString("webhookUrl", "")
                    val normalizedWebhook = if (rawWebhook.isNotBlank() || tok.isNotBlank()) {
                        normalizeEndpoint(rawWebhook, tok)
                    } else ""

                    return@withContext FtsEnsureSheetResult(
                        success = true,
                        isNew = resJson.optBoolean("isNew", false),
                        projectId = pId,
                        projectName = resJson.optString("projectName", ""),
                        cardId = resJson.optString("cardId", resolvedCardId),
                        sheetType = resJson.optString("sheetType", resolvedCardId),
                        sheetName = resJson.optString("sheetName", resolvedSheetName),
                        headers = if (returnedHeaders.isNotEmpty()) returnedHeaders else resolvedHeaders,
                        token = tok,
                        webhookUrl = normalizedWebhook.ifBlank { rawWebhook }
                    )
                } else {
                    lastError = resJson.optString("error", "HTTP ${response.code}").takeIf { it.isNotBlank() }
                }
            } catch (e: Exception) {
                lastError = e.localizedMessage
                Log.w(TAG, "ensure-sheet 실패 ($ep): ${e.message}")
            }
        }
        FtsEnsureSheetResult(success = false, error = lastError ?: "시트 생성 및 연결에 실패했습니다.")
    }

    /**
     * 파일투시트 인박스 토큰에 연결된 시트의 전체 데이터 행(rows) 목록을 조회합니다.
     * GET /api/inbox/{token}?includeRows=true
     *
     * @return Pair<Boolean, List<JSONObject>> (성공 여부, 행 데이터 목록)
     */
    suspend fun fetchSheetRows(
        endpoint: String,
        token: String? = null
    ): Pair<Boolean, List<JSONObject>> = withContext(Dispatchers.IO) {
        val cleanToken = token?.takeIf { it.isNotBlank() }
            ?: endpoint.substringAfterLast("/inbox/").substringBefore("?").trim()

        val endpointsToTry = mutableListOf<String>()
        val baseEp = if (endpoint.contains("?")) endpoint.substringBefore("?") else endpoint
        endpointsToTry.add("$baseEp?includeRows=true")

        if (cleanToken.isNotBlank()) {
            val officialUrl = "$FTS_OFFICIAL_DOMAIN/api/inbox/$cleanToken?includeRows=true"
            val tunnelUrl = "$FTS_TUNNEL_BASE/api/inbox/$cleanToken?includeRows=true"
            val legacyTunnelUrl = "$FTS_TUNNEL_BASE_LEGACY/api/inbox/$cleanToken?includeRows=true"
            if (!endpointsToTry.contains(tunnelUrl)) endpointsToTry.add(tunnelUrl)
            if (!endpointsToTry.contains(officialUrl)) endpointsToTry.add(officialUrl)
            if (!endpointsToTry.contains(legacyTunnelUrl)) endpointsToTry.add(legacyTunnelUrl)
        }

        for (targetUrl in endpointsToTry) {
            try {
                Log.i(TAG, "📥 [FTS 시트 행 조회 시도] $targetUrl")
                val request = Request.Builder()
                    .url(targetUrl)
                    .header("Accept", "application/json")
                    .get()
                    .build()

                val response = client.newCall(request).execute()
                val bodyString = response.body?.string() ?: ""
                val json = try { JSONObject(bodyString) } catch (_: Exception) { JSONObject() }

                if (response.isSuccessful && json.optBoolean("success", false)) {
                    val rowsArray = json.optJSONArray("rows")
                    val resultList = mutableListOf<JSONObject>()
                    if (rowsArray != null) {
                        for (i in 0 until rowsArray.length()) {
                            val rowObj = rowsArray.optJSONObject(i)
                            if (rowObj != null) {
                                resultList.add(rowObj)
                            }
                        }
                    }
                    Log.i(TAG, "✅ [FTS 시트 행 조회 완료] 총 ${resultList.size}건 수신")
                    return@withContext Pair(true, resultList)
                }
            } catch (e: Exception) {
                Log.w(TAG, "⚠️ [FTS 시트 행 조회 실패] $targetUrl: ${e.message}")
            }
        }

        return@withContext Pair(false, emptyList<JSONObject>())
    }
}
