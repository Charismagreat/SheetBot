package cloud.sheetbot.agent.user

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * ✍️ 카톡·문자·메일 입력창에서 텍스트 선택 후 [✨ 시트봇 AI 발신 코칭] (ACTION_PROCESS_TEXT)
 * - 작성 중인 문장의 리스크를 사전 점검하고 3종 톤(부드럽게 / 단호·증거형 / 핵심 3줄)으로 즉시 치환 또는 복사
 */
class OutboundCoachProcessTextActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val selectedText = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()?.trim().orEmpty()
        val isReadOnly = intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false)

        if (selectedText.isBlank()) {
            Toast.makeText(this, "코칭할 텍스트를 먼저 선택해 주세요.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        val prefs = PreferencesManager(this)
        val userEmail = prefs.userEmail?.takeIf { it.isNotBlank() }
        if (userEmail.isNullOrBlank()) {
            Toast.makeText(this, "시트봇 계정 연동 후 AI 발신 코칭을 이용할 수 있습니다.", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        val loadingDialog = AlertDialog.Builder(this)
            .setTitle("✨ 시트봇 AI 발신 전 코칭 중...")
            .setMessage("작성 중인 문장의 리스크와 톤을 점검하고 있습니다.")
            .setCancelable(true)
            .setOnCancelListener { finish() }
            .show()

        CoroutineScope(Dispatchers.IO).launch {
            val coach = ApiClient.requestPreOutboundCoach(
                userEmail = userEmail,
                channel = "SMS",
                contactName = "상대방",
                contactKey = "",
                draftText = selectedText
            )

            withContext(Dispatchers.Main) {
                try { loadingDialog.dismiss() } catch (_: Exception) {}
                if (isFinishing || isDestroyed) return@withContext

                if (!coach.success) {
                    Toast.makeText(this@OutboundCoachProcessTextActivity, "AI 코칭 응답을 받지 못했습니다.", Toast.LENGTH_SHORT).show()
                    finish()
                    return@withContext
                }

                val options = arrayOf(
                    "🤝 부드럽게:\n${coach.soft}",
                    "⚖️ 단호·증거형:\n${coach.firm}",
                    "⚡ 핵심 3줄:\n${coach.concise}"
                )
                val rawValues = arrayOf(coach.soft, coach.firm, coach.concise)
                val title = if (coach.riskWarning.isNotBlank()) "⚠️ ${coach.riskWarning}" else "✨ AI 발신 코칭 결과 (선택 시 적용)"

                AlertDialog.Builder(this@OutboundCoachProcessTextActivity)
                    .setTitle(title)
                    .setItems(options) { _, which ->
                        val chosen = rawValues[which].ifBlank { selectedText }
                        if (!isReadOnly) {
                            val resultIntent = Intent().apply {
                                putExtra(Intent.EXTRA_PROCESS_TEXT, chosen)
                            }
                            setResult(RESULT_OK, resultIntent)
                            Toast.makeText(this@OutboundCoachProcessTextActivity, "✅ 코칭 문구로 교체되었습니다.", Toast.LENGTH_SHORT).show()
                        } else {
                            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                            cm?.setPrimaryClip(ClipData.newPlainText("SheetBot AI Coach", chosen))
                            Toast.makeText(this@OutboundCoachProcessTextActivity, "📋 코칭 문구가 클립보드에 복사되었습니다.", Toast.LENGTH_SHORT).show()
                        }
                        finish()
                    }
                    .setNegativeButton("닫기") { _, _ -> finish() }
                    .setOnCancelListener { finish() }
                    .show()
            }
        }
    }
}
