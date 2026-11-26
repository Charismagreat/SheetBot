package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.view.View
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * 🔍 AI 멀티모달 기업 심층 리서치 (HTML 보고서) 카드 전담 컨트롤러
 * - 텍스트·URL·이미지(1600px/85% JPEG 압축)·PDF 자료 업로드 지원
 * - AI 회사 정보 추출 → EGDesk MCP(국민연금·국세청·SMPP·나라장터·기업마당·웹/SEO) 다각적 조회
 * - AI 자유 생성 HTML 보고서 공개 UUID 공유 링크 + 드라이브 .html 저장 + 구글 시트 대장 연동
 */
class CompanyResearchCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onPickFile: () -> Unit = {},
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit
) {
    private var selectedFile: File? = null
    private var selectedFileName: String? = null
    private var selectedMimeType: String = "image/jpeg"

    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        val toggleCollapse = {
            val isHidden = binding.layoutCompanyResearchSettings.visibility != View.VISIBLE
            activity.updateCardCollapseState(
                binding.layoutCompanyResearchSettings,
                binding.btnToggleCompanyResearchDetails,
                !isHidden
            )
        }

        binding.layoutCompanyResearchHeader.setOnClickListener { toggleCollapse() }
        binding.btnToggleCompanyResearchDetails.setOnClickListener { toggleCollapse() }

        binding.btnAttachResearchFile.setOnClickListener {
            try {
                onPickFile()
            } catch (e: Exception) {
                Toast.makeText(activity, "파일 선택기 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnRemoveResearchAttachedFile.setOnClickListener {
            clearAttachedFile()
            Toast.makeText(activity, "첨부 자료가 제거되었습니다.", Toast.LENGTH_SHORT).show()
        }

        binding.btnStartCompanyResearch.setOnClickListener {
            startCompanyResearch()
        }

        binding.btnOpenResearchSheetAlways.setOnClickListener {
            onOpenSheetChooser("COMPANY_RESEARCH", "[SheetBot] 기업 리서치 관리 대장")
        }
    }

    private fun clearAttachedFile() {
        selectedFile = null
        selectedFileName = null
        selectedMimeType = "image/jpeg"
        binding.layoutResearchAttachedFile.visibility = View.GONE
    }

    /**
     * 📎 기업 리서치 자료(이미지 / PDF) 첨부 처리
     * - 이미지: 1600px 지능형 샘플링 리사이즈 + 85% JPEG 압축 (모바일 페이로드 최적화 표준)
     * - PDF: 캐시 복사 + 15MB 상한 가드
     */
    fun handleFileSelected(uri: Uri) {
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                var displayName = "research_source_${System.currentTimeMillis()}"
                activity.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (nameIndex != -1) {
                            displayName = cursor.getString(nameIndex) ?: displayName
                        }
                    }
                }

                val detectedMime = activity.contentResolver.getType(uri)
                    ?: if (displayName.lowercase().endsWith(".pdf")) "application/pdf" else "image/jpeg"

                val preparedFile: File
                val finalMime: String

                if (detectedMime.startsWith("image/")) {
                    // 1600px 샘플링 디코딩 + 85% JPEG 압축
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
                            Toast.makeText(activity, "이미지 파일을 읽을 수 없습니다.", Toast.LENGTH_SHORT).show()
                        }
                        return@launch
                    }

                    preparedFile = File(activity.cacheDir, "research_${System.currentTimeMillis()}.jpg")
                    FileOutputStream(preparedFile).use { fos ->
                        decoded.compress(Bitmap.CompressFormat.JPEG, 85, fos)
                        fos.flush()
                    }
                    finalMime = "image/jpeg"
                } else {
                    // PDF 및 문서 파일 직접 복사 (최대 15MB)
                    val ext = if (displayName.lowercase().endsWith(".pdf")) "pdf" else "bin"
                    preparedFile = File(activity.cacheDir, "research_${System.currentTimeMillis()}.$ext")
                    activity.contentResolver.openInputStream(uri)?.use { input ->
                        FileOutputStream(preparedFile).use { output ->
                            input.copyTo(output)
                        }
                    } ?: run {
                        withContext(Dispatchers.Main) {
                            Toast.makeText(activity, "첨부 파일을 읽을 수 없습니다.", Toast.LENGTH_SHORT).show()
                        }
                        return@launch
                    }

                    if (preparedFile.length() > 15L * 1024L * 1024L) {
                        preparedFile.delete()
                        withContext(Dispatchers.Main) {
                            Toast.makeText(activity, "PDF 파일은 최대 15MB까지 첨부할 수 있습니다.", Toast.LENGTH_LONG).show()
                        }
                        return@launch
                    }
                    finalMime = if (ext == "pdf") "application/pdf" else detectedMime
                }

                selectedFile = preparedFile
                selectedFileName = displayName
                selectedMimeType = finalMime

                val icon = if (finalMime.contains("pdf")) "📄" else "🖼️"
                val sizeKb = (preparedFile.length() / 1024).coerceAtLeast(1)

                withContext(Dispatchers.Main) {
                    binding.layoutResearchAttachedFile.visibility = View.VISIBLE
                    binding.tvResearchAttachedName.text = "$icon $displayName ($sizeKb KB)"
                    Toast.makeText(activity, "자료 첨부 완료: $displayName", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(activity, "자료 첨부 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * AI 멀티모달 기업 심층 리서치 요청 및 결과 UI 갱신
     */
    private fun startCompanyResearch() {
        val companyName = binding.etResearchCompanyName.text.toString().trim()
        val domainOrUrl = binding.etResearchDomain.text.toString().trim()
        val sourceText = binding.etResearchSourceText.text.toString().trim()
        val userEmail = prefs.userEmail

        if (companyName.isBlank() && domainOrUrl.isBlank() && sourceText.isBlank() && selectedFile == null) {
            Toast.makeText(
                activity,
                "회사명, URL, 텍스트, 이미지 또는 PDF 자료 중 1개 이상을 입력·첨부해 주세요.",
                Toast.LENGTH_SHORT
            ).show()
            return
        }
        if (!prefs.isPaired || userEmail.isNullOrBlank()) {
            Toast.makeText(activity, "시트봇 계정 연동 후 조사가 가능합니다.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.pbResearchLoading.visibility = View.VISIBLE
        binding.tvResearchStatus.visibility = View.VISIBLE
        binding.tvResearchStatus.text =
            "🔍 AI 자료 추출 → 국민연금·국세청·SMPP·나라장터·기업마당·웹 진단 → HTML 보고서 생성 중..."
        binding.btnStartCompanyResearch.isEnabled = false
        binding.layoutResearchResultContainer.visibility = View.GONE

        val attachedFile = selectedFile
        val attachedName = selectedFileName
        val attachedMime = selectedMimeType

        activity.lifecycleScope.launch {
            try {
                val result = ApiClient.requestCompanyResearch(
                    companyName = companyName,
                    domain = domainOrUrl,
                    userEmail = userEmail,
                    sourceText = sourceText,
                    sourceUrl = domainOrUrl,
                    file = attachedFile,
                    fileName = attachedName,
                    mimeType = attachedMime
                )

                binding.pbResearchLoading.visibility = View.GONE
                binding.tvResearchStatus.visibility = View.GONE
                binding.btnStartCompanyResearch.isEnabled = true

                if (result.success) {
                    binding.layoutResearchResultContainer.visibility = View.VISIBLE
                    binding.tvResultCompanyTitle.text = result.companyName.ifBlank { "기업 리서치 완료" }
                    binding.tvResultTaxBadge.text = result.taxStatus.ifBlank { "조회 완료" }
                    binding.tvResultMetrics.text =
                        "고용: ${result.employeeCount} | 급여: ${result.avgSalary}\nSMPP: ${result.smppSummary} | 조달: ${result.contractSummary}"
                    binding.tvResultAiSummary.text = result.summary

                    val reportUrl = result.shareUrl.ifBlank { result.docUrl }
                    if (reportUrl.isNotBlank()) {
                        binding.btnOpenResearchDoc.visibility = View.VISIBLE
                        binding.btnOpenResearchDoc.setOnClickListener {
                            openUrl(reportUrl, "HTML 보고서 열기 실패")
                        }

                        binding.btnShareResearchReport.visibility = View.VISIBLE
                        binding.btnShareResearchReport.setOnClickListener {
                            val shareText = "[SheetBot 기업 심층 리서치] ${result.companyName}\n$reportUrl"
                            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, "${result.companyName} 기업 리서치 HTML 보고서")
                                putExtra(Intent.EXTRA_TEXT, shareText)
                            }
                            activity.startActivity(Intent.createChooser(shareIntent, "HTML 보고서 링크 공유"))
                        }
                    } else {
                        binding.btnOpenResearchDoc.visibility = View.GONE
                        binding.btnShareResearchReport.visibility = View.GONE
                    }

                    if (result.driveHtmlUrl.isNotBlank()) {
                        binding.btnOpenResearchDriveHtml.visibility = View.VISIBLE
                        binding.btnOpenResearchDriveHtml.setOnClickListener {
                            openUrl(result.driveHtmlUrl, "드라이브 HTML 열기 실패")
                        }
                    } else {
                        binding.btnOpenResearchDriveHtml.visibility = View.GONE
                    }

                    if (result.sheetUrl.isNotBlank()) {
                        binding.btnOpenResearchSheet.visibility = View.VISIBLE
                        binding.btnOpenResearchSheet.setOnClickListener {
                            openUrl(result.sheetUrl, "시트 열기 실패")
                        }
                    } else {
                        binding.btnOpenResearchSheet.visibility = View.GONE
                    }

                    Toast.makeText(
                        activity,
                        "🎉 ${result.companyName} HTML 리서치 보고서가 생성되었습니다!",
                        Toast.LENGTH_LONG
                    ).show()
                } else {
                    Toast.makeText(activity, "기업 리서치 실패: ${result.error ?: "오류 발생"}", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                binding.pbResearchLoading.visibility = View.GONE
                binding.tvResearchStatus.visibility = View.GONE
                binding.btnStartCompanyResearch.isEnabled = true
                Toast.makeText(activity, "조사 중 오류: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun openUrl(url: String, errorPrefix: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            activity.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(activity, "$errorPrefix: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }
}
