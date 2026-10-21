package cloud.sheetbot.agent.user.card

import android.content.pm.PackageManager
import android.graphics.Color
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.SmsSenderUtil
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 🎯 구글 시트 체크박스 감지 문자 자동 발송 카드 전담 컨트롤러
 *
 * - 구글 시트 특정 탭에서 체크박스 [V] 선택 시 스마트폰에서 0원 문자 자동 발송
 * - Apps Script 코드는 앱 화면에서 100% 은닉하고 직관적인 바로가기/설정만 제공
 * - 감시 탭 이름 실시간 설정
 * - 연동 시트 원터치 프로비저닝 및 뷰어 오픈
 * - 1초 즉시 테스트 발송 지원
 */
class SheetSmsCheckboxCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val scope: CoroutineScope,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onProvisionSheet: (sheetType: String, defaultTitle: String) -> Unit
) {
    // 레이아웃 include 된 뷰 참조 바인딩
    private var cardView: View? = null
    private var headerView: View? = null
    private var switchCompat: androidx.appcompat.widget.SwitchCompat? = null
    private var btnToggle: TextView? = null
    private var layoutDetails: View? = null
    private var etTargetTab: EditText? = null
    private var btnOpenSheet: View? = null
    private var btnTestSms: View? = null

    fun setup() {
        findViews()
        setupListeners()
        refreshCollapseState()
    }

    private fun findViews() {
        cardView = activity.findViewById(cloud.sheetbot.agent.user.R.id.cardSheetSmsCheckbox)
        headerView = activity.findViewById(cloud.sheetbot.agent.user.R.id.layoutSheetSmsCheckboxHeader)
        switchCompat = activity.findViewById(cloud.sheetbot.agent.user.R.id.switchSheetSmsCheckbox)
        btnToggle = activity.findViewById(cloud.sheetbot.agent.user.R.id.btnToggleSheetSmsCheckboxDetails)
        layoutDetails = activity.findViewById(cloud.sheetbot.agent.user.R.id.layoutSheetSmsCheckboxDetails)
        etTargetTab = activity.findViewById(cloud.sheetbot.agent.user.R.id.etSheetSmsTargetTab)
        btnOpenSheet = activity.findViewById(cloud.sheetbot.agent.user.R.id.btnOpenSheetSmsSheet)
        btnTestSms = activity.findViewById(cloud.sheetbot.agent.user.R.id.btnTestSheetSms)
    }

    private fun setupListeners() {
        switchCompat?.isChecked = prefs.isSheetSmsCheckboxEnabled
        etTargetTab?.setText(prefs.sheetSmsTargetTab)

        val toggleAction = View.OnClickListener { toggleCollapse() }
        headerView?.setOnClickListener(toggleAction)
        btnToggle?.setOnClickListener(toggleAction)

        switchCompat?.setOnCheckedChangeListener { _, isChecked ->
            prefs.isSheetSmsCheckboxEnabled = isChecked
            prefs.isSheetSmsCheckboxDetailsHidden = !isChecked
            refreshCollapseState()

            val msg = if (isChecked) {
                "시트 체크박스 문자 발송 기능이 켜졌습니다."
            } else {
                "시트 체크박스 문자 발송 기능이 꺼졌습니다."
            }
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()

            if (isChecked) {
                onProvisionSheet("SHEET_SMS_CHECKBOX", "[SheetBot] 체크박스 문자 발송 대장")
            }
        }

        etTargetTab?.doAfterTextChanged {
            val text = it?.toString()?.trim() ?: "문자발송목록"
            prefs.sheetSmsTargetTab = text.ifBlank { "문자발송목록" }
        }

        btnOpenSheet?.setOnClickListener {
            onOpenSheetChooser("SHEET_SMS_CHECKBOX", "[SheetBot] 체크박스 문자 발송 대장")
        }

        btnTestSms?.setOnClickListener {
            showTestDialog()
        }
    }

    fun toggleCollapse() {
        prefs.isSheetSmsCheckboxDetailsHidden = !prefs.isSheetSmsCheckboxDetailsHidden
        refreshCollapseState()
    }

    fun refreshCollapseState() {
        val isHidden = prefs.isSheetSmsCheckboxDetailsHidden
        layoutDetails?.visibility = if (isHidden) View.GONE else View.VISIBLE
        btnToggle?.text = if (isHidden) "▼" else "▲"
    }

    /**
     * 🧪 1초 즉시 테스트 발송 다이얼로그
     */
    private fun showTestDialog() {
        val hasSendSmsPerm = ContextCompat.checkSelfPermission(
            activity, android.Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED

        val dialogView = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 30, 40, 20)
            setBackgroundColor(Color.parseColor("#1E293B"))
        }

        val tvPermStatus = TextView(activity).apply {
            text = if (hasSendSmsPerm) "✅ [정상] 스마트폰 SMS 전송 권한 허용됨" else "⚠️ [경고] SMS 전송 권한 미허용 상태입니다."
            setTextColor(if (hasSendSmsPerm) Color.parseColor("#34D399") else Color.parseColor("#F87171"))
            textSize = 12f
            setPadding(0, 0, 0, 16)
        }
        dialogView.addView(tvPermStatus)

        val tvPhoneLabel = TextView(activity).apply {
            text = "📱 테스트 수신 휴대폰 번호:"
            setTextColor(Color.parseColor("#E2E8F0"))
            textSize = 12f
        }
        dialogView.addView(tvPhoneLabel)

        val etPhone = EditText(activity).apply {
            setText("010-7523-5071")
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            textSize = 13f
        }
        dialogView.addView(etPhone)

        val tvMsgLabel = TextView(activity).apply {
            text = "💬 테스트 발송 문구:"
            setTextColor(Color.parseColor("#E2E8F0"))
            textSize = 12f
            setPadding(0, 12, 0, 4)
        }
        dialogView.addView(tvMsgLabel)

        val etMessage = EditText(activity).apply {
            setText("[시트봇] 시트 체크박스 문자 자동 발송 테스트입니다.")
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            textSize = 13f
        }
        dialogView.addView(etMessage)

        AlertDialog.Builder(activity)
            .setTitle("🧪 시트 체크박스 문자 즉시 테스트")
            .setView(dialogView)
            .setPositiveButton("발송 시작") { _, _ ->
                val phone = etPhone.text.toString().trim()
                val message = etMessage.text.toString().trim()

                if (phone.isBlank()) {
                    Toast.makeText(activity, "수신 번호를 입력해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }

                scope.launch(Dispatchers.IO) {
                    val (isSent, _) = SmsSenderUtil.sendSmsDetailed(activity, phone, message)
                    withContext(Dispatchers.Main) {
                        val resultMsg = if (isSent) {
                            "🎉 [성공] '$phone' 번호로 테스트 문자가 정상 발송되었습니다!"
                        } else {
                            "❌ [실패] 문자 발송에 실패했습니다. SMS 권한을 확인해 주세요."
                        }
                        Toast.makeText(activity, resultMsg, Toast.LENGTH_LONG).show()
                    }
                }
            }
            .setNegativeButton("닫기", null)
            .show()
    }
}
