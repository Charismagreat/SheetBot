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

    // 4. [이름]_[전화번호]_[날짜시간] 형식 (삼성/T전화 커스텀: 예: 시댁_01077249063_20261003165911.m4a)
    private val NAME_PHONE_DATE_REGEX = Regex("""^([^_]+)_(\d{9,12})_(\d{8,14})""", RegexOption.IGNORE_CASE)

    // 동시 중복 업로드 방지 인메모리 락 (25초 주기 루프 간 중복 파일 전송 차단)
    private val uploadingFiles = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()

    /**
     * 신규 통화 녹음 파일을 탐색하고 설정된 필터 조건에 부합하면 구글 드라이브로 자동 업로드
     */
    suspend fun scanAndUploadNewRecordings(context: Context, forceReupload: Boolean = false): RecordingSyncResult = withContext(Dispatchers.IO) {
        val prefs = PreferencesManager(context)

        // 1. 기능 활성화 및 페어링 확인
        if (!prefs.isPaired || !prefs.isCallRecordingSyncEnabled) {
            return@withContext RecordingSyncResult(
                uploadedCount = 0,
                totalFound = 0,
                alreadySyncedCount = 0,
                message = "통화 녹음 백업 기능이 비활성화되어 있습니다."
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

        // 2. 단말기 내 통화 녹음 폴더 목록 확인 (삼성 기본, SKT 에이닷(A.), T전화, 후후, Cube ACR 등 모든 녹음 앱 통합 지원)
        val customFolder = prefs.callRecordingCustomFolder.trim()
        val candidateFolders = mutableListOf<File>()

        // [우선순위 1] 사용자가 직접 지정한 커스텀 녹음 폴더가 있다면 최우선 탐색
        if (customFolder.isNotBlank()) {
            val userDir = File(customFolder)
            candidateFolders.add(userDir)
            // 사용자 지정 폴더의 하위 1단계 폴더들도 함께 탐색
            if (userDir.exists() && userDir.isDirectory) {
                userDir.listFiles()?.filter { it.isDirectory }?.let { candidateFolders.addAll(it) }
            }
        }

        // [우선순위 2] 국내외 모든 주요 통화 녹음 앱 표준 저장 경로 자동 탐색
        val standardBaseDirs = listOfNotNull(
            Environment.getExternalStorageDirectory(),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_RECORDINGS),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC)
        )

        for (base in standardBaseDirs) {
            candidateFolders.addAll(
                listOf(
                    File(base, "Recordings/TPhoneCallRecords"),
                    File(base, "TPhoneCallRecords"),
                    File(base, "Recordings/TPhone"),
                    File(base, "TPhone"),
                    File(base, "Recordings/Call"),
                    File(base, "Recordings/Calls"),
                    File(base, "Call"),
                    File(base, "Calls"),
                    File(base, "Recordings"),
                    File(base, "Recordings/A_dot"),
                    File(base, "Recordings/Adot"),
                    File(base, "A_dot"),
                    File(base, "Adot"),
                    File(base, "Music/TPhoneCallRecords"),
                    File(base, "Music/Recordings"),
                    File(base, "Download"),
                    File(base, "Android/data/com.skt.tphone/files"),
                    File(base, "Android/data/com.skt.prod.dialer/files"),
                    File(base, "Android/data/com.skt.skaf.A/files")
                )
            )
        }

        val supportedExtensions = setOf("m4a", "mp3", "amr", "wav", "aac", "3gp", "ogg", "flac", "wma")
        val recordingFiles = mutableListOf<File>()
        val scannedDirNames = mutableListOf<String>()

        for (folder in candidateFolders) {
            if (folder.exists() && folder.isDirectory) {
                scannedDirNames.add(folder.name)
                val files = folder.listFiles()?.filter { f ->
                    f.isFile && 
                    !f.name.startsWith(".") && 
                    !f.name.contains("pending", ignoreCase = true) &&
                    !f.absolutePath.contains("/.trash", ignoreCase = true) &&
                    !f.absolutePath.contains("/trash", ignoreCase = true) &&
                    f.extension.lowercase() in supportedExtensions
                }
                if (!files.isNullOrEmpty()) {
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

                    val isTempOrTrash = lowerName.startsWith(".") || 
                            lowerName.contains("pending") || 
                            lowerPath.contains("/.trash") || 
                            lowerPath.contains("/trash")

                    val isCallRelated = (lowerPath.contains("recording") || lowerPath.contains("tphone") ||
                            lowerPath.contains("a_dot") || lowerPath.contains("call") ||
                            lowerName.contains("통화") || lowerName.contains("녹음") || lowerName.contains("call")) &&
                            !isTempOrTrash

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
                message = "탐색 대상 폴더($folderHint)에 통화 녹음 파일(.m4a, .mp3 등)이 발견되지 않았습니다.\n\n⚠️ 스마트폰 [설정] > [애플리케이션] > [SheetBot Agent] > [권한]에서 '모든 파일에 대한 접근' 권한이 켜져 있는지 확인해 주세요."
            )
        }

        // 최신 생성순으로 정렬
        recordingFiles.sortByDescending { it.lastModified() }

        val filterText = prefs.callRecordingTargetFilter.trim()
        val targetFolder = prefs.callRecordingDriveFolder.takeIf { it.isNotBlank() } ?: "[SheetBot] 통화 녹음"
        val autoRecordSheet = prefs.isCallRecordingSheetEnabled

        var uploadedCount = 0
        var alreadySyncedCount = 0
        var filterExcludedCount = 0
        var uploadFailedCount = 0
        var lastErrorMessage: String? = null
        val sampleNames = recordingFiles.take(3).map { it.name }

        // 최근 파일 중 아직 업로드되지 않은 파일 순회 (최대 15개씩 배치)
        val nowMs = System.currentTimeMillis()
        for (file in recordingFiles.take(15)) {
            val fileName = file.name

            // 7일 이상 지난 과거 오래된 녹음 파일은 자동 백업 루프에서 제외 (사용자가 드라이브를 비웠을 때 옛날 파일들이 다시 쏟아지는 현상 원천 차단)
            if (!forceReupload && (nowMs - file.lastModified() > 7L * 24 * 3600 * 1000)) {
                continue
            }

            // 이미 업로드 완료된 파일은 건너뜀 (단, 강제 재동기화 시는 업로드)
            if (!forceReupload && prefs.isRecordingSynced(fileName)) {
                alreadySyncedCount++
                continue
            }

            // 현재 비동기 업로드 진행 중인 파일은 중복 실행 차단 (25초 감시 루프 간 동시 중복 전송 방어)
            if (!uploadingFiles.add(fileName)) {
                Log.d(TAG, "현재 업로드 진행 중인 파일이므로 건너뜀: $fileName")
                continue
            }

            try {
                // 파일 정보 파싱
                val parsedInfo = parseRecordingFileInfo(file)
                val contactName = parsedInfo.contactName
                val callTimeStr = parsedInfo.callTime

                // 필터링 검사 (지정된 번호 또는 이름에 부합하는지)
                if (!matchesFilter(contactName, fileName, filterText)) {
                    Log.d(TAG, "필터 대상이 아니므로 건너뜀: $fileName (상대방: $contactName, 필터: $filterText)")
                    filterExcludedCount++
                    continue
                }

                Log.i(TAG, "🚀 [통화 녹음 업로드 개시] 파일: $fileName / 상대방: $contactName / 대상 폴더: $targetFolder")

                // 구글 드라이브로 파일 업로드 (2단계: 오디오 채널 수 함께 전달)
                val uploadResult = ApiClient.uploadCallRecording(
                    file = file,
                    fileName = fileName,
                    contactName = contactName,
                    callTime = callTimeStr,
                    userEmail = userEmail,
                    folderName = targetFolder,
                    autoRecordSheet = autoRecordSheet,
                    channelCount = parsedInfo.channelCount
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
                    uploadFailedCount++
                    lastErrorMessage = uploadResult.error ?: "통신 응답 실패"
                    Log.w(TAG, "⚠️ 통화 녹음 업로드 실패: $fileName (${uploadResult.error})")
                }
            } finally {
                uploadingFiles.remove(fileName)
            }
        }

        val sampleListStr = sampleNames.joinToString("\n• ")

        val msg = when {
            uploadedCount > 0 -> {
                val failInfo = if (uploadFailedCount > 0) "\n(⚠️ ${uploadFailedCount}건 업로드 실패: $lastErrorMessage)" else ""
                "🎉 총 ${totalFound}개 중 ${uploadedCount}개의 녹음 파일이 구글 드라이브 '${targetFolder}' 폴더에 백업되었습니다!$failInfo"
            }
            uploadedCount == 0 && uploadFailedCount > 0 -> {
                "⚠️ 스마트폰에서 통화 녹음 파일 ${totalFound}개를 발견하여 업로드를 시도했으나 구글 드라이브 전송에 실패했습니다.\n\n• 오류: ${lastErrorMessage ?: "서버 응답 없음"}\n• 발견된 파일:\n• $sampleListStr\n\n💡 인터넷 연결 상태를 확인 후 다시 시도해 주세요."
            }
            uploadedCount == 0 && filterExcludedCount > 0 && alreadySyncedCount == 0 -> {
                "📁 총 ${totalFound}개의 통화 녹음 파일이 발견되었습니다.\n\n• 확인된 파일:\n• $sampleListStr\n\n⚠️ 그러나 설정된 대상 필터('${filterText}')와 일치하지 않아 업로드 대상에서 제외되었습니다.\n\n💡 모든 통화를 백업하시려면 [업로드 대상 번호/이름] 필터 입력란을 완전히 비워주세요."
            }
            uploadedCount == 0 && alreadySyncedCount > 0 -> {
                "📁 스마트폰에서 발견된 ${totalFound}개의 통화 녹음 파일이 모두 이미 구글 드라이브에 안전하게 보관되어 있습니다.\n\n• 확인된 파일:\n• $sampleListStr\n\n💡 다시 전체를 강제 재업로드하시려면 [⚡ 지금 새 녹음 파일 즉시 동기화] 버튼을 1~2초간 '길게(롱클릭)' 눌러주세요."
            }
            else -> {
                "총 ${totalFound}개의 통화 녹음 파일이 감지되었으나 업로드 조건과 일치하지 않습니다.\n(확인된 파일:\n• $sampleListStr)"
            }
        }

        RecordingSyncResult(
            uploadedCount = uploadedCount,
            totalFound = totalFound,
            alreadySyncedCount = alreadySyncedCount,
            filterExcludedCount = filterExcludedCount,
            uploadFailedCount = uploadFailedCount,
            lastErrorMessage = lastErrorMessage,
            message = msg
        )
    }

    /**
     * 다른 폰에서 녹음되어 카카오톡/메일/다운로드 등으로 전달받은 녹음 파일(복수 URI)을 직접 선택하여
     * 구글 드라이브 지정 폴더에 업로드하고 시트 대장에 AI 전사/요약 등록
     */
    suspend fun uploadExternalRecordingsFromUris(
        context: Context,
        uris: List<android.net.Uri>
    ): RecordingSyncResult = withContext(Dispatchers.IO) {
        val prefs = PreferencesManager(context)
        if (!prefs.isPaired) {
            return@withContext RecordingSyncResult(
                uploadedCount = 0,
                totalFound = uris.size,
                alreadySyncedCount = 0,
                message = "시트봇 계정이 연동되어 있지 않습니다. 먼저 계정을 연동해 주세요."
            )
        }

        val userEmail = prefs.userEmail
        if (userEmail.isNullOrBlank()) {
            return@withContext RecordingSyncResult(
                uploadedCount = 0,
                totalFound = uris.size,
                alreadySyncedCount = 0,
                message = "연동된 사용자 계정 이메일이 없습니다."
            )
        }

        val targetFolder = prefs.callRecordingDriveFolder.takeIf { it.isNotBlank() } ?: "[SheetBot] 통화 녹음"
        val autoRecordSheet = prefs.isCallRecordingSheetEnabled

        var uploadedCount = 0
        var uploadFailedCount = 0
        var lastErrorMessage: String? = null

        for (uri in uris) {
            val meta = FileUploadManager.resolveUriMetadata(context, uri)
            var rawFileName = meta.fileName.ifBlank { "다른폰_통화녹음_${System.currentTimeMillis()}.m4a" }
            if (!rawFileName.contains(".")) {
                rawFileName = "$rawFileName.m4a"
            }

            val tempFile = File(context.cacheDir, "ext_rec_${System.currentTimeMillis()}_$rawFileName")
            try {
                context.contentResolver.openInputStream(uri)?.use { input ->
                    java.io.FileOutputStream(tempFile).use { output ->
                        input.copyTo(output)
                    }
                }

                if (!tempFile.exists() || tempFile.length() == 0L) {
                    uploadFailedCount++
                    lastErrorMessage = "파일을 읽을 수 없거나 0바이트입니다: $rawFileName"
                    continue
                }

                val parsedInfo = parseRecordingFileInfo(tempFile)
                var contactName = parsedInfo.contactName
                if (contactName == "미지정 연락처") {
                    val cleanBase = rawFileName.substringBeforeLast(".")
                    contactName = cleanContactName(cleanBase).ifBlank { "외부 통화녹음" }
                }
                val callTimeStr = parsedInfo.callTime
                val channelCount = parsedInfo.channelCount

                Log.i(TAG, "🚀 [다른 폰 녹음 파일 업로드 개시] $rawFileName / 상대방: $contactName / 채널: $channelCount")

                val uploadResult = ApiClient.uploadCallRecording(
                    file = tempFile,
                    fileName = rawFileName,
                    contactName = contactName,
                    callTime = callTimeStr,
                    userEmail = userEmail,
                    folderName = targetFolder,
                    autoRecordSheet = autoRecordSheet,
                    channelCount = channelCount
                )

                if (uploadResult.success) {
                    uploadedCount++
                    showUploadSuccessNotification(context, contactName, rawFileName, targetFolder)
                    if (prefs.isTtsEnabled) {
                        TtsManager.speak(context, "${contactName}님과의 녹음 파일이 구글 드라이브에 안전하게 보관되었습니다.")
                    }
                } else {
                    uploadFailedCount++
                    lastErrorMessage = uploadResult.error ?: "통신 응답 실패"
                }
            } catch (e: Exception) {
                uploadFailedCount++
                lastErrorMessage = e.localizedMessage ?: "파일 처리 예외"
            } finally {
                try {
                    if (tempFile.exists()) tempFile.delete()
                } catch (_: Exception) {}
            }
        }

        val msg = when {
            uploadedCount > 0 -> {
                val failInfo = if (uploadFailedCount > 0) "\n(⚠️ ${uploadFailedCount}건 업로드 실패: $lastErrorMessage)" else ""
                "🎉 선택한 ${uris.size}개 중 ${uploadedCount}개의 다른 폰 녹음 파일이 구글 드라이브 '${targetFolder}'에 안전하게 백업 및 AI 전사 접수되었습니다!$failInfo"
            }
            else -> {
                "⚠️ 선택한 녹음 파일 업로드에 실패했습니다.\n\n• 오류: ${lastErrorMessage ?: "알 수 없는 오류"}\n💡 인터넷 연결 상태를 확인 후 다시 시도해 주세요."
            }
        }

        RecordingSyncResult(
            uploadedCount = uploadedCount,
            totalFound = uris.size,
            alreadySyncedCount = 0,
            uploadFailedCount = uploadFailedCount,
            lastErrorMessage = lastErrorMessage,
            message = msg
        )
    }

    /**
     * 파일명에서 상대방(이름/번호) 및 통화 일시 추출 및 오디오 채널 수 감지
     */
    private fun parseRecordingFileInfo(file: File): RecordingFileInfo {
        val fileName = file.name
        val nameWithoutExt = fileName.substringBeforeLast(".")
        val channelCount = detectAudioChannelCount(file) // 2단계: 2채널(Stereo) 여부 감지

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
                callTime = parsedTime ?: formatLastModified(file),
                channelCount = channelCount
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
                callTime = parsedTime ?: formatLastModified(file),
                channelCount = channelCount
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
                callTime = parsedTime ?: formatLastModified(file),
                channelCount = channelCount
            )
        }

        // 4. [이름]_[전화번호]_[날짜시간] 형식 (삼성/T전화 커스텀 포맷: 예: 시댁_01077249063_20261003165911.m4a)
        val namePhoneDateMatch = NAME_PHONE_DATE_REGEX.find(fileName)
        if (namePhoneDateMatch != null) {
            val rawName = namePhoneDateMatch.groupValues[1].trim()
            val rawPhone = namePhoneDateMatch.groupValues[2].trim()
            val rawDateTime = namePhoneDateMatch.groupValues[3].trim()
            val formattedPhone = formatPhoneNumber(rawPhone)
            val fullContactName = if (formattedPhone.isNotBlank()) "$rawName ($formattedPhone)" else rawName

            val parsedTime = try {
                val fmtStr = if (rawDateTime.length >= 14) "yyyyMMddHHmmss" else if (rawDateTime.length >= 12) "yyMMddHHmmss" else "yyyyMMdd"
                val inputFormat = SimpleDateFormat(fmtStr, Locale.KOREA)
                val outputFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA)
                val parsed = inputFormat.parse(rawDateTime)
                if (parsed != null) outputFormat.format(parsed) else null
            } catch (_: Exception) { null }

            return RecordingFileInfo(
                contactName = cleanContactName(fullContactName),
                callTime = parsedTime ?: formatLastModified(file),
                channelCount = channelCount
            )
        }

        // 5. Cube ACR 및 일반 서드파티
        val cubeMatch = CUBE_ACR_REGEX.find(fileName)
        if (cubeMatch != null) {
            val rawContact = cubeMatch.groupValues[1].trim()
            return RecordingFileInfo(
                contactName = cleanContactName(rawContact),
                callTime = formatLastModified(file),
                channelCount = channelCount
            )
        }

        // 6. 범용 스마트 토큰 Fallback: 접두사 정리 후 상대방 식별
        val cleaned = nameWithoutExt
            .replace(Regex("""^\[[^\]]+\]"""), "") // [T전화통화녹음], [녹음] 등 대괄호 태그만 정확히 제거
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
            callTime = formatLastModified(file),
            channelCount = channelCount
        )
    }

    private fun cleanContactName(raw: String): String {
        return raw.replace(Regex("""^\[[^\]]+\]"""), "") // [대괄호 태그]만 안전하게 제거 (? 제거하여 일반 텍스트 보존)
            .replace("통화녹음", "", ignoreCase = true)
            .replace("통화 녹음", "", ignoreCase = true)
            .trim('_', '-', ' ')
            .takeIf { it.isNotBlank() } ?: "미지정 연락처"
    }

    private fun formatPhoneNumber(raw: String): String {
        val digits = raw.filter { it.isDigit() }
        return when {
            digits.length == 11 -> "${digits.substring(0, 3)}-${digits.substring(3, 7)}-${digits.substring(7)}"
            digits.length == 10 && digits.startsWith("02") -> "${digits.substring(0, 2)}-${digits.substring(2, 6)}-${digits.substring(6)}"
            digits.length == 10 -> "${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}"
            digits.length == 9 && digits.startsWith("02") -> "${digits.substring(0, 2)}-${digits.substring(2, 5)}-${digits.substring(5)}"
            else -> digits
        }
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
        val trimmed = filterText.trim()
        if (trimmed.isBlank() || trimmed.equals("전체", ignoreCase = true) ||
            trimmed.equals("전체 업로드", ignoreCase = true) || trimmed.equals("전체업로드", ignoreCase = true) ||
            trimmed.equals("all", ignoreCase = true) || trimmed == "*") {
            return true // 필터 미설정 또는 전체 설정 시 모든 통화 자동 업로드
        }

        val keywords = trimmed.split(",", ";", " ").map { it.trim() }.filter { it.isNotBlank() }
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

    /**
     * 오디오 파일의 채널 수(1: Mono, 2: Stereo) 감지
     * 안드로이드 하드웨어 표준: 삼성 갤럭시 / T전화 통화녹음은 기본 2채널(Stereo)
     */
    private fun detectAudioChannelCount(file: File): Int {
        val extractor = android.media.MediaExtractor()
        return try {
            extractor.setDataSource(file.absolutePath)
            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(android.media.MediaFormat.KEY_MIME) ?: ""
                if (mime.startsWith("audio/")) {
                    if (format.containsKey(android.media.MediaFormat.KEY_CHANNEL_COUNT)) {
                        return format.getInteger(android.media.MediaFormat.KEY_CHANNEL_COUNT)
                    }
                }
            }
            2
        } catch (_: Exception) {
            2
        } finally {
            try { extractor.release() } catch (_: Exception) {}
        }
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
    val callTime: String,
    val channelCount: Int = 2
)

data class RecordingSyncResult(
    val uploadedCount: Int,
    val totalFound: Int,
    val alreadySyncedCount: Int,
    val filterExcludedCount: Int = 0,
    val uploadFailedCount: Int = 0,
    val lastErrorMessage: String? = null,
    val message: String
)
