package cloud.sheetbot.agent.manager

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private lateinit var prefs: Prefs
    private lateinit var statusView: TextView
    private lateinit var pairButton: Button
    private lateinit var unpairButton: Button
    private lateinit var manualInput: EditText
    private lateinit var manualButton: Button

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        result.contents?.let { handlePairPayload(it) }
    }

    private val permLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        refresh()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        buildUi()
        requestRuntimePermissions()
        if (prefs.isPaired) SmsQueueService.start(this)
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun buildUi() {
        val pad = (16 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        fun title(t: String) = TextView(this).apply { text = t; textSize = 20f; setPadding(0, 0, 0, pad / 2) }
        fun button(t: String, onClick: () -> Unit) = Button(this).apply {
            text = t
            setOnClickListener { onClick() }
        }

        root.addView(title("SheetBot 매니저 SMS"))
        statusView = TextView(this).apply { textSize = 15f; setPadding(0, 0, 0, pad) }
        root.addView(statusView)

        pairButton = button("QR 스캔하여 페어링") {
            scanLauncher.launch(
                ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    .setPrompt("관리자 화면의 페어링 QR을 비추세요").setBeepEnabled(false).setOrientationLocked(false)
            )
        }
        root.addView(pairButton)

        manualInput = EditText(this).apply {
            hint = "또는 페어링 주소(sheetbot-manager://...) 붙여넣기"
            gravity = Gravity.START
        }
        root.addView(manualInput)
        manualButton = button("붙여넣은 주소로 페어링") { handlePairPayload(manualInput.text.toString()) }
        root.addView(manualButton)

        root.addView(button("SMS·알림 권한 허용") { requestRuntimePermissions() })
        root.addView(button("배터리 최적화 제외 요청") { requestIgnoreBattery() })
        unpairButton = button("페어링 해제") {
            SmsQueueService.stop(this)
            prefs.clearPairing()
            refresh()
        }
        root.addView(unpairButton)

        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun handlePairPayload(raw: String) {
        val info = ApiClient.parsePairUri(raw)
        if (info == null) {
            Toast.makeText(this, "올바른 SheetBot 매니저 페어링 코드가 아닙니다.", Toast.LENGTH_LONG).show()
            return
        }
        lifecycleScope.launch {
            val version = try { packageManager.getPackageInfo(packageName, 0).versionName ?: "" } catch (_: Exception) { "" }
            val r = ApiClient.pair(prefs, info, "${Build.MANUFACTURER} ${Build.MODEL}", version)
            r.onSuccess {
                Toast.makeText(this@MainActivity, "페어링 완료: $it", Toast.LENGTH_LONG).show()
                manualInput.setText("")
                SmsQueueService.start(this@MainActivity)
            }.onFailure {
                Toast.makeText(this@MainActivity, it.message ?: "페어링 실패", Toast.LENGTH_LONG).show()
            }
            refresh()
        }
    }

    private fun requestRuntimePermissions() {
        val needed = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.SEND_SMS)
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (needed.isNotEmpty()) permLauncher.launch(needed.toTypedArray())
    }

    private fun requestIgnoreBattery() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (pm.isIgnoringBatteryOptimizations(packageName)) {
            Toast.makeText(this, "이미 배터리 최적화에서 제외되어 있습니다.", Toast.LENGTH_SHORT).show()
            return
        }
        try {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
            )
        } catch (_: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun refresh() {
        val smsOk = ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED
        val sb = StringBuilder()
        if (prefs.isPaired) {
            sb.append("✅ 페어링됨: ${prefs.label ?: prefs.deviceId}\n서버: ${prefs.server}\n")
            sb.append("상태: ${prefs.lastStatus.ifBlank { "시작 중" }}\n")
        } else {
            sb.append("⚠️ 페어링되지 않음. 관리자 화면의 QR을 스캔하세요.\n")
        }
        sb.append(if (smsOk) "✅ SMS 발송 권한 허용됨" else "⚠️ SMS 발송 권한이 필요합니다")
        statusView.text = sb.toString()

        pairButton.isEnabled = !prefs.isPaired
        manualButton.isEnabled = !prefs.isPaired
        manualInput.isEnabled = !prefs.isPaired
        unpairButton.isEnabled = prefs.isPaired
    }
}
