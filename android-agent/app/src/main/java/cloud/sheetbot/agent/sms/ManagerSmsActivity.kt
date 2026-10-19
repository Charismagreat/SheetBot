package cloud.sheetbot.agent.sms

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
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

/** Agent M 안의 "인증번호 SMS 발송" 설정 화면: QR 페어링 / 권한 / 해제 */
class ManagerSmsActivity : AppCompatActivity() {
    private lateinit var prefs: ManagerSmsPrefs
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
        prefs = ManagerSmsPrefs(this)
        buildUi()
        requestRuntimePermissions()
        if (prefs.isPaired) ManagerSmsService.start(this)
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
            setBackgroundColor(Color.parseColor("#0F172A"))
        }
        fun button(t: String, onClick: () -> Unit) = Button(this).apply {
            text = t
            setOnClickListener { onClick() }
        }

        root.addView(TextView(this).apply {
            text = "인증번호 SMS 발송 (FileToSheet)"
            textSize = 20f
            setTextColor(Color.WHITE)
            setPadding(0, 0, 0, pad / 2)
        })
        statusView = TextView(this).apply {
            textSize = 15f
            setTextColor(Color.parseColor("#E2E8F0"))
            setPadding(0, 0, 0, pad)
        }
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
            setHintTextColor(Color.parseColor("#64748B"))
            setTextColor(Color.WHITE)
            gravity = Gravity.START
        }
        root.addView(manualInput)
        manualButton = button("붙여넣은 주소로 페어링") { handlePairPayload(manualInput.text.toString()) }
        root.addView(manualButton)

        root.addView(button("SMS·알림 권한 허용") { requestRuntimePermissions() })
        unpairButton = button("페어링 해제") {
            ManagerSmsService.stop(this)
            prefs.clearPairing()
            refresh()
        }
        root.addView(unpairButton)

        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun handlePairPayload(raw: String) {
        val info = ManagerSmsApi.parsePairUri(raw)
        if (info == null) {
            Toast.makeText(this, "올바른 SheetBot 매니저 페어링 코드가 아닙니다.", Toast.LENGTH_LONG).show()
            return
        }
        lifecycleScope.launch {
            val version = try { packageManager.getPackageInfo(packageName, 0).versionName ?: "" } catch (_: Exception) { "" }
            val r = ManagerSmsApi.pair(prefs, info, "${Build.MANUFACTURER} ${Build.MODEL}", version)
            r.onSuccess {
                Toast.makeText(this@ManagerSmsActivity, "페어링 완료: $it", Toast.LENGTH_LONG).show()
                manualInput.setText("")
                ManagerSmsService.start(this@ManagerSmsActivity)
            }.onFailure {
                Toast.makeText(this@ManagerSmsActivity, it.message ?: "페어링 실패", Toast.LENGTH_LONG).show()
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
