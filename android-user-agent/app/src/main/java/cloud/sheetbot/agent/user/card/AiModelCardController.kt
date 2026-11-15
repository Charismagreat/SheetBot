package cloud.sheetbot.agent.user.card

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.view.LayoutInflater
import android.view.View
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.Spinner
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.R
import cloud.sheetbot.agent.user.databinding.CardAiModelBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * 🎭 AI 전속 모델 & 홍보 크리에이터 카드 전담 컨트롤러
 *
 * 1. Model Registry: 회사 전속 모델 페르소나 (얼굴/목소리/스타일) 설정 및 유지
 * 2. 파이프라인 A: 제품 사진 + 대본 -> AI 전속 모델 PPL 합성 및 Veo 3 발화 쇼츠 비디오 자동 생성
 * 3. 파이프라인 B: Gemini Multimodal Live API 저지연 실시간 음성 대화 쇼케이스
 * 4. [SheetBot] AI 홍보 콘텐츠 관리대장 시트 및 드라이브 자동 연동
 */
class AiModelCardController(
    private val activity: MainActivity,
    private val binding: CardAiModelBinding,
    private val prefs: PreferencesManager,
    private val onPickProductImage: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onOpenDriveFolder: (sheetType: String, defaultFolderName: String) -> Unit
) {
    var selectedProductFile: File? = null
        private set

    private var isCollapsed = false
    private var lastGeneratedVideoUrl: String = ""
    private var lastGeneratedSheetUrl: String = ""

    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        val toggleAiModel = {
            isCollapsed = !isCollapsed
            binding.layoutAiModelDetails.visibility = if (isCollapsed) View.GONE else View.VISIBLE
            binding.btnToggleAiModelDetails.text = if (isCollapsed) "▼" else "▲"
        }

        binding.layoutAiModelHeader.setOnClickListener { toggleAiModel() }
        binding.btnToggleAiModelDetails.setOnClickListener { toggleAiModel() }

        binding.switchAiModelAutomation.setOnCheckedChangeListener { _, isChecked ->
            isCollapsed = !isChecked
            binding.layoutAiModelDetails.visibility = if (isCollapsed) View.GONE else View.VISIBLE
            binding.btnToggleAiModelDetails.text = if (isCollapsed) "▼" else "▲"
            val msg = if (isChecked) "AI 전속 모델 & 홍보 크리에이터 카드가 활성화되었습니다." else "AI 전속 모델 카드가 비활성화되었습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
        }

        // 1. 모델 페르소나 UI 초기화
        refreshModelPersonaUi()
        binding.btnManageModelPersona.setOnClickListener {
            showModelPersonaDialog()
        }

        // 2. 파이프라인 A - 제품 사진 선택 및 초기화
        binding.btnSelectProductImage.setOnClickListener {
            try {
                onPickProductImage()
            } catch (e: Exception) {
                Toast.makeText(activity, "사진 선택 실패: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnResetProductImage.setOnClickListener {
            selectedProductFile?.delete()
            selectedProductFile = null
            binding.tvProductImageStatus.text = "선택된 제품 사진: 없음 (1600px 85% 자동 최적화)"
            binding.btnResetProductImage.visibility = View.GONE
            Toast.makeText(activity, "제품 사진 첨부가 취소되었습니다.", Toast.LENGTH_SHORT).show()
        }

        // AI 대본 자동 추천
        binding.btnAiSuggestScript.setOnClickListener {
            suggestScript()
        }

        // 쇼츠 영상 생성 시작
        binding.btnStartAiModelShorts.setOnClickListener {
            startGenerateShorts()
        }

        // 생성 결과 버튼들
        binding.btnPlayVideoResult.setOnClickListener {
            if (lastGeneratedVideoUrl.isNotBlank()) {
                try {
                    activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(lastGeneratedVideoUrl)))
                } catch (e: Exception) {
                    Toast.makeText(activity, "영상 재생 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            } else {
                Toast.makeText(activity, "재생할 영상 URL이 없습니다.", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnOpenSheetResult.setOnClickListener {
            if (lastGeneratedSheetUrl.isNotBlank()) {
                try {
                    activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(lastGeneratedSheetUrl)))
                } catch (_: Exception) {
                    onOpenSheetChooser("AI_MODEL", "[SheetBot] AI 홍보 콘텐츠 관리대장")
                }
            } else {
                onOpenSheetChooser("AI_MODEL", "[SheetBot] AI 홍보 콘텐츠 관리대장")
            }
        }

        binding.btnShareVideoResult.setOnClickListener {
            if (lastGeneratedVideoUrl.isNotBlank()) {
                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_SUBJECT, "AI 전속 모델 홍보 쇼츠 영상")
                    putExtra(Intent.EXTRA_TEXT, "🎬 [SheetBot] AI 전속 모델 홍보 쇼츠 영상이 도착했습니다!\n$lastGeneratedVideoUrl")
                }
                activity.startActivity(Intent.createChooser(shareIntent, "쇼츠 영상 공유"))
            } else {
                Toast.makeText(activity, "공유할 영상 링크가 없습니다.", Toast.LENGTH_SHORT).show()
            }
        }

        // 3. 파이프라인 B: 실시간 전속 모델 쇼케이스 모드
        binding.btnStartLiveDialogue.setOnClickListener {
            showLiveDialogueNoticeDialog()
        }

        // 4. 상시 시트 및 드라이브 열기
        binding.btnOpenAiModelSheetAlways.setOnClickListener {
            onOpenSheetChooser("AI_MODEL", "[SheetBot] AI 홍보 콘텐츠 관리대장")
        }

        binding.btnOpenAiModelDriveAlways.setOnClickListener {
            onOpenDriveFolder("AI_MODEL", "[SheetBot] AI 모델 영상 보관함")
        }
    }

    /**
     * 모델 페르소나 UI 텍스트 갱신
     */
    private fun refreshModelPersonaUi() {
        binding.tvModelName.text = "모델명: ${prefs.aiModelName}"
        binding.tvModelVoice.text = "🎙️ 음성: ${prefs.aiModelVoice}"
        binding.tvModelStyle.text = "👗 스타일: ${prefs.aiModelStyle}"
    }

    /**
     * ⚙️ 다중 모델 레지스트리 (선택, 전환, 추가, 편집) 다이얼로그
     */
    private fun showModelPersonaDialog() {
        val models = prefs.getAiModelList()
        val curModel = prefs.getActiveAiModel()

        val modelNames = models.map { model ->
            if (model.id == curModel.id) "⭐ ${model.name} (${model.voice}) [현재 선택됨]"
            else "${model.name} (${model.voice})"
        }.toTypedArray()

        val actions = modelNames + arrayOf("➕ 새 모델 등록...")

        AlertDialog.Builder(activity)
            .setTitle("🎭 AI 전속 모델 목록 및 전환")
            .setItems(actions) { _, which ->
                if (which < models.size) {
                    val chosen = models[which]
                    prefs.selectedAiModelId = chosen.id
                    refreshModelPersonaUi()
                    Toast.makeText(activity, "[${chosen.name}] 모델로 전환되었습니다.", Toast.LENGTH_SHORT).show()
                } else {
                    showEditOrCreateModelDialog(null)
                }
            }
            .setPositiveButton("현재 모델 수정") { _, _ ->
                showEditOrCreateModelDialog(curModel)
            }
            .setNegativeButton("닫기", null)
            .show()
    }

    /**
     * 신규 모델 등록 또는 기존 모델 수정 다이얼로그
     */
    private fun showEditOrCreateModelDialog(targetModel: cloud.sheetbot.agent.user.AiModelPersona?) {
        val isNew = (targetModel == null)
        val voiceOptions = arrayOf(
            "Kore (밝고 신뢰감 있는 20대 여성)",
            "Aoede (지적이고 차분한 여성)",
            "Leda (친근하고 따뜻한 여성)",
            "Puck (활기차고 경쾌한 남성)",
            "Charon (중후하고 신뢰감 있는 남성)",
            "Fenrir (단단하고 또렷한 남성)"
        )
        val voiceKeys = arrayOf("Kore", "Aoede", "Leda", "Puck", "Charon", "Fenrir")

        val container = android.widget.LinearLayout(activity).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(50, 30, 50, 20)
        }

        val etName = EditText(activity).apply {
            hint = "모델 이름 (예: 지아, 민수, 서연)"
            setText(targetModel?.name ?: "")
        }
        val spinnerVoice = Spinner(activity).apply {
            adapter = ArrayAdapter(activity, android.R.layout.simple_spinner_dropdown_item, voiceOptions)
            val currentVoice = targetModel?.voice ?: "Kore"
            val currentIdx = voiceKeys.indexOfFirst { it.equals(currentVoice, ignoreCase = true) }
            if (currentIdx >= 0) setSelection(currentIdx)
        }
        val etStyle = EditText(activity).apply {
            hint = "외모/스타일 프롬프트 (예: 26-year-old Korean female brand ambassador...)"
            setText(targetModel?.style ?: "")
            minLines = 3
        }

        container.addView(android.widget.TextView(activity).apply { text = "👤 전속 모델 명칭 / 직함"; textSize = 12f })
        container.addView(etName)
        container.addView(android.widget.TextView(activity).apply { text = "🎙️ Gemini TTS 보이스 페르소나"; textSize = 12f; setPadding(0, 16, 0, 4) })
        container.addView(spinnerVoice)
        container.addView(android.widget.TextView(activity).apply { text = "👗 외모·스타일 기준 프롬프트"; textSize = 12f; setPadding(0, 16, 0, 4) })
        container.addView(etStyle)

        val title = if (isNew) "➕ 새 AI 전속 모델 등록" else "⚙️ [${targetModel?.name}] 모델 설정 수정"

        AlertDialog.Builder(activity)
            .setTitle(title)
            .setView(container)
            .setPositiveButton("저장") { _, _ ->
                val newName = etName.text.toString().trim()
                val selectedVoice = voiceKeys.getOrElse(spinnerVoice.selectedItemPosition) { "Kore" }
                val newStyle = etStyle.text.toString().trim()

                if (newName.isBlank()) {
                    Toast.makeText(activity, "모델 이름을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }

                val modelToSave = cloud.sheetbot.agent.user.AiModelPersona(
                    id = targetModel?.id ?: "model_${System.currentTimeMillis()}",
                    name = newName,
                    voice = selectedVoice,
                    style = newStyle.ifBlank { "Professional brand ambassador, warm smile" },
                    avatarPath = targetModel?.avatarPath ?: ""
                )

                prefs.updateAiModel(modelToSave)
                prefs.selectedAiModelId = modelToSave.id
                refreshModelPersonaUi()
                Toast.makeText(activity, "[${newName}] 전속 모델이 저장되었습니다.", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("취소", null)
            .show()
    }

    /**
     * 📷 제품 사진 1600px 리사이즈 및 85% JPEG 압축 처리
     */
    fun handleProductImageSelected(uri: Uri) {
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val boundsOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                activity.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, boundsOpts) }

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
                val decoded = activity.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, decodeOpts) }

                if (decoded != null) {
                    val tempFile = File(activity.cacheDir, "ai_product_${System.currentTimeMillis()}.jpg")
                    FileOutputStream(tempFile).use { fos ->
                        decoded.compress(Bitmap.CompressFormat.JPEG, 85, fos)
                        fos.flush()
                    }
                    selectedProductFile = tempFile

                    val kb = tempFile.length() / 1024
                    withContext(Dispatchers.Main) {
                        binding.tvProductImageStatus.text = "📷 최적화 완료: ${tempFile.name} (${kb} KB)"
                        binding.btnResetProductImage.visibility = View.VISIBLE
                        Toast.makeText(activity, "제품 사진 압축 최적화 완료 (${kb} KB)", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(activity, "사진 처리 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * ✨ AI 홍보 대본 자동 추천
     */
    private fun suggestScript() {
        val topic = binding.etProductTopic.text.toString().trim()
        if (topic.isBlank()) {
            Toast.makeText(activity, "제품명이나 핵심 특징을 먼저 입력해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val userEmail = prefs.userEmail ?: ""
        binding.btnAiSuggestScript.isEnabled = false
        binding.btnAiSuggestScript.text = "작성 중..."

        activity.lifecycleScope.launch {
            try {
                val script = ApiClient.requestAiModelSuggestScript(
                    topic = topic,
                    modelName = prefs.aiModelName,
                    modelVoice = prefs.aiModelVoice,
                    userEmail = userEmail
                )
                if (script.isNotBlank()) {
                    binding.etProductScript.setText(script)
                    Toast.makeText(activity, "AI 홍보 대본이 완성되었습니다!", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(activity, "대본 추천 결과를 가져오지 못했습니다.", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(activity, "대본 추천 오류: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.btnAiSuggestScript.isEnabled = true
                binding.btnAiSuggestScript.text = "✨ AI 대본 추천"
            }
        }
    }

    /**
     * 🚀 파이프라인 A: AI 전속 모델 쇼츠 영상 생성 요청
     */
    private fun startGenerateShorts() {
        val topic = binding.etProductTopic.text.toString().trim()
        val script = binding.etProductScript.text.toString().trim()
        val userEmail = prefs.userEmail ?: ""

        if (topic.isBlank() && script.isBlank()) {
            Toast.makeText(activity, "제품명 또는 홍보 대본을 입력해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }
        if (userEmail.isBlank()) {
            Toast.makeText(activity, "구글 계정 연동(이메일)이 필요합니다.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progressAiModel.visibility = View.VISIBLE
        binding.tvAiModelStatus.visibility = View.VISIBLE
        binding.tvAiModelStatus.text = "🎬 [Veo 3 & Gemini TTS] 전속 모델 쇼츠 영상 생성 중..."
        binding.btnStartAiModelShorts.isEnabled = false

        activity.lifecycleScope.launch {
            try {
                val result = ApiClient.requestAiModelShortsVideo(
                    topic = topic,
                    script = script,
                    modelName = prefs.aiModelName,
                    modelVoice = prefs.aiModelVoice,
                    modelStyle = prefs.aiModelStyle,
                    file = selectedProductFile,
                    userEmail = userEmail
                )

                if (result.success) {
                    lastGeneratedVideoUrl = result.videoUrl
                    lastGeneratedSheetUrl = result.sheetUrl

                    binding.layoutAiModelResultContainer.visibility = View.VISIBLE
                    binding.tvResultVideoTitle.text = "🎬 [${prefs.aiModelName}] 쇼츠 영상 생성 완료!"
                    binding.tvResultScriptPreview.text = "📝 발화 대본: ${result.script}"
                    binding.tvAiModelStatus.text = "✅ 영상 생성 완료! 대장 시트에 자동 등록되었습니다."
                    Toast.makeText(activity, "홍보 쇼츠 영상 제작이 완료되었습니다!", Toast.LENGTH_LONG).show()

                    // ⚡ 파투(FileToSheet) 통합 워크스페이스 대장(AI모델콘텐츠대장) 동시 적재
                    if (prefs.isFtsPaired || !prefs.ftsPhoneNumber.isNullOrBlank()) {
                        activity.lifecycleScope.launch(Dispatchers.IO) {
                            try {
                                val ftsRow = org.json.JSONObject().apply {
                                    put("제작일시", java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.KOREA).format(java.util.Date()))
                                    put("전속모델명", prefs.aiModelName)
                                    put("보이스톤", prefs.aiModelVoice)
                                    put("제품/홍보주제", topic)
                                    put("홍보쇼츠대본", result.script)
                                    put("쇼츠영상링크", result.videoUrl)
                                    put("제품사진링크", result.thumbnailUrl.ifBlank { result.driveFolderUrl })
                                    put("제작상태", "✅ 제작 완료 (Veo 3)")
                                }
                                cloud.sheetbot.agent.user.FileToSheetClient.syncCardRowToFts(
                                    cardIdOrType = "ai_model",
                                    rowData = ftsRow
                                )
                            } catch (e: Exception) {
                                android.util.Log.w("AiModelCardController", "파투 동기화 예외 방어: ${e.message}")
                            }
                        }
                    }
                } else {
                    binding.tvAiModelStatus.text = "⚠️ 생성 실패: ${result.error ?: "알 수 없는 오류"}"
                    Toast.makeText(activity, "영상 생성 실패: ${result.error}", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                binding.tvAiModelStatus.text = "🚨 오류 발생: ${e.message}"
                Toast.makeText(activity, "오류: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.progressAiModel.visibility = View.GONE
                binding.btnStartAiModelShorts.isEnabled = true
            }
        }
    }

    /**
     * 🎙️ 파이프라인 B: 실시간 음성 대화 쇼케이스 안내 다이얼로그
     */
    private fun showLiveDialogueNoticeDialog() {
        AlertDialog.Builder(activity)
            .setTitle("🎙️ AI 전속 모델 실시간 음성 상담 (Live Demo)")
            .setMessage("전속 모델 [${prefs.aiModelName}]과 Gemini Multimodal Live API(WebSocket)로 연결되어 저지연 양방향 음성 대화를 나눕니다.\n\n- 음성 보이스: ${prefs.aiModelVoice}\n- 비디오 엔진: 대기(IDLE) ↔ 발화(TALKING) ↔ 인사(GREETING) 3종 루프 교차 재생\n\n지금 실시간 쇼케이스 세션을 연결하시겠습니까?")
            .setPositiveButton("세션 시작") { _, _ ->
                val liveDemoUrl = "https://sheetbot.cloud/demo/ai-model-live?voice=${prefs.aiModelVoice}&name=${Uri.encode(prefs.aiModelName)}"
                try {
                    activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(liveDemoUrl)))
                } catch (e: Exception) {
                    Toast.makeText(activity, "브라우저 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("닫기", null)
            .show()
    }
}
