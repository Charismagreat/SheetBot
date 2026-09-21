package cloud.sheetbot.agent

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

    var heartbeatUrl: String
        get() = prefs.getString("heartbeat_url", "https://sheetbot.cloud/api/wallet/agent/heartbeat") ?: "https://sheetbot.cloud/api/wallet/agent/heartbeat"
        set(value) = prefs.edit().putString("heartbeat_url", value).apply()

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

    fun clear() {
        prefs.edit().clear().apply()
    }
}
