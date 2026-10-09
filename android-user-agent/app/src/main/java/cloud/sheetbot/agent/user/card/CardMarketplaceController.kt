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

    private var allCatalogCards: List<MarketplaceCardItemDto> = emptyList()
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

        dialog.show()

        // 서버 카탈로그 비동기 로드
        progressLoading?.visibility = View.VISIBLE
        scope.launch {
            val userEmail = prefs.userEmail ?: ""
            val result = ApiClient.fetchCardCatalog(userEmail)
            withContext(Dispatchers.Main) {
                progressLoading?.visibility = View.GONE
                if (result.success && result.cards.isNotEmpty()) {
                    allCatalogCards = result.cards
                    renderCards()
                } else {
                    Toast.makeText(activity, "카탈로그 로드 안내: 기본 카탈로그를 표시합니다.", Toast.LENGTH_SHORT).show()
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
                text = "✨ 출시 알림"
                setTextColor(Color.parseColor("#F59E0B"))
                backgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#1E293B"))
                setOnClickListener {
                    AlertDialog.Builder(activity)
                        .setTitle("🚀 출시 준비 중인 기능")
                        .setMessage("'${card.title}' 기능은 곧 정식 업데이트될 예정입니다.\n\n먼저 맞춤 제작을 원하시면 지금 바로 1:1 다이렉트 의뢰를 신청해 주세요!")
                        .setPositiveButton("지금 의뢰하기") { _, _ ->
                            FeatureRequestCardController(activity, prefs).openRequestDialog(card.title)
                        }
                        .setNegativeButton("닫기", null)
                        .show()
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
}
