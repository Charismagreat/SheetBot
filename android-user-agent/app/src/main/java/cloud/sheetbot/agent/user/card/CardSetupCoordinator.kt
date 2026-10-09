package cloud.sheetbot.agent.user.card

import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.CoroutineScope
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import cloud.sheetbot.agent.user.PreferencesManager

/**
 * 🎛️ 전 카드 초기화 및 생명주기 관리 전담 코디네이터 (CardSetupCoordinator)
 *
 * 24종 카드 컨트롤러의 생성, 바인딩, 생명주기 이벤트(onResume, onPause, onDestroy)를 전담하여
 * MainActivity.kt의 비대화를 원천 차단하고 단일 책임 원칙(SRP)을 완성합니다.
 */
class CardSetupCoordinator(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val scope: CoroutineScope,
    private val launchers: ActivityLauncherRegistry,
    private val googleSignInClient: GoogleSignInClient,
    private val showOpenSheetChooserDialog: (sheetType: String, defaultTitle: String) -> Unit,
    private val provisionSheetAsync: (sheetType: String, sheetTitle: String, folderName: String?) -> Unit,
    private val addLogItem: (sender: String, body: String, success: Boolean) -> Unit,
    private val updateTargetBadges: () -> Unit,
    private val showTargetManageDialog: (title: String, editText: EditText, targetType: String) -> Unit,
    private val checkAndLaunchContactPicker: (targetType: String) -> Unit,
    private val openDriveFolder: (sheetType: String, defaultFolderName: String) -> Unit,
    private val checkAndRequestAllFilesAccess: (onGranted: (() -> Unit)?) -> Unit,
    private val isNotificationListenerEnabled: () -> Boolean,
    private val requestNotificationListenerPermission: () -> Unit,
    private val updateCardCollapseState: (container: View, toggleBtn: View, isHidden: Boolean) -> Unit,
    private val updateUiState: () -> Unit,
    private val setupCardCollapseExpandListeners: () -> Unit
) {
    // 🎛️ 카드별/기능별 전담 컨트롤러 프로퍼티
    lateinit var serverStatusCardController: ServerStatusCardController
    lateinit var accountPairingController: AccountPairingController
    lateinit var tokenWalletCardController: TokenWalletCardController
    lateinit var paymentReceiptCardController: PaymentReceiptCardController
    lateinit var callRecordCardController: CallRecordCardController
    lateinit var meetingRecordingCardController: MeetingRecordingCardController
    lateinit var companyResearchCardController: CompanyResearchCardController
    lateinit var lawCardController: LawAdvisoryCardController
    lateinit var blogCardController: BlogAutomationCardController
    lateinit var instaCardController: InstagramAutomationCardController
    lateinit var siteCardController: MobileSiteCardController
    lateinit var fileUploadCardController: FileUploadCardController
    lateinit var linkScrapCardController: LinkScrapCardController
    lateinit var aiCopilotCardController: AiCopilotCardController
    lateinit var receiptCardController: ReceiptSyncCardController
    lateinit var businessCardController: BusinessCardSyncCardController
    lateinit var smsSyncCardController: SmsSyncCardController
    lateinit var kakaoCardController: KakaoSyncCardController
    lateinit var quoteCardController: QuoteSyncCardController
    lateinit var estimateCardController: EstimateSyncCardController
    lateinit var inCallSummaryCardController: InCallSummaryCardController
    lateinit var missedCallCardController: MissedCallCardController
    lateinit var websiteMonitorCardController: WebsiteMonitorCardController
    lateinit var contactsCardController: ContactsBackupCardController
    lateinit var featureRequestCardController: FeatureRequestCardController
    lateinit var callEndedCardController: CallEndedCardController

    // 🔍 초기화 여부 안전 확인 게터 프로퍼티
    val isAccountPairingInitialized get() = ::accountPairingController.isInitialized
    val isTokenWalletInitialized get() = ::tokenWalletCardController.isInitialized
    val isPaymentReceiptInitialized get() = ::paymentReceiptCardController.isInitialized
    val isCallRecordInitialized get() = ::callRecordCardController.isInitialized
    val isMeetingRecordingInitialized get() = ::meetingRecordingCardController.isInitialized
    val isCompanyResearchInitialized get() = ::companyResearchCardController.isInitialized
    val isLawInitialized get() = ::lawCardController.isInitialized
    val isBlogInitialized get() = ::blogCardController.isInitialized
    val isInstaInitialized get() = ::instaCardController.isInitialized
    val isSiteInitialized get() = ::siteCardController.isInitialized
    val isFileUploadInitialized get() = ::fileUploadCardController.isInitialized
    val isLinkScrapInitialized get() = ::linkScrapCardController.isInitialized
    val isAiCopilotInitialized get() = ::aiCopilotCardController.isInitialized
    val isReceiptInitialized get() = ::receiptCardController.isInitialized
    val isBusinessCardInitialized get() = ::businessCardController.isInitialized
    val isCallEndedInitialized get() = ::callEndedCardController.isInitialized
    val isSmsSyncInitialized get() = ::smsSyncCardController.isInitialized
    val isKakaoInitialized get() = ::kakaoCardController.isInitialized
    val isQuoteInitialized get() = ::quoteCardController.isInitialized
    val isEstimateInitialized get() = ::estimateCardController.isInitialized
    val isInCallSummaryInitialized get() = ::inCallSummaryCardController.isInitialized
    val isMissedCallInitialized get() = ::missedCallCardController.isInitialized
    val isWebsiteMonitorInitialized get() = ::websiteMonitorCardController.isInitialized
    val isContactsInitialized get() = ::contactsCardController.isInitialized
    val isFeatureRequestInitialized get() = ::featureRequestCardController.isInitialized
    val isServerStatusInitialized get() = ::serverStatusCardController.isInitialized

    /**
     * 🚀 24종 카드 컨트롤러 일괄 초기화 및 바인딩
     */
    fun setupAllCards() {
        // 0-0. 통합 모바일 에이전트 & 서버 관제 상태 카드 초기화 (v2.1.54 / 리팩토링)
        setupServerStatusCard()

        // 0-0-1. 전 카드 상시 접기/펼치기 아코디언 토글 초기화 및 리스너 등록 (v2.1.54)
        setupCardCollapseExpandListeners()

        // 0. Google 원클릭 로그인 및 계정 연동 초기화
        setupAccountPairing()

        // 0-1. AI 토큰 지갑 및 추천인 리워드 카드 초기화
        setupTokenWalletCard()

        // 6. 매장 결제 & 영수증 문자 전송 스위치
        setupPaymentReceiptCard()

        // 통화 녹음 구글 드라이브 자동 백업 및 AI 전사 카드 초기화
        setupCallRecordCard()

        // 🎙️ 회의 녹음 구글 드라이브 및 [SheetBot] 회의록 대장 자동 백업 카드 초기화
        setupMeetingRecordingCard()

        // 🔍 원클릭 기업 심층 리서치 및 문서화 카드 초기화 (v2.1.99 리팩토링 모듈화)
        setupCompanyResearchCard()

        // ⚖️ AI 법률/계약서 팩트체크 카드 초기화
        setupLawAdvisoryCard()

        // ✍️ AI 네이버 블로그 자동 포스팅 카드 초기화
        setupBlogAutomationCard()

        // 📸 AI 인스타그램 피드 & 해시태그 카드 초기화
        setupInstagramAutomationCard()

        // 🌐 AI 모바일 홈페이지 제작 & 관리 카드 초기화
        setupMobileSiteCard()

        // 사진 및 문서 파일 구글 드라이브 업로드 카드 초기화
        setupFileUploadCard()

        // 🌐 웹 링크 & 유튜브 영상 AI 자동 스크랩 카드 초기화 (v2.1.99 리팩토링 모듈화)
        setupLinkScrapCard()

        // 자연어 AI 시트 코파일럿 카드 초기화
        setupAiCopilotCard()

        // 🧾 영수증 AI OCR 자동 장부화 카드 초기화 (v2.1.99 리팩토링 모듈화)
        setupReceiptCard()

        // 🪪 명함 AI OCR 자동 인맥 등록 카드 초기화 (v2.1.99 리팩토링 모듈화)
        setupBusinessCardSyncCard()

        // 🎯 문자(SMS/LMS) 송수신 구글 시트 동기화 카드 초기화 (v2.1.99 리팩토링 모듈화)
        setupSmsCard()

        // 💬 카카오톡 수신 메시지 구글 시트 동기화 카드 초기화 (v2.1.99 리팩토링 모듈화)
        setupKakaoSyncCard()

        // 📑 AI 스마트 견적 및 단가표 대장 연동 카드 초기화 (v2.1.99 리팩토링 모듈화)
        setupQuoteCard()

        // 📑 AI 스마트 간편 견적서 발행 대장 연동 카드 초기화 (v2.1.99 리팩토링 모듈화)
        setupEstimateCard()

        // 📞 수신 전화 시 고객 시트 요약 인콜 플로팅 팝업 카드 초기화 (v2.1.99 리팩토링 모듈화)
        setupInCallSummaryCard()

        // 📵 부재중 전화(Missed Call) 0원 스마트 자동 회신 카드 초기화 (v2.1.99 리팩토링 모듈화)
        setupMissedCallCard()

        // 💼 통화 종료 직후 모바일 명함 원터치 발송 카드 초기화 (v2.1.99 리팩토링 모듈화)
        setupCallEndedCard()

        // 🌐 내 웹사이트 실시간 장애 감시 (Uptime Sentinel) UI 바인딩
        setupWebsiteMonitorCard()

        // 📇 스마트폰 연락처 구글 시트 자동 동기화 UI 바인딩
        setupContactsSyncCard()

        // 💡 우리 가게·회사 맞춤 기능 제작 의뢰 카드 초기화 (v2.1.99)
        setupFeatureRequestCard()
    }

    /**
     * 🔄 화면 재진입 시 각 카드의 상태 갱신
     */
    fun onResume() {
        try {
            if (::serverStatusCardController.isInitialized) {
                serverStatusCardController.startServerMonitorLoop()
            }
        } catch (e: Throwable) {
            android.util.Log.w("CardSetupCoordinator", "startServerMonitorLoop 방어: ${e.message}")
        }
        try {
            if (::websiteMonitorCardController.isInitialized) {
                websiteMonitorCardController.updateStatusText()
            }
        } catch (e: Throwable) {
            android.util.Log.w("CardSetupCoordinator", "updateWebsiteMonitorStatusText 방어: ${e.message}")
        }
        try {
            if (::quoteCardController.isInitialized) {
                quoteCardController.refreshQuoteImageUi()
            }
        } catch (e: Throwable) {
            android.util.Log.w("CardSetupCoordinator", "refreshQuoteImageUi 방어: ${e.message}")
        }
        try {
            if (::estimateCardController.isInitialized) {
                estimateCardController.refreshEstimateImageUi()
            }
        } catch (e: Throwable) {
            android.util.Log.w("CardSetupCoordinator", "refreshEstimateImageUi 방어: ${e.message}")
        }
        try {
            if (::callEndedCardController.isInitialized) {
                callEndedCardController.refreshUi()
            }
        } catch (e: Throwable) {
            android.util.Log.w("CardSetupCoordinator", "callEndedCardController refreshUi 방어: ${e.message}")
        }
        try {
            if (::inCallSummaryCardController.isInitialized) {
                inCallSummaryCardController.updateOverlayPermissionStatus()
            }
        } catch (e: Throwable) {
            android.util.Log.w("CardSetupCoordinator", "updateOverlayPermissionStatus 방어: ${e.message}")
        }
    }

    /**
     * ⏸️ 화면 백그라운드 전환 시 서버 감시 중단
     */
    fun onPause() {
        try {
            if (::serverStatusCardController.isInitialized) {
                serverStatusCardController.stopServerMonitorLoop()
            }
        } catch (_: Throwable) {}
    }

    /**
     * 🛑 액티비티 파괴 시 리소스 정리
     */
    fun onDestroy() {
        try {
            if (::serverStatusCardController.isInitialized) {
                serverStatusCardController.stopServerMonitorLoop()
            }
        } catch (_: Throwable) {}
    }

    private fun setupServerStatusCard() {
        serverStatusCardController = ServerStatusCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            scope = scope
        )
        serverStatusCardController.setup()
    }

    private fun setupAccountPairing() {
        accountPairingController = AccountPairingController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            scope = scope,
            googleSignInClient = googleSignInClient,
            launchGoogleSignIn = { intent -> launchers.googleSignInLauncher.launch(intent) },
            launchAccountPicker = { intent -> launchers.accountPickerLauncher.launch(intent) },
            launchQrScan = { launchQrScanner() },
            onPairingSuccess = { _ ->
                updateUiState()
            },
            onUnlinkSuccess = {
                updateUiState()
            },
            addLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )
        accountPairingController.setup()
    }

    private fun launchQrScanner() {
        val options = ScanOptions().apply {
            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            setPrompt("시트봇 워크스페이스 모니터 화면의 연동 QR코드를 비춰주세요")
            setCameraId(0)
            setBeepEnabled(true)
            setBarcodeImageEnabled(false)
            setOrientationLocked(true)
        }
        launchers.barcodeLauncher.launch(options)
    }

    private fun setupTokenWalletCard() {
        tokenWalletCardController = TokenWalletCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            scope = scope,
            updateCardCollapseState = { layout, button, isHidden -> updateCardCollapseState(layout, button, isHidden) }
        )
        tokenWalletCardController.setup()
    }

    private fun setupPaymentReceiptCard() {
        paymentReceiptCardController = PaymentReceiptCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            scope = scope,
            isNotificationListenerEnabled = { isNotificationListenerEnabled() },
            requestNotificationListenerPermission = { requestNotificationListenerPermission() },
            provisionSheetAsync = { type, defaultTitle -> provisionSheetAsync(type, defaultTitle, null) },
            showOpenSheetChooserDialog = { type, title -> showOpenSheetChooserDialog(type, title) },
            updateCardCollapseState = { layout, button, isHidden -> updateCardCollapseState(layout, button, isHidden) }
        )
        paymentReceiptCardController.setup()
    }

    private fun setupCallRecordCard() {
        callRecordCardController = CallRecordCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            scope = scope,
            checkAndRequestAllFilesAccess = { checkAndRequestAllFilesAccess(null) },
            provisionSheetAsync = { type, defaultTitle, folderName -> provisionSheetAsync(type, defaultTitle, folderName) },
            checkAndLaunchContactPicker = { type -> checkAndLaunchContactPicker(type) },
            showTargetManageDialog = { title, targetEditText, type -> showTargetManageDialog(title, targetEditText, type) },
            updateTargetBadges = { updateTargetBadges() },
            showOpenSheetChooserDialog = { type, title -> showOpenSheetChooserDialog(type, title) },
            openDriveFolder = { type, folderName -> openDriveFolder(type, folderName) },
            launchExternalRecordingPicker = { launchers.externalRecordingPickerLauncher.launch("audio/*") },
            requestRecordAudioPermission = { launchers.recordAudioPermissionLauncher.launch(android.Manifest.permission.RECORD_AUDIO) },
            updateCardCollapseState = { layout, button, isHidden -> updateCardCollapseState(layout, button, isHidden) }
        )
        callRecordCardController.setup()
    }

    private fun setupMeetingRecordingCard() {
        meetingRecordingCardController = MeetingRecordingCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            scope = scope,
            checkAndRequestAllFilesAccess = { checkAndRequestAllFilesAccess(null) },
            provisionSheetAsync = { type, defaultTitle, folderName -> provisionSheetAsync(type, defaultTitle, folderName) },
            showOpenSheetChooserDialog = { type, title -> showOpenSheetChooserDialog(type, title) },
            updateCardCollapseState = { layout, button, isHidden -> updateCardCollapseState(layout, button, isHidden) }
        )
        meetingRecordingCardController.setup()
    }

    private fun setupCompanyResearchCard() {
        companyResearchCardController = CompanyResearchCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) }
        )
        companyResearchCardController.setup()
    }

    private fun setupLawAdvisoryCard() {
        lawCardController = LawAdvisoryCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onPickFile = { launchers.lawAdvisoryFilePickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) }
        )
        lawCardController.setup()
    }

    private fun setupBlogAutomationCard() {
        blogCardController = BlogAutomationCardController(
            activity = activity,
            binding = binding.cardBlog,
            prefs = prefs,
            onPickImages = { launchers.blogImagesPickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) }
        )
        blogCardController.setup()
    }

    private fun setupInstagramAutomationCard() {
        instaCardController = InstagramAutomationCardController(
            activity = activity,
            binding = binding.cardInsta,
            prefs = prefs,
            onPickImages = { launchers.instaImagesPickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) }
        )
        instaCardController.setup()
    }

    private fun setupMobileSiteCard() {
        siteCardController = MobileSiteCardController(
            activity = activity,
            binding = binding.cardSite,
            prefs = prefs,
            onPickImages = { launchers.siteImagesPickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) }
        )
        siteCardController.setup()
    }

    private fun setupFileUploadCard() {
        fileUploadCardController = FileUploadCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            scope = scope,
            launchFilePicker = { launchers.filePickerLauncher.launch("*/*") },
            provisionSheetAsync = { type, defaultTitle, folderName -> provisionSheetAsync(type, defaultTitle, folderName) },
            showOpenSheetChooserDialog = { type, title -> showOpenSheetChooserDialog(type, title) },
            openDriveFolder = { type, folderName -> openDriveFolder(type, folderName) },
            addLogItem = { title, detail, success -> addLogItem(title, detail, success) },
            updateCardCollapseState = { layout, button, isHidden -> updateCardCollapseState(layout, button, isHidden) }
        )
        fileUploadCardController.setup()
    }

    private fun setupLinkScrapCard() {
        linkScrapCardController = LinkScrapCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle, null) },
            onAddLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )
        linkScrapCardController.setup()
    }

    private fun setupAiCopilotCard() {
        aiCopilotCardController = AiCopilotCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            scope = scope,
            launchSpeechRecognizer = { intent -> launchers.speechRecognizerLauncher.launch(intent) },
            addLogItem = { title, detail, success -> addLogItem(title, detail, success) },
            updateCardCollapseState = { layout, button, isHidden -> updateCardCollapseState(layout, button, isHidden) }
        )
        aiCopilotCardController.setup()
    }

    private fun setupReceiptCard() {
        receiptCardController = ReceiptSyncCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onPickReceiptImage = { launchers.receiptPickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onAddLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )
        receiptCardController.setup()
    }

    private fun setupBusinessCardSyncCard() {
        businessCardController = BusinessCardSyncCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onPickBusinessCardImage = { launchers.businessCardPickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onAddLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )
        businessCardController.setup()
    }

    private fun setupSmsCard() {
        smsSyncCardController = SmsSyncCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onPickContact = { checkAndLaunchContactPicker("SMS") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle, null) },
            onShowTargetManageDialog = { title, editText, targetType -> showTargetManageDialog(title, editText, targetType) },
            isNotificationListenerEnabled = { isNotificationListenerEnabled() },
            requestNotificationListenerPermission = { requestNotificationListenerPermission() }
        )
        smsSyncCardController.setup()
    }

    private fun setupKakaoSyncCard() {
        kakaoCardController = KakaoSyncCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onPickChatFile = {
                try {
                    launchers.kakaoChatPickerLauncher.launch("*/*")
                } catch (_: Exception) {
                    try {
                        launchers.kakaoChatPickerLauncher.launch("text/*")
                    } catch (e: Exception) {
                        Toast.makeText(activity, "파일 탐색기를 열 수 없습니다: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
                    }
                }
            },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle, null) },
            onShowTargetManageDialog = { title, editText, targetType -> showTargetManageDialog(title, editText, targetType) },
            onUpdateTargetBadges = { updateTargetBadges() },
            onAddLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )
        kakaoCardController.setup()
    }

    private fun setupQuoteCard() {
        quoteCardController = QuoteSyncCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onPickQuoteImage = { launchers.quoteImagePickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle, null) }
        )
        quoteCardController.setup()
    }

    private fun setupEstimateCard() {
        estimateCardController = EstimateSyncCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onPickEstimateImage = { launchers.estimateImagePickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle, null) }
        )
        estimateCardController.setup()
    }

    private fun setupInCallSummaryCard() {
        inCallSummaryCardController = InCallSummaryCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) }
        )
        inCallSummaryCardController.setup()
    }

    private fun setupMissedCallCard() {
        missedCallCardController = MissedCallCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle, null) }
        )
        missedCallCardController.setup()
    }

    private fun setupCallEndedCard() {
        callEndedCardController = CallEndedCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onPickImage = { launchers.callEndedImagePickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle, null) },
            onAddLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )
        callEndedCardController.setup()
    }

    private fun setupWebsiteMonitorCard() {
        websiteMonitorCardController = WebsiteMonitorCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle, null) }
        )
        websiteMonitorCardController.setup()
    }

    private fun setupContactsSyncCard() {
        contactsCardController = ContactsBackupCardController(
            activity = activity,
            binding = binding,
            prefs = prefs,
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle, null) },
            onRequestPermission = { permission, requestCode ->
                androidx.core.app.ActivityCompat.requestPermissions(activity, arrayOf(permission), requestCode)
            }
        )
        contactsCardController.setup()
    }

    private fun setupFeatureRequestCard() {
        featureRequestCardController = FeatureRequestCardController(
            activity = activity,
            prefs = prefs
        )
        featureRequestCardController.setup()
    }
}
