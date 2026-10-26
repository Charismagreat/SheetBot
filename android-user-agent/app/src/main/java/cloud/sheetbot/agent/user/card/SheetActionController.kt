package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.FileToSheetClient
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
        // ⚡ 파일투시트(FileToSheet) 목적지 모드이고 휴대폰 번호가 연동된 경우 ensure-sheet API로 시트 자동 프로비저닝
        if (prefs.isDestinationFileToSheet && !prefs.ftsPhoneNumber.isNullOrBlank()) {
            val phone = prefs.ftsPhoneNumber!!
            val spec = FileToSheetClient.resolveSheetSpec(sheetType)
            if (spec != null) {
                scope.launch {
                    try {
                        val ftsRes = FileToSheetClient.ensureSheet(
                            phoneNumber = phone,
                            cardId = spec.cardId,
                            sheetName = spec.sheetName,
                            headers = spec.headers,
                            projectId = prefs.ftsProjectId
                        )
                        if (ftsRes.success && !ftsRes.token.isNullOrBlank()) {
                            prefs.saveFtsSheetBinding(
                                cardIdOrType = spec.cardId,
                                token = ftsRes.token,
                                sheetName = ftsRes.sheetName ?: spec.sheetName,
                                webhookUrl = ftsRes.webhookUrl,
                                projectId = ftsRes.projectId
                            )
                            val sName = ftsRes.sheetName ?: spec.sheetName
                            val statusPrefix = if (ftsRes.isNew) "🎉 새 파일투시트 생성 완료" else "✅ 기존 파일투시트 연결 확인"
                            Toast.makeText(activity, "⚡ [$sName]\n$statusPrefix", Toast.LENGTH_SHORT).show()
                            addLogItem("FTS 대장 준비", "[$sName] 시트 프로비저닝 완료", true)
                        }
                    } catch (e: Exception) {
                        android.util.Log.w("SheetActionController", "FTS ensure-sheet 통신 예외: ${e.message}")
                    }
                }
            }
            return
        }

        val userEmail = prefs.userEmail
        if (!prefs.isPaired || userEmail.isNullOrBlank() || userEmail.endsWith("@filetosheet.cloud")) {
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
     * @param force true 전달 시 캐시 존재 여부와 무관하게 서버 바인딩 시트 URL로 강제 동기화 (계정 전환/재페어링 시 필수)
     */
    fun preloadActiveSheetUrls(force: Boolean = false) {
        try {
            // 🌟 파일투시트(FileToSheet) 모드: 사전 일괄 생성(Preload) 전면 차단!
            // 각 카드의 [시트 열기] 또는 실제 데이터 전송 시점에만 순수 온디맨드(On-demand) 1:1로 시트를 생성/연결합니다.
            if (prefs.isDestinationFileToSheet) {
                android.util.Log.d("SheetActionController", "FTS 모드는 순수 온디맨드 1:1 시트 생성을 유지하므로 preload를 건너뜁니다.")
                return
            }

            val userEmail = prefs.userEmail
            if (!prefs.isPaired || userEmail.isNullOrBlank() || userEmail.endsWith("@filetosheet.cloud")) return

            scope.launch(Dispatchers.IO) {
                try {
                    val targets = mutableListOf<Triple<String, String, String?>>()
                    if (prefs.isSmsSheetSyncEnabled && (force || prefs.getSheetUrl("SMS").isNullOrBlank())) {
                        targets.add(Triple("SMS", prefs.smsDriveSheetTitle, null))
                    }
                    if (prefs.isKakaoSheetSyncEnabled && (force || prefs.getSheetUrl("KAKAO").isNullOrBlank())) {
                        targets.add(Triple("KAKAO", prefs.kakaoDriveSheetTitle, null))
                    }
                    if (prefs.isMissedCallAutoReplyEnabled && (force || prefs.getSheetUrl("MISSED_CALL").isNullOrBlank())) {
                        targets.add(Triple("MISSED_CALL", prefs.missedCallDriveSheetTitle, null))
                    }
                    if (prefs.isCallRecordingSyncEnabled && (force || prefs.getSheetUrl("RECORDING").isNullOrBlank())) {
                        targets.add(Triple("RECORDING", "[SheetBot] 통화 녹음 대장", prefs.callRecordingDriveFolder))
                    }
                    if (prefs.isFileUploadSyncEnabled && (force || prefs.getSheetUrl("FILE_UPLOAD").isNullOrBlank())) {
                        targets.add(Triple("FILE_UPLOAD", "[SheetBot] 파일 업로드 대장", prefs.fileUploadDriveFolder))
                    }
                    if (prefs.isLinkScrapEnabled && (force || prefs.getSheetUrl("LINK_BOOKMARK").isNullOrBlank())) {
                        targets.add(Triple("LINK_BOOKMARK", prefs.linkScrapDriveSheetTitle, null))
                    }
                    if (prefs.isCallEndedCardPromptEnabled && (force || prefs.getSheetUrl("CALL_ENDED_CARD").isNullOrBlank())) {
                        targets.add(Triple("CALL_ENDED_CARD", "[SheetBot] 모바일 명함 발송 대장", null))
                    }
                    if (prefs.isPushDetectionEnabled && (force || prefs.getSheetUrl("PAYMENT_PUSH").isNullOrBlank())) {
                        targets.add(Triple("PAYMENT_PUSH", "[SheetBot] 매장 결제 및 매출 대장", null))
                    }
                    if (prefs.isReceiptSmsEnabled && (force || prefs.getSheetUrl("RECEIPT_SMS").isNullOrBlank())) {
                        targets.add(Triple("RECEIPT_SMS", "[SheetBot] 고객 영수증 문자 발송 대장", null))
                    }
                    if (prefs.isWebsiteMonitorEnabled && (force || prefs.getSheetUrl("WEBSITE_MONITOR").isNullOrBlank())) {
                        targets.add(Triple("WEBSITE_MONITOR", "[SheetBot] 웹사이트 모니터링 & 장애 대장", null))
                    }
                    val quoteUrl = prefs.getSheetUrl("QUOTE")
                    if (prefs.isQuoteSheetSyncEnabled && (force || quoteUrl.isNullOrBlank() || quoteUrl.contains("1feIe5"))) {
                        targets.add(Triple("QUOTE", prefs.quoteDriveSheetTitle, null))
                    }
                    if (force || prefs.getSheetUrl("RECEIPT").isNullOrBlank()) {
                        targets.add(Triple("RECEIPT", prefs.receiptDriveSheetTitle, "[SheetBot] 영수증 보관함"))
                    }
                    if (force || prefs.getSheetUrl("BUSINESS_CARD").isNullOrBlank()) {
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
     * 구글 시트 원본 vs 모바일 스마트 웹앱 vs 파일투시트(File to Sheet) 선택 다이얼로그 (v2.4.12)
     * - 3가지 옵션을 제공하여 구글 시트 원본, 모바일 웹앱, 파일투시트 자동 프로비저닝/열기를 모두 지원
     */
    fun showOpenSheetChooserDialog(sheetType: String, defaultTitle: String) {
        val items = arrayOf(
            "📊 구글 스프레드시트 원본 (실시간 드라이브 연동)",
            "🌐 모바일 스마트 웹앱 (모바일 최적화)",
            "⚡ 파일투시트 (File to Sheet) 웹 대장 열기"
        )

        AlertDialog.Builder(activity)
            .setTitle(defaultTitle)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> openSheetWithProgress(sheetType, defaultTitle, isWebApp = false)
                    1 -> openSheetWithProgress(sheetType, defaultTitle, isWebApp = true)
                    2 -> openFtsSheetWithProgress(sheetType, defaultTitle)
                }
            }
            .setNegativeButton("닫기", null)
            .show()
    }

    /**
     * ⚡ 파일투시트(File to Sheet) 시트 자동 프로비저닝(POST /api/inbox/ensure-sheet) 후 웹 대장 즉시 열기
     */
    fun openFtsSheetWithProgress(sheetType: String, defaultTitle: String) {
        val existingPhone = prefs.ftsPhoneNumber?.replace("[^0-9]".toRegex(), "").orEmpty()
        if (existingPhone.length < 10) {
            val input = android.widget.EditText(activity).apply {
                hint = "010-0000-0000"
                inputType = android.text.InputType.TYPE_CLASS_PHONE
                setPadding(45, 35, 45, 35)
            }
            AlertDialog.Builder(activity)
                .setTitle("⚡ 파일투시트(File to Sheet) 대장 연결")
                .setMessage("'${defaultTitle}' 시트를 파일투시트에서 자동 생성 및 연결하기 위해 휴대폰 번호를 입력해 주세요.")
                .setView(input)
                .setPositiveButton("대장 생성 및 열기") { _, _ ->
                    val cleanPhone = input.text.toString().replace("[^0-9]".toRegex(), "")
                    if (cleanPhone.length < 10 || !cleanPhone.startsWith("010")) {
                        Toast.makeText(activity, "올바른 010 휴대폰 번호를 입력해 주세요.", Toast.LENGTH_SHORT).show()
                        return@setPositiveButton
                    }
                    prefs.ftsPhoneNumber = cleanPhone
                    executeEnsureAndOpenFtsSheet(cleanPhone, sheetType, defaultTitle)
                }
                .setNegativeButton("취소", null)
                .show()
            return
        }

        executeEnsureAndOpenFtsSheet(existingPhone, sheetType, defaultTitle)
    }

    private fun executeEnsureAndOpenFtsSheet(phoneNumber: String, sheetType: String, defaultTitle: String) {
        val spec = FileToSheetClient.resolveSheetSpec(sheetType)
        val cleanDefaultName = defaultTitle.replace("[SheetBot]", "").trim().ifBlank { "기본시트" }
        val targetCardId = spec?.cardId ?: FileToSheetClient.resolveCanonicalCardId(sheetType)
        val targetSheetName = spec?.sheetName ?: cleanDefaultName
        val targetHeaders = spec?.headers

        val progressDialog = AlertDialog.Builder(activity)
            .setTitle("⚡ 파일투시트 대장 준비 중")
            .setMessage("파일투시트(file2sheet.cloud)에서 '${targetSheetName}' 시트를 확인 및 생성하고 있습니다...\n\n준비되는 즉시 자동으로 열립니다.")
            .setCancelable(true)
            .setNegativeButton("닫기") { dialog, _ ->
                dialog.dismiss()
            }
            .create()
        progressDialog.show()

        scope.launch {
            try {
                val ftsRes = FileToSheetClient.ensureSheet(
                    phoneNumber = phoneNumber,
                    cardId = targetCardId,
                    sheetName = targetSheetName,
                    headers = targetHeaders,
                    projectId = prefs.ftsProjectId
                )

                withContext(Dispatchers.Main) {
                    if (progressDialog.isShowing) {
                        progressDialog.dismiss()
                    }

                    if (ftsRes.success && !ftsRes.token.isNullOrBlank()) {
                        val finalSheetName = ftsRes.sheetName ?: targetSheetName
                        prefs.saveFtsSheetBinding(
                            cardIdOrType = targetCardId,
                            token = ftsRes.token,
                            sheetName = finalSheetName,
                            webhookUrl = ftsRes.webhookUrl,
                            projectId = ftsRes.projectId
                        )
                        if (!ftsRes.projectName.isNullOrBlank()) {
                            prefs.ftsProjectName = ftsRes.projectName
                        }
                        prefs.uploadDestination = AppPreferences.DESTINATION_FILE_TO_SHEET
                        prefs.isPaired = true
                        if (prefs.userEmail.isNullOrBlank()) {
                            prefs.userEmail = "fts_${phoneNumber.takeLast(4)}@filetosheet.cloud"
                        }

                        val statusPrefix = if (ftsRes.isNew) "🎉 새 파일투시트 생성 완료!" else "✅ 파일투시트 대장 연결 완료!"
                        Toast.makeText(activity, "$statusPrefix [$finalSheetName]", Toast.LENGTH_SHORT).show()
                        addLogItem("⚡ FTS 대장", "[$finalSheetName] 시트 열기", true)

                        val ftsWebUrl = buildString {
                            append(FileToSheetClient.FTS_OFFICIAL_DOMAIN)
                            append("/?token=")
                            append(Uri.encode(ftsRes.token))
                            append("&phone=")
                            append(Uri.encode(phoneNumber))
                            if (!ftsRes.projectId.isNullOrBlank()) {
                                append("&projectId=")
                                append(Uri.encode(ftsRes.projectId))
                            }
                            append("&sheet=")
                            append(Uri.encode(finalSheetName))
                        }
                        openExternalUrl(ftsWebUrl)
                    } else {
                        val errMsg = ftsRes.error ?: "파일투시트 서버와 연결할 수 없습니다."
                        AlertDialog.Builder(activity)
                            .setTitle("⚠️ 파일투시트 대장 연결 실패")
                            .setMessage("파일투시트 시트를 준비하는 중 오류가 발생했습니다.\n\n원인: $errMsg")
                            .setPositiveButton("확인", null)
                            .show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    if (progressDialog.isShowing) {
                        progressDialog.dismiss()
                    }
                    Toast.makeText(activity, "파일투시트 통신 오류: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /**
     * 구글 시트의 활성(휴지통 제외) 상태를 확인하고 즉시 자동으로 열어줌 (v2.2.9)
     */
    fun openSheetWithProgress(sheetType: String, defaultTitle: String, isWebApp: Boolean) {
        val userEmail = prefs.userEmail
        if (!prefs.isPaired || userEmail.isNullOrBlank() || userEmail.endsWith("@filetosheet.cloud")) {
            Toast.makeText(activity, "구글 시트 연동을 위해 상단에서 구글 계정(시트봇) 로그인을 먼저 완료해 주세요.", Toast.LENGTH_LONG).show()
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
