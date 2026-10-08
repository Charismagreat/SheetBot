package cloud.sheetbot.agent.user.card

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.CountDownTimer
import android.os.Environment
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.CallRecordingManager
import cloud.sheetbot.agent.user.R
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * 🎙️ 통화 녹음 AI 전사, 화자 분리 성문 등록 & 구글 드라이브 자동 백업 카드 컨트롤러
 *
 * - 통화 녹음 구글 드라이브 백업 및 대장 연동 스위치
 * - 녹음 감지 대상 어플/폴더(SKT 에이닷, T전화, 갤럭시, 전체 자동 감지 등) 설정
 * - 대상 번호/키워드 필터링 및 연락처 선택기 연동
 * - 통화 종료 즉시 녹음 자동 업로드 / Wi-Fi 전용 업로드 토글
 * - 외부 녹음 파일 수동 업로드 (다른 폰/외부 녹음 파일)
 * - 🎙️ 화자 분리용 내 목소리(성문) 5초 녹음 및 실시간 상태 감시
 * - 카드 펼침/접힘 상태 관리
 */
class CallRecordCardController(
    private val activity: AppCompatActivity,
    private val binding: ActivityMainBinding,
    private val prefs: AppPreferences,
    private val scope: CoroutineScope,
    private val checkAndRequestAllFilesAccess: () -> Unit,
    private val provisionSheetAsync: (type: String, defaultTitle: String, folderName: String) -> Unit,
    private val checkAndLaunchContactPicker: (type: String) -> Unit,
    private val showTargetManageDialog: (title: String, targetEditText: EditText, type: String) -> Unit,
    private val updateTargetBadges: () -> Unit,
    private val showOpenSheetChooserDialog: (type: String, title: String) -> Unit,
    private val openDriveFolder: (type: String, folderName: String) -> Unit,
    private val launchExternalRecordingPicker: () -> Unit,
    private val requestRecordAudioPermission: () -> Unit,
    private val updateCardCollapseState: (layout: View, button: View, isHidden: Boolean) -> Unit
) {

    private var voicePollingJob: Job? = null

    fun setup() {
        // 통화 녹음 구글 드라이브 자동 백업 UI 바인딩 및 실시간 자동 저장 (Auto-Save)
        binding.switchCallRecording.isChecked = prefs.isCallRecordingSyncEnabled
        binding.etRecordingTargetFilter.setText(prefs.callRecordingTargetFilter)

        binding.switchCallRecording.setOnCheckedChangeListener { _, isChecked ->
            prefs.isCallRecordingSyncEnabled = isChecked
            prefs.isCallRecordingDetailsHidden = !isChecked
            updateCardCollapseState(binding.layoutCallRecordingSettings, binding.btnToggleCallRecordingDetails, !isChecked)
            val msg = if (isChecked) "통화 녹음 드라이브 자동 저장이 켜졌습니다." else "통화 녹음 드라이브 저장이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                checkAndRequestAllFilesAccess()
                provisionSheetAsync("RECORDING", "[SheetBot] 통화 녹음 대장", prefs.callRecordingDriveFolder)
            }
        }

        binding.btnPickRecordingContact.setOnClickListener {
            checkAndLaunchContactPicker("RECORDING")
        }
        binding.btnManageRecordingTargets.setOnClickListener {
            showTargetManageDialog("🎙️ 통화 녹음 업로드 대상 관리", binding.etRecordingTargetFilter, "RECORDING")
        }

        binding.etRecordingTargetFilter.doAfterTextChanged {
            prefs.callRecordingTargetFilter = it?.toString()?.trim() ?: ""
            updateTargetBadges()
        }

        binding.btnOpenRecordingSheet.setOnClickListener {
            showOpenSheetChooserDialog("RECORDING", "[SheetBot] 통화 녹음 대장")
        }
        binding.btnOpenRecordingFolder.setOnClickListener {
            openDriveFolder("RECORDING", prefs.callRecordingDriveFolder)
        }

        updateRecordingSourceFolderBadge()
        binding.btnChangeRecordingFolder.setOnClickListener {
            showRecordingFolderChooserDialog()
        }

        // 통화 종료 즉시 녹음 자동 업로드 스위치 바인딩
        binding.switchCallEndedAutoUpload.isChecked = prefs.isCallEndedAutoUploadEnabled
        binding.switchCallEndedAutoUpload.setOnCheckedChangeListener { _, isChecked ->
            prefs.isCallEndedAutoUploadEnabled = isChecked
            val msg = if (isChecked) "통화 종료 즉시 녹음 자동 업로드가 켜졌습니다." else "통화 종료 즉시 자동 업로드가 꺼졌습니다 (수동 동기화 모드)."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
        }

        // Wi-Fi 환경 전용 업로드 스위치 바인딩
        binding.switchRecordingUploadOnlyOnWifi.isChecked = prefs.isRecordingUploadOnlyOnWifi
        binding.switchRecordingUploadOnlyOnWifi.setOnCheckedChangeListener { _, isChecked ->
            prefs.isRecordingUploadOnlyOnWifi = isChecked
            val msg = if (isChecked) "Wi-Fi 환경에서만 녹음이 자동 업로드됩니다 (데이터 절약)." else "모바일 데이터 및 Wi-Fi 환경 모두에서 자동 업로드됩니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
        }

        binding.btnSyncRecordingsNow.setOnClickListener {
            // 다른 폰/외부에서 전송받은 통화 녹음 파일(.m4a, .mp3 등) 직접 선택
            launchExternalRecordingPicker()
        }

        // 🎙️ 화자 분리용 내 목소리(성문) 등록 UI 바인딩
        setupVoiceProfileUI()
    }

    fun refreshCollapseState() {
        updateCardCollapseState(
            binding.layoutCallRecordingSettings,
            binding.btnToggleCallRecordingDetails,
            prefs.isCallRecordingDetailsHidden
        )
    }

    fun toggleCollapse() {
        prefs.isCallRecordingDetailsHidden = !prefs.isCallRecordingDetailsHidden
        refreshCollapseState()
    }

     * 🎙️ 통화 녹음 감지 대상 어플 / 폴더 뱃지 갱신 (v2.1.26)
     */
    fun updateRecordingSourceFolderBadge() {
        val custom = prefs.callRecordingCustomFolder.trim()
        if (custom.isBlank()) {
            binding.tvRecordingSourceFolderBadge.text = "✨ 자동 감지 (에이닷, T전화, 갤럭시, 전체)"
            binding.tvRecordingSourceFolderBadge.setTextColor(Color.parseColor("#38BDF8"))
        } else {
            val shortName = try {
                File(custom).name.takeIf { it.isNotBlank() } ?: custom
            } catch (_: Exception) { custom }
            binding.tvRecordingSourceFolderBadge.text = "📁 $shortName (선택됨)"
            binding.tvRecordingSourceFolderBadge.setTextColor(Color.parseColor("#34D399"))
        }
    }

    /**
     * 🎙️ 통화 녹음 감지 대상 어플 / 폴더 선택 다이얼로그 (v2.1.26)
     */
    fun showRecordingFolderChooserDialog() {
        val options = arrayOf(
            "✨ 전체 자동 감지 (권장: 에이닷, T전화, 갤럭시, 전체 동시 탐색)",
            "🔵 SKT 에이닷 (A.) 전용 (Recordings/TPhoneCallRecords)",
            "🟢 SKT / 일반 T전화 (Recordings/TPhone)",
            "⚪ 삼성 갤럭시 기본 전화 (Recordings/Call)",
            "✏️ 폴더 경로 직접 입력 (기타 녹음 어플 / SD카드)"
        )

        androidx.appcompat.app.AlertDialog.Builder(activity)
            .setTitle("🎙️ 통화 녹음 감지 어플 / 폴더 설정")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> {
                        prefs.callRecordingCustomFolder = ""
                        updateRecordingSourceFolderBadge()
                        Toast.makeText(activity, "✨ 모든 통화 녹음 앱 자동 감지로 설정되었습니다.", Toast.LENGTH_SHORT).show()
                    }
                    1 -> {
                        val path = File(Environment.getExternalStorageDirectory(), "Recordings/TPhoneCallRecords").absolutePath
                        prefs.callRecordingCustomFolder = path
                        updateRecordingSourceFolderBadge()
                        Toast.makeText(activity, "🔵 에이닷(A.) 녹음 폴더가 지정되었습니다.", Toast.LENGTH_SHORT).show()
                    }
                    2 -> {
                        val path = File(Environment.getExternalStorageDirectory(), "Recordings/TPhone").absolutePath
                        prefs.callRecordingCustomFolder = path
                        updateRecordingSourceFolderBadge()
                        Toast.makeText(activity, "🟢 T전화 녹음 폴더가 지정되었습니다.", Toast.LENGTH_SHORT).show()
                    }
                    3 -> {
                        val path = File(Environment.getExternalStorageDirectory(), "Recordings/Call").absolutePath
                        prefs.callRecordingCustomFolder = path
                        updateRecordingSourceFolderBadge()
                        Toast.makeText(activity, "⚪ 삼성 갤럭시 기본 전화 녹음 폴더가 지정되었습니다.", Toast.LENGTH_SHORT).show()
                    }
                    4 -> {
                        showCustomFolderInputDialog()
                    }
                }
            }
            .setNegativeButton("닫기", null)
            .show()
    }

    /**
     * 기타 녹음 앱 커스텀 폴더 직접 입력 모달
     */
    private fun showCustomFolderInputDialog() {
        val input = android.widget.EditText(activity).apply {
            hint = "예: /storage/emulated/0/Recordings/폴더명"
            setText(prefs.callRecordingCustomFolder)
            setSelection(text.length)
        }

        androidx.appcompat.app.AlertDialog.Builder(activity)
            .setTitle("📁 녹음 저장 폴더 경로 입력")
            .setMessage("사용 중이신 통화 녹음 어플의 저장 폴더 절대 경로를 입력해 주세요.")
            .setView(input)
            .setPositiveButton("저장") { _, _ ->
                val entered = input.text.toString().trim()
                prefs.callRecordingCustomFolder = entered
                updateRecordingSourceFolderBadge()
                Toast.makeText(activity, "녹음 폴더 경로가 저장되었습니다.", Toast.LENGTH_SHORT).show()
            }
            .setNeutralButton("자동 감지로 리셋") { _, _ ->
                prefs.callRecordingCustomFolder = ""
                updateRecordingSourceFolderBadge()
                Toast.makeText(activity, "✨ 전체 자동 감지로 복원되었습니다.", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("취소", null)
            .show()
    }

    /**
     * 📁 다른 폰/외부 녹음 파일(.m4a, .mp3 등) 직접 선택 업로드 처리
     */
    fun uploadExternalRecordings(uris: List<Uri>) {
        if (!prefs.isPaired) {
            Toast.makeText(activity, "⚠️ 시트봇 계정 연동 후 업로드할 수 있습니다.", Toast.LENGTH_LONG).show()
            return
        }

        binding.btnSyncRecordingsNow.isEnabled = false
        binding.btnSyncRecordingsNow.text = "⏳ 녹음 파일 업로드 중..."
        Toast.makeText(activity, "📁 ${uris.size}개의 녹음 파일을 구글 드라이브로 업로드합니다...", Toast.LENGTH_SHORT).show()

        scope.launch(Dispatchers.IO) {
            try {
                val result = CallRecordingManager.uploadExternalRecordingsFromUris(activity, uris)
                withContext(Dispatchers.Main) {
                    binding.btnSyncRecordingsNow.isEnabled = true
                    binding.btnSyncRecordingsNow.text = "📁 녹음 파일 직접 업로드"

                    val dialogTitle = if (result.uploadedCount > 0) "🎉 녹음 파일 업로드 완료" else "⚠️ 업로드 결과 안내"
                    AlertDialog.Builder(activity)
                        .setTitle(dialogTitle)
                        .setMessage(result.message)
                        .setPositiveButton("확인", null)
                        .show()
                }
            } catch (e: Throwable) {
                Log.e("MainActivity", "uploadExternalRecordings 오류: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    binding.btnSyncRecordingsNow.isEnabled = true
                    binding.btnSyncRecordingsNow.text = "📁 녹음 파일 직접 업로드"
                    Toast.makeText(activity, "업로드 중 오류가 발생했습니다: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /**
     * 🎙️ 통화 녹음 화자 구분을 위한 내 목소리(성문) 등록 UI 설정 (v2.1.84)
     */
    private fun setupVoiceProfileUI() {
        val email = prefs.userEmail
        refreshVoiceProfileStatus(email)

        binding.btnRecordVoiceProfile.setOnClickListener {
            val currentEmail = prefs.userEmail
            if (currentEmail.isNullOrBlank()) {
                Toast.makeText(activity, "먼저 시트봇 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                showRecordVoiceProfileDialog(currentEmail)
            } else {
                requestRecordAudioPermission()
            }
        }

        binding.btnDeleteVoiceProfile.setOnClickListener {
            val currentEmail = prefs.userEmail ?: return@setOnClickListener
            AlertDialog.Builder(activity)
                .setTitle("내 목소리 성문 삭제")
                .setMessage("등록된 내 목소리(화자 프로필)를 삭제하시겠습니까?\n\n삭제 후에도 안드로이드 기본 2채널(Stereo) 물리 분리 기술은 정상 작동합니다.")
                .setPositiveButton("삭제") { _, _ ->
                    scope.launch(Dispatchers.IO) {
                        val success = ApiClient.deleteVoiceProfile(currentEmail)
                        withContext(Dispatchers.Main) {
                            if (success) {
                                Toast.makeText(activity, "내 목소리 성문이 삭제되었습니다.", Toast.LENGTH_SHORT).show()
                                refreshVoiceProfileStatus(currentEmail)
                            } else {
                                Toast.makeText(activity, "성문 삭제에 실패했습니다.", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                }
                .setNegativeButton("취소", null)
                .show()
        }
    }

    /**
     * 🎙️ 내 목소리 성문 등록 여부 실시간 조회 및 상태 뱃지 갱신
     */
    fun refreshVoiceProfileStatus(email: String?) {
        if (email.isNullOrBlank()) {
            binding.tvVoiceProfileStatus.text = "미연동"
            binding.tvVoiceProfileStatus.setTextColor(Color.parseColor("#94A3B8"))
            binding.btnDeleteVoiceProfile.visibility = View.GONE
            return
        }

        scope.launch(Dispatchers.IO) {
            val res = ApiClient.fetchVoiceProfile(email)
            withContext(Dispatchers.Main) {
                if (!activity.isFinishing && !activity.isDestroyed) {
                    if (res.success && res.isEnrolled) {
                        binding.tvVoiceProfileStatus.text = "🟢 등록됨 (${res.speakerName ?: "본인"})"
                        binding.tvVoiceProfileStatus.setTextColor(Color.parseColor("#34D399"))
                        binding.btnRecordVoiceProfile.text = "🎙️ 내 목소리 다시 녹음"
                        binding.btnDeleteVoiceProfile.visibility = View.VISIBLE
                    } else if (res.status == "PROCESSING") {
                        binding.tvVoiceProfileStatus.text = "🟡 AI 성문 분석 중..."
                        binding.tvVoiceProfileStatus.setTextColor(Color.parseColor("#F59E0B"))
                        binding.btnRecordVoiceProfile.text = "🎙️ 내 목소리 5초 녹음 등록"
                        binding.btnDeleteVoiceProfile.visibility = View.GONE
                        startVoiceProfilePolling(email)
                    } else {
                        binding.tvVoiceProfileStatus.text = "미등록 (녹음 권장)"
                        binding.tvVoiceProfileStatus.setTextColor(Color.parseColor("#F59E0B"))
                        binding.btnRecordVoiceProfile.text = "🎙️ 내 목소리 5초 녹음 등록"
                        binding.btnDeleteVoiceProfile.visibility = View.GONE
                    }
                }
            }
        }
    }

    

    /**
     * 🎙️ 비동기 성문 분석 완료 대기 폴링 (6초 간격 최대 7회)
     */
    private fun startVoiceProfilePolling(email: String) {
        voicePollingJob?.cancel()
        voicePollingJob = scope.launch(Dispatchers.IO) {
            for (attempt in 1..7) {
                kotlinx.coroutines.delay(6000L)
                val check = ApiClient.fetchVoiceProfile(email)
                if (check.success && check.isEnrolled) {
                    withContext(Dispatchers.Main) {
                        if (!activity.isFinishing && !activity.isDestroyed) {
                            binding.tvVoiceProfileStatus.text = "🟢 등록됨 (${check.speakerName ?: "본인"})"
                            binding.tvVoiceProfileStatus.setTextColor(Color.parseColor("#34D399"))
                            binding.btnRecordVoiceProfile.text = "🎙️ 내 목소리 다시 녹음"
                            binding.btnDeleteVoiceProfile.visibility = View.VISIBLE
                            Toast.makeText(activity, "🎉 '내 목소리' 성문 등록이 완료되었습니다!", Toast.LENGTH_SHORT).show()
                        }
                    }
                    break
                }
            }
        }
    }

    /**
     * 🎙️ 5초 내 목소리 녹음 및 성문 등록 커스텀 다이얼로그
     */
    fun showRecordVoiceProfileDialog(email: String) {
        val dialogView = activity.layoutInflater.inflate(R.layout.dialog_record_voice_profile, null)
        val dialog = AlertDialog.Builder(activity)
            .setView(dialogView)
            .setCancelable(false)
            .create()

        val btnClose = dialogView.findViewById<TextView>(R.id.btnCloseDialog)
        val tvRecordStatus = dialogView.findViewById<TextView>(R.id.tvRecordStatus)
        val tvTimerCount = dialogView.findViewById<TextView>(R.id.tvTimerCount)
        val pbRecordProgress = dialogView.findViewById<ProgressBar>(R.id.pbRecordProgress)
        val btnStartRecord = dialogView.findViewById<Button>(R.id.btnStartRecord)
        val layoutPostRecord = dialogView.findViewById<View>(R.id.layoutPostRecordControls)
        val btnPlayPreview = dialogView.findViewById<Button>(R.id.btnPlayPreview)
        val btnReRecord = dialogView.findViewById<Button>(R.id.btnReRecord)
        val btnUploadVoice = dialogView.findViewById<Button>(R.id.btnUploadVoiceProfile)

        val outputFile = File(activity.cacheDir, "voice_profile_sample.m4a")
        var mediaRecorder: MediaRecorder? = null
        var mediaPlayer: MediaPlayer? = null
        var recordTimer: CountDownTimer? = null
        var isRecording = false

        fun cleanupRecorder() {
            try {
                if (isRecording) {
                    mediaRecorder?.stop()
                }
            } catch (_: Exception) {}
            try {
                mediaRecorder?.release()
            } catch (_: Exception) {}
            mediaRecorder = null
            recordTimer?.cancel()
            recordTimer = null
            isRecording = false
        }

        fun cleanupPlayer() {
            try {
                mediaPlayer?.stop()
                mediaPlayer?.release()
            } catch (_: Exception) {}
            mediaPlayer = null
        }

        btnClose.setOnClickListener {
            cleanupRecorder()
            cleanupPlayer()
            dialog.dismiss()
        }

        fun startRecording() {
            cleanupRecorder()
            cleanupPlayer()
            try {
                if (outputFile.exists()) outputFile.delete()

                val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    MediaRecorder(activity)
                } else {
                    @Suppress("DEPRECATION")
                    MediaRecorder()
                }
                recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
                recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                recorder.setAudioSamplingRate(44100)
                recorder.setAudioEncodingBitRate(128000)
                recorder.setOutputFile(outputFile.absolutePath)
                recorder.prepare()
                recorder.start()

                mediaRecorder = recorder
                isRecording = true

                btnStartRecord.isEnabled = false
                btnStartRecord.text = "🎙️ 녹음 중... (평소 목소리로 읽어주세요)"
                btnStartRecord.setBackgroundColor(Color.parseColor("#B91C1C"))
                tvRecordStatus.text = "🔴 음성 수음 중... (5초 후 자동 완료)"
                tvRecordStatus.setTextColor(Color.parseColor("#EF4444"))
                pbRecordProgress.progress = 0

                val totalDurationMs = 5000L
                val intervalMs = 100L
                recordTimer = object : CountDownTimer(totalDurationMs, intervalMs) {
                    override fun onTick(millisUntilFinished: Long) {
                        val elapsedMs = totalDurationMs - millisUntilFinished
                        val progress = (elapsedMs * 50 / totalDurationMs).toInt()
                        pbRecordProgress.progress = progress
                        val seconds = (elapsedMs / 1000).toInt() + 1
                        tvTimerCount.text = "${seconds}초 / 5초"
                    }

                    override fun onFinish() {
                        pbRecordProgress.progress = 50
                        tvTimerCount.text = "5초 / 5초"
                        tvRecordStatus.text = "✓ 5초 녹음 완료! 아래에서 미리듣기 또는 등록하세요."
                        tvRecordStatus.setTextColor(Color.parseColor("#34D399"))

                        cleanupRecorder()

                        btnStartRecord.visibility = View.GONE
                        layoutPostRecord.visibility = View.VISIBLE
                    }
                }.start()

            } catch (e: Exception) {
                cleanupRecorder()
                Toast.makeText(activity, "마이크 녹음 시작 실패: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
                tvRecordStatus.text = "녹음 오류 발생"
                btnStartRecord.isEnabled = true
                btnStartRecord.text = "🔴 다시 시도"
            }
        }

        btnStartRecord.setOnClickListener {
            startRecording()
        }

        btnReRecord.setOnClickListener {
            cleanupPlayer()
            layoutPostRecord.visibility = View.GONE
            btnStartRecord.visibility = View.VISIBLE
            btnStartRecord.isEnabled = true
            btnStartRecord.text = "🔴 지금 5초 녹음 시작"
            btnStartRecord.setBackgroundColor(Color.parseColor("#DC2626"))
            tvRecordStatus.text = "준비 완료 (녹음 버튼을 눌러주세요)"
            tvRecordStatus.setTextColor(Color.parseColor("#CBD5E1"))
            pbRecordProgress.progress = 0
            tvTimerCount.text = "0초 / 5초"
        }

        btnPlayPreview.setOnClickListener {
            if (!outputFile.exists() || outputFile.length() == 0L) {
                Toast.makeText(activity, "녹음 파일이 없습니다.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            cleanupPlayer()
            try {
                val player = MediaPlayer()
                player.setDataSource(outputFile.absolutePath)
                player.prepare()
                player.start()
                btnPlayPreview.text = "🔊 재생 중..."
                player.setOnCompletionListener {
                    btnPlayPreview.text = "▶️ 다시 듣기"
                    cleanupPlayer()
                }
                mediaPlayer = player
            } catch (e: Exception) {
                Toast.makeText(activity, "재생 실패: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
                btnPlayPreview.text = "▶️ 미리듣기"
            }
        }

        btnUploadVoice.setOnClickListener {
            if (!outputFile.exists() || outputFile.length() < 2048L) {
                Toast.makeText(activity, "유효한 녹음 데이터가 없습니다. 다시 녹음해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            cleanupPlayer()
            btnUploadVoice.isEnabled = false
            btnUploadVoice.text = "☁️ 성문 프로필 등록 중..."

            scope.launch(Dispatchers.IO) {
                try {
                    val bytes = outputFile.readBytes()
                    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    val result = ApiClient.enrollVoiceProfile(email, base64, "voice_profile_sample.m4a")

                    withContext(Dispatchers.Main) {
                        if (result.success) {
                            Toast.makeText(activity, "🎉 음성이 접수되었습니다! AI가 성문을 분석하고 있습니다.", Toast.LENGTH_SHORT).show()
                            dialog.dismiss()
                            binding.tvVoiceProfileStatus.text = "🟡 AI 성문 분석 중..."
                            binding.tvVoiceProfileStatus.setTextColor(Color.parseColor("#F59E0B"))
                            startVoiceProfilePolling(email)
                        } else {
                            btnUploadVoice.isEnabled = true
                            btnUploadVoice.text = "☁️ 내 목소리로 등록하기"
                            Toast.makeText(activity, "등록 실패: ${result.error}", Toast.LENGTH_LONG).show()
                        }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        btnUploadVoice.isEnabled = true
                        btnUploadVoice.text = "☁️ 내 목소리로 등록하기"
                        Toast.makeText(activity, "전송 오류: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }

        dialog.show()
    }
}
