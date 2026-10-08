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
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * ⚖️ AI 법률/계약서 팩트체크 카드 전담 컨트롤러
 * - UI 바인딩, 이벤트 리스너, 서류 첨부/압축(1600px 85%), AI 법률 자문 API 호출 및 결과 UI 연동 캡슐화
 */
class LawAdvisoryCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onPickFile: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit
) {
    var selectedLawFile: File? = null
    var selectedLawFileName: String? = null

    private var isCollapsed = false

    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        val toggleLaw = {
            isCollapsed = !isCollapsed
            binding.layoutLawAdvisoryDetails.visibility = if (isCollapsed) View.GONE else View.VISIBLE
            binding.btnToggleLawAdvisoryDetails.text = if (isCollapsed) "▼" else "▲"
        }

        binding.layoutLawAdvisoryHeader.setOnClickListener { toggleLaw() }
        binding.btnToggleLawAdvisoryDetails.setOnClickListener { toggleLaw() }

        binding.switchLawAdvisory.setOnCheckedChangeListener { _, isChecked ->
            isCollapsed = !isChecked
            binding.layoutLawAdvisoryDetails.visibility = if (isCollapsed) View.GONE else View.VISIBLE
            binding.btnToggleLawAdvisoryDetails.text = if (isCollapsed) "▼" else "▲"
            val msg = if (isChecked) "AI 법률/계약서 팩트체크 기능이 켜졌습니다." else "AI 법률/계약서 팩트체크 기능이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
        }

        binding.btnAttachLawFile.setOnClickListener {
            try {
                onPickFile()
            } catch (e: Exception) {
                Toast.makeText(activity, "갤러리 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnRemoveLawAttachedFile.setOnClickListener {
            selectedLawFile = null
            selectedLawFileName = null
            binding.layoutLawAttachedFile.visibility = View.GONE
            Toast.makeText(activity, "첨부 서류가 제거되었습니다.", Toast.LENGTH_SHORT).show()
        }

        binding.btnStartLawAdvisory.setOnClickListener {
            startLawAdvisory()
        }

        binding.btnOpenLawSheetAlways.setOnClickListener {
            onOpenSheetChooser("LAW_ADVISORY", "[SheetBot] 법률·계약 검토 대장")
        }
    }

    /**
     * ⚖️ AI 법률/계약서 서류 첨부 파일 처리 (1600px 리사이즈 및 85% JPEG 압축 표준 준수)
     */
    fun handleFileSelected(uri: Uri) {
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                var displayName = "contract_${System.currentTimeMillis()}.jpg"
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

                if (decoded == null) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(activity, "이미지 파일을 읽을 수 없습니다.", Toast.LENGTH_SHORT).show()
                    }
                    return@launch
                }

                val tempFile = File(activity.cacheDir, "law_${System.currentTimeMillis()}.jpg")
                val fos = java.io.FileOutputStream(tempFile)
                decoded.compress(Bitmap.CompressFormat.JPEG, 85, fos)
                fos.flush()
                fos.close()

                selectedLawFile = tempFile
                selectedLawFileName = displayName

                withContext(Dispatchers.Main) {
                    binding.layoutLawAttachedFile.visibility = View.VISIBLE
                    binding.tvLawAttachedName.text = "📎 $displayName (${tempFile.length() / 1024} KB)"
                    Toast.makeText(activity, "서류 첨부 완료: $displayName", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(activity, "서류 첨부 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * AI 법률 자문 요청 및 결과 UI 갱신
     */
    private fun startLawAdvisory() {
        val query = binding.etLawQuery.text.toString().trim()
        if (query.isBlank() && selectedLawFile == null) {
            Toast.makeText(activity, "법률 질의 내용 또는 서류 사진을 첨부해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val userEmail = prefs.userEmail ?: ""
        if (!prefs.isPaired || userEmail.isBlank()) {
            Toast.makeText(activity, "시트봇 계정 연동 후 자문이 가능합니다.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.pbLawLoading.visibility = View.VISIBLE
        binding.tvLawStatus.visibility = View.VISIBLE
        binding.tvLawStatus.text = "🏛️ 대한민국 법제처 법령 및 대법원 리딩 판례 팩트체크 중..."
        binding.btnStartLawAdvisory.isEnabled = false
        binding.layoutLawResultContainer.visibility = View.GONE

        activity.lifecycleScope.launch {
            try {
                val result = ApiClient.requestLawAdvisory(
                    query = query,
                    userEmail = userEmail,
                    file = selectedLawFile,
                    fileName = selectedLawFileName
                )

                binding.pbLawLoading.visibility = View.GONE
                binding.tvLawStatus.visibility = View.GONE
                binding.btnStartLawAdvisory.isEnabled = true

                if (result.success) {
                    binding.layoutLawResultContainer.visibility = View.VISIBLE
                    binding.tvLawMatchedBadge.text = "🏛️ ${result.lawTitle} | 판례: ${result.caseNumber}"
                    binding.tvLawExecutiveSummary.text = result.executiveSummary

                    if (result.reportUrl.isNotBlank()) {
                        binding.btnOpenLawReport.visibility = View.VISIBLE
                        binding.btnOpenLawReport.setOnClickListener {
                            try {
                                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(result.reportUrl)))
                            } catch (e: Exception) {
                                Toast.makeText(activity, "보고서 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    } else {
                        binding.btnOpenLawReport.visibility = View.GONE
                    }

                    if (result.sheetUrl.isNotBlank()) {
                        binding.btnOpenLawSheet.visibility = View.VISIBLE
                        binding.btnOpenLawSheet.setOnClickListener {
                            try {
                                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(result.sheetUrl)))
                            } catch (e: Exception) {
                                Toast.makeText(activity, "대장 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    } else {
                        binding.btnOpenLawSheet.visibility = View.GONE
                    }

                    Toast.makeText(activity, "🎉 AI 법률 자문 및 심층 보고서 작성이 완료되었습니다!", Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(activity, "자문 실패: ${result.error ?: "오류 발생"}", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                binding.pbLawLoading.visibility = View.GONE
                binding.tvLawStatus.visibility = View.GONE
                binding.btnStartLawAdvisory.isEnabled = true
                Toast.makeText(activity, "자문 처리 중 오류: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
