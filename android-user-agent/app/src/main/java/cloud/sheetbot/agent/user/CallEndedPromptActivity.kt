package cloud.sheetbot.agent.user

import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Paint
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import cloud.sheetbot.agent.user.databinding.DialogCallEndedPromptBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * 통화 종료 직후 화면 최상단에 뜨는 모바일 명함 + 통화 요약·후속 약속 발송 팝업 액티비티
 * - 파투(FileToSheet) 전 프로젝트·시트 및 시트봇 대장에서 해당 고객의 직전/방금 통화 요약과 미완료 할 일을 즉시 조회
 * - 원터치 토글 버튼으로 명함 문자 하단에 [📋 통화 내용 요약] 및 [📌 약속 및 후속 진행 사항]을 즉시 결합
 * - 80바이트 초과 시 SmsSenderUtil의 장문(MMS/LMS) 자동 전환 엔진으로 잘림 없이 100% 전송
 */
class CallEndedPromptActivity : Activity() {

    companion object {
        const val EXTRA_PREVIEW_MODE = "extra_preview_mode"
    }

    private lateinit var binding: DialogCallEndedPromptBinding
    private var countDownTimer: CountDownTimer? = null
    private var fetchSummaryJob: Job? = null
    private var isCountdownPaused: Boolean = false

    private var targetPhone: String = ""
    private var contactName: String? = null
    private var isPreviewMode: Boolean = false

    private var fetchedCallSummary: String = ""
    private var fetchedActionItems: String = ""
    private var isSummaryAttached: Boolean = false
    private var isActionAttached: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 상단 알림 닫기 (명함 발송 다이얼로그가 전면 활성화되었으므로 알림 제거)
        try {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            manager?.cancel(2001)
        } catch (_: Exception) {}

        // 잠금화면 위 및 화면 켜짐 허용
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        binding = DialogCallEndedPromptBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // 다이얼로그 크기 조절
        val displayMetrics = resources.displayMetrics
        val width = (displayMetrics.widthPixels * 0.93).toInt()
        window.setLayout(width, WindowManager.LayoutParams.WRAP_CONTENT)

        targetPhone = intent.getStringExtra(PhoneCallReceiver.EXTRA_TARGET_PHONE) ?: ""
        contactName = intent.getStringExtra(PhoneCallReceiver.EXTRA_CONTACT_NAME)
        isPreviewMode = intent.getBooleanExtra(EXTRA_PREVIEW_MODE, false)

        if (targetPhone.isBlank()) {
            finish()
            return
        }

