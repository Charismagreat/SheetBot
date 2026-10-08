package cloud.sheetbot.agent.user.card

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.Toast
import cloud.sheetbot.agent.user.CardActionActivity
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
 * - 스마트 명함 관리 구글 시트 대장 자동 등록
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
     * 카드 초기화 및 버튼 이벤트 바인딩
     */
    fun setup() {
        binding.btnOpenBusinessCardSheet.setOnClickListener {
            onOpenSheetChooser("BUSINESS_CARD", prefs.businessCardDriveSheetTitle)
        }

        binding.btnPickBusinessCard.setOnClickListener {
            if (!prefs.isPaired) {
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

    /**
     * 명함 사진을 전송하여 Gemini AI OCR로 성함/직함/회사명/전화번호를 분석하고 [SheetBot] 스마트 명함 관리 대장에 자동 기록
     */
    fun uploadBusinessCard(uri: Uri) {
        if (!prefs.isPaired) {
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
        Toast.makeText(activity, "🪪 명함을 전송했습니다. 다른 앱을 이용하셔도 AI 분석 완료 시 상단 알림이 뜹니다.", Toast.LENGTH_SHORT).show()

        val appContext = activity.applicationContext
        // 이제 로컬 파일이 캐시에 보관되어 있으므로 창 전환해도 100% 무중단 실행!
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = FileUploadManager.uploadPreparedBusinessCard(appContext, tempFile, meta)
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                }

                if (result.success) {
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
                } else {
                    val err = result.error ?: "명함 분석 실패"
                    withContext(Dispatchers.Main) {
                        Toast.makeText(appContext, "⚠️ 명함 분석 실패: $err", Toast.LENGTH_LONG).show()
                        onAddLogItem("명함 오류", err, false)
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
}
