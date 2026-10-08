package cloud.sheetbot.agent.user.card

import android.graphics.Color
import android.widget.EditText
import android.widget.Toast
import androidx.core.widget.doAfterTextChanged
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding

/**
 * 🎯 문자(SMS/LMS) 송수신 구글 시트 자동 동기화 카드 전담 컨트롤러 (v2.1.99 리팩토링 모듈화)
 *
 * - SMS/LMS 시트 자동 기록 스위치 제어 및 알림 리스너 권한 체크
 * - 대상 번호/이름 필터링 실시간 저장 및 뱃지 업데이트
 * - 연락처 선택기 연동 및 대상 관리 다이얼로그 호출
 * - 구글 스프레드시트 대장 원터치 프로비저닝 및 뷰어 오픈
 * - 카드 접기/펼치기 상태 보존
 */
class SmsSyncCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onPickContact: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onProvisionSheet: (sheetType: String, defaultTitle: String) -> Unit,
    private val onShowTargetManageDialog: (title: String, editText: EditText, targetType: String) -> Unit,
    private val isNotificationListenerEnabled: () -> Boolean,
    private val requestNotificationListenerPermission: () -> Unit
) {
    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        binding.switchSmsSync.isChecked = prefs.isSmsSheetSyncEnabled
        binding.etSmsTargetFilter.setText(prefs.smsTargetFilter)

        // 접기/펼치기 헤더 및 버튼 리스너 바인딩
        val toggle = { toggleCollapse() }
        binding.layoutSmsSyncHeader.setOnClickListener { toggle() }
        binding.btnToggleSmsSyncDetails.setOnClickListener { toggle() }

        binding.switchSmsSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isSmsSheetSyncEnabled = isChecked
            prefs.isSmsSyncDetailsHidden = !isChecked
            refreshCollapseState()
            val msg = if (isChecked) "고객 문자 시트 자동 기록이 켜졌습니다." else "고객 문자 시트 기록이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                onProvisionSheet("SMS", prefs.smsDriveSheetTitle)
                if (!isNotificationListenerEnabled()) {
                    requestNotificationListenerPermission()
                }
            }
        }

        binding.btnPickSmsContact.setOnClickListener {
            onPickContact()
        }

        binding.btnManageSmsTargets.setOnClickListener {
            onShowTargetManageDialog("🎯 SMS 기록 대상 관리", binding.etSmsTargetFilter, "SMS")
        }

        binding.etSmsTargetFilter.doAfterTextChanged {
            prefs.smsTargetFilter = it?.toString()?.trim() ?: ""
            updateTargetBadge()
        }

        binding.btnOpenSmsSheet.setOnClickListener {
            onOpenSheetChooser("SMS", prefs.smsDriveSheetTitle)
        }

        updateTargetBadge()
    }

    /**
     * 카드 접기/펼치기 상태 토글
     */
    fun toggleCollapse() {
        prefs.isSmsSyncDetailsHidden = !prefs.isSmsSyncDetailsHidden
        refreshCollapseState()
    }

    /**
     * 접기/펼치기 뷰 상태 갱신
     */
    fun refreshCollapseState() {
        activity.updateCardCollapseState(
            binding.layoutSmsSyncSettings,
            binding.btnToggleSmsSyncDetails,
            prefs.isSmsSyncDetailsHidden
        )
    }

    /**
     * 필터 등록 건수에 따라 상태 뱃지 및 관리 버튼 텍스트 실시간 갱신
     */
    fun updateTargetBadge() {
        val smsList = binding.etSmsTargetFilter.text.toString().split(",", ";")
            .map { it.trim() }.filter { it.isNotBlank() }
        if (smsList.isEmpty()) {
            binding.tvSmsTargetCountBadge.text = "전체 기록"
            binding.tvSmsTargetCountBadge.setTextColor(Color.parseColor("#38BDF8"))
            binding.btnManageSmsTargets.text = "📋 등록 대상 확인 / 제외"
        } else {
            binding.tvSmsTargetCountBadge.text = "${smsList.size}건 지정"
            binding.tvSmsTargetCountBadge.setTextColor(Color.parseColor("#34D399"))
            binding.btnManageSmsTargets.text = "📋 등록 대상 확인 / 제외 (${smsList.size}건)"
        }
    }
}
