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
    private var serverMonitorJob: Job? = null
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
            handleQrScanResult(result.contents)
        }
    }

    // 런타임 권한 요청 런처 (SMS, 카메라, 알림)
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val smsGranted = permissions[Manifest.permission.RECEIVE_SMS] == true
        if (smsGranted) {
            Toast.makeText(this, "SMS 감지 권한이 승인되었습니다.", Toast.LENGTH_SHORT).show()
        }
        checkAndRequestBatteryOptimization()
        checkNotificationListenerPermission()
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
    private var pendingContactTargetType: String? = null // "SMS" or "RECORDING"
    private val contactPickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val contactUri = result.data?.data
            if (contactUri != null) {
                handlePickedContact(contactUri, pendingContactTargetType)
            }
        }
    }

    private val contactPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            val type = pendingContactTargetType
            if (type != null) {
                launchContactPicker(type)
            }
        } else {
            Toast.makeText(this, "연락처 조회 권한이 거부되어 주소록을 열 수 없습니다.", Toast.LENGTH_SHORT).show()
        }
    }

    // Google 원클릭 로그인 런처 (v1.8.0)
    private lateinit var googleSignInClient: GoogleSignInClient
    private val googleSignInLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            val email = account?.email
            val idToken = account?.idToken
            if (!email.isNullOrBlank()) {
                handleGoogleSignInSuccess(idToken, email)
            } else {
                launchAccountPickerOrManualDialog("구글 계정 이메일을 가져올 수 없어 기기 계정 선택창으로 전환합니다.")
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
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val email = result.data?.getStringExtra(android.accounts.AccountManager.KEY_ACCOUNT_NAME)
            if (!email.isNullOrBlank()) {
                handleGoogleSignInSuccess(null, email)
                return@registerForActivityResult
            }
        }
        showManualEmailPairDialog()
    }

    private fun launchAccountPickerOrManualDialog(guideMsg: String? = null) {
        if (!guideMsg.isNullOrBlank()) {
            Toast.makeText(this, guideMsg, Toast.LENGTH_LONG).show()
        }
        try {
            val intent = android.accounts.AccountManager.newChooseAccountIntent(
                null,
                null,
                arrayOf("com.google"),
                false,
                null,
                null,
                null,
                null
            )
            accountPickerLauncher.launch(intent)
        } catch (_: Exception) {
            showManualEmailPairDialog()
        }
    }

    /**
     * 구글 계정 이메일 직접 입력 간편 연동 다이얼로그 (v2.0.1)
     */
    private fun showManualEmailPairDialog(initialEmail: String = "") {
        val input = EditText(this).apply {
            hint = "example@gmail.com"
            setText(initialEmail)
            inputType = android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS or android.text.InputType.TYPE_CLASS_TEXT
            setPadding(50, 40, 50, 40)
        }
        AlertDialog.Builder(this)
            .setTitle("구글 계정 이메일로 1초 연동")
            .setMessage("시트봇(SheetBot) 대시보드에서 사용하는 구글 이메일을 입력해 주세요.\n(SHA-1 지문 등록 없이도 1초 만에 즉시 연동됩니다)")
            .setView(input)
            .setPositiveButton("즉시 연동") { _, _ ->
                val email = input.text.toString().trim()
                if (email.contains("@")) {
                    handleGoogleSignInSuccess(null, email)
                } else {
                    Toast.makeText(this, "올바른 구글 이메일 형식을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("취소", null)
            .show()
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
            checkNotificationListenerPermission()
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "checkNotificationListenerPermission 방어: ${e.message}")
        }
        try {
            checkAndRequestBatteryOptimization()
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "checkAndRequestBatteryOptimization 방어: ${e.message}")
        }
        try {
            startServerMonitorLoop()
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "startServerMonitorLoop 방어: ${e.message}")
        }
        try {
            preloadActiveSheetUrls()
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
            serverMonitorJob?.cancel()
        } catch (_: Throwable) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        try { aodJob?.cancel() } catch (_: Throwable) {}
        try { serverMonitorJob?.cancel() } catch (_: Throwable) {}
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
        // 0-0. 통합 모바일 에이전트 & 서버 관제 카드 '접기/펼치기' 토글 (v2.1.54)
        updateStatusDetailsVisibility(prefs.isStatusDetailsHidden)
        val toggleStatusAction = {
            val nextState = !prefs.isStatusDetailsHidden
            prefs.isStatusDetailsHidden = nextState
            updateStatusDetailsVisibility(nextState)
        }
        binding.btnToggleStatusDetails.setOnClickListener { toggleStatusAction() }
        binding.layoutIntegratedHeader.setOnClickListener { toggleStatusAction() }

        // 0-0-1. 전 카드 상시 접기/펼치기 아코디언 토글 초기화 및 리스너 등록 (v2.1.54)
        setupCardCollapseExpandListeners()

        // 0-0-2. AI 토큰 안내 상세 접기/펼치기 및 확인 버튼 (v2.0.5)
        updateTokenNoticeVisibility(prefs.isTokenNoticeDismissed)
        binding.btnConfirmTokenNotice.setOnClickListener {
            prefs.isTokenNoticeDismissed = true
            updateTokenNoticeVisibility(true)
            Toast.makeText(this, "토큰 안내가 접혔습니다. 언제든 '자세히 보기'를 누르면 다시 확인하실 수 있습니다.", Toast.LENGTH_SHORT).show()
        }
        binding.btnToggleTokenNotice.setOnClickListener {
            val nextState = !prefs.isTokenNoticeDismissed
            prefs.isTokenNoticeDismissed = nextState
            updateTokenNoticeVisibility(nextState)
        }

        // 0. Google 원클릭 로그인 버튼 (v1.8.0 / v2.0.1 무중단 연동 강화)
        binding.btnGoogleSignIn.setOnClickListener {
            try {
                val signInIntent = googleSignInClient.signInIntent
                googleSignInLauncher.launch(signInIntent)
            } catch (e: Exception) {
                launchAccountPickerOrManualDialog("기기 계정 선택창으로 즉시 전환합니다.")
            }
        }
        binding.btnGoogleSignIn.setOnLongClickListener {
            showManualEmailPairDialog()
            true
        }

        // 0-1. 토큰 지갑 새로고침 및 즉시 충전 버튼 (v1.9.0)
        binding.btnRefreshWallet.setOnClickListener {
            val email = prefs.userEmail
            if (!email.isNullOrBlank()) {
                loadWalletBalance(email, isManualRefresh = true)
            }
        }
        binding.btnRechargeToken.setOnClickListener {
            showRechargeDialog()
        }

        // 0-2. 친구 초대 및 추천인 코드 등록 버튼 (v2.0.0)
        binding.btnInviteFriend.setOnClickListener {
            showReferralInviteDialog()
        }
        binding.btnEnterReferralCode.setOnClickListener {
            showReferralClaimDialog()
        }



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
            showManualPinDialog()
        }

        // 3. 배터리 최적화 예외 요청 버튼
        binding.btnBatteryOpt.setOnClickListener {
            requestIgnoreBatteryOptimization()
        }

        // 금융사 앱 푸시 감지 권한 요청 버튼
        binding.btnNotificationPermission.setOnClickListener {
            requestNotificationListenerPermission()
        }

        // 4. 실시간 서버 통신 상태 재점검 버튼
        binding.btnRefreshServerStatus.setOnClickListener {
            checkServerAndQueueStatus(showToast = true)
        }

        // 4-1. 🌐 시트봇 웹 관제 센터 원터치 바로가기 (기본 브라우저로 0초 열기)
        binding.btnOpenWebDashboard.setOnClickListener {
            try {
                val dashboardUrl = "https://sheetbot.cloud/dashboard/notifications"
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(dashboardUrl)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(this, "웹 브라우저를 열 수 없습니다: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            }
        }

        // 4-2. 📋 스마트 통합 할 일 허브 전용 화면 열기 (옵션 B)
        val openTasksHub = {
            val intent = Intent(this, TasksActivity::class.java)
            startActivity(intent)
        }
        binding.btnOpenTasksHub.setOnClickListener { openTasksHub() }
        binding.cardTasksHub.setOnClickListener { openTasksHub() }

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

    private fun startServerMonitorLoop() {
        serverMonitorJob?.cancel()
        if (!prefs.isPaired) return

        serverMonitorJob = activityScope.launch {
            while (isActive) {
                checkServerAndQueueStatus(showToast = false)
                delay(30000L) // 30초마다 갱신
            }
        }
    }

    private fun checkServerAndQueueStatus(showToast: Boolean = false) {
        if (!prefs.isPaired) return

        activityScope.launch {
            val ping = withContext(Dispatchers.IO) { ApiClient.pingServer() }
            val email = prefs.userEmail ?: ""

            if (ping.isOnline) {
                binding.cardStatus.setBackgroundResource(R.drawable.bg_card_connected)
                binding.tvStatusTitle.text = "🟢 시트봇 정상 작동 중"
                binding.tvConnectedAccount.text = "연결된 계정: $email"
                binding.tvServerStatus.text = "🌐 서버 통신: 🟢 정상 (${ping.latencyMs}ms)"

                if (showToast) {
                    Toast.makeText(this@MainActivity, "✅ sheetbot.cloud 서버 통신 정상 (${ping.latencyMs}ms)", Toast.LENGTH_SHORT).show()
                }
            } else {
                // 이용자 앱 친화적: 위협적인 붉은색 경고창/토스트 대신 '정상 작동 중 (통신 확인 중)'으로 자연스럽게 표시
                binding.cardStatus.setBackgroundResource(R.drawable.bg_card_connected)
                binding.tvStatusTitle.text = "🟢 시트봇 정상 작동 중"
                binding.tvConnectedAccount.text = "연결된 계정: $email"
                binding.tvServerStatus.text = "🌐 서버 통신: 🟡 연결 대기 중 (자동 재시도)"

                if (showToast) {
                    Toast.makeText(this@MainActivity, "시트봇 모바일 에이전트 가동 중 (서버 연결을 확인하고 있습니다)", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun updateStatusDetailsVisibility(hidden: Boolean) {
        binding.layoutStatusDetails.visibility = if (hidden) View.GONE else View.VISIBLE
        binding.btnToggleStatusDetails.text = if (hidden) "▼" else "▲"
    }

    private fun updateTokenNoticeVisibility(dismissed: Boolean) {
        binding.layoutTokenNoticeDetails.visibility = if (dismissed) View.GONE else View.VISIBLE
        binding.btnToggleTokenNotice.text = if (dismissed) "자세히 보기" else "접기"
    }

    private fun updateCardCollapseState(container: View, toggleBtn: TextView, isHidden: Boolean) {
        container.visibility = if (isHidden) View.GONE else View.VISIBLE
        toggleBtn.text = if (isHidden) "▼" else "▲"
    }

    private fun refreshAllCardsCollapseState() {
        updateCardCollapseState(binding.layoutWalletDetails, binding.btnToggleWalletDetails, prefs.isWalletDetailsHidden)
        aiCopilotCardController.refreshCollapseState()
        paymentReceiptCardController.refreshCollapseState()
        callRecordCardController.refreshCollapseState()
        fileUploadCardController.refreshCollapseState()
        updateCardCollapseState(binding.layoutLinkScrapSettings, binding.btnToggleLinkScrapDetails, prefs.isLinkScrapDetailsHidden)
        if (::smsSyncCardController.isInitialized) {
            smsSyncCardController.refreshCollapseState()
        } else {
            updateCardCollapseState(binding.layoutSmsSyncSettings, binding.btnToggleSmsSyncDetails, prefs.isSmsSyncDetailsHidden)
        }
        updateCardCollapseState(binding.layoutKakaoSyncSettings, binding.btnToggleKakaoSyncDetails, prefs.isKakaoSyncDetailsHidden)
        if (::quoteCardController.isInitialized) {
            quoteCardController.refreshCollapseState()
        } else {
            updateCardCollapseState(binding.layoutQuoteSyncSettings, binding.btnToggleQuoteSyncDetails, prefs.isQuoteSyncDetailsHidden)
        }
        if (::estimateCardController.isInitialized) {
            estimateCardController.refreshCollapseState()
        } else {
            updateCardCollapseState(binding.layoutEstimateSyncSettings, binding.btnToggleEstimateSyncDetails, prefs.isEstimateSyncDetailsHidden)
        }
        if (::inCallSummaryCardController.isInitialized) {
            inCallSummaryCardController.refreshCollapseState()
        } else {
            updateCardCollapseState(binding.layoutInCallSummarySettings, binding.btnToggleInCallSummaryDetails, prefs.isInCallSummaryDetailsHidden)
        }
        updateCardCollapseState(binding.layoutMissedCallSettings, binding.btnToggleMissedCallDetails, prefs.isMissedCallDetailsHidden)
        updateCardCollapseState(binding.layoutCallEndedCardSettings, binding.btnToggleCallEndedCardDetails, prefs.isCallEndedCardDetailsHidden)
        updateCardCollapseState(binding.layoutWebsiteMonitorSettings, binding.btnToggleWebsiteMonitorDetails, prefs.isWebsiteMonitorDetailsHidden)
        updateCardCollapseState(binding.layoutContactsDetails, binding.btnToggleContactsDetails, prefs.isContactsDetailsHidden)
    }

    private fun setupCardCollapseExpandListeners() {
        refreshAllCardsCollapseState()

        // 1. 토큰 지갑 카드
        val toggleWallet = {
            prefs.isWalletDetailsHidden = !prefs.isWalletDetailsHidden
            updateCardCollapseState(binding.layoutWalletDetails, binding.btnToggleWalletDetails, prefs.isWalletDetailsHidden)
        }
        binding.layoutWalletHeader.setOnClickListener { toggleWallet() }
        binding.btnToggleWalletDetails.setOnClickListener { toggleWallet() }

        // 2. AI 비서 카드
        binding.layoutCopilotHeader.setOnClickListener { aiCopilotCardController.toggleCollapse() }
        binding.btnToggleCopilotDetails.setOnClickListener { aiCopilotCardController.toggleCollapse() }

        // 3. 매장 결제 & 영수증 카드
        binding.layoutPaymentReceiptHeader.setOnClickListener { paymentReceiptCardController.toggleCollapse() }
        binding.btnTogglePaymentReceiptDetails.setOnClickListener { paymentReceiptCardController.toggleCollapse() }

        // 4. 통화 녹음 카드
        binding.layoutCallRecordingHeader.setOnClickListener { callRecordCardController.toggleCollapse() }
        binding.btnToggleCallRecordingDetails.setOnClickListener { callRecordCardController.toggleCollapse() }

        // 5. 사진 & 문서 보관 카드
        binding.layoutFileUploadHeader.setOnClickListener { fileUploadCardController.toggleCollapse() }
        binding.btnToggleFileUploadDetails.setOnClickListener { fileUploadCardController.toggleCollapse() }

        // 6. 웹 링크 & 유튜브 카드 (LinkScrapCardController 전담 바인딩)

        // 7. 문자(SMS) 카드 (SmsSyncCardController 전담 바인딩)


        // 8. 카카오톡 카드 (KakaoSyncCardController 전담 바인딩)

        // 9. 간편 주문서 카드 (QuoteSyncCardController 전담 바인딩)

        // 9-A. 간편 견적서 발행 카드 (EstimateSyncCardController 전담 바인딩)

        // 9-B. 인콜 고객 요약 카드
        // 10. 수신 전화 시 고객 시트 요약 인콜 플로팅 카드 (InCallSummaryCardController 전담 바인딩)

        // 10. 부재중 전화 카드 (MissedCallCardController 전담 바인딩)

        // 11. 모바일 명함 카드 (CallEndedCardController 전담 바인딩)

        // 12. 웹사이트 모니터링 카드 (WebsiteMonitorCardController 전담 바인딩)

        // 13. 스마트폰 연락처 백업 카드 (ContactsBackupCardController 전담 바인딩)
    }

    private fun updateUiState() {
        val verName = getAppVersionName()
        binding.tvAppVersionBadge.text = "v$verName"

        val isPaired = prefs.isPaired
        val email = prefs.userEmail

        updateStatusDetailsVisibility(prefs.isStatusDetailsHidden)
        updateTokenNoticeVisibility(prefs.isTokenNoticeDismissed)
        refreshAllCardsCollapseState()
        updateTargetBadges()

        if (isPaired && !email.isNullOrBlank()) {
            binding.cardStatus.setBackgroundResource(R.drawable.bg_card_connected)
            binding.tvStatusTitle.text = "🟢 시트봇 정상 작동 중"
            binding.tvConnectedAccount.text = "연결된 계정: $email"
            binding.btnRefreshServerStatus.visibility = View.VISIBLE
            binding.btnToggleStatusDetails.visibility = View.VISIBLE
            binding.layoutUnlinkZone.visibility = View.VISIBLE
            binding.layoutWalletCard.visibility = View.VISIBLE
            binding.cardTasksHub.visibility = View.VISIBLE
            binding.layoutUnpairedControls.visibility = View.GONE
            checkServerAndQueueStatus(showToast = false)
            loadWalletBalance(email)
            refreshTasksBadge(email)
            callRecordCardController.refreshVoiceProfileStatus(email)
        } else {
            binding.cardStatus.setBackgroundResource(R.drawable.bg_card_unpaired)
            binding.tvStatusTitle.text = "⚠️ 미연동 상태"
            binding.tvConnectedAccount.text = "연결된 계정: 미연동 (QR 스캔 필요)"
            binding.btnRefreshServerStatus.visibility = View.GONE
            binding.btnToggleStatusDetails.visibility = View.GONE
            binding.layoutUnlinkZone.visibility = View.GONE
            binding.layoutWalletCard.visibility = View.GONE
            binding.cardTasksHub.visibility = View.GONE
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

    /**
     * 회원 토큰 지갑 잔액 실시간 조회 및 UI 갱신 (v1.9.0 / v2.0.5 캐싱 강화)
     */
    private fun loadWalletBalance(userEmail: String, isManualRefresh: Boolean = false) {
        // 로컬 캐시 잔액이 있으면 네트워크 지연 없이 0초 만에 즉시 표시 (0원 노출 방지)
        if (prefs.lastBalanceTokens >= 0L) {
            binding.tvWalletBalance.text = NumberFormat.getNumberInstance().format(prefs.lastBalanceTokens)
            binding.tvWalletTier.text = prefs.lastTier
        }
        if (isManualRefresh) {
            binding.tvWalletBalance.text = "..."
        }
        activityScope.launch {
            val result = ApiClient.fetchWalletBalance(userEmail)
            if (result.success) {
                prefs.lastBalanceTokens = result.balanceTokens
                prefs.lastTier = result.tier

                val formattedBalance = NumberFormat.getNumberInstance().format(result.balanceTokens)
                binding.tvWalletBalance.text = formattedBalance
                binding.tvWalletTier.text = result.tier
                if (isManualRefresh) {
                    Toast.makeText(this@MainActivity, "토큰 잔액이 갱신되었습니다.", Toast.LENGTH_SHORT).show()
                }
            } else {
                if (isManualRefresh) {
                    Toast.makeText(this@MainActivity, "잔액 조회 실패: ${result.error}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * 📋 스마트 통합 할 일 허브 실시간 미완료 과업 뱃지 갱신 (옵션 B)
     */
    private fun refreshTasksBadge(userEmail: String) {
        activityScope.launch(Dispatchers.IO) {
            val result = ApiClient.fetchTasks(userEmail, "PENDING")
            withContext(Dispatchers.Main) {
                if (!isFinishing && !isDestroyed && result.success) {
                    val count = result.pendingCount
                    if (count > 0) {
                        binding.tvTasksHubBadge.text = "대기 ${count}건 ›"
                        binding.tvTasksHubBadge.setBackgroundColor(Color.parseColor("#B45309")) // Amber
                        binding.tvTasksHubSubtitle.text = "현재 진행해야 할 후속 과업이 ${count}건 있습니다."
                    } else {
                        binding.tvTasksHubBadge.text = "완료됨 ✓"
                        binding.tvTasksHubBadge.setBackgroundColor(Color.parseColor("#047857")) // Emerald
                        binding.tvTasksHubSubtitle.text = "모든 후속 조치 및 할 일이 완료되었습니다."
                    }
                }
            }
        }
    }

    /**
     * 토큰 즉시 충전 다이얼로그 (v1.9.0)
     * 스타터(5,000원)/스탠다드(12,000원)/프로(30,000원) 패키지 선택 후
     * 토스(Toss) 앱 딥링크 1초 송금 또는 계좌번호 복사 지원
     */
    private fun showRechargeDialog() {
        val email = prefs.userEmail
        if (email.isNullOrBlank()) {
            Toast.makeText(this, "먼저 시트봇 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val dialogView = layoutInflater.inflate(R.layout.dialog_recharge_token, null)
        val dialog = AlertDialog.Builder(this)
            .setView(dialogView)
            .create()

        var selectedPkgId = "pkg_standard"

        val btnStarter = dialogView.findViewById<Button>(R.id.btnPkgStarter)
        val btnStandard = dialogView.findViewById<Button>(R.id.btnPkgStandard)
        val btnPro = dialogView.findViewById<Button>(R.id.btnPkgPro)
        val etDepositorName = dialogView.findViewById<EditText>(R.id.etDepositorName)
        val btnRequestDeposit = dialogView.findViewById<Button>(R.id.btnRequestDeposit)

        val layoutResult = dialogView.findViewById<View>(R.id.layoutDepositResult)
        val tvFinalAmount = dialogView.findViewById<TextView>(R.id.tvFinalAmount)
        val tvAccountInfo = dialogView.findViewById<TextView>(R.id.tvAccountInfo)
        val btnOpenToss = dialogView.findViewById<Button>(R.id.btnOpenToss)
        val btnCopyAccount = dialogView.findViewById<Button>(R.id.btnCopyAccount)
        val btnClose = dialogView.findViewById<Button>(R.id.btnCloseDialog)

        // 초기 송금자명 세팅 (이메일 앞자리)
        val defaultName = email.substringBefore("@")
        etDepositorName.setText(defaultName)

        fun updatePkgSelection(pkgId: String) {
            selectedPkgId = pkgId
            val activeColor = ColorStateList.valueOf(Color.parseColor("#4338CA"))
            val inactiveColor = ColorStateList.valueOf(Color.parseColor("#1E293B"))
            btnStarter.backgroundTintList = if (pkgId == "pkg_starter") activeColor else inactiveColor
            btnStandard.backgroundTintList = if (pkgId == "pkg_standard") activeColor else inactiveColor
            btnPro.backgroundTintList = if (pkgId == "pkg_pro") activeColor else inactiveColor
        }

        btnStarter.setOnClickListener { updatePkgSelection("pkg_starter") }
        btnStandard.setOnClickListener { updatePkgSelection("pkg_standard") }
        btnPro.setOnClickListener { updatePkgSelection("pkg_pro") }

        var currentTossUrl = ""
        var currentAccountFull = ""

        btnRequestDeposit.setOnClickListener {
            val depositorName = etDepositorName.text.toString().trim()
            if (depositorName.length < 2) {
                Toast.makeText(this, "송금자 실명을 2글자 이상 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            btnRequestDeposit.isEnabled = false
            btnRequestDeposit.text = "계좌 발급 중..."

            activityScope.launch {
                val res = ApiClient.requestDirectDeposit(
                    userEmail = email,
                    userName = depositorName,
                    packageId = selectedPkgId,
                    depositorName = depositorName
                )

                btnRequestDeposit.isEnabled = true
                btnRequestDeposit.text = "🚀 계좌 발급 & 토스 1초 송금 준비"

                if (res.success) {
                    layoutResult.visibility = View.VISIBLE
                    val formattedPrice = NumberFormat.getNumberInstance().format(res.amountKrw)
                    val discountMsg = if (res.discountKrw > 0) " (${res.discountKrw}원 즉시 할인)" else ""
                    tvFinalAmount.text = "최종 입금액: ${formattedPrice}원${discountMsg}"
                    currentAccountFull = "${res.bankName} ${res.accountNumber} (${res.accountHolder})"
                    tvAccountInfo.text = currentAccountFull
                    currentTossUrl = res.tossUrl

                    if (currentTossUrl.isNotBlank()) {
                        btnOpenToss.visibility = View.VISIBLE
                    } else {
                        btnOpenToss.visibility = View.GONE
                    }
                    Toast.makeText(this@MainActivity, "입금 계좌가 발급되었습니다. 토스로 송금해 주세요.", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this@MainActivity, "계좌 발급 실패: ${res.error}", Toast.LENGTH_LONG).show()
                }
            }
        }

        btnOpenToss.setOnClickListener {
            if (currentTossUrl.isNotBlank()) {
                try {
                    val tossIntent = Intent(Intent.ACTION_VIEW, Uri.parse(currentTossUrl))
                    startActivity(tossIntent)
                } catch (e: Exception) {
                    Toast.makeText(this, "토스 앱을 열 수 없어 웹 브라우저로 연결합니다.", Toast.LENGTH_SHORT).show()
                    try {
                        val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse(currentTossUrl))
                        startActivity(webIntent)
                    } catch (_: Exception) {}
                }
            }
        }

        btnCopyAccount.setOnClickListener {
            if (currentAccountFull.isNotBlank()) {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = ClipData.newPlainText("SheetBot 입금 계좌", currentAccountFull)
                clipboard.setPrimaryClip(clip)
                Toast.makeText(this, "계좌 정보가 복사되었습니다.", Toast.LENGTH_SHORT).show()
            }
        }

        btnClose.setOnClickListener {
            dialog.dismiss()
            // 닫을 때 최신 잔액 다시 확인
            loadWalletBalance(email)
        }

        dialog.show()
    }

    /**
     * 친구/동료 초대 다이얼로그 (v2.0.0)
     * 내 추천 코드 확인 및 카카오톡/문자 원터치 공유 지원
     */
    private fun showReferralInviteDialog() {
        val email = prefs.userEmail
        if (email.isNullOrBlank()) {
            Toast.makeText(this, "먼저 시트봇 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val dialogView = layoutInflater.inflate(R.layout.dialog_referral_invite, null)
        val dialog = AlertDialog.Builder(this)
            .setView(dialogView)
            .create()

        val tvMyCode = dialogView.findViewById<TextView>(R.id.tvDialogMyCode)
        val btnCopyCode = dialogView.findViewById<Button>(R.id.btnCopyMyCode)
        val btnShare = dialogView.findViewById<Button>(R.id.btnShareInvite)
        val tvStats = dialogView.findViewById<TextView>(R.id.tvReferralStats)
        val btnClose = dialogView.findViewById<Button>(R.id.btnCloseInviteDialog)

        var sharePayload = ""
        var myCodeText = ""

        activityScope.launch {
            val info = ApiClient.fetchReferralInfo(email)
            if (info.success) {
                myCodeText = info.myCode
                tvMyCode.text = myCodeText
                sharePayload = info.shareText
                val count = info.inviteCount
                val earned = NumberFormat.getNumberInstance().format(info.earnedTokens.toLong())
                tvStats.text = "현재 ${count}명 초대 완료 (누적 ${earned} 토큰 획득 🎉)"
            } else {
                tvMyCode.text = email.substringBefore("@").uppercase()
                myCodeText = tvMyCode.text.toString()
                tvStats.text = "추천 정보를 불러오는 중입니다..."
            }
        }

        btnCopyCode.setOnClickListener {
            if (myCodeText.isNotBlank()) {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = ClipData.newPlainText("SheetBot 추천 코드", myCodeText)
                clipboard.setPrimaryClip(clip)
                Toast.makeText(this, "추천인 코드(${myCodeText})가 복사되었습니다.", Toast.LENGTH_SHORT).show()
            }
        }

        btnShare.setOnClickListener {
            val textToSend = if (sharePayload.isNotBlank()) sharePayload else {
                "🚀 Google 스프레드시트 1초 AI 자동화 [SheetBot]\n" +
                "초대 링크로 앱을 설치하시면 가입 즉시 10,000 보너스 토큰이 선물됩니다 🎁\n\n" +
                "• 추천인 코드: $myCodeText\n" +
                "• 다운로드: https://sheetbot.cloud/downloads/SheetBotAgent.apk"
            }
            val sendIntent = Intent().apply {
                action = Intent.ACTION_SEND
                putExtra(Intent.EXTRA_TEXT, textToSend)
                type = "text/plain"
            }
            startActivity(Intent.createChooser(sendIntent, "친구/동료에게 시트봇 초대장 보내기"))
        }

        btnClose.setOnClickListener {
            dialog.dismiss()
        }

        dialog.show()
    }

    /**
     * 추천인 코드 등록 다이얼로그 (v2.0.0)
     * 코드 등록 시 양측 지갑에 10,000 토큰 즉시 적립
     */
    private fun showReferralClaimDialog() {
        val email = prefs.userEmail
        if (email.isNullOrBlank()) {
            Toast.makeText(this, "먼저 시트봇 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val dialogView = layoutInflater.inflate(R.layout.dialog_referral_claim, null)
        val dialog = AlertDialog.Builder(this)
            .setView(dialogView)
            .create()

        val etCode = dialogView.findViewById<EditText>(R.id.etReferralCodeInput)
        val btnSubmit = dialogView.findViewById<Button>(R.id.btnSubmitReferralCode)
        val btnClose = dialogView.findViewById<Button>(R.id.btnCloseClaimDialog)

        btnSubmit.setOnClickListener {
            val code = etCode.text.toString().trim()
            if (code.length < 2) {
                Toast.makeText(this, "추천인 코드 또는 이메일을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            btnSubmit.isEnabled = false
            btnSubmit.text = "보너스 수령 확인 중..."

            activityScope.launch {
                val res = ApiClient.claimReferralReward(email, code)
                btnSubmit.isEnabled = true
                btnSubmit.text = "🎉 10,000 토큰 즉시 수령하기"

                if (res.success) {
                    dialog.dismiss()
                    AlertDialog.Builder(this@MainActivity)
                        .setTitle("🎉 10,000 토큰 지급 완료!")
                        .setMessage(res.message)
                        .setPositiveButton("확인", null)
                        .show()
                    loadWalletBalance(email)
                } else {
                    Toast.makeText(this@MainActivity, res.message.ifBlank { "등록 실패: ${res.error}" }, Toast.LENGTH_LONG).show()
                }
            }
        }

        btnClose.setOnClickListener {
            dialog.dismiss()
        }

        dialog.show()
    }



    private fun handleQrScanResult(contents: String) {
        val parsed = parseQrContents(contents)
        if (parsed != null) {
            val (email, token, pinCode) = parsed
            performPairing(email, token = token, pinCode = pinCode)
        } else {
            AlertDialog.Builder(this)
                .setTitle("잘못된 QR코드")
                .setMessage("시트봇 알림 센터 전용 QR코드가 아닙니다.\n화면의 QR코드를 다시 확인해 주세요.")
                .setPositiveButton("확인", null)
                .show()
        }
    }

    private fun parseQrContents(contents: String): Triple<String, String?, String?>? {
        val trimmed = contents.trim()

        // 1. JSON 형태 (대시보드 SheetBot Agent2 규격)
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
                val json = org.json.JSONObject(trimmed)
                val email = json.optString("userEmail", json.optString("email", ""))
                val token = json.optString("token").takeIf { it.isNotBlank() }
                val pinCode = json.optString("pinCode").takeIf { it.isNotBlank() }
                if (email.isNotBlank()) {
                    return Triple(email, token, pinCode)
                }
            } catch (e: Exception) {
                android.util.Log.w("UserMainActivity", "QR JSON 파싱 오류: ${e.message}")
            }
        }

        // 2. URI 형태
        try {
            val uri = Uri.parse(trimmed)
            val scheme = uri.scheme
            val host = uri.host

            if (scheme == "sheetbot" && host == "pair") {
                val email = uri.getQueryParameter("email") ?: return null
                val token = uri.getQueryParameter("token")
                val pin = uri.getQueryParameter("pin")
                return Triple(email, token, pin)
            }

            if (trimmed.contains("sheetbot.cloud") || trimmed.contains("/pair")) {
                val email = uri.getQueryParameter("email")
                val token = uri.getQueryParameter("token")
                val pin = uri.getQueryParameter("pin")
                if (!email.isNullOrBlank()) return Triple(email, token, pin)
            }
        } catch (_: Exception) {}

        return null
    }

    private fun showManualPinDialog() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_manual_pin, null)
        val etEmail = dialogView.findViewById<EditText>(R.id.etDialogEmail)
        val etPin = dialogView.findViewById<EditText>(R.id.etDialogPin)

        AlertDialog.Builder(this)
            .setTitle("6자리 핀코드로 연동")
            .setView(dialogView)
            .setPositiveButton("연동하기") { _, _ ->
                val email = etEmail.text.toString().trim()
                val pin = etPin.text.toString().trim()
                if (email.isBlank() || pin.isBlank()) {
                    Toast.makeText(this, "이메일과 핀코드를 모두 입력해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                performPairing(email, pinCode = pin)
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun performPairing(email: String, token: String? = null, pinCode: String? = null) {
        binding.progressBar.visibility = View.VISIBLE
        activityScope.launch {
            val result = withTimeoutOrNull(8000L) {
                ApiClient.pairDevice(email, token, pinCode)
            }
            binding.progressBar.visibility = View.GONE

            if (result == null) {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("통신 시간 초과")
                    .setMessage("서버 응답이 8초 이상 지연되었습니다.\n네트워크 연결을 확인하신 후 다시 시도해 주세요.")
                    .setPositiveButton("확인", null)
                    .show()
                return@launch
            }

            if (result.success) {
                prefs.userEmail = email
                prefs.isPaired = true
                if (!result.webhookUrl.isNullOrBlank()) prefs.webhookUrl = result.webhookUrl
                if (!result.fallbackWebhookUrl.isNullOrBlank()) prefs.fallbackWebhookUrl = result.fallbackWebhookUrl
                if (!result.heartbeatUrl.isNullOrBlank()) prefs.heartbeatUrl = result.heartbeatUrl
                if (!result.fallbackHeartbeatUrl.isNullOrBlank()) prefs.fallbackHeartbeatUrl = result.fallbackHeartbeatUrl
                if (!result.deviceToken.isNullOrBlank()) prefs.deviceToken = result.deviceToken

                KeepAliveService.start(this@MainActivity)
                updateUiState()

                AlertDialog.Builder(this@MainActivity)
                    .setTitle("🎉 시트봇 에이전트 연동 성공!")
                    .setMessage("${email} 계정과의 구글 시트 1:1 연동이 완료되었습니다.\n\n• 스마트폰으로 수신된 고객 문자가 구글 시트에 실시간 기록됩니다.\n• 구글 시트에서 0원 문자 일괄 발송이 가능합니다.")
                    .setPositiveButton("확인", null)
                    .show()
            } else {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("연동 실패")
                    .setMessage(result.error ?: "서버와의 통신에 실패했습니다.")
                    .setPositiveButton("확인", null)
                    .show()
            }
        }
    }

    /**
     * Google 원클릭 로그인 완료 시 시트봇 서버와 0초 자동 페어링 처리 (v1.8.0)
     */
    private fun handleGoogleSignInSuccess(idToken: String?, email: String) {
        binding.progressBar.visibility = View.VISIBLE
        Toast.makeText(this, "구글 계정($email)으로 시트봇 연동 중...", Toast.LENGTH_SHORT).show()

        var detectedRefCode: String? = null
        try {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = clipboard.primaryClip
            if (clip != null && clip.itemCount > 0) {
                val clipText = clip.getItemAt(0).text?.toString()?.trim() ?: ""
                if (clipText.contains("ref=")) {
                    detectedRefCode = clipText.substringAfter("ref=").substringBefore("&").substringBefore(" ").trim()
                } else if (clipText.length in 4..12 && !clipText.contains(" ") && !clipText.contains("\n")) {
                    detectedRefCode = clipText
                }
            }
        } catch (_: Exception) {}

        activityScope.launch {
            val result = withTimeoutOrNull(10000L) {
                ApiClient.pairWithGoogle(idToken, email, referralCode = detectedRefCode)
            }
            binding.progressBar.visibility = View.GONE

            if (result == null) {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("연동 시간 초과")
                    .setMessage("서버 응답이 10초 이상 지연되었습니다.\n네트워크 상태를 확인하신 후 다시 시도해 주세요.")
                    .setPositiveButton("확인", null)
                    .show()
                return@launch
            }

            if (result.success) {
                val finalEmail = result.userEmail ?: email
                prefs.userEmail = finalEmail
                prefs.isPaired = true
                if (!result.webhookUrl.isNullOrBlank()) prefs.webhookUrl = result.webhookUrl
                if (!result.fallbackWebhookUrl.isNullOrBlank()) prefs.fallbackWebhookUrl = result.fallbackWebhookUrl
                if (!result.deviceToken.isNullOrBlank()) prefs.deviceToken = result.deviceToken

                KeepAliveService.start(this@MainActivity)
                updateUiState()

                addLogItem("구글로그인", "$finalEmail 계정 자동 연동 성공", true)

                if (prefs.isTtsEnabled) {
                    TtsManager.speak(this@MainActivity, "구글 계정으로 성공적으로 연동되었습니다.")
                }

                AlertDialog.Builder(this@MainActivity)
                    .setTitle("🎉 Google 원클릭 연동 완료!")
                    .setMessage("${finalEmail} 계정으로 시트봇 에이전트가 0초 만에 연동되었습니다.\n\nPC 화면의 QR 코드를 스캔할 필요 없이 스마트폰 단독으로 연동이 완료되었습니다.\n지금부터 문자/통화/사진/링크가 구글 시트와 실시간 동기화됩니다.")
                    .setPositiveButton("시작하기", null)
                    .show()
            } else {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("구글 연동 실패")
                    .setMessage(result.error ?: "구글 계정 연동 처리에 실패했습니다.")
                    .setPositiveButton("확인", null)
                    .show()
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

    private fun checkPermissions() {
        val permissionsToRequest = mutableListOf<String>()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.RECEIVE_SMS)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.READ_SMS)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.SEND_SMS)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.CAMERA)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.READ_MEDIA_AUDIO)
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.READ_PHONE_STATE)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.READ_CALL_LOG)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.READ_CONTACTS)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.WRITE_CONTACTS)
        }

        if (permissionsToRequest.isNotEmpty()) {
            permissionLauncher.launch(permissionsToRequest.toTypedArray())
        } else {
            checkAndRequestBatteryOptimization()
            checkNotificationListenerPermission()
        }
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(this)
        return enabledPackages.contains(packageName)
    }

    private fun checkNotificationListenerPermission() {
        if (!isNotificationListenerEnabled()) {
            binding.btnNotificationPermission.visibility = View.VISIBLE
        } else {
            binding.btnNotificationPermission.visibility = View.GONE
        }
    }

    private fun requestNotificationListenerPermission() {
        AlertDialog.Builder(this)
            .setTitle("🔔 알림 접근 권한 필요")
            .setMessage("구글 메시지(RCS 채팅 포함), 카카오톡 및 은행 입금 푸시 알림을 0원으로 실시간 감지하여 구글 시트에 자동 기록하기 위해 '알림 접근 권한'을 허용해 주세요.\n\n[설정으로 이동]을 누른 후 'SheetBot Agent'를 활성화해 주시면 됩니다.")
            .setPositiveButton("설정으로 이동") { _, _ ->
                try {
                    val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                    startActivity(intent)
                } catch (_: Exception) {
                    Toast.makeText(this, "알림 접근 설정 화면을 열 수 없습니다.", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("나중에", null)
            .show()
    }

    private fun checkAndRequestBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                binding.btnBatteryOpt.visibility = View.VISIBLE
            } else {
                binding.btnBatteryOpt.visibility = View.GONE
            }
        }
    }

    private fun requestIgnoreBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
            } catch (_: Exception) {
                val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                startActivity(intent)
            }
        }
    }

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

    /**
     * 기능 스위치 ON 시 구글 스프레드시트 대장 및 드라이브 폴더 선제 생성 (Eager Provisioning, v2.1.3)
     */
    private fun provisionSheetAsync(sheetType: String, sheetTitle: String, folderName: String? = null) {
        val userEmail = prefs.userEmail
        if (!prefs.isPaired || userEmail.isNullOrBlank()) {
            return
        }

        activityScope.launch {
            try {
                val result = ApiClient.provisionSheet(
                    userEmail = userEmail,
                    sheetType = sheetType,
                    sheetTitle = sheetTitle,
                    folderName = folderName
                )
                if (result.success) {
                    val statusPrefix = if (result.isNew) "🎉 새 대장 생성 완료" else "✅ 기존 대장 연결 확인"
                    val folderSuffix = if (!result.folderName.isNullOrBlank()) "\n📁 폴더: ${result.folderName}" else ""
                    val msg = "📊 ${result.title ?: sheetTitle}\n$statusPrefix (구글 드라이브에 준비되었습니다)$folderSuffix"
                    Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show()
                    addLogItem("대장 준비", "${result.title ?: sheetTitle} 확인 완료", true)

                    // URL 및 ID 로컬 캐시 (시트 원본 및 모바일 웹앱 원터치 열기 지원)
                    if (!result.spreadsheetUrl.isNullOrBlank()) {
                        prefs.setSheetUrl(sheetType, result.spreadsheetUrl)
                    }
                    if (!result.spreadsheetId.isNullOrBlank()) {
                        prefs.setSheetId(sheetType, result.spreadsheetId)
                    }
                    if (!result.folderUrl.isNullOrBlank()) {
                        prefs.setFolderUrl(sheetType, result.folderUrl)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.w("MainActivity", "시트/폴더 선제 생성 통신 예외: ${e.message}")
            }
        }
    }

    /**
     * 활성화된 기능들의 구글 시트 URL을 백그라운드에서 사전 캐싱 (v2.1.5)
     */
    private fun preloadActiveSheetUrls() {
        try {
            val userEmail = prefs.userEmail
            if (!prefs.isPaired || userEmail.isNullOrBlank()) return

            activityScope.launch(Dispatchers.IO) {
                try {
                    val targets = mutableListOf<Triple<String, String, String?>>()
                    if (prefs.isSmsSheetSyncEnabled && prefs.getSheetUrl("SMS").isNullOrBlank()) {
                        targets.add(Triple("SMS", prefs.smsDriveSheetTitle, null))
                    }
                    if (prefs.isKakaoSheetSyncEnabled && prefs.getSheetUrl("KAKAO").isNullOrBlank()) {
                        targets.add(Triple("KAKAO", prefs.kakaoDriveSheetTitle, null))
                    }
                    if (prefs.isMissedCallAutoReplyEnabled && prefs.getSheetUrl("MISSED_CALL").isNullOrBlank()) {
                        targets.add(Triple("MISSED_CALL", prefs.missedCallDriveSheetTitle, null))
                    }
                    if (prefs.isCallRecordingSyncEnabled && prefs.getSheetUrl("RECORDING").isNullOrBlank()) {
                        targets.add(Triple("RECORDING", "[SheetBot] 통화 녹음 대장", prefs.callRecordingDriveFolder))
                    }
                    if (prefs.isFileUploadSyncEnabled && prefs.getSheetUrl("FILE_UPLOAD").isNullOrBlank()) {
                        targets.add(Triple("FILE_UPLOAD", "[SheetBot] 파일 업로드 대장", prefs.fileUploadDriveFolder))
                    }
                    if (prefs.isLinkScrapEnabled && prefs.getSheetUrl("LINK_BOOKMARK").isNullOrBlank()) {
                        targets.add(Triple("LINK_BOOKMARK", prefs.linkScrapDriveSheetTitle, null))
                    }
                    if (prefs.isCallEndedCardPromptEnabled && prefs.getSheetUrl("CALL_ENDED_CARD").isNullOrBlank()) {
                        targets.add(Triple("CALL_ENDED_CARD", "[SheetBot] 모바일 명함 발송 대장", null))
                    }
                    if (prefs.isPushDetectionEnabled && prefs.getSheetUrl("PAYMENT_PUSH").isNullOrBlank()) {
                        targets.add(Triple("PAYMENT_PUSH", "[SheetBot] 매장 결제 및 매출 대장", null))
                    }
                    if (prefs.isReceiptSmsEnabled && prefs.getSheetUrl("RECEIPT_SMS").isNullOrBlank()) {
                        targets.add(Triple("RECEIPT_SMS", "[SheetBot] 고객 영수증 문자 발송 대장", null))
                    }
                    if (prefs.isWebsiteMonitorEnabled && prefs.getSheetUrl("WEBSITE_MONITOR").isNullOrBlank()) {
                        targets.add(Triple("WEBSITE_MONITOR", "[SheetBot] 웹사이트 모니터링 & 장애 대장", null))
                    }
                    val quoteUrl = prefs.getSheetUrl("QUOTE")
                    if (prefs.isQuoteSheetSyncEnabled && (quoteUrl.isNullOrBlank() || quoteUrl.contains("1feIe5"))) {
                        targets.add(Triple("QUOTE", prefs.quoteDriveSheetTitle, null))
                    }
                    if (prefs.getSheetUrl("RECEIPT").isNullOrBlank()) {
                        targets.add(Triple("RECEIPT", prefs.receiptDriveSheetTitle, "[SheetBot] 영수증 보관함"))
                    }
                    if (prefs.getSheetUrl("BUSINESS_CARD").isNullOrBlank()) {
                        targets.add(Triple("BUSINESS_CARD", prefs.businessCardDriveSheetTitle, "[SheetBot] 명함 보관함"))
                    }

                    for ((sheetType, title, folder) in targets) {
                        try {
                            val result = ApiClient.provisionSheet(
                                userEmail = userEmail,
                                sheetType = sheetType,
                                sheetTitle = title,
                                folderName = folder
                            )
                            if (result.success) {
                                if (!result.spreadsheetUrl.isNullOrBlank()) {
                                    prefs.setSheetUrl(sheetType, result.spreadsheetUrl)
                                }
                                if (!result.spreadsheetId.isNullOrBlank()) {
                                    prefs.setSheetId(sheetType, result.spreadsheetId)
                                }
                                if (!result.folderUrl.isNullOrBlank()) {
                                    prefs.setFolderUrl(sheetType, result.folderUrl)
                                }
                            }
                        } catch (_: Throwable) {}
                    }
                } catch (e: Throwable) {
                    android.util.Log.w("MainActivity", "preloadActiveSheetUrls 비동기 루프 방어: ${e.message}")
                }
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "preloadActiveSheetUrls 방어: ${e.message}")
        }
    }

    /**
     * 구글 시트 원본 vs 모바일 스마트 웹앱 선택 다이얼로그 (v2.1.5)
     */
    private fun showOpenSheetChooserDialog(sheetType: String, defaultTitle: String) {
        val userEmail = prefs.userEmail
        var cachedUrl = prefs.getSheetUrl(sheetType)
        var cachedId = prefs.getSheetId(sheetType)

        // 구버전 캐시(1feIe5...) 감지 시 강제 제거하여 최신 바인딩(1XCQMxao...) 동기화 유도
        if (sheetType == "QUOTE" && (cachedUrl?.contains("1feIe5") == true || cachedId?.contains("1feIe5") == true)) {
            cachedUrl = null
            cachedId = null
            prefs.setSheetUrl("QUOTE", "")
            prefs.setSheetId("QUOTE", "")
        }

        // 영수증 및 명함 기바인딩 프리셋 안전 확인 (0초 즉시 오픈 보장)
        if (cachedUrl.isNullOrBlank() && cachedId.isNullOrBlank() && !userEmail.isNullOrBlank()) {
            val presetId = when (sheetType.uppercase()) {
                "RECEIPT" -> if (userEmail.equals("chachogreat@gmail.com", ignoreCase = true)) "14t6C-90zNNN-NTXexP37fMOKX85gP9iTe3MIlM83RC4" else null
                "BUSINESS_CARD" -> if (userEmail.equals("chachogreat@gmail.com", ignoreCase = true)) "1GPMcTd7hxU2-ORZ32OX7Qz0tOnxMDNtSPqwKzqiS_AI" else null
                "LAW_ADVISORY" -> "1wpMUfSeV2nn0RRiEZKKU8vopBrx5iHCc67ltxNhKP3M"
                "NAVER_BLOG" -> "14nqZrqndHdz4gGpxBAqluss1kKnQSeSPk10koHYDSgI"
                "INSTAGRAM" -> "1iVleM1QedmtH7wLA0cVM4qhBNjJ3oL-PIrion4gwg2M"
                "MOBILE_SITE" -> "1hxYuqBrYGVmeX_W09izu8-ga9xMqZt0ssMu8TLaSPrg"
                "COMPANY_RESEARCH" -> "1K-SkmE7dyA2tDtl8YKz0QVyog7J7FJIc0vDQIAEOXag"
                else -> null
            }
            if (presetId != null) {
                cachedId = presetId
                cachedUrl = "https://docs.google.com/spreadsheets/d/$presetId/edit"
                prefs.setSheetId(sheetType, presetId)
                prefs.setSheetUrl(sheetType, cachedUrl)
            }
        }

        var finalSheetUrl = cachedUrl ?: if (!cachedId.isNullOrBlank()) {
            "https://docs.google.com/spreadsheets/d/$cachedId/edit"
        } else null

        // 주문 대장의 경우 주문접수대장 탭(gid=1021826080)으로 직행 보장
        if (sheetType == "QUOTE" && finalSheetUrl != null && !finalSheetUrl.contains("gid=")) {
            finalSheetUrl = "$finalSheetUrl#gid=1021826080"
        }

        val webAppUrl = buildString {
            append("https://sheetbot.cloud/m/${sheetType.lowercase()}")
            val queryParams = mutableListOf<String>()
            if (!userEmail.isNullOrBlank()) {
                queryParams.add("email=${Uri.encode(userEmail)}")
            }
            if (!cachedId.isNullOrBlank()) {
                queryParams.add("sheetId=${Uri.encode(cachedId)}")
            }
            if (queryParams.isNotEmpty()) {
                append("?").append(queryParams.joinToString("&"))
            }
        }

        val items = arrayOf(
            "📊 구글 스프레드시트 원본",
            "🌐 모바일 스마트 웹앱 (모바일 최적화)"
        )

        AlertDialog.Builder(this)
            .setTitle(defaultTitle)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> {
                        if (!finalSheetUrl.isNullOrBlank()) {
                            openExternalUrl(finalSheetUrl)
                        } else {
                            openSheetWithProgress(sheetType, defaultTitle, isWebApp = false)
                        }
                    }
                    1 -> {
                        if (!finalSheetUrl.isNullOrBlank()) {
                            openExternalUrl(webAppUrl)
                        } else {
                            openSheetWithProgress(sheetType, defaultTitle, isWebApp = true)
                        }
                    }
                }
            }
            .setNegativeButton("닫기", null)
            .show()
    }

    /**
     * 캐시가 없을 때 프로그레스 다이얼로그를 표시하고 구글 시트를 확인/생성한 즉시 자동으로 열어줌 (v2.1.5)
     */
    private fun openSheetWithProgress(sheetType: String, defaultTitle: String, isWebApp: Boolean) {
        val userEmail = prefs.userEmail
        if (!prefs.isPaired || userEmail.isNullOrBlank()) {
            Toast.makeText(this, "먼저 상단에서 시트봇 계정 연동을 완료해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val folderName = when (sheetType) {
            "RECORDING" -> prefs.callRecordingDriveFolder
            "FILE_UPLOAD" -> prefs.fileUploadDriveFolder
            "RECEIPT" -> "[SheetBot] 영수증 보관함"
            "BUSINESS_CARD" -> "[SheetBot] 명함 보관함"
            else -> null
        }

        val progressDialog = AlertDialog.Builder(this)
            .setTitle("📊 구글 스프레드시트 대장 준비 중")
            .setMessage("구글 드라이브에서 '${defaultTitle}'을(를) 확인하고 있습니다...\n\n준비되는 즉시 자동으로 열립니다. 잠시만 기다려주세요.")
            .setCancelable(true)
            .setNegativeButton("닫기") { dialog, _ ->
                dialog.dismiss()
            }
            .create()
        progressDialog.show()

        activityScope.launch {
            try {
                val result = kotlinx.coroutines.withTimeoutOrNull(45_000L) {
                    ApiClient.provisionSheet(
                        userEmail = userEmail,
                        sheetType = sheetType,
                        sheetTitle = defaultTitle,
                        folderName = folderName
                    )
                }

                withContext(Dispatchers.Main) {
                    if (progressDialog.isShowing) {
                        progressDialog.dismiss()
                    }

                    if (result == null) {
                        val fallbackId = when (sheetType.uppercase()) {
                            "RECEIPT" -> if (userEmail.equals("chachogreat@gmail.com", ignoreCase = true)) "14t6C-90zNNN-NTXexP37fMOKX85gP9iTe3MIlM83RC4" else null
                            "BUSINESS_CARD" -> if (userEmail.equals("chachogreat@gmail.com", ignoreCase = true)) "1GPMcTd7hxU2-ORZ32OX7Qz0tOnxMDNtSPqwKzqiS_AI" else null
                            else -> null
                        }
                        if (fallbackId != null) {
                            val fallbackUrl = "https://docs.google.com/spreadsheets/d/$fallbackId/edit"
                            prefs.setSheetId(sheetType, fallbackId)
                            prefs.setSheetUrl(sheetType, fallbackUrl)
                            Toast.makeText(this@MainActivity, "대장 시트로 바로 연결합니다.", Toast.LENGTH_SHORT).show()
                            if (isWebApp) {
                                openExternalUrl("https://sheetbot.cloud/m/${sheetType.lowercase()}?email=${Uri.encode(userEmail)}&sheetId=${Uri.encode(fallbackId)}")
                            } else {
                                openExternalUrl(fallbackUrl)
                            }
                            return@withContext
                        }
                        Toast.makeText(this@MainActivity, "시트 연결 요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", Toast.LENGTH_LONG).show()
                        return@withContext
                    }

                    if (result.success && !result.spreadsheetUrl.isNullOrBlank()) {
                        prefs.setSheetUrl(sheetType, result.spreadsheetUrl)
                        if (!result.spreadsheetId.isNullOrBlank()) {
                            prefs.setSheetId(sheetType, result.spreadsheetId)
                        }
                        if (!result.folderUrl.isNullOrBlank()) {
                            prefs.setFolderUrl(sheetType, result.folderUrl)
                        }

                        Toast.makeText(this@MainActivity, "🎉 대장 시트가 준비되었습니다!", Toast.LENGTH_SHORT).show()

                        if (isWebApp) {
                            val sid = result.spreadsheetId ?: prefs.getSheetId(sheetType)
                            val webAppUrl = if (!sid.isNullOrBlank()) {
                                "https://sheetbot.cloud/m/${sheetType.lowercase()}?email=${Uri.encode(userEmail)}&sheetId=${Uri.encode(sid)}"
                            } else {
                                "https://sheetbot.cloud/m/${sheetType.lowercase()}?email=${Uri.encode(userEmail)}"
                            }
                            openExternalUrl(webAppUrl)
                        } else {
                            openExternalUrl(result.spreadsheetUrl)
                        }
                    } else {
                        val errMsg = result.error ?: result.message ?: "구글 시트 대장을 연결할 수 없습니다."
                        AlertDialog.Builder(this@MainActivity)
                            .setTitle("⚠️ 대장 시트 연결 실패")
                            .setMessage("구글 스프레드시트를 준비하는 중 오류가 발생했습니다.\n\n원인: $errMsg\n\n구글 계정 연동 상태를 확인해 주세요.")
                            .setPositiveButton("확인", null)
                            .show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    if (progressDialog.isShowing) {
                        progressDialog.dismiss()
                    }
                    Toast.makeText(this@MainActivity, "통신 오류가 발생했습니다: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun openExternalUrl(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "브라우저를 열 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun openDriveFolder(sheetType: String, defaultFolderName: String) {
        val cachedFolderUrl = prefs.getFolderUrl(sheetType)
        if (!cachedFolderUrl.isNullOrBlank()) {
            openExternalUrl(cachedFolderUrl)
            return
        }

        val userEmail = prefs.userEmail
        if (!prefs.isPaired || userEmail.isNullOrBlank()) {
            val fallbackUrl = "https://drive.google.com/drive/search?q=${Uri.encode(defaultFolderName)}"
            openExternalUrl(fallbackUrl)
            return
        }

        val progressDialog = AlertDialog.Builder(this)
            .setTitle("📁 구글 드라이브 폴더 확인 중")
            .setMessage("구글 드라이브에서 '${defaultFolderName}' 폴더를 확인하고 있습니다...\n\n준비되는 즉시 자동으로 열립니다.")
            .setCancelable(false)
            .create()
        progressDialog.show()

        activityScope.launch {
            try {
                val result = ApiClient.provisionSheet(
                    userEmail = userEmail,
                    sheetType = sheetType,
                    sheetTitle = "[SheetBot] $defaultFolderName 대장",
                    folderName = defaultFolderName
                )
                withContext(Dispatchers.Main) {
                    if (progressDialog.isShowing) {
                        progressDialog.dismiss()
                    }
                    if (result.success && !result.folderUrl.isNullOrBlank()) {
                        prefs.setFolderUrl(sheetType, result.folderUrl)
                        if (!result.spreadsheetUrl.isNullOrBlank()) {
                            prefs.setSheetUrl(sheetType, result.spreadsheetUrl)
                        }
                        if (!result.spreadsheetId.isNullOrBlank()) {
                            prefs.setSheetId(sheetType, result.spreadsheetId)
                        }
                        openExternalUrl(result.folderUrl)
                    } else {
                        val fallbackUrl = "https://drive.google.com/drive/search?q=${Uri.encode(defaultFolderName)}"
                        openExternalUrl(fallbackUrl)
                    }
                }
            } catch (_: Exception) {
                withContext(Dispatchers.Main) {
                    if (progressDialog.isShowing) {
                        progressDialog.dismiss()
                    }
                    val fallbackUrl = "https://drive.google.com/drive/search?q=${Uri.encode(defaultFolderName)}"
                    openExternalUrl(fallbackUrl)
                }
            }
        }
    }

    private fun getAppVersionName(): String {
        return try {
            val pInfo = packageManager.getPackageInfo(packageName, 0)
            pInfo.versionName ?: BuildConfig.VERSION_NAME
        } catch (_: Exception) {
            BuildConfig.VERSION_NAME
        }
    }

    /**
     * 연락처 권한 확인 후 주소록 선택창 실행 (v2.1.1)
     */
    private fun checkAndLaunchContactPicker(targetType: String) {
        pendingContactTargetType = targetType
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
            launchContactPicker(targetType)
        } else {
            contactPermissionLauncher.launch(Manifest.permission.READ_CONTACTS)
        }
    }

    private fun launchContactPicker(targetType: String) {
        pendingContactTargetType = targetType
        try {
            val intent = Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI)
            contactPickerLauncher.launch(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "주소록을 열 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 선택된 연락처에서 전화번호 및 이름 추출 후 기록 대상 필터에 추가
     */
    private fun handlePickedContact(contactUri: Uri, targetType: String?) {
        try {
            val cursor = contentResolver.query(
                contactUri,
                arrayOf(
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                ),
                null,
                null,
                null
            )
            cursor?.use {
                if (it.moveToFirst()) {
                    val name = it.getString(0)?.trim() ?: ""
                    val number = it.getString(1)?.trim() ?: ""
                    val cleanNumber = number.replace("[^0-9+]".toRegex(), "")
                    val formattedNumber = when {
                        cleanNumber.startsWith("010") && cleanNumber.length == 11 ->
                            "${cleanNumber.substring(0, 3)}-${cleanNumber.substring(3, 7)}-${cleanNumber.substring(7)}"
                        cleanNumber.startsWith("+8210") && cleanNumber.length == 13 ->
                            "010-${cleanNumber.substring(5, 9)}-${cleanNumber.substring(9)}"
                        cleanNumber.startsWith("8210") && cleanNumber.length == 12 ->
                            "010-${cleanNumber.substring(4, 8)}-${cleanNumber.substring(8)}"
                        else -> number
                    }

                    val itemToAdd = if (formattedNumber.isNotBlank()) formattedNumber else name
                    val displayName = if (name.isNotBlank() && name != formattedNumber) "$name ($formattedNumber)" else formattedNumber

                    when (targetType) {
                        "SMS" -> addTargetToFilter(binding.etSmsTargetFilter, itemToAdd, displayName)
                        "RECORDING" -> addTargetToFilter(binding.etRecordingTargetFilter, itemToAdd, displayName)
                    }
                }
            }
        } catch (e: Exception) {
            Toast.makeText(this, "연락처 정보를 가져오는 중 오류: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 지정된 EditText 필터 목록에 중복 없이 항목 추가
     */
    private fun addTargetToFilter(editText: EditText, item: String, displayName: String) {
        val currentText = editText.text.toString().trim()
        val currentList = currentText.split(",", ";")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .toMutableList()

        val cleanItem = item.replace("-", "").replace(" ", "").lowercase()
        val isAlreadyExist = currentList.any {
            it.replace("-", "").replace(" ", "").lowercase() == cleanItem
        }

        if (isAlreadyExist) {
            Toast.makeText(this, "이미 대상 목록에 등록되어 있습니다: $displayName", Toast.LENGTH_SHORT).show()
            return
        }

        currentList.add(item)
        val newText = currentList.joinToString(", ")
        editText.setText(newText)
        updateTargetBadges()
        Toast.makeText(this, "🎯 기록 대상 추가: $displayName", Toast.LENGTH_SHORT).show()
    }

    /**
     * 필터 등록 건수에 따라 상태 뱃지 및 관리 버튼 텍스트 실시간 갱신
     */
    private fun updateTargetBadges() {
        // SMS 대상
        if (::smsSyncCardController.isInitialized) {
            smsSyncCardController.updateTargetBadge()
        } else {
            val smsList = binding.etSmsTargetFilter.text.toString().split(",", ";")
                .map { it.trim() }.filter { it.isNotBlank() }
            if (smsList.isEmpty()) {
                binding.tvSmsTargetCountBadge.text = "전체 기록"
                binding.tvSmsTargetCountBadge.setTextColor(Color.parseColor("#38BDF8"))
                binding.btnManageSmsTargets.text = "📋 등록 대상 확인 / 제외"
            } else {
                binding.tvSmsTargetCountBadge.text = "${smsList.size}건 지정"
                binding.tvSmsTargetCountBadge.setTextColor(Color.parseColor("#34D399"))
                binding.btnManageSmsTargets.text = "📋 등록 대상 확인 / 제외 (${smsList.size}건)"
            }
        }

        // 통화 녹음 대상
        val recList = binding.etRecordingTargetFilter.text.toString().split(",", ";")
            .map { it.trim() }.filter { it.isNotBlank() }
        if (recList.isEmpty()) {
            binding.tvRecordingTargetCountBadge.text = "전체 저장"
            binding.tvRecordingTargetCountBadge.setTextColor(Color.parseColor("#38BDF8"))
            binding.btnManageRecordingTargets.text = "📋 등록 대상 확인 / 제외"
        } else {
            binding.tvRecordingTargetCountBadge.text = "${recList.size}건 지정"
            binding.tvRecordingTargetCountBadge.setTextColor(Color.parseColor("#34D399"))
            binding.btnManageRecordingTargets.text = "📋 등록 대상 확인 / 제외 (${recList.size}건)"
        }

        // 카카오톡 대상
        val kakaoList = binding.etKakaoTargetFilter.text.toString().split(",", ";")
            .map { it.trim() }.filter { it.isNotBlank() }
        if (kakaoList.isEmpty()) {
            binding.tvKakaoTargetCountBadge.text = "전체 기록"
            binding.tvKakaoTargetCountBadge.setTextColor(Color.parseColor("#38BDF8"))
            binding.btnManageKakaoTargets.text = "📋 등록 대상 확인 / 제외"
        } else {
            binding.tvKakaoTargetCountBadge.text = "${kakaoList.size}건 지정"
            binding.tvKakaoTargetCountBadge.setTextColor(Color.parseColor("#34D399"))
            binding.btnManageKakaoTargets.text = "📋 등록 대상 확인 / 제외 (${kakaoList.size}건)"
        }
    }

    /**
     * 현재 기록 대상 목록 팝업 및 원클릭 제외(삭제) 관리 다이얼로그 (v2.1.1)
     */
    private fun showTargetManageDialog(dialogTitle: String, editText: EditText, targetType: String) {
        val currentText = editText.text.toString().trim()
        val currentList = currentText.split(",", ";")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .toMutableList()

        val context = this
        val dialogView = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(40, 30, 40, 20)
            setBackgroundColor(Color.parseColor("#0F172A"))
        }

        val tvDesc = TextView(context).apply {
            textSize = 12f
            setTextColor(Color.parseColor("#94A3B8"))
            setLineSpacing(4f, 1f)
            setPadding(0, 0, 0, 20)
        }
        dialogView.addView(tvDesc)

        val scrollView = android.widget.ScrollView(context).apply {
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                (280 * resources.displayMetrics.density).toInt()
            )
        }
        val itemsContainer = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL
        }
        scrollView.addView(itemsContainer)
        dialogView.addView(scrollView)

        fun refreshList() {
            itemsContainer.removeAllViews()
            if (currentList.isEmpty()) {
                tvDesc.text = "💡 현재 개별 등록된 대상이 없습니다.\n모든 수신 내용이 구글 시트에 '전체 자동 기록'됩니다."
                val emptyTv = TextView(context).apply {
                    text = "등록된 대상 없음 (전체 기록 모드)"
                    textSize = 13f
                    setTextColor(Color.parseColor("#64748B"))
                    gravity = android.view.Gravity.CENTER
                    setPadding(0, 60, 0, 60)
                }
                itemsContainer.addView(emptyTv)
            } else {
                tvDesc.text = "💡 현재 총 ${currentList.size}건의 대상만 선별 기록됩니다.\n목록에서 제외하려면 우측의 [❌ 제외] 버튼을 누르세요."
                for (item in currentList.toList()) {
                    val row = android.widget.LinearLayout(context).apply {
                        orientation = android.widget.LinearLayout.HORIZONTAL
                        gravity = android.view.Gravity.CENTER_VERTICAL
                        setPadding(16, 14, 16, 14)
                        setBackgroundColor(Color.parseColor("#1E293B"))
                        val params = android.widget.LinearLayout.LayoutParams(
                            android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply { setMargins(0, 0, 0, 12) }
                        layoutParams = params
                    }

                    val resolvedName = if (targetType != "KAKAO") ContactHelper.getContactName(context, item) else null
                    val itemLabel = if (!resolvedName.isNullOrBlank()) "👤 $resolvedName\n    ($item)" else "🎯 $item"

                    val tvItem = TextView(context).apply {
                        text = itemLabel
                        textSize = 12.5f
                        setTextColor(Color.parseColor("#F1F5F9"))
                        layoutParams = android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    }
                    val btnDelete = Button(context).apply {
                        text = "❌ 제외"
                        textSize = 11.5f
                        setTextColor(Color.parseColor("#EF4444"))
                        setBackgroundColor(Color.parseColor("#334155"))
                        layoutParams = android.widget.LinearLayout.LayoutParams(
                            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
                            (36 * resources.displayMetrics.density).toInt()
                        )
                        setOnClickListener {
                            currentList.remove(item)
                            val newText = currentList.joinToString(", ")
                            editText.setText(newText)
                            updateTargetBadges()
                            Toast.makeText(context, "'${item}' 대상이 제외되었습니다.", Toast.LENGTH_SHORT).show()
                            refreshList()
                        }
                    }
                    row.addView(tvItem)
                    row.addView(btnDelete)
                    itemsContainer.addView(row)
                }
            }
        }

        refreshList()

        val builder = AlertDialog.Builder(context)
            .setTitle(dialogTitle)
            .setView(dialogView)
            .setNegativeButton("닫기", null)

        if (targetType == "SMS" || targetType == "RECORDING") {
            builder.setPositiveButton("👥 연락처에서 추가") { _, _ ->
                checkAndLaunchContactPicker(targetType)
            }
        }

        builder.setNeutralButton("🗑️ 전체 해제 (모두 기록)") { _, _ ->
            currentList.clear()
            editText.setText("")
            updateTargetBadges()
            Toast.makeText(context, "모든 대상이 해제되어 '전체 기록 모드'로 전환되었습니다.", Toast.LENGTH_LONG).show()
        }

        builder.show()
    }

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

        /**
     * 안드로이드 11+ (API 30+) 환경에서 서드파티 통화 녹음(에이닷, T전화 등) 폴더 파일 읽기를 위한
     * '모든 파일에 대한 접근'(MANAGE_EXTERNAL_STORAGE) 권한 점검 및 안내 다이얼로그 (v2.1.27)
     */
    private fun checkAndRequestAllFilesAccess(onGranted: (() -> Unit)? = null) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (Environment.isExternalStorageManager()) {
                onGranted?.invoke()
            } else {
                AlertDialog.Builder(this)
                    .setTitle("📁 모든 파일 관리 권한 허용 안내")
                    .setMessage("에이닷(A.), T전화 등 별도 통화 녹음 어플에 저장된 녹음 파일을 구글 드라이브로 자동 백업하기 위해 '모든 파일에 대한 접근' 권한이 필요합니다.\n\n[설정으로 이동]을 누른 후 '모든 파일 관리 허용' 스위치를 켜주세요.")
                    .setPositiveButton("설정으로 이동") { _, _ ->
                        try {
                            val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                                data = Uri.fromParts("package", packageName, null)
                            }
                            startActivity(intent)
                        } catch (e: Exception) {
                            try {
                                val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                                startActivity(intent)
                            } catch (e2: Exception) {
                                Toast.makeText(this, "설정 화면을 열 수 없습니다: ${e2.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                    .setNegativeButton("나중에", null)
                    .show()
            }
        } else {
            // Android 10 이하
            val perm = Manifest.permission.READ_EXTERNAL_STORAGE
            if (ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED) {
                onGranted?.invoke()
            } else {
                androidx.core.app.ActivityCompat.requestPermissions(this, arrayOf(perm, Manifest.permission.WRITE_EXTERNAL_STORAGE), 1099)
            }
        }
    }

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

}




