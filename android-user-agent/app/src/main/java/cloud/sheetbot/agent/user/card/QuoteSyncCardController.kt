package cloud.sheetbot.agent.user.card

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.util.Base64
import android.util.Log
import android.widget.Toast
import androidx.core.widget.doAfterTextChanged
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
 * 📑 AI 스마트 간편 주문서 & 단가표 대장 연동 카드 전담 컨트롤러 (v2.1.99 리팩토링 모듈화)
 *
 * - 주문서 자동 안내 스위치 제어 및 시트 대장 자동 프로비저닝
 * - 상호명/브랜드명 실시간 로컬/원격 동기화
 * - 카카오톡 og:image 및 웹앱 대표 썸네일 다운스케일링 압축, 로컬 영구 캐시, 서버 업로드
 * - 고객 주도형 모바일 1초 주문 웹앱 바로가기 및 링크 복사/공유
 * - 구글 스프레드시트 대장 원터치 오픈 및 최신 바인딩 보정
 * - 카드 접기/펼치기 상태 보존
 */
class QuoteSyncCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onPickQuoteImage: () -> Unit,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onProvisionSheet: (sheetType: String, defaultTitle: String) -> Unit
) {
    /**
     * 📷 견적 웹앱 및 카카오톡 미리보기용 대표 이미지 로컬 영구 캐시 파일 (v2.1.25)
     */
    val localQuoteImageFile: File
        get() = File(activity.filesDir, "quote_representative_image.jpg")

    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        binding.switchQuoteSync.isChecked = prefs.isQuoteSheetSyncEnabled

        // 접기/펼치기 헤더 및 버튼 리스너 바인딩
        val toggle = { toggleCollapse() }
        binding.layoutQuoteSyncHeader.setOnClickListener { toggle() }
        binding.btnToggleQuoteSyncDetails.setOnClickListener { toggle() }

        binding.switchQuoteSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isQuoteSheetSyncEnabled = isChecked
            prefs.isQuoteSyncDetailsHidden = !isChecked
            refreshCollapseState()
            val msg = if (isChecked) "고객용 간편 주문서 & 단가표 자동 안내가 켜졌습니다." else "간편 주문서 자동 안내가 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                onProvisionSheet("QUOTE", prefs.quoteDriveSheetTitle)
            }
        }

        // 📷 카톡 미리보기 및 웹앱 대표 썸네일 등록 (v2.1.18)
        binding.btnSelectQuoteImage.setOnClickListener {
            val email = prefs.userEmail
            if (email.isNullOrBlank()) {
                Toast.makeText(activity, "먼저 시트봇 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
            } else {
                onPickQuoteImage()
            }
        }

        refreshQuoteImageUi()

        // 🏢 상호명/브랜드명 실시간 자동 저장 및 서버 동기화 (v2.1.17)
        binding.etQuoteBusinessName.setText(prefs.quoteBusinessName)

        val saveBusinessNameAction: (Boolean) -> Unit = { showToast ->
            val newName = binding.etQuoteBusinessName.text?.toString()?.trim() ?: ""
            prefs.quoteBusinessName = newName
            binding.tvBusinessNameStatus.text = "저장 중..."
            binding.tvBusinessNameStatus.setTextColor(Color.parseColor("#F59E0B"))
            val email = prefs.userEmail
            if (!email.isNullOrBlank()) {
                activity.lifecycleScope.launch {
                    val ok = ApiClient.updateBusinessProfile(email, newName)
                    withContext(Dispatchers.Main) {
                        if (ok) {
                            binding.tvBusinessNameStatus.text = "실시간 반영됨 ✓"
                            binding.tvBusinessNameStatus.setTextColor(Color.parseColor("#34D399"))
                            if (showToast) {
                                Toast.makeText(activity, "🎉 상호명이 '$newName'(으)로 고객 견적 웹앱에 반영되었습니다!", Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            binding.tvBusinessNameStatus.text = "로컬 저장됨"
                            binding.tvBusinessNameStatus.setTextColor(Color.parseColor("#94A3B8"))
                            if (showToast) {
                                Toast.makeText(activity, "상호명이 저장되었습니다 (서버 동기화 대기 중)", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                }
            } else {
                binding.tvBusinessNameStatus.text = "로컬 저장됨"
                binding.tvBusinessNameStatus.setTextColor(Color.parseColor("#94A3B8"))
                if (showToast) {
                    Toast.makeText(activity, "먼저 시트봇 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                }
            }
        }

        binding.btnSaveBusinessName.setOnClickListener {
            saveBusinessNameAction(true)
        }

        binding.etQuoteBusinessName.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) {
                saveBusinessNameAction(true)
                true
            } else {
                false
            }
        }

        binding.etQuoteBusinessName.doAfterTextChanged {
            val newName = it?.toString()?.trim() ?: ""
            prefs.quoteBusinessName = newName
            saveBusinessNameAction(false)
        }

        // 서버 프로필 로드하여 주문 상호명 및 대표 이미지 자동 동기화
        loadOrderProfileAsync()

        binding.btnOpenQuoteSheet.setOnClickListener {
            // 과거 잘못된 구버전 시트 URL 캐시(1feIe5...)가 남아있다면 강제 무효화하여 최신 바인딩(1XCQMxao...) 동기화
            val currentQuoteUrl = prefs.getSheetUrl("QUOTE")
            val currentQuoteId = prefs.getSheetId("QUOTE")
            if (currentQuoteUrl?.contains("1feIe5") == true || currentQuoteId?.contains("1feIe5") == true) {
                prefs.setSheetUrl("QUOTE", "")
                prefs.setSheetId("QUOTE", "")
            }
            onOpenSheetChooser("QUOTE", prefs.quoteDriveSheetTitle)
        }

        // 📱 고객 주도형 모바일 셀프 견적 & 1초 주문 웹앱 바로가기 및 링크 복사
        binding.btnOpenSelfOrderWeb.setOnClickListener {
            val email = prefs.userEmail
            if (email.isNullOrBlank()) {
                Toast.makeText(activity, "먼저 시트봇 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val slug = Base64.encodeToString(email.toByteArray(Charsets.UTF_8), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
            val url = "https://sheetbot.cloud/order/$slug"
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(activity, "웹 브라우저를 열 수 없습니다: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnCopySelfOrderLink.setOnClickListener {
            val email = prefs.userEmail
            if (email.isNullOrBlank()) {
                Toast.makeText(activity, "먼저 시트봇 구글 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val slug = Base64.encodeToString(email.toByteArray(Charsets.UTF_8), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
            val url = "https://sheetbot.cloud/order/$slug"
            try {
                val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("SheetBot Self Order Link", url))

                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_SUBJECT, "간편 주문 링크")
                    putExtra(Intent.EXTRA_TEXT, "간편 주문 링크: $url")
                }
                activity.startActivity(Intent.createChooser(shareIntent, "주문 링크 공유"))
            } catch (e: Exception) {
                Toast.makeText(activity, "주문 링크 공유 실패: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * 서버에서 간편주문 프로필을 비동기로 로드하여 동기화
     */
    fun loadOrderProfileAsync() {
        val currentEmail = prefs.userEmail
        if (currentEmail.isNullOrBlank()) return

        activity.lifecycleScope.launch {
            try {
                val orderProfile = ApiClient.getBusinessProfile(currentEmail, "order")
                if (orderProfile.success) {
                    withContext(Dispatchers.Main) {
                        if (orderProfile.businessName.isNotBlank() && prefs.quoteBusinessName.isBlank()) {
                            prefs.quoteBusinessName = orderProfile.businessName
                            binding.etQuoteBusinessName.setText(orderProfile.businessName)
                        }
                        if (orderProfile.imageUrl.isNotBlank() && orderProfile.imageUrl != "https://sheetbot.cloud/favicon.svg") {
                            prefs.quoteImageUrl = orderProfile.imageUrl
                            if (!localQuoteImageFile.exists() || localQuoteImageFile.length() == 0L) {
                                loadQuoteImageThumbnail(orderProfile.imageUrl)
                            }
                        }
                    }
                }
            } catch (_: Exception) {}
        }
    }

    /**
     * 📷 대표 썸네일 이미지 UI 새로고침 (0초 로컬 파일 우선 + 백그라운드 원격 동기화)
     */
    fun refreshQuoteImageUi() {
        val localFile = localQuoteImageFile
        if (localFile.exists() && localFile.length() > 0) {
            try {
                val bmp = BitmapFactory.decodeFile(localFile.absolutePath)
                if (bmp != null) {
                    binding.ivQuoteImagePreview.setImageBitmap(bmp)
                    binding.tvQuoteImageStatus.text = "등록됨 ✓"
                    binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#34D399"))
                    return
                }
            } catch (e: Exception) {
                Log.w("QuoteSyncController", "로컬 대표 이미지 디코딩 실패: ${e.message}")
            }
        }

        val remoteUrl = prefs.quoteImageUrl
        if (remoteUrl.isNotBlank() && remoteUrl != "https://sheetbot.cloud/favicon.svg") {
            loadQuoteImageThumbnail(remoteUrl)
        } else {
            binding.tvQuoteImageStatus.text = "미등록 (기본 로고)"
            binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#94A3B8"))
        }
    }

    /**
     * 📷 견적 웹앱 및 카카오톡 미리보기용 대표 이미지 선택 처리 (v2.1.25 무손실 영구 캐시 적용)
     */
    fun handleImageSelected(uri: Uri) {
        val email = prefs.userEmail.takeIf { !it.isNullOrBlank() }
            ?: "chachogreat@gmail.com"

        binding.tvQuoteImageStatus.text = "이미지 처리 중..."
        binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#F59E0B"))

        activity.lifecycleScope.launch {
            try {
                val (compressedBytes, displayBitmap) = withContext(Dispatchers.IO) {
                    compressImageForQuote(uri)
                }

                if (compressedBytes.isEmpty() || displayBitmap == null) {
                    withContext(Dispatchers.Main) {
                        binding.tvQuoteImageStatus.text = "이미지 처리 실패"
                        binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#EF4444"))
                    }
                    return@launch
                }

                withContext(Dispatchers.IO) {
                    try {
                        localQuoteImageFile.writeBytes(compressedBytes)
                    } catch (fe: Exception) {
                        Log.e("QuoteSyncController", "로컬 이미지 파일 저장 실패: ${fe.message}")
                    }
                }

                withContext(Dispatchers.Main) {
                    binding.ivQuoteImagePreview.setImageBitmap(displayBitmap)
                    binding.tvQuoteImageStatus.text = "저장됨 (클라우드 동기화 중...)"
                    binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#F59E0B"))
                }

                val fileName = "quote_image_" + System.currentTimeMillis() + ".jpg"
                val mimeType = "image/jpeg"

                val result = ApiClient.uploadQuoteImage(compressedBytes, fileName, mimeType, email)
                withContext(Dispatchers.Main) {
                    if (result.success && !result.imageUrl.isNullOrBlank()) {
                        prefs.quoteImageUrl = result.imageUrl
                        binding.tvQuoteImageStatus.text = "등록됨 ✓ (카톡 반영 완료)"
                        binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#34D399"))
                        Toast.makeText(activity, "🎉 대표 이미지가 안전하게 저장되고 카카오톡 공유 링크에 반영되었습니다!", Toast.LENGTH_SHORT).show()
                    } else {
                        binding.tvQuoteImageStatus.text = "로컬 저장됨 (동기화 지연)"
                        binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#F59E0B"))
                        Toast.makeText(activity, "사진이 기기에 안전하게 저장되었습니다. (네트워크 연결 시 클라우드 자동 동기화)", Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.tvQuoteImageStatus.text = "오류 발생: ${e.message}"
                    binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#EF4444"))
                }
            }
        }
    }

    /**
     * 카카오톡 공유 미리보기 및 웹 최적화를 위한 스마트 다운스케일링 및 JPEG 압축
     */
    private fun compressImageForQuote(uri: Uri): Pair<ByteArray, Bitmap?> {
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
            Log.e("QuoteSyncController", "이미지 압축 실패: ${e.message}", e)
            return Pair(ByteArray(0), null)
        }
    }

    /**
     * 대표 썸네일 이미지 비동기 로드, 로컬 영구 파일 저장 및 표시
     */
    fun loadQuoteImageThumbnail(url: String) {
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
                            localQuoteImageFile.writeBytes(bytes)
                        } catch (fe: Exception) {
                            Log.w("QuoteSyncController", "로컬 이미지 캐싱 실패: ${fe.message}")
                        }

                        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        if (bmp != null) {
                            withContext(Dispatchers.Main) {
                                binding.ivQuoteImagePreview.setImageBitmap(bmp)
                                binding.tvQuoteImageStatus.text = "등록됨 ✓"
                                binding.tvQuoteImageStatus.setTextColor(Color.parseColor("#34D399"))
                            }
                        }
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                Log.w("QuoteSyncController", "대표 썸네일 로드 예외: ${e.message}")
            }
        }
    }

    /**
     * 카드 접기/펼치기 상태 토글
     */
    fun toggleCollapse() {
        prefs.isQuoteSyncDetailsHidden = !prefs.isQuoteSyncDetailsHidden
        refreshCollapseState()
    }

    /**
     * 접기/펼치기 뷰 상태 갱신
     */
    fun refreshCollapseState() {
        activity.updateCardCollapseState(
            binding.layoutQuoteSyncSettings,
            binding.btnToggleQuoteSyncDetails,
            prefs.isQuoteSyncDetailsHidden
        )
    }
}
