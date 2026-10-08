package cloud.sheetbot.agent.user.card

import android.widget.Toast
import androidx.core.widget.doAfterTextChanged
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding

/**
 * 📵 부재중 전화(Missed Call) 0원 스마트 자동 답장 카드 전담 컨트롤러
 * - 자동 회신 ON/OFF 스위치, 답장 템플릿 실시간 자동저장, 접기/펼치기 토글, 구글 시트 대장 연동 캡슐화
 */
class MissedCallCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onProvisionSheet: (sheetType: String, defaultTitle: String) -> Unit
) {
    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        binding.switchMissedCall.isChecked = prefs.isMissedCallAutoReplyEnabled
        binding.etMissedCallReply.setText(prefs.missedCallReplyTemplate)

        // 접기/펼치기 헤더 및 버튼 리스너 바인딩
        val toggleMissedCall = {
            prefs.isMissedCallDetailsHidden = !prefs.isMissedCallDetailsHidden
            activity.updateCardCollapseState(
                binding.layoutMissedCallSettings,
                binding.btnToggleMissedCallDetails,
                prefs.isMissedCallDetailsHidden
            )
        }
        binding.layoutMissedCallHeader.setOnClickListener { toggleMissedCall() }
        binding.btnToggleMissedCallDetails.setOnClickListener { toggleMissedCall() }

        binding.switchMissedCall.setOnCheckedChangeListener { _, isChecked ->
            prefs.isMissedCallAutoReplyEnabled = isChecked
            prefs.isMissedCallDetailsHidden = !isChecked
            activity.updateCardCollapseState(
                binding.layoutMissedCallSettings,
                binding.btnToggleMissedCallDetails,
                !isChecked
            )
            val msg = if (isChecked) "전화 못 받았을 때 자동 답장 문자 발송이 켜졌습니다." else "전화 못 받았을 때 자동 답장이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                onProvisionSheet("MISSED_CALL", prefs.missedCallDriveSheetTitle)
            }
        }

        binding.etMissedCallReply.doAfterTextChanged {
            prefs.missedCallReplyTemplate = it?.toString()?.trim() ?: ""
        }

        binding.btnOpenMissedCallSheet.setOnClickListener {
            onOpenSheetChooser("MISSED_CALL", prefs.missedCallDriveSheetTitle)
        }
    }

    /**
     * 카드 접기/펼치기 상태 복원
     */
    fun refreshCollapseState() {
        activity.updateCardCollapseState(
            binding.layoutMissedCallSettings,
            binding.btnToggleMissedCallDetails,
            prefs.isMissedCallDetailsHidden
        )
    }
}
