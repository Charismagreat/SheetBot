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
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.google.android.material.bottomsheet.BottomSheetDialog
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.R

/**
 * 🔍 카드 빠른 검색 바텀시트 다이얼로그
 *
 * 자연어, 한글 초성, 숫자 번호로 실시간 필터링하여
 * 원하는 업무 카드로 즉시 스크롤 이동 및 자동 복원(Auto-Restore)을 수행합니다.
 */
class CardSearchBottomSheetDialog(
    private val activity: Activity,
    private val prefs: PreferencesManager,
    private val cardDrawerController: CardDrawerController,
    private val scrollView: ScrollView?
) {

    fun show() {
        val dialog = BottomSheetDialog(activity)
        val view = LayoutInflater.from(activity).inflate(R.layout.dialog_card_search, null)
        dialog.setContentView(view)

        val etInput = view.findViewById<EditText>(R.id.etCardSearchInput)
        val btnClear = view.findViewById<TextView>(R.id.btnClearSearch)
        val tvCount = view.findViewById<TextView>(R.id.tvSearchResultCount)
        val layoutResults = view.findViewById<LinearLayout>(R.id.layoutSearchResults)

        // 초기 목록 표시 (전체 20종)
        renderResults(layoutResults, tvCount, CardSearchRegistry.CARDS, dialog)

        // 텍스트 변경 실시간 감지
        etInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val query = s?.toString() ?: ""
                btnClear.visibility = if (query.isNotEmpty()) View.VISIBLE else View.GONE
                val results = CardSearchRegistry.search(query)
                renderResults(layoutResults, tvCount, results, dialog)
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        // 검색어 지우기 버튼
        btnClear.setOnClickListener {
            etInput.setText("")
        }

        dialog.show()
    }

    private fun renderResults(
        container: LinearLayout,
        tvCount: TextView,
        cards: List<CardSearchRegistry.SearchableCard>,
        dialog: BottomSheetDialog
    ) {
        container.removeAllViews()
        tvCount.text = "${cards.size}개 일치"

        if (cards.isEmpty()) {
            val emptyLayout = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(20, 24, 20, 24)
            }

            val emptyTv = TextView(activity).apply {
                text = "찾으시는 기능이 아직 없으신가요?"
                setTextColor(Color.parseColor("#E2E8F0"))
                textSize = 13f
                paint.isFakeBoldText = true
                gravity = Gravity.CENTER
            }
            emptyLayout.addView(emptyTv)

            val subTv = TextView(activity).apply {
                text = "세금계산서, 재고 관리, 출퇴근 체크 등 사장님께 꼭 필요한 자동화 카드를 시트봇이 직접 제작해 드립니다."
                setTextColor(Color.parseColor("#94A3B8"))
                textSize = 11f
                gravity = Gravity.CENTER
                setPadding(10, 8, 10, 16)
            }
            emptyLayout.addView(subTv)

            val reqBtn = Button(activity).apply {
                text = "💡 나만의 맞춤 기능 제작 의뢰하기"
                setTextColor(Color.parseColor("#FFFFFF"))
                setBackgroundColor(Color.parseColor("#0284C7"))
                textSize = 11.5f
                setPadding(24, 0, 24, 0)
                setOnClickListener {
                    dialog.dismiss()
                    FeatureRequestCardController(activity, prefs).openRequestDialog()
                }
            }
            emptyLayout.addView(reqBtn)

            container.addView(emptyLayout)
            return
        }

        val hiddenKeys = prefs.hiddenCardKeys

        cards.forEach { card ->
            val isHidden = hiddenKeys.contains(card.key)

            val itemView = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setBackgroundColor(Color.parseColor("#1E293B"))
                setPadding(24, 16, 24, 16)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = 8
                }
                isClickable = true
                isFocusable = true
            }

            // 번호 뱃지
            val indexBadge = TextView(activity).apply {
                text = "${card.index}"
                setTextColor(Color.parseColor("#38BDF8"))
                textSize = 11f
                setBackgroundColor(Color.parseColor("#0F172A"))
                setPadding(14, 4, 14, 4)
                gravity = Gravity.CENTER
            }
            itemView.addView(indexBadge)

            // 제목 및 주요 키워드 영역
            val textLayout = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginStart = 14
                    marginEnd = 8
                }
            }

            val titleTv = TextView(activity).apply {
                text = "${card.icon} ${card.title}"
                setTextColor(Color.parseColor("#FFFFFF"))
                textSize = 12.5f
                paint.isFakeBoldText = true
            }
            textLayout.addView(titleTv)

            val keywordTv = TextView(activity).apply {
                text = card.keywords.take(4).joinToString(", ")
                setTextColor(Color.parseColor("#64748B"))
                textSize = 10f
            }
            textLayout.addView(keywordTv)
            itemView.addView(textLayout)

            // 상태 뱃지 (메인 노출 vs 📦 보관함)
            val statusBadge = TextView(activity).apply {
                if (isHidden) {
                    text = "📦 보관함"
                    setTextColor(Color.parseColor("#FBBF24"))
                    setBackgroundColor(Color.parseColor("#451A03"))
                } else {
                    text = "메인 노출"
                    setTextColor(Color.parseColor("#34D399"))
                    setBackgroundColor(Color.parseColor("#064E3B"))
                }
                textSize = 9.5f
                setPadding(12, 4, 12, 4)
            }
            itemView.addView(statusBadge)

            // 항목 클릭 시 동작
            itemView.setOnClickListener {
                dialog.dismiss()
                onCardSelected(card, isHidden)
            }

            container.addView(itemView)
        }

        // 하단 맞춤 기능 의뢰 제안 푸터 배너
        val footerBanner = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = 8
                bottomMargin = 16
            }
            isClickable = true
            isFocusable = true
            setOnClickListener {
                dialog.dismiss()
                FeatureRequestCardController(activity, prefs).openRequestDialog()
            }
        }

        val footerTv = TextView(activity).apply {
            text = "💡 찾는 기능이 없나요? 나만의 맞춤 기능 의뢰하기 ➔"
            setTextColor(Color.parseColor("#38BDF8"))
            textSize = 11.5f
            paint.isFakeBoldText = true
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        footerBanner.addView(footerTv)
        container.addView(footerBanner)
    }

    /**
     * 카드 선택 시: 보관함 자동 복원 + 해당 위치로 부드러운 스크롤 이동
     */
    private fun onCardSelected(card: CardSearchRegistry.SearchableCard, isHidden: Boolean) {
        if (isHidden) {
            // 보관함에 있는 경우 자동으로 꺼내기
            cardDrawerController.restoreCard(card.key)
            Toast.makeText(activity, "'${card.title}' 카드를 보관함에서 꺼냈습니다.", Toast.LENGTH_SHORT).show()
        }

        val targetView = activity.findViewById<View>(card.cardResId)
        if (targetView != null && scrollView != null) {
            scrollView.post {
                // 부드럽게 대상 카드 위치로 스크롤
                val targetY = (targetView.top - 20).coerceAtLeast(0)
                scrollView.smoothScrollTo(0, targetY)

                // 1초간 깜빡임 효과 (시각적 하이라이트)
                targetView.alpha = 0.4f
                targetView.animate().alpha(1.0f).setDuration(600).start()
            }
        } else {
            Toast.makeText(activity, "📌 ${card.icon} ${card.title} 카드로 이동했습니다.", Toast.LENGTH_SHORT).show()
        }
    }
}
