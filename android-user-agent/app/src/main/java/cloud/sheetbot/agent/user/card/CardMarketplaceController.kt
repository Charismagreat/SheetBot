package cloud.sheetbot.agent.user.card

import android.app.Activity
import android.graphics.Color
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import com.google.android.material.bottomsheet.BottomSheetDialog
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.MarketplaceCardItemDto
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 🛍️ 카드 마켓플레이스 (Card App Store) 전담 컨트롤러 (v2.2.0)
 *
 * - 서버 카탈로그 API(GET /api/user/cards/catalog) 비동기 조회 및 캐싱
 * - 카테고리별(전체, 매장·정산, 고객·영업, AI 자동화, 나만의 맞춤) 실시간 필터링
 * - 검색어 실시간 필터링
 * - 대시보드 원클릭 설치 (+ 설치하기) 및 보관함 이동 (- 보관함으로 이동) 제어
 * - 나만의 맞춤 기능 의뢰(Feature Request) 직결
 */
class CardMarketplaceController(
    private val activity: Activity,
    private val prefs: PreferencesManager,
    private val cardDrawerController: CardDrawerController,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Main)
) {

    private var allCatalogCards: List<MarketplaceCardItemDto> = DEFAULT_FALLBACK_CATALOG
    private var currentCategory: String = "all"
    private var currentSearchQuery: String = ""

    /**
     * 🛍️ 카드 마켓플레이스 바텀시트 열기
     */
    fun openMarketplace() {
        val dialog = BottomSheetDialog(activity)
        val view = LayoutInflater.from(activity).inflate(R.layout.dialog_card_marketplace, null)
        dialog.setContentView(view)

        val btnClose = view.findViewById<TextView>(R.id.btnCloseMarketplace)
        val etSearch = view.findViewById<EditText>(R.id.etMarketSearch)
        val progressLoading = view.findViewById<ProgressBar>(R.id.progressMarketLoading)
        val container = view.findViewById<LinearLayout>(R.id.layoutMarketCardsContainer)
        val footerRequest = view.findViewById<View>(R.id.layoutMarketRequestFooter)

        val chipAll = view.findViewById<TextView>(R.id.chipCategoryAll)
        val chipStore = view.findViewById<TextView>(R.id.chipCategoryStore)
        val chipCrm = view.findViewById<TextView>(R.id.chipCategoryCrm)
        val chipAi = view.findViewById<TextView>(R.id.chipCategoryAi)
        val chipExclusive = view.findViewById<TextView>(R.id.chipCategoryExclusive)

        btnClose?.setOnClickListener { dialog.dismiss() }

        footerRequest?.setOnClickListener {
            dialog.dismiss()
            FeatureRequestCardController(activity, prefs).openRequestDialog()
        }

        fun renderCards() {
            container.removeAllViews()

            val hiddenKeys = prefs.hiddenCardKeys
            val filtered = allCatalogCards.filter { card ->
                val matchesCategory = when (currentCategory) {
                    "all" -> true
                    "exclusive" -> card.isExclusive
                    else -> card.category == currentCategory
                }
                val q = currentSearchQuery.trim().lowercase()
                val matchesQuery = q.isEmpty() ||
                        card.title.lowercase().contains(q) ||
                        card.description.lowercase().contains(q) ||
                        card.categoryName.lowercase().contains(q) ||
                        card.author.lowercase().contains(q)

                matchesCategory && matchesQuery
            }

            if (filtered.isEmpty()) {
                val emptyTv = TextView(activity).apply {
                    text = "해당 조건의 카드가 없습니다.\n새로운 기능이 필요하시면 아래에서 의뢰해 주세요."
                    setTextColor(Color.parseColor("#94A3B8"))
                    textSize = 12f
                    gravity = Gravity.CENTER
                    setPadding(16, 40, 16, 40)
                }
                container.addView(emptyTv)
                return
            }

            filtered.forEach { card ->
                val cardItemView = createCardItemView(card, hiddenKeys) {
                    // 설치 또는 보관함 이동 후 목록 UI 갱신
                    renderCards()
                }
                container.addView(cardItemView)
            }
        }

        fun updateChipsSelection(selectedId: String) {
            currentCategory = selectedId
            val chips = listOf(
                Pair(chipAll, "all"),
                Pair(chipStore, "store"),
                Pair(chipCrm, "crm"),
                Pair(chipAi, "ai"),
                Pair(chipExclusive, "exclusive")
            )
            chips.forEach { (chip, cat) ->
                if (chip != null) {
                    if (cat == selectedId) {
                        chip.setBackgroundResource(R.drawable.bg_badge_version)
                        chip.backgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#0284C7"))
                        chip.setTextColor(Color.parseColor("#FFFFFF"))
                        chip.setTypeface(null, android.graphics.Typeface.BOLD)
                    } else {
                        chip.setBackgroundResource(R.drawable.bg_badge_version)
                        chip.backgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#1E293B"))
                        chip.setTextColor(Color.parseColor("#94A3B8"))
                        chip.setTypeface(null, android.graphics.Typeface.NORMAL)
                    }
                }
            }
            renderCards()
        }

        chipAll?.setOnClickListener { updateChipsSelection("all") }
        chipStore?.setOnClickListener { updateChipsSelection("store") }
        chipCrm?.setOnClickListener { updateChipsSelection("crm") }
        chipAi?.setOnClickListener { updateChipsSelection("ai") }
        chipExclusive?.setOnClickListener { updateChipsSelection("exclusive") }

        etSearch?.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                currentSearchQuery = s?.toString() ?: ""
                renderCards()
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        // 1. 0초 즉시 렌더링 (기본 카탈로그 또는 이전 캐시 카드)
        renderCards()
        dialog.show()

        // 2. 서버 CMS 동적 카탈로그 실시간 비동기 동기화
        progressLoading?.visibility = View.VISIBLE
        scope.launch {
            val userEmail = prefs.userEmail ?: ""
            val result = ApiClient.fetchCardCatalog(userEmail)
            withContext(Dispatchers.Main) {
                progressLoading?.visibility = View.GONE
                if (result.success && result.cards.isNotEmpty()) {
                    allCatalogCards = result.cards
                    renderCards()
                }
            }
        }
    }

    /**
     * 개별 카드 항목 뷰 생성
     */
    private fun createCardItemView(
        card: MarketplaceCardItemDto,
        hiddenKeys: Set<String>,
        onStateChanged: () -> Unit
    ): View {
        val itemLayout = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(R.drawable.bg_card_scenario)
            setPadding(13, 12, 13, 12)
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.setMargins(0, 0, 0, 10)
            layoutParams = lp
        }

        // 1. 헤더: [아이콘 + 제목] [뱃지] [버튼]
        val headerLayout = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.setMargins(0, 0, 0, 6)
            layoutParams = lp
        }

        val iconTv = TextView(activity).apply {
            text = card.icon
            textSize = 15f
            setPadding(0, 0, 8, 0)
        }
        headerLayout.addView(iconTv)

        val titleTv = TextView(activity).apply {
            text = card.title
            setTextColor(Color.parseColor("#F8FAFC"))
            textSize = 12.5f
            setTypeface(null, android.graphics.Typeface.BOLD)
            val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            layoutParams = lp
        }
        headerLayout.addView(titleTv)

        if (!card.badge.isNullOrBlank()) {
            val badgeTv = TextView(activity).apply {
                text = card.badge
                setTextColor(Color.parseColor("#38BDF8"))
                textSize = 9.5f
                setBackgroundResource(R.drawable.bg_badge_version)
                backgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#0F172A"))
                setPadding(6, 2, 6, 2)
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.setMargins(0, 0, 8, 0)
                layoutParams = lp
            }
            headerLayout.addView(badgeTv)
        }

        // 설치 상태 판별: SharedPreferences의 hiddenCardKeys에 없으면 활성(설치됨)
        val isCardCurrentlyActive = !hiddenKeys.contains(card.key)
        val isRecognizedInLocal = cardDrawerController.allCards.any { it.key == card.key }

        val actionBtn = Button(activity).apply {
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                activity.resources.getDimensionPixelSize(android.R.dimen.app_icon_size).coerceAtMost(36)
            )
            layoutParams = lp
            textSize = 11f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setPadding(10, 0, 10, 0)

            if (!isRecognizedInLocal) {
                // 아직 로컬에 빌드되지 않은 준비 중 카드 (세금계산서, 스마트재고 등)
                val isAlreadyReserved = prefs.reservedNotificationCardKeys.contains(card.key)
                if (isAlreadyReserved) {
                    text = "✓ 알림 예약됨"
                    setTextColor(Color.parseColor("#34D399"))
                    backgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#064E3B"))
                    setOnClickListener {
                        val email = prefs.userEmail ?: "회원님"
                        AlertDialog.Builder(activity)
                            .setTitle("✅ ${card.title}")
                            .setMessage("'${card.title}' 기능의 출시 알림이 이미 정상 예약되어 있습니다.\n\n기능이 오픈되면 등록하신 이메일($email)로 가장 먼저 안내해 드립니다.\n\n사전 맞춤 개발이나 특별 도입이 필요하시면 1:1 맞춤 제작을 의뢰해 주세요.")
                            .setPositiveButton("확인", null)
                            .setNeutralButton("💡 맞춤 제작 의뢰") { _, _ ->
                                FeatureRequestCardController(activity, prefs).openRequestDialog(card.title)
                            }
                            .show()
                    }
                } else {
                    text = "✨ 출시 알림"
                    setTextColor(Color.parseColor("#F59E0B"))
                    backgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#1E293B"))
                    setOnClickListener {
                        AlertDialog.Builder(activity)
                            .setTitle("🚀 ${card.title}")
                            .setMessage("'${card.title}' 기능은 정식 출시 준비 중입니다.\n\n출시 알림을 예약하시면 기능 오픈 즉시 알려드리며, 빠른 맞춤 제작을 원하시면 1:1 의뢰를 신청해 주세요.")
                            .setPositiveButton("✨ 출시 알림 예약") { _, _ ->
                                val userEmail = prefs.userEmail ?: ""
                                if (userEmail.isBlank()) {
                                    Toast.makeText(activity, "로그인 후 알림 예약이 가능합니다.", Toast.LENGTH_SHORT).show()
                                    return@setPositiveButton
                                }
                                Toast.makeText(activity, "출시 알림을 예약하는 중입니다...", Toast.LENGTH_SHORT).show()
                                scope.launch {
                                    val result = ApiClient.submitFeatureRequest(
                                        userEmail = userEmail,
                                        title = "[출시알림 예약] ${card.title}",
                                        description = "신규 기능 카드 '${card.title}'(key: ${card.key}) 출시 알림 신청",
                                        requestType = "RELEASE_NOTIFY",
                                        contact = userEmail
                                    )
                                    withContext(Dispatchers.Main) {
                                        if (result.success) {
                                            prefs.addReservedNotificationCard(card.key)
                                            Toast.makeText(activity, "🎉 '${card.title}' 출시 알림이 성공적으로 예약되었습니다!", Toast.LENGTH_LONG).show()
                                            onStateChanged()
                                        } else {
                                            Toast.makeText(activity, "알림 예약 실패: ${result.message}", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                }
                            }
                            .setNeutralButton("💡 맞춤 제작 의뢰") { _, _ ->
                                FeatureRequestCardController(activity, prefs).openRequestDialog(card.title)
                            }
                            .setNegativeButton("닫기", null)
                            .show()
                    }
                }
            } else if (isCardCurrentlyActive) {
                // 이미 메인 화면에 활성화되어 있는 경우
                text = "✓ 사용 중"
                setTextColor(Color.parseColor("#34D399"))
                backgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#1E293B"))
                setOnClickListener {
                    AlertDialog.Builder(activity)
                        .setTitle("📦 기능 보관함으로 이동")
                        .setMessage("'${card.title}' 카드를 메인 화면에서 숨기고 보관함으로 옮기시겠습니까?")
                        .setPositiveButton("보관함으로 이동") { _, _ ->
                            cardDrawerController.hideCard(card.key)
                            Toast.makeText(activity, "'${card.title}' 카드가 보관함으로 이동되었습니다.", Toast.LENGTH_SHORT).show()
                            onStateChanged()
                        }
                        .setNegativeButton("취소", null)
                        .show()
                }
            } else {
                // 보관함에 들어가 있는 경우 -> 원클릭 설치 (메인 화면에 꺼내기)
                text = "+ 설치하기"
                setTextColor(Color.parseColor("#FFFFFF"))
                backgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#0284C7"))
                setOnClickListener {
                    cardDrawerController.restoreCard(card.key)
                    Toast.makeText(activity, "🎉 '${card.title}' 카드가 메인 대시보드에 설치되었습니다!", Toast.LENGTH_SHORT).show()
                    onStateChanged()
                }
            }
        }
        headerLayout.addView(actionBtn)

        itemLayout.addView(headerLayout)

        // 2. 설명 문구
        val descTv = TextView(activity).apply {
            text = card.description
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 11f
            setLineSpacing(2f, 1f)
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.setMargins(0, 0, 0, 6)
            layoutParams = lp
        }
        itemLayout.addView(descTv)

        // 3. 메타 정보: 제공처 / 버전
        val metaLayout = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val authorTv = TextView(activity).apply {
            text = "제작: ${card.author} • v${card.version}"
            setTextColor(Color.parseColor("#64748B"))
            textSize = 9.5f
            val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            layoutParams = lp
        }
        metaLayout.addView(authorTv)

        val catBadge = TextView(activity).apply {
            text = card.categoryName
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 9.5f
        }
        metaLayout.addView(catBadge)

        itemLayout.addView(metaLayout)

        return itemLayout
    }

    companion object {
        val DEFAULT_FALLBACK_CATALOG = listOf(
            MarketplaceCardItemDto(
                key = "cardTaxInvoice",
                title = "전자세금계산서 원클릭 발행",
                icon = "🧾",
                category = "store",
                categoryName = "매장 · 정산",
                description = "홈택스 연동 없이 구글 시트 거래처 내역에서 1초 만에 전자세금계산서/계산서를 자동 발행하고 국세청에 전송합니다.",
                badge = "출시준비",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = false,
                version = "1.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardInventory",
                title = "스마트 실시간 재고 관리",
                icon = "📦",
                category = "store",
                categoryName = "매장 · 정산",
                description = "바코드/QR 촬영 및 입출고 송장 스캔 시 구글 시트 재고 수량을 실시간 자동 계산하고 품절 임박 알림을 전송합니다.",
                badge = "출시준비",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = false,
                version = "1.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardPaymentReceipt",
                title = "매장 결제 확인 & 영수증 문자",
                icon = "💳",
                category = "store",
                categoryName = "매장 · 정산",
                description = "은행 입금 및 카드 결제 알림을 실시간 감지하여 구글 시트 매출 장부에 자동 기록하고 고객에게 감사 문자를 발송합니다.",
                badge = "인기",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.1.0"
            ),
            MarketplaceCardItemDto(
                key = "cardEstimateSync",
                title = "간편 견적서 발행 대장",
                icon = "📑",
                category = "store",
                categoryName = "매장 · 정산",
                description = "단가표 기반으로 모바일에서 원터치 견적서를 생성하고, 세련된 견적 카드 이미지와 함께 카카오톡/문자로 즉시 발송합니다.",
                badge = "추천",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardQuoteSync",
                title = "간편 주문 접수 기록",
                icon = "📦",
                category = "store",
                categoryName = "매장 · 정산",
                description = "고객 주문 내역을 폼 링크로 접수받아 구글 시트 주문 대장에 실시간 적재하고 주문 접수 확인증을 자동 생성합니다.",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardCallRecording",
                title = "통화 녹음 AI 전사 & 상담 요약",
                icon = "🎙️",
                category = "crm",
                categoryName = "고객 · 영업",
                description = "스마트폰 통화 녹음 파일을 구글 드라이브에 안전 백업하고 Gemini AI가 상담 요약, 할 일, 핵심 안건을 3줄로 정리해 시트에 적재합니다.",
                badge = "HOT",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.2.0"
            ),
            MarketplaceCardItemDto(
                key = "cardInCallSummary",
                title = "수신 통화 시 고객 요약 팝업",
                icon = "📞",
                category = "crm",
                categoryName = "고객 · 영업",
                description = "전화가 걸려오면 통화 화면 위에 고객의 이전 상담 메모, 미수금, 최근 주문 내역을 플로팅 팝업으로 즉시 띄워줍니다.",
                badge = "인기",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.1.0"
            ),
            MarketplaceCardItemDto(
                key = "cardMissedCall",
                title = "부재중 전화 고객 안심 자동 답장",
                icon = "📞",
                category = "crm",
                categoryName = "고객 · 영업",
                description = "미팅 중이거나 운전 중 부재중 전화를 수신하면 사전 설정된 친절한 안내 문자와 모바일 명함 링크를 고객에게 자동 답장합니다.",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardCallEnded",
                title = "통화 종료 후 스마트 명함 발송",
                icon = "🪪",
                category = "crm",
                categoryName = "고객 · 영업",
                description = "신규 고객과 전화 통화가 종료되면 화면 상단에 원터치 발송 팝업이 떠서 대표님 모바일 명함과 회사 소개서를 즉시 전송합니다.",
                badge = "추천",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardSmsSync",
                title = "스마트폰 문자 시트 동기화",
                icon = "💬",
                category = "crm",
                categoryName = "고객 · 영업",
                description = "수신된 고객 문의 문자, 견적 요청, 발주 문자를 실시간으로 필터링하여 구글 스프레드시트에 영구 아카이빙합니다.",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardKakaoSync",
                title = "카카오톡 대화 자동 기록",
                icon = "🟡",
                category = "crm",
                categoryName = "고객 · 영업",
                description = "단톡방 및 1:1 고객 카카오톡 주문 상담 내역을 실시간 텍스트로 추출하여 구글 시트 고객 상담 장부에 자동 기록합니다.",
                badge = "인기",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardContactsBackup",
                title = "구글 주소록 연락처 백업",
                icon = "📇",
                category = "crm",
                categoryName = "고객 · 영업",
                description = "스마트폰 연락처와 신규 고객 전화번호를 구글 주소록(Contacts) 및 스프레드시트에 안전하게 양방향 자동 동기화합니다.",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardAiCopilot",
                title = "구글 시트 AI 코파일럿",
                icon = "🤖",
                category = "ai",
                categoryName = "AI 자동화",
                description = "수식 작성, Apps Script 코드 생성, 복잡한 데이터 가공 및 함수 오류 디버깅을 시트봇 AI 엔진이 실시간으로 해결합니다.",
                badge = "대표",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardBlog",
                title = "AI 네이버 블로그 자동 포스팅",
                icon = "✍️",
                category = "ai",
                categoryName = "AI 자동화",
                description = "현장 시공 사진이나 영수증을 업로드하면 고품질 네이버 블로그 전문을 AI가 자동으로 작성하고 구글 드라이브에 정리합니다.",
                badge = "인기",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardInsta",
                title = "AI 인스타그램 홍보 포스팅",
                icon = "📸",
                category = "ai",
                categoryName = "AI 자동화",
                description = "현장 사진과 짧은 메모만으로 인스타그램 맞춤형 감성 카피라이팅, 해시태그 30개를 자동 추출하여 제공합니다.",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardSite",
                title = "AI 모바일 홈페이지 생성",
                icon = "🌐",
                category = "ai",
                categoryName = "AI 자동화",
                description = "시트 한 줄에 회사 정보만 입력하면 0초 만에 네이버 검색 연동 모바일 랜딩페이지를 무료로 생성하고 연결해 드립니다.",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.1.0"
            ),
            MarketplaceCardItemDto(
                key = "cardCompanyResearch",
                title = "기업체 심층 분석 리서치",
                icon = "🏢",
                category = "ai",
                categoryName = "AI 자동화",
                description = "사업자등록번호 또는 기업명 입력 시 공공데이터와 연동하여 재무 지표, 인증 현황, 신용도 보고서를 원클릭 생성합니다.",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardLawAdvisory",
                title = "AI 법률/계약서 자문",
                icon = "⚖️",
                category = "ai",
                categoryName = "AI 자동화",
                description = "계약서 사진이나 법률 분쟁 상황을 입력하면 관련 최신 판례와 불리한 조항을 분석하여 심층 보고서를 제공합니다.",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardLinkScrap",
                title = "웹 링크 & 유튜브 3줄 요약",
                icon = "🔗",
                category = "ai",
                categoryName = "AI 자동화",
                description = "유튜브 영상 링크나 뉴스 기사 URL을 공유하면 핵심 내용만 3줄로 즉시 요약하여 대표님 구글 시트에 차곡차곡 적재합니다.",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardMeetingRecording",
                title = "현장 미팅 음성 녹음 회의록",
                icon = "🎙️",
                category = "crm",
                categoryName = "고객 · 영업",
                description = "대면 미팅 시 녹음 버튼을 누르면 실시간으로 음성을 텍스트로 변환하고 주요 합의사항과 액션 아이템을 정리합니다.",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardWebsiteMonitor",
                title = "웹사이트 24시간 장애 감시",
                icon = "🚨",
                category = "ai",
                categoryName = "AI 자동화",
                description = "대표님의 회사 홈페이지나 쇼핑몰이 다운되거나 에러가 발생하면 스마트폰으로 즉각 푸시 알림을 발송합니다.",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            ),
            MarketplaceCardItemDto(
                key = "cardFileUpload",
                title = "영수증 & 문서 파일 OCR",
                icon = "📄",
                category = "store",
                categoryName = "매장 · 정산",
                description = "종이 영수증, 사업자등록증, 세금계산서를 촬영하면 AI가 글자를 인식하여 정산 시트에 자동 입력합니다.",
                author = "시트봇 공식",
                isExclusive = false,
                isInstalledByDefault = true,
                version = "2.0.0"
            )
        )
    }
}
