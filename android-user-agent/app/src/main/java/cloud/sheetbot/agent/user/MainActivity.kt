package cloud.sheetbot.agent.user

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.EditText
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = PreferencesManager(this)

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

        binding.btnPickAndUploadFile.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(this, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            filePickerLauncher.launch("*/*")
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
            binding.layoutPairedControls.visibility = View.VISIBLE
            binding.layoutServerMonitor.visibility = View.VISIBLE
            binding.layoutUnpairedControls.visibility = View.GONE
            checkServerAndQueueStatus(showToast = false)
        } else {
            binding.cardStatus.setBackgroundResource(R.drawable.bg_card_unpaired)
            binding.tvStatusTitle.text = "⚠️ 미연동 상태"
            binding.tvStatusDesc.text = "시트봇 알림 센터의 QR코드를 스캔하여 계정을 연동해 주세요."
            binding.layoutPairedControls.visibility = View.GONE
            binding.layoutServerMonitor.visibility = View.GONE
            binding.layoutUnpairedControls.visibility = View.VISIBLE
        }
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
}
