package cloud.sheetbot.agent.user.card

import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.MeetingRecordingManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * 🎙️ 회의 녹음 구글 드라이브 백업 및 AI 회의록 대장 자동 연동 카드 컨트롤러
 *
 * - 회의 녹음 동기화 활성화/비활성화 스위치
 * - 신규 회의 녹음 파일 즉시 수동 동기화 (MeetingRecordingManager 연동)
 * - 회의록 시트 대장 바로가기
 * - 카드 펼침/접힘 상태 관리
 */
class MeetingRecordingCardController(
    private val activity: AppCompatActivity,
    private val binding: ActivityMainBinding,
    private val prefs: AppPreferences,
    private val scope: CoroutineScope,
    private val checkAndRequestAllFilesAccess: () -> Unit,
    private val provisionSheetAsync: (type: String, defaultTitle: String, folderName: String) -> Unit,
    private val showOpenSheetChooserDialog: (type: String, title: String) -> Unit,
    private val updateCardCollapseState: (layout: View, button: View, isHidden: Boolean) -> Unit
) {

    fun setup() {
        binding.switchMeetingRecording.isChecked = prefs.isMeetingRecordingSyncEnabled
        refreshCollapseState()

        binding.switchMeetingRecording.setOnCheckedChangeListener { _, isChecked ->
            prefs.isMeetingRecordingSyncEnabled = isChecked
            prefs.isMeetingRecordingDetailsHidden = !isChecked
            updateCardCollapseState(binding.layoutMeetingRecordingSettings, binding.btnToggleMeetingRecordingDetails, !isChecked)
            val msg = if (isChecked) "회의 녹음 드라이브 백업 및 AI 회의록 작성이 켜졌습니다." else "회의 녹음 동기화가 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                checkAndRequestAllFilesAccess()
                provisionSheetAsync("MEETING", "[SheetBot] 회의록 대장", prefs.meetingRecordingDriveFolder)
            }
        }

        binding.layoutMeetingRecordingHeader.setOnClickListener { toggleCollapse() }
        binding.btnToggleMeetingRecordingDetails.setOnClickListener { toggleCollapse() }

        binding.btnSyncMeetingRecordingsNow.setOnClickListener {
            scope.launch {
                Toast.makeText(activity, "신규 회의 녹음 파일 동기화를 시작합니다...", Toast.LENGTH_SHORT).show()
                val result = MeetingRecordingManager.scanAndUploadNewMeetingRecordings(activity, forceReupload = true)
                Toast.makeText(activity, result.message, Toast.LENGTH_LONG).show()
            }
        }

        binding.btnOpenMeetingSheetAlways.setOnClickListener {
            showOpenSheetChooserDialog("MEETING", "[SheetBot] 회의록 대장")
        }
    }

    fun refreshCollapseState() {
        updateCardCollapseState(
            binding.layoutMeetingRecordingSettings,
            binding.btnToggleMeetingRecordingDetails,
            prefs.isMeetingRecordingDetailsHidden
        )
    }

    fun toggleCollapse() {
        prefs.isMeetingRecordingDetailsHidden = !prefs.isMeetingRecordingDetailsHidden
        refreshCollapseState()
    }
}
