package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.speech.RecognizerIntent
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.TtsManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * 🤖 자연어 음성/텍스트 AI 시트 코파일럿 제어 카드 컨트롤러
 *
 * - 자연어 음성 명령 인식(STT) 구동
 * - 구글 시트 AI 명령 원격 전송 및 Apps Script 실행
 * - 실행 결과(설명, 음성 요약) 표시 및 TTS 음성 피드백
 * - 카드 펼침/접힘 상태 관리
 */
class AiCopilotCardController(
    private val activity: AppCompatActivity,
    private val binding: ActivityMainBinding,
    private val prefs: AppPreferences,
    private val scope: CoroutineScope,
    private val launchSpeechRecognizer: (Intent) -> Unit,
    private val addLogItem: (title: String, detail: String, success: Boolean) -> Unit,
    private val updateCardCollapseState: (layout: View, button: View, isHidden: Boolean) -> Unit
) {

    fun setup() {
        // 자연어 AI 시트 코파일럿 UI 리스너 (v1.7)
        binding.btnVoiceCommand.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(activity, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            startVoiceRecognition()
        }

        binding.btnExecuteCommand.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(activity, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val cmd = binding.etAiCommand.text.toString().trim()
            if (cmd.isBlank()) {
                Toast.makeText(activity, "구글 시트에 내릴 명령을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            executeAiCommand(cmd)
        }
    }

    fun refreshCollapseState() {
        updateCardCollapseState(
            binding.layoutCopilotDetails,
            binding.btnToggleCopilotDetails,
            prefs.isCopilotDetailsHidden
        )
    }

    fun toggleCollapse() {
        prefs.isCopilotDetailsHidden = !prefs.isCopilotDetailsHidden
        refreshCollapseState()
    }

    /**
     * 구글 음성 인식 다이얼로그 호출 (v1.7)
     */
    fun startVoiceRecognition() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "구글 시트에 내릴 명령을 말씀해 주세요...\n(예: 홍길동 고객에게 결제 안내 문자 보내줘)")
        }
        try {
            launchSpeechRecognizer(intent)
        } catch (e: Exception) {
            Toast.makeText(activity, "음성 인식을 지원하지 않는 기기이거나 권한이 필요합니다.", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 자연어 명령을 시트봇 서버로 전송하여 구글 시트 Apps Script 원격 구동 (v1.7)
     */
    fun executeAiCommand(command: String) {
        val userEmail = prefs.userEmail
        if (userEmail.isNullOrBlank()) {
            Toast.makeText(activity, "⚠️ 연동된 계정 이메일이 없습니다.", Toast.LENGTH_LONG).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        binding.layoutAiCommandResult.visibility = View.GONE
        Toast.makeText(activity, "🤖 AI가 시트 명령을 분석하고 원격 실행합니다...", Toast.LENGTH_SHORT).show()

        scope.launch {
            try {
                val res = ApiClient.executeAiCommand(
                    userEmail = userEmail,
                    command = command
                )
                binding.progressBar.visibility = View.GONE

                if (res.success) {
                    binding.layoutAiCommandResult.visibility = View.VISIBLE
                    binding.tvAiCommandExplanation.text = "✅ ${res.explanation}"
                    binding.tvAiCommandSpoken.text = "🗣️ ${res.spokenResult}"

                    Toast.makeText(
                        activity,
                        "🎉 [시트 실행 완료]\n${res.explanation}",
                        Toast.LENGTH_LONG
                    ).show()

                    addLogItem("AI 시트실행", "${res.actionType}: ${res.explanation}", true)

                    if (prefs.isTtsEnabled) {
                        TtsManager.speak(activity, res.spokenResult ?: "명령 처리가 완료되었습니다.")
                    }
                } else {
                    val err = res.error ?: "명령 실행 실패"
                    Toast.makeText(activity, "⚠️ 시트 명령 실행 실패: $err", Toast.LENGTH_LONG).show()
                    addLogItem("시트실행 실패", err, false)
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Toast.makeText(activity, "명령 실행 예외: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
