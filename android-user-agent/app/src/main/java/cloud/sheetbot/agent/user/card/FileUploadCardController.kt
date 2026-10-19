package cloud.sheetbot.agent.user.card

import android.net.Uri
import android.view.View
import android.widget.Button
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.FileUploadManager
import cloud.sheetbot.agent.user.R
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * 📁 사진 및 문서 파일 구글 드라이브 / 파일투시트(FileToSheet) 직결 업로드 보관함 카드 제어 컨트롤러
 *
 * - 전송 목적지 선택: 구글 스프레드시트 vs 파일투시트(FileToSheet) 직결
 * - 파일투시트 QR 스캔 및 연결 상태 제어
 * - 사진/문서 드라이브 보관함 활성화/비활성화 스위치
 * - 파일 선택기(SAF) 호출 및 복수 파일 전송
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
    private val launchQrScan: () -> Unit = {},
    private val provisionSheetAsync: (type: String, defaultTitle: String, folderName: String) -> Unit,
    private val showOpenSheetChooserDialog: (type: String, title: String) -> Unit,
    private val openDriveFolder: (type: String, folderName: String) -> Unit,
    private val addLogItem: (title: String, detail: String, success: Boolean) -> Unit,
    private val updateCardCollapseState: (layout: View, button: View, isHidden: Boolean) -> Unit
) {

    // 🎯 파일투시트(FileToSheet) 직결 UI (ActivityMainBinding의 JVM 255 파라미터 한계 방어를 위해 findViewById로 지연 바인딩)
    private val rgUploadDestination: RadioGroup by lazy { binding.root.findViewById(R.id.rgUploadDestination) }
    private val rbDestGoogleSheet: RadioButton by lazy { binding.root.findViewById(R.id.rbDestGoogleSheet) }
    private val rbDestFileToSheet: RadioButton by lazy { binding.root.findViewById(R.id.rbDestFileToSheet) }
    private val layoutFtsStatusContainer: View by lazy { binding.root.findViewById(R.id.layoutFtsStatusContainer) }
    private val tvFtsStatusTitle: TextView by lazy { binding.root.findViewById(R.id.tvFtsStatusTitle) }
    private val tvFtsStatusDesc: TextView by lazy { binding.root.findViewById(R.id.tvFtsStatusDesc) }
    private val btnScanFtsQr: Button by lazy { binding.root.findViewById(R.id.btnScanFtsQr) }
    private val btnUnlinkFts: View by lazy { binding.root.findViewById(R.id.btnUnlinkFts) }

    fun setup() {
        // 전송 목적지 라디오 버튼 초기화 및 실시간 전환 리스너
        refreshFtsUi()

        rgUploadDestination.setOnCheckedChangeListener { _, checkedId ->
            if (checkedId == rbDestFileToSheet.id) {
                prefs.uploadDestination = AppPreferences.DESTINATION_FILE_TO_SHEET
                refreshFtsUi()
                Toast.makeText(activity, "⚡ 파일투시트(FileToSheet) 직결 전송 모드가 선택되었습니다.", Toast.LENGTH_SHORT).show()
            } else {
                prefs.uploadDestination = AppPreferences.DESTINATION_GOOGLE_SHEETS
                refreshFtsUi()
                Toast.makeText(activity, "📊 구글 스프레드시트 연동 모드가 선택되었습니다.", Toast.LENGTH_SHORT).show()
            }
        }

        btnScanFtsQr.setOnClickListener {
            launchQrScan()
        }

        btnUnlinkFts.setOnClickListener {
            prefs.clearFtsPairing()
            refreshFtsUi()
            Toast.makeText(activity, "파일투시트 연동이 해제되었습니다.", Toast.LENGTH_SHORT).show()
            addLogItem("⚡ FTS 해제", "파일투시트 직결 연결이 해제되었습니다.", false)
        }

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
            if (prefs.isDestinationFileToSheet) {
                if (!prefs.isFtsPaired) {
                    Toast.makeText(activity, "먼저 파일투시트 QR코드를 스캔해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
            } else if (!prefs.isPaired) {
                Toast.makeText(activity, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            launchFilePicker()
        }
    }

    /**
     * ⚡ 파일투시트 연동 상태 및 전송 목적지 UI 갱신
     */
    fun refreshFtsUi() {
        val isFts = prefs.isDestinationFileToSheet
        if (isFts) {
            rbDestFileToSheet.isChecked = true
            layoutFtsStatusContainer.visibility = View.VISIBLE
            if (prefs.isFtsPaired) {
                val sheetName = prefs.ftsSheetName ?: "파일투시트"
                val projectName = prefs.ftsProjectName ?: ""
                tvFtsStatusTitle.text = "🟢 직결 연결됨: [$sheetName]"
                tvFtsStatusDesc.text = "프로젝트: [$projectName]\n사진/영수증 촬영 시 구글 드라이브 없이 0.2초 만에 즉시 적재"
                btnScanFtsQr.text = "📷 QR 다시 스캔 (대상 시트 변경)"
                btnUnlinkFts.visibility = View.VISIBLE
            } else {
                tvFtsStatusTitle.text = "⚪ 파일투시트 미연동"
                tvFtsStatusDesc.text = "PC 웹 화면의 [📱 모바일 연동] QR코드를 스캔하세요"
                btnScanFtsQr.text = "📷 파일투시트 QR코드 스캔"
                btnUnlinkFts.visibility = View.GONE
            }
        } else {
            rbDestGoogleSheet.isChecked = true
            layoutFtsStatusContainer.visibility = View.GONE
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
     * 📁 사진/문서 다중 파일 전송 전담 처리 (구글 드라이브 또는 파일투시트)
     */
    fun uploadFiles(uris: List<Uri>, memo: String) {
        val isFts = prefs.isDestinationFileToSheet
        if (isFts) {
            if (!prefs.isFtsPaired) {
                Toast.makeText(activity, "⚠️ 파일투시트 QR코드 연동 후 파일을 전송할 수 있습니다.", Toast.LENGTH_LONG).show()
                return
            }
        } else if (!prefs.isPaired) {
            Toast.makeText(activity, "⚠️ 시트봇 계정 연동 후 파일을 업로드할 수 있습니다.", Toast.LENGTH_LONG).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        val targetDesc = if (isFts) "파일투시트 [${prefs.ftsSheetName}]" else "구글 드라이브"
        Toast.makeText(activity, "🚀 ${uris.size}건의 파일을 ${targetDesc}로 전송합니다...", Toast.LENGTH_SHORT).show()

        scope.launch {
            try {
                val results = FileUploadManager.uploadMultipleUris(activity, uris, memo)
                binding.progressBar.visibility = View.GONE
                val successCount = results.count { it.success }

                if (successCount > 0) {
                    if (isFts) {
                        val sName = prefs.ftsSheetName ?: "파일투시트"
                        Toast.makeText(
                            activity,
                            "✅ [$sName] 시트에 ${successCount}건이 전송되었습니다!",
                            Toast.LENGTH_LONG
                        ).show()
                        addLogItem("⚡ FTS 전송", "[$sName] ${successCount}건 적재 완료", true)
                    } else {
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
