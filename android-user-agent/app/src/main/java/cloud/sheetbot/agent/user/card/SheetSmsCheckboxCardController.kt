package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import cloud.sheetbot.agent.user.ApiClient
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
 * - 기존 시트에 문자 발송용 탭 추가 기능 제공
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
    private var cardView: View? = null
    private var headerView: View? = null
    private var switchCompat: androidx.appcompat.widget.SwitchCompat? = null
    private var btnToggle: TextView? = null
    private var layoutDetails: View? = null
    private var etTargetTab: EditText? = null
    private var btnOpenSheet: View? = null
    private var btnAddTab: View? = null
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
        btnAddTab = activity.findViewById(cloud.sheetbot.agent.user.R.id.btnAddSheetSmsTab)
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

        btnAddTab?.setOnClickListener {
            showAddTabDialog()
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
     * ➕ 사용자의 기존 구글 스프레드시트에 문자 발송용 탭 추가 및 연동 다이얼로그
     */
    private fun showAddTabDialog() {
        val userEmail = prefs.userEmail
        if (!prefs.isPaired || userEmail.isNullOrBlank()) {
            Toast.makeText(activity, "먼저 상단에서 시트봇 계정 연동을 완료해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val dialogView = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 30, 40, 20)
            setBackgroundColor(Color.parseColor("#1E293B"))
        }

        val tvNotice = TextView(activity).apply {
            text = "사용 중인 구글 스프레드시트의 공유 링크(URL)를 입력하시면, '문자발송목록' 탭을 추가하고 표준 발송 서식을 자동으로 세팅해 드립니다."
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 12f
            setPadding(0, 0, 0, 16)
        }
        dialogView.addView(tvNotice)

        val tvUrlLabel = TextView(activity).apply {
            text = "🔗 구글 스프레드시트 링크 (또는 시트 ID):"
            setTextColor(Color.parseColor("#E2E8F0"))
            textSize = 12f
            setPadding(0, 0, 0, 4)
        }
        dialogView.addView(tvUrlLabel)

        val etSheetUrl = EditText(activity).apply {
            hint = "https://docs.google.com/spreadsheets/d/..."
            setHintTextColor(Color.parseColor("#64748B"))
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            textSize = 12.5f
            val currentUrl = prefs.getSheetUrl("SHEET_SMS_CHECKBOX")
            if (!currentUrl.isNullOrBlank()) {
                setText(currentUrl)
            }
        }
        dialogView.addView(etSheetUrl)

        val tvTabLabel = TextView(activity).apply {
            text = "📑 생성할 탭 이름:"
            setTextColor(Color.parseColor("#E2E8F0"))
            textSize = 12f
            setPadding(0, 14, 0, 4)
        }
        dialogView.addView(tvTabLabel)

        val currentTab = prefs.sheetSmsTargetTab.ifBlank { "문자발송목록" }
        val etTabName = EditText(activity).apply {
            setText(currentTab)
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(20, 16, 20, 16)
            textSize = 12.5f
        }
        dialogView.addView(etTabName)

        AlertDialog.Builder(activity)
            .setTitle("➕ 기존 시트에 문자발송 탭 추가")
            .setView(dialogView)
            .setPositiveButton("탭 추가 및 연동") { _, _ ->
                val inputUrl = etSheetUrl.text.toString().trim()
                val inputTab = etTabName.text.toString().trim().ifBlank { "문자발송목록" }

                if (inputUrl.isBlank()) {
                    Toast.makeText(activity, "구글 시트 링크(URL)를 입력해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }

                val progressDialog = AlertDialog.Builder(activity)
                    .setTitle("📊 탭 추가 및 연동 중")
                    .setMessage("기존 구글 스프레드시트에 '" + inputTab + "' 탭을 생성하고 표준 서식을 세팅하고 있습니다.\n\n잠시만 기다려 주세요.")
                    .setCancelable(false)
                    .create()
                progressDialog.show()

                scope.launch {
                    val result = ApiClient.addTabToSpreadsheet(
                        userEmail = userEmail,
                        spreadsheetUrlOrId = inputUrl,
                        tabName = inputTab,
                        sheetType = "SHEET_SMS_CHECKBOX"
                    )

                    withContext(Dispatchers.Main) {
                        if (progressDialog.isShowing) {
                            progressDialog.dismiss()
                        }

                        if (result.success && !result.spreadsheetUrl.isNullOrBlank()) {
                            prefs.setSheetUrl("SHEET_SMS_CHECKBOX", result.spreadsheetUrl)
                            if (!result.spreadsheetId.isNullOrBlank()) {
                                prefs.setSheetId("SHEET_SMS_CHECKBOX", result.spreadsheetId)
                            }
                            val finalTab = result.tabName ?: inputTab
                            prefs.sheetSmsTargetTab = finalTab
                            etTargetTab?.setText(finalTab)

                            val confirmMsg = if (result.isNewTab) {
                                "'" + (result.sheetTitle ?: "") + "' 시트에 '" + finalTab + "' 탭이 성공적으로 생성되고 표준 서식이 세팅되었습니다!\n\n지금 구글 시트를 열어 확인하시겠습니까?"
                            } else {
                                "'" + (result.sheetTitle ?: "") + "' 시트의 '" + finalTab + "' 탭에 표준 서식이 성공적으로 세팅되었습니다!\n\n지금 구글 시트를 열어 확인하시겠습니까?"
                            }

                            AlertDialog.Builder(activity)
                                .setTitle("🎉 연동 완료")
                                .setMessage(confirmMsg)
                                .setPositiveButton("📊 시트 열기") { _, _ ->
                                    try {
                                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(result.spreadsheetUrl))
                                        activity.startActivity(intent)
                                    } catch (_: Exception) {
                                        Toast.makeText(activity, "시트를 열 수 있는 브라우저 또는 앱이 없습니다.", Toast.LENGTH_SHORT).show()
                                    }
                                }
                                .setNegativeButton("닫기", null)
                                .show()
                        } else {
                            val errMsg = result.error ?: "탭 추가에 실패했습니다. 공유 권한 또는 링크를 확인해 주세요."
                            AlertDialog.Builder(activity)
                                .setTitle("❌ 탭 추가 실패")
                                .setMessage(errMsg)
                                .setPositiveButton("확인", null)
                                .show()
                        }
                    }
                }
            }
            .setNegativeButton("취소", null)
            .show()
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
