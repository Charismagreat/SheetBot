package cloud.sheetbot.agent.user

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import cloud.sheetbot.agent.user.card.ActivityLauncherRegistry
import cloud.sheetbot.agent.user.card.CardSetupCoordinator
import cloud.sheetbot.agent.user.card.MainCoreCoordinator
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import cloud.sheetbot.agent.user.storage.LocalLogManager

/**
 * 📱 SheetBot 메인 액티비티 (MainActivity)
 *
 * v2.1.99 모듈화 아키텍처:
 * - 24종 카드 업무 컨트롤러 전담 코디네이터 (CardSetupCoordinator)
 * - 8대 코어 시스템/권한/생명주기 전담 코디네이터 (MainCoreCoordinator)
 * - 20종 ActivityResultLauncher 통합 레지스트리 (ActivityLauncherRegistry)
 * - OS 상호작용 생명주기 이벤트만 중계하는 극도로 얇고 안전한(Ultra-Thin) 순수 액티비티 래퍼
 */
class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: PreferencesManager
    private lateinit var logManager: LocalLogManager

    // 코루틴 내 미처리 예외 안전 흡수 핸들러 (크래시 차단)
    private val coroutineExceptionHandler = CoroutineExceptionHandler { _, throwable ->
        android.util.Log.e("MainActivity", "🚨 [COROUTINE DEFENDER] 비동기 예외 안전 포착: ${throwable.message}", throwable)
    }
    private val activityScope = CoroutineScope(Dispatchers.Main + SupervisorJob() + coroutineExceptionHandler)

    // 🎛️ 전담 코디네이터 프로퍼티
    private var cardCoordinator: CardSetupCoordinator? = null
    private lateinit var coreCoordinator: MainCoreCoordinator

    // 🚀 액티비티 결과 런처(ActivityResultLauncher) 20종 통합 레지스트리 (v2.1.99 모듈화)
    private val launchers = ActivityLauncherRegistry(
        activity = this,
        getPrefsUserEmail = { prefs.userEmail },
        onAiCommandReceived = { spokenText ->
            binding.etAiCommand.setText(spokenText)
            cardCoordinator?.aiCopilotCardController?.executeAiCommand(spokenText)
        },
        isAccountPairingInitialized = { cardCoordinator?.isAccountPairingInitialized == true },
        getAccountPairing = { cardCoordinator!!.accountPairingController },
        isPermissionInitialized = { ::coreCoordinator.isInitialized && coreCoordinator.isPermissionInitialized },
        getPermission = { coreCoordinator.permissionController },
        isFileUploadInitialized = { cardCoordinator?.isFileUploadInitialized == true },
        getFileUpload = { cardCoordinator!!.fileUploadCardController },
        isCallRecordInitialized = { cardCoordinator?.isCallRecordInitialized == true },
        getCallRecord = { cardCoordinator!!.callRecordCardController },
        isReceiptInitialized = { cardCoordinator?.isReceiptInitialized == true },
        getReceipt = { cardCoordinator!!.receiptCardController },
        isBusinessCardInitialized = { cardCoordinator?.isBusinessCardInitialized == true },
        getBusinessCard = { cardCoordinator!!.businessCardController },
        isCallEndedInitialized = { cardCoordinator?.isCallEndedInitialized == true },
        getCallEnded = { cardCoordinator!!.callEndedCardController },
        isQuoteInitialized = { cardCoordinator?.isQuoteInitialized == true },
        getQuote = { cardCoordinator!!.quoteCardController },
        isEstimateInitialized = { cardCoordinator?.isEstimateInitialized == true },
        getEstimate = { cardCoordinator!!.estimateCardController },
        isLawInitialized = { cardCoordinator?.isLawInitialized == true },
        getLaw = { cardCoordinator!!.lawCardController },
        isBlogInitialized = { cardCoordinator?.isBlogInitialized == true },
        getBlog = { cardCoordinator!!.blogCardController },
        isInstaInitialized = { cardCoordinator?.isInstaInitialized == true },
        getInsta = { cardCoordinator!!.instaCardController },
        isSiteInitialized = { cardCoordinator?.isSiteInitialized == true },
        getSite = { cardCoordinator!!.siteCardController },
        isKakaoInitialized = { cardCoordinator?.isKakaoInitialized == true },
        getKakao = { cardCoordinator!!.kakaoCardController },
        isTargetFilterInitialized = { ::coreCoordinator.isInitialized && coreCoordinator.isTargetFilterInitialized },
        getTargetFilter = { coreCoordinator.targetFilterController }
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

            coreCoordinator = MainCoreCoordinator(
                activity = this,
                binding = binding,
                prefs = prefs,
                logManager = logManager,
                scope = activityScope,
                launchers = launchers,
                getCardCoordinator = { cardCoordinator },
                onInitCardCoordinator = { googleSignInClient ->
                    setupCardCoordinator(googleSignInClient)
                }
            )
            coreCoordinator.onCreate(intent)
        } catch (e: Throwable) {
            android.util.Log.e("MainActivity", "onCreate 초기화 중 오류 방어: ${e.message}", e)
            Toast.makeText(this, "에이전트 초기화 완료 (일부 항목 보호 모드 적용)", Toast.LENGTH_LONG).show()
        }
    }

    private fun setupCardCoordinator(googleSignInClient: GoogleSignInClient) {
        val coordinator = CardSetupCoordinator(
            activity = this,
            binding = binding,
            prefs = prefs,
            scope = activityScope,
            launchers = launchers,
            googleSignInClient = googleSignInClient,
            showOpenSheetChooserDialog = { sheetType, defaultTitle -> coreCoordinator.showOpenSheetChooserDialog(sheetType, defaultTitle) },
            provisionSheetAsync = { sheetType, sheetTitle, folderName -> coreCoordinator.provisionSheetAsync(sheetType, sheetTitle, folderName) },
            addLogItem = { sender, body, success -> coreCoordinator.addLogItem(sender, body, success) },
            updateTargetBadges = { coreCoordinator.updateTargetBadges() },
            showTargetManageDialog = { title, editText, targetType -> coreCoordinator.showTargetManageDialog(title, editText, targetType) },
            checkAndLaunchContactPicker = { targetType -> coreCoordinator.checkAndLaunchContactPicker(targetType) },
            openDriveFolder = { sheetType, defaultFolderName -> coreCoordinator.openDriveFolder(sheetType, defaultFolderName) },
            checkAndRequestAllFilesAccess = { onGranted -> coreCoordinator.checkAndRequestAllFilesAccess(onGranted) },
            isNotificationListenerEnabled = { coreCoordinator.permissionController.isNotificationListenerEnabled() },
            requestNotificationListenerPermission = { coreCoordinator.permissionController.requestNotificationListenerPermission() },
            updateCardCollapseState = { container, toggleBtn, isHidden -> coreCoordinator.updateCardCollapseState(container, toggleBtn, isHidden) },
            updateUiState = { coreCoordinator.updateUiState() },
            setupCardCollapseExpandListeners = { coreCoordinator.setupCardCollapseExpandListeners() }
        )
        cardCoordinator = coordinator
        coordinator.setupAllCards()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (::coreCoordinator.isInitialized) {
            coreCoordinator.onNewIntent(intent)
        }
    }

    override fun onResume() {
        super.onResume()
        if (::coreCoordinator.isInitialized) {
            coreCoordinator.onResume()
        }
        cardCoordinator?.onResume()
    }

    override fun onPause() {
        super.onPause()
        cardCoordinator?.onPause()
    }

    fun updateCardCollapseState(container: android.view.View, toggleBtn: android.view.View, isHidden: Boolean) {
        if (::coreCoordinator.isInitialized) {
            coreCoordinator.updateCardCollapseState(container, toggleBtn, isHidden)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::coreCoordinator.isInitialized) {
            coreCoordinator.onDestroy()
        }
        cardCoordinator?.onDestroy()
        try { activityScope.coroutineContext.cancelChildren() } catch (_: Throwable) {}
    }
}
