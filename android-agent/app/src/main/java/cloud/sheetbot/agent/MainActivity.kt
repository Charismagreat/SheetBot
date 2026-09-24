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
import android.view.View
import android.widget.EditText
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import cloud.sheetbot.agent.databinding.ActivityMainBinding
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: PreferencesManager
    private val activityScope = CoroutineScope(Dispatchers.Main)

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
    }

    override fun onDestroy() {
        super.onDestroy()
        TtsManager.shutdown()
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

        // 4. 가상 카카오뱅크 입금 SMS 테스트 버튼
        binding.btnTestDeposit.setOnClickListener {
            executeVirtualDepositTest()
        }

        // 4-1. 가상 금융사 앱 푸시 테스트 버튼
        binding.btnTestPushDeposit.setOnClickListener {
            executeVirtualPushTest()
        }

        // 5. 연동 해제 버튼
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

        // 4. 스마트 편의 스위치 & 업데이트 버튼
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
                        addLogItem("대기열 발송", "미발송 영수증 ${count}건 고객 휴대폰으로 전송 완료", true)
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
    }

    private fun updateUiState() {
        val isPaired = prefs.isPaired
        val email = prefs.userEmail

        if (isPaired && !email.isNullOrBlank()) {
            binding.cardStatus.setBackgroundResource(R.drawable.bg_card_connected)
            binding.tvStatusTitle.text = "🟢 실시간 입금 감지 중"
            binding.tvStatusDesc.text = "계정: $email\n24시간 백그라운드에서 은행 입금 문자를 감지합니다."
            binding.layoutPairedControls.visibility = View.VISIBLE
            binding.layoutUnpairedControls.visibility = View.GONE
        } else {
            binding.cardStatus.setBackgroundResource(R.drawable.bg_card_unpaired)
            binding.tvStatusTitle.text = "⚠️ 미연동 상태"
            binding.tvStatusDesc.text = "시트봇 워크스페이스의 QR코드를 스캔하여 계정을 연동해 주세요."
            binding.layoutPairedControls.visibility = View.GONE
            binding.layoutUnpairedControls.visibility = View.VISIBLE
        }

        val lastDeposit = prefs.lastDetectedDeposit
        if (!lastDeposit.isNullOrBlank()) {
            binding.tvLastDeposit.text = lastDeposit
            binding.layoutLastDeposit.visibility = View.VISIBLE
        } else {
            binding.layoutLastDeposit.visibility = View.GONE
        }
    }

    private fun handleQrScanResult(contents: String) {
        try {
            val json = JSONObject(contents)
            val app = json.optString("app")
            val email = json.optString("userEmail")
            val token = json.optString("token")
            val pinCode = json.optString("pinCode")
            val webhookUrl = json.optString("webhookUrl")
            val fallbackWebhookUrl = json.optString("fallbackWebhookUrl")
            val heartbeatUrl = json.optString("heartbeatUrl")
            val fallbackHeartbeatUrl = json.optString("fallbackHeartbeatUrl")

            if (webhookUrl.isNotBlank()) prefs.webhookUrl = webhookUrl
            if (fallbackWebhookUrl.isNotBlank()) prefs.fallbackWebhookUrl = fallbackWebhookUrl
            if (heartbeatUrl.isNotBlank()) prefs.heartbeatUrl = heartbeatUrl
            if (fallbackHeartbeatUrl.isNotBlank()) prefs.fallbackHeartbeatUrl = fallbackHeartbeatUrl

            if (email.isBlank()) {
                Toast.makeText(this, "유효한 SheetBot QR코드가 아닙니다.", Toast.LENGTH_LONG).show()
                return
            }

            performPairing(email, token, pinCode)
        } catch (e: Exception) {
            Toast.makeText(this, "QR코드 파싱 실패: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
        }
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
            // 8초 초과 시 지연 안내 및 자동 취소 안전망
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
                    .setTitle("🎉 연동 성공!")
                    .setMessage("${email} 계정과의 0초 연동이 완료되었습니다.\n(메인 및 터널 2단계 자동 폴백 활성화)\n이제 스마트폰으로 입금 문자가 오면 즉시 시트봇 토큰이 자동 충전됩니다.")
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

    private fun executeVirtualDepositTest() {
        val email = prefs.userEmail ?: return
        binding.progressBar.visibility = View.VISIBLE
        activityScope.launch {
            val now = SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(Date())
            val simulatedSms = "[Web발신]\n[카카오뱅크] 입금알림\n$now 입금 5,000원\n테스트입금\n잔액 2,055,439원"

            val result = withTimeoutOrNull(8000L) {
                ApiClient.sendBankWebhook(
                    webhookUrl = prefs.webhookUrl,
                    fallbackWebhookUrl = prefs.fallbackWebhookUrl,
                    sender = "1599-3333",
                    smsText = simulatedSms,
                    userEmail = email
                )
            }
            binding.progressBar.visibility = View.GONE

            if (result == null) {
                addLogItem("1599-3333 (테스트)", simulatedSms, false)
                Toast.makeText(this@MainActivity, "⚠️ 가상 입금 테스트 시간 초과 (8초)\n서버와의 연결 상태를 확인해 주세요.", Toast.LENGTH_LONG).show()
                return@launch
            }

            addLogItem("1599-3333 (테스트)", simulatedSms, result.success)

            if (result.success) {
                if (prefs.isTtsEnabled) {
                    val speech = result.ttsText ?: "가상 입금 5,000원이 정상 감지되었습니다."
                    TtsManager.speak(this@MainActivity, speech)
                }
                val toastText = if (result.message.contains("토큰이 즉시 충전되었습니다")) {
                    "🎉 가상 입금 매칭 성공! (토큰 충전 완료)"
                } else {
                    "🎉 가상 입금 테스트 성공!\n스마트폰 ↔ 서버 웹훅 통신 및 SMS 분석 완벽 확인"
                }
                Toast.makeText(this@MainActivity, toastText, Toast.LENGTH_LONG).show()
            } else {
                if (result.message.contains("대기 세션") || result.message.contains("입금 대기")) {
                    Toast.makeText(this@MainActivity, "✅ 통신 성공: 입금 문자 전송 완료!\n(웹에 신청된 대기건이 없어 토큰 지급만 생략됨)", Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(this@MainActivity, "⚠️ 테스트 안내: ${result.message}", Toast.LENGTH_LONG).show()
                }
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

    private fun executeVirtualPushTest() {
        val email = prefs.userEmail ?: return
        binding.progressBar.visibility = View.VISIBLE
        activityScope.launch {
            val now = SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(Date())
            val testBank = "카카오뱅크"
            val testSender = "차민서"
            val testAmount = "5,000"

            val simulatedSms = buildString {
                appendLine("[Web발신]")
                appendLine("[$testBank 푸시] 입금알림")
                appendLine("$now 입금 ${testAmount}원")
                appendLine(testSender)
                appendLine("잔액 99,999,999원")
            }

            val result = withTimeoutOrNull(8000L) {
                ApiClient.sendBankWebhook(
                    webhookUrl = prefs.webhookUrl,
                    fallbackWebhookUrl = prefs.fallbackWebhookUrl,
                    sender = "PUSH:$testBank",
                    smsText = simulatedSms,
                    userEmail = email
                )
            }
            binding.progressBar.visibility = View.GONE

            if (result == null) {
                addLogItem("[$testBank 푸시]", "$testSender ${testAmount}원 입금", false)
                Toast.makeText(this@MainActivity, "⚠️ 가상 푸시 테스트 시간 초과 (8초)\n서버 연결 상태를 확인해 주세요.", Toast.LENGTH_LONG).show()
                return@launch
            }

            addLogItem("[$testBank 푸시]", "$testSender ${testAmount}원 입금", result.success)

            if (result.success) {
                if (prefs.isTtsEnabled) {
                    val speech = result.ttsText ?: "카카오뱅크 푸시 5,000원이 정상 감지되었습니다."
                    TtsManager.speak(this@MainActivity, speech)
                }
                Toast.makeText(this@MainActivity, "🎉 가상 앱 푸시 감지 테스트 성공!\n무료 푸시 알림 ↔ 서버 웹훅 ↔ 토큰 충전 파이프라인 완벽 확인", Toast.LENGTH_LONG).show()
            } else {
                Toast.makeText(this@MainActivity, "✅ 통신 성공: 푸시 전송 완료!\n(${result.message})", Toast.LENGTH_LONG).show()
            }
        }
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
