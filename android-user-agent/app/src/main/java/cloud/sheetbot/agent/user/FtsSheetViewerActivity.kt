package cloud.sheetbot.agent.user

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.TextUtils
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TableLayout
import android.widget.TableRow
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import cloud.sheetbot.agent.user.card.CardInlineLoadingHelper
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

/**
 * 📱 파일투시트(FileToSheet) 모바일 인앱 스마트 대장 뷰어 액티비티
 * - 외부 웹 브라우저(PC용 다중 열 스프레드시트 화면)로 이동하지 않고 앱 내에서 즉시 대장 데이터를 불러와 표시
 * - 기본 '🃏 모바일 카드형 뷰'(가독성 최적화)와 '📊 표(Table) 보기 뷰'(원본 대조용) 실시간 토글 지원
 * - 상단 시트 탭 전환 바, 실시간 키워드 검색, 행 터치 시 전체 컬럼 상세 + 전화/문자(AI 추천 문구)/통화녹음 듣기 원스톱 연동
 */
class FtsSheetViewerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_SHEET_TYPE = "extra_sheet_type"
        const val EXTRA_SHEET_NAME = "extra_sheet_name"
        const val EXTRA_TOKEN = "extra_token"
        const val EXTRA_PROJECT_ID = "extra_project_id"
        const val EXTRA_PHONE_NUMBER = "extra_phone_number"
    }

    private lateinit var prefs: PreferencesManager
    private lateinit var tvViewerTitle: TextView
    private lateinit var tvViewerSubtitle: TextView
    private lateinit var btnToggleViewMode: TextView
    private lateinit var btnRefreshSheet: TextView
    private lateinit var btnOpenFtsWeb: TextView
    private lateinit var layoutSheetTabs: LinearLayout
    private lateinit var etSearchRows: EditText
    private lateinit var btnClearSearch: TextView
    private lateinit var tvRowCountBadge: TextView
    private lateinit var layoutViewerInlineLoading: LinearLayout
    private lateinit var rvSheetCards: RecyclerView
    private lateinit var scrollTableVertical: ScrollView
    private lateinit var tableSheetData: TableLayout
    private lateinit var layoutEmptyState: LinearLayout
    private lateinit var tvEmptyTitle: TextView
    private lateinit var tvEmptySubtitle: TextView

    private lateinit var cardAdapter: FtsRowCardAdapter

    private var currentSheetType: String = ""
    private var currentSheetName: String = "파일투시트 대장"
    private var currentToken: String = ""
    private var currentProjectId: String = ""
    private var currentPhoneNumber: String = ""
    private var currentProjectName: String = "시트봇 연동 장부"

    private var currentHeaders: List<String> = emptyList()
    private var allRows: List<JSONObject> = emptyList()
    private var filteredRows: List<JSONObject> = emptyList()
    private var availableTabs: List<SheetTabItem> = emptyList()

    private var isTableMode: Boolean = false
    private var loadJob: Job? = null

    private var activeMediaPlayer: MediaPlayer? = null
    private var audioProgressJob: Job? = null
    private val aiReplyCache = mutableMapOf<String, List<String>>()

    data class SheetTabItem(
        val sheetName: String,
        val cardId: String,
        val rowCount: Int = -1
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_fts_sheet_viewer)

        prefs = PreferencesManager(this)

        currentSheetType = intent.getStringExtra(EXTRA_SHEET_TYPE).orEmpty()
        currentSheetName = intent.getStringExtra(EXTRA_SHEET_NAME)?.takeIf { it.isNotBlank() }
            ?: FileToSheetClient.resolveSheetSpec(currentSheetType)?.sheetName
            ?: "파일투시트 대장"
        currentToken = intent.getStringExtra(EXTRA_TOKEN).orEmpty()
        currentProjectId = intent.getStringExtra(EXTRA_PROJECT_ID)?.takeIf { it.isNotBlank() }
            ?: prefs.ftsProjectId.orEmpty()
        currentPhoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER)?.takeIf { it.isNotBlank() }
            ?: prefs.ftsPhoneNumber?.replace("[^0-9]".toRegex(), "").orEmpty()

        bindViews()
        setupRecyclerView()
        setupSearchAndButtons()
        buildInitialSheetTabs()

        loadSheetData(targetSheetName = currentSheetName, targetCardId = resolveCardIdBySheetName(currentSheetName))
    }

    override fun onDestroy() {
        stopAndReleaseAudioPlayer()
        super.onDestroy()
    }

    private fun stopAndReleaseAudioPlayer() {
        audioProgressJob?.cancel()
        audioProgressJob = null
        try {
            activeMediaPlayer?.let { mp ->
                if (mp.isPlaying) {
                    mp.stop()
                }
                mp.release()
            }
        } catch (_: Exception) {
        } finally {
            activeMediaPlayer = null
        }
    }

    private fun formatDurationMs(ms: Int): String {
        val totalSec = (ms.coerceAtLeast(0)) / 1000
        val min = totalSec / 60
        val sec = totalSec % 60
        return String.format("%02d:%02d", min, sec)
    }

    private fun bindViews() {
        findViewById<View>(R.id.btnBack).setOnClickListener { finish() }
        tvViewerTitle = findViewById(R.id.tvViewerTitle)
        tvViewerSubtitle = findViewById(R.id.tvViewerSubtitle)
        btnToggleViewMode = findViewById(R.id.btnToggleViewMode)
        btnRefreshSheet = findViewById(R.id.btnRefreshSheet)
        btnOpenFtsWeb = findViewById(R.id.btnOpenFtsWeb)
        layoutSheetTabs = findViewById(R.id.layoutSheetTabs)
        etSearchRows = findViewById(R.id.etSearchRows)
        btnClearSearch = findViewById(R.id.btnClearSearch)
        tvRowCountBadge = findViewById(R.id.tvRowCountBadge)
        layoutViewerInlineLoading = findViewById(R.id.layoutViewerInlineLoading)
        rvSheetCards = findViewById(R.id.rvSheetCards)
        scrollTableVertical = findViewById(R.id.scrollTableVertical)
        tableSheetData = findViewById(R.id.tableSheetData)
        layoutEmptyState = findViewById(R.id.layoutEmptyState)
        tvEmptyTitle = findViewById(R.id.tvEmptyTitle)
        tvEmptySubtitle = findViewById(R.id.tvEmptySubtitle)

        tvViewerTitle.text = "📊 $currentSheetName"
    }

    private fun setupRecyclerView() {
        cardAdapter = FtsRowCardAdapter(
            onRowClick = { rowObj, rowNumber ->
                showRowDetailBottomSheet(rowObj, rowNumber)
            },
            onCallClick = { phone ->
                openDialer(phone)
            },
            onSmsClick = { rowObj, rowNumber ->
                showRowDetailBottomSheet(rowObj, rowNumber, focusQuickReply = true)
            },
            onPlayAudioClick = { rowObj, rowNumber ->
                showRowDetailBottomSheet(rowObj, rowNumber, autoPlayAudio = true)
            }
        )
        rvSheetCards.layoutManager = LinearLayoutManager(this)
        rvSheetCards.adapter = cardAdapter
    }

    private fun setupSearchAndButtons() {
        btnToggleViewMode.setOnClickListener {
            isTableMode = !isTableMode
            if (isTableMode) {
                btnToggleViewMode.text = "🃏 카드형"
                btnToggleViewMode.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#2563EB"))
            } else {
                btnToggleViewMode.text = "📊 표 보기"
                btnToggleViewMode.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#334155"))
            }
            renderCurrentView()
        }

        btnRefreshSheet.setOnClickListener {
            loadSheetData(
                targetSheetName = currentSheetName,
                targetCardId = resolveCardIdBySheetName(currentSheetName),
                forceEnsure = false
            )
        }

        btnOpenFtsWeb.setOnClickListener {
            openCurrentSheetInWeb()
        }

        etSearchRows.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val q = s?.toString()?.trim().orEmpty()
                btnClearSearch.visibility = if (q.isNotEmpty()) View.VISIBLE else View.GONE
                applySearchFilter(q)
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        btnClearSearch.setOnClickListener {
            etSearchRows.setText("")
        }
    }

    private fun resolveCardIdBySheetName(sheetName: String): String {
        val clean = sheetName.trim()
        for ((cardId, spec) in FileToSheetClient.CARD_SHEET_SPECS) {
            if (spec.sheetName == clean || clean.contains(spec.sheetName)) {
                return cardId
            }
        }
        if (clean.contains("통화녹음")) return "call_recording"
        if (clean.contains("부재중")) return "missed_call"
        if (clean.contains("문자송수신")) return "sms_sync"
        if (clean.contains("카카오톡")) return "kakao_sync"
        if (clean.contains("명함발송")) return "call_ended_card"
        if (clean.contains("명함")) return "business_card"
        if (clean.contains("영수증문자")) return "receipt_sms"
        if (clean.contains("영수증")) return "receipt_scanner"
        if (clean.contains("결제입금")) return "payment_sms"
        if (clean.contains("할일")) return "tasks_hub"
        return currentSheetType.takeIf { it.isNotBlank() }?.let { FileToSheetClient.resolveCanonicalCardId(it) } ?: "business_card"
    }

    private fun buildInitialSheetTabs() {
        val defaultTabs = mutableListOf(
            SheetTabItem("통화녹음대장", "call_recording"),
            SheetTabItem("부재중전화대장", "missed_call"),
            SheetTabItem("문자송수신대장", "sms_sync"),
            SheetTabItem("카카오톡대화대장", "kakao_sync"),
            SheetTabItem("명함관리", "business_card"),
            SheetTabItem("영수증대장", "receipt_scanner"),
            SheetTabItem("모바일명함발송대장", "call_ended_card"),
            SheetTabItem("결제입금내역", "payment_sms")
        )
        if (defaultTabs.none { it.sheetName == currentSheetName }) {
            defaultTabs.add(0, SheetTabItem(currentSheetName, resolveCardIdBySheetName(currentSheetName)))
        }
        availableTabs = defaultTabs
        renderSheetTabs()
    }

    private fun renderSheetTabs() {
        layoutSheetTabs.removeAllViews()
        for (tab in availableTabs) {
            val isSelected = tab.sheetName == currentSheetName
            val label = if (tab.rowCount >= 0) {
                "${tab.sheetName} (${tab.rowCount})"
            } else {
                tab.sheetName
            }
            val chip = TextView(this).apply {
                text = label
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                setTypeface(typeface, if (isSelected) Typeface.BOLD else Typeface.NORMAL)
                setTextColor(Color.parseColor(if (isSelected) "#FFFFFF" else "#94A3B8"))
                setPadding(dp(12), dp(6), dp(12), dp(6))
                background = GradientDrawable().apply {
                    cornerRadius = dp(99).toFloat()
                    setColor(Color.parseColor(if (isSelected) "#2563EB" else "#1E293B"))
                    setStroke(dp(1), Color.parseColor(if (isSelected) "#60A5FA" else "#334155"))
                }
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = dp(8)
                }
                layoutParams = lp
                setOnClickListener {
                    if (currentSheetName != tab.sheetName) {
                        currentSheetName = tab.sheetName
                        tvViewerTitle.text = "📊 $currentSheetName"
                        renderSheetTabs()
                        loadSheetData(targetSheetName = tab.sheetName, targetCardId = tab.cardId)
                    }
                }
            }
            layoutSheetTabs.addView(chip)
        }
    }

    private fun loadSheetData(
        targetSheetName: String,
        targetCardId: String,
        forceEnsure: Boolean = false
    ) {
        loadJob?.cancel()
        loadJob = lifecycleScope.launch {
            CardInlineLoadingHelper.show(
                container = layoutViewerInlineLoading,
                message = "⚡ [$targetSheetName] 데이터를 불러오는 중입니다..."
            )

            try {
                // 1. 해당 카드의 저장된 토큰 확인 또는 ensureSheet로 토큰 획득
                var tokenToUse = if (!forceEnsure && targetSheetName == currentSheetName && currentToken.isNotBlank()) {
                    currentToken
                } else {
                    prefs.getFtsTokenFor(targetCardId).orEmpty()
                }

                val spec = FileToSheetClient.CARD_SHEET_SPECS[targetCardId]
                if ((tokenToUse.isBlank() || forceEnsure) && currentPhoneNumber.length >= 10) {
                    val ensureRes = FileToSheetClient.ensureSheet(
                        phoneNumber = currentPhoneNumber,
                        cardId = targetCardId,
                        sheetName = targetSheetName,
                        headers = spec?.headers,
                        projectId = currentProjectId.takeIf { it.isNotBlank() }
                    )
                    if (ensureRes.success && !ensureRes.token.isNullOrBlank()) {
                        tokenToUse = ensureRes.token
                        currentToken = ensureRes.token
                        if (!ensureRes.projectId.isNullOrBlank()) {
                            currentProjectId = ensureRes.projectId
                        }
                        if (!ensureRes.projectName.isNullOrBlank()) {
                            currentProjectName = ensureRes.projectName
                        }
                        prefs.saveFtsSheetBinding(
                            cardIdOrType = targetCardId,
                            token = ensureRes.token,
                            sheetName = ensureRes.sheetName ?: targetSheetName,
                            webhookUrl = ensureRes.webhookUrl,
                            projectId = ensureRes.projectId
                        )
                    }
                }

                // 만약 여전히 토큰이 비어있다면 기본 ftsToken 시도
                if (tokenToUse.isBlank()) {
                    tokenToUse = prefs.ftsToken.orEmpty()
                }

                var detail = if (tokenToUse.isNotBlank()) {
                    FileToSheetClient.fetchSheetDataDetail(
                        token = tokenToUse,
                        overrideSheetName = targetSheetName
                    )
                } else {
                    FileToSheetClient.FtsSheetDataDetail(success = false, error = "파일투시트 시트 토큰을 찾을 수 없습니다.")
                }

                // 만약 캐시된 토큰으로 조회했는데 다른 시트가 반환되었거나 실패한 경우 ensureSheet 재시도
                if ((!detail.success || (detail.sheetName.isNotBlank() && detail.sheetName != targetSheetName && detail.rows.isEmpty()))
                    && currentPhoneNumber.length >= 10 && !forceEnsure
                ) {
                    val ensureRes = FileToSheetClient.ensureSheet(
                        phoneNumber = currentPhoneNumber,
                        cardId = targetCardId,
                        sheetName = targetSheetName,
                        headers = spec?.headers,
                        projectId = currentProjectId.takeIf { it.isNotBlank() }
                    )
                    if (ensureRes.success && !ensureRes.token.isNullOrBlank()) {
                        tokenToUse = ensureRes.token
                        currentToken = ensureRes.token
                        prefs.saveFtsSheetBinding(
                            cardIdOrType = targetCardId,
                            token = ensureRes.token,
                            sheetName = ensureRes.sheetName ?: targetSheetName,
                            webhookUrl = ensureRes.webhookUrl,
                            projectId = ensureRes.projectId
                        )
                        detail = FileToSheetClient.fetchSheetDataDetail(
                            token = tokenToUse,
                            overrideSheetName = targetSheetName
                        )
                    }
                }

                CardInlineLoadingHelper.hide(layoutViewerInlineLoading)

                if (detail.success) {
                    currentToken = detail.token.ifBlank { tokenToUse }
                    currentSheetName = detail.sheetName.ifBlank { targetSheetName }
                    currentProjectName = detail.projectName.ifBlank { "시트봇 연동 장부" }
                    if (!detail.projectId.isNullOrBlank()) {
                        currentProjectId = detail.projectId
                    }

                    currentHeaders = if (detail.headers.isNotEmpty()) {
                        detail.headers
                    } else {
                        spec?.headers ?: listOf("일련번호", "등록일시", "내용", "비고")
                    }

                    // 최신 등록건이 위로 오도록 역순 정렬 (단, 일련번호나 등록일시 기준 최신순 보장)
                    allRows = detail.rows.reversed()

                    // 프로젝트 내 시트 목록이 반환된 경우 상단 탭 업데이트
                    if (detail.projectSheets.isNotEmpty()) {
                        val updatedTabs = detail.projectSheets.map { s ->
                            SheetTabItem(
                                sheetName = s.name,
                                cardId = resolveCardIdBySheetName(s.name),
                                rowCount = s.rowCount
                            )
                        }.toMutableList()
                        // 현재 시트가 목록에 없으면 추가
                        if (updatedTabs.none { it.sheetName == currentSheetName }) {
                            updatedTabs.add(0, SheetTabItem(currentSheetName, targetCardId, allRows.size))
                        }
                        availableTabs = updatedTabs
                    } else {
                        availableTabs = availableTabs.map { t ->
                            if (t.sheetName == currentSheetName) t.copy(rowCount = allRows.size) else t
                        }
                    }

                    tvViewerTitle.text = "📊 $currentSheetName"
                    tvViewerSubtitle.text = "$currentProjectName • 총 ${allRows.size}건"
                    renderSheetTabs()
                    applySearchFilter(etSearchRows.text?.toString()?.trim().orEmpty())
                } else {
                    tvViewerTitle.text = "📊 $targetSheetName"
                    tvViewerSubtitle.text = "데이터 조회 실패: ${detail.error ?: "오류"}"
                    allRows = emptyList()
                    applySearchFilter("")
                    Toast.makeText(this@FtsSheetViewerActivity, detail.error ?: "대장 데이터를 불러오지 못했습니다.", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                CardInlineLoadingHelper.hide(layoutViewerInlineLoading)
                Toast.makeText(this@FtsSheetViewerActivity, "대장 조회 오류: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun applySearchFilter(query: String) {
        if (query.isBlank()) {
            filteredRows = allRows
        } else {
            val qLower = query.lowercase()
            filteredRows = allRows.filter { row ->
                var matched = false
                val keys = row.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    if (k.startsWith("_")) continue
                    val v = optCleanString(row, k)
                    if (v.lowercase().contains(qLower)) {
                        matched = true
                        break
                    }
                }
                matched
            }
        }
        tvRowCountBadge.text = "${filteredRows.size}건"
        renderCurrentView()
    }

    private fun renderCurrentView() {
        if (filteredRows.isEmpty()) {
            rvSheetCards.visibility = View.GONE
            scrollTableVertical.visibility = View.GONE
            layoutEmptyState.visibility = View.VISIBLE
            val q = etSearchRows.text?.toString()?.trim().orEmpty()
            if (q.isNotEmpty() && allRows.isNotEmpty()) {
                tvEmptyTitle.text = "'$q' 검색 결과가 없습니다."
                tvEmptySubtitle.text = "다른 이름, 전화번호 또는 키워드로 검색해 보세요."
            } else {
                tvEmptyTitle.text = "[$currentSheetName]에 적재된 데이터가 없습니다."
                tvEmptySubtitle.text = "모바일에서 명함, 영수증, 통화녹음, 문자/카톡 등이 수집되면 이곳에 실시간으로 표시됩니다."
            }
            return
        }

        layoutEmptyState.visibility = View.GONE
        if (isTableMode) {
            rvSheetCards.visibility = View.GONE
            scrollTableVertical.visibility = View.VISIBLE
            renderTableView()
        } else {
            scrollTableVertical.visibility = View.GONE
            rvSheetCards.visibility = View.VISIBLE
            cardAdapter.submitData(currentSheetName, currentHeaders, filteredRows)
        }
    }

    private fun renderTableView() {
        tableSheetData.removeAllViews()
        val headersToShow = if (currentHeaders.isNotEmpty()) currentHeaders else listOf("일련번호", "내용")

        // 1. 헤더 행
        val headerRow = TableRow(this).apply {
            setBackgroundColor(Color.parseColor("#1E293B"))
        }
        for (h in headersToShow) {
            val tv = TextView(this).apply {
                text = h
                setTextColor(Color.parseColor("#38BDF8"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                setTypeface(typeface, Typeface.BOLD)
                setPadding(dp(12), dp(10), dp(12), dp(10))
                maxLines = 1
            }
            headerRow.addView(tv)
        }
        tableSheetData.addView(headerRow)

        // 2. 데이터 행 (최대 200행 렌더링으로 스크롤 성능 보장)
        val rowsToRender = filteredRows.take(200)
        for ((idx, rowObj) in rowsToRender.withIndex()) {
            val tableRow = TableRow(this).apply {
                setBackgroundColor(Color.parseColor(if (idx % 2 == 0) "#0F172A" else "#162032"))
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    showRowDetailBottomSheet(rowObj, filteredRows.size - idx)
                }
            }
            for (h in headersToShow) {
                val cellVal = optCleanString(rowObj, h).ifBlank { "-" }
                val tv = TextView(this).apply {
                    text = cellVal
                    setTextColor(Color.parseColor("#E2E8F0"))
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                    setPadding(dp(12), dp(10), dp(12), dp(10))
                    maxWidth = dp(220)
                    maxLines = 2
                    ellipsize = TextUtils.TruncateAt.END
                }
                tableRow.addView(tv)
            }
            tableSheetData.addView(tableRow)
        }
    }

    private fun openCurrentSheetInWeb() {
        val webUrl = buildString {
            append(FileToSheetClient.FTS_OFFICIAL_DOMAIN)
            if (currentToken.isNotBlank()) {
                append("/?token=").append(Uri.encode(currentToken))
                if (currentPhoneNumber.isNotBlank()) {
                    append("&phone=").append(Uri.encode(currentPhoneNumber))
                }
                if (currentProjectId.isNotBlank()) {
                    append("&projectId=").append(Uri.encode(currentProjectId))
                }
                append("&sheet=").append(Uri.encode(currentSheetName))
            }
        }
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(webUrl)))
        } catch (_: Exception) {
            Toast.makeText(this, "웹 브라우저를 열 수 없습니다.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun openDialer(phone: String) {
        val clean = phone.trim()
        if (clean.isBlank()) return
        try {
            startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$clean")))
        } catch (_: Exception) {
            Toast.makeText(this, "전화 앱을 열 수 없습니다.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun openSmsConversation(phone: String, prefillBody: String? = null) {
        val clean = phone.trim()
        if (clean.isBlank()) return
        try {
            val smsIntent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$clean")).apply {
                if (!prefillBody.isNullOrBlank()) putExtra("sms_body", prefillBody)
            }
            startActivity(smsIntent)
        } catch (_: Exception) {
            try {
                val viewIntent = Intent(Intent.ACTION_VIEW, Uri.parse("sms:$clean")).apply {
                    if (!prefillBody.isNullOrBlank()) putExtra("sms_body", prefillBody)
                }
                startActivity(viewIntent)
            } catch (_: Exception) {
                Toast.makeText(this, "메시지 앱을 열 수 없습니다.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * 📋 대장 행(Row) 터치 시 전체 컬럼 상세 보기 + 바로 전화걸기 / 문자 답장(AI 추천) / 통화녹음 듣기 바텀시트
     */
    private fun showRowDetailBottomSheet(
        rowObj: JSONObject,
        fallbackRowNum: Int,
        focusQuickReply: Boolean = false,
        autoPlayAudio: Boolean = false
    ) {
        val dialog = BottomSheetDialog(this)
        val view = LayoutInflater.from(this).inflate(R.layout.dialog_task_action_sheet, null)
        dialog.setContentView(view)

        val tvSourceBadge = view.findViewById<TextView>(R.id.tvSheetSourceBadge)
        val tvStateBadge = view.findViewById<TextView>(R.id.tvSheetStateBadge)
        val tvDueDate = view.findViewById<TextView>(R.id.tvSheetDueDate)
        val btnClose = view.findViewById<View>(R.id.btnCloseTaskSheet)
        val tvTitle = view.findViewById<TextView>(R.id.tvSheetTaskTitle)
        val layoutContactBox = view.findViewById<View>(R.id.layoutSheetContactBox)
        val tvContactName = view.findViewById<TextView>(R.id.tvSheetContactName)
        val tvContactPhone = view.findViewById<TextView>(R.id.tvSheetContactPhone)
        val scrollDesc = view.findViewById<View>(R.id.scrollSheetDescription)
        val tvDesc = view.findViewById<TextView>(R.id.tvSheetTaskDescription)

        val layoutAudioPlayerBox = view.findViewById<View>(R.id.layoutAudioPlayerBox)
        val tvAudioFileName = view.findViewById<TextView>(R.id.tvAudioFileName)
        val tvAudioTimeStatus = view.findViewById<TextView>(R.id.tvAudioTimeStatus)
        val btnPlayPauseAudio = view.findViewById<Button>(R.id.btnPlayPauseAudio)
        val seekBarAudio = view.findViewById<SeekBar>(R.id.seekBarAudio)

        val btnCallNow = view.findViewById<Button>(R.id.btnActionCallNow)
        val btnOpenSms = view.findViewById<Button>(R.id.btnActionOpenSmsApp)
        val btnOpenKakao = view.findViewById<Button>(R.id.btnActionOpenKakao)

        val layoutQuickReplyBox = view.findViewById<View>(R.id.layoutQuickReplyBox)
        val tvQuickReplyHeader = view.findViewById<TextView>(R.id.tvQuickReplyHeader)
        val btnAiSuggestReply = view.findViewById<TextView>(R.id.btnAiSuggestReply)
        val layoutTemplates = view.findViewById<LinearLayout>(R.id.layoutQuickReplyTemplates)
        val etReply = view.findViewById<EditText>(R.id.etQuickReplyMessage)
        val btnSendReply = view.findViewById<Button>(R.id.btnSendQuickReplyNow)
        val btnToggleDone = view.findViewById<Button>(R.id.btnActionToggleTaskDone)

        stopAndReleaseAudioPlayer()
        dialog.setOnDismissListener { stopAndReleaseAudioPlayer() }
        btnClose.setOnClickListener { dialog.dismiss() }

        val summary = extractRowPresentation(rowObj, currentHeaders, fallbackRowNum)

        tvSourceBadge.text = "📊 $currentSheetName"
        tvSourceBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#1E3A8A"))

        if (summary.badge.isNotBlank()) {
            tvStateBadge.text = summary.badge
            tvStateBadge.visibility = View.VISIBLE
        } else {
            tvStateBadge.visibility = View.GONE
        }

        tvDueDate.text = summary.dateTime
        tvTitle.text = summary.primaryTitle.ifBlank { "#${summary.serial} 상세 내역" }

        // 고객명 및 전화번호 추출 (주소록 역조회 포함)
        var targetName = summary.contactName.takeIf { it.isNotBlank() }
        var targetPhone = summary.phoneNumber.takeIf { it.isNotBlank() }

        if (targetPhone == null) {
            val fullText = rowObj.toString()
            val match = Regex("(01[016789][\\-\\s]?\\d{3,4}[\\-\\s]?\\d{4}|0\\d{1,2}[\\-\\s]?\\d{3,4}[\\-\\s]?\\d{4})").find(fullText)
            if (match != null) {
                targetPhone = ContactHelper.formatPhoneNumber(match.value)
            }
        }
        if (targetPhone == null && !targetName.isNullOrBlank()) {
            val cleanLookup = targetName.substringBefore("(").trim()
            targetPhone = ContactHelper.getPhoneNumberByName(this, cleanLookup)
        }
        if (targetName == null && !targetPhone.isNullOrBlank()) {
            targetName = ContactHelper.getContactName(this, targetPhone)
        }

        if (targetName != null || targetPhone != null) {
            layoutContactBox.visibility = View.VISIBLE
            tvContactName.text = "👤 ${targetName ?: "연락처"}"
            if (targetPhone != null) {
                tvContactPhone.text = "📞 $targetPhone"
                tvContactPhone.visibility = View.VISIBLE
                tvContactPhone.setOnClickListener {
                    dialog.dismiss()
                    openDialer(targetPhone)
                }
            } else {
                tvContactPhone.visibility = View.GONE
            }
        } else {
            layoutContactBox.visibility = View.GONE
        }

        // 전체 컬럼 상세 키-값 포맷팅 표시
        val allFieldsText = buildString {
            val keysToDisplay = if (currentHeaders.isNotEmpty()) {
                currentHeaders
            } else {
                val list = mutableListOf<String>()
                val it = rowObj.keys()
                while (it.hasNext()) {
                    val k = it.next()
                    if (!k.startsWith("_")) list.add(k)
                }
                list
            }
            for (h in keysToDisplay) {
                val v = optCleanString(rowObj, h)
                if (v.isNotBlank()) {
                    if (isNotEmpty()) append("\n\n")
                    append("• ").append(h).append(": ").append(v)
                }
            }
        }

        if (allFieldsText.isNotBlank()) {
            scrollDesc.visibility = View.VISIBLE
            tvDesc.text = allFieldsText
            tvDesc.setOnLongClickListener {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText(currentSheetName, allFieldsText))
                Toast.makeText(this, "📋 상세 내용이 클립보드에 복사되었습니다.", Toast.LENGTH_SHORT).show()
                true
            }
        } else {
            scrollDesc.visibility = View.GONE
        }

        // 🎙️ 통화녹음대장 / 회의록대장인 경우 인앱 오디오 플레이어 활성화
        val isRecordingSheet = currentSheetName.contains("통화녹음") || currentSheetName.contains("회의록")
        if (isRecordingSheet) {
            layoutAudioPlayerBox.visibility = View.VISIBLE
            tvAudioFileName.text = "🎧 녹음 파일 탐색 중..."
            tvAudioTimeStatus.text = "스마트폰 내 녹음 폴더를 확인하고 있습니다..."
            btnPlayPauseAudio.isEnabled = false
            btnPlayPauseAudio.text = "탐색중"
            seekBarAudio.visibility = View.GONE

            val fileNameHint = optCleanString(rowObj, "파일명")
            val searchName = targetName ?: fileNameHint
            val searchPhone = targetPhone
            val searchTime = summary.dateTime

            lifecycleScope.launch {
                val matchedFile: File? = withContext(Dispatchers.IO) {
                    CallRecordingManager.findMatchingRecordingFile(
                        context = this@FtsSheetViewerActivity,
                        contactName = searchName,
                        contactPhone = searchPhone,
                        createdAt = searchTime
                    )
                }
                if (!dialog.isShowing) return@launch

                if (matchedFile != null && matchedFile.exists()) {
                    tvAudioFileName.text = "🎧 ${matchedFile.name}"
                    tvAudioTimeStatus.text = "내 스마트폰 녹음 파일 준비됨 • 재생 버튼을 누르세요"
                    btnPlayPauseAudio.isEnabled = true
                    btnPlayPauseAudio.text = "▶️ 듣기"
                    btnPlayPauseAudio.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#059669"))
                    seekBarAudio.visibility = View.VISIBLE
                    seekBarAudio.progress = 0

                    var isUserSeeking = false
                    seekBarAudio.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                        override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                            if (fromUser) {
                                val dur = try { activeMediaPlayer?.duration ?: 0 } catch (_: Exception) { 0 }
                                if (dur > 0) {
                                    tvAudioTimeStatus.text = "${formatDurationMs(progress)} / ${formatDurationMs(dur)}"
                                }
                            }
                        }
                        override fun onStartTrackingTouch(sb: SeekBar?) { isUserSeeking = true }
                        override fun onStopTrackingTouch(sb: SeekBar?) {
                            if (sb != null) {
                                try { activeMediaPlayer?.seekTo(sb.progress) } catch (_: Exception) {}
                            }
                            isUserSeeking = false
                        }
                    })

                    val togglePlayback = {
                        try {
                            val currentMp = activeMediaPlayer
                            if (currentMp != null) {
                                if (currentMp.isPlaying) {
                                    currentMp.pause()
                                    btnPlayPauseAudio.text = "▶️ 계속"
                                    btnPlayPauseAudio.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#059669"))
                                    tvAudioTimeStatus.text = "일시정지됨 (${formatDurationMs(currentMp.currentPosition)} / ${formatDurationMs(currentMp.duration)})"
                                } else {
                                    currentMp.start()
                                    btnPlayPauseAudio.text = "⏸ 일시정지"
                                    btnPlayPauseAudio.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#D97706"))
                                }
                            } else {
                                stopAndReleaseAudioPlayer()
                                val mp = MediaPlayer().apply {
                                    setDataSource(matchedFile.absolutePath)
                                    prepare()
                                    start()
                                }
                                activeMediaPlayer = mp
                                val totalDur = mp.duration.coerceAtLeast(1)
                                seekBarAudio.max = totalDur
                                btnPlayPauseAudio.text = "⏸ 일시정지"
                                btnPlayPauseAudio.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#D97706"))

                                mp.setOnCompletionListener {
                                    audioProgressJob?.cancel()
                                    seekBarAudio.progress = 0
                                    btnPlayPauseAudio.text = "▶️ 다시 듣기"
                                    btnPlayPauseAudio.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#059669"))
                                    tvAudioTimeStatus.text = "재생 완료 (${formatDurationMs(totalDur)})"
                                }

                                audioProgressJob = lifecycleScope.launch {
                                    while (isActive && dialog.isShowing) {
                                        val player = activeMediaPlayer ?: break
                                        try {
                                            if (player.isPlaying && !isUserSeeking) {
                                                val pos = player.currentPosition
                                                val dur = player.duration.coerceAtLeast(1)
                                                seekBarAudio.max = dur
                                                seekBarAudio.progress = pos
                                                tvAudioTimeStatus.text = "재생 중 ${formatDurationMs(pos)} / ${formatDurationMs(dur)}"
                                            }
                                        } catch (_: Exception) { break }
                                        delay(250)
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            Toast.makeText(this@FtsSheetViewerActivity, "녹음 파일 재생 오류: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    }

                    btnPlayPauseAudio.setOnClickListener { togglePlayback() }
                    if (autoPlayAudio) {
                        togglePlayback()
                    }
                } else {
                    tvAudioFileName.text = "🎙️ 스마트폰 내 일치하는 녹음 파일 없음"
                    tvAudioTimeStatus.text = "웹 원본 증빙에서 확인하거나 다른 기기에서 녹음된 건입니다"
                    btnPlayPauseAudio.isEnabled = true
                    btnPlayPauseAudio.text = "🌐 웹 열기"
                    btnPlayPauseAudio.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#475569"))
                    btnPlayPauseAudio.setOnClickListener {
                        dialog.dismiss()
                        openCurrentSheetInWeb()
                    }
                }
            }
        } else {
            layoutAudioPlayerBox.visibility = View.GONE
        }

        // 전화 / 문자 버튼
        if (targetPhone != null) {
            btnCallNow.visibility = View.VISIBLE
            btnCallNow.text = "📞 바로 전화걸기"
            btnCallNow.setOnClickListener {
                dialog.dismiss()
                openDialer(targetPhone)
            }
            btnOpenSms.visibility = View.VISIBLE
            btnOpenSms.text = "💬 문자 대화창 열기"
            btnOpenSms.setOnClickListener {
                val draft = etReply.text?.toString()?.trim()
                dialog.dismiss()
                openSmsConversation(targetPhone, draft)
            }
        } else {
            btnCallNow.visibility = View.GONE
            btnOpenSms.visibility = View.GONE
        }

        val isKakaoSheet = currentSheetName.contains("카카오톡")
        val kakaoSession = KakaoReplySessionCache.findSession(targetName, summary.primaryTitle)
        if (isKakaoSheet || kakaoSession != null) {
            btnOpenKakao.visibility = View.VISIBLE
            btnOpenKakao.text = if (kakaoSession?.canOpenChatRoom == true) "💛 해당 카톡방 열기" else "💛 카카오톡 열기"
            btnOpenKakao.setOnClickListener {
                dialog.dismiss()
                if (kakaoSession != null && kakaoSession.canOpenChatRoom && KakaoReplySessionCache.openChatRoom(kakaoSession)) {
                    return@setOnClickListener
                }
                val launchIntent = packageManager.getLaunchIntentForPackage("com.kakao.talk")
                if (launchIntent != null) startActivity(launchIntent)
            }
        } else {
            btnOpenKakao.visibility = View.GONE
        }

        // 빠른 문자/카톡 답장 + ✨ AI 추천 문구
        val canReplyViaKakao = isKakaoSheet && kakaoSession?.canDirectReply == true
        val canReplyViaSms = targetPhone != null && ContactHelper.isMobilePhoneNumber(targetPhone)

        if (canReplyViaKakao || canReplyViaSms) {
            layoutQuickReplyBox.visibility = View.VISIBLE
            if (canReplyViaKakao) {
                tvQuickReplyHeader.text = "💛 카카오톡 바로 답장 (${kakaoSession?.chatRoomName ?: targetName ?: "채팅방"})"
                etReply.hint = "카카오톡 답장 내용을 입력하세요..."
                btnSendReply.text = "카톡 전송"
            } else {
                tvQuickReplyHeader.text = "⚡ 문자(SMS) 바로 답장 ($targetPhone)"
                etReply.hint = "답장 문자 내용을 입력하세요..."
                btnSendReply.text = "문자 전송"
            }

            val sourceTypeForAi = when {
                isRecordingSheet -> "CALL_RECORDING"
                currentSheetName.contains("부재중") -> "MISSED_CALL"
                isKakaoSheet -> "KAKAO"
                else -> "SMS"
            }
            val contextTitle = "${summary.primaryTitle} ${summary.bodyText}".trim()
            val cacheKey = "${currentSheetName}_${summary.serial}_${targetName.orEmpty()}"
            var lastAutoFilled: String? = null

            fun renderChips(list: List<String>, isAi: Boolean) {
                layoutTemplates.removeAllViews()
                for ((idx, tpl) in list.withIndex()) {
                    val chip = TextView(this).apply {
                        text = if (isAi) "✨ $tpl" else tpl
                        setTextColor(Color.parseColor(if (isAi) "#E0E7FF" else "#E2E8F0"))
                        textSize = 11f
                        setBackgroundResource(R.drawable.bg_badge_version)
                        backgroundTintList = ColorStateList.valueOf(
                            Color.parseColor(if (isAi && idx == 0) "#3730A3" else "#334155")
                        )
                        setPadding(26, 14, 26, 14)
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply { marginEnd = 16 }
                        setOnClickListener {
                            etReply.setText(tpl)
                            etReply.setSelection(tpl.length)
                            lastAutoFilled = tpl
                        }
                    }
                    layoutTemplates.addView(chip)
                }
                val cur = etReply.text?.toString()?.trim().orEmpty()
                if (list.isNotEmpty() && (cur.isEmpty() || cur == lastAutoFilled)) {
                    val first = list.first()
                    etReply.setText(first)
                    etReply.setSelection(first.length)
                    lastAutoFilled = first
                }
            }

            fun requestAiSuggestions(forceRefresh: Boolean) {
                if (!forceRefresh) {
                    val cached = aiReplyCache[cacheKey]
                    if (!cached.isNullOrEmpty()) {
                        renderChips(cached, isAi = true)
                        return
                    }
                } else {
                    aiReplyCache.remove(cacheKey)
                }
                btnAiSuggestReply.isEnabled = false
                btnAiSuggestReply.text = "⏳ AI 문구 작성 중..."

                lifecycleScope.launch {
                    val aiList = ApiClient.suggestTaskReplies(
                        userEmail = prefs.userEmail.orEmpty(),
                        title = if (forceRefresh) "$contextTitle (새로운 표현으로 추천)" else contextTitle,
                        description = allFieldsText,
                        contactName = targetName,
                        sourceType = sourceTypeForAi,
                        phoneNumber = currentPhoneNumber
                    )
                    if (!dialog.isShowing) return@launch
                    btnAiSuggestReply.isEnabled = true
                    btnAiSuggestReply.text = "✨ AI 맞춤 문구 재생성"
                    if (aiList.isNotEmpty()) {
                        aiReplyCache[cacheKey] = aiList
                        renderChips(aiList, isAi = true)
                    }
                }
            }

            val cachedInit = aiReplyCache[cacheKey]
            if (!cachedInit.isNullOrEmpty()) {
                renderChips(cachedInit, isAi = true)
            } else {
                val localInit = ApiClient.buildSmartLocalSuggestions(contextTitle, targetName, sourceTypeForAi)
                renderChips(localInit, isAi = false)
                requestAiSuggestions(forceRefresh = false)
            }

            btnAiSuggestReply.setOnClickListener { requestAiSuggestions(forceRefresh = true) }

            btnSendReply.setOnClickListener {
                val msgText = etReply.text?.toString()?.trim().orEmpty()
                if (msgText.isBlank()) {
                    Toast.makeText(this, "답장할 내용을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                if (canReplyViaKakao && kakaoSession != null) {
                    val sent = KakaoReplySessionCache.sendDirectReply(this, kakaoSession, msgText)
                    if (sent) {
                        Toast.makeText(this, "💛 카카오톡 답장을 전송했습니다.", Toast.LENGTH_SHORT).show()
                        dialog.dismiss()
                    } else {
                        dialog.dismiss()
                        val launchIntent = packageManager.getLaunchIntentForPackage("com.kakao.talk")
                        if (launchIntent != null) startActivity(launchIntent)
                    }
                } else if (targetPhone != null) {
                    val (sent, _) = SmsSenderUtil.sendSmsDetailed(this, targetPhone, msgText)
                    if (sent) {
                        Toast.makeText(this, "📲 답장 문자를 발송했습니다.", Toast.LENGTH_SHORT).show()
                        dialog.dismiss()
                    } else {
                        dialog.dismiss()
                        openSmsConversation(targetPhone, msgText)
                    }
                }
            }

            if (focusQuickReply) {
                etReply.requestFocus()
            }
        } else {
            layoutQuickReplyBox.visibility = View.GONE
        }

        // 하단 버튼: 클립보드 복사 & 닫기
        btnToggleDone.text = "📋 이 항목 내용 전체 복사하기"
        btnToggleDone.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#334155"))
        btnToggleDone.setOnClickListener {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText(currentSheetName, allFieldsText.ifBlank { summary.primaryTitle }))
            Toast.makeText(this, "📋 클립보드에 복사되었습니다.", Toast.LENGTH_SHORT).show()
            dialog.dismiss()
        }

        dialog.behavior.apply {
            state = BottomSheetBehavior.STATE_EXPANDED
            skipCollapsed = true
        }
        dialog.show()
    }

    data class RowPresentation(
        val serial: String,
        val dateTime: String,
        val badge: String,
        val primaryTitle: String,
        val secondarySubtitle: String,
        val bodyText: String,
        val contactName: String,
        val phoneNumber: String,
        val amountText: String,
        val extraPairs: List<Pair<String, String>>
    )

    private fun optCleanString(obj: JSONObject, key: String): String {
        if (!obj.has(key) || obj.isNull(key)) return ""
        val v = obj.optString(key, "").trim()
        return if (v.equals("null", ignoreCase = true) || v.equals("undefined", ignoreCase = true)) "" else v
    }

    private fun extractRowPresentation(
        rowObj: JSONObject,
        headers: List<String>,
        fallbackIndex: Int
    ): RowPresentation {
        val usedKeys = mutableSetOf<String>()

        fun pickFirst(candidates: List<String>): String {
            for (c in candidates) {
                val v = optCleanString(rowObj, c)
                if (v.isNotBlank()) {
                    usedKeys.add(c)
                    return v
                }
            }
            return ""
        }

        val serial = pickFirst(listOf("일련번호", "번호", "No", "id")).ifBlank { fallbackIndex.toString() }
        val dateTime = pickFirst(
            listOf(
                "등록일시", "통화일시", "수신일시", "부재중일시", "일시", "발송일시",
                "거래일자", "주문일시", "발행일시", "회의일시", "검토일시", "업로드일시", "점검일시", "갱신일시"
            )
        )
        val badge = pickFirst(
            listOf("구분", "상태", "회신상태", "발송상태", "결제수단", "리스크수준", "뱃지", "중요도", "장애여부")
        )
        val contactName = pickFirst(
            listOf("성함", "성명", "이름", "상대방", "상대방이름", "연락처이름", "고객명", "수신자명", "채팅방/발신자", "고객/가맹점명", "대표자")
        )
        val companyOrTitle = pickFirst(
            listOf("회사명", "상호", "기업명", "회사/상호", "직함", "직함/부서", "금융사/채널")
        )
        val phoneNumber = pickFirst(
            listOf("휴대폰", "발신번호", "전화번호", "연락처", "휴대전화", "유선전화")
        )
        val amountText = pickFirst(
            listOf("합계금액", "금액", "결제금액", "공급가액")
        )
        val docOrTaskTitle = pickFirst(
            listOf("할일제목", "제목", "회의제목", "문서/질의제목", "포스트제목", "파일명", "대상URL")
        )
        val bodyText = pickFirst(
            listOf(
                "요약내용", "AI요약", "핵심요약", "법률검토요약",
                "메시지내용", "자동회신내용", "발송문구", "발송할문자내용",
                "품목", "품목내역", "견적내용", "거래내용", "주요결정사항", "권고사항", "상세정보", "메모", "비고"
            )
        )

        val primaryTitle = when {
            contactName.isNotBlank() && companyOrTitle.isNotBlank() -> "$contactName ($companyOrTitle)"
            contactName.isNotBlank() -> contactName
            companyOrTitle.isNotBlank() -> companyOrTitle
            docOrTaskTitle.isNotBlank() -> docOrTaskTitle
            bodyText.isNotBlank() -> bodyText.take(40)
            else -> "항목 #$serial"
        }

        val secondaryParts = mutableListOf<String>()
        if (phoneNumber.isNotBlank()) secondaryParts.add("📞 $phoneNumber")
        if (amountText.isNotBlank()) secondaryParts.add("💰 $amountText")
        if (docOrTaskTitle.isNotBlank() && docOrTaskTitle != primaryTitle) secondaryParts.add(docOrTaskTitle)

        val extraPairs = mutableListOf<Pair<String, String>>()
        val keysToScan = if (headers.isNotEmpty()) headers else {
            val l = mutableListOf<String>()
            val it = rowObj.keys()
            while (it.hasNext()) l.add(it.next())
            l
        }
        for (k in keysToScan) {
            if (k in usedKeys || k.startsWith("_")) continue
            val v = optCleanString(rowObj, k)
            if (v.isNotBlank()) {
                extraPairs.add(k to v)
                if (extraPairs.size >= 3) break
            }
        }

        return RowPresentation(
            serial = serial,
            dateTime = dateTime,
            badge = badge,
            primaryTitle = primaryTitle,
            secondarySubtitle = secondaryParts.joinToString("  •  "),
            bodyText = if (bodyText == primaryTitle) "" else bodyText,
            contactName = contactName,
            phoneNumber = phoneNumber,
            amountText = amountText,
            extraPairs = extraPairs
        )
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    /**
     * 🃏 모바일 최적화 카드 리스트 어댑터
     */
    inner class FtsRowCardAdapter(
        private val onRowClick: (JSONObject, Int) -> Unit,
        private val onCallClick: (String) -> Unit,
        private val onSmsClick: (JSONObject, Int) -> Unit,
        private val onPlayAudioClick: (JSONObject, Int) -> Unit
    ) : RecyclerView.Adapter<FtsRowCardAdapter.RowCardViewHolder>() {

        private var sheetName: String = ""
        private var headers: List<String> = emptyList()
        private var items: List<JSONObject> = emptyList()

        fun submitData(newSheetName: String, newHeaders: List<String>, newItems: List<JSONObject>) {
            sheetName = newSheetName
            headers = newHeaders
            items = newItems
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RowCardViewHolder {
            val cardLayout = LinearLayout(parent.context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(14), dp(12), dp(14), dp(12))
                background = GradientDrawable().apply {
                    cornerRadius = dp(12).toFloat()
                    setColor(Color.parseColor("#1E293B"))
                    setStroke(dp(1), Color.parseColor("#334155"))
                }
                val lp = RecyclerView.LayoutParams(
                    RecyclerView.LayoutParams.MATCH_PARENT,
                    RecyclerView.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dp(10)
                }
                layoutParams = lp
                isClickable = true
                isFocusable = true
            }
            return RowCardViewHolder(cardLayout)
        }

        override fun getItemCount(): Int = items.size

        override fun onBindViewHolder(holder: RowCardViewHolder, position: Int) {
            val rowObj = items[position]
            val fallbackNum = items.size - position
            holder.bind(rowObj, fallbackNum)
        }

        inner class RowCardViewHolder(private val root: LinearLayout) : RecyclerView.ViewHolder(root) {
            fun bind(rowObj: JSONObject, fallbackNum: Int) {
                root.removeAllViews()
                val p = extractRowPresentation(rowObj, headers, fallbackNum)

                // 1. 상단 메타 바 (#일련번호 | 구분/상태 뱃지 | 일시)
                val topRow = LinearLayout(root.context).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                }

                val serialBadge = TextView(root.context).apply {
                    text = "#${p.serial}"
                    setTextColor(Color.parseColor("#38BDF8"))
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                    setTypeface(typeface, Typeface.BOLD)
                    setPadding(dp(8), dp(2), dp(8), dp(2))
                    background = GradientDrawable().apply {
                        cornerRadius = dp(6).toFloat()
                        setColor(Color.parseColor("#0C4A6E"))
                    }
                }
                topRow.addView(serialBadge)

                if (p.badge.isNotBlank()) {
                    val stateBadge = TextView(root.context).apply {
                        text = p.badge
                        setTextColor(Color.parseColor("#E0E7FF"))
                        setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
                        setTypeface(typeface, Typeface.BOLD)
                        setPadding(dp(8), dp(2), dp(8), dp(2))
                        background = GradientDrawable().apply {
                            cornerRadius = dp(6).toFloat()
                            setColor(Color.parseColor("#312E81"))
                        }
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply { marginStart = dp(6) }
                    }
                    topRow.addView(stateBadge)
                }

                val dateTv = TextView(root.context).apply {
                    text = p.dateTime
                    setTextColor(Color.parseColor("#94A3B8"))
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                    gravity = Gravity.END
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }
                topRow.addView(dateTv)
                root.addView(topRow)

                // 2. 메인 타이틀 (성함/상호/상대방/제목)
                val titleTv = TextView(root.context).apply {
                    text = p.primaryTitle
                    setTextColor(Color.parseColor("#F8FAFC"))
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
                    setTypeface(typeface, Typeface.BOLD)
                    maxLines = 2
                    ellipsize = TextUtils.TruncateAt.END
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { topMargin = dp(8) }
                }
                root.addView(titleTv)

                // 3. 서브타이틀 (전화번호 / 금액 / 파일명 등)
                if (p.secondarySubtitle.isNotBlank()) {
                    val subTv = TextView(root.context).apply {
                        text = p.secondarySubtitle
                        setTextColor(Color.parseColor("#60A5FA"))
                        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
                        setTypeface(typeface, Typeface.BOLD)
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply { topMargin = dp(4) }
                    }
                    root.addView(subTv)
                }

                // 4. 본문 요약 내용 (통화 요약, 문자/카톡 본문, 품목 등)
                if (p.bodyText.isNotBlank()) {
                    val bodyTv = TextView(root.context).apply {
                        text = p.bodyText
                        setTextColor(Color.parseColor("#CBD5E1"))
                        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                        setLineSpacing(0f, 1.25f)
                        maxLines = 3
                        ellipsize = TextUtils.TruncateAt.END
                        setPadding(dp(10), dp(8), dp(10), dp(8))
                        background = GradientDrawable().apply {
                            cornerRadius = dp(8).toFloat()
                            setColor(Color.parseColor("#0F172A"))
                        }
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply { topMargin = dp(8) }
                    }
                    root.addView(bodyTv)
                }

                // 5. 추가 필드 요약 (이메일, 주소, 기기명 등)
                if (p.extraPairs.isNotEmpty()) {
                    val extraText = p.extraPairs.joinToString("  |  ") { "${it.first}: ${it.second}" }
                    val extraTv = TextView(root.context).apply {
                        text = extraText
                        setTextColor(Color.parseColor("#94A3B8"))
                        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
                        maxLines = 2
                        ellipsize = TextUtils.TruncateAt.END
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply { topMargin = dp(6) }
                    }
                    root.addView(extraTv)
                }

                // 6. 하단 퀵 액션 바 (전화 / 문자 답장 / 녹음 듣기 / 상세 보기)
                val actionRow = LinearLayout(root.context).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { topMargin = dp(10) }
                }

                val isRec = sheetName.contains("통화녹음") || sheetName.contains("회의록")
                if (isRec) {
                    val playBtn = createQuickActionChip("🎧 녹음 듣기", "#065F46", "#6EE7B7") {
                        onPlayAudioClick(rowObj, fallbackNum)
                    }
                    actionRow.addView(playBtn)
                }

                if (p.phoneNumber.isNotBlank()) {
                    val callBtn = createQuickActionChip("📞 전화", "#1E3A8A", "#93C5FD") {
                        onCallClick(p.phoneNumber)
                    }
                    actionRow.addView(callBtn)

                    if (ContactHelper.isMobilePhoneNumber(p.phoneNumber)) {
                        val smsBtn = createQuickActionChip("💬 AI 답장", "#312E81", "#C7D2FE") {
                            onSmsClick(rowObj, fallbackNum)
                        }
                        actionRow.addView(smsBtn)
                    }
                }

                val spacer = View(root.context).apply {
                    layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
                }
                actionRow.addView(spacer)

                val detailTv = TextView(root.context).apply {
                    text = "상세 보기 ›"
                    setTextColor(Color.parseColor("#94A3B8"))
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
                    setTypeface(typeface, Typeface.BOLD)
                }
                actionRow.addView(detailTv)

                root.addView(actionRow)
                root.setOnClickListener { onRowClick(rowObj, fallbackNum) }
            }

            private fun createQuickActionChip(
                label: String,
                bgHex: String,
                textHex: String,
                onClick: () -> Unit
            ): TextView {
                return TextView(root.context).apply {
                    text = label
                    setTextColor(Color.parseColor(textHex))
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                    setTypeface(typeface, Typeface.BOLD)
                    setPadding(dp(10), dp(5), dp(10), dp(5))
                    background = GradientDrawable().apply {
                        cornerRadius = dp(99).toFloat()
                        setColor(Color.parseColor(bgHex))
                    }
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { marginEnd = dp(6) }
                    setOnClickListener { onClick() }
                }
            }
        }
    }
}
