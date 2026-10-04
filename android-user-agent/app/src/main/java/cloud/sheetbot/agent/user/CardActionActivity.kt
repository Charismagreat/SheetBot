package cloud.sheetbot.agent.user

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

/**
 * 명함 등록 완료 시 스마트폰 연락처 자동 저장 및 내 모바일 명함 발송 승인 다이얼로그 액티비티
 */
class CardActionActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_NAME = "extra_name"
        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_COMPANY = "extra_company"
        const val EXTRA_MOBILE = "extra_mobile"
        const val EXTRA_EMAIL = "extra_email"
        const val EXTRA_TEL = "extra_tel"
        const val EXTRA_ADDRESS = "extra_address"
        const val EXTRA_DETAILS = "extra_details"
        const val NOTIFICATION_ID = 3001

        fun start(context: Context, cardJson: JSONObject) {
            val intent = Intent(context, CardActionActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra(EXTRA_NAME, cardJson.optString("name", ""))
                putExtra(EXTRA_TITLE, cardJson.optString("title", ""))
                putExtra(EXTRA_COMPANY, cardJson.optString("company", ""))
                putExtra(EXTRA_MOBILE, cardJson.optString("mobile", ""))
                putExtra(EXTRA_EMAIL, cardJson.optString("email", ""))
                putExtra(EXTRA_TEL, cardJson.optString("tel", ""))
                putExtra(EXTRA_ADDRESS, cardJson.optString("address", ""))
                putExtra(EXTRA_DETAILS, cardJson.optString("details", ""))
            }
            context.startActivity(intent)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 상단 알림 닫기
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(NOTIFICATION_ID)

        val name = intent.getStringExtra(EXTRA_NAME) ?: "명함 고객"
        val title = intent.getStringExtra(EXTRA_TITLE) ?: ""
        val company = intent.getStringExtra(EXTRA_COMPANY) ?: ""
        val mobile = intent.getStringExtra(EXTRA_MOBILE) ?: ""
        val email = intent.getStringExtra(EXTRA_EMAIL) ?: ""
        val tel = intent.getStringExtra(EXTRA_TEL) ?: ""
        val address = intent.getStringExtra(EXTRA_ADDRESS) ?: ""
        val details = intent.getStringExtra(EXTRA_DETAILS) ?: ""

        val isMobileValid = mobile.isNotBlank() && mobile.replace("[^0-9]".toRegex(), "").length >= 8
        val isAlreadyInContacts = isMobileValid && ContactHelper.isContactExists(this, mobile)

        // 팝업 다이얼로그 뷰 구성
        val context = this
        val layout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(50, 30, 50, 20)
        }

        // 인적사항 헤더
        val infoText = buildString {
            if (company.isNotBlank() || title.isNotBlank()) {
                append("$company $title\n".trim())
            }
            if (mobile.isNotBlank()) append("📱 휴대전화: $mobile\n")
            if (email.isNotBlank()) append("✉️ 이메일: $email\n")
            if (address.isNotBlank() && address != "미기재") append("🏢 주소: $address\n")
        }.trim()

        val tvInfo = TextView(context).apply {
            text = infoText
            textSize = 14f
            setTextColor(Color.parseColor("#374151"))
            setPadding(0, 0, 0, 30)
            setLineSpacing(8f, 1f)
        }
        layout.addView(tvInfo)

        // 구분선
        val divider = LinearLayout(context).apply {
            setBackgroundColor(Color.parseColor("#E5E7EB"))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 2).apply {
                bottomMargin = 25
            }
        }
        layout.addView(divider)

        // 1. 스마트폰 연락처 자동 추가 체크박스 (기본 체크)
        val cbSaveContact = CheckBox(context).apply {
            text = if (isAlreadyInContacts) {
                "스마트폰 연락처에 추가 (이미 저장된 연락처)"
            } else {
                "스마트폰 연락처(주소록)에 자동 추가"
            }
            isChecked = !isAlreadyInContacts && isMobileValid
            isEnabled = isMobileValid
            textSize = 15f
            setTextColor(if (isAlreadyInContacts) Color.parseColor("#6B7280") else Color.parseColor("#111827"))
            setTypeface(null, Typeface.BOLD)
            setPadding(10, 15, 10, 15)
        }
        layout.addView(cbSaveContact)

        // 2. 내 모바일 명함 즉시 발송 체크박스 (기본 체크)
        val cbSendMyCard = CheckBox(context).apply {
            text = "상대방에게 내 모바일 명함(문자) 즉시 발송"
            isChecked = isMobileValid
            isEnabled = isMobileValid
            textSize = 15f
            setTextColor(Color.parseColor("#111827"))
            setTypeface(null, Typeface.BOLD)
            setPadding(10, 15, 10, 20)
        }
        layout.addView(cbSendMyCard)

        val scrollView = ScrollView(context).apply {
            addView(layout)
        }

        val dialog = AlertDialog.Builder(context)
            .setTitle("🪪 명함 등록 완료: $name")
            .setView(scrollView)
            .setCancelable(false)
            .setPositiveButton("확인 및 실행") { _, _ ->
                var actionCount = 0

                // 1. 주소록 저장 실행
                if (cbSaveContact.isChecked && isMobileValid) {
                    val saved = ContactHelper.insertContact(
                        context = context,
                        name = name,
                        mobile = mobile,
                        company = company,
                        title = title,
                        email = email,
                        address = address,
                        memo = details
                    )
                    if (saved) {
                        actionCount++
                        Toast.makeText(context, "✅ '${name}'님의 연락처가 스마트폰에 저장되었습니다.", Toast.LENGTH_SHORT).show()
                    }
                }

                // 2. 내 모바일 명함 발송 실행
                if (cbSendMyCard.isChecked && isMobileValid) {
                    val prefs = PreferencesManager(context)
                    if (prefs.businessCardSendMode == "MMS_IMAGE") {
                        PhoneCallReceiver.sendBusinessCardMms(context, mobile, name) { success ->
                            runOnUiThread {
                                if (success) {
                                    Toast.makeText(context, "📨 '${name}'님께 모바일 명함(MMS)이 준비되었습니다.", Toast.LENGTH_SHORT).show()
                                }
                            }
                        }
                    } else {
                        PhoneCallReceiver.sendBusinessCardSms(context, mobile, name) { success ->
                            runOnUiThread {
                                if (success) {
                                    Toast.makeText(context, "📨 '${name}'님께 모바일 명함이 성공적으로 발송되었습니다.", Toast.LENGTH_SHORT).show()
                                }
                            }
                        }
                    }
                    actionCount++
                }

                if (actionCount == 0) {
                    Toast.makeText(context, "명함이 구글 시트에 안전하게 보관되었습니다.", Toast.LENGTH_SHORT).show()
                }

                finish()
            }
            .setNegativeButton("건너뛰기") { _, _ ->
                Toast.makeText(context, "추가 작업 없이 명함 대장에만 보관되었습니다.", Toast.LENGTH_SHORT).show()
                finish()
            }
            .create()

        dialog.show()
    }
}
