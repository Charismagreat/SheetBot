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
        get() = prefs.getString("webhook_url", "https://sheetbot.cloud/api/wallet/bank-webhook") ?: "https://sheetbot.cloud/api/wallet/bank-webhook"
        set(value) = prefs.edit().putString("webhook_url", value).apply()

    var fallbackWebhookUrl: String
        get() = prefs.getString("fallback_webhook_url", "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/bank-webhook") ?: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/bank-webhook"
        set(value) = prefs.edit().putString("fallback_webhook_url", value).apply()

    var heartbeatUrl: String
        get() = prefs.getString("heartbeat_url", "https://sheetbot.cloud/api/wallet/agent/heartbeat") ?: "https://sheetbot.cloud/api/wallet/agent/heartbeat"
        set(value) = prefs.edit().putString("heartbeat_url", value).apply()

    var fallbackHeartbeatUrl: String
        get() = prefs.getString("fallback_heartbeat_url", "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/agent/heartbeat") ?: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/agent/heartbeat"
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

    // 통화 녹음 파일 구글 드라이브 자동 백업 관련 설정
    var isCallRecordingSyncEnabled: Boolean
        get() = prefs.getBoolean("is_call_recording_sync_enabled", true)
        set(value) = prefs.edit().putBoolean("is_call_recording_sync_enabled", value).apply()

    var callRecordingTargetFilter: String
        get() = prefs.getString("call_recording_target_filter", "") ?: ""
        set(value) = prefs.edit().putString("call_recording_target_filter", value).apply()

    var callRecordingDriveFolder: String
        get() = prefs.getString("call_recording_drive_folder", "[SheetBot] 통화 녹음") ?: "[SheetBot] 통화 녹음"
        set(value) = prefs.edit().putString("call_recording_drive_folder", value).apply()

    var isCallRecordingSheetEnabled: Boolean
        get() = prefs.getBoolean("is_call_recording_sheet_enabled", true)
        set(value) = prefs.edit().putBoolean("is_call_recording_sheet_enabled", value).apply()

    // 사진 및 일반 파일 구글 드라이브 업로드 관련 설정
    var fileUploadDriveFolder: String
        get() = prefs.getString("file_upload_drive_folder", "[SheetBot] 파일 보관함") ?: "[SheetBot] 파일 보관함"
        set(value) = prefs.edit().putString("file_upload_drive_folder", value).apply()

    var isFileUploadSheetEnabled: Boolean
        get() = prefs.getBoolean("is_file_upload_sheet_enabled", true)
        set(value) = prefs.edit().putBoolean("is_file_upload_sheet_enabled", value).apply()

    // 스마트폰 문자(SMS/LMS) 송수신 구글 시트 자동 동기화 설정
    var isSmsSheetSyncEnabled: Boolean
        get() = prefs.getBoolean("is_sms_sheet_sync_enabled", true)
        set(value) = prefs.edit().putBoolean("is_sms_sheet_sync_enabled", value).apply()

    var smsTargetFilter: String
        get() = prefs.getString("sms_target_filter", "") ?: ""
        set(value) = prefs.edit().putString("sms_target_filter", value).apply()

    var smsDriveSheetTitle: String
        get() = prefs.getString("sms_drive_sheet_title", "[SheetBot] 스마트폰 문자(SMS) 송수신 대장") ?: "[SheetBot] 스마트폰 문자(SMS) 송수신 대장"
        set(value) = prefs.edit().putString("sms_drive_sheet_title", value).apply()

    // 카카오톡 수신 메시지 구글 시트 자동 동기화 설정
    var isKakaoSheetSyncEnabled: Boolean
        get() = prefs.getBoolean("is_kakao_sheet_sync_enabled", true)
        set(value) = prefs.edit().putBoolean("is_kakao_sheet_sync_enabled", true).apply()

    var kakaoTargetFilter: String
        get() = prefs.getString("kakao_target_filter", "") ?: ""
        set(value) = prefs.edit().putString("kakao_target_filter", value).apply()

    var kakaoDriveSheetTitle: String
        get() = prefs.getString("kakao_drive_sheet_title", "[SheetBot] 카카오톡 메시지 대장") ?: "[SheetBot] 카카오톡 메시지 대장"
        set(value) = prefs.edit().putString("kakao_drive_sheet_title", value).apply()

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

    fun clear() {
        prefs.edit().clear().apply()
    }
}
