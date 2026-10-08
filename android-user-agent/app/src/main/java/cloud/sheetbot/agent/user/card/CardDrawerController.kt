package cloud.sheetbot.agent.user.card

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.R

/**
 * 📦 추가 기능 보관함 (Card Drawer) 및 사용자 맞춤 대시보드 컨트롤러
 *
 * 사용하지 않는 20여 종의 카드를 보관함에 모아 메인 화면을 심플하게 유지하고,
 * 필요할 때 언제든 [+ 꺼내기]하여 메인에 배치할 수 있도록 가시성을 제어합니다.
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
        val cardResId: Int,
        val headerResId: Int? = null
    )

    // 관리 대상 카드 20종 목록
    private val allCards = listOf(
        CardInfo("cardCallRecording", "통화 녹음 자동 분석", "🎙️", R.id.cardCallRecording, R.id.layoutCallRecordingHeader),
        CardInfo("cardInCallSummary", "수신 통화 시 고객 요약 팝업", "📞", R.id.cardInCallSummary, R.id.layoutInCallSummaryHeader),
        CardInfo("cardMissedCall", "부재중 전화 자동 답장", "📞", R.id.cardMissedCall, R.id.layoutMissedCallHeader),
        CardInfo("cardCallEnded", "통화 종료 후 명함 원터치 발송", "🪪", R.id.cardCallEnded, R.id.layoutCallEndedCardHeader),
        CardInfo("cardSmsSync", "스마트폰 문자 시트 동기화", "💬", R.id.cardSmsSync, R.id.layoutSmsSyncHeader),
        CardInfo("cardKakaoSync", "카카오톡 대화 자동 기록", "🟡", R.id.cardKakaoSync, R.id.layoutKakaoSyncHeader),
        CardInfo("cardPaymentReceipt", "매장 결제 확인 & 영수증 문자", "🧾", R.id.cardPaymentReceipt, R.id.layoutPaymentReceiptHeader),
        CardInfo("cardQuoteSync", "간편 주문 접수 기록", "📑", R.id.cardQuoteSync, R.id.layoutQuoteSyncHeader),
        CardInfo("cardEstimateSync", "간편 견적서 발행 대장", "📑", R.id.cardEstimateSync, R.id.layoutEstimateSyncHeader),
        CardInfo("cardFileUpload", "사진 & 문서 드라이브 보관", "📁", R.id.cardFileUpload, R.id.layoutFileUploadHeader),
        CardInfo("cardLinkScrap", "웹 링크 & 유튜브 요약 스크랩", "🔗", R.id.cardLinkScrap, R.id.layoutLinkScrapHeader),
        CardInfo("cardMeetingRecording", "회의 녹음 자동 회의록", "🎙️", R.id.cardMeetingRecording, R.id.layoutMeetingRecordingHeader),
        CardInfo("cardLawAdvisory", "AI 법률/계약서 팩트체크", "⚖️", R.id.cardLawAdvisory, R.id.layoutLawAdvisoryHeader),
        CardInfo("cardBlog", "AI 네이버 블로그 자동 포스팅", "✍️", R.id.cardBlog),
        CardInfo("cardInsta", "AI 인스타그램 피드 자동 발행", "📸", R.id.cardInsta),
        CardInfo("cardSite", "AI 모바일 홈페이지 제작", "🌐", R.id.cardSite),
        CardInfo("cardCompanyResearch", "원클릭 기업 심층 리서치", "🏢", R.id.cardCompanyResearch, R.id.layoutCompanyResearchHeader),
        CardInfo("cardWebsiteMonitor", "웹사이트 실시간 장애 감시", "🚨", R.id.cardWebsiteMonitor, R.id.layoutWebsiteMonitorHeader),
        CardInfo("cardContactsBackup", "스마트폰 연락처 백업", "📇", R.id.cardContactsBackup, R.id.layoutContactsHeader),
        CardInfo("cardUtility", "업데이트 확인 & 번인 방지", "🔄", R.id.cardUtility)
    )

    // 보관함 UI 뷰 캐시
    private var cardDrawerBox: View? = null
    private var layoutDrawerHeader: View? = null
    private var tvDrawerTitle: TextView? = null
    private var btnDrawerManage: TextView? = null
    private var btnToggleDrawer: TextView? = null
    private var layoutDrawerContent: View? = null
    private var layoutDrawerItems: LinearLayout? = null

    private var isDrawerExpanded = false

    fun setup() {
        findViews()
        setupListeners()
        applyCardVisibility()
        refreshDrawerList()
    }

    private fun findViews() {
        cardDrawerBox = activity.findViewById(R.id.cardDrawerBox)
        layoutDrawerHeader = activity.findViewById(R.id.layoutDrawerHeader)
        tvDrawerTitle = activity.findViewById(R.id.tvDrawerTitle)
        btnDrawerManage = activity.findViewById(R.id.btnDrawerManage)
        btnToggleDrawer = activity.findViewById(R.id.btnToggleDrawer)
        layoutDrawerContent = activity.findViewById(R.id.layoutDrawerContent)
        layoutDrawerItems = activity.findViewById(R.id.layoutDrawerItems)
    }

    private fun setupListeners() {
        // 보관함 열기/접기 토글
        layoutDrawerHeader?.setOnClickListener {
            toggleDrawer()
        }

        // 전체 대시보드 편집 다이얼로그
        btnDrawerManage?.setOnClickListener {
            showDashboardManageDialog()
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
     * 보관함 열기/닫기 토글
     */
    private fun toggleDrawer() {
        isDrawerExpanded = !isDrawerExpanded
        layoutDrawerContent?.visibility = if (isDrawerExpanded) View.VISIBLE else View.GONE
        btnToggleDrawer?.text = if (isDrawerExpanded) "▲" else "▼"
    }

    /**
     * 카드를 보관함으로 넣을 것인지 확인하는 다이얼로그
     */
    private fun showHideConfirmDialog(cardInfo: CardInfo) {
        AlertDialog.Builder(activity)
            .setTitle("📦 기능 보관함으로 이동")
            .setMessage("'${cardInfo.icon} ${cardInfo.title}' 카드를 추가 기능 보관함으로 이동하시겠습니까?\n\n메인 화면에서 숨겨지며, 보관함에서 언제든 다시 꺼낼 수 있습니다.")
            .setPositiveButton("보관함으로 이동") { _, _ ->
                hideCard(cardInfo.key)
                Toast.makeText(activity, "'${cardInfo.title}' 카드가 보관함으로 이동되었습니다.", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("취소", null)
            .show()
    }

    /**
     * 카드 숨기기 (보관함으로 넣기)
     */
    fun hideCard(key: String) {
        val current = prefs.hiddenCardKeys.toMutableSet()
        current.add(key)
        prefs.hiddenCardKeys = current

        applyCardVisibility()
        refreshDrawerList()
    }

    /**
     * 카드 꺼내기 (메인 화면에 다시 표시)
     */
    fun restoreCard(key: String) {
        val current = prefs.hiddenCardKeys.toMutableSet()
        current.remove(key)
        prefs.hiddenCardKeys = current

        applyCardVisibility()
        refreshDrawerList()
    }

    /**
     * SharedPreferences에 저장된 숨김 목록에 맞춰 각 카드의 visibility 적용
     */
    fun applyCardVisibility() {
        val hiddenKeys = prefs.hiddenCardKeys
        allCards.forEach { cardInfo ->
            val cardView = activity.findViewById<View>(cardInfo.cardResId)
            if (cardView != null) {
                val isHidden = hiddenKeys.contains(cardInfo.key)
                cardView.visibility = if (isHidden) View.GONE else View.VISIBLE
            }
        }
    }

    /**
     * 보관함 내부 목록 동적 생성 및 제목 갱신
     */
    private fun refreshDrawerList() {
        val hiddenKeys = prefs.hiddenCardKeys
        val hiddenCards = allCards.filter { hiddenKeys.contains(it.key) }

        tvDrawerTitle?.text = "📦 추가 기능 보관함 (${hiddenCards.size}개 보관 중)"

        val container = layoutDrawerItems ?: return
        container.removeAllViews()

        if (hiddenCards.isEmpty()) {
            val emptyTv = TextView(activity).apply {
                text = "현재 보관된 기능이 없습니다.\n모든 기능이 메인 화면에 표시 중입니다."
                setTextColor(Color.parseColor("#94A3B8"))
                textSize = 11f
                gravity = Gravity.CENTER
                setPadding(0, 16, 0, 16)
            }
            container.addView(emptyTv)
            return
        }

        // 각 숨겨진 카드 아이템 뷰 동적 생성
        hiddenCards.forEach { cardInfo ->
            val itemView = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setBackgroundColor(Color.parseColor("#0F172A"))
                setPadding(24, 16, 24, 16)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = 10
                }
            }

            // 아이콘 및 제목
            val textLayout = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }

            val titleTv = TextView(activity).apply {
                text = "${cardInfo.icon} ${cardInfo.title}"
                setTextColor(Color.parseColor("#E2E8F0"))
                textSize = 12f
            }
            textLayout.addView(titleTv)
            itemView.addView(textLayout)

            // [+ 꺼내기] 버튼
            val restoreBtn = Button(activity).apply {
                text = "+ 꺼내기"
                setTextColor(Color.parseColor("#38BDF8"))
                textSize = 11f
                setBackgroundColor(Color.parseColor("#1E293B"))
                setPadding(20, 0, 20, 0)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    activity.resources.displayMetrics.density.let { (34 * it).toInt() }
                )
                setOnClickListener {
                    restoreCard(cardInfo.key)
                    Toast.makeText(activity, "'${cardInfo.title}' 카드가 메인 화면으로 복원되었습니다.", Toast.LENGTH_SHORT).show()
                }
            }
            itemView.addView(restoreBtn)

            container.addView(itemView)
        }
    }

    /**
     * ⚙️ 대시보드 전체 편집 다이얼로그 (체크박스로 일괄 선택)
     */
    private fun showDashboardManageDialog() {
        val titles = allCards.map { "${it.icon} ${it.title}" }.toTypedArray()
        val hiddenKeys = prefs.hiddenCardKeys
        // checkedItems: 메인 화면에 표시할 카드 = true (숨겨지지 않은 카드)
        val checkedItems = BooleanArray(allCards.size) { index ->
            !hiddenKeys.contains(allCards[index].key)
        }

        AlertDialog.Builder(activity)
            .setTitle("⚙️ 메인 대시보드 카드 선택")
            .setMultiChoiceItems(titles, checkedItems) { _, which, isChecked ->
                checkedItems[which] = isChecked
            }
            .setPositiveButton("적용") { _, _ ->
                val newHiddenSet = mutableSetOf<String>()
                for (i in allCards.indices) {
                    if (!checkedItems[i]) {
                        newHiddenSet.add(allCards[i].key)
                    }
                }
                prefs.hiddenCardKeys = newHiddenSet
                applyCardVisibility()
                refreshDrawerList()
                Toast.makeText(activity, "대시보드 설정이 저장되었습니다.", Toast.LENGTH_SHORT).show()
            }
            .setNeutralButton("기본값 복원") { _, _ ->
                prefs.hiddenCardKeys = PreferencesManager.DEFAULT_HIDDEN_CARDS
                applyCardVisibility()
                refreshDrawerList()
                Toast.makeText(activity, "기본 대시보드로 복원되었습니다.", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("취소", null)
            .show()
    }
}
