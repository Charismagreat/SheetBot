package cloud.sheetbot.agent.user

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale

/**
 * 📱 시트봇 모바일 에이전트 실시간 감지 로그 로컬 영구 보관 매니저 (최대 1,000건 FIFO 순환 보관)
 * - 앱 내부 전용 파일(sheetbot_detected_logs.txt)에 안전하게 보관 (Zero-Retention: 외부 서버 저장 0)
 * - 앱 재시작이나 스마트폰 재부팅 후에도 최근 1,000건의 감지/동기화 로그를 0초 만에 완벽 복원
 */
class LocalLogManager private constructor(private val context: Context) {
    companion object {
        const val MAX_LOG_COUNT = 1000
        private const val LOG_FILE_NAME = "sheetbot_detected_logs.txt"

        @Volatile
        private var instance: LocalLogManager? = null

        fun getInstance(context: Context): LocalLogManager {
            return instance ?: synchronized(this) {
                instance ?: LocalLogManager(context.applicationContext).also { instance = it }
            }
        }
    }

    private val logQueue = ArrayDeque<String>(MAX_LOG_COUNT + 10)
    private val scope = CoroutineScope(Dispatchers.IO)
    private val logFile: File get() = File(context.filesDir, LOG_FILE_NAME)
    private var isLoaded = false

    /**
     * 로컬 파일에서 기존 저장된 로그 로드 (최대 1,000건)
     */
    @Synchronized
    fun loadLogs(): String {
        if (!isLoaded) {
            try {
                if (logFile.exists()) {
                    val lines = logFile.readLines(Charsets.UTF_8)
                    logQueue.clear()
                    for (line in lines) {
                        if (line.isNotBlank()) {
                            logQueue.addLast(line)
                            if (logQueue.size >= MAX_LOG_COUNT) break
                        }
                    }
                }
            } catch (e: Exception) {
                android.util.Log.w("LocalLogManager", "로그 로드 실패: ${e.message}")
            }
            isLoaded = true
        }
        return getFormattedLogs()
    }

    /**
     * 신규 로그 1건 추가 (최신순 상단 추가, 1,000건 초과 시 가장 오래된 것 자동 삭제)
     */
    @Synchronized
    fun addLog(sender: String, body: String, success: Boolean): String {
        ensureLoaded()
        val timeStr = SimpleDateFormat("MM/dd HH:mm:ss", Locale.KOREA).format(Date())
        val statusIcon = if (success) "🟢" else "🔴"
        val cleanBody = body.replace("\n", " ").trim()
        val snippet = if (cleanBody.length > 50) cleanBody.take(50) + "..." else cleanBody
        val logLine = "$statusIcon [$timeStr] $sender: $snippet"

        logQueue.addFirst(logLine)
        while (logQueue.size > MAX_LOG_COUNT) {
            logQueue.removeLast()
        }

        saveLogsToFileAsync()
        return getFormattedLogs()
    }

    /**
     * 화면 표시용 전체 포맷팅 텍스트
     */
    @Synchronized
    fun getFormattedLogs(): String {
        if (logQueue.isEmpty()) {
            return "대기 중... 은행 입금 알림, 결제 푸시, 고객 SMS가 수신되면 실시간 기록됩니다.\n"
        }
        val sb = StringBuilder()
        for (line in logQueue) {
            sb.append(line).append("\n")
        }
        return sb.toString()
    }

    /**
     * 현재 보관된 로그 개수
     */
    @Synchronized
    fun getLogCount(): Int {
        ensureLoaded()
        return logQueue.size
    }

    /**
     * 전체 로그 비우기
     */
    @Synchronized
    fun clearLogs() {
        logQueue.clear()
        saveLogsToFileAsync()
    }

    private fun ensureLoaded() {
        if (!isLoaded) {
            loadLogs()
        }
    }

    private fun saveLogsToFileAsync() {
        val snapshot = synchronized(this) { logQueue.toList() }
        scope.launch {
            try {
                val tempFile = File(context.filesDir, "${LOG_FILE_NAME}.tmp")
                tempFile.bufferedWriter(Charsets.UTF_8).use { writer ->
                    for (line in snapshot) {
                        writer.write(line)
                        writer.newLine()
                    }
                }
                tempFile.renameTo(logFile)
            } catch (e: Exception) {
                android.util.Log.w("LocalLogManager", "로그 비동기 저장 실패: ${e.message}")
            }
        }
    }
}
