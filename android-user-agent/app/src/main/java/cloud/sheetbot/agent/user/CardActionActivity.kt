package cloud.sheetbot.agent.user

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.provider.ContactsContract
import android.util.Log
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * 명함 등록 완료 시 스마트폰 연락처 자동 저장 및 내 모바일 명함 발송 승인 다이얼로그 액티비티
 * - WRITE_CONTACTS 권한 자동 요청 및 100% 저장 보장
 * - 권한 거부 시 시스템 연락처 등록 화면(Intent.ACTION_INSERT)으로 무손실 폴백
 */
class CardActionActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "CardActionActivity"
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

    private var targetName = ""
    private var targetTitle = ""
    private var targetCompany = ""
    private var targetMobile = ""
    private var targetEmail = ""
    private var targetTel = ""
    private var targetAddress = ""
    private var targetDetails = ""
    private var shouldSendMyCard = false

    // WRITE_CONTACTS 런타임 권한 요청 런처
    private val writeContactPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            Log.i(TAG, "WRITE_CONTACTS 권한 허용됨 -> 즉시 주소록 저장 실행")
            val saved = doInsertContactDirect()
            if (!saved) {
                fallbackToSystemInsertContact()
            }
        } else {
            Log.w(TAG, "WRITE_CONTACTS 권한 거부됨 -> 시스템 연락처 추가 화면으로 폴백")
            Toast.makeText(this, "연락처 권한이 필요하여 시스템 추가 화면으로 이동합니다.", Toast.LENGTH_SHORT).show()
            fallbackToSystemInsertContact()
        }

        if (shouldSendMyCard) {
            doSendMyBusinessCard()
        }
        finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 상단 알림 닫기
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(NOTIFICATION_ID)

        targetName = intent.getStringExtra(EXTRA_NAME) ?: "명함 고객"
        targetTitle = intent.getStringExtra(EXTRA_TITLE) ?: ""
        targetCompany = intent.getStringExtra(EXTRA_COMPANY) ?: ""
        targetMobile = intent.getStringExtra(EXTRA_MOBILE) ?: ""
        targetEmail = intent.getStringExtra(EXTRA_EMAIL) ?: ""
        targetTel = intent.getStringExtra(EXTRA_TEL) ?: ""
        targetAddress = intent.getStringExtra(EXTRA_ADDRESS) ?: ""
        targetDetails = intent.getStringExtra(EXTRA_DETAILS) ?: ""

        val isMobileValid = targetMobile.isNotBlank() && targetMobile.replace("[^0-9]".toRegex(), "").length >= 8
        val isAlreadyInContacts = isMobileValid && ContactHelper.isContactExists(this, targetMobile)

        // 팝업 다이얼로그 뷰 구성
        val context = this
        val layout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(50, 30, 50, 20)
        }

        // 인적사항 헤더
        val infoText = buildString {
            if (targetCompany.isNotBlank() || targetTitle.isNotBlank()) {
                append("$targetCompany $targetTitle\n".trim())
            }
            if (targetMobile.isNotBlank()) append("📱 휴대전화: $targetMobile\n")
            if (targetEmail.isNotBlank()) append("✉️ 이메일: $targetEmail\n")
            if (targetAddress.isNotBlank() && targetAddress != "미기재") append("🏢 주소: $targetAddress\n")
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
            .setTitle("🪪 명함 등록 완료: $targetName")
            .setView(scrollView)
            .setCancelable(false)
            .setPositiveButton("확인 및 실행") { _, _ ->
                val needSaveContact = cbSaveContact.isChecked && isMobileValid
                shouldSendMyCard = cbSendMyCard.isChecked && isMobileValid

                if (needSaveContact) {
                    val hasWritePermission = ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.WRITE_CONTACTS
                    ) == PackageManager.PERMISSION_GRANTED

                    if (hasWritePermission) {
                        // 권한이 이미 있으므로 백그라운드 0초 직접 저장
                        val saved = doInsertContactDirect()
                        if (!saved) {
                            fallbackToSystemInsertContact()
                        }
                        if (shouldSendMyCard) {
                            doSendMyBusinessCard()
                        }
                        finish()
                    } else {
                        // 권한이 없으므로 시스템 권한 허용 팝업 띄움
                        Log.i(TAG, "WRITE_CONTACTS 권한 요청 팝업 실행")
                        writeContactPermissionLauncher.launch(Manifest.permission.WRITE_CONTACTS)
                        // finish()는 launcher 콜백에서 처리
                    }
                } else {
                    if (shouldSendMyCard) {
                        doSendMyBusinessCard()
                    } else {
                        Toast.makeText(context, "명함이 구글 시트에 안전하게 보관되었습니다.", Toast.LENGTH_SHORT).show()
                    }
                    finish()
                }
            }
            .setNegativeButton("건너뛰기") { _, _ ->
                Toast.makeText(context, "추가 작업 없이 명함 대장에만 보관되었습니다.", Toast.LENGTH_SHORT).show()
                finish()
            }
            .create()

        dialog.show()
    }

    private fun doInsertContactDirect(): Boolean {
        return try {
            val saved = ContactHelper.insertContact(
                context = this,
                name = targetName,
                mobile = targetMobile,
                company = targetCompany,
                title = targetTitle,
                email = targetEmail,
                address = targetAddress,
                memo = targetDetails
            )
            if (saved) {
                Toast.makeText(this, "✅ '${targetName}'님의 연락처가 스마트폰에 저장되었습니다.", Toast.LENGTH_LONG).show()
                Log.i(TAG, "연락처 직접 저장 성공: $targetName ($targetMobile)")
                true
            } else {
                Log.w(TAG, "ContactHelper.insertContact 반환값 false")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "연락처 직접 저장 예외: ${e.message}", e)
            false
        }
    }

    private fun fallbackToSystemInsertContact() {
        try {
            val intent = Intent(Intent.ACTION_INSERT, ContactsContract.Contacts.CONTENT_URI).apply {
                putExtra(ContactsContract.Intents.Insert.NAME, targetName)
                putExtra(ContactsContract.Intents.Insert.PHONE, targetMobile)
                if (targetCompany.isNotBlank()) putExtra(ContactsContract.Intents.Insert.COMPANY, targetCompany)
                if (targetTitle.isNotBlank()) putExtra(ContactsContract.Intents.Insert.JOB_TITLE, targetTitle)
                if (targetEmail.isNotBlank()) putExtra(ContactsContract.Intents.Insert.EMAIL, targetEmail)
                if (targetAddress.isNotBlank() && targetAddress != "미기재") putExtra(ContactsContract.Intents.Insert.POSTAL, targetAddress)
                val note = buildString {
                    append("[SheetBot 스마트 명함 대장 등록]")
                    if (targetDetails.isNotBlank()) append("\n$targetDetails")
                }
                putExtra(ContactsContract.Intents.Insert.NOTES, note)
            }
            startActivity(intent)
            Toast.makeText(this, "연락처 앱에서 '저장'을 눌러주세요.", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.e(TAG, "시스템 주소록 인텐트 호출 예외: ${e.message}", e)
        }
    }

    private fun doSendMyBusinessCard() {
        val context = this
        val prefs = PreferencesManager(context)
        if (prefs.businessCardSendMode == "MMS_IMAGE") {
            PhoneCallReceiver.sendBusinessCardMms(context, targetMobile, targetName) { success ->
                runOnUiThread {
                    if (success) {
                        Toast.makeText(context, "📨 '${targetName}'님께 모바일 명함(MMS)이 준비되었습니다.", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        } else {
            PhoneCallReceiver.sendBusinessCardSms(context, targetMobile, targetName) { success ->
                runOnUiThread {
                    if (success) {
                        Toast.makeText(context, "📨 '${targetName}'님께 모바일 명함이 성공적으로 발송되었습니다.", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }
}
