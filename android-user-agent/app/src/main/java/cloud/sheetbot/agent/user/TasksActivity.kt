package cloud.sheetbot.agent.user

import android.app.AlertDialog
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import cloud.sheetbot.agent.user.card.CardInlineLoadingHelper
import cloud.sheetbot.agent.user.databinding.ActivityTasksBinding
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 📋 스마트 통합 할 일 허브(Task Hub) 모바일 전용 액티비티
 * - 통화 녹음, 부재중 전화, 간편 주문 지연 등 AI가 추출한 비즈니스 후속 과업을 모바일 앱에서 직접 관리
 */
class TasksActivity : AppCompatActivity() {

    private lateinit var binding: ActivityTasksBinding
    private lateinit var adapter: TaskAdapter
    private lateinit var prefs: PreferencesManager
    private var allTasks = listOf<TaskItemDto>()
    private var currentFilter = "PENDING" // PENDING, DONE, ALL
    private var userEmail: String = ""
    private var loadTasksJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityTasksBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = PreferencesManager(this)
        userEmail = prefs.userEmail ?: ""
        val hasFtsConnection = prefs.isFtsPaired || !prefs.ftsPhoneNumber.isNullOrBlank() || !prefs.ftsProjectId.isNullOrBlank()

        setupToolbar()
        setupRecyclerView()
        setupFilters()

        if (userEmail.isBlank() && !hasFtsConnection) {
            Toast.makeText(this, "시트봇 또는 파일투시트 계정 연동이 필요합니다.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        loadTasks()
    }

    private fun setupToolbar() {
        binding.btnBack.setOnClickListener { finish() }

        binding.btnRefreshTasks.setOnClickListener {
            loadTasks()
        }

        binding.btnOpenWebTasks.setOnClickListener {
            val targetUrl = if (prefs.isDestinationFileToSheet && prefs.isFtsPaired) {
                "https://file2sheet.cloud"
            } else {
                "https://sheetbot.cloud/tasks"
            }
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl))
            startActivity(intent)
        }

