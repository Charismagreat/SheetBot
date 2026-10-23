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
 * - 스마트 경비 영수증 구글 시트 대장 또는 파일투시트(영수증대장) 자동 기록
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
            if (prefs.isDestinationFileToSheet) {
                if (!prefs.isFtsPaired && prefs.ftsPhoneNumber.isNullOrBlank()) {
                    Toast.makeText(activity, "먼저 파일투시트 번호 인증 또는 QR코드를 스캔해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
            } else if (!prefs.isPaired) {
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
     * 영수증 사진을 전송하여 구글 시트 또는 파일투시트(FileToSheet) 시트에 직결 자동 기록
     */
    fun uploadReceipt(uri: Uri) {
        val isFts = prefs.isDestinationFileToSheet
        if (isFts) {
            if (!prefs.isFtsPaired && prefs.ftsPhoneNumber.isNullOrBlank()) {
                Toast.makeText(activity, "⚠️ 파일투시트 번호 인증 또는 QR코드 연동 후 이용할 수 있습니다.", Toast.LENGTH_LONG).show()
                return
            }
        } else if (!prefs.isPaired) {
            Toast.makeText(activity, "⚠️ 시트봇 계정 연동 후 이용할 수 있습니다.", Toast.LENGTH_LONG).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        val receiptSheetName = prefs.getFtsSheetNameFor("receipt_scanner") ?: "영수증대장"
        val targetName = if (isFts) "파일투시트 [$receiptSheetName]" else "구글 시트"
        Toast.makeText(activity, "🧾 영수증을 $targetName 시트로 전송합니다...", Toast.LENGTH_SHORT).show()

        activity.lifecycleScope.launch {
            try {
                val result = FileUploadManager.uploadOcrReceipt(activity, uri)
                binding.progressBar.visibility = View.GONE

                if (result.success) {
                    if (isFts) {
                        val sName = result.folderName?.takeIf { it.isNotBlank() }
                            ?: prefs.getFtsSheetNameFor("receipt_scanner")
                            ?: "영수증대장"
                        Toast.makeText(
                            activity,
                            "✅ [$sName] 시트에 1건이 전송되었습니다!",
                            Toast.LENGTH_LONG
                        ).show()
                        onAddLogItem("⚡ FTS 영수증", "[$sName] 시트 직결 적재 완료", true)
                    } else {
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
                    }
                } else {
                    val err = result.error ?: "영수증 처리 실패"
                    Toast.makeText(activity, "⚠️ 영수증 전송 실패: $err", Toast.LENGTH_LONG).show()
                    onAddLogItem("영수증 오류", err, false)
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Toast.makeText(activity, "영수증 처리 예외: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
