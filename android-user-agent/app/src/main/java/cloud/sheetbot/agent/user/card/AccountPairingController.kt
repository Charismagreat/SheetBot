package cloud.sheetbot.agent.user.card

import android.content.Context
import android.content.ClipboardManager
import android.content.Intent
import android.os.Build
import android.view.View
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.common.api.ApiException
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.KeepAliveService
import cloud.sheetbot.agent.user.TtsManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

/**
 * 🔗 시트봇 계정 연동 및 페어링 전담 컨트롤러
 *
 * - Google 원클릭 로그인 연동 및 SHA-1 불일치 자동 폴백
 * - 기기 시스템 구글 계정 선택기 연동 (AccountManager)
 * - 구글 이메일 직접 입력 1초 간편 연동 다이얼로그
 * - QR 코드 카메라 스캔 파싱 및 PIN 코드 수동 페어링
 * - 페어링 성공 시 KeepAlive 백그라운드 서비스 기동 및 UI 동기화
 */
class AccountPairingController(
    private val activity: AppCompatActivity,
    private val binding: ActivityMainBinding,
    private val prefs: AppPreferences,
    private val scope: CoroutineScope,
    private val googleSignInClient: GoogleSignInClient,
    private val launchGoogleSignIn: (Intent) -> Unit,
    private val launchAccountPicker: (Intent) -> Unit,
    private val launchQrScan: () -> Unit,
    private val onPairingSuccess: (email: String) -> Unit,
    private val onUnlinkSuccess: () -> Unit,
    private val addLogItem: (title: String, detail: String, success: Boolean) -> Unit
) {

    fun setup() {
        // Google 원클릭 로그인 버튼 (v1.8.0 / v2.0.1 무중단 연동 강화)
        binding.btnGoogleSignIn.setOnClickListener {
            startGoogleSignIn()
        }
        binding.btnGoogleSignIn.setOnLongClickListener {
            showManualEmailPairDialog()
            true
        }

        // 1. QR 코드 스캔 버튼
        binding.btnScanQr.setOnClickListener {
            launchQrScan()
        }

        // 2. 수동 6자리 핀코드 입력 버튼
        binding.btnManualPin.setOnClickListener {
            showManualPinDialog()
        }

        // 5. 계정 삭제 버튼 (화면 최하단 Danger Zone)
        binding.btnUnlink.setOnClickListener {
            showUnlinkConfirmDialog()
        }
    }

    fun showUnlinkConfirmDialog() {
        AlertDialog.Builder(activity)
            .setTitle("계정 삭제")
            .setMessage("시트봇 계정 및 등록된 스마트폰 기기 정보를 삭제하시겠습니까?\n삭제 시 더 이상 고객 알림 및 구글 시트 자동화가 연동되지 않습니다.")
            .setPositiveButton("삭제") { _, _ ->
                val emailToUnlink = prefs.userEmail
                if (!emailToUnlink.isNullOrBlank()) {
                    scope.launch {
                        ApiClient.unlinkDevice(emailToUnlink, "${Build.MANUFACTURER} ${Build.MODEL}")
                    }
                }
                prefs.clear()
                KeepAliveService.stop(activity)
                onUnlinkSuccess()
                Toast.makeText(activity, "계정 정보가 삭제되고 연동이 해제되었습니다.", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("취소", null)
            .show()
    }

    fun startGoogleSignIn() {
        try {
            val signInIntent = googleSignInClient.signInIntent
            launchGoogleSignIn(signInIntent)
        } catch (e: Exception) {
            launchAccountPickerOrManualDialog("기기 계정 선택창으로 즉시 전환합니다.")
        }
    }

    fun handleGoogleSignInResult(data: Intent?) {
        val task = GoogleSignIn.getSignedInAccountFromIntent(data)
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
            android.util.Log.w("AccountPairing", "Google sign-in failed: statusCode=${e.statusCode}")
            if (e.statusCode == 12501) { // 사용자 단순 취소
                Toast.makeText(activity, "구글 로그인이 취소되었습니다.", Toast.LENGTH_SHORT).show()
            } else {
                launchAccountPickerOrManualDialog("구글 보안 인증(코드 ${e.statusCode})으로 인해 스마트폰 계정 선택창으로 안전하게 전환합니다.")
            }
        }
    }

    fun handleAccountPickerResult(resultCode: Int, data: Intent?) {
        if (resultCode == Activity.RESULT_OK && data != null) {
            val email = data.getStringExtra(android.accounts.AccountManager.KEY_ACCOUNT_NAME)
            if (!email.isNullOrBlank()) {
                handleGoogleSignInSuccess(null, email)
                return
            }
        }
        showManualEmailPairDialog()
    }

    fun launchAccountPickerOrManualDialog(guideMsg: String? = null) {
        if (!guideMsg.isNullOrBlank()) {
            Toast.makeText(activity, guideMsg, Toast.LENGTH_LONG).show()
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
            launchAccountPicker(intent)
        } catch (_: Exception) {
            showManualEmailPairDialog()
        }
    }

    /**
     * 구글 계정 이메일 직접 입력 간편 연동 다이얼로그 (v2.0.1)
     */
    fun showManualEmailPairDialog(initialEmail: String = "") {
        val input = EditText(activity).apply {
            hint = "example@gmail.com"
            setText(initialEmail)
            inputType = android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS or android.text.InputType.TYPE_CLASS_TEXT
            setPadding(50, 40, 50, 40)
        }
        AlertDialog.Builder(activity)
            .setTitle("구글 계정 이메일로 1초 연동")
            .setMessage("시트봇(SheetBot) 대시보드에서 사용하는 구글 이메일을 입력해 주세요.\n(SHA-1 지문 등록 없이도 1초 만에 즉시 연동됩니다)")
            .setView(input)
            .setPositiveButton("즉시 연동") { _, _ ->
                val email = input.text.toString().trim()
                if (email.contains("@")) {
                    handleGoogleSignInSuccess(null, email)
                } else {
                    Toast.makeText(activity, "올바른 구글 이메일 형식을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }


    fun handleQrScanResult(contents: String) {
        val parsed = parseQrContents(contents)
        if (parsed != null) {
            val (email, token, pinCode) = parsed
            performPairing(email, token = token, pinCode = pinCode)
        } else {
            AlertDialog.Builder(activity)
                .setTitle("잘못된 QR코드")
                .setMessage("시트봇 알림 센터 전용 QR코드가 아닙니다.\n화면의 QR코드를 다시 확인해 주세요.")
                .setPositiveButton("확인", null)
                .show()
        }
    }

    fun parseQrContents(contents: String): Triple<String, String?, String?>? {
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

    fun showManualPinDialog() {
        val dialogView = activity.layoutInflater.inflate(R.layout.dialog_manual_pin, null)
        val etEmail = dialogView.findViewById<EditText>(R.id.etDialogEmail)
        val etPin = dialogView.findViewById<EditText>(R.id.etDialogPin)

        AlertDialog.Builder(activity)
            .setTitle("6자리 핀코드로 연동")
            .setView(dialogView)
            .setPositiveButton("연동하기") { _, _ ->
                val email = etEmail.text.toString().trim()
                val pin = etPin.text.toString().trim()
                if (email.isBlank() || pin.isBlank()) {
                    Toast.makeText(activity, "이메일과 핀코드를 모두 입력해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                performPairing(email, pinCode = pin)
            }
            .setNegativeButton("취소", null)
            .show()
    }

    fun performPairing(email: String, token: String? = null, pinCode: String? = null) {
        binding.progressBar.visibility = View.VISIBLE
        scope.launch {
            val result = withTimeoutOrNull(8000L) {
                ApiClient.pairDevice(email, token, pinCode)
            }
            binding.progressBar.visibility = View.GONE

            if (result == null) {
                AlertDialog.Builder(activity)
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

                KeepAliveService.start(activity)
                onPairingSuccess(email)

                AlertDialog.Builder(activity)
                    .setTitle("🎉 시트봇 에이전트 연동 성공!")
                    .setMessage("${email} 계정과의 구글 시트 1:1 연동이 완료되었습니다.\n\n• 스마트폰으로 수신된 고객 문자가 구글 시트에 실시간 기록됩니다.\n• 구글 시트에서 0원 문자 일괄 발송이 가능합니다.")
                    .setPositiveButton("확인", null)
                    .show()
            } else {
                AlertDialog.Builder(activity)
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
    fun handleGoogleSignInSuccess(idToken: String?, email: String) {
        binding.progressBar.visibility = View.VISIBLE
        Toast.makeText(activity, "구글 계정($email)으로 시트봇 연동 중...", Toast.LENGTH_SHORT).show()

        var detectedRefCode: String? = null
        try {
            val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
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

        scope.launch {
            val result = withTimeoutOrNull(10000L) {
                ApiClient.pairWithGoogle(idToken, email, referralCode = detectedRefCode)
            }
            binding.progressBar.visibility = View.GONE

            if (result == null) {
                AlertDialog.Builder(activity)
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

                KeepAliveService.start(activity)
            onPairingSuccess(finalEmail)

                addLogItem("구글로그인", "$finalEmail 계정 자동 연동 성공", true)

                if (prefs.isTtsEnabled) {
                    TtsManager.speak(activity, "구글 계정으로 성공적으로 연동되었습니다.")
                }

                AlertDialog.Builder(activity)
                    .setTitle("🎉 Google 원클릭 연동 완료!")
                    .setMessage("${finalEmail} 계정으로 시트봇 에이전트가 0초 만에 연동되었습니다.\n\nPC 화면의 QR 코드를 스캔할 필요 없이 스마트폰 단독으로 연동이 완료되었습니다.\n지금부터 문자/통화/사진/링크가 구글 시트와 실시간 동기화됩니다.")
                    .setPositiveButton("시작하기", null)
                    .show()
            } else {
                AlertDialog.Builder(activity)
                    .setTitle("구글 연동 실패")
                    .setMessage(result.error ?: "구글 계정 연동 처리에 실패했습니다.")
                    .setPositiveButton("확인", null)
                    .show()
            }
        }
    }

}
