package cloud.sheetbot.agent.user.card

import android.app.Activity
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.random.Random

/**
 * 🌙 Always On Display (AOD) 블랙 스크린 절전 모드 컨트롤러 (v2.1.99 모듈화)
 *
 * - AOD 블랙 절전 모드 진입/해제 (화면 밝기 0.01f 초절전 및 복귀)
 * - 번인(Burn-in) 방지를 위한 시계 픽셀 지능형 랜덤 시프트 루프 (1분 주기)
 * - 화면 두 번 탭(Double Tap) 감지 제스처 리스너
 * - Activity 라이프사이클 종료 시 백그라운드 코루틴 자원 안전 해제
 */
class AodModeController(
    private val activity: Activity,
    private val binding: ActivityMainBinding,
    private val scope: CoroutineScope
) {
    private var aodJob: Job? = null
    private lateinit var aodGestureDetector: GestureDetector

    fun setup() {
        aodGestureDetector = GestureDetector(activity, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDoubleTap(e: MotionEvent): Boolean {
                exitAodMode()
                return true
            }
        })

        binding.layoutAod.setOnTouchListener { _, event ->
            aodGestureDetector.onTouchEvent(event)
            true
        }

        binding.btnEnterAod.setOnClickListener {
            enterAodMode()
        }
    }

    fun enterAodMode() {
        binding.layoutAod.visibility = View.VISIBLE
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val lp = activity.window.attributes
        lp.screenBrightness = 0.01f
        activity.window.attributes = lp
        startAodClockLoop()
        Toast.makeText(activity, "AOD 블랙 모드가 시작되었습니다.\n화면을 두 번 탭하면 복귀합니다.", Toast.LENGTH_SHORT).show()
    }

    fun exitAodMode() {
        aodJob?.cancel()
        aodJob = null
        binding.layoutAod.visibility = View.GONE
        val lp = activity.window.attributes
        lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        activity.window.attributes = lp
        Toast.makeText(activity, "AOD 모드가 해제되었습니다.", Toast.LENGTH_SHORT).show()
    }

    private fun startAodClockLoop() {
        aodJob?.cancel()
        val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
        aodJob = scope.launch {
            while (isActive) {
                binding.tvAodClock.text = timeFormat.format(Date())
                val shiftX = Random.nextInt(-30, 31).toFloat()
                val shiftY = Random.nextInt(-30, 31).toFloat()
                binding.containerAodContent.translationX = shiftX
                binding.containerAodContent.translationY = shiftY
                delay(60000L)
            }
        }
    }

    fun destroy() {
        try {
            aodJob?.cancel()
            aodJob = null
        } catch (_: Throwable) {}
    }
}
