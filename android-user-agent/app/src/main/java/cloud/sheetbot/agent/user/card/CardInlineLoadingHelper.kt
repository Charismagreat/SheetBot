package cloud.sheetbot.agent.user.card

import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import java.util.WeakHashMap

/**
 * ⏳ 카드 내부 인라인 로딩 표시 헬퍼 (v2.4.34)
 *
 * - 기존 최상단 공용 progressBar가 카드 외부(화면 상단 허공)에 동떨어져 표시되던 UX 문제를 해결하고,
 *   사용자가 실행 버튼을 누른 해당 카드 내부에 즉시 스피너와 진행 상태 문구를 인라인으로 표시합니다.
 */
object CardInlineLoadingHelper {
    private const val TAG_LOADING_BOX = "card_inline_loading_box"
    private const val TAG_LOADING_TEXT = "card_inline_loading_text"
    private val originalButtonTexts = WeakHashMap<Button, CharSequence>()

    fun show(
        container: ViewGroup,
        message: String = "⏳ AI가 작업을 처리하고 있습니다...",
        triggerButton: Button? = null,
        loadingButtonText: String? = null
    ) {
        val context = container.context
        val density = context.resources.displayMetrics.density
        val dp = { v: Int -> (v * density).toInt() }

        var loadingBox = container.findViewWithTag<LinearLayout>(TAG_LOADING_BOX)
        if (loadingBox == null) {
            loadingBox = LinearLayout(context).apply {
                tag = TAG_LOADING_BOX
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dp(8).toFloat()
                    setColor(Color.parseColor("#0F172A"))
                    setStroke(dp(1), Color.parseColor("#0284C7"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    topMargin = dp(8)
                    bottomMargin = dp(4)
                }

                val spinner = ProgressBar(context).apply {
                    isIndeterminate = true
                    indeterminateTintList = ColorStateList.valueOf(Color.parseColor("#38BDF8"))
                    layoutParams = LinearLayout.LayoutParams(dp(20), dp(20)).apply {
                        marginEnd = dp(10)
                    }
                }
                addView(spinner)

                val tvMsg = TextView(context).apply {
                    tag = TAG_LOADING_TEXT
                    text = message
                    textSize = 11.5f
                    setTextColor(Color.parseColor("#E2E8F0"))
                    setTypeface(null, Typeface.BOLD)
                    layoutParams = LinearLayout.LayoutParams(
                        0,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        1f
                    )
                }
                addView(tvMsg)
            }
            container.addView(loadingBox)
        } else {
            loadingBox.findViewWithTag<TextView>(TAG_LOADING_TEXT)?.text = message
        }

        loadingBox.visibility = View.VISIBLE

        if (triggerButton != null) {
            if (!originalButtonTexts.containsKey(triggerButton)) {
                originalButtonTexts[triggerButton] = triggerButton.text
            }
            triggerButton.isEnabled = false
            if (!loadingButtonText.isNullOrBlank()) {
                triggerButton.text = loadingButtonText
            }
        }
    }

    fun hide(container: ViewGroup, triggerButton: Button? = null) {
        container.findViewWithTag<View>(TAG_LOADING_BOX)?.visibility = View.GONE
        if (triggerButton != null) {
            triggerButton.isEnabled = true
            originalButtonTexts.remove(triggerButton)?.let { orig ->
                triggerButton.text = orig
            }
        }
    }
}
