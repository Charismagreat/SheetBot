package cloud.sheetbot.agent.user

import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
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
import androidx.activity.result.contract.ActivityResultContracts
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
import java.io.FileOutputStream

/**
 * ⚡ 파일투시트(FileToSheet) 통합 워크스페이스 & 모바일 스마트 대장/결재/적재 센터
 * - 파투의 모든 프로젝트(일반 프로젝트 + 시트봇 연동 장부) 및 하위 모든 시트를 앱 내에서 0.2초 만에 탐색
 * - 행 단위 승인(APPROVED) / 보류(HELD) / 반려(REJECTED) + 결재 사유 입력 및 상태별 필터링 완벽 지원
 * - 현재 보고 있는 시트에 카메라 촬영 / 파일(사진·PDF·엑셀) 업로드 AI 자동 적재 및 수동 행 입력 지원
 * - 기본 '🃏 모바일 카드형 뷰'와 '📊 표(Table) 보기 뷰' 토글, 통화녹음 듣기, 전화/문자(AI 추천 문구) 원스톱 연동
 */
class FtsSheetViewerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_SHEET_TYPE = "extra_sheet_type"
        const val EXTRA_SHEET_NAME = "extra_sheet_name"
        const val EXTRA_TOKEN = "extra_token"
        const val EXTRA_PROJECT_ID = "extra_project_id"
        const val EXTRA_PHONE_NUMBER = "extra_phone_number"
        const val EXTRA_AUTO_OPEN_INGEST = "extra_auto_open_ingest"
        const val EXTRA_INITIAL_APPROVAL_FILTER = "extra_initial_approval_filter"
    }

    private lateinit var prefs: PreferencesManager
    private lateinit var tvViewerTitle: TextView
    private lateinit var tvViewerSubtitle: TextView
    private lateinit var btnToggleViewMode: TextView
    private lateinit var btnRefreshSheet: TextView
    private lateinit var btnOpenFtsWeb: TextView
    private lateinit var layoutProjectTabs: LinearLayout
    private lateinit var layoutSheetTabs: LinearLayout
    private lateinit var etSearchRows: EditText
    private lateinit var btnClearSearch: TextView
    private lateinit var btnUploadToCurrentSheet: TextView
    private lateinit var chipFilterAll: TextView
    private lateinit var chipFilterPending: TextView
    private lateinit var chipFilterApproved: TextView
    private lateinit var chipFilterHeld: TextView
    private lateinit var chipFilterRejected: TextView
    private lateinit var tvRowCountBadge: TextView
    private lateinit var layoutViewerInlineLoading: LinearLayout
    private lateinit var layoutCenterLoadingOverlay: LinearLayout
    private lateinit var tvCenterLoadingTitle: TextView
    private lateinit var tvCenterLoadingSubtitle: TextView
    private lateinit var rvSheetCards: RecyclerView
    private lateinit var scrollTableVertical: ScrollView
    private lateinit var tableSheetData: TableLayout
    private lateinit var layoutEmptyState: LinearLayout
    private lateinit var tvEmptyTitle: TextView
    private lateinit var tvEmptySubtitle: TextView

    private lateinit var cardAdapter: FtsRowCardAdapter

    private var currentSheetType: String = ""
    private var currentSheetName: String = ""
    private var currentToken: String = ""
    private var currentProjectId: String = ""
    private var currentPhoneNumber: String = ""
    private var currentProjectName: String = "시트봇 연동 장부"

    private var allProjects: List<FileToSheetClient.FtsWorkspaceProjectInfo> = emptyList()
    private var currentHeaders: List<String> = emptyList()
    private var allRows: List<JSONObject> = emptyList()
    private var filteredRows: List<JSONObject> = emptyList()
    private var currentOriginalFiles: List<FileToSheetClient.FtsOriginalFileInfo> = emptyList()

    private var currentApprovalFilter: String = "ALL" // ALL, PENDING, APPROVED, HELD, REJECTED
    private var isTableMode: Boolean = false
    private var autoOpenIngestPending: Boolean = false
    private var pendingUploadOcrType: String? = null
    private var loadJob: Job? = null

    private var activeMediaPlayer: MediaPlayer? = null
    private var audioProgressJob: Job? = null
    private val aiReplyCache = mutableMapOf<String, List<String>>()

    // 📸 카메라 촬영 런처 (1600px / 85% JPEG 경량화 후 현재 시트에 AI 적재)
    private val takePictureLauncher = registerForActivityResult(
        ActivityResultContracts.TakePicturePreview()
    ) { bitmap: Bitmap? ->
        if (bitmap != null) {
            handleCapturedBitmapUpload(bitmap)
        }
    }

    // 📎 파일/갤러리 선택 런처 (이미지인 경우 1600px/85% 압축 후 현재 시트에 AI 적재)
    private val pickFileLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            handlePickedFileUpload(uri)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_fts_sheet_viewer)

        prefs = PreferencesManager(this)

        currentSheetType = intent.getStringExtra(EXTRA_SHEET_TYPE).orEmpty()
        currentSheetName = intent.getStringExtra(EXTRA_SHEET_NAME)?.takeIf { it.isNotBlank() }
            ?: FileToSheetClient.resolveSheetSpec(currentSheetType)?.sheetName
            ?: ""
        currentToken = intent.getStringExtra(EXTRA_TOKEN).orEmpty()
        currentProjectId = intent.getStringExtra(EXTRA_PROJECT_ID)?.takeIf { it.isNotBlank() }
            ?: prefs.ftsProjectId.orEmpty()
        currentPhoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER)?.takeIf { it.isNotBlank() }
            ?: prefs.ftsPhoneNumber?.replace("[^0-9]".toRegex(), "").orEmpty()
        autoOpenIngestPending = intent.getBooleanExtra(EXTRA_AUTO_OPEN_INGEST, false)
        intent.getStringExtra(EXTRA_INITIAL_APPROVAL_FILTER)?.takeIf { it.isNotBlank() }?.let {
            currentApprovalFilter = it
        }

        bindViews()
        setupRecyclerView()
        setupSearchAndButtons()
        setupApprovalFilterChips()

        loadWorkspaceData(
            targetProjectId = currentProjectId.takeIf { it.isNotBlank() },
            targetSheetName = currentSheetName.takeIf { it.isNotBlank() }
        )
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
        layoutProjectTabs = findViewById(R.id.layoutProjectTabs)
        layoutSheetTabs = findViewById(R.id.layoutSheetTabs)
        etSearchRows = findViewById(R.id.etSearchRows)
        btnClearSearch = findViewById(R.id.btnClearSearch)
        btnUploadToCurrentSheet = findViewById(R.id.btnUploadToCurrentSheet)
        chipFilterAll = findViewById(R.id.chipFilterAll)
        chipFilterPending = findViewById(R.id.chipFilterPending)
        chipFilterApproved = findViewById(R.id.chipFilterApproved)
        chipFilterHeld = findViewById(R.id.chipFilterHeld)
        chipFilterRejected = findViewById(R.id.chipFilterRejected)
        tvRowCountBadge = findViewById(R.id.tvRowCountBadge)
        layoutViewerInlineLoading = findViewById(R.id.layoutViewerInlineLoading)
        layoutCenterLoadingOverlay = findViewById(R.id.layoutCenterLoadingOverlay)
        tvCenterLoadingTitle = findViewById(R.id.tvCenterLoadingTitle)
        tvCenterLoadingSubtitle = findViewById(R.id.tvCenterLoadingSubtitle)
        rvSheetCards = findViewById(R.id.rvSheetCards)
        scrollTableVertical = findViewById(R.id.scrollTableVertical)
        tableSheetData = findViewById(R.id.tableSheetData)
        layoutEmptyState = findViewById(R.id.layoutEmptyState)
        tvEmptyTitle = findViewById(R.id.tvEmptyTitle)
        tvEmptySubtitle = findViewById(R.id.tvEmptySubtitle)

        if (currentSheetName.isNotBlank()) {
            tvViewerTitle.text = "📊 $currentSheetName"
        }
        updateIngestButtonForCurrentSheet()
    }

    /**
     * 🎯 현재 선택된 시트의 성격에 맞춰 우측 상단 적재 버튼(btnUploadToCurrentSheet)의 문구와 색상을 동적으로 전환합니다.
     */
    private fun updateIngestButtonForCurrentSheet() {
        val sheet = currentSheetName.trim()
        val (btnLabel, tintHex) = when {
            sheet.contains("통화녹음") || sheet.contains("회의록") -> "🎙️ 녹음 적재" to "#059669"
            sheet.contains("명함관리") || (sheet.contains("명함") && !sheet.contains("발송")) -> "🪪 명함 등록" to "#4F46E5"
            sheet.contains("영수증") -> "🧾 영수증 등록" to "#0284C7"
            sheet.contains("카카오톡") -> "💬 대화 적재" to "#D97706"
            sheet.contains("문자송수신") || sheet.contains("부재중") || sheet.contains("명함발송") || sheet.contains("결제입금") ->
                "➕ 내역 추가" to "#475569"
            else -> "📤 파일 적재" to "#2563EB"
        }
        btnUploadToCurrentSheet.text = btnLabel
        btnUploadToCurrentSheet.backgroundTintList = ColorStateList.valueOf(Color.parseColor(tintHex))
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
            },
            onApprovalAction = { rowObj, nextStatus ->
                handleRowApprovalClick(rowObj, nextStatus, onDone = null)
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
            loadWorkspaceData(
                targetProjectId = currentProjectId.takeIf { it.isNotBlank() },
                targetSheetName = currentSheetName.takeIf { it.isNotBlank() },
                forceRefresh = true
            )
        }

        btnOpenFtsWeb.setOnClickListener {
            openCurrentSheetInWeb()
        }

        btnUploadToCurrentSheet.setOnClickListener {
            showIngestActionDialog()
        }

        etSearchRows.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val q = s?.toString()?.trim().orEmpty()
                btnClearSearch.visibility = if (q.isNotEmpty()) View.VISIBLE else View.GONE
                applyFilters()
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        btnClearSearch.setOnClickListener {
            etSearchRows.setText("")
        }
    }

    private fun setupApprovalFilterChips() {
        val setFilter = { filter: String ->
            currentApprovalFilter = filter
            updateApprovalFilterChipStyles()
            applyFilters()
        }
        chipFilterAll.setOnClickListener { setFilter("ALL") }
        chipFilterPending.setOnClickListener { setFilter("PENDING") }
        chipFilterApproved.setOnClickListener { setFilter("APPROVED") }
        chipFilterHeld.setOnClickListener { setFilter("HELD") }
        chipFilterRejected.setOnClickListener { setFilter("REJECTED") }
    }

    private fun updateApprovalFilterChipStyles() {
        var cPending = 0
        var cApproved = 0
        var cHeld = 0
        var cRejected = 0
        for (r in allRows) {
            when (optCleanString(r, "_approvalStatus").uppercase()) {
                "APPROVED" -> cApproved++
                "HELD" -> cHeld++
                "REJECTED" -> cRejected++
                else -> cPending++
            }
        }
        chipFilterAll.text = "전체 (${allRows.size})"
        chipFilterPending.text = "⏳ 대기 ($cPending)"
        chipFilterApproved.text = "✅ 승인 ($cApproved)"
        chipFilterHeld.text = "🟠 보류 ($cHeld)"
        chipFilterRejected.text = "🚫 반려 ($cRejected)"

        fun styleChip(tv: TextView, active: Boolean, activeColor: String) {
            tv.setTextColor(Color.parseColor(if (active) "#FFFFFF" else "#CBD5E1"))
            tv.setTypeface(null, if (active) Typeface.BOLD else Typeface.NORMAL)
            tv.backgroundTintList = ColorStateList.valueOf(
                Color.parseColor(if (active) activeColor else "#1E293B")
            )
        }

        styleChip(chipFilterAll, currentApprovalFilter == "ALL", "#2563EB")
        styleChip(chipFilterPending, currentApprovalFilter == "PENDING", "#475569")
        styleChip(chipFilterApproved, currentApprovalFilter == "APPROVED", "#059669")
        styleChip(chipFilterHeld, currentApprovalFilter == "HELD", "#D97706")
        styleChip(chipFilterRejected, currentApprovalFilter == "REJECTED", "#E11D48")
    }

    private fun showCenterLoading(title: String, subtitle: String) {
        tvCenterLoadingTitle.text = title
        tvCenterLoadingSubtitle.text = subtitle
        layoutCenterLoadingOverlay.visibility = View.VISIBLE
    }

    private fun hideCenterLoading() {
        layoutCenterLoadingOverlay.visibility = View.GONE
    }

    /**
     * 📂 전체 프로젝트 목록 및 선택된 프로젝트/시트 데이터 로드
     */
    private fun loadWorkspaceData(
        targetProjectId: String?,
        targetSheetName: String?,
        forceRefresh: Boolean = false
    ) {
        loadJob?.cancel()
        val displayProj = currentProjectName.ifBlank { "파일투시트" }
        val displaySheet = (targetSheetName ?: currentSheetName).ifBlank { "시트" }
        showCenterLoading(
            title = "⏳ [$displaySheet] 데이터를 불러오는 중...",
            subtitle = "프로젝트: $displayProj • 최신 내역을 동기화하고 있습니다."
        )
        CardInlineLoadingHelper.show(
            container = layoutViewerInlineLoading,
            message = "⚡ [$displayProj > $displaySheet] 데이터를 불러오는 중..."
        )

        loadJob = lifecycleScope.launch {
            try {
                // 탭 전환 시 로딩 오버레이가 최소 1프레임 이상 명확히 인지되도록 보장
                delay(40L)

                val wsRes = FileToSheetClient.fetchAllWorkspaceProjects(
                    phoneNumber = currentPhoneNumber,
                    targetProjectId = targetProjectId,
                    targetSheetName = targetSheetName,
                    forceRefresh = forceRefresh
                )

                if (wsRes.success && wsRes.projects.isNotEmpty()) {
                    CardInlineLoadingHelper.hide(layoutViewerInlineLoading)
                    hideCenterLoading()

                    allProjects = wsRes.projects
                    currentProjectId = wsRes.activeProjectId
                    currentProjectName = wsRes.activeProjectName
                    currentSheetName = wsRes.activeSheetName
                    currentHeaders = wsRes.headers
                    currentOriginalFiles = wsRes.originalFiles

                    // 최신 항목이 위에 오도록 역순 정렬 (_rawRowIndex는 보존됨)
                    allRows = wsRes.rows.reversed()

                    tvViewerTitle.text = "📊 ${currentSheetName.ifBlank { currentProjectName }}"
                    tvViewerSubtitle.text = "📁 $currentProjectName • 총 ${allRows.size}건 (프로젝트 ${allProjects.size}개)"
                    updateIngestButtonForCurrentSheet()

                    renderProjectTabs()
                    renderSheetTabs()
                    updateApprovalFilterChipStyles()
                    applyFilters()
                    rvSheetCards.scrollToPosition(0)

                    if (autoOpenIngestPending) {
                        autoOpenIngestPending = false
                        showIngestActionDialog()
                    }
                } else {
                    // 폴백: 단일 토큰 기반 조회
                    fallbackSingleSheetLoad(targetSheetName ?: currentSheetName)
                }
            } catch (e: Exception) {
                CardInlineLoadingHelper.hide(layoutViewerInlineLoading)
                hideCenterLoading()
                Toast.makeText(this@FtsSheetViewerActivity, "데이터 조회 오류: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private suspend fun fallbackSingleSheetLoad(sheetName: String) {
        val cleanName = sheetName.ifBlank { "통화녹음대장" }
        val cardId = resolveCardIdBySheetName(cleanName)
        var tokenToUse = currentToken.ifBlank { prefs.getFtsTokenFor(cardId).orEmpty() }

        if (tokenToUse.isBlank() && currentPhoneNumber.length >= 10) {
            val ensureRes = FileToSheetClient.ensureSheet(
                phoneNumber = currentPhoneNumber,
                cardId = cardId,
                sheetName = cleanName,
                headers = FileToSheetClient.CARD_SHEET_SPECS[cardId]?.headers,
                projectId = currentProjectId.takeIf { it.isNotBlank() }
            )
            if (ensureRes.success && !ensureRes.token.isNullOrBlank()) {
                tokenToUse = ensureRes.token
                currentToken = ensureRes.token
            }
        }

        val detail = FileToSheetClient.fetchSheetDataDetail(token = tokenToUse, overrideSheetName = cleanName)
        CardInlineLoadingHelper.hide(layoutViewerInlineLoading)
        hideCenterLoading()

        if (detail.success) {
            currentSheetName = detail.sheetName.ifBlank { cleanName }
            currentProjectName = detail.projectName.ifBlank { "시트봇 연동 장부" }
            detail.projectId?.takeIf { it.isNotBlank() }?.let { currentProjectId = it }
            currentHeaders = detail.headers
            allRows = detail.rows.mapIndexed { idx, obj ->
                val c = JSONObject(obj.toString())
                c.put("_rawRowIndex", idx)
                c
            }.reversed()
            tvViewerTitle.text = "📊 $currentSheetName"
            tvViewerSubtitle.text = "📁 $currentProjectName • 총 ${allRows.size}건"
            updateIngestButtonForCurrentSheet()
            updateApprovalFilterChipStyles()
            applyFilters()
        } else {
            allRows = emptyList()
            updateIngestButtonForCurrentSheet()
            updateApprovalFilterChipStyles()
            applyFilters()
        }
    }

    private fun renderProjectTabs() {
        layoutProjectTabs.removeAllViews()
        for (proj in allProjects) {
            val isSelected = proj.id == currentProjectId
            val pendingBadge = if (proj.pendingCount > 0) " • 대기 ${proj.pendingCount}" else ""
            val label = "📁 ${proj.name} (${proj.sheets.size}시트$pendingBadge)"
            val chip = TextView(this).apply {
                text = label
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                setTypeface(typeface, if (isSelected) Typeface.BOLD else Typeface.NORMAL)
                setTextColor(Color.parseColor(if (isSelected) "#FFFFFF" else "#CBD5E1"))
                gravity = Gravity.CENTER
                includeFontPadding = false
                setSingleLine(true)
                maxLines = 1
                minHeight = dp(32)
                setPadding(dp(12), dp(6), dp(12), dp(6))
                background = GradientDrawable().apply {
                    cornerRadius = dp(99).toFloat()
                    setColor(Color.parseColor(if (isSelected) "#0F766E" else "#1E293B"))
                    setStroke(dp(1), Color.parseColor(if (isSelected) "#2DD4BF" else "#334155"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { marginEnd = dp(8) }
                setOnClickListener {
                    if (currentProjectId != proj.id) {
                        currentProjectId = proj.id
                        currentProjectName = proj.name
                        val firstSheet = proj.sheets.firstOrNull()?.name.orEmpty()
                        currentSheetName = firstSheet
                        // 터치 즉시 탭 선택 하이라이트 및 상단 타이틀/적재버튼 갱신
                        tvViewerTitle.text = "📊 ${firstSheet.ifBlank { proj.name }}"
                        tvViewerSubtitle.text = "⏳ [${proj.name}] 시트 데이터를 불러오는 중..."
                        updateIngestButtonForCurrentSheet()
                        renderProjectTabs()
                        renderSheetTabs()
                        loadWorkspaceData(targetProjectId = proj.id, targetSheetName = firstSheet, forceRefresh = false)
                    }
                }
            }
            layoutProjectTabs.addView(chip)
        }
    }

    private fun renderSheetTabs() {
        layoutSheetTabs.removeAllViews()
        val activeProj = allProjects.firstOrNull { it.id == currentProjectId }
        val sheetsToShow = activeProj?.sheets ?: emptyList()

        for (sheet in sheetsToShow) {
            val isSelected = sheet.name == currentSheetName
            val label = "${sheet.name} (${sheet.rowCount})"
            val chip = TextView(this).apply {
                text = label
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                setTypeface(typeface, if (isSelected) Typeface.BOLD else Typeface.NORMAL)
                setTextColor(Color.parseColor(if (isSelected) "#FFFFFF" else "#94A3B8"))
                gravity = Gravity.CENTER
                includeFontPadding = false
                setSingleLine(true)
                maxLines = 1
                minHeight = dp(32)
                setPadding(dp(12), dp(6), dp(12), dp(6))
                background = GradientDrawable().apply {
                    cornerRadius = dp(99).toFloat()
                    setColor(Color.parseColor(if (isSelected) "#2563EB" else "#1E293B"))
                    setStroke(dp(1), Color.parseColor(if (isSelected) "#60A5FA" else "#334155"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { marginEnd = dp(8) }
                setOnClickListener {
                    if (currentSheetName != sheet.name) {
                        currentSheetName = sheet.name
                        // 터치 즉시 시트 탭 하이라이트 및 상단 타이틀/적재버튼 갱신
                        tvViewerTitle.text = "📊 ${sheet.name}"
                        tvViewerSubtitle.text = "⏳ [$currentProjectName > ${sheet.name}] 데이터를 불러오는 중..."
                        updateIngestButtonForCurrentSheet()
                        renderSheetTabs()
                        loadWorkspaceData(targetProjectId = currentProjectId, targetSheetName = sheet.name, forceRefresh = false)
                    }
                }
            }
            layoutSheetTabs.addView(chip)
        }
    }

    private fun resolveCardIdBySheetName(sheetName: String): String {
        val clean = sheetName.trim()
        for ((cardId, spec) in FileToSheetClient.CARD_SHEET_SPECS) {
            if (spec.sheetName == clean || clean.contains(spec.sheetName)) return cardId
        }
        if (clean.contains("통화녹음")) return "call_recording"
        if (clean.contains("부재중")) return "missed_call"
        if (clean.contains("문자송수신")) return "sms_sync"
        if (clean.contains("카카오톡")) return "kakao_sync"
        if (clean.contains("명함발송")) return "call_ended_card"
        if (clean.contains("명함")) return "business_card"
        if (clean.contains("영수증")) return "receipt_scanner"
        if (clean.contains("결제입금")) return "payment_sms"
        return "business_card"
    }

    private fun applyFilters() {
        val query = etSearchRows.text?.toString()?.trim().orEmpty().lowercase()
        filteredRows = allRows.filter { row ->
            val st = optCleanString(row, "_approvalStatus").uppercase().ifBlank { "PENDING" }
            val statusMatches = when (currentApprovalFilter) {
                "PENDING" -> st != "APPROVED" && st != "HELD" && st != "REJECTED"
                "APPROVED" -> st == "APPROVED"
                "HELD" -> st == "HELD"
                "REJECTED" -> st == "REJECTED"
                else -> true
            }
            if (!statusMatches) return@filter false

            if (query.isBlank()) return@filter true
            var textMatched = false
            val keys = row.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                if (k.startsWith("_") && k != "_approvalReason") continue
                val v = optCleanString(row, k)
                if (v.lowercase().contains(query)) {
                    textMatched = true
                    break
                }
            }
            textMatched
        }
        tvRowCountBadge.text = "${filteredRows.size}건 표시"
        renderCurrentView()
    }

    private fun renderCurrentView() {
        if (filteredRows.isEmpty()) {
            rvSheetCards.visibility = View.GONE
            scrollTableVertical.visibility = View.GONE
            layoutEmptyState.visibility = View.VISIBLE
            val q = etSearchRows.text?.toString()?.trim().orEmpty()
            if ((q.isNotEmpty() || currentApprovalFilter != "ALL") && allRows.isNotEmpty()) {
                tvEmptyTitle.text = "조건에 일치하는 항목이 없습니다."
                tvEmptySubtitle.text = "결재 상태 필터나 검색어를 변경해 보세요."
            } else {
                tvEmptyTitle.text = "[$currentSheetName]에 적재된 데이터가 없습니다."
                tvEmptySubtitle.text = "우측 상단의 [📤 +파일·행 적재] 버튼을 눌러 사진 촬영이나 문서를 등록하면 AI가 시트 컬럼에 맞춰 자동 적재합니다."
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

        val headerRow = TableRow(this).apply {
            setBackgroundColor(Color.parseColor("#1E293B"))
        }
        // 결재 상태 헤더 추가
        val approvalHeaderTv = TextView(this).apply {
            text = "결재"
            setTextColor(Color.parseColor("#38BDF8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            setTypeface(typeface, Typeface.BOLD)
            setPadding(dp(10), dp(10), dp(10), dp(10))
        }
        headerRow.addView(approvalHeaderTv)

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
            val st = optCleanString(rowObj, "_approvalStatus").uppercase()
            val stLabel = when (st) {
                "APPROVED" -> "✅ 승인"
                "HELD" -> "🟠 보류"
                "REJECTED" -> "🚫 반려"
                else -> "⏳ 대기"
            }
            val stTv = TextView(this).apply {
                text = stLabel
                setTextColor(Color.parseColor("#F8FAFC"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
                setPadding(dp(10), dp(10), dp(10), dp(10))
            }
            tableRow.addView(stTv)

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

    // =========================================================================
    // ⚖️ 승인 / 보류 / 반려 결재 처리 (사유 입력 모달 포함)
    // =========================================================================

    private fun handleRowApprovalClick(
        rowObj: JSONObject,
        nextStatus: String,
        onDone: ((String, String?) -> Unit)?
    ) {
        if (nextStatus == "HELD" || nextStatus == "REJECTED") {
            showApprovalReasonDialog(rowObj, nextStatus, onDone)
        } else {
            executeRowApprovalUpdate(rowObj, nextStatus, reason = null, onDone = onDone)
        }
    }

    private fun showApprovalReasonDialog(
        rowObj: JSONObject,
        targetStatus: String,
        onDone: ((String, String?) -> Unit)?
    ) {
        val isHeld = targetStatus == "HELD"
        val dialogTitle = if (isHeld) "🟠 결재 보류(Hold) 사유 입력" else "🚫 결재 반려(Reject) 사유 입력"

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(14), dp(20), dp(8))
        }

        val guideTv = TextView(this).apply {
            text = if (isHeld) {
                "보류 사유를 선택하거나 직접 입력해 주세요. (파일투시트 웹에 즉시 동기화됩니다)"
            } else {
                "반려 사유를 선택하거나 직접 입력해 주세요. (파일투시트 웹에 즉시 동기화됩니다)"
            }
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
            setTextColor(Color.parseColor("#64748B"))
        }
        root.addView(guideTv)

        val reasonInput = EditText(this).apply {
            hint = if (isHeld) "예: 세금계산서/증빙 수령 후 승인 예정" else "예: 중복 영수증 제출로 인한 반려"
            setText(optCleanString(rowObj, "_approvalReason"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(10) }
            layoutParams = lp
        }

        val presets = if (isHeld) {
            listOf("증빙 서류 확인 후 승인 예정", "세금계산서 수령 대기", "담당자 사실관계 확인 중")
        } else {
            listOf("중복 전표/영수증 반려", "증빙 금액 불일치 반려", "업무 무관 지출 반려")
        }

        val presetScroll = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(8) }
        }
        val presetRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        for (p in presets) {
            val chip = TextView(this).apply {
                text = p
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                setTextColor(Color.parseColor("#1E293B"))
                setPadding(dp(10), dp(6), dp(10), dp(6))
                background = GradientDrawable().apply {
                    cornerRadius = dp(99).toFloat()
                    setColor(Color.parseColor("#E2E8F0"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { marginEnd = dp(6) }
                setOnClickListener {
                    reasonInput.setText(p)
                    reasonInput.setSelection(p.length)
                }
            }
            presetRow.addView(chip)
        }
        presetScroll.addView(presetRow)
        root.addView(presetScroll)
        root.addView(reasonInput)

        AlertDialog.Builder(this)
            .setTitle(dialogTitle)
            .setView(root)
            .setPositiveButton(if (isHeld) "보류 확정" else "반려 확정") { _, _ ->
                val reason = reasonInput.text?.toString()?.trim().orEmpty()
                executeRowApprovalUpdate(rowObj, targetStatus, reason, onDone)
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun executeRowApprovalUpdate(
        rowObj: JSONObject,
        nextStatus: String,
        reason: String?,
        onDone: ((String, String?) -> Unit)?
    ) {
        val rawIdx = rowObj.optInt("_rawRowIndex", -1)
        val serial = optCleanString(rowObj, "일련번호").ifBlank { optCleanString(rowObj, "번호") }

        CardInlineLoadingHelper.show(
            container = layoutViewerInlineLoading,
            message = "⚖️ 결재 상태를 파일투시트 서버에 반영하는 중..."
        )

        lifecycleScope.launch {
            val ok = FileToSheetClient.updateWorkspaceRowApproval(
                projectId = currentProjectId,
                sheetName = currentSheetName,
                rowIndices = if (rawIdx >= 0) listOf(rawIdx) else emptyList(),
                serialNumbers = if (serial.isNotBlank()) listOf(serial) else emptyList(),
                status = nextStatus,
                reason = reason,
                actorPhone = currentPhoneNumber
            )
            CardInlineLoadingHelper.hide(layoutViewerInlineLoading)

            if (ok) {
                rowObj.put("_approvalStatus", nextStatus)
                if (reason != null) {
                    rowObj.put("_approvalReason", reason)
                }
                val statusKor = when (nextStatus) {
                    "APPROVED" -> "✅ 승인 완료"
                    "HELD" -> "🟠 보류 처리"
                    "REJECTED" -> "🚫 반려 처리"
                    else -> "⏳ 대기"
                }
                Toast.makeText(this@FtsSheetViewerActivity, "$statusKor 되었습니다.", Toast.LENGTH_SHORT).show()
                updateApprovalFilterChipStyles()
                applyFilters()
                onDone?.invoke(nextStatus, reason)
            } else {
                Toast.makeText(this@FtsSheetViewerActivity, "결재 상태 변경에 실패했습니다.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // =========================================================================
    // 📤 시트 성격별 지능형 맞춤 적재 시스템 (Context-Aware Sheet Ingest System)
    // =========================================================================

    private enum class SheetIngestCategory {
        AUDIO_RECORDING,
        BUSINESS_CARD,
        RECEIPT,
        KAKAO_CHAT,
        AUTO_LOG_SHEET,
        GENERAL_FTS_SHEET
    }

    private fun resolveCurrentSheetCategory(): SheetIngestCategory {
        val s = currentSheetName.trim()
        return when {
            s.contains("통화녹음") || s.contains("회의록") -> SheetIngestCategory.AUDIO_RECORDING
            s.contains("명함관리") || (s.contains("명함") && !s.contains("발송")) -> SheetIngestCategory.BUSINESS_CARD
            s.contains("영수증") -> SheetIngestCategory.RECEIPT
            s.contains("카카오톡") -> SheetIngestCategory.KAKAO_CHAT
            s.contains("문자송수신") || s.contains("부재중") || s.contains("명함발송") || s.contains("결제입금") ->
                SheetIngestCategory.AUTO_LOG_SHEET
            else -> SheetIngestCategory.GENERAL_FTS_SHEET
        }
    }

    private fun showIngestActionDialog() {
        val category = resolveCurrentSheetCategory()
        val sheetLabel = currentSheetName.ifBlank { "현재 시트" }
        val projLabel = currentProjectName.ifBlank { "파일투시트" }

        val dialog = BottomSheetDialog(this)
        val rootScroll = ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(Color.parseColor("#0F172A"))
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(24))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#0F172A"))
            }
        }
        rootScroll.addView(root)

        // 상단 드래그 핸들
        val handle = View(this).apply {
            background = GradientDrawable().apply {
                cornerRadius = dp(99).toFloat()
                setColor(Color.parseColor("#475569"))
            }
            layoutParams = LinearLayout.LayoutParams(dp(42), dp(4)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                bottomMargin = dp(14)
            }
        }
        root.addView(handle)

        // 상단 프로젝트 › 시트 뱃지 + 닫기 버튼
        val topHeaderRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val pathBadge = TextView(this).apply {
            text = "📁 $projLabel › $sheetLabel"
            setTextColor(Color.parseColor("#38BDF8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
            setTypeface(typeface, Typeface.BOLD)
            setPadding(dp(10), dp(5), dp(10), dp(5))
            background = GradientDrawable().apply {
                cornerRadius = dp(99).toFloat()
                setColor(Color.parseColor("#1E293B"))
                setStroke(dp(1), Color.parseColor("#334155"))
            }
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val closeBtn = TextView(this).apply {
            text = "✕"
            setTextColor(Color.parseColor("#94A3B8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(dp(10), dp(4), dp(4), dp(4))
            setOnClickListener { dialog.dismiss() }
        }
        topHeaderRow.addView(pathBadge)
        topHeaderRow.addView(closeBtn)
        root.addView(topHeaderRow)

        val (modalTitle, modalDesc) = when (category) {
            SheetIngestCategory.AUDIO_RECORDING ->
                "🎙️ [$sheetLabel] 음성·녹음 맞춤 적재" to
                    "스마트폰의 최근 통화/회의 녹음이나 오디오 파일을 선택하면 AI가 화자·통화내용·핵심요약을 자동 분석해 시트에 적재합니다."
            SheetIngestCategory.BUSINESS_CARD ->
                "🪪 [$sheetLabel] 명함 OCR 맞춤 등록" to
                    "종이 명함을 촬영하거나 이미지를 선택하면 AI가 성명·직함·회사명·연락처를 추출해 명함관리 대장에 즉시 등록합니다."
            SheetIngestCategory.RECEIPT ->
                "🧾 [$sheetLabel] 영수증·전표 맞춤 적재" to
                    "영수증/세금계산서를 촬영하거나 PDF·사진을 올리면 AI가 가맹점·승인금액·지출성격을 자동 분류해 적재합니다."
            SheetIngestCategory.KAKAO_CHAT ->
                "💬 [$sheetLabel] 대화 내역 맞춤 적재" to
                    "카카오톡 대화 내보내기(.txt) 파일을 업로드하거나 중요 상담 내역을 직접 입력해 대장에 기록합니다."
            SheetIngestCategory.AUTO_LOG_SHEET ->
                "⚡ [$sheetLabel] 자동 감지 대장 안내 및 수동 추가" to
                    "이 시트는 스마트폰 이벤트 감지기가 실시간 자동 기록하는 시트입니다. 누락분 수동 입력이나 엑셀 일괄 적재도 가능합니다."
            SheetIngestCategory.GENERAL_FTS_SHEET ->
                "📤 [$sheetLabel] 시트 컬럼 맞춤 AI 적재" to
                    "증빙 사진 촬영, 문서(PDF·엑셀·이미지) 업로드 또는 직접 행 입력을 통해 아래 시트 컬럼에 맞춰 데이터를 적재합니다."
        }

        val titleTv = TextView(this).apply {
            text = modalTitle
            setTextColor(Color.parseColor("#F8FAFC"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16.5f)
            setTypeface(typeface, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(12) }
        }
        root.addView(titleTv)

        val descTv = TextView(this).apply {
            text = modalDesc
            setTextColor(Color.parseColor("#94A3B8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
            setLineSpacing(dp(2).toFloat(), 1.0f)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(6) }
        }
        root.addView(descTv)

        // 📋 적재 대상 시트 컬럼 미리보기 칩 바
        val previewCols = currentHeaders.filter { !it.startsWith("_") }.ifEmpty {
            FileToSheetClient.CARD_SHEET_SPECS[resolveCardIdBySheetName(sheetLabel)]?.headers
                ?: listOf("일련번호", "등록일시", "내용", "비고")
        }
        val colPreviewBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#1E293B"))
                setStroke(dp(1), Color.parseColor("#334155"))
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dp(12)
                bottomMargin = dp(12)
            }
        }
        val colTitleTv = TextView(this).apply {
            text = "📋 적재 대상 시트 컬럼 (${previewCols.size}개 항목 자동 매핑)"
            setTextColor(Color.parseColor("#CBD5E1"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
            setTypeface(typeface, Typeface.BOLD)
        }
        colPreviewBox.addView(colTitleTv)

        val colScroll = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(8) }
        }
        val colRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        for (colName in previewCols) {
            val chip = TextView(this).apply {
                text = colName
                setTextColor(Color.parseColor("#38BDF8"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                setTypeface(typeface, Typeface.BOLD)
                setPadding(dp(9), dp(4), dp(9), dp(4))
                background = GradientDrawable().apply {
                    cornerRadius = dp(99).toFloat()
                    setColor(Color.parseColor("#0F172A"))
                    setStroke(dp(1), Color.parseColor("#0284C7"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { marginEnd = dp(6) }
            }
            colRow.addView(chip)
        }
        colScroll.addView(colRow)
        colPreviewBox.addView(colScroll)
        root.addView(colPreviewBox)

        // 액션 카드 생성 헬퍼
        fun addActionCard(
            iconEmoji: String,
            title: String,
            subtitle: String,
            accentColorHex: String,
            badgeText: String? = null,
            onClick: () -> Unit
        ) {
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(14), dp(13), dp(14), dp(13))
                background = GradientDrawable().apply {
                    cornerRadius = dp(12).toFloat()
                    setColor(Color.parseColor("#1E293B"))
                    setStroke(dp(1), Color.parseColor(accentColorHex))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(8) }
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    dialog.dismiss()
                    onClick()
                }
            }

            val iconTv = TextView(this).apply {
                text = iconEmoji
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
                gravity = Gravity.CENTER
                background = GradientDrawable().apply {
                    cornerRadius = dp(10).toFloat()
                    setColor(Color.parseColor("#0F172A"))
                }
                layoutParams = LinearLayout.LayoutParams(dp(42), dp(42)).apply {
                    marginEnd = dp(12)
                }
            }
            card.addView(iconTv)

            val textCol = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }

            val titleLine = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            val tTv = TextView(this).apply {
                text = title
                setTextColor(Color.parseColor("#F8FAFC"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
                setTypeface(typeface, Typeface.BOLD)
            }
            titleLine.addView(tTv)

            if (!badgeText.isNullOrBlank()) {
                val bTv = TextView(this).apply {
                    text = badgeText
                    setTextColor(Color.parseColor("#FFFFFF"))
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
                    setTypeface(typeface, Typeface.BOLD)
                    setPadding(dp(6), dp(2), dp(6), dp(2))
                    background = GradientDrawable().apply {
                        cornerRadius = dp(99).toFloat()
                        setColor(Color.parseColor(accentColorHex))
                    }
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { marginStart = dp(6) }
                }
                titleLine.addView(bTv)
            }
            textCol.addView(titleLine)

            val sTv = TextView(this).apply {
                text = subtitle
                setTextColor(Color.parseColor("#94A3B8"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(3) }
            }
            textCol.addView(sTv)
            card.addView(textCol)

            val arrowTv = TextView(this).apply {
                text = "›"
                setTextColor(Color.parseColor("#64748B"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
                setTypeface(typeface, Typeface.BOLD)
                setPadding(dp(8), 0, 0, 0)
            }
            card.addView(arrowTv)

            root.addView(card)
        }

        when (category) {
            SheetIngestCategory.AUDIO_RECORDING -> {
                addActionCard(
                    iconEmoji = "🎧",
                    title = "스마트폰 최근 통화·회의 녹음에서 선택",
                    subtitle = "단말기 녹음 폴더의 최근 오디오 목록에서 터치 1번으로 AI 요약 적재",
                    accentColorHex = "#059669",
                    badgeText = "추천"
                ) {
                    showRecentRecordingPickerDialog()
                }
                addActionCard(
                    iconEmoji = "🎵",
                    title = "내 파일함에서 오디오 파일 선택 (m4a·mp3·wav)",
                    subtitle = "외부 녹음기나 전달받은 음성 파일을 선택하여 AI 전사 및 요약 적재",
                    accentColorHex = "#0284C7"
                ) {
                    pendingUploadOcrType = "call_recording"
                    try {
                        pickFileLauncher.launch("audio/*")
                    } catch (e: Exception) {
                        Toast.makeText(this, "오디오 선택기를 열 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
                addActionCard(
                    iconEmoji = "✏️",
                    title = "통화/회의 요약 내역 직접 입력 추가",
                    subtitle = "시트 컬럼(${previewCols.take(3).joinToString("·")} 등)에 맞춰 수동 행 추가",
                    accentColorHex = "#475569"
                ) {
                    showManualRowAddDialog()
                }
            }

            SheetIngestCategory.BUSINESS_CARD -> {
                addActionCard(
                    iconEmoji = "📸",
                    title = "카메라로 종이 명함 촬영",
                    subtitle = "성명·직함·회사명·휴대폰·이메일·주소를 AI가 추출해 즉시 등록",
                    accentColorHex = "#4F46E5",
                    badgeText = "AI 명함인식"
                ) {
                    pendingUploadOcrType = "business_card"
                    try {
                        takePictureLauncher.launch(null)
                    } catch (e: Exception) {
                        Toast.makeText(this, "카메라를 실행할 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
                addActionCard(
                    iconEmoji = "🖼️",
                    title = "갤러리에서 명함 이미지 선택",
                    subtitle = "촬영해 둔 명함 사진이나 받은 명함 이미지를 선택하여 AI 자동 등록",
                    accentColorHex = "#2563EB"
                ) {
                    pendingUploadOcrType = "business_card"
                    try {
                        pickFileLauncher.launch("image/*")
                    } catch (e: Exception) {
                        Toast.makeText(this, "갤러리를 열 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
                addActionCard(
                    iconEmoji = "✏️",
                    title = "명함 연락처 직접 입력하여 추가",
                    subtitle = "성명, 회사명, 휴대폰번호 등을 직접 입력하여 행 추가",
                    accentColorHex = "#475569"
                ) {
                    showManualRowAddDialog()
                }
            }

            SheetIngestCategory.RECEIPT -> {
                addActionCard(
                    iconEmoji = "📸",
                    title = "카메라로 영수증·전표 촬영",
                    subtitle = "가맹점명·승인금액·부가세·결제일시를 AI가 자동 인식해 장부 적재",
                    accentColorHex = "#0284C7",
                    badgeText = "AI 영수증OCR"
                ) {
                    pendingUploadOcrType = "receipt"
                    try {
                        takePictureLauncher.launch(null)
                    } catch (e: Exception) {
                        Toast.makeText(this, "카메라를 실행할 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
                addActionCard(
                    iconEmoji = "📎",
                    title = "갤러리 영수증 사진 또는 전자영수증(PDF) 선택",
                    subtitle = "캡처한 모바일 영수증, 카드전표, 세금계산서 파일 업로드 적재",
                    accentColorHex = "#2563EB"
                ) {
                    pendingUploadOcrType = "receipt"
                    try {
                        pickFileLauncher.launch("*/*")
                    } catch (e: Exception) {
                        Toast.makeText(this, "파일 선택기를 열 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
                addActionCard(
                    iconEmoji = "✏️",
                    title = "지출/영수증 내역 직접 입력하여 추가",
                    subtitle = "가맹점, 총결제금액, 지출목적 등을 직접 입력하여 행 추가",
                    accentColorHex = "#475569"
                ) {
                    showManualRowAddDialog()
                }
            }

            SheetIngestCategory.KAKAO_CHAT -> {
                addActionCard(
                    iconEmoji = "💬",
                    title = "카카오톡 대화 내보내기(.txt) 파일 업로드",
                    subtitle = "대화방에서 내보낸 텍스트 파일을 분석하여 상담 대장에 적재",
                    accentColorHex = "#D97706",
                    badgeText = "대화 파일"
                ) {
                    pendingUploadOcrType = "kakao_export"
                    try {
                        pickFileLauncher.launch("text/*")
                    } catch (e: Exception) {
                        Toast.makeText(this, "파일 선택기를 열 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
                addActionCard(
                    iconEmoji = "✏️",
                    title = "카카오톡 상담/대화 내역 직접 입력 추가",
                    subtitle = "대화방명, 발신자, 대화내용, 핵심요약을 직접 입력하여 행 추가",
                    accentColorHex = "#475569"
                ) {
                    showManualRowAddDialog()
                }
            }

            SheetIngestCategory.AUTO_LOG_SHEET -> {
                addActionCard(
                    iconEmoji = "✏️",
                    title = "신규 내역(행) 직접 입력하여 수동 추가",
                    subtitle = "자동 감지 외에 별도로 기록할 [$sheetLabel] 내역을 수동으로 입력합니다",
                    accentColorHex = "#2563EB",
                    badgeText = "수동 입력"
                ) {
                    showManualRowAddDialog()
                }
                addActionCard(
                    iconEmoji = "📊",
                    title = "엑셀 / CSV / 문서 파일에서 데이터 적재",
                    subtitle = "외부 내역 파일이나 캡처 이미지를 업로드하여 시트 컬럼에 맞춰 적재",
                    accentColorHex = "#475569"
                ) {
                    pendingUploadOcrType = null
                    try {
                        pickFileLauncher.launch("*/*")
                    } catch (e: Exception) {
                        Toast.makeText(this, "파일 선택기를 열 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }

            SheetIngestCategory.GENERAL_FTS_SHEET -> {
                addActionCard(
                    iconEmoji = "📸",
                    title = "카메라로 증빙·계약서·장부 촬영 AI 적재",
                    subtitle = "촬영된 문서에서 [${previewCols.take(4).joinToString("·")}] 항목을 AI가 자동 추출",
                    accentColorHex = "#2563EB",
                    badgeText = "컬럼 맞춤 AI"
                ) {
                    pendingUploadOcrType = null
                    try {
                        takePictureLauncher.launch(null)
                    } catch (e: Exception) {
                        Toast.makeText(this, "카메라를 실행할 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
                addActionCard(
                    iconEmoji = "📎",
                    title = "사진 / PDF / 엑셀 / 문서 파일 업로드 AI 적재",
                    subtitle = "스마트폰에 저장된 이미지나 문서를 [$sheetLabel] 컬럼 구조에 맞춰 자동 적재",
                    accentColorHex = "#0284C7"
                ) {
                    pendingUploadOcrType = null
                    try {
                        pickFileLauncher.launch("*/*")
                    } catch (e: Exception) {
                        Toast.makeText(this, "파일 선택기를 열 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
                addActionCard(
                    iconEmoji = "✏️",
                    title = "시트 컬럼에 맞춰 직접 행(Row) 입력 추가",
                    subtitle = "[${previewCols.take(4).joinToString(", ")}] 각 항목을 직접 입력하여 즉시 추가",
                    accentColorHex = "#475569"
                ) {
                    showManualRowAddDialog()
                }
            }
        }

        dialog.setContentView(rootScroll)
        dialog.setOnShowListener {
            val bottomSheet = dialog.findViewById<View>(com.google.android.material.R.id.design_bottom_sheet)
            if (bottomSheet != null) {
                bottomSheet.setBackgroundColor(Color.TRANSPARENT)
                BottomSheetBehavior.from(bottomSheet).state = BottomSheetBehavior.STATE_EXPANDED
            }
        }
        dialog.show()
    }

    /**
     * 🎧 [통화녹음대장 / 회의록대장] 전용: 단말기 내 최근 녹음 파일 목록을 보여주고 원탭으로 업로드 적재합니다.
     */
    private fun showRecentRecordingPickerDialog() {
        val recentFiles = CallRecordingManager.listRecentRecordingFiles(this, limit = 30)
        if (recentFiles.isEmpty()) {
            Toast.makeText(
                this,
                "최근 통화 녹음 파일을 찾지 못해 오디오 파일 선택기를 엽니다.",
                Toast.LENGTH_SHORT
            ).show()
            pendingUploadOcrType = "call_recording"
            try {
                pickFileLauncher.launch("audio/*")
            } catch (_: Exception) {}
            return
        }

        val dialog = BottomSheetDialog(this)
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(Color.parseColor("#0F172A"))
        }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(24))
        }
        scroll.addView(container)

        val titleTv = TextView(this).apply {
            text = "🎧 스마트폰 최근 녹음 파일 선택 (${recentFiles.size}건)"
            setTextColor(Color.parseColor("#F8FAFC"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTypeface(typeface, Typeface.BOLD)
        }
        container.addView(titleTv)

        val subTv = TextView(this).apply {
            text = "적재할 녹음 파일을 터치하면 AI가 통화 내용을 분석해 [$currentSheetName]에 자동 등록합니다."
            setTextColor(Color.parseColor("#94A3B8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dp(4)
                bottomMargin = dp(10)
            }
        }
        container.addView(subTv)

        for (file in recentFiles) {
            val info = CallRecordingManager.parseRecordingFileInfo(file)
            val sizeKb = (file.length() / 1024L).coerceAtLeast(1L)
            val itemCard = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(14), dp(11), dp(14), dp(11))
                background = GradientDrawable().apply {
                    cornerRadius = dp(10).toFloat()
                    setColor(Color.parseColor("#1E293B"))
                    setStroke(dp(1), Color.parseColor("#334155"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(7) }
                setOnClickListener {
                    dialog.dismiss()
                    uploadDirectAudioFileToCurrentSheet(file, info)
                }
            }

            val topRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            val contactTv = TextView(this).apply {
                text = "🎙️ ${info.contactName}"
                setTextColor(Color.parseColor("#34D399"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
                setTypeface(typeface, Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            val timeTv = TextView(this).apply {
                text = info.callTime
                setTextColor(Color.parseColor("#94A3B8"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            }
            topRow.addView(contactTv)
            topRow.addView(timeTv)
            itemCard.addView(topRow)

            val fileNameTv = TextView(this).apply {
                text = "${file.name} (${sizeKb}KB)"
                setTextColor(Color.parseColor("#CBD5E1"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.MIDDLE
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(3) }
            }
            itemCard.addView(fileNameTv)
            container.addView(itemCard)
        }

        dialog.setContentView(scroll)
        dialog.setOnShowListener {
            val bottomSheet = dialog.findViewById<View>(com.google.android.material.R.id.design_bottom_sheet)
            if (bottomSheet != null) {
                bottomSheet.setBackgroundColor(Color.TRANSPARENT)
                BottomSheetBehavior.from(bottomSheet).state = BottomSheetBehavior.STATE_EXPANDED
            }
        }
        dialog.show()
    }

    private fun uploadDirectAudioFileToCurrentSheet(
        audioFile: File,
        parsedInfo: RecordingFileInfo
    ) {
        val ext = audioFile.extension.lowercase()
        val mime = when (ext) {
            "mp3" -> "audio/mpeg"
            "wav" -> "audio/wav"
            "amr" -> "audio/amr"
            "ogg" -> "audio/ogg"
            "aac" -> "audio/aac"
            else -> "audio/mp4"
        }
        CardInlineLoadingHelper.show(
            container = layoutViewerInlineLoading,
            message = "🎙️ [${audioFile.name}] 녹음 파일을 [$currentSheetName]에 AI 전사·요약 적재 중..."
        )
        lifecycleScope.launch {
            try {
                val res = FileToSheetClient.uploadFileToWorkspaceSheet(
                    phoneNumber = currentPhoneNumber,
                    projectId = currentProjectId,
                    projectName = currentProjectName,
                    sheetName = currentSheetName,
                    file = audioFile,
                    mimeType = mime,
                    memo = "모바일 워크스페이스 통화녹음 선택 적재 (${parsedInfo.contactName})",
                    ocrType = "call_recording",
                    contactName = parsedInfo.contactName,
                    callTime = parsedInfo.callTime
                )
                CardInlineLoadingHelper.hide(layoutViewerInlineLoading)
                if (res.success) {
                    Toast.makeText(
                        this@FtsSheetViewerActivity,
                        "✅ [${parsedInfo.contactName}] 녹음 파일이 [$currentSheetName]에 적재되었습니다!",
                        Toast.LENGTH_SHORT
                    ).show()
                    loadWorkspaceData(currentProjectId, currentSheetName, forceRefresh = true)
                } else {
                    Toast.makeText(
                        this@FtsSheetViewerActivity,
                        "녹음 적재 실패: ${res.error ?: "오류"}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                CardInlineLoadingHelper.hide(layoutViewerInlineLoading)
                Toast.makeText(this@FtsSheetViewerActivity, "녹음 업로드 오류: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun handleCapturedBitmapUpload(bitmap: Bitmap) {
        val ocrTypeToUse = pendingUploadOcrType
        pendingUploadOcrType = null

        CardInlineLoadingHelper.show(
            container = layoutViewerInlineLoading,
            message = "🤖 촬영된 사진을 1600px 최적화 압축 후 [$currentSheetName] 시트에 AI 분석 적재 중..."
        )
        lifecycleScope.launch {
            try {
                val tempFile = withContext(Dispatchers.IO) {
                    val f = File(cacheDir, "fts_cam_${System.currentTimeMillis()}.jpg")
                    val scaled = scaleBitmapMax1600(bitmap)
                    FileOutputStream(f).use { out ->
                        scaled.compress(Bitmap.CompressFormat.JPEG, 85, out)
                    }
                    f
                }

                val res = FileToSheetClient.uploadFileToWorkspaceSheet(
                    phoneNumber = currentPhoneNumber,
                    projectId = currentProjectId,
                    projectName = currentProjectName,
                    sheetName = currentSheetName,
                    file = tempFile,
                    mimeType = "image/jpeg",
                    memo = "모바일 워크스페이스 카메라 촬영 적재 ($currentSheetName)",
                    ocrType = ocrTypeToUse
                )
                try { tempFile.delete() } catch (_: Exception) {}
                CardInlineLoadingHelper.hide(layoutViewerInlineLoading)

                if (res.success) {
                    Toast.makeText(
                        this@FtsSheetViewerActivity,
                        "✅ [$currentSheetName] 시트에 AI 분석 적재가 완료되었습니다!",
                        Toast.LENGTH_SHORT
                    ).show()
                    loadWorkspaceData(currentProjectId, currentSheetName, forceRefresh = true)
                } else {
                    Toast.makeText(
                        this@FtsSheetViewerActivity,
                        "적재 실패: ${res.error ?: "오류"}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                CardInlineLoadingHelper.hide(layoutViewerInlineLoading)
                Toast.makeText(this@FtsSheetViewerActivity, "업로드 오류: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun handlePickedFileUpload(uri: Uri) {
        val ocrTypeHint = pendingUploadOcrType
        pendingUploadOcrType = null

        CardInlineLoadingHelper.show(
            container = layoutViewerInlineLoading,
            message = "🤖 선택된 파일을 [$currentSheetName] 시트 컬럼에 맞춰 AI 분석 적재 중..."
        )
        lifecycleScope.launch {
            try {
                val (tempFile, mimeType) = withContext(Dispatchers.IO) {
                    val cr = contentResolver
                    val detectedMime = cr.getType(uri) ?: "application/octet-stream"
                    var displayName = "upload_${System.currentTimeMillis()}"
                    cr.query(uri, null, null, null, null)?.use { cursor ->
                        val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (nameIdx >= 0 && cursor.moveToFirst()) {
                            displayName = cursor.getString(nameIdx) ?: displayName
                        }
                    }

                    // 이미지 파일인 경우 1600px / 85% JPEG 경량화 원칙 적용
                    if (detectedMime.startsWith("image/")) {
                        val rawBytes = cr.openInputStream(uri)?.use { it.readBytes() }
                        val decoded = if (rawBytes != null) BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size) else null
                        if (decoded != null) {
                            val scaled = scaleBitmapMax1600(decoded)
                            val cleanBase = displayName.substringBeforeLast(".")
                            val outFile = File(cacheDir, "${cleanBase}.jpg")
                            FileOutputStream(outFile).use { out ->
                                scaled.compress(Bitmap.CompressFormat.JPEG, 85, out)
                            }
                            return@withContext Pair(outFile, "image/jpeg")
                        }
                    }

                    val outFile = File(cacheDir, displayName)
                    cr.openInputStream(uri)?.use { input ->
                        FileOutputStream(outFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                    Pair(outFile, detectedMime)
                }

                val isAudio = mimeType.startsWith("audio/") ||
                    tempFile.extension.lowercase() in setOf("m4a", "mp3", "wav", "amr", "ogg", "aac", "3gp", "flac")
                val parsedAudio = if (isAudio) CallRecordingManager.parseRecordingFileInfo(tempFile) else null
                val effectiveOcrType = ocrTypeHint ?: if (isAudio) "call_recording" else null

                val res = FileToSheetClient.uploadFileToWorkspaceSheet(
                    phoneNumber = currentPhoneNumber,
                    projectId = currentProjectId,
                    projectName = currentProjectName,
                    sheetName = currentSheetName,
                    file = tempFile,
                    mimeType = mimeType,
                    memo = "모바일 워크스페이스 파일 등록 적재 ($currentSheetName)",
                    ocrType = effectiveOcrType,
                    contactName = parsedAudio?.contactName,
                    callTime = parsedAudio?.callTime
                )
                try { tempFile.delete() } catch (_: Exception) {}
                CardInlineLoadingHelper.hide(layoutViewerInlineLoading)

                if (res.success) {
                    Toast.makeText(
                        this@FtsSheetViewerActivity,
                        "✅ [${tempFile.name}] 파일이 [$currentSheetName] 시트에 적재되었습니다!",
                        Toast.LENGTH_SHORT
                    ).show()
                    loadWorkspaceData(currentProjectId, currentSheetName, forceRefresh = true)
                } else {
                    Toast.makeText(
                        this@FtsSheetViewerActivity,
                        "파일 적재 실패: ${res.error ?: "오류"}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                CardInlineLoadingHelper.hide(layoutViewerInlineLoading)
                Toast.makeText(this@FtsSheetViewerActivity, "파일 처리 오류: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun scaleBitmapMax1600(src: Bitmap): Bitmap {
        val maxDim = 1600
        val w = src.width
        val h = src.height
        if (w <= maxDim && h <= maxDim) return src
        val ratio = if (w > h) maxDim.toFloat() / w else maxDim.toFloat() / h
        val targetW = (w * ratio).toInt().coerceAtLeast(1)
        val targetH = (h * ratio).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(src, targetW, targetH, true)
    }

    private fun showManualRowAddDialog() {
        val fallbackCols = FileToSheetClient.CARD_SHEET_SPECS[resolveCardIdBySheetName(currentSheetName)]?.headers
            ?: listOf("내용", "금액", "비고")
        val editableHeaders = currentHeaders.ifEmpty { fallbackCols }.filter {
            it != "일련번호" && it != "번호" && it != "등록일시" && !it.startsWith("_")
        }.ifEmpty { listOf("내용", "금액", "비고") }

        val dialog = BottomSheetDialog(this)
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(Color.parseColor("#0F172A"))
        }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(24))
        }
        scroll.addView(container)

        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val titleTv = TextView(this).apply {
            text = "✏️ [$currentSheetName] 새 행 직접 추가"
            setTextColor(Color.parseColor("#F8FAFC"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTypeface(typeface, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val closeTv = TextView(this).apply {
            text = "✕"
            setTextColor(Color.parseColor("#94A3B8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(dp(8), dp(4), dp(4), dp(4))
            setOnClickListener { dialog.dismiss() }
        }
        headerRow.addView(titleTv)
        headerRow.addView(closeTv)
        container.addView(headerRow)

        val subTv = TextView(this).apply {
            text = "📁 $currentProjectName › $currentSheetName 시트의 컬럼에 맞춰 새 행을 추가합니다."
            setTextColor(Color.parseColor("#94A3B8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dp(4)
                bottomMargin = dp(10)
            }
        }
        container.addView(subTv)

        val fieldMap = mutableMapOf<String, EditText>()
        for (h in editableHeaders) {
            val labelTv = TextView(this).apply {
                text = h
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Color.parseColor("#38BDF8"))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(10) }
            }
            val et = EditText(this).apply {
                hint = "$h 입력..."
                setHintTextColor(Color.parseColor("#64748B"))
                setTextColor(Color.parseColor("#F8FAFC"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
                setSingleLine(true)
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = GradientDrawable().apply {
                    cornerRadius = dp(8).toFloat()
                    setColor(Color.parseColor("#1E293B"))
                    setStroke(dp(1), Color.parseColor("#334155"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(4) }
            }
            container.addView(labelTv)
            container.addView(et)
            fieldMap[h] = et
        }

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(18) }
        }
        val cancelBtn = TextView(this).apply {
            text = "취소"
            setTextColor(Color.parseColor("#CBD5E1"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#334155"))
            }
            layoutParams = LinearLayout.LayoutParams(0, dp(42), 1f).apply { marginEnd = dp(8) }
            setOnClickListener { dialog.dismiss() }
        }
        val submitBtn = TextView(this).apply {
            text = "✅ 시트에 행 추가"
            setTextColor(Color.parseColor("#FFFFFF"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#2563EB"))
            }
            layoutParams = LinearLayout.LayoutParams(0, dp(42), 1.4f)
            setOnClickListener {
                val rowData = JSONObject()
                var hasAny = false
                for ((col, et) in fieldMap) {
                    val v = et.text?.toString()?.trim().orEmpty()
                    if (v.isNotEmpty()) hasAny = true
                    rowData.put(col, v)
                }
                if (!hasAny) {
                    Toast.makeText(this@FtsSheetViewerActivity, "최소 1개 이상의 항목을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                dialog.dismiss()

                CardInlineLoadingHelper.show(
                    container = layoutViewerInlineLoading,
                    message = "✏️ [$currentSheetName] 시트에 신규 행을 추가하는 중..."
                )
                lifecycleScope.launch {
                    val res = FileToSheetClient.appendManualRowToWorkspaceSheet(
                        phoneNumber = currentPhoneNumber,
                        projectId = currentProjectId,
                        projectName = currentProjectName,
                        sheetName = currentSheetName,
                        rowData = rowData
                    )
                    CardInlineLoadingHelper.hide(layoutViewerInlineLoading)
                    if (res.success) {
                        Toast.makeText(this@FtsSheetViewerActivity, "✅ 신규 행이 추가되었습니다.", Toast.LENGTH_SHORT).show()
                        loadWorkspaceData(currentProjectId, currentSheetName, forceRefresh = true)
                    } else {
                        Toast.makeText(this@FtsSheetViewerActivity, "추가 실패: ${res.error ?: "오류"}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
        btnRow.addView(cancelBtn)
        btnRow.addView(submitBtn)
        container.addView(btnRow)

        dialog.setContentView(scroll)
        dialog.setOnShowListener {
            val bottomSheet = dialog.findViewById<View>(com.google.android.material.R.id.design_bottom_sheet)
            if (bottomSheet != null) {
                bottomSheet.setBackgroundColor(Color.TRANSPARENT)
                BottomSheetBehavior.from(bottomSheet).state = BottomSheetBehavior.STATE_EXPANDED
            }
        }
        dialog.show()
    }

    private fun openCurrentSheetInWeb() {
        val webUrl = buildString {
            append(FileToSheetClient.FTS_OFFICIAL_DOMAIN)
            append("/?tab=table")
            if (currentProjectId.isNotBlank()) {
                append("&projectId=").append(Uri.encode(currentProjectId))
            }
            if (currentSheetName.isNotBlank()) {
                append("&sheet=").append(Uri.encode(currentSheetName))
            }
            if (currentProjectName.isNotBlank()) {
                append("&project=").append(Uri.encode(currentProjectName))
            }
            if (currentToken.isNotBlank()) {
                append("&token=").append(Uri.encode(currentToken))
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
     * 📋 대장 행(Row) 터치 시 전체 컬럼 상세 보기 + 승인/보류/반려 결재 + 전화/문자(AI 추천)/녹음 듣기 바텀시트
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

        val layoutApprovalActionBox = view.findViewById<View>(R.id.layoutApprovalActionBox)
        val tvApprovalReasonInfo = view.findViewById<TextView>(R.id.tvApprovalReasonInfo)
        val btnApproveRow = view.findViewById<Button>(R.id.btnApproveRow)
        val btnHoldRow = view.findViewById<Button>(R.id.btnHoldRow)
        val btnRejectRow = view.findViewById<Button>(R.id.btnRejectRow)

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

        tvSourceBadge.text = "📁 $currentProjectName • $currentSheetName"
        tvSourceBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#1E3A8A"))

        fun refreshSheetApprovalUi() {
            val st = optCleanString(rowObj, "_approvalStatus").uppercase().ifBlank { "PENDING" }
            val reason = optCleanString(rowObj, "_approvalReason")
            tvStateBadge.visibility = View.VISIBLE
            when (st) {
                "APPROVED" -> {
                    tvStateBadge.text = "✅ 승인됨"
                    tvStateBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#059669"))
                    tvApprovalReasonInfo.text = if (reason.isNotBlank()) "✅ 결재 승인 완료 (메모: $reason)" else "✅ 현재 결재 상태: 승인 완료"
                }
                "HELD" -> {
                    tvStateBadge.text = "🟠 보류됨"
                    tvStateBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#D97706"))
                    tvApprovalReasonInfo.text = if (reason.isNotBlank()) "🟠 보류 사유: $reason" else "🟠 현재 결재 상태: 보류"
                }
                "REJECTED" -> {
                    tvStateBadge.text = "🚫 반려됨"
                    tvStateBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#E11D48"))
                    tvApprovalReasonInfo.text = if (reason.isNotBlank()) "🚫 반려 사유: $reason" else "🚫 현재 결재 상태: 반려"
                }
                else -> {
                    tvStateBadge.text = "⏳ 결재대기"
                    tvStateBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#475569"))
                    tvApprovalReasonInfo.text = "⚖️ 모바일 결재 처리 (승인 / 보류 / 반려 즉시 반영)"
                }
            }
        }

        layoutApprovalActionBox.visibility = View.VISIBLE
        refreshSheetApprovalUi()

        btnApproveRow.setOnClickListener {
            handleRowApprovalClick(rowObj, "APPROVED") { _, _ -> refreshSheetApprovalUi() }
        }
        btnHoldRow.setOnClickListener {
            handleRowApprovalClick(rowObj, "HELD") { _, _ -> refreshSheetApprovalUi() }
        }
        btnRejectRow.setOnClickListener {
            handleRowApprovalClick(rowObj, "REJECTED") { _, _ -> refreshSheetApprovalUi() }
        }

        tvDueDate.text = summary.dateTime
        tvTitle.text = summary.primaryTitle.ifBlank { "#${summary.serial} 상세 내역" }

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
                    if (autoPlayAudio) togglePlayback()
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
            btnOpenKakao.text = if (kakaoSession?.canOpenChatRoom == true) {
                "💛 해당 카톡방 바로 열기"
            } else {
                "💛 카톡 열기 (이름 자동복사)"
            }
            btnOpenKakao.setOnClickListener {
                dialog.dismiss()
                KakaoReplySessionCache.launchKakaoTalkOrRoom(
                    this,
                    kakaoSession,
                    targetName,
                    summary.primaryTitle
                )
            }
        } else {
            btnOpenKakao.visibility = View.GONE
        }

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
                        KakaoReplySessionCache.launchKakaoTalkOrRoom(
                            this,
                            kakaoSession,
                            targetName,
                            summary.primaryTitle
                        )
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

            if (focusQuickReply) etReply.requestFocus()
        } else {
            layoutQuickReplyBox.visibility = View.GONE
        }

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
        val approvalStatus: String,
        val approvalReason: String,
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
        val approvalStatus = optCleanString(rowObj, "_approvalStatus").uppercase().ifBlank { "PENDING" }
        val approvalReason = optCleanString(rowObj, "_approvalReason")

        val contactName = pickFirst(
            listOf("성함", "성명", "이름", "상대방", "상대방이름", "연락처이름", "고객명", "수신자명", "채팅방/발신자", "고객/가맹점명", "대표자", "공급받는자")
        )
        val companyOrTitle = pickFirst(
            listOf("회사명", "상호", "기업명", "회사/상호", "직함", "직함/부서", "금융사/채널", "공급자")
        )
        val phoneNumber = pickFirst(
            listOf("휴대폰", "발신번호", "전화번호", "연락처", "휴대전화", "유선전화")
        )
        val amountText = pickFirst(
            listOf("합계금액", "금액", "결제금액", "공급가액", "단가")
        )
        val docOrTaskTitle = pickFirst(
            listOf("할일제목", "제목", "회의제목", "문서/질의제목", "포스트제목", "파일명", "품명", "품목", "대상URL")
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
            approvalStatus = approvalStatus,
            approvalReason = approvalReason,
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
     * 🃏 모바일 최적화 카드 리스트 어댑터 (승인/보류/반려 원터치 결재 칩 포함)
     */
    inner class FtsRowCardAdapter(
        private val onRowClick: (JSONObject, Int) -> Unit,
        private val onCallClick: (String) -> Unit,
        private val onSmsClick: (JSONObject, Int) -> Unit,
        private val onPlayAudioClick: (JSONObject, Int) -> Unit,
        private val onApprovalAction: (JSONObject, String) -> Unit
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

                // 1. 상단 메타 바 (#일련번호 | 결재상태 배지 | 구분 뱃지 | 일시)
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

                val (apText, apBg, apFg) = when (p.approvalStatus) {
                    "APPROVED" -> Triple("✅ 승인", "#064E3B", "#6EE7B7")
                    "HELD" -> Triple("🟠 보류", "#78350F", "#FCD34D")
                    "REJECTED" -> Triple("🚫 반려", "#881337", "#FDA4AF")
                    else -> Triple("⏳ 대기", "#334155", "#CBD5E1")
                }
                val approvalBadge = TextView(root.context).apply {
                    text = apText
                    setTextColor(Color.parseColor(apFg))
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
                    setTypeface(typeface, Typeface.BOLD)
                    setPadding(dp(8), dp(2), dp(8), dp(2))
                    background = GradientDrawable().apply {
                        cornerRadius = dp(6).toFloat()
                        setColor(Color.parseColor(apBg))
                    }
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { marginStart = dp(6) }
                }
                topRow.addView(approvalBadge)

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

                // 2. 메인 타이틀
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

                // 3. 서브타이틀 (전화번호 / 금액 등)
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

                // 4. 본문 요약 내용
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

                // 5. 추가 필드 요약
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

                // 결재 사유가 있는 경우 표시
                if (p.approvalReason.isNotBlank()) {
                    val reasonTv = TextView(root.context).apply {
                        text = "💬 결재 사유/메모: ${p.approvalReason}"
                        setTextColor(Color.parseColor("#FDE047"))
                        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply { topMargin = dp(4) }
                    }
                    root.addView(reasonTv)
                }

                // 6. 하단 퀵 액션 바 (승인/보류/반려 + 전화/문자/녹음듣기)
                val actionRow = LinearLayout(root.context).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { topMargin = dp(10) }
                }

                // 원터치 결재 버튼 3종
                actionRow.addView(
                    createQuickActionChip("승인", "#064E3B", "#6EE7B7") {
                        onApprovalAction(rowObj, "APPROVED")
                    }
                )
                actionRow.addView(
                    createQuickActionChip("보류", "#78350F", "#FCD34D") {
                        onApprovalAction(rowObj, "HELD")
                    }
                )
                actionRow.addView(
                    createQuickActionChip("반려", "#881337", "#FDA4AF") {
                        onApprovalAction(rowObj, "REJECTED")
                    }
                )

                val isRec = sheetName.contains("통화녹음") || sheetName.contains("회의록")
                if (isRec) {
                    actionRow.addView(
                        createQuickActionChip("🎧 듣기", "#065F46", "#A7F3D0") {
                            onPlayAudioClick(rowObj, fallbackNum)
                        }
                    )
                }

                if (p.phoneNumber.isNotBlank()) {
                    actionRow.addView(
                        createQuickActionChip("📞", "#1E3A8A", "#93C5FD") {
                            onCallClick(p.phoneNumber)
                        }
                    )
                    if (ContactHelper.isMobilePhoneNumber(p.phoneNumber)) {
                        actionRow.addView(
                            createQuickActionChip("💬 답장", "#312E81", "#C7D2FE") {
                                onSmsClick(rowObj, fallbackNum)
                            }
                        )
                    }
                }

                val spacer = View(root.context).apply {
                    layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
                }
                actionRow.addView(spacer)

                val detailTv = TextView(root.context).apply {
                    text = "상세 ›"
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
                    gravity = Gravity.CENTER
                    includeFontPadding = false
                    setSingleLine(true)
                    maxLines = 1
                    minHeight = dp(30)
                    setPadding(dp(10), dp(5), dp(10), dp(5))
                    background = GradientDrawable().apply {
                        cornerRadius = dp(99).toFloat()
                        setColor(Color.parseColor(bgHex))
                    }
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { marginEnd = dp(5) }
                    setOnClickListener { onClick() }
                }
            }
        }
    }
}
