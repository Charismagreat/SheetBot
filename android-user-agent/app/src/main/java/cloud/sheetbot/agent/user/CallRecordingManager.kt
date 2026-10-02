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
     * 국내외 모든 통화 녹음 앱 파일명 정규식 지원 (삼성 기본, SKT 에이닷, T전화, Cube ACR, 일반)
     */
    // 1. 삼성 갤럭시: 통화 녹음 [이름 또는 전화번호]_[YYMMDD]_[HHMMSS].m4a
    private val SAMSUNG_REGEX = Regex("""통화\s*녹음\s*([^_]+)_(\d{6})_(\d{6})""", RegexOption.IGNORE_CASE)

    // 2. SKT 에이닷(A.) & T전화: [T전화통화녹음]_[이름/번호]_[YYYYMMDD]_[HHMMSS] 또는 통화녹음_[번호]_[YYYYMMDDHHMMSS]
    private val TPHONE_REGEX_1 = Regex("""(?:\[?T전화통화녹음\]?|통화\s*녹음)[_\s]+([^_]+)_(\d{8})_?(\d{4,6})?""", RegexOption.IGNORE_CASE)
    private val TPHONE_REGEX_2 = Regex("""(?:\[?T전화통화녹음\]?|통화\s*녹음)[_\s]+([^_]+)_(\d{6})_?(\d{6})?""", RegexOption.IGNORE_CASE)

    // 3. Cube ACR 및 일반 서드파티: Call_[이름/번호]_[YYYY-MM-DD_HH-mm-ss]
    private val CUBE_ACR_REGEX = Regex("""(?:Call|Rec|Record)[_\s]+([^_]+)_(\d{4}[-_]?\d{2}[-_]?\d{2})_?(\d{2}[-_]?\d{2}[-_]?\d{2})?""", RegexOption.IGNORE_CASE)

    /**
     * 신규 통화 녹음 파일을 탐색하고 설정된 필터 조건에 부합하면 구글 드라이브로 자동 업로드
     */
    suspend fun scanAndUploadNewRecordings(context: Context, forceReupload: Boolean = false): RecordingSyncResult = withContext(Dispatchers.IO) {
        val prefs = PreferencesManager(context)

        // 1. 기능 활성화 및 페어링 확인
        if (!prefs.isPaired || !prefs.isCallRecordingSyncEnabled) {
            return@withContext RecordingSyncResult(0, 0, 0, "통화 녹음 백업 기능이 비활성화되어 있습니다.")
        }

        val userEmail = prefs.userEmail
        if (userEmail.isNullOrBlank()) {
            return@withContext RecordingSyncResult(0, 0, 0, "계정이 연동되지 않았습니다.")
        }

        // 2. 단말기 내 통화 녹음 폴더 목록 확인 (삼성 기본, SKT 에이닷(A.), T전화, 후후, Cube ACR 등 모든 녹음 앱 통합 지원)
        val customFolder = prefs.callRecordingCustomFolder.trim()
        val candidateFolders = mutableListOf<File>()

        // [우선순위 1] 사용자가 직접 지정한 커스텀 녹음 폴더가 있다면 최우선 탐색
        if (customFolder.isNotBlank()) {
            candidateFolders.add(File(customFolder))
        }

        // [우선순위 2] 국내외 모든 주요 통화 녹음 앱 표준 저장 경로 자동 탐색
        candidateFolders.addAll(
            listOf(
                // 🎙️ SKT 에이닷(A.) / T전화 전용 통화 녹음 표준 저장 경로 (Android 12+ 및 전체 버전)
                File(Environment.getExternalStorageDirectory(), "Recordings/TPhoneCallRecords"),
                File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_RECORDINGS), "TPhoneCallRecords"),
                File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "TPhoneCallRecords"),
                File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "TPhoneCallRecords/my_sounds"),
                File(Environment.getExternalStorageDirectory(), "Music/TPhoneCallRecords"),
                File(Environment.getExternalStorageDirectory(), "Recordings/TPhone"),
                File(Environment.getExternalStorageDirectory(), "TPhoneCallRecords"),
                File(Environment.getExternalStorageDirectory(), "TPhone/Recordings"),
                File(Environment.getExternalStorageDirectory(), "Recordings/A_dot"),
                File(Environment.getExternalStorageDirectory(), "Recordings/Adot"),
                File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_RECORDINGS), "A_dot"),

                // 📱 삼성 갤럭시 기본 전화 자동 녹음 폴더
                File(Environment.getExternalStorageDirectory(), "Recordings/Call"),
                File(Environment.getExternalStorageDirectory(), "Recordings/Calls"),
                File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_RECORDINGS), "Call"),
                File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_RECORDINGS), "Calls"),
                File(Environment.getExternalStorageDirectory(), "Call"),
                File(Environment.getExternalStorageDirectory(), "Recordings"),

                // 🌐 기타 서드파티 통화 녹음 앱 (Cube ACR, 후후, All Call Recorder 등)
                File(Environment.getExternalStorageDirectory(), "Recordings/WhoWho"),
                File(Environment.getExternalStorageDirectory(), "CubeCallRecorder"),
                File(Environment.getExternalStorageDirectory(), "Recordings/CubeCallRecorder"),
                File(Environment.getExternalStorageDirectory(), "AllCallRecorder"),
                File(Environment.getExternalStorageDirectory(), "CallRecordings"),
                File(Environment.getExternalStorageDirectory(), "VoiceRecorder"),
                File(Environment.getExternalStorageDirectory(), "Voice Recorder"),
                File(Environment.getExternalStorageDirectory(), "Sounds"),
                File(Environment.getExternalStorageDirectory(), "Download")
            )
        )

        val supportedExtensions = setOf("m4a", "mp3", "amr", "wav", "aac", "3gp", "ogg", "flac", "wma")
        val recordingFiles = mutableListOf<File>()
        val scannedDirNames = mutableListOf<String>()

        for (folder in candidateFolders) {
            if (folder.exists() && folder.isDirectory) {
                scannedDirNames.add(folder.name)
                val files = folder.listFiles { f ->
                    f.isFile && f.extension.lowercase() in supportedExtensions
                }
                if (files != null && files.isNotEmpty()) {
                    for (f in files) {
                        if (!recordingFiles.any { it.absolutePath == f.absolutePath }) {
                            recordingFiles.add(f)
                        }
                    }
                }
            }
        }

        // MediaStore를 통한 보조 검색 (Android 11+ 스코프드 스토리지, 에이닷/T전화/삼성 전역 탐색)
        try {
            val projection = arrayOf(
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.DATA
            )
            val cursor = context.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                "${MediaStore.Audio.Media.DATE_MODIFIED} DESC"
            )

            cursor?.use { c ->
                val dataCol = c.getColumnIndex(MediaStore.Audio.Media.DATA)
                val nameCol = c.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME)
                var count = 0
                while (c.moveToNext() && count < 100) {
                    val path = if (dataCol != -1) c.getString(dataCol) else null
                    val name = if (nameCol != -1) c.getString(nameCol) else null
                    val lowerPath = path?.lowercase() ?: ""
                    val lowerName = name?.lowercase() ?: ""

                    val isCallRelated = lowerPath.contains("recording") || lowerPath.contains("tphone") ||
                            lowerPath.contains("a_dot") || lowerPath.contains("call") ||
                            lowerName.contains("통화") || lowerName.contains("녹음") || lowerName.contains("call")

                    if (isCallRelated && !path.isNullOrBlank()) {
                        val f = File(path)
                        if (f.exists() && f.isFile && f.extension.lowercase() in supportedExtensions) {
                            if (!recordingFiles.any { it.absolutePath == f.absolutePath }) {
                                recordingFiles.add(f)
                            }
                        }
                    }
                    count++
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "MediaStore query warning: ${e.message}")
        }

        val totalFound = recordingFiles.size

        if (recordingFiles.isEmpty()) {
            val folderHint = if (customFolder.isNotBlank()) customFolder else "Recordings/TPhoneCallRecords 등"
            return@withContext RecordingSyncResult(
                uploadedCount = 0,
                totalFound = 0,
                alreadySyncedCount = 0,
                message = "탐색 대상 폴더($folderHint)에 통화 녹음 파일(.m4a, .mp3 등)이 없습니다.\n\n⚠️ 스마트폰 [설정] > [애플리케이션] > [SheetBot Agent] > [권한]에서 '모든 파일에 대한 접근' 권한이 켜져 있는지 확인해 주세요."
            )
        }

        // 최신 생성순으로 정렬
        recordingFiles.sortByDescending { it.lastModified() }

        val filterText = prefs.callRecordingTargetFilter.trim()
        val targetFolder = prefs.callRecordingDriveFolder.takeIf { it.isNotBlank() } ?: "[SheetBot] 통화 녹음"
        val autoRecordSheet = prefs.isCallRecordingSheetEnabled

        var uploadedCount = 0
        var alreadySyncedCount = 0

        // 최근 파일 중 아직 업로드되지 않은 파일 순회 (최대 5개씩 배치)
        for (file in recordingFiles.take(15)) {
            val fileName = file.name

            // 이미 업로드 완료된 파일은 건너뜀 (단, 강제 재동기화 시는 업로드)
            if (!forceReupload && prefs.isRecordingSynced(fileName)) {
                alreadySyncedCount++
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

        val msg = when {
            uploadedCount > 0 -> "신규 통화 녹음 ${uploadedCount}건이 구글 드라이브에 안전하게 업로드되었습니다!"
            alreadySyncedCount > 0 && uploadedCount == 0 -> "스마트폰에 있는 통화 녹음 파일 ${totalFound}건이 이미 구글 드라이브에 모두 백업되어 있습니다."
            else -> "업로드할 조건에 맞는 통화 녹음 파일이 없습니다."
        }

        RecordingSyncResult(
            uploadedCount = uploadedCount,
            totalFound = totalFound,
            alreadySyncedCount = alreadySyncedCount,
            message = msg
        )
    }

    /**
     * 파일명에서 상대방(이름/번호) 및 통화 일시 추출 (삼성, 에이닷, T전화, Cube ACR, 전 어플 지원)
     */
    private fun parseRecordingFileInfo(file: File): RecordingFileInfo {
        val fileName = file.name
        val nameWithoutExt = fileName.substringBeforeLast(".")

        // 1. 삼성 갤럭시: 통화 녹음 [상대방]_[YYMMDD]_[HHMMSS]
        val samsungMatch = SAMSUNG_REGEX.find(fileName)
        if (samsungMatch != null) {
            val rawContact = samsungMatch.groupValues[1].trim()
            val rawDate = samsungMatch.groupValues[2] // YYMMDD
            val rawTime = samsungMatch.groupValues[3] // HHMMSS
            val parsedTime = try {
                val inputFormat = SimpleDateFormat("yyMMdd_HHmmss", Locale.KOREA)
                val outputFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA)
                val parsed = inputFormat.parse("${rawDate}_${rawTime}")
                if (parsed != null) outputFormat.format(parsed) else null
            } catch (_: Exception) { null }

            return RecordingFileInfo(
                contactName = cleanContactName(rawContact),
                callTime = parsedTime ?: formatLastModified(file)
            )
        }

        // 2. SKT 에이닷(A.) & T전화 (YYYYMMDD)
        val tphoneMatch1 = TPHONE_REGEX_1.find(fileName)
        if (tphoneMatch1 != null) {
            val rawContact = tphoneMatch1.groupValues[1].trim()
            val rawDate = tphoneMatch1.groupValues[2] // YYYYMMDD
            val rawTime = tphoneMatch1.groupValues.getOrNull(3)?.trim() ?: "" // HHMMSS or HHMM
            val parsedTime = try {
                val fmtStr = if (rawTime.length >= 6) "yyyyMMdd_HHmmss" else if (rawTime.length >= 4) "yyyyMMdd_HHmm" else "yyyyMMdd"
                val inputFormat = SimpleDateFormat(fmtStr, Locale.KOREA)
                val outputFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA)
                val parsed = inputFormat.parse(if (rawTime.isNotBlank()) "${rawDate}_${rawTime}" else rawDate)
                if (parsed != null) outputFormat.format(parsed) else null
            } catch (_: Exception) { null }

            return RecordingFileInfo(
                contactName = cleanContactName(rawContact),
                callTime = parsedTime ?: formatLastModified(file)
            )
        }

        // 3. SKT 에이닷(A.) & T전화 (YYMMDD)
        val tphoneMatch2 = TPHONE_REGEX_2.find(fileName)
        if (tphoneMatch2 != null) {
            val rawContact = tphoneMatch2.groupValues[1].trim()
            val rawDate = tphoneMatch2.groupValues[2] // YYMMDD
            val rawTime = tphoneMatch2.groupValues.getOrNull(3)?.trim() ?: ""
            val parsedTime = try {
                val inputFormat = SimpleDateFormat("yyMMdd_HHmmss", Locale.KOREA)
                val outputFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA)
                val parsed = inputFormat.parse("${rawDate}_${rawTime}")
                if (parsed != null) outputFormat.format(parsed) else null
            } catch (_: Exception) { null }

            return RecordingFileInfo(
                contactName = cleanContactName(rawContact),
                callTime = parsedTime ?: formatLastModified(file)
            )
        }

        // 4. Cube ACR 및 일반 서드파티
        val cubeMatch = CUBE_ACR_REGEX.find(fileName)
        if (cubeMatch != null) {
            val rawContact = cubeMatch.groupValues[1].trim()
            return RecordingFileInfo(
                contactName = cleanContactName(rawContact),
                callTime = formatLastModified(file)
            )
        }

        // 5. 범용 스마트 토큰 Fallback: 접두사 정리 후 상대방 식별
        val cleaned = nameWithoutExt
            .replace(Regex("""^\[?[^\]]+\]?"""), "") // [T전화통화녹음], [녹음] 등 대괄호 태그 제거
            .replace("통화 녹음", "", ignoreCase = true)
            .replace("통화녹음", "", ignoreCase = true)
            .replace("TPhone", "", ignoreCase = true)
            .replace("A_dot", "", ignoreCase = true)
            .replace("Adot", "", ignoreCase = true)
            .replace("Recording", "", ignoreCase = true)
            .replace("Record", "", ignoreCase = true)
            .replace("Call", "", ignoreCase = true)
            .trim('_', '-', ' ')

        val tokens = cleaned.split("_", "-").map { it.trim() }.filter { it.isNotBlank() }
        val detectedContact = tokens.firstOrNull { token ->
            !token.all { it.isDigit() && token.length >= 6 } // 순수 날짜/시간 숫자 제외
        } ?: tokens.firstOrNull() ?: "미지정 연락처"

        return RecordingFileInfo(
            contactName = cleanContactName(detectedContact),
            callTime = formatLastModified(file)
        )
    }

    private fun cleanContactName(raw: String): String {
        return raw.replace(Regex("""^\[?[^\]]+\]?"""), "")
            .replace("통화녹음", "", ignoreCase = true)
            .replace("통화 녹음", "", ignoreCase = true)
            .trim('_', '-', ' ')
            .takeIf { it.isNotBlank() } ?: "미지정 연락처"
    }

    private fun formatLastModified(file: File): String {
        return SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA).format(Date(file.lastModified()))
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

data class RecordingSyncResult(
    val uploadedCount: Int,
    val totalFound: Int,
    val alreadySyncedCount: Int,
    val message: String
)
