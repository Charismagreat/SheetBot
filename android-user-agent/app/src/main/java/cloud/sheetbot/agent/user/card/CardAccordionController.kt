package cloud.sheetbot.agent.user.card

import android.view.View
import android.widget.TextView
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding

/**
 * 🪗 전체 카드 상시 접기/펼치기 아코디언 통합 관리 컨트롤러 (v2.1.54)
 *
 * - 20여 개 전체 개별 카드의 SharedPreferences 접힘 상태(isXxxDetailsHidden) 일괄 로드 및 UI 동기화
 * - 각 카드 헤더 영역 클릭 리스너 및 화살표 버튼(▲/▼) 토글 이벤트 일괄 등록
 * - 개별 카드 컨테이너 가시성(VISIBLE/GONE) 및 화살표 방향 전환 유틸리티
 */
class CardAccordionController(
    private val binding: ActivityMainBinding,
    private val prefs: AppPreferences,
    private val getTokenWallet: () -> TokenWalletCardController,
    private val getAiCopilot: () -> AiCopilotCardController,
    private val getPaymentReceipt: () -> PaymentReceiptCardController,
    private val getCallRecord: () -> CallRecordCardController,
    private val getFileUpload: () -> FileUploadCardController,
    private val isSmsSyncInitialized: () -> Boolean,
    private val getSmsSync: () -> SmsSyncCardController,
    private val isQuoteInitialized: () -> Boolean,
    private val getQuote: () -> QuoteSyncCardController,
    private val isEstimateInitialized: () -> Boolean,
    private val getEstimate: () -> EstimateSyncCardController,
    private val isInCallSummaryInitialized: () -> Boolean,
    private val getInCallSummary: () -> InCallSummaryCardController
) {

    fun updateCardCollapseState(container: View, toggleBtn: TextView, isHidden: Boolean) {
        container.visibility = if (isHidden) View.GONE else View.VISIBLE
        toggleBtn.text = if (isHidden) "▼" else "▲"
    }

    fun refreshAllCardsCollapseState() {
        getTokenWallet().refreshCollapseState()
        getAiCopilot().refreshCollapseState()
        getPaymentReceipt().refreshCollapseState()
        getCallRecord().refreshCollapseState()
        getFileUpload().refreshCollapseState()
        updateCardCollapseState(binding.layoutLinkScrapSettings, binding.btnToggleLinkScrapDetails, prefs.isLinkScrapDetailsHidden)
        if (isSmsSyncInitialized()) {
            getSmsSync().refreshCollapseState()
        } else {
            updateCardCollapseState(binding.layoutSmsSyncSettings, binding.btnToggleSmsSyncDetails, prefs.isSmsSyncDetailsHidden)
        }
        updateCardCollapseState(binding.layoutKakaoSyncSettings, binding.btnToggleKakaoSyncDetails, prefs.isKakaoSyncDetailsHidden)
        if (isQuoteInitialized()) {
            getQuote().refreshCollapseState()
        } else {
            updateCardCollapseState(binding.layoutQuoteSyncSettings, binding.btnToggleQuoteSyncDetails, prefs.isQuoteSyncDetailsHidden)
        }
        if (isEstimateInitialized()) {
            getEstimate().refreshCollapseState()
        } else {
            updateCardCollapseState(binding.layoutEstimateSyncSettings, binding.btnToggleEstimateSyncDetails, prefs.isEstimateSyncDetailsHidden)
        }
        if (isInCallSummaryInitialized()) {
            getInCallSummary().refreshCollapseState()
        } else {
            updateCardCollapseState(binding.layoutInCallSummarySettings, binding.btnToggleInCallSummaryDetails, prefs.isInCallSummaryDetailsHidden)
        }
        updateCardCollapseState(binding.layoutMissedCallSettings, binding.btnToggleMissedCallDetails, prefs.isMissedCallDetailsHidden)
        updateCardCollapseState(binding.layoutCallEndedCardSettings, binding.btnToggleCallEndedCardDetails, prefs.isCallEndedCardDetailsHidden)
        updateCardCollapseState(binding.layoutWebsiteMonitorSettings, binding.btnToggleWebsiteMonitorDetails, prefs.isWebsiteMonitorDetailsHidden)
        updateCardCollapseState(binding.layoutContactsDetails, binding.btnToggleContactsDetails, prefs.isContactsDetailsHidden)
    }

    fun setupCardCollapseExpandListeners() {
        refreshAllCardsCollapseState()

        // 1. 토큰 지갑 카드
        binding.layoutWalletHeader.setOnClickListener { getTokenWallet().toggleCollapse() }
        binding.btnToggleWalletDetails.setOnClickListener { getTokenWallet().toggleCollapse() }

        // 2. AI 비서 카드
        binding.layoutCopilotHeader.setOnClickListener { getAiCopilot().toggleCollapse() }
        binding.btnToggleCopilotDetails.setOnClickListener { getAiCopilot().toggleCollapse() }

        // 3. 매장 결제 & 영수증 카드
        binding.layoutPaymentReceiptHeader.setOnClickListener { getPaymentReceipt().toggleCollapse() }
        binding.btnTogglePaymentReceiptDetails.setOnClickListener { getPaymentReceipt().toggleCollapse() }

        // 4. 통화 녹음 카드
        binding.layoutCallRecordingHeader.setOnClickListener { getCallRecord().toggleCollapse() }
        binding.btnToggleCallRecordingDetails.setOnClickListener { getCallRecord().toggleCollapse() }

        // 5. 사진 & 문서 보관 카드
        binding.layoutFileUploadHeader.setOnClickListener { getFileUpload().toggleCollapse() }
        binding.btnToggleFileUploadDetails.setOnClickListener { getFileUpload().toggleCollapse() }
    }
}
