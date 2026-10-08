package cloud.sheetbot.agent.user

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.PowerManager
import android.provider.ContactsContract
import android.provider.Settings
import android.speech.RecognizerIntent
import android.media.MediaRecorder
import android.media.MediaPlayer
import android.os.CountDownTimer
import android.widget.ProgressBar
import android.util.Base64
import android.util.Log
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.core.widget.doAfterTextChanged
import java.io.File
import java.text.NumberFormat
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import cloud.sheetbot.agent.user.card.BlogAutomationCardController
import cloud.sheetbot.agent.user.card.InstagramAutomationCardController
import cloud.sheetbot.agent.user.card.MobileSiteCardController
import cloud.sheetbot.agent.user.card.LawAdvisoryCardController
import cloud.sheetbot.agent.user.card.CompanyResearchCardController
import cloud.sheetbot.agent.user.card.WebsiteMonitorCardController
import cloud.sheetbot.agent.user.card.ContactsBackupCardController
import cloud.sheetbot.agent.user.card.LinkScrapCardController
import cloud.sheetbot.agent.user.card.MissedCallCardController
import cloud.sheetbot.agent.user.card.KakaoSyncCardController
import cloud.sheetbot.agent.user.card.CallEndedCardController
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.text.SimpleDateFormat
import java.util.Date
import android.text.method.ScrollingMovementMethod
import java.util.Locale
import kotlin.random.Random
import cloud.sheetbot.agent.user.card.PaymentReceiptCardController
import cloud.sheetbot.agent.user.card.CallRecordCardController
import cloud.sheetbot.agent.user.card.MeetingRecordingCardController
import cloud.sheetbot.agent.user.card.FileUploadCardController
import cloud.sheetbot.agent.user.card.AiCopilotCardController
import cloud.sheetbot.agent.user.card.TokenWalletCardController
import cloud.sheetbot.agent.user.card.AccountPairingController
import cloud.sheetbot.agent.user.card.ServerStatusCardController
import cloud.sheetbot.agent.user.card.SheetActionController
import cloud.sheetbot.agent.user.card.TargetFilterController
import cloud.sheetbot.agent.user.card.PermissionController
import cloud.sheetbot.agent.user.card.CardAccordionController

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: PreferencesManager
    private lateinit var logManager: LocalLogManager

    // 코루틴 내 미처리 예외 안전 흡수 핸들러 (크래시 차단)
    private val coroutineExceptionHandler = CoroutineExceptionHandler { _, throwable ->
        android.util.Log.e("MainActivity", "🚨 [COROUTINE DEFENDER] 비동기 예외 안전 포착: ${throwable.message}", throwable)
    }
    private val activityScope = CoroutineScope(Dispatchers.Main + SupervisorJob() + coroutineExceptionHandler)



    // 🎛️ 카드별/기능별 전담 컨트롤러 프로퍼티
    private lateinit var lawCardController: LawAdvisoryCardController
    private lateinit var blogCardController: BlogAutomationCardController
    private lateinit var instaCardController: InstagramAutomationCardController
    private lateinit var siteCardController: MobileSiteCardController
    private lateinit var companyResearchCardController: CompanyResearchCardController
    private lateinit var websiteMonitorCardController: WebsiteMonitorCardController
    private lateinit var contactsCardController: ContactsBackupCardController
    private lateinit var linkScrapCardController: LinkScrapCardController
    private lateinit var missedCallCardController: MissedCallCardController
    private lateinit var kakaoCardController: KakaoSyncCardController
    private lateinit var callEndedCardController: CallEndedCardController
    private lateinit var smsSyncCardController: SmsSyncCardController
    private lateinit var quoteCardController: QuoteSyncCardController
    private lateinit var estimateCardController: EstimateSyncCardController
    private lateinit var inCallSummaryCardController: InCallSummaryCardController
    private lateinit var receiptCardController: ReceiptSyncCardController
    private lateinit var businessCardController: BusinessCardSyncCardController
    private lateinit var paymentReceiptCardController: PaymentReceiptCardController
    private lateinit var callRecordCardController: CallRecordCardController
    private lateinit var meetingRecordingCardController: MeetingRecordingCardController
    private lateinit var fileUploadCardController: FileUploadCardController
    private lateinit var aiCopilotCardController: AiCopilotCardController
    private lateinit var tokenWalletCardController: TokenWalletCardController
    private lateinit var accountPairingController: AccountPairingController
    private lateinit var serverStatusCardController: ServerStatusCardController
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
        isAccountPairingInitialized = { ::accountPairingController.isInitialized },
        getAccountPairing = { accountPairingController },
        isPermissionInitialized = { ::permissionController.isInitialized },
        getPermission = { permissionController },
        isFileUploadInitialized = { ::fileUploadCardController.isInitialized },
        getFileUpload = { fileUploadCardController },
        isCallRecordInitialized = { ::callRecordCardController.isInitialized },
        getCallRecord = { callRecordCardController },
        isReceiptInitialized = { ::receiptCardController.isInitialized },
        getReceipt = { receiptCardController },
        isBusinessCardInitialized = { ::businessCardController.isInitialized },
        getBusinessCard = { businessCardController },
        isCallEndedInitialized = { ::callEndedCardController.isInitialized },
        getCallEnded = { callEndedCardController },
        isQuoteInitialized = { ::quoteCardController.isInitialized },
        getQuote = { quoteCardController },
        isEstimateInitialized = { ::estimateCardController.isInitialized },
        getEstimate = { estimateCardController },
        isLawInitialized = { ::lawCardController.isInitialized },
        getLaw = { lawCardController },
        isBlogInitialized = { ::blogCardController.isInitialized },
        getBlog = { blogCardController },
        isInstaInitialized = { ::instaCardController.isInitialized },
        getInsta = { instaCardController },
        isSiteInitialized = { ::siteCardController.isInitialized },
        getSite = { siteCardController },
        isKakaoInitialized = { ::kakaoCardController.isInitialized },
        getKakao = { kakaoCardController },
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
                isSmsSyncControllerInitialized = { ::smsSyncCardController.isInitialized },
                getSmsSyncController = { smsSyncCardController }
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
                getTokenWallet = { tokenWalletCardController },
                getAiCopilot = { aiCopilotCardController },
                getPaymentReceipt = { paymentReceiptCardController },
                getCallRecord = { callRecordCardController },
                getFileUpload = { fileUploadCardController },
                isSmsSyncInitialized = { ::smsSyncCardController.isInitialized },
                getSmsSync = { smsSyncCardController },
                isQuoteInitialized = { ::quoteCardController.isInitialized },
                getQuote = { quoteCardController },
                isEstimateInitialized = { ::estimateCardController.isInitialized },
                getEstimate = { estimateCardController },
                isInCallSummaryInitialized = { ::inCallSummaryCardController.isInitialized },
                getInCallSummary = { inCallSummaryCardController }
            )

            sharedIntentRouter = SharedIntentRouter(
                context = this,
                onBookmarkUrl = { url, rawText ->
                    if (::linkScrapCardController.isInitialized) {
                        linkScrapCardController.bookmarkSharedUrl(url, rawText)
                    }
                },
                onUploadFiles = { uris, sourceTag ->
                    fileUploadCardController.uploadFiles(uris, sourceTag)
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
            if (::serverStatusCardController.isInitialized) {
                serverStatusCardController.startServerMonitorLoop()
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "startServerMonitorLoop 방어: ${e.message}")
        }
        try {
            if (::sheetActionController.isInitialized) {
                sheetActionController.preloadActiveSheetUrls()
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "preloadActiveSheetUrls 방어: ${e.message}")
        }
        try {
            if (::websiteMonitorCardController.isInitialized) {
                websiteMonitorCardController.updateStatusText()
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "updateWebsiteMonitorStatusText 방어: ${e.message}")
        }
        try {
            if (::quoteCardController.isInitialized) {
                quoteCardController.refreshQuoteImageUi()
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "refreshQuoteImageUi 방어: ${e.message}")
        }
        try {
            if (::estimateCardController.isInitialized) {
                estimateCardController.refreshEstimateImageUi()
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "refreshEstimateImageUi 방어: ${e.message}")
        }
        try {
            if (::callEndedCardController.isInitialized) {
                callEndedCardController.refreshUi()
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "callEndedCardController refreshUi 방어: ${e.message}")
        }
        try {
            if (::inCallSummaryCardController.isInitialized) {
                inCallSummaryCardController.updateOverlayPermissionStatus()
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "updateOverlayPermissionStatus 방어: ${e.message}")
        }
    }

    override fun onPause() {
        super.onPause()
        try {
            if (::serverStatusCardController.isInitialized) {
                serverStatusCardController.stopServerMonitorLoop()
            }
        } catch (_: Throwable) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        try { if (::aodModeController.isInitialized) aodModeController.destroy() } catch (_: Throwable) {}
        try {
            if (::serverStatusCardController.isInitialized) {
                serverStatusCardController.stopServerMonitorLoop()
            }
        } catch (_: Throwable) {}
        try { activityScope.coroutineContext.cancelChildren() } catch (_: Throwable) {}
        try {
            if (::smsObserverController.isInitialized) {
                smsObserverController.unregister()
            }
        } catch (_: Throwable) {}
    }

    private fun setupListeners() {
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

        tokenWalletCardController.updateTokenNoticeVisibility(prefs.isTokenNoticeDismissed)
        refreshAllCardsCollapseState()
        updateTargetBadges()

        if (::serverStatusCardController.isInitialized) {
            serverStatusCardController.updateCardStatus(isPaired, email)
        }

        if (isPaired && !email.isNullOrBlank()) {
            binding.layoutUnlinkZone.visibility = View.VISIBLE
            binding.layoutWalletCard.visibility = View.VISIBLE
            binding.layoutUnpairedControls.visibility = View.GONE
            tokenWalletCardController.loadWalletBalance(email)
            callRecordCardController.refreshVoiceProfileStatus(email)
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

    // ==========================================
    // 🌐 내 웹사이트 실시간 장애 감시 (Uptime Sentinel) UI 바인딩
    /**
     * 🌐 내 웹사이트 실시간 장애 감시 (Uptime Sentinel) 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupWebsiteMonitorCard() {
        websiteMonitorCardController = WebsiteMonitorCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle) }
        )
        websiteMonitorCardController.setup()
    }

    // ==========================================
/**
     * 📇 스마트폰 연락처 구글 시트 자동 동기화 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupContactsSyncCard() {
        contactsCardController = ContactsBackupCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle) },
            onRequestPermission = { permission, requestCode ->
                androidx.core.app.ActivityCompat.requestPermissions(this, arrayOf(permission), requestCode)
            }
        )
        contactsCardController.setup()
    }

    private fun checkAndRequestAllFilesAccess(onGranted: (() -> Unit)? = null) =
        permissionController.checkAndRequestAllFilesAccess(onGranted)

    private fun setupLawAdvisoryCard() {
        lawCardController = LawAdvisoryCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onPickFile = { launchers.lawAdvisoryFilePickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) }
        )
        lawCardController.setup()
    }

    /**
     * ✍️ AI 네이버 블로그 자동 포스팅 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupBlogAutomationCard() {
        blogCardController = BlogAutomationCardController(
            activity = this,
            binding = binding.cardBlog,
            prefs = prefs,
            onPickImages = { launchers.blogImagesPickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) }
        )
        blogCardController.setup()
    }

    /**
     * 📸 AI 인스타그램 피드 & 해시태그 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupInstagramAutomationCard() {
        instaCardController = InstagramAutomationCardController(
            activity = this,
            binding = binding.cardInsta,
            prefs = prefs,
            onPickImages = { launchers.instaImagesPickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) }
        )
        instaCardController.setup()
    }


    /**
     * 🌐 AI 모바일 홈페이지 제작 & 관리 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupMobileSiteCard() {
        siteCardController = MobileSiteCardController(
            activity = this,
            binding = binding.cardSite,
            prefs = prefs,
            onPickImages = { launchers.siteImagesPickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) }
        )
        siteCardController.setup()
    }

    /**
     * 🔍 원클릭 기업 심층 리서치 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupCompanyResearchCard() {
        companyResearchCardController = CompanyResearchCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) }
        )
        companyResearchCardController.setup()
    }

    /**
     * 🌐 웹 링크 & 유튜브 3줄 요약 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupLinkScrapCard() {
        linkScrapCardController = LinkScrapCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle) },
            onAddLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )
        linkScrapCardController.setup()
    }

    /**
     * 📵 부재중 전화 0원 스마트 자동 답장 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupMissedCallCard() {
        missedCallCardController = MissedCallCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle) }
        )
        missedCallCardController.setup()
    }

    /**
     * 💬 카카오톡 대화 내용 구글 시트 자동 동기화 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupKakaoSyncCard() {
        kakaoCardController = KakaoSyncCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onPickChatFile = {
                try {
                    launchers.kakaoChatPickerLauncher.launch("*/*")
                } catch (_: Exception) {
                    try {
                        launchers.kakaoChatPickerLauncher.launch("text/*")
                    } catch (e: Exception) {
                        Toast.makeText(this, "파일 탐색기를 열 수 없습니다: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
                    }
                }
            },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle) },
            onShowTargetManageDialog = { title, editText, targetType -> showTargetManageDialog(title, editText, targetType) },
            onUpdateTargetBadges = { updateTargetBadges() },
            onAddLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )
        kakaoCardController.setup()
    }

    /**
     * 💼 통화 종료 직후 모바일 명함 원터치 발송 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupCallEndedCard() {
        callEndedCardController = CallEndedCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onPickImage = { launchers.callEndedImagePickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle) },
            onAddLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )
        callEndedCardController.setup()
    }

    /**
     * 🎯 문자(SMS/LMS) 송수신 구글 시트 동기화 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupSmsCard() {
        smsSyncCardController = SmsSyncCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onPickContact = { checkAndLaunchContactPicker("SMS") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle) },
            onShowTargetManageDialog = { title, editText, targetType -> showTargetManageDialog(title, editText, targetType) },
            isNotificationListenerEnabled = { isNotificationListenerEnabled() },
            requestNotificationListenerPermission = { requestNotificationListenerPermission() }
        )
        smsSyncCardController.setup()
    }

    /**
     * 📑 AI 스마트 간편 주문서 & 단가표 대장 연동 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupQuoteCard() {
        quoteCardController = QuoteSyncCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onPickQuoteImage = { launchers.quoteImagePickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle) }
        )
        quoteCardController.setup()
    }

    /**
     * 📑 AI 스마트 간편 견적서 발행 대장 연동 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupEstimateCard() {
        estimateCardController = EstimateSyncCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onPickEstimateImage = { launchers.estimateImagePickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onProvisionSheet = { sheetType, defaultTitle -> provisionSheetAsync(sheetType, defaultTitle) }
        )
        estimateCardController.setup()
    }

    /**
     * 📞 수신 전화 시 고객 시트 요약 인콜 플로팅 팝업 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupInCallSummaryCard() {
        inCallSummaryCardController = InCallSummaryCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) }
        )
        inCallSummaryCardController.setup()
    }

    /**
     * 🧾 영수증 AI OCR 자동 장부화 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupReceiptCard() {
        receiptCardController = ReceiptSyncCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onPickReceiptImage = { launchers.receiptPickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onAddLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )
        receiptCardController.setup()
    }

    /**
     * 🪪 명함 AI OCR 자동 인맥 등록 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
    private fun setupBusinessCardSyncCard() {
        businessCardController = BusinessCardSyncCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onPickBusinessCardImage = { launchers.businessCardPickerLauncher.launch("image/*") },
            onOpenSheetChooser = { sheetType, defaultTitle -> showOpenSheetChooserDialog(sheetType, defaultTitle) },
            onAddLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )
        businessCardController.setup()
    }
    private fun setupPaymentReceiptCard() {
        paymentReceiptCardController = PaymentReceiptCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            scope = activityScope,
            isNotificationListenerEnabled = { isNotificationListenerEnabled() },
            requestNotificationListenerPermission = { requestNotificationListenerPermission() },
            provisionSheetAsync = { type, defaultTitle -> provisionSheetAsync(type, defaultTitle) },
            showOpenSheetChooserDialog = { type, title -> showOpenSheetChooserDialog(type, title) },
            updateCardCollapseState = { layout, button, isHidden -> updateCardCollapseState(layout, button, isHidden) }
        )
        paymentReceiptCardController.setup()
    }

    private fun setupCallRecordCard() {
        callRecordCardController = CallRecordCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            scope = activityScope,
            checkAndRequestAllFilesAccess = { checkAndRequestAllFilesAccess() },
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
            activity = this,
            binding = binding,
            prefs = prefs,
            scope = activityScope,
            checkAndRequestAllFilesAccess = { checkAndRequestAllFilesAccess() },
            provisionSheetAsync = { type, defaultTitle, folderName -> provisionSheetAsync(type, defaultTitle, folderName) },
            showOpenSheetChooserDialog = { type, title -> showOpenSheetChooserDialog(type, title) },
            updateCardCollapseState = { layout, button, isHidden -> updateCardCollapseState(layout, button, isHidden) }
        )
        meetingRecordingCardController.setup()
    }

    private fun setupFileUploadCard() {
        fileUploadCardController = FileUploadCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            scope = activityScope,
            launchFilePicker = { launchers.filePickerLauncher.launch("*/*") },
            provisionSheetAsync = { type, defaultTitle, folderName -> provisionSheetAsync(type, defaultTitle, folderName) },
            showOpenSheetChooserDialog = { type, title -> showOpenSheetChooserDialog(type, title) },
            openDriveFolder = { type, folderName -> openDriveFolder(type, folderName) },
            addLogItem = { title, detail, success -> addLogItem(title, detail, success) },
            updateCardCollapseState = { layout, button, isHidden -> updateCardCollapseState(layout, button, isHidden) }
        )
        fileUploadCardController.setup()
    }

    private fun setupAiCopilotCard() {
        aiCopilotCardController = AiCopilotCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            scope = activityScope,
            launchSpeechRecognizer = { intent -> launchers.speechRecognizerLauncher.launch(intent) },
            addLogItem = { title, detail, success -> addLogItem(title, detail, success) },
            updateCardCollapseState = { layout, button, isHidden -> updateCardCollapseState(layout, button, isHidden) }
        )
        aiCopilotCardController.setup()
    }

    private fun setupTokenWalletCard() {
        tokenWalletCardController = TokenWalletCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            scope = activityScope,
            updateCardCollapseState = { layout, button, isHidden -> updateCardCollapseState(layout, button, isHidden) }
        )
        tokenWalletCardController.setup()
    }

    private fun setupAccountPairing() {
        accountPairingController = AccountPairingController(
            activity = this,
            binding = binding,
            prefs = prefs,
            scope = activityScope,
            googleSignInClient = googleSignInClient,
            launchGoogleSignIn = { intent -> launchers.googleSignInLauncher.launch(intent) },
            launchAccountPicker = { intent -> launchers.accountPickerLauncher.launch(intent) },
            launchQrScan = { launchQrScanner() },
            onPairingSuccess = { email ->
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

    private fun setupServerStatusCard() {
        serverStatusCardController = ServerStatusCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            scope = activityScope
        )
        serverStatusCardController.setup()
    }

}




