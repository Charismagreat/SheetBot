package cloud.sheetbot.agent.user.card

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.provider.OpenableColumns
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.MarketplaceCardItemDto
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.R
import cloud.sheetbot.agent.user.TtsManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * ⚡ 무중단 OTA 동적 카드 엔진 및 렌더러 (DynamicCardController)
 *
 * - 시트봇 사이트(또는 안티그라비티)에서 등록한 카드 설계도(Manifest JSON)를 기반으로
 *   APK 업데이트 없이 네이티브 카드 UI를 런타임에 동적 조립·마운트합니다.
 * - 카메라 촬영 및 갤러리 파일 첨부 시 1600px 지능형 리사이즈 및 85% JPEG 압축 표준을 준수합니다.
 * - 시트 자동 생성(Provisioning), AI 판독 실행(/api/cards/dynamic/execute), 시트 열기, 보관함 이동을 100% 지원합니다.
 */
class DynamicCardController(
    private val activity: Activity,
    private val prefs: PreferencesManager,
    private val scope: CoroutineScope,
    private val launchers: ActivityLauncherRegistry?,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onProvisionSheet: (sheetType: String, defaultTitle: String, folderName: String?) -> Unit,
    private val onAddLogItem: (title: String, detail: String, success: Boolean) -> Unit,
    private val onHideCardRequested: (cardKey: String, cardTitle: String) -> Unit
) {
    private val attachedFilesMap = mutableMapOf<String, File>()
    private val attachedFileNamesMap = mutableMapOf<String, String>()

    init {
        instance = this
    }

    /**
     * 설치된 모든 동적 카드를 메인 ScrollView 내부 LinearLayout에 마운트 또는 갱신
     */
    fun mountAllInstalledDynamicCards() {
        val mainScrollView = activity.findViewById<ScrollView>(R.id.mainScrollView) ?: return
        val parentLayout = mainScrollView.getChildAt(0) as? LinearLayout ?: return
        val installedCards = prefs.getInstalledDynamicCards()
        val hiddenKeys = prefs.hiddenCardKeys

        // 삭제된 동적 카드 뷰 정리
        val toRemove = mutableListOf<View>()
        for (i in 0 until parentLayout.childCount) {
            val child = parentLayout.getChildAt(i)
            val tagStr = child?.tag as? String ?: continue
            if (tagStr.startsWith(TAG_PREFIX)) {
                val key = tagStr.removePrefix(TAG_PREFIX)
                if (installedCards.none { it.key == key }) {
                    toRemove.add(child)
                }
            }
        }
        toRemove.forEach { parentLayout.removeView(it) }

        // 설치된 동적 카드 마운트
        installedCards.forEach { card ->
            val tag = "$TAG_PREFIX${card.key}"
            var existingView = parentLayout.findViewWithTag<View>(tag)
            if (existingView == null) {
                existingView = buildDynamicCardView(card)
                val drawerBox = activity.findViewById<View>(R.id.cardDrawerBox)
                val anchorView = if (drawerBox != null && parentLayout.indexOfChild(drawerBox) != -1) {
                    drawerBox
                } else {
                    drawerBox?.parent as? View
                }
                val insertIdx = if (anchorView != null) parentLayout.indexOfChild(anchorView) else -1
                if (insertIdx != -1) {
                    parentLayout.addView(existingView, insertIdx)
                } else {
                    parentLayout.addView(existingView)
                }
            }
            existingView.visibility = if (hiddenKeys.contains(card.key)) View.GONE else View.VISIBLE
        }
    }

    /**
     * 개별 동적 카드의 네이티브 View 트리 조립
     */
    private fun buildDynamicCardView(card: MarketplaceCardItemDto): View {
        val density = activity.resources.displayMetrics.density
        val dp = { v: Int -> (v * density).toInt() }

        val manifestObj = try {
            if (!card.manifestJson.isNullOrBlank()) JSONObject(card.manifestJson) else JSONObject()
        } catch (_: Exception) {
            JSONObject()
        }

        val sheetSpecObj = manifestObj.optJSONObject("sheetSpec")
        val sheetTitle = sheetSpecObj?.optString("sheetName")?.takeIf { it.isNotBlank() }
            ?: "[SheetBot] ${card.title} 대장"
        val folderName = sheetSpecObj?.optString("folderName")?.takeIf { it.isNotBlank() }
            ?: "[SheetBot] ${card.title} 보관함"
        val sheetBindingType = "DYNAMIC_${card.key.uppercase()}"
        val submitBtnLabel = manifestObj.optString("submitButtonText").takeIf { it.isNotBlank() }
            ?: "🚀 AI 판독 및 시트 기록"

        val cardRoot = LinearLayout(activity).apply {
            tag = "$TAG_PREFIX${card.key}"
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(R.drawable.bg_card_scenario)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dp(10)
            }
        }

        // 1. 카드 헤더 (아이콘 + 제목 + 배지 + 스위치 + 접기/펼치기 버튼)
        val headerLayout = LinearLayout(activity).apply {
            tag = "$HEADER_TAG_PREFIX${card.key}"
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val titleTv = TextView(activity).apply {
            text = "${card.icon} ${card.title}"
            setTextColor(Color.parseColor("#F8FAFC"))
            textSize = 13.5f
            setTypeface(null, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerLayout.addView(titleTv)

        if (!card.badge.isNullOrBlank()) {
            val badgeTv = TextView(activity).apply {
                text = card.badge
                setTextColor(Color.parseColor("#38BDF8"))
                textSize = 9.5f
                setTypeface(null, Typeface.BOLD)
                setBackgroundResource(R.drawable.bg_badge_version)
                backgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#0F172A"))
                setPadding(dp(6), dp(2), dp(6), dp(2))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = dp(6)
                }
            }
            headerLayout.addView(badgeTv)
        }

        val bodyContainer = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dp(10)
            }
        }

        val toggleBtn = TextView(activity).apply {
            val isCollapsed = prefs.isDynamicCardCollapsed(card.key)
            text = if (isCollapsed) "▼" else "▲"
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 12f
            setPadding(dp(8), dp(4), dp(4), dp(4))
        }

        val enableSwitch = Switch(activity).apply {
            isChecked = prefs.isDynamicCardEnabled(card.key)
            setOnCheckedChangeListener { _, isChecked ->
                prefs.setDynamicCardEnabled(card.key, isChecked)
                prefs.setDynamicCardCollapsed(card.key, !isChecked)
                bodyContainer.visibility = if (isChecked) View.VISIBLE else View.GONE
                toggleBtn.text = if (isChecked) "▲" else "▼"
                if (isChecked) {
                    onProvisionSheet(sheetBindingType, sheetTitle, folderName)
                }
            }
        }
        headerLayout.addView(enableSwitch)
        headerLayout.addView(toggleBtn)

        val toggleCollapse = {
            val nextCollapsed = !prefs.isDynamicCardCollapsed(card.key)
            prefs.setDynamicCardCollapsed(card.key, nextCollapsed)
            bodyContainer.visibility = if (nextCollapsed) View.GONE else View.VISIBLE
            toggleBtn.text = if (nextCollapsed) "▼" else "▲"
        }
        headerLayout.setOnClickListener { toggleCollapse() }
        toggleBtn.setOnClickListener { toggleCollapse() }

        val longClickHide = View.OnLongClickListener {
            onHideCardRequested(card.key, card.title)
            true
        }
        headerLayout.setOnLongClickListener(longClickHide)
        cardRoot.setOnLongClickListener(longClickHide)

        cardRoot.addView(headerLayout)

        // 초기 접기 상태 반영
        bodyContainer.visibility = if (prefs.isDynamicCardCollapsed(card.key)) View.GONE else View.VISIBLE

        // 2. 카드 상세 설명
        if (card.description.isNotBlank()) {
            val descTv = TextView(activity).apply {
                text = card.description
                setTextColor(Color.parseColor("#94A3B8"))
                textSize = 11.5f
                setLineSpacing(dp(2).toFloat(), 1f)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dp(10)
                }
            }
            bodyContainer.addView(descTv)
        }

        // 3. 동적 입력 폼 (Manifest inputs 파싱)
        val inputsArray = manifestObj.optJSONArray("inputs")
        val textInputsMap = mutableMapOf<String, EditText>()
        var hasFileOrImageInput = false
        var fileInputLabel = "📷 사진 촬영 / 파일 첨부"

        if (inputsArray != null && inputsArray.length() > 0) {
            for (i in 0 until inputsArray.length()) {
                val inp = inputsArray.optJSONObject(i) ?: continue
                val inpKey = inp.optString("key", "field_$i")
                val inpLabel = inp.optString("label", inpKey)
                val inpType = inp.optString("type", "TEXT").uppercase()
                val inpPlaceholder = inp.optString("placeholder", "내용을 입력하세요")

                if (inpType == "IMAGE" || inpType == "FILE" || inpType.contains("CAMERA")) {
                    hasFileOrImageInput = true
                    fileInputLabel = inpLabel
                } else {
                    val fieldLabel = TextView(activity).apply {
                        text = inpLabel
                        setTextColor(Color.parseColor("#CBD5E1"))
                        textSize = 11f
                        setTypeface(null, Typeface.BOLD)
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply {
                            bottomMargin = dp(4)
                        }
                    }
                    bodyContainer.addView(fieldLabel)

                    val editText = EditText(activity).apply {
                        hint = inpPlaceholder
                        setHintTextColor(Color.parseColor("#64748B"))
                        setTextColor(Color.parseColor("#F8FAFC"))
                        textSize = 12f
                        inputType = when (inpType) {
                            "NUMBER" -> InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
                            "PHONE" -> InputType.TYPE_CLASS_PHONE
                            else -> InputType.TYPE_CLASS_TEXT
                        }
                        val gd = GradientDrawable().apply {
                            setColor(Color.parseColor("#0F172A"))
                            cornerRadius = dp(8).toFloat()
                            setStroke(dp(1), Color.parseColor("#334155"))
                        }
                        background = gd
                        setPadding(dp(10), dp(8), dp(10), dp(8))
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply {
                            bottomMargin = dp(8)
                        }
                    }
                    textInputsMap[inpKey] = editText
                    bodyContainer.addView(editText)
                }
            }
        } else {
            // 기본 입력 필드 (사진 첨부 + 메모)
            hasFileOrImageInput = true
            val defaultEt = EditText(activity).apply {
                hint = "${card.title} 관련 메모 또는 AI 요청사항 입력 (선택)"
                setHintTextColor(Color.parseColor("#64748B"))
                setTextColor(Color.parseColor("#F8FAFC"))
                textSize = 12f
                val gd = GradientDrawable().apply {
                    setColor(Color.parseColor("#0F172A"))
                    cornerRadius = dp(8).toFloat()
                    setStroke(dp(1), Color.parseColor("#334155"))
                }
                background = gd
                setPadding(dp(10), dp(8), dp(10), dp(8))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dp(8)
                }
            }
            textInputsMap["memo"] = defaultEt
            bodyContainer.addView(defaultEt)
        }

        // 4. 사진 촬영 / 갤러리 첨부 영역 (1600px 85% JPEG 압축 적용)
        val attachedChipLayout = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            visibility = View.GONE
            val gd = GradientDrawable().apply {
                setColor(Color.parseColor("#064E3B"))
                cornerRadius = dp(6).toFloat()
            }
            background = gd
            setPadding(dp(10), dp(6), dp(10), dp(6))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dp(8)
            }
        }
        val tvAttachedName = TextView(activity).apply {
            text = "첨부된 파일 없음"
            setTextColor(Color.parseColor("#A7F3D0"))
            textSize = 11f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val btnRemoveFile = TextView(activity).apply {
            text = "✕ 제거"
            setTextColor(Color.parseColor("#FCA5A5"))
            textSize = 11f
            setTypeface(null, Typeface.BOLD)
            setPadding(dp(6), dp(2), dp(6), dp(2))
            setOnClickListener {
                attachedFilesMap.remove(card.key)
                attachedFileNamesMap.remove(card.key)
                attachedChipLayout.visibility = View.GONE
            }
        }
        attachedChipLayout.addView(tvAttachedName)
        attachedChipLayout.addView(btnRemoveFile)

        if (hasFileOrImageInput) {
            val fileBtnRow = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dp(8)
                }
            }

            val btnCamera = Button(activity).apply {
                text = "📷 카메라 촬영"
                setTextColor(Color.parseColor("#E2E8F0"))
                textSize = 11.5f
                val gd = GradientDrawable().apply {
                    setColor(Color.parseColor("#1E293B"))
                    cornerRadius = dp(8).toFloat()
                    setStroke(dp(1), Color.parseColor("#475569"))
                }
                background = gd
                layoutParams = LinearLayout.LayoutParams(0, dp(38), 1f).apply {
                    marginEnd = dp(6)
                }
                setOnClickListener {
                    if (launchers == null) return@setOnClickListener
                    launchers.onDynamicCardCameraBitmap = { bitmap ->
                        compressBitmapToTempFile(card.key, bitmap) { file, fileName ->
                            attachedFilesMap[card.key] = file
                            attachedFileNamesMap[card.key] = fileName
                            tvAttachedName.text = "📎 $fileName (${file.length() / 1024}KB)"
                            attachedChipLayout.visibility = View.VISIBLE
                        }
                    }
                    try {
                        launchers.dynamicCardCameraLauncher.launch(null)
                    } catch (e: Exception) {
                        Toast.makeText(activity, "카메라 실행 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }

            val btnGallery = Button(activity).apply {
                text = fileInputLabel
                setTextColor(Color.parseColor("#E2E8F0"))
                textSize = 11.5f
                val gd = GradientDrawable().apply {
                    setColor(Color.parseColor("#1E293B"))
                    cornerRadius = dp(8).toFloat()
                    setStroke(dp(1), Color.parseColor("#475569"))
                }
                background = gd
                layoutParams = LinearLayout.LayoutParams(0, dp(38), 1.3f)
                setOnClickListener {
                    if (launchers == null) return@setOnClickListener
                    launchers.onDynamicCardFilePicked = { uri ->
                        compressUriToTempFile(card.key, uri) { file, fileName ->
                            attachedFilesMap[card.key] = file
                            attachedFileNamesMap[card.key] = fileName
                            tvAttachedName.text = "📎 $fileName (${file.length() / 1024}KB)"
                            attachedChipLayout.visibility = View.VISIBLE
                        }
                    }
                    try {
                        launchers.dynamicCardFilePickerLauncher.launch("image/*")
                    } catch (e: Exception) {
                        Toast.makeText(activity, "갤러리 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }

            fileBtnRow.addView(btnCamera)
            fileBtnRow.addView(btnGallery)
            bodyContainer.addView(fileBtnRow)
            bodyContainer.addView(attachedChipLayout)
        }

        // 5. 결과 표시 박스
        val tvResultBox = TextView(activity).apply {
            visibility = View.GONE
            setTextColor(Color.parseColor("#A7F3D0"))
            textSize = 11.5f
            val gd = GradientDrawable().apply {
                setColor(Color.parseColor("#0F172A"))
                cornerRadius = dp(8).toFloat()
                setStroke(dp(1), Color.parseColor("#059669"))
            }
            background = gd
            setPadding(dp(10), dp(8), dp(10), dp(8))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dp(8)
            }
        }
        bodyContainer.addView(tvResultBox)

        // 6. 실행 버튼 & [📊 시트 열기] 버튼 행
        val actionRow = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val btnExecute = Button(activity).apply {
            text = submitBtnLabel
            setTextColor(Color.parseColor("#FFFFFF"))
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            val gd = GradientDrawable().apply {
                setColor(Color.parseColor("#0284C7"))
                cornerRadius = dp(8).toFloat()
            }
            background = gd
            layoutParams = LinearLayout.LayoutParams(0, dp(40), 1.6f).apply {
                marginEnd = dp(6)
            }
        }

        val btnOpenSheet = Button(activity).apply {
            text = "📊 시트 열기"
            setTextColor(Color.parseColor("#38BDF8"))
            textSize = 11.5f
            setTypeface(null, Typeface.BOLD)
            val gd = GradientDrawable().apply {
                setColor(Color.parseColor("#0F172A"))
                cornerRadius = dp(8).toFloat()
                setStroke(dp(1), Color.parseColor("#0284C7"))
            }
            background = gd
            layoutParams = LinearLayout.LayoutParams(0, dp(40), 1f)
            setOnClickListener {
                onOpenSheetChooser(sheetBindingType, sheetTitle)
            }
        }

        btnExecute.setOnClickListener {
            val userEmail = prefs.userEmail
            if (userEmail.isNullOrBlank()) {
                Toast.makeText(activity, "⚠️ 먼저 시트봇 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val collectedFields = mutableMapOf<String, String>()
            textInputsMap.forEach { (k, et) ->
                val v = et.text?.toString()?.trim().orEmpty()
                if (v.isNotEmpty()) collectedFields[k] = v
            }
            val attachedFile = attachedFilesMap[card.key]

            if (collectedFields.isEmpty() && attachedFile == null) {
                Toast.makeText(activity, "사진/파일을 첨부하거나 내용을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            btnExecute.isEnabled = false
            btnExecute.text = "⏳ AI 분석 및 기록 중..."
            tvResultBox.visibility = View.VISIBLE
            tvResultBox.text = "🚀 시트봇 AI가 데이터를 분석하여 '$sheetTitle'에 기록하고 있습니다..."

            scope.launch {
                val res = ApiClient.executeDynamicCard(
                    userEmail = userEmail,
                    cardKey = card.key,
                    cardTitle = card.title,
                    manifestJson = card.manifestJson,
                    fields = collectedFields,
                    attachedFile = attachedFile
                )

                withContext(Dispatchers.Main) {
                    btnExecute.isEnabled = true
                    btnExecute.text = submitBtnLabel

                    if (res.success) {
                        tvResultBox.text = "✅ ${res.summary}\n${res.message}"
                        Toast.makeText(activity, res.message, Toast.LENGTH_LONG).show()
                        onAddLogItem(card.title, res.summary, true)

                        if (prefs.isTtsEnabled) {
                            TtsManager.speak(activity, "${card.title} 시트 기록이 완료되었습니다.")
                        }

                        // 입력창 및 첨부파일 초기화
                        textInputsMap.values.forEach { it.setText("") }
                        attachedFilesMap.remove(card.key)
                        attachedFileNamesMap.remove(card.key)
                        attachedChipLayout.visibility = View.GONE
                    } else {
                        tvResultBox.text = "⚠️ 처리 실패: ${res.error}"
                        Toast.makeText(activity, "오류: ${res.error}", Toast.LENGTH_LONG).show()
                        onAddLogItem("${card.title} 오류", res.error ?: "실패", false)
                    }
                }
            }
        }

        actionRow.addView(btnExecute)
        actionRow.addView(btnOpenSheet)
        bodyContainer.addView(actionRow)

        cardRoot.addView(bodyContainer)
        return cardRoot
    }

    /**
     * 1600px 지능형 리사이즈 및 85% JPEG 압축 (카메라 Bitmap)
     */
    private fun compressBitmapToTempFile(
        cardKey: String,
        bitmap: Bitmap,
        onReady: (File, String) -> Unit
    ) {
        scope.launch(Dispatchers.IO) {
            try {
                val maxDim = 1600
                val w = bitmap.width
                val h = bitmap.height
                val scaled = if (w > maxDim || h > maxDim) {
                    val ratio = maxDim.toFloat() / maxOf(w, h).toFloat()
                    Bitmap.createScaledBitmap(bitmap, (w * ratio).toInt(), (h * ratio).toInt(), true)
                } else {
                    bitmap
                }

                val fileName = "${cardKey}_${System.currentTimeMillis()}.jpg"
                val outFile = File(activity.cacheDir, fileName)
                FileOutputStream(outFile).use { fos ->
                    scaled.compress(Bitmap.CompressFormat.JPEG, 85, fos)
                }
                withContext(Dispatchers.Main) {
                    onReady(outFile, fileName)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(activity, "이미지 압축 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * 1600px 지능형 샘플링 리사이즈 및 85% JPEG 압축 (갤러리 Uri)
     */
    private fun compressUriToTempFile(
        cardKey: String,
        uri: Uri,
        onReady: (File, String) -> Unit
    ) {
        scope.launch(Dispatchers.IO) {
            try {
                var displayName = "${cardKey}_${System.currentTimeMillis()}.jpg"
                activity.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (idx != -1) {
                            displayName = cursor.getString(idx) ?: displayName
                        }
                    }
                }

                val boundsOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                activity.contentResolver.openInputStream(uri)?.use {
                    BitmapFactory.decodeStream(it, null, boundsOpts)
                }

                val maxDimension = 1600
                var inSampleSize = 1
                val origW = boundsOpts.outWidth
                val origH = boundsOpts.outHeight
                if (origW > maxDimension || origH > maxDimension) {
                    val halfW = origW / 2
                    val halfH = origH / 2
                    while ((halfW / inSampleSize) >= maxDimension && (halfH / inSampleSize) >= maxDimension) {
                        inSampleSize *= 2
                    }
                }

                val decodeOpts = BitmapFactory.Options().apply { this.inSampleSize = inSampleSize }
                val decoded = activity.contentResolver.openInputStream(uri)?.use {
                    BitmapFactory.decodeStream(it, null, decodeOpts)
                }

                if (decoded == null) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(activity, "이미지를 읽을 수 없습니다.", Toast.LENGTH_SHORT).show()
                    }
                    return@launch
                }

                val scaleFactor = maxDimension.toFloat() / maxOf(decoded.width, decoded.height).toFloat()
                val finalBitmap = if (scaleFactor < 1.0f) {
                    Bitmap.createScaledBitmap(
                        decoded,
                        (decoded.width * scaleFactor).toInt().coerceAtLeast(1),
                        (decoded.height * scaleFactor).toInt().coerceAtLeast(1),
                        true
                    )
                } else {
                    decoded
                }

                val safeName = displayName.replace(Regex("[^a-zA-Z0-9가-힣._-]"), "_")
                val outFile = File(activity.cacheDir, "dyn_${System.currentTimeMillis()}_$safeName.jpg")
                FileOutputStream(outFile).use { fos ->
                    finalBitmap.compress(Bitmap.CompressFormat.JPEG, 85, fos)
                }

                withContext(Dispatchers.Main) {
                    onReady(outFile, displayName)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(activity, "파일 처리 오류: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    companion object {
        const val TAG_PREFIX = "dynamic_card_"
        const val HEADER_TAG_PREFIX = "dynamic_card_header_"

        var instance: DynamicCardController? = null

        /**
         * 🛠️ 사용자가 앱 내에서 AI 자연어 프롬프트 또는 안티그라비티 JSON 설계도로
         * '나만의 카드'를 즉시 생성하고 홈 화면에 설치하는 다이얼로그
         */
        fun openCreateCustomCardDialog(
            activity: Activity,
            prefs: PreferencesManager,
            scope: CoroutineScope,
            onCardInstalled: (MarketplaceCardItemDto) -> Unit
        ) {
            val density = activity.resources.displayMetrics.density
            val dp = { v: Int -> (v * density).toInt() }

            val container = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(16), dp(20), dp(8))
            }

            val guideTv = TextView(activity).apply {
                text = "원하시는 업무 기능을 자연어로 설명하시거나, 안티그라비티(Antigravity)가 생성한 카드 설계도(JSON)를 붙여넣으시면 앱 업데이트 없이 내 폰에 즉시 카드가 생성됩니다."
                setTextColor(Color.parseColor("#475569"))
                textSize = 12f
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dp(12)
                }
            }
            container.addView(guideTv)

            val etPrompt = EditText(activity).apply {
                hint = "예: 차량 계기판 사진을 찍으면 주행거리, 출발지, 목적지를 읽어서 '차량운행일지' 시트에 기록하는 카드 만들어줘"
                textSize = 12.5f
                minLines = 3
                gravity = Gravity.TOP or Gravity.START
                setPadding(dp(10), dp(10), dp(10), dp(10))
            }
            container.addView(etPrompt)

            val etJson = EditText(activity).apply {
                hint = "(선택) 안티그라비티 카드 설계도 JSON 직접 붙여넣기"
                textSize = 11f
                minLines = 2
                gravity = Gravity.TOP or Gravity.START
                setPadding(dp(10), dp(8), dp(10), dp(8))
            }
            container.addView(etJson)

            AlertDialog.Builder(activity)
                .setTitle("⚡ AI 나만의 맞춤 카드 만들기")
                .setView(container)
                .setPositiveButton("🚀 카드 생성 및 즉시 설치") { _, _ ->
                    val promptText = etPrompt.text?.toString()?.trim().orEmpty()
                    val rawJson = etJson.text?.toString()?.trim().orEmpty()

                    if (promptText.isEmpty() && rawJson.isEmpty()) {
                        Toast.makeText(activity, "원하시는 카드 설명이나 설계도 JSON을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                        return@setPositiveButton
                    }

                    val userEmail = prefs.userEmail ?: "guest@sheetbot.cloud"
                    Toast.makeText(activity, "🤖 시트봇 AI가 맞춤 카드를 설계하고 있습니다 (약 3초)...", Toast.LENGTH_LONG).show()

                    scope.launch {
                        val res = ApiClient.createCustomCard(
                            userEmail = userEmail,
                            prompt = promptText.ifEmpty { "나만의 맞춤 자동화 카드" },
                            manifestJson = rawJson.takeIf { it.startsWith("{") }
                        )
                        withContext(Dispatchers.Main) {
                            if (res.success && res.card != null) {
                                prefs.saveInstalledDynamicCard(res.card)
                                onCardInstalled(res.card)
                                Toast.makeText(
                                    activity,
                                    "🎉 '${res.card.title}' 카드가 홈 화면에 즉시 설치되었습니다!",
                                    Toast.LENGTH_LONG
                                ).show()
                            } else {
                                Toast.makeText(
                                    activity,
                                    "카드 생성 실패: ${res.error ?: "네트워크 오류"}",
                                    Toast.LENGTH_LONG
                                ).show()
                            }
                        }
                    }
                }
                .setNegativeButton("취소", null)
                .show()
        }
    }
}
