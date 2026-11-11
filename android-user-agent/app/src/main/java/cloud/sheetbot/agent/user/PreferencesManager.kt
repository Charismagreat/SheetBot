package cloud.sheetbot.agent.user

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

typealias AppPreferences = PreferencesManager

data class CopilotSearchHistoryItem(
    val query: String,
    val isPinned: Boolean,
    val timestamp: Long
)

class PreferencesManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("sheetbot_agent_prefs", Context.MODE_PRIVATE)

    var userEmail: String?
        get() {
            val saved = prefs.getString("user_email", null)
            if (!saved.isNullOrBlank()) return saved
            val ftsPhone = prefs.getString("fts_phone_number", null)?.replace("[^0-9]".toRegex(), "")
            if (!ftsPhone.isNullOrBlank()) return "fts_${ftsPhone.takeLast(4)}@filetosheet.cloud"
            val ftsTok = prefs.getString("fts_token", null)
            if (!ftsTok.isNullOrBlank()) return "fts_${ftsTok.takeLast(6)}@filetosheet.cloud"
            return null
        }
        set(value) = prefs.edit().putString("user_email", value).apply()

    val hasGoogleAccount: Boolean
        get() {
            val raw = prefs.getString("user_email", null)
            return !raw.isNullOrBlank() && !raw.endsWith("@filetosheet.cloud")
        }

    var webhookUrl: String
        get() = prefs.getString("webhook_url", "https://sheetbot.cloud/api/user/agent2/inbound-sms") ?: "https://sheetbot.cloud/api/user/agent2/inbound-sms"
        set(value) = prefs.edit().putString("webhook_url", value).apply()

    var fallbackWebhookUrl: String
        get() = prefs.getString("fallback_webhook_url", "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/user/agent2/inbound-sms") ?: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/user/agent2/inbound-sms"
        set(value) = prefs.edit().putString("fallback_webhook_url", value).apply()

    var heartbeatUrl: String
        get() = prefs.getString("heartbeat_url", "https://sheetbot.cloud/api/user/agent2/heartbeat") ?: "https://sheetbot.cloud/api/user/agent2/heartbeat"
        set(value) = prefs.edit().putString("heartbeat_url", value).apply()

    var fallbackHeartbeatUrl: String
        get() = prefs.getString("fallback_heartbeat_url", "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/user/agent2/heartbeat") ?: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/user/agent2/heartbeat"
        set(value) = prefs.edit().putString("fallback_heartbeat_url", value).apply()


    var deviceToken: String?
        get() = prefs.getString("device_token", null)
        set(value) = prefs.edit().putString("device_token", value).apply()

    var visitorSessionId: String?
        get() = prefs.getString("visitor_session_id", null)
        set(value) = prefs.edit().putString("visitor_session_id", value).apply()

    var isPaired: Boolean
        get() = (prefs.getBoolean("is_paired", false) && !userEmail.isNullOrBlank()) || isFtsPaired
        set(value) = prefs.edit().putBoolean("is_paired", value).apply()

    // 🎯 전송 목적지 제어: GOOGLE_SHEETS (구글 시트/드라이브) vs FILE_TO_SHEET (파일투시트 직결)
    var uploadDestination: String
        get() = prefs.getString("upload_destination", DESTINATION_GOOGLE_SHEETS) ?: DESTINATION_GOOGLE_SHEETS
        set(value) = prefs.edit().putString("upload_destination", value).apply()

    val isDestinationFileToSheet: Boolean
        get() = uploadDestination == DESTINATION_FILE_TO_SHEET ||
                uploadDestination == DESTINATION_BOTH ||
                (!hasGoogleAccount && isFtsPaired)

    val isDestinationGoogleSheet: Boolean
        get() = uploadDestination == DESTINATION_GOOGLE_SHEETS || uploadDestination == DESTINATION_BOTH

    val isDestinationBoth: Boolean
        get() = uploadDestination == DESTINATION_BOTH

    // ⚡ 파일투시트(FileToSheet) 직결 수신함 연동 정보
    var ftsToken: String?
        get() = prefs.getString("fts_token", null)
        set(value) = prefs.edit().putString("fts_token", value).apply()

    var ftsEndpoint: String?
        get() {
            val raw = prefs.getString("fts_endpoint", null)
            val tok = ftsToken
            return if (!raw.isNullOrBlank()) {
                FileToSheetClient.normalizeEndpoint(raw, tok ?: "")
            } else if (!tok.isNullOrBlank()) {
                FileToSheetClient.normalizeEndpoint(null, tok)
            } else {
                null
            }
        }
        set(value) = prefs.edit().putString("fts_endpoint", value).apply()

    var ftsSheetName: String?
        get() = prefs.getString("fts_sheet_name", null)
        set(value) = prefs.edit().putString("fts_sheet_name", value).apply()

    var ftsProjectName: String?
        get() = prefs.getString("fts_project_name", null)
        set(value) = prefs.edit().putString("fts_project_name", value).apply()

    var ftsProjectId: String?
        get() = prefs.getString("fts_project_id", null)
        set(value) = prefs.edit().putString("fts_project_id", value).apply()

    val isFtsPaired: Boolean
        get() = (!ftsToken.isNullOrBlank() && !ftsEndpoint.isNullOrBlank()) || !ftsPhoneNumber.isNullOrBlank()

    // 📱 [File to Sheet] 2대 핵심 시트 & 온디맨드 바인딩 정보
    var ftsPhoneNumber: String?
        get() = prefs.getString("fts_phone_number", null)
        set(value) = prefs.edit().putString("fts_phone_number", value).apply()

    var ftsReceiptToken: String?
        get() = prefs.getString("fts_receipt_token", null) ?: ftsToken
        set(value) = prefs.edit().putString("fts_receipt_token", value).apply()

    var ftsReceiptSheetName: String?
        get() = prefs.getString("fts_receipt_sheet_name", "영수증대장")
        set(value) = prefs.edit().putString("fts_receipt_sheet_name", value).apply()

    var ftsBusinessCardToken: String?
        get() = prefs.getString("fts_business_card_token", null) ?: ftsToken
        set(value) = prefs.edit().putString("fts_business_card_token", value).apply()

    var ftsBusinessCardSheetName: String?
        get() = prefs.getString("fts_business_card_sheet_name", "명함관리")
        set(value) = prefs.edit().putString("fts_business_card_sheet_name", value).apply()

    var ftsDepositToken: String?
        get() = prefs.getString("fts_deposit_token", null) ?: ftsToken
        set(value) = prefs.edit().putString("fts_deposit_token", value).apply()

    var ftsDepositSheetName: String?
        get() = prefs.getString("fts_deposit_sheet_name", "결제입금내역")
        set(value) = prefs.edit().putString("fts_deposit_sheet_name", value).apply()

    var ftsCallRecordingToken: String?
        get() = prefs.getString("fts_call_recording_token", null) ?: ftsToken
        set(value) = prefs.edit().putString("fts_call_recording_token", value).apply()

    var ftsCallRecordingSheetName: String?
        get() = prefs.getString("fts_call_recording_sheet_name", "통화녹음대장")
        set(value) = prefs.edit().putString("fts_call_recording_sheet_name", value).apply()

    fun getSpecificFtsTokenFor(type: String): String? {
        val canonicalId = FileToSheetClient.resolveCanonicalCardId(type)
        val byCardId = prefs.getString("fts_card_token_$canonicalId", null)
        if (!byCardId.isNullOrBlank()) return byCardId
        return when (canonicalId) {
            "receipt_scanner" -> prefs.getString("fts_receipt_token", null)
            "business_card" -> prefs.getString("fts_business_card_token", null)
            "payment_sms" -> prefs.getString("fts_deposit_token", null)
            "call_recording" -> prefs.getString("fts_call_recording_token", null)
            else -> null
        }
    }

    fun getFtsTokenFor(type: String): String? {
        return getSpecificFtsTokenFor(type) ?: ftsToken
    }

    fun getFtsSheetNameFor(type: String): String? {
        val canonicalId = FileToSheetClient.resolveCanonicalCardId(type)
        val byCardId = prefs.getString("fts_card_sheet_$canonicalId", null)
        if (!byCardId.isNullOrBlank()) return byCardId
        val legacy = when (canonicalId) {
            "receipt_scanner" -> prefs.getString("fts_receipt_sheet_name", null)
            "business_card" -> prefs.getString("fts_business_card_sheet_name", null)
            "payment_sms" -> prefs.getString("fts_deposit_sheet_name", null)
            "call_recording" -> prefs.getString("fts_call_recording_sheet_name", null)
            else -> null
        }
        if (!legacy.isNullOrBlank()) return legacy
        return FileToSheetClient.resolveSheetSpec(canonicalId)?.sheetName ?: ftsSheetName
    }

    fun getFtsEndpointFor(type: String): String {
        val canonicalId = FileToSheetClient.resolveCanonicalCardId(type)
        val tok = getFtsTokenFor(canonicalId) ?: ""
        val rawWebhook = prefs.getString("fts_card_webhook_$canonicalId", null)
            ?: prefs.getString("fts_endpoint", null)
        return FileToSheetClient.normalizeEndpoint(rawWebhook, tok)
    }

    fun saveFtsSheetBinding(
        cardIdOrType: String,
        token: String,
        sheetName: String?,
        webhookUrl: String? = null,
        projectId: String? = null
    ) {
        if (token.isBlank()) return
        val canonicalId = FileToSheetClient.resolveCanonicalCardId(cardIdOrType)
        val resolvedSheetName = sheetName?.takeIf { it.isNotBlank() }
            ?: FileToSheetClient.resolveSheetSpec(canonicalId)?.sheetName
            ?: "파일투시트"

        val editor = prefs.edit()
        editor.putString("fts_card_token_$canonicalId", token)
        editor.putString("fts_card_sheet_$canonicalId", resolvedSheetName)
        if (!webhookUrl.isNullOrBlank()) {
            editor.putString("fts_card_webhook_$canonicalId", webhookUrl)
        }
        if (!projectId.isNullOrBlank()) {
            editor.putString("fts_project_id", projectId)
        }

        when (canonicalId) {
            "receipt_scanner" -> {
                editor.putString("fts_receipt_token", token)
                editor.putString("fts_receipt_sheet_name", resolvedSheetName)
            }
            "business_card" -> {
                editor.putString("fts_business_card_token", token)
                editor.putString("fts_business_card_sheet_name", resolvedSheetName)
            }
            "payment_sms" -> {
                editor.putString("fts_deposit_token", token)
                editor.putString("fts_deposit_sheet_name", resolvedSheetName)
            }
            "call_recording" -> {
                editor.putString("fts_call_recording_token", token)
                editor.putString("fts_call_recording_sheet_name", resolvedSheetName)
            }
        }

        // 기본 대표 FTS 토큰이 비어있거나 영수증 시트인 경우 대표 토큰/시트명/엔드포인트도 함께 동기화
        if (ftsToken.isNullOrBlank() || canonicalId == "receipt_scanner") {
            editor.putString("fts_token", token)
            editor.putString("fts_sheet_name", resolvedSheetName)
            val ep = if (!webhookUrl.isNullOrBlank()) webhookUrl else FileToSheetClient.FTS_OFFICIAL_DOMAIN
            editor.putString("fts_endpoint", ep)
        }
        editor.apply()
    }

    fun clearFtsPairing() {
        val editor = prefs.edit()
        editor.remove("fts_token")
            .remove("fts_endpoint")
            .remove("fts_sheet_name")
            .remove("fts_project_name")
            .remove("fts_project_id")
            .remove("fts_phone_number")
            .remove("fts_receipt_token")
            .remove("fts_receipt_sheet_name")
            .remove("fts_business_card_token")
            .remove("fts_business_card_sheet_name")
            .remove("fts_deposit_token")
            .remove("fts_deposit_sheet_name")
            .remove("fts_call_recording_token")
            .remove("fts_call_recording_sheet_name")
            .putString("upload_destination", DESTINATION_GOOGLE_SHEETS)

        prefs.all.keys.filter {
            it.startsWith("fts_card_token_") ||
                it.startsWith("fts_card_sheet_") ||
                it.startsWith("fts_card_webhook_")
        }.forEach { key ->
            editor.remove(key)
        }
        editor.apply()
    }

    var lastSyncTime: Long
        get() = prefs.getLong("last_sync_time", 0L)
        set(value) = prefs.edit().putLong("last_sync_time", value).apply()

    var lastDetectedDeposit: String?
        get() = prefs.getString("last_detected_deposit", null)
        set(value) = prefs.edit().putString("last_detected_deposit", value).apply()

    var isTtsEnabled: Boolean
        get() = prefs.getBoolean("is_tts_enabled", true)
        set(value) = prefs.edit().putBoolean("is_tts_enabled", value).apply()

    var isReceiptSmsEnabled: Boolean
        get() = prefs.getBoolean("is_receipt_sms_enabled", true)
        set(value) = prefs.edit().putBoolean("is_receipt_sms_enabled", value).apply()

    var receiptSmsTemplate: String
        get() = prefs.getString("receipt_sms_template", "[SheetBot] {고객명}님, {금액} 결제가 정상 확인되었습니다. 이용해 주셔서 감사합니다.")
            ?: "[SheetBot] {고객명}님, {금액} 결제가 정상 확인되었습니다. 이용해 주셔서 감사합니다."
        set(value) = prefs.edit().putString("receipt_sms_template", value).apply()

    var isPushDetectionEnabled: Boolean
        get() = prefs.getBoolean("is_push_detection_enabled", true)
        set(value) = prefs.edit().putBoolean("is_push_detection_enabled", value).apply()

    var isPrivacyCardHidden: Boolean
        get() = prefs.getBoolean("is_privacy_card_hidden", false)
        set(value) = prefs.edit().putBoolean("is_privacy_card_hidden", value).apply()

    var isStatusDetailsHidden: Boolean
        get() = prefs.getBoolean("is_status_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_status_details_hidden", value).apply()

    // 카드별 아코디언 접힘/펼침 상태 (기본값: false = 펼침)
    var isWalletDetailsHidden: Boolean
        get() = prefs.getBoolean("is_wallet_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_wallet_details_hidden", value).apply()

    var isCopilotDetailsHidden: Boolean
        get() = prefs.getBoolean("is_copilot_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_copilot_details_hidden", value).apply()

    var isPaymentReceiptDetailsHidden: Boolean
        get() = prefs.getBoolean("is_payment_receipt_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_payment_receipt_details_hidden", value).apply()

    var isCallRecordingDetailsHidden: Boolean
        get() = prefs.getBoolean("is_call_recording_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_call_recording_details_hidden", value).apply()

    var isFileUploadDetailsHidden: Boolean
        get() = prefs.getBoolean("is_file_upload_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_file_upload_details_hidden", value).apply()

    var isLinkScrapDetailsHidden: Boolean
        get() = prefs.getBoolean("is_link_scrap_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_link_scrap_details_hidden", value).apply()

    var isSmsSyncDetailsHidden: Boolean
        get() = prefs.getBoolean("is_sms_sync_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_sms_sync_details_hidden", value).apply()

    var isKakaoSyncDetailsHidden: Boolean
        get() = prefs.getBoolean("is_kakao_sync_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_kakao_sync_details_hidden", value).apply()

    var isEmailSyncDetailsHidden: Boolean
        get() = prefs.getBoolean("is_email_sync_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_email_sync_details_hidden", value).apply()

    var isQuoteSyncDetailsHidden: Boolean
        get() = prefs.getBoolean("is_quote_sync_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_quote_sync_details_hidden", value).apply()

    var isEstimateSyncDetailsHidden: Boolean
        get() = prefs.getBoolean("is_estimate_sync_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_estimate_sync_details_hidden", value).apply()

    var isMissedCallDetailsHidden: Boolean
        get() = prefs.getBoolean("is_missed_call_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_missed_call_details_hidden", value).apply()

    var isCallEndedCardDetailsHidden: Boolean
        get() = prefs.getBoolean("is_call_ended_card_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_call_ended_card_details_hidden", value).apply()

    var isWebsiteMonitorDetailsHidden: Boolean
        get() = prefs.getBoolean("is_website_monitor_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_website_monitor_details_hidden", value).apply()

    // 토큰 잔액 및 회원 등급 로컬 캐시 (네트워크 지연 시 0원 노출 방지)
    var lastBalanceTokens: Long
        get() = prefs.getLong("last_balance_tokens", -1L)
        set(value) = prefs.edit().putLong("last_balance_tokens", value).apply()

    var lastTier: String
        get() = prefs.getString("last_tier", "FREE") ?: "FREE"
        set(value) = prefs.edit().putString("last_tier", value).apply()

    // AI 토큰 안내 상세 접기/펼치기 상태
    var isTokenNoticeDismissed: Boolean
        get() = prefs.getBoolean("is_token_notice_dismissed", false)
        set(value) = prefs.edit().putBoolean("is_token_notice_dismissed", value).apply()

    // 통화 녹음 파일 구글 드라이브 자동 백업 관련 설정 (신규 설치 시 기본 꺼짐: false)
    var isCallRecordingSyncEnabled: Boolean
        get() = prefs.getBoolean("is_call_recording_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_call_recording_sync_enabled", value).apply()

    // 💡 통화 녹음 기능 활성화 시점 타임스탬프 (이 시각 이전에 녹음된 과거 파일은 전면 무시/스킵하여 토큰 소모 방어)
    var callRecordingEnabledAt: Long
        get() = prefs.getLong("call_recording_enabled_at", 0L)
        set(value) = prefs.edit().putLong("call_recording_enabled_at", value).apply()

    var callRecordingTargetFilter: String
        get() = prefs.getString("call_recording_target_filter", "") ?: ""
        set(value) = prefs.edit().putString("call_recording_target_filter", value).apply()

    var callRecordingDriveFolder: String
        get() = prefs.getString("call_recording_drive_folder", "[SheetBot] 통화 녹음") ?: "[SheetBot] 통화 녹음"
        set(value) = prefs.edit().putString("call_recording_drive_folder", value).apply()

    var isCallRecordingSheetEnabled: Boolean
        get() = prefs.getBoolean("is_call_recording_sheet_enabled", true)
        set(value) = prefs.edit().putBoolean("is_call_recording_sheet_enabled", value).apply()

    // 이용자 지정 커스텀 통화 녹음 폴더 (기본값 빈값: 자동 감지)
    var callRecordingCustomFolder: String
        get() = prefs.getString("call_recording_custom_folder", "") ?: ""
        set(value) = prefs.edit().putString("call_recording_custom_folder", value).apply()

    // 통화 종료 즉시 녹음 자동 업로드 설정 (기본값: true)
    var isCallEndedAutoUploadEnabled: Boolean
        get() = prefs.getBoolean("is_call_ended_auto_upload_enabled", true)
        set(value) = prefs.edit().putBoolean("is_call_ended_auto_upload_enabled", value).apply()

    // Wi-Fi 환경에서만 녹음 자동 업로드 (모바일 데이터 절약, 기본값: false)
    var isRecordingUploadOnlyOnWifi: Boolean
        get() = prefs.getBoolean("is_recording_upload_only_on_wifi", false)
        set(value) = prefs.edit().putBoolean("is_recording_upload_only_on_wifi", value).apply()

    // 회의 녹음 파일 구글 드라이브 자동 백업 및 회의록 대장 설정 (신규 설치 시 기본 꺼짐: false)
    var isMeetingRecordingSyncEnabled: Boolean
        get() = prefs.getBoolean("is_meeting_recording_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_meeting_recording_sync_enabled", value).apply()

    var meetingRecordingDriveFolder: String
        get() = prefs.getString("meeting_recording_drive_folder", "[SheetBot] 회의 녹음") ?: "[SheetBot] 회의 녹음"
        set(value) = prefs.edit().putString("meeting_recording_drive_folder", value).apply()

    var meetingRecordingCustomFolder: String
        get() = prefs.getString("meeting_recording_custom_folder", "") ?: ""
        set(value) = prefs.edit().putString("meeting_recording_custom_folder", value).apply()

    var isMeetingRecordingDetailsHidden: Boolean
        get() = prefs.getBoolean("is_meeting_recording_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_meeting_recording_details_hidden", value).apply()

    // 사진 및 일반 파일 구글 드라이브 업로드 관련 설정
    var isFileUploadSyncEnabled: Boolean
        get() = prefs.getBoolean("is_file_upload_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_file_upload_sync_enabled", value).apply()

    // 스마트 경비 영수증 관리 (AI OCR)
    var isReceiptScannerSyncEnabled: Boolean
        get() = prefs.getBoolean("is_receipt_scanner_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_receipt_scanner_sync_enabled", value).apply()

    var isReceiptDetailsHidden: Boolean
        get() = prefs.getBoolean("is_receipt_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_receipt_details_hidden", value).apply()

    // 스마트 명함 관리 (AI OCR)
    var isBusinessCardSyncEnabled: Boolean
        get() = prefs.getBoolean("is_business_card_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_business_card_sync_enabled", value).apply()

    var isBusinessCardDetailsHidden: Boolean
        get() = prefs.getBoolean("is_business_card_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_business_card_details_hidden", value).apply()

    // 스마트폰 연락처 자동 동기화 옵션 (명함 분석 시 내 폰 연락처에도 자동 저장 - 기본값: true)
    var isBusinessCardAutoAddContactsEnabled: Boolean
        get() = prefs.getBoolean("is_biz_card_auto_add_contacts", true)
        set(value) = prefs.edit().putBoolean("is_biz_card_auto_add_contacts", value).apply()

    var fileUploadDriveFolder: String
        get() = prefs.getString("file_upload_drive_folder", "[SheetBot] 파일 보관함") ?: "[SheetBot] 파일 보관함"
        set(value) = prefs.edit().putString("file_upload_drive_folder", value).apply()

    var isFileUploadSheetEnabled: Boolean
        get() = prefs.getBoolean("is_file_upload_sheet_enabled", true)
        set(value) = prefs.edit().putBoolean("is_file_upload_sheet_enabled", value).apply()

    // 웹 링크 및 유튜브 영상 AI 자동 스크랩 설정 (신규 설치 시 기본 꺼짐: false)
    var isLinkScrapEnabled: Boolean
        get() = prefs.getBoolean("is_link_scrap_enabled", false)
        set(value) = prefs.edit().putBoolean("is_link_scrap_enabled", value).apply()

    var linkScrapDriveSheetTitle: String
        get() = prefs.getString("link_scrap_drive_sheet_title", "[SheetBot] 웹 링크 & 유튜브 스크랩 대장") ?: "[SheetBot] 웹 링크 & 유튜브 스크랩 대장"
        set(value) = prefs.edit().putString("link_scrap_drive_sheet_title", value).apply()

    // 스마트폰 문자(SMS/LMS) 송수신 구글 시트 자동 동기화 설정 (신규 설치 시 기본 꺼짐: false)
    var isSmsSheetSyncEnabled: Boolean
        get() = prefs.getBoolean("is_sms_sheet_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_sms_sheet_sync_enabled", value).apply()

    var smsTargetFilter: String
        get() = prefs.getString("sms_target_filter", "") ?: ""
        set(value) = prefs.edit().putString("sms_target_filter", value).apply()

    var smsDriveSheetTitle: String
        get() = prefs.getString("sms_drive_sheet_title", "[SheetBot] 스마트폰 문자(SMS) 송수신 대장") ?: "[SheetBot] 스마트폰 문자(SMS) 송수신 대장"
        set(value) = prefs.edit().putString("sms_drive_sheet_title", value).apply()

    // 💡 구글 시트 체크박스 감지 문자 자동 발송 카드 설정
    var isSheetSmsCheckboxEnabled: Boolean
        get() = prefs.getBoolean("is_sheet_sms_checkbox_enabled", false)
        set(value) = prefs.edit().putBoolean("is_sheet_sms_checkbox_enabled", value).apply()

    var isSheetSmsCheckboxDetailsHidden: Boolean
        get() = prefs.getBoolean("is_sheet_sms_checkbox_details_hidden", true)
        set(value) = prefs.edit().putBoolean("is_sheet_sms_checkbox_details_hidden", value).apply()

    var sheetSmsTargetTab: String
        get() = prefs.getString("sheet_sms_target_tab", "문자발송목록") ?: "문자발송목록"
        set(value) = prefs.edit().putString("sheet_sms_target_tab", value).apply()

    // 카카오톡 수신 메시지 구글 시트 자동 동기화 설정 (신규 설치 시 기본 꺼짐: false)
    var isKakaoSheetSyncEnabled: Boolean
        get() = prefs.getBoolean("is_kakao_sheet_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_kakao_sheet_sync_enabled", value).apply()

    var kakaoTargetFilter: String
        get() = prefs.getString("kakao_target_filter", "") ?: ""
        set(value) = prefs.edit().putString("kakao_target_filter", value).apply()

    var kakaoDriveSheetTitle: String
        get() = prefs.getString("kakao_drive_sheet_title", "[SheetBot] 카카오톡 메시지 대장") ?: "[SheetBot] 카카오톡 메시지 대장"
        set(value) = prefs.edit().putString("kakao_drive_sheet_title", value).apply()

    // 수신 이메일 자동 기록 & AI 할 일 추출 설정 (신규 설치 시 기본 꺼짐: false)
    var isEmailSheetSyncEnabled: Boolean
        get() = prefs.getBoolean("is_email_sheet_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_email_sheet_sync_enabled", value).apply()

    var isEmailSpamFilterEnabled: Boolean
        get() = prefs.getBoolean("is_email_spam_filter_enabled", true)
        set(value) = prefs.edit().putBoolean("is_email_spam_filter_enabled", value).apply()

    var emailTargetFilter: String
        get() = prefs.getString("email_target_filter", "") ?: ""
        set(value) = prefs.edit().putString("email_target_filter", value).apply()

    var emailDriveSheetTitle: String
        get() = prefs.getString("email_drive_sheet_title", "[SheetBot] 이메일 수신 대장") ?: "[SheetBot] 이메일 수신 대장"
        set(value) = prefs.edit().putString("email_drive_sheet_title", value).apply()

    // AI 스마트 견적 및 단가표 구글 시트 연동 설정 (신규 설치 시 기본 꺼짐: false)
    var isQuoteSheetSyncEnabled: Boolean
        get() = prefs.getBoolean("is_quote_sheet_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_quote_sheet_sync_enabled", value).apply()

    var quoteDriveSheetTitle: String
        get() = prefs.getString("quote_drive_sheet_title", "[SheetBot] 스마트 간편 주문 및 품목 대장") ?: "[SheetBot] 스마트 간편 주문 및 품목 대장"
        set(value) = prefs.edit().putString("quote_drive_sheet_title", value).apply()

    var quoteBusinessName: String
        get() = prefs.getString("quote_business_name", "") ?: ""
        set(value) = prefs.edit().putString("quote_business_name", value).apply()

    var quoteImageUrl: String
        get() = prefs.getString("quote_image_url", "") ?: ""
        set(value) = prefs.edit().putString("quote_image_url", value).apply()

    // 스마트 간편 견적 및 단가 대장 구글 시트 연동 설정 (신규 설치 시 기본 꺼짐: false)
    var isEstimateSheetSyncEnabled: Boolean
        get() = prefs.getBoolean("is_estimate_sheet_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_estimate_sheet_sync_enabled", value).apply()

    var estimateDriveSheetTitle: String
        get() = prefs.getString("estimate_drive_sheet_title", "[SheetBot] 스마트 간편 견적 및 단가 대장") ?: "[SheetBot] 스마트 간편 견적 및 단가 대장"
        set(value) = prefs.edit().putString("estimate_drive_sheet_title", value).apply()

    var estimateImageUrl: String
        get() = prefs.getString("estimate_image_url", "") ?: ""
        set(value) = prefs.edit().putString("estimate_image_url", value).apply()

    // 부재중 전화(Missed Call) 감지 시 0원 스마트 안내 문자 자동 회신 설정 (신규 설치 시 기본 꺼짐: false)
    var isMissedCallAutoReplyEnabled: Boolean
        get() = prefs.getBoolean("is_missed_call_auto_reply_enabled", false)
        set(value) = prefs.edit().putBoolean("is_missed_call_auto_reply_enabled", value).apply()

    var missedCallReplyTemplate: String
        get() = prefs.getString("missed_call_reply_template", "안녕하세요, 시트봇입니다. 현재 통화가 어려워 확인 후 곧 연락드리겠습니다. 문의사항을 문자로 남겨주시면 빠르게 안내드리겠습니다.")
            ?: "안녕하세요, 시트봇입니다. 현재 통화가 어려워 확인 후 곧 연락드리겠습니다. 문의사항을 문자로 남겨주시면 빠르게 안내드리겠습니다."
        set(value) = prefs.edit().putString("missed_call_reply_template", value).apply()

    var missedCallDriveSheetTitle: String
        get() = prefs.getString("missed_call_drive_sheet_title", "[SheetBot] 부재중 전화 대장") ?: "[SheetBot] 부재중 전화 대장"
        set(value) = prefs.edit().putString("missed_call_drive_sheet_title", value).apply()

    var receiptDriveSheetTitle: String
        get() = prefs.getString("receipt_drive_sheet_title", "[SheetBot] 스마트 경비 영수증 대장") ?: "[SheetBot] 스마트 경비 영수증 대장"
        set(value) = prefs.edit().putString("receipt_drive_sheet_title", value).apply()

    var businessCardDriveSheetTitle: String
        get() = prefs.getString("business_card_drive_sheet_title", "[SheetBot] 스마트 명함 관리 대장") ?: "[SheetBot] 스마트 명함 관리 대장"
        set(value) = prefs.edit().putString("business_card_drive_sheet_title", value).apply()

    // 수신 전화 시 '고객 시트 요약' 인콜(In-call) 플로팅 팝업 설정 (기본 켜짐: true)
    var isInCallSummaryEnabled: Boolean
        get() = prefs.getBoolean("is_in_call_summary_enabled", true)
        set(value) = prefs.edit().putBoolean("is_in_call_summary_enabled", value).apply()

    var isInCallSummaryExpanded: Boolean
        get() = prefs.getBoolean("is_in_call_summary_expanded", true)
        set(value) = prefs.edit().putBoolean("is_in_call_summary_expanded", value).apply()

    var isInCallSummaryDetailsHidden: Boolean
        get() = prefs.getBoolean("is_in_call_summary_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_in_call_summary_details_hidden", value).apply()

    fun saveCallSummaryCache(phoneKey: String, json: String) {
        prefs.edit().putString("call_summary_cache_$phoneKey", json).apply()
    }

    fun getCallSummaryCache(phoneKey: String): String? {
        return prefs.getString("call_summary_cache_$phoneKey", null)
    }

    // 통화 종료 직후 모바일 명함 / 감사 문자 원터치 발송 설정 (신규 설치 시 기본 꺼짐: false)
    var isCallEndedCardPromptEnabled: Boolean
        get() = prefs.getBoolean("is_call_ended_card_prompt_enabled", false)
        set(value) = prefs.edit().putBoolean("is_call_ended_card_prompt_enabled", value).apply()

    // 통화 종료 후 즉시 전자동 발송 여부 (false: 알림창 원터치 확인 발송, true: 묻지 않고 즉시 자동 발송)
    var isCallEndedAutoSendDirectly: Boolean
        get() = prefs.getBoolean("is_call_ended_auto_send_directly", false)
        set(value) = prefs.edit().putBoolean("is_call_ended_auto_send_directly", value).apply()

    // 발송 방식: "WEB_LINK" (0원 무료 웹링크) 또는 "MMS_IMAGE" (갤러리 사진 직접 첨부 MMS)
    var businessCardSendMode: String
        get() = prefs.getString("business_card_send_mode", "WEB_LINK") ?: "WEB_LINK"
        set(value) {
            prefs.edit().putString("business_card_send_mode", value).commit()
        }

    // 방안 1: 웹 명함 / 이벤트 페이지 링크
    var businessCardWebLink: String
        get() = prefs.getString("business_card_web_link", "https://sheetbot.cloud") ?: "https://sheetbot.cloud"
        set(value) {
            prefs.edit().putString("business_card_web_link", value).commit()
        }

    // 방안 2: 저장된 명함 / 포스터 이미지 파일 절대 경로
    var businessCardImagePath: String
        get() = prefs.getString("business_card_image_path", "") ?: ""
        set(value) {
            prefs.edit().putString("business_card_image_path", value).commit()
        }

    // 모바일 명함 발송 제외 번호 목록 관리 (Set<String>)
    fun getBusinessCardExcludedNumbers(): Set<String> {
        return prefs.getStringSet("business_card_excluded_numbers", emptySet()) ?: emptySet()
    }

    fun isBusinessCardExcluded(phoneNumber: String): Boolean {
        if (phoneNumber.isBlank()) return false
        val normalized = phoneNumber.replace(Regex("[^0-9]"), "")
        if (normalized.isBlank()) return false
        val excludedSet = getBusinessCardExcludedNumbers()
        return excludedSet.any { excluded ->
            val normExcluded = excluded.replace(Regex("[^0-9]"), "")
            normExcluded.isNotBlank() && (normExcluded == normalized || normExcluded == phoneNumber || excluded == phoneNumber)
        }
    }

    fun addBusinessCardExcludedNumber(phoneNumber: String) {
        val clean = phoneNumber.trim()
        if (clean.isBlank()) return
        val currentSet = prefs.getStringSet("business_card_excluded_numbers", emptySet())?.toMutableSet() ?: mutableSetOf()
        currentSet.add(clean)
        prefs.edit().putStringSet("business_card_excluded_numbers", currentSet).commit()
    }

    fun removeBusinessCardExcludedNumber(phoneNumber: String) {
        val normalized = phoneNumber.replace(Regex("[^0-9]"), "")
        val currentSet = prefs.getStringSet("business_card_excluded_numbers", emptySet())?.toMutableSet() ?: return
        currentSet.removeAll { 
            it.replace(Regex("[^0-9]"), "") == normalized || it == phoneNumber
        }
        prefs.edit().putStringSet("business_card_excluded_numbers", currentSet).commit()
    }

    fun clearBusinessCardExcludedNumbers() {
        prefs.edit().remove("business_card_excluded_numbers").commit()
    }

    val businessCardExcludedCount: Int
        get() = getBusinessCardExcludedNumbers().size

    // 웹사이트 실시간 다운타임 모니터링 (Uptime Sentinel) 설정
    var isWebsiteMonitorEnabled: Boolean
        get() = prefs.getBoolean("is_website_monitor_enabled", false)
        set(value) = prefs.edit().putBoolean("is_website_monitor_enabled", value).apply()

    var targetWebsiteUrl: String
        get() = prefs.getString("target_website_url", "") ?: ""
        set(value) = prefs.edit().putString("target_website_url", value).apply()

    var isWebsiteEmergencyAlarmEnabled: Boolean
        get() = prefs.getBoolean("is_website_emergency_alarm_enabled", true)
        set(value) = prefs.edit().putBoolean("is_website_emergency_alarm_enabled", value).apply()

    var lastWebsiteCheckStatus: String
        get() = prefs.getString("last_website_check_status", "미설정") ?: "미설정"
        set(value) = prefs.edit().putString("last_website_check_status", value).apply()

    var lastWebsiteCheckStatusCode: Int
        get() = prefs.getInt("last_website_check_status_code", 0)
        set(value) = prefs.edit().putInt("last_website_check_status_code", value).apply()

    var lastWebsiteCheckTime: Long
        get() = prefs.getLong("last_website_check_time", 0L)
        set(value) = prefs.edit().putLong("last_website_check_time", value).apply()

    var businessCardSmsTemplate: String
        get() = prefs.getString("business_card_sms_template", "[SheetBot] 안녕하세요. 조금 전 통화드린 담당자 명함입니다.\n• 서비스: 시트봇 클라우드 (https://sheetbot.cloud)\n감사합니다.")
            ?: "[SheetBot] 안녕하세요. 조금 전 통화드린 담당자 명함입니다.\n• 서비스: 시트봇 클라우드 (https://sheetbot.cloud)\n감사합니다."
        set(value) = prefs.edit().putString("business_card_sms_template", value).apply()

    // 스마트폰 연락처 구글 시트 자동 동기화 설정
    var isContactsSyncEnabled: Boolean
        get() = prefs.getBoolean("is_contacts_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_contacts_sync_enabled", value).apply()

    var lastContactsSyncTime: Long
        get() = prefs.getLong("last_contacts_sync_time", 0L)
        set(value) = prefs.edit().putLong("last_contacts_sync_time", value).apply()

    var lastContactsSyncCount: Int
        get() = prefs.getInt("last_contacts_sync_count", 0)
        set(value) = prefs.edit().putInt("last_contacts_sync_count", value).apply()

    var isContactsDetailsHidden: Boolean
        get() = prefs.getBoolean("is_contacts_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_contacts_details_hidden", value).apply()


    fun isSentSmsSynced(id: Long): Boolean {
        val synced = prefs.getStringSet("synced_sent_sms_ids", emptySet()) ?: emptySet()
        return synced.contains(id.toString())
    }

    fun markSentSmsSynced(id: Long) {
        val current = (prefs.getStringSet("synced_sent_sms_ids", emptySet()) ?: emptySet()).toMutableSet()
        current.add(id.toString())
        if (current.size > 1000) {
            val trimmed = current.toList().takeLast(1000).toSet()
            prefs.edit().putStringSet("synced_sent_sms_ids", trimmed).apply()
        } else {
            prefs.edit().putStringSet("synced_sent_sms_ids", current).apply()
        }
    }

    fun isRecordingSynced(fileName: String): Boolean {
        val synced = prefs.getStringSet("synced_recording_files", emptySet()) ?: emptySet()
        return synced.contains(fileName)
    }

    fun markRecordingSynced(fileName: String) {
        val current = (prefs.getStringSet("synced_recording_files", emptySet()) ?: emptySet()).toMutableSet()
        current.add(fileName)
        // 최대 1000개 유지
        if (current.size > 1000) {
            val trimmed = current.toList().takeLast(1000).toSet()
            prefs.edit().putStringSet("synced_recording_files", trimmed).apply()
        } else {
            prefs.edit().putStringSet("synced_recording_files", current).apply()
        }
    }

    private fun isPollutedHostValue(value: String?): Boolean {
        if (value.isNullOrBlank()) return false
        val currentEmail = userEmail?.trim()?.lowercase() ?: ""
        if (currentEmail == "chachogreat@gmail.com") return false
        return HOST_POLLUTED_IDS.any { value.contains(it) }
    }

    fun setSheetUrl(sheetType: String, url: String) {
        if (isPollutedHostValue(url)) return
        prefs.edit().putString("sheet_url_${sheetType.uppercase()}", url).apply()
    }

    fun getSheetUrl(sheetType: String): String? {
        val raw = prefs.getString("sheet_url_${sheetType.uppercase()}", null)
        if (isPollutedHostValue(raw)) {
            prefs.edit().remove("sheet_url_${sheetType.uppercase()}").apply()
            return null
        }
        return raw
    }

    fun setFolderUrl(sheetType: String, url: String) {
        if (isPollutedHostValue(url)) return
        prefs.edit().putString("folder_url_${sheetType.uppercase()}", url).apply()
    }

    fun getFolderUrl(sheetType: String): String? {
        val raw = prefs.getString("folder_url_${sheetType.uppercase()}", null)
        if (isPollutedHostValue(raw)) {
            prefs.edit().remove("folder_url_${sheetType.uppercase()}").apply()
            return null
        }
        return raw
    }

    fun setSheetId(sheetType: String, id: String) {
        if (isPollutedHostValue(id)) return
        prefs.edit().putString("sheet_id_${sheetType.uppercase()}", id).apply()
    }

    fun getSheetId(sheetType: String): String? {
        val raw = prefs.getString("sheet_id_${sheetType.uppercase()}", null)
        if (isPollutedHostValue(raw)) {
            prefs.edit().remove("sheet_id_${sheetType.uppercase()}").apply()
            return null
        }
        return raw
    }

    /**
     * 🔄 계정 전환 또는 재페어링 시 구글 시트 바인딩 캐시 일괄 초기화
     */
    fun clearSheetBindingsCache() {
        val editor = prefs.edit()
        val allKeys = prefs.all.keys
        for (key in allKeys) {
            if (key.startsWith("sheet_url_") || key.startsWith("folder_url_") || key.startsWith("sheet_id_")) {
                editor.remove(key)
            }
        }
        editor.apply()
    }

    var naverBlogId: String
        get() = prefs.getString("naver_blog_id", "") ?: ""
        set(value) = prefs.edit().putString("naver_blog_id", value).apply()

    var instagramId: String
        get() = prefs.getString("instagram_id", "") ?: ""
        set(value) = prefs.edit().putString("instagram_id", value).apply()

    /**
     * 📦 추가 기능 보관함에 숨겨진 카드 키 목록 (미설정 시 기본 숨김 프리셋 적용)
     */
    var hiddenCardKeys: Set<String>
        get() = prefs.getStringSet("hidden_card_keys", null) ?: DEFAULT_HIDDEN_CARDS
        set(value) = prefs.edit().putStringSet("hidden_card_keys", value).apply()

    /**
     * 📱 메인 홈 화면에 꺼내놓은 활성 카드들의 사용자 맞춤 순서 목록
     */
    var activeCardOrder: List<String>
        get() {
            val raw = prefs.getString("active_card_order", null)
            if (raw.isNullOrBlank()) return emptyList()
            return try {
                val jsonArr = org.json.JSONArray(raw)
                val list = mutableListOf<String>()
                for (i in 0 until jsonArr.length()) {
                    list.add(jsonArr.getString(i))
                }
                list
            } catch (_: Exception) {
                emptyList()
            }
        }
        set(value) {
            val jsonArr = org.json.JSONArray()
            value.forEach { jsonArr.put(it) }
            prefs.edit().putString("active_card_order", jsonArr.toString()).apply()
        }

    var reservedNotificationCardKeys: Set<String>
        get() = prefs.getStringSet("reserved_notification_card_keys", null) ?: setOf("cardInventory")
        set(value) = prefs.edit().putStringSet("reserved_notification_card_keys", value).apply()

    fun addReservedNotificationCard(cardKey: String) {
        val current = reservedNotificationCardKeys.toMutableSet()
        current.add(cardKey)
        reservedNotificationCardKeys = current
    }

    /**
     * ⚡ OTA 동적 다운로드/생성 카드 영구 저장소 (APK 재빌드 없이 설치·실행되는 카드 목록)
     */
    fun getInstalledDynamicCards(): List<MarketplaceCardItemDto> {
        val raw = prefs.getString("installed_dynamic_cards_v1", null)
        if (raw.isNullOrBlank()) return emptyList()
        return try {
            val arr = org.json.JSONArray(raw)
            val result = mutableListOf<MarketplaceCardItemDto>()
            for (i in 0 until arr.length()) {
                val obj = arr.optJSONObject(i) ?: continue
                result.add(
                    MarketplaceCardItemDto(
                        key = obj.optString("key"),
                        title = obj.optString("title"),
                        icon = obj.optString("icon", "⚡"),
                        category = obj.optString("category", "exclusive"),
                        categoryName = obj.optString("categoryName", "나만의 맞춤 카드"),
                        description = obj.optString("description", ""),
                        badge = obj.optString("badge").takeIf { it.isNotBlank() },
                        author = obj.optString("author", "시트봇 공식"),
                        isExclusive = obj.optBoolean("isExclusive", false),
                        isInstalledByDefault = obj.optBoolean("isInstalledByDefault", false),
                        version = obj.optString("version", "1.0.0"),
                        manifestJson = obj.optString("manifestJson").takeIf { it.isNotBlank() }
                    )
                )
            }
            result
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun saveInstalledDynamicCard(card: MarketplaceCardItemDto) {
        val current = getInstalledDynamicCards().toMutableList()
        val existingIdx = current.indexOfFirst { it.key == card.key }
        if (existingIdx >= 0) {
            current[existingIdx] = card
        } else {
            current.add(card)
        }
        persistInstalledDynamicCards(current)
    }

    fun removeInstalledDynamicCard(cardKey: String) {
        val current = getInstalledDynamicCards().filter { it.key != cardKey }
        persistInstalledDynamicCards(current)
    }

    private fun persistInstalledDynamicCards(cards: List<MarketplaceCardItemDto>) {
        val arr = org.json.JSONArray()
        cards.forEach { c ->
            val obj = org.json.JSONObject().apply {
                put("key", c.key)
                put("title", c.title)
                put("icon", c.icon)
                put("category", c.category)
                put("categoryName", c.categoryName)
                put("description", c.description)
                put("badge", c.badge ?: "")
                put("author", c.author)
                put("isExclusive", c.isExclusive)
                put("isInstalledByDefault", c.isInstalledByDefault)
                put("version", c.version)
                put("manifestJson", c.manifestJson ?: "")
            }
            arr.put(obj)
        }
        prefs.edit().putString("installed_dynamic_cards_v1", arr.toString()).apply()
    }

    fun isDynamicCardEnabled(cardKey: String): Boolean =
        prefs.getBoolean("dyn_card_enabled_$cardKey", true)

    fun setDynamicCardEnabled(cardKey: String, enabled: Boolean) =
        prefs.edit().putBoolean("dyn_card_enabled_$cardKey", enabled).apply()

    fun isDynamicCardCollapsed(cardKey: String): Boolean =
        prefs.getBoolean("dyn_card_collapsed_$cardKey", false)

    fun setDynamicCardCollapsed(cardKey: String, collapsed: Boolean) =
        prefs.edit().putBoolean("dyn_card_collapsed_$cardKey", collapsed).apply()

    // =========================================================================
    // 🔐 내 SaaS 휴대폰 로그인 인증(OTP) 0원 중계기 카드 설정
    // =========================================================================
    var isSaasOtpRelayEnabled: Boolean
        get() = prefs.getBoolean("is_saas_otp_relay_enabled", false)
        set(value) = prefs.edit().putBoolean("is_saas_otp_relay_enabled", value).apply()

    var isSaasOtpRelayDetailsHidden: Boolean
        get() = prefs.getBoolean("is_saas_otp_relay_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_saas_otp_relay_details_hidden", value).apply()

    var saasOtpBrandName: String
        get() = prefs.getString("saas_otp_brand_name", "내SaaS") ?: "내SaaS"
        set(value) = prefs.edit().putString("saas_otp_brand_name", value.trim().ifBlank { "내SaaS" }).apply()

    var saasOtpDailyLimit: Int
        get() = prefs.getInt("saas_otp_daily_limit", 150).coerceIn(10, 400)
        set(value) = prefs.edit().putInt("saas_otp_daily_limit", value.coerceIn(10, 400)).apply()

    var saasOtpApiKey: String
        get() {
            val saved = prefs.getString("saas_otp_api_key", null)
            if (!saved.isNullOrBlank() && saved.startsWith("sbk_otp_")) return saved
            return regenerateSaasOtpApiKey()
        }
        set(value) = prefs.edit().putString("saas_otp_api_key", value).apply()

    fun regenerateSaasOtpApiKey(): String {
        val chars = "abcdefghjkmnpqrstuvwxyz23456789"
        val sb = StringBuilder("sbk_otp_")
        val rnd = java.security.SecureRandom()
        for (i in 0 until 16) {
            sb.append(chars[rnd.nextInt(chars.length)])
        }
        val newKey = sb.toString()
        prefs.edit().putString("saas_otp_api_key", newKey).apply()
        return newKey
    }

    /**
     * 🔄 v2.3.8+ 신규 스토어 체계 및 v2.4.34 전체 카드 기본 보관 & 신규 배포 카드 자동 보관함 귀속:
     * 1) 최초 설치 시 모든 기능/시스템 카드(영수증, 명함 포함 30종 전원)가 시트봇 보관함에 기본 보관된 상태(홈 화면 활성 카드 0개)로 시작
     * 2) 향후 앱 업데이트나 OTA로 새로운 카드가 추가 배포될 때에도 홈 화면에 갑자기 튀어나오지 않고 자동으로 시트봇 보관함에 들어가도록 보장
     */
    var isSystemCardsV238Migrated: Boolean
        get() = prefs.getBoolean("is_system_cards_v238_migrated", false)
        set(value) = prefs.edit().putBoolean("is_system_cards_v238_migrated", value).apply()

    var knownDrawerCardKeys: Set<String>
        get() = prefs.getStringSet("known_drawer_card_keys_v1", null) ?: emptySet()
        set(value) = prefs.edit().putStringSet("known_drawer_card_keys_v1", value).apply()

    fun migrateSystemCardsToStoreIfNeeded(allAvailableCardKeys: Set<String> = DEFAULT_HIDDEN_CARDS) {
        val allTargetKeys = (DEFAULT_HIDDEN_CARDS + allAvailableCardKeys) - "cardStore"

        if (!isSystemCardsV238Migrated) {
            // 최초 설치: 모든 카드를 100% 보관함에 넣고 홈 화면 활성 카드는 0개로 시작
            hiddenCardKeys = allTargetKeys
            activeCardOrder = emptyList()
            knownDrawerCardKeys = allTargetKeys
            isSystemCardsV238Migrated = true
            return
        }

        val currentKnown = knownDrawerCardKeys.toMutableSet()
        val currentHidden = hiddenCardKeys.toMutableSet()
        val currentActive = activeCardOrder.toMutableList()

        if (currentKnown.isEmpty()) {
            // 이전 버전(v2.4.33 이하)에서 업데이트된 경우:
            // 기존에 DEFAULT_HIDDEN_CARDS에서 누락되었던 cardReceiptScanner, cardBusinessCard를 포함해 미등록 카드를 보관함으로 편입
            val prevDefaultHidden = DEFAULT_HIDDEN_CARDS - setOf("cardReceiptScanner", "cardBusinessCard")
            currentKnown.addAll(prevDefaultHidden)
            currentKnown.addAll(currentHidden)
        }

        // 새로 만들어져 배포된 카드(currentKnown에 없던 카드)는 자동으로 보관함(currentHidden)에 추가
        var modified = false
        for (key in allTargetKeys) {
            if (!currentKnown.contains(key)) {
                currentKnown.add(key)
                currentHidden.add(key)
                currentActive.remove(key)
                modified = true
            }
        }

        // v2.4.40: 이전 v2.4.39에서 홈 화면에 기본 노출되었던 cardFtsWorkspace를 시트봇 보관함으로 기본 이동
        if (!prefs.getBoolean("is_fts_workspace_moved_to_store_v2440", false)) {
            currentKnown.add("cardFtsWorkspace")
            currentHidden.add("cardFtsWorkspace")
            currentActive.remove("cardFtsWorkspace")
            prefs.edit().putBoolean("is_fts_workspace_moved_to_store_v2440", true).apply()
            modified = true
        }

        if (modified || knownDrawerCardKeys.size != currentKnown.size) {
            hiddenCardKeys = currentHidden
            activeCardOrder = currentActive
            knownDrawerCardKeys = currentKnown
        }
    }

    // 🔐 앱 화면 전환(문자·이메일 확인 등) 시에도 인증번호/핀코드 입력 모달창을 무손실 유지·복원하기 위한 영속 상태
    var pendingAuthModalType: String?
        get() = prefs.getString("pending_auth_modal_type", null)
        set(value) = prefs.edit().putString("pending_auth_modal_type", value).apply()

    var pendingAuthPhoneOrEmail: String?
        get() = prefs.getString("pending_auth_phone_or_email", null)
        set(value) = prefs.edit().putString("pending_auth_phone_or_email", value).apply()

    var pendingAuthCode: String?
        get() = prefs.getString("pending_auth_code", null)
        set(value) = prefs.edit().putString("pending_auth_code", value).apply()

    var pendingAuthTimestamp: Long
        get() = prefs.getLong("pending_auth_timestamp", 0L)
        set(value) = prefs.edit().putLong("pending_auth_timestamp", value).apply()

    fun savePendingAuthModal(type: String, phoneOrEmail: String = "", code: String = "") {
        prefs.edit()
            .putString("pending_auth_modal_type", type)
            .putString("pending_auth_phone_or_email", phoneOrEmail)
            .putString("pending_auth_code", code)
            .putLong("pending_auth_timestamp", System.currentTimeMillis())
            .apply()
    }

    fun clearPendingAuthModal() {
        prefs.edit()
            .remove("pending_auth_modal_type")
            .remove("pending_auth_phone_or_email")
            .remove("pending_auth_code")
            .remove("pending_auth_timestamp")
            .apply()
    }

    // =========================================================================
    // 🎙️ AI 비서 & 파투 통합 검색: 최근 검색어 및 ⭐ 고정 즐겨찾기 히스토리 관리
    // =========================================================================

    fun getCopilotSearchHistory(): List<CopilotSearchHistoryItem> {
        val raw = prefs.getString("copilot_search_history_json", null)
        if (raw.isNullOrBlank()) return emptyList()
        val list = mutableListOf<CopilotSearchHistoryItem>()
        try {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) {
                val obj = arr.optJSONObject(i) ?: continue
                val q = obj.optString("query", "").trim()
                if (q.isNotBlank()) {
                    list.add(
                        CopilotSearchHistoryItem(
                            query = q,
                            isPinned = obj.optBoolean("isPinned", false),
                            timestamp = obj.optLong("timestamp", 0L)
                        )
                    )
                }
            }
        } catch (_: Exception) {}

        // ⭐ 고정(isPinned=true) 항목을 최상단(최신순)으로, 그 뒤에 일반 최근 검색어(최신순) 정렬
        return list.sortedWith(
            compareByDescending<CopilotSearchHistoryItem> { it.isPinned }
                .thenByDescending { it.timestamp }
        )
    }

    private fun saveCopilotSearchHistoryList(items: List<CopilotSearchHistoryItem>) {
        val arr = JSONArray()
        for (item in items) {
            val obj = JSONObject().apply {
                put("query", item.query)
                put("isPinned", item.isPinned)
                put("timestamp", item.timestamp)
            }
            arr.put(obj)
        }
        prefs.edit().putString("copilot_search_history_json", arr.toString()).apply()
    }

    fun addCopilotSearchHistory(rawQuery: String) {
        val clean = rawQuery.trim()
        if (clean.isBlank()) return

        val current = getCopilotSearchHistory().toMutableList()
        val existingIdx = current.indexOfFirst { it.query.equals(clean, ignoreCase = true) }
        val wasPinned = if (existingIdx >= 0) current[existingIdx].isPinned else false
        if (existingIdx >= 0) {
            current.removeAt(existingIdx)
        }

        current.add(
            0,
            CopilotSearchHistoryItem(
                query = clean,
                isPinned = wasPinned,
                timestamp = System.currentTimeMillis()
            )
        )

        // 고정된 항목은 최대 10개까지 보존하고, 일반 최근 검색어는 최대 8개까지 유지 (총 최대 15개 이내)
        val pinned = current.filter { it.isPinned }.sortedByDescending { it.timestamp }.take(10)
        val unpinned = current.filter { !it.isPinned }.sortedByDescending { it.timestamp }.take(8)
        saveCopilotSearchHistoryList(pinned + unpinned)
    }

    /**
     * 특정 검색어의 [⭐ 고정] 상태를 토글하고 변경 후 고정 여부(Boolean)를 반환
     */
    fun togglePinCopilotSearchHistory(rawQuery: String): Boolean {
        val clean = rawQuery.trim()
        if (clean.isBlank()) return false

        val current = getCopilotSearchHistory().toMutableList()
        val existingIdx = current.indexOfFirst { it.query.equals(clean, ignoreCase = true) }
        val nextPinned: Boolean
        if (existingIdx >= 0) {
            val prev = current[existingIdx]
            nextPinned = !prev.isPinned
            current[existingIdx] = prev.copy(
                isPinned = nextPinned,
                timestamp = System.currentTimeMillis()
            )
        } else {
            nextPinned = true
            current.add(
                0,
                CopilotSearchHistoryItem(
                    query = clean,
                    isPinned = true,
                    timestamp = System.currentTimeMillis()
                )
            )
        }

        val pinned = current.filter { it.isPinned }.sortedByDescending { it.timestamp }.take(10)
        val unpinned = current.filter { !it.isPinned }.sortedByDescending { it.timestamp }.take(8)
        saveCopilotSearchHistoryList(pinned + unpinned)
        return nextPinned
    }

    fun removeCopilotSearchHistory(rawQuery: String) {
        val clean = rawQuery.trim()
        if (clean.isBlank()) return
        val filtered = getCopilotSearchHistory().filterNot { it.query.equals(clean, ignoreCase = true) }
        saveCopilotSearchHistoryList(filtered)
    }

    /**
     * 고정(⭐)된 항목은 그대로 유지하고 일반 최근 검색 기록만 일괄 정리
     */
    fun clearUnpinnedCopilotSearchHistory() {
        val pinnedOnly = getCopilotSearchHistory().filter { it.isPinned }
        saveCopilotSearchHistoryList(pinnedOnly)
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        const val DESTINATION_GOOGLE_SHEETS = "GOOGLE_SHEETS"
        const val DESTINATION_FILE_TO_SHEET = "FILE_TO_SHEET"
        const val DESTINATION_BOTH = "BOTH"

        val HOST_POLLUTED_IDS = setOf(
            "1L4fvWI_xx79DP_SUygJD203uTV6Vhr16JXYSpMR8IY8",
            "10Rq89Hfb-7V_ETG9rzYtvZUb4JX2k5xjx-1d4-Ctomk",
            "1uI2fLTtEILvJpYn0UJzN9pPLiyWJ2oADeM4kSfQCBEc",
            "1ow6qMJ3b73RSR1azhIbTSAKdwFmKTe43N2kbB-VwLOg",
            "196xly_ZhwS2PILpZYBBsjW9VD3_F6PQddBnLkDwfBaY",
            "1XCQMxao3uIhbXGh5kYlnXE5g9vH5mFBQ0cohJGyMl1U",
            "1M2lKmdAM8BvcOMrNJYH_ev5ob7ie78cHDWEmqt1ozv0",
            "1EV0kjAUFhzk1B0FMMsRfCkZaAVAoZlYs9CINglirFGw",
            "1bHtvSdmqfHJ-1WkgPv9hMlaUjqbMxEBnkHQpk1kIiOQ",
            "1aZ2kFDa-Cs8ypi15hJbntOLb7PScSOwYuUwWMFwt-0s",
            "1PZLzNoyPtt8wWIzuDKdgg5SjCLBjVoBWjxZC2Zg-jIE",
            "1INh4k7BgtgR8rkl1Pluwguq2y-0XKCn7m6ajfS04k6A",
            "1QPJglgZhhsxVFtOgrRv06aDNfmjtxWc9qgIbpdJHh3k",
            "1Tnwn722JJYb2jlXbZnLfN4UszYTg9TIa2j0GC2vpVe8",
            "1SJrrqwmrNUk_5oiBMRyA-6rhD2KrnP98CY6JdBAKyMI",
            "1vbJvJZtWGW4lik-Tn0i6QpJXmB3ovj0uy9SXCpQfalQ",
            "18Zj-txo8wSLz-aRRU_BYlA9FJdu3ZoW_fgtOnBals50",
            "11Hua4qg4fX-J9CRmh1fLNJFcTGLXV8zpD0PX2vTdiNw",
            "1HDffS1wt8f9lVHNQ64GOX7SJFQ8FZFAzZCpdr2jNgTQ",
            "16wL2XZI_oggTKJlK9Yztkg8iCUq3Ixqa",
            "11ClndqwCR-ajOcBYlkCU_pFC4Nwf47AL",
            "1wWgrOLN58BrwOQpQhqrxshJNs0_8ajaM",
            "14TuBcWsooWB7_yPqyn6L0imjshpVxFVX",
            "1Of-WsCAIYyxx7w0SgxeOLS5rMl0L4QkX"
        )

        val DEFAULT_HIDDEN_CARDS = setOf(
            // 7대 시스템 & 관제 카드 (토큰 지갑 포함 전원 보관함 기본 보관)
            "cardStatus",
            "cardTtsToggle",
            "cardWallet",
            "cardTasksHub",
            "cardCopilot",
            "cardLocalLogs",
            "cardFeatureRequest",

            // 핵심 업무 & 장부 (전원 보관함 기본 보관 - 최초 설치 시 홈 화면 0개 시작)
            "cardFtsWorkspace",
            "cardPaymentReceipt",
            "cardQuoteSync",
            "cardEstimateSync",
            "cardFileUpload",
            "cardReceiptScanner",
            "cardBusinessCard",
            "cardContactsBackup",
            "cardDepositMonitor",

            // 통화 & 녹음
            "cardCallRecording",
            "cardInCallSummary",
            "cardMissedCall",
            "cardCallEnded",
            "cardMeetingRecording",

            // 메시지 & 업무
            "cardSmsSync",
            "cardSheetSmsCheckbox",
            "cardSaasOtpRelay",
            "cardKakaoSync",
            "cardEmailSync",
            "cardLinkScrap",

            // AI & 마케팅
            "cardBlog",
            "cardInsta",
            "cardSite",
            "cardCompanyResearch",
            "cardLawAdvisory",
            "cardWebsiteMonitor"
        )
    }
}
