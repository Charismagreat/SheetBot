package cloud.sheetbot.agent.user.card

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import android.widget.Toast

/**
 * 🔗 외부 앱 공유하기(Share Intent) 수신 및 라우팅 컨트롤러 (v2.1.99 모듈화)
 *
 * - 외부 앱(유튜브, 웹 브라우저, SNS, 갤러리, 파일 탐색기 등)에서 [공유하기]를 통해 SheetBot Agent로 전달된 인텐트 분석
 * - 웹 링크/유튜브 주소 감지 시 10초 중복 수신 방어 및 웹 링크 스크랩 카드로 라우팅
 * - 단일/다중 로컬 파일(사진/문서 등) 감지 시 구글 드라이브 파일 업로드 카드로 라우팅
 * - 인텐트 중복 소비 방지(Action 클리어 및 초기화)
 */
class SharedIntentRouter(
    private val context: Context,
    private val onBookmarkUrl: (url: String, rawText: String?) -> Unit,
    private val onUploadFiles: (uris: List<Uri>, sourceTag: String) -> Unit,
    private val onClearIntent: () -> Unit
) {
    private var lastHandledShareUrl: String? = null
    private var lastHandledShareTime: Long = 0L

    fun handleSharedIntent(intent: Intent?) {
        if (intent == null) return
        val action = intent.action ?: return

        if (Intent.ACTION_SEND == action) {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
                ?: intent.clipData?.getItemAt(0)?.text?.toString()

            val streamUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            }

            val clipUri = intent.clipData?.getItemAt(0)?.uri
            val urlRegex = Regex("https?://[a-zA-Z0-9.-]+(?:/[^\\s]*)?")
            val matchedUrlInText = if (!sharedText.isNullOrBlank()) urlRegex.find(sharedText)?.value else null
            val isWebUri = clipUri?.scheme in listOf("http", "https")
            val targetUrl = matchedUrlInText ?: (if (isWebUri && clipUri != null) clipUri.toString() else null)

            // 1순위: 텍스트에 웹 링크가 포함되어 있거나 clipUri가 웹 주소인 경우 -> 웹 링크 & 유튜브 자동 스크랩
            if (targetUrl != null) {
                val now = System.currentTimeMillis()
                if (targetUrl == lastHandledShareUrl && (now - lastHandledShareTime) < 10000) {
                    Log.d("SharedIntentRouter", "동일 URL 10초 이내 중복 공유 무시: $targetUrl")
                } else {
                    lastHandledShareUrl = targetUrl
                    lastHandledShareTime = now
                    onBookmarkUrl(targetUrl, sharedText)
                }
            } else {
                // 2순위: 실제 로컬 파일(content:// 또는 file://) 스트림인 경우 -> 구글 드라이브 파일 업로드
                val fileUri = streamUri ?: clipUri?.takeIf { it.scheme in listOf("content", "file") }
                if (fileUri != null) {
                    onUploadFiles(listOf(fileUri), "스마트폰 공유하기(Share) 1초 연동")
                } else if (!sharedText.isNullOrBlank()) {
                    Toast.makeText(context, "공유된 텍스트에서 링크(URL)를 찾을 수 없습니다.", Toast.LENGTH_SHORT).show()
                }
            }
        } else if (Intent.ACTION_SEND_MULTIPLE == action) {
            val uris = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            } ?: emptyList<Uri>()

            val validFileUris = uris.filter { it.scheme in listOf("content", "file") }
            if (validFileUris.isNotEmpty()) {
                onUploadFiles(validFileUris, "스마트폰 공유하기(Share) 다중 연동")
            }
        }

        // 인텐트 중복 소비 방지 (소진 처리)
        intent.action = null
        try {
            onClearIntent()
        } catch (_: Throwable) {}
    }
}
