package cloud.sheetbot.agent.user

import java.util.Collections
import java.util.LinkedHashMap

/**
 * SMS/RCS 송수신 메시지 15초 멱등성 디바운싱(중복 방어) 전역 매니저
 * - SmsReceiver, BankNotificationListener(메시지 감지), SmsSentObserver 간의 중복 전송 원천 차단
 */
object SmsDedupeManager {
    private val recentCache = Collections.synchronizedMap(
        object : LinkedHashMap<String, Long>(100, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?): Boolean {
                return size > 100
            }
        }
    )

    private fun normalizeKey(str: String): String {
        return str.replace("-", "").replace(" ", "").trim().lowercase()
    }

    /**
     * 동일 수신/발신 메시지가 15초 이내에 이미 처리되었는지 확인하고,
     * 처리되지 않았으면 즉시 선점 등록하여 후속 중복 이벤트를 차단
     * @param extraIdentifiers 추가로 함께 묶어서 중복 체크 및 선점할 식별자 목록 (예: 주소록 이름, 역조회 번호 등)
     * @return true: 최초 1회 처리 허용, false: 15초 이내 중복 감지되어 무시
     */
    fun shouldProcessMessage(
        direction: String,
        senderOrRecipient: String,
        body: String,
        extraIdentifiers: List<String> = emptyList()
    ): Boolean {
        val cleanBody = body.trim()
        val allIds = (listOf(senderOrRecipient) + extraIdentifiers)
            .map { normalizeKey(it) }
            .filter { it.isNotBlank() }
            .distinct()

        val now = System.currentTimeMillis()

        synchronized(recentCache) {
            // 등록된 식별자 중 하나라도 최근 15초 이내에 존재하면 중복으로 차단
            for (id in allIds) {
                val key = "$direction:$id:$cleanBody"
                val lastTime = recentCache[key] ?: 0L
                if (now - lastTime < 15_000L) {
                    return false
                }
            }

            // 중복이 아니면 관련된 모든 식별자 키를 동시에 선점 등록
            for (id in allIds) {
                val key = "$direction:$id:$cleanBody"
                recentCache[key] = now
            }
            return true
        }
    }

    /**
     * 이미 처리된 메시지에 추가 식별자(예: 주소록 이름 등)를 후속 선점 등록
     */
    fun registerAdditionalIdentifier(direction: String, identifier: String?, body: String) {
        if (identifier.isNullOrBlank()) return
        val cleanId = normalizeKey(identifier)
        val cleanBody = body.trim()
        val key = "$direction:$cleanId:$cleanBody"
        val now = System.currentTimeMillis()
        synchronized(recentCache) {
            recentCache[key] = now
        }
    }
}
