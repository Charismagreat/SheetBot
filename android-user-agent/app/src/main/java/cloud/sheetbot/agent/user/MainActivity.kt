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

    private var aodJob: Job? = null
    private lateinit var aodGestureDetector: GestureDetector
    private var smsSentObserver: SmsSentObserver? = null
    private var isDepositReceiverRegistered = false
    private var lastHandledShareUrl: String? = null
    private var lastHandledShareTime: Long = 0L

    // 입금 감지 시 실시간 화면 갱신 리시버 (ANR 방어를 위해 가벼운 로그만 갱신)
    private val depositUpdateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val body = intent?.getStringExtra("smsBody") ?: ""
            val sender = intent?.getStringExtra("sender") ?: ""
            val success = intent?.getBooleanExtra("success", false) ?: false
            addLogItem(sender, body, success)
            updateTargetBadges()
        }
    }

    // QR 코드 스캐너 런처 (ZXing Embedded)
    private val barcodeLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            accountPairingController.handleQrScanResult(result.contents)
        }
    }

    // 런타임 권한 요청 런처 (SMS, 카메라, 알림)
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (::permissionController.isInitialized) {
            permissionController.onPermissionResult(permissions)
        }
    }

    // 사진 및 일반 파일 다중 선택 런처
    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (!uris.isNullOrEmpty()) {
            fileUploadCardController.uploadFiles(uris, "앱 내 직접 선택 파일 업로드")
        }
    }

    // 다른 폰/외부에서 전송받은 통화 녹음 파일(.m4a, .mp3 등) 직접 선택 런처
    private val externalRecordingPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (!uris.isNullOrEmpty()) {
            callRecordCardController.uploadExternalRecordings(uris)
        }
    }

    // 🎙️ 화자 분리용 내 목소리 녹음 마이크 권한 요청 런처
    private val recordAudioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val email = prefs.userEmail
            if (!email.isNullOrBlank()) {
                callRecordCardController.showRecordVoiceProfileDialog(email)
            }
        } else {
            Toast.makeText(this, "내 목소리 화자 등록을 위해 마이크 녹음 권한이 필요합니다.", Toast.LENGTH_SHORT).show()
        }
    }

    // 영수증 AI OCR 장부화 전용 이미지/문서 선택 런처 (v1.5)
    private val receiptPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && ::receiptCardController.isInitialized) {
            receiptCardController.uploadReceipt(uri)
        }
    }

    // 명함 AI OCR 인맥 등록 전용 이미지/문서 선택 런처 (v1.5)
    private val businessCardPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && ::businessCardController.isInitialized) {
            businessCardController.uploadBusinessCard(uri)
        }
    }

    // 통화 종료 모바일 명함 발송용 첨부 이미지(MMS) 선택 런처 (v2.0.7)
    private val callEndedImagePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && ::callEndedCardController.isInitialized) {
            callEndedCardController.handleImageSelected(uri)
        }
    }

    // 📷 간편주문 웹앱 및 카카오톡 미리보기용 대표 이미지 선택 런처 (v2.1.18)
    private val quoteImagePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && ::quoteCardController.isInitialized) {
            quoteCardController.handleImageSelected(uri)
        }
    }

    // 📸 간편견적 웹앱 및 카카오톡 미리보기용 대표 이미지 선택 런처 (v2.1.98)
    private val estimateImagePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && ::estimateCardController.isInitialized) {
            estimateCardController.handleImageSelected(uri)
        }
    }

    // ⚖️ AI 법률/계약서 팩트체크 카드 전담 컨트롤러 및 서류 첨부 런처 (v2.1.88 / 리팩토링 모듈화)
    private lateinit var lawCardController: LawAdvisoryCardController
    private val lawAdvisoryFilePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && ::lawCardController.isInitialized) {
            lawCardController.handleFileSelected(uri)
        }
    }

    // ✍️ AI 네이버 블로그 자동 포스팅 카드 전담 컨트롤러 및 사진 복수 첨부 런처 (v2.1.89 / 리팩토링 모듈화)
    private lateinit var blogCardController: BlogAutomationCardController
    private val blogImagesPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (!uris.isNullOrEmpty() && ::blogCardController.isInitialized) {
            blogCardController.handleImagesSelected(uris)
        }
    }

    // 📸 AI 인스타그램 피드 & 해시태그 카드 전담 컨트롤러 및 사진 복수 첨부 런처 (v2.1.90 / 리팩토링 모듈화)
    private lateinit var instaCardController: InstagramAutomationCardController
    private val instaImagesPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (!uris.isNullOrEmpty() && ::instaCardController.isInitialized) {
            instaCardController.handleImagesSelected(uris)
        }
    }

    // 🌐 AI 모바일 홈페이지 제작 & 관리 카드 전담 컨트롤러 및 사진 복수 첨부 런처 (v2.1.91 / 리팩토링 모듈화)
    // 🔍 원클릭 기업 심층 리서치 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
    private lateinit var companyResearchCardController: CompanyResearchCardController

    // 🌐 내 웹사이트 실시간 장애 감시 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
    private lateinit var websiteMonitorCardController: WebsiteMonitorCardController

    // 📇 스마트폰 연락처 구글 시트 자동 동기화 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
    private lateinit var contactsCardController: ContactsBackupCardController

    // 🌐 웹 링크 & 유튜브 영상 AI 자동 스크랩 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
    private lateinit var linkScrapCardController: LinkScrapCardController

    // 📵 부재중 전화 0원 스마트 자동 답장 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
    private lateinit var missedCallCardController: MissedCallCardController

    // 💬 카카오톡 대화 내용 구글 시트 자동 동기화 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
    private lateinit var kakaoCardController: KakaoSyncCardController

    // 💼 통화 종료 직후 모바일 명함 원터치 발송 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
    private lateinit var callEndedCardController: CallEndedCardController

    // 🎯 문자(SMS/LMS) 송수신 구글 시트 자동 동기화 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
    private lateinit var smsSyncCardController: SmsSyncCardController

    // 📑 AI 스마트 견적 및 단가표 대장 연동 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
    private lateinit var quoteCardController: QuoteSyncCardController

    // 📑 AI 스마트 간편 견적서 발행 대장 연동 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
    private lateinit var estimateCardController: EstimateSyncCardController

    // 📞 수신 전화 시 고객 시트 요약 인콜 플로팅 팝업 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
    private lateinit var inCallSummaryCardController: InCallSummaryCardController

    // 🧾 영수증 Gemini AI OCR 자동 장부화 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
    private lateinit var receiptCardController: ReceiptSyncCardController

    // 🪪 명함 Gemini AI OCR 자동 인맥 등록 카드 전담 컨트롤러 (v2.1.99 / 리팩토링 모듈화)
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

    private lateinit var siteCardController: MobileSiteCardController
    private val siteImagesPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (!uris.isNullOrEmpty() && ::siteCardController.isInitialized) {
            siteCardController.handleImagesSelected(uris)
        }
    }

    // 카카오톡 대화 내용 내보내기(.txt) 파일 선택 런처 (v2.1.11)
    private val kakaoChatPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && ::kakaoCardController.isInitialized) {
            kakaoCardController.handleFileSelected(uri)
        }
    }

    // 자연어 AI 시트 코파일럿 음성 인식 런처 (v1.7)
    private val speechRecognizerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val matches = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            if (!matches.isNullOrEmpty()) {
                val spokenText = matches[0]
                binding.etAiCommand.setText(spokenText)
                aiCopilotCardController.executeAiCommand(spokenText)
            }
        }
    }

    // 연락처 선택 런처 (v2.1.1 기록 대상 주소록 피커)
    private val contactPickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val contactUri = result.data?.data
            if (contactUri != null && ::targetFilterController.isInitialized) {
                targetFilterController.handlePickedContact(contactUri)
            }
        }
    }

    private val contactPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (::targetFilterController.isInitialized) {
            targetFilterController.onPermissionResult(isGranted)
        }
    }

    // Google 원클릭 로그인 런처 (v1.8.0)
    private lateinit var googleSignInClient: GoogleSignInClient
    private val googleSignInLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        accountPairingController.handleGoogleSignInResult(result.data)
    }
        } catch (e: ApiException) {
            android.util.Log.w("MainActivity", "Google sign-in failed: statusCode=${e.statusCode}")
            if (e.statusCode == 12501) { // 12501은 사용자 단순 취소
                Toast.makeText(this, "구글 로그인이 취소되었습니다.", Toast.LENGTH_SHORT).show()
            } else {
                // StatusCode 10 (DEVELOPER_ERROR) 등 발생 시 기기 계정 선택기 또는 간편 이메일 연동창으로 자동 전환
                launchAccountPickerOrManualDialog("구글 보안 인증(코드 ${e.statusCode})으로 인해 스마트폰 계정 선택창으로 안전하게 전환합니다.")
            }
        }
    }

    // 안드로이드 시스템 구글 계정 선택기 런처 (v2.0.1 무중단 연동 폴백)
    private val accountPickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        accountPairingController.handleAccountPickerResult(result.resultCode, result.data)
    }
        }
        showManualEmailPairDialog()
    }


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
                launchContactPickerIntent = { intent -> contactPickerLauncher.launch(intent) },
                requestContactPermission = { contactPermissionLauncher.launch(Manifest.permission.READ_CONTACTS) },
                isSmsSyncControllerInitialized = { ::smsSyncCardController.isInitialized },
                getSmsSyncController = { smsSyncCardController }
            )

            permissionController = PermissionController(
                activity = this,
                binding = binding,
                launchPermissionRequest = { perms -> permissionLauncher.launch(perms) }
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

            setupListeners()
            updateUiState()
            checkPermissions()

            if (prefs.isPaired) {
                KeepAliveService.start(this)
            }

            // 외부 공유하기(Share) 인텐트 처리
            handleSharedIntent(intent)

            // 스마트폰 직접 발신(Sent) 문자 실시간 감지 Observer 등록
            try {
                smsSentObserver = SmsSentObserver(this)
                contentResolver.registerContentObserver(
                    SmsSentObserver.SMS_CONTENT_URI,
                    true,
                    smsSentObserver!!
                )
            } catch (e: Exception) {
                android.util.Log.w("MainActivity", "SmsSentObserver 등록 실패: ${e.message}")
            }

            // 실시간 고객 SMS 수신 및 입금 감지 브로드캐스트 리시버 등록
            try {
                val filter = IntentFilter().apply {
                    addAction(SmsReceiver.ACTION_SMS_RECEIVED)
                    addAction(SmsReceiver.ACTION_DEPOSIT_DETECTED)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    registerReceiver(depositUpdateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
                } else {
                    registerReceiver(depositUpdateReceiver, filter)
                }
                isDepositReceiverRegistered = true
            } catch (e: Throwable) {
                android.util.Log.w("MainActivity", "depositUpdateReceiver 등록 예외: ${e.message}")
            }
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
        try { aodJob?.cancel() } catch (_: Throwable) {}
        try {
            if (::serverStatusCardController.isInitialized) {
                serverStatusCardController.stopServerMonitorLoop()
            }
        } catch (_: Throwable) {}
        try { activityScope.coroutineContext.cancelChildren() } catch (_: Throwable) {}
        try {
            smsSentObserver?.let { contentResolver.unregisterContentObserver(it) }
            smsSentObserver = null
        } catch (_: Throwable) {}
        try {
            if (isDepositReceiverRegistered) {
                unregisterReceiver(depositUpdateReceiver)
                isDepositReceiverRegistered = false
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



        // 1. QR 코드 스캔 버튼
        binding.btnScanQr.setOnClickListener {
            val options = ScanOptions().apply {
                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                setPrompt("시트봇 워크스페이스 모니터 화면의 연동 QR코드를 비춰주세요")
                setCameraId(0)
                setBeepEnabled(true)
                setBarcodeImageEnabled(false)
                setOrientationLocked(true)
            }
            barcodeLauncher.launch(options)
        }

        // 2. 수동 6자리 핀코드 입력 버튼
        binding.btnManualPin.setOnClickListener {
            accountPairingController.showManualPinDialog()
        }

        // 5. 계정 삭제 버튼 (화면 최하단 Danger Zone)
        binding.btnUnlink.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("계정 삭제")
                .setMessage("시트봇 계정 및 등록된 스마트폰 기기 정보를 삭제하시겠습니까?\n삭제 시 더 이상 고객 알림 및 구글 시트 자동화가 연동되지 않습니다.")
                .setPositiveButton("삭제") { _, _ ->
                    val emailToUnlink = prefs.userEmail
                    if (!emailToUnlink.isNullOrBlank()) {
                        activityScope.launch {
                            ApiClient.unlinkDevice(emailToUnlink, "${Build.MANUFACTURER} ${Build.MODEL}")
                        }
                    }
                    prefs.clear()
                    KeepAliveService.stop(this)
                    updateUiState()
                    Toast.makeText(this, "계정 정보가 삭제되고 연동이 해제되었습니다.", Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton("취소", null)
                .show()
        }

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

        binding.btnCheckUpdate.setOnClickListener {
            UpdateManager.checkForUpdates(this, showToastIfLatest = true)
        }

        binding.tvAppVersionBadge.setOnClickListener {
            UpdateManager.checkForUpdates(this, showToastIfLatest = true)
        }

        // 8. AOD 올웨이즈 블랙 모드 진입 및 더블 탭 제스처
        aodGestureDetector = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDoubleTap(e: MotionEvent): Boolean {
                exitAodMode()
                return true
            }
        })

        binding.layoutAod.setOnTouchListener { _, event ->
            aodGestureDetector.onTouchEvent(event)
            true
        }

        binding.btnEnterAod.setOnClickListener {
            enterAodMode()
        }

        // 9. 실시간 감지 로그 (최대 1,000건 로컬 영구 보관 + 부드러운 전용 스크롤 + 비우기)
        try {
            binding.tvLogs.movementMethod = ScrollingMovementMethod()
            binding.tvLogs.setOnTouchListener { v, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                        v.parent.requestDisallowInterceptTouchEvent(true)
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                        v.parent.requestDisallowInterceptTouchEvent(false)
                    }
                }
                false
            }
            val initialLogs = logManager.loadLogs()
            binding.tvLogs.text = initialLogs
            updateLogCount()
        } catch (e: Exception) {
            android.util.Log.w("MainActivity", "로그 영역 초기화 예외: ${e.message}")
        }

        binding.btnClearLogs.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("실시간 감지 로그 비우기")
                .setMessage("스마트폰에 보관된 감지 로그(최대 1,000건)를 모두 비우시겠습니까?\n(구글 스프레드시트에 기록된 대장 내역은 안전하게 보존됩니다)")
                .setPositiveButton("비우기") { _, _ ->
                    logManager.clearLogs()
                    binding.tvLogs.text = logManager.getFormattedLogs()
                    binding.tvLogs.scrollTo(0, 0)
                    updateLogCount()
                    Toast.makeText(this, "로그가 모두 비워졌습니다.", Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton("취소", null)
                .show()
        }
    }

    private fun enterAodMode() {
        binding.layoutAod.visibility = View.VISIBLE
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val lp = window.attributes
        lp.screenBrightness = 0.01f
        window.attributes = lp
        startAodClockLoop()
        Toast.makeText(this, "AOD 블랙 모드가 시작되었습니다.\n화면을 두 번 탭하면 복귀합니다.", Toast.LENGTH_SHORT).show()
    }

    private fun exitAodMode() {
        aodJob?.cancel()
        aodJob = null
        binding.layoutAod.visibility = View.GONE
        val lp = window.attributes
        lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        window.attributes = lp
        Toast.makeText(this, "AOD 모드가 해제되었습니다.", Toast.LENGTH_SHORT).show()
    }

    private fun startAodClockLoop() {
        aodJob?.cancel()
        val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
        aodJob = activityScope.launch {
            while (isActive) {
                binding.tvAodClock.text = timeFormat.format(Date())
                val shiftX = Random.nextInt(-30, 31).toFloat()
                val shiftY = Random.nextInt(-30, 31).toFloat()
                binding.containerAodContent.translationX = shiftX
                binding.containerAodContent.translationY = shiftY
                delay(60000L)
            }
        }
    }

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

    /**
     * 상단 우측 앱 버전 뱃지의 업데이트 감지 및 시각적 알림 표시 (v2.1.20)
     */
    private fun checkAppUpdateBadge() {
        UpdateManager.checkUpdateSilently(this) { hasUpdate, _ ->
            if (!isFinishing && !isDestroyed) {
                val verName = getAppVersionName()
                if (hasUpdate) {
                    binding.tvAppVersionBadge.text = "v$verName (UPDATE 🔴)"
                    binding.tvAppVersionBadge.setBackgroundResource(R.drawable.bg_badge_version_update)
                    binding.tvAppVersionBadge.setTextColor(Color.parseColor("#FCA5A5"))
                } else {
                    binding.tvAppVersionBadge.text = "v$verName"
                    binding.tvAppVersionBadge.setBackgroundResource(R.drawable.bg_badge_version)
                    binding.tvAppVersionBadge.setTextColor(Color.parseColor("#10B981"))
                }
            }
        }
    }

    private fun addLogItem(sender: String, body: String, success: Boolean) {
        try {
            val formatted = logManager.addLog(sender, body, success)
            binding.tvLogs.text = formatted
            binding.tvLogs.post {
                binding.tvLogs.scrollTo(0, 0)
            }
            updateLogCount()
        } catch (e: Exception) {
            android.util.Log.w("MainActivity", "로그 추가 예외: ${e.message}")
        }
    }

    private fun updateLogCount() {
        try {
            val count = logManager.getLogCount()
            val formattedCount = NumberFormat.getNumberInstance(Locale.KOREA).format(count)
            binding.tvLogCount.text = "$formattedCount / 1,000건"
        } catch (_: Exception) {}
    }

    // 🛡️ 시스템 권한 및 배터리 최적화 예외 위임 메서드 (PermissionController 전담)
    private fun checkPermissions() =
        permissionController.checkPermissions()

    /**
     * 외부 앱(갤러리, 파일 탐색기 등)에서 [공유하기]를 통해 SheetBot Agent로 전달된 파일 인텐트 처리
     */
    private fun handleSharedIntent(intent: Intent?) {
        if (intent == null) return
        val action = intent.action
        if (action == null) return

        if (Intent.ACTION_SEND == action) {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
                ?: intent.clipData?.getItemAt(0)?.text?.toString()

            val streamUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            }

            val clipUri = intent.clipData?.getItemAt(0)?.uri
            val urlRegex = Regex("https?://[a-zA-Z0-9.-]+(?:/[^\\s]*)?")
            val matchedUrlInText = if (!sharedText.isNullOrBlank()) urlRegex.find(sharedText)?.value else null
            val isWebUri = clipUri?.scheme in listOf("http", "https")
            val targetUrl = matchedUrlInText ?: (if (isWebUri && clipUri != null) clipUri.toString() else null)

            // 1순위: 텍스트에 웹 링크가 포함되어 있거나 clipUri가 웹 주소인 경우 -> 웹 링크 & 유튜브 자동 스크랩
            if (targetUrl != null) {
                val now = System.currentTimeMillis()
                if (targetUrl == lastHandledShareUrl && (now - lastHandledShareTime) < 10000) {
                    android.util.Log.d("MainActivity", "동일 URL 10초 이내 중복 공유 무시: $targetUrl")
                } else {
                    lastHandledShareUrl = targetUrl
                    lastHandledShareTime = now
                    if (::linkScrapCardController.isInitialized) linkScrapCardController.bookmarkSharedUrl(targetUrl, sharedText)
                }
            } else {
                // 2순위: 실제 로컬 파일(content:// 또는 file://) 스트림인 경우 -> 구글 드라이브 파일 업로드
                val fileUri = streamUri ?: clipUri?.takeIf { it.scheme in listOf("content", "file") }
                if (fileUri != null) {
                    fileUploadCardController.uploadFiles(listOf(fileUri), "스마트폰 공유하기(Share) 1초 연동")
                } else if (!sharedText.isNullOrBlank()) {
                    Toast.makeText(this, "공유된 텍스트에서 링크(URL)를 찾을 수 없습니다.", Toast.LENGTH_SHORT).show()
                }
            }
        } else if (Intent.ACTION_SEND_MULTIPLE == action) {
            val uris = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            } ?: emptyList<Uri>()

            val validFileUris = uris.filter { it.scheme in listOf("content", "file") }
            if (validFileUris.isNotEmpty()) {
                fileUploadCardController.uploadFiles(validFileUris, "스마트폰 공유하기(Share) 다중 연동")
            }
        }

        // 인텐트 중복 소비 방지 (소진 처리)
        intent.action = null
        try {
            setIntent(Intent())
        } catch (_: Throwable) {}
    }

    // 📊 구글 스프레드시트 대장 프로비저닝 & 대장 열기 위임 메서드 (SheetActionController 전담)
    private fun showOpenSheetChooserDialog(sheetType: String, defaultTitle: String) =
        sheetActionController.showOpenSheetChooserDialog(sheetType, defaultTitle)

    private fun provisionSheetAsync(sheetType: String, sheetTitle: String, folderName: String? = null) =
        sheetActionController.provisionSheetAsync(sheetType, sheetTitle, folderName)

    private fun openExternalUrl(url: String) =
        sheetActionController.openExternalUrl(url)

    private fun openDriveFolder(sheetType: String, defaultFolderName: String) =
        sheetActionController.openDriveFolder(sheetType, defaultFolderName)

    private fun getAppVersionName(): String {
        return try {
            val pInfo = packageManager.getPackageInfo(packageName, 0)
            pInfo.versionName ?: BuildConfig.VERSION_NAME
        } catch (_: Exception) {
            BuildConfig.VERSION_NAME
        }
    }

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

    /**
     * 통화 녹음 파일 구글 드라이브 즉시 동기화 실행 (v2.1.27)
     * - forceReupload: 기존 백업 이력 무시하고 강제 재업로드 여부 (롱클릭 지원)
     */
    private fun executeRecordingSync(forceReupload: Boolean = false) {
        val userEmail = prefs.userEmail
        if (userEmail.isNullOrBlank()) {
            Toast.makeText(this, "먼저 상단에서 구글 계정으로 로그인해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.btnSyncRecordingsNow.isEnabled = false
        binding.btnSyncRecordingsNow.text = "🔄 녹음 파일 검사 및 업로드 중..."
        Toast.makeText(this, "통화 녹음 파일 탐색을 시작합니다...", Toast.LENGTH_SHORT).show()

        activityScope.launch(Dispatchers.IO) {
            try {
                val result = CallRecordingManager.scanAndUploadNewRecordings(this@MainActivity, forceReupload = forceReupload)
                withContext(Dispatchers.Main) {
                    binding.btnSyncRecordingsNow.isEnabled = true
                    binding.btnSyncRecordingsNow.text = "⚡ 지금 새 녹음 파일 즉시 동기화"

                    val dialogTitle = when {
                        result.uploadedCount > 0 -> "🎉 통화 녹음 백업 완료"
                        result.uploadFailedCount > 0 -> "⚠️ 전송 실패 안내"
                        result.filterExcludedCount > 0 -> "🔍 필터 제외 안내"
                        result.alreadySyncedCount > 0 -> "📁 이미 백업 완료됨"
                        else -> "ℹ️ 동기화 결과"
                    }

                    AlertDialog.Builder(this@MainActivity)
                        .setTitle(dialogTitle)
                        .setMessage(result.message)
                        .setPositiveButton("확인", null)
                        .show()
                }
            } catch (e: Throwable) {
                Log.e("MainActivity", "executeRecordingSync 오류: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    binding.btnSyncRecordingsNow.isEnabled = true
                    binding.btnSyncRecordingsNow.text = "📁 녹음 파일 직접 업로드"
                    Toast.makeText(this@MainActivity, "동기화 중 오류가 발생했습니다: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
    private fun setupLawAdvisoryCard() {
        lawCardController = LawAdvisoryCardController(
            activity = this,
            binding = binding,
            prefs = prefs,
            onPickFile = { lawAdvisoryFilePickerLauncher.launch("image/*") },
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
            onPickImages = { blogImagesPickerLauncher.launch("image/*") },
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
            onPickImages = { instaImagesPickerLauncher.launch("image/*") },
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
            onPickImages = { siteImagesPickerLauncher.launch("image/*") },
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
                    kakaoChatPickerLauncher.launch("*/*")
                } catch (_: Exception) {
                    try {
                        kakaoChatPickerLauncher.launch("text/*")
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
            onPickImage = { callEndedImagePickerLauncher.launch("image/*") },
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
            onPickQuoteImage = { quoteImagePickerLauncher.launch("image/*") },
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
            onPickEstimateImage = { estimateImagePickerLauncher.launch("image/*") },
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
            onPickReceiptImage = { receiptPickerLauncher.launch("image/*") },
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
            onPickBusinessCardImage = { businessCardPickerLauncher.launch("image/*") },
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
            launchExternalRecordingPicker = { externalRecordingPickerLauncher.launch("audio/*") },
            requestRecordAudioPermission = { recordAudioPermissionLauncher.launch(android.Manifest.permission.RECORD_AUDIO) },
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
            launchFilePicker = { filePickerLauncher.launch("*/*") },
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
            launchSpeechRecognizer = { intent -> speechRecognizerLauncher.launch(intent) },
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
            launchGoogleSignIn = { intent -> googleSignInLauncher.launch(intent) },
            launchAccountPicker = { intent -> accountPickerLauncher.launch(intent) },
            onPairingSuccess = { email ->
                updateUiState()
            },
            addLogItem = { title, detail, success -> addLogItem(title, detail, success) }
        )
        accountPairingController.setup()
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




