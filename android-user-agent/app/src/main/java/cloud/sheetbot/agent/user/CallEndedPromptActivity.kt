package cloud.sheetbot.agent.user

import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import cloud.sheetbot.agent.user.databinding.DialogCallEndedPromptBinding
import java.io.File

/**
 * 통화 종료 직후 화면 최상단에 뜨는 모바일 명함 발송 팝업 다이얼로그 액티비티
 * 다른 앱(T전화, 기본 통화 앱 종료 화면, 홈 화면)에 가려지지 않고 화면 중앙에 확실히 표출
 */
class CallEndedPromptActivity : Activity() {

    private lateinit var binding: DialogCallEndedPromptBinding
    private var countDownTimer: CountDownTimer? = null
    private var targetPhone: String = ""
    private var contactName: String? = null

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
        val width = (displayMetrics.widthPixels * 0.90).toInt()
        window.setLayout(width, WindowManager.LayoutParams.WRAP_CONTENT)

        targetPhone = intent.getStringExtra(PhoneCallReceiver.EXTRA_TARGET_PHONE) ?: ""
        contactName = intent.getStringExtra(PhoneCallReceiver.EXTRA_CONTACT_NAME)

        if (targetPhone.isBlank()) {
            finish()
            return
        }

        setupView()
        startAutoCloseCountdown()
    }

    private fun setupView() {
        val prefs = PreferencesManager(this)
        val displayName = contactName ?: targetPhone
        binding.tvDialogTitle.text = "💼 [통화 종료] $displayName"
        binding.tvRecipientPhone.text = targetPhone

        val isMmsMode = prefs.businessCardSendMode == "MMS_IMAGE"
        val template = prefs.businessCardSmsTemplate.trim()
        val webLink = prefs.businessCardWebLink.trim()
        val imagePath = prefs.businessCardImagePath

        if (isMmsMode) {
            binding.tvSendModeBadge.text = "🖼️ 갤러리 사진 첨부 (MMS)"
            binding.tvSendModeBadge.setBackgroundResource(R.drawable.bg_badge_version)
            binding.tvMessagePreview.text = template.ifBlank { "등록된 명함/포스터 사진과 함께 전송됩니다." }

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
            binding.tvSendModeBadge.text = "🌐 스마트 웹 명함 (0원 무료)"
            val fullMsg = if (webLink.isNotBlank() && !template.contains(webLink)) {
                "$template\n▶ $webLink"
            } else {
                template
            }
            binding.tvMessagePreview.text = fullMsg.ifBlank { "안녕하세요! 방금 전화 주셔서 감사합니다.\n▶ $webLink" }
            binding.ivDialogImagePreview.visibility = View.GONE
        }

        // 📌 고객 관련 미완료 할 일 조회 및 바인딩
        loadCustomerPendingTasks(prefs.userEmail)

        // 발송 버튼 클릭
        binding.btnSendBusinessCardNow.setOnClickListener {
            cancelCountdown()
            if (isMmsMode) {
                PhoneCallReceiver.sendBusinessCardMms(this, targetPhone, contactName)
            } else {
                PhoneCallReceiver.sendBusinessCardSms(this, targetPhone, contactName)
            }
            Toast.makeText(this, "🚀 모바일 명함 전송을 시작했습니다.", Toast.LENGTH_SHORT).show()
            finish()
        }

        // 닫기 버튼들
        binding.btnDialogCloseTop.setOnClickListener {
            cancelCountdown()
            finish()
        }
        binding.tvAutoCloseTimer.setOnClickListener {
            cancelCountdown()
            finish()
        }
    }

    private fun loadCustomerPendingTasks(userEmail: String?) {
        if (userEmail.isNullOrBlank() || targetPhone.isBlank()) return

        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            val result = ApiClient.fetchCallSummary(userEmail, targetPhone)
            val firstTask = result.pendingTasks.firstOrNull()

            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                if (isFinishing || isDestroyed) return@withContext

                if (firstTask != null) {
                    binding.llCustomerTaskContainer.visibility = View.VISIBLE
                    val dueText = if (!firstTask.dueDate.isNullOrBlank()) " (${firstTask.dueDate})" else ""
                    val badge = if (!firstTask.badgeText.isNullOrBlank()) "[${firstTask.badgeText}] " else ""
                    binding.tvCallEndedTaskTitle.text = "$badge${firstTask.title}$dueText"

                    binding.btnMarkTaskDone.setOnClickListener {
                        binding.btnMarkTaskDone.isEnabled = false
                        binding.btnMarkTaskDone.text = "처리 중..."

                        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                            val success = ApiClient.toggleTaskStatus(userEmail, firstTask.id, "DONE")
                            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                                if (success) {
                                    binding.tvCallEndedTaskTitle.paintFlags =
                                        binding.tvCallEndedTaskTitle.paintFlags or android.graphics.Paint.STRIKE_THRU_TEXT_FLAG
                                    binding.tvCallEndedTaskTitle.setTextColor(android.graphics.Color.GRAY)
                                    binding.btnMarkTaskDone.text = "✓ 완료됨"
                                    Toast.makeText(this@CallEndedPromptActivity, "🎉 할 일이 완료 처리되었습니다!", Toast.LENGTH_SHORT).show()
                                } else {
                                    binding.btnMarkTaskDone.isEnabled = true
                                    binding.btnMarkTaskDone.text = "✓ 완료 처리"
                                    Toast.makeText(this@CallEndedPromptActivity, "완료 처리에 실패했습니다.", Toast.LENGTH_SHORT).show()
                                }
                            }
                        }
                    }
                } else {
                    binding.llCustomerTaskContainer.visibility = View.GONE
                }
            }
        }
    }

    private fun startAutoCloseCountdown() {
        countDownTimer = object : CountDownTimer(15_000, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                val sec = (millisUntilFinished / 1000).toInt()
                binding.tvAutoCloseTimer.text = "닫기 (${sec}초 후 자동 닫힘)"
            }

            override fun onFinish() {
                finish()
            }
        }.start()
    }

    private fun cancelCountdown() {
        countDownTimer?.cancel()
        countDownTimer = null
    }

    override fun onDestroy() {
        super.onDestroy()
        cancelCountdown()
    }
}
