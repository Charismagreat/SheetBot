package cloud.sheetbot.agent

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
import android.util.Log
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
import cloud.sheetbot.agent.databinding.ActivityMainBinding
import org.json.JSONObject
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
    companion object {
        private const val TAG = "MainActivity"
    }

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: PreferencesManager
    private val activityScope = CoroutineScope(Dispatchers.Main)
    private var aodJob: Job? = null
    private var serverMonitorJob: Job? = null
    private lateinit var aodGestureDetector: GestureDetector

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

        // 실시간 입금 감지 브로드캐스트 리시버 등록
        val filter = IntentFilter(SmsReceiver.ACTION_DEPOSIT_DETECTED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(depositUpdateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(depositUpdateReceiver, filter)
        }
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

    data class QrPairData(
        val email: String,
        val token: String? = null,
        val pinCode: String? = null,
        val isUserMode: Boolean = true,
        val webhookUrl: String? = null,
        val heartbeatUrl: String? = null
    )

    private fun checkServerAndQueueStatus(showToast: Boolean = false) {
        if (!prefs.isPaired) return

        activityScope.launch {
            val ping = withContext(Dispatchers.IO) { ApiClient.pingServer() }
            val pendingCount = DepositQueueManager.getPendingCount(this@MainActivity)
            val email = prefs.userEmail ?: ""
            val isUserMode = prefs.agentMode == "USER"

            // 상단 헤더 타이틀 다이내믹 반영
            binding.tvHeaderTitle.text = if (isUserMode) "SheetBot Agent" else "SheetBot Agent M"

            if (isUserMode) {
                binding.tvPendingDepositQueue.text = "📱 0원 양방향 SMS & 구글 시트 비서 활성 상태"
            } else {
                binding.tvPendingDepositQueue.text = if (pendingCount > 0) {
                    "📥 오프라인 안전 대기열: ${pendingCount}건 보관 중 (서버 복구 시 자동 전송)"
                } else {
                    "📥 오프라인 안전 대기열: 0건 보관 중 (안전)"
                }
            }

            if (ping.isOnline) {
                binding.cardStatus.setBackgroundResource(R.drawable.bg_card_connected)
                if (isUserMode) {
                    binding.tvStatusTitle.text = "🟢 시트봇 에이전트 가동 중"
                    binding.tvStatusDesc.text = "계정: $email\n0원 양방향 SMS & 구글 시트 1:1 연동 중"
                } else {
                    binding.tvStatusTitle.text = "🟢 실시간 입금 감지 중"
                    binding.tvStatusDesc.text = "계정: $email\n24시간 백그라운드에서 은행 입금 문자를 감지합니다."
                }
                binding.tvServerStatus.text = "🌐 서버 통신: 🟢 정상 (${ping.latencyMs}ms)"

                // 관리자 모드이고 대기열이 있다면 자동 배출(Drain) 시도
                if (!isUserMode && pendingCount > 0) {
                    val drained = DepositQueueManager.drainQueue(this@MainActivity)
                    if (drained > 0) {
                        Toast.makeText(this@MainActivity, "🎉 오프라인 대기열 ${drained}건이 자동 전송되었습니다!", Toast.LENGTH_SHORT).show()
                        addLogItem("대기열 자동전송", "${drained}건 전송 완료", true)
                        checkServerAndQueueStatus(false)
                    }
                }

                if (showToast) {
                    Toast.makeText(this@MainActivity, "✅ sheetbot.cloud 서버 통신 정상 (${ping.latencyMs}ms)", Toast.LENGTH_SHORT).show()
                }
            } else {
                // 서버 연결 두절 상태 표시
                binding.cardStatus.setBackgroundColor(0xFF7F1D1D.toInt())
                binding.tvStatusTitle.text = "🚨 서버 연결 두절 (서버 점검 필요)"
                if (isUserMode) {
                    binding.tvStatusDesc.text = "sheetbot.cloud 서버가 응답하지 않습니다.\n네트워크 연결 또는 PC 서버 상태를 점검해 주세요."
                } else {
                    binding.tvStatusDesc.text = "sheetbot.cloud 서버가 응답하지 않습니다.\n입금 데이터는 스마트폰 대기열(${pendingCount}건)에 임시 보관 중입니다."
                }
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
        val isUserMode = prefs.agentMode == "USER"

        binding.tvHeaderTitle.text = if (isUserMode) "SheetBot Agent" else "SheetBot Agent M"

        if (isPaired && !email.isNullOrBlank()) {
            binding.layoutPairedControls.visibility = View.VISIBLE
            binding.layoutServerMonitor.visibility = View.VISIBLE
            binding.layoutUnpairedControls.visibility = View.GONE
            checkServerAndQueueStatus(showToast = false)
        } else {
            binding.cardStatus.setBackgroundResource(R.drawable.bg_card_unpaired)
            binding.tvStatusTitle.text = "⚠️ 미연동 상태"
            binding.tvStatusDesc.text = "시트봇 알림 센터 또는 워크스페이스의 QR코드를 스캔하여 계정을 연동해 주세요."
            binding.layoutPairedControls.visibility = View.GONE
            binding.layoutServerMonitor.visibility = View.GONE
            binding.layoutUnpairedControls.visibility = View.VISIBLE
        }
    }

    private fun handleQrScanResult(contents: String) {
        val pairData = parseQrContents(contents)
        if (pairData != null) {
            performPairing(
                email = pairData.email,
                token = pairData.token,
                pinCode = pairData.pinCode,
                isUserMode = pairData.isUserMode,
                customWebhookUrl = pairData.webhookUrl,
                customHeartbeatUrl = pairData.heartbeatUrl
            )
        } else {
            AlertDialog.Builder(this)
                .setTitle("잘못된 QR코드")
                .setMessage("시트봇 전용 연동 QR코드가 아닙니다.\n화면의 QR코드를 다시 확인해 주세요.")
                .setPositiveButton("확인", null)
                .show()
        }
    }

    private fun parseQrContents(contents: String): QrPairData? {
        val trimmed = contents.trim()

        // 1. JSON 형태의 QR코드 (이용자용 SheetBot Agent2 규격)
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
                val json = JSONObject(trimmed)
                val app = json.optString("app", "")
                val email = json.optString("userEmail", json.optString("email", ""))
                val token = json.optString("token").takeIf { it.isNotBlank() }
                val pinCode = json.optString("pinCode").takeIf { it.isNotBlank() }
                val webhookUrl = json.optString("webhookUrl").takeIf { it.isNotBlank() }
                val heartbeatUrl = json.optString("heartbeatUrl").takeIf { it.isNotBlank() }

                if (email.isNotBlank()) {
                    val isUserMode = app.contains("Agent2", ignoreCase = true) || !app.equals("SheetBotAgentM", ignoreCase = true)
                    return QrPairData(
                        email = email,
                        token = token,
                        pinCode = pinCode,
                        isUserMode = isUserMode,
                        webhookUrl = webhookUrl,
                        heartbeatUrl = heartbeatUrl
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "QR JSON 파싱 오류: ${e.message}")
            }
        }

        // 2. URI 형태 (관리자용 또는 웹 링크)
        try {
            val uri = Uri.parse(trimmed)
            val scheme = uri.scheme
            val host = uri.host

            if (scheme == "sheetbot" && host == "pair") {
                val email = uri.getQueryParameter("email") ?: return null
                val token = uri.getQueryParameter("token")
                val isUserMode = uri.getQueryParameter("mode") != "admin"
                return QrPairData(email = email, token = token, isUserMode = isUserMode)
            }

            if (trimmed.contains("sheetbot.cloud") || trimmed.contains("/pair")) {
                val email = uri.getQueryParameter("email")
                val token = uri.getQueryParameter("token")
                if (!email.isNullOrBlank()) {
                    val isUserMode = uri.getQueryParameter("mode") != "admin"
                    return QrPairData(email = email, token = token, isUserMode = isUserMode)
                }
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
                // 핀코드 접두사에 따라 모드 자동 판정 (AM-으로 시작하면 관리자 모드, 그 외 기본 이용자 모드)
                val isUserMode = !pin.startsWith("AM-", ignoreCase = true)
                performPairing(email, pinCode = pin, isUserMode = isUserMode)
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun performPairing(
        email: String,
        token: String? = null,
        pinCode: String? = null,
        isUserMode: Boolean = true,
        customWebhookUrl: String? = null,
        customHeartbeatUrl: String? = null
    ) {
        binding.progressBar.visibility = View.VISIBLE
        activityScope.launch {
            val result = withTimeoutOrNull(8000L) {
                ApiClient.pairDevice(email, token, pinCode, isUserMode)
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
                prefs.agentMode = if (isUserMode) "USER" else "ADMIN"
                if (!pinCode.isNullOrBlank()) prefs.pinCode = pinCode

                val finalWebhook = customWebhookUrl ?: result.webhookUrl
                val finalHeartbeat = customHeartbeatUrl ?: result.heartbeatUrl

                if (!finalWebhook.isNullOrBlank()) prefs.webhookUrl = finalWebhook
                if (!result.fallbackWebhookUrl.isNullOrBlank()) prefs.fallbackWebhookUrl = result.fallbackWebhookUrl
                if (!finalHeartbeat.isNullOrBlank()) prefs.heartbeatUrl = finalHeartbeat
                if (!result.fallbackHeartbeatUrl.isNullOrBlank()) prefs.fallbackHeartbeatUrl = result.fallbackHeartbeatUrl
                if (!result.deviceToken.isNullOrBlank()) prefs.deviceToken = result.deviceToken

                KeepAliveService.start(this@MainActivity)
                updateUiState()

                val modeTitle = if (isUserMode) "SheetBot Agent (이용자용)" else "SheetBot Agent M (관리자용)"
                val modeDesc = if (isUserMode) {
                    "${email} 계정과의 1:1 구글 시트 비서 연동이 완료되었습니다.\n\n• 스마트폰으로 수신된 고객 문자가 구글 시트에 실시간 기록됩니다.\n• 구글 시트에서 통신비 0원으로 문자 일괄 발송이 가능합니다."
                } else {
                    "${email} 계정과의 0초 연동이 완료되었습니다.\n(메인 및 터널 2단계 자동 폴백 활성화)\n이제 스마트폰으로 입금 문자가 오면 즉시 시트봇 토큰이 자동 충전됩니다."
                }

                AlertDialog.Builder(this@MainActivity)
                    .setTitle("🎉 $modeTitle 연동 성공!")
                    .setMessage(modeDesc)
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
}
