package cloud.sheetbot.agent.user.card

import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.SmsSenderUtil
import cloud.sheetbot.agent.user.TtsManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 💳 매장 결제 푸시 & 고객 영수증 문자 자동 발송 카드 제어 컨트롤러
 * 
 * - 결제 푸시 수신 감지 및 시트 연동 토글
 * - 실시간 TTS 음성 안내 토글
 * - 영수증 문자 발송 템플릿 설정 및 기본값 복원
 * - 영수증 문자 즉시 테스트 팝업 (SmsSenderUtil 연동)
 * - 영수증 발송 조건 종합 진단 팝업 (5단계 실시간 파이프라인 검증)
 * - 결제 푸시 대장 / 영수증 발송 대장 바로가기
 * - 카드 펼침/접힘 상태 관리
 */
class PaymentReceiptCardController(
    private val activity: AppCompatActivity,
    private val binding: ActivityMainBinding,
    private val prefs: AppPreferences,
    private val scope: CoroutineScope,
    private val isNotificationListenerEnabled: () -> Boolean,
    private val requestNotificationListenerPermission: () -> Unit,
    private val provisionSheetAsync: (type: String, defaultTitle: String) -> Unit,
    private val showOpenSheetChooserDialog: (type: String, title: String) -> Unit,
    private val updateCardCollapseState: (layout: View, button: View, isHidden: Boolean) -> Unit
) {

    fun setup() {
        binding.switchTts.isChecked = prefs.isTtsEnabled
        binding.switchTts.setOnCheckedChangeListener { _, isChecked ->
            prefs.isTtsEnabled = isChecked
            if (isChecked) TtsManager.speak(activity, "실시간 음성 안내가 활성화되었습니다.")
        }

        binding.switchReceiptSms.isChecked = prefs.isReceiptSmsEnabled
        binding.layoutReceiptSmsSettings.visibility = if (prefs.isReceiptSmsEnabled) View.VISIBLE else View.GONE
        binding.etReceiptSmsTemplate.setText(prefs.receiptSmsTemplate)

        binding.switchReceiptSms.setOnCheckedChangeListener { _, isChecked ->
            prefs.isReceiptSmsEnabled = isChecked
            binding.layoutReceiptSmsSettings.visibility = if (isChecked) View.VISIBLE else View.GONE
            val msg = if (isChecked) "고객 영수증 문자 자동 전송이 켜졌습니다." else "고객 영수증 문자 자동 전송이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
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
            Toast.makeText(activity, "영수증 문자 문구가 기본값으로 복원되었습니다.", Toast.LENGTH_SHORT).show()
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
                Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
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
    }

    fun refreshCollapseState() {
        updateCardCollapseState(
            binding.layoutPaymentReceiptDetails,
            binding.btnTogglePaymentReceiptDetails,
            prefs.isPaymentReceiptDetailsHidden
        )
    }

    fun toggleCollapse() {
        prefs.isPaymentReceiptDetailsHidden = !prefs.isPaymentReceiptDetailsHidden
        refreshCollapseState()
    }

    /**
     * 🧪 영수증 문자 발송 즉시 테스트 및 권한/시트/단말기 발송 상태 실시간 진단 다이얼로그
     */
    private fun showReceiptSmsTestDialog() {
        val hasSendSmsPerm = androidx.core.content.ContextCompat.checkSelfPermission(activity, android.Manifest.permission.SEND_SMS
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED

        val dialogView = android.widget.LinearLayout(activity).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(40, 30, 40, 20)
            setBackgroundColor(android.graphics.Color.parseColor("#1E293B"))
        }

        // 권한 상태 뱃지
        val tvPermStatus = android.widget.TextView(activity).apply {
            text = if (hasSendSmsPerm) "✅ [정상] 스마트폰 SMS 전송 권한 허용됨" else "⚠️ [경고] SMS 전송 권한 미허용 상태입니다!\n(아래 테스트 발송 시 권한 허용 팝업이 뜹니다)"
            setTextColor(if (hasSendSmsPerm) android.graphics.Color.parseColor("#34D399") else android.graphics.Color.parseColor("#F87171"))
            textSize = 12f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setPadding(0, 0, 0, 16)
        }
        dialogView.addView(tvPermStatus)

        // 수신 전화번호 입력란
        val tvPhoneLabel = android.widget.TextView(activity).apply {
            text = "📱 테스트 수신 휴대폰 번호:"
            setTextColor(android.graphics.Color.parseColor("#E2E8F0"))
            textSize = 12f
        }
        dialogView.addView(tvPhoneLabel)

        val etPhone = android.widget.EditText(activity).apply {
            setText("010-7523-5071")
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(android.graphics.Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            textSize = 13f
            inputType = android.text.InputType.TYPE_CLASS_PHONE
        }
        dialogView.addView(etPhone)

        // 고객명 & 금액
        val tvCustLabel = android.widget.TextView(activity).apply {
            text = "👤 고객명 / 💰 금액(원):"
            setTextColor(android.graphics.Color.parseColor("#E2E8F0"))
            textSize = 12f
            setPadding(0, 16, 0, 4)
        }
        dialogView.addView(tvCustLabel)

        val rowLayout = android.widget.LinearLayout(activity).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
        }
        val etCustName = android.widget.EditText(activity).apply {
            layoutParams = android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = 8
            }
            setText("차민서")
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(android.graphics.Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            textSize = 13f
        }
        val etAmount = android.widget.EditText(activity).apply {
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
        val tvPreview = android.widget.TextView(activity).apply {
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

        val dialog = androidx.appcompat.app.AlertDialog.Builder(activity)
            .setTitle("🧪 영수증 문자 발송 테스트")
            .setView(dialogView)
            .setPositiveButton("🚀 테스트 발송", null)
            .setNegativeButton("닫기", null)
            .create()

        dialog.show()

        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            // 권한 체크 및 필요 시 즉시 요청
            if (androidx.core.content.ContextCompat.checkSelfPermission(activity, android.Manifest.permission.SEND_SMS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                androidx.core.app.ActivityCompat.requestPermissions(activity, arrayOf(android.Manifest.permission.SEND_SMS), 1088
                )
                Toast.makeText(activity, "SMS 발송 권한이 필요합니다. 팝업에서 [허용]을 눌러주세요.", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            val phone = etPhone.text.toString().trim()
            val name = etCustName.text.toString().trim().ifBlank { "고객" }
            val amt = etAmount.text.toString().trim().toLongOrNull() ?: 0L

            if (phone.isBlank()) {
                Toast.makeText(activity, "수신자 번호를 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val tpl = prefs.receiptSmsTemplate.takeIf { it.isNotBlank() }
                ?: "[SheetBot] {고객명}님, {금액} 결제가 정상 확인되었습니다. 이용해 주셔서 감사합니다."
            val rawMsg = SmsSenderUtil.formatReceiptMessage(tpl, name, amt)

            // 백그라운드 발송 및 대장 동기화
            scope.launch(Dispatchers.IO) {
                val (isSent, finalMsg) = SmsSenderUtil.sendSmsDetailed(activity, phone, rawMsg)
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

                    androidx.appcompat.app.AlertDialog.Builder(activity)
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
        val dialogView = android.widget.LinearLayout(activity).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(40, 30, 40, 20)
            setBackgroundColor(android.graphics.Color.parseColor("#1E293B"))
        }

        val tvDesc = android.widget.TextView(activity).apply {
            text = "실제 은행 송금 없이 가상 입금 문자를 발생시켜 구글 시트 [주문접수대장] 실시간 매칭부터 영수증 발송까지 전 과정을 1초 만에 종합 진단합니다."
            setTextColor(android.graphics.Color.parseColor("#94A3B8"))
            textSize = 12f
            setPadding(0, 0, 0, 16)
        }
        dialogView.addView(tvDesc)

        // 고객명 & 금액 입력
        val tvCustLabel = android.widget.TextView(activity).apply {
            text = "👤 진단 대상 고객명 / 💰 결제 금액(원):"
            setTextColor(android.graphics.Color.parseColor("#E2E8F0"))
            textSize = 12f
            setPadding(0, 8, 0, 4)
        }
        dialogView.addView(tvCustLabel)

        val rowLayout = android.widget.LinearLayout(activity).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
        }
        val etCustName = android.widget.EditText(activity).apply {
            layoutParams = android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = 8
            }
            setText("차민서")
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(android.graphics.Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            textSize = 13f
        }
        val etAmount = android.widget.EditText(activity).apply {
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
        val cbSendRealSms = android.widget.CheckBox(activity).apply {
            text = "매칭 성공 시 고객 번호로 실제 SMS 영수증 발송 & 대장 기록"
            isChecked = true
            setTextColor(android.graphics.Color.parseColor("#38BDF8"))
            textSize = 12f
            setPadding(0, 16, 0, 8)
        }
        dialogView.addView(cbSendRealSms)

        val dialog = androidx.appcompat.app.AlertDialog.Builder(activity)
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
                Toast.makeText(activity, "계정이 연동되어 있지 않습니다.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            dialog.dismiss()

            // 로딩 안내 토스트
            Toast.makeText(activity, "🔍 [1/5] 영수증 발송 조건 종합 진단을 시작합니다...", Toast.LENGTH_SHORT).show()

            scope.launch(Dispatchers.IO) {
                val reportLines = mutableListOf<String>()

                // 1단계: SMS 발송 권한 검사
                val hasSmsPermission = androidx.core.content.ContextCompat.checkSelfPermission(
                    activity, android.Manifest.permission.SEND_SMS
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
                            val (isSent, finalMsg) = SmsSenderUtil.sendSmsDetailed(activity, matchedPhone, trimmedMsg)
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
                    androidx.appcompat.app.AlertDialog.Builder(activity)
                        .setTitle(reportTitle)
                        .setMessage(reportLines.joinToString("\n\n"))
                        .setPositiveButton("확인", null)
                        .show()
                }
            }
        }
    }

    /**
     * ⚖️ AI 법률/계약서 팩트체크 카드 초기화 및 컨트롤러 바인딩 (v2.1.99 리팩토링 모듈화)
     */
}
