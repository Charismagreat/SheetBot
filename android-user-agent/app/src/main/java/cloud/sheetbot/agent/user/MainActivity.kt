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
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
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
            uploadFiles(uris, "앱 내 직접 선택 파일 업로드")
        }
    }

    // 영수증 AI OCR 장부화 전용 이미지/문서 선택 런처 (v1.5)
    private val receiptPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            uploadReceipt(uri)
        }
    }

    // 명함 AI OCR 인맥 등록 전용 이미지/문서 선택 런처 (v1.5)
    private val businessCardPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            uploadBusinessCard(uri)
        }
    }

    // 통화 종료 모바일 명함 발송용 첨부 이미지(MMS) 선택 런처 (v2.0.7)
    private val callEndedImagePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            saveBusinessCardImage(uri)
        }
    }

    // 📷 견적 웹앱 및 카카오톡 미리보기용 대표 이미지 선택 런처 (v2.1.18)
    private val quoteImagePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            handleQuoteImageSelected(uri)
        }
    }

    // 카카오톡 대화 내용 내보내기(.txt) 파일 선택 런처 (v2.1.11)
    private val kakaoChatPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            importKakaoChatFile(uri)
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
                executeAiCommand(spokenText)
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
            updateWebsiteMonitorStatusText()
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "updateWebsiteMonitorStatusText 방어: ${e.message}")
        }
        try {
            refreshQuoteImageUi()
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "refreshQuoteImageUi 방어: ${e.message}")
        }
        try {
            refreshBusinessCardUi()
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "refreshBusinessCardUi 방어: ${e.message}")
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
        binding.switchTts.isChecked = prefs.isTtsEnabled
        binding.switchTts.setOnCheckedChangeListener { _, isChecked ->
            prefs.isTtsEnabled = isChecked
            if (isChecked) TtsManager.speak(this, "실시간 음성 안내가 활성화되었습니다.")
        }

        binding.switchReceiptSms.isChecked = prefs.isReceiptSmsEnabled
        binding.layoutReceiptSmsSettings.visibility = if (prefs.isReceiptSmsEnabled) View.VISIBLE else View.GONE
        binding.etReceiptSmsTemplate.setText(prefs.receiptSmsTemplate)

        binding.switchReceiptSms.setOnCheckedChangeListener { _, isChecked ->
            prefs.isReceiptSmsEnabled = isChecked
            binding.layoutReceiptSmsSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "고객 영수증 문자 자동 전송이 켜졌습니다." else "고객 영수증 문자 자동 전송이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                provisionSheetAsync("RECEIPT_SMS", "[SheetBot] 고객 영수증 문자 발송 대장")
            }
        }

        binding.etReceiptSmsTemplate.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                prefs.receiptSmsTemplate = s?.toString() ?: ""
            }
        })

        binding.btnResetReceiptSmsTemplate.setOnClickListener {
            val defaultTpl = "[SheetBot] {고객명}님, {금액} 결제가 정상 확인되었습니다. 이용해 주셔서 감사합니다."
            binding.etReceiptSmsTemplate.setText(defaultTpl)
            prefs.receiptSmsTemplate = defaultTpl
            Toast.makeText(this, "영수증 문자 문구가 기본값으로 복원되었습니다.", Toast.LENGTH_SHORT).show()
        }

        binding.btnTestReceiptSms.setOnClickListener {
            showReceiptSmsTestDialog()
        }

        binding.btnDiagnoseReceiptConditions.setOnClickListener {
            showReceiptConditionDiagnosisDialog()
        }

        binding.switchPushDetection.isChecked = prefs.isPushDetectionEnabled
        binding.switchPushDetection.setOnCheckedChangeListener { _, isChecked ->
            prefs.isPushDetectionEnabled = isChecked
            if (isChecked && !isNotificationListenerEnabled()) {
                requestNotificationListenerPermission()
            } else {
                val msg = if (isChecked) "금융/결제 앱 푸시 실시간 감지가 켜졌습니다." else "금융/결제 앱 푸시 감지가 꺼졌습니다."
                Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            }
            if (isChecked) {
                provisionSheetAsync("PAYMENT_PUSH", "[SheetBot] 매장 결제 및 매출 대장")
            }
        }

        binding.btnOpenPaymentPushSheet.setOnClickListener {
            showOpenSheetChooserDialog("PAYMENT_PUSH", "[SheetBot] 매장 결제 및 매출 대장")
        }
        binding.btnOpenReceiptSmsSheet.setOnClickListener {
            showOpenSheetChooserDialog("RECEIPT_SMS", "[SheetBot] 고객 영수증 문자 발송 대장")
        }

        // 통화 녹음 구글 드라이브 자동 백업 UI 바인딩 및 실시간 자동 저장 (Auto-Save)
        binding.switchCallRecording.isChecked = prefs.isCallRecordingSyncEnabled
        binding.etRecordingTargetFilter.setText(prefs.callRecordingTargetFilter)

        binding.switchCallRecording.setOnCheckedChangeListener { _, isChecked ->
            prefs.isCallRecordingSyncEnabled = isChecked
            prefs.isCallRecordingDetailsHidden = !isChecked
            updateCardCollapseState(binding.layoutCallRecordingSettings, binding.btnToggleCallRecordingDetails, !isChecked)
            val msg = if (isChecked) "통화 녹음 드라이브 자동 저장이 켜졌습니다." else "통화 녹음 드라이브 저장이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                checkAndRequestAllFilesAccess()
                provisionSheetAsync("RECORDING", "[SheetBot] 통화 녹음 대장", prefs.callRecordingDriveFolder)
            }
        }

        binding.btnPickRecordingContact.setOnClickListener {
            checkAndLaunchContactPicker("RECORDING")
        }
        binding.btnManageRecordingTargets.setOnClickListener {
            showTargetManageDialog("🎙️ 통화 녹음 업로드 대상 관리", binding.etRecordingTargetFilter, "RECORDING")
        }

        binding.etRecordingTargetFilter.doAfterTextChanged {
            prefs.callRecordingTargetFilter = it?.toString()?.trim() ?: ""
            updateTargetBadges()
        }

        binding.btnOpenRecordingSheet.setOnClickListener {
            showOpenSheetChooserDialog("RECORDING", "[SheetBot] 통화 녹음 대장")
        }
        binding.btnOpenRecordingFolder.setOnClickListener {
            openDriveFolder("RECORDING", prefs.callRecordingDriveFolder)
        }

        updateRecordingSourceFolderBadge()
        binding.btnChangeRecordingFolder.setOnClickListener {
            showRecordingFolderChooserDialog()
        }

        // 통화 종료 즉시 녹음 자동 업로드 스위치 바인딩
        binding.switchCallEndedAutoUpload.isChecked = prefs.isCallEndedAutoUploadEnabled
        binding.switchCallEndedAutoUpload.setOnCheckedChangeListener { _, isChecked ->
            prefs.isCallEndedAutoUploadEnabled = isChecked
            val msg = if (isChecked) "통화 종료 즉시 녹음 자동 업로드가 켜졌습니다." else "통화 종료 즉시 자동 업로드가 꺼졌습니다 (수동 동기화 모드)."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }

        // Wi-Fi 환경 전용 업로드 스위치 바인딩
        binding.switchRecordingUploadOnlyOnWifi.isChecked = prefs.isRecordingUploadOnlyOnWifi
        binding.switchRecordingUploadOnlyOnWifi.setOnCheckedChangeListener { _, isChecked ->
            prefs.isRecordingUploadOnlyOnWifi = isChecked
            val msg = if (isChecked) "Wi-Fi 환경에서만 녹음이 자동 업로드됩니다 (데이터 절약)." else "모바일 데이터 및 Wi-Fi 환경 모두에서 자동 업로드됩니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }

        binding.btnSyncRecordingsNow.setOnClickListener {
            checkAndRequestAllFilesAccess {
                executeRecordingSync(forceReupload = false)
            }
        }

        binding.btnSyncRecordingsNow.setOnLongClickListener {
            androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("🔄 통화 녹음 전체 강제 재동기화")
                .setMessage("기존 백업 이력을 무시하고 스마트폰의 모든 통화 녹음 파일을 구글 드라이브로 다시 업로드하시겠습니까?")
                .setPositiveButton("전체 재업로드") { _, _ ->
                    checkAndRequestAllFilesAccess {
                        executeRecordingSync(forceReupload = true)
                    }
                }
                .setNegativeButton("취소", null)
                .show()
            true
        }

        // 사진 및 문서 파일 구글 드라이브 업로드 UI 바인딩 및 실시간 자동 저장 (Auto-Save)
        binding.switchFileUploadSync.isChecked = prefs.isFileUploadSyncEnabled

        binding.switchFileUploadSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isFileUploadSyncEnabled = isChecked
            prefs.isFileUploadDetailsHidden = !isChecked
            updateCardCollapseState(binding.layoutFileUploadDetails, binding.btnToggleFileUploadDetails, !isChecked)
            val msg = if (isChecked) "사진 및 문서 드라이브 보관함이 켜졌습니다." else "사진 및 문서 드라이브 보관함이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                provisionSheetAsync("FILE_UPLOAD", "[SheetBot] 파일 업로드 대장", prefs.fileUploadDriveFolder)
            }
        }

        binding.btnOpenFileSheet.setOnClickListener {
            showOpenSheetChooserDialog("FILE_UPLOAD", "[SheetBot] 파일 업로드 대장")
        }
        binding.btnOpenFileFolder.setOnClickListener {
            openDriveFolder("FILE_UPLOAD", prefs.fileUploadDriveFolder)
        }
        binding.btnOpenReceiptSheet.setOnClickListener {
            showOpenSheetChooserDialog("RECEIPT", prefs.receiptDriveSheetTitle)
        }
        binding.btnOpenBusinessCardSheet.setOnClickListener {
            showOpenSheetChooserDialog("BUSINESS_CARD", prefs.businessCardDriveSheetTitle)
        }

        // 웹 링크 & 유튜브 영상 AI 자동 스크랩 UI 바인딩 및 실시간 자동 저장 (Auto-Save)
        binding.switchLinkScrap.isChecked = prefs.isLinkScrapEnabled

        binding.switchLinkScrap.setOnCheckedChangeListener { _, isChecked ->
            prefs.isLinkScrapEnabled = isChecked
            prefs.isLinkScrapDetailsHidden = !isChecked
            updateCardCollapseState(binding.layoutLinkScrapSettings, binding.btnToggleLinkScrapDetails, !isChecked)
            val msg = if (isChecked) "웹 링크 & 유튜브 AI 자동 스크랩이 켜졌습니다." else "웹 링크 & 유튜브 자동 스크랩이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                provisionSheetAsync("LINK_BOOKMARK", prefs.linkScrapDriveSheetTitle)
            }
        }

        binding.btnOpenLinkScrapSheet.setOnClickListener {
            showOpenSheetChooserDialog("LINK_BOOKMARK", prefs.linkScrapDriveSheetTitle)
        }

        // 자연어 AI 시트 코파일럿 UI 리스너 (v1.7)
        binding.btnVoiceCommand.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(this, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            startVoiceRecognition()
        }

        binding.btnExecuteCommand.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(this, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val cmd = binding.etAiCommand.text.toString().trim()
            if (cmd.isBlank()) {
                Toast.makeText(this, "구글 시트에 내릴 명령을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            executeAiCommand(cmd)
        }

        binding.btnPickAndUploadFile.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(this, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            filePickerLauncher.launch("*/*")
        }

        binding.btnPickReceipt.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(this, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            receiptPickerLauncher.launch("image/*")
        }

        binding.btnPickBusinessCard.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(this, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            businessCardPickerLauncher.launch("image/*")
        }

        // 문자(SMS/LMS) 송수신 구글 시트 동기화 UI 바인딩 및 실시간 자동 저장 (Auto-Save)
        binding.switchSmsSync.isChecked = prefs.isSmsSheetSyncEnabled
        binding.etSmsTargetFilter.setText(prefs.smsTargetFilter)

        binding.switchSmsSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isSmsSheetSyncEnabled = isChecked
            prefs.isSmsSyncDetailsHidden = !isChecked
            updateCardCollapseState(binding.layoutSmsSyncSettings, binding.btnToggleSmsSyncDetails, !isChecked)
            val msg = if (isChecked) "고객 문자 시트 자동 기록이 켜졌습니다." else "고객 문자 시트 기록이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                provisionSheetAsync("SMS", prefs.smsDriveSheetTitle)
                if (!isNotificationListenerEnabled()) {
                    requestNotificationListenerPermission()
                }
            }
        }

        binding.btnPickSmsContact.setOnClickListener {
            checkAndLaunchContactPicker("SMS")
        }
        binding.btnManageSmsTargets.setOnClickListener {
            showTargetManageDialog("🎯 SMS 기록 대상 관리", binding.etSmsTargetFilter, "SMS")
        }

        binding.etSmsTargetFilter.doAfterTextChanged {
            prefs.smsTargetFilter = it?.toString()?.trim() ?: ""
            updateTargetBadges()
        }

        binding.btnOpenSmsSheet.setOnClickListener {
            showOpenSheetChooserDialog("SMS", prefs.smsDriveSheetTitle)
        }

        // 카카오톡 수신 메시지 구글 시트 동기화 UI 바인딩 및 실시간 자동 저장 (Auto-Save)
        binding.switchKakaoSync.isChecked = prefs.isKakaoSheetSyncEnabled
        binding.etKakaoTargetFilter.setText(prefs.kakaoTargetFilter)

        binding.switchKakaoSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isKakaoSheetSyncEnabled = isChecked
            prefs.isKakaoSyncDetailsHidden = !isChecked
            updateCardCollapseState(binding.layoutKakaoSyncSettings, binding.btnToggleKakaoSyncDetails, !isChecked)
            val msg = if (isChecked) "카카오톡 대화 시트 자동 기록이 켜졌습니다." else "카카오톡 시트 기록이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                provisionSheetAsync("KAKAO", prefs.kakaoDriveSheetTitle)
            }
        }

        binding.btnManageKakaoTargets.setOnClickListener {
            showTargetManageDialog("🟡 카카오톡 기록 대상 관리", binding.etKakaoTargetFilter, "KAKAO")
        }

        binding.etKakaoTargetFilter.doAfterTextChanged {
            prefs.kakaoTargetFilter = it?.toString()?.trim() ?: ""
            updateTargetBadges()
        }

        binding.btnImportKakaoChat.setOnClickListener {
            if (!prefs.isPaired || prefs.userEmail.isNullOrBlank()) {
                Toast.makeText(this, "먼저 시트봇 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            try {
                kakaoChatPickerLauncher.launch("*/*")
            } catch (_: Exception) {
                try {
                    kakaoChatPickerLauncher.launch("text/*")
                } catch (e: Exception) {
                    Toast.makeText(this, "파일 탐색기를 열 수 없습니다: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
                }
            }
        }

        binding.btnOpenKakaoSheet.setOnClickListener {
            showOpenSheetChooserDialog("KAKAO", prefs.kakaoDriveSheetTitle)
        }

        // 📑 AI 스마트 견적 및 단가표 대장 연동 UI 바인딩 및 자동 저장 (Auto-Save)
        binding.switchQuoteSync.isChecked = prefs.isQuoteSheetSyncEnabled

        binding.switchQuoteSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isQuoteSheetSyncEnabled = isChecked
            prefs.isQuoteSyncDetailsHidden = !isChecked
            updateCardCollapseState(binding.layoutQuoteSyncSettings, binding.btnToggleQuoteSyncDetails, !isChecked)
            val msg = if (isChecked) "고객용 간편 주문서 & 단가표 자동 안내가 켜졌습니다." else "간편 주문서 자동 안내가 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                provisionSheetAsync("QUOTE", prefs.quoteDriveSheetTitle)
            }
        }

        // 📷 카톡 미리보기 및 웹앱 대표 썸네일 등록 (v2.1.18)
        binding.btnSelectQuoteImage.setOnClickListener {
            val email = prefs.userEmail
            if (email.isNullOrBlank()) {
                Toast.makeText(this, "먼저 시트봇 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
            } else {
                quoteImagePickerLauncher.launch("image/*")
            }
        }

        refreshQuoteImageUi()

        // 🏢 상호명/브랜드명 실시간 자동 저장 및 서버 동기화 (v2.1.17)
        binding.etQuoteBusinessName.setText(prefs.quoteBusinessName)

        val saveBusinessNameAction: (Boolean) -> Unit = { showToast ->
            val newName = binding.etQuoteBusinessName.text?.toString()?.trim() ?: ""
            prefs.quoteBusinessName = newName
            binding.tvBusinessNameStatus.text = "저장 중..."
            binding.tvBusinessNameStatus.setTextColor(Color.parseColor("#F59E0B"))
            val email = prefs.userEmail
            if (!email.isNullOrBlank()) {
                activityScope.launch {
                    val ok = ApiClient.updateBusinessProfile(email, newName)
                    withContext(Dispatchers.Main) {
                        if (ok) {
                            binding.tvBusinessNameStatus.text = "실시간 반영됨 ✓"
                            binding.tvBusinessNameStatus.setTextColor(Color.parseColor("#34D399"))
                            if (showToast) {
                                Toast.makeText(this@MainActivity, "🎉 상호명이 '$newName'(으)로 고객 견적 웹앱에 반영되었습니다!", Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            binding.tvBusinessNameStatus.text = "로컬 저장됨"
                            binding.tvBusinessNameStatus.setTextColor(Color.parseColor("#94A3B8"))
                            if (showToast) {
                                Toast.makeText(this@MainActivity, "상호명이 저장되었습니다 (서버 동기화 대기 중)", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                }
            } else {
                binding.tvBusinessNameStatus.text = "로컬 저장됨"
                binding.tvBusinessNameStatus.setTextColor(Color.parseColor("#94A3B8"))
                if (showToast) {
                    Toast.makeText(this@MainActivity, "먼저 시트봇 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                }
            }
        }

        binding.btnSaveBusinessName.setOnClickListener {
            saveBusinessNameAction(true)
        }

        binding.etQuoteBusinessName.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) {
                saveBusinessNameAction(true)
                true
            } else {
                false
            }
        }

        binding.etQuoteBusinessName.doAfterTextChanged {
            val newName = it?.toString()?.trim() ?: ""
            prefs.quoteBusinessName = newName
            saveBusinessNameAction(false)
        }

        // 서버 프로필 로드하여 로컬 상호명 및 대표 이미지 자동 동기화
        val currentEmail = prefs.userEmail
        if (!currentEmail.isNullOrBlank()) {
            activityScope.launch {
                try {
                    val profile = ApiClient.getBusinessProfile(currentEmail)
                    if (profile.success) {
                        withContext(Dispatchers.Main) {
                            if (profile.businessName.isNotBlank() && prefs.quoteBusinessName.isBlank()) {
                                prefs.quoteBusinessName = profile.businessName
                                binding.etQuoteBusinessName.setText(profile.businessName)
                            }
                            if (profile.imageUrl.isNotBlank() && profile.imageUrl != "https://sheetbot.cloud/favicon.svg") {
                                prefs.quoteImageUrl = profile.imageUrl
                                // 로컬 영구 파일이 없거나 비어있는 경우에만 원격 이미지 비동기 다운로드 및 캐싱
                                if (!localQuoteImageFile.exists() || localQuoteImageFile.length() == 0L) {
                                    loadQuoteImageThumbnail(profile.imageUrl)
                                }
                            }
                        }
                    }
                } catch (_: Exception) {}
            }
        }

        binding.btnOpenQuoteSheet.setOnClickListener {
            // 과거 잘못된 구버전 시트 URL 캐시(1feIe5...)가 남아있다면 강제 무효화하여 최신 바인딩(1XCQMxao...) 동기화
            val currentQuoteUrl = prefs.getSheetUrl("QUOTE")
            val currentQuoteId = prefs.getSheetId("QUOTE")
            if (currentQuoteUrl?.contains("1feIe5") == true || currentQuoteId?.contains("1feIe5") == true) {
                prefs.setSheetUrl("QUOTE", "")
                prefs.setSheetId("QUOTE", "")
            }
            showOpenSheetChooserDialog("QUOTE", prefs.quoteDriveSheetTitle)
        }

        // 📱 고객 주도형 모바일 셀프 견적 & 1초 주문 웹앱 바로가기 및 링크 복사
        binding.btnOpenSelfOrderWeb.setOnClickListener {
            val email = prefs.userEmail
            if (email.isNullOrBlank()) {
                Toast.makeText(this, "먼저 시트봇 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val slug = Base64.encodeToString(email.toByteArray(Charsets.UTF_8), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
            val url = "https://sheetbot.cloud/order/$slug"
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(this, "웹 브라우저를 열 수 없습니다: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnCopySelfOrderLink.setOnClickListener {
            val email = prefs.userEmail
            if (email.isNullOrBlank()) {
                Toast.makeText(this, "먼저 시트봇 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val slug = Base64.encodeToString(email.toByteArray(Charsets.UTF_8), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
            val url = "https://sheetbot.cloud/order/$slug"
            try {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("SheetBot Self Order Link", url))
                Toast.makeText(this, "고객 주문 링크가 복사되었습니다! 카톡이나 문자로 전송하세요.", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this, "클립보드 복사 실패: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            }
        }

        // 부재중 전화(Missed Call) 0원 스마트 자동 회신 UI 바인딩 및 실시간 자동 저장 (Auto-Save)
        binding.switchMissedCall.isChecked = prefs.isMissedCallAutoReplyEnabled
        binding.etMissedCallReply.setText(prefs.missedCallReplyTemplate)

        binding.switchMissedCall.setOnCheckedChangeListener { _, isChecked ->
            prefs.isMissedCallAutoReplyEnabled = isChecked
            prefs.isMissedCallDetailsHidden = !isChecked
            updateCardCollapseState(binding.layoutMissedCallSettings, binding.btnToggleMissedCallDetails, !isChecked)
            val msg = if (isChecked) "전화 못 받았을 때 자동 답장 문자 발송이 켜졌습니다." else "전화 못 받았을 때 자동 답장이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                provisionSheetAsync("MISSED_CALL", prefs.missedCallDriveSheetTitle)
            }
        }

        binding.etMissedCallReply.doAfterTextChanged {
            prefs.missedCallReplyTemplate = it?.toString()?.trim() ?: ""
        }

        binding.btnOpenMissedCallSheet.setOnClickListener {
            showOpenSheetChooserDialog("MISSED_CALL", prefs.missedCallDriveSheetTitle)
        }

        // 통화 종료 직후 모바일 명함 원터치 발송 UI 바인딩 및 실시간 자동 저장 (Auto-Save)
        binding.switchCallEndedCard.isChecked = prefs.isCallEndedCardPromptEnabled
        binding.switchCallEndedAutoSendDirectly.isChecked = prefs.isCallEndedAutoSendDirectly
        binding.switchCallEndedAutoSendDirectly.setOnCheckedChangeListener { _, isChecked ->
            prefs.isCallEndedAutoSendDirectly = isChecked
            val msg = if (isChecked) "⚡ 통화 종료 시 알림 확인 없이 즉시 자동 발송 모드로 설정되었습니다." else "💼 통화 종료 후 상단 알림창 원터치 확인 모드로 설정되었습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }

        // 1. 발송 방식 라디오 버튼 초기화 (WEB_LINK vs MMS_IMAGE) 및 실시간 동기화
        refreshBusinessCardUi()

        // 2. 값 설정 및 텍스트 변경 실시간 자동 저장
        binding.etBusinessCardWebUrl.setText(prefs.businessCardWebLink)
        binding.etBusinessCardSms.setText(prefs.businessCardSmsTemplate)

        binding.etBusinessCardWebUrl.doAfterTextChanged {
            prefs.businessCardWebLink = it?.toString()?.trim() ?: ""
        }
        binding.etBusinessCardSms.doAfterTextChanged {
            prefs.businessCardSmsTemplate = it?.toString()?.trim() ?: ""
        }

        // 3. 사진 선택 및 미리보기 바인딩
        renderBusinessCardImagePreview()

        binding.btnPickBusinessCardImage.setOnClickListener {
            callEndedImagePickerLauncher.launch("image/*")
        }

        binding.btnRemoveBusinessCardImage.setOnClickListener {
            removeBusinessCardImage()
        }

        binding.switchCallEndedCard.setOnCheckedChangeListener { _, isChecked ->
            prefs.isCallEndedCardPromptEnabled = isChecked
            prefs.isCallEndedCardDetailsHidden = !isChecked
            updateCardCollapseState(binding.layoutCallEndedCardSettings, binding.btnToggleCallEndedCardDetails, !isChecked)
            val msg = if (isChecked) "통화 끝나면 내 모바일 명함 바로 보내기가 켜졌습니다." else "모바일 명함 보내기가 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                provisionSheetAsync("CALL_ENDED_CARD", "[SheetBot] 모바일 명함 발송 대장")
            }
        }

        binding.btnOpenCallEndedCardSheet.setOnClickListener {
            showOpenSheetChooserDialog("CALL_ENDED_CARD", "[SheetBot] 모바일 명함 발송 대장")
        }

        // 🌐 내 웹사이트 실시간 장애 감시 (Uptime Sentinel) UI 바인딩
        setupWebsiteMonitorUI()

        binding.btnCheckUpdate.setOnClickListener {
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
        updateCardCollapseState(binding.layoutCopilotDetails, binding.btnToggleCopilotDetails, prefs.isCopilotDetailsHidden)
        updateCardCollapseState(binding.layoutPaymentReceiptDetails, binding.btnTogglePaymentReceiptDetails, prefs.isPaymentReceiptDetailsHidden)
        updateCardCollapseState(binding.layoutCallRecordingSettings, binding.btnToggleCallRecordingDetails, prefs.isCallRecordingDetailsHidden)
        updateCardCollapseState(binding.layoutFileUploadDetails, binding.btnToggleFileUploadDetails, prefs.isFileUploadDetailsHidden)
        updateCardCollapseState(binding.layoutLinkScrapSettings, binding.btnToggleLinkScrapDetails, prefs.isLinkScrapDetailsHidden)
        updateCardCollapseState(binding.layoutSmsSyncSettings, binding.btnToggleSmsSyncDetails, prefs.isSmsSyncDetailsHidden)
        updateCardCollapseState(binding.layoutKakaoSyncSettings, binding.btnToggleKakaoSyncDetails, prefs.isKakaoSyncDetailsHidden)
        updateCardCollapseState(binding.layoutQuoteSyncSettings, binding.btnToggleQuoteSyncDetails, prefs.isQuoteSyncDetailsHidden)
        updateCardCollapseState(binding.layoutMissedCallSettings, binding.btnToggleMissedCallDetails, prefs.isMissedCallDetailsHidden)
        updateCardCollapseState(binding.layoutCallEndedCardSettings, binding.btnToggleCallEndedCardDetails, prefs.isCallEndedCardDetailsHidden)
        updateCardCollapseState(binding.layoutWebsiteMonitorSettings, binding.btnToggleWebsiteMonitorDetails, prefs.isWebsiteMonitorDetailsHidden)
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
        val toggleCopilot = {
            prefs.isCopilotDetailsHidden = !prefs.isCopilotDetailsHidden
            updateCardCollapseState(binding.layoutCopilotDetails, binding.btnToggleCopilotDetails, prefs.isCopilotDetailsHidden)
        }
        binding.layoutCopilotHeader.setOnClickListener { toggleCopilot() }
        binding.btnToggleCopilotDetails.setOnClickListener { toggleCopilot() }

        // 3. 매장 결제 & 영수증 카드
        val togglePaymentReceipt = {
            prefs.isPaymentReceiptDetailsHidden = !prefs.isPaymentReceiptDetailsHidden
            updateCardCollapseState(binding.layoutPaymentReceiptDetails, binding.btnTogglePaymentReceiptDetails, prefs.isPaymentReceiptDetailsHidden)
        }
        binding.layoutPaymentReceiptHeader.setOnClickListener { togglePaymentReceipt() }
        binding.btnTogglePaymentReceiptDetails.setOnClickListener { togglePaymentReceipt() }

        // 4. 통화 녹음 카드
        val toggleCallRecording = {
            prefs.isCallRecordingDetailsHidden = !prefs.isCallRecordingDetailsHidden
            updateCardCollapseState(binding.layoutCallRecordingSettings, binding.btnToggleCallRecordingDetails, prefs.isCallRecordingDetailsHidden)
        }
        binding.layoutCallRecordingHeader.setOnClickListener { toggleCallRecording() }
        binding.btnToggleCallRecordingDetails.setOnClickListener { toggleCallRecording() }

        // 5. 사진 & 문서 보관 카드
        val toggleFileUpload = {
            prefs.isFileUploadDetailsHidden = !prefs.isFileUploadDetailsHidden
            updateCardCollapseState(binding.layoutFileUploadDetails, binding.btnToggleFileUploadDetails, prefs.isFileUploadDetailsHidden)
        }
        binding.layoutFileUploadHeader.setOnClickListener { toggleFileUpload() }
        binding.btnToggleFileUploadDetails.setOnClickListener { toggleFileUpload() }

        // 6. 웹 링크 & 유튜브 카드
        val toggleLinkScrap = {
            prefs.isLinkScrapDetailsHidden = !prefs.isLinkScrapDetailsHidden
            updateCardCollapseState(binding.layoutLinkScrapSettings, binding.btnToggleLinkScrapDetails, prefs.isLinkScrapDetailsHidden)
        }
        binding.layoutLinkScrapHeader.setOnClickListener { toggleLinkScrap() }
        binding.btnToggleLinkScrapDetails.setOnClickListener { toggleLinkScrap() }

        // 7. 문자(SMS) 카드
        val toggleSmsSync = {
            prefs.isSmsSyncDetailsHidden = !prefs.isSmsSyncDetailsHidden
            updateCardCollapseState(binding.layoutSmsSyncSettings, binding.btnToggleSmsSyncDetails, prefs.isSmsSyncDetailsHidden)
        }
        binding.layoutSmsSyncHeader.setOnClickListener { toggleSmsSync() }
        binding.btnToggleSmsSyncDetails.setOnClickListener { toggleSmsSync() }

        // 8. 카카오톡 카드
        val toggleKakaoSync = {
            prefs.isKakaoSyncDetailsHidden = !prefs.isKakaoSyncDetailsHidden
            updateCardCollapseState(binding.layoutKakaoSyncSettings, binding.btnToggleKakaoSyncDetails, prefs.isKakaoSyncDetailsHidden)
        }
        binding.layoutKakaoSyncHeader.setOnClickListener { toggleKakaoSync() }
        binding.btnToggleKakaoSyncDetails.setOnClickListener { toggleKakaoSync() }

        // 9. 간편 주문서 카드
        val toggleQuoteSync = {
            prefs.isQuoteSyncDetailsHidden = !prefs.isQuoteSyncDetailsHidden
            updateCardCollapseState(binding.layoutQuoteSyncSettings, binding.btnToggleQuoteSyncDetails, prefs.isQuoteSyncDetailsHidden)
        }
        binding.layoutQuoteSyncHeader.setOnClickListener { toggleQuoteSync() }
        binding.btnToggleQuoteSyncDetails.setOnClickListener { toggleQuoteSync() }

        // 10. 부재중 전화 카드
        val toggleMissedCall = {
            prefs.isMissedCallDetailsHidden = !prefs.isMissedCallDetailsHidden
            updateCardCollapseState(binding.layoutMissedCallSettings, binding.btnToggleMissedCallDetails, prefs.isMissedCallDetailsHidden)
        }
        binding.layoutMissedCallHeader.setOnClickListener { toggleMissedCall() }
        binding.btnToggleMissedCallDetails.setOnClickListener { toggleMissedCall() }

        // 11. 모바일 명함 카드
        val toggleCallEndedCard = {
            prefs.isCallEndedCardDetailsHidden = !prefs.isCallEndedCardDetailsHidden
            updateCardCollapseState(binding.layoutCallEndedCardSettings, binding.btnToggleCallEndedCardDetails, prefs.isCallEndedCardDetailsHidden)
        }
        binding.layoutCallEndedCardHeader.setOnClickListener { toggleCallEndedCard() }
        binding.btnToggleCallEndedCardDetails.setOnClickListener { toggleCallEndedCard() }

        // 12. 웹사이트 모니터링 카드
        val toggleWebsiteMonitor = {
            prefs.isWebsiteMonitorDetailsHidden = !prefs.isWebsiteMonitorDetailsHidden
            updateCardCollapseState(binding.layoutWebsiteMonitorSettings, binding.btnToggleWebsiteMonitorDetails, prefs.isWebsiteMonitorDetailsHidden)
        }
        binding.layoutWebsiteMonitorHeader.setOnClickListener { toggleWebsiteMonitor() }
        binding.btnToggleWebsiteMonitorDetails.setOnClickListener { toggleWebsiteMonitor() }
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
            binding.layoutUnpairedControls.visibility = View.GONE
            checkServerAndQueueStatus(showToast = false)
            loadWalletBalance(email)
        } else {
            binding.cardStatus.setBackgroundResource(R.drawable.bg_card_unpaired)
            binding.tvStatusTitle.text = "⚠️ 미연동 상태"
            binding.tvConnectedAccount.text = "연결된 계정: 미연동 (QR 스캔 필요)"
            binding.btnRefreshServerStatus.visibility = View.GONE
            binding.btnToggleStatusDetails.visibility = View.GONE
            binding.layoutUnlinkZone.visibility = View.GONE
            binding.layoutWalletCard.visibility = View.GONE
            binding.layoutUnpairedControls.visibility = View.VISIBLE
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
                    bookmarkSharedUrl(targetUrl, sharedText)
                }
            } else {
                // 2순위: 실제 로컬 파일(content:// 또는 file://) 스트림인 경우 -> 구글 드라이브 파일 업로드
                val fileUri = streamUri ?: clipUri?.takeIf { it.scheme in listOf("content", "file") }
                if (fileUri != null) {
                    uploadFiles(listOf(fileUri), "스마트폰 공유하기(Share) 1초 연동")
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
                uploadFiles(validFileUris, "스마트폰 공유하기(Share) 다중 연동")
            }
        }

        // 인텐트 중복 소비 방지 (소진 처리)
        intent.action = null
        try {
            setIntent(Intent())
        } catch (_: Throwable) {}
    }

    /**
     * 선택되거나 공유된 파일들을 구글 드라이브로 백그라운드 업로드
     */
    private fun uploadFiles(uris: List<Uri>, memo: String) {
        if (!prefs.isPaired) {
            Toast.makeText(this, "⚠️ 시트봇 계정 연동 후 파일을 업로드할 수 있습니다.", Toast.LENGTH_LONG).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        Toast.makeText(this, "🚀 ${uris.size}건의 파일을 구글 드라이브로 업로드합니다...", Toast.LENGTH_SHORT).show()

        activityScope.launch {
            try {
                val results = FileUploadManager.uploadMultipleUris(this@MainActivity, uris, memo)
                binding.progressBar.visibility = View.GONE
                val successCount = results.count { it.success }

                if (successCount > 0) {
                    val targetFolder = prefs.fileUploadDriveFolder.takeIf { it.isNotBlank() } ?: "[SheetBot] 파일 보관함"
                    Toast.makeText(
                        this@MainActivity,
                        "🎉 ${successCount}건의 파일이 구글 드라이브 '${targetFolder}'에 안전하게 업로드되었습니다!",
                        Toast.LENGTH_LONG
                    ).show()

                    for (r in results.filter { it.success }) {
                        val fileName = r.fileName ?: "알 수 없는 파일"
                        val folder = r.folderName ?: targetFolder
                        addLogItem("파일 업로드", "$fileName -> $folder", true)
                    }
                } else {
                    val firstErr = results.firstOrNull()?.error ?: "알 수 없는 오류"
                    Toast.makeText(this@MainActivity, "⚠️ 파일 업로드 실패: $firstErr", Toast.LENGTH_LONG).show()
                    addLogItem("파일 업로드 실패", firstErr, false)
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Toast.makeText(this@MainActivity, "업로드 처리 중 예외 발생: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * 📷 견적 웹앱 및 카카오톡 미리보기용 대표 이미지 로컬 영구 캐시 파일 (v2.1.25)
     */
    private val localQuoteImageFile: File
        get() = File(filesDir, "quote_representative_image.jpg")

    /**
     * 📷 대표 썸네일 이미지 UI 새로고침 (0초 로컬 파일 우선 + 백그라운드 원격 동기화)
     */
    private fun refreshQuoteImageUi() {
        // 1순위: 로컬 저장소에 영구 보존된 사진이 있다면 0.001초 만에 즉시 렌더링 (재부팅/오프라인 무결점)
        val localFile = localQuoteImageFile
        if (localFile.exists() && localFile.length() > 0) {
            try {
                val bmp = BitmapFactory.decodeFile(localFile.absolutePath)
                if (bmp != null) {
                    binding.ivQuoteImagePreview.setImageBitmap(bmp)
                    binding.tvQuoteImageStatus.text = "등록됨 ✓"
                    binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#34D399"))
                    return
                }
            } catch (e: Exception) {
                Log.w("MainActivity", "로컬 대표 이미지 디코딩 실패: ${e.message}")
            }
        }

        // 2순위: 로컬 파일이 없고 원격 URL이 있다면 비동기 다운로드 및 로컬 캐싱
        val remoteUrl = prefs.quoteImageUrl
        if (remoteUrl.isNotBlank() && remoteUrl != "https://sheetbot.cloud/favicon.svg") {
            loadQuoteImageThumbnail(remoteUrl)
        } else {
            binding.tvQuoteImageStatus.text = "미등록 (기본 로고)"
            binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#94A3B8"))
        }
    }

    /**
     * 📷 견적 웹앱 및 카카오톡 미리보기용 대표 이미지 선택 처리 (v2.1.25 무손실 영구 캐시 적용)
     */
    private fun handleQuoteImageSelected(uri: Uri) {
        val email = prefs.userEmail.takeIf { !it.isNullOrBlank() }
            ?: "chachogreat@gmail.com"

        binding.tvQuoteImageStatus.text = "이미지 처리 중..."
        binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#F59E0B"))

        activityScope.launch {
            try {
                // 1. 스마트 다운스케일링 및 고화질 압축 (카카오톡 og:image 최적 규격 max 1200px, JPEG 85%)
                val (compressedBytes, displayBitmap) = withContext(Dispatchers.IO) {
                    compressImageForQuote(uri)
                }

                if (compressedBytes.isEmpty() || displayBitmap == null) {
                    withContext(Dispatchers.Main) {
                        binding.tvQuoteImageStatus.text = "이미지 처리 실패"
                        binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#EF4444"))
                    }
                    return@launch
                }

                // 2. [0초 즉각 렌더링 & 영구 로컬 저장] 업로드를 기다리지 않고 화면에 즉시 띄움!
                withContext(Dispatchers.IO) {
                    try {
                        localQuoteImageFile.writeBytes(compressedBytes)
                    } catch (fe: Exception) {
                        Log.e("MainActivity", "로컬 이미지 파일 저장 실패: ${fe.message}")
                    }
                }

                withContext(Dispatchers.Main) {
                    binding.ivQuoteImagePreview.setImageBitmap(displayBitmap)
                    binding.tvQuoteImageStatus.text = "저장됨 (클라우드 동기화 중...)"
                    binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#F59E0B"))
                }

                // 3. 서버 업로드 및 클라우드 실시간 동기화
                val fileName = "quote_image_" + System.currentTimeMillis() + ".jpg"
                val mimeType = "image/jpeg"

                val result = ApiClient.uploadQuoteImage(compressedBytes, fileName, mimeType, email)
                withContext(Dispatchers.Main) {
                    if (result.success && !result.imageUrl.isNullOrBlank()) {
                        prefs.quoteImageUrl = result.imageUrl
                        binding.tvQuoteImageStatus.text = "등록됨 ✓ (카톡 반영 완료)"
                        binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#34D399"))
                        Toast.makeText(this@MainActivity, "🎉 대표 이미지가 안전하게 저장되고 카카오톡 공유 링크에 반영되었습니다!", Toast.LENGTH_SHORT).show()
                    } else {
                        binding.tvQuoteImageStatus.text = "로컬 저장됨 (동기화 지연)"
                        binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#F59E0B"))
                        Toast.makeText(this@MainActivity, "사진이 기기에 안전하게 저장되었습니다. (네트워크 연결 시 클라우드 자동 동기화)", Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.tvQuoteImageStatus.text = "오류 발생: ${e.message}"
                    binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#EF4444"))
                }
            }
        }
    }

    /**
     * 카카오톡 공유 미리보기 및 웹 최적화를 위한 스마트 다운스케일링 및 JPEG 압축
     */
    private fun compressImageForQuote(uri: Uri): Pair<ByteArray, Bitmap?> {
        try {
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, options)
            }

            val origWidth = options.outWidth
            val origHeight = options.outHeight
            if (origWidth <= 0 || origHeight <= 0) return Pair(ByteArray(0), null)

            val maxDim = 1200 // 카카오톡 및 웹 OpenGraph 최적 규격
            var inSampleSize = 1
            if (origWidth > maxDim || origHeight > maxDim) {
                val halfWidth = origWidth / 2
                val halfHeight = origHeight / 2
                while ((halfWidth / inSampleSize) >= maxDim && (halfHeight / inSampleSize) >= maxDim) {
                    inSampleSize *= 2
                }
            }

            val decodeOptions = BitmapFactory.Options().apply {
                this.inSampleSize = inSampleSize
            }

            val decodedBitmap = contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, decodeOptions)
            } ?: return Pair(ByteArray(0), null)

            // 정밀 스케일링 (1200px 초과 시 비율 유지 축소)
            val currentW = decodedBitmap.width
            val currentH = decodedBitmap.height
            val scaledBitmap = if (currentW > maxDim || currentH > maxDim) {
                val ratio = if (currentW >= currentH) maxDim.toFloat() / currentW else maxDim.toFloat() / currentH
                val targetW = (currentW * ratio).toInt().coerceAtLeast(1)
                val targetH = (currentH * ratio).toInt().coerceAtLeast(1)
                Bitmap.createScaledBitmap(decodedBitmap, targetW, targetH, true)
            } else {
                decodedBitmap
            }

            val baos = java.io.ByteArrayOutputStream()
            scaledBitmap.compress(Bitmap.CompressFormat.JPEG, 85, baos)
            val compressedBytes = baos.toByteArray()

            return Pair(compressedBytes, scaledBitmap)
        } catch (e: Exception) {
            Log.e("MainActivity", "이미지 압축 실패: ${e.message}", e)
            return Pair(ByteArray(0), null)
        }
    }

    /**
     * 대표 썸네일 이미지 비동기 로드, 로컬 영구 파일 저장 및 표시
     */
    private fun loadQuoteImageThumbnail(url: String) {
        if (url.isBlank() || url == "https://sheetbot.cloud/favicon.svg") return
        activityScope.launch(Dispatchers.IO) {
            try {
                val conn = (java.net.URL(url).openConnection() as? java.net.HttpURLConnection) ?: return@launch
                conn.connectTimeout = 10000
                conn.readTimeout = 15000
                conn.instanceFollowRedirects = true
                conn.requestMethod = "GET"

                if (conn.responseCode in 200..299) {
                    val bytes = conn.inputStream.use { it.readBytes() }
                    if (bytes.isNotEmpty()) {
                        try {
                            localQuoteImageFile.writeBytes(bytes)
                        } catch (fe: Exception) {
                            Log.w("MainActivity", "로컬 이미지 캐싱 실패: ${fe.message}")
                        }

                        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        if (bmp != null) {
                            withContext(Dispatchers.Main) {
                                binding.ivQuoteImagePreview.setImageBitmap(bmp)
                                binding.tvQuoteImageStatus.text = "등록됨 ✓"
                                binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#34D399"))
                            }
                        }
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                Log.w("MainActivity", "대표 썸네일 로드 예외: ${e.message}")
            }
        }
    }

    /**
     * 영수증 사진을 전송하여 Gemini AI OCR로 결제 금액/상호명/품목을 분석하고 [SheetBot] 스마트 경비 영수증 대장에 자동 기록
     */
    private fun uploadReceipt(uri: Uri) {
        if (!prefs.isPaired) {
            Toast.makeText(this, "⚠️ 시트봇 계정 연동 후 이용할 수 있습니다.", Toast.LENGTH_LONG).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        Toast.makeText(this, "🧾 영수증을 업로드하고 AI 분석을 시작합니다...", Toast.LENGTH_SHORT).show()

        activityScope.launch {
            try {
                val result = FileUploadManager.uploadOcrReceipt(this@MainActivity, uri)
                binding.progressBar.visibility = View.GONE

                if (result.success) {
                    val ocr = result.ocrData
                    val merchant = ocr?.optString("merchantName", "영수증") ?: "영수증"
                    val rawAmt = ocr?.optString("amount")
                    val amount = if (!rawAmt.isNullOrBlank()) "${rawAmt}원" else ""
                    Toast.makeText(
                        this@MainActivity,
                        "🎉 [영수증 장부화 완료] $merchant $amount\n구글 시트에 자동 기록되었습니다!",
                        Toast.LENGTH_LONG
                    ).show()
                    addLogItem("🧾 영수증 OCR", "$merchant $amount -> 경비 대장", true)
                } else {
                    val err = result.error ?: "영수증 분석 실패"
                    Toast.makeText(this@MainActivity, "⚠️ 영수증 분석 실패: $err", Toast.LENGTH_LONG).show()
                    addLogItem("영수증 오류", err, false)
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Toast.makeText(this@MainActivity, "영수증 처리 예외: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * 명함 사진을 전송하여 Gemini AI OCR로 성함/직함/회사명/전화번호를 분석하고 [SheetBot] 스마트 명함 관리 대장에 자동 기록
     */
    private fun uploadBusinessCard(uri: Uri) {
        if (!prefs.isPaired) {
            Toast.makeText(this, "⚠️ 시트봇 계정 연동 후 이용할 수 있습니다.", Toast.LENGTH_LONG).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        Toast.makeText(this, "🪪 명함을 전송했습니다. 다른 앱을 이용하셔도 AI 분석 완료 시 상단 알림이 뜹니다.", Toast.LENGTH_SHORT).show()

        val appContext = applicationContext
        // 액티비티 생명주기에 종속되지 않는 백그라운드 코루틴 실행 (창 전환 시에도 무중단 완수)
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            try {
                val result = FileUploadManager.uploadOcrBusinessCard(appContext, uri)
                withContext(kotlinx.coroutines.Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                }

                if (result.success) {
                    val ocr = result.ocrData
                    val name = ocr?.optString("name", "명함") ?: "명함"
                    val rawComp = ocr?.optString("company")
                    val comp = if (!rawComp.isNullOrBlank()) "($rawComp)" else ""

                    withContext(kotlinx.coroutines.Dispatchers.Main) {
                        Toast.makeText(
                            appContext,
                            "🎉 [명함 등록 완료] $name $comp\n인맥 관리 대장에 자동 기록되었습니다!",
                            Toast.LENGTH_LONG
                        ).show()
                        addLogItem("🪪 명함 OCR", "$name $comp -> 인맥 대장", true)

                        // 화면에 시트봇 앱이 켜져 있는 상태라면 다이얼로그 즉시 팝업
                        if (ocr != null) {
                            try {
                                CardActionActivity.start(this@MainActivity, ocr)
                            } catch (_: Exception) {}
                        }
                    }
                } else {
                    val err = result.error ?: "명함 분석 실패"
                    withContext(kotlinx.coroutines.Dispatchers.Main) {
                        Toast.makeText(appContext, "⚠️ 명함 분석 실패: $err", Toast.LENGTH_LONG).show()
                        addLogItem("명함 오류", err, false)
                    }
                }
            } catch (e: Exception) {
                withContext(kotlinx.coroutines.Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                    Toast.makeText(appContext, "명함 처리 예외: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * 카카오톡 대화 내용 내보내기(.txt) 파일을 읽어 구글 시트 [SheetBot] 카카오톡 메시지 대장에 구간 덮어쓰기 (v2.1.11)
     */
    private fun importKakaoChatFile(uri: Uri) {
        val email = prefs.userEmail
        if (!prefs.isPaired || email.isNullOrBlank()) {
            Toast.makeText(this, "⚠️ 시트봇 계정 연동 후 이용할 수 있습니다.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        Toast.makeText(this, "💬 카톡 대화 파일을 분석 중입니다...", Toast.LENGTH_SHORT).show()

        activityScope.launch {
            try {
                var fileName = "KakaoTalkChats.txt"
                contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val nameIdx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (nameIdx >= 0 && cursor.moveToFirst()) {
                        fileName = cursor.getString(nameIdx) ?: "KakaoTalkChats.txt"
                    }
                }

                val textContent = withContext(Dispatchers.IO) {
                    contentResolver.openInputStream(uri)?.use { stream ->
                        val bytes = stream.readBytes()
                        try {
                            String(bytes, Charsets.UTF_8)
                        } catch (_: Exception) {
                            String(bytes, java.nio.charset.Charset.forName("EUC-KR"))
                        }
                    } ?: ""
                }

                if (textContent.isBlank()) {
                    binding.progressBar.visibility = View.GONE
                    Toast.makeText(this@MainActivity, "파일 내용이 비어있거나 읽을 수 없습니다.", Toast.LENGTH_LONG).show()
                    return@launch
                }

                val result = ApiClient.importKakaoChat(
                    userEmail = email,
                    textContent = textContent,
                    fileName = fileName,
                    sheetTitle = prefs.kakaoDriveSheetTitle
                )

                binding.progressBar.visibility = View.GONE

                if (result.success) {
                    val countFormatted = NumberFormat.getNumberInstance(Locale.KOREA).format(result.insertedCount)
                    val periodMsg = if (!result.startDate.isNullOrBlank() && !result.endDate.isNullOrBlank()) {
                        "\n• 기간: ${result.startDate} ~ ${result.endDate}"
                    } else ""
                    val roomMsg = if (!result.chatRoomName.isNullOrBlank()) {
                        "• 채팅방: ${result.chatRoomName}\n"
                    } else ""

                    addLogItem("💬 카톡 가져오기", "${result.chatRoomName ?: "채팅방"} ${countFormatted}건 시트 동기화 완료", true)

                    AlertDialog.Builder(this@MainActivity)
                        .setTitle("🎉 카톡 대화 파일 가져오기 완료!")
                        .setMessage("${roomMsg}• 동기화 대화: 총 ${countFormatted}건${periodMsg}\n\n구글 시트 [${prefs.kakaoDriveSheetTitle}]에 구간 덮어쓰기되었습니다.")
                        .setPositiveButton("시트 열기") { _, _ ->
                            showOpenSheetChooserDialog("KAKAO", prefs.kakaoDriveSheetTitle)
                        }
                        .setNegativeButton("닫기", null)
                        .show()
                } else {
                    AlertDialog.Builder(this@MainActivity)
                        .setTitle("가져오기 실패")
                        .setMessage(result.error ?: "카카오톡 대화 내용 인식에 실패했습니다.\n카카오톡 [대화 내용 내보내기]로 생성된 .txt 파일인지 확인해 주세요.")
                        .setPositiveButton("확인", null)
                        .show()
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                android.util.Log.e("MainActivity", "카톡 대화 파일 가져오기 실패: ${e.message}", e)
                Toast.makeText(this@MainActivity, "파일 처리 중 오류: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * 외부 앱에서 공유된 웹 링크 또는 유튜브 링크를 구글 스프레드시트에 자동 스크랩 및 AI 3줄 요약 기록 (v1.6)
     */
    private fun bookmarkSharedUrl(url: String, rawText: String?) {
        if (!prefs.isPaired) {
            Toast.makeText(this, "⚠️ 시트봇 계정 연동 후 링크를 스크랩할 수 있습니다.", Toast.LENGTH_LONG).show()
            return
        }

        if (!prefs.isLinkScrapEnabled) {
            Toast.makeText(this, "⚠️ 웹 링크 & 유튜브 AI 스크랩 기능이 꺼져 있습니다. 앱 설정에서 켜주세요.", Toast.LENGTH_LONG).show()
            return
        }

        val userEmail = prefs.userEmail
        if (userEmail.isNullOrBlank()) {
            Toast.makeText(this, "⚠️ 연동된 계정 이메일이 없습니다.", Toast.LENGTH_LONG).show()
            return
        }

        val isYouTube = url.contains("youtube.com", ignoreCase = true) || url.contains("youtu.be", ignoreCase = true)
        val tagMsg = if (isYouTube) "🔴 유튜브 영상" else "🌐 웹 링크"

        binding.progressBar.visibility = View.VISIBLE
        Toast.makeText(this, "🚀 $tagMsg 정보를 분석하여 구글 시트에 스크랩합니다...", Toast.LENGTH_SHORT).show()

        activityScope.launch {
            try {
                val result = ApiClient.bookmarkLink(
                    userEmail = userEmail,
                    url = url,
                    rawText = rawText,
                    memo = "스마트폰 공유하기(Share) 스크랩"
                )
                binding.progressBar.visibility = View.GONE

                if (result.success) {
                    val title = result.title ?: url
                    val cat = result.category
                    Toast.makeText(
                        this@MainActivity,
                        "🎉 [$cat] $title\n구글 스프레드시트에 안전하게 스크랩되었습니다!",
                        Toast.LENGTH_LONG
                    ).show()

                    addLogItem("링크 스크랩", "$cat $title -> 스크랩 대장", true)

                    if (prefs.isTtsEnabled) {
                        val voiceMsg = if (isYouTube) "유튜브 영상이 스크랩 대장에 기록되었습니다." else "웹사이트 링크가 스크랩 대장에 기록되었습니다."
                        TtsManager.speak(this@MainActivity, voiceMsg)
                    }
                } else {
                    val err = result.error ?: "스크랩 실패"
                    Toast.makeText(this@MainActivity, "⚠️ 링크 스크랩 실패: $err", Toast.LENGTH_LONG).show()
                    addLogItem("스크랩 실패", err, false)
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Toast.makeText(this@MainActivity, "링크 스크랩 예외: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * 구글 음성 인식 다이얼로그 호출 (v1.7)
     */
    private fun startVoiceRecognition() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "구글 시트에 내릴 명령을 말씀해 주세요...\n(예: 홍길동 고객에게 결제 안내 문자 보내줘)")
        }
        try {
            speechRecognizerLauncher.launch(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "음성 인식을 지원하지 않는 기기이거나 권한이 필요합니다.", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 자연어 명령을 시트봇 서버로 전송하여 구글 시트 Apps Script 원격 구동 (v1.7)
     */
    private fun executeAiCommand(command: String) {
        val userEmail = prefs.userEmail
        if (userEmail.isNullOrBlank()) {
            Toast.makeText(this, "⚠️ 연동된 계정 이메일이 없습니다.", Toast.LENGTH_LONG).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        binding.layoutAiCommandResult.visibility = View.GONE
        Toast.makeText(this, "🤖 AI가 시트 명령을 분석하고 원격 실행합니다...", Toast.LENGTH_SHORT).show()

        activityScope.launch {
            try {
                val res = ApiClient.executeAiCommand(
                    userEmail = userEmail,
                    command = command
                )
                binding.progressBar.visibility = View.GONE

                if (res.success) {
                    binding.layoutAiCommandResult.visibility = View.VISIBLE
                    binding.tvAiCommandExplanation.text = "✅ ${res.explanation}"
                    binding.tvAiCommandSpoken.text = "🗣️ ${res.spokenResult}"

                    Toast.makeText(
                        this@MainActivity,
                        "🎉 [시트 실행 완료]\n${res.explanation}",
                        Toast.LENGTH_LONG
                    ).show()

                    addLogItem("AI 시트실행", "${res.actionType}: ${res.explanation}", true)

                    if (prefs.isTtsEnabled) {
                        TtsManager.speak(this@MainActivity, res.spokenResult ?: "명령 처리가 완료되었습니다.")
                    }
                } else {
                    val err = res.error ?: "명령 실행 실패"
                    Toast.makeText(this@MainActivity, "⚠️ 시트 명령 실행 실패: $err", Toast.LENGTH_LONG).show()
                    addLogItem("시트실행 실패", err, false)
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Toast.makeText(this@MainActivity, "명령 실행 예외: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * 통화 종료 모바일 명함 발송용 첨부 이미지(MMS) 로컬 저장
     */
    private fun saveBusinessCardImage(uri: Uri) {
        try {
            val targetFile = File(filesDir, "business_card_image.jpg")
            contentResolver.openInputStream(uri)?.use { input ->
                targetFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
            prefs.businessCardImagePath = targetFile.absolutePath
            prefs.businessCardSendMode = "MMS_IMAGE"
            refreshBusinessCardUi()
            Toast.makeText(this, "🖼️ 명함/포스터 이미지가 등록되었습니다. (방안 2로 자동 전환)", Toast.LENGTH_SHORT).show()
            addLogItem("명함이미지", "이미지 등록 완료 (${targetFile.length() / 1024} KB)", true)
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "명함 이미지 저장 실패", e)
            Toast.makeText(this, "이미지 저장에 실패했습니다: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 등록된 모바일 명함 첨부 이미지 삭제
     */
    private fun removeBusinessCardImage() {
        try {
            val imagePath = prefs.businessCardImagePath
            if (imagePath.isNotBlank()) {
                val file = File(imagePath)
                if (file.exists()) {
                    file.delete()
                }
            }
            prefs.businessCardImagePath = ""
            refreshBusinessCardUi()
            Toast.makeText(this, "🗑️ 등록된 이미지가 삭제되었습니다.", Toast.LENGTH_SHORT).show()
            addLogItem("명함이미지", "이미지 삭제 완료", true)
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "이미지 삭제 실패", e)
        }
    }

    /**
     * 통화 종료 모바일 명함 발송 UI 상태 실시간 동기화 (방안 1 vs 방안 2 및 이미지 미리보기)
     */
    private fun refreshBusinessCardUi() {
        val isWebLinkMode = prefs.businessCardSendMode == "WEB_LINK"
        binding.rgBusinessCardMode.setOnCheckedChangeListener(null)
        if (isWebLinkMode) {
            binding.rgBusinessCardMode.check(binding.rbModeWebLink.id)
            binding.layoutModeWebLink.visibility = View.VISIBLE
            binding.layoutModeMmsImage.visibility = View.GONE
        } else {
            binding.rgBusinessCardMode.check(binding.rbModeMmsImage.id)
            binding.layoutModeWebLink.visibility = View.GONE
            binding.layoutModeMmsImage.visibility = View.VISIBLE
        }
        binding.rgBusinessCardMode.setOnCheckedChangeListener { _, checkedId ->
            val isWeb = checkedId == binding.rbModeWebLink.id
            binding.layoutModeWebLink.visibility = if (isWeb) View.VISIBLE else View.GONE
            binding.layoutModeMmsImage.visibility = if (isWeb) View.GONE else View.VISIBLE
            prefs.businessCardSendMode = if (isWeb) "WEB_LINK" else "MMS_IMAGE"
        }
        renderBusinessCardImagePreview()
    }

    /**
     * 등록된 명함 이미지 미리보기 UI 렌더링
     */
    private fun renderBusinessCardImagePreview() {
        val imagePath = prefs.businessCardImagePath
        if (imagePath.isNotBlank()) {
            val file = File(imagePath)
            if (file.exists() && file.length() > 0) {
                try {
                    val bitmap = BitmapFactory.decodeFile(file.absolutePath)
                    if (bitmap != null) {
                        binding.ivBusinessCardPreview.setImageBitmap(bitmap)
                        binding.tvImageFileName.text = "${file.name} (${file.length() / 1024} KB)"
                        binding.layoutImagePreview.visibility = View.VISIBLE
                        binding.btnRemoveBusinessCardImage.visibility = View.VISIBLE
                        return
                    }
                } catch (e: Exception) {
                    android.util.Log.e("MainActivity", "이미지 디코딩 오류", e)
                }
            }
        }
        binding.layoutImagePreview.visibility = View.GONE
        binding.btnRemoveBusinessCardImage.visibility = View.GONE
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
            "📊 구글 스프레드시트 원본 열기",
            "🌐 모바일 스마트 웹앱 열기 (모바일 최적화)"
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
     * 🎙️ 통화 녹음 감지 대상 어플 / 폴더 뱃지 갱신 (v2.1.26)
     */
    private fun updateRecordingSourceFolderBadge() {
        val custom = prefs.callRecordingCustomFolder.trim()
        if (custom.isBlank()) {
            binding.tvRecordingSourceFolderBadge.text = "✨ 자동 감지 (에이닷, T전화, 갤럭시, 전체)"
            binding.tvRecordingSourceFolderBadge.setTextColor(Color.parseColor("#38BDF8"))
        } else {
            val shortName = try {
                File(custom).name.takeIf { it.isNotBlank() } ?: custom
            } catch (_: Exception) { custom }
            binding.tvRecordingSourceFolderBadge.text = "📁 $shortName (선택됨)"
            binding.tvRecordingSourceFolderBadge.setTextColor(Color.parseColor("#34D399"))
        }
    }

    /**
     * 🎙️ 통화 녹음 감지 대상 어플 / 폴더 선택 다이얼로그 (v2.1.26)
     */
    private fun showRecordingFolderChooserDialog() {
        val options = arrayOf(
            "✨ 전체 자동 감지 (권장: 에이닷, T전화, 갤럭시, 전체 동시 탐색)",
            "🔵 SKT 에이닷 (A.) 전용 (Recordings/TPhoneCallRecords)",
            "🟢 SKT / 일반 T전화 (Recordings/TPhone)",
            "⚪ 삼성 갤럭시 기본 전화 (Recordings/Call)",
            "✏️ 폴더 경로 직접 입력 (기타 녹음 어플 / SD카드)"
        )

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("🎙️ 통화 녹음 감지 어플 / 폴더 설정")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> {
                        prefs.callRecordingCustomFolder = ""
                        updateRecordingSourceFolderBadge()
                        Toast.makeText(this, "✨ 모든 통화 녹음 앱 자동 감지로 설정되었습니다.", Toast.LENGTH_SHORT).show()
                    }
                    1 -> {
                        val path = File(Environment.getExternalStorageDirectory(), "Recordings/TPhoneCallRecords").absolutePath
                        prefs.callRecordingCustomFolder = path
                        updateRecordingSourceFolderBadge()
                        Toast.makeText(this, "🔵 에이닷(A.) 녹음 폴더가 지정되었습니다.", Toast.LENGTH_SHORT).show()
                    }
                    2 -> {
                        val path = File(Environment.getExternalStorageDirectory(), "Recordings/TPhone").absolutePath
                        prefs.callRecordingCustomFolder = path
                        updateRecordingSourceFolderBadge()
                        Toast.makeText(this, "🟢 T전화 녹음 폴더가 지정되었습니다.", Toast.LENGTH_SHORT).show()
                    }
                    3 -> {
                        val path = File(Environment.getExternalStorageDirectory(), "Recordings/Call").absolutePath
                        prefs.callRecordingCustomFolder = path
                        updateRecordingSourceFolderBadge()
                        Toast.makeText(this, "⚪ 삼성 갤럭시 기본 전화 녹음 폴더가 지정되었습니다.", Toast.LENGTH_SHORT).show()
                    }
                    4 -> {
                        showCustomFolderInputDialog()
                    }
                }
            }
            .setNegativeButton("닫기", null)
            .show()
    }

    /**
     * 기타 녹음 앱 커스텀 폴더 직접 입력 모달
     */
    private fun showCustomFolderInputDialog() {
        val input = EditText(this).apply {
            hint = "예: /storage/emulated/0/Recordings/폴더명"
            setText(prefs.callRecordingCustomFolder)
            setSelection(text.length)
        }

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("📁 녹음 저장 폴더 경로 입력")
            .setMessage("사용 중이신 통화 녹음 어플의 저장 폴더 절대 경로를 입력해 주세요.")
            .setView(input)
            .setPositiveButton("저장") { _, _ ->
                val entered = input.text.toString().trim()
                prefs.callRecordingCustomFolder = entered
                updateRecordingSourceFolderBadge()
                Toast.makeText(this, "녹음 폴더 경로가 저장되었습니다.", Toast.LENGTH_SHORT).show()
            }
            .setNeutralButton("자동 감지로 리셋") { _, _ ->
                prefs.callRecordingCustomFolder = ""
                updateRecordingSourceFolderBadge()
                Toast.makeText(this, "✨ 전체 자동 감지로 복원되었습니다.", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("취소", null)
            .show()
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
    // ==========================================
    private fun setupWebsiteMonitorUI() {
        binding.switchWebsiteMonitor.isChecked = prefs.isWebsiteMonitorEnabled
        binding.etTargetWebsiteUrl.setText(prefs.targetWebsiteUrl)
        binding.cbWebsiteEmergencyAlarm.isChecked = prefs.isWebsiteEmergencyAlarmEnabled
        updateWebsiteMonitorStatusText()

        binding.switchWebsiteMonitor.setOnCheckedChangeListener { _, isChecked ->
            prefs.isWebsiteMonitorEnabled = isChecked
            prefs.isWebsiteMonitorDetailsHidden = !isChecked
            updateCardCollapseState(binding.layoutWebsiteMonitorSettings, binding.btnToggleWebsiteMonitorDetails, !isChecked)
            val msg = if (isChecked) "내 웹사이트 실시간 접속 장애 감시가 켜졌습니다." else "웹사이트 접속 장애 감시가 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            updateWebsiteMonitorStatusText()

            if (isChecked) {
                provisionSheetAsync("WEBSITE_MONITOR", "[SheetBot] 웹사이트 모니터링 & 장애 대장")
                if (prefs.targetWebsiteUrl.isNotBlank()) {
                    checkWebsiteHealthImmediate()
                }
            }
        }

        binding.btnOpenWebsiteMonitorSheet.setOnClickListener {
            showOpenSheetChooserDialog("WEBSITE_MONITOR", "[SheetBot] 웹사이트 모니터링 & 장애 대장")
        }

        binding.etTargetWebsiteUrl.doAfterTextChanged {
            val url = it?.toString()?.trim() ?: ""
            prefs.targetWebsiteUrl = url
            updateWebsiteMonitorStatusText()
        }

        binding.cbWebsiteEmergencyAlarm.setOnCheckedChangeListener { _, isChecked ->
            prefs.isWebsiteEmergencyAlarmEnabled = isChecked
        }

        binding.btnCheckWebsiteNow.setOnClickListener {
            checkWebsiteHealthImmediate()
        }
    }

    private fun updateWebsiteMonitorStatusText() {
        try {
            if (!::binding.isInitialized) return
            if (!prefs.isWebsiteMonitorEnabled) {
                binding.tvWebsiteMonitorStatus.text = "상태: 감시 꺼짐 (스위치를 켜면 활성화됩니다)"
                binding.tvWebsiteMonitorStatus.setTextColor(android.graphics.Color.parseColor("#94A3B8"))
                return
            }

            val url = prefs.targetWebsiteUrl
            if (url.isBlank()) {
                binding.tvWebsiteMonitorStatus.text = "상태: URL 미등록 (감시할 웹사이트 주소를 입력하세요)"
                binding.tvWebsiteMonitorStatus.setTextColor(android.graphics.Color.parseColor("#FBBF24"))
                return
            }

            val lastStatus = prefs.lastWebsiteCheckStatus
            val lastCode = prefs.lastWebsiteCheckStatusCode
            val lastTime = prefs.lastWebsiteCheckTime

            val timeStr = if (lastTime > 0) {
                val sdf = SimpleDateFormat("HH:mm:ss", Locale.KOREA)
                " (최근 점검: ${sdf.format(Date(lastTime))})"
            } else ""

            if (lastCode in 200..399 || lastStatus.contains("정상")) {
                binding.tvWebsiteMonitorStatus.text = "🟢 $lastStatus$timeStr"
                binding.tvWebsiteMonitorStatus.setTextColor(android.graphics.Color.parseColor("#34D399"))
            } else if (lastStatus == "미설정") {
                binding.tvWebsiteMonitorStatus.text = "🟡 3분 주기 감시 대기 중$timeStr"
                binding.tvWebsiteMonitorStatus.setTextColor(android.graphics.Color.parseColor("#FBBF24"))
            } else {
                binding.tvWebsiteMonitorStatus.text = "🔴 $lastStatus$timeStr"
                binding.tvWebsiteMonitorStatus.setTextColor(android.graphics.Color.parseColor("#F87171"))
            }
        } catch (e: Throwable) {
            android.util.Log.w("MainActivity", "updateWebsiteMonitorStatusText 방어: ${e.message}")
        }
    }

    private fun checkWebsiteHealthImmediate() {
        val url = prefs.targetWebsiteUrl.trim()
        if (url.isBlank()) {
            Toast.makeText(this, "점검할 웹사이트 URL을 먼저 입력해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.btnCheckWebsiteNow.isEnabled = false
        binding.btnCheckWebsiteNow.text = "점검 중..."
        binding.tvWebsiteMonitorStatus.text = "🔄 실시간 응답 점검 중..."
        binding.tvWebsiteMonitorStatus.setTextColor(android.graphics.Color.parseColor("#38BDF8"))

        activityScope.launch {
            val result = ApiClient.checkWebsiteHealth(url)
            binding.btnCheckWebsiteNow.isEnabled = true
            binding.btnCheckWebsiteNow.text = "⚡ 지금 점검"

            prefs.lastWebsiteCheckStatusCode = result.statusCode
            prefs.lastWebsiteCheckTime = System.currentTimeMillis()

            if (result.isOnline) {
                prefs.lastWebsiteCheckStatus = "정상 응답 (HTTP ${result.statusCode}, ${result.responseTimeMs}ms)"
                Toast.makeText(this@MainActivity, "🎉 [정상 응답] ${result.checkedUrl} (${result.responseTimeMs}ms)", Toast.LENGTH_SHORT).show()
            } else {
                val isNetOk = ApiClient.verifyInternetConnectivity()
                val errText = if (isNetOk) {
                    "사이트 접속 불가 (${result.errorMessage ?: "HTTP " + result.statusCode})"
                } else {
                    "스마트폰 인터넷 연결 불안정"
                }
                prefs.lastWebsiteCheckStatus = errText
                Toast.makeText(this@MainActivity, "⚠️ [접속 실패] $errText", Toast.LENGTH_LONG).show()
            }
            updateWebsiteMonitorStatusText()
        }
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
                    binding.btnSyncRecordingsNow.text = "⚡ 지금 새 녹음 파일 즉시 동기화"
                    Toast.makeText(this@MainActivity, "동기화 중 오류가 발생했습니다: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /**
     * 🧪 영수증 문자 발송 즉시 테스트 및 권한/시트/단말기 발송 상태 실시간 진단 다이얼로그
     */
    private fun showReceiptSmsTestDialog() {
        val hasSendSmsPerm = androidx.core.content.ContextCompat.checkSelfPermission(
            this, android.Manifest.permission.SEND_SMS
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED

        val dialogView = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(40, 30, 40, 20)
            setBackgroundColor(android.graphics.Color.parseColor("#1E293B"))
        }

        // 권한 상태 뱃지
        val tvPermStatus = android.widget.TextView(this).apply {
            text = if (hasSendSmsPerm) "✅ [정상] 스마트폰 SMS 전송 권한 허용됨" else "⚠️ [경고] SMS 전송 권한 미허용 상태입니다!\n(아래 테스트 발송 시 권한 허용 팝업이 뜹니다)"
            setTextColor(if (hasSendSmsPerm) android.graphics.Color.parseColor("#34D399") else android.graphics.Color.parseColor("#F87171"))
            textSize = 12f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setPadding(0, 0, 0, 16)
        }
        dialogView.addView(tvPermStatus)

        // 수신 전화번호 입력란
        val tvPhoneLabel = android.widget.TextView(this).apply {
            text = "📱 테스트 수신 휴대폰 번호:"
            setTextColor(android.graphics.Color.parseColor("#E2E8F0"))
            textSize = 12f
        }
        dialogView.addView(tvPhoneLabel)

        val etPhone = android.widget.EditText(this).apply {
            setText("010-7523-5071")
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(android.graphics.Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            textSize = 13f
            inputType = android.text.InputType.TYPE_CLASS_PHONE
        }
        dialogView.addView(etPhone)

        // 고객명 & 금액
        val tvCustLabel = android.widget.TextView(this).apply {
            text = "👤 고객명 / 💰 금액(원):"
            setTextColor(android.graphics.Color.parseColor("#E2E8F0"))
            textSize = 12f
            setPadding(0, 16, 0, 4)
        }
        dialogView.addView(tvCustLabel)

        val rowLayout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
        }
        val etCustName = android.widget.EditText(this).apply {
            layoutParams = android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = 8
            }
            setText("차민서")
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(android.graphics.Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            textSize = 13f
        }
        val etAmount = android.widget.EditText(this).apply {
            layoutParams = android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setText("777")
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(android.graphics.Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            textSize = 13f
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
        }
        rowLayout.addView(etCustName)
        rowLayout.addView(etAmount)
        dialogView.addView(rowLayout)

        // 실시간 미리보기 텍스트
        val tvPreview = android.widget.TextView(this).apply {
            setTextColor(android.graphics.Color.parseColor("#94A3B8"))
            textSize = 11f
            setPadding(0, 16, 0, 8)
        }
        dialogView.addView(tvPreview)

        fun updatePreview() {
            val name = etCustName.text.toString().trim().ifBlank { "고객" }
            val amt = etAmount.text.toString().trim().toLongOrNull() ?: 0L
            val tpl = prefs.receiptSmsTemplate.takeIf { it.isNotBlank() }
                ?: "[SheetBot] {고객명}님, {금액} 결제가 정상 확인되었습니다. 이용해 주셔서 감사합니다."
            val rawMsg = SmsSenderUtil.formatReceiptMessage(tpl, name, amt)
            val trimmedMsg = SmsSenderUtil.trimToSmsSafeBytes(rawMsg, 80)
            val bytes = try { trimmedMsg.toByteArray(java.nio.charset.Charset.forName("EUC-KR")).size } catch (_: Exception) { trimmedMsg.length * 2 }
            tvPreview.text = "✉️ 발송 문구 미리보기 (${bytes}B / 80B):\n\"$trimmedMsg\""
        }
        updatePreview()

        val watcher = object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) { updatePreview() }
        }
        etCustName.addTextChangedListener(watcher)
        etAmount.addTextChangedListener(watcher)

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("🧪 영수증 문자 발송 테스트")
            .setView(dialogView)
            .setPositiveButton("🚀 테스트 발송", null)
            .setNegativeButton("닫기", null)
            .create()

        dialog.show()

        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            // 권한 체크 및 필요 시 즉시 요청
            if (androidx.core.content.ContextCompat.checkSelfPermission(this, android.Manifest.permission.SEND_SMS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                androidx.core.app.ActivityCompat.requestPermissions(
                    this, arrayOf(android.Manifest.permission.SEND_SMS), 1088
                )
                Toast.makeText(this, "SMS 발송 권한이 필요합니다. 팝업에서 [허용]을 눌러주세요.", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            val phone = etPhone.text.toString().trim()
            val name = etCustName.text.toString().trim().ifBlank { "고객" }
            val amt = etAmount.text.toString().trim().toLongOrNull() ?: 0L

            if (phone.isBlank()) {
                Toast.makeText(this, "수신자 번호를 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val tpl = prefs.receiptSmsTemplate.takeIf { it.isNotBlank() }
                ?: "[SheetBot] {고객명}님, {금액} 결제가 정상 확인되었습니다. 이용해 주셔서 감사합니다."
            val rawMsg = SmsSenderUtil.formatReceiptMessage(tpl, name, amt)

            // 백그라운드 발송 및 대장 동기화
            activityScope.launch(Dispatchers.IO) {
                val (isSent, finalMsg) = SmsSenderUtil.sendSmsDetailed(this@MainActivity, phone, rawMsg)
                val statusLabel = if (isSent) "전송 완료" else "전송 실패"

                // 대장 기록
                val userEmail = prefs.userEmail
                var sheetSyncOk = false
                if (!userEmail.isNullOrBlank()) {
                    sheetSyncOk = ApiClient.sendReceiptSmsSync(
                        userEmail = userEmail,
                        recipientPhone = phone,
                        customerName = name,
                        amount = amt,
                        receiptContent = finalMsg,
                        status = statusLabel
                    )
                }

                withContext(Dispatchers.Main) {
                    val bytes = try { finalMsg.toByteArray(java.nio.charset.Charset.forName("EUC-KR")).size } catch (_: Exception) { finalMsg.length * 2 }
                    val resultTitle = if (isSent) "🎉 [영수증 발송 성공]" else "❌ [영수증 발송 실패]"
                    val resultMsg = """
                        발송 결과: $statusLabel
                        수신 번호: $phone
                        고객명 / 금액: $name / ${amt}원
                        문자 길이: ${finalMsg.length}자 ($bytes 바이트 / 80B 이하)
                        
                        발송 전문:
                        "$finalMsg"
                        
                        📊 구글 시트 대장 기록: ${if (sheetSyncOk) "✅ 성공" else "⚠️ 시트 확인 필요"}
                        📁 단말기 보낸 문자함 저장: ${if (isSent) "✅ 완료" else "❌ 실패"}
                    """.trimIndent()

                    androidx.appcompat.app.AlertDialog.Builder(this@MainActivity)
                        .setTitle(resultTitle)
                        .setMessage(resultMsg)
                        .setPositiveButton("확인", null)
                        .show()
                }
            }
            dialog.dismiss()
        }
    }

    /**
     * 🔍 영수증 발송 조건 5단계 종합 진단 및 가상 입금 테스트 도구 (v2.1.49)
     * 실제 은행 송금 없이 가상 카카오뱅크 입금 문자를 발생시켜
     * 1) 단말기 권한, 2) 앱 설정, 3) 구글 시트 주문접수대장 매칭, 4) 80B 규격, 5) 영수증 발송/대장 기록까지 원스톱 진단
     */
    private fun showReceiptConditionDiagnosisDialog() {
        val dialogView = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(40, 30, 40, 20)
            setBackgroundColor(android.graphics.Color.parseColor("#1E293B"))
        }

        val tvDesc = android.widget.TextView(this).apply {
            text = "실제 은행 송금 없이 가상 입금 문자를 발생시켜 구글 시트 [주문접수대장] 실시간 매칭부터 영수증 발송까지 전 과정을 1초 만에 종합 진단합니다."
            setTextColor(android.graphics.Color.parseColor("#94A3B8"))
            textSize = 12f
            setPadding(0, 0, 0, 16)
        }
        dialogView.addView(tvDesc)

        // 고객명 & 금액 입력
        val tvCustLabel = android.widget.TextView(this).apply {
            text = "👤 진단 대상 고객명 / 💰 결제 금액(원):"
            setTextColor(android.graphics.Color.parseColor("#E2E8F0"))
            textSize = 12f
            setPadding(0, 8, 0, 4)
        }
        dialogView.addView(tvCustLabel)

        val rowLayout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
        }
        val etCustName = android.widget.EditText(this).apply {
            layoutParams = android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = 8
            }
            setText("차민서")
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(android.graphics.Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            textSize = 13f
        }
        val etAmount = android.widget.EditText(this).apply {
            layoutParams = android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setText("444")
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(android.graphics.Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            textSize = 13f
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
        }
        rowLayout.addView(etCustName)
        rowLayout.addView(etAmount)
        dialogView.addView(rowLayout)

        // 실제 문자 발송 여부 체크박스
        val cbSendRealSms = android.widget.CheckBox(this).apply {
            text = "매칭 성공 시 고객 번호로 실제 SMS 영수증 발송 & 대장 기록"
            isChecked = true
            setTextColor(android.graphics.Color.parseColor("#38BDF8"))
            textSize = 12f
            setPadding(0, 16, 0, 8)
        }
        dialogView.addView(cbSendRealSms)

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("🔍 영수증 발송 조건 5단계 종합 진단")
            .setView(dialogView)
            .setPositiveButton("🚀 종합 진단 시작", null)
            .setNegativeButton("닫기", null)
            .create()

        dialog.show()

        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val name = etCustName.text.toString().trim().ifBlank { "차민서" }
            val amt = etAmount.text.toString().trim().toLongOrNull() ?: 444L
            val willSendRealSms = cbSendRealSms.isChecked
            val userEmail = prefs.userEmail

            if (userEmail.isNullOrBlank()) {
                Toast.makeText(this, "계정이 연동되어 있지 않습니다.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            dialog.dismiss()

            // 로딩 안내 토스트
            Toast.makeText(this, "🔍 [1/5] 영수증 발송 조건 종합 진단을 시작합니다...", Toast.LENGTH_SHORT).show()

            activityScope.launch(Dispatchers.IO) {
                val reportLines = mutableListOf<String>()

                // 1단계: SMS 발송 권한 검사
                val hasSmsPermission = androidx.core.content.ContextCompat.checkSelfPermission(
                    this@MainActivity, android.Manifest.permission.SEND_SMS
                ) == android.content.pm.PackageManager.PERMISSION_GRANTED

                if (hasSmsPermission) {
                    reportLines.add("✅ [1단계: 단말기 발송 권한] 승인됨 (SEND_SMS 허용)")
                } else {
                    reportLines.add("❌ [1단계: 단말기 발송 권한] 미승인! (SMS 발송 권한 필요)")
                }

                // 2단계: 앱 설정 활성화 검사
                val isReceiptEnabled = prefs.isReceiptSmsEnabled
                if (isReceiptEnabled) {
                    reportLines.add("✅ [2단계: 영수증 자동 회신] ON (활성화됨)")
                } else {
                    reportLines.add("⚠️ [2단계: 영수증 자동 회신] OFF (설정에서 켜주세요)")
                }

                // 3단계: 가상 카카오뱅크 입금 문자 생성
                val nowStr = java.text.SimpleDateFormat("MM/dd HH:mm:ss", java.util.Locale.KOREA).format(java.util.Date())
                val virtualSms = """
                    [Web발신]
                    [카카오뱅크]
                    차*석(5965)
                    $nowStr
                    입금 ${amt}원
                    $name
                    잔액 10,000원
                """.trimIndent()
                reportLines.add("✅ [3단계: 가상 입금 문자 생성] '$name / ${amt}원' 시뮬레이션 완료")

                // 4단계: 서버 구글 시트 주문접수대장 실시간 매칭 검증
                var matchSuccess = false
                var matchedPhone: String? = null
                var matchedCustName: String? = null
                var matchedAmt: Long = 0L
                var serverReplyText: String? = null

                try {
                    var syncResult = if (prefs.isSmsSheetSyncEnabled) {
                        ApiClient.sendSmsSync(
                            userEmail = userEmail,
                            direction = "INBOUND",
                            phoneNumber = "1599-3333",
                            contactName = "카카오뱅크",
                            message = virtualSms,
                            sheetTitle = prefs.smsDriveSheetTitle
                        )
                    } else {
                        ApiClient.sendInboundSms(
                            userEmail = userEmail,
                            sender = "1599-3333",
                            message = virtualSms
                        )
                    }

                    // 1차 응답에서 매칭 정보가 비어있을 경우 2차 대체 엔드포인트로 즉시 보강 시도
                    if (syncResult.replySmsPhone.isNullOrBlank()) {
                        syncResult = if (prefs.isSmsSheetSyncEnabled) {
                            ApiClient.sendInboundSms(
                                userEmail = userEmail,
                                sender = "1599-3333",
                                message = virtualSms
                            )
                        } else {
                            ApiClient.sendSmsSync(
                                userEmail = userEmail,
                                direction = "INBOUND",
                                phoneNumber = "1599-3333",
                                contactName = "카카오뱅크",
                                message = virtualSms,
                                sheetTitle = prefs.smsDriveSheetTitle
                            )
                        }
                    }

                    if (!syncResult.replySmsPhone.isNullOrBlank()) {
                        matchSuccess = true
                        matchedPhone = syncResult.replySmsPhone
                        matchedCustName = syncResult.depositorName ?: name
                        matchedAmt = syncResult.amountKrw.takeIf { it > 0 } ?: amt
                        serverReplyText = syncResult.replySmsText

                        reportLines.add("✅ [4단계: 주문접수대장 매칭] 성공! 🎉")
                        reportLines.add("   • 고객 연락처: $matchedPhone")
                        reportLines.add("   • 매칭 고객/금액: $matchedCustName / ${matchedAmt}원")
                    } else {
                        reportLines.add("❌ [4단계: 주문접수대장 매칭] 실패 ⚠️")
                        reportLines.add("   • 원인: [주문접수대장]에 '$name / ${amt}원' 일치 주문이 없거나 이미 결제완료 상태입니다.")
                    }
                } catch (e: Exception) {
                    reportLines.add("❌ [4단계: 서버 통신 예외] ${e.localizedMessage}")
                }

                // 5단계: 80B 규격 검증 및 실제 발송 (매칭 성공 시)
                if (matchSuccess && !matchedPhone.isNullOrBlank()) {
                    val tpl = prefs.receiptSmsTemplate.takeIf { it.isNotBlank() }
                        ?: (serverReplyText?.takeIf { it.isNotBlank() }
                            ?: "[SheetBot] {고객명}님, {금액} 결제가 정상 확인되었습니다. 이용해 주셔서 감사합니다.")

                    val msgToSend = SmsSenderUtil.formatReceiptMessage(tpl, matchedCustName ?: name, matchedAmt)
                    val trimmedMsg = SmsSenderUtil.trimToSmsSafeBytes(msgToSend, 80)
                    val bytes = try { trimmedMsg.toByteArray(java.nio.charset.Charset.forName("EUC-KR")).size } catch (_: Exception) { trimmedMsg.length * 2 }

                    reportLines.add("✅ [5단계: 80B 단문 규격 검증] ${trimmedMsg.length}자 ($bytes 바이트 / 80B 이하)")
                    reportLines.add("   • 발송 전문: \"$trimmedMsg\"")

                    if (willSendRealSms) {
                        if (hasSmsPermission) {
                            val (isSent, finalMsg) = SmsSenderUtil.sendSmsDetailed(this@MainActivity, matchedPhone, trimmedMsg)
                            val statusLabel = if (isSent) "전송 완료" else "전송 실패"
                            val sheetSyncOk = ApiClient.sendReceiptSmsSync(
                                userEmail = userEmail,
                                recipientPhone = matchedPhone,
                                customerName = matchedCustName ?: name,
                                amount = matchedAmt,
                                receiptContent = finalMsg,
                                status = statusLabel
                            )

                            if (isSent) {
                                reportLines.add("🎉 [최종 결과] 고객 번호($matchedPhone)로 실제 SMS 발송 성공!")
                                reportLines.add("   • 📊 고객 영수증 발송 대장 기록: ${if (sheetSyncOk) "✅ 성공" else "⚠️ 시트 확인 필요"}")
                                reportLines.add("   • 📁 단말기 보낸 문자함 저장: ✅ 완료")
                            } else {
                                reportLines.add("❌ [최종 결과] 단말기 SMS 발송 실패 (통신사 모뎀 응답 확인 필요)")
                            }
                        } else {
                            reportLines.add("⚠️ [최종 결과] SMS 발송 권한이 없어 실제 발송을 건너뛰었습니다.")
                        }
                    } else {
                        reportLines.add("ℹ️ [최종 결과] '실제 발송' 체크 해제로 모의 진단만 완료했습니다.")
                    }
                } else {
                    reportLines.add("⚠️ [최종 결과] 주문 매칭이 되지 않아 영수증 문자가 발송되지 않았습니다.")
                }

                // UI 다이얼로그로 종합 리포트 표시
                withContext(Dispatchers.Main) {
                    val reportTitle = if (matchSuccess) "🎉 [영수증 발송 조건 종합 진단: 정상]" else "⚠️ [영수증 발송 조건 종합 진단: 확인 필요]"
                    androidx.appcompat.app.AlertDialog.Builder(this@MainActivity)
                        .setTitle(reportTitle)
                        .setMessage(reportLines.joinToString("\n\n"))
                        .setPositiveButton("확인", null)
                        .show()
                }
            }
        }
    }
}
