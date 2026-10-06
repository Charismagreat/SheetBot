package cloud.sheetbot.agent.user

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.Environment
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 스마트폰 단말기(삼성 음성 녹음기 등) 회의 녹음 파일 자동 감지 및
 * 구글 드라이브 / [SheetBot] 회의록 대장 시트 실시간 자동 동기화 매니저
 */
object MeetingRecordingManager {
    private const val TAG = "MeetingRecordingManager"
    private const val NOTIFICATION_CHANNEL_ID = "sheetbot_meeting_recording_channel"

    // 동시 중복 업로드 방지 인메모리 락 (25초 주기 루프 간 중복 파일 전송 차단)
    private val uploadingFiles = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()

    /**
     * 신규 회의 녹음 파일을 탐색하고 설정된 필터 조건에 부합하면 구글 드라이브/시트로 자동 업로드
     */
    suspend fun scanAndUploadNewMeetingRecordings(context: Context, forceReupload: Boolean = false): RecordingSyncResult = withContext(Dispatchers.IO) {
        val prefs = PreferencesManager(context)

        // 1. 기능 활성화 및 페어링 확인
        if (!prefs.isPaired || !prefs.isMeetingRecordingSyncEnabled) {
            return@withContext RecordingSyncResult(
                uploadedCount = 0,
                totalFound = 0,
                alreadySyncedCount = 0,
                message = "회의 녹음 백업 기능이 비활성화되어 있습니다."
            )
        }

        val userEmail = prefs.userEmail
        if (userEmail.isNullOrBlank()) {
            return@withContext RecordingSyncResult(
                uploadedCount = 0,
                totalFound = 0,
                alreadySyncedCount = 0,
                message = "계정이 연동되지 않았습니다."
            )
        }

        // 2. Wi-Fi 전용 업로드 옵션 체크
        if (prefs.isRecordingUploadOnlyOnWifi) {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
            val isWifi = cm?.getNetworkCapabilities(cm.activeNetwork)?.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) == true
            if (!isWifi) {
                Log.d(TAG, "Wi-Fi 환경이 아니므로 회의 녹음 업로드를 일시 보류합니다.")
                return@withContext RecordingSyncResult(
                    uploadedCount = 0,
                    totalFound = 0,
                    alreadySyncedCount = 0,
                    message = "Wi-Fi 환경 대기 중"
                )
            }
        }

        // 3. 단말기 내 음성 녹음 폴더 목록 확인
        val customFolder = prefs.meetingRecordingCustomFolder.trim()
        val candidateFolders = mutableListOf<File>()

        // [우선순위 1] 사용자가 직접 지정한 커스텀 녹음 폴더
        if (customFolder.isNotBlank()) {
            val userDir = File(customFolder)
            candidateFolders.add(userDir)
            if (userDir.exists() && userDir.isDirectory) {
                userDir.listFiles()?.filter { it.isDirectory }?.let { candidateFolders.addAll(it) }
            }
        }

