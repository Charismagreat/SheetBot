package cloud.sheetbot.agent.user.card

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

/**
 * 🚀 액티비티 결과 런처(ActivityResultLauncher) 통합 레지스트리 (v2.1.99 모듈화)
 *
 * - 안드로이드 생명주기(INITIALIZED/CREATED)에 맞춰 20여 개 런처를 단일 레지스트리에서 일괄 등록
 * - 파일 선택기, 권한 요청, 주소록 피커, QR 스캐너, 구글 로그인 등의 콜백 라우팅 캡슐화
 */
class ActivityLauncherRegistry(
    private val activity: ComponentActivity,
    private val getPrefsUserEmail: () -> String?,
    private val onAiCommandReceived: (String) -> Unit,
    private val isAccountPairingInitialized: () -> Boolean,
    private val getAccountPairing: () -> AccountPairingController,
    private val isPermissionInitialized: () -> Boolean,
    private val getPermission: () -> PermissionController,
    private val isFileUploadInitialized: () -> Boolean,
    private val getFileUpload: () -> FileUploadCardController,
    private val isCallRecordInitialized: () -> Boolean,
    private val getCallRecord: () -> CallRecordCardController,
    private val isReceiptInitialized: () -> Boolean,
    private val getReceipt: () -> ReceiptSyncCardController,
    private val isBusinessCardInitialized: () -> Boolean,
    private val getBusinessCard: () -> BusinessCardSyncCardController,
    private val isCallEndedInitialized: () -> Boolean,
    private val getCallEnded: () -> CallEndedCardController,
    private val isQuoteInitialized: () -> Boolean,
    private val getQuote: () -> QuoteSyncCardController,
    private val isEstimateInitialized: () -> Boolean,
    private val getEstimate: () -> EstimateSyncCardController,
    private val isLawInitialized: () -> Boolean,
    private val getLaw: () -> LawAdvisoryCardController,
    private val isBlogInitialized: () -> Boolean,
    private val getBlog: () -> BlogAutomationCardController,
    private val isInstaInitialized: () -> Boolean,
    private val getInsta: () -> InstagramAutomationCardController,
    private val isSiteInitialized: () -> Boolean,
    private val getSite: () -> MobileSiteCardController,
    private val isKakaoInitialized: () -> Boolean,
    private val getKakao: () -> KakaoSyncCardController,
    private val isTargetFilterInitialized: () -> Boolean,
    private val getTargetFilter: () -> TargetFilterController
) {
    // 1. QR 코드 스캐너 런처
    val barcodeLauncher: ActivityResultLauncher<ScanOptions> = activity.registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null && isAccountPairingInitialized()) {
            getAccountPairing().handleQrScanResult(result.contents)
        }
    }

    // 2. 런타임 권한 요청 런처
    val permissionLauncher: ActivityResultLauncher<Array<String>> = activity.registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (isPermissionInitialized()) {
            getPermission().onPermissionResult(permissions)
        }
    }

    // 3. 파일 업로드 런처
    val filePickerLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (!uris.isNullOrEmpty() && isFileUploadInitialized()) {
            getFileUpload().uploadFiles(uris, "앱 내 직접 선택 파일 업로드")
        }
    }

    // 4. 다른 폰/외부에서 전송받은 통화 녹음 파일 직접 선택 런처
    val externalRecordingPickerLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (!uris.isNullOrEmpty() && isCallRecordInitialized()) {
            getCallRecord().uploadExternalRecordings(uris)
        }
    }

    // 5. 🎙️ 화자 분리용 내 목소리 녹음 마이크 권한 요청 런처
    val recordAudioPermissionLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val email = getPrefsUserEmail()
            if (!email.isNullOrBlank() && isCallRecordInitialized()) {
                getCallRecord().showRecordVoiceProfileDialog(email)
            }
        } else {
            Toast.makeText(activity, "내 목소리 화자 등록을 위해 마이크 녹음 권한이 필요합니다.", Toast.LENGTH_SHORT).show()
        }
    }

    // 6. 영수증 AI OCR 장부화 전용 이미지/문서 선택 런처
    val receiptPickerLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && isReceiptInitialized()) {
            getReceipt().uploadReceipt(uri)
        }
    }

    // 7. 명함 AI OCR 인맥 등록 전용 이미지/문서 선택 런처
    val businessCardPickerLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && isBusinessCardInitialized()) {
            getBusinessCard().uploadBusinessCard(uri)
        }
    }

    // 8. 통화 종료 모바일 명함 발송용 첨부 이미지 선택 런처
    val callEndedImagePickerLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && isCallEndedInitialized()) {
            getCallEnded().handleImageSelected(uri)
        }
    }

    // 9. 간편주문 웹앱 및 카카오톡 미리보기용 대표 이미지 선택 런처
    val quoteImagePickerLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && isQuoteInitialized()) {
            getQuote().handleImageSelected(uri)
        }
    }

    // 10. 간편견적 웹앱 및 카카오톡 미리보기용 대표 이미지 선택 런처
    val estimateImagePickerLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && isEstimateInitialized()) {
            getEstimate().handleImageSelected(uri)
        }
    }

    // 11. 법률 자문 서류 런처
    val lawAdvisoryFilePickerLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && isLawInitialized()) {
            getLaw().handleFileSelected(uri)
        }
    }

    // 12. 네이버 블로그 사진 복수 첨부 런처
    val blogImagesPickerLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (!uris.isNullOrEmpty() && isBlogInitialized()) {
            getBlog().handleImagesSelected(uris)
        }
    }

    // 13. 인스타그램 사진 복수 첨부 런처
    val instaImagesPickerLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (!uris.isNullOrEmpty() && isInstaInitialized()) {
            getInsta().handleImagesSelected(uris)
        }
    }

    // 14. 모바일 홈페이지 사진 복수 첨부 런처
    val siteImagesPickerLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (!uris.isNullOrEmpty() && isSiteInitialized()) {
            getSite().handleImagesSelected(uris)
        }
    }

    // 15. 카카오톡 대화 내용 내보내기 파일 선택 런처
    val kakaoChatPickerLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && isKakaoInitialized()) {
            getKakao().handleFileSelected(uri)
        }
    }

    // 16. 자연어 AI 시트 코파일럿 음성 인식 런처
    val speechRecognizerLauncher: ActivityResultLauncher<Intent> = activity.registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val matches = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            if (!matches.isNullOrEmpty()) {
                val spokenText = matches[0]
                onAiCommandReceived(spokenText)
            }
        }
    }

    // 17. 연락처 선택 런처 (기록 대상 주소록 피커)
    val contactPickerLauncher: ActivityResultLauncher<Intent> = activity.registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val contactUri = result.data?.data
            if (contactUri != null && isTargetFilterInitialized()) {
                getTargetFilter().handlePickedContact(contactUri)
            }
        }
    }

    // 18. 연락처 권한 요청 런처
    val contactPermissionLauncher: ActivityResultLauncher<String> = activity.registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isTargetFilterInitialized()) {
            getTargetFilter().onPermissionResult(isGranted)
        }
    }

    // 19. Google 원클릭 로그인 런처
    val googleSignInLauncher: ActivityResultLauncher<Intent> = activity.registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (isAccountPairingInitialized()) {
            getAccountPairing().handleGoogleSignInResult(result.data)
        }
    }

    // 20. 안드로이드 시스템 구글 계정 선택기 런처
    val accountPickerLauncher: ActivityResultLauncher<Intent> = activity.registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (isAccountPairingInitialized()) {
            getAccountPairing().handleAccountPickerResult(result.resultCode, result.data)
        }
    }
}
