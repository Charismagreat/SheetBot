package cloud.sheetbot.agent.sms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** 인증번호 SMS 릴레이 페어링 정보와 보고 대기열 저장 (입금 감지 설정과 분리된 별도 저장소) */
class ManagerSmsPrefs(context: Context) {
    private val sp = context.applicationContext.getSharedPreferences("manager_sms_relay", Context.MODE_PRIVATE)

    var server: String?
        get() = sp.getString("server", null)
        set(v) = sp.edit().putString("server", v).apply()

    var deviceKey: String?
        get() = sp.getString("device_key", null)
        set(v) = sp.edit().putString("device_key", v).apply()

    var deviceId: String?
        get() = sp.getString("device_id", null)
        set(v) = sp.edit().putString("device_id", v).apply()

    var label: String?
        get() = sp.getString("label", null)
        set(v) = sp.edit().putString("label", v).apply()

    var lastStatus: String
        get() = sp.getString("last_status", "") ?: ""
        set(v) = sp.edit().putString("last_status", v).apply()

    val isPaired: Boolean get() = !server.isNullOrBlank() && !deviceKey.isNullOrBlank()

    fun clearPairing() {
        sp.edit().remove("server").remove("device_key").remove("device_id").remove("label")
            .remove("pending_reports").remove("handled_ids").apply()
    }

    // ---- 이미 처리한 작업 ID (중복 발송 방지) ----
    @Synchronized
    fun isHandled(id: Long): Boolean = handledIds().contains(id)

    @Synchronized
    fun markHandled(id: Long) {
        val list = handledIds().toMutableList()
        list.add(id)
        val trimmed = list.takeLast(200)
        sp.edit().putString("handled_ids", JSONArray(trimmed).toString()).apply()
    }

    private fun handledIds(): List<Long> {
        val arr = try { JSONArray(sp.getString("handled_ids", "[]")) } catch (_: Exception) { JSONArray() }
        return (0 until arr.length()).map { arr.getLong(it) }
    }

    // ---- 서버 보고 대기열 (발송 후 네트워크 실패 시 재시도) ----
    data class PendingReport(val id: Long, val success: Boolean, val error: String?)

    @Synchronized
    fun addPendingReport(r: PendingReport) {
        val arr = pendingArray()
        arr.put(JSONObject().put("id", r.id).put("success", r.success).put("error", r.error ?: JSONObject.NULL))
        sp.edit().putString("pending_reports", arr.toString()).apply()
    }

    @Synchronized
    fun pendingReports(): List<PendingReport> {
        val arr = pendingArray()
        return (0 until arr.length()).map {
            val o = arr.getJSONObject(it)
            PendingReport(o.getLong("id"), o.getBoolean("success"), if (o.isNull("error")) null else o.getString("error"))
        }
    }

    @Synchronized
    fun removePendingReport(id: Long) {
        val arr = pendingArray()
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            if (arr.getJSONObject(i).getLong("id") != id) out.put(arr.getJSONObject(i))
        }
        sp.edit().putString("pending_reports", out.toString()).apply()
    }

    private fun pendingArray(): JSONArray =
        try { JSONArray(sp.getString("pending_reports", "[]")) } catch (_: Exception) { JSONArray() }
}
