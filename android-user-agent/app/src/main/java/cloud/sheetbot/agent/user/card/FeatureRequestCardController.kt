package cloud.sheetbot.agent.user.card

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import com.google.android.material.bottomsheet.BottomSheetDialog
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.R
import android.util.Log
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import cloud.sheetbot.agent.user.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 💡 맞춤 기능 제작 의뢰 및 아이디어 제안함 전담 컨트롤러
 *
 * 사장님이 필요한 업무 자동화 기능을 제안/의뢰하면
 * 서버 DB(sheetbot_feature_requests)에 실시간 적재하고,
 * chachogreat@gmail.com으로 다이렉트 이메일 인텐트를 발송합니다 (2중 안전망).
 */
class FeatureRequestCardController(
    private val activity: Activity,
    private val prefs: PreferencesManager
) {

    private var btnOpenDialog: Button? = null

    fun setup() {
        btnOpenDialog = activity.findViewById(R.id.btnOpenFeatureRequestDialog)
        btnOpenDialog?.setOnClickListener {
            openRequestDialog()
        }
    }

    /**
     * 의뢰 입력 바텀시트 다이얼로그 띄우기 (공개 메서드: 검색 결과 화면 등에서도 직접 호출 가능)
     */
    fun openRequestDialog(prefilledTitle: String? = null) {
        val dialog = BottomSheetDialog(activity)
        val view = LayoutInflater.from(activity).inflate(R.layout.dialog_feature_request, null)
        dialog.setContentView(view)

        val etTitle = view.findViewById<EditText>(R.id.etReqTitle)
        val etDesc = view.findViewById<EditText>(R.id.etReqDesc)
        val etContact = view.findViewById<EditText>(R.id.etReqContact)
        val btnSubmit = view.findViewById<Button>(R.id.btnSubmitRequest)

        // 사전 입력값 및 사용자 이메일 기본 채우기
        if (!prefilledTitle.isNullOrBlank()) {
            etTitle.setText(prefilledTitle)
        }
        val defaultEmail = prefs.userEmail
        if (!defaultEmail.isNullOrBlank()) {
            etContact.setText(defaultEmail)
        }

        btnSubmit.setOnClickListener {
            val title = etTitle.text.toString().trim()
            val desc = etDesc.text.toString().trim()
            val contact = etContact.text.toString().trim()

            if (title.isEmpty()) {
                Toast.makeText(activity, "희망하시는 기능 이름을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                etTitle.requestFocus()
                return@setOnClickListener
            }
            if (desc.isEmpty()) {
                Toast.makeText(activity, "필요한 자동화 내용을 적어주세요.", Toast.LENGTH_SHORT).show()
                etDesc.requestFocus()
                return@setOnClickListener
            }
            if (contact.isEmpty()) {
                Toast.makeText(activity, "답변 받으실 연락처나 이메일을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                etContact.requestFocus()
                return@setOnClickListener
            }

            dialog.dismiss()

            // 1. 서버 DB에 2중 안전망 실시간 영구 적재 (비동기)
            val userEmail = prefs.userEmail ?: contact
            val scope = (activity as? LifecycleOwner)?.lifecycleScope
                ?: CoroutineScope(Dispatchers.Main)
            scope.launch {
                try {
                    val res = ApiClient.submitFeatureRequest(
                        requestType = "FEATURE_CUSTOM",
                        cardKey = null,
                        title = title,
                        description = desc,
                        contact = contact,
                        userEmail = userEmail
                    )
                    Log.i("FeatureRequest", "서버 2중 안전망 접수 결과: success=${res.success}, msg=${res.message}")
                } catch (e: Exception) {
                    Log.w("FeatureRequest", "서버 접수 예외 발생 (이메일 인텐트는 정상 유지): ${e.message}")
                }
            }

            // 2. 이메일 앱 인텐트 발송
            sendRequestEmail(title, desc, contact)
        }

        dialog.show()
    }

    /**
     * chachogreat@gmail.com으로 이메일 인텐트 발송
     */
    private fun sendRequestEmail(title: String, desc: String, contact: String) {
        val targetEmail = "chachogreat@gmail.com"
        val subject = "[SheetBot 기능의뢰] $title ($contact)"
        val timeStr = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.KOREA).format(Date())

        val body = buildString {
            appendLine("=== 💡 SheetBot 맞춤 기능 제작 의뢰서 ===")
            appendLine("■ 희망 기능명: $title")
            appendLine("■ 회신 연락처/이메일: $contact")
            appendLine("■ 계정 이메일: ${prefs.userEmail ?: "미연동"}")
            appendLine("■ 접수 일시: $timeStr")
            appendLine("----------------------------------------")
            appendLine("■ 상세 자동화 요구사항 및 시나리오:")
            appendLine(desc)
            appendLine("----------------------------------------")
            appendLine("※ 본 메일은 SheetBot 모바일 에이전트에서 작성되었습니다.")
        }

        val mailUri = Uri.parse("mailto:$targetEmail?subject=${Uri.encode(subject)}&body=${Uri.encode(body)}")
        val emailIntent = Intent(Intent.ACTION_SENDTO, mailUri)

        try {
            activity.startActivity(emailIntent)
            Toast.makeText(activity, "메일 앱이 실행되었습니다. [보내기]를 눌러 의뢰를 완료해 주세요.", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            // 설치된 메일 앱이 없을 경우 클립보드 복사 폴백
            val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("SheetBot 기능의뢰", body)
            clipboard.setPrimaryClip(clip)
            Toast.makeText(activity, "이메일 앱을 찾을 수 없어 내용이 클립보드에 복사되었습니다.\n$targetEmail 로 전송해 주세요.", Toast.LENGTH_LONG).show()
        }
    }
}
