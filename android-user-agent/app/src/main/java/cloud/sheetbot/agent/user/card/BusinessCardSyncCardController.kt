package cloud.sheetbot.agent.user.card

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import cloud.sheetbot.agent.user.CardActionActivity
import cloud.sheetbot.agent.user.ContactHelper
import cloud.sheetbot.agent.user.FileToSheetClient
import cloud.sheetbot.agent.user.FileUploadManager
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * 🪪 명함 Gemini AI OCR 자동 인맥 등록 카드 전담 컨트롤러 (v2.1.99 리팩토링 모듈화)
 *
 * - 명함 사진/문서 선택 런처 연동
 * - Gemini AI OCR 성함/직함/회사명/연락처 자동 분석
 * - 스마트 명함 관리 구글 시트 대장 또는 파일투시트(명함관리) 자동 등록
 * - 스마트폰 연락처 자동 동기화 (내 주소록에 자동 추가 & 일괄 가져오기)
 * - 인맥 액션 다이얼로그(CardActionActivity) 즉시 출현
 * - 헤드업 알림 및 팝업 3초 카운트다운 디버그 테스트
 * - 시트 대장 원터치 뷰어 오픈
 */
class BusinessCardSyncCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onPickBusinessCardImage: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onAddLogItem: (title: String, detail: String, success: Boolean) -> Unit
) {
    /**
     * 카드 접기/펼치기 토글
     */
    fun toggleCollapse() {
        val isHidden = !prefs.isBusinessCardDetailsHidden
        prefs.isBusinessCardDetailsHidden = isHidden
        refreshCollapseState()
    }

    fun refreshCollapseState() {
        val isHidden = prefs.isBusinessCardDetailsHidden
        binding.layoutBusinessCardDetails.visibility = if (isHidden) View.GONE else View.VISIBLE
        binding.btnToggleBusinessCardDetails.text = if (isHidden) "▼" else "▲"
    }

    /**
     * 카드 초기화 및 버튼 이벤트 바인딩
     */
    fun setup() {
        refreshCollapseState()
        binding.switchBusinessCardSync.isChecked = prefs.isBusinessCardSyncEnabled
        binding.switchBusinessCardSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isBusinessCardSyncEnabled = isChecked
            onAddLogItem(
                "스마트 명함 관리",
                if (isChecked) "스마트 명함 자동화가 활성화되었습니다." else "스마트 명함 자동화가 비활성화되었습니다.",
                true
            )
        }

        // 📇 스마트폰 연락처 자동 동기화 스위치
        binding.switchBusinessCardAutoAddContacts.isChecked = prefs.isBusinessCardAutoAddContactsEnabled
        binding.switchBusinessCardAutoAddContacts.setOnCheckedChangeListener { _, isChecked ->
            prefs.isBusinessCardAutoAddContactsEnabled = isChecked
            if (isChecked) {
                checkAndRequestContactPermissions()
            }
            onAddLogItem(
                "연락처 동기화",
                if (isChecked) "명함 등록 시 내 연락처 자동 추가 활성화됨" else "내 연락처 자동 추가 비활성화됨",
                true
            )
        }

        // 📲 파일투시트 명함 ➔ 내 연락처로 일괄 가져오기 버튼
        binding.btnSyncContactsFromFileToSheet.setOnClickListener {
            syncContactsFromFileToSheet()
        }

        binding.btnOpenBusinessCardSheet.setOnClickListener {
            onOpenSheetChooser("BUSINESS_CARD", prefs.businessCardDriveSheetTitle)
        }

        binding.btnPickBusinessCard.setOnClickListener {
            if (prefs.isDestinationFileToSheet) {
                if (!prefs.isFtsPaired && prefs.ftsPhoneNumber.isNullOrBlank()) {
                    Toast.makeText(activity, "먼저 파일투시트 번호 인증 또는 QR코드를 스캔해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
            } else if (!prefs.isPaired) {
                Toast.makeText(activity, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            onPickBusinessCardImage()
        }

        // 🧪 [디버깅] 명함 헤드업 알림 & 팝업 3초 카운트다운 테스트
        binding.btnTestBusinessCardNotification.setOnClickListener {
            val notiManager = activity.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            val isEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                notiManager.areNotificationsEnabled()
            } else {
                true
            }

            if (!isEnabled) {
                Toast.makeText(activity, "⚠️ 시트봇 앱 알림 권한이 꺼져 있습니다! 알림 설정 화면을 엽니다.", Toast.LENGTH_LONG).show()
                try {
                    val intent = Intent().apply {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            action = android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS
                            putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, activity.packageName)
                        } else {
                            action = "android.settings.APP_NOTIFICATION_SETTINGS"
                            putExtra("app_package", activity.packageName)
                            putExtra("app_uid", activity.applicationInfo.uid)
                        }
                    }
                    activity.startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(activity, "설정 화면 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
                return@setOnClickListener
            }

            Toast.makeText(activity, "🧪 [3초 테스트 시작] 지금 바로 홈 버튼을 눌러 카카오톡 등 다른 앱으로 전환해 보세요!", Toast.LENGTH_LONG).show()

            val appContext = activity.applicationContext
            CoroutineScope(Dispatchers.IO).launch {
                delay(3000)
                val testCardJson = JSONObject().apply {
                    put("name", "홍길동")
                    put("title", "대표이사")
                    put("company", "시트봇테크(주)")
                    put("mobile", "010-1234-5678")
                    put("email", "hong@sheetbot.cloud")
                    put("tel", "02-123-4567")
                    put("address", "서울특별시 강남구 테헤란로 123")
                    put("details", "AI 비즈니스 인맥 자동화 테스트")
                }
                FileUploadManager.showBusinessCardActionNotification(
                    appContext,
                    "홍길동",
                    "(시트봇테크)",
                    testCardJson
                )
                try {
                    CardActionActivity.start(activity, testCardJson)
                } catch (_: Exception) {}
            }
        }
    }

    private fun checkAndRequestContactPermissions(): Boolean {
        val hasWrite = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.WRITE_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED

        val hasRead = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasWrite || !hasRead) {
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.WRITE_CONTACTS, Manifest.permission.READ_CONTACTS),
                101
            )
            return false
        }
        return true
    }

    /**
     * 명함 사진을 전송하여 구글 시트 또는 파일투시트(FileToSheet) 시트에 직결 자동 기록
     */
    fun uploadBusinessCard(uri: Uri) {
        val isFts = prefs.isDestinationFileToSheet
        if (isFts) {
            if (!prefs.isFtsPaired && prefs.ftsPhoneNumber.isNullOrBlank()) {
                Toast.makeText(activity, "⚠️ 파일투시트 번호 인증 또는 QR코드 연동 후 이용할 수 있습니다.", Toast.LENGTH_LONG).show()
                return
            }
        } else if (!prefs.isPaired) {
            Toast.makeText(activity, "⚠️ 시트봇 계정 연동 후 이용할 수 있습니다.", Toast.LENGTH_LONG).show()
            return
        }

        // ★ [창 전환 권한 소멸 원천 방어] 액티비티가 살아있는 즉시 앱 캐시로 복사
        val meta = FileUploadManager.resolveUriMetadata(activity, uri)
        val tempFile = FileUploadManager.copyUriToTempFile(activity, uri, meta.fileName)
        if (tempFile == null || !tempFile.exists()) {
            Toast.makeText(activity, "⚠️ 명함 이미지를 읽어올 수 없습니다.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        val bizSheetName = prefs.getFtsSheetNameFor("business_card") ?: "명함관리"
        val targetDesc = if (isFts) "파일투시트 [$bizSheetName]" else "구글 시트"
        Toast.makeText(activity, "🪪 명함을 ${targetDesc}로 전송했습니다.", Toast.LENGTH_SHORT).show()

        val appContext = activity.applicationContext
        // 이제 로컬 파일이 캐시에 보관되어 있으므로 창 전환해도 100% 무중단 실행!
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = FileUploadManager.uploadPreparedBusinessCard(appContext, tempFile, meta)
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                }

                if (result.success) {
                    // 📇 스마트폰 연락처 자동 동기화 옵션이 켜져 있는 경우 내 폰 주소록에 자동 추가
                    if (prefs.isBusinessCardAutoAddContactsEnabled && result.ocrData != null) {
                        saveContactFromOcrData(appContext, result.ocrData)
                    }

                    if (isFts) {
                        val sName = result.folderName?.takeIf { it.isNotBlank() }
                            ?: prefs.getFtsSheetNameFor("business_card")
                            ?: "명함관리"
                        withContext(Dispatchers.Main) {
                            Toast.makeText(
                                appContext,
                                "✅ [$sName] 시트에 1건이 전송되었습니다!",
                                Toast.LENGTH_LONG
                            ).show()
                            onAddLogItem("⚡ FTS 명함", "[$sName] 시트 직결 적재 완료", true)
                        }
                    } else {
                        val ocr = result.ocrData
                        val name = ocr?.optString("name", "명함") ?: "명함"
                        val rawComp = ocr?.optString("company")
                        val comp = if (!rawComp.isNullOrBlank()) "($rawComp)" else ""

                        withContext(Dispatchers.Main) {
                            Toast.makeText(
                                appContext,
                                "🎉 [명함 등록 완료] $name $comp\n인맥 관리 대장에 자동 기록되었습니다!",
                                Toast.LENGTH_LONG
                            ).show()
                            onAddLogItem("🪪 명함 OCR", "$name $comp -> 인맥 대장", true)

                            // ★ [인맥 액션 다이얼로그 즉시 출현] 앱이 켜져 있을 때 연락처 저장 & 내 명함 발송 팝업창 다이렉트 표시!
                            try {
                                CardActionActivity.start(activity, ocr ?: JSONObject())
                            } catch (dialogErr: Exception) {
                                android.util.Log.w("BusinessCardController", "CardActionActivity 다이얼로그 팝업 실패: ${dialogErr.message}")
                            }
                        }
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(appContext, "⚠️ 명함 전송 실패: ${result.error ?: "오류"}", Toast.LENGTH_LONG).show()
                        onAddLogItem("명함 오류", result.error ?: "전송 실패", false)
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                    Toast.makeText(appContext, "명함 처리 예외: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * OCR 데이터 객체(한글 컬럼 또는 영문 키 지원)를 파싱하여 내 스마트폰 연락처에 추가
     */
    private suspend fun saveContactFromOcrData(context: Context, ocr: JSONObject) {
        val cName = ocr.optString("성명").takeIf { it.isNotBlank() }
            ?: ocr.optString("이름").takeIf { it.isNotBlank() }
            ?: ocr.optString("name").takeIf { it.isNotBlank() }
            ?: ""

        val cMobile = ocr.optString("휴대폰").takeIf { it.isNotBlank() }
            ?: ocr.optString("휴대전화").takeIf { it.isNotBlank() }
            ?: ocr.optString("휴대폰번호").takeIf { it.isNotBlank() }
            ?: ocr.optString("mobile").takeIf { it.isNotBlank() }
            ?: ocr.optString("phone").takeIf { it.isNotBlank() }
            ?: ""

        if (cName.isBlank() && cMobile.isBlank()) return

        val cCompany = ocr.optString("회사명").takeIf { it.isNotBlank() }
            ?: ocr.optString("company").takeIf { it.isNotBlank() }

        val cTitle = ocr.optString("직함").takeIf { it.isNotBlank() }
            ?: ocr.optString("부서직책").takeIf { it.isNotBlank() }
            ?: ocr.optString("title").takeIf { it.isNotBlank() }

        val cEmail = ocr.optString("이메일").takeIf { it.isNotBlank() }
            ?: ocr.optString("email").takeIf { it.isNotBlank() }

        val cAddress = ocr.optString("회사주소").takeIf { it.isNotBlank() }
            ?: ocr.optString("address").takeIf { it.isNotBlank() }

        val cMemo = ocr.optString("상세정보").takeIf { it.isNotBlank() }
            ?: ocr.optString("details").takeIf { it.isNotBlank() }
            ?: ocr.optString("비고").takeIf { it.isNotBlank() }

        val res = ContactHelper.insertContactIfNotExists(
            context = context,
            name = cName,
            mobile = cMobile,
            company = cCompany,
            title = cTitle,
            email = cEmail,
            address = cAddress,
            memo = cMemo
        )

        withContext(Dispatchers.Main) {
            when (res) {
                1 -> {
                    Toast.makeText(context, "📇 스마트폰 연락처에 [$cName]님이 자동 추가되었습니다.", Toast.LENGTH_SHORT).show()
                    onAddLogItem("📇 연락처 동기화", "$cName ($cMobile) 내 폰에 추가 완료", true)
                }
                0 -> {
                    android.util.Log.d("BusinessCardController", "이미 존재하는 연락처로 추가 생략: $cName ($cMobile)")
                }
                else -> {
                    Toast.makeText(context, "⚠️ 연락처 저장 실패 (주소록 권한을 확인해주세요)", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * 파일투시트 명함관리 시트의 전체 목록을 가져와 내 휴대전화 주소록으로 일괄 동기화
     */
    private fun syncContactsFromFileToSheet() {
        if (!checkAndRequestContactPermissions()) {
            Toast.makeText(activity, "주소록 쓰기 권한이 필요합니다. 권한을 허용한 후 다시 시도해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        if (!prefs.isFtsPaired && prefs.ftsPhoneNumber.isNullOrBlank()) {
            Toast.makeText(activity, "⚠️ 파일투시트 번호 인증 또는 연동 후 이용할 수 있습니다.", Toast.LENGTH_LONG).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        Toast.makeText(activity, "📲 파일투시트 명함 데이터를 조회 중입니다...", Toast.LENGTH_SHORT).show()

        val appContext = activity.applicationContext
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val (endpoint, sheetName) = FileUploadManager.resolveOrEnsureFtsSheet(prefs, "business_card")
                val token = prefs.ftsBusinessCardToken?.takeIf { it.isNotBlank() }

                val (fetchSuccess, rows) = FileToSheetClient.fetchSheetRows(endpoint, token)

                if (!fetchSuccess || rows.isEmpty()) {
                    withContext(Dispatchers.Main) {
                        binding.progressBar.visibility = View.GONE
                        val msg = if (!fetchSuccess) "파일투시트 시트 데이터를 불러오지 못했습니다." else "[$sheetName] 시트에 등록된 명함 데이터가 없습니다."
                        Toast.makeText(appContext, "⚠️ $msg", Toast.LENGTH_LONG).show()
                    }
                    return@launch
                }

                var addedCount = 0
                var skippedCount = 0
                var failedCount = 0

                for (row in rows) {
                    val cName = row.optString("성명").takeIf { it.isNotBlank() }
                        ?: row.optString("이름").takeIf { it.isNotBlank() }
                        ?: row.optString("name").takeIf { it.isNotBlank() }
                        ?: ""

                    val cMobile = row.optString("휴대폰").takeIf { it.isNotBlank() }
                        ?: row.optString("휴대전화").takeIf { it.isNotBlank() }
                        ?: row.optString("휴대폰번호").takeIf { it.isNotBlank() }
                        ?: row.optString("mobile").takeIf { it.isNotBlank() }
                        ?: row.optString("phone").takeIf { it.isNotBlank() }
                        ?: ""

                    if (cName.isBlank() && cMobile.isBlank()) {
                        continue
                    }

                    val cCompany = row.optString("회사명").takeIf { it.isNotBlank() }
                        ?: row.optString("company").takeIf { it.isNotBlank() }

                    val cTitle = row.optString("직함").takeIf { it.isNotBlank() }
                        ?: row.optString("부서직책").takeIf { it.isNotBlank() }
                        ?: row.optString("title").takeIf { it.isNotBlank() }

                    val cEmail = row.optString("이메일").takeIf { it.isNotBlank() }
                        ?: row.optString("email").takeIf { it.isNotBlank() }

                    val cAddress = row.optString("회사주소").takeIf { it.isNotBlank() }
                        ?: row.optString("address").takeIf { it.isNotBlank() }

                    val cMemo = row.optString("상세정보").takeIf { it.isNotBlank() }
                        ?: row.optString("details").takeIf { it.isNotBlank() }
                        ?: row.optString("비고").takeIf { it.isNotBlank() }

                    val insertRes = ContactHelper.insertContactIfNotExists(
                        context = appContext,
                        name = cName,
                        mobile = cMobile,
                        company = cCompany,
                        title = cTitle,
                        email = cEmail,
                        address = cAddress,
                        memo = cMemo
                    )

                    when (insertRes) {
                        1 -> addedCount++
                        0 -> skippedCount++
                        else -> failedCount++
                    }
                }

                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                    val summary = "🎉 동기화 완료: 총 ${rows.size}건 중 신규 추가 ${addedCount}건, 기존 보유 ${skippedCount}건"
                    Toast.makeText(appContext, summary, Toast.LENGTH_LONG).show()
                    onAddLogItem("📲 연락처 일괄 동기화", "신규 $addedCount / 기존 $skippedCount / 총 ${rows.size}건", true)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                    Toast.makeText(appContext, "연락처 일괄 동기화 오류: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
