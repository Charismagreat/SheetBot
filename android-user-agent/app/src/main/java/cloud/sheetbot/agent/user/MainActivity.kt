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
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
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
import java.util.Locale
import kotlin.random.Random

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: PreferencesManager
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
                Toast.makeText(this, "구글 계정 이메일을 가져올 수 없습니다.", Toast.LENGTH_SHORT).show()
            }
        } catch (e: ApiException) {
            android.util.Log.w("MainActivity", "Google sign-in failed: statusCode=${e.statusCode}")
            if (e.statusCode != 12501) { // 12501은 사용자 단순 취소
                Toast.makeText(this, "구글 로그인에 실패했습니다 (오류 코드: ${e.statusCode})", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = PreferencesManager(this)

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
        // 0. Google 원클릭 로그인 버튼 (v1.8.0)
        binding.btnGoogleSignIn.setOnClickListener {
            val signInIntent = googleSignInClient.signInIntent
            googleSignInLauncher.launch(signInIntent)
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

        // 5. 오프라인 대기열 서버 즉시 전송 버튼
        binding.btnSyncPendingDeposits.setOnClickListener {
            binding.progressBar.visibility = View.VISIBLE
            activityScope.launch {
                val drained = DepositQueueManager.drainQueue(this@MainActivity)
                binding.progressBar.visibility = View.GONE
                if (drained > 0) {
                    Toast.makeText(this@MainActivity, "🎉 오프라인 대기열 ${drained}건이 서버로 안전하게 전송되었습니다!", Toast.LENGTH_LONG).show()
                    addLogItem("대기열 전송", "미전송 입금 ${drained}건 서버 동기화 완료", true)
                } else {
                    val count = DepositQueueManager.getPendingCount(this@MainActivity)
                    if (count == 0) {
                        Toast.makeText(this@MainActivity, "현재 전송 대기 중인 입금 내역이 없습니다.", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@MainActivity, "⚠️ 서버가 응답하지 않아 전송에 실패했습니다. (대기 ${count}건 유지)", Toast.LENGTH_SHORT).show()
                    }
                }
                checkServerAndQueueStatus(false)
            }
        }

        // 6. 연동 해제 버튼
        binding.btnUnlink.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("연동 해제")
                .setMessage("시트봇 계정 연동을 해제하시겠습니까?\n해제 시 더 이상 입금 문자가 감지되지 않습니다.")
                .setPositiveButton("해제") { _, _ ->
                    val emailToUnlink = prefs.userEmail
                    if (!emailToUnlink.isNullOrBlank()) {
                        activityScope.launch {
                            ApiClient.unlinkDevice(emailToUnlink, "${Build.MANUFACTURER} ${Build.MODEL}")
                        }
                    }
                    prefs.clear()
                    KeepAliveService.stop(this)
                    updateUiState()
                    Toast.makeText(this, "연동이 해제되었습니다.", Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton("취소", null)
                .show()
        }

        // 7. 스마트 편의 스위치 & 업데이트 버튼
        binding.switchTts.isChecked = prefs.isTtsEnabled
        binding.switchTts.setOnCheckedChangeListener { _, isChecked ->
            prefs.isTtsEnabled = isChecked
            if (isChecked) TtsManager.speak(this, "실시간 음성 안내가 활성화되었습니다.")
        }

        binding.switchReceiptSms.isChecked = prefs.isReceiptSmsEnabled
        binding.switchReceiptSms.setOnCheckedChangeListener { _, isChecked ->
            prefs.isReceiptSmsEnabled = isChecked
            val msg = if (isChecked) "고객 영수증 SMS 자동 회신이 켜졌습니다." else "고객 영수증 SMS 자동 회신이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }

        binding.switchPushDetection.isChecked = prefs.isPushDetectionEnabled
        binding.switchPushDetection.setOnCheckedChangeListener { _, isChecked ->
            prefs.isPushDetectionEnabled = isChecked
            if (isChecked && !isNotificationListenerEnabled()) {
                requestNotificationListenerPermission()
            } else {
                val msg = if (isChecked) "금융사 앱 무료 푸시 실시간 감지가 켜졌습니다." else "금융사 앱 푸시 감지가 꺼졌습니다."
                Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnSyncPendingReceipts.setOnClickListener {
            binding.progressBar.visibility = View.VISIBLE
            activityScope.launch {
                try {
                    val count = SmsSenderUtil.processPendingReceipts(this@MainActivity)
                    binding.progressBar.visibility = View.GONE
                    if (count > 0) {
                        Toast.makeText(this@MainActivity, "🎉 미발송 영수증 ${count}건이 정상 발송되었습니다!", Toast.LENGTH_LONG).show()
                        addLogItem("영수증 발송", "미발송 영수증 ${count}건 고객 휴대폰으로 전송 완료", true)
                    } else {
                        Toast.makeText(this@MainActivity, "현재 발송 대기 중인 영수증이 없습니다.", Toast.LENGTH_SHORT).show()
                    }
                } catch (e: Exception) {
                    binding.progressBar.visibility = View.GONE
                    Toast.makeText(this@MainActivity, "동기화 중 오류: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }

        // 통화 녹음 구글 드라이브 자동 백업 UI 바인딩
        binding.switchCallRecording.isChecked = prefs.isCallRecordingSyncEnabled
        binding.layoutCallRecordingSettings.visibility = if (prefs.isCallRecordingSyncEnabled) View.VISIBLE else View.GONE
        binding.etRecordingTargetFilter.setText(prefs.callRecordingTargetFilter)
        binding.etRecordingDriveFolder.setText(prefs.callRecordingDriveFolder)
        binding.switchRecordingSheet.isChecked = prefs.isCallRecordingSheetEnabled

        binding.switchCallRecording.setOnCheckedChangeListener { _, isChecked ->
            prefs.isCallRecordingSyncEnabled = isChecked
            binding.layoutCallRecordingSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "통화 녹음 드라이브 자동 백업이 켜졌습니다." else "통화 녹음 드라이브 백업이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }

        binding.btnSaveRecordingSettings.setOnClickListener {
            val filter = binding.etRecordingTargetFilter.text.toString().trim()
            val folder = binding.etRecordingDriveFolder.text.toString().trim().takeIf { it.isNotBlank() } ?: "[SheetBot] 통화 녹음"
            val sheetEnabled = binding.switchRecordingSheet.isChecked

            prefs.callRecordingTargetFilter = filter
            prefs.callRecordingDriveFolder = folder
            prefs.isCallRecordingSheetEnabled = sheetEnabled

            Toast.makeText(this, "💾 통화 녹음 백업 설정이 저장되었습니다.\n저장 폴더: $folder", Toast.LENGTH_SHORT).show()
            addLogItem("녹음설정", "폴더: $folder / 대상: ${filter.ifBlank { "전체" }}", true)
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

        // 사진 및 문서 파일 구글 드라이브 업로드 UI 바인딩
        binding.etFileUploadDriveFolder.setText(prefs.fileUploadDriveFolder)
        binding.switchFileUploadSheet.isChecked = prefs.isFileUploadSheetEnabled

        binding.btnSaveFileUploadSettings.setOnClickListener {
            val folder = binding.etFileUploadDriveFolder.text.toString().trim().takeIf { it.isNotBlank() } ?: "[SheetBot] 파일 보관함"
            val sheetEnabled = binding.switchFileUploadSheet.isChecked

            prefs.fileUploadDriveFolder = folder
            prefs.isFileUploadSheetEnabled = sheetEnabled

            Toast.makeText(this, "💾 파일 업로드 설정이 저장되었습니다.\n저장 폴더: $folder", Toast.LENGTH_SHORT).show()
            addLogItem("파일설정", "폴더: $folder / 대장시트: $sheetEnabled", true)
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

        // 문자(SMS/LMS) 송수신 구글 시트 동기화 UI 바인딩
        binding.switchSmsSync.isChecked = prefs.isSmsSheetSyncEnabled
        binding.layoutSmsSyncSettings.visibility = if (prefs.isSmsSheetSyncEnabled) View.VISIBLE else View.GONE
        binding.etSmsTargetFilter.setText(prefs.smsTargetFilter)
        binding.etSmsDriveSheet.setText(prefs.smsDriveSheetTitle)

        binding.switchSmsSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isSmsSheetSyncEnabled = isChecked
            binding.layoutSmsSyncSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "문자(SMS) 시트 자동 기록이 켜졌습니다." else "문자 시트 자동 기록이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }

        binding.btnSaveSmsSettings.setOnClickListener {
            val filter = binding.etSmsTargetFilter.text.toString().trim()
            val sheetTitle = binding.etSmsDriveSheet.text.toString().trim().takeIf { it.isNotBlank() }
                ?: "[SheetBot] 스마트폰 문자(SMS) 송수신 대장"

            prefs.smsTargetFilter = filter
            prefs.smsDriveSheetTitle = sheetTitle

            Toast.makeText(this, "💾 문자 시트 기록 설정이 저장되었습니다.\n대장 시트: $sheetTitle", Toast.LENGTH_SHORT).show()
            addLogItem("문자설정", "시트: $sheetTitle / 대상: ${filter.ifBlank { "전체" }}", true)
        }

        // 카카오톡 수신 메시지 구글 시트 동기화 UI 바인딩
        binding.switchKakaoSync.isChecked = prefs.isKakaoSheetSyncEnabled
        binding.layoutKakaoSyncSettings.visibility = if (prefs.isKakaoSheetSyncEnabled) View.VISIBLE else View.GONE
        binding.etKakaoTargetFilter.setText(prefs.kakaoTargetFilter)
        binding.etKakaoDriveSheet.setText(prefs.kakaoDriveSheetTitle)

        binding.switchKakaoSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isKakaoSheetSyncEnabled = isChecked
            binding.layoutKakaoSyncSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "카카오톡 메시지 시트 기록이 켜졌습니다." else "카카오톡 시트 기록이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }

        binding.btnSaveKakaoSettings.setOnClickListener {
            val filter = binding.etKakaoTargetFilter.text.toString().trim()
            val sheetTitle = binding.etKakaoDriveSheet.text.toString().trim().takeIf { it.isNotBlank() }
                ?: "[SheetBot] 카카오톡 메시지 대장"

            prefs.kakaoTargetFilter = filter
            prefs.kakaoDriveSheetTitle = sheetTitle

            Toast.makeText(this, "💾 카카오톡 시트 기록 설정이 저장되었습니다.\n대장 시트: $sheetTitle", Toast.LENGTH_SHORT).show()
            addLogItem("카톡설정", "시트: $sheetTitle / 대상: ${filter.ifBlank { "전체" }}", true)
        }

        // 부재중 전화(Missed Call) 0원 스마트 자동 회신 UI 바인딩
        binding.switchMissedCall.isChecked = prefs.isMissedCallAutoReplyEnabled
        binding.layoutMissedCallSettings.visibility = if (prefs.isMissedCallAutoReplyEnabled) View.VISIBLE else View.GONE
        binding.etMissedCallReply.setText(prefs.missedCallReplyTemplate)
        binding.etMissedCallSheet.setText(prefs.missedCallDriveSheetTitle)

        binding.switchMissedCall.setOnCheckedChangeListener { _, isChecked ->
            prefs.isMissedCallAutoReplyEnabled = isChecked
            binding.layoutMissedCallSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "부재중 전화 자동 회신이 켜졌습니다." else "부재중 전화 자동 회신이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }

        binding.btnSaveMissedCallSettings.setOnClickListener {
            val replyMsg = binding.etMissedCallReply.text.toString().trim()
            val sheetTitle = binding.etMissedCallSheet.text.toString().trim().takeIf { it.isNotBlank() }
                ?: "[SheetBot] 부재중 전화 대장"

            prefs.missedCallReplyTemplate = replyMsg
            prefs.missedCallDriveSheetTitle = sheetTitle

            Toast.makeText(this, "💾 부재중 전화 자동 회신 설정이 저장되었습니다.\n대장 시트: $sheetTitle", Toast.LENGTH_SHORT).show()
            addLogItem("부재중설정", "대장: $sheetTitle / 회신: ${if (replyMsg.isNotBlank()) "설정완료" else "없음"}", true)
        }

        // 통화 종료 직후 모바일 명함 원터치 발송 UI 바인딩
        binding.switchCallEndedCard.isChecked = prefs.isCallEndedCardPromptEnabled
        binding.layoutCallEndedCardSettings.visibility = if (prefs.isCallEndedCardPromptEnabled) View.VISIBLE else View.GONE
        binding.etBusinessCardSms.setText(prefs.businessCardSmsTemplate)

        binding.switchCallEndedCard.setOnCheckedChangeListener { _, isChecked ->
            prefs.isCallEndedCardPromptEnabled = isChecked
            binding.layoutCallEndedCardSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "통화 종료 모바일 명함 발송 기능이 켜졌습니다." else "모바일 명함 발송 기능이 꺼졌습니다."
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }

        binding.btnSaveBusinessCardSettings.setOnClickListener {
            val cardMsg = binding.etBusinessCardSms.text.toString().trim()
            prefs.businessCardSmsTemplate = cardMsg

            Toast.makeText(this, "💾 모바일 명함 내용이 저장되었습니다.", Toast.LENGTH_SHORT).show()
            addLogItem("명함설정", "모바일 명함 템플릿 저장 완료", true)
        }

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
                binding.tvStatusTitle.text = "🟢 시트봇 에이전트 가동 중"
                binding.tvStatusDesc.text = "계정: $email\n0원 양방향 SMS & 구글 시트 1:1 연동 중"
                binding.tvServerStatus.text = "🌐 서버 통신: 🟢 정상 (${ping.latencyMs}ms)"

                if (showToast) {
                    Toast.makeText(this@MainActivity, "✅ sheetbot.cloud 서버 통신 정상 (${ping.latencyMs}ms)", Toast.LENGTH_SHORT).show()
                }
            } else {
                binding.cardStatus.setBackgroundColor(0xFF7F1D1D.toInt())
                binding.tvStatusTitle.text = "🚨 서버 연결 두절 (서버 점검 필요)"
                binding.tvStatusDesc.text = "sheetbot.cloud 서버가 응답하지 않습니다.\n네트워크 연결 또는 PC 서버 상태를 점검해 주세요."
                binding.tvServerStatus.text = "🌐 서버 통신: 🔴 응답 없음 (연결 두절)"

                if (showToast) {
                    Toast.makeText(this@MainActivity, "⚠️ 서버 연결이 두절되었습니다. PC 서버 상태를 점검하세요.", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun updateUiState() {
        val isPaired = prefs.isPaired
        val email = prefs.userEmail

        if (isPaired && !email.isNullOrBlank()) {
            binding.cardStatus.setBackgroundResource(R.drawable.bg_card_connected)
            binding.tvStatusTitle.text = "✅ 연동 완료 (${email})"
            binding.tvStatusDesc.text = "구글 시트봇과 실시간 연동 중입니다."
            binding.layoutPairedControls.visibility = View.VISIBLE
            binding.layoutServerMonitor.visibility = View.VISIBLE
            binding.layoutWalletCard.visibility = View.VISIBLE
            binding.layoutUnpairedControls.visibility = View.GONE
            checkServerAndQueueStatus(showToast = false)
            loadWalletBalance(email)
        } else {
            binding.cardStatus.setBackgroundResource(R.drawable.bg_card_unpaired)
            binding.tvStatusTitle.text = "⚠️ 미연동 상태"
            binding.tvStatusDesc.text = "시트봇 알림 센터의 QR코드를 스캔하여 계정을 연동해 주세요."
            binding.layoutPairedControls.visibility = View.GONE
            binding.layoutServerMonitor.visibility = View.GONE
            binding.layoutWalletCard.visibility = View.GONE
            binding.layoutUnpairedControls.visibility = View.VISIBLE
        }
    }

    /**
     * 회원 토큰 지갑 잔액 실시간 조회 및 UI 갱신 (v1.9.0)
     */
    private fun loadWalletBalance(userEmail: String, isManualRefresh: Boolean = false) {
        if (isManualRefresh) {
            binding.tvWalletBalance.text = "..."
        }
        activityScope.launch {
            val result = ApiClient.fetchWalletBalance(userEmail)
            if (result.success) {
                val formattedBalance = NumberFormat.getNumberInstance().format(result.balanceTokens)
                binding.tvWalletBalance.text = formattedBalance
                binding.tvWalletTier.text = result.tier
                val estQueries = (result.balanceTokens / 200).coerceAtLeast(0)
                binding.tvWalletUsageGuide.text = "💡 AI 코파일럿 & 구글 시트 자동화 약 ${NumberFormat.getNumberInstance().format(estQueries.toLong())}회 질의 가능"
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
        val timeStr = SimpleDateFormat("HH:mm:ss", Locale.KOREA).format(Date())
        val statusIcon = if (success) "🟢" else "🔴"
        val logLine = "$statusIcon [$timeStr] $sender: ${body.replace("\n", " ").take(40)}...\n"
        binding.tvLogs.text = logLine + binding.tvLogs.text
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
            val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            } ?: intent.clipData?.getItemAt(0)?.uri

            if (uri != null) {
                uploadFiles(listOf(uri), "스마트폰 공유하기(Share) 1초 연동")
            } else {
                // 웹 브라우저나 유튜브 앱에서 [공유하기]로 전달된 텍스트 및 URL 처리 (v1.6)
                val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
                    ?: intent.clipData?.getItemAt(0)?.text?.toString()
                if (!sharedText.isNullOrBlank()) {
                    val urlRegex = Regex("https?://[a-zA-Z0-9.-]+(?:/[^\\s]*)?")
                    val match = urlRegex.find(sharedText)
                    if (match != null) {
                        val extractedUrl = match.value
                        bookmarkSharedUrl(extractedUrl, sharedText)
                    } else {
                        Toast.makeText(this, "공유된 텍스트에서 링크(URL)를 찾을 수 없습니다.", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        } else if (Intent.ACTION_SEND_MULTIPLE == action) {
            val uris = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            } ?: emptyList<Uri>()

            if (!uris.isNullOrEmpty()) {
                uploadFiles(uris, "스마트폰 공유하기(Share) 다중 연동")
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
}
