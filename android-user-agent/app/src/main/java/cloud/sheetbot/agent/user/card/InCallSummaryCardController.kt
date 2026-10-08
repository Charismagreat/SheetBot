package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.View
import android.widget.Toast
import cloud.sheetbot.agent.user.InCallOverlayManager
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding

/**
 * 📞 수신 전화 시 '고객 시트 요약' 인콜 플로팅 팝업 카드 전담 컨트롤러 (v2.1.99 리팩토링 모듈화)
 *
 * - 수신 전화 시 고객 정보 플로팅 팝업 자동 표시 스위치
 * - '다른 앱 위에 표시' 오버레이 권한 확인 및 시스템 설정창 호출
 * - 010-1234-5678 가상 고객 실시간 플로팅 팝업 테스트 미리보기
 * - 통화 녹음 및 고객 메모 대장 원터치 오픈
 * - 카드 접기/펼치기 상태 보존
 */
class InCallSummaryCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit
) {
    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        binding.switchInCallSummary.isChecked = prefs.isInCallSummaryEnabled

        // 접기/펼치기 헤더 및 버튼 리스너 바인딩
        val toggle = { toggleCollapse() }
        binding.layoutInCallSummaryHeader.setOnClickListener { toggle() }
        binding.btnToggleInCallSummaryDetails.setOnClickListener { toggle() }

        binding.switchInCallSummary.setOnCheckedChangeListener { _, isChecked ->
            prefs.isInCallSummaryEnabled = isChecked
            val msg = if (isChecked) "수신 전화 시 '고객 시트 요약' 인콜 팝업이 켜졌습니다." else "수신 전화 인콜 팝업이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            if (isChecked && !InCallOverlayManager.canDrawOverlays(activity)) {
                requestOverlayPermission()
            }
        }

        binding.btnRequestOverlayPermission.setOnClickListener {
            requestOverlayPermission()
        }

        binding.btnPreviewInCallSummary.setOnClickListener {
            if (!InCallOverlayManager.canDrawOverlays(activity)) {
                Toast.makeText(activity, "먼저 '다른 앱 위에 표시' 권한을 허용해 주세요.", Toast.LENGTH_SHORT).show()
                requestOverlayPermission()
            } else {
                Toast.makeText(activity, "🔍 인콜 플로팅 팝업 미리보기를 실행합니다.", Toast.LENGTH_SHORT).show()
                InCallOverlayManager.show(activity, "010-1234-5678", previewMode = true)
            }
        }

        binding.btnOpenInCallSummarySheet.setOnClickListener {
            onOpenSheetChooser("RECORDING", "[SheetBot] 통화 녹음 및 고객 메모 대장")
        }

        updateOverlayPermissionStatus()
    }

    /**
     * 카드 접기/펼치기 상태 토글
     */
    fun toggleCollapse() {
        prefs.isInCallSummaryDetailsHidden = !prefs.isInCallSummaryDetailsHidden
        refreshCollapseState()
    }

    /**
     * 접기/펼치기 뷰 상태 갱신
     */
    fun refreshCollapseState() {
        activity.updateCardCollapseState(
            binding.layoutInCallSummarySettings,
            binding.btnToggleInCallSummaryDetails,
            prefs.isInCallSummaryDetailsHidden
        )
    }

    /**
     * '다른 앱 위에 표시' 오버레이 권한 상태 실시간 검사 및 UI 갱신
     */
    fun updateOverlayPermissionStatus() {
        val hasPermission = InCallOverlayManager.canDrawOverlays(activity)
        if (hasPermission) {
            binding.tvOverlayPermissionStatus.text = "• 다른 앱 위에 표시: 허용됨 (정상 작동 중)"
            binding.tvOverlayPermissionStatus.setTextColor(Color.parseColor("#34D399"))
            binding.btnRequestOverlayPermission.visibility = View.GONE
        } else {
            binding.tvOverlayPermissionStatus.text = "• 다른 앱 위에 표시: 권한 필요 (터치하여 허용)"
            binding.tvOverlayPermissionStatus.setTextColor(Color.parseColor("#F59E0B"))
            binding.btnRequestOverlayPermission.visibility = View.VISIBLE
        }
    }

    /**
     * '다른 앱 위에 표시' 시스템 권한 설정창 호출
     */
    fun requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${activity.packageName}")
                )
                activity.startActivity(intent)
                Toast.makeText(activity, "SheetBot을 찾아 '다른 앱 위에 표시' 권한을 켜주세요.", Toast.LENGTH_LONG).show()
            } catch (_: Exception) {
                try {
                    val fallbackIntent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
                    activity.startActivity(fallbackIntent)
                } catch (_: Exception) {}
            }
        }
    }
}
