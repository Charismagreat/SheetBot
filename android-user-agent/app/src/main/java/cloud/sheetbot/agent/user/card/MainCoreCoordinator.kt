package cloud.sheetbot.agent.user.card

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.EditText
import android.widget.TextView
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import kotlinx.coroutines.CoroutineScope
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import cloud.sheetbot.agent.user.KeepAliveService
import cloud.sheetbot.agent.user.LocalLogManager
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.TtsManager
import cloud.sheetbot.agent.user.UpdateManager

/**
 * 🏛️ 메인 액티비티 코어 시스템 및 생명주기 총괄 코디네이터 (MainCoreCoordinator)
 *
 * 권한, 타겟 필터, 아코디언, AOD, 공유 인텐트, 로컬 로그, 앱 업데이트, SMS 감지 옵저버 등
 * 액티비티의 8대 핵심 시스템 컨트롤러를 일원화하여 MainActivity.kt의 초슬림 아키텍처를 완성합니다.
 */
class MainCoreCoordinator(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val logManager: LocalLogManager,
    private val scope: CoroutineScope,
    private val launchers: ActivityLauncherRegistry,
    private val getCardCoordinator: () -> CardSetupCoordinator?,
    private val onInitCardCoordinator: (GoogleSignInClient) -> Unit
) {
    lateinit var sheetActionController: SheetActionController
    lateinit var targetFilterController: TargetFilterController
    lateinit var permissionController: PermissionController
    lateinit var cardAccordionController: CardAccordionController
    lateinit var sharedIntentRouter: SharedIntentRouter
    lateinit var aodModeController: AodModeController
    lateinit var localLogViewController: LocalLogViewController
    lateinit var appUpdateController: AppUpdateController
    lateinit var smsObserverController: SmsObserverController
    lateinit var cardDrawerController: CardDrawerController
    lateinit var googleSignInClient: GoogleSignInClient

    val isTargetFilterInitialized get() = ::targetFilterController.isInitialized
    val isPermissionInitialized get() = ::permissionController.isInitialized

    fun onCreate(intent: Intent?) {
        // Google Sign-In 옵션 초기화
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .build()
        googleSignInClient = GoogleSignIn.getClient(activity, gso)

        TtsManager.init(activity)
        UpdateManager.checkForUpdates(activity, showToastIfLatest = false)

        sheetActionController = SheetActionController(
            activity = activity,
            prefs = prefs,
            scope = scope,
            addLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )

        targetFilterController = TargetFilterController(
            activity = activity,
            binding = binding,
            launchContactPickerIntent = { it -> launchers.contactPickerLauncher.launch(it) },
            requestContactPermission = { launchers.contactPermissionLauncher.launch(Manifest.permission.READ_CONTACTS) },
            isSmsSyncControllerInitialized = {
                val card = getCardCoordinator()
                card != null && card.isSmsSyncInitialized
            },
            getSmsSyncController = { getCardCoordinator()!!.smsSyncCardController }
        )

        permissionController = PermissionController(
            activity = activity,
            binding = binding,
            launchPermissionRequest = { perms -> launchers.permissionLauncher.launch(perms) }
        )
        permissionController.setup()

        cardAccordionController = CardAccordionController(
            binding = binding,
            prefs = prefs,
            getTokenWallet = { getCardCoordinator()!!.tokenWalletCardController },
            getAiCopilot = { getCardCoordinator()!!.aiCopilotCardController },
            getPaymentReceipt = { getCardCoordinator()!!.paymentReceiptCardController },
            getCallRecord = { getCardCoordinator()!!.callRecordCardController },
            getFileUpload = { getCardCoordinator()!!.fileUploadCardController },
            isSmsSyncInitialized = {
                val card = getCardCoordinator()
                card != null && card.isSmsSyncInitialized
            },
            getSmsSync = { getCardCoordinator()!!.smsSyncCardController },
            isQuoteInitialized = {
                val card = getCardCoordinator()
                card != null && card.isQuoteInitialized
            },
            getQuote = { getCardCoordinator()!!.quoteCardController },
            isEstimateInitialized = {
                val card = getCardCoordinator()
                card != null && card.isEstimateInitialized
            },
            getEstimate = { getCardCoordinator()!!.estimateCardController },
            isInCallSummaryInitialized = {
                val card = getCardCoordinator()
                card != null && card.isInCallSummaryInitialized
            },
            getInCallSummary = { getCardCoordinator()!!.inCallSummaryCardController }
        )

        sharedIntentRouter = SharedIntentRouter(
            context = activity,
            onBookmarkUrl = { url, rawText ->
                val card = getCardCoordinator()
                if (card != null && card.isLinkScrapInitialized) {
                    card.linkScrapCardController.bookmarkSharedUrl(url, rawText)
                }
            },
            onUploadFiles = { uris, sourceTag ->
                getCardCoordinator()?.fileUploadCardController?.uploadFiles(uris, sourceTag)
            },
            onClearIntent = {
                activity.setIntent(Intent())
            }
        )

        aodModeController = AodModeController(
            activity = activity,
            binding = binding,
            scope = scope
        )
        aodModeController.setup()

        localLogViewController = LocalLogViewController(
            activity = activity,
            binding = binding,
            logManager = logManager
        )
        localLogViewController.setup()

        appUpdateController = AppUpdateController(
            activity = activity,
            binding = binding
        )
        appUpdateController.setup()

        // 24종 카드 컨트롤러 초기화 콜백 트리거
        onInitCardCoordinator(googleSignInClient)

        // 📦 추가 기능 보관함 (Card Drawer) 및 사용자 맞춤 대시보드 가시성 제어 초기화
        cardDrawerController = CardDrawerController(
            activity = activity,
            prefs = prefs
        )
        cardDrawerController.setup()

        // 🔍 자연어·초성·숫자 다중 카드 빠른 검색 바텀시트 연동 (v2.1.99)
        binding.btnSearchCards.setOnClickListener {
            CardSearchBottomSheetDialog(
                activity = activity,
                prefs = prefs,
                cardDrawerController = cardDrawerController,
                scrollView = binding.mainScrollView
            ).show()
        }

        updateUiState()
        checkPermissions()

        if (prefs.isPaired) {
            KeepAliveService.start(activity)
        }

        // 외부 공유하기(Share) 인텐트 처리
        handleSharedIntent(intent)

        // 스마트폰 발신 문자 및 실시간 수신 SMS/입금 감지 Observer/Receiver 등록 (v2.1.99)
        smsObserverController = SmsObserverController(
            context = activity,
            onDepositOrSmsReceived = { sender, body, success ->
                addLogItem(sender, body, success)
                updateTargetBadges()
            }
        )
        smsObserverController.register()
    }

    fun onResume() {
        try {
            if (::permissionController.isInitialized) {
                permissionController.checkNotificationListenerPermission()
                permissionController.checkAndRequestBatteryOptimization()
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainCoreCoordinator", "권한 및 배터리 최적화 확인 방어: ${e.message}")
        }
        try {
            if (::sheetActionController.isInitialized) {
                sheetActionController.preloadActiveSheetUrls()
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainCoreCoordinator", "preloadActiveSheetUrls 방어: ${e.message}")
        }
    }

    fun onDestroy() {
        try { if (::aodModeController.isInitialized) aodModeController.destroy() } catch (_: Throwable) {}
        try {
            if (::smsObserverController.isInitialized) {
                smsObserverController.unregister()
            }
        } catch (_: Throwable) {}
    }

    fun onNewIntent(intent: Intent?) {
        handleSharedIntent(intent)
    }

    fun updateUiState() {
        val verName = getAppVersionName()
        binding.tvAppVersionBadge.text = "v$verName"

        val isPaired = prefs.isPaired
        val email = prefs.userEmail

        val card = getCardCoordinator()
        if (card != null) {
            if (card.isTokenWalletInitialized) {
                card.tokenWalletCardController.updateTokenNoticeVisibility(prefs.isTokenNoticeDismissed)
            }
            refreshAllCardsCollapseState()
            updateTargetBadges()

            if (card.isServerStatusInitialized) {
                card.serverStatusCardController.updateCardStatus(isPaired, email)
            }

            if (isPaired && !email.isNullOrBlank()) {
                binding.layoutUnlinkZone.visibility = View.VISIBLE
                binding.layoutWalletCard.visibility = View.VISIBLE
                binding.layoutUnpairedControls.visibility = View.GONE
                if (card.isTokenWalletInitialized) {
                    card.tokenWalletCardController.loadWalletBalance(email)
                }
                if (card.isCallRecordInitialized) {
                    card.callRecordCardController.refreshVoiceProfileStatus(email)
                }
            } else {
                binding.layoutUnlinkZone.visibility = View.GONE
                binding.layoutWalletCard.visibility = View.GONE
                binding.layoutUnpairedControls.visibility = View.VISIBLE
            }
        }

        checkAppUpdateBadge()
    }

    fun enterAodMode() = aodModeController.enterAodMode()
    fun exitAodMode() = aodModeController.exitAodMode()

    fun updateCardCollapseState(container: View, toggleBtn: View, isHidden: Boolean) =
        cardAccordionController.updateCardCollapseState(container, toggleBtn, isHidden)

    fun refreshAllCardsCollapseState() =
        cardAccordionController.refreshAllCardsCollapseState()

    fun setupCardCollapseExpandListeners() =
        cardAccordionController.setupCardCollapseExpandListeners()

    fun checkAppUpdateBadge() =
        appUpdateController.checkAppUpdateBadge()

    fun addLogItem(sender: String, body: String, success: Boolean) =
        localLogViewController.addLogItem(sender, body, success)

    fun updateLogCount() =
        localLogViewController.updateLogCount()

    fun checkPermissions() =
        permissionController.checkPermissions()

    fun handleSharedIntent(intent: Intent?) =
        sharedIntentRouter.handleSharedIntent(intent)

    fun showOpenSheetChooserDialog(sheetType: String, defaultTitle: String) =
        sheetActionController.showOpenSheetChooserDialog(sheetType, defaultTitle)

    fun provisionSheetAsync(sheetType: String, sheetTitle: String, folderName: String? = null) =
        sheetActionController.provisionSheetAsync(sheetType, sheetTitle, folderName)

    fun openExternalUrl(url: String) =
        sheetActionController.openExternalUrl(url)

    fun openDriveFolder(sheetType: String, defaultFolderName: String) =
        sheetActionController.openDriveFolder(sheetType, defaultFolderName)

    fun getAppVersionName(): String =
        appUpdateController.getAppVersionName()

    fun checkAndLaunchContactPicker(targetType: String) =
        targetFilterController.checkAndLaunchContactPicker(targetType)

    fun updateTargetBadges() =
        targetFilterController.updateTargetBadges()

    fun showTargetManageDialog(dialogTitle: String, editText: EditText, targetType: String) =
        targetFilterController.showTargetManageDialog(dialogTitle, editText, targetType)

    fun checkAndRequestAllFilesAccess(onGranted: (() -> Unit)? = null) =
        permissionController.checkAndRequestAllFilesAccess(onGranted)
}
