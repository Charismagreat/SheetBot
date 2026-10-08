package cloud.sheetbot.agent.user.card

import android.app.Activity
import android.app.AlertDialog
import android.text.method.ScrollingMovementMethod
import android.view.MotionEvent
import android.widget.Toast
import cloud.sheetbot.agent.user.LocalLogManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import java.text.NumberFormat
import java.util.Locale

/**
 * 📜 스마트폰 실시간 감지 로그 및 1,000건 뷰어 컨트롤러 (v2.1.99 모듈화)
 *
 * - 로컬 영구 보관된 감지 로그(최대 1,000건) 로드 및 텍스트 뷰 바인딩
 * - 부드러운 전용 스크롤 및 외부 터치 간섭 방지(requestDisallowInterceptTouchEvent)
 * - 실시간 로그 신규 추가(addLogItem) 및 상단 자동 스크롤(scrollTo(0, 0))
 * - 로그 건수 뱃지 갱신 (N / 1,000건)
 * - 로그 일괄 비우기 확인 다이얼로그 바인딩
 */
class LocalLogViewController(
    private val activity: Activity,
    private val binding: ActivityMainBinding,
    private val logManager: LocalLogManager
) {
    fun setup() {
        try {
            binding.tvLogs.movementMethod = ScrollingMovementMethod()
            binding.tvLogs.setOnTouchListener { v, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                        v.parent.requestDisallowInterceptTouchEvent(true)
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                        v.parent.requestDisallowInterceptTouchEvent(false)
                    }
                }
                false
            }
            val initialLogs = logManager.loadLogs()
            binding.tvLogs.text = initialLogs
            updateLogCount()
        } catch (e: Exception) {
            android.util.Log.w("LocalLogViewController", "로그 영역 초기화 예외: ${e.message}")
        }

        binding.btnClearLogs.setOnClickListener {
            AlertDialog.Builder(activity)
                .setTitle("실시간 감지 로그 비우기")
                .setMessage("스마트폰에 보관된 감지 로그(최대 1,000건)를 모두 비우시겠습니까?\n(구글 스프레드시트에 기록된 대장 내역은 안전하게 보존됩니다)")
                .setPositiveButton("비우기") { _, _ ->
                    logManager.clearLogs()
                    binding.tvLogs.text = logManager.getFormattedLogs()
                    binding.tvLogs.scrollTo(0, 0)
                    updateLogCount()
                    Toast.makeText(activity, "로그가 모두 비워졌습니다.", Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton("취소", null)
                .show()
        }
    }

    fun addLogItem(sender: String, body: String, success: Boolean) {
        try {
            val formatted = logManager.addLog(sender, body, success)
            binding.tvLogs.text = formatted
            binding.tvLogs.post {
                binding.tvLogs.scrollTo(0, 0)
            }
            updateLogCount()
        } catch (e: Exception) {
            android.util.Log.w("LocalLogViewController", "로그 추가 예외: ${e.message}")
        }
    }

    fun updateLogCount() {
        try {
            val count = logManager.getLogCount()
            val formattedCount = NumberFormat.getNumberInstance(Locale.KOREA).format(count)
            binding.tvLogCount.text = "$formattedCount / 1,000건"
        } catch (_: Exception) {}
    }
}