        setupView()
        startAutoCloseCountdown()
    }

    private fun setupView() {
        val prefs = PreferencesManager(this)
        val resolvedLocalName = contactName ?: ContactHelper.getContactName(this, targetPhone)
        if (!resolvedLocalName.isNullOrBlank()) {
            contactName = resolvedLocalName
        }
        val displayName = contactName ?: ContactHelper.formatPhoneNumber(targetPhone)
        binding.tvDialogTitle.text = if (isPreviewMode) {
            "🪪 [통화 종료 미리보기] $displayName"
        } else {
            "🪪 [통화 종료] $displayName"
        }
        binding.tvRecipientPhone.text = ContactHelper.formatPhoneNumber(targetPhone)

        val isMmsMode = prefs.businessCardSendMode == "MMS_IMAGE"
        val template = prefs.businessCardSmsTemplate.trim()
        val webLink = prefs.businessCardWebLink.trim()
        val imagePath = prefs.businessCardImagePath

        if (isMmsMode) {
            binding.tvSendModeBadge.text = "🖼️ 사진 첨부 (MMS)"
            binding.tvSendModeBadge.setBackgroundResource(R.drawable.bg_badge_version)
            val baseText = template.ifBlank { "안녕하세요! 방금 통화 감사드립니다. 명함 함께 전달드립니다." }
            binding.tvMessagePreview.setText(baseText)

            if (imagePath.isNotBlank()) {
                val imageFile = File(imagePath)
                if (imageFile.exists()) {
                    try {
                        val bitmap = BitmapFactory.decodeFile(imageFile.absolutePath)
                        if (bitmap != null) {
                            binding.ivDialogImagePreview.setImageBitmap(bitmap)
                            binding.ivDialogImagePreview.visibility = View.VISIBLE
                        }
                    } catch (_: Exception) {}
                }
            }
        } else {
            binding.tvSendModeBadge.text = "🌐 스마트 웹 명함"
            val fullMsg = if (webLink.isNotBlank() && !template.contains(webLink)) {
                "$template\n▶ 모바일 명함: $webLink"
            } else {
                template
            }
            binding.tvMessagePreview.setText(
                fullMsg.ifBlank {
                    if (webLink.isNotBlank()) "안녕하세요! 방금 전화 주셔서 감사합니다.\n▶ 모바일 명함: $webLink"
                    else "안녕하세요! 방금 전화 주셔서 감사합니다. 말씀 나눈 내용 확인 후 연락드리겠습니다."
                }
            )
            binding.ivDialogImagePreview.visibility = View.GONE
        }

        updateByteCountBadge(binding.tvMessagePreview.text?.toString() ?: "")

        // 본문 터치 또는 수정 시 자동 닫힘 타이머 일시정지 + 바이트 실시간 계산
        binding.tvMessagePreview.setOnClickListener {
            pauseCountdownForEditing()
        }
        binding.tvMessagePreview.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) pauseCountdownForEditing()
        }
        binding.tvMessagePreview.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                updateByteCountBadge(s?.toString() ?: "")
            }
        })

        // 1. 통화 핵심 요약 첨부 토글 버튼
        binding.btnToggleAttachSummary.setOnClickListener {
            pauseCountdownForEditing()
            if (fetchedCallSummary.isBlank()) {
                Toast.makeText(this, "아직 이 번호로 등록된 통화 요약이 없습니다. 아래 빠른 약속 칩이나 직접 입력을 이용해 보세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            isSummaryAttached = !isSummaryAttached
            toggleTextBlockInEditor(
                headerMarker = "📋 [통화 핵심 요약]",
                bodyContent = formatSummaryLines(fetchedCallSummary),
                attach = isSummaryAttached
            )
            refreshAttachmentButtonsUI()
        }

        // 2. 후속 약속 / 할 일 첨부 토글 버튼
        binding.btnToggleAttachAction.setOnClickListener {
            pauseCountdownForEditing()
            if (fetchedActionItems.isBlank()) {
                Toast.makeText(this, "등록된 미완료 할 일이 없습니다. 아래 빠른 약속 칩을 터치하면 즉시 추가됩니다.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            isActionAttached = !isActionAttached
            toggleTextBlockInEditor(
                headerMarker = "📌 [약속 및 후속 조치]",
                bodyContent = formatSummaryLines(fetchedActionItems),
                attach = isActionAttached
            )
            refreshAttachmentButtonsUI()
        }

        // 3. 빠른 약속 문구 1초 추가 칩
        binding.chipPromiseQuote.setOnClickListener {
            pauseCountdownForEditing()
            appendOrToggleQuickPromise("✔️ 말씀 나누신 자료/견적서 확인 후 빠르게 전달드리겠습니다.")
        }
        binding.chipPromiseSchedule.setOnClickListener {
            pauseCountdownForEditing()
            appendOrToggleQuickPromise("✔️ 논의한 일정대로 준비하여 다시 연락드리겠습니다.")
        }
        binding.chipPromiseReview.setOnClickListener {
            pauseCountdownForEditing()
            appendOrToggleQuickPromise("✔️ 요청하신 사항 꼼꼼히 검토 후 회신드리겠습니다.")
        }

        // 4. 파투 전 프로젝트·시트 및 시트봇 서버에서 통화 요약 & 미완료 할 일 실시간 로드
        loadCustomerBriefingAndTasks(prefs)

        // 5. 발송 버튼 클릭
        binding.btnSendBusinessCardNow.setOnClickListener {
            cancelCountdown()
            val finalCustomText = binding.tvMessagePreview.text?.toString()?.trim() ?: ""
            if (isMmsMode) {
                PhoneCallReceiver.sendBusinessCardMms(
                    context = this,
                    phoneNumber = targetPhone,
                    contactName = contactName,
                    customMessageOverride = finalCustomText
                )
            } else {
                PhoneCallReceiver.sendBusinessCardSms(
                    context = this,
                    phoneNumber = targetPhone,
                    contactName = contactName,
                    customMessageOverride = finalCustomText
                )
            }
            val toastLabel = if (isSummaryAttached || isActionAttached) {
                "🚀 명함 + 통화 요약·약속 문자를 발송했습니다."
            } else {
                "🚀 모바일 명함 문자를 발송했습니다."
            }
            Toast.makeText(this, toastLabel, Toast.LENGTH_SHORT).show()
            finish()
        }

        // 6. 🚫 이 번호는 앞으로 발송 제외 버튼 클릭
        binding.btnExcludeThisNumber.setOnClickListener {
            cancelCountdown()
            prefs.addBusinessCardExcludedNumber(targetPhone)
            val nameOrPhone = contactName ?: targetPhone
            Toast.makeText(
                this,
                "🚫 [$nameOrPhone] 번호가 명함 발송 제외 목록에 등록되었습니다.",
                Toast.LENGTH_LONG
            ).show()

            try {
                val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                manager?.cancel(2001)
            } catch (_: Exception) {}

            finish()
        }

        // 7. 닫기 버튼들
        binding.btnDialogCloseTop.setOnClickListener {
            cancelCountdown()
            finish()
        }
        binding.tvAutoCloseTimer.setOnClickListener {
            cancelCountdown()
            finish()
        }
    }

    private fun updateByteCountBadge(text: String) {
        val bytes = SmsSenderUtil.getSmsByteCount(text)
        if (bytes <= 80) {
            binding.tvByteModeBadge.text = "단문 SMS (${bytes}/80B)"
            binding.tvByteModeBadge.setTextColor(Color.parseColor("#34D399"))
        } else {
            binding.tvByteModeBadge.text = "장문 MMS 자동전환 (${bytes}B)"
            binding.tvByteModeBadge.setTextColor(Color.parseColor("#38BDF8"))
        }
    }

    private fun formatSummaryLines(raw: String): String {
        val cleaned = raw.trim()
        if (cleaned.isBlank()) return ""
        return cleaned.lines()
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .take(4)
            .joinToString("\n") { line ->
                if (line.startsWith("•") || line.startsWith("-") || line.startsWith("📌") || line.first().isDigit()) {
                    line
                } else {
                    "• $line"
                }
            }
    }

    private fun toggleTextBlockInEditor(headerMarker: String, bodyContent: String, attach: Boolean) {
        if (bodyContent.isBlank()) return
        val currentText = binding.tvMessagePreview.text?.toString() ?: ""
        val fullBlock = "$headerMarker\n$bodyContent"

        if (attach) {
            if (!currentText.contains(headerMarker)) {
                val updated = if (currentText.isBlank()) fullBlock else "${currentText.trimEnd()}\n\n$fullBlock"
                binding.tvMessagePreview.setText(updated)
                binding.tvMessagePreview.setSelection(updated.length)
            }
        } else {
            // 해당 블록 제거
            val idx = currentText.indexOf(headerMarker)
            if (idx >= 0) {
                val before = currentText.substring(0, idx).trimEnd()
                val afterPart = currentText.substring(idx)
                val nextSectionIdx = afterPart.indexOf("\n\n", headerMarker.length)
                val after = if (nextSectionIdx >= 0) afterPart.substring(nextSectionIdx).trimStart('\n') else ""
                val merged = listOf(before, after).filter { it.isNotBlank() }.joinToString("\n\n")
                binding.tvMessagePreview.setText(merged)
                binding.tvMessagePreview.setSelection(merged.length)
            }
        }
    }

    private fun appendOrToggleQuickPromise(promiseLine: String) {
        val currentText = binding.tvMessagePreview.text?.toString() ?: ""
        if (currentText.contains(promiseLine)) {
            val updated = currentText.replace("\n$promiseLine", "").replace(promiseLine, "").trim()
            binding.tvMessagePreview.setText(updated)
            binding.tvMessagePreview.setSelection(updated.length)
            Toast.makeText(this, "약속 문구가 제거되었습니다.", Toast.LENGTH_SHORT).show()
        } else {
            val updated = if (currentText.isBlank()) promiseLine else "${currentText.trimEnd()}\n$promiseLine"
            binding.tvMessagePreview.setText(updated)
            binding.tvMessagePreview.setSelection(updated.length)
            Toast.makeText(this, "✨ 약속 문구가 명함 본문에 추가되었습니다.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun refreshAttachmentButtonsUI() {
        if (fetchedCallSummary.isNotBlank()) {
            val previewOneLine = fetchedCallSummary.replace("\n", " ").trim()
            if (isSummaryAttached) {
                binding.btnToggleAttachSummary.text = "✅ 📋 통화 핵심 요약 포함됨 (터치 시 해제)\n$previewOneLine"
                binding.btnToggleAttachSummary.setBackgroundColor(Color.parseColor("#065F46"))
                binding.btnToggleAttachSummary.setTextColor(Color.parseColor("#ECFDF5"))
            } else {
                binding.btnToggleAttachSummary.text = "➕ 📋 통화 요약 함께 보내기: $previewOneLine"
                binding.btnToggleAttachSummary.setBackgroundColor(Color.parseColor("#1E293B"))
                binding.btnToggleAttachSummary.setTextColor(Color.parseColor("#E2E8F0"))
            }
        } else {
            binding.btnToggleAttachSummary.text = "📋 등록된 직전 통화 요약 없음 (하단 약속 칩 활용 가능)"
            binding.btnToggleAttachSummary.setBackgroundColor(Color.parseColor("#1E293B"))
            binding.btnToggleAttachSummary.setTextColor(Color.parseColor("#64748B"))
        }

        if (fetchedActionItems.isNotBlank()) {
            val previewActionLine = fetchedActionItems.replace("\n", " ").trim()
            if (isActionAttached) {
                binding.btnToggleAttachAction.text = "✅ 📌 후속 약속·할 일 포함됨 (터치 시 해제)\n$previewActionLine"
                binding.btnToggleAttachAction.setBackgroundColor(Color.parseColor("#1E3A8A"))
                binding.btnToggleAttachAction.setTextColor(Color.parseColor("#EFF6FF"))
            } else {
                binding.btnToggleAttachAction.text = "➕ 📌 후속 약속·할 일 함께 보내기: $previewActionLine"
                binding.btnToggleAttachAction.setBackgroundColor(Color.parseColor("#1E293B"))
                binding.btnToggleAttachAction.setTextColor(Color.parseColor("#93C5FD"))
            }
        } else {
            binding.btnToggleAttachAction.text = "📌 등록된 미완료 할 일 없음 (하단 약속 칩으로 즉시 추가)"
            binding.btnToggleAttachAction.setBackgroundColor(Color.parseColor("#1E293B"))
            binding.btnToggleAttachAction.setTextColor(Color.parseColor("#64748B"))
        }

        binding.btnSendBusinessCardNow.text = if (isSummaryAttached || isActionAttached) {
            "🚀 명함 + 통화 요약·약속 함께 보내기"
        } else {
            "🚀 지금 바로 모바일 명함 보내기"
        }
    }

    /**
     * 파투(FileToSheet) 전 프로젝트·시트 및 시트봇 대장에서 통화 요약 & 후속 할 일 조회
     * - 통화 직후 새로 업로드되는 통화녹음 AI 요약도 반영할 수 있도록 1차 즉시 조회 + 6초 후 재스캔 지원
     */
    private fun loadCustomerBriefingAndTasks(prefs: PreferencesManager) {
        val ftsOwnerPhone = prefs.ftsPhoneNumber?.takeIf { it.isNotBlank() } ?: ""
        val hasFts = ftsOwnerPhone.isNotBlank() || !prefs.ftsProjectId.isNullOrBlank()
        val userEmail = prefs.userEmail

        fetchSummaryJob?.cancel()
        fetchSummaryJob = CoroutineScope(Dispatchers.IO).launch {
            // 미리보기 모드일 때 실제 최근 통화 번호가 파투에 있으면 그 번호로 자동 교체하여 실데이터 체험 제공
            if (isPreviewMode && hasFts && targetPhone == "010-1234-5678") {
                val recentRealPhone = FileToSheetClient.findMostRecentCallerPhoneInWorkspace(
                    ownerPhone = ftsOwnerPhone,
                    projectIdHint = prefs.ftsProjectId
                )
                if (!recentRealPhone.isNullOrBlank()) {
                    targetPhone = recentRealPhone
                    val resolvedName = ContactHelper.getContactName(this@CallEndedPromptActivity, recentRealPhone)
                    if (!resolvedName.isNullOrBlank()) contactName = resolvedName
                    withContext(Dispatchers.Main) {
                        if (!isFinishing && !isDestroyed) {
                            val disp = contactName ?: ContactHelper.formatPhoneNumber(targetPhone)
                            binding.tvDialogTitle.text = "🪪 [실데이터 미리보기] $disp"
                            binding.tvRecipientPhone.text = ContactHelper.formatPhoneNumber(targetPhone)
                        }
                    }
                }
            }

            // 1차 즉시 스캔 및 필요 시(실제 통화 직후 녹음 업로드 완료 시점) 6초 후 2차 재스캔
            val maxAttempts = if (isPreviewMode) 1 else 2
            for (attempt in 1..maxAttempts) {
                if (!isActive) break
                if (attempt > 1) {
                    delay(6000)
                }

                var result: CallSummaryResult? = null
                if (hasFts) {
                    try {
                        val ftsRes = FileToSheetClient.fetchInCallBriefingFromWorkspace(
                            ownerPhone = ftsOwnerPhone,
                            callerPhone = targetPhone,
                            projectIdHint = prefs.ftsProjectId,
                            deviceContactName = contactName
                        )
                        if (ftsRes.found) {
                            result = ftsRes
                        }
                    } catch (_: Exception) {}
                }

                if ((result == null || !result.found) && !userEmail.isNullOrBlank()) {
                    try {
                        val apiRes = ApiClient.fetchCallSummary(userEmail, targetPhone)
                        if (apiRes.success && apiRes.found) {
                            result = apiRes
                        }
                    } catch (_: Exception) {}
                }

                // 미리보기 모드인데 파투/시트에 아직 통화 요약이 없는 경우 샘플 요약 제공
                if (isPreviewMode && (result == null || (result.lastCallSummary.isBlank() && result.actionItems.isBlank()))) {
                    result = CallSummaryResult(
                        success = true,
                        found = true,
                        name = contactName ?: "홍길동 대표님",
                        company = "(주)성진기업",
                        position = "대표이사",
                        memo = "",
                        lastCallTime = "방금 통화",
                        lastCallSummary = "부품 납품 단가 협의 및 다음 주 수요일 자재 일정 확인 요청",
                        actionItems = "📌 [통화 후속조치] 수요일 오전 견적서 재검토 후 이메일 발송 (내일까지)",
                        pendingTasks = emptyList(),
                        rawJson = null
                    )
                }

                withContext(Dispatchers.Main) {
                    if (isFinishing || isDestroyed) return@withContext
                    if (result != null && result.found) {
                        if (contactName.isNullOrBlank() && result.name.isNotBlank() && result.name != "신규 연락처") {
                            contactName = result.name
                            binding.tvDialogTitle.text = if (isPreviewMode) {
                                "🪪 [실데이터 미리보기] ${result.name}"
                            } else {
                                "🪪 [통화 종료] ${result.name}"
                            }
                        }

                        if (result.lastCallSummary.isNotBlank()) {
                            fetchedCallSummary = result.lastCallSummary
                        }
                        if (result.actionItems.isNotBlank()) {
                            fetchedActionItems = result.actionItems
                        }

                        binding.tvCallSummarySyncStatus.text = if (attempt > 1) {
                            "✨ 최신 통화 요약 연동됨"
                        } else {
                            "✅ 파투·시트 요약 연동됨"
                        }
                        refreshAttachmentButtonsUI()

                        // 진행 중인 할 일 카드 바인딩 (서버 할 일 또는 파투 통합할일대장)
                        val firstServerTask = result.pendingTasks.firstOrNull()
                        if (firstServerTask != null && !userEmail.isNullOrBlank()) {
                            binding.llCustomerTaskContainer.visibility = View.VISIBLE
                            val dueText = if (!firstServerTask.dueDate.isNullOrBlank()) " (${firstServerTask.dueDate})" else ""
                            val badge = if (!firstServerTask.badgeText.isNullOrBlank()) "[${firstServerTask.badgeText}] " else ""
                            binding.tvCallEndedTaskTitle.text = "$badge${firstServerTask.title}$dueText"

                            binding.btnMarkTaskDone.setOnClickListener {
                                pauseCountdownForEditing()
                                binding.btnMarkTaskDone.isEnabled = false
                                binding.btnMarkTaskDone.text = "처리 중..."
                                CoroutineScope(Dispatchers.IO).launch {
                                    val ok = ApiClient.toggleTaskStatus(userEmail, firstServerTask.id, "DONE")
                                    withContext(Dispatchers.Main) {
                                        if (ok) {
                                            binding.tvCallEndedTaskTitle.paintFlags =
                                                binding.tvCallEndedTaskTitle.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
                                            binding.tvCallEndedTaskTitle.setTextColor(Color.GRAY)
                                            binding.btnMarkTaskDone.text = "✓ 완료됨"
                                            Toast.makeText(this@CallEndedPromptActivity, "🎉 할 일이 완료 처리되었습니다!", Toast.LENGTH_SHORT).show()
                                        } else {
                                            binding.btnMarkTaskDone.isEnabled = true
                                            binding.btnMarkTaskDone.text = "✓ 완료 처리"
                                        }
                                    }
                                }
                            }
                        } else if (result.actionItems.isNotBlank()) {
                            binding.llCustomerTaskContainer.visibility = View.VISIBLE
                            binding.tvCallEndedTaskTitle.text = result.actionItems.lines().firstOrNull() ?: result.actionItems
                            binding.btnMarkTaskDone.text = "➕ 본문 첨부"
                            binding.btnMarkTaskDone.setOnClickListener {
                                binding.btnToggleAttachAction.performClick()
                            }
                        }
                    } else {
                        binding.tvCallSummarySyncStatus.text = "신규 통화 (하단 약속 칩 사용 가능)"
                        refreshAttachmentButtonsUI()
                    }
                }

                // 이미 통화 요약이 로드되었다면 2차 재스캔 불필요
                if (fetchedCallSummary.isNotBlank()) break
            }
        }
    }

    private fun startAutoCloseCountdown() {
        countDownTimer = object : CountDownTimer(20_000, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                if (!isCountdownPaused) {
                    val sec = (millisUntilFinished / 1000).toInt()
                    binding.tvAutoCloseTimer.text = "닫기 (${sec}초 후 자동 닫힘)"
                }
            }

            override fun onFinish() {
                if (!isCountdownPaused) {
                    finish()
                }
            }
        }.start()
    }

    private fun pauseCountdownForEditing() {
        if (!isCountdownPaused) {
            isCountdownPaused = true
            countDownTimer?.cancel()
            countDownTimer = null
            binding.tvAutoCloseTimer.text = "닫기 (편집 중 자동 닫힘 일시정지됨)"
        }
    }

    private fun cancelCountdown() {
        countDownTimer?.cancel()
        countDownTimer = null
    }

    override fun onDestroy() {
        super.onDestroy()
        fetchSummaryJob?.cancel()
        cancelCountdown()
    }
}
