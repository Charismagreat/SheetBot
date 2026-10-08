package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.AppPreferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 📊 구글 스프레드시트 대장 프로비저닝 및 드라이브 연동 전담 액션 컨트롤러
 *
 * - 업무별(SMS, 카톡, 녹음, 영수증, 견적 등) 구글 시트 자동 생성 및 템플릿 프로비저닝
 * - 구글 시트 원본 vs 모바일 스마트 웹앱 선택 다이얼로그 (v2.1.5)
 * - 시트 최초 연결 시 프로그레스 다이얼로그 표시 및 백그라운드 확인 즉시 자동 열기
 * - 구글 드라이브 지정 폴더 열기 (캐시 우선 및 폴더 선제 생성 자동 안내)
 * - 활성화된 전체 업무 대장 URL 백그라운드 사전 캐싱 (Preload)
 */
class SheetActionController(
    private val activity: AppCompatActivity,
    private val prefs: AppPreferences,
    private val scope: CoroutineScope,
    private val addLogItem: (title: String, detail: String, success: Boolean) -> Unit
) {

    fun provisionSheetAsync(sheetType: String, sheetTitle: String, folderName: String? = null) {
        val userEmail = prefs.userEmail
        if (!prefs.isPaired || userEmail.isNullOrBlank()) {
            return
        }

        scope.launch {
            try {
                val result = ApiClient.provisionSheet(
                    userEmail = userEmail,
                    sheetType = sheetType,
                    sheetTitle = sheetTitle,
                    folderName = folderName
                )
                if (result.success) {
                    val statusPrefix = if (result.isNew) "🎉 새 대장 생성 완료" else "✅ 기존 대장 연결 확인"
                    val folderSuffix = if (!result.folderName.isNullOrBlank()) "\n📁 폴더: ${result.folderName}" else ""
                    val msg = "📊 ${result.title ?: sheetTitle}\n$statusPrefix (구글 드라이브에 준비되었습니다)$folderSuffix"
                    Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
                    addLogItem("대장 준비", "${result.title ?: sheetTitle} 확인 완료", true)

                    // URL 및 ID 로컬 캐시 (시트 원본 및 모바일 웹앱 원터치 열기 지원)
                    if (!result.spreadsheetUrl.isNullOrBlank()) {
                        prefs.setSheetUrl(sheetType, result.spreadsheetUrl)
                    }
                    if (!result.spreadsheetId.isNullOrBlank()) {
                        prefs.setSheetId(sheetType, result.spreadsheetId)
                    }
                    if (!result.folderUrl.isNullOrBlank()) {
                        prefs.setFolderUrl(sheetType, result.folderUrl)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.w("SheetActionController", "시트/폴더 선제 생성 통신 예외: ${e.message}")
            }
        }
    }

    /**
     * 활성화된 기능들의 구글 시트 URL을 백그라운드에서 사전 캐싱 (v2.1.5)
     */
    fun preloadActiveSheetUrls() {
        try {
            val userEmail = prefs.userEmail
            if (!prefs.isPaired || userEmail.isNullOrBlank()) return

            scope.launch(Dispatchers.IO) {
                try {
                    val targets = mutableListOf<Triple<String, String, String?>>()
                    if (prefs.isSmsSheetSyncEnabled && prefs.getSheetUrl("SMS").isNullOrBlank()) {
                        targets.add(Triple("SMS", prefs.smsDriveSheetTitle, null))
                    }
                    if (prefs.isKakaoSheetSyncEnabled && prefs.getSheetUrl("KAKAO").isNullOrBlank()) {
                        targets.add(Triple("KAKAO", prefs.kakaoDriveSheetTitle, null))
                    }
                    if (prefs.isMissedCallAutoReplyEnabled && prefs.getSheetUrl("MISSED_CALL").isNullOrBlank()) {
                        targets.add(Triple("MISSED_CALL", prefs.missedCallDriveSheetTitle, null))
                    }
                    if (prefs.isCallRecordingSyncEnabled && prefs.getSheetUrl("RECORDING").isNullOrBlank()) {
                        targets.add(Triple("RECORDING", "[SheetBot] 통화 녹음 대장", prefs.callRecordingDriveFolder))
                    }
                    if (prefs.isFileUploadSyncEnabled && prefs.getSheetUrl("FILE_UPLOAD").isNullOrBlank()) {
                        targets.add(Triple("FILE_UPLOAD", "[SheetBot] 파일 업로드 대장", prefs.fileUploadDriveFolder))
                    }
                    if (prefs.isLinkScrapEnabled && prefs.getSheetUrl("LINK_BOOKMARK").isNullOrBlank()) {
                        targets.add(Triple("LINK_BOOKMARK", prefs.linkScrapDriveSheetTitle, null))
                    }
                    if (prefs.isCallEndedCardPromptEnabled && prefs.getSheetUrl("CALL_ENDED_CARD").isNullOrBlank()) {
                        targets.add(Triple("CALL_ENDED_CARD", "[SheetBot] 모바일 명함 발송 대장", null))
                    }
                    if (prefs.isPushDetectionEnabled && prefs.getSheetUrl("PAYMENT_PUSH").isNullOrBlank()) {
                        targets.add(Triple("PAYMENT_PUSH", "[SheetBot] 매장 결제 및 매출 대장", null))
                    }
                    if (prefs.isReceiptSmsEnabled && prefs.getSheetUrl("RECEIPT_SMS").isNullOrBlank()) {
                        targets.add(Triple("RECEIPT_SMS", "[SheetBot] 고객 영수증 문자 발송 대장", null))
                    }
                    if (prefs.isWebsiteMonitorEnabled && prefs.getSheetUrl("WEBSITE_MONITOR").isNullOrBlank()) {
                        targets.add(Triple("WEBSITE_MONITOR", "[SheetBot] 웹사이트 모니터링 & 장애 대장", null))
                    }
                    val quoteUrl = prefs.getSheetUrl("QUOTE")
                    if (prefs.isQuoteSheetSyncEnabled && (quoteUrl.isNullOrBlank() || quoteUrl.contains("1feIe5"))) {
                        targets.add(Triple("QUOTE", prefs.quoteDriveSheetTitle, null))
                    }
                    if (prefs.getSheetUrl("RECEIPT").isNullOrBlank()) {
                        targets.add(Triple("RECEIPT", prefs.receiptDriveSheetTitle, "[SheetBot] 영수증 보관함"))
                    }
                    if (prefs.getSheetUrl("BUSINESS_CARD").isNullOrBlank()) {
                        targets.add(Triple("BUSINESS_CARD", prefs.businessCardDriveSheetTitle, "[SheetBot] 명함 보관함"))
                    }

                    for ((sheetType, title, folder) in targets) {
                        try {
                            val result = ApiClient.provisionSheet(
                                userEmail = userEmail,
                                sheetType = sheetType,
                                sheetTitle = title,
                                folderName = folder
                            )
                            if (result.success) {
                                if (!result.spreadsheetUrl.isNullOrBlank()) {
                                    prefs.setSheetUrl(sheetType, result.spreadsheetUrl)
                                }
                                if (!result.spreadsheetId.isNullOrBlank()) {
                                    prefs.setSheetId(sheetType, result.spreadsheetId)
                                }
                                if (!result.folderUrl.isNullOrBlank()) {
                                    prefs.setFolderUrl(sheetType, result.folderUrl)
                                }
                            }
                        } catch (_: Throwable) {}
                    }
                } catch (e: Throwable) {
                    android.util.Log.w("SheetActionController", "preloadActiveSheetUrls 비동기 루프 방어: ${e.message}")
                }
            }
        } catch (e: Throwable) {
            android.util.Log.w("SheetActionController", "preloadActiveSheetUrls 방어: ${e.message}")
        }
    }

    /**
     * 구글 시트 원본 vs 모바일 스마트 웹앱 선택 다이얼로그 (v2.1.5)
     */
    fun showOpenSheetChooserDialog(sheetType: String, defaultTitle: String) {
        val userEmail = prefs.userEmail
        var cachedUrl = prefs.getSheetUrl(sheetType)
        var cachedId = prefs.getSheetId(sheetType)

        // 구버전 캐시(1feIe5...) 감지 시 강제 제거하여 최신 바인딩(1XCQMxao...) 동기화 유도
        if (sheetType == "QUOTE" && (cachedUrl?.contains("1feIe5") == true || cachedId?.contains("1feIe5") == true)) {
            cachedUrl = null
            cachedId = null
            prefs.setSheetUrl("QUOTE", "")
            prefs.setSheetId("QUOTE", "")
        }

        // 영수증 및 명함 기바인딩 프리셋 안전 확인 (0초 즉시 오픈 보장)
        if (cachedUrl.isNullOrBlank() && cachedId.isNullOrBlank() && !userEmail.isNullOrBlank()) {
            val presetId = when (sheetType.uppercase()) {
                "RECEIPT" -> if (userEmail.equals("chachogreat@gmail.com", ignoreCase = true)) "14t6C-90zNNN-NTXexP37fMOKX85gP9iTe3MIlM83RC4" else null
                "BUSINESS_CARD" -> if (userEmail.equals("chachogreat@gmail.com", ignoreCase = true)) "1GPMcTd7hxU2-ORZ32OX7Qz0tOnxMDNtSPqwKzqiS_AI" else null
                "LAW_ADVISORY" -> "1wpMUfSeV2nn0RRiEZKKU8vopBrx5iHCc67ltxNhKP3M"
                "NAVER_BLOG" -> "14nqZrqndHdz4gGpxBAqluss1kKnQSeSPk10koHYDSgI"
                "INSTAGRAM" -> "1iVleM1QedmtH7wLA0cVM4qhBNjJ3oL-PIrion4gwg2M"
                "MOBILE_SITE" -> "1hxYuqBrYGVmeX_W09izu8-ga9xMqZt0ssMu8TLaSPrg"
                "COMPANY_RESEARCH" -> "1K-SkmE7dyA2tDtl8YKz0QVyog7J7FJIc0vDQIAEOXag"
                else -> null
            }
            if (presetId != null) {
                cachedId = presetId
                cachedUrl = "https://docs.google.com/spreadsheets/d/$presetId/edit"
                prefs.setSheetId(sheetType, presetId)
                prefs.setSheetUrl(sheetType, cachedUrl)
            }
        }

        var finalSheetUrl = cachedUrl ?: if (!cachedId.isNullOrBlank()) {
            "https://docs.google.com/spreadsheets/d/$cachedId/edit"
        } else null

        // 주문 대장의 경우 주문접수대장 탭(gid=1021826080)으로 직행 보장
        if (sheetType == "QUOTE" && finalSheetUrl != null && !finalSheetUrl.contains("gid=")) {
            finalSheetUrl = "$finalSheetUrl#gid=1021826080"
        }

        val webAppUrl = buildString {
            append("https://sheetbot.cloud/m/${sheetType.lowercase()}")
            val queryParams = mutableListOf<String>()
            if (!userEmail.isNullOrBlank()) {
                queryParams.add("email=${Uri.encode(userEmail)}")
            }
            if (!cachedId.isNullOrBlank()) {
                queryParams.add("sheetId=${Uri.encode(cachedId)}")
            }
            if (queryParams.isNotEmpty()) {
                append("?").append(queryParams.joinToString("&"))
            }
        }

        val items = arrayOf(
            "📊 구글 스프레드시트 원본",
            "🌐 모바일 스마트 웹앱 (모바일 최적화)"
        )

        AlertDialog.Builder(activity)
            .setTitle(defaultTitle)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> {
                        if (!finalSheetUrl.isNullOrBlank()) {
                            openExternalUrl(finalSheetUrl)
                        } else {
                            openSheetWithProgress(sheetType, defaultTitle, isWebApp = false)
                        }
                    }
                    1 -> {
                        if (!finalSheetUrl.isNullOrBlank()) {
                            openExternalUrl(webAppUrl)
                        } else {
                            openSheetWithProgress(sheetType, defaultTitle, isWebApp = true)
                        }
                    }
                }
            }
            .setNegativeButton("닫기", null)
            .show()
    }

    /**
     * 캐시가 없을 때 프로그레스 다이얼로그를 표시하고 구글 시트를 확인/생성한 즉시 자동으로 열어줌 (v2.1.5)
     */
    fun openSheetWithProgress(sheetType: String, defaultTitle: String, isWebApp: Boolean) {
        val userEmail = prefs.userEmail
        if (!prefs.isPaired || userEmail.isNullOrBlank()) {
            Toast.makeText(activity, "먼저 상단에서 시트봇 계정 연동을 완료해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val folderName = when (sheetType) {
            "RECORDING" -> prefs.callRecordingDriveFolder
            "FILE_UPLOAD" -> prefs.fileUploadDriveFolder
            "RECEIPT" -> "[SheetBot] 영수증 보관함"
            "BUSINESS_CARD" -> "[SheetBot] 명함 보관함"
            else -> null
        }

        val progressDialog = AlertDialog.Builder(activity)
            .setTitle("📊 구글 스프레드시트 대장 준비 중")
            .setMessage("구글 드라이브에서 '${defaultTitle}'을(를) 확인하고 있습니다...\n\n준비되는 즉시 자동으로 열립니다. 잠시만 기다려주세요.")
            .setCancelable(true)
            .setNegativeButton("닫기") { dialog, _ ->
                dialog.dismiss()
            }
            .create()
        progressDialog.show()

        scope.launch {
            try {
                val result = kotlinx.coroutines.withTimeoutOrNull(45_000L) {
                    ApiClient.provisionSheet(
                        userEmail = userEmail,
                        sheetType = sheetType,
                        sheetTitle = defaultTitle,
                        folderName = folderName
                    )
                }

                withContext(Dispatchers.Main) {
                    if (progressDialog.isShowing) {
                        progressDialog.dismiss()
                    }

                    if (result == null) {
                        val fallbackId = when (sheetType.uppercase()) {
                            "RECEIPT" -> if (userEmail.equals("chachogreat@gmail.com", ignoreCase = true)) "14t6C-90zNNN-NTXexP37fMOKX85gP9iTe3MIlM83RC4" else null
                            "BUSINESS_CARD" -> if (userEmail.equals("chachogreat@gmail.com", ignoreCase = true)) "1GPMcTd7hxU2-ORZ32OX7Qz0tOnxMDNtSPqwKzqiS_AI" else null
                            else -> null
                        }
                        if (fallbackId != null) {
                            val fallbackUrl = "https://docs.google.com/spreadsheets/d/$fallbackId/edit"
                            prefs.setSheetId(sheetType, fallbackId)
                            prefs.setSheetUrl(sheetType, fallbackUrl)
                            Toast.makeText(activity, "대장 시트로 바로 연결합니다.", Toast.LENGTH_SHORT).show()
                            if (isWebApp) {
                                openExternalUrl("https://sheetbot.cloud/m/${sheetType.lowercase()}?email=${Uri.encode(userEmail)}&sheetId=${Uri.encode(fallbackId)}")
                            } else {
                                openExternalUrl(fallbackUrl)
                            }
                            return@withContext
                        }
                        Toast.makeText(activity, "시트 연결 요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", Toast.LENGTH_LONG).show()
                        return@withContext
                    }

                    if (result.success && !result.spreadsheetUrl.isNullOrBlank()) {
                        prefs.setSheetUrl(sheetType, result.spreadsheetUrl)
                        if (!result.spreadsheetId.isNullOrBlank()) {
                            prefs.setSheetId(sheetType, result.spreadsheetId)
                        }
                        if (!result.folderUrl.isNullOrBlank()) {
                            prefs.setFolderUrl(sheetType, result.folderUrl)
                        }

                        Toast.makeText(activity, "🎉 대장 시트가 준비되었습니다!", Toast.LENGTH_SHORT).show()

                        if (isWebApp) {
                            val sid = result.spreadsheetId ?: prefs.getSheetId(sheetType)
                            val webAppUrl = if (!sid.isNullOrBlank()) {
                                "https://sheetbot.cloud/m/${sheetType.lowercase()}?email=${Uri.encode(userEmail)}&sheetId=${Uri.encode(sid)}"
                            } else {
                                "https://sheetbot.cloud/m/${sheetType.lowercase()}?email=${Uri.encode(userEmail)}"
                            }
                            openExternalUrl(webAppUrl)
                        } else {
                            openExternalUrl(result.spreadsheetUrl)
                        }
                    } else {
                        val errMsg = result.error ?: result.message ?: "구글 시트 대장을 연결할 수 없습니다."
                        AlertDialog.Builder(activity)
                            .setTitle("⚠️ 대장 시트 연결 실패")
                            .setMessage("구글 스프레드시트를 준비하는 중 오류가 발생했습니다.\n\n원인: $errMsg\n\n구글 계정 연동 상태를 확인해 주세요.")
                            .setPositiveButton("확인", null)
                            .show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    if (progressDialog.isShowing) {
                        progressDialog.dismiss()
                    }
                    Toast.makeText(activity, "통신 오류가 발생했습니다: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    fun openExternalUrl(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            activity.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(activity, "브라우저를 열 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    fun openDriveFolder(sheetType: String, defaultFolderName: String) {
        val cachedFolderUrl = prefs.getFolderUrl(sheetType)
        if (!cachedFolderUrl.isNullOrBlank()) {
            openExternalUrl(cachedFolderUrl)
            return
        }

        val userEmail = prefs.userEmail
        if (!prefs.isPaired || userEmail.isNullOrBlank()) {
            val fallbackUrl = "https://drive.google.com/drive/search?q=${Uri.encode(defaultFolderName)}"
            openExternalUrl(fallbackUrl)
            return
        }

        val progressDialog = AlertDialog.Builder(activity)
            .setTitle("📁 구글 드라이브 폴더 확인 중")
            .setMessage("구글 드라이브에서 '${defaultFolderName}' 폴더를 확인하고 있습니다...\n\n준비되는 즉시 자동으로 열립니다.")
            .setCancelable(false)
            .create()
        progressDialog.show()

        scope.launch {
            try {
                val result = ApiClient.provisionSheet(
                    userEmail = userEmail,
                    sheetType = sheetType,
                    sheetTitle = "[SheetBot] $defaultFolderName 대장",
                    folderName = defaultFolderName
                )
                withContext(Dispatchers.Main) {
                    if (progressDialog.isShowing) {
                        progressDialog.dismiss()
                    }
                    if (result.success && !result.folderUrl.isNullOrBlank()) {
                        prefs.setFolderUrl(sheetType, result.folderUrl)
                        if (!result.spreadsheetUrl.isNullOrBlank()) {
                            prefs.setSheetUrl(sheetType, result.spreadsheetUrl)
                        }
                        if (!result.spreadsheetId.isNullOrBlank()) {
                            prefs.setSheetId(sheetType, result.spreadsheetId)
                        }
                        openExternalUrl(result.folderUrl)
                    } else {
                        val fallbackUrl = "https://drive.google.com/drive/search?q=${Uri.encode(defaultFolderName)}"
                        openExternalUrl(fallbackUrl)
                    }
                }
            } catch (_: Exception) {
                withContext(Dispatchers.Main) {
                    if (progressDialog.isShowing) {
                        progressDialog.dismiss()
                    }
                    val fallbackUrl = "https://drive.google.com/drive/search?q=${Uri.encode(defaultFolderName)}"
                    openExternalUrl(fallbackUrl)
                }
            }
        }
    }
}
