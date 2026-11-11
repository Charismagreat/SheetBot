package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.widget.SwitchCompat
import androidx.core.widget.doAfterTextChanged
import cloud.sheetbot.agent.user.BankNotificationListener
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.R
import cloud.sheetbot.agent.user.TasksActivity
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding

/**
 * 📧 수신 이메일(Gmail · 네이버 메일 · 다음 메일 · 삼성 이메일 · Outlook) 자동 기록 & AI 할 일 추출 카드 전담 컨트롤러
 */
class EmailSyncCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val isNotificationListenerEnabled: () -> Boolean,
    private val requestNotificationListenerPermission: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onProvisionSheet: (sheetType: String, defaultTitle: String) -> Unit,
    private val onShowTargetManageDialog: (title: String, editText: EditText, targetType: String) -> Unit,
    private val onUpdateTargetBadges: () -> Unit
) {
    private var headerView: View? = null
    private var switchSync: SwitchCompat? = null
    private var btnToggleDetails: TextView? = null
    private var layoutSettings: View? = null
    private var switchBlockSpam: SwitchCompat? = null
    private var btnManageTargets: Button? = null
    private var etTargetFilter: EditText? = null
    private var btnOpenSheet: Button? = null
    private var btnOpenTasksHub: Button? = null

    fun setup() {
        headerView = activity.findViewById(R.id.layoutEmailSyncHeader)
        switchSync = activity.findViewById(R.id.switchEmailSync)
        btnToggleDetails = activity.findViewById(R.id.btnToggleEmailSyncDetails)
        layoutSettings = activity.findViewById(R.id.layoutEmailSyncSettings)
        switchBlockSpam = activity.findViewById(R.id.switchEmailBlockSpam)
        btnManageTargets = activity.findViewById(R.id.btnManageEmailTargets)
        etTargetFilter = activity.findViewById(R.id.etEmailTargetFilter)
        btnOpenSheet = activity.findViewById(R.id.btnOpenEmailSheet)
        btnOpenTasksHub = activity.findViewById(R.id.btnOpenEmailTasksHub)

        switchSync?.isChecked = prefs.isEmailSheetSyncEnabled
        switchBlockSpam?.isChecked = prefs.isEmailSpamFilterEnabled
        etTargetFilter?.setText(prefs.emailTargetFilter)

        val toggleEmailSync = View.OnClickListener {
            prefs.isEmailSyncDetailsHidden = !prefs.isEmailSyncDetailsHidden
            refreshCollapseState()
        }
        headerView?.setOnClickListener(toggleEmailSync)
        btnToggleDetails?.setOnClickListener(toggleEmailSync)

        switchSync?.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked && !isNotificationListenerEnabled()) {
                Toast.makeText(
                    activity,
                    "수신 이메일 알림을 감지하려면 '알림 접근 권한'을 허용해 주세요.",
                    Toast.LENGTH_LONG
                ).show()
                requestNotificationListenerPermission()
            }
            prefs.isEmailSheetSyncEnabled = isChecked
            prefs.isEmailSyncDetailsHidden = !isChecked
            refreshCollapseState()
            val msg = if (isChecked) {
                BankNotificationListener.ensureListenerBound(activity)
                "📧 수신 이메일 시트 자동 기록 & AI 할 일 추출이 켜졌습니다."
            } else {
                "수신 이메일 동기화가 꺼졌습니다."
            }
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                onProvisionSheet("EMAIL", prefs.emailDriveSheetTitle)
            }
        }

        switchBlockSpam?.setOnCheckedChangeListener { _, isChecked ->
            prefs.isEmailSpamFilterEnabled = isChecked
            val msg = if (isChecked) {
                "광고·뉴스레터·인증번호 메일 자동 제외가 켜졌습니다."
            } else {
                "모든 수신 이메일을 제외 없이 기록합니다."
            }
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
        }

        btnManageTargets?.setOnClickListener {
            val targetEt = etTargetFilter ?: return@setOnClickListener
            onShowTargetManageDialog("📧 이메일 기록 대상 관리", targetEt, "EMAIL")
        }

        etTargetFilter?.doAfterTextChanged {
            prefs.emailTargetFilter = it?.toString()?.trim() ?: ""
            onUpdateTargetBadges()
        }

        btnOpenSheet?.setOnClickListener {
            onOpenSheetChooser("EMAIL", prefs.emailDriveSheetTitle)
        }

        btnOpenTasksHub?.setOnClickListener {
            activity.startActivity(Intent(activity, TasksActivity::class.java))
        }
    }

    fun refreshCollapseState() {
        val settings = layoutSettings ?: activity.findViewById<View>(R.id.layoutEmailSyncSettings) ?: return
        val toggle = btnToggleDetails ?: activity.findViewById<TextView>(R.id.btnToggleEmailSyncDetails) ?: return
        activity.updateCardCollapseState(
            settings,
            toggle,
            prefs.isEmailSyncDetailsHidden
        )
    }
}
