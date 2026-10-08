package cloud.sheetbot.agent.user.card

import android.net.Uri
import android.view.View
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import cloud.sheetbot.agent.user.FileUploadManager
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.launch

/**
 * 🧾 영수증 Gemini AI OCR 자동 장부화 카드 전담 컨트롤러 (v2.1.99 리팩토링 모듈화)
 *
 * - 영수증 사진/문서 선택 런처 연동
 * - Gemini AI OCR 결제 금액/상호명/품목 자동 분석
 * - 스마트 경비 영수증 구글 시트 대장 자동 기록
 * - 시트 대장 원터치 뷰어 오픈
 */
class ReceiptSyncCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onPickReceiptImage: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onAddLogItem: (title: String, detail: String, success: Boolean) -> Unit
) {
    /**
     * 카드 초기화 및 버튼 이벤트 바인딩
     */
    fun setup() {
        binding.btnPickReceipt.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(activity, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            onPickReceiptImage()
        }

        binding.btnOpenReceiptSheet.setOnClickListener {
            onOpenSheetChooser("RECEIPT", prefs.receiptDriveSheetTitle)
        }
    }

    /**
     * 영수증 사진을 전송하여 Gemini AI OCR로 결제 금액/상호명/품목을 분석하고 [SheetBot] 스마트 경비 영수증 대장에 자동 기록
     */
    fun uploadReceipt(uri: Uri) {
        if (!prefs.isPaired) {
            Toast.makeText(activity, "⚠️ 시트봇 계정 연동 후 이용할 수 있습니다.", Toast.LENGTH_LONG).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        Toast.makeText(activity, "🧾 영수증을 업로드하고 AI 분석을 시작합니다...", Toast.LENGTH_SHORT).show()

        activity.lifecycleScope.launch {
            try {
                val result = FileUploadManager.uploadOcrReceipt(activity, uri)
                binding.progressBar.visibility = View.GONE

                if (result.success) {
                    val ocr = result.ocrData
                    val merchant = ocr?.optString("merchantName", "영수증") ?: "영수증"
                    val rawAmt = ocr?.optString("amount")
                    val amount = if (!rawAmt.isNullOrBlank()) "${rawAmt}원" else ""
                    Toast.makeText(
                        activity,
                        "🎉 [영수증 장부화 완료] $merchant $amount\n구글 시트에 자동 기록되었습니다!",
                        Toast.LENGTH_LONG
                    ).show()
                    onAddLogItem("🧾 영수증 OCR", "$merchant $amount -> 경비 대장", true)
                } else {
                    val err = result.error ?: "영수증 분석 실패"
                    Toast.makeText(activity, "⚠️ 영수증 분석 실패: $err", Toast.LENGTH_LONG).show()
                    onAddLogItem("영수증 오류", err, false)
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Toast.makeText(activity, "영수증 처리 예외: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
