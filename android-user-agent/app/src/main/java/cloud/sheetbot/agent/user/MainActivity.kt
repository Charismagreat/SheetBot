package cloud.sheetbot.agent.user

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import cloud.sheetbot.agent.user.card.ActivityLauncherRegistry
import cloud.sheetbot.agent.user.card.AodModeController
import cloud.sheetbot.agent.user.card.AppUpdateController
import cloud.sheetbot.agent.user.card.CardAccordionController
import cloud.sheetbot.agent.user.card.CardSetupCoordinator
import cloud.sheetbot.agent.user.card.LocalLogViewController
import cloud.sheetbot.agent.user.card.PermissionController
import cloud.sheetbot.agent.user.card.SharedIntentRouter
import cloud.sheetbot.agent.user.card.SheetActionController
import cloud.sheetbot.agent.user.card.SmsObserverController
import cloud.sheetbot.agent.user.card.TargetFilterController
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import cloud.sheetbot.agent.user.service.KeepAliveService
import cloud.sheetbot.agent.user.storage.LocalLogManager
import cloud.sheetbot.agent.user.storage.PreferencesManager
import cloud.sheetbot.agent.user.util.TtsManager
import cloud.sheetbot.agent.user.util.UpdateManager

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: PreferencesManager
    private lateinit var logManager: LocalLogManager

    // 코루틴 내 미처리 예외 안전 흡수 핸들러 (크래시 차단)
    private val coroutineExceptionHandler = CoroutineExceptionHandler { _, throwable ->
        android.util.Log.e("MainActivity", "🚨 [COROUTINE DEFENDER] 비동기 예외 안전 포착: ${throwable.message}", throwable)
    }
    private val activityScope = CoroutineScope(Dispatchers.Main + SupervisorJob() + coroutineExceptionHandler)



    // 🎛️ 전 카드 초기화 및 생명주기 관리 전담 코디네이터 (v2.1.99 모듈화)
    private lateinit var cardCoordinator: CardSetupCoordinator

    private lateinit var sheetActionController: SheetActionController
    private lateinit var targetFilterController: TargetFilterController
    private lateinit var permissionController: PermissionController
    private lateinit var cardAccordionController: CardAccordionController
    private lateinit var sharedIntentRouter: SharedIntentRouter
    private lateinit var aodModeController: AodModeController
    private lateinit var localLogViewController: LocalLogViewController
    private lateinit var appUpdateController: AppUpdateController
    private lateinit var smsObserverController: SmsObserverController
    private lateinit var googleSignInClient: GoogleSignInClient

    // 🚀 액티비티 결과 런처(ActivityResultLauncher) 20종 통합 레지스트리 (v2.1.99 모듈화)
    private val launchers = ActivityLauncherRegistry(
        activity = this,
        getPrefsUserEmail = { prefs.userEmail },
        onAiCommandReceived = { spokenText ->
            binding.etAiCommand.setText(spokenText)
            aiCopilotCardController.executeAiCommand(spokenText)
        },
        isAccountPairingInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isAccountPairingInitialized },
        getAccountPairing = { cardCoordinator.accountPairingController },
        isPermissionInitialized = { ::permissionController.isInitialized },
        getPermission = { permissionController },
        isFileUploadInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isFileUploadInitialized },
        getFileUpload = { cardCoordinator.fileUploadCardController },
        isCallRecordInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isCallRecordInitialized },
        getCallRecord = { cardCoordinator.callRecordCardController },
        isReceiptInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isReceiptInitialized },
        getReceipt = { cardCoordinator.receiptCardController },
        isBusinessCardInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isBusinessCardInitialized },
        getBusinessCard = { cardCoordinator.businessCardController },
        isCallEndedInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isCallEndedInitialized },
        getCallEnded = { cardCoordinator.callEndedCardController },
        isQuoteInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isQuoteInitialized },
        getQuote = { cardCoordinator.quoteCardController },
        isEstimateInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isEstimateInitialized },
        getEstimate = { cardCoordinator.estimateCardController },
        isLawInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isLawInitialized },
        getLaw = { cardCoordinator.lawCardController },
        isBlogInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isBlogInitialized },
        getBlog = { cardCoordinator.blogCardController },
        isInstaInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isInstaInitialized },
        getInsta = { cardCoordinator.instaCardController },
        isSiteInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isSiteInitialized },
        getSite = { cardCoordinator.siteCardController },
        isKakaoInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isKakaoInitialized },
        getKakao = { cardCoordinator.kakaoCardController },
        isTargetFilterInitialized = { ::targetFilterController.isInitialized },
        getTargetFilter = { targetFilterController }
    )


    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            binding = ActivityMainBinding.inflate(layoutInflater)
            setContentView(binding.root)
        } catch (e: Throwable) {
            android.util.Log.e("MainActivity", "레이아웃 인플레이션 실패: ${e.message}", e)
            finish()
            return
        }

        try {
            prefs = PreferencesManager(this)
            logManager = LocalLogManager.getInstance(this)

            // Google Sign-In 옵션 초기화
            val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestEmail()
                .build()
            googleSignInClient = GoogleSignIn.getClient(this, gso)

            TtsManager.init(this)
            UpdateManager.checkForUpdates(this, showToastIfLatest = false)

            sheetActionController = SheetActionController(
                activity = this,
                prefs = prefs,
                scope = activityScope,
                addLogItem = { title, detail, success -> addLogItem(title, detail, success) }
            )

            targetFilterController = TargetFilterController(
                activity = this,
                binding = binding,
                launchContactPickerIntent = { intent -> launchers.contactPickerLauncher.launch(intent) },
                requestContactPermission = { launchers.contactPermissionLauncher.launch(Manifest.permission.READ_CONTACTS) },
                isSmsSyncControllerInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isSmsSyncInitialized },
                getSmsSyncController = { cardCoordinator.smsSyncCardController }
            )

            permissionController = PermissionController(
                activity = this,
                binding = binding,
                launchPermissionRequest = { perms -> launchers.permissionLauncher.launch(perms) }
            )
            permissionController.setup()

            cardAccordionController = CardAccordionController(
                binding = binding,
                prefs = prefs,
                getTokenWallet = { cardCoordinator.tokenWalletCardController },
                getAiCopilot = { cardCoordinator.aiCopilotCardController },
                getPaymentReceipt = { cardCoordinator.paymentReceiptCardController },
                getCallRecord = { cardCoordinator.callRecordCardController },
                getFileUpload = { cardCoordinator.fileUploadCardController },
                isSmsSyncInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isSmsSyncInitialized },
                getSmsSync = { cardCoordinator.smsSyncCardController },
                isQuoteInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isQuoteInitialized },
                getQuote = { cardCoordinator.quoteCardController },
                isEstimateInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isEstimateInitialized },
                getEstimate = { cardCoordinator.estimateCardController },
                isInCallSummaryInitialized = { ::cardCoordinator.isInitialized && cardCoordinator.isInCallSummaryInitialized },
                getInCallSummary = { cardCoordinator.inCallSummaryCardController }
            )

            sharedIntentRouter = SharedIntentRouter(
                context = this,
                onBookmarkUrl = { url, rawText ->
                    if (::cardCoordinator.isInitialized && cardCoordinator.isLinkScrapInitialized) {
                        cardCoordinator.linkScrapCardController.bookmarkSharedUrl(url, rawText)
                    }
                },
                onUploadFiles = { uris, sourceTag ->
                    cardCoordinator.fileUploadCardController.uploadFiles(uris, sourceTag)
                },
                onClearIntent = {
                    setIntent(Intent())
                }
            )

            aodModeController = AodModeController(
                activity = this,
                binding = binding,
                scope = activityScope
            )
            aodModeController.setup()

            localLogViewController = LocalLogViewController(
                activity = this,
                binding = binding,
                logManager = logManager
            )
            localLogViewController.setup()

            appUpdateController = AppUpdateController(
                activity = this,
                binding = binding
            )
            appUpdateController.setup()

            setupListeners()
            updateUiState()
            checkPermissions()

            if (prefs.isPaired) {
                KeepAliveService.start(this)
            }

            // 외부 공유하기(Share) 인텐트 처리
            handleSharedIntent(intent)

            // 스마트폰 발신 문자 및 실시간 수신 SMS/입금 감지 Observer/Receiver 등록 (v2.1.99)
            smsObserverController = SmsObserverController(
                context = this,
                onDepositOrSmsReceived = { sender, body, success ->
                    addLogItem(sender, body, success)
                    updateTargetBadges()
                }
            )
            smsObserverController.register()
        } catch (e: Throwable) {
            android.util.Log.e("MainActivity", "onCreate 초기화 중 오류 방어: ${e.message}", e)
            Toast.makeText(this, "에이전트 초기화 완료 (일부 항목 보호 모드 적용)", Toast.LENGTH_LONG).show()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleSharedIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        try {
            if (::permissionController.isInitialized) {
                permissionController.checkNotificationListenerPermission()
                permissionController.checkAndRequestBatteryOptimization()
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "권한 및 배터리 최적화 확인 방어: ${e.message}")
        }
        try {
            if (::sheetActionController.isInitialized) {
                sheetActionController.preloadActiveSheetUrls()
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "preloadActiveSheetUrls 방어: ${e.message}")
        }
        if (::cardCoordinator.isInitialized) {
            cardCoordinator.onResume()
        }
    }

    override fun onPause() {
        super.onPause()
        if (::cardCoordinator.isInitialized) {
            cardCoordinator.onPause()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try { if (::aodModeController.isInitialized) aodModeController.destroy() } catch (_: Throwable) {}
        if (::cardCoordinator.isInitialized) {
            cardCoordinator.onDestroy()
        }
        try { activityScope.coroutineContext.cancelChildren() } catch (_: Throwable) {}
        try {
            if (::smsObserverController.isInitialized) {
                smsObserverController.unregister()
            }
        } catch (_: Throwable) {}
    }

    private fun setupListeners() {
        cardCoordinator = CardSetupCoordinator(
            activity = this,
            binding = binding,
            prefs = prefs,
            scope = activityScope,
            launchers = launchers,
            googleSignInClient = googleSignInClient,
            showOpenSheetChooserDialog = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            provisionSheetAsync = { sheetType, sheetTitle, folderName -> provisionSheetAsync(sheetType, sheetTitle, folderName) },
            addLogItem = { sender, body, success -> addLogItem(sender, body, success) },
            updateTargetBadges = { updateTargetBadges() },
            showTargetManageDialog = { title, editText, targetType -> showTargetManageDialog(title, editText, targetType) },
            checkAndLaunchContactPicker = { targetType -> checkAndLaunchContactPicker(targetType) },
            openDriveFolder = { sheetType, defaultFolderName -> openDriveFolder(sheetType, defaultFolderName) },
            checkAndRequestAllFilesAccess = { onGranted -> checkAndRequestAllFilesAccess(onGranted) },
            isNotificationListenerEnabled = { isNotificationListenerEnabled() },
            requestNotificationListenerPermission = { requestNotificationListenerPermission() },
            updateCardCollapseState = { container, toggleBtn, isHidden -> updateCardCollapseState(container, toggleBtn, isHidden) },
            updateUiState = { updateUiState() },
            setupCardCollapseExpandListeners = { setupCardCollapseExpandListeners() }
        )
        cardCoordinator.setupAllCards()
    }

    private fun enterAodMode() =
        aodModeController.enterAodMode()

    private fun exitAodMode() =
        aodModeController.exitAodMode()

    private fun updateCardCollapseState(container: View, toggleBtn: TextView, isHidden: Boolean) =
        cardAccordionController.updateCardCollapseState(container, toggleBtn, isHidden)

    private fun refreshAllCardsCollapseState() =
        cardAccordionController.refreshAllCardsCollapseState()

    private fun setupCardCollapseExpandListeners() =
        cardAccordionController.setupCardCollapseExpandListeners()

    private fun updateUiState() {
        val verName = getAppVersionName()
        binding.tvAppVersionBadge.text = "v$verName"

        val isPaired = prefs.isPaired
        val email = prefs.userEmail

        if (::cardCoordinator.isInitialized) {
            if (cardCoordinator.isTokenWalletInitialized) {
                cardCoordinator.tokenWalletCardController.updateTokenNoticeVisibility(prefs.isTokenNoticeDismissed)
            }
            refreshAllCardsCollapseState()
            updateTargetBadges()

            if (cardCoordinator.isServerStatusInitialized) {
                cardCoordinator.serverStatusCardController.updateCardStatus(isPaired, email)
            }

            if (isPaired && !email.isNullOrBlank()) {
                binding.layoutUnlinkZone.visibility = View.VISIBLE
                binding.layoutWalletCard.visibility = View.VISIBLE
                binding.layoutUnpairedControls.visibility = View.GONE
                if (cardCoordinator.isTokenWalletInitialized) {
                    cardCoordinator.tokenWalletCardController.loadWalletBalance(email)
                }
                if (cardCoordinator.isCallRecordInitialized) {
                    cardCoordinator.callRecordCardController.refreshVoiceProfileStatus(email)
                }
            } else {
            binding.layoutUnlinkZone.visibility = View.GONE
            binding.layoutWalletCard.visibility = View.GONE
            binding.layoutUnpairedControls.visibility = View.VISIBLE
        }

        checkAppUpdateBadge()
    }

    private fun checkAppUpdateBadge() =
        appUpdateController.checkAppUpdateBadge()

    private fun addLogItem(sender: String, body: String, success: Boolean) =
        localLogViewController.addLogItem(sender, body, success)

    private fun updateLogCount() =
        localLogViewController.updateLogCount()

    // 🛡️ 시스템 권한 및 배터리 최적화 예외 위임 메서드 (PermissionController 전담)
    private fun checkPermissions() =
        permissionController.checkPermissions()

    /**
     * 외부 앱(갤러리, 파일 탐색기 등)에서 [공유하기]를 통해 SheetBot Agent로 전달된 파일 인텐트 처리
     */
    private fun handleSharedIntent(intent: Intent?) =
        sharedIntentRouter.handleSharedIntent(intent)

    // 📊 구글 스프레드시트 대장 프로비저닝 & 대장 열기 위임 메서드 (SheetActionController 전담)
    private fun showOpenSheetChooserDialog(sheetType: String, defaultTitle: String) =
        sheetActionController.showOpenSheetChooserDialog(sheetType, defaultTitle)

    private fun provisionSheetAsync(sheetType: String, sheetTitle: String, folderName: String? = null) =
        sheetActionController.provisionSheetAsync(sheetType, sheetTitle, folderName)

    private fun openExternalUrl(url: String) =
        sheetActionController.openExternalUrl(url)

    private fun openDriveFolder(sheetType: String, defaultFolderName: String) =
        sheetActionController.openDriveFolder(sheetType, defaultFolderName)

    private fun getAppVersionName(): String =
        appUpdateController.getAppVersionName()

    // 🎯 기록 대상(타겟) 필터 대장 및 연락처 피커/관리 위임 메서드 (TargetFilterController 전담)
    private fun checkAndLaunchContactPicker(targetType: String) =
        targetFilterController.checkAndLaunchContactPicker(targetType)

    private fun updateTargetBadges() =
        targetFilterController.updateTargetBadges()

    private fun showTargetManageDialog(dialogTitle: String, editText: EditText, targetType: String) =
        targetFilterController.showTargetManageDialog(dialogTitle, editText, targetType)

    private fun checkAndRequestAllFilesAccess(onGranted: (() -> Unit)? = null) =
        permissionController.checkAndRequestAllFilesAccess(onGranted)
}
