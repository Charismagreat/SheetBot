package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.widget.EditText
import android.widget.Toast
import androidx.core.widget.doAfterTextChanged
import cloud.sheetbot.agent.user.BankNotificationListener
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
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
    fun setup() {
        binding.switchEmailSync.isChecked = prefs.isEmailSheetSyncEnabled
        binding.switchEmailBlockSpam.isChecked = prefs.isEmailSpamFilterEnabled
        binding.etEmailTargetFilter.setText(prefs.emailTargetFilter)

        val toggleEmailSync = {
            prefs.isEmailSyncDetailsHidden = !prefs.isEmailSyncDetailsHidden
            activity.updateCardCollapseState(
                binding.layoutEmailSyncSettings,
                binding.btnToggleEmailSyncDetails,
                prefs.isEmailSyncDetailsHidden
            )
        }
        binding.layoutEmailSyncHeader.setOnClickListener { toggleEmailSync() }
        binding.btnToggleEmailSyncDetails.setOnClickListener { toggleEmailSync() }

        binding.switchEmailSync.setOnCheckedChangeListener { _, isChecked ->
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
            activity.updateCardCollapseState(
                binding.layoutEmailSyncSettings,
                binding.btnToggleEmailSyncDetails,
                !isChecked
            )
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

        binding.switchEmailBlockSpam.setOnCheckedChangeListener { _, isChecked ->
            prefs.isEmailSpamFilterEnabled = isChecked
            val msg = if (isChecked) {
                "광고·뉴스레터·인증번호 메일 자동 제외가 켜졌습니다."
            } else {
                "모든 수신 이메일을 제외 없이 기록합니다."
            }
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
        }

        binding.btnManageEmailTargets.setOnClickListener {
            onShowTargetManageDialog("📧 이메일 기록 대상 관리", binding.etEmailTargetFilter, "EMAIL")
        }

        binding.etEmailTargetFilter.doAfterTextChanged {
            prefs.emailTargetFilter = it?.toString()?.trim() ?: ""
            onUpdateTargetBadges()
        }

        binding.btnOpenEmailSheet.setOnClickListener {
            onOpenSheetChooser("EMAIL", prefs.emailDriveSheetTitle)
        }

        binding.btnOpenEmailTasksHub.setOnClickListener {
            activity.startActivity(Intent(activity, TasksActivity::class.java))
        }
    }

    fun refreshCollapseState() {
        activity.updateCardCollapseState(
            binding.layoutEmailSyncSettings,
            binding.btnToggleEmailSyncDetails,
            prefs.isEmailSyncDetailsHidden
        )
    }
}
