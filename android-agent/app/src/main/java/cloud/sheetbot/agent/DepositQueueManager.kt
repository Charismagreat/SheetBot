package cloud.sheetbot.agent

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * 서버 다운 또는 네트워크 두절 시 수신된 입금 데이터를 로컬에 안전하게 보관하고,
 * 서버 복구 시 유실 없이 순차적으로 자동 재전송(Drain)하는 오프라인 대기열 관리자
 */
object DepositQueueManager {
    private const val TAG = "DepositQueueManager"
    private const val PREFS_NAME = "sheetbot_deposit_queue"
    private const val KEY_QUEUE = "pending_deposits_json"

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    /**
     * 전송 실패한 입금 내역을 로컬 큐에 추가
     */
    @Synchronized
    fun enqueueDeposit(
        context: Context,
        sender: String,
        smsText: String,
        userEmail: String,
        source: String = "android_offline_queue"
    ) {
        val prefs = getPrefs(context)
        val raw = prefs.getString(KEY_QUEUE, "[]") ?: "[]"
        val array = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }

        val item = JSONObject().apply {
            put("id", System.currentTimeMillis())
            put("sender", sender)
            put("smsText", smsText)
            put("userEmail", userEmail)
            put("source", source)
            put("timestamp", System.currentTimeMillis())
        }

        array.put(item)
        prefs.edit().putString(KEY_QUEUE, array.toString()).apply()
        Log.i(TAG, "📥 [오프라인 큐 저장] 보관 성공: 발신=$sender / 대기 총 ${array.length()}건")
    }

    /**
     * 현재 로컬 대기열에 저장된 미전송 입금 건수 반환
     */
    @Synchronized
    fun getPendingCount(context: Context): Int {
        val prefs = getPrefs(context)
        val raw = prefs.getString(KEY_QUEUE, "[]") ?: "[]"
        return try {
            JSONArray(raw).length()
        } catch (_: Exception) {
            0
        }
    }

    /**
     * 로컬 대기열 목록 조회
     */
    @Synchronized
    fun getPendingItems(context: Context): List<QueuedDeposit> {
        val prefs = getPrefs(context)
        val raw = prefs.getString(KEY_QUEUE, "[]") ?: "[]"
        val list = mutableListOf<QueuedDeposit>()
        try {
            val array = JSONArray(raw)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                list.add(
                    QueuedDeposit(
                        id = obj.optLong("id"),
                        sender = obj.optString("sender"),
                        smsText = obj.optString("smsText"),
                        userEmail = obj.optString("userEmail"),
                        source = obj.optString("source", "android_offline_queue"),
                        timestamp = obj.optLong("timestamp")
                    )
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "대기열 목록 파싱 오류", e)
        }
        return list
    }

    /**
     * 서버 복구 시 대기열의 입금 데이터를 서버로 순차 재전송하고 성공한 항목 제거
     * @return 성공적으로 전송 완료된 건수
     */
    suspend fun drainQueue(context: Context): Int = withContext(Dispatchers.IO) {
        val items = getPendingItems(context)
        if (items.isEmpty()) return@withContext 0

        val prefsManager = PreferencesManager(context)
        var successCount = 0
        val remaining = mutableListOf<QueuedDeposit>()

        Log.i(TAG, "🚀 [오프라인 큐 전송 시작] 총 ${items.size}건의 미전송 입금 내역 재전송 시도")

        for (item in items) {
            try {
                val result = ApiClient.sendBankWebhook(
                    webhookUrl = prefsManager.webhookUrl,
                    fallbackWebhookUrl = prefsManager.fallbackWebhookUrl,
                    sender = item.sender,
                    smsText = item.smsText,
                    userEmail = item.userEmail
                )

                if (result.success) {
                    successCount++
                    Log.i(TAG, "✅ [오프라인 큐 전송 성공] ID=${item.id}, 발신=${item.sender}")
                    // 0원 영수증 SMS 자동 회신
                    if (prefsManager.isReceiptSmsEnabled && !result.replySmsPhone.isNullOrBlank() && !result.replySmsText.isNullOrBlank()) {
                        SmsSenderUtil.sendSms(context, result.replySmsPhone, result.replySmsText)
                    }
                } else {
                    Log.w(TAG, "⚠️ [오프라인 큐 전송 실패] 서버 여전히 불안정 - 큐에 유지")
                    remaining.add(item)
                }
            } catch (e: Exception) {
                Log.w(TAG, "⚠️ [오프라인 큐 전송 예외] ${e.message} - 큐에 유지")
                remaining.add(item)
            }
        }

        // 남은 대기열 갱신
        synchronized(this@DepositQueueManager) {
            val prefs = getPrefs(context)
            val newArray = JSONArray()
            remaining.forEach { r ->
                val obj = JSONObject().apply {
                    put("id", r.id)
                    put("sender", r.sender)
                    put("smsText", r.smsText)
                    put("userEmail", r.userEmail)
                    put("source", r.source)
                    put("timestamp", r.timestamp)
                }
                newArray.put(obj)
            }
            prefs.edit().putString(KEY_QUEUE, newArray.toString()).apply()
        }

        if (successCount > 0) {
            Log.i(TAG, "🎉 [오프라인 큐 비우기 완료] ${successCount}건 전송 성공 (남은 큐: ${remaining.size}건)")
        }

        successCount
    }
}

data class QueuedDeposit(
    val id: Long,
    val sender: String,
    val smsText: String,
    val userEmail: String,
    val source: String,
    val timestamp: Long
)
