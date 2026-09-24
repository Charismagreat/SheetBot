package cloud.sheetbot.agent.user

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.WindowManager
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import cloud.sheetbot.agent.user.databinding.ActivityEmergencyAlarmBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class EmergencyAlarmActivity : AppCompatActivity() {
    private lateinit var binding: ActivityEmergencyAlarmBinding
    private val activityScope = CoroutineScope(Dispatchers.Main)
    private var autoCheckJob: Job? = null
    private var isMuted = false

    companion object {
        fun start(context: Context) {
            val intent = Intent(context, EmergencyAlarmActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            context.startActivity(intent)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        wakeScreenAndUnlock()

        binding = ActivityEmergencyAlarmBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val timeFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA)
        binding.tvEmergencyTime.text = "감지 시각: ${timeFormat.format(Date())}"

        updatePendingCount()
        triggerVibration()
        setupListeners()
        startAutoRecoveryCheckLoop()
    }

    private fun wakeScreenAndUnlock() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }
    }

    private fun setupListeners() {
        // 1. 서버 지금 재확인
        binding.btnEmergencyRetry.setOnClickListener {
            binding.btnEmergencyRetry.isEnabled = false
            binding.btnEmergencyRetry.text = "🔄 서버 연결 확인 중..."
            activityScope.launch {
                val ping = ApiClient.pingServer()
                if (ping.isOnline) {
                    Toast.makeText(this@EmergencyAlarmActivity, "🎉 서버가 정상 복구되었습니다!", Toast.LENGTH_LONG).show()
                    TtsManager.speak(this@EmergencyAlarmActivity, "서버 연결이 정상 복구되었습니다.")
                    // 오프라인 큐 즉시 비우기
                    val drained = DepositQueueManager.drainQueue(this@EmergencyAlarmActivity)
                    if (drained > 0) {
                        Toast.makeText(this@EmergencyAlarmActivity, "대기열 ${drained}건 서버 전송 완료", Toast.LENGTH_SHORT).show()
                    }
                    finish()
                } else {
                    Toast.makeText(this@EmergencyAlarmActivity, "⚠️ 아직 서버가 응답하지 않습니다.", Toast.LENGTH_SHORT).show()
                    binding.btnEmergencyRetry.isEnabled = true
                    binding.btnEmergencyRetry.text = "🔄 서버 연결 지금 재점검"
                }
            }
        }

        // 2. 경보 소리 끄기
        binding.btnEmergencyDismiss.setOnClickListener {
            isMuted = true
            Toast.makeText(this, "비상 알람 소리가 음소거되었습니다.", Toast.LENGTH_SHORT).show()
            finish()
        }

        // 3. 메인 화면 열기
        binding.btnEmergencyGoMain.setOnClickListener {
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            startActivity(intent)
            finish()
        }
    }

    private fun updatePendingCount() {
        val count = DepositQueueManager.getPendingCount(this)
        binding.tvEmergencyPendingCount.text = "📥 오프라인 안전 대기열: ${count}건 보관 중"
    }

    private fun triggerVibration() {
        try {
            val pattern = longArrayOf(0, 500, 200, 500, 200, 1000)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
            } else {
                @Suppress("DEPRECATION")
                val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createWaveform(pattern, -1))
                } else {
                    v.vibrate(pattern, -1)
                }
            }
        } catch (_: Exception) {}
    }

    private fun startAutoRecoveryCheckLoop() {
        autoCheckJob?.cancel()
        autoCheckJob = activityScope.launch {
            while (isActive) {
                delay(10000L) // 10초마다 자동 복구 점검
                updatePendingCount()
                val ping = withContext(Dispatchers.IO) { ApiClient.pingServer() }
                if (ping.isOnline) {
                    TtsManager.speak(this@EmergencyAlarmActivity, "서버 연결이 정상 복구되었습니다.")
                    DepositQueueManager.drainQueue(this@EmergencyAlarmActivity)
                    finish()
                    break
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        autoCheckJob?.cancel()
    }
}
