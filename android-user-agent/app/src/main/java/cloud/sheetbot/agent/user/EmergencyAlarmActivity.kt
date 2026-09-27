package cloud.sheetbot.agent.user

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
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
    private var targetUrl: String = ""

    companion object {
        const val EXTRA_TARGET_URL = "extra_target_url"
        const val EXTRA_STATUS_CODE = "extra_status_code"
        const val EXTRA_ERROR_MESSAGE = "extra_error_message"

        fun start(context: Context) {
            val prefs = PreferencesManager(context)
            startWebsiteAlarm(context, prefs.targetWebsiteUrl, 0, "서버 응답 없음")
        }

        fun startWebsiteAlarm(context: Context, targetUrl: String, statusCode: Int, errorMessage: String?) {
            val intent = Intent(context, EmergencyAlarmActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra(EXTRA_TARGET_URL, targetUrl)
                putExtra(EXTRA_STATUS_CODE, statusCode)
                putExtra(EXTRA_ERROR_MESSAGE, errorMessage)
            }
            context.startActivity(intent)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        wakeScreenAndUnlock()

        binding = ActivityEmergencyAlarmBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val prefs = PreferencesManager(this)
        targetUrl = intent.getStringExtra(EXTRA_TARGET_URL) ?: prefs.targetWebsiteUrl
        val statusCode = intent.getIntExtra(EXTRA_STATUS_CODE, 0)
        val errorMessage = intent.getStringExtra(EXTRA_ERROR_MESSAGE) ?: "응답 시간 초과"

        val timeFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA)
        binding.tvEmergencyTime.text = "감지 시각: ${timeFormat.format(Date())}"

        if (targetUrl.isNotBlank()) {
            binding.tvWebsiteTargetUrl.text = "⚠️ $targetUrl"
        } else {
            binding.tvWebsiteTargetUrl.text = "⚠️ 등록된 웹사이트"
        }

        val statusText = if (statusCode > 0) "HTTP $statusCode" else "서버 응답 없음"
        binding.tvWebsiteErrorDetail.text = "대상 웹사이트가 2회 연속 응답하지 않습니다.\n\n" +
                "• 상태: $statusText\n" +
                "• 상세: $errorMessage\n\n" +
                "• 스마트폰 인터넷 연결은 정상이며, 해당 사이트만 접속 불가함을 교차 검증 완료했습니다.\n" +
                "• 신속히 호스팅/서버 가동 상태를 점검하세요."

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
        // 1. 내 사이트 브라우저로 직접 접속 시도
        binding.btnOpenWebsiteInBrowser.setOnClickListener {
            if (targetUrl.isNotBlank()) {
                var url = targetUrl.trim()
                if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    url = "https://$url"
                }
                try {
                    val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(browserIntent)
                } catch (e: Exception) {
                    Toast.makeText(this, "브라우저 실행 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            } else {
                Toast.makeText(this, "등록된 웹사이트 주소가 없습니다.", Toast.LENGTH_SHORT).show()
            }
        }

        // 2. 웹사이트 지금 재점검
        binding.btnEmergencyRetry.setOnClickListener {
            binding.btnEmergencyRetry.isEnabled = false
            binding.btnEmergencyRetry.text = "🔄 사이트 연결 확인 중..."
            activityScope.launch {
                val check = ApiClient.checkWebsiteHealth(targetUrl)
                if (check.isOnline) {
                    Toast.makeText(this@EmergencyAlarmActivity, "🎉 웹사이트가 정상 복구되었습니다! (${check.responseTimeMs}ms)", Toast.LENGTH_LONG).show()
                    TtsManager.speak(this@EmergencyAlarmActivity, "웹사이트 연결이 정상 복구되었습니다.")
                    finish()
                } else {
                    Toast.makeText(this@EmergencyAlarmActivity, "⚠️ 아직 웹사이트가 응답하지 않습니다. (${check.errorMessage})", Toast.LENGTH_SHORT).show()
                    binding.btnEmergencyRetry.isEnabled = true
                    binding.btnEmergencyRetry.text = "🔄 웹사이트 연결 지금 재점검"
                }
            }
        }

        // 3. 비상 경보 소리 끄기 및 닫기
        binding.btnEmergencyDismiss.setOnClickListener {
            isMuted = true
            Toast.makeText(this, "비상 알람이 해제되었습니다.", Toast.LENGTH_SHORT).show()
            finish()
        }
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
        if (targetUrl.isBlank()) return
        autoCheckJob?.cancel()
        autoCheckJob = activityScope.launch {
            while (isActive) {
                delay(15000L) // 15초마다 자동 복구 점검
                val check = withContext(Dispatchers.IO) { ApiClient.checkWebsiteHealth(targetUrl) }
                if (check.isOnline) {
                    TtsManager.speak(this@EmergencyAlarmActivity, "웹사이트 연결이 정상 복구되었습니다.")
                    Toast.makeText(this@EmergencyAlarmActivity, "🎉 웹사이트가 정상 복구되어 알람을 종료합니다.", Toast.LENGTH_LONG).show()
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
