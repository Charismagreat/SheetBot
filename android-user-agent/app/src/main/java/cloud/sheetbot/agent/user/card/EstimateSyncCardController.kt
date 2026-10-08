package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.util.Base64
import android.util.Log
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
 * 📑 AI 스마트 간편 견적서 발행 대장 연동 카드 전담 컨트롤러 (v2.1.99 리팩토링 모듈화)
 *
 * - 스마트 간편 견적서 발행 스위치 제어 및 시트 대장 자동 프로비저닝
 * - 사장님 즉시 견적서 발행 웹페이지 바로가기 인텐트
 * - 견적 카카오톡 og:image 썸네일 고화질 압축, 로컬 영구 캐시, 서버 업로드
 * - 구글 스프레드시트 대장 원터치 오픈 및 최신 바인딩 보정
 * - 카드 접기/펼치기 상태 보존
 */
class EstimateSyncCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onPickEstimateImage: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onProvisionSheet: (sheetType: String, defaultTitle: String) -> Unit
) {
    /**
     * 📸 간편견적 웹앱 및 카카오톡 미리보기용 대표 이미지 로컬 영구 캐시 파일 (v2.1.98)
     */
    val localEstimateImageFile: File
        get() = File(activity.filesDir, "estimate_representative_image.jpg")

    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        binding.switchEstimateSync.isChecked = prefs.isEstimateSheetSyncEnabled

        // 접기/펼치기 헤더 및 버튼 리스너 바인딩
        val toggle = { toggleCollapse() }
        binding.layoutEstimateSyncHeader.setOnClickListener { toggle() }
        binding.btnToggleEstimateSyncDetails.setOnClickListener { toggle() }

        binding.switchEstimateSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isEstimateSheetSyncEnabled = isChecked
            prefs.isEstimateSyncDetailsHidden = !isChecked
            refreshCollapseState()
            val msg = if (isChecked) "스마트 간편 견적서 발행 대장이 켜졌습니다." else "간편 견적서 발행 대장이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                onProvisionSheet("ESTIMATE", prefs.estimateDriveSheetTitle)
            }
        }

        binding.btnOpenEstimateSheet.setOnClickListener {
            onOpenSheetChooser("ESTIMATE", prefs.estimateDriveSheetTitle)
        }

        // 🚀 사장님 즉시 견적서 발행 웹페이지
        binding.btnIssueEstimateWeb.setOnClickListener {
            val email = prefs.userEmail
            val url = if (!email.isNullOrBlank()) {
                val slug = Base64.encodeToString(email.toByteArray(Charsets.UTF_8), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
                "https://sheetbot.cloud/estimate/issue?userKey=$slug"
            } else {
                "https://sheetbot.cloud/estimate/issue"
            }
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(activity, "웹 브라우저를 열 수 없습니다: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            }
        }

        // 📸 견적 카카오톡 미리보기 사진 등록/변경 (v2.1.98 독립 분리)
        binding.btnRegisterEstimateOgImage.setOnClickListener {
            val email = prefs.userEmail
            if (email.isNullOrBlank()) {
                Toast.makeText(activity, "먼저 시트봇 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            onPickEstimateImage()
        }

        refreshEstimateImageUi()
    }

    /**
     * 📸 간편견적 대표 썸네일 이미지 UI 새로고침 (0초 로컬 파일 우선 + 백그라운드 원격 동기화)
     */
    fun refreshEstimateImageUi() {
        val localFile = localEstimateImageFile
        if (localFile.exists() && localFile.length() > 0) {
            try {
                val bmp = BitmapFactory.decodeFile(localFile.absolutePath)
                if (bmp != null) {
                    binding.ivEstimateImagePreview.setImageBitmap(bmp)
                    binding.tvEstimateImageStatus.text = "등록됨 ✓"
                    binding.tvEstimateImageStatus.setTextColor(Color.parseColor("#34D399"))
                    return
                }
            } catch (e: Exception) {
                Log.w("EstimateSyncController", "로컬 견적 대표 이미지 디코딩 실패: ${e.message}")
            }
        }

        val remoteUrl = prefs.estimateImageUrl
        if (remoteUrl.isNotBlank() && remoteUrl != "https://sheetbot.cloud/favicon.svg") {
            loadEstimateImageThumbnail(remoteUrl)
        } else {
            binding.tvEstimateImageStatus.text = "미등록 (기본 로고)"
            binding.tvEstimateImageStatus.setTextColor(Color.parseColor("#94A3B8"))
        }
    }

    /**
     * 📸 간편견적 웹앱 및 카카오톡 미리보기용 대표 이미지 선택 처리 (v2.1.98 독립 분리)
     */
    fun handleImageSelected(uri: Uri) {
        val email = prefs.userEmail.takeIf { !it.isNullOrBlank() }
            ?: "chachogreat@gmail.com"

        binding.tvEstimateImageStatus.text = "이미지 처리 중..."
        binding.tvEstimateImageStatus.setTextColor(Color.parseColor("#F59E0B"))

        activity.lifecycleScope.launch {
            try {
                val (compressedBytes, displayBitmap) = withContext(Dispatchers.IO) {
                    compressImageForEstimate(uri)
                }

                if (compressedBytes.isEmpty() || displayBitmap == null) {
                    withContext(Dispatchers.Main) {
                        binding.tvEstimateImageStatus.text = "이미지 처리 실패"
                        binding.tvEstimateImageStatus.setTextColor(Color.parseColor("#EF4444"))
                    }
                    return@launch
                }

                withContext(Dispatchers.IO) {
                    try {
                        localEstimateImageFile.writeBytes(compressedBytes)
                    } catch (fe: Exception) {
                        Log.e("EstimateSyncController", "로컬 견적 이미지 파일 저장 실패: ${fe.message}")
                    }
                }

                withContext(Dispatchers.Main) {
                    binding.ivEstimateImagePreview.setImageBitmap(displayBitmap)
                    binding.tvEstimateImageStatus.text = "저장됨 (클라우드 동기화 중...)"
                    binding.tvEstimateImageStatus.setTextColor(Color.parseColor("#F59E0B"))
                }

                val fileName = "estimate_image_" + System.currentTimeMillis() + ".jpg"
                val mimeType = "image/jpeg"

                val result = ApiClient.uploadQuoteImage(compressedBytes, fileName, mimeType, email, "estimate")
                withContext(Dispatchers.Main) {
                    if (result.success && !result.imageUrl.isNullOrBlank()) {
                        prefs.estimateImageUrl = result.imageUrl
                        binding.tvEstimateImageStatus.text = "등록됨 ✓ (카톡 반영 완료)"
                        binding.tvEstimateImageStatus.setTextColor(Color.parseColor("#34D399"))
                        Toast.makeText(activity, "🎉 견적서 대표 이미지가 안전하게 저장되고 카카오톡 공유 링크에 반영되었습니다!", Toast.LENGTH_SHORT).show()
                    } else {
                        binding.tvEstimateImageStatus.text = "로컬 저장됨 (동기화 지연)"
                        binding.tvEstimateImageStatus.setTextColor(Color.parseColor("#F59E0B"))
                        Toast.makeText(activity, "사진이 기기에 안전하게 저장되었습니다. (네트워크 연결 시 클라우드 자동 동기화)", Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.tvEstimateImageStatus.text = "오류 발생: ${e.message}"
                    binding.tvEstimateImageStatus.setTextColor(Color.parseColor("#EF4444"))
                }
            }
        }
    }

    /**
     * 카카오톡 공유 미리보기 및 견적 웹 최적화를 위한 스마트 다운스케일링 및 JPEG 압축
     */
    private fun compressImageForEstimate(uri: Uri): Pair<ByteArray, Bitmap?> {
        try {
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            activity.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, options)
            }

            val origWidth = options.outWidth
            val origHeight = options.outHeight
            if (origWidth <= 0 || origHeight <= 0) return Pair(ByteArray(0), null)

            val maxDim = 1200
            var inSampleSize = 1
            if (origWidth > maxDim || origHeight > maxDim) {
                val halfWidth = origWidth / 2
                val halfHeight = origHeight / 2
                while ((halfWidth / inSampleSize) >= maxDim && (halfHeight / inSampleSize) >= maxDim) {
                    inSampleSize *= 2
                }
            }

            val decodeOptions = BitmapFactory.Options().apply {
                this.inSampleSize = inSampleSize
            }

            val decodedBitmap = activity.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, decodeOptions)
            } ?: return Pair(ByteArray(0), null)

            val currentW = decodedBitmap.width
            val currentH = decodedBitmap.height
            val scaledBitmap = if (currentW > maxDim || currentH > maxDim) {
                val ratio = if (currentW >= currentH) maxDim.toFloat() / currentW else maxDim.toFloat() / currentH
                val targetW = (currentW * ratio).toInt().coerceAtLeast(1)
                val targetH = (currentH * ratio).toInt().coerceAtLeast(1)
                Bitmap.createScaledBitmap(decodedBitmap, targetW, targetH, true)
            } else {
                decodedBitmap
            }

            val baos = java.io.ByteArrayOutputStream()
            scaledBitmap.compress(Bitmap.CompressFormat.JPEG, 85, baos)
            val compressedBytes = baos.toByteArray()

            return Pair(compressedBytes, scaledBitmap)
        } catch (e: Exception) {
            Log.e("EstimateSyncController", "견적 이미지 압축 실패: ${e.message}", e)
            return Pair(ByteArray(0), null)
        }
    }

    /**
     * 간편견적 대표 썸네일 이미지 비동기 로드, 로컬 영구 파일 저장 및 표시
     */
    fun loadEstimateImageThumbnail(url: String) {
        if (url.isBlank() || url == "https://sheetbot.cloud/favicon.svg") return
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val conn = (java.net.URL(url).openConnection() as? java.net.HttpURLConnection) ?: return@launch
                conn.connectTimeout = 10000
                conn.readTimeout = 15000
                conn.instanceFollowRedirects = true
                conn.requestMethod = "GET"

                if (conn.responseCode in 200..299) {
                    val bytes = conn.inputStream.use { it.readBytes() }
                    if (bytes.isNotEmpty()) {
                        try {
                            localEstimateImageFile.writeBytes(bytes)
                        } catch (fe: Exception) {
                            Log.w("EstimateSyncController", "로컬 견적 이미지 캐싱 실패: ${fe.message}")
                        }

                        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        if (bmp != null) {
                            withContext(Dispatchers.Main) {
                                binding.ivEstimateImagePreview.setImageBitmap(bmp)
                                binding.tvEstimateImageStatus.text = "등록됨 ✓"
                                binding.tvEstimateImageStatus.setTextColor(Color.parseColor("#34D399"))
                            }
                        }
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                Log.w("EstimateSyncController", "간편견적 대표 썸네일 로드 예외: ${e.message}")
            }
        }
    }

    /**
     * 카드 접기/펼치기 상태 토글
     */
    fun toggleCollapse() {
        prefs.isEstimateSyncDetailsHidden = !prefs.isEstimateSyncDetailsHidden
        refreshCollapseState()
    }

    /**
     * 접기/펼치기 뷰 상태 갱신
     */
    fun refreshCollapseState() {
        activity.updateCardCollapseState(
            binding.layoutEstimateSyncSettings,
            binding.btnToggleEstimateSyncDetails,
            prefs.isEstimateSyncDetailsHidden
        )
    }
}
