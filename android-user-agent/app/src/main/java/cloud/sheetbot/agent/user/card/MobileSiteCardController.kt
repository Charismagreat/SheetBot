package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import android.view.View
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.CardMobileSiteBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * 🌐 AI 모바일 홈페이지 제작 & 관리 카드 전담 컨트롤러
 * - UI 바인딩, 이벤트 리스너, 사진 압축/선택, 모바일 홈페이지 즉시 오픈, AI 홈페이지 생성 API 호출 및 대장 연동 캡슐화
 */
class MobileSiteCardController(
    private val activity: MainActivity,
    private val binding: CardMobileSiteBinding,
    private val prefs: PreferencesManager,
    private val onPickImages: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit
) {
    val selectedSiteFiles = mutableListOf<File>()

    private var isCollapsed = false

    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        val toggleSite = {
            isCollapsed = !isCollapsed
            binding.layoutSiteDetails.visibility = if (isCollapsed) View.GONE else View.VISIBLE
            binding.btnToggleSiteDetails.text = if (isCollapsed) "▼" else "▲"
        }

        binding.layoutSiteHeader.setOnClickListener { toggleSite() }
        binding.btnToggleSiteDetails.setOnClickListener { toggleSite() }

        binding.switchSiteAutomation.setOnCheckedChangeListener { _, isChecked ->
            isCollapsed = !isChecked
            binding.layoutSiteDetails.visibility = if (isCollapsed) View.GONE else View.VISIBLE
            binding.btnToggleSiteDetails.text = if (isCollapsed) "▼" else "▲"
            val msg = if (isChecked) "AI 모바일 홈페이지 제작 & 관리 기능이 켜졌습니다." else "AI 모바일 홈페이지 제작 & 관리 기능이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
        }

        // 🌐 내 공식 모바일 홈페이지 열기 (기본 템플릿 즉시 오픈)
        binding.btnOpenDefaultMobileSite.setOnClickListener {
            val email = prefs.userEmail
            if (email.isNullOrBlank()) {
                Toast.makeText(activity, "먼저 시트봇 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val slug = Base64.encodeToString(
                email.toByteArray(Charsets.UTF_8),
                Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
            )
            val url = "https://sheetbot.cloud/site/$slug"
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(activity, "웹 브라우저를 열 수 없습니다: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            }
        }

        // 사진 선택 및 초기화
        binding.btnSelectSiteImages.setOnClickListener {
            try {
                onPickImages()
            } catch (e: Exception) {
                Toast.makeText(activity, "사진 선택 실패: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnResetSiteImages.setOnClickListener {
            selectedSiteFiles.clear()
            binding.tvSiteSelectedImagesCount.text = "첨부된 사진: 0장 (선택 시 1600px 85% 자동 압축)"
            binding.btnResetSiteImages.visibility = View.GONE
            Toast.makeText(activity, "사진 첨부가 취소되었습니다.", Toast.LENGTH_SHORT).show()
        }

        // 모바일 홈페이지 생성 시작
        binding.btnStartSiteCreation.setOnClickListener {
            startSiteCreation()
        }

        // 대장 열기 다이얼로그
        binding.btnOpenSiteSheetAlways.setOnClickListener {
            onOpenSheetChooser("MOBILE_SITE", "[SheetBot] 모바일 홈페이지 관리 대장")
        }
    }

    /**
     * 🌐 AI 모바일 홈페이지 다중 사진 선택 처리 (1600px 리사이즈 및 85% JPEG 압축 표준 준수)
     */
    fun handleImagesSelected(uris: List<Uri>) {
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val processedFiles = mutableListOf<File>()
                for ((index, uri) in uris.withIndex()) {
                    var displayName = "site_photo_${System.currentTimeMillis()}_${index}.jpg"
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
                        val tempFile = File(activity.cacheDir, "site_${System.currentTimeMillis()}_${index}.jpg")
                        val fos = java.io.FileOutputStream(tempFile)
                        decoded.compress(Bitmap.CompressFormat.JPEG, 85, fos)
                        fos.flush()
                        fos.close()
                        processedFiles.add(tempFile)
                    }
                }

                selectedSiteFiles.clear()
                selectedSiteFiles.addAll(processedFiles)

                val totalKb = selectedSiteFiles.sumOf { it.length() } / 1024

                withContext(Dispatchers.Main) {
                    binding.tvSiteSelectedImagesCount.text = "📷 첨부된 사진: ${selectedSiteFiles.size}장 (${totalKb} KB)"
                    binding.btnResetSiteImages.visibility = if (selectedSiteFiles.isNotEmpty()) View.VISIBLE else View.GONE
                    Toast.makeText(activity, "사진 ${selectedSiteFiles.size}장 최적화 압축 완료!", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(activity, "사진 처리 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * AI 모바일 홈페이지 생성 요청 및 결과 UI 갱신
     */
    private fun startSiteCreation() {
        val title = binding.etSiteTitle.text.toString().trim()
        val category = binding.etSiteCategory.text.toString().trim().ifBlank { "카페 / 베이커리" }
        val phone = binding.etSitePhone.text.toString().trim()
        val address = binding.etSiteAddress.text.toString().trim()
        val businessHours = binding.etSiteHours.text.toString().trim().ifBlank { "매일 10:00 ~ 22:00" }

        if (title.isBlank()) {
            Toast.makeText(activity, "상호명(홈페이지 이름)을 입력해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val userEmail = prefs.userEmail ?: ""
        if (userEmail.isBlank()) {
            Toast.makeText(activity, "로그인 정보(사용자 이메일)가 없습니다.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.pbSiteLoading.visibility = View.VISIBLE
        binding.tvSiteStatus.visibility = View.VISIBLE
        binding.tvSiteStatus.text = "AI가 브랜드 스토리와 메뉴 구성을 기획하고 웹사이트를 발행 중입니다..."
        binding.btnStartSiteCreation.isEnabled = false
        binding.layoutSiteResultContainer.visibility = View.GONE

        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val result = ApiClient.requestCreateMobileSite(
                    title = title,
                    category = category,
                    description = "",
                    phone = phone,
                    address = address,
                    businessHours = businessHours,
                    files = selectedSiteFiles.toList(),
                    userEmail = userEmail
                )

                withContext(Dispatchers.Main) {
                    binding.pbSiteLoading.visibility = View.GONE
                    binding.tvSiteStatus.visibility = View.GONE
                    binding.btnStartSiteCreation.isEnabled = true

                    if (result.success) {
                        binding.layoutSiteResultContainer.visibility = View.VISIBLE
                        binding.tvSiteResultTitle.text = "🎉 ${result.title} - ${result.slogan}"
                        binding.tvSiteResultUrl.text = result.siteUrl

                        if (result.siteUrl.isNotBlank()) {
                            binding.btnOpenMobileSite.visibility = View.VISIBLE
                            binding.btnOpenMobileSite.setOnClickListener {
                                try {
                                    activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(result.siteUrl)))
                                } catch (e: Exception) {
                                    Toast.makeText(activity, "모바일 웹 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                                }
                            }
                        } else {
                            binding.btnOpenMobileSite.visibility = View.GONE
                        }

                        if (result.sheetUrl.isNotBlank()) {
                            binding.btnOpenSiteSheet.visibility = View.VISIBLE
                            binding.btnOpenSiteSheet.setOnClickListener {
                                try {
                                    activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(result.sheetUrl)))
                                } catch (e: Exception) {
                                    Toast.makeText(activity, "대장 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                                }
                            }
                        } else {
                            binding.btnOpenSiteSheet.visibility = View.GONE
                        }

                        Toast.makeText(activity, "🎉 10초 모바일 홈페이지 생성 완료!", Toast.LENGTH_LONG).show()
                    } else {
                        Toast.makeText(activity, "생성 실패: ${result.error ?: "오류 발생"}", Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.pbSiteLoading.visibility = View.GONE
                    binding.tvSiteStatus.visibility = View.GONE
                    binding.btnStartSiteCreation.isEnabled = true
                    Toast.makeText(activity, "홈페이지 생성 오류: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
