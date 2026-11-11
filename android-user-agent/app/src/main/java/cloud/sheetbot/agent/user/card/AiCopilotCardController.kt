package cloud.sheetbot.agent.user.card

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.speech.RecognizerIntent
import android.text.Editable
import android.text.SpannableString
import android.text.Spanned
import android.text.TextUtils
import android.text.TextWatcher
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.CommandSuggestionItem
import cloud.sheetbot.agent.user.FileToSheetClient
import cloud.sheetbot.agent.user.FtsSearchMatchedRow
import cloud.sheetbot.agent.user.FtsSheetViewerActivity
import cloud.sheetbot.agent.user.SmsSenderUtil
import cloud.sheetbot.agent.user.TtsManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 🤖 자연어 음성/텍스트 AI 비서 & 파투(FileToSheet) 전 프로젝트·전 시트 통합 검색 컨트롤러 (v2.4.50)
 *
 * - 파투(FileToSheet) 내 모든 프로젝트(일반 프로젝트 + 시트봇 연동 장부) 및 하위 모든 시트에 대한 자연어 통합 검색
 * - 검색어 하이라이트, 출처 프로젝트·시트 필터 칩, 가독성 높은 미니 카드 리스트 렌더링
 * - 카드 터치 시 전체 컬럼 상세 보기, 원터치 승인/보류/반려 결재, 전화/문자(장문 MMS 자동 전환), 해당 시트 즉시 이동 지원
 * - 구글 시트 AI 명령 원격 전송, 할 일 등록, 문자 발송 및 Apps Script 실행 통합 지원
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

    companion object {
        private const val SHOW_SUGGESTION_CHIPS = true
    }

    // 파투 통합 자연어 검색 & AI 비서 추천 칩
    private val defaultSuggestions = listOf(
        CommandSuggestionItem("fts_today", "SHEET_QUERY", "🔍 오늘 들어온 내역", "오늘 새로 등록된 내역 전체 찾아줘"),
        CommandSuggestionItem("fts_pending", "SHEET_QUERY", "⏳ 미결재(대기중) 조회", "파투에서 승인 대기중인 미결재 내역 찾아줘"),
        CommandSuggestionItem("fts_call_sms", "SHEET_QUERY", "📞 최근 통화·문자 검색", "통화녹음과 문자에서 최근 중요 내역 찾아줘"),
        CommandSuggestionItem("fts_receipt", "SHEET_QUERY", "🧾 이번 달 영수증 합계", "이번 달 영수증 지출 내역과 합계 금액 알려줘"),
        CommandSuggestionItem("fts_contact", "SHEET_QUERY", "🪪 연락처·명함 찾기", "명함관리와 연락처에서 최근 등록된 거래처 찾아줘"),
        CommandSuggestionItem("fts_task_add", "SHEET_WRITE", "➕ 할 일 빠른 등록", "내일 오후 3시 거래처 확인 할일 추가해줘")
    )

    private var currentMatchedRows: List<FtsSearchMatchedRow> = emptyList()
    private var currentSearchKeywords: List<String> = emptyList()
    private var selectedSheetFilterKey: String = "ALL" // "ALL" or "projectName::sheetName"

    fun setup() {
        val chipsSection = binding.root.findViewWithTag<View>("copilotChipsSection")
        if (SHOW_SUGGESTION_CHIPS) {
            chipsSection?.visibility = View.VISIBLE
            renderSuggestionChips(defaultSuggestions)
            loadCapabilitiesFromServer()
        } else {
            chipsSection?.visibility = View.GONE
        }

        // 음성 및 텍스트 검색·실행 버튼 리스너
        binding.btnVoiceCommand.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(activity, "먼저 파투(휴대폰 번호) 또는 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            startVoiceRecognition()
        }

        binding.btnExecuteCommand.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(activity, "먼저 파투(휴대폰 번호) 또는 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val cmd = binding.etAiCommand.text.toString().trim()
            if (cmd.isBlank()) {
                Toast.makeText(activity, "파투에서 검색할 내용이나 실행할 명령을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            executeAiCommand(cmd)
        }

        // 🕒 최근 검색어 & ⭐ 고정 즐겨찾기 히스토리 바 초기화
        setupRecentSearchHistoryBar()
    }

    /**
     * 최근 검색어 및 즐겨찾기(⭐ 고정) 버튼 이벤트 바인딩 및 초기 렌더링
     */
    private fun setupRecentSearchHistoryBar() {
        val btnPinCurrent = binding.root.findViewWithTag<TextView>("btnPinCurrentQuery")
        val btnClearRecent = binding.root.findViewWithTag<TextView>("btnClearRecentHistory")

        btnPinCurrent?.setOnClickListener {
            val currentInput = binding.etAiCommand.text?.toString()?.trim() ?: ""
            if (currentInput.isBlank()) {
                Toast.makeText(
                    activity,
                    "💡 먼저 입력창에 자주 쓰는 거래처명이나 검색어를 입력하거나, 아래 최근 검색 칩의 [☆] 아이콘을 터치해 고정해 보세요.",
                    Toast.LENGTH_SHORT
                ).show()
                return@setOnClickListener
            }
            val isNowPinned = prefs.togglePinCopilotSearchHistory(currentInput)
            renderRecentSearchHistory()
            val msg = if (isNowPinned) {
                "⭐ [$currentInput] 검색어가 즐겨찾기에 고정되었습니다!"
            } else {
                "[$currentInput] 즐겨찾기 고정이 해제되었습니다."
            }
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
        }

        btnClearRecent?.setOnClickListener {
            prefs.clearUnpinnedCopilotSearchHistory()
            renderRecentSearchHistory()
            Toast.makeText(activity, "🕒 고정된(⭐) 항목을 제외한 최근 검색 기록을 정리했습니다.", Toast.LENGTH_SHORT).show()
        }

        renderRecentSearchHistory()
    }

    /**
     * 최근 검색어(🕒) 및 즐겨찾기 고정(⭐) 칩 리스트 렌더링
     * - [⭐/☆] 터치: 고정/해제 토글
     * - 검색어 텍스트 터치: 1초 즉시 재검색 실행
     * - [✕] 터치: 개별 항목 삭제
     */
    fun renderRecentSearchHistory() {
        val container = binding.root.findViewWithTag<LinearLayout>("copilotRecentHistoryContainer") ?: return
        val tvHeader = binding.root.findViewWithTag<TextView>("tvCopilotHistoryHeader")
        val btnClearRecent = binding.root.findViewWithTag<TextView>("btnClearRecentHistory")

        container.removeAllViews()
        val items = prefs.getCopilotSearchHistory()
        val pinnedCount = items.count { it.isPinned }
        val unpinnedCount = items.count { !it.isPinned }

        if (items.isEmpty()) {
            tvHeader?.text = "🕒 최근 검색 & ⭐ 고정 질문"
            btnClearRecent?.visibility = View.GONE

            val emptyTv = TextView(activity).apply {
                text = "💡 검색한 거래처명이나 질문이 자동 기록되며, [☆]를 누르면 상단에 고정됩니다."
                setTextColor(Color.parseColor("#64748B"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
                setPadding(dpToPx(4), dpToPx(2), dpToPx(4), dpToPx(2))
            }
            container.addView(emptyTv)
            return
        }

        tvHeader?.text = if (pinnedCount > 0) {
            "⭐ 고정 ${pinnedCount} · 🕒 최근 ${unpinnedCount} (터치 시 1초 재검색)"
        } else {
            "🕒 최근 검색 (${unpinnedCount}건 · ☆ 터치 시 상단 고정)"
        }
        btnClearRecent?.visibility = if (unpinnedCount > 0) View.VISIBLE else View.GONE

        for (item in items) {
            val isPinned = item.isPinned
            val bgColor = if (isPinned) Color.parseColor("#1E1B4B") else Color.parseColor("#1E293B")
            val strokeColor = if (isPinned) Color.parseColor("#F59E0B") else Color.parseColor("#334155")

            val chipLayout = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dpToPx(8), dpToPx(4), dpToPx(6), dpToPx(4))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(14).toFloat()
                    setColor(bgColor)
                    setStroke(dpToPx(1), strokeColor)
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = dpToPx(6)
                }
            }

            // 1. [⭐ / ☆] 고정 토글 버튼
            val btnPinToggle = TextView(activity).apply {
                text = if (isPinned) "⭐" else "🕒 ☆"
                setTextColor(if (isPinned) Color.parseColor("#FACC15") else Color.parseColor("#94A3B8"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dpToPx(2), dpToPx(2), dpToPx(6), dpToPx(2))
                setOnClickListener {
                    val nowPinned = prefs.togglePinCopilotSearchHistory(item.query)
                    renderRecentSearchHistory()
                    val toastMsg = if (nowPinned) {
                        "⭐ [${item.query}] 자주 쓰는 검색어로 고정되었습니다!"
                    } else {
                        "[${item.query}] 고정이 해제되었습니다."
                    }
                    Toast.makeText(activity, toastMsg, Toast.LENGTH_SHORT).show()
                }
            }

            // 2. 검색어 텍스트 (터치 시 즉시 검색 실행, 길게 누르면 고정 토글)
            val tvQuery = TextView(activity).apply {
                val displayQuery = if (item.query.length > 22) "${item.query.take(22)}…" else item.query
                text = displayQuery
                setTextColor(if (isPinned) Color.parseColor("#FEF08A") else Color.parseColor("#F1F5F9"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
                typeface = if (isPinned) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
                setPadding(0, dpToPx(2), dpToPx(6), dpToPx(2))
                setOnClickListener {
                    binding.etAiCommand.setText(item.query)
                    binding.etAiCommand.setSelection(item.query.length)
                    if (!prefs.isPaired) {
                        Toast.makeText(activity, "먼저 파투(휴대폰 번호) 또는 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    executeAiCommand(item.query)
                }
                setOnLongClickListener {
                    val nowPinned = prefs.togglePinCopilotSearchHistory(item.query)
                    renderRecentSearchHistory()
                    val toastMsg = if (nowPinned) {
                        "⭐ [${item.query}] 자주 쓰는 검색어로 고정되었습니다!"
                    } else {
                        "[${item.query}] 고정이 해제되었습니다."
                    }
                    Toast.makeText(activity, toastMsg, Toast.LENGTH_SHORT).show()
                    true
                }
            }

            // 3. [✕] 개별 삭제 버튼
            val btnDelete = TextView(activity).apply {
                text = "✕"
                setTextColor(Color.parseColor("#64748B"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dpToPx(4), dpToPx(2), dpToPx(2), dpToPx(2))
                setOnClickListener {
                    prefs.removeCopilotSearchHistory(item.query)
                    renderRecentSearchHistory()
                }
            }

            chipLayout.addView(btnPinToggle)
            chipLayout.addView(tvQuery)
            chipLayout.addView(btnDelete)
            container.addView(chipLayout)
        }
    }

    /**
     * 서버에서 실제 등록된 대장 및 스크립트 함수 기반 추천 명령 칩 동기화
     */
    private fun loadCapabilitiesFromServer() {
        if (!SHOW_SUGGESTION_CHIPS) return
        val userEmail = prefs.userEmail ?: return
        if (!prefs.isPaired) return

        scope.launch {
            try {
                val res = ApiClient.fetchCommandCapabilities(userEmail)
                if (res.success && res.suggestions.isNotEmpty()) {
                    val merged = (defaultSuggestions.take(4) + res.suggestions).distinctBy { it.label }
                    withContext(Dispatchers.Main) {
                        renderSuggestionChips(merged)
                    }
                }
            } catch (_: Exception) {
                // 통신 예외 시 기본 파투 검색 칩 유지
            }
        }
    }

    /**
     * 가로 스크롤 추천 검색·명령 칩 렌더링
     */
    private fun renderSuggestionChips(items: List<CommandSuggestionItem>) {
        val container = binding.root.findViewWithTag<LinearLayout>("copilotChipsContainer") ?: return
        container.removeAllViews()

        for (item in items) {
            val chip = TextView(activity).apply {
                text = item.label
                setTextColor(Color.parseColor("#E2E8F0"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER

                val horizontalPadding = dpToPx(10)
                val verticalPadding = dpToPx(6)
                setPadding(horizontalPadding, verticalPadding, horizontalPadding, verticalPadding)

                val isScript = item.type == "APPS_SCRIPT"
                val bgColor = if (isScript) Color.parseColor("#1E1B4B") else Color.parseColor("#0F172A")
                val strokeColor = if (isScript) Color.parseColor("#6366F1") else Color.parseColor("#334155")

                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(14).toFloat()
                    setColor(bgColor)
                    setStroke(dpToPx(1), strokeColor)
                }

                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = dpToPx(6)
                }

                setOnClickListener {
                    binding.etAiCommand.setText(item.command)
                    binding.etAiCommand.setSelection(item.command.length)
                    if (item.type == "SHEET_QUERY" && prefs.isPaired) {
                        executeAiCommand(item.command)
                    } else {
                        Toast.makeText(
                            activity,
                            "💡 [${item.label}] 예시가 입력되었습니다.\n내용을 수정하거나 '🔍 AI 검색 · 실행'을 눌러주세요.",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
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
     * 구글 음성 인식 다이얼로그 호출
     */
    fun startVoiceRecognition() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR")
            putExtra(
                RecognizerIntent.EXTRA_PROMPT,
                "파투 통합 검색어나 시트 명령을 말씀해 주세요...\n(예: 국민건강보험공단 내역 찾아줘, 이번 달 영수증 합계 알려줘)"
            )
        }
        try {
            launchSpeechRecognizer(intent)
        } catch (e: Exception) {
            Toast.makeText(activity, "음성 인식을 지원하지 않는 기기이거나 권한이 필요합니다.", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 자연어 질문/명령을 실행하여 파투(FileToSheet) 전체 프로젝트·시트 자연어 검색 및 AI 비서 작업 수행
     */
    fun executeAiCommand(command: String) {
        val userEmail = prefs.userEmail ?: ""
        val ftsPhone = prefs.ftsPhoneNumber ?: ""
        val ftsProjectId = prefs.ftsProjectId ?: ""
        val ftsToken = prefs.ftsToken ?: ""

        if (userEmail.isBlank() && ftsPhone.isBlank() && ftsProjectId.isBlank() && ftsToken.isBlank()) {
            Toast.makeText(activity, "⚠️ 연동된 계정(파투 휴대폰 번호 또는 구글 이메일)이 없습니다.", Toast.LENGTH_LONG).show()
            return
        }

        // 최근 검색어 히스토리에 즉시 보존 및 칩 바 갱신
        prefs.addCopilotSearchHistory(command)
        renderRecentSearchHistory()

        binding.layoutAiCommandResult.visibility = View.GONE
        val searchContainer = binding.root.findViewWithTag<LinearLayout>("layoutAiSearchResultsContainer")
        searchContainer?.removeAllViews()
        searchContainer?.visibility = View.GONE

        CardInlineLoadingHelper.show(
            container = binding.layoutCopilotDetails,
            message = "🔍 파투 전체 프로젝트·시트 검색 및 AI 분석 중...",
            triggerButton = binding.btnExecuteCommand,
            loadingButtonText = "⏳ AI 검색 중..."
        )

        scope.launch {
            try {
                // 1. 서버 AI 비서/통합검색 API와 로컬 파투 다이렉트 전체 프로젝트 스캔을 병렬 구동
                val serverDeferred = async {
                    ApiClient.executeAiCommand(
                        userEmail = userEmail,
                        command = command,
                        phoneNumber = ftsPhone.takeIf { it.isNotBlank() },
                        projectId = ftsProjectId.takeIf { it.isNotBlank() },
                        token = ftsToken.takeIf { it.isNotBlank() }
                    )
                }
                val localSearchDeferred = async {
                    if (ftsPhone.isNotBlank() || ftsProjectId.isNotBlank()) {
                        FileToSheetClient.searchAcrossAllWorkspaceProjects(
                            phoneNumber = ftsPhone,
                            projectIdHint = ftsProjectId,
                            rawQuery = command
                        )
                    } else {
                        null
                    }
                }

                val res = serverDeferred.await()
                var localRes = localSearchDeferred.await()

                // 서버가 추출한 정밀 키워드가 있고 로컬 검색을 보강할 수 있는 경우 캐시 기반 즉시 재검색
                if (res.success && res.queryKeywords.isNotEmpty() && (ftsPhone.isNotBlank() || ftsProjectId.isNotBlank())) {
                    val refinedLocal = FileToSheetClient.searchAcrossAllWorkspaceProjects(
                        phoneNumber = ftsPhone,
                        projectIdHint = ftsProjectId,
                        rawQuery = command,
                        serverKeywordsHint = res.queryKeywords
                    )
                    if (refinedLocal.success && refinedLocal.matchedRows.isNotEmpty()) {
                        localRes = refinedLocal
                    }
                }

                CardInlineLoadingHelper.hide(binding.layoutCopilotDetails, binding.btnExecuteCommand)

                // 쓰기/문자 발송 명령이 아닌 경우 매칭된 행 병합 (서버 결과 우선 + 로컬 전체 프로젝트 스캔 보완)
                val isSearchOrQuery = res.actionType == "SHEET_QUERY" || res.actionType == "GENERAL_ASSIST" || !res.success
                val mergedRows = when {
                    res.matchedRows.isNotEmpty() -> res.matchedRows
                    isSearchOrQuery && localRes != null && localRes.matchedRows.isNotEmpty() -> localRes.matchedRows
                    else -> emptyList()
                }
                val mergedKeywords = when {
                    res.queryKeywords.isNotEmpty() -> res.queryKeywords
                    localRes != null && localRes.keywords.isNotEmpty() -> localRes.keywords
                    else -> extractFallbackKeywords(command)
                }

                if (res.success || mergedRows.isNotEmpty()) {
                    binding.layoutAiCommandResult.visibility = View.VISIBLE

                    val finalExplanation = when {
                        res.success && !res.explanation.isNullOrBlank() -> res.explanation
                        localRes != null && localRes.summaryText.isNotBlank() -> localRes.summaryText
                        else -> "파투 통합 검색을 완료했습니다."
                    }
                    val finalSpoken = when {
                        res.success && !res.spokenResult.isNullOrBlank() -> res.spokenResult
                        localRes != null && localRes.spokenText.isNotBlank() -> localRes.spokenText
                        else -> "검색이 완료되었습니다."
                    }

                    binding.tvAiCommandExplanation.text = "✅ $finalExplanation"
                    binding.tvAiCommandSpoken.text = "🗣️ $finalSpoken"

                    // 매칭된 파투 행 데이터가 있으면 가독성 높은 카드 리스트 렌더링
                    currentMatchedRows = mergedRows
                    currentSearchKeywords = mergedKeywords
                    selectedSheetFilterKey = "ALL"
                    renderMatchedSearchResults()

                    // 💾 1회성 작업을 구글 시트 상단 메뉴로 영구 저장(승격) 버튼 제어
                    val btnPromote = binding.root.findViewWithTag<Button>("btnPromoteCommand")
                    if (res.canPromote && !res.spreadsheetId.isNullOrBlank() && userEmail.isNotBlank() && mergedRows.isEmpty()) {
                        btnPromote?.visibility = View.VISIBLE
                        btnPromote?.isEnabled = true
                        val title = res.suggestedFunctionTitle ?: "이 기능"
                        btnPromote?.text = "💾 [$title] 시트 메뉴로 영구 저장"
                        btnPromote?.setOnClickListener {
                            promoteCommand(command, res.spreadsheetId, title, btnPromote)
                        }
                    } else {
                        btnPromote?.visibility = View.GONE
                    }

                    addLogItem(
                        if (mergedRows.isNotEmpty()) "파투 AI 검색" else "AI 시트실행",
                        finalExplanation,
                        true
                    )

                    if (prefs.isTtsEnabled) {
                        TtsManager.speak(activity, finalSpoken)
                    }
                } else {
                    val err = res.error ?: "일치하는 내역을 찾지 못했거나 명령 실행에 실패했습니다."
                    Toast.makeText(activity, "⚠️ 안내: $err", Toast.LENGTH_LONG).show()
                    addLogItem("AI 검색/실행 실패", err, false)
                }
            } catch (e: Exception) {
                CardInlineLoadingHelper.hide(binding.layoutCopilotDetails, binding.btnExecuteCommand)
                Toast.makeText(activity, "검색/실행 중 오류: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun extractFallbackKeywords(rawQuery: String): List<String> {
        val stopWords = setOf(
            "파투", "파일투시트", "시트", "프로젝트", "대장", "장부", "내역", "목록", "리스트",
            "찾아줘", "보여줘", "알려줘", "검색해줘", "검색", "조회해줘", "조회", "확인해줘", "확인",
            "전체", "모두", "다", "관련", "최근", "최신", "오늘", "어제", "이번달", "이번", "달"
        )
        return rawQuery
            .replace(Regex("(찾아줘|보여줘|알려줘|검색해줘|조회해줘|확인해줘|에서|관련|내역|목록|시트|파투)"), " ")
            .split(Regex("[\\s,·/()]+"))
            .map { it.trim().replace(Regex("(은|는|이|가|을|를|의|에|로|으로|랑|하고)$"), "") }
            .filter { it.length >= 2 && it !in stopWords }
            .distinct()
    }

    /**
     * 검색 키워드를 노란색/하늘색으로 하이라이트 처리한 SpannableString 생성
     */
    private fun highlightKeywords(text: String, keywords: List<String>): CharSequence {
        if (text.isBlank() || keywords.isEmpty()) return text
        val spannable = SpannableString(text)
        val lowerText = text.lowercase()
        for (kw in keywords) {
            val cleanKw = kw.trim().lowercase()
            if (cleanKw.length < 2) continue
            var startIdx = lowerText.indexOf(cleanKw)
            while (startIdx >= 0) {
                val endIdx = (startIdx + cleanKw.length).coerceAtMost(text.length)
                spannable.setSpan(
                    ForegroundColorSpan(Color.parseColor("#FDE047")),
                    startIdx,
                    endIdx,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                )
                spannable.setSpan(
                    BackgroundColorSpan(Color.parseColor("#422006")),
                    startIdx,
                    endIdx,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                )
                spannable.setSpan(
                    StyleSpan(Typeface.BOLD),
                    startIdx,
                    endIdx,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                )
                startIdx = lowerText.indexOf(cleanKw, endIdx)
            }
        }
        return spannable
    }

    /**
     * 🔍 파투 전 프로젝트·전 시트 검색 결과를 가독성 높은 필터 칩 + 미니 카드 리스트로 렌더링합니다.
     */
    private fun renderMatchedSearchResults() {
        val container = binding.root.findViewWithTag<LinearLayout>("layoutAiSearchResultsContainer") ?: return
        container.removeAllViews()

        if (currentMatchedRows.isEmpty()) {
            container.visibility = View.GONE
            return
        }
        container.visibility = View.VISIBLE

        val sheetGroups = currentMatchedRows.groupBy { "${it.projectName}::${it.sheetName}" }
        val projCount = currentMatchedRows.map { it.projectId.ifBlank { it.projectName } }.distinct().size
        val sheetCount = sheetGroups.size

        // 1. 상단 구분선
        val divider = View(activity).apply {
            setBackgroundColor(Color.parseColor("#1E293B"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dpToPx(1)
            ).apply {
                bottomMargin = dpToPx(8)
            }
        }
        container.addView(divider)

        // 2. 검색 결과 헤더 바 (총 건수 + 결과 지우기 버튼)
        val headerRow = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dpToPx(6)
            }
        }

        val tvHeaderTitle = TextView(activity).apply {
            text = "📊 검색된 파투 데이터 (${projCount}개 프로젝트 · ${sheetCount}개 시트 · ${currentMatchedRows.size}건)"
            setTextColor(Color.parseColor("#38BDF8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
            typeface = Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(tvHeaderTitle)

        val btnClearResults = TextView(activity).apply {
            text = "✕ 닫기"
            setTextColor(Color.parseColor("#94A3B8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
            setPadding(dpToPx(8), dpToPx(3), dpToPx(8), dpToPx(3))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dpToPx(8).toFloat()
                setColor(Color.parseColor("#1E293B"))
            }
            setOnClickListener {
                binding.layoutAiCommandResult.visibility = View.GONE
                currentMatchedRows = emptyList()
            }
        }
        headerRow.addView(btnClearResults)
        container.addView(headerRow)

        // 3. 프로젝트·시트별 필터 칩 가로 스크롤 바 (2개 이상 시트에서 검색된 경우 또는 항상 표시)
        val chipScroll = HorizontalScrollView(activity).apply {
            isHorizontalScrollBarEnabled = false
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dpToPx(8)
            }
        }
        val chipRow = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
        }

        fun addFilterChip(key: String, label: String) {
            val isSelected = selectedSheetFilterKey == key
            val chip = TextView(activity).apply {
                text = label
                setTextColor(Color.parseColor(if (isSelected) "#FFFFFF" else "#CBD5E1"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                typeface = if (isSelected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
                setPadding(dpToPx(10), dpToPx(5), dpToPx(10), dpToPx(5))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(12).toFloat()
                    setColor(Color.parseColor(if (isSelected) "#2563EB" else "#1E293B"))
                    setStroke(dpToPx(1), Color.parseColor(if (isSelected) "#60A5FA" else "#334155"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = dpToPx(6)
                }
                setOnClickListener {
                    selectedSheetFilterKey = key
                    renderMatchedSearchResults()
                }
            }
            chipRow.addView(chip)
        }

        addFilterChip("ALL", "전체 (${currentMatchedRows.size})")
        for ((groupKey, list) in sheetGroups) {
            val first = list.first()
            val shortProj = if (first.projectName == "시트봇 연동 장부") "" else "${first.projectName} ▸ "
            addFilterChip(groupKey, "$shortProj${first.sheetName} (${list.size})")
        }
        chipScroll.addView(chipRow)
        container.addView(chipScroll)

        // 4. 선택된 시트 필터에 해당하는 매칭 행 미니 카드 리스트 렌더링
        val filteredList = if (selectedSheetFilterKey == "ALL") {
            currentMatchedRows
        } else {
            currentMatchedRows.filter { "${it.projectName}::${it.sheetName}" == selectedSheetFilterKey }
        }

        for (item in filteredList) {
            container.addView(buildMatchedRowCardView(item))
        }
    }

    /**
     * 개별 매칭 행 데이터를 가독성 높은 다크 슬레이트 미니 카드로 생성합니다.
     */
    private fun buildMatchedRowCardView(item: FtsSearchMatchedRow): View {
        val card = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dpToPx(12), dpToPx(10), dpToPx(12), dpToPx(10))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dpToPx(10).toFloat()
                setColor(Color.parseColor("#1E293B"))
                setStroke(dpToPx(1), Color.parseColor("#334155"))
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dpToPx(8)
            }
            isClickable = true
            isFocusable = true
            setOnClickListener {
                showMatchedRowDetailBottomSheet(item, focusSms = false)
            }
        }

        // [상단 바] 출처(프로젝트 ▸ 시트) 뱃지 + 결재 상태 뱃지 + 일시/행번호
        val topRow = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dpToPx(6)
            }
        }

        val tvSourceBadge = TextView(activity).apply {
            val projPrefix = if (item.projectName.isNotBlank() && item.projectName != "시트봇 연동 장부") {
                "📁 ${item.projectName} ▸ "
            } else {
                "📊 "
            }
            text = "$projPrefix${item.sheetName}"
            setTextColor(Color.parseColor("#A5B4FC"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dpToPx(7), dpToPx(2), dpToPx(7), dpToPx(2))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dpToPx(6).toFloat()
                setColor(Color.parseColor("#312E81"))
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                marginEnd = dpToPx(6)
            }
        }
        topRow.addView(tvSourceBadge)

        val (statusLabel, statusBg, statusFg) = when (item.approvalStatus.uppercase()) {
            "APPROVED" -> Triple("승인", "#064E3B", "#34D399")
            "HELD" -> Triple("보류", "#78350F", "#FBBF24")
            "REJECTED" -> Triple("반려", "#881337", "#FB7185")
            else -> Triple("대기", "#334155", "#CBD5E1")
        }
        val tvStatusBadge = TextView(activity).apply {
            text = statusLabel
            setTextColor(Color.parseColor(statusFg))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dpToPx(6), dpToPx(2), dpToPx(6), dpToPx(2))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dpToPx(6).toFloat()
                setColor(Color.parseColor(statusBg))
            }
        }
        topRow.addView(tvStatusBadge)

        val tvRightMeta = TextView(activity).apply {
            val shortTs = formatShortTimestamp(item.timestampText)
            text = if (shortTs.isNotBlank()) "$shortTs · #${item.rowNumber}" else "#${item.rowNumber}"
            setTextColor(Color.parseColor("#94A3B8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
            gravity = Gravity.END
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        topRow.addView(tvRightMeta)
        card.addView(topRow)

        // [중단 1] 대표 제목 + 금액 뱃지
        val titleRow = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val tvTitle = TextView(activity).apply {
            text = highlightKeywords(item.primaryTitle, currentSearchKeywords)
            setTextColor(Color.parseColor("#F8FAFC"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
            typeface = Typeface.DEFAULT_BOLD
            maxLines = 2
            ellipsize = TextUtils.TruncateAt.END
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        titleRow.addView(tvTitle)

        if (item.amountText.isNotBlank()) {
            val formattedAmt = if (item.amountText.endsWith("원")) item.amountText else "${item.amountText}원"
            val tvAmount = TextView(activity).apply {
                text = formattedAmt
                setTextColor(Color.parseColor("#34D399"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dpToPx(8), dpToPx(2), dpToPx(8), dpToPx(2))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(6).toFloat()
                    setColor(Color.parseColor("#064E3B"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginStart = dpToPx(6)
                }
            }
            titleRow.addView(tvAmount)
        }
        card.addView(titleRow)

        // [중단 2] 핵심 본문 요약 (primarySubtitle)
        if (item.primarySubtitle.isNotBlank()) {
            val tvSubtitle = TextView(activity).apply {
                text = highlightKeywords(item.primarySubtitle, currentSearchKeywords)
                setTextColor(Color.parseColor("#E2E8F0"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                setLineSpacing(dpToPx(2).toFloat(), 1f)
                maxLines = 3
                ellipsize = TextUtils.TruncateAt.END
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    topMargin = dpToPx(4)
                }
            }
            card.addView(tvSubtitle)
        }

        // [중단 3] 주요 필드 태그 (최대 3개 요약 표시)
        if (item.matchedFields.isNotEmpty()) {
            val fieldsSummary = item.matchedFields.take(3).joinToString("  ·  ") { "${it.first}: ${it.second}" }
            val tvFields = TextView(activity).apply {
                text = highlightKeywords(fieldsSummary, currentSearchKeywords)
                setTextColor(Color.parseColor("#94A3B8"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                maxLines = 2
                ellipsize = TextUtils.TruncateAt.END
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    topMargin = dpToPx(4)
                }
            }
            card.addView(tvFields)
        }

        // [하단 바] 원터치 퀵 액션 버튼들 (🔍 상세/결재 | 📊 시트 열기 | 📞 전화 | 💬 문자)
        val actionRow = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dpToPx(8)
            }
        }

        fun makeActionChip(label: String, bgHex: String, fgHex: String, onClick: () -> Unit): TextView {
            return TextView(activity).apply {
                text = label
                setTextColor(Color.parseColor(fgHex))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                setPadding(dpToPx(9), dpToPx(5), dpToPx(9), dpToPx(5))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(7).toFloat()
                    setColor(Color.parseColor(bgHex))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = dpToPx(6)
                }
                setOnClickListener { onClick() }
            }
        }

        actionRow.addView(
            makeActionChip("🔍 상세·결재", "#334155", "#F8FAFC") {
                showMatchedRowDetailBottomSheet(item, focusSms = false)
            }
        )

        actionRow.addView(
            makeActionChip("📊 시트 이동", "#1E3A8A", "#93C5FD") {
                openFtsSheetViewer(item)
            }
        )

        if (item.phoneNumber.isNotBlank()) {
            actionRow.addView(
                makeActionChip("📞 전화", "#064E3B", "#6EE7B7") {
                    openDialer(item.phoneNumber)
                }
            )
            actionRow.addView(
                makeActionChip("💬 문자", "#312E81", "#C7D2FE") {
                    showMatchedRowDetailBottomSheet(item, focusSms = true)
                }
            )
        }

        card.addView(actionRow)
        return card
    }

    private fun formatShortTimestamp(raw: String): String {
        val clean = raw.trim()
        if (clean.isEmpty()) return ""
        // 2026-11-11 15:46:12 -> 11/11 15:46
        val m = Regex("""\d{4}-(\d{2})-(\d{2})\s+(\d{2}:\d{2})""").find(clean)
        if (m != null) {
            return "${m.groupValues[1]}/${m.groupValues[2]} ${m.groupValues[3]}"
        }
        return if (clean.length > 16) clean.take(16) else clean
    }

    private fun openDialer(phone: String) {
        val clean = phone.replace(Regex("[^0-9+]"), "")
        if (clean.isBlank()) return
        try {
            activity.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$clean")))
        } catch (e: Exception) {
            Toast.makeText(activity, "전화 앱을 열 수 없습니다.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun openFtsSheetViewer(item: FtsSearchMatchedRow) {
        try {
            val intent = Intent(activity, FtsSheetViewerActivity::class.java).apply {
                if (item.projectId.isNotBlank()) putExtra(FtsSheetViewerActivity.EXTRA_PROJECT_ID, item.projectId)
                if (item.sheetName.isNotBlank()) putExtra(FtsSheetViewerActivity.EXTRA_SHEET_NAME, item.sheetName)
                prefs.ftsPhoneNumber?.takeIf { it.isNotBlank() }?.let {
                    putExtra(FtsSheetViewerActivity.EXTRA_PHONE_NUMBER, it)
                }
                val kw = currentSearchKeywords.firstOrNull().orEmpty()
                if (kw.isNotBlank()) {
                    putExtra(FtsSheetViewerActivity.EXTRA_INITIAL_SEARCH_QUERY, kw)
                }
            }
            activity.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(activity, "시트 뷰어를 열 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 🔍 검색 결과 행을 터치했을 때 전체 컬럼 상세 보기 + 원터치 결재(승인/보류/반려) + 빠른 문자(SMS/MMS 자동전환) 발송 바텀시트
     */
    private fun showMatchedRowDetailBottomSheet(item: FtsSearchMatchedRow, focusSms: Boolean = false) {
        val dialog = BottomSheetDialog(activity)
        val rootScroll = ScrollView(activity).apply {
            setBackgroundColor(Color.parseColor("#0F172A"))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        val container = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dpToPx(16), dpToPx(16), dpToPx(16), dpToPx(24))
        }

        // 1. 상단 헤더 (프로젝트 ▸ 시트명 #행번호 + 시트 열기 버튼)
        val headerRow = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dpToPx(10)
            }
        }

        val tvSheetTitle = TextView(activity).apply {
            text = "📁 ${item.projectName} ▸ 📊 ${item.sheetName} (#${item.rowNumber})"
            setTextColor(Color.parseColor("#38BDF8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            typeface = Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(tvSheetTitle)

        val btnJumpSheet = TextView(activity).apply {
            text = "📊 시트 열기 ↗"
            setTextColor(Color.parseColor("#93C5FD"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dpToPx(10), dpToPx(5), dpToPx(10), dpToPx(5))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dpToPx(8).toFloat()
                setColor(Color.parseColor("#1E3A8A"))
            }
            setOnClickListener {
                dialog.dismiss()
                openFtsSheetViewer(item)
            }
        }
        headerRow.addView(btnJumpSheet)
        container.addView(headerRow)

        // 2. 원터치 결재(승인/보류/반려) 컨트롤 바
        if (item.projectId.isNotBlank() && item.sheetName.isNotBlank()) {
            val approvalRow = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dpToPx(10), dpToPx(8), dpToPx(10), dpToPx(8))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(8).toFloat()
                    setColor(Color.parseColor("#1E293B"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dpToPx(12)
                }
            }

            val tvApprovalLabel = TextView(activity).apply {
                text = "결재 상태 변경:"
                setTextColor(Color.parseColor("#94A3B8"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
                typeface = Typeface.DEFAULT_BOLD
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            approvalRow.addView(tvApprovalLabel)

            fun addApprovalBtn(label: String, statusCode: String, bgHex: String) {
                val btn = TextView(activity).apply {
                    text = label
                    setTextColor(Color.WHITE)
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                    typeface = Typeface.DEFAULT_BOLD
                    setPadding(dpToPx(10), dpToPx(5), dpToPx(10), dpToPx(5))
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.RECTANGLE
                        cornerRadius = dpToPx(6).toFloat()
                        setColor(Color.parseColor(bgHex))
                    }
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply {
                        marginStart = dpToPx(6)
                    }
                    setOnClickListener {
                        scope.launch {
                            val ok = FileToSheetClient.updateWorkspaceRowApproval(
                                projectId = item.projectId,
                                sheetName = item.sheetName,
                                rowIndices = listOf(item.rawRowIndex),
                                serialNumbers = listOfNotNull(item.serialNumber.takeIf { it.isNotBlank() }),
                                status = statusCode,
                                actorPhone = prefs.ftsPhoneNumber.orEmpty()
                            )
                            if (ok) {
                                Toast.makeText(activity, "✅ 결재 상태가 [$label](으)로 변경되었습니다.", Toast.LENGTH_SHORT).show()
                                currentMatchedRows = currentMatchedRows.map {
                                    if (it.projectId == item.projectId && it.sheetName == item.sheetName && it.rawRowIndex == item.rawRowIndex) {
                                        it.copy(approvalStatus = statusCode)
                                    } else {
                                        it
                                    }
                                }
                                renderMatchedSearchResults()
                                dialog.dismiss()
                            } else {
                                Toast.makeText(activity, "결재 상태 변경에 실패했습니다.", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                }
                approvalRow.addView(btn)
            }

            addApprovalBtn("✅ 승인", "APPROVED", "#059669")
            addApprovalBtn("🟠 보류", "HELD", "#D97706")
            addApprovalBtn("🚫 반려", "REJECTED", "#E11D48")
            container.addView(approvalRow)
        }

        // 3. 전체 컬럼 Key-Value 상세 테이블 (터치 시 클립보드 복사)
        val fieldsBox = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dpToPx(12), dpToPx(10), dpToPx(12), dpToPx(10))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dpToPx(10).toFloat()
                setColor(Color.parseColor("#1E293B"))
                setStroke(dpToPx(1), Color.parseColor("#334155"))
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dpToPx(12)
            }
        }

        val orderedKeys = if (item.headers.isNotEmpty()) {
            item.headers
        } else {
            val list = mutableListOf<String>()
            val itKeys = item.rowJson.keys()
            while (itKeys.hasNext()) {
                val k = itKeys.next()
                if (!k.startsWith("_")) list.add(k)
            }
            list
        }

        for (colKey in orderedKeys) {
            if (colKey.startsWith("_")) continue
            val rawVal = item.rowJson.optString(colKey, "").trim()
            if (rawVal.isEmpty() || rawVal.equals("null", true)) continue

            val fieldItemLayout = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(0, dpToPx(5), 0, dpToPx(5))
                isClickable = true
                setOnClickListener {
                    val cm = activity.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                    cm?.setPrimaryClip(ClipData.newPlainText(colKey, rawVal))
                    Toast.makeText(activity, "📋 [$colKey] 내용이 복사되었습니다.", Toast.LENGTH_SHORT).show()
                }
            }

            val tvKey = TextView(activity).apply {
                text = colKey
                setTextColor(Color.parseColor("#94A3B8"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                typeface = Typeface.DEFAULT_BOLD
            }
            val tvVal = TextView(activity).apply {
                text = highlightKeywords(rawVal, currentSearchKeywords)
                setTextColor(Color.parseColor("#F8FAFC"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                setLineSpacing(dpToPx(2).toFloat(), 1f)
            }
            fieldItemLayout.addView(tvKey)
            fieldItemLayout.addView(tvVal)
            fieldsBox.addView(fieldItemLayout)
        }
        container.addView(fieldsBox)

        // 4. 전화번호가 있는 경우 빠른 전화/문자(SMS·MMS 장문 자동 전환) 발송 섹션
        var etSmsInputRef: EditText? = null
        if (item.phoneNumber.isNotBlank()) {
            val smsBox = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dpToPx(12), dpToPx(12), dpToPx(12), dpToPx(12))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(10).toFloat()
                    setColor(Color.parseColor("#1E1B4B"))
                    setStroke(dpToPx(1), Color.parseColor("#4F46E5"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            }

            val smsHeaderRow = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dpToPx(6)
                }
            }

            val tvSmsTitle = TextView(activity).apply {
                text = "💬 빠른 문자 발송 (${item.phoneNumber})"
                setTextColor(Color.parseColor("#A5B4FC"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                typeface = Typeface.DEFAULT_BOLD
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            val tvSmsByteCounter = TextView(activity).apply {
                text = "단문 SMS (0/80B)"
                setTextColor(Color.parseColor("#94A3B8"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
                typeface = Typeface.DEFAULT_BOLD
            }
            smsHeaderRow.addView(tvSmsTitle)
            smsHeaderRow.addView(tvSmsByteCounter)
            smsBox.addView(smsHeaderRow)

            val etSms = EditText(activity).apply {
                hint = "발송할 문자 내용을 입력하세요 (80B 초과 시 MMS 장문 자동 전환)"
                setHintTextColor(Color.parseColor("#64748B"))
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                minLines = 2
                maxLines = 5
                gravity = Gravity.TOP or Gravity.START
                setPadding(dpToPx(10), dpToPx(8), dpToPx(10), dpToPx(8))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(8).toFloat()
                    setColor(Color.parseColor("#0F172A"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dpToPx(8)
                }
            }
            etSmsInputRef = etSms

            val btnSendSms = Button(activity).apply {
                text = "📨 문자 즉시 발송"
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                typeface = Typeface.DEFAULT_BOLD
                backgroundTintList = ColorStateList.valueOf(Color.parseColor("#4F46E5"))
                layoutParams = LinearLayout.LayoutParams(0, dpToPx(40), 1.3f).apply {
                    marginStart = dpToPx(4)
                }
            }

            etSms.addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                    val textStr = s?.toString() ?: ""
                    val euckrBytes = try {
                        textStr.toByteArray( java.nio.charset.Charset.forName("EUC-KR") ).size
                    } catch (_: Exception) {
                        textStr.toByteArray(Charsets.UTF_8).size
                    }
                    if (euckrBytes > 80) {
                        tvSmsByteCounter.text = "장문 MMS 자동전환 (${euckrBytes}B)"
                        tvSmsByteCounter.setTextColor(Color.parseColor("#38BDF8"))
                        btnSendSms.text = "📨 MMS 장문 발송"
                    } else {
                        tvSmsByteCounter.text = "단문 SMS (${euckrBytes}/80B)"
                        tvSmsByteCounter.setTextColor(Color.parseColor("#94A3B8"))
                        btnSendSms.text = "📨 문자 즉시 발송"
                    }
                }
                override fun afterTextChanged(s: Editable?) {}
            })
            smsBox.addView(etSms)

            val btnRow = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
            }
            val btnCall = Button(activity).apply {
                text = "📞 전화 걸기"
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                typeface = Typeface.DEFAULT_BOLD
                backgroundTintList = ColorStateList.valueOf(Color.parseColor("#059669"))
                layoutParams = LinearLayout.LayoutParams(0, dpToPx(40), 1f).apply {
                    marginEnd = dpToPx(4)
                }
                setOnClickListener {
                    openDialer(item.phoneNumber)
                }
            }
            btnSendSms.setOnClickListener {
                val msg = etSms.text.toString().trim()
                if (msg.isBlank()) {
                    Toast.makeText(activity, "발송할 문자 내용을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                val cleanRecipient = item.phoneNumber.replace(Regex("[^0-9+]"), "")
                val (ok, _) = SmsSenderUtil.sendSmsDetailed(activity, cleanRecipient, msg)
                if (ok) {
                    val modeLabel = if (SmsSenderUtil.getSmsByteCount(msg) > 80) "장문(MMS/LMS)" else "단문(SMS)"
                    Toast.makeText(activity, "✅ ${item.phoneNumber} 번호로 $modeLabel 발송 완료!", Toast.LENGTH_SHORT).show()
                    etSms.setText("")
                } else {
                    Toast.makeText(activity, "문자 발송 실패: 휴대전화 번호(010 등)인지 및 SMS 권한을 확인해 주세요.", Toast.LENGTH_LONG).show()
                }
            }
            btnRow.addView(btnCall)
            btnRow.addView(btnSendSms)
            smsBox.addView(btnRow)
            container.addView(smsBox)
        }

        rootScroll.addView(container)
        dialog.setContentView(rootScroll)
        dialog.setOnShowListener {
            val bottomSheet = dialog.findViewById<View>(com.google.android.material.R.id.design_bottom_sheet)
            if (bottomSheet != null) {
                val behavior = BottomSheetBehavior.from(bottomSheet)
                behavior.state = BottomSheetBehavior.STATE_EXPANDED
                behavior.skipCollapsed = true
            }
            if (focusSms) {
                etSmsInputRef?.requestFocus()
            }
        }
        dialog.show()
    }

    /**
     * 1회성 작업을 구글 스프레드시트 상단 메뉴 및 Apps Script 영구 함수로 승격(Promote)
     */
    private fun promoteCommand(
        command: String,
        spreadsheetId: String?,
        functionTitle: String,
        button: Button
    ) {
        val userEmail = prefs.userEmail ?: return
        button.isEnabled = false
        button.text = "⏳ 구글 시트에 스크립트 주입 중..."
        Toast.makeText(activity, "🤖 AI가 영구 Apps Script 코드를 작성하여 시트에 원격 주입 중입니다...", Toast.LENGTH_SHORT).show()

        scope.launch {
            try {
                val pRes = ApiClient.promoteCommandToScript(
                    userEmail = userEmail,
                    command = command,
                    spreadsheetId = spreadsheetId,
                    functionTitle = functionTitle
                )
                if (pRes.success) {
                    button.text = "✓ 영구 등록 완료 ('🚀 SheetBot 메뉴'에 추가됨)"
                    button.setBackgroundColor(Color.parseColor("#065F46"))
                    Toast.makeText(activity, pRes.message ?: "구글 시트 상단 메뉴에 영구 등록되었습니다!", Toast.LENGTH_LONG).show()
                    addLogItem("스크립트 영구등록", "${pRes.functionTitle}: 시트 메뉴에 등록 완료", true)

                    if (prefs.isTtsEnabled) {
                        TtsManager.speak(activity, pRes.spokenResult ?: "구글 시트 상단 메뉴에 영구 등록되었습니다.")
                    }
                    loadCapabilitiesFromServer()
                } else {
                    button.isEnabled = true
                    button.text = "💾 다시 시도: 시트 메뉴로 영구 저장"
                    val err = pRes.error ?: "등록 실패"
                    Toast.makeText(activity, "⚠️ 영구 등록 실패: $err", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                button.isEnabled = true
                button.text = "💾 다시 시도: 시트 메뉴로 영구 저장"
                Toast.makeText(activity, "영구 등록 예외: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
