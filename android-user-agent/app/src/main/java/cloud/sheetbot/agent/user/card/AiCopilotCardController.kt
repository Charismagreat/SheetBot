package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.speech.RecognizerIntent
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.CommandSuggestionItem
import cloud.sheetbot.agent.user.TtsManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 🤖 자연어 음성/텍스트 AI 시트 코파일럿 제어 카드 컨트롤러 (v2.2.6)
 *
 * - 자연어 음성 명령 인식(STT) 구동
 * - 구글 시트 AI 명령 원격 전송 및 Apps Script 실행
 * - 대장 연동 기반 "💡 실행 가능한 추천 명령 칩(Chips)" 동적 렌더링
 * - Apps Script 없이도 시트 데이터 교차 조회/집계(SHEET_QUERY) 및 원클릭 실행
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

    // 기본 선제 렌더링 추천 명령 칩 (Zero-Wait Fallback)
    private val defaultSuggestions = listOf(
        CommandSuggestionItem("def_closing", "APPS_SCRIPT", "⚡ 이번 달 정산 마감", "정산 대장 이번 달 정산 마감 실행해줘"),
        CommandSuggestionItem("def_sales", "SHEET_QUERY", "🔍 고객별 매출 집계", "고객 대장에서 홍길동 매출 건수와 금액 집계해서 알려줘"),
        CommandSuggestionItem("def_unpaid", "SHEET_QUERY", "📢 미수금 거래처 확인", "미수금 남아있는 거래처 목록과 금액 알려줘"),
        CommandSuggestionItem("def_today", "SHEET_QUERY", "📊 오늘 등록 건수", "오늘 시트에 새로 등록된 내역 몇 건인지 알려줘"),
        CommandSuggestionItem("def_sms", "SHEET_QUERY", "📱 최근 문자 확인", "최근 수신된 문자 대장에서 최신 3건 알려줘")
    )

    fun setup() {
        // 1. 기본 추천 명령 칩 선제 렌더링 (0초 즉시 체감)
        renderSuggestionChips(defaultSuggestions)

        // 2. 서버에서 사용자의 실제 연동 대장 및 스크립트 함수 기반 최신 칩 목록 비동기 동기화
        loadCapabilitiesFromServer()

        // 3. 음성 및 텍스트 실행 버튼 리스너
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

    /**
     * 서버에서 실제 등록된 대장 및 스크립트 함수 기반 추천 명령 칩 동기화
     */
    private fun loadCapabilitiesFromServer() {
        val userEmail = prefs.userEmail ?: return
        if (!prefs.isPaired) return

        scope.launch {
            try {
                val res = ApiClient.fetchCommandCapabilities(userEmail)
                if (res.success && res.suggestions.isNotEmpty()) {
                    withContext(Dispatchers.Main) {
                        renderSuggestionChips(res.suggestions)
                    }
                }
            } catch (_: Exception) {
                // 통신 예외 시 기본 칩 유지
            }
        }
    }

    /**
     * 가로 스크롤 추천 명령 칩 렌더링
     */
    private fun renderSuggestionChips(items: List<CommandSuggestionItem>) {
        val container = binding.root.findViewWithTag<LinearLayout>("copilotChipsContainer") ?: return
        container.removeAllViews()

        for (item in items) {
            val chip = TextView(activity).apply {
                text = item.label
                setTextColor(Color.parseColor("#E2E8F0"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER

                val horizontalPadding = dpToPx(10)
                val verticalPadding = dpToPx(6)
                setPadding(horizontalPadding, verticalPadding, horizontalPadding, verticalPadding)

                // 배경 드로어블 (둥근 모서리 + 어두운 슬레이트 배경 + 테두리)
                val isScript = item.type == "APPS_SCRIPT"
                val bgColor = if (isScript) Color.parseColor("#1E1B4B") else Color.parseColor("#0F172A")
                val strokeColor = if (isScript) Color.parseColor("#6366F1") else Color.parseColor("#334155")

                val drawable = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(14).toFloat()
                    setColor(bgColor)
                    setStroke(dpToPx(1), strokeColor)
                }
                background = drawable

                val params = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = dpToPx(6)
                }
                layoutParams = params

                // 클릭 시: 입력창 자동 세팅 및 즉시 실행 안내
                setOnClickListener {
                    binding.etAiCommand.setText(item.command)
                    binding.etAiCommand.setSelection(item.command.length)
                    Toast.makeText(activity, "💡 [${item.label}] 명령이 입력되었습니다.\n'🚀 바로 실행'을 누르면 즉시 구동됩니다.", Toast.LENGTH_SHORT).show()
                }
            }
            container.addView(chip)
        }
    }

    private fun dpToPx(dp: Int): Int {
        val density = activity.resources.displayMetrics.density
        return (dp * density).toInt()
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
            putExtra(RecognizerIntent.EXTRA_PROMPT, "구글 시트에 내릴 명령을 말씀해 주세요...\n(예: 홍길동 매출 집계해줘, 이번 달 정산 마감해줘)")
        }
        try {
            launchSpeechRecognizer(intent)
        } catch (e: Exception) {
            Toast.makeText(activity, "음성 인식을 지원하지 않는 기기이거나 권한이 필요합니다.", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 자연어 명령을 시트봇 서버로 전송하여 구글 시트 Apps Script 또는 시트 질의(SHEET_QUERY) 실행 (v2.2.6)
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
                        "🎉 [시트 명령 완료]\n${res.explanation}",
                        Toast.LENGTH_LONG
                    ).show()

                    addLogItem("AI 시트실행", "${res.actionType}: ${res.explanation}", true)

                    if (prefs.isTtsEnabled) {
                        TtsManager.speak(activity, res.spokenResult ?: "명령 처리가 완료되었습니다.")
                    }
                } else {
                    val err = res.error ?: "명령 실행 실패"
                    Toast.makeText(activity, "⚠️ 시트 명령 실행 안내: $err", Toast.LENGTH_LONG).show()
                    addLogItem("시트실행 실패", err, false)
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Toast.makeText(activity, "명령 실행 예외: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
