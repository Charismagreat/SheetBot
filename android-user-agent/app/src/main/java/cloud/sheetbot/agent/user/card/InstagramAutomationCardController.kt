package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.view.View
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.CardInstagramAutomationBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * 📸 AI 인스타그램 피드 & 해시태그 카드 전담 컨트롤러
 * - UI 바인딩, 이벤트 리스너, 사진 압축/선택, 인스타 피드/해시태그 생성 API 호출 및 인스타 앱 연동 캡슐화
 */
class InstagramAutomationCardController(
    private val activity: MainActivity,
    private val binding: CardInstagramAutomationBinding,
    private val prefs: PreferencesManager,
    private val onPickImages: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit
) {
    val selectedInstaFiles = mutableListOf<File>()

    private var isCollapsed = false

    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        val toggleInsta = {
            isCollapsed = !isCollapsed
            binding.layoutInstaDetails.visibility = if (isCollapsed) View.GONE else View.VISIBLE
            binding.btnToggleInstaDetails.text = if (isCollapsed) "▼" else "▲"
        }

        binding.layoutInstaHeader.setOnClickListener { toggleInsta() }
        binding.btnToggleInstaDetails.setOnClickListener { toggleInsta() }

        binding.switchInstaAutomation.setOnCheckedChangeListener { _, isChecked ->
            isCollapsed = !isChecked
            binding.layoutInstaDetails.visibility = if (isCollapsed) View.GONE else View.VISIBLE
            binding.btnToggleInstaDetails.text = if (isCollapsed) "▼" else "▲"
            val msg = if (isChecked) "AI 인스타그램 피드 & 해시태그 기능이 켜졌습니다." else "AI 인스타그램 피드 & 해시태그 기능이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
        }

        // 인스타그램 ID 초기값 바인딩 및 저장/바로가기 이벤트
        binding.etInstagramId.setText(prefs.instagramId)
        binding.btnSaveInstagramId.setOnClickListener {
            val id = binding.etInstagramId.text.toString().trim()
            prefs.instagramId = id
            Toast.makeText(
                activity,
                if (id.isNotBlank()) "인스타그램 ID 저장 완료: $id" else "인스타그램 ID가 초기화되었습니다.",
                Toast.LENGTH_SHORT
            ).show()
        }

        binding.btnOpenMyInsta.setOnClickListener {
            val id = binding.etInstagramId.text.toString().trim().ifBlank { prefs.instagramId }
            val cleanHandle = id.replace("^@".toRegex(), "").trim()
            val targetUrl = if (cleanHandle.isNotBlank()) "https://www.instagram.com/$cleanHandle/" else "https://www.instagram.com/"
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)))
            } catch (e: Exception) {
                Toast.makeText(activity, "인스타 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }

        // 사진 선택 및 초기화
        binding.btnSelectInstaImages.setOnClickListener {
            try {
                onPickImages()
            } catch (e: Exception) {
                Toast.makeText(activity, "사진 선택 실패: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnResetInstaImages.setOnClickListener {
            selectedInstaFiles.clear()
            binding.tvInstaSelectedImagesCount.text = "첨부된 사진: 0장 (선택 시 1600px 85% 자동 압축)"
            binding.btnResetInstaImages.visibility = View.GONE
            Toast.makeText(activity, "사진 첨부가 취소되었습니다.", Toast.LENGTH_SHORT).show()
        }

        // 인스타그램 피드 작성 시작
        binding.btnStartInstaAutomation.setOnClickListener {
            startInstaAutomation()
        }

        // 대장 열기 다이얼로그
        binding.btnOpenInstaSheetAlways.setOnClickListener {
            onOpenSheetChooser("INSTAGRAM", "[SheetBot] 인스타그램 마케팅 관리 대장")
        }
    }

    /**
     * 📸 AI 인스타그램 다중 사진 선택 처리 (1600px 리사이즈 및 85% JPEG 압축 표준 준수)
     */
    fun handleImagesSelected(uris: List<Uri>) {
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val processedFiles = mutableListOf<File>()
                for ((index, uri) in uris.withIndex()) {
                    var displayName = "insta_photo_${System.currentTimeMillis()}_${index}.jpg"
                    activity.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                            if (nameIndex != -1) {
                                displayName = cursor.getString(nameIndex) ?: displayName
                            }
                        }
                    }

                    // 1600px 샘플링 디코딩
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
                        val tempFile = File(activity.cacheDir, "insta_${System.currentTimeMillis()}_${index}.jpg")
                        val fos = java.io.FileOutputStream(tempFile)
                        decoded.compress(Bitmap.CompressFormat.JPEG, 85, fos)
                        fos.flush()
                        fos.close()
                        processedFiles.add(tempFile)
                    }
                }

                selectedInstaFiles.clear()
                selectedInstaFiles.addAll(processedFiles)

                val totalKb = selectedInstaFiles.sumOf { it.length() } / 1024

                withContext(Dispatchers.Main) {
                    binding.tvInstaSelectedImagesCount.text = "📷 첨부된 사진: ${selectedInstaFiles.size}장 (${totalKb} KB)"
                    binding.btnResetInstaImages.visibility = if (selectedInstaFiles.isNotEmpty()) View.VISIBLE else View.GONE
                    Toast.makeText(activity, "인스타 사진 ${selectedInstaFiles.size}장 최적화 압축 완료!", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(activity, "사진 처리 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * AI 인스타그램 피드 및 해시태그 생성 요청 및 결과 UI 갱신
     */
    private fun startInstaAutomation() {
        val topic = binding.etInstaTopic.text.toString().trim()
        val keywords = binding.etInstaKeywords.text.toString().trim()
        val tone = binding.etInstaTone.text.toString().trim().ifBlank { "감성 & 친근한 후기" }
        val refUrl1 = binding.etInstaRefUrl1.text.toString().trim()
        val refUrl2 = binding.etInstaRefUrl2.text.toString().trim()
        val refUrl3 = binding.etInstaRefUrl3.text.toString().trim()
        val instagramId = binding.etInstagramId.text.toString().trim().ifBlank { prefs.instagramId }

        if (topic.isBlank()) {
            Toast.makeText(activity, "포스팅 주제를 입력해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val userEmail = prefs.userEmail ?: ""
        if (userEmail.isBlank()) {
            Toast.makeText(activity, "로그인 정보(사용자 이메일)가 없습니다.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.pbInstaLoading.visibility = View.VISIBLE
        binding.tvInstaStatus.visibility = View.VISIBLE
        binding.tvInstaStatus.text = "AI가 인스타그램 훅 카피와 해시태그를 생성 중입니다..."
        binding.btnStartInstaAutomation.isEnabled = false
        binding.layoutInstaResultContainer.visibility = View.GONE

        activity.lifecycleScope.launch {
            try {
                val result = ApiClient.requestInstagramAutomation(
                    topic = topic,
                    keywords = keywords,
                    tone = tone,
                    refUrl1 = refUrl1,
                    refUrl2 = refUrl2,
                    refUrl3 = refUrl3,
                    instagramId = instagramId,
                    files = selectedInstaFiles.toList(),
                    userEmail = userEmail
                )

                binding.pbInstaLoading.visibility = View.GONE
                binding.tvInstaStatus.visibility = View.GONE
                binding.btnStartInstaAutomation.isEnabled = true

                if (result.success) {
                    binding.layoutInstaResultContainer.visibility = View.VISIBLE
                    binding.tvInstaResultHook.text = "✨ ${result.hook}"
                    binding.tvInstaResultCaption.text = result.caption
                    binding.tvInstaResultHashtags.text = result.hashtags

                    if (result.reportUrl.isNotBlank()) {
                        binding.btnOpenInstaViewer.visibility = View.VISIBLE
                        binding.btnOpenInstaViewer.setOnClickListener {
                            try {
                                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(result.reportUrl)))
                            } catch (e: Exception) {
                                Toast.makeText(activity, "피드 뷰어 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    } else {
                        binding.btnOpenInstaViewer.visibility = View.GONE
                    }

                    if (result.sheetUrl.isNotBlank()) {
                        binding.btnOpenInstaSheet.visibility = View.VISIBLE
                        binding.btnOpenInstaSheet.setOnClickListener {
                            try {
                                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(result.sheetUrl)))
                            } catch (e: Exception) {
                                Toast.makeText(activity, "대장 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    } else {
                        binding.btnOpenInstaSheet.visibility = View.GONE
                    }

                    binding.btnOpenInstagramApp.visibility = View.VISIBLE
                    binding.btnOpenInstagramApp.setOnClickListener {
                        try {
                            val launchIntent = activity.packageManager.getLaunchIntentForPackage("com.instagram.android")
                            if (launchIntent != null) {
                                activity.startActivity(launchIntent)
                            } else {
                                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.instagram.com/")))
                            }
                        } catch (e: Exception) {
                            Toast.makeText(activity, "인스타그램 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    }

                    Toast.makeText(activity, "🎉 AI 인스타 피드 및 해시태그 완성!", Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(activity, "생성 실패: ${result.error ?: "오류 발생"}", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                binding.pbInstaLoading.visibility = View.GONE
                binding.tvInstaStatus.visibility = View.GONE
                binding.btnStartInstaAutomation.isEnabled = true
                Toast.makeText(activity, "인스타 피드 처리 오류: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