        // [우선순위 2] 국내외 주요 음성 녹음기 표준 저장 경로 자동 탐색
        val standardBaseDirs = listOfNotNull(
            Environment.getExternalStorageDirectory(),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_RECORDINGS),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC)
        )

        for (base in standardBaseDirs) {
            candidateFolders.addAll(
                listOf(
                    File(base, "Recordings/Voice Recorder"),
                    File(base, "Voice Recorder"),
                    File(base, "VoiceRecorder"),
                    File(base, "Recordings/Meeting"),
                    File(base, "Recordings/Meetings"),
                    File(base, "Meeting"),
                    File(base, "Meetings"),
                    File(base, "Recordings/Sounds"),
                    File(base, "Sounds"),
                    File(base, "Recordings"),
                    File(base, "Music/Voice Recorder"),
                    File(base, "Download")
                )
            )
        }

        val supportedExtensions = setOf("m4a", "mp3", "amr", "wav", "aac", "3gp", "ogg", "flac")
        val meetingFiles = mutableListOf<File>()

        for (folder in candidateFolders.distinctBy { it.absolutePath }) {
            if (folder.exists() && folder.isDirectory) {
                val files = folder.listFiles { file ->
                    file.isFile &&
                    file.length() > 2048 && // 2KB 이상
                    file.extension.lowercase() in supportedExtensions &&
                    !file.name.startsWith("통화") && // 통화 녹음 파일은 제외
                    !file.name.startsWith("[T전화")
                }
                if (!files.isNullOrEmpty()) {
                    meetingFiles.addAll(files)
                }
            }
        }

        val totalFound = meetingFiles.size
        if (totalFound == 0) {
            return@withContext RecordingSyncResult(
                uploadedCount = 0,
                totalFound = 0,
                alreadySyncedCount = 0,
                message = "동기화할 회의 녹음 파일이 없습니다."
            )
        }

        // 최신 수정 시간 순 정렬
        meetingFiles.sortByDescending { it.lastModified() }

        val syncedFilesPref = context.getSharedPreferences("sheetbot_synced_meeting_recordings", Context.MODE_PRIVATE)
        var uploadedCount = 0
        var alreadySyncedCount = 0

        // 최근 20개 파일 검사
        for (file in meetingFiles.take(20)) {
            val fileKey = "${file.name}_${file.length()}"

            if (!forceReupload && syncedFilesPref.getBoolean(fileKey, false)) {
                alreadySyncedCount++
                continue
            }

            if (uploadingFiles.contains(fileKey)) {
                continue
            }

            // 파일 수정 후 3초 이상 경과했는지 확인 (녹음 중인 파일 조기 업로드 방지)
            if (System.currentTimeMillis() - file.lastModified() < 3000) {
                Log.d(TAG, "현재 녹음 중인 파일로 추정되어 대기: ${file.name}")
                continue
            }

            uploadingFiles.add(fileKey)
            try {
                showUploadNotification(context, "회의 녹음 동기화 중", file.name)

                val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA)
                val meetingTime = sdf.format(Date(file.lastModified()))
                val cleanTopic = file.nameWithoutExtension.replace("^음성\\s*녹음\\s*".toRegex(), "사내 회의 ")

                val uploadResult = ApiClient.uploadMeetingRecording(
                    file = file,
                    fileName = file.name,
                    topic = cleanTopic,
                    meetingTime = meetingTime,
                    userEmail = userEmail,
                    folderName = prefs.meetingRecordingDriveFolder
                )

                if (uploadResult.success) {
                    uploadedCount++
                    syncedFilesPref.edit().putBoolean(fileKey, true).apply()
                    Log.i(TAG, "🎉 [회의 녹음 자동 동기화 성공] ${file.name}")
                    showUploadSuccessNotification(context, file.name)
                } else {
                    Log.w(TAG, "회의 녹음 업로드 실패: ${uploadResult.error}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "회의 녹음 처리 중 예외 발생: ${e.message}", e)
            } finally {
                uploadingFiles.remove(fileKey)
            }
        }

        RecordingSyncResult(
            uploadedCount = uploadedCount,
            totalFound = totalFound,
            alreadySyncedCount = alreadySyncedCount,
            message = if (uploadedCount > 0) "${uploadedCount}건의 회의 녹음이 동기화되었습니다." else "동기화 완료"
        )
    }

    private fun showUploadNotification(context: Context, title: String, content: String) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "회의 녹음 동기화",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "회의 녹음 파일 구글 드라이브 및 회의록 대장 자동 백업 알림"
            }
            nm.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_upload)
            .setContentTitle(title)
            .setContentText(content)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .build()

        nm.notify(9002, notification)
    }

    private fun showUploadSuccessNotification(context: Context, fileName: String) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification = NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("🎙️ 회의록 작성 요청 완료")
            .setContentText("[$fileName] 구글 드라이브 보관 및 AI 회의록 대장 정리 중")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setTimeoutAfter(8000)
            .build()

        nm.notify(9003, notification)
    }
}
