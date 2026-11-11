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
    val googleSheetId: String? = null,
    val googleSheetUrl: String? = null,
    val googleSheetTab: String? = null,
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
    val googleSheetId: String? = null,
    val googleSheetUrl: String? = null,
    val googleSheetTab: String? = null,
    val error: String? = null
)

data class FtsUploadResult(
    val success: Boolean,
    val message: String? = null,
    val targetSheet: String? = null,
    val projectId: String? = null,
    val token: String? = null,
    val data: JSONObject? = null,
    val rowsCount: Int = 0,
    val chatRoomName: String? = null,
    val totalCount: Int = 0,
    val insertedCount: Int = 0,
    val startDate: String? = null,
    val endDate: String? = null,
    val error: String? = null
)

object FileToSheetClient {
    private const val TAG = "FileToSheetClient"
    const val FTS_OFFICIAL_DOMAIN = "https://file2sheet.cloud"
    const val FTS_TUNNEL_BASE = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/FileToSheet"
    const val FTS_TUNNEL_BASE_LEGACY = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1-i01o2oa/p/FileToSheet"

    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectionPool(okhttp3.ConnectionPool(0, 1, TimeUnit.MILLISECONDS))
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /**
     * 파일투시트 서버 실시간 생존 상태(Ping) 및 지연 시간(ms) 확인
     */
    suspend fun pingFtsServer(endpointHint: String? = null): PingResult = withContext(Dispatchers.IO) {
        val candidates = mutableListOf<String>()
        val cleanHint = endpointHint?.trim().orEmpty()
        if (cleanHint.isNotBlank() && !cleanHint.contains("0.0.0.0") && !cleanHint.contains("localhost") && !cleanHint.contains("127.0.0.1")) {
            val base = if (cleanHint.contains("/api/")) cleanHint.substringBefore("/api/").trimEnd('/') else cleanHint.trimEnd('/')
            if (base.isNotBlank()) candidates.add(base)
        }
        if (!candidates.contains(FTS_OFFICIAL_DOMAIN)) candidates.add(FTS_OFFICIAL_DOMAIN)
        if (!candidates.contains(FTS_TUNNEL_BASE)) candidates.add(FTS_TUNNEL_BASE)
        if (!candidates.contains(FTS_TUNNEL_BASE_LEGACY)) candidates.add(FTS_TUNNEL_BASE_LEGACY)

        for (host in candidates) {
            try {
                val req = Request.Builder()
                    .url(host)
                    .header("Cache-Control", "no-cache")
                    .header("Connection", "close")
                    .get()
                    .build()
                val startTime = System.currentTimeMillis()
                client.newCall(req).execute().use { res ->
                    val elapsed = System.currentTimeMillis() - startTime
                    if (res.code in 200..499 && res.code != 400 && res.code != 404) {
                        return@withContext PingResult(
                            isOnline = true,
                            latencyMs = elapsed,
                            connectedHost = host
                        )
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "FTS 서버 핑 확인 실패 ($host): ${e.message}")
            }
        }
        PingResult(isOnline = false, error = "파일투시트 서버 응답 없음")
    }

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
        "email_sync" to FtsCardSheetSpec(
            cardId = "email_sync",
            sheetName = "이메일수신대장",
            headers = listOf("일련번호", "수신일시", "메일앱/계정", "발신자", "메일제목", "본문요약", "기기명")
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
        ),
        "saas_otp_relay" to FtsCardSheetSpec(
            cardId = "saas_otp_relay",
            sheetName = "SaaS인증발송대장",
            headers = listOf("일련번호", "요청일시", "서비스명", "수신번호", "인증목적", "인증번호(마스킹)", "발송상태", "소요시간(ms)", "인증완료여부", "발송기기")
        ),
        "tasks_hub" to FtsCardSheetSpec(
            cardId = "tasks_hub",
            sheetName = "통합할일대장",
            headers = listOf("일련번호", "등록일시", "상태", "중요도", "할일제목", "고객명", "연락처", "기한", "출처", "뱃지", "완료일시", "비고")
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
            "email", "email_sync", "cardemailsync" -> "email_sync"
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
            "saas_otp_relay", "cardsaasotprelay", "saas_otp" -> "saas_otp_relay"
            "tasks_hub", "cardtaskshub", "tasks", "task" -> "tasks_hub"
            else -> raw.lowercase()
        }
    }

