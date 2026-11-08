package cloud.sheetbot.agent.user.card

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import cloud.sheetbot.agent.user.FileToSheetClient
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.R
import cloud.sheetbot.agent.user.SmsSenderUtil
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 🔐 내 SaaS 휴대폰 로그인 인증(OTP) 0원 중계기 카드 전담 컨트롤러
 *
 * - 시트봇 모바일 앱 이용자가 자신이 개발 중인 SaaS 서비스에 휴대폰 번호 로그인 기능을 1분 만에 연동
 * - 내 스마트폰의 무제한 문자 요금제(0원)로 6자리 인증번호를 즉시 발송
 * - 발송 내역 및 인증 성공 여부를 파일투시트/구글시트의 'SaaS인증발송대장'에 실시간 자동 기록
 * - 통신사 스팸 차단 방지를 위한 일일 발송 한도(기본 150건) 및 동일 번호 60초 쿨다운 내장
 */
class SaasOtpRelayCardController(
    private val activity: MainActivity,
    private val prefs: PreferencesManager,
    private val scope: CoroutineScope,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onProvisionSheet: (sheetType: String, defaultTitle: String) -> Unit,
    private val addLogItem: (sender: String, body: String, success: Boolean) -> Unit
) {
    private var cardView: View? = null
    private var headerView: View? = null
    private var switchCompat: androidx.appcompat.widget.SwitchCompat? = null
    private var btnToggle: TextView? = null
    private var layoutDetails: View? = null
    private var etBrandName: EditText? = null
    private var etDailyLimit: EditText? = null
    private var tvApiKey: TextView? = null
    private var btnCopyKey: View? = null
    private var btnRegenKey: View? = null
    private var btnCopyAiPrompt: View? = null
    private var btnOpenSheet: View? = null
    private var btnTestOtp: View? = null

    fun setup() {
        findViews()
        setupListeners()
        refreshCollapseState()
    }

    private fun findViews() {
        cardView = activity.findViewById(R.id.cardSaasOtpRelay)
        headerView = activity.findViewById(R.id.layoutSaasOtpRelayHeader)
        switchCompat = activity.findViewById(R.id.switchSaasOtpRelay)
        btnToggle = activity.findViewById(R.id.btnToggleSaasOtpRelayDetails)
        layoutDetails = activity.findViewById(R.id.layoutSaasOtpRelayDetails)
        etBrandName = activity.findViewById(R.id.etSaasOtpBrandName)
        etDailyLimit = activity.findViewById(R.id.etSaasOtpDailyLimit)
        tvApiKey = activity.findViewById(R.id.tvSaasOtpApiKey)
        btnCopyKey = activity.findViewById(R.id.btnCopySaasOtpKey)
        btnRegenKey = activity.findViewById(R.id.btnRegenSaasOtpKey)
        btnCopyAiPrompt = activity.findViewById(R.id.btnCopySaasOtpAiPrompt)
        btnOpenSheet = activity.findViewById(R.id.btnOpenSaasOtpSheet)
        btnTestOtp = activity.findViewById(R.id.btnTestSaasOtp)
    }

    private fun setupListeners() {
        switchCompat?.isChecked = prefs.isSaasOtpRelayEnabled
        etBrandName?.setText(prefs.saasOtpBrandName)
        etDailyLimit?.setText(prefs.saasOtpDailyLimit.toString())
        tvApiKey?.text = prefs.saasOtpApiKey

        val toggleAction = View.OnClickListener { toggleCollapse() }
        headerView?.setOnClickListener(toggleAction)
        btnToggle?.setOnClickListener(toggleAction)

        switchCompat?.setOnCheckedChangeListener { _, isChecked ->
            prefs.isSaasOtpRelayEnabled = isChecked
            prefs.isSaasOtpRelayDetailsHidden = !isChecked
            refreshCollapseState()

            val msg = if (isChecked) {
                "🔐 내 SaaS 휴대폰 인증(OTP) 0원 중계기가 켜졌습니다."
            } else {
                "내 SaaS 휴대폰 인증(OTP) 중계기가 꺼졌습니다."
            }
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()

            if (isChecked) {
                onProvisionSheet("SAAS_OTP_RELAY", "[SheetBot] SaaS 인증발송 대장")
                scope.launch {
                    FileToSheetClient.fetchPendingSaasOtps(prefs)
                }
            }
        }

        etBrandName?.doAfterTextChanged {
            val text = it?.toString()?.trim().orEmpty()
            prefs.saasOtpBrandName = text.ifBlank { "내SaaS" }
        }

        etDailyLimit?.doAfterTextChanged {
            val num = it?.toString()?.trim()?.toIntOrNull()
            if (num != null && num in 10..400) {
                prefs.saasOtpDailyLimit = num
            }
        }

        btnCopyKey?.setOnClickListener {
            copyToClipboard("SaaS OTP API Key", prefs.saasOtpApiKey)
            Toast.makeText(activity, "✅ 전용 API Key가 복사되었습니다.", Toast.LENGTH_SHORT).show()
        }

        btnRegenKey?.setOnClickListener {
            AlertDialog.Builder(activity)
                .setTitle("🔄 전용 API Key 재발급")
                .setMessage("새로운 API Key를 발급하시겠습니까?\n기존 키로 연동된 SaaS 서버의 환경변수도 새 키로 변경해야 합니다.")
                .setPositiveButton("재발급") { _, _ ->
                    val newKey = prefs.regenerateSaasOtpApiKey()
                    tvApiKey?.text = newKey
                    scope.launch { FileToSheetClient.fetchPendingSaasOtps(prefs) }
                    Toast.makeText(activity, "🎉 새 API Key가 발급되었습니다.", Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton("취소", null)
                .show()
        }

        btnCopyAiPrompt?.setOnClickListener {
            val promptText = buildAiCodingPrompt()
            copyToClipboard("SaaS OTP AI Prompt", promptText)
            AlertDialog.Builder(activity)
                .setTitle("🤖 AI 코딩용 프롬프트 복사 완료!")
                .setMessage(
                    "클립보드에 휴대폰 로그인 연동 프롬프트가 복사되었습니다.\n\n" +
                    "사용 중인 AI 코딩 도구(Antigravity, Cursor, Claude 등) 채팅창에 그대로 붙여넣기(Ctrl+V) 하시면,\n" +
                    "개발 중인 SaaS에 0원 휴대폰 번호 로그인 기능이 자동 구현됩니다!"
                )
                .setPositiveButton("확인", null)
                .show()
        }

        btnOpenSheet?.setOnClickListener {
            onOpenSheetChooser("SAAS_OTP_RELAY", "[SheetBot] SaaS 인증발송 대장")
        }

        btnTestOtp?.setOnClickListener {
            showInteractiveTestDialog()
        }
    }

    fun toggleCollapse() {
        prefs.isSaasOtpRelayDetailsHidden = !prefs.isSaasOtpRelayDetailsHidden
        refreshCollapseState()
    }

    fun refreshCollapseState() {
        val isHidden = prefs.isSaasOtpRelayDetailsHidden
        layoutDetails?.visibility = if (isHidden) View.GONE else View.VISIBLE
        btnToggle?.text = if (isHidden) "▼" else "▲"
    }

    private fun copyToClipboard(label: String, text: String) {
        val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText(label, text))
    }

    private fun buildAiCodingPrompt(): String {
        val apiKey = prefs.saasOtpApiKey
        val brandName = prefs.saasOtpBrandName
        val baseUrl = FileToSheetClient.FTS_OFFICIAL_DOMAIN

        return """
우리 SaaS 서비스에 '시트봇 모바일 0원 SMS OTP 중계 API'를 연동하여 휴대폰 번호 로그인(인증번호 발송 및 6자리 검증) 기능을 구현해 주세요.

### 1. 연동 설정 정보
- **서비스명(브랜드명)**: `$brandName`
- **전용 API Key**: `$apiKey`
- **API Base URL**: `$baseUrl`

### 2. API 명세 (외부 DB에 별도 OTP 테이블을 만들 필요 없이 발송·검증·대장 기록이 원스톱 처리됩니다)

#### (1) 인증번호 발송 요청: `POST $baseUrl/api/saas/otp/send`
- **Headers**:
  - `Content-Type: application/json`
  - `x-saas-otp-key: $apiKey`
- **Request Body**:
```json
{
  "apiKey": "$apiKey",
  "phoneNumber": "010-1234-5678",
  "brandName": "$brandName",
  "purpose": "로그인"
}
```
- **Response (200 OK)**:
```json
{
  "success": true,
  "requestId": "otp_...",
  "status": "SENT",
  "recipient": "010-1234-5678",
  "expiresInSeconds": 300
}
```

#### (2) 6자리 인증번호 검증 요청: `POST $baseUrl/api/saas/otp/verify`
- **Headers**:
  - `Content-Type: application/json`
  - `x-saas-otp-key: $apiKey`
- **Request Body**:
```json
{
  "apiKey": "$apiKey",
  "phoneNumber": "010-1234-5678",
  "code": "123456"
}
```
- **Response (200 OK)**:
```json
{
  "success": true,
  "verified": true,
  "phoneNumber": "010-1234-5678",
  "verifiedAt": "2026-11-08 15:00:00"
}
```

### 3. 구현 요청사항
1. 서버 환경변수(`SAAS_OTP_API_KEY=$apiKey`)를 사용해 위 두 엔드포인트를 호출하는 백엔드 라우트(`/api/auth/phone/send`, `/api/auth/phone/verify`)를 작성해 주세요.
2. 로그인 화면에서 휴대폰 번호 입력 -> [인증번호 받기] 클릭 -> 5분 타이머 및 6자리 인증번호 입력 -> [인증 확인] 성공 시 세션/토큰을 발급해 로그인 처리해 주세요.
        """.trimIndent()
    }

    /**
     * 🧪 1단계(내 폰에서 OTP 문자 즉시 발송) + 2단계(수신한 6자리 번호 검증 및 대장 '✅ 인증성공' 갱신) 양방향 테스트 다이얼로그
     */
    private fun showInteractiveTestDialog() {
        val hasSendSmsPerm = ContextCompat.checkSelfPermission(
            activity, android.Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED

        val dialogView = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(42, 32, 42, 20)
            setBackgroundColor(Color.parseColor("#1E293B"))
        }

        val tvPermStatus = TextView(activity).apply {
            text = if (hasSendSmsPerm) {
                "✅ [정상] 내 스마트폰 SMS 발송 권한 확인됨 (0원 발송 준비 완료)"
            } else {
                "⚠️ [주의] SMS 전송 권한이 없습니다. 앱 권한 설정에서 SMS 권한을 허용해 주세요."
            }
            setTextColor(if (hasSendSmsPerm) Color.parseColor("#34D399") else Color.parseColor("#F87171"))
            textSize = 11.5f
            setPadding(0, 0, 0, 14)
        }
        dialogView.addView(tvPermStatus)

        val tvPhoneLabel = TextView(activity).apply {
            text = "1️⃣ 테스트 인증번호를 받을 휴대폰 번호:"
            setTextColor(Color.parseColor("#E2E8F0"))
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
        }
        dialogView.addView(tvPhoneLabel)

        val defaultPhone = prefs.ftsPhoneNumber?.takeIf { it.isNotBlank() } ?: "010-7523-5071"
        val etPhone = EditText(activity).apply {
            setText(defaultPhone)
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(24, 18, 24, 18)
            textSize = 13f
            isSingleLine = true
        }
        dialogView.addView(etPhone)

        val tvStatusResult = TextView(activity).apply {
            text = "아래 [📲 1단계: 인증번호 발송] 버튼을 누르면 내 폰에서 인증문자가 즉시 발송되고 'SaaS인증발송대장'에 기록됩니다."
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 11f
            setPadding(0, 12, 0, 10)
        }
        dialogView.addView(tvStatusResult)

        val btnSendStep = Button(activity).apply {
            text = "📲 1단계: 내 폰에서 인증번호(OTP) 발송"
            setBackgroundColor(Color.parseColor("#0284C7"))
            setTextColor(Color.WHITE)
            textSize = 12f
        }
        dialogView.addView(btnSendStep)

        val tvVerifyLabel = TextView(activity).apply {
            text = "2️⃣ 문자로 도착한 6자리 인증번호 검증 테스트:"
            setTextColor(Color.parseColor("#E2E8F0"))
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            setPadding(0, 22, 0, 6)
        }
        dialogView.addView(tvVerifyLabel)

        val etOtpCode = EditText(activity).apply {
            hint = "수신한 6자리 숫자 입력 (예: 482910)"
            setHintTextColor(Color.parseColor("#64748B"))
            setTextColor(Color.parseColor("#34D399"))
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(24, 18, 24, 18)
            textSize = 13.5f
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            isSingleLine = true
        }
        dialogView.addView(etOtpCode)

        val btnVerifyStep = Button(activity).apply {
            text = "✅ 2단계: 인증번호 검증 (대장 '인증성공' 갱신)"
            setBackgroundColor(Color.parseColor("#059669"))
            setTextColor(Color.WHITE)
            textSize = 12f
        }
        val lpVerify = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = 10 }
        dialogView.addView(btnVerifyStep, lpVerify)

        btnSendStep.setOnClickListener {
            val targetPhone = etPhone.text.toString().trim()
            if (targetPhone.isBlank()) {
                Toast.makeText(activity, "수신 휴대폰 번호를 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (!prefs.isSaasOtpRelayEnabled) {
                prefs.isSaasOtpRelayEnabled = true
                switchCompat?.isChecked = true
            }

            btnSendStep.isEnabled = false
            btnSendStep.text = "⏳ 발송 및 대장 기록 중..."
            tvStatusResult.setTextColor(Color.parseColor("#38BDF8"))
            tvStatusResult.text = "서버에서 6자리 난수를 생성하고 내 폰으로 문자를 발송하고 있습니다..."

            scope.launch {
                val reqRes = FileToSheetClient.requestSaasOtpTestSend(
                    prefs = prefs,
                    recipientPhone = targetPhone,
                    brandName = prefs.saasOtpBrandName,
                    purpose = "로그인테스트"
                )
                // 대기 루프(2.5초)를 기다리지 않고 즉시 큐를 처리해 0.5초 내 문자 발송 완료!
                val sentCnt = SmsSenderUtil.processPendingSaasOtps(activity)

                withContext(Dispatchers.Main) {
                    btnSendStep.isEnabled = true
                    btnSendStep.text = "📲 1단계: 내 폰에서 인증번호(OTP) 재발송"
                    if (reqRes.success || sentCnt > 0) {
                        tvStatusResult.setTextColor(Color.parseColor("#34D399"))
                        tvStatusResult.text = "🎉 발송 성공! [$targetPhone] 번호로 도착한 6자리 인증번호를 아래 칸에 입력해 검증까지 완료해 보세요."
                        addLogItem("SaaS OTP 테스트", "수신: $targetPhone (${prefs.saasOtpBrandName})", true)
                    } else {
                        // 오프라인 단독 테스트 폴백
                        val fallbackCode = (100000..999999).random().toString()
                        val msg = "[${prefs.saasOtpBrandName}] 인증번호 [$fallbackCode]를 입력해주세요."
                        val (localSent, _) = SmsSenderUtil.sendSmsDetailed(activity, targetPhone, msg)
                        if (localSent) {
                            tvStatusResult.setTextColor(Color.parseColor("#34D399"))
                            tvStatusResult.text = "✅ 단말기 직접 발송 성공! (인증번호: $fallbackCode)"
                            etOtpCode.setText(fallbackCode)
                        } else {
                            tvStatusResult.setTextColor(Color.parseColor("#F87171"))
                            tvStatusResult.text = "❌ 발송 실패: ${reqRes.error ?: "SMS 권한 또는 번호를 확인해 주세요."}"
                        }
                    }
                }
            }
        }

        btnVerifyStep.setOnClickListener {
            val targetPhone = etPhone.text.toString().trim()
            val code = etOtpCode.text.toString().trim()
            if (code.length < 4) {
                Toast.makeText(activity, "문자로 수신한 6자리 인증번호를 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            btnVerifyStep.isEnabled = false
            btnVerifyStep.text = "⏳ 검증 확인 중..."

            scope.launch {
                val verRes = FileToSheetClient.verifySaasOtpTestCode(
                    prefs = prefs,
                    recipientPhone = targetPhone,
                    code = code
                )
                withContext(Dispatchers.Main) {
                    btnVerifyStep.isEnabled = true
                    btnVerifyStep.text = "✅ 2단계: 인증번호 검증 (대장 '인증성공' 갱신)"
                    if (verRes.verified) {
                        tvStatusResult.setTextColor(Color.parseColor("#34D399"))
                        tvStatusResult.text = "🎉 인증 완료! 'SaaS인증발송대장'의 인증완료여부가 [✅ 인증성공]으로 실시간 업데이트되었습니다!"
                        Toast.makeText(activity, "🎉 인증 성공! 대장에 인증완료로 기록되었습니다.", Toast.LENGTH_LONG).show()
                        addLogItem("SaaS OTP 인증성공", "$targetPhone 인증 완료", true)
                    } else {
                        tvStatusResult.setTextColor(Color.parseColor("#F87171"))
                        tvStatusResult.text = "❌ 검증 실패: ${verRes.error ?: "인증번호가 일치하지 않습니다."}"
                    }
                }
            }
        }

        AlertDialog.Builder(activity)
            .setTitle("🧪 내 SaaS 휴대폰 인증(OTP) 1초 테스트")
            .setView(dialogView)
            .setPositiveButton("📊 대장 열기") { _, _ ->
                onOpenSheetChooser("SAAS_OTP_RELAY", "[SheetBot] SaaS 인증발송 대장")
            }
            .setNegativeButton("닫기", null)
            .show()
    }
}
