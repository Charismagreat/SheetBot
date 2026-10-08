package cloud.sheetbot.agent.user.card

import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.widget.doAfterTextChanged
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import java.io.File

/**
 * 💼 통화 종료 직후 모바일 명함 원터치 발송 카드 전담 컨트롤러
 * - 발송 ON/OFF 스위치, 발송 모드(웹링크 vs MMS 이미지) 라디오 버튼, 텍스트/URL 실시간 자동저장,
 *   명함 이미지 첨부/제거/미리보기, 발송 제외 번호 관리 다이얼로그, 시트 대장 연동 캡슐화
 */
class CallEndedCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onPickImage: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onProvisionSheet: (sheetType: String, defaultTitle: String) -> Unit,
    private val onAddLogItem: (title: String, detail: String, success: Boolean) -> Unit
) {
    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        binding.switchCallEndedCard.isChecked = prefs.isCallEndedCardPromptEnabled
        binding.switchCallEndedAutoSendDirectly.isChecked = prefs.isCallEndedAutoSendDirectly

        binding.switchCallEndedAutoSendDirectly.setOnCheckedChangeListener { _, isChecked ->
            prefs.isCallEndedAutoSendDirectly = isChecked
            val msg = if (isChecked) "⚡ 통화 종료 시 알림 확인 없이 즉시 자동 발송 모드로 설정되었습니다." else "💼 통화 종료 후 상단 알림창 원터치 확인 모드로 설정되었습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
        }

        // 1. 발송 방식 라디오 버튼 초기화 (WEB_LINK vs MMS_IMAGE) 및 실시간 동기화
        refreshUi()

        // 2. 값 설정 및 텍스트 변경 실시간 자동 저장
        binding.etBusinessCardWebUrl.setText(prefs.businessCardWebLink)
        binding.etBusinessCardSms.setText(prefs.businessCardSmsTemplate)

        binding.etBusinessCardWebUrl.doAfterTextChanged {
            prefs.businessCardWebLink = it?.toString()?.trim() ?: ""
        }
        binding.etBusinessCardSms.doAfterTextChanged {
            prefs.businessCardSmsTemplate = it?.toString()?.trim() ?: ""
        }

        // 3. 사진 선택 및 미리보기 바인딩
        renderImagePreview()

        binding.btnPickBusinessCardImage.setOnClickListener {
            onPickImage()
        }

        binding.btnRemoveBusinessCardImage.setOnClickListener {
            removeBusinessCardImage()
        }

        // 접기/펼치기 헤더 및 버튼 리스너 바인딩
        val toggleCallEndedCard = {
            prefs.isCallEndedCardDetailsHidden = !prefs.isCallEndedCardDetailsHidden
            activity.updateCardCollapseState(
                binding.layoutCallEndedCardSettings,
                binding.btnToggleCallEndedCardDetails,
                prefs.isCallEndedCardDetailsHidden
            )
        }
        binding.layoutCallEndedCardHeader.setOnClickListener { toggleCallEndedCard() }
        binding.btnToggleCallEndedCardDetails.setOnClickListener { toggleCallEndedCard() }

        binding.switchCallEndedCard.setOnCheckedChangeListener { _, isChecked ->
            prefs.isCallEndedCardPromptEnabled = isChecked
            prefs.isCallEndedCardDetailsHidden = !isChecked
            activity.updateCardCollapseState(
                binding.layoutCallEndedCardSettings,
                binding.btnToggleCallEndedCardDetails,
                !isChecked
            )
            val msg = if (isChecked) "통화 끝나면 내 모바일 명함 바로 보내기가 켜졌습니다." else "모바일 명함 보내기가 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                onProvisionSheet("CALL_ENDED_CARD", "[SheetBot] 모바일 명함 발송 대장")
            }
        }

        binding.btnOpenCallEndedCardSheet.setOnClickListener {
            onOpenSheetChooser("CALL_ENDED_CARD", "[SheetBot] 모바일 명함 발송 대장")
        }

        setupExcludedNumbersUI()
    }

    /**
     * 통화 종료 모바일 명함 첨부 이미지(MMS) 저장
     */
    fun handleImageSelected(uri: Uri) {
        try {
            val targetFile = File(activity.filesDir, "business_card_image.jpg")
            activity.contentResolver.openInputStream(uri)?.use { input ->
                targetFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
            prefs.businessCardImagePath = targetFile.absolutePath
            prefs.businessCardSendMode = "MMS_IMAGE"
            refreshUi()
            Toast.makeText(activity, "🖼️ 명함/포스터 이미지가 등록되었습니다. (방안 2로 자동 전환)", Toast.LENGTH_SHORT).show()
            onAddLogItem("명함이미지", "이미지 등록 완료 (${targetFile.length() / 1024} KB)", true)
        } catch (e: Exception) {
            Log.e("CallEndedCardCtrl", "명함 이미지 저장 실패", e)
            Toast.makeText(activity, "이미지 저장에 실패했습니다: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 등록된 모바일 명함 첨부 이미지 삭제
     */
    fun removeBusinessCardImage() {
        try {
            val imagePath = prefs.businessCardImagePath
            if (imagePath.isNotBlank()) {
                val file = File(imagePath)
                if (file.exists()) {
                    file.delete()
                }
            }
            prefs.businessCardImagePath = ""
            refreshUi()
            Toast.makeText(activity, "🗑️ 등록된 이미지가 삭제되었습니다.", Toast.LENGTH_SHORT).show()
            onAddLogItem("명함이미지", "이미지 삭제 완료", true)
        } catch (e: Exception) {
            Log.e("CallEndedCardCtrl", "이미지 삭제 실패", e)
        }
    }

    /**
     * 모바일 명함 발송 UI 상태 실시간 동기화 (외부 onResume 등에서도 호출 가능)
     */
    fun refreshUi() {
        val isWebLinkMode = prefs.businessCardSendMode == "WEB_LINK"
        binding.rgBusinessCardMode.setOnCheckedChangeListener(null)
        if (isWebLinkMode) {
            binding.rgBusinessCardMode.check(binding.rbModeWebLink.id)
            binding.layoutModeWebLink.visibility = View.VISIBLE
            binding.layoutModeMmsImage.visibility = View.GONE
        } else {
            binding.rgBusinessCardMode.check(binding.rbModeMmsImage.id)
            binding.layoutModeWebLink.visibility = View.GONE
            binding.layoutModeMmsImage.visibility = View.VISIBLE
        }
        binding.rgBusinessCardMode.setOnCheckedChangeListener { _, checkedId ->
            val isWeb = checkedId == binding.rbModeWebLink.id
            binding.layoutModeWebLink.visibility = if (isWeb) View.VISIBLE else View.GONE
            binding.layoutModeMmsImage.visibility = if (isWeb) View.GONE else View.VISIBLE
            prefs.businessCardSendMode = if (isWeb) "WEB_LINK" else "MMS_IMAGE"
        }
        renderImagePreview()
        updateExcludedNumbersBadge()
    }

    /**
     * 모바일 명함 발송 제외 번호 관리 다이얼로그 및 뱃지 바인딩
     */
    private fun setupExcludedNumbersUI() {
        updateExcludedNumbersBadge()

        binding.btnManageExcludedNumbers.setOnClickListener {
            val excludedList = prefs.getBusinessCardExcludedNumbers().sorted()
            if (excludedList.isEmpty()) {
                AlertDialog.Builder(activity)
                    .setTitle("🚫 모바일 명함 발송 제외 관리")
                    .setMessage("현재 발송 제외로 등록된 번호가 없습니다.\n\n통화 종료 후 나타나는 명함 발송 팝업에서 [🚫 이 번호는 앞으로 발송 제외] 버튼을 누르면 해당 번호가 여기에 등록되어 앞으로 명함이 발송되지 않습니다.")
                    .setPositiveButton("확인", null)
                    .show()
                return@setOnClickListener
            }

            val items = excludedList.map { "🚫 $it  (터치 시 제외 해제)" }.toTypedArray()
            AlertDialog.Builder(activity)
                .setTitle("🚫 발송 제외 번호 (${excludedList.size}건)")
                .setItems(items) { _, which ->
                    val selectedPhone = excludedList[which]
                    AlertDialog.Builder(activity)
                        .setTitle("제외 해제 확인")
                        .setMessage("[$selectedPhone] 번호를 제외 목록에서 해제할까요?\n해제 시 향후 통화 종료 시 명함 발송 대상에 다시 포함됩니다.")
                        .setPositiveButton("해제(복구)") { _, _ ->
                            prefs.removeBusinessCardExcludedNumber(selectedPhone)
                            updateExcludedNumbersBadge()
                            Toast.makeText(activity, "[$selectedPhone] 번호의 발송 제외가 해제되었습니다.", Toast.LENGTH_SHORT).show()
                        }
                        .setNegativeButton("취소", null)
                        .show()
                }
                .setNeutralButton("전체 초기화") { _, _ ->
                    AlertDialog.Builder(activity)
                        .setTitle("전체 초기화 확인")
                        .setMessage("등록된 모든 발송 제외 번호를 초기화할까요?")
                        .setPositiveButton("전체 초기화") { _, _ ->
                            prefs.clearBusinessCardExcludedNumbers()
                            updateExcludedNumbersBadge()
                            Toast.makeText(activity, "모든 발송 제외 번호가 초기화되었습니다.", Toast.LENGTH_SHORT).show()
                        }
                        .setNegativeButton("취소", null)
                        .show()
                }
                .setPositiveButton("닫기", null)
                .show()
        }
    }

    private fun updateExcludedNumbersBadge() {
        val count = prefs.businessCardExcludedCount
        binding.btnManageExcludedNumbers.text = if (count > 0) "🚫 제외 관리 (${count}건)" else "🚫 발송 제외 관리"
    }

    /**
     * 등록된 명함 이미지 미리보기 UI 렌더링
     */
    private fun renderImagePreview() {
        val imagePath = prefs.businessCardImagePath
        if (imagePath.isNotBlank()) {
            val file = File(imagePath)
            if (file.exists() && file.length() > 0) {
                try {
                    val bitmap = BitmapFactory.decodeFile(file.absolutePath)
                    if (bitmap != null) {
                        binding.ivBusinessCardPreview.setImageBitmap(bitmap)
                        binding.tvImageFileName.text = "${file.name} (${file.length() / 1024} KB)"
                        binding.layoutImagePreview.visibility = View.VISIBLE
                        binding.btnRemoveBusinessCardImage.visibility = View.VISIBLE
                        return
                    }
                } catch (e: Exception) {
                    Log.e("CallEndedCardCtrl", "이미지 디코딩 오류", e)
                }
            }
        }
        binding.layoutImagePreview.visibility = View.GONE
        binding.btnRemoveBusinessCardImage.visibility = View.GONE
    }

    /**
     * 카드 접기/펼치기 상태 복원
     */
    fun refreshCollapseState() {
        activity.updateCardCollapseState(
            binding.layoutCallEndedCardSettings,
            binding.btnToggleCallEndedCardDetails,
            prefs.isCallEndedCardDetailsHidden
        )
    }
}