    /**
     * 카드 키(cardPaymentReceipt 등), OCR 타입(RECEIPT 등), 시트 타입을 표준 FtsCardSheetSpec으로 변환
     * - OTA 동적 카드(installedDynamicCards)의 manifestJson.sheetSpec도 자동 지원
     */
    fun resolveSheetSpec(keyOrType: String?, prefs: PreferencesManager? = null): FtsCardSheetSpec? {
        val raw = keyOrType?.trim().orEmpty()
        if (raw.isEmpty()) return null
        val canonicalId = resolveCanonicalCardId(raw)
        CARD_SHEET_SPECS[canonicalId]?.let { return it }

        // 동적 카드(Manifest JSON)에서 sheetSpec 추출
        val dynCard = prefs?.getInstalledDynamicCards()?.firstOrNull {
            it.key.equals(raw, ignoreCase = true) || "dynamic_${it.key}".equals(raw, ignoreCase = true)
        }
        if (dynCard != null && !dynCard.manifestJson.isNullOrBlank()) {
            try {
                val mObj = JSONObject(dynCard.manifestJson)
                val sObj = mObj.optJSONObject("sheetSpec")
                if (sObj != null) {
                    val cId = sObj.optString("cardId", dynCard.key.lowercase())
                    val sName = sObj.optString("sheetName", "${dynCard.title}대장")
                    val hArr = sObj.optJSONArray("headers")
                    val hList = mutableListOf<String>()
                    if (hArr != null) {
                        for (i in 0 until hArr.length()) {
                            val h = hArr.optString(i)
                            if (h.isNotBlank()) hList.add(h)
                        }
                    }
                    if (hList.isEmpty()) {
                        hList.addAll(listOf("일련번호", "등록일시", "구분", "핵심내용", "AI상세분석", "비고"))
                    }
                    return FtsCardSheetSpec(cardId = cId, sheetName = sName, headers = hList)
                }
            } catch (_: Exception) {}
        }
        return null
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
                val gSheetId = if (!json.isNull("googleSheetId")) json.optString("googleSheetId", "").takeIf { it.isNotBlank() } else null
                val gSheetUrl = if (!json.isNull("googleSheetUrl")) json.optString("googleSheetUrl", "").takeIf { it.isNotBlank() } else null
                val gSheetTab = if (!json.isNull("googleSheetTab")) json.optString("googleSheetTab", "").takeIf { it.isNotBlank() } else null
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
                    googleSheetId = gSheetId,
                    googleSheetUrl = gSheetUrl,
                    googleSheetTab = gSheetTab,
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
        deviceId: String? = null,
        customFileName: String? = null,
        contactName: String? = null,
        callTime: String? = null,
        rowData: JSONObject? = null
    ): FtsUploadResult = withContext(Dispatchers.IO) {
        val devId = deviceId ?: "${Build.MANUFACTURER} ${Build.MODEL}"
        val primaryResult = doUploadFile(endpoint, file, mimeType, memo, ocrType, devId, customFileName, contactName, callTime, rowData)
        if (primaryResult.success) {
            return@withContext primaryResult
        }

        // 파일 전송 실패 시 공용 터널로 1회 자동 재시도
        if (!endpoint.contains("tunneling-service.onrender.com")) {
            val fallbackUrl = getTunnelFallbackEndpoint(endpoint)
            if (fallbackUrl.isNotBlank() && fallbackUrl != endpoint) {
                Log.w(TAG, "🔄 [FTS 파일 전송 터널 폴백 시도] $endpoint -> $fallbackUrl")
                return@withContext doUploadFile(fallbackUrl, file, mimeType, memo, ocrType, devId, customFileName, contactName, callTime, rowData)
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
        devId: String,
        customFileName: String? = null,
        contactName: String? = null,
        callTime: String? = null,
        rowData: JSONObject? = null
    ): FtsUploadResult {
        try {
            val effectiveFileName = customFileName?.takeIf { it.isNotBlank() } ?: file.name
            Log.i(TAG, "🚀 [FTS 파일 전송] $effectiveFileName (${file.length() / 1024} KB) -> $endpoint (ocrType: $ocrType)")
            val multipartBuilder = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                    "file",
                    effectiveFileName,
                    file.asRequestBody(mimeType.toMediaTypeOrNull())
                )
                .addFormDataPart("fileName", effectiveFileName)

            if (!memo.isNullOrBlank()) {
                multipartBuilder.addFormDataPart("memo", memo)
            }
            if (!ocrType.isNullOrBlank()) {
                multipartBuilder.addFormDataPart("ocrType", ocrType)
            }
            if (!contactName.isNullOrBlank()) {
                multipartBuilder.addFormDataPart("contactName", contactName)
            }
            if (!callTime.isNullOrBlank()) {
                multipartBuilder.addFormDataPart("callTime", callTime)
            }
            if (rowData != null) {
                multipartBuilder.addFormDataPart("rowData", rowData.toString())
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
                val rowsCount = json.optInt("rowsCount", 1)
                val chatRoomName = json.optString("chatRoomName", "").takeIf { it.isNotBlank() }
                val totalCount = json.optInt("totalCount", rowsCount)
                val insertedCount = json.optInt("insertedCount", rowsCount)
                val startDate = json.optString("startDate", "").takeIf { it.isNotBlank() }
                val endDate = json.optString("endDate", "").takeIf { it.isNotBlank() }
                Log.i(TAG, "🎉 [FTS 파일 전송 완료] $message (targetSheet: $targetSheet)")
                return FtsUploadResult(
                    success = true,
                    message = message,
                    targetSheet = targetSheet,
                    projectId = projectId,
                    token = token,
                    data = data,
                    rowsCount = rowsCount,
                    chatRoomName = chatRoomName,
                    totalCount = totalCount,
                    insertedCount = insertedCount,
                    startDate = startDate,
                    endDate = endDate
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
     * ⚡ 카드별 정형 데이터(JSON rowData)를 온디맨드 시트 보장(ensure-sheet) 후 파일투시트에 즉시 기록
     */
    suspend fun syncCardRowToFts(
        cardIdOrType: String,
        rowData: JSONObject,
        fileName: String? = null,
        memo: String? = null,
        amount: Long? = null
    ): FtsUploadResult = withContext(Dispatchers.IO) {
        try {
            val prefs = PreferencesManager(SheetBotApp.appContext)
            var (endpoint, _) = FileUploadManager.resolveOrEnsureFtsSheet(prefs, cardIdOrType, forceRefresh = false)
            if (endpoint.isBlank() || !endpoint.contains("/api/inbox/")) {
                val refreshed = FileUploadManager.resolveOrEnsureFtsSheet(prefs, cardIdOrType, forceRefresh = true)
                endpoint = refreshed.first
            }
            if (endpoint.isBlank()) {
                return@withContext FtsUploadResult(success = false, error = "파일투시트 엔드포인트가 설정되지 않았습니다.")
            }

            var attempt = uploadJson(
                endpoint = endpoint,
                fileName = fileName,
                memo = memo,
                amount = amount,
                rowData = rowData
            )
            if (!attempt.success && !prefs.ftsPhoneNumber.isNullOrBlank()) {
                val refreshed = FileUploadManager.resolveOrEnsureFtsSheet(prefs, cardIdOrType, forceRefresh = true)
                if (refreshed.first.isNotBlank()) {
                    attempt = uploadJson(
                        endpoint = refreshed.first,
                        fileName = fileName,
                        memo = memo,
                        amount = amount,
                        rowData = rowData
                    )
                }
            }
            attempt
        } catch (e: Exception) {
            Log.w(TAG, "syncCardRowToFts 예외 ($cardIdOrType): ${e.message}")
            FtsUploadResult(success = false, error = e.localizedMessage ?: "전송 실패")
        }
    }

    /**
     * ⚡ 카드별 파일(통화녹음, 회의녹음 등)을 온디맨드 시트 보장(ensure-sheet) 후 파일투시트에 즉시 업로드
     */
    suspend fun syncCardFileToFts(
        cardIdOrType: String,
        file: File,
        mimeType: String = "audio/mp4",
        memo: String? = null,
        ocrType: String? = null,
        customFileName: String? = null,
        contactName: String? = null,
        callTime: String? = null,
        rowData: JSONObject? = null
    ): FtsUploadResult = withContext(Dispatchers.IO) {
        try {
            val prefs = PreferencesManager(SheetBotApp.appContext)
            var (endpoint, _) = FileUploadManager.resolveOrEnsureFtsSheet(prefs, cardIdOrType, forceRefresh = false)
            if (endpoint.isBlank() || !endpoint.contains("/api/inbox/")) {
                val refreshed = FileUploadManager.resolveOrEnsureFtsSheet(prefs, cardIdOrType, forceRefresh = true)
                endpoint = refreshed.first
            }
            if (endpoint.isBlank()) {
                return@withContext FtsUploadResult(success = false, error = "파일투시트 엔드포인트가 설정되지 않았습니다.")
            }

            var attempt = uploadFile(
                endpoint = endpoint,
                file = file,
                mimeType = mimeType,
                memo = memo,
                ocrType = ocrType,
                deviceId = "${Build.MANUFACTURER} ${Build.MODEL}",
                customFileName = customFileName,
                contactName = contactName,
                callTime = callTime,
                rowData = rowData
            )
            if (!attempt.success && !prefs.ftsPhoneNumber.isNullOrBlank()) {
                val refreshed = FileUploadManager.resolveOrEnsureFtsSheet(prefs, cardIdOrType, forceRefresh = true)
                if (refreshed.first.isNotBlank()) {
                    attempt = uploadFile(
                        endpoint = refreshed.first,
                        file = file,
                        mimeType = mimeType,
                        memo = memo,
                        ocrType = ocrType,
                        deviceId = "${Build.MANUFACTURER} ${Build.MODEL}",
                        customFileName = customFileName,
                        contactName = contactName,
                        callTime = callTime,
                        rowData = rowData
                    )
                }
            }
            attempt
        } catch (e: Exception) {
            Log.w(TAG, "syncCardFileToFts 예외 ($cardIdOrType): ${e.message}")
            FtsUploadResult(success = false, error = e.localizedMessage ?: "파일 업로드 실패")
        }
    }

    /**
     * 📱 휴대폰 인증번호 발송 요청 (POST /api/auth/phone/send-code)
     */
    suspend fun requestPhoneSmsCode(phoneNumber: String): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val cleanPhone = phoneNumber.replace("[^0-9]".toRegex(), "")
        val endpoints = listOf(
            "$FTS_OFFICIAL_DOMAIN/api/auth/phone/send-code",
            "$FTS_TUNNEL_BASE/api/auth/phone/send-code",
            "$FTS_TUNNEL_BASE_LEGACY/api/auth/phone/send-code"
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
            "$FTS_TUNNEL_BASE/api/auth/phone/verify-code",
            "$FTS_TUNNEL_BASE_LEGACY/api/auth/phone/verify-code"
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
            "$FTS_TUNNEL_BASE/api/inbox/ensure-sheet",
            "$FTS_TUNNEL_BASE_LEGACY/api/inbox/ensure-sheet"
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

                    val gSheetId = if (!resJson.isNull("googleSheetId")) resJson.optString("googleSheetId", "").takeIf { it.isNotBlank() } else null
                    val gSheetUrl = if (!resJson.isNull("googleSheetUrl")) resJson.optString("googleSheetUrl", "").takeIf { it.isNotBlank() } else null
                    val gSheetTab = if (!resJson.isNull("googleSheetTab")) resJson.optString("googleSheetTab", "").takeIf { it.isNotBlank() } else null

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
                        webhookUrl = normalizedWebhook.ifBlank { rawWebhook },
                        googleSheetId = gSheetId,
                        googleSheetUrl = gSheetUrl,
                        googleSheetTab = gSheetTab
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

    data class FtsSiblingSheetInfo(
        val id: String,
        val name: String,
        val rowCount: Int
    )

    data class FtsSheetDataDetail(
        val success: Boolean,
        val token: String = "",
        val sheetName: String = "",
        val projectName: String = "시트봇 연동 장부",
        val projectId: String? = null,
        val googleSheetUrl: String? = null,
        val headers: List<String> = emptyList(),
        val rows: List<JSONObject> = emptyList(),
        val projectSheets: List<FtsSiblingSheetInfo> = emptyList(),
        val error: String? = null
    )

    /**
     * 📱 모바일 인앱 스마트 대장 뷰어용 파일투시트 시트 상세 데이터(headers, rows, projectSheets) 조회
     * GET /api/inbox/{token}?includeRows=true
     */
    suspend fun fetchSheetDataDetail(
        token: String,
        overrideSheetName: String? = null
    ): FtsSheetDataDetail = withContext(Dispatchers.IO) {
        val cleanToken = token.trim()
        if (cleanToken.isBlank()) {
            return@withContext FtsSheetDataDetail(success = false, error = "유효한 시트 토큰이 없습니다.")
        }

        val querySuffix = buildString {
            append("?includeRows=true")
            if (!overrideSheetName.isNullOrBlank()) {
                append("&sheetName=").append(java.net.URLEncoder.encode(overrideSheetName, "UTF-8"))
            }
        }

        val endpointsToTry = listOf(
            "$FTS_OFFICIAL_DOMAIN/api/inbox/$cleanToken$querySuffix",
            "$FTS_TUNNEL_BASE/api/inbox/$cleanToken$querySuffix",
            "$FTS_TUNNEL_BASE_LEGACY/api/inbox/$cleanToken$querySuffix"
        )

        var lastErr: String? = null
        for (targetUrl in endpointsToTry) {
            try {
                val request = Request.Builder()
                    .url(targetUrl)
                    .header("Accept", "application/json")
                    .get()
                    .build()

                client.newCall(request).execute().use { response ->
                    val bodyString = response.body?.string() ?: ""
                    val json = try { JSONObject(bodyString) } catch (_: Exception) { JSONObject() }

                    if (response.isSuccessful && json.optBoolean("success", false)) {
                        val sName = json.optString("sheetName", "").takeIf { it.isNotBlank() && !it.equals("null", true) }
                            ?: json.optString("targetSheet", "").takeIf { it.isNotBlank() && !it.equals("null", true) }
                            ?: (overrideSheetName ?: "파일투시트 대장")
                        val pName = json.optString("projectName", "").takeIf { it.isNotBlank() && !it.equals("null", true) }
                            ?: "시트봇 연동 장부"
                        val pId = json.optString("projectId", "").takeIf { it.isNotBlank() && !it.equals("null", true) }
                        val gUrl = json.optString("googleSheetUrl", "").takeIf { it.isNotBlank() && !it.equals("null", true) }

                        val headersList = mutableListOf<String>()
                        val headersArr = json.optJSONArray("headers")
                        if (headersArr != null) {
                            for (i in 0 until headersArr.length()) {
                                val h = headersArr.optString(i, "").trim()
                                if (h.isNotBlank() && !h.equals("null", true) && !h.startsWith("_")) {
                                    headersList.add(h)
                                }
                            }
                        }

                        val rowsList = mutableListOf<JSONObject>()
                        val rowsArr = json.optJSONArray("rows")
                        if (rowsArr != null) {
                            for (i in 0 until rowsArr.length()) {
                                val rowObj = rowsArr.optJSONObject(i)
                                if (rowObj != null) {
                                    rowsList.add(rowObj)
                                }
                            }
                        }

                        // 만약 headers가 비어있고 rows가 있다면 첫 행의 키들로부터 자동 추론
                        if (headersList.isEmpty() && rowsList.isNotEmpty()) {
                            val firstRow = rowsList.first()
                            val keys = firstRow.keys()
                            while (keys.hasNext()) {
                                val k = keys.next().trim()
                                if (k.isNotBlank() && !k.startsWith("_")) {
                                    headersList.add(k)
                                }
                            }
                        }

                        val siblingList = mutableListOf<FtsSiblingSheetInfo>()
                        val pSheetsArr = json.optJSONArray("projectSheets")
                        if (pSheetsArr != null) {
                            for (i in 0 until pSheetsArr.length()) {
                                val item = pSheetsArr.optJSONObject(i) ?: continue
                                val id = item.optString("id", "").trim()
                                val name = item.optString("name", "").trim()
                                val count = item.optInt("rowCount", 0)
                                if (name.isNotBlank()) {
                                    siblingList.add(FtsSiblingSheetInfo(id = id.ifBlank { name }, name = name, rowCount = count))
                                }
                            }
                        }

                        return@withContext FtsSheetDataDetail(
                            success = true,
                            token = cleanToken,
                            sheetName = sName,
                            projectName = pName,
                            projectId = pId,
                            googleSheetUrl = gUrl,
                            headers = headersList,
                            rows = rowsList,
                            projectSheets = siblingList
                        )
                    } else {
                        lastErr = json.optString("error", "").takeIf { it.isNotBlank() } ?: "HTTP ${response.code}"
                    }
                }
            } catch (e: Exception) {
                lastErr = e.message
            }
        }

        return@withContext FtsSheetDataDetail(
            success = false,
            error = lastErr ?: "파일투시트 서버에서 대장 데이터를 불러오지 못했습니다."
        )
    }

    // =========================================================================
    // 🔐 내 SaaS 휴대폰 로그인 인증(OTP) 0원 중계기 전용 API 메서드
    // =========================================================================
    data class SaasOtpPendingItem(
        val requestId: String,
        val recipientPhone: String,
        val brandName: String,
        val purpose: String,
        val maskedCode: String,
        val message: String,
        val createdAtKst: String
    )

    data class SaasOtpSendTestResult(
        val success: Boolean,
        val requestId: String? = null,
        val status: String? = null,
        val recipient: String? = null,
        val maskedCode: String? = null,
        val message: String? = null,
        val error: String? = null
    )

    data class SaasOtpVerifyTestResult(
        val success: Boolean,
        val verified: Boolean = false,
        val verifiedAt: String? = null,
        val message: String? = null,
        val error: String? = null
    )

    fun getSaasOtpBaseHosts(prefs: PreferencesManager? = null): List<String> {
        val list = mutableListOf<String>()
        val customEp = prefs?.ftsEndpoint
        if (!customEp.isNullOrBlank()) {
            val idx = customEp.indexOf("/api/inbox")
            if (idx > 0) {
                list.add(customEp.substring(0, idx))
            }
        }
        if (!list.contains(FTS_OFFICIAL_DOMAIN)) list.add(FTS_OFFICIAL_DOMAIN)
        if (!list.contains(FTS_TUNNEL_BASE)) list.add(FTS_TUNNEL_BASE)
        if (!list.contains(FTS_TUNNEL_BASE_LEGACY)) list.add(FTS_TUNNEL_BASE_LEGACY)
        return list
    }

    suspend fun fetchPendingSaasOtps(prefs: PreferencesManager): List<SaasOtpPendingItem> = withContext(Dispatchers.IO) {
        val apiKey = prefs.saasOtpApiKey
        if (apiKey.isBlank()) return@withContext emptyList()

        val deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}"
        val ownerPhone = prefs.ftsPhoneNumber ?: ""
        val projectId = prefs.ftsProjectId ?: ""
        val brandName = prefs.saasOtpBrandName
        val dailyLimit = prefs.saasOtpDailyLimit
        val userEmail = prefs.userEmail ?: ""

        val query = buildString {
            append("apiKey=").append(java.net.URLEncoder.encode(apiKey, "UTF-8"))
            if (ownerPhone.isNotBlank()) append("&ownerPhone=").append(java.net.URLEncoder.encode(ownerPhone, "UTF-8"))
            if (projectId.isNotBlank()) append("&projectId=").append(java.net.URLEncoder.encode(projectId, "UTF-8"))
            if (brandName.isNotBlank()) append("&brandName=").append(java.net.URLEncoder.encode(brandName, "UTF-8"))
            append("&dailyLimit=").append(dailyLimit)
            append("&deviceModel=").append(java.net.URLEncoder.encode(deviceModel, "UTF-8"))
            if (userEmail.isNotBlank()) append("&userEmail=").append(java.net.URLEncoder.encode(userEmail, "UTF-8"))
        }

        for (base in getSaasOtpBaseHosts(prefs)) {
            val url = "$base/api/saas/otp/pending?$query"
            try {
                val req = Request.Builder()
                    .url(url)
                    .header("Accept", "application/json")
                    .header("x-saas-otp-key", apiKey)
                    .get()
                    .build()
                client.newCall(req).execute().use { res ->
                    val bodyStr = res.body?.string() ?: ""
                    val json = try { JSONObject(bodyStr) } catch (_: Exception) { JSONObject() }
                    if (res.isSuccessful && json.optBoolean("success", false)) {
                        val arr = json.optJSONArray("pending") ?: return@withContext emptyList()
                        val items = mutableListOf<SaasOtpPendingItem>()
                        for (i in 0 until arr.length()) {
                            val obj = arr.optJSONObject(i) ?: continue
                            val rId = obj.optString("requestId", "")
                            val phone = obj.optString("recipientPhone", "")
                            val msg = obj.optString("message", "")
                            if (rId.isNotBlank() && phone.isNotBlank() && msg.isNotBlank()) {
                                items.add(
                                    SaasOtpPendingItem(
                                        requestId = rId,
                                        recipientPhone = phone,
                                        brandName = obj.optString("brandName", brandName),
                                        purpose = obj.optString("purpose", "로그인"),
                                        maskedCode = obj.optString("maskedCode", "••••••"),
                                        message = msg,
                                        createdAtKst = obj.optString("createdAtKst", "")
                                    )
                                )
                            }
                        }
                        return@withContext items
                    }
                }
            } catch (e: Exception) {
                Log.d(TAG, "fetchPendingSaasOtps 참고 ($base): ${e.message}")
            }
        }
        emptyList()
    }

    suspend fun ackSaasOtpDispatch(
        prefs: PreferencesManager,
        requestId: String,
        success: Boolean,
        errorMessage: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val apiKey = prefs.saasOtpApiKey
        val payload = JSONObject().apply {
            put("apiKey", apiKey)
            put("requestId", requestId)
            put("success", success)
            put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
            prefs.ftsPhoneNumber?.takeIf { it.isNotBlank() }?.let { put("ownerPhone", it) }
            prefs.ftsProjectId?.takeIf { it.isNotBlank() }?.let { put("projectId", it) }
            if (!errorMessage.isNullOrBlank()) put("errorMessage", errorMessage)
        }
        val body = payload.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (base in getSaasOtpBaseHosts(prefs)) {
            val url = "$base/api/saas/otp/ack"
            try {
                val req = Request.Builder()
                    .url(url)
                    .header("x-saas-otp-key", apiKey)
                    .post(body)
                    .build()
                client.newCall(req).execute().use { res ->
                    if (res.isSuccessful) return@withContext true
                }
            } catch (_: Exception) {}
        }
        false
    }

    suspend fun requestSaasOtpTestSend(
        prefs: PreferencesManager,
        recipientPhone: String,
        brandName: String = prefs.saasOtpBrandName,
        purpose: String = "로그인"
    ): SaasOtpSendTestResult = withContext(Dispatchers.IO) {
        val apiKey = prefs.saasOtpApiKey
        val payload = JSONObject().apply {
            put("apiKey", apiKey)
            put("phoneNumber", recipientPhone)
            put("brandName", brandName)
            put("purpose", purpose)
            put("waitMs", 600)
            put("isTest", true)
            prefs.ftsPhoneNumber?.takeIf { it.isNotBlank() }?.let { put("ownerPhone", it) }
            prefs.ftsProjectId?.takeIf { it.isNotBlank() }?.let { put("projectId", it) }
        }
        val body = payload.toString().toRequestBody(JSON_MEDIA_TYPE)
        var lastErr = "서버 연결 실패"

        for (base in getSaasOtpBaseHosts(prefs)) {
            val url = "$base/api/saas/otp/send"
            try {
                val req = Request.Builder()
                    .url(url)
                    .header("x-saas-otp-key", apiKey)
                    .post(body)
                    .build()
                client.newCall(req).execute().use { res ->
                    val resStr = res.body?.string() ?: ""
                    val json = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                    if (res.isSuccessful && json.optBoolean("success", false)) {
                        return@withContext SaasOtpSendTestResult(
                            success = true,
                            requestId = json.optString("requestId", null),
                            status = json.optString("status", "QUEUED"),
                            recipient = json.optString("recipient", recipientPhone),
                            maskedCode = json.optString("maskedCode", "••••••"),
                            message = json.optString("message", "발송 요청 완료")
                        )
                    } else {
                        lastErr = json.optString("error", "HTTP ${res.code}")
                    }
                }
            } catch (e: Exception) {
                lastErr = e.localizedMessage ?: "통신 오류"
            }
        }
        SaasOtpSendTestResult(success = false, error = lastErr)
    }

    suspend fun verifySaasOtpTestCode(
        prefs: PreferencesManager,
        recipientPhone: String,
        code: String
    ): SaasOtpVerifyTestResult = withContext(Dispatchers.IO) {
        val apiKey = prefs.saasOtpApiKey
        val payload = JSONObject().apply {
            put("apiKey", apiKey)
            put("phoneNumber", recipientPhone)
            put("code", code.trim())
        }
        val body = payload.toString().toRequestBody(JSON_MEDIA_TYPE)
        var lastErr = "검증 요청 실패"

        for (base in getSaasOtpBaseHosts(prefs)) {
            val url = "$base/api/saas/otp/verify"
            try {
                val req = Request.Builder()
                    .url(url)
                    .header("x-saas-otp-key", apiKey)
                    .post(body)
                    .build()
                client.newCall(req).execute().use { res ->
                    val resStr = res.body?.string() ?: ""
                    val json = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                    if (res.isSuccessful && json.optBoolean("verified", false)) {
                        return@withContext SaasOtpVerifyTestResult(
                            success = true,
                            verified = true,
                            verifiedAt = json.optString("verifiedAt", null),
                            message = json.optString("message", "인증 성공")
                        )
                    } else {
                        lastErr = json.optString("error", "인증번호가 일치하지 않습니다.")
                    }
                }
            } catch (e: Exception) {
                lastErr = e.localizedMessage ?: "통신 오류"
            }
        }
        SaasOtpVerifyTestResult(success = false, verified = false, error = lastErr)
    }

    // =========================================================================
    // 📋 파일투시트(FileToSheet / 파투) 통합할일대장 및 기존 시트 할 일 연동 API
    // =========================================================================

    /**
     * 파투 서버(/api/inbox/tasks)에서 통합할일대장 목록 + 파투 내 다른 시트(통화녹음, 회의록, 부재중, 문자, 카톡, 주문/견적)에서
     * 자동 추출된 할 일 목록을 통합 조회합니다.
     */
    suspend fun fetchFtsTasks(
        prefs: PreferencesManager,
        status: String = "ALL"
    ): TaskListResult = withContext(Dispatchers.IO) {
        val phone = prefs.ftsPhoneNumber?.replace("[^0-9]".toRegex(), "").orEmpty()
        val projectId = prefs.ftsProjectId.orEmpty()
        val token = prefs.ftsToken.orEmpty()

        if (phone.isBlank() && projectId.isBlank() && token.isBlank()) {
            return@withContext TaskListResult(success = false, error = "파투 연동 정보가 없습니다.")
        }

        val query = buildString {
            append("status=").append(java.net.URLEncoder.encode(status, "UTF-8"))
            if (phone.isNotBlank()) append("&phoneNumber=").append(java.net.URLEncoder.encode(phone, "UTF-8"))
            if (projectId.isNotBlank()) append("&projectId=").append(java.net.URLEncoder.encode(projectId, "UTF-8"))
            if (token.isNotBlank()) append("&token=").append(java.net.URLEncoder.encode(token, "UTF-8"))
        }

        var lastError = "파투 할 일 조회 실패"
        for (base in getSaasOtpBaseHosts(prefs)) {
            val url = "$base/api/inbox/tasks?$query"
            try {
                val reqBuilder = Request.Builder()
                    .url(url)
                    .header("Accept", "application/json")
                    .get()
                if (phone.isNotBlank()) reqBuilder.header("x-user-phone", phone)

                client.newCall(reqBuilder.build()).execute().use { res ->
                    val resStr = res.body?.string() ?: ""
                    val resJson = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                    if (res.isSuccessful && resJson.optBoolean("success", false)) {
                        val returnedToken = resJson.optString("token", "")
                        val returnedWebhook = resJson.optString("webhookUrl", "")
                        if (returnedToken.isNotBlank() && returnedWebhook.isNotBlank()) {
                            prefs.saveFtsSheetBinding(
                                cardIdOrType = "tasks_hub",
                                token = returnedToken,
                                sheetName = resJson.optString("sheetName", "통합할일대장"),
                                webhookUrl = normalizeEndpoint(returnedWebhook, returnedToken),
                                projectId = resJson.optString("projectId", "").takeIf { it.isNotBlank() } ?: prefs.ftsProjectId
                            )
                        }

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
                                        id = obj.optLong("id", 900000L + i),
                                        title = cleanTitle,
                                        description = obj.optCleanNullable("description"),
                                        contactName = obj.optCleanNullable("contact_name"),
                                        contactPhone = obj.optCleanNullable("contact_phone"),
                                        dueDate = obj.optCleanNullable("due_date"),
                                        priority = obj.optCleanNullable("priority") ?: "HIGH 🟡",
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
                            spreadsheetUrl = "$FTS_OFFICIAL_DOMAIN"
                        )
                    } else {
                        lastError = resJson.optString("error", "HTTP ${res.code}")
                    }
                }
            } catch (e: Exception) {
                lastError = e.localizedMessage ?: "통신 오류"
            }
        }

        TaskListResult(success = false, error = lastError)
    }

    /**
     * 파투 '통합할일대장' 시트에 신규 할 일을 직접 기록합니다.
     */
    suspend fun createFtsTask(
        prefs: PreferencesManager,
        title: String,
        contactName: String? = null,
        contactPhone: String? = null,
        dueDate: String? = null,
        priority: String = "HIGH 🟡",
        badgeText: String = "모바일 등록"
    ): Boolean = withContext(Dispatchers.IO) {
        val phone = prefs.ftsPhoneNumber?.replace("[^0-9]".toRegex(), "").orEmpty()
        val projectId = prefs.ftsProjectId.orEmpty()
        val token = prefs.ftsToken.orEmpty()
        if (phone.isBlank() && projectId.isBlank() && token.isBlank()) return@withContext false

        val payload = JSONObject().apply {
            if (phone.isNotBlank()) put("phoneNumber", phone)
            if (projectId.isNotBlank()) put("projectId", projectId)
            if (token.isNotBlank()) put("token", token)
            put("title", title)
            if (!contactName.isNullOrBlank()) put("contactName", contactName)
            if (!contactPhone.isNullOrBlank()) put("contactPhone", contactPhone)
            if (!dueDate.isNullOrBlank()) put("dueDate", dueDate)
            put("priority", priority)
            put("badgeText", badgeText)
            put("sourceType", "SMS")
        }
        val body = payload.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (base in getSaasOtpBaseHosts(prefs)) {
            val url = "$base/api/inbox/tasks"
            try {
                val reqBuilder = Request.Builder()
                    .url(url)
                    .post(body)
                if (phone.isNotBlank()) reqBuilder.header("x-user-phone", phone)

                client.newCall(reqBuilder.build()).execute().use { res ->
                    val resStr = res.body?.string() ?: ""
                    val json = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                    if (res.isSuccessful && json.optBoolean("success", false)) {
                        return@withContext true
                    }
                }
            } catch (_: Exception) {}
        }
        false
    }

    /**
     * 파투 '통합할일대장' 시트 내 할 일의 완료/미완료 상태를 변경합니다.
     */
    suspend fun toggleFtsTaskStatus(
        prefs: PreferencesManager,
        taskId: Long,
        title: String,
        nextStatus: String
    ): Boolean = withContext(Dispatchers.IO) {
        val phone = prefs.ftsPhoneNumber?.replace("[^0-9]".toRegex(), "").orEmpty()
        val projectId = prefs.ftsProjectId.orEmpty()
        val token = prefs.ftsToken.orEmpty()
        if (phone.isBlank() && projectId.isBlank() && token.isBlank()) return@withContext false

        val payload = JSONObject().apply {
            if (phone.isNotBlank()) put("phoneNumber", phone)
            if (projectId.isNotBlank()) put("projectId", projectId)
            if (token.isNotBlank()) put("token", token)
            put("taskId", taskId)
            put("title", title)
            put("status", nextStatus)
        }
        val body = payload.toString().toRequestBody(JSON_MEDIA_TYPE)

        for (base in getSaasOtpBaseHosts(prefs)) {
            val url = "$base/api/inbox/tasks"
            try {
                val reqBuilder = Request.Builder()
                    .url(url)
                    .patch(body)
                if (phone.isNotBlank()) reqBuilder.header("x-user-phone", phone)

                client.newCall(reqBuilder.build()).execute().use { res ->
                    val resStr = res.body?.string() ?: ""
                    val json = try { JSONObject(resStr) } catch (_: Exception) { JSONObject() }
                    if (res.isSuccessful && json.optBoolean("success", false)) {
                        return@withContext true
                    }
                }
            } catch (_: Exception) {}
        }
        false
    }

    // =========================================================================
    // ⚡ 파일투시트(FileToSheet) 통합 워크스페이스 (전체 프로젝트 · 시트 · 승인/보류/반려 결재 · 파일 AI 적재)
    // =========================================================================

    data class FtsWorkspaceSheetInfo(
        val id: String,
        val name: String,
        val rowCount: Int,
        val pendingCount: Int = 0,
        val approvedCount: Int = 0,
        val heldCount: Int = 0,
        val rejectedCount: Int = 0
    )

    data class FtsWorkspaceProjectInfo(
        val id: String,
        val name: String,
        val category: String,
        val totalRows: Int,
        val pendingCount: Int,
        val approvedCount: Int,
        val heldCount: Int,
        val rejectedCount: Int,
        val sheets: List<FtsWorkspaceSheetInfo>
    )

    data class FtsOriginalFileInfo(
        val name: String,
        val url: String,
        val uploadedAt: String = ""
    )

    data class FtsWorkspaceResponse(
        val success: Boolean,
        val projects: List<FtsWorkspaceProjectInfo> = emptyList(),
        val activeProjectId: String = "",
        val activeProjectName: String = "",
        val activeSheetName: String = "",
        val headers: List<String> = emptyList(),
        val rows: List<JSONObject> = emptyList(),
        val originalFiles: List<FtsOriginalFileInfo> = emptyList(),
        val error: String? = null
    )

    private fun parseMcpToolResultJson(rawBody: String): JSONObject? {
        return try {
            val outer = JSONObject(rawBody)
            val resultObj = outer.optJSONObject("result") ?: outer
            val contentArr = resultObj.optJSONArray("content")
            if (contentArr != null && contentArr.length() > 0) {
                val firstText = contentArr.optJSONObject(0)?.optString("text", "").orEmpty()
                if (firstText.isNotBlank()) {
                    return JSONObject(firstText)
                }
            }
            if (resultObj.has("rows") || resultObj.has("updated") || resultObj.has("inserted")) {
                return resultObj
            }
            outer
        } catch (_: Exception) {
            null
        }
    }

    @Volatile
    private var cachedWorkspaceRowsRaw: String? = null
    @Volatile
    private var cachedWorkspaceRowsTimestamp: Long = 0L
    private const val WORKSPACE_CACHE_TTL_MS = 45_000L

    fun invalidateWorkspaceCache() {
        cachedWorkspaceRowsRaw = null
        cachedWorkspaceRowsTimestamp = 0L
    }

    /**
     * 📂 사용자의 전체 파투 프로젝트 목록 및 선택된 프로젝트/시트의 데이터(행, 헤더, 결재 통계, 원본 증빙)를 조회합니다.
     */
    suspend fun fetchAllWorkspaceProjects(
        phoneNumber: String,
        targetProjectId: String? = null,
        targetSheetName: String? = null,
        forceRefresh: Boolean = false
    ): FtsWorkspaceResponse = withContext(Dispatchers.IO) {
        val cleanPhone = phoneNumber.replace("[^0-9]".toRegex(), "")
        val reqProjectId = targetProjectId?.trim().orEmpty()
        val reqSheetName = targetSheetName?.trim().orEmpty()

        val hosts = listOf(FTS_OFFICIAL_DOMAIN, FTS_TUNNEL_BASE, FTS_TUNNEL_BASE_LEGACY)
        var lastError: String? = null

        var rowsArrToUse: org.json.JSONArray? = null
        val nowMs = System.currentTimeMillis()
        val cachedRaw = cachedWorkspaceRowsRaw
        if (!forceRefresh && !cachedRaw.isNullOrBlank() && (nowMs - cachedWorkspaceRowsTimestamp) < WORKSPACE_CACHE_TTL_MS) {
            rowsArrToUse = try { org.json.JSONArray(cachedRaw) } catch (_: Exception) { null }
        }

        if (rowsArrToUse == null) {
            for (host in hosts) {
                try {
                    val queryArgs = JSONObject().apply {
                        put("tableName", "user_projects")
                        put("limit", 100)
                    }
                    val mcpReq = JSONObject().apply {
                        put("tool", "user_data_query")
                        put("arguments", queryArgs)
                    }
                    val req = Request.Builder()
                        .url("$host/__user_data_proxy")
                        .header("Content-Type", "application/json")
                        .post(mcpReq.toString().toRequestBody(JSON_MEDIA_TYPE))
                        .build()

                    client.newCall(req).execute().use { res ->
                        val rawStr = res.body?.string().orEmpty()
                        if (!res.isSuccessful) {
                            lastError = "HTTP ${res.code}"
                            return@use
                        }
                        val dataJson = parseMcpToolResultJson(rawStr)
                        val rowsArr = dataJson?.optJSONArray("rows")
                        if (rowsArr == null) {
                            lastError = "프로젝트 목록 응답 파싱 실패"
                            return@use
                        }
                        rowsArrToUse = rowsArr
                        cachedWorkspaceRowsRaw = rowsArr.toString()
                        cachedWorkspaceRowsTimestamp = System.currentTimeMillis()
                    }
                    if (rowsArrToUse != null) break
                } catch (e: Exception) {
                    lastError = e.localizedMessage ?: "네트워크 연결 오류"
                }
            }
        }

        val rowsArr = rowsArrToUse
        if (rowsArr != null) {
            try {

                    val matchedProjectObjs = mutableListOf<JSONObject>()
                    for (i in 0 until rowsArr.length()) {
                        val pObj = rowsArr.optJSONObject(i) ?: continue
                        val cat = pObj.optString("category", "").trim()
                        if (cat == "trash_project") continue
                        val rowPhone = pObj.optString("phone_number", "").replace("[^0-9]".toRegex(), "")
                        val rowId = pObj.opt("id")?.toString()?.trim().orEmpty()
                        if ((cleanPhone.isNotBlank() && rowPhone == cleanPhone) ||
                            (reqProjectId.isNotBlank() && rowId == reqProjectId)
                        ) {
                            matchedProjectObjs.add(pObj)
                        }
                    }

                    // 시트봇 연동 장부가 맨 앞에 오도록 정렬하되 나머지는 ID 순 정렬
                    matchedProjectObjs.sortWith(
                        compareByDescending<JSONObject> {
                            val c = it.optString("category", "")
                            val n = it.optString("project_name", "")
                            c == "sheetbot_inbox" || n == "시트봇 연동 장부"
                        }.thenBy { it.optInt("id", 0) }
                    )

                    val projectInfoList = mutableListOf<FtsWorkspaceProjectInfo>()
                    val parsedSheetsByProjectId = mutableMapOf<String, org.json.JSONArray>()

                    for (pObj in matchedProjectObjs) {
                        val pId = pObj.opt("id")?.toString()?.trim().orEmpty()
                        val pName = pObj.optString("project_name", "프로젝트").trim().ifBlank { "프로젝트 #$pId" }
                        val pCat = pObj.optString("category", "일반").trim()
                        val sheetsRaw = pObj.optString("sheets_data", "[]")
                        val sheetsArr = try {
                            org.json.JSONArray(sheetsRaw)
                        } catch (_: Exception) {
                            org.json.JSONArray()
                        }
                        parsedSheetsByProjectId[pId] = sheetsArr

                        var pTotalRows = 0
                        var pPending = 0
                        var pApproved = 0
                        var pHeld = 0
                        var pRejected = 0
                        val sheetSummaries = mutableListOf<FtsWorkspaceSheetInfo>()

                        for (sIdx in 0 until sheetsArr.length()) {
                            val sObj = sheetsArr.optJSONObject(sIdx) ?: continue
                            val sName = sObj.optString("name", "").trim()
                            if (sName.isBlank()) continue
                            val sId = sObj.optString("id", sName).trim().ifBlank { sName }
                            val sRows = sObj.optJSONArray("rows")
                            val rLen = sRows?.length() ?: 0

                            var sPending = 0
                            var sApproved = 0
                            var sHeld = 0
                            var sRejected = 0
                            if (sRows != null) {
                                for (rIdx in 0 until rLen) {
                                    val rObj = sRows.optJSONObject(rIdx) ?: continue
                                    when (rObj.optString("_approvalStatus", "PENDING").uppercase()) {
                                        "APPROVED" -> sApproved++
                                        "HELD" -> sHeld++
                                        "REJECTED" -> sRejected++
                                        else -> sPending++
                                    }
                                }
                            }
                            pTotalRows += rLen
                            pPending += sPending
                            pApproved += sApproved
                            pHeld += sHeld
                            pRejected += sRejected

                            sheetSummaries.add(
                                FtsWorkspaceSheetInfo(
                                    id = sId,
                                    name = sName,
                                    rowCount = rLen,
                                    pendingCount = sPending,
                                    approvedCount = sApproved,
                                    heldCount = sHeld,
                                    rejectedCount = sRejected
                                )
                            )
                        }

                        projectInfoList.add(
                            FtsWorkspaceProjectInfo(
                                id = pId,
                                name = pName,
                                category = pCat,
                                totalRows = pTotalRows,
                                pendingCount = pPending,
                                approvedCount = pApproved,
                                heldCount = pHeld,
                                rejectedCount = pRejected,
                                sheets = sheetSummaries
                            )
                        )
                    }

                    val activeProjObj = matchedProjectObjs.firstOrNull {
                        reqProjectId.isNotBlank() && it.opt("id")?.toString()?.trim() == reqProjectId
                    } ?: matchedProjectObjs.firstOrNull()

                    if (activeProjObj == null) {
                        return@withContext FtsWorkspaceResponse(
                            success = true,
                            projects = emptyList(),
                            error = "연동된 파일투시트 프로젝트가 없습니다."
                        )
                    }

                    val activePId = activeProjObj.opt("id")?.toString()?.trim().orEmpty()
                    val activePName = activeProjObj.optString("project_name", "프로젝트").trim()
                    val activeSheetsArr = parsedSheetsByProjectId[activePId] ?: org.json.JSONArray()

                    var activeSheetObj: JSONObject? = null
                    if (reqSheetName.isNotBlank()) {
                        for (i in 0 until activeSheetsArr.length()) {
                            val cand = activeSheetsArr.optJSONObject(i) ?: continue
                            if (cand.optString("name", "").trim() == reqSheetName) {
                                activeSheetObj = cand
                                break
                            }
                        }
                    }
                    if (activeSheetObj == null && activeSheetsArr.length() > 0) {
                        activeSheetObj = activeSheetsArr.optJSONObject(0)
                    }

                    val finalSheetName = activeSheetObj?.optString("name", "")?.trim().orEmpty()
                    val headersList = mutableListOf<String>()
                    val hArr = activeSheetObj?.optJSONArray("headers")
                    if (hArr != null) {
                        for (i in 0 until hArr.length()) {
                            val h = hArr.optString(i, "").trim()
                            if (h.isNotBlank() && !h.equals("null", true) && !h.startsWith("_")) {
                                headersList.add(h)
                            }
                        }
                    }

                    val rowsList = mutableListOf<JSONObject>()
                    val rArr = activeSheetObj?.optJSONArray("rows")
                    if (rArr != null) {
                        for (i in 0 until rArr.length()) {
                            val rObj = rArr.optJSONObject(i) ?: continue
                            val copyObj = JSONObject(rObj.toString())
                            copyObj.put("_rawRowIndex", i)
                            rowsList.add(copyObj)
                        }
                    }

                    if (headersList.isEmpty() && rowsList.isNotEmpty()) {
                        val first = rowsList.first()
                        val keys = first.keys()
                        while (keys.hasNext()) {
                            val k = keys.next().trim()
                            if (k.isNotBlank() && !k.startsWith("_")) {
                                headersList.add(k)
                            }
                        }
                    }

                    val origFilesList = mutableListOf<FtsOriginalFileInfo>()
                    try {
                        val origRaw = activeProjObj.optString("original_files", "")
                        if (origRaw.isNotBlank()) {
                            val origArr = if (origRaw.trim().startsWith("[")) {
                                org.json.JSONArray(origRaw)
                            } else {
                                JSONObject(origRaw).optJSONArray("files")
                            }
                            if (origArr != null) {
                                for (i in 0 until origArr.length()) {
                                    val fObj = origArr.optJSONObject(i) ?: continue
                                    val fName = fObj.optString("name", "").trim()
                                    val fUrl = fObj.optString("url", "").trim()
                                    val fTime = fObj.optString("uploadedAt", "").trim()
                                    if (fName.isNotBlank() || fUrl.isNotBlank()) {
                                        val resolvedUrl = if (fUrl.startsWith("/")) "$FTS_OFFICIAL_DOMAIN$fUrl" else fUrl
                                        origFilesList.add(FtsOriginalFileInfo(name = fName.ifBlank { "첨부증빙 #${i + 1}" }, url = resolvedUrl, uploadedAt = fTime))
                                    }
                                }
                            }
                        }
                    } catch (_: Exception) {}

                    return@withContext FtsWorkspaceResponse(
                        success = true,
                        projects = projectInfoList,
                        activeProjectId = activePId,
                        activeProjectName = activePName,
                        activeSheetName = finalSheetName,
                        headers = headersList,
                        rows = rowsList,
                        originalFiles = origFilesList
                    )
            } catch (e: Exception) {
                lastError = e.localizedMessage ?: "통신 오류"
            }
        }

        FtsWorkspaceResponse(success = false, error = lastError ?: "파일투시트 워크스페이스 조회 실패")
    }

    /**
     * ✅ 특정 프로젝트·시트의 행 결재 상태(APPROVED / HELD / REJECTED / PENDING) 및 사유를 업데이트합니다.
     * - 파투 웹의 useTableEditor.handleUpdateRowApproval 규격과 100% 호환되며 data_change_logs 감사 이력도 함께 적재합니다.
     */
    suspend fun updateWorkspaceRowApproval(
        projectId: String,
        sheetName: String,
        rowIndices: List<Int>,
        serialNumbers: List<String>,
        status: String,
        reason: String? = null,
        actorPhone: String = ""
    ): Boolean = withContext(Dispatchers.IO) {
        if (projectId.isBlank() || sheetName.isBlank()) return@withContext false

        val hosts = listOf(FTS_OFFICIAL_DOMAIN, FTS_TUNNEL_BASE, FTS_TUNNEL_BASE_LEGACY)
        val sdf = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.KOREA).apply {
            timeZone = java.util.TimeZone.getTimeZone("Asia/Seoul")
        }
        val nowKst = sdf.format(java.util.Date())

        for (host in hosts) {
            try {
                // 1. 대상 프로젝트 최신 데이터 조회
                val queryReq = JSONObject().apply {
                    put("tool", "user_data_query")
                    put("arguments", JSONObject().apply {
                        put("tableName", "user_projects")
                        put("filters", JSONObject().apply { put("id", projectId) })
                        put("limit", 1)
                    })
                }
                val getRes = client.newCall(
                    Request.Builder()
                        .url("$host/__user_data_proxy")
                        .header("Content-Type", "application/json")
                        .post(queryReq.toString().toRequestBody(JSON_MEDIA_TYPE))
                        .build()
                ).execute()

                val getBody = getRes.body?.string().orEmpty()
                getRes.close()
                val projJson = parseMcpToolResultJson(getBody)
                val projRow = projJson?.optJSONArray("rows")?.optJSONObject(0) ?: continue

                val sheetsArr = org.json.JSONArray(projRow.optString("sheets_data", "[]"))
                var targetSheet: JSONObject? = null
                for (i in 0 until sheetsArr.length()) {
                    val s = sheetsArr.optJSONObject(i) ?: continue
                    if (s.optString("name", "").trim() == sheetName.trim()) {
                        targetSheet = s
                        break
                    }
                }
                if (targetSheet == null) continue

                val rowsArr = targetSheet.optJSONArray("rows") ?: continue
                val idxSet = rowIndices.toSet()
                val serialSet = serialNumbers.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
                var changed = 0

                for (i in 0 until rowsArr.length()) {
                    val r = rowsArr.optJSONObject(i) ?: continue
                    val rSerial = (r.optString("일련번호", "").ifBlank { r.optString("번호", "") }).trim()
                    if (i in idxSet || (rSerial.isNotEmpty() && rSerial in serialSet)) {
                        r.put("_approvalStatus", status)
                        r.put("_approvalTimestamp", nowKst)
                        if (actorPhone.isNotBlank()) r.put("_approvalActor", actorPhone)
                        if (reason != null) r.put("_approvalReason", reason)
                        changed++
                    }
                }

                if (changed == 0) return@withContext false

                // 2. user_projects 업데이트
                val updateReq = JSONObject().apply {
                    put("tool", "user_data_update")
                    put("arguments", JSONObject().apply {
                        put("tableName", "user_projects")
                        put("updates", JSONObject().apply {
                            put("sheets_data", sheetsArr.toString())
                            put("updated_at", nowKst)
                        })
                        put("where", JSONObject().apply {
                            put("ids", org.json.JSONArray().put(projectId.toIntOrNull() ?: projectId))
                        })
                    })
                }
                val updRes = client.newCall(
                    Request.Builder()
                        .url("$host/__user_data_proxy")
                        .header("Content-Type", "application/json")
                        .post(updateReq.toString().toRequestBody(JSON_MEDIA_TYPE))
                        .build()
                ).execute()
                val updOk = updRes.isSuccessful
                updRes.close()

                if (updOk) {
                    invalidateWorkspaceCache()
                    // 3. 감사 로그(data_change_logs) 기록 (베스트 에포트)
                    try {
                        val logReq = JSONObject().apply {
                            put("tool", "user_data_insert")
                            put("arguments", JSONObject().apply {
                                put("tableName", "data_change_logs")
                                put("rows", org.json.JSONArray().put(JSONObject().apply {
                                    put("project_id", projectId)
                                    put("sheet_name", sheetName)
                                    put("change_type", "update_approval_status")
                                    put("target_row", serialSet.joinToString(",").ifBlank { idxSet.joinToString(",") })
                                    put("column_name", "_approvalStatus")
                                    put("after_value", if (!reason.isNullOrBlank()) "$status ($reason)" else status)
                                    put("operator", actorPhone.ifBlank { "mobile_app" })
                                    put("created_at", nowKst)
                                }))
                            })
                        }
                        client.newCall(
                            Request.Builder()
                                .url("$host/__user_data_proxy")
                                .header("Content-Type", "application/json")
                                .post(logReq.toString().toRequestBody(JSON_MEDIA_TYPE))
                                .build()
                        ).execute().close()
                    } catch (_: Exception) {}

                    return@withContext true
                }
            } catch (_: Exception) {}
        }
        false
    }

    /**
     * 🔑 임의의 프로젝트(projectId)와 시트(sheetName)에 대응하는 전용 모바일 Ingest 토큰을 조회하거나 즉시 발급합니다.
     */
    suspend fun ensureProjectSheetToken(
        projectId: String,
        projectName: String,
        sheetName: String,
        phoneNumber: String
    ): String? = withContext(Dispatchers.IO) {
        val cleanPhone = phoneNumber.replace("[^0-9]".toRegex(), "")
        val hosts = listOf(FTS_OFFICIAL_DOMAIN, FTS_TUNNEL_BASE, FTS_TUNNEL_BASE_LEGACY)

        for (host in hosts) {
            try {
                // 1. 기존 활성 토큰 조회
                val getUrl = "$host/api/inbox/token?projectId=${java.net.URLEncoder.encode(projectId, "UTF-8")}&sheetName=${java.net.URLEncoder.encode(sheetName, "UTF-8")}"
                client.newCall(Request.Builder().url(getUrl).get().build()).execute().use { res ->
                    val str = res.body?.string().orEmpty()
                    val json = try { JSONObject(str) } catch (_: Exception) { JSONObject() }
                    if (res.isSuccessful && json.optBoolean("exists", false)) {
                        val existingToken = json.optString("token", "").trim()
                        if (existingToken.isNotBlank()) return@withContext existingToken
                    }
                }

                // 2. 없으면 즉시 신규 발급
                val postBody = JSONObject().apply {
                    put("projectId", projectId)
                    put("projectName", projectName)
                    put("sheetName", sheetName)
                    if (cleanPhone.isNotBlank()) put("userPhone", cleanPhone)
                }.toString().toRequestBody(JSON_MEDIA_TYPE)

                client.newCall(Request.Builder().url("$host/api/inbox/token").post(postBody).build()).execute().use { res ->
                    val str = res.body?.string().orEmpty()
                    val json = try { JSONObject(str) } catch (_: Exception) { JSONObject() }
                    if (res.isSuccessful && json.optBoolean("success", false)) {
                        val newToken = json.optString("token", "").trim()
                        if (newToken.isNotBlank()) return@withContext newToken
                    }
                }
            } catch (_: Exception) {}
        }
        null
    }

    /**
     * 📤 선택한 프로젝트(projectId)의 시트(sheetName)에 파일/사진/음성을 업로드하여 AI OCR/STT 자동 분석 적재를 수행합니다.
     */
    suspend fun uploadFileToWorkspaceSheet(
        phoneNumber: String,
        projectId: String,
        projectName: String,
        sheetName: String,
        file: File,
        mimeType: String,
        memo: String = "",
        ocrType: String? = null,
        contactName: String? = null,
        callTime: String? = null
    ): FtsUploadResult = withContext(Dispatchers.IO) {
        val token = ensureProjectSheetToken(projectId, projectName, sheetName, phoneNumber)
            ?: return@withContext FtsUploadResult(success = false, error = "대상 시트($sheetName)의 업로드 토큰을 생성할 수 없습니다.")
        val endpoint = "$FTS_OFFICIAL_DOMAIN/api/inbox/$token"
        val res = uploadFile(
            endpoint = endpoint,
            file = file,
            mimeType = mimeType,
            memo = memo,
            ocrType = ocrType,
            contactName = contactName,
            callTime = callTime
        )
        if (res.success) invalidateWorkspaceCache()
        res
    }

    /**
     * ✏️ 선택한 프로젝트(projectId)의 시트(sheetName)에 수동 입력 행(rowData)을 직접 추가합니다.
     */
    suspend fun appendManualRowToWorkspaceSheet(
        phoneNumber: String,
        projectId: String,
        projectName: String,
        sheetName: String,
        rowData: JSONObject
    ): FtsUploadResult = withContext(Dispatchers.IO) {
        val token = ensureProjectSheetToken(projectId, projectName, sheetName, phoneNumber)
            ?: return@withContext FtsUploadResult(success = false, error = "대상 시트($sheetName)의 적재 토큰을 생성할 수 없습니다.")
        val endpoint = "$FTS_OFFICIAL_DOMAIN/api/inbox/$token"
        val res = uploadJson(
            endpoint = endpoint,
            rowData = rowData
        )
        if (res.success) invalidateWorkspaceCache()
        res
    }

    data class FtsGlobalSearchResult(
        val success: Boolean,
        val matchedProjectsCount: Int = 0,
        val matchedSheetsCount: Int = 0,
        val totalMatchedCount: Int = 0,
        val keywords: List<String> = emptyList(),
        val matchedRows: List<FtsSearchMatchedRow> = emptyList(),
        val summaryText: String = "",
        val spokenText: String = ""
    )

    private fun optCleanVal(obj: JSONObject, key: String): String {
        if (obj.isNull(key)) return ""
        val v = obj.optString(key, "").trim()
        return if (v.isEmpty() || v.equals("null", true) || v.equals("undefined", true) || v == "-") "" else v
    }

    /**
     * 🔍 파투(FileToSheet) 내 사용자의 모든 프로젝트 및 하위 모든 시트에 대해 자연어/키워드 통합 검색을 수행합니다.
     */
    suspend fun searchAcrossAllWorkspaceProjects(
        phoneNumber: String,
        projectIdHint: String? = null,
        rawQuery: String,
        serverKeywordsHint: List<String> = emptyList()
    ): FtsGlobalSearchResult = withContext(Dispatchers.IO) {
        val cleanPhone = phoneNumber.replace("[^0-9]".toRegex(), "")
        val reqProjectId = projectIdHint?.trim().orEmpty()
        if (cleanPhone.isBlank() && reqProjectId.isBlank()) {
            return@withContext FtsGlobalSearchResult(success = false)
        }

        // 캐시가 비어 있으면 먼저 fetchAllWorkspaceProjects로 채움
        if (cachedWorkspaceRowsRaw.isNullOrBlank()) {
            fetchAllWorkspaceProjects(phoneNumber = cleanPhone, targetProjectId = reqProjectId)
        }
        val rawStr = cachedWorkspaceRowsRaw ?: return@withContext FtsGlobalSearchResult(success = false)
        val rowsArr = try { JSONArray(rawStr) } catch (_: Exception) { return@withContext FtsGlobalSearchResult(success = false) }

        val matchedProjectObjs = mutableListOf<JSONObject>()
        for (i in 0 until rowsArr.length()) {
            val pObj = rowsArr.optJSONObject(i) ?: continue
            val cat = pObj.optString("category", "").trim()
            if (cat == "trash_project") continue
            val rowPhone = pObj.optString("phone_number", "").replace("[^0-9]".toRegex(), "")
            val rowId = pObj.opt("id")?.toString()?.trim().orEmpty()
            if ((cleanPhone.isNotBlank() && rowPhone == cleanPhone) ||
                (reqProjectId.isNotBlank() && rowId == reqProjectId)
            ) {
                matchedProjectObjs.add(pObj)
            }
        }
        if (matchedProjectObjs.isEmpty()) return@withContext FtsGlobalSearchResult(success = false)

        val stopWords = setOf(
            "파투", "파일투시트", "시트", "프로젝트", "대장", "장부", "내역", "목록", "리스트",
            "찾아줘", "보여줘", "알려줘", "검색해줘", "검색", "조회해줘", "조회", "확인해줘", "확인",
            "전체", "모두", "다", "관련", "최근", "최신", "오늘", "어제", "이번달", "이번", "달",
            "건수", "금액", "합계", "얼마", "몇건", "몇", "에서", "있는", "있나", "해줘", "요약"
        )

        val extractedKeywords = mutableListOf<String>()
        for (k in serverKeywordsHint) {
            val clean = k.trim()
            if (clean.isNotEmpty() && clean !in stopWords && clean !in extractedKeywords) {
                extractedKeywords.add(clean)
            }
        }
        if (extractedKeywords.isEmpty()) {
            val cleanedQuery = rawQuery
                .replace(Regex("(찾아줘|보여줘|알려줘|검색해줘|조회해줘|확인해줘|에서|관련|내역|목록|시트|파투|파일투시트)"), " ")
            for (token in cleanedQuery.split(Regex("[\\s,·/()]+"))) {
                val clean = token.trim().replace(Regex("(은|는|이|가|을|를|의|에|로|으로|랑|하고|과|와)$"), "")
                if (clean.length >= 2 && clean !in stopWords && clean !in extractedKeywords) {
                    extractedKeywords.add(clean)
                }
            }
        }

        val qLower = rawQuery.lowercase()
        val filterApproval = when {
            qLower.contains("미결재") || qLower.contains("대기중") || qLower.contains("결재대기") -> "PENDING"
            qLower.contains("승인된") || qLower.contains("승인완료") -> "APPROVED"
            qLower.contains("보류") -> "HELD"
            qLower.contains("반려") -> "REJECTED"
            else -> ""
        }

        val nowKst = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("Asia/Seoul"))
        val yyyy = nowKst.get(java.util.Calendar.YEAR)
        val mm = String.format("%02d", nowKst.get(java.util.Calendar.MONTH) + 1)
        val dd = String.format("%02d", nowKst.get(java.util.Calendar.DAY_OF_MONTH))
        val todayIso = "$yyyy-$mm-$dd"
        val todayShort = "$mm/$dd"
        val thisMonthIso = "$yyyy-$mm"

        val isTodayFilter = qLower.contains("오늘")
        val isThisMonthFilter = qLower.contains("이번 달") || qLower.contains("이번달")

        data class ScoredCandidate(
            val score: Int,
            val projectId: String,
            val projectName: String,
            val sheetName: String,
            val headers: List<String>,
            val rowObj: JSONObject,
            val rawRowIndex: Int
        )

        val candidates = mutableListOf<ScoredCandidate>()

        for (pObj in matchedProjectObjs) {
            val pId = pObj.opt("id")?.toString()?.trim().orEmpty()
            val pName = pObj.optString("project_name", "프로젝트").trim().ifBlank { "프로젝트 #$pId" }
            val sheetsArr = try { JSONArray(pObj.optString("sheets_data", "[]")) } catch (_: Exception) { JSONArray() }

            for (sIdx in 0 until sheetsArr.length()) {
                val sObj = sheetsArr.optJSONObject(sIdx) ?: continue
                val sName = sObj.optString("name", "").trim()
                if (sName.isBlank()) continue
                val rows = sObj.optJSONArray("rows") ?: continue

                val headers = mutableListOf<String>()
                val hArr = sObj.optJSONArray("headers")
                if (hArr != null) {
                    for (hIdx in 0 until hArr.length()) {
                        val h = hArr.optString(hIdx, "").trim()
                        if (h.isNotBlank() && !h.equals("null", true) && !h.startsWith("_")) {
                            headers.add(h)
                        }
                    }
                }
                if (headers.isEmpty() && rows.length() > 0) {
                    val first = rows.optJSONObject(0)
                    if (first != null) {
                        val itKeys = first.keys()
                        while (itKeys.hasNext()) {
                            val k = itKeys.next().trim()
                            if (k.isNotBlank() && !k.startsWith("_")) headers.add(k)
                        }
                    }
                }

                val sheetMentioned = qLower.contains(sName.lowercase().removeSuffix("대장"))

                for (rIdx in 0 until rows.length()) {
                    val rObj = rows.optJSONObject(rIdx) ?: continue
                    val rowApproval = optCleanVal(rObj, "_approvalStatus").uppercase().ifBlank { "PENDING" }
                    if (filterApproval.isNotEmpty() && rowApproval != filterApproval) continue

                    val cellStrings = mutableListOf<String>()
                    val keysIt = rObj.keys()
                    while (keysIt.hasNext()) {
                        val k = keysIt.next()
                        if (k.startsWith("_")) continue
                        val v = optCleanVal(rObj, k)
                        if (v.isNotEmpty()) cellStrings.add(v)
                    }
                    if (cellStrings.isEmpty()) continue
                    val joinedLower = cellStrings.joinToString(" ").lowercase()

                    if (isTodayFilter && !joinedLower.contains(todayIso) && !joinedLower.contains(todayShort)) {
                        continue
                    }
                    if (isThisMonthFilter && !joinedLower.contains(thisMonthIso) && !joinedLower.contains("$mm/")) {
                        continue
                    }

                    var score = 0
                    var kwHitCount = 0
                    for (kw in extractedKeywords) {
                        val kwL = kw.lowercase()
                        if (joinedLower.contains(kwL)) {
                            score += 8
                            kwHitCount++
                        } else if (sName.lowercase().contains(kwL) || pName.lowercase().contains(kwL)) {
                            score += 3
                        }
                    }
                    if (sheetMentioned) score += 4
                    if (filterApproval.isNotEmpty() && rowApproval == filterApproval) score += 5
                    if (isTodayFilter || isThisMonthFilter) score += 4

                    if (extractedKeywords.isNotEmpty()) {
                        if (kwHitCount == 0 && !sheetMentioned) continue
                    } else {
                        if (!sheetMentioned && filterApproval.isEmpty() && !isTodayFilter && !isThisMonthFilter) {
                            score += 1
                        }
                    }

                    if (score > 0) {
                        candidates.add(
                            ScoredCandidate(
                                score = score,
                                projectId = pId,
                                projectName = pName,
                                sheetName = sName,
                                headers = headers,
                                rowObj = rObj,
                                rawRowIndex = rIdx
                            )
                        )
                    }
                }
            }
        }

        candidates.sortWith(compareByDescending<ScoredCandidate> { it.score }.thenByDescending { it.rawRowIndex })

        val totalMatched = candidates.size
        val projCount = candidates.map { it.projectId }.distinct().size
        val sheetCount = candidates.map { "${it.projectId}::${it.sheetName}" }.distinct().size

        val matchedDtos = candidates.take(25).map { cand ->
            val keys = cand.headers
            fun findByKw(kws: List<String>): String {
                for (kw in kws) {
                    for (k in keys) {
                        if (k.contains(kw)) {
                            val v = optCleanVal(cand.rowObj, k)
                            if (v.isNotEmpty()) return v
                        }
                    }
                }
                return ""
            }

            val serial = findByKw(listOf("일련번호", "번호")).ifBlank { "${cand.rawRowIndex + 1}" }
            val approval = optCleanVal(cand.rowObj, "_approvalStatus").uppercase().ifBlank { "PENDING" }
            val ts = findByKw(listOf("일시", "일자", "날짜", "등록일", "수신일", "통화일", "거래일", "발행일", "주문일"))
            val amt = findByKw(listOf("합계금액", "결제금액", "금액", "공급가액", "단가", "잔액"))
            var phone = findByKw(listOf("전화번호", "휴대폰", "휴대전화", "연락처", "발신번호", "수신번호"))
            if (phone.isBlank()) {
                val phoneRegex = Regex("(01[016789][-\\s]?\\d{3,4}[-\\s]?\\d{4}|0\\d{1,2}[-\\s]?\\d{3,4}[-\\s]?\\d{4}|1[568]\\d{2}[-\\s]?\\d{4})")
                for (k in keys) {
                    val m = phoneRegex.find(optCleanVal(cand.rowObj, k))
                    if (m != null) {
                        phone = m.value
                        break
                    }
                }
            }
            val audioFile = findByKw(listOf("파일명"))

            var title = findByKw(
                listOf(
                    "할일제목", "메일제목", "회의제목", "포스트제목", "문서/질의제목", "제목",
                    "상대방이름", "상대방", "채팅방/발신자", "발신자", "성함", "고객명",
                    "고객/가맹점명", "상호", "기업명", "회사명", "이름", "품목"
                )
            )
            var subtitle = findByKw(
                listOf(
                    "요약내용", "본문요약", "AI요약", "핵심요약", "법률검토요약", "메시지내용",
                    "거래내용", "품목내역", "견적내용", "발송할문자내용", "발송문구",
                    "자동회신내용", "주요결정사항", "상세정보", "품목", "메모", "비고"
                )
            )
            if (title.isBlank()) {
                for (k in keys) {
                    if (k == "일련번호" || k.contains("일시") || k.contains("일자")) continue
                    val v = optCleanVal(cand.rowObj, k)
                    if (v.isNotEmpty()) {
                        title = v
                        break
                    }
                }
            }
            if (title.isBlank()) title = "${cand.sheetName} #${cand.rawRowIndex + 1}"
            if (subtitle == title) subtitle = ""

            val fields = mutableListOf<Pair<String, String>>()
            for (k in keys) {
                if (k.startsWith("_") || k == "일련번호") continue
                val v = optCleanVal(cand.rowObj, k)
                if (v.isEmpty() || v == title || v == subtitle || v == ts || v == amt) continue
                fields.add(k to (if (v.length > 60) v.take(58) + "…" else v))
                if (fields.size >= 5) break
            }

            val copyJson = JSONObject(cand.rowObj.toString()).apply {
                put("_rawRowIndex", cand.rawRowIndex)
            }

            FtsSearchMatchedRow(
                projectId = cand.projectId,
                projectName = cand.projectName,
                sheetName = cand.sheetName,
                rowNumber = cand.rawRowIndex + 1,
                rawRowIndex = cand.rawRowIndex,
                serialNumber = serial,
                approvalStatus = approval,
                primaryTitle = if (title.length > 90) title.take(88) + "…" else title,
                primarySubtitle = if (subtitle.length > 180) subtitle.take(178) + "…" else subtitle,
                timestampText = ts,
                amountText = amt,
                phoneNumber = phone,
                audioFileName = audioFile,
                matchedFields = fields,
                rowJson = copyJson,
                headers = keys
            )
        }

        val summary = if (totalMatched > 0) {
            "파투 ${projCount}개 프로젝트 · ${sheetCount}개 시트에서 총 ${totalMatched}건의 일치 내역을 찾았습니다."
        } else {
            "파투 프로젝트 및 시트에서 일치하는 내역을 찾지 못했습니다."
        }

        FtsGlobalSearchResult(
            success = true,
            matchedProjectsCount = projCount,
            matchedSheetsCount = sheetCount,
            totalMatchedCount = totalMatched,
            keywords = extractedKeywords,
            matchedRows = matchedDtos,
            summaryText = summary,
            spokenText = summary
        )
    }

    /**
     * 전화번호 정규화 (숫자만 추출, +82 -> 0 변환, 끝 7~8자리 추출)
     */
    private fun normalizePhoneDigits(raw: String): String {
        var digits = raw.replace(Regex("[^0-9]"), "")
        if (digits.startsWith("82") && digits.length >= 10) {
            digits = "0" + digits.substring(2)
        }
        return digits
    }

    private fun isCallerPhoneMatchedInText(
        cellOrRowText: String,
        cleanTarget: String,
        tail7: String,
        tail8: String
    ): Boolean {
        if (cellOrRowText.isBlank() || cleanTarget.length < 7) return false
        val digitsInText = cellOrRowText.replace(Regex("[^0-9]"), "")
        if (digitsInText.isEmpty()) return false
        if (digitsInText.contains(cleanTarget)) return true
        if (tail8.length == 8 && digitsInText.contains(tail8)) return true
        if (cleanTarget.length == 8 && tail7.length >= 7 && digitsInText.endsWith(cleanTarget)) return true
        // 대표번호/지역번호 내선 대역 (예: 02-2186-4160 vs 02-2186-4164 앞 8자리 일치 시 보조 참고용이 아닌 정확 매칭 우선)
        return false
    }

    /**
     * 🔍 인콜 미리보기 테스트 시 사용자의 실제 파투 시트(통화녹음대장 등)에 기록된 가장 최근 발신/수신 전화번호를 찾습니다.
     */
    suspend fun findMostRecentCallerPhoneInWorkspace(
        ownerPhone: String,
        projectIdHint: String? = null
    ): String? = withContext(Dispatchers.IO) {
        val cleanOwner = ownerPhone.replace("[^0-9]".toRegex(), "")
        val reqProjectId = projectIdHint?.trim().orEmpty()
        if (cleanOwner.isBlank() && reqProjectId.isBlank()) return@withContext null

        if (cachedWorkspaceRowsRaw.isNullOrBlank()) {
            fetchAllWorkspaceProjects(phoneNumber = cleanOwner, targetProjectId = reqProjectId)
        }
        val rawStr = cachedWorkspaceRowsRaw ?: return@withContext null
        val rowsArr = try { JSONArray(rawStr) } catch (_: Exception) { return@withContext null }

        val phoneRegex = Regex("(01[016789][-\\s]?\\d{3,4}[-\\s]?\\d{4}|0\\d{1,2}[-\\s]?\\d{3,4}[-\\s]?\\d{4}|1[568]\\d{2}[-\\s]?\\d{4})")

        for (i in 0 until rowsArr.length()) {
            val pObj = rowsArr.optJSONObject(i) ?: continue
            if (pObj.optString("category", "") == "trash_project") continue
            val rowPhone = pObj.optString("phone_number", "").replace("[^0-9]".toRegex(), "")
            val rowId = pObj.opt("id")?.toString()?.trim().orEmpty()
            if ((cleanOwner.isNotBlank() && rowPhone == cleanOwner) || (reqProjectId.isNotBlank() && rowId == reqProjectId)) {
                val sheetsArr = try { JSONArray(pObj.optString("sheets_data", "[]")) } catch (_: Exception) { continue }
                // 통화녹음대장 우선 확인
                for (sIdx in 0 until sheetsArr.length()) {
                    val sObj = sheetsArr.optJSONObject(sIdx) ?: continue
                    val sName = sObj.optString("name", "")
                    if (!sName.contains("통화녹음") && !sName.contains("할일") && !sName.contains("문자")) continue
                    val rArr = sObj.optJSONArray("rows") ?: continue
                    for (rIdx in rArr.length() - 1 downTo 0) {
                        val rObj = rArr.optJSONObject(rIdx) ?: continue
                        val joined = rObj.toString()
                        val m = phoneRegex.find(joined)
                        if (m != null) return@withContext m.value
                    }
                }
            }
        }
        null
    }

    /**
     * 📞 수신/발신 전화 시 파투(FileToSheet) 내 모든 프로젝트와 시트(통화녹음대장, 통합할일대장, 명함관리, 연락처대장,
     * 문자송수신대장, 카카오톡대화대장, 이메일수신대장 및 일반 프로젝트 시트)를 통합 스캔하여
     * 0.2초 만에 인콜 플로팅 브리핑 데이터를 조합합니다.
     */
    suspend fun fetchInCallBriefingFromWorkspace(
        ownerPhone: String,
        callerPhone: String,
        projectIdHint: String? = null,
        deviceContactName: String? = null
    ): CallSummaryResult = withContext(Dispatchers.IO) {
        val cleanOwner = ownerPhone.replace("[^0-9]".toRegex(), "")
        val reqProjectId = projectIdHint?.trim().orEmpty()
        val cleanCaller = normalizePhoneDigits(callerPhone)
        val tail8 = if (cleanCaller.length >= 8) cleanCaller.takeLast(8) else cleanCaller
        val tail7 = if (cleanCaller.length >= 7) cleanCaller.takeLast(7) else cleanCaller

        if ((cleanOwner.isBlank() && reqProjectId.isBlank()) || cleanCaller.length < 7) {
            return@withContext CallSummaryResult(
                success = false,
                phone = callerPhone,
                cleanPhone = cleanCaller,
                error = "파투 연동 정보 또는 발신 번호가 유효하지 않습니다."
            )
        }

        if (cachedWorkspaceRowsRaw.isNullOrBlank()) {
            fetchAllWorkspaceProjects(phoneNumber = cleanOwner, targetProjectId = reqProjectId)
        }
        val rawStr = cachedWorkspaceRowsRaw ?: return@withContext CallSummaryResult(
            success = false,
            phone = callerPhone,
            cleanPhone = cleanCaller
        )
        val rowsArr = try { JSONArray(rawStr) } catch (_: Exception) {
            return@withContext CallSummaryResult(success = false, phone = callerPhone, cleanPhone = cleanCaller)
        }

        val matchedProjectObjs = mutableListOf<JSONObject>()
        for (i in 0 until rowsArr.length()) {
            val pObj = rowsArr.optJSONObject(i) ?: continue
            if (pObj.optString("category", "").trim() == "trash_project") continue
            val rowPhone = pObj.optString("phone_number", "").replace("[^0-9]".toRegex(), "")
            val rowId = pObj.opt("id")?.toString()?.trim().orEmpty()
            if ((cleanOwner.isNotBlank() && rowPhone == cleanOwner) ||
                (reqProjectId.isNotBlank() && rowId == reqProjectId)
            ) {
                matchedProjectObjs.add(pObj)
            }
        }

        var resolvedName = deviceContactName?.trim().orEmpty()
        var resolvedCompany = ""
        var resolvedPosition = ""
        var lastCallTime = ""
        var lastCallSummary = ""
        var lastMissedTime = ""
        val pendingTaskLines = mutableListOf<String>()
        val recentActivityLines = mutableListOf<String>()
        var isFound = false

        // "이항식 (032디자인 / 010-3201-8032)" 또는 "국민건강보험공단 강남서부지사 (02-2186-4164)" 파싱 헬퍼
        fun parseCompositeCallerLabel(rawLabel: String) {
            val cleaned = rawLabel.replace(Regex("^\\[|\\]$"), "").trim()
            if (cleaned.isBlank() || cleaned == "미등록 연락처" || cleaned == "알수없음") return
            val parenIdx = cleaned.indexOf('(')
            if (parenIdx > 0) {
                val mainPart = cleaned.substring(0, parenIdx).trim()
                val insideParen = cleaned.substring(parenIdx + 1).substringBefore(')').trim()
                if (resolvedName.isBlank() && mainPart.isNotBlank() && !mainPart.all { it.isDigit() || it == '-' }) {
                    resolvedName = mainPart
                }
                if (resolvedCompany.isBlank() && insideParen.contains("/")) {
                    val compCandidate = insideParen.substringBefore("/").trim()
                    if (compCandidate.isNotBlank() && !compCandidate.all { it.isDigit() || it == '-' }) {
                        resolvedCompany = compCandidate
                    }
                }
            } else if (resolvedName.isBlank() && !cleaned.all { it.isDigit() || it == '-' }) {
                resolvedName = cleaned
            }
        }

        // 1차 패스: 전화번호 기준 전체 프로젝트·시트 스캔 (명함/연락처/통화녹음에서 이름과 회사 먼저 확보)
        for (pObj in matchedProjectObjs) {
            val sheetsArr = try { JSONArray(pObj.optString("sheets_data", "[]")) } catch (_: Exception) { continue }
            for (sIdx in 0 until sheetsArr.length()) {
                val sObj = sheetsArr.optJSONObject(sIdx) ?: continue
                val sName = sObj.optString("name", "").trim()
                val rArr = sObj.optJSONArray("rows") ?: continue

                for (rIdx in rArr.length() - 1 downTo 0) {
                    val rObj = rArr.optJSONObject(rIdx) ?: continue
                    val rowStr = rObj.toString()
                    if (!isCallerPhoneMatchedInText(rowStr, cleanCaller, tail7, tail8)) continue

                    isFound = true
                    val cName = optCleanVal(rObj, "성함")
                        .ifBlank { optCleanVal(rObj, "이름") }
                        .ifBlank { optCleanVal(rObj, "고객명") }
                        .ifBlank { optCleanVal(rObj, "상대방이름") }
                        .ifBlank { optCleanVal(rObj, "연락처이름") }
                    val cComp = optCleanVal(rObj, "회사명")
                        .ifBlank { optCleanVal(rObj, "회사/상호") }
                        .ifBlank { optCleanVal(rObj, "상호") }
                        .ifBlank { optCleanVal(rObj, "기업명") }
                    val cPos = optCleanVal(rObj, "직함")
                        .ifBlank { optCleanVal(rObj, "직함/부서") }

                    if (resolvedName.isBlank() && cName.isNotBlank() && cName != "미등록 연락처") {
                        resolvedName = cName
                    }
                    if (resolvedCompany.isBlank() && cComp.isNotBlank()) {
                        resolvedCompany = cComp
                    }
                    if (resolvedPosition.isBlank() && cPos.isNotBlank()) {
                        resolvedPosition = cPos
                    }
                    val callerField = optCleanVal(rObj, "상대방").ifBlank { optCleanVal(rObj, "채팅방/발신자") }
                    if (callerField.isNotBlank()) {
                        parseCompositeCallerLabel(callerField)
                    }
                }
            }
        }

        // 이름/기관명 매칭용 키워드 (예: "국민건강보험공단", "이항식", "032디자인")
        val identityKeywords = buildList {
            if (resolvedName.length >= 2 && resolvedName != "미등록 연락처" && resolvedName != "고객") {
                add(resolvedName)
                // 공백 앞 첫 단어도 기관명일 경우 추가 (예: "국민건강보험공단 강남서부지사" -> "국민건강보험공단")
                val firstToken = resolvedName.split(" ").firstOrNull()?.trim().orEmpty()
                if (firstToken.length >= 3 && firstToken != resolvedName) add(firstToken)
            }
            if (resolvedCompany.length >= 2) add(resolvedCompany)
        }.distinct()

        fun isRowMatchedByPhoneOrIdentity(rObj: JSONObject): Boolean {
            val rowStr = rObj.toString()
            if (isCallerPhoneMatchedInText(rowStr, cleanCaller, tail7, tail8)) return true
            if (identityKeywords.isNotEmpty()) {
                for (kw in identityKeywords) {
                    if (rowStr.contains(kw, ignoreCase = true)) return true
                }
            }
            return false
        }

        // 2차 패스: 최신 통화녹음 요약, 미완료 할일, 최근 문자/카톡/이메일/일반시트 내역 수집
        for (pObj in matchedProjectObjs) {
            val pName = pObj.optString("project_name", "프로젝트").trim()
            val sheetsArr = try { JSONArray(pObj.optString("sheets_data", "[]")) } catch (_: Exception) { continue }

            for (sIdx in 0 until sheetsArr.length()) {
                val sObj = sheetsArr.optJSONObject(sIdx) ?: continue
                val sName = sObj.optString("name", "").trim()
                val rArr = sObj.optJSONArray("rows") ?: continue

                for (rIdx in rArr.length() - 1 downTo 0) {
                    val rObj = rArr.optJSONObject(rIdx) ?: continue
                    if (!isRowMatchedByPhoneOrIdentity(rObj)) continue
                    isFound = true

                    when {
                        sName.contains("통화녹음") || sName.contains("회의록") -> {
                            if (lastCallSummary.isBlank()) {
                                val sum = optCleanVal(rObj, "요약내용").ifBlank { optCleanVal(rObj, "AI요약") }
                                val tm = optCleanVal(rObj, "통화일시").ifBlank { optCleanVal(rObj, "회의일시") }
                                val note = optCleanVal(rObj, "비고").ifBlank { optCleanVal(rObj, "주요결정사항") }
                                if (sum.isNotBlank()) {
                                    lastCallSummary = sum
                                    lastCallTime = tm
                                    if (note.isNotBlank() && pendingTaskLines.size < 3) {
                                        pendingTaskLines.add("📌 [통화 후속] $note")
                                    }
                                }
                            }
                        }
                        sName.contains("할일") -> {
                            val st = optCleanVal(rObj, "상태").uppercase()
                            val isDone = st == "DONE" || st.contains("완료")
                            if (!isDone && pendingTaskLines.size < 3) {
                                val tTitle = optCleanVal(rObj, "할일제목").ifBlank { optCleanVal(rObj, "내용") }
                                val tDue = optCleanVal(rObj, "기한").ifBlank { optCleanVal(rObj, "마감기한") }
                                val tBadge = optCleanVal(rObj, "뱃지").ifBlank { optCleanVal(rObj, "출처") }
                                if (tTitle.isNotBlank()) {
                                    val prefix = buildString {
                                        append("📋 ")
                                        if (tBadge.isNotBlank()) append("[$tBadge] ")
                                    }
                                    val suffix = if (tDue.isNotBlank()) " ($tDue)" else ""
                                    val line = "$prefix$tTitle$suffix"
                                    if (line !in pendingTaskLines) {
                                        pendingTaskLines.add(line)
                                    }
                                }
                            }
                        }
                        sName.contains("부재중") -> {
                            if (lastMissedTime.isBlank()) {
                                lastMissedTime = optCleanVal(rObj, "부재중일시")
                            }
                        }
                        sName.contains("문자") -> {
                            if (recentActivityLines.none { it.startsWith("💬 [문자") } && recentActivityLines.size < 4) {
                                val msg = optCleanVal(rObj, "메시지내용").ifBlank { optCleanVal(rObj, "발송할문자내용") }
                                val tm = optCleanVal(rObj, "일시").takeLast(11).trim()
                                if (msg.isNotBlank()) {
                                    val shortMsg = if (msg.length > 65) msg.take(63) + "…" else msg
                                    recentActivityLines.add("💬 [문자 ${tm.ifBlank { "최근" }}] $shortMsg")
                                }
                            }
                        }
                        sName.contains("카카오톡") || sName.contains("카톡") -> {
                            if (recentActivityLines.none { it.startsWith("🟡 [카톡") } && recentActivityLines.size < 4) {
                                val msg = optCleanVal(rObj, "메시지내용")
                                val tm = optCleanVal(rObj, "수신일시").takeLast(11).trim()
                                if (msg.isNotBlank()) {
                                    val shortMsg = if (msg.length > 65) msg.take(63) + "…" else msg
                                    recentActivityLines.add("🟡 [카톡 ${tm.ifBlank { "최근" }}] $shortMsg")
                                }
                            }
                        }
                        sName.contains("이메일") -> {
                            if (recentActivityLines.none { it.startsWith("📧 [메일") } && recentActivityLines.size < 4) {
                                val subj = optCleanVal(rObj, "메일제목")
                                val sum = optCleanVal(rObj, "본문요약")
                                val text = if (subj.isNotBlank() && sum.isNotBlank()) "$subj - $sum" else subj.ifBlank { sum }
                                if (text.isNotBlank()) {
                                    val shortTxt = if (text.length > 65) text.take(63) + "…" else text
                                    recentActivityLines.add("📧 [메일] $shortTxt")
                                }
                            }
                        }
                        sName.contains("명함") || sName.contains("연락처") -> {
                            val detail = optCleanVal(rObj, "상세정보").ifBlank { optCleanVal(rObj, "메모") }
                            if (detail.isNotBlank() && recentActivityLines.size < 4) {
                                val shortDetail = if (detail.length > 65) detail.take(63) + "…" else detail
                                recentActivityLines.add("🪪 [$sName] $shortDetail")
                            }
                        }
                        else -> {
                            // 기타 시트(결제입금, 영수증, 주문, 견적, 일반 파투 프로젝트 시트)
                            if (recentActivityLines.size < 4) {
                                val summaryParts = mutableListOf<String>()
                                val itKeys = rObj.keys()
                                while (itKeys.hasNext()) {
                                    val k = itKeys.next()
                                    if (k.startsWith("_") || k == "일련번호") continue
                                    val v = optCleanVal(rObj, k)
                                    if (v.isNotEmpty() && v != resolvedName && v != callerPhone) {
                                        summaryParts.add("$k: $v")
                                    }
                                    if (summaryParts.size >= 3) break
                                }
                                if (summaryParts.isNotEmpty()) {
                                    val tag = if (pName != "시트봇 연동 장부") "$pName▸$sName" else sName
                                    val joined = summaryParts.joinToString(" · ")
                                    val shortJoined = if (joined.length > 65) joined.take(63) + "…" else joined
                                    recentActivityLines.add("📊 [$tag] $shortJoined")
                                }
                            }
                        }
                    }
                }
            }
        }

        val finalName = resolvedName.ifBlank {
            if (isFound) "파투 등록 고객" else "신규 연락처"
        }
        val finalMemo = if (recentActivityLines.isNotEmpty()) {
            recentActivityLines.joinToString("\n")
        } else if (lastMissedTime.isNotBlank()) {
            "📞 최근 부재중 이력: $lastMissedTime"
        } else {
            ""
        }
        val finalActions = pendingTaskLines.joinToString("\n")

        val rawCacheJson = JSONObject().apply {
            put("found", isFound)
            put("name", finalName)
            put("company", resolvedCompany)
            put("position", resolvedPosition)
            put("lastCallTime", lastCallTime)
            put("lastCallSummary", lastCallSummary)
            put("actionItems", finalActions)
            put("memo", finalMemo)
        }.toString()

        CallSummaryResult(
            success = true,
            found = isFound,
            phone = callerPhone,
            cleanPhone = cleanCaller,
            name = finalName,
            company = resolvedCompany,
            position = resolvedPosition,
            memo = finalMemo,
            lastCallTime = lastCallTime,
            lastCallSummary = lastCallSummary,
            actionItems = finalActions,
            lastMissedCallTime = lastMissedTime,
            rawJson = rawCacheJson
        )
    }
}
