package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.FileToSheetClient
import cloud.sheetbot.agent.user.FtsSheetViewerActivity
import cloud.sheetbot.agent.user.R
import cloud.sheetbot.agent.user.TasksActivity
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 🌐 통합 모바일 에이전트 & 서버 관제 상태 카드 전담 컨트롤러
 *
 * - sheetbot.cloud 백엔드 서버 실시간 통신 상태 점검 (30초 자동 주기 모니터링 루프)
 * - 관제 카드 상세 정보 아코디언 접기/펼치기 제어 (v2.1.54)
 * - 웹 대시보드(알림 관제 센터) 원터치 브라우저 열기
 * - 스마트 통합 할 일 허브(TasksActivity) 런처 및 미완료 과업 뱃지 실시간 갱신
 * - 연동/미연동 상태에 따른 카드 배경 및 컨트롤 가시성 동적 전환
 */
class ServerStatusCardController(
    private val activity: AppCompatActivity,
    private val binding: ActivityMainBinding,
    private val prefs: AppPreferences,
    private val scope: CoroutineScope
) {
    private var serverMonitorJob: Job? = null

    fun setup() {
        // 1. 관제 상세 정보 접기/펼치기 토글
        updateStatusDetailsVisibility(prefs.isStatusDetailsHidden)
        val toggleStatusAction = {
            val nextState = !prefs.isStatusDetailsHidden
            prefs.isStatusDetailsHidden = nextState
            updateStatusDetailsVisibility(nextState)
        }
        binding.btnToggleStatusDetails.setOnClickListener { toggleStatusAction() }
        binding.layoutIntegratedHeader.setOnClickListener { toggleStatusAction() }

        // 2. 실시간 서버 통신 상태 재점검 버튼
        binding.btnRefreshServerStatus.setOnClickListener {
            checkServerAndQueueStatus(showToast = true)
        }

        // 3. 🌐 시트봇 웹 관제 센터 원터치 바로가기 (기본 브라우저로 0초 열기)
        binding.btnOpenWebDashboard.setOnClickListener {
            try {
                val dashboardUrl = "https://sheetbot.cloud/dashboard/notifications"
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(dashboardUrl)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(activity, "웹 브라우저를 열 수 없습니다: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            }
        }

        // 4. 📋 스마트 통합 할 일 허브 전용 화면 열기 (옵션 B)
        val openTasksHub = {
            val intent = Intent(activity, TasksActivity::class.java)
            activity.startActivity(intent)
        }
        binding.btnOpenTasksHub.setOnClickListener { openTasksHub() }
        binding.cardTasksHub.setOnClickListener { openTasksHub() }

        // 5. ⚡ 파일투시트(FileToSheet) 통합 워크스페이스 카드 (전체 프로젝트 · 결재 · 파일 적재)
        val openFtsWorkspace: (Boolean, String?) -> Unit = { autoOpenIngest, initialFilter ->
            val intent = Intent(activity, FtsSheetViewerActivity::class.java).apply {
                putExtra(FtsSheetViewerActivity.EXTRA_PROJECT_ID, prefs.ftsProjectId ?: "")
                putExtra(FtsSheetViewerActivity.EXTRA_PHONE_NUMBER, prefs.ftsPhoneNumber ?: "")
                putExtra(FtsSheetViewerActivity.EXTRA_AUTO_OPEN_INGEST, autoOpenIngest)
                if (!initialFilter.isNullOrBlank()) {
                    putExtra(FtsSheetViewerActivity.EXTRA_INITIAL_APPROVAL_FILTER, initialFilter)
                }
            }
            activity.startActivity(intent)
        }
        binding.layoutFtsWorkspaceHeader.setOnClickListener { openFtsWorkspace(false, null) }
        binding.cardFtsWorkspace.setOnClickListener { openFtsWorkspace(false, null) }
        binding.btnOpenFtsWorkspaceAll.setOnClickListener { openFtsWorkspace(false, "ALL") }
        binding.btnOpenFtsWorkspacePending.setOnClickListener { openFtsWorkspace(false, "PENDING") }
        binding.btnOpenFtsWorkspaceIngest.setOnClickListener { openFtsWorkspace(true, null) }
    }

    fun startServerMonitorLoop() {
        serverMonitorJob?.cancel()

        val email = prefs.userEmail ?: ""
        val isFts = prefs.isDestinationFileToSheet && prefs.isFtsPaired
        if ((prefs.isPaired && email.isNotBlank()) || isFts || !prefs.ftsPhoneNumber.isNullOrBlank()) {
            refreshTasksBadge(email)
            refreshFtsWorkspaceSummary()
        }

        serverMonitorJob = scope.launch {
            while (isActive) {
                checkServerAndQueueStatus(showToast = false)
                delay(30000L) // 30초마다 갱신
            }
        }
    }

    fun stopServerMonitorLoop() {
        try {
            serverMonitorJob?.cancel()
            serverMonitorJob = null
        } catch (_: Throwable) {}
    }

    fun checkServerAndQueueStatus(showToast: Boolean = false) {
        val isFtsMode = prefs.isDestinationFileToSheet && prefs.isFtsPaired

        if (isFtsMode) {
            val pName = prefs.ftsProjectName ?: "File to Sheet"
            val sName = prefs.ftsSheetName ?: "기본 시트"
            scope.launch {
                val ping = withContext(Dispatchers.IO) { FileToSheetClient.pingFtsServer(prefs.ftsEndpoint) }
                if (activity.isFinishing || activity.isDestroyed) return@launch

                if (ping.isOnline) {
                    binding.cardStatus.setBackgroundResource(R.drawable.bg_card_connected)
                    binding.tvStatusTitle.text = "🟢 [File to Sheet] 정상 작동 중"
                    binding.tvConnectedAccount.text = "연결 대상: [$pName - $sName]"
                    binding.tvServerStatus.text = "🌐 서버 통신: 🟢 정상 (file2sheet.cloud · ${ping.latencyMs}ms)"
                    if (showToast) {
                        Toast.makeText(activity, "✅ file2sheet.cloud 연결 정상 (${ping.latencyMs}ms)", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    binding.cardStatus.setBackgroundResource(R.drawable.bg_card_unpaired)
                    binding.tvStatusTitle.text = "🔴 [File to Sheet] 서버 응답 없음"
                    binding.tvConnectedAccount.text = "연결 대상: [$pName - $sName]"
                    binding.tvServerStatus.text = "🌐 서버 통신: 🔴 연결 실패 (서버 응답 없음)"
                    if (showToast) {
                        Toast.makeText(activity, "❌ file2sheet.cloud 서버 응답이 없습니다.", Toast.LENGTH_SHORT).show()
                    }
                }
            }
            return
        }

        scope.launch {
            val ping = withContext(Dispatchers.IO) { ApiClient.pingServer() }
            if (activity.isFinishing || activity.isDestroyed) return@launch
            val email = prefs.userEmail ?: ""
            val paired = prefs.isPaired && email.isNotBlank()

            if (ping.isOnline) {
                if (paired) {
                    binding.cardStatus.setBackgroundResource(R.drawable.bg_card_connected)
                    binding.tvStatusTitle.text = "🟢 시트봇 정상 작동 중"
                    binding.tvConnectedAccount.text = "연결된 계정: $email"
                } else {
                    binding.cardStatus.setBackgroundResource(R.drawable.bg_card_unpaired)
                    binding.tvStatusTitle.text = "⚠️ 미연동 상태 (서버 정상)"
                    binding.tvConnectedAccount.text = "연결된 계정: 미연동 (휴대폰 번호 또는 구글/QR 인증 필요)"
                }
                binding.tvServerStatus.text = "🌐 서버 통신: 🟢 정상 (${ping.latencyMs}ms)"

                if (showToast) {
                    Toast.makeText(activity, "✅ sheetbot.cloud 서버 통신 정상 (${ping.latencyMs}ms)", Toast.LENGTH_SHORT).show()
                }
            } else {
                binding.cardStatus.setBackgroundResource(R.drawable.bg_card_unpaired)
                binding.tvStatusTitle.text = "🔴 시트봇 서버 응답 없음 (연결 끊김)"
                binding.tvConnectedAccount.text = if (paired) "연결된 계정: $email" else "연결된 계정: 미연동"
                binding.tvServerStatus.text = "🌐 서버 통신: 🔴 연결 실패 (서버 응답 없음 · 자동 재시도)"

                if (showToast) {
                    Toast.makeText(activity, "❌ sheetbot.cloud 서버 응답이 없습니다.", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    fun updateStatusDetailsVisibility(hidden: Boolean) {
        binding.layoutStatusDetails.visibility = if (hidden) View.GONE else View.VISIBLE
        binding.btnToggleStatusDetails.text = if (hidden) "▼" else "▲"
    }

    /**
     * 📋 스마트 통합 할 일 허브 실시간 미완료 과업 뱃지 갱신 (시트봇 + 파일투시트 통합)
     */
    fun refreshTasksBadge(userEmail: String) {
        scope.launch(Dispatchers.IO) {
            val ftsPhone = prefs.ftsPhoneNumber
            val ftsProjectId = prefs.ftsProjectId
            val sbResult = if (userEmail.isNotBlank() || !ftsPhone.isNullOrBlank()) {
                ApiClient.fetchTasks(userEmail, "PENDING", phoneNumber = ftsPhone, projectId = ftsProjectId)
            } else {
                null
            }
            val ftsResult = if (prefs.isFtsPaired || !ftsPhone.isNullOrBlank() || !ftsProjectId.isNullOrBlank()) {
                FileToSheetClient.fetchFtsTasks(prefs, "PENDING")
            } else {
                null
            }

            val anySuccess = (sbResult?.success == true) || (ftsResult?.success == true)
            val mergedTitles = mutableSetOf<String>()
            sbResult?.tasks?.filter { it.status == "PENDING" }?.forEach {
                if (it.title.isNotBlank()) mergedTitles.add(it.title.trim())
            }
            ftsResult?.tasks?.filter { it.status == "PENDING" }?.forEach {
                if (it.title.isNotBlank()) mergedTitles.add(it.title.trim())
            }

            val fallbackCount = maxOf(sbResult?.pendingCount ?: 0, ftsResult?.pendingCount ?: 0)
            val count = if (mergedTitles.isNotEmpty()) mergedTitles.size else fallbackCount

            withContext(Dispatchers.Main) {
                if (!activity.isFinishing && !activity.isDestroyed && anySuccess) {
                    if (count > 0) {
                        binding.tvTasksHubBadge.text = "대기 ${count}건 ›"
                        binding.tvTasksHubBadge.backgroundTintList =
                            android.content.res.ColorStateList.valueOf(Color.parseColor("#B45309")) // Amber
                        binding.tvTasksHubSubtitle.text = "현재 진행해야 할 후속 과업이 ${count}건 있습니다."
                    } else {
                        binding.tvTasksHubBadge.text = "완료됨 ✓"
                        binding.tvTasksHubBadge.backgroundTintList =
                            android.content.res.ColorStateList.valueOf(Color.parseColor("#047857")) // Emerald
                        binding.tvTasksHubSubtitle.text = "모든 후속 조치 및 할 일이 완료되었습니다."
                    }
                }
            }
        }
    }

    /**
     * ⚡ 파일투시트 통합 워크스페이스 카드 실시간 요약 뱃지 갱신 (전체 프로젝트 · 시트 · 결재 대기 수)
     */
    fun refreshFtsWorkspaceSummary() {
        val phone = prefs.ftsPhoneNumber?.replace("[^0-9]".toRegex(), "").orEmpty()
        if (phone.length < 10 && !prefs.isFtsPaired) return

        scope.launch(Dispatchers.IO) {
            try {
                val res = FileToSheetClient.fetchAllWorkspaceProjects(
                    phoneNumber = phone,
                    targetProjectId = prefs.ftsProjectId,
                    targetSheetName = null
                )
                if (!res.success || res.projects.isEmpty()) return@launch

                val projCount = res.projects.size
                val sheetCount = res.projects.sumOf { it.sheets.size }
                val totalRows = res.projects.sumOf { it.totalRowCount }
                val pendingApprovals = res.projects.sumOf { p -> p.sheets.sumOf { s -> s.pendingCount } }

                withContext(Dispatchers.Main) {
                    if (!activity.isFinishing && !activity.isDestroyed) {
                        binding.tvFtsWorkspaceSubtitle.text =
                            "전체 프로젝트 ${projCount}개 · 시트 ${sheetCount}개 (총 ${totalRows}건) · 결재 대기 ${pendingApprovals}건"
                        binding.tvFtsWorkspaceBadge.text = "프로젝트 ${projCount}개 ›"
                    }
                }
            } catch (_: Exception) {
            }
        }
    }

    /**
     * 연동/미연동 상태에 따른 상태 카드 및 관련 뷰 가시성/스타일 갱신
     */
    fun updateCardStatus(isPaired: Boolean, email: String?) {
        updateStatusDetailsVisibility(prefs.isStatusDetailsHidden)

        val isFts = prefs.isDestinationFileToSheet && prefs.isFtsPaired

        if (isFts) {
            val pName = prefs.ftsProjectName ?: "File to Sheet"
            val sName = prefs.ftsSheetName ?: "기본 시트"
            binding.tvStatusTitle.text = "🟡 [File to Sheet] 연결 확인 중..."
            binding.tvConnectedAccount.text = "연결 대상: [$pName - $sName]"
            binding.tvServerStatus.text = "🌐 서버 통신: 🟡 확인 중 (file2sheet.cloud)"
            binding.btnRefreshServerStatus.visibility = View.VISIBLE
            binding.btnToggleStatusDetails.visibility = View.VISIBLE
            binding.cardTasksHub.visibility = if (prefs.hiddenCardKeys.contains("cardTasksHub")) View.GONE else View.VISIBLE
            binding.cardFtsWorkspace.visibility = if (prefs.hiddenCardKeys.contains("cardFtsWorkspace")) View.GONE else View.VISIBLE
            checkServerAndQueueStatus(showToast = false)
            refreshTasksBadge(email ?: "")
            refreshFtsWorkspaceSummary()
        } else if (isPaired && !email.isNullOrBlank()) {
            binding.tvStatusTitle.text = "🟡 시트봇 서버 연결 확인 중..."
            binding.tvConnectedAccount.text = "연결된 계정: $email"
            binding.tvServerStatus.text = "🌐 서버 통신: 🟡 확인 중 (sheetbot.cloud)"
            binding.btnRefreshServerStatus.visibility = View.VISIBLE
            binding.btnToggleStatusDetails.visibility = View.VISIBLE
            binding.cardTasksHub.visibility = if (prefs.hiddenCardKeys.contains("cardTasksHub")) View.GONE else View.VISIBLE
            binding.cardFtsWorkspace.visibility = if (prefs.hiddenCardKeys.contains("cardFtsWorkspace")) View.GONE else View.VISIBLE
            checkServerAndQueueStatus(showToast = false)
            refreshTasksBadge(email)
            refreshFtsWorkspaceSummary()
        } else {
            binding.cardStatus.setBackgroundResource(R.drawable.bg_card_unpaired)
            binding.tvStatusTitle.text = "⚠️ 미연동 상태"
            binding.tvConnectedAccount.text = "연결된 계정: 미연동 (휴대폰 번호 또는 구글/QR 인증 필요)"
            binding.tvServerStatus.text = "🌐 서버 통신: 🟡 확인 중..."
            binding.btnRefreshServerStatus.visibility = View.VISIBLE
            binding.btnToggleStatusDetails.visibility = View.VISIBLE
            binding.cardTasksHub.visibility = View.GONE
            binding.cardFtsWorkspace.visibility = if (prefs.hiddenCardKeys.contains("cardFtsWorkspace")) View.GONE else View.VISIBLE
            checkServerAndQueueStatus(showToast = false)
        }

        // 🛍️ 시트봇 스토어 보관 상태 존중 (보관 시 홈 화면에서 안전하게 숨김)
        if (prefs.hiddenCardKeys.contains("cardStatus")) {
            binding.cardStatus.visibility = View.GONE
        }
    }
}
