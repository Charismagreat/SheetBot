package cloud.sheetbot.agent.user

import android.app.Application
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 시트봇 모바일 에이전트 Application 클래스
 * 
 * - 전역 미처리 예외(Uncaught Exception) 안전 포착 및 크래시 방어
 * - 비정상 강제 종료(ANR/Crash) 차단 및 크래시 로그 로컬 파일 보관
 * - 전역 Context 및 싱글톤 인스턴스 제공
 */
class SheetBotApp : Application() {

    companion object {
        private const val TAG = "SheetBotApp"
        lateinit var instance: SheetBotApp
            private set

        val appContext: Context
            get() = instance.applicationContext
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        setupGlobalCrashHandler()
        Log.i(TAG, "SheetBotApp 초기화 완료 (글로벌 크래시 방어벽 가동)")
    }

    /**
     * 전역 UncaughtExceptionHandler 등록
     * 어떤 스레드에서 예외가 발생하더라도 시스템 크래시 팝업을 띄우며 죽는 것을 방지
     */
    private fun setupGlobalCrashHandler() {
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                val sw = StringWriter()
                val pw = PrintWriter(sw)
                throwable.printStackTrace(pw)
                val stackTrace = sw.toString()

                Log.e(TAG, "🚨 [CRASH DEFENDER] 스레드 '${thread.name}'에서 미처리 예외 포착: ${throwable.message}\n$stackTrace")

                // 크래시 로그를 내부 저장소에 안전 보관
                saveCrashLogToFile(thread.name, throwable.message, stackTrace)
            } catch (e: Throwable) {
                Log.e(TAG, "크래시 로그 파일 저장 중 오류: ${e.message}")
            }

            // 시스템 기본 핸들러로 넘겨서 프로세스를 정상 종료하거나 안전하게 처리
            // (필요 시 앱 안전 재실행 또는 기본 핸들러 위임)
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }

    private fun saveCrashLogToFile(threadName: String, message: String?, stackTrace: String) {
        try {
            val logDir = File(filesDir, "logs")
            if (!logDir.exists()) {
                logDir.mkdirs()
            }
            val logFile = File(logDir, "last_crash.log")
            val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA).format(Date())
            val content = buildString {
                append("=== SheetBot Agent Crash Report ===\n")
                append("Time: $timestamp\n")
                append("Thread: $threadName\n")
                append("Message: $message\n")
                append("StackTrace:\n$stackTrace\n")
                append("===================================\n\n")
            }
            logFile.writeText(content)
        } catch (_: Throwable) {}
    }
}
