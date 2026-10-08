package cloud.sheetbot.agent.user.card

import android.net.Uri
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.FileUploadManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * 📁 사진 및 문서 파일 구글 드라이브 업로드 보관함 카드 제어 컨트롤러
 *
 * - 사진/문서 드라이브 보관함 활성화/비활성화 스위치
 * - 파일 선택기(SAF) 호출 및 복수 파일 드라이브 백업
 * - 안드로이드 공유하기(Share Intent) 파일 업로드 처리
 * - 업로드 대장 시트 및 드라이브 폴더 바로가기
 * - 카드 펼침/접힘 상태 관리
 */
class FileUploadCardController(
    private val activity: AppCompatActivity,
    private val binding: ActivityMainBinding,
    private val prefs: AppPreferences,
    private val scope: CoroutineScope,
    private val launchFilePicker: () -> Unit,
    private val provisionSheetAsync: (type: String, defaultTitle: String, folderName: String) -> Unit,
    private val showOpenSheetChooserDialog: (type: String, title: String) -> Unit,
    private val openDriveFolder: (type: String, folderName: String) -> Unit,
    private val addLogItem: (title: String, detail: String, success: Boolean) -> Unit,
    private val updateCardCollapseState: (layout: View, button: View, isHidden: Boolean) -> Unit
) {

    fun setup() {
        // 사진 및 문서 파일 구글 드라이브 업로드 UI 바인딩 및 실시간 자동 저장 (Auto-Save)
        binding.switchFileUploadSync.isChecked = prefs.isFileUploadSyncEnabled

        binding.switchFileUploadSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isFileUploadSyncEnabled = isChecked
            prefs.isFileUploadDetailsHidden = !isChecked
            updateCardCollapseState(binding.layoutFileUploadDetails, binding.btnToggleFileUploadDetails, !isChecked)
            val msg = if (isChecked) "사진 및 문서 드라이브 보관함이 켜졌습니다." else "사진 및 문서 드라이브 보관함이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                provisionSheetAsync("FILE_UPLOAD", "[SheetBot] 파일 업로드 대장", prefs.fileUploadDriveFolder)
            }
        }

        binding.btnOpenFileSheet.setOnClickListener {
            showOpenSheetChooserDialog("FILE_UPLOAD", "[SheetBot] 파일 업로드 대장")
        }
        binding.btnOpenFileFolder.setOnClickListener {
            openDriveFolder("FILE_UPLOAD", prefs.fileUploadDriveFolder)
        }

        binding.btnPickAndUploadFile.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(activity, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            launchFilePicker()
        }
    }

    fun refreshCollapseState() {
        updateCardCollapseState(
            binding.layoutFileUploadDetails,
            binding.btnToggleFileUploadDetails,
            prefs.isFileUploadDetailsHidden
        )
    }

    fun toggleCollapse() {
        prefs.isFileUploadDetailsHidden = !prefs.isFileUploadDetailsHidden
        refreshCollapseState()
    }

    /**
     * 📁 사진/문서 다중 파일 구글 드라이브 업로드 전담 처리
     */
    fun uploadFiles(uris: List<Uri>, memo: String) {
        if (!prefs.isPaired) {
            Toast.makeText(activity, "⚠️ 시트봇 계정 연동 후 파일을 업로드할 수 있습니다.", Toast.LENGTH_LONG).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        Toast.makeText(activity, "🚀 ${uris.size}건의 파일을 구글 드라이브로 업로드합니다...", Toast.LENGTH_SHORT).show()

        scope.launch {
            try {
                val results = FileUploadManager.uploadMultipleUris(activity, uris, memo)
                binding.progressBar.visibility = View.GONE
                val successCount = results.count { it.success }

                if (successCount > 0) {
                    val targetFolder = prefs.fileUploadDriveFolder.takeIf { it.isNotBlank() } ?: "[SheetBot] 파일 보관함"
                    Toast.makeText(
                        activity,
                        "🎉 ${successCount}건의 파일이 구글 드라이브 '${targetFolder}'에 안전하게 업로드되었습니다!",
                        Toast.LENGTH_LONG
                    ).show()

                    for (r in results.filter { it.success }) {
                        val fileName = r.fileName ?: "알 수 없는 파일"
                        val folder = r.folderName ?: targetFolder
                        addLogItem("파일 업로드", "$fileName -> $folder", true)
                    }
                } else {
                    val firstErr = results.firstOrNull()?.error ?: "알 수 없는 오류"
                    Toast.makeText(activity, "⚠️ 파일 업로드 실패: $firstErr", Toast.LENGTH_LONG).show()
                    addLogItem("파일 업로드 실패", firstErr, false)
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Toast.makeText(activity, "업로드 처리 중 예외 발생: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
