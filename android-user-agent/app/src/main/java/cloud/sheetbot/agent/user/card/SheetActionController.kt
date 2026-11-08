package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
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
 * - 2개 섹터(파일투시트 연동 대장 vs 시트봇 모바일 구글 대장) 분리 선택 다이얼로그 (v2.4.25)
 * - 시트 최초 연결 시 프로그레스 다이얼로그 표시 및 백그라운드 확인 즉시 자동 열기
 * - 구글 드라이브 지정 폴더 열기 (캐시 우선 및 폴더 선제 생성 자동 안내)
 * - 활성화된 전체 업무 대장 URL 백그라운드 사전 캐싱 (Preload)
 */
class SheetActionController(
    private val activity: AppCompatActivity,
    private val prefs: AppPreferences,
    private val scope: CoroutineScope,
    private val addLogItem: (title: String, detail: String, success: Boolean) -> Unit,
    private val onRequestFtsLogin: (() -> Unit)? = null,
    private val onRequestGoogleLogin: (() -> Unit)? = null
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
                    if (prefs.isSaasOtpRelayEnabled && (force || prefs.getSheetUrl("SAAS_OTP_RELAY").isNullOrBlank())) {
                        targets.add(Triple("SAAS_OTP_RELAY", "[SheetBot] SaaS 인증발송 대장", null))
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
     * ⚡ 섹터 1 (파일투시트 로그인 사용자 대장 3종) vs 🤖 섹터 2 (시트봇 모바일 구글 로그인 사용자 대장 2종)
     * 2개 섹터 분리 다이얼로그 (v2.4.25)
     * - 두 곳 모두 로그인된 사용자는 2개 섹터 모두 활성화 표시
     * - 한 곳만 로그인된 사용자는 미로그인 섹터를 비활성화(흐리게)하고 섹터 하단에 로그인 안내 버튼 노출
     */
    fun showOpenSheetChooserDialog(sheetType: String, defaultTitle: String) {
        val isFtsLoggedIn = prefs.isFtsPaired || !prefs.ftsPhoneNumber.isNullOrBlank()
        val isGoogleLoggedIn = prefs.hasGoogleAccount

        val spec = FileToSheetClient.resolveSheetSpec(sheetType)
        val cleanDefaultName = defaultTitle.replace("[SheetBot]", "").trim().ifBlank { "기본시트" }
        val ftsSheetDisplayName = spec?.sheetName ?: cleanDefaultName

        val scrollView = ScrollView(activity).apply {
            isFillViewport = true
        }
        val rootLayout = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            val padH = dp(18)
            val padV = dp(14)
            setPadding(padH, padV, padH, dp(6))
        }
        scrollView.addView(rootLayout)

        var dialogRef: AlertDialog? = null

        // =========================================================================
        // 1️⃣ 섹터 1: 파일투시트 (File to Sheet) 로그인 사용자 대장
        // =========================================================================
        val ftsSectorCard = createSectorCard(isActive = isFtsLoggedIn, activeBorderColor = "#93C5FD", activeBgColor = "#F8FAFC")
        val ftsStatusText = if (isFtsLoggedIn) {
            val phoneBadge = prefs.ftsPhoneNumber?.takeIf { it.isNotBlank() } ?: (prefs.ftsProjectName ?: "연동됨")
            "로그인됨 ($phoneBadge)"
        } else {
            "미로그인 (비활성)"
        }
        ftsSectorCard.addView(
            createSectorHeader(
                title = "⚡ 파일투시트 (File to Sheet) 연동 대장",
                statusBadge = ftsStatusText,
                isActive = isFtsLoggedIn,
                badgeTextColor = if (isFtsLoggedIn) "#1D4ED8" else "#64748B",
                badgeBgColor = if (isFtsLoggedIn) "#DBEAFE" else "#E2E8F0"
            )
        )

        val ftsGoogleStatusSubtitle = TextView(activity).apply {
            text = if (isFtsLoggedIn) {
                "파일투시트 [$ftsSheetDisplayName] 연결 구글 시트 확인 중..."
            } else {
                "파일투시트 로그인 후 이용할 수 있습니다."
            }
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
            setTextColor(Color.parseColor("#64748B"))
            setPadding(dp(2), dp(2), dp(2), dp(8))
        }
        ftsSectorCard.addView(ftsGoogleStatusSubtitle)

        // (1-1) 파일투시트 웹 대장 열기
        val btnFtsWeb = createOptionItemView(
            icon = "⚡",
            title = "파일투시트 웹 대장 열기",
            subtitle = "File to Sheet [$ftsSheetDisplayName] 웹 화면 열기",
            enabled = isFtsLoggedIn,
            accentColor = "#2563EB"
        ) {
            dialogRef?.dismiss()
            openFtsSheetWithProgress(sheetType, defaultTitle, targetMode = FtsOpenMode.FTS_WEB)
        }
        ftsSectorCard.addView(btnFtsWeb)

        // (1-2) 파일투시트에 연결된 구글시트 열기
        val (btnFtsGoogleSheet, subFtsGoogleSheet) = createOptionItemViewWithSubtitleRef(
            icon = "📊",
            title = "파일투시트에 연결된 구글 시트",
            subtitle = if (isFtsLoggedIn) "[$ftsSheetDisplayName] 시트에 연동된 Google 스프레드시트 원본" else "파일투시트 시트와 연동된 구글 시트 열기",
            enabled = isFtsLoggedIn,
            accentColor = "#059669"
        ) {
            dialogRef?.dismiss()
            openFtsSheetWithProgress(sheetType, defaultTitle, targetMode = FtsOpenMode.FTS_LINKED_GOOGLE_SHEET)
        }
        ftsSectorCard.addView(btnFtsGoogleSheet)

        // (1-3) 파일투시트에 연결된 구글시트의 웹앱 열기
        val (btnFtsGoogleWebApp, subFtsGoogleWebApp) = createOptionItemViewWithSubtitleRef(
            icon = "🌐",
            title = "파일투시트에 연결된 구글 시트의 웹앱",
            subtitle = if (isFtsLoggedIn) "[$ftsSheetDisplayName] 연동 구글 시트를 모바일 웹앱으로 보기" else "파일투시트 연동 구글 시트의 모바일 최적화 웹앱",
            enabled = isFtsLoggedIn,
            accentColor = "#0D9488"
        ) {
            dialogRef?.dismiss()
            openFtsSheetWithProgress(sheetType, defaultTitle, targetMode = FtsOpenMode.FTS_LINKED_GOOGLE_WEBAPP)
        }
        ftsSectorCard.addView(btnFtsGoogleWebApp)

        if (!isFtsLoggedIn) {
            ftsSectorCard.addView(
                createLoginActionButton(
                    text = "📱 휴대폰 번호로 파일투시트 1초 로그인하기",
                    bgColor = "#2563EB"
                ) {
                    dialogRef?.dismiss()
                    if (onRequestFtsLogin != null) {
                        onRequestFtsLogin.invoke()
                    } else {
                        openFtsSheetWithProgress(sheetType, defaultTitle, targetMode = FtsOpenMode.FTS_WEB)
                    }
                }
            )
        }
        rootLayout.addView(ftsSectorCard)

        // 섹터 간 간격
        rootLayout.addView(View(activity).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(12))
        })

        // =========================================================================
        // 2️⃣ 섹터 2: 시트봇 모바일 (SheetBot Google Drive) 로그인 사용자 대장
        // =========================================================================
        val sbSectorCard = createSectorCard(isActive = isGoogleLoggedIn, activeBorderColor = "#6EE7B7", activeBgColor = "#F8FAFC")
        val sbStatusText = if (isGoogleLoggedIn) {
            "로그인됨 (${prefs.userEmail})"
        } else {
            "미로그인 (비활성)"
        }
        sbSectorCard.addView(
            createSectorHeader(
                title = "🤖 시트봇 모바일 로그인 사용자 대장",
                statusBadge = sbStatusText,
                isActive = isGoogleLoggedIn,
                badgeTextColor = if (isGoogleLoggedIn) "#047857" else "#64748B",
                badgeBgColor = if (isGoogleLoggedIn) "#D1FAE5" else "#E2E8F0"
            )
        )

        val sbSubtitle = TextView(activity).apply {
            text = if (isGoogleLoggedIn) {
                "내 구글 드라이브의 '$defaultTitle' 전용 시트"
            } else {
                "시트봇 Google 계정 로그인 후 이용할 수 있습니다."
            }
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
            setTextColor(Color.parseColor("#64748B"))
            setPadding(dp(2), dp(2), dp(2), dp(8))
        }
        sbSectorCard.addView(sbSubtitle)

        // (2-1) 시트봇 구글 시트 원본 열기
        val btnSbGoogleSheet = createOptionItemView(
            icon = "📊",
            title = "구글 시트 열기 (실시간 드라이브 연동)",
            subtitle = "시트봇 계정의 Google 스프레드시트 원본 열기",
            enabled = isGoogleLoggedIn,
            accentColor = "#059669"
        ) {
            dialogRef?.dismiss()
            openSheetWithProgress(sheetType, defaultTitle, isWebApp = false)
        }
        sbSectorCard.addView(btnSbGoogleSheet)

        // (2-2) 시트봇 구글 시트의 웹앱 열기
        val btnSbWebApp = createOptionItemView(
            icon = "🌐",
            title = "구글 시트의 모바일 스마트 웹앱 열기",
            subtitle = "시트봇 구글 시트를 모바일 최적화 웹앱으로 열기",
            enabled = isGoogleLoggedIn,
            accentColor = "#0D9488"
        ) {
            dialogRef?.dismiss()
            openSheetWithProgress(sheetType, defaultTitle, isWebApp = true)
        }
        sbSectorCard.addView(btnSbWebApp)

        if (!isGoogleLoggedIn) {
            sbSectorCard.addView(
                createLoginActionButton(
                    text = "🔑 Google 계정으로 시트봇 로그인하기",
                    bgColor = "#059669"
                ) {
                    dialogRef?.dismiss()
                    if (onRequestGoogleLogin != null) {
                        onRequestGoogleLogin.invoke()
                    } else {
                        Toast.makeText(activity, "상단 계정 연동 카드에서 Google 로그인을 진행해 주세요.", Toast.LENGTH_LONG).show()
                    }
                }
            )
        } else if (prefs.visitorSessionId.isNullOrBlank() && !prefs.userEmail.equals("chachogreat@gmail.com", ignoreCase = true)) {
            sbSectorCard.addView(
                createLoginActionButton(
                    text = "🔐 내 구글 드라이브 시트 생성 권한 연결하기",
                    bgColor = "#059669"
                ) {
                    dialogRef?.dismiss()
                    val oauthUrl = "https://sheetbot.cloud/api/user/agent2/google-oauth/start?email=${Uri.encode(prefs.userEmail ?: "")}"
                    openExternalUrl(oauthUrl)
                }
            )
        }
        rootLayout.addView(sbSectorCard)

        val dialog = AlertDialog.Builder(activity)
            .setTitle("📂 $defaultTitle 열기")
            .setView(scrollView)
            .setNegativeButton("닫기", null)
            .create()
        dialogRef = dialog
        dialog.show()

        // ⚡ 파일투시트에 로그인된 상태라면 백그라운드에서 해당 시트에 연결된 구글 시트 유무를 즉시 조회하여 UI에 실시간 반영
        if (isFtsLoggedIn) {
            val phone = prefs.ftsPhoneNumber?.replace("[^0-9]".toRegex(), "").orEmpty()
            val targetCardId = spec?.cardId ?: FileToSheetClient.resolveCanonicalCardId(sheetType)
            scope.launch {
                try {
                    val ftsRes = if (phone.length >= 10) {
                        FileToSheetClient.ensureSheet(
                            phoneNumber = phone,
                            cardId = targetCardId,
                            sheetName = ftsSheetDisplayName,
                            headers = spec?.headers,
                            projectId = prefs.ftsProjectId
                        )
                    } else null

                    withContext(Dispatchers.Main) {
                        if (!dialog.isShowing || ftsRes == null || !ftsRes.success) return@withContext
                        val hasLinkedGoogle = !ftsRes.googleSheetUrl.isNullOrBlank() || !ftsRes.googleSheetId.isNullOrBlank()
                        if (hasLinkedGoogle) {
                            val tabLabel = ftsRes.googleSheetTab?.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: ""
                            ftsGoogleStatusSubtitle.text = "✅ 파일투시트 [${ftsRes.sheetName ?: ftsSheetDisplayName}]에 구글 시트가 연결되어 있습니다."
                            ftsGoogleStatusSubtitle.setTextColor(Color.parseColor("#047857"))
                            subFtsGoogleSheet.text = "연결됨$tabLabel · 터치하여 Google 스프레드시트 열기"
                            subFtsGoogleWebApp.text = "연결됨$tabLabel · 터치하여 모바일 웹앱으로 열기"
                        } else {
                            ftsGoogleStatusSubtitle.text = "ℹ️ 파일투시트 [${ftsRes.sheetName ?: ftsSheetDisplayName}] 시트는 준비됨 (연결된 구글 시트 없음)"
                            subFtsGoogleSheet.text = "미연결 · 파일투시트 웹에서 구글 시트를 먼저 연결해 주세요"
                            subFtsGoogleWebApp.text = "미연결 · 파일투시트 웹에서 구글 시트를 먼저 연결해 주세요"
                        }
                    }
                } catch (_: Exception) {}
            }
        }
    }

    enum class FtsOpenMode {
        FTS_WEB,
        FTS_LINKED_GOOGLE_SHEET,
        FTS_LINKED_GOOGLE_WEBAPP
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            activity.resources.displayMetrics
        ).toInt()
    }

    private fun createSectorCard(isActive: Boolean, activeBorderColor: String, activeBgColor: String): LinearLayout {
        return LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            val pad = dp(12)
            setPadding(pad, pad, pad, pad)
            background = GradientDrawable().apply {
                cornerRadius = dp(12).toFloat()
                setColor(Color.parseColor(if (isActive) activeBgColor else "#F1F5F9"))
                setStroke(dp(1), Color.parseColor(if (isActive) activeBorderColor else "#CBD5E1"))
            }
        }
    }

    private fun createSectorHeader(
        title: String,
        statusBadge: String,
        isActive: Boolean,
        badgeTextColor: String,
        badgeBgColor: String
    ): LinearLayout {
        return LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(2), dp(2), dp(2), dp(4))

            val titleTv = TextView(activity).apply {
                text = title
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Color.parseColor(if (isActive) "#0F172A" else "#64748B"))
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            val badgeTv = TextView(activity).apply {
                text = statusBadge
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Color.parseColor(badgeTextColor))
                setPadding(dp(8), dp(3), dp(8), dp(3))
                background = GradientDrawable().apply {
                    cornerRadius = dp(99).toFloat()
                    setColor(Color.parseColor(badgeBgColor))
                }
            }
            addView(titleTv)
            addView(badgeTv)
        }
    }

    private fun createOptionItemView(
        icon: String,
        title: String,
        subtitle: String,
        enabled: Boolean,
        accentColor: String,
        onClick: () -> Unit
    ): View {
        return createOptionItemViewWithSubtitleRef(icon, title, subtitle, enabled, accentColor, onClick).first
    }

    private fun createOptionItemViewWithSubtitleRef(
        icon: String,
        title: String,
        subtitle: String,
        enabled: Boolean,
        accentColor: String,
        onClick: () -> Unit
    ): Pair<View, TextView> {
        val itemLayout = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(11), dp(10), dp(11), dp(10))
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = dp(6)
            layoutParams = lp
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor(if (enabled) "#FFFFFF" else "#E2E8F0"))
                setStroke(dp(1), Color.parseColor(if (enabled) "#E2E8F0" else "#CBD5E1"))
            }
            alpha = if (enabled) 1.0f else 0.55f
            isClickable = enabled
            isFocusable = enabled
            if (enabled) {
                setOnClickListener { onClick() }
            }
        }

        val iconTv = TextView(activity).apply {
            text = icon
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            setPadding(0, 0, dp(10), 0)
        }

        val textContainer = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val titleTv = TextView(activity).apply {
            text = title
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.parseColor(if (enabled) "#1E293B" else "#64748B"))
        }

        val subTv = TextView(activity).apply {
            text = subtitle
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            setTextColor(Color.parseColor("#64748B"))
        }

        textContainer.addView(titleTv)
        textContainer.addView(subTv)

        val arrowTv = TextView(activity).apply {
            text = if (enabled) "열기 ›" else "잠김"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.parseColor(if (enabled) accentColor else "#94A3B8"))
            setPadding(dp(8), 0, 0, 0)
        }

        itemLayout.addView(iconTv)
        itemLayout.addView(textContainer)
        itemLayout.addView(arrowTv)

        return Pair(itemLayout, subTv)
    }

    private fun createLoginActionButton(
        text: String,
        bgColor: String,
        onClick: () -> Unit
    ): TextView {
        return TextView(activity).apply {
            this.text = text
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = dp(10)
            layoutParams = lp
            background = GradientDrawable().apply {
                cornerRadius = dp(9).toFloat()
                setColor(Color.parseColor(bgColor))
            }
            setOnClickListener { onClick() }
        }
    }

    /**
     * ⚡ 파일투시트(File to Sheet) 시트 자동 프로비저닝(POST /api/inbox/ensure-sheet) 후
     * 요청된 모드(파투시트 웹 대장 / 파투시트에 연결된 구글 시트 / 파투시트에 연결된 구글 시트의 웹앱)로 열기
     */
    fun openFtsSheetWithProgress(
        sheetType: String,
        defaultTitle: String,
        targetMode: FtsOpenMode = FtsOpenMode.FTS_WEB
    ) {
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
                    executeEnsureAndOpenFtsSheet(cleanPhone, sheetType, defaultTitle, targetMode)
                }
                .setNegativeButton("취소", null)
                .show()
            return
        }

        executeEnsureAndOpenFtsSheet(existingPhone, sheetType, defaultTitle, targetMode)
    }

    private fun executeEnsureAndOpenFtsSheet(
        phoneNumber: String,
        sheetType: String,
        defaultTitle: String,
        targetMode: FtsOpenMode = FtsOpenMode.FTS_WEB
    ) {
        val spec = FileToSheetClient.resolveSheetSpec(sheetType)
        val cleanDefaultName = defaultTitle.replace("[SheetBot]", "").trim().ifBlank { "기본시트" }
        val targetCardId = spec?.cardId ?: FileToSheetClient.resolveCanonicalCardId(sheetType)
        val targetSheetName = spec?.sheetName ?: cleanDefaultName
        val targetHeaders = spec?.headers

        val progressDialog = AlertDialog.Builder(activity)
            .setTitle("⚡ 파일투시트 대장 준비 중")
            .setMessage("파일투시트(file2sheet.cloud)에서 '${targetSheetName}' 시트 및 연결 정보를 확인하고 있습니다...\n\n준비되는 즉시 자동으로 열립니다.")
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

                        when (targetMode) {
                            FtsOpenMode.FTS_WEB -> {
                                val statusPrefix = if (ftsRes.isNew) "🎉 새 파일투시트 생성 완료!" else "✅ 파일투시트 대장 연결 완료!"
                                Toast.makeText(activity, "$statusPrefix [$finalSheetName]", Toast.LENGTH_SHORT).show()
                                addLogItem("⚡ FTS 대장", "[$finalSheetName] 시트 열기", true)
                                openExternalUrl(ftsWebUrl)
                            }
                            FtsOpenMode.FTS_LINKED_GOOGLE_SHEET -> {
                                val gUrl = ftsRes.googleSheetUrl
                                    ?: ftsRes.googleSheetId?.takeIf { it.isNotBlank() }?.let { "https://docs.google.com/spreadsheets/d/$it/edit" }
                                if (!gUrl.isNullOrBlank()) {
                                    Toast.makeText(activity, "📊 파일투시트 [$finalSheetName]에 연결된 구글 시트를 엽니다.", Toast.LENGTH_SHORT).show()
                                    addLogItem("📊 FTS 구글시트", "[$finalSheetName] 연동 구글 시트 열기", true)
                                    openExternalUrl(gUrl)
                                } else {
                                    showNoLinkedGoogleSheetDialog(finalSheetName, ftsWebUrl)
                                }
                            }
                            FtsOpenMode.FTS_LINKED_GOOGLE_WEBAPP -> {
                                val gId = ftsRes.googleSheetId
                                    ?: ftsRes.googleSheetUrl?.let { extractSpreadsheetIdFromUrl(it) }
                                if (!gId.isNullOrBlank()) {
                                    val emailParam = prefs.userEmail ?: "fts_${phoneNumber.takeLast(4)}@filetosheet.cloud"
                                    val webAppUrl = "https://sheetbot.cloud/m/${sheetType.lowercase()}?email=${Uri.encode(emailParam)}&sheetId=${Uri.encode(gId)}"
                                    Toast.makeText(activity, "🌐 파일투시트 [$finalSheetName] 연동 구글 시트의 웹앱을 엽니다.", Toast.LENGTH_SHORT).show()
                                    addLogItem("🌐 FTS 웹앱", "[$finalSheetName] 연동 구글 시트 웹앱 열기", true)
                                    openExternalUrl(webAppUrl)
                                } else {
                                    showNoLinkedGoogleSheetDialog(finalSheetName, ftsWebUrl)
                                }
                            }
                        }
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

    private fun extractSpreadsheetIdFromUrl(url: String): String? {
        val regex = Regex("/spreadsheets/d/([a-zA-Z0-9-_]+)")
        return regex.find(url)?.groupValues?.getOrNull(1)
    }

    private fun showNoLinkedGoogleSheetDialog(sheetName: String, ftsWebUrl: String) {
        AlertDialog.Builder(activity)
            .setTitle("ℹ️ 연결된 구글 시트 없음")
            .setMessage("파일투시트의 [$sheetName] 시트에 아직 연결된 Google 스프레드시트가 없습니다.\n\n먼저 파일투시트 웹 대장을 열어 구글 시트를 연동하시겠습니까?")
            .setPositiveButton("⚡ 파일투시트 웹 대장 열기") { _, _ ->
                openExternalUrl(ftsWebUrl)
            }
            .setNegativeButton("닫기", null)
            .show()
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
                        val isOAuthRequired = result.errorCode == "GOOGLE_OAUTH_REQUIRED" ||
                            errMsg.contains("GOOGLE_OAUTH_REQUIRED") ||
                            errMsg.contains("권한 동의")
                        if (isOAuthRequired) {
                            val oauthUrl = result.oauthUrl?.takeIf { it.isNotBlank() }
                                ?: "https://sheetbot.cloud/api/user/agent2/google-oauth/start?email=${Uri.encode(userEmail)}"
                            AlertDialog.Builder(activity)
                                .setTitle("🔐 Google 드라이브 시트 권한 필요")
                                .setMessage("본인($userEmail)의 구글 드라이브에 전용 시트를 생성하려면 Google 드라이브/시트 접근 권한 동의(1회)가 필요합니다.\n\n아래 버튼을 눌러 권한 동의를 완료하면 자동으로 앱으로 돌아옵니다.")
                                .setPositiveButton("🔑 Google 권한 동의하기") { _, _ ->
                                    openExternalUrl(oauthUrl)
                                }
                                .setNegativeButton("닫기", null)
                                .show()
                        } else {
                            AlertDialog.Builder(activity)
                                .setTitle("⚠️ 대장 시트 연결 실패")
                                .setMessage("구글 스프레드시트를 준비하는 중 오류가 발생했습니다.\n\n원인: $errMsg\n\n구글 계정 연동 상태를 확인해 주세요.")
                                .setPositiveButton("확인", null)
                                .show()
                        }
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
