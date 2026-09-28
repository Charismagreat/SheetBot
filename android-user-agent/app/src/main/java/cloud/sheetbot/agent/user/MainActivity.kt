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
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.ContactsContract
import android.provider.Settings
import android.speech.RecognizerIntent
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
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
    private val activityScope = CoroutineScope(Dispatchers.Main)
    private var aodJob: Job? = null
    private var serverMonitorJob: Job? = null
    private lateinit var aodGestureDetector: GestureDetector
    private var smsSentObserver: SmsSentObserver? = null

    // 입금 감지 시 실시간 화면 갱신 리시버
    private val depositUpdateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val body = intent?.getStringExtra("smsBody") ?: ""
            val sender = intent?.getStringExtra("sender") ?: ""
            val success = intent?.getBooleanExtra("success", false) ?: false
            addLogItem(sender, body, success)
            updateUiState()
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
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

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
                SmsSentObserver.SENT_SMS_URI,
                true,
                smsSentObserver!!
            )
        } catch (e: Exception) {
            android.util.Log.w("MainActivity", "SmsSentObserver 등록 실패: ${e.message}")
        }

        // 실시간 고객 SMS 수신 및 입금 감지 브로드캐스트 리시버 등록
        val filter = IntentFilter().apply {
            addAction(SmsReceiver.ACTION_SMS_RECEIVED)
            addAction(SmsReceiver.ACTION_DEPOSIT_DETECTED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(depositUpdateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(depositUpdateReceiver, filter)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleSharedIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        checkNotificationListenerPermission()
        checkAndRequestBatteryOptimization()
        startServerMonitorLoop()
        preloadActiveSheetUrls()
        updateWebsiteMonitorStatusText()
    }

    override fun onPause() {
        super.onPause()
        serverMonitorJob?.cancel()
    }

    override fun onDestroy() {
        super.onDestroy()
        aodJob?.cancel()
        serverMonitorJob?.cancel()
        try {
            smsSentObserver?.let { contentResolver.unregisterContentObserver(it) }
        } catch (_: Exception) {}
        try {
            unregisterReceiver(depositUpdateReceiver)
        } catch (_: Exception) {}
    }

    private fun setupListeners() {
        // 0-0. 프라이버시 안심 보증 카드 '접기/펼치기' 토글
        updatePrivacyCardVisibility(prefs.isPrivacyCardHidden)
        binding.btnTogglePrivacy.setOnClickListener {
            val nextState = !prefs.isPrivacyCardHidden
            prefs.isPrivacyCardHidden = nextState
            updatePrivacyCardVisibility(nextState)
        }

        // 0-0-1. 통합 모바일 에이전트 & 서버 관제 카드 '접기/펼치기' 토글
        updateStatusDetailsVisibility(prefs.isStatusDetailsHidden)
        binding.btnToggleStatusDetails.setOnClickListener {
            val nextState = !prefs.isStatusDetailsHidden
            prefs.isStatusDetailsHidden = nextState
            updateStatusDetailsVisibility(nextState)
        }

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
        binding.switchReceiptSms.setOnCheckedChangeListener { _, isChecked ->
            prefs.isReceiptSmsEnabled = isChecked
            val msg = if (isChecked) "고객 영수증 문자 자동 전송이 켜졌습니다." else "고객 영수증 문자 자동 전송이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                provisionSheetAsync("RECEIPT_SMS", "[SheetBot] 고객 영수증 문자 발송 대장")
            }
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
        binding.layoutCallRecordingSettings.visibility = if (prefs.isCallRecordingSyncEnabled) View.VISIBLE else View.GONE
        binding.etRecordingTargetFilter.setText(prefs.callRecordingTargetFilter)

        binding.switchCallRecording.setOnCheckedChangeListener { _, isChecked ->
            prefs.isCallRecordingSyncEnabled = isChecked
            binding.layoutCallRecordingSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "통화 녹음 드라이브 자동 백업이 켜졌습니다." else "통화 녹음 드라이브 백업이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
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

        binding.btnSyncRecordingsNow.setOnClickListener {
            binding.progressBar.visibility = View.VISIBLE
            activityScope.launch {
                try {
                    val count = CallRecordingManager.scanAndUploadNewRecordings(this@MainActivity)
                    binding.progressBar.visibility = View.GONE
                    if (count > 0) {
                        Toast.makeText(this@MainActivity, "🎉 신규 통화 녹음 ${count}건이 구글 드라이브에 안전하게 업로드되었습니다!", Toast.LENGTH_LONG).show()
                        addLogItem("녹음 백업", "통화 녹음 ${count}건 구글 드라이브 업로드 완료", true)
                    } else {
                        Toast.makeText(this@MainActivity, "업로드할 신규 통화 녹음 파일이 없습니다.", Toast.LENGTH_SHORT).show()
                    }
                } catch (e: Exception) {
                    binding.progressBar.visibility = View.GONE
                    Toast.makeText(this@MainActivity, "통화 녹음 동기화 중 오류: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }

        // 사진 및 문서 파일 구글 드라이브 업로드 UI 바인딩 및 실시간 자동 저장 (Auto-Save)
        binding.switchFileUploadSync.isChecked = prefs.isFileUploadSyncEnabled
        binding.layoutFileUploadSettings.visibility = if (prefs.isFileUploadSyncEnabled) View.VISIBLE else View.GONE

        binding.switchFileUploadSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isFileUploadSyncEnabled = isChecked
            binding.layoutFileUploadSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
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

        // 웹 링크 & 유튜브 영상 AI 자동 스크랩 UI 바인딩 및 실시간 자동 저장 (Auto-Save)
        binding.switchLinkScrap.isChecked = prefs.isLinkScrapEnabled
        binding.layoutLinkScrapSettings.visibility = if (prefs.isLinkScrapEnabled) View.VISIBLE else View.GONE

        binding.switchLinkScrap.setOnCheckedChangeListener { _, isChecked ->
            prefs.isLinkScrapEnabled = isChecked
            binding.layoutLinkScrapSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
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
        binding.layoutSmsSyncSettings.visibility = if (prefs.isSmsSheetSyncEnabled) View.VISIBLE else View.GONE
        binding.etSmsTargetFilter.setText(prefs.smsTargetFilter)

        binding.switchSmsSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isSmsSheetSyncEnabled = isChecked
            binding.layoutSmsSyncSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "문자(SMS) 시트 자동 기록이 켜졌습니다." else "문자 시트 자동 기록이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                provisionSheetAsync("SMS", prefs.smsDriveSheetTitle)
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
        binding.layoutKakaoSyncSettings.visibility = if (prefs.isKakaoSheetSyncEnabled) View.VISIBLE else View.GONE
        binding.etKakaoTargetFilter.setText(prefs.kakaoTargetFilter)

        binding.switchKakaoSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isKakaoSheetSyncEnabled = isChecked
            binding.layoutKakaoSyncSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "카카오톡 메시지 시트 기록이 켜졌습니다." else "카카오톡 시트 기록이 꺼졌습니다."
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

        binding.btnOpenKakaoSheet.setOnClickListener {
            showOpenSheetChooserDialog("KAKAO", prefs.kakaoDriveSheetTitle)
        }

        // 부재중 전화(Missed Call) 0원 스마트 자동 회신 UI 바인딩 및 실시간 자동 저장 (Auto-Save)
        binding.switchMissedCall.isChecked = prefs.isMissedCallAutoReplyEnabled
        binding.layoutMissedCallSettings.visibility = if (prefs.isMissedCallAutoReplyEnabled) View.VISIBLE else View.GONE
        binding.etMissedCallReply.setText(prefs.missedCallReplyTemplate)

        binding.switchMissedCall.setOnCheckedChangeListener { _, isChecked ->
            prefs.isMissedCallAutoReplyEnabled = isChecked
            binding.layoutMissedCallSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "부재중 전화 자동 회신이 켜졌습니다." else "부재중 전화 자동 회신이 꺼졌습니다."
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
        binding.layoutCallEndedCardSettings.visibility = if (prefs.isCallEndedCardPromptEnabled) View.VISIBLE else View.GONE

        // 1. 발송 방식 라디오 버튼 초기화 (WEB_LINK vs MMS_IMAGE) 및 실시간 자동 저장
        val isWebLinkMode = prefs.businessCardSendMode == "WEB_LINK"
        binding.rbModeWebLink.isChecked = isWebLinkMode
        binding.rbModeMmsImage.isChecked = !isWebLinkMode
        binding.layoutModeWebLink.visibility = if (isWebLinkMode) View.VISIBLE else View.GONE
        binding.layoutModeMmsImage.visibility = if (isWebLinkMode) View.GONE else View.VISIBLE

        binding.rgBusinessCardMode.setOnCheckedChangeListener { _, checkedId ->
            val isWeb = checkedId == binding.rbModeWebLink.id
            binding.layoutModeWebLink.visibility = if (isWeb) View.VISIBLE else View.GONE
            binding.layoutModeMmsImage.visibility = if (isWeb) View.GONE else View.VISIBLE
            prefs.businessCardSendMode = if (isWeb) "WEB_LINK" else "MMS_IMAGE"
        }

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
            binding.layoutCallEndedCardSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "통화 종료 모바일 명함 발송 기능이 켜졌습니다." else "모바일 명함 발송 기능이 꺼졌습니다."
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
        binding.scrollLogs.setOnTouchListener { v, event ->
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

        binding.btnClearLogs.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("실시간 감지 로그 비우기")
                .setMessage("스마트폰에 보관된 감지 로그(최대 1,000건)를 모두 비우시겠습니까?\n(구글 스프레드시트에 기록된 대장 내역은 안전하게 보존됩니다)")
                .setPositiveButton("비우기") { _, _ ->
                    logManager.clearLogs()
                    binding.tvLogs.text = logManager.getFormattedLogs()
                    binding.scrollLogs.scrollTo(0, 0)
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
            val pendingCount = DepositQueueManager.getPendingCount(this@MainActivity)
            val email = prefs.userEmail ?: ""

            binding.tvPendingDepositQueue.text = "📱 0원 양방향 SMS & 구글 시트 1:1 연동 가동 중"

            if (ping.isOnline) {
                binding.cardStatus.setBackgroundResource(R.drawable.bg_card_connected)
                binding.tvStatusTitle.text = "🟢 시트봇 모바일 에이전트 가동 중"
                binding.tvStatusDesc.text = "계정: $email\n구글 시트 ↔ 스마트폰 양방향 자동화 (서버 무보관 100%)"
                binding.tvServerStatus.text = "🌐 서버 통신: 🟢 정상 (${ping.latencyMs}ms)"

                if (showToast) {
                    Toast.makeText(this@MainActivity, "✅ sheetbot.cloud 서버 통신 정상 (${ping.latencyMs}ms)", Toast.LENGTH_SHORT).show()
                }
            } else {
                // 이용자 앱 친화적: 위협적인 붉은색 경고창/토스트 대신 '가동 중 (통신 확인 중)'으로 자연스럽게 표시
                binding.cardStatus.setBackgroundResource(R.drawable.bg_card_connected)
                binding.tvStatusTitle.text = "🟢 시트봇 모바일 에이전트 가동 중 (통신 확인 중)"
                binding.tvStatusDesc.text = "계정: $email\n구글 시트 ↔ 스마트폰 자동 연결 대기 중 (서버 무보관 100%)"
                binding.tvServerStatus.text = "🌐 서버 통신: 🟡 연결 대기 중 (자동 재시도)"

                if (showToast) {
                    Toast.makeText(this@MainActivity, "시트봇 모바일 에이전트 가동 중 (서버 연결을 확인하고 있습니다)", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun updatePrivacyCardVisibility(hidden: Boolean) {
        binding.layoutPrivacyBody.visibility = if (hidden) View.GONE else View.VISIBLE
        binding.tvPrivacyTitle.text = if (hidden) "🛡️ 고객정보 안심보증" else "🛡️ Zero-Retention 안심 보증"
        binding.btnTogglePrivacy.text = if (hidden) "펼치기" else "접기"
    }

    private fun updateStatusDetailsVisibility(hidden: Boolean) {
        binding.layoutStatusDetails.visibility = if (hidden) View.GONE else View.VISIBLE
        binding.btnToggleStatusDetails.text = if (hidden) "펼치기" else "접기"
    }

    private fun updateTokenNoticeVisibility(dismissed: Boolean) {
        binding.layoutTokenNoticeDetails.visibility = if (dismissed) View.GONE else View.VISIBLE
        binding.btnToggleTokenNotice.text = if (dismissed) "자세히 보기" else "접기"
    }

    private fun updateUiState() {
        val verName = getAppVersionName()
        binding.tvAppVersionBadge.text = "v$verName"
        binding.tvCopilotVersionBadge.text = "v$verName"

        val isPaired = prefs.isPaired
        val email = prefs.userEmail

        updatePrivacyCardVisibility(prefs.isPrivacyCardHidden)
        updateStatusDetailsVisibility(prefs.isStatusDetailsHidden)
        updateTokenNoticeVisibility(prefs.isTokenNoticeDismissed)
        updateTargetBadges()

        if (isPaired && !email.isNullOrBlank()) {
            binding.cardStatus.setBackgroundResource(R.drawable.bg_card_connected)
            binding.tvStatusTitle.text = "✅ 연동 완료 (${email})"
            binding.tvStatusDesc.text = "구글 시트 ↔ 스마트폰 양방향 자동화 가동 중\n🛡️ 데이터는 본인 구글 드라이브에만 안전 저장됩니다."
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
            binding.tvStatusDesc.text = "시트봇 모바일 에이전트 QR코드를 스캔하여 계정을 연동해 주세요.\n🛡️ 서버 무보관 100% · 내 구글 드라이브로만 직통 전송"
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
        val formatted = logManager.addLog(sender, body, success)
        binding.tvLogs.text = formatted
        binding.scrollLogs.post {
            binding.scrollLogs.scrollTo(0, 0)
        }
        updateLogCount()
    }

    private fun updateLogCount() {
        val count = logManager.getLogCount()
        val formattedCount = NumberFormat.getNumberInstance(Locale.KOREA).format(count)
        binding.tvLogCount.text = "$formattedCount / 1,000건"
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
            .setMessage("토스, 카카오뱅크, 국민/신한/우리/하나 등 은행 공식 앱의 입금 푸시 알림을 0원으로 실시간 감지하기 위해 '알림 접근 권한'을 허용해 주세요.\n\n[설정으로 이동]을 누른 후 'SheetBot Agent M'을 켜주시면 됩니다.")
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

            // 1순위: 텍스트에 웹 링크가 포함되어 있거나 clipUri가 웹 주소인 경우 -> 웹 링크 & 유튜브 자동 스크랩
            if (matchedUrlInText != null) {
                bookmarkSharedUrl(matchedUrlInText, sharedText)
            } else if (isWebUri && clipUri != null) {
                bookmarkSharedUrl(clipUri.toString(), sharedText)
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
                    val amount = ocr?.optString("amount")?.let { "${it}원" } ?: ""
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
        Toast.makeText(this, "🪪 명함을 업로드하고 AI 인맥 분석을 시작합니다...", Toast.LENGTH_SHORT).show()

        activityScope.launch {
            try {
                val result = FileUploadManager.uploadOcrBusinessCard(this@MainActivity, uri)
                binding.progressBar.visibility = View.GONE

                if (result.success) {
                    val ocr = result.ocrData
                    val name = ocr?.optString("name", "명함") ?: "명함"
                    val comp = ocr?.optString("company")?.let { "($it)" } ?: ""
                    Toast.makeText(
                        this@MainActivity,
                        "🎉 [명함 등록 완료] $name $comp\n인맥 관리 대장에 자동 기록되었습니다!",
                        Toast.LENGTH_LONG
                    ).show()
                    addLogItem("🪪 명함 OCR", "$name $comp -> 인맥 대장", true)
                } else {
                    val err = result.error ?: "명함 분석 실패"
                    Toast.makeText(this@MainActivity, "⚠️ 명함 분석 실패: $err", Toast.LENGTH_LONG).show()
                    addLogItem("명함 오류", err, false)
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Toast.makeText(this@MainActivity, "명함 처리 예외: ${e.message}", Toast.LENGTH_SHORT).show()
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
            renderBusinessCardImagePreview()
            Toast.makeText(this, "🖼️ 명함/포스터 이미지가 등록되었습니다.", Toast.LENGTH_SHORT).show()
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
            renderBusinessCardImagePreview()
            Toast.makeText(this, "🗑️ 등록된 이미지가 삭제되었습니다.", Toast.LENGTH_SHORT).show()
            addLogItem("명함이미지", "이미지 삭제 완료", true)
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "이미지 삭제 실패", e)
        }
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
        val userEmail = prefs.userEmail
        if (!prefs.isPaired || userEmail.isNullOrBlank()) return

        activityScope.launch(Dispatchers.IO) {
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
                } catch (_: Exception) {}
            }
        }
    }

    /**
     * 구글 시트 원본 vs 모바일 스마트 웹앱 선택 다이얼로그 (v2.1.5)
     */
    private fun showOpenSheetChooserDialog(sheetType: String, defaultTitle: String) {
        val userEmail = prefs.userEmail
        val cachedUrl = prefs.getSheetUrl(sheetType)
        val cachedId = prefs.getSheetId(sheetType)

        val finalSheetUrl = cachedUrl ?: if (!cachedId.isNullOrBlank()) {
            "https://docs.google.com/spreadsheets/d/$cachedId/edit"
        } else null

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
                val result = kotlinx.coroutines.withTimeoutOrNull(25_000L) {
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
            binding.tvRecordingTargetCountBadge.text = "전체 업로드"
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
    // ==========================================
    private fun setupWebsiteMonitorUI() {
        binding.switchWebsiteMonitor.isChecked = prefs.isWebsiteMonitorEnabled
        binding.layoutWebsiteMonitorSettings.visibility = if (prefs.isWebsiteMonitorEnabled) View.VISIBLE else View.GONE
        binding.etTargetWebsiteUrl.setText(prefs.targetWebsiteUrl)
        binding.cbWebsiteEmergencyAlarm.isChecked = prefs.isWebsiteEmergencyAlarmEnabled
        updateWebsiteMonitorStatusText()

        binding.switchWebsiteMonitor.setOnCheckedChangeListener { _, isChecked ->
            prefs.isWebsiteMonitorEnabled = isChecked
            binding.layoutWebsiteMonitorSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "내 웹사이트 실시간 장애 감시가 시작되었습니다." else "웹사이트 장애 감시가 중단되었습니다."
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
}
