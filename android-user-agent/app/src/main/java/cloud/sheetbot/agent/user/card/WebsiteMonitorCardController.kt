package cloud.sheetbot.agent.user.card

import android.graphics.Color
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.lifecycleScope
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 🌐 내 웹사이트 실시간 장애 감시 (Uptime Sentinel) 카드 전담 컨트롤러
 * - 감시 ON/OFF 스위치, 감시 URL 입력/자동저장, 비상 알람 설정, 즉시 헬스체크 및 실시간 상태 UI 캡슐화
 */
class WebsiteMonitorCardController(
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
        binding.switchWebsiteMonitor.isChecked = prefs.isWebsiteMonitorEnabled
        binding.etTargetWebsiteUrl.setText(prefs.targetWebsiteUrl)
        binding.cbWebsiteEmergencyAlarm.isChecked = prefs.isWebsiteEmergencyAlarmEnabled
        updateStatusText()

        // 접기/펼치기 헤더 및 버튼 리스너 바인딩
        val toggleWebsiteMonitor = {
            prefs.isWebsiteMonitorDetailsHidden = !prefs.isWebsiteMonitorDetailsHidden
            activity.updateCardCollapseState(
                binding.layoutWebsiteMonitorSettings,
                binding.btnToggleWebsiteMonitorDetails,
                prefs.isWebsiteMonitorDetailsHidden
            )
        }
        binding.layoutWebsiteMonitorHeader.setOnClickListener { toggleWebsiteMonitor() }
        binding.btnToggleWebsiteMonitorDetails.setOnClickListener { toggleWebsiteMonitor() }

        binding.switchWebsiteMonitor.setOnCheckedChangeListener { _, isChecked ->
            prefs.isWebsiteMonitorEnabled = isChecked
            prefs.isWebsiteMonitorDetailsHidden = !isChecked
            activity.updateCardCollapseState(
                binding.layoutWebsiteMonitorSettings,
                binding.btnToggleWebsiteMonitorDetails,
                !isChecked
            )
            val msg = if (isChecked) "내 웹사이트 실시간 접속 장애 감시가 켜졌습니다." else "웹사이트 접속 장애 감시가 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            updateStatusText()

            if (isChecked) {
                onProvisionSheet("WEBSITE_MONITOR", "[SheetBot] 웹사이트 모니터링 & 장애 대장")
                if (prefs.targetWebsiteUrl.isNotBlank()) {
                    checkWebsiteHealthImmediate()
                }
            }
        }

        binding.btnOpenWebsiteMonitorSheet.setOnClickListener {
            onOpenSheetChooser("WEBSITE_MONITOR", "[SheetBot] 웹사이트 모니터링 & 장애 대장")
        }

        binding.etTargetWebsiteUrl.doAfterTextChanged {
            val url = it?.toString()?.trim() ?: ""
            prefs.targetWebsiteUrl = url
            updateStatusText()
        }

        binding.cbWebsiteEmergencyAlarm.setOnCheckedChangeListener { _, isChecked ->
            prefs.isWebsiteEmergencyAlarmEnabled = isChecked
        }

        binding.btnCheckWebsiteNow.setOnClickListener {
            checkWebsiteHealthImmediate()
        }
    }

    /**
     * 감시 상태 텍스트 및 신호등 UI 갱신 (외부 onResume 등에서도 호출 가능)
     */
    fun updateStatusText() {
        try {
            if (!prefs.isWebsiteMonitorEnabled) {
                binding.tvWebsiteMonitorStatus.text = "상태: 감시 꺼짐 (스위치를 켜면 활성화됩니다)"
                binding.tvWebsiteMonitorStatus.setTextColor(Color.parseColor("#94A3B8"))
                return
            }

            val url = prefs.targetWebsiteUrl
            if (url.isBlank()) {
                binding.tvWebsiteMonitorStatus.text = "상태: URL 미등록 (감시할 웹사이트 주소를 입력하세요)"
                binding.tvWebsiteMonitorStatus.setTextColor(Color.parseColor("#FBBF24"))
                return
            }

            val lastStatus = prefs.lastWebsiteCheckStatus
            val lastCode = prefs.lastWebsiteCheckStatusCode
            val lastTime = prefs.lastWebsiteCheckTime

            val timeStr = if (lastTime > 0) {
                val sdf = SimpleDateFormat("HH:mm:ss", Locale.KOREA)
                " (최근 점검: ${sdf.format(Date(lastTime))})"
            } else ""

            if (lastCode in 200..399 || lastStatus.contains("정상")) {
                binding.tvWebsiteMonitorStatus.text = "🟢 $lastStatus$timeStr"
                binding.tvWebsiteMonitorStatus.setTextColor(Color.parseColor("#34D399"))
            } else if (lastStatus == "미설정") {
                binding.tvWebsiteMonitorStatus.text = "🟡 3분 주기 감시 대기 중$timeStr"
                binding.tvWebsiteMonitorStatus.setTextColor(Color.parseColor("#FBBF24"))
            } else {
                binding.tvWebsiteMonitorStatus.text = "🔴 $lastStatus$timeStr"
                binding.tvWebsiteMonitorStatus.setTextColor(Color.parseColor("#F87171"))
            }
        } catch (e: Throwable) {
            Log.w("WebsiteMonitorCtrl", "updateStatusText 방어: ${e.message}")
        }
    }

    /**
     * 즉시 웹사이트 헬스체크 수행
     */
    fun checkWebsiteHealthImmediate() {
        val url = prefs.targetWebsiteUrl.trim()
        if (url.isBlank()) {
            Toast.makeText(activity, "점검할 웹사이트 URL을 먼저 입력해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.btnCheckWebsiteNow.isEnabled = false
        binding.btnCheckWebsiteNow.text = "점검 중..."
        binding.tvWebsiteMonitorStatus.text = "🔄 실시간 응답 점검 중..."
        binding.tvWebsiteMonitorStatus.setTextColor(Color.parseColor("#38BDF8"))

        activity.lifecycleScope.launch {
            val result = ApiClient.checkWebsiteHealth(url)
            binding.btnCheckWebsiteNow.isEnabled = true
            binding.btnCheckWebsiteNow.text = "⚡ 지금 점검"

            prefs.lastWebsiteCheckStatusCode = result.statusCode
            prefs.lastWebsiteCheckTime = System.currentTimeMillis()

            if (result.isOnline) {
                prefs.lastWebsiteCheckStatus = "정상 응답 (HTTP ${result.statusCode}, ${result.responseTimeMs}ms)"
                Toast.makeText(activity, "🎉 [정상 응답] ${result.checkedUrl} (${result.responseTimeMs}ms)", Toast.LENGTH_SHORT).show()
            } else {
                val isNetOk = ApiClient.verifyInternetConnectivity()
                val errText = if (isNetOk) {
                    "사이트 접속 불가 (${result.errorMessage ?: "HTTP " + result.statusCode})"
                } else {
                    "스마트폰 인터넷 연결 불안정"
                }
                prefs.lastWebsiteCheckStatus = errText
                Toast.makeText(activity, "⚠️ [접속 실패] $errText", Toast.LENGTH_LONG).show()
            }
            updateStatusText()
        }
    }

    /**
     * 전체 카드 접기/펼치기 상태 복원
     */
    fun refreshCollapseState() {
        activity.updateCardCollapseState(
            binding.layoutWebsiteMonitorSettings,
            binding.btnToggleWebsiteMonitorDetails,
            prefs.isWebsiteMonitorDetailsHidden
        )
    }
}
