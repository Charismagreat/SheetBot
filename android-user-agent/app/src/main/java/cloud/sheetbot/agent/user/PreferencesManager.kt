package cloud.sheetbot.agent.user

import android.content.Context
import android.content.SharedPreferences

class PreferencesManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("sheetbot_agent_prefs", Context.MODE_PRIVATE)

    var userEmail: String?
        get() = prefs.getString("user_email", null)
        set(value) = prefs.edit().putString("user_email", value).apply()

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

    var isPaired: Boolean
        get() = prefs.getBoolean("is_paired", false) && !userEmail.isNullOrBlank()
        set(value) = prefs.edit().putBoolean("is_paired", value).apply()

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

    var isPushDetectionEnabled: Boolean
        get() = prefs.getBoolean("is_push_detection_enabled", true)
        set(value) = prefs.edit().putBoolean("is_push_detection_enabled", value).apply()

    var isPrivacyCardHidden: Boolean
        get() = prefs.getBoolean("is_privacy_card_hidden", false)
        set(value) = prefs.edit().putBoolean("is_privacy_card_hidden", value).apply()

    var isStatusDetailsHidden: Boolean
        get() = prefs.getBoolean("is_status_details_hidden", false)
        set(value) = prefs.edit().putBoolean("is_status_details_hidden", value).apply()

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

    var callRecordingTargetFilter: String
        get() = prefs.getString("call_recording_target_filter", "") ?: ""
        set(value) = prefs.edit().putString("call_recording_target_filter", value).apply()

    var callRecordingDriveFolder: String
        get() = prefs.getString("call_recording_drive_folder", "[SheetBot] 통화 녹음") ?: "[SheetBot] 통화 녹음"
        set(value) = prefs.edit().putString("call_recording_drive_folder", value).apply()

    var isCallRecordingSheetEnabled: Boolean
        get() = prefs.getBoolean("is_call_recording_sheet_enabled", false)
        set(value) = prefs.edit().putBoolean("is_call_recording_sheet_enabled", value).apply()

    // 사진 및 일반 파일 구글 드라이브 업로드 관련 설정
    var isFileUploadSyncEnabled: Boolean
        get() = prefs.getBoolean("is_file_upload_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_file_upload_sync_enabled", value).apply()

    var fileUploadDriveFolder: String
        get() = prefs.getString("file_upload_drive_folder", "[SheetBot] 파일 보관함") ?: "[SheetBot] 파일 보관함"
        set(value) = prefs.edit().putString("file_upload_drive_folder", value).apply()

    var isFileUploadSheetEnabled: Boolean
        get() = prefs.getBoolean("is_file_upload_sheet_enabled", false)
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

    // AI 스마트 견적 및 단가표 구글 시트 연동 설정 (신규 설치 시 기본 꺼짐: false)
    var isQuoteSheetSyncEnabled: Boolean
        get() = prefs.getBoolean("is_quote_sheet_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("is_quote_sheet_sync_enabled", value).apply()

    var quoteDriveSheetTitle: String
        get() = prefs.getString("quote_drive_sheet_title", "[SheetBot] 스마트 견적 및 단가표 대장") ?: "[SheetBot] 스마트 견적 및 단가표 대장"
        set(value) = prefs.edit().putString("quote_drive_sheet_title", value).apply()

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

    // 통화 종료 직후 모바일 명함 / 감사 문자 원터치 발송 설정 (신규 설치 시 기본 꺼짐: false)
    var isCallEndedCardPromptEnabled: Boolean
        get() = prefs.getBoolean("is_call_ended_card_prompt_enabled", false)
        set(value) = prefs.edit().putBoolean("is_call_ended_card_prompt_enabled", value).apply()

    // 발송 방식: "WEB_LINK" (0원 무료 웹링크) 또는 "MMS_IMAGE" (갤러리 사진 직접 첨부 MMS)
    var businessCardSendMode: String
        get() = prefs.getString("business_card_send_mode", "WEB_LINK") ?: "WEB_LINK"
        set(value) = prefs.edit().putString("business_card_send_mode", value).apply()

    // 방안 1: 웹 명함 / 이벤트 페이지 링크
    var businessCardWebLink: String
        get() = prefs.getString("business_card_web_link", "https://sheetbot.cloud") ?: "https://sheetbot.cloud"
        set(value) = prefs.edit().putString("business_card_web_link", value).apply()

    // 방안 2: 저장된 명함 / 포스터 이미지 파일 절대 경로
    var businessCardImagePath: String
        get() = prefs.getString("business_card_image_path", "") ?: ""
        set(value) = prefs.edit().putString("business_card_image_path", value).apply()

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

    fun setSheetUrl(sheetType: String, url: String) {
        prefs.edit().putString("sheet_url_${sheetType.uppercase()}", url).apply()
    }

    fun getSheetUrl(sheetType: String): String? {
        return prefs.getString("sheet_url_${sheetType.uppercase()}", null)
    }

    fun setFolderUrl(sheetType: String, url: String) {
        prefs.edit().putString("folder_url_${sheetType.uppercase()}", url).apply()
    }

    fun getFolderUrl(sheetType: String): String? {
        return prefs.getString("folder_url_${sheetType.uppercase()}", null)
    }

    fun setSheetId(sheetType: String, id: String) {
        prefs.edit().putString("sheet_id_${sheetType.uppercase()}", id).apply()
    }

    fun getSheetId(sheetType: String): String? {
        return prefs.getString("sheet_id_${sheetType.uppercase()}", null)
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
