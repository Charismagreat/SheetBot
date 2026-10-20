package cloud.sheetbot.agent.user.card

import kotlinx.coroutines.launch

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.google.android.material.bottomsheet.BottomSheetDialog
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.R

/**
 * 📦 추가 기능 보관함 (Card Drawer) 및 사용자 맞춤 대시보드 순서 관리 컨트롤러
 *
 * - 사용하지 않는 카드를 보관함에 모아 홈 화면을 극도로 깔끔하게 유지
 * - 꺼내 놓은 카드가 바텀시트 위쪽에 우선 노출되며, 자유롭게 순서(위/아래) 변경 가능
 * - 변경된 순서가 메인 화면 LinearLayout에 즉시 물리적으로 반영됨
 * - '시트봇 정상 작동중', '실시간 감지 로그', '제작의뢰' 등 모든 카드의 보관/꺼내기 전면 지원
 */
class CardDrawerController(
    private val activity: Activity,
    private val prefs: PreferencesManager
) {

    /**
     * 개별 카드의 메타데이터
     */
    data class CardInfo(
        val key: String,
        val title: String,
        val icon: String,
        val category: String,
        val cardResId: Int,
        val headerResId: Int? = null
    )

    // 관리 대상 전체 카드 24종 목록 (카테고리별 정돈)
    val allCards = listOf(
        // [1] 시스템 & 관제
        CardInfo("cardStatus", "시트봇 / File to Sheet 관제 상태", "🟢", "시스템 & 관제", R.id.cardStatus, R.id.layoutIntegratedHeader),
        CardInfo("cardLocalLogs", "실시간 감지 및 입금 로그", "📜", "시스템 & 관제", R.id.cardLocalLogs),
        CardInfo("cardFeatureRequest", "우리 가게 맞춤 기능 제작 의뢰", "💡", "시스템 & 관제", R.id.cardFeatureRequest, R.id.layoutFeatureRequestHeader),
        CardInfo("cardTasksHub", "스마트 통합 할 일 허브", "📋", "시스템 & 관제", R.id.cardTasksHub, R.id.btnOpenTasksHub),
        CardInfo("cardTtsToggle", "실시간 AI 음성 안내 (TTS)", "🔊", "시스템 & 관제", R.id.cardTtsToggle),

        // [2] 핵심 업무 & 장부
        CardInfo("cardPaymentReceipt", "매장 결제 확인 & 영수증 문자", "🧾", "업무 & 장부", R.id.cardPaymentReceipt, R.id.layoutPaymentReceiptHeader),
        CardInfo("cardQuoteSync", "간편 주문 접수 기록", "📑", "업무 & 장부", R.id.cardQuoteSync, R.id.layoutQuoteSyncHeader),
        CardInfo("cardEstimateSync", "간편 견적서 발행 대장", "📑", "업무 & 장부", R.id.cardEstimateSync, R.id.layoutEstimateSyncHeader),
        CardInfo("cardFileUpload", "사진 & 문서 직결 보관", "📁", "업무 & 장부", R.id.cardFileUpload, R.id.layoutFileUploadHeader),
        CardInfo("cardContactsBackup", "스마트폰 연락처 백업", "📇", "업무 & 장부", R.id.cardContactsBackup, R.id.layoutContactsHeader),

        // [3] 통화 & 녹음
        CardInfo("cardCallRecording", "통화 녹음 자동 분석", "🎙️", "통화 & 녹음", R.id.cardCallRecording, R.id.layoutCallRecordingHeader),
        CardInfo("cardInCallSummary", "수신 통화 시 고객 요약 팝업", "📞", "통화 & 녹음", R.id.cardInCallSummary, R.id.layoutInCallSummaryHeader),
        CardInfo("cardMissedCall", "부재중 전화 자동 답장", "📞", "통화 & 녹음", R.id.cardMissedCall, R.id.layoutMissedCallHeader),
        CardInfo("cardCallEnded", "통화 종료 후 명함 원터치 발송", "🪪", "통화 & 녹음", R.id.cardCallEnded, R.id.layoutCallEndedCardHeader),
        CardInfo("cardMeetingRecording", "회의 녹음 자동 회의록", "🎙️", "통화 & 녹음", R.id.cardMeetingRecording, R.id.layoutMeetingRecordingHeader),

        // [4] 메시지 & 대화
        CardInfo("cardSmsSync", "스마트폰 문자 시트 동기화", "💬", "메시지 & 대화", R.id.cardSmsSync, R.id.layoutSmsSyncHeader),
        CardInfo("cardKakaoSync", "카카오톡 대화 자동 기록", "🟡", "메시지 & 대화", R.id.cardKakaoSync, R.id.layoutKakaoSyncHeader),
        CardInfo("cardLinkScrap", "웹 링크 & 유튜브 요약 스크랩", "🔗", "메시지 & 대화", R.id.cardLinkScrap, R.id.layoutLinkScrapHeader),

        // [5] AI & 마케팅
        CardInfo("cardBlog", "AI 네이버 블로그 자동 포스팅", "✍️", "AI & 마케팅", R.id.cardBlog),
        CardInfo("cardInsta", "AI 인스타그램 피드 자동 발행", "📸", "AI & 마케팅", R.id.cardInsta),
        CardInfo("cardSite", "AI 모바일 홈페이지 제작", "🌐", "AI & 마케팅", R.id.cardSite),
        CardInfo("cardCompanyResearch", "원클릭 기업 심층 리서치", "🏢", "AI & 마케팅", R.id.cardCompanyResearch, R.id.layoutCompanyResearchHeader),
        CardInfo("cardLawAdvisory", "AI 법률/계약서 팩트체크", "⚖️", "AI & 마케팅", R.id.cardLawAdvisory, R.id.layoutLawAdvisoryHeader),
        CardInfo("cardWebsiteMonitor", "웹사이트 실시간 장애 감시", "🚨", "AI & 마케팅", R.id.cardWebsiteMonitor, R.id.layoutWebsiteMonitorHeader)
    )

    private var cardDrawerBox: View? = null
    private var layoutDrawerHeader: View? = null
    private var tvDrawerTitle: TextView? = null
    private var btnOpenMarketplace: TextView? = null
    private var btnDrawerManage: TextView? = null
    private var btnToggleDrawer: TextView? = null
    private var layoutDrawerContent: View? = null
    private var layoutDrawerItems: LinearLayout? = null

    private var isDrawerExpanded = false

    fun setup() {
        findViews()
        setupListeners()
        syncDefaultOrderIfEmpty()
        applyCardVisibilityAndOrder()
        refreshDrawerList()
    }

    private fun findViews() {
        cardDrawerBox = activity.findViewById(R.id.cardDrawerBox)
        layoutDrawerHeader = activity.findViewById(R.id.layoutDrawerHeader)
        tvDrawerTitle = activity.findViewById(R.id.tvDrawerTitle)
        btnOpenMarketplace = activity.findViewById(R.id.btnOpenMarketplace)
        btnDrawerManage = activity.findViewById(R.id.btnDrawerManage)
        btnToggleDrawer = activity.findViewById(R.id.btnToggleDrawer)
        layoutDrawerContent = activity.findViewById(R.id.layoutDrawerContent)
        layoutDrawerItems = activity.findViewById(R.id.layoutDrawerItems)
    }

    private fun setupListeners() {
        // 보관함 바텀시트 열기 (헤더 터치 시 또는 편집 버튼 터치 시)
        layoutDrawerHeader?.setOnClickListener {
            openReorderingBottomSheet()
        }

        btnDrawerManage?.setOnClickListener {
            openReorderingBottomSheet()
        }

        // 🛍️ 시트봇 카드 스토어 열기
        btnOpenMarketplace?.setOnClickListener {
            val scope = (activity as? androidx.lifecycle.LifecycleOwner)?.lifecycleScope
                ?: kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Main)
            CardMarketplaceController(activity, prefs, this, scope).openMarketplace()
        }

        // 각 카드의 헤더 롱클릭 시 "보관함으로 이동" 지원
        allCards.forEach { cardInfo ->
            val targetView = cardInfo.headerResId?.let { activity.findViewById<View>(it) }
                ?: activity.findViewById<View>(cardInfo.cardResId)

            targetView?.setOnLongClickListener {
                showHideConfirmDialog(cardInfo)
                true
            }
        }
    }

    /**
     * 카드를 보관함으로 넣을 것인지 확인하는 다이얼로그
     */
    private fun showHideConfirmDialog(cardInfo: CardInfo) {
        android.app.AlertDialog.Builder(activity)
            .setTitle("📦 기능 보관함으로 이동")
            .setMessage("'${cardInfo.icon} ${cardInfo.title}' 카드를 추가 기능 보관함으로 이동하시겠습니까?\n\n메인 화면에서 숨겨지며, 언제든 보관함에서 꺼낼 수 있습니다.")
            .setPositiveButton("보관함으로 이동") { _, _ ->
                hideCard(cardInfo.key)
                Toast.makeText(activity, "'${cardInfo.title}' 카드가 보관함으로 이동되었습니다.", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("취소", null)
            .show()
    }

    /**
     * 기본 순서가 없을 경우 활성화된 카드들의 기본 순서를 자동 초기화
     */
    private fun syncDefaultOrderIfEmpty() {
        val currentOrder = prefs.activeCardOrder
        if (currentOrder.isEmpty()) {
            val hiddenKeys = prefs.hiddenCardKeys
            val initialActive = allCards.filter { !hiddenKeys.contains(it.key) }.map { it.key }
            if (initialActive.isNotEmpty()) {
                prefs.activeCardOrder = initialActive
            }
        }
    }

    /**
     * 카드 숨기기 (보관함으로 넣기)
     */
    fun hideCard(key: String) {
        val currentHidden = prefs.hiddenCardKeys.toMutableSet()
        currentHidden.add(key)
        prefs.hiddenCardKeys = currentHidden

        // 활성 순서에서도 제거
        val currentOrder = prefs.activeCardOrder.toMutableList()
        currentOrder.remove(key)
        prefs.activeCardOrder = currentOrder

        applyCardVisibilityAndOrder()
        refreshDrawerList()
    }

    /**
     * 카드 꺼내기 (메인 화면에 다시 표시 및 활성 순서 맨 뒤에 추가)
     */
    fun restoreCard(key: String, onDone: (() -> Unit)? = null) {
        val currentHidden = prefs.hiddenCardKeys.toMutableSet()
        currentHidden.remove(key)
        prefs.hiddenCardKeys = currentHidden

        val currentOrder = prefs.activeCardOrder.toMutableList()
        if (!currentOrder.contains(key)) {
            currentOrder.add(key)
            prefs.activeCardOrder = currentOrder
        }

        applyCardVisibilityAndOrder()
        refreshDrawerList()

        // 🌟 온디맨드 시트 프로비저닝 (FTS 연동 시 결제문자, 통화녹음 등 신규 시트 실시간 자동 생성)
        if (prefs.isDestinationFileToSheet && prefs.isFtsPaired) {
            val sheetTypeToEnsure = when (key) {
                "cardPaymentReceipt", "cardSmsSync" -> "payment_sms"
                "cardCallRecording", "cardMeetingRecording" -> "call_recording"
                else -> null
            }

            val phone = prefs.ftsPhoneNumber
            if (sheetTypeToEnsure != null && !phone.isNullOrBlank()) {
                (activity as? androidx.lifecycle.LifecycleOwner)?.lifecycleScope?.launch(kotlinx.coroutines.Dispatchers.IO) {
                    val result = cloud.sheetbot.agent.user.FileToSheetClient.ensureSheet(phone, prefs.ftsProjectId, sheetTypeToEnsure)
                    if (result.success && !result.token.isNullOrBlank()) {
                        if (sheetTypeToEnsure == "payment_sms") {
                            prefs.ftsDepositToken = result.token
                            prefs.ftsDepositSheetName = result.sheetName
                        } else if (sheetTypeToEnsure == "call_recording") {
                            prefs.ftsCallRecordingToken = result.token
                            prefs.ftsCallRecordingSheetName = result.sheetName
                        }
                        android.util.Log.i("CardDrawerController", "온디맨드 시트 연결 완료: ${result.sheetName}")
                    }
                }
            }
        }
        onDone?.invoke()
    }

    /**
     * 카드 순서 이동 (위로: -1, 아래로: +1)
     */
    fun moveCardOrder(key: String, delta: Int): Boolean {
        val currentOrder = prefs.activeCardOrder.toMutableList()
        val index = currentOrder.indexOf(key)
        if (index == -1) return false
        val newIndex = index + delta
        if (newIndex < 0 || newIndex >= currentOrder.size) return false

        currentOrder.removeAt(index)
        currentOrder.add(newIndex, key)
        prefs.activeCardOrder = currentOrder

        applyCardVisibilityAndOrder()
        return true
    }

    /**
     * SharedPreferences에 저장된 활성 순서와 숨김 목록에 맞춰
     * 메인 화면의 각 카드 뷰들을 물리적으로 재배치하고 가시성을 적용
     */
    fun applyCardVisibilityAndOrder() {
        val hiddenKeys = prefs.hiddenCardKeys
        val activeOrder = prefs.activeCardOrder

        // 1. 가시성 적용
        allCards.forEach { cardInfo ->
            val cardView = activity.findViewById<View>(cardInfo.cardResId)
            if (cardView != null) {
                val isHidden = hiddenKeys.contains(cardInfo.key)
                cardView.visibility = if (isHidden) View.GONE else View.VISIBLE
            }
        }

        // 2. 물리적 순서 재배치 (메인 ScrollView 안의 LinearLayout 대상)
        try {
            val mainScrollView = activity.findViewById<ScrollView>(R.id.mainScrollView)
            val parentLayout = mainScrollView?.getChildAt(0) as? LinearLayout ?: return

            // cardDrawerBox의 현재 위치를 기준으로 그 이전에 활성 카드들을 순서대로 배치
            val drawerIndex = parentLayout.indexOfChild(cardDrawerBox)
            if (drawerIndex != -1 && activeOrder.isNotEmpty()) {
                activeOrder.forEach { cardKey ->
                    val cardInfo = allCards.firstOrNull { it.key == cardKey } ?: return@forEach
                    val cardView = activity.findViewById<View>(cardInfo.cardResId) ?: return@forEach

                    val curIdx = parentLayout.indexOfChild(cardView)
                    val targetDrawerIdx = parentLayout.indexOfChild(cardDrawerBox)
                    if (curIdx != -1 && targetDrawerIdx != -1 && curIdx > targetDrawerIdx) {
                        parentLayout.removeView(cardView)
                        val newDrawerIdx = parentLayout.indexOfChild(cardDrawerBox)
                        parentLayout.addView(cardView, newDrawerIdx)
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("CardDrawerController", "레이아웃 재배치 예외 방어: ${e.message}", e)
        }
    }

    /**
     * 메인 화면 하단 보관함 요약 텍스트 갱신
     */
    fun refreshDrawerList() {
        val hiddenKeys = prefs.hiddenCardKeys
        val hiddenCards = allCards.filter { hiddenKeys.contains(it.key) }
        tvDrawerTitle?.text = "📦 추가 기능 보관함 (${hiddenCards.size}개 보관 중)"
    }

    /**
     * 🌟 사용자 맞춤형 바텀시트 다이얼로그 (꺼내놓은 순서대로 위쪽 노출 & 순서 변경 & 카테고리별 보관함)
     */
    fun openReorderingBottomSheet() {
        val dialog = BottomSheetDialog(activity)
        val density = activity.resources.displayMetrics.density
        val dp = { value: Int -> (value * density).toInt() }

        // 루트 스크롤뷰
        val scrollView = ScrollView(activity).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            setBackgroundColor(Color.parseColor("#0F172A"))
        }

        val rootLayout = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(32))
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        }
        scrollView.addView(rootLayout)

        // 상단 핸들 바
        val handleBar = View(activity).apply {
            val gd = GradientDrawable().apply {
                setColor(Color.parseColor("#475569"))
                cornerRadius = dp(3).toFloat()
            }
            background = gd
            layoutParams = LinearLayout.LayoutParams(dp(40), dp(5)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                bottomMargin = dp(16)
            }
        }
        rootLayout.addView(handleBar)

        // 다이얼로그 헤더 (제목 + 닫기)
        val headerLayout = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(16)
            }
        }
        val titleTv = TextView(activity).apply {
            text = "⚙️ 카드 보관함 & 홈 순서 편집"
            setTextColor(Color.parseColor("#F8FAFC"))
            textSize = 17f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val closeBtn = TextView(activity).apply {
            text = "완료 ✓"
            setTextColor(Color.parseColor("#38BDF8"))
            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(dp(8), dp(4), dp(8), dp(4))
            setOnClickListener { dialog.dismiss() }
        }
        headerLayout.addView(titleTv)
        headerLayout.addView(closeBtn)
        rootLayout.addView(headerLayout)

        // 내용 동적 구성 함수 (순서 변경/보관 시 즉시 갱신)
        fun renderContent() {
            rootLayout.removeViews(2, rootLayout.childCount - 2)

            val hiddenKeys = prefs.hiddenCardKeys
            val activeKeys = prefs.activeCardOrder.filter { !hiddenKeys.contains(it) }
            val activeCards = activeKeys.mapNotNull { key -> allCards.firstOrNull { it.key == key } }
            val archivedCards = allCards.filter { hiddenKeys.contains(it.key) }

            // ══════════════════════════════════════════════════════════
            // [섹션 1: 📱 현재 홈 화면 카드 (상단에 순서대로 노출)]
            // ══════════════════════════════════════════════════════════
            val activeHeader = TextView(activity).apply {
                text = "📱 홈 화면에 꺼내놓은 카드 (${activeCards.size}개) - 위/아래 순서 변경"
                setTextColor(Color.parseColor("#38BDF8"))
                textSize = 13f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setPadding(0, dp(4), 0, dp(8))
            }
            rootLayout.addView(activeHeader)

            if (activeCards.isEmpty()) {
                val emptyActive = TextView(activity).apply {
                    text = "현재 홈 화면에 꺼내놓은 카드가 없습니다.\n아래 보관함에서 필요한 카드를 꺼내보세요!"
                    setTextColor(Color.parseColor("#64748B"))
                    textSize = 11.5f
                    gravity = Gravity.CENTER
                    setPadding(0, dp(12), 0, dp(16))
                }
                rootLayout.addView(emptyActive)
            } else {
                activeCards.forEachIndexed { index, card ->
                    val row = LinearLayout(activity).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER_VERTICAL
                        val gd = GradientDrawable().apply {
                            setColor(Color.parseColor("#1E293B"))
                            cornerRadius = dp(8).toFloat()
                            setStroke(dp(1), Color.parseColor("#334155"))
                        }
                        background = gd
                        setPadding(dp(12), dp(10), dp(10), dp(10))
                        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                            bottomMargin = dp(8)
                        }
                    }

                    // 순번 뱃지
                    val badgeTv = TextView(activity).apply {
                        text = "${index + 1}"
                        setTextColor(Color.parseColor("#94A3B8"))
                        textSize = 11f
                        setPadding(0, 0, dp(8), 0)
                    }
                    row.addView(badgeTv)

                    // 카드 이름 및 카테고리
                    val textLayout = LinearLayout(activity).apply {
                        orientation = LinearLayout.VERTICAL
                        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    }
                    val nameTv = TextView(activity).apply {
                        text = "${card.icon} ${card.title}"
                        setTextColor(Color.parseColor("#F1F5F9"))
                        textSize = 12.5f
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                    }
                    val catTv = TextView(activity).apply {
                        text = card.category
                        setTextColor(Color.parseColor("#64748B"))
                        textSize = 10f
                    }
                    textLayout.addView(nameTv)
                    textLayout.addView(catTv)
                    row.addView(textLayout)

                    // [▲] 위로 이동 버튼
                    val upBtn = TextView(activity).apply {
                        text = "▲"
                        setTextColor(if (index > 0) Color.parseColor("#38BDF8") else Color.parseColor("#475569"))
                        textSize = 13f
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                        setPadding(dp(8), dp(6), dp(8), dp(6))
                        isEnabled = index > 0
                        setOnClickListener {
                            if (moveCardOrder(card.key, -1)) renderContent()
                        }
                    }
                    row.addView(upBtn)

                    // [▼] 아래로 이동 버튼
                    val downBtn = TextView(activity).apply {
                        text = "▼"
                        setTextColor(if (index < activeCards.size - 1) Color.parseColor("#38BDF8") else Color.parseColor("#475569"))
                        textSize = 13f
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                        setPadding(dp(8), dp(6), dp(8), dp(6))
                        isEnabled = index < activeCards.size - 1
                        setOnClickListener {
                            if (moveCardOrder(card.key, 1)) renderContent()
                        }
                    }
                    row.addView(downBtn)

                    // [✕ 보관] 버튼
                    val hideBtn = TextView(activity).apply {
                        text = "✕ 보관"
                        setTextColor(Color.parseColor("#F43F5E"))
                        textSize = 11f
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                        val gdHide = GradientDrawable().apply {
                            setColor(Color.parseColor("#2D1520"))
                            cornerRadius = dp(6).toFloat()
                            setStroke(dp(1), Color.parseColor("#4C1D24"))
                        }
                        background = gdHide
                        setPadding(dp(8), dp(5), dp(8), dp(5))
                        setOnClickListener {
                            hideCard(card.key)
                            renderContent()
                            Toast.makeText(activity, "'${card.title}' 카드가 보관함으로 이동되었습니다.", Toast.LENGTH_SHORT).show()
                        }
                    }
                    row.addView(hideBtn)

                    rootLayout.addView(row)
                }
            }

            // 구분선
            val divider = View(activity).apply {
                setBackgroundColor(Color.parseColor("#334155"))
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)).apply {
                    topMargin = dp(16)
                    bottomMargin = dp(16)
                }
            }
            rootLayout.addView(divider)

            // ══════════════════════════════════════════════════════════
            // [섹션 2: 📦 보관함에 보관된 카드 (하단에 카테고리별 노출)]
            // ══════════════════════════════════════════════════════════
            val archiveHeader = TextView(activity).apply {
                text = "📦 보관함에 대기 중인 카드 (${archivedCards.size}개) - 터치하여 홈으로 꺼내기"
                setTextColor(Color.parseColor("#A855F7"))
                textSize = 13f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setPadding(0, 0, 0, dp(8))
            }
            rootLayout.addView(archiveHeader)

            if (archivedCards.isEmpty()) {
                val allActiveTv = TextView(activity).apply {
                    text = "모든 카드가 현재 홈 화면에 나와 있습니다."
                    setTextColor(Color.parseColor("#64748B"))
                    textSize = 11.5f
                    gravity = Gravity.CENTER
                    setPadding(0, dp(12), 0, dp(16))
                }
                rootLayout.addView(allActiveTv)
            } else {
                // 카테고리별 그룹화
                val grouped = archivedCards.groupBy { it.category }
                grouped.forEach { (categoryName, cards) ->
                    val catSubHeader = TextView(activity).apply {
                        text = "• $categoryName"
                        setTextColor(Color.parseColor("#94A3B8"))
                        textSize = 11.5f
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                        setPadding(0, dp(8), 0, dp(4))
                    }
                    rootLayout.addView(catSubHeader)

                    cards.forEach { card ->
                        val row = LinearLayout(activity).apply {
                            orientation = LinearLayout.HORIZONTAL
                            gravity = Gravity.CENTER_VERTICAL
                            val gd = GradientDrawable().apply {
                                setColor(Color.parseColor("#090D16"))
                                cornerRadius = dp(8).toFloat()
                                setStroke(dp(1), Color.parseColor("#1E293B"))
                            }
                            background = gd
                            setPadding(dp(12), dp(10), dp(12), dp(10))
                            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                                bottomMargin = dp(6)
                            }
                        }

                        val nameTv = TextView(activity).apply {
                            text = "${card.icon} ${card.title}"
                            setTextColor(Color.parseColor("#CBD5E1"))
                            textSize = 12f
                            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                        }
                        row.addView(nameTv)

                        val restoreBtn = TextView(activity).apply {
                            text = "+ 홈에 꺼내기"
                            setTextColor(Color.parseColor("#38BDF8"))
                            textSize = 11f
                            typeface = android.graphics.Typeface.DEFAULT_BOLD
                            val gdBtn = GradientDrawable().apply {
                                setColor(Color.parseColor("#1E293B"))
                                cornerRadius = dp(6).toFloat()
                                setStroke(dp(1), Color.parseColor("#334155"))
                            }
                            background = gdBtn
                            setPadding(dp(10), dp(5), dp(10), dp(5))
                            setOnClickListener {
                                restoreCard(card.key)
                                renderContent()
                                Toast.makeText(activity, "'${card.title}' 카드가 홈 화면에 추가되었습니다.", Toast.LENGTH_SHORT).show()
                            }
                        }
                        row.addView(restoreBtn)

                        rootLayout.addView(row)
                    }
                }
            }
        }

        renderContent()
        dialog.setContentView(scrollView)
        dialog.show()
    }
}