        binding.btnAddNewTask.setOnClickListener {
            showAddTaskDialog()
        }
    }

    private fun setupRecyclerView() {
        adapter = TaskAdapter(
            onToggleStatus = { task ->
                val nextStatus = if (task.status == "DONE") "PENDING" else "DONE"
                toggleTask(task, nextStatus)
            },
            onCallClick = { phone ->
                openDialer(phone)
            },
            onItemClick = { task, resolvedName, resolvedPhone ->
                showTaskActionBottomSheet(task, resolvedName, resolvedPhone)
            }
        )
        binding.rvTasksList.layoutManager = LinearLayoutManager(this)
        binding.rvTasksList.adapter = adapter
    }

    private fun openDialer(phone: String) {
        val clean = phone.trim()
        if (clean.isBlank()) {
            Toast.makeText(this, "연결된 전화번호가 없습니다.", Toast.LENGTH_SHORT).show()
            return
        }
        try {
            val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$clean"))
            startActivity(dialIntent)
        } catch (e: Exception) {
            Toast.makeText(this, "전화 앱을 열 수 없습니다.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun openSmsConversation(phone: String, prefillBody: String? = null) {
        val clean = phone.trim()
        if (clean.isBlank()) {
            Toast.makeText(this, "문자 대화창을 열 전화번호가 없습니다.", Toast.LENGTH_SHORT).show()
            return
        }
        try {
            val smsIntent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$clean")).apply {
                if (!prefillBody.isNullOrBlank()) {
                    putExtra("sms_body", prefillBody)
                }
            }
            startActivity(smsIntent)
        } catch (e: Exception) {
            try {
                val viewIntent = Intent(Intent.ACTION_VIEW, Uri.parse("sms:$clean")).apply {
                    if (!prefillBody.isNullOrBlank()) {
                        putExtra("sms_body", prefillBody)
                    }
                }
                startActivity(viewIntent)
            } catch (_: Exception) {
                Toast.makeText(this, "메시지 앱을 열 수 없습니다.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun openKakaoTalkAppOrRoom(session: KakaoReplySessionCache.ReplySession?) {
        if (session != null && session.canOpenChatRoom) {
            if (KakaoReplySessionCache.openChatRoom(session)) {
                return
            }
        }
        try {
            val launchIntent = packageManager.getLaunchIntentForPackage("com.kakao.talk")
            if (launchIntent != null) {
                startActivity(launchIntent)
            } else {
                Toast.makeText(this, "카카오톡 앱이 설치되어 있지 않습니다.", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            Toast.makeText(this, "카카오톡을 실행할 수 없습니다.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showTaskActionBottomSheet(
        task: TaskItemDto,
        initialName: String?,
        initialPhone: String?
    ) {
        val dialog = BottomSheetDialog(this)
        val view = LayoutInflater.from(this).inflate(R.layout.dialog_task_action_sheet, null)
        dialog.setContentView(view)

        val tvSourceBadge = view.findViewById<TextView>(R.id.tvSheetSourceBadge)
        val tvStateBadge = view.findViewById<TextView>(R.id.tvSheetStateBadge)
        val tvDueDate = view.findViewById<TextView>(R.id.tvSheetDueDate)
        val btnClose = view.findViewById<View>(R.id.btnCloseTaskSheet)
        val tvTitle = view.findViewById<TextView>(R.id.tvSheetTaskTitle)
        val layoutContactBox = view.findViewById<View>(R.id.layoutSheetContactBox)
        val tvContactName = view.findViewById<TextView>(R.id.tvSheetContactName)
        val tvContactPhone = view.findViewById<TextView>(R.id.tvSheetContactPhone)
        val scrollDesc = view.findViewById<View>(R.id.scrollSheetDescription)
        val tvDesc = view.findViewById<TextView>(R.id.tvSheetTaskDescription)

        val btnCallNow = view.findViewById<Button>(R.id.btnActionCallNow)
        val btnOpenSms = view.findViewById<Button>(R.id.btnActionOpenSmsApp)
        val btnOpenKakao = view.findViewById<Button>(R.id.btnActionOpenKakao)

        val layoutQuickReplyBox = view.findViewById<View>(R.id.layoutQuickReplyBox)
        val tvQuickReplyHeader = view.findViewById<TextView>(R.id.tvQuickReplyHeader)
        val layoutTemplates = view.findViewById<LinearLayout>(R.id.layoutQuickReplyTemplates)
        val etReply = view.findViewById<EditText>(R.id.etQuickReplyMessage)
        val btnSendReply = view.findViewById<Button>(R.id.btnSendQuickReplyNow)
        val btnToggleDone = view.findViewById<Button>(R.id.btnActionToggleTaskDone)

        btnClose.setOnClickListener { dialog.dismiss() }

        // 1. 전화번호 및 고객명 정밀 보강 (주소록 역조회 포함)
        var targetName = initialName?.trim()?.takeIf { it.isNotEmpty() && !it.equals("null", true) }
        var targetPhone = initialPhone?.trim()?.takeIf { it.isNotEmpty() && !it.equals("null", true) }

        if (targetPhone == null) {
            val textToScan = "${task.title} ${task.description.orEmpty()} ${targetName.orEmpty()}"
            val phoneRegexMatch = Regex("(01[016789][\\-\\s]?\\d{3,4}[\\-\\s]?\\d{4}|0\\d{1,2}[\\-\\s]?\\d{3,4}[\\-\\s]?\\d{4})").find(textToScan)
            if (phoneRegexMatch != null) {
                targetPhone = ContactHelper.formatPhoneNumber(phoneRegexMatch.value)
            }
        }
        if (targetPhone == null && !targetName.isNullOrBlank()) {
            val lookupName = targetName.substringBefore("(").trim()
            targetPhone = ContactHelper.getPhoneNumberByName(this, lookupName)
        }
        if (targetName == null && !targetPhone.isNullOrBlank()) {
            targetName = ContactHelper.getContactName(this, targetPhone)
        }

        // 2. 상단 뱃지 및 제목/상세 내용 바인딩
        when (task.sourceType) {
            "CALL_RECORDING" -> {
                tvSourceBadge.text = "🎙️ 통화 녹음"
                tvSourceBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#064E3B"))
            }
            "MEETING_RECORDING" -> {
                tvSourceBadge.text = "🎙️ 회의 녹음"
                tvSourceBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#115E59"))
            }
            "MISSED_CALL" -> {
                tvSourceBadge.text = "📞 부재중 전화"
                tvSourceBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#78350F"))
            }
            "ORDER_DELAY", "ORDER" -> {
                tvSourceBadge.text = "📦 주문/견적"
                tvSourceBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#1E3A8A"))
            }
            "KAKAO" -> {
                tvSourceBadge.text = "💬 카카오톡"
                tvSourceBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#713F12"))
            }
            "SMS" -> {
                tvSourceBadge.text = "📱 문자 메시지"
                tvSourceBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#312E81"))
            }
            else -> {
                tvSourceBadge.text = "📋 일반 업무"
                tvSourceBadge.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#334155"))
            }
        }

        val cleanBadge = task.badgeText?.trim()?.takeIf { it.isNotEmpty() && !it.equals("null", true) }
        if (cleanBadge != null && !tvSourceBadge.text.toString().contains(cleanBadge)) {
            tvStateBadge.text = cleanBadge
            tvStateBadge.visibility = View.VISIBLE
        } else {
            tvStateBadge.visibility = View.GONE
        }

        tvDueDate.text = task.dueDate?.takeIf { it.isNotBlank() && !it.equals("null", true) } ?: ""
        tvTitle.text = task.title

        if (targetName != null || targetPhone != null) {
            layoutContactBox.visibility = View.VISIBLE
            tvContactName.text = "👤 고객: ${targetName ?: "미등록 연락처"}"
            if (targetPhone != null) {
                tvContactPhone.text = "📞 $targetPhone"
                tvContactPhone.visibility = View.VISIBLE
                tvContactPhone.setOnClickListener {
                    dialog.dismiss()
                    openDialer(targetPhone)
                }
            } else {
                tvContactPhone.visibility = View.GONE
            }
        } else {
            layoutContactBox.visibility = View.GONE
        }

        val cleanDesc = task.description?.trim()?.takeIf { it.isNotEmpty() && !it.equals("null", true) }
        if (cleanDesc != null && cleanDesc != task.title.trim()) {
            scrollDesc.visibility = View.VISIBLE
            tvDesc.text = cleanDesc
        } else {
            scrollDesc.visibility = View.GONE
        }

        // 3. 카카오톡 세션 확인
        val kakaoSession = KakaoReplySessionCache.findSession(targetName, task.title)
        val isKakaoTask = task.sourceType == "KAKAO"

        // 4. 1차 주요 액션 버튼 구성 (전화걸기 / 문자 대화창 열기 / 카톡 열기)
        if (targetPhone != null) {
            btnCallNow.visibility = View.VISIBLE
            btnCallNow.text = if (task.sourceType == "CALL_RECORDING" || task.sourceType == "MISSED_CALL") {
                "📞 바로 전화걸기"
            } else {
                "📞 전화걸기"
            }
            btnCallNow.setOnClickListener {
                dialog.dismiss()
                openDialer(targetPhone)
            }

            btnOpenSms.visibility = View.VISIBLE
            btnOpenSms.text = "💬 문자 대화창 열기"
            btnOpenSms.setOnClickListener {
                val draft = etReply.text?.toString()?.trim()
                dialog.dismiss()
                openSmsConversation(targetPhone, draft)
            }
        } else {
            btnCallNow.visibility = View.GONE
            btnOpenSms.visibility = View.GONE
        }

        if (isKakaoTask || kakaoSession != null) {
            btnOpenKakao.visibility = View.VISIBLE
            btnOpenKakao.text = if (kakaoSession?.canOpenChatRoom == true) "💛 해당 카톡방 열기" else "💛 카카오톡 열기"
            btnOpenKakao.setOnClickListener {
                dialog.dismiss()
                openKakaoTalkAppOrRoom(kakaoSession)
            }
        } else {
            btnOpenKakao.visibility = View.GONE
        }

        // 5. 앱 내 빠른 답장 섹션 (SMS 즉시 발송 또는 카카오톡 RemoteInput 답장)
        val canReplyViaKakao = isKakaoTask && kakaoSession?.canDirectReply == true
        val canReplyViaSms = targetPhone != null && ContactHelper.isMobilePhoneNumber(targetPhone)

        if (canReplyViaKakao || canReplyViaSms) {
            layoutQuickReplyBox.visibility = View.VISIBLE
            if (canReplyViaKakao) {
                tvQuickReplyHeader.text = "💛 카카오톡 바로 답장 보내기 (${kakaoSession?.chatRoomName ?: targetName ?: "채팅방"})"
                etReply.hint = "카카오톡 답장 내용을 입력하세요..."
                btnSendReply.text = "카톡 전송"
            } else {
                tvQuickReplyHeader.text = "⚡ 문자(SMS) 바로 답장 보내기 ($targetPhone)"
                etReply.hint = "답장 문자 내용을 입력하세요..."
                btnSendReply.text = "문자 전송"
            }

            // 상황별 원터치 상용구 칩 생성
            val templates = when (task.sourceType) {
                "MISSED_CALL", "CALL_RECORDING" -> listOf(
                    "안녕하세요, 확인 후 곧 다시 연락드리겠습니다.",
                    "방금 통화 감사드립니다. 말씀하신 내용 확인 후 회신드리겠습니다.",
                    "현재 회의 중이라 잠시 후 전화드리겠습니다."
                )
                "ORDER_DELAY", "ORDER" -> listOf(
                    "주문해주셔서 감사합니다. 확인 후 빠르게 처리해 드리겠습니다.",
                    "요청하신 건 접수 완료되었습니다. 출고 시 안내드리겠습니다.",
                    "견적 및 재고 확인 후 곧 연락드리겠습니다."
                )
                else -> listOf(
                    "네, 확인했습니다. 감사합니다!",
                    "말씀하신 내용 확인 후 연락드리겠습니다.",
                    "잠시 후 확인하여 답변드리겠습니다."
                )
            }

            layoutTemplates.removeAllViews()
            for (tpl in templates) {
                val chip = TextView(this).apply {
                    text = tpl
                    setTextColor(Color.parseColor("#E2E8F0"))
                    textSize = 11f
                    setBackgroundResource(R.drawable.bg_badge_version)
                    backgroundTintList = ColorStateList.valueOf(Color.parseColor("#334155"))
                    setPadding(24, 12, 24, 12)
                    val lp = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply {
                        marginEnd = 16
                    }
                    layoutParams = lp
                    setOnClickListener {
                        etReply.setText(tpl)
                        etReply.setSelection(tpl.length)
                    }
                }
                layoutTemplates.addView(chip)
            }

            btnSendReply.setOnClickListener {
                val msgText = etReply.text?.toString()?.trim().orEmpty()
                if (msgText.isBlank()) {
                    Toast.makeText(this, "답장할 내용을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }

                if (canReplyViaKakao && kakaoSession != null) {
                    val sent = KakaoReplySessionCache.sendDirectReply(this, kakaoSession, msgText)
                    if (sent) {
                        Toast.makeText(this, "💛 카카오톡 답장을 전송하고 할 일을 완료 처리했습니다.", Toast.LENGTH_SHORT).show()
                        if (task.status != "DONE") {
                            toggleTask(task, "DONE")
                        }
                        dialog.dismiss()
                    } else {
                        Toast.makeText(this, "카카오톡 알림 세션이 만료되어 카카오톡 앱을 엽니다.", Toast.LENGTH_SHORT).show()
                        dialog.dismiss()
                        openKakaoTalkAppOrRoom(kakaoSession)
                    }
                } else if (targetPhone != null) {
                    val (sent, _) = SmsSenderUtil.sendSmsDetailed(this, targetPhone, msgText)
                    if (sent) {
                        Toast.makeText(this, "📲 답장 문자를 발송하고 할 일을 완료 처리했습니다.", Toast.LENGTH_SHORT).show()
                        if (task.status != "DONE") {
                            toggleTask(task, "DONE")
                        }
                        dialog.dismiss()
                    } else {
                        // 권한 미허용 등으로 직접 발송 실패 시 기본 메시지 대화창으로 안전 폴백
                        dialog.dismiss()
                        openSmsConversation(targetPhone, msgText)
                    }
                }
            }
        } else if (targetPhone != null) {
            // 유선전화(02, 031 등)인 경우 문자 답장 박스 숨김
            layoutQuickReplyBox.visibility = View.GONE
        } else {
            layoutQuickReplyBox.visibility = View.GONE
        }

        // 6. 완료/미완료 토글 버튼
        val isDone = task.status == "DONE"
        if (isDone) {
            btnToggleDone.text = "↩️ 미완료 상태로 되돌리기"
            btnToggleDone.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#475569"))
        } else {
            btnToggleDone.text = "✅ 이 할 일 완료 처리하기"
            btnToggleDone.backgroundTintList = ColorStateList.valueOf(Color.parseColor("#10B981"))
        }
        btnToggleDone.setOnClickListener {
            val nextStatus = if (isDone) "PENDING" else "DONE"
            toggleTask(task, nextStatus)
            dialog.dismiss()
        }

        dialog.behavior.apply {
            state = BottomSheetBehavior.STATE_EXPANDED
            skipCollapsed = true
        }
        dialog.setOnShowListener {
            dialog.behavior.state = BottomSheetBehavior.STATE_EXPANDED
            dialog.behavior.skipCollapsed = true
        }
        dialog.show()
    }

    private fun isUrgentTask(task: TaskItemDto): Boolean {
        return task.status == "PENDING" && (
            task.priority.contains("URGENT", ignoreCase = true) ||
            task.priority.contains("HIGH", ignoreCase = true) ||
            task.priority.contains("긴급") ||
            task.priority.contains("높음")
        )
    }

    private fun setupFilters() {
        binding.tabPending.setOnClickListener {
            currentFilter = "PENDING"
            applyFilter()
        }
        binding.tabDone.setOnClickListener {
            currentFilter = "DONE"
            applyFilter()
        }
        binding.tabAll.setOnClickListener {
            currentFilter = "ALL"
            applyFilter()
        }

        binding.cardFilterPending.setOnClickListener {
            currentFilter = "PENDING"
            applyFilter()
        }
        binding.cardFilterUrgent.setOnClickListener {
            currentFilter = if (currentFilter == "URGENT") "PENDING" else "URGENT"
            applyFilter()
        }
        binding.cardFilterDone.setOnClickListener {
            currentFilter = "DONE"
            applyFilter()
        }
    }

    private fun styleFilterTab(tab: TextView, isSelected: Boolean, activeColorHex: String = "#059669") {
        val bgColor = if (isSelected) Color.parseColor(activeColorHex) else Color.parseColor("#1E293B")
        val txtColor = if (isSelected) Color.parseColor("#FFFFFF") else Color.parseColor("#94A3B8")
        tab.backgroundTintList = ColorStateList.valueOf(bgColor)
        tab.setTextColor(txtColor)
        tab.setTypeface(null, if (isSelected) Typeface.BOLD else Typeface.NORMAL)
    }

    private fun updateFilterUi() {
        val isPendingOrUrgent = currentFilter == "PENDING" || currentFilter == "URGENT"
        val pendingTabColor = if (currentFilter == "URGENT") "#E11D48" else "#059669"

        styleFilterTab(binding.tabPending, isPendingOrUrgent, pendingTabColor)
        styleFilterTab(binding.tabDone, currentFilter == "DONE", "#059669")
        styleFilterTab(binding.tabAll, currentFilter == "ALL", "#059669")

        // 상단 요약 통계 카드 선택 강조 상태 동기화
        binding.cardFilterPending.alpha = if (currentFilter == "PENDING" || currentFilter == "ALL") 1.0f else 0.55f
        binding.cardFilterUrgent.alpha = if (currentFilter == "URGENT" || currentFilter == "ALL") 1.0f else 0.55f
        binding.cardFilterDone.alpha = if (currentFilter == "DONE" || currentFilter == "ALL") 1.0f else 0.55f
    }

    private fun updateTaskCountsUi() {
        val pendingCount = allTasks.count { it.status == "PENDING" }
        val doneCount = allTasks.count { it.status == "DONE" }
        val urgentCount = allTasks.count { isUrgentTask(it) }
        val totalCount = allTasks.size

        binding.tvStatPendingCount.text = pendingCount.toString()
        binding.tvStatDoneCount.text = doneCount.toString()
        binding.tvStatUrgentCount.text = urgentCount.toString()

        binding.tabPending.text = if (currentFilter == "URGENT") {
            "긴급/높음 ($urgentCount)"
        } else {
            "미완료 ($pendingCount)"
        }
        binding.tabDone.text = "완료됨 ($doneCount)"
        binding.tabAll.text = "전체 ($totalCount)"
    }

    private fun mergeTasksList(lists: List<TaskItemDto>): List<TaskItemDto> {
        val dedupMap = linkedMapOf<String, TaskItemDto>()
        for (t in lists) {
            val key = t.title.trim()
            if (key.isEmpty() || key.equals("null", ignoreCase = true)) continue
            val existing = dedupMap[key]
            if (existing == null) {
                dedupMap[key] = t
            } else if (t.status == "DONE" && existing.status != "DONE") {
                dedupMap[key] = existing.copy(status = "DONE")
            }
        }
        return dedupMap.values.toList()
    }

    private fun loadTasks() {
        loadTasksJob?.cancel()
        binding.pbLoadingTasks.visibility = View.GONE
        binding.llEmptyTasks.visibility = View.GONE
        CardInlineLoadingHelper.show(
            container = binding.layoutTasksInlineLoading,
            message = "⏳ 할 일 목록을 동기화하고 있습니다..."
        )

        loadTasksJob = lifecycleScope.launch {
            try {
                val ftsPhone = prefs.ftsPhoneNumber
                val ftsProjectId = prefs.ftsProjectId
                val hasFts = prefs.isFtsPaired || !ftsPhone.isNullOrBlank() || !ftsProjectId.isNullOrBlank()

                val sbDeferred = if (userEmail.isNotBlank() || !ftsPhone.isNullOrBlank()) {
                    async(Dispatchers.IO) {
                        ApiClient.fetchTasks(
                            userEmail = userEmail,
                            status = "ALL",
                            phoneNumber = ftsPhone,
                            projectId = ftsProjectId
                        )
                    }
                } else null

                val ftsDeferred = if (hasFts) {
                    async(Dispatchers.IO) {
                        FileToSheetClient.fetchFtsTasks(prefs, "ALL")
                    }
                } else null

                // 1차 응답이 먼저 도착하면 화면에 즉시 표시하여 대기 체감 시간을 0초로 단축
                val sbResult = sbDeferred?.await()
                if (sbResult?.success == true && sbResult.tasks.isNotEmpty() && ftsDeferred?.isCompleted == false) {
                    allTasks = mergeTasksList(sbResult.tasks)
                    applyFilter()
                }

                val ftsResult = ftsDeferred?.await()
                val anySuccess = (sbResult?.success == true) || (ftsResult?.success == true)
                val combinedTasks = mergeTasksList(
                    (sbResult?.tasks ?: emptyList()) + (ftsResult?.tasks ?: emptyList())
                )

                CardInlineLoadingHelper.hide(binding.layoutTasksInlineLoading)
                if (anySuccess) {
                    allTasks = combinedTasks
                    applyFilter()
                } else {
                    val errMsg = sbResult?.error ?: ftsResult?.error ?: "할 일 목록을 불러오지 못했습니다."
                    Toast.makeText(this@TasksActivity, errMsg, Toast.LENGTH_SHORT).show()
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                CardInlineLoadingHelper.hide(binding.layoutTasksInlineLoading)
            }
        }
    }

    private fun applyFilter() {
        updateTaskCountsUi()
        updateFilterUi()

        val filtered = when (currentFilter) {
            "PENDING" -> allTasks.filter { it.status == "PENDING" }
            "URGENT" -> allTasks.filter { isUrgentTask(it) }
            "DONE" -> allTasks.filter { it.status == "DONE" }
            else -> allTasks
        }
        adapter.submitList(filtered)
        binding.llEmptyTasks.visibility = if (filtered.isEmpty()) View.VISIBLE else View.GONE
    }

    private fun toggleTask(task: TaskItemDto, nextStatus: String) {
        val taskId = task.id
        // 낙관적 UI 업데이트 (통계 숫자 + 탭 건수 + 필터링 목록 동시 즉시 반영)
        allTasks = allTasks.map {
            if (it.id == taskId || it.title.trim() == task.title.trim()) it.copy(status = nextStatus) else it
        }
        applyFilter()

        CoroutineScope(Dispatchers.IO).launch {
            val ftsPhone = prefs.ftsPhoneNumber
            val ftsProjectId = prefs.ftsProjectId
            val hasFts = prefs.isFtsPaired || !ftsPhone.isNullOrBlank() || !ftsProjectId.isNullOrBlank()

            val sbOk = if (userEmail.isNotBlank() || !ftsPhone.isNullOrBlank()) {
                ApiClient.toggleTaskStatus(
                    userEmail = userEmail,
                    taskId = taskId,
                    nextStatus = nextStatus,
                    title = task.title,
                    phoneNumber = ftsPhone,
                    projectId = ftsProjectId
                )
            } else false

            val ftsOk = if (hasFts) {
                FileToSheetClient.toggleFtsTaskStatus(prefs, taskId, task.title, nextStatus)
            } else false

            if (!sbOk && !ftsOk) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@TasksActivity, "상태 변경 저장에 실패하여 다시 불러옵니다.", Toast.LENGTH_SHORT).show()
                    loadTasks()
                }
            }
        }
    }

    private fun showAddTaskDialog() {
        val builder = AlertDialog.Builder(this)
        builder.setTitle("새로운 할 일 등록")

        val input = EditText(this)
        input.hint = "할 일 내용을 입력하세요 (예: 견적서 수정본 송부)"
        input.setPadding(32, 24, 32, 24)
        builder.setView(input)

        builder.setPositiveButton("등록") { _, _ ->
            val text = input.text.toString().trim()
            if (text.isNotBlank()) {
                CardInlineLoadingHelper.show(
                    container = binding.layoutTasksInlineLoading,
                    message = "⏳ 새로운 할 일을 등록하고 있습니다...",
                    triggerButton = binding.btnAddNewTask,
                    loadingButtonText = "⏳ 등록 중"
                )
                lifecycleScope.launch(Dispatchers.IO) {
                    val ftsPhone = prefs.ftsPhoneNumber
                    val ftsProjectId = prefs.ftsProjectId
                    val hasFts = prefs.isFtsPaired || !ftsPhone.isNullOrBlank() || !ftsProjectId.isNullOrBlank()

                    val sbOk = if (userEmail.isNotBlank() || !ftsPhone.isNullOrBlank()) {
                        ApiClient.createTask(
                            userEmail = userEmail,
                            title = text,
                            badgeText = "모바일 등록",
                            phoneNumber = ftsPhone,
                            projectId = ftsProjectId
                        )
                    } else false

                    val ftsOk = if (hasFts) {
                        FileToSheetClient.createFtsTask(
                            prefs = prefs,
                            title = text,
                            badgeText = "모바일 등록"
                        )
                    } else false

                    withContext(Dispatchers.Main) {
                        CardInlineLoadingHelper.hide(binding.layoutTasksInlineLoading, binding.btnAddNewTask)
                        if (sbOk || ftsOk) {
                            Toast.makeText(this@TasksActivity, "할 일이 등록되었습니다.", Toast.LENGTH_SHORT).show()
                            loadTasks()
                        } else {
                            Toast.makeText(this@TasksActivity, "할 일 등록에 실패했습니다.", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
        }
        builder.setNegativeButton("취소", null)
        builder.show()
    }
}

/**
 * RecyclerView 어댑터
 */
class TaskAdapter(
    private val onToggleStatus: (TaskItemDto) -> Unit,
    private val onCallClick: (String) -> Unit,
    private val onItemClick: (TaskItemDto, String?, String?) -> Unit
) : RecyclerView.Adapter<TaskAdapter.ViewHolder>() {

    private var items = listOf<TaskItemDto>()

    fun submitList(newItems: List<TaskItemDto>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_task_row, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val btnCheck: ImageView = itemView.findViewById(R.id.btnTaskCheck)
        private val tvTitle: TextView = itemView.findViewById(R.id.tvTaskTitle)
        private val tvSourceBadge: TextView = itemView.findViewById(R.id.tvTaskSourceBadge)
        private val tvStateBadge: TextView = itemView.findViewById(R.id.tvTaskStateBadge)
        private val tvDueDate: TextView = itemView.findViewById(R.id.tvTaskDueDate)
        private val tvCustomer: TextView = itemView.findViewById(R.id.tvTaskCustomer)
        private val btnCall: TextView = itemView.findViewById(R.id.btnCallCustomer)

        private fun cleanNullableText(raw: String?): String? {
            val v = raw?.trim() ?: return null
            return if (v.isEmpty() || v.equals("null", ignoreCase = true) || v.equals("undefined", ignoreCase = true)) null else v
        }

        private fun formatKoreanPhone(digits: String): String {
            return when {
                digits.length == 11 && digits.startsWith("01") ->
                    "${digits.substring(0, 3)}-${digits.substring(3, 7)}-${digits.substring(7)}"
                digits.length == 10 && digits.startsWith("02") ->
                    "${digits.substring(0, 2)}-${digits.substring(2, 6)}-${digits.substring(6)}"
                digits.length == 10 ->
                    "${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}"
                digits.length == 9 && digits.startsWith("02") ->
                    "${digits.substring(0, 2)}-${digits.substring(2, 5)}-${digits.substring(5)}"
                else -> digits
            }
        }

        fun bind(item: TaskItemDto) {
            val isDone = item.status == "DONE"
            val cleanBadge = cleanNullableText(item.badgeText)
            val cleanDueDate = cleanNullableText(item.dueDate)
            var cleanCustomerName = cleanNullableText(item.contactName)
            var cleanCustomerPhone = cleanNullableText(item.contactPhone)

            // 고객명 안에 '(01012345678)' 형태로 전화번호가 포함되어 있고 contactPhone이 비어있으면 자동 분리 추출
            if (cleanCustomerPhone == null && cleanCustomerName != null) {
                val phoneMatch = Regex("\\(([0-9\\-]{9,13})\\)").find(cleanCustomerName)
                if (phoneMatch != null) {
                    val rawDigits = phoneMatch.groupValues[1].replace("[^0-9]".toRegex(), "")
                    if (rawDigits.length in 9..11) {
                        cleanCustomerPhone = formatKoreanPhone(rawDigits)
                        val strippedName = cleanCustomerName.replace(phoneMatch.value, "").trim()
                        if (strippedName.isNotEmpty()) {
                            cleanCustomerName = strippedName
                        }
                    }
                }
            }

            tvTitle.text = item.title
            if (isDone) {
                tvTitle.paintFlags = tvTitle.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
                tvTitle.setTextColor(Color.GRAY)
                btnCheck.setImageResource(android.R.drawable.checkbox_on_background)
            } else {
                tvTitle.paintFlags = tvTitle.paintFlags and Paint.STRIKE_THRU_TEXT_FLAG.inv()
                tvTitle.setTextColor(Color.parseColor("#F8FAFC"))
                btnCheck.setImageResource(android.R.drawable.checkbox_off_background)
            }

            btnCheck.setOnClickListener { onToggleStatus(item) }

            // 출처 뱃지
            val sourceLabel: String
            when (item.sourceType) {
                "CALL_RECORDING" -> {
                    sourceLabel = "통화 녹음"
                    tvSourceBadge.text = "🎙️ 통화 녹음"
                    tvSourceBadge.setBackgroundColor(Color.parseColor("#064E3B"))
                }
                "MEETING_RECORDING" -> {
                    sourceLabel = "회의 녹음"
                    tvSourceBadge.text = "🎙️ 회의 녹음"
                    tvSourceBadge.setBackgroundColor(Color.parseColor("#115E59"))
                }
                "MISSED_CALL" -> {
                    sourceLabel = "부재중 전화"
                    tvSourceBadge.text = "📞 부재중 전화"
                    tvSourceBadge.setBackgroundColor(Color.parseColor("#78350F"))
                }
                "ORDER_DELAY", "ORDER" -> {
                    sourceLabel = "주문 지연"
                    tvSourceBadge.text = "📦 주문 지연"
                    tvSourceBadge.setBackgroundColor(Color.parseColor("#1E3A8A"))
                }
                "KAKAO" -> {
                    sourceLabel = "카카오톡"
                    tvSourceBadge.text = "💬 카카오톡"
                    tvSourceBadge.setBackgroundColor(Color.parseColor("#713F12"))
                }
                "SMS" -> {
                    if (cleanBadge == "수동 등록" || cleanBadge == "모바일 등록") {
                        sourceLabel = "직접 등록"
                        tvSourceBadge.text = "📋 직접 등록"
                        tvSourceBadge.setBackgroundColor(Color.parseColor("#334155"))
                    } else {
                        sourceLabel = "문자 메시지"
                        tvSourceBadge.text = "📱 문자 메시지"
                        tvSourceBadge.setBackgroundColor(Color.parseColor("#312E81"))
                    }
                }
                else -> {
                    sourceLabel = "일반 업무"
                    tvSourceBadge.text = "📋 일반 업무"
                    tvSourceBadge.setBackgroundColor(Color.parseColor("#334155"))
                }
            }

            // 상태 뱃지 (출처 뱃지와 동일한 중복 텍스트는 숨김 처리)
            val isDuplicateBadge = cleanBadge != null && (
                cleanBadge == sourceLabel ||
                cleanBadge == tvSourceBadge.text.toString() ||
                (sourceLabel == "직접 등록" && (cleanBadge == "수동 등록" || cleanBadge == "모바일 등록"))
            )
            if (cleanBadge != null && !isDuplicateBadge) {
                tvStateBadge.text = cleanBadge
                tvStateBadge.visibility = View.VISIBLE
                if (cleanBadge.contains("출고지연")) {
                    tvStateBadge.setBackgroundColor(Color.parseColor("#881337"))
                } else if (cleanBadge.contains("안내요망")) {
                    tvStateBadge.setBackgroundColor(Color.parseColor("#7C2D12"))
                } else {
                    tvStateBadge.setBackgroundColor(Color.parseColor("#0284C7"))
                }
            } else {
                tvStateBadge.visibility = View.GONE
            }

            // 기한
            if (cleanDueDate != null) {
                tvDueDate.text = cleanDueDate
                tvDueDate.visibility = View.VISIBLE
            } else {
                tvDueDate.visibility = View.GONE
            }

            // 고객명
            if (cleanCustomerName != null) {
                tvCustomer.text = "고객: $cleanCustomerName"
                tvCustomer.visibility = View.VISIBLE
            } else {
                tvCustomer.visibility = View.GONE
            }

            // 전화번호
            if (cleanCustomerPhone != null) {
                btnCall.text = "📞 $cleanCustomerPhone"
                btnCall.visibility = View.VISIBLE
                btnCall.setOnClickListener { onCallClick(cleanCustomerPhone) }
            } else {
                btnCall.visibility = View.GONE
            }

            // 카드 전체 클릭 시 통합 액션 바텀시트(방식 A) 오픈
            itemView.setOnClickListener {
                onItemClick(item, cleanCustomerName, cleanCustomerPhone)
            }
        }
    }
}
