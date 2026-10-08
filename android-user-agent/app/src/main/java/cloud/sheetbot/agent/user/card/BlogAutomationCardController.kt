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
import cloud.sheetbot.agent.user.databinding.CardBlogAutomationBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * ✍️ AI 네이버 블로그 자동 포스팅 카드 전담 컨트롤러
 * - UI 바인딩, 이벤트 리스너, 사진 압축/선택, 블로그 원고 생성 API 호출 및 결과 연동 캡슐화
 */
class BlogAutomationCardController(
    private val activity: MainActivity,
    private val binding: CardBlogAutomationBinding,
    private val prefs: PreferencesManager,
    private val onPickImages: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit
) {
    val selectedBlogFiles = mutableListOf<File>()

    private var isCollapsed = false

    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        val toggleBlog = {
            isCollapsed = !isCollapsed
            binding.layoutBlogDetails.visibility = if (isCollapsed) View.GONE else View.VISIBLE
            binding.btnToggleBlogDetails.text = if (isCollapsed) "▼" else "▲"
        }

        binding.layoutBlogHeader.setOnClickListener { toggleBlog() }
        binding.btnToggleBlogDetails.setOnClickListener { toggleBlog() }

        binding.switchBlogAutomation.setOnCheckedChangeListener { _, isChecked ->
            isCollapsed = !isChecked
            binding.layoutBlogDetails.visibility = if (isCollapsed) View.GONE else View.VISIBLE
            binding.btnToggleBlogDetails.text = if (isCollapsed) "▼" else "▲"
            val msg = if (isChecked) "AI 네이버 블로그 자동 포스팅 기능이 켜졌습니다." else "AI 네이버 블로그 자동 포스팅 기능이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
        }

        // 네이버 블로그 ID 초기값 바인딩 및 저장/바로가기 이벤트
        binding.etNaverBlogId.setText(prefs.naverBlogId)
        binding.btnSaveNaverBlogId.setOnClickListener {
            val id = binding.etNaverBlogId.text.toString().trim()
            prefs.naverBlogId = id
            Toast.makeText(
                activity,
                if (id.isNotBlank()) "네이버 블로그 ID 저장 완료: $id" else "네이버 블로그 ID가 초기화되었습니다.",
                Toast.LENGTH_SHORT
            ).show()
        }

        binding.btnOpenMyBlog.setOnClickListener {
            val id = binding.etNaverBlogId.text.toString().trim().ifBlank { prefs.naverBlogId }
            val cleanId = id.replace("^@".toRegex(), "").trim()
            val targetUrl = if (cleanId.isNotBlank()) "https://blog.naver.com/$cleanId" else "https://blog.naver.com"
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)))
            } catch (e: Exception) {
                Toast.makeText(activity, "블로그 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }

        // 사진 선택 및 초기화
        binding.btnSelectBlogImages.setOnClickListener {
            try {
                onPickImages()
            } catch (e: Exception) {
                Toast.makeText(activity, "사진 선택 실패: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnResetBlogImages.setOnClickListener {
            selectedBlogFiles.clear()
            binding.tvBlogSelectedImagesCount.text = "첨부된 사진: 0장 (선택 시 1600px 85% 자동 압축)"
            binding.btnResetBlogImages.visibility = View.GONE
            Toast.makeText(activity, "사진 첨부가 취소되었습니다.", Toast.LENGTH_SHORT).show()
        }

        // 블로그 원고 작성 시작
        binding.btnStartBlogAutomation.setOnClickListener {
            startBlogAutomation()
        }

        // 대장 열기 다이얼로그
        binding.btnOpenBlogSheetAlways.setOnClickListener {
            onOpenSheetChooser("NAVER_BLOG", "[SheetBot] 블로그 마케팅 관리 대장")
        }
    }

    /**
     * ✍️ AI 네이버 블로그 다중 사진 선택 처리 (1600px 리사이즈 및 85% JPEG 압축 표준 준수)
     */
    fun handleImagesSelected(uris: List<Uri>) {
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val processedFiles = mutableListOf<File>()
                for ((index, uri) in uris.withIndex()) {
                    var displayName = "blog_photo_${System.currentTimeMillis()}_${index}.jpg"
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
                        val tempFile = File(activity.cacheDir, "blog_${System.currentTimeMillis()}_${index}.jpg")
                        val fos = java.io.FileOutputStream(tempFile)
                        decoded.compress(Bitmap.CompressFormat.JPEG, 85, fos)
                        fos.flush()
                        fos.close()
                        processedFiles.add(tempFile)
                    }
                }

                selectedBlogFiles.clear()
                selectedBlogFiles.addAll(processedFiles)

                val totalKb = selectedBlogFiles.sumOf { it.length() } / 1024

                withContext(Dispatchers.Main) {
                    binding.tvBlogSelectedImagesCount.text = "📷 첨부된 사진: ${selectedBlogFiles.size}장 (${totalKb} KB)"
                    binding.btnResetBlogImages.visibility = if (selectedBlogFiles.isNotEmpty()) View.VISIBLE else View.GONE
                    Toast.makeText(activity, "사진 ${selectedBlogFiles.size}장 최적화 압축 완료!", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(activity, "사진 처리 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * AI 블로그 원고 작성 요청 및 응답 결과 UI 갱신
     */
    private fun startBlogAutomation() {
        val topic = binding.etBlogTopic.text.toString().trim()
        val keywords = binding.etBlogKeywords.text.toString().trim()
        val refUrl1 = binding.etBlogRefUrl1.text.toString().trim()
        val refUrl2 = binding.etBlogRefUrl2.text.toString().trim()
        val refUrl3 = binding.etBlogRefUrl3.text.toString().trim()
        val naverBlogId = binding.etNaverBlogId.text.toString().trim().ifBlank { prefs.naverBlogId }

        if (topic.isBlank()) {
            Toast.makeText(activity, "포스팅 주제를 입력해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val userEmail = prefs.userEmail ?: ""
        if (userEmail.isBlank()) {
            Toast.makeText(activity, "로그인 정보(사용자 이메일)가 없습니다.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.pbBlogLoading.visibility = View.VISIBLE
        binding.tvBlogStatus.visibility = View.VISIBLE
        binding.tvBlogStatus.text = "AI가 참고 글을 스크래핑하고 네이버 블로그 원고를 집필 중입니다..."
        binding.btnStartBlogAutomation.isEnabled = false
        binding.layoutBlogResultContainer.visibility = View.GONE

        activity.lifecycleScope.launch {
            try {
                val result = ApiClient.requestBlogAutomation(
                    topic = topic,
                    keywords = keywords,
                    refUrl1 = refUrl1,
                    refUrl2 = refUrl2,
                    refUrl3 = refUrl3,
                    naverBlogId = naverBlogId,
                    files = selectedBlogFiles.toList(),
                    userEmail = userEmail
                )

                binding.pbBlogLoading.visibility = View.GONE
                binding.tvBlogStatus.visibility = View.GONE
                binding.btnStartBlogAutomation.isEnabled = true

                if (result.success) {
                    binding.layoutBlogResultContainer.visibility = View.VISIBLE
                    binding.tvBlogResultTitle.text = "✍️ [원고 완성] ${result.title} (${result.charCount}자)"
                    binding.tvBlogResultSummary.text = result.summary

                    if (result.reportUrl.isNotBlank()) {
                        binding.btnOpenBlogViewer.visibility = View.VISIBLE
                        binding.btnOpenBlogViewer.setOnClickListener {
                            try {
                                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(result.reportUrl)))
                            } catch (e: Exception) {
                                Toast.makeText(activity, "원고 뷰어 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    } else {
                        binding.btnOpenBlogViewer.visibility = View.GONE
                    }

                    if (result.sheetUrl.isNotBlank()) {
                        binding.btnOpenBlogSheet.visibility = View.VISIBLE
                        binding.btnOpenBlogSheet.setOnClickListener {
                            try {
                                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(result.sheetUrl)))
                            } catch (e: Exception) {
                                Toast.makeText(activity, "대장 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    } else {
                        binding.btnOpenBlogSheet.visibility = View.GONE
                    }

                    binding.btnOpenNaverWrite.visibility = View.VISIBLE
                    binding.btnOpenNaverWrite.setOnClickListener {
                        try {
                            val targetUrl = when {
                                result.naverWriteUrl.isNotBlank() -> result.naverWriteUrl
                                result.naverPostUrl.isNotBlank() -> result.naverPostUrl
                                naverBlogId.isNotBlank() -> "https://blog.naver.com/${naverBlogId.replace("^@".toRegex(), "")}?Redirect=Write"
                                else -> "https://blog.naver.com/GoBlogWrite.naver"
                            }
                            activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)))
                        } catch (e: Exception) {
                            Toast.makeText(activity, "네이버 글쓰기 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    }

                    Toast.makeText(activity, "🎉 AI 블로그 원고 작성 및 시트 적재 완료!", Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(activity, "작성 실패: ${result.error ?: "오류 발생"}", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                binding.pbBlogLoading.visibility = View.GONE
                binding.tvBlogStatus.visibility = View.GONE
                binding.btnStartBlogAutomation.isEnabled = true
                Toast.makeText(activity, "블로그 원고 처리 오류: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
