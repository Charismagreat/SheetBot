package cloud.sheetbot.agent.user

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 삼성 갤럭시 단말기 통화 자동 녹음 파일 감지 및
 * 구글 드라이브 / [SheetBot] 통화 녹음 대장 시트 실시간 자동 동기화 매니저
 */
object CallRecordingManager {
    private const val TAG = "CallRecordingManager"
    private const val NOTIFICATION_CHANNEL_ID = "sheetbot_call_recording_channel"

    /**
     * 삼성 통화 녹음 파일 표준 정규식:
     * 통화 녹음 [이름 또는 전화번호]_[YYMMDD]_[HHMMSS].m4a
     */
    private val RECORDING_REGEX = Regex("""통화\s*녹음\s*([^_]+)_(\d{6})_(\d{6})""", RegexOption.IGNORE_CASE)

    /**
     * 신규 통화 녹음 파일을 탐색하고 설정된 필터 조건에 부합하면 구글 드라이브로 자동 업로드
     * @return 업로드 성공한 녹음 파일 건수
     */
    suspend fun scanAndUploadNewRecordings(context: Context): Int = withContext(Dispatchers.IO) {
        val prefs = PreferencesManager(context)

        // 1. 기능 활성화 및 페어링 확인
        if (!prefs.isPaired || !prefs.isCallRecordingSyncEnabled) {
            return@withContext 0
        }

        val userEmail = prefs.userEmail
        if (userEmail.isNullOrBlank()) {
            return@withContext 0
        }

        // 2. 단말기 내 통화 녹음 폴더 목록 확인
        val candidateFolders = listOf(
            File(Environment.getExternalStorageDirectory(), "Recordings/Call"),
            File(Environment.getExternalStorageDirectory(), "Recordings/Calls"),
            File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_RECORDINGS), "Call"),
            File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_RECORDINGS), "Calls"),
            File(Environment.getExternalStorageDirectory(), "Call"),
            File(Environment.getExternalStorageDirectory(), "Recordings")
        )

        val recordingFiles = mutableListOf<File>()

        for (folder in candidateFolders) {
            if (folder.exists() && folder.isDirectory) {
                val files = folder.listFiles { f ->
                    f.isFile && (f.extension.equals("m4a", true) || f.extension.equals("mp3", true) || f.extension.equals("amr", true))
                }
                if (files != null && files.isNotEmpty()) {
                    recordingFiles.addAll(files)
                }
            }
        }

        // MediaStore를 통한 보조 검색 (Android 11+ 스코프드 스토리지 대응)
        try {
            val projection = arrayOf(
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.DATA
            )
            val selection = "${MediaStore.Audio.Media.DATA} LIKE '%Recordings/Call%' OR ${MediaStore.Audio.Media.DISPLAY_NAME} LIKE '통화 녹음%'"
            val cursor = context.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                null,
                "${MediaStore.Audio.Media.DATE_MODIFIED} DESC"
            )

            cursor?.use { c ->
                val dataCol = c.getColumnIndex(MediaStore.Audio.Media.DATA)
                while (c.moveToNext()) {
                    if (dataCol != -1) {
                        val path = c.getString(dataCol)
                        if (!path.isNullOrBlank()) {
                            val f = File(path)
                            if (f.exists() && f.isFile && !recordingFiles.any { it.absolutePath == f.absolutePath }) {
                                recordingFiles.add(f)
                            }
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "MediaStore query warning: ${e.message}")
        }

        if (recordingFiles.isEmpty()) {
            return@withContext 0
        }

        // 최신 생성순으로 정렬
        recordingFiles.sortByDescending { it.lastModified() }

        val filterText = prefs.callRecordingTargetFilter.trim()
        val targetFolder = prefs.callRecordingDriveFolder.takeIf { it.isNotBlank() } ?: "[SheetBot] 통화 녹음"
        val autoRecordSheet = prefs.isCallRecordingSheetEnabled

        var uploadedCount = 0

        // 최근 파일 중 아직 업로드되지 않은 파일 순회 (최대 5개씩 배치)
        for (file in recordingFiles.take(15)) {
            val fileName = file.name

            // 이미 업로드 완료된 파일은 건너뜀
            if (prefs.isRecordingSynced(fileName)) {
                continue
            }

            // 파일 정보 파싱
            val parsedInfo = parseRecordingFileInfo(file)
            val contactName = parsedInfo.contactName
            val callTimeStr = parsedInfo.callTime

            // 필터링 검사 (지정된 번호 또는 이름에 부합하는지)
            if (!matchesFilter(contactName, fileName, filterText)) {
                Log.d(TAG, "필터 대상이 아니므로 건너뜀: $fileName (상대방: $contactName, 필터: $filterText)")
                continue
            }

            Log.i(TAG, "🚀 [통화 녹음 업로드 개시] 파일: $fileName / 상대방: $contactName / 대상 폴더: $targetFolder")

            // 구글 드라이브로 파일 업로드
            val uploadResult = ApiClient.uploadCallRecording(
                file = file,
                fileName = fileName,
                contactName = contactName,
                callTime = callTimeStr,
                userEmail = userEmail,
                folderName = targetFolder,
                autoRecordSheet = autoRecordSheet
            )

            if (uploadResult.success) {
                prefs.markRecordingSynced(fileName)
                uploadedCount++

                Log.i(TAG, "🎉 [통화 녹음 구글 드라이브 백업 완료] $fileName")

                // 알림 및 음성 안내
                showUploadSuccessNotification(context, contactName, fileName, targetFolder)

                if (prefs.isTtsEnabled) {
                    TtsManager.speak(context, "${contactName}님과의 통화 녹음이 구글 드라이브에 안전하게 보관되었습니다.")
                }
            } else {
                Log.w(TAG, "⚠️ 통화 녹음 업로드 실패: $fileName (${uploadResult.error})")
            }
        }

        uploadedCount
    }

    /**
     * 파일명에서 상대방(이름/번호) 및 통화 일시 추출
     */
    private fun parseRecordingFileInfo(file: File): RecordingFileInfo {
        val fileName = file.name
        val match = RECORDING_REGEX.find(fileName)

        if (match != null) {
            val rawContact = match.groupValues[1].trim()
            val rawDate = match.groupValues[2] // YYMMDD
            val rawTime = match.groupValues[3] // HHMMSS

            val formattedTime = try {
                val inputFormat = SimpleDateFormat("yyMMdd_HHmmss", Locale.KOREA)
                val outputFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA)
                val parsed = inputFormat.parse("${rawDate}_${rawTime}")
                if (parsed != null) outputFormat.format(parsed) else null
            } catch (_: Exception) {
                null
            }

            return RecordingFileInfo(
                contactName = rawContact,
                callTime = formattedTime ?: SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA).format(Date(file.lastModified()))
            )
        }

        // 정규식 매칭 실패 시 fallback: "통화 녹음" 접두사 제거
        val fallbackName = fileName.substringBeforeLast(".")
            .replace("통화 녹음", "", ignoreCase = true)
            .replace("통화녹음", "", ignoreCase = true)
            .trim()
            .split("_")
            .firstOrNull() ?: "미지정 연락처"

        val modTime = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA).format(Date(file.lastModified()))
        return RecordingFileInfo(contactName = fallbackName, callTime = modTime)
    }

    /**
     * 필터 조건 매칭 판별
     * filterText가 비어있으면 모든 통화 파일 허용
     * filterText가 존재하면 쉼표로 분리하여 상대방 이름 또는 전화번호 대조
     */
    private fun matchesFilter(contactName: String, fileName: String, filterText: String): Boolean {
        if (filterText.isBlank()) {
            return true // 필터 미설정 시 모든 통화 자동 업로드
        }

        val keywords = filterText.split(",", ";", " ").map { it.trim() }.filter { it.isNotBlank() }
        val cleanContact = contactName.replace("-", "").replace(" ", "").lowercase()
        val cleanFileName = fileName.replace("-", "").replace(" ", "").lowercase()

        for (kw in keywords) {
            val cleanKw = kw.replace("-", "").replace(" ", "").lowercase()
            if (cleanContact.contains(cleanKw) || cleanFileName.contains(cleanKw) || contactName.contains(kw)) {
                return true
            }
        }

        return false
    }

    private fun showUploadSuccessNotification(context: Context, contactName: String, fileName: String, folderName: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "SheetBot 통화 녹음 백업 알림",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "통화 녹음 파일이 구글 드라이브로 자동 업로드되었을 때 알립니다."
            }
            manager.createNotificationChannel(channel)
        }

        val noti = NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("🎙️ [통화 녹음 백업 완료] $contactName")
            .setContentText("구글 드라이브 '${folderName}' 폴더에 안전하게 보관되었습니다.")
            .setStyle(NotificationCompat.BigTextStyle().bigText("상대방: $contactName\n파일명: $fileName\n저장 위치: 구글 드라이브 > $folderName"))
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setAutoCancel(true)
            .build()

        manager.notify((System.currentTimeMillis() % 100000).toInt(), noti)
    }
}

data class RecordingFileInfo(
    val contactName: String,
    val callTime: String
)
