package cloud.sheetbot.agent.user.card

import android.net.Uri
import android.provider.OpenableColumns
import android.view.View
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.lifecycleScope
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat
import java.util.Locale

/**
 * 💬 카카오톡(KakaoTalk) 대화 내용 구글 시트 자동 동기화 카드 전담 컨트롤러
 * - 동기화 스위치, 기록 대상 필터 관리, .txt 대화 내보내기 파일 선택/가져오기 파이프라인 및 시트 대장 연동 캡슐화
 */
class KakaoSyncCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onPickChatFile: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onProvisionSheet: (sheetType: String, defaultTitle: String) -> Unit,
    private val onShowTargetManageDialog: (title: String, editText: EditText, targetType: String) -> Unit,
    private val onUpdateTargetBadges: () -> Unit,
    private val onAddLogItem: (title: String, detail: String, success: Boolean) -> Unit
) {
    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        binding.switchKakaoSync.isChecked = prefs.isKakaoSheetSyncEnabled
        binding.etKakaoTargetFilter.setText(prefs.kakaoTargetFilter)

        // 접기/펼치기 헤더 및 버튼 리스너 바인딩
        val toggleKakaoSync = {
            prefs.isKakaoSyncDetailsHidden = !prefs.isKakaoSyncDetailsHidden
            activity.updateCardCollapseState(
                binding.layoutKakaoSyncSettings,
                binding.btnToggleKakaoSyncDetails,
                prefs.isKakaoSyncDetailsHidden
            )
        }
        binding.layoutKakaoSyncHeader.setOnClickListener { toggleKakaoSync() }
        binding.btnToggleKakaoSyncDetails.setOnClickListener { toggleKakaoSync() }

        binding.switchKakaoSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isKakaoSheetSyncEnabled = isChecked
            prefs.isKakaoSyncDetailsHidden = !isChecked
            activity.updateCardCollapseState(
                binding.layoutKakaoSyncSettings,
                binding.btnToggleKakaoSyncDetails,
                !isChecked
            )
            val msg = if (isChecked) "카카오톡 대화 내용 구글 시트 자동 동기화가 켜졌습니다." else "카카오톡 대화 동기화가 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                onProvisionSheet("KAKAO", prefs.kakaoDriveSheetTitle)
            }
        }

        binding.btnManageKakaoTargets.setOnClickListener {
            onShowTargetManageDialog("💬 카카오톡 기록 대상 관리", binding.etKakaoTargetFilter, "KAKAO")
        }

        binding.etKakaoTargetFilter.doAfterTextChanged {
            prefs.kakaoTargetFilter = it?.toString()?.trim() ?: ""
            onUpdateTargetBadges()
        }

        binding.btnImportKakaoChat.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(activity, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            onPickChatFile()
        }

        binding.btnOpenKakaoSheet.setOnClickListener {
            onOpenSheetChooser("KAKAO", prefs.kakaoDriveSheetTitle)
        }
    }

    /**
     * 카카오톡 대화 내용 내보내기(.txt) 파일을 읽어 구글 시트 대장에 구간 덮어쓰기 (v2.1.11)
     */
    fun handleFileSelected(uri: Uri) {
        val email = prefs.userEmail
        if (!prefs.isPaired || email.isNullOrBlank()) {
            Toast.makeText(activity, "⚠️ 시트봇 계정 연동 후 이용할 수 있습니다.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        Toast.makeText(activity, "💬 카톡 대화 파일을 분석 중입니다...", Toast.LENGTH_SHORT).show()

        activity.lifecycleScope.launch {
            try {
                var fileName = "KakaoTalkChats.txt"
                activity.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (nameIdx >= 0 && cursor.moveToFirst()) {
                        fileName = cursor.getString(nameIdx) ?: "KakaoTalkChats.txt"
                    }
                }

                val textContent = withContext(Dispatchers.IO) {
                    activity.contentResolver.openInputStream(uri)?.use { stream ->
                        val bytes = stream.readBytes()
                        try {
                            String(bytes, Charsets.UTF_8)
                        } catch (_: Exception) {
                            String(bytes, java.nio.charset.Charset.forName("EUC-KR"))
                        }
                    } ?: ""
                }

                if (textContent.isBlank()) {
                    binding.progressBar.visibility = View.GONE
                    Toast.makeText(activity, "파일 내용이 비어있거나 읽을 수 없습니다.", Toast.LENGTH_LONG).show()
                    return@launch
                }

                val result = ApiClient.importKakaoChat(
                    userEmail = email,
                    textContent = textContent,
                    fileName = fileName,
                    sheetTitle = prefs.kakaoDriveSheetTitle
                )

                binding.progressBar.visibility = View.GONE

                if (result.success) {
                    val countFormatted = NumberFormat.getNumberInstance(Locale.KOREA).format(result.insertedCount)
                    val periodMsg = if (!result.startDate.isNullOrBlank() && !result.endDate.isNullOrBlank()) {
                        "\n• 기간: ${result.startDate} ~ ${result.endDate}"
                    } else ""
                    val roomMsg = if (!result.chatRoomName.isNullOrBlank()) {
                        "• 채팅방: ${result.chatRoomName}\n"
                    } else ""

                    onAddLogItem("💬 카톡 가져오기", "${result.chatRoomName ?: "채팅방"} ${countFormatted}건 시트 동기화 완료", true)

                    AlertDialog.Builder(activity)
                        .setTitle("🎉 카톡 대화 파일 가져오기 완료!")
                        .setMessage("${roomMsg}• 동기화 대화: 총 ${countFormatted}건${periodMsg}\n\n구글 시트 [${prefs.kakaoDriveSheetTitle}]에 구간 덮어쓰기되었습니다.")
                        .setPositiveButton("시트") { _, _ ->
                            onOpenSheetChooser("KAKAO", prefs.kakaoDriveSheetTitle)
                        }
                        .setNegativeButton("닫기", null)
                        .show()
                } else {
                    AlertDialog.Builder(activity)
                        .setTitle("가져오기 실패")
                        .setMessage(result.error ?: "카카오톡 대화 내용 인식에 실패했습니다.\n카카오톡 [대화 내용 내보내기]로 생성된 .txt 파일인지 확인해 주세요.")
                        .setPositiveButton("확인", null)
                        .show()
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                android.util.Log.e("KakaoSyncCtrl", "카톡 대화 파일 가져오기 실패: ${e.message}", e)
                Toast.makeText(activity, "파일 처리 중 오류: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * 카드 접기/펼치기 상태 복원
     */
    fun refreshCollapseState() {
        activity.updateCardCollapseState(
            binding.layoutKakaoSyncSettings,
            binding.btnToggleKakaoSyncDetails,
            prefs.isKakaoSyncDetailsHidden
        )
    }
}
