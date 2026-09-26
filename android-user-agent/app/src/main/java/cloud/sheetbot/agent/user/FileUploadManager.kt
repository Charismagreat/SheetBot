package cloud.sheetbot.agent.user

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 스마트폰 사진 및 일반 문서 파일의 구글 드라이브 보관함 자동 업로드 & AI OCR 매니저
 * - 갤러리/파일 탐색기 '공유하기(Share)' 인텐트 및 앱 내 직접 파일/사진 선택 지원
 * - 구글 드라이브 지정 폴더에 자동 업로드 및 [SheetBot] 대장 시트 실시간 기록
 * - v1.5.0: 영수증(RECEIPT) 및 명함(BUSINESS_CARD) AI OCR 자동 장부화 지원
 */
object FileUploadManager {
    private const val TAG = "FileUploadManager"
    private const val NOTIFICATION_CHANNEL_ID = "sheetbot_file_upload_channel"

    /**
     * 단일 URI 파일 업로드 (일반 파일 및 OCR 공용)
     */
    suspend fun uploadFromUri(
        context: Context,
        uri: Uri,
        customMemo: String? = null,
        ocrType: String? = null
    ): UploadGenericFileResult = withContext(Dispatchers.IO) {
        val prefs = PreferencesManager(context)
        if (!prefs.isPaired) {
            return@withContext UploadGenericFileResult(
                success = false,
                error = "시트봇 계정이 연동되어 있지 않습니다. 먼저 QR코드로 연동해 주세요."
            )
        }

        val userEmail = prefs.userEmail
        if (userEmail.isNullOrBlank()) {
            return@withContext UploadGenericFileResult(
                success = false,
                error = "연동된 계정 이메일이 없습니다."
            )
        }

        val meta = resolveUriMetadata(context, uri)
        val tempFile = copyUriToTempFile(context, uri, meta.fileName)
        if (tempFile == null || !tempFile.exists()) {
            return@withContext UploadGenericFileResult(
                success = false,
                error = "파일을 읽어올 수 없습니다: ${meta.fileName}"
            )
        }

        val targetFolder = when (ocrType?.uppercase()) {
            "RECEIPT" -> "[SheetBot] 영수증 보관함"
            "BUSINESS_CARD" -> "[SheetBot] 명함 보관함"
            else -> prefs.fileUploadDriveFolder.takeIf { it.isNotBlank() } ?: "[SheetBot] 파일 보관함"
        }
        val autoRecordSheet = prefs.isFileUploadSheetEnabled
        val memo = customMemo ?: when (ocrType?.uppercase()) {
            "RECEIPT" -> "스마트폰 시트봇 에이전트 영수증 AI 장부화"
            "BUSINESS_CARD" -> "스마트폰 시트봇 에이전트 명함 AI 인맥화"
            else -> "스마트폰 시트봇 에이전트 업로드"
        }

        Log.i(TAG, "🚀 [파일 업로드 시작] ${meta.fileName} (${meta.mimeType}) -> $targetFolder (ocr: $ocrType)")

        val result = try {
            ApiClient.uploadGenericFile(
                file = tempFile,
                fileName = meta.fileName,
                mimeType = meta.mimeType,
                userEmail = userEmail,
                folderName = targetFolder,
                memo = memo,
                autoRecordSheet = autoRecordSheet,
                ocrType = ocrType
            )
        } finally {
            try {
                if (tempFile.exists()) tempFile.delete()
            } catch (_: Exception) {}
        }

        if (result.success) {
            val uploadedName = result.fileName ?: meta.fileName
            val folderName = result.folderName ?: targetFolder

            if (ocrType.equals("RECEIPT", ignoreCase = true)) {
                val ocrData = result.ocrData
                val mName = ocrData?.optString("merchantName", "영수증") ?: "영수증"
                val amt = ocrData?.optString("amount")?.let { "${it}원" } ?: ""
                showOcrSuccessNotification(context, "🧾 [영수증 AI 자동 장부화 완료]", "$mName $amt 결제 내역이 경비 대장에 기록되었습니다.")
                if (prefs.isTtsEnabled) {
                    TtsManager.speak(context, "영수증이 분석되어 경비 대장에 자동 기록되었습니다.")
                }
            } else if (ocrType.equals("BUSINESS_CARD", ignoreCase = true)) {
                val ocrData = result.ocrData
                val cName = ocrData?.optString("name", "명함") ?: "명함"
                val comp = ocrData?.optString("company")?.let { "($it)" } ?: ""
                showOcrSuccessNotification(context, "🪪 [명함 AI 인맥 등록 완료]", "$cName $comp 정보가 스마트 인맥 대장에 등록되었습니다.")
                if (prefs.isTtsEnabled) {
                    TtsManager.speak(context, "명함이 분석되어 인맥 대장에 자동 등록되었습니다.")
                }
            } else {
                showUploadSuccessNotification(context, uploadedName, folderName)
                if (prefs.isTtsEnabled) {
                    TtsManager.speak(context, "파일이 구글 드라이브 보관함에 안전하게 업로드되었습니다.")
                }
            }
        }

        result
    }

    /**
     * 영수증 전용 AI OCR 장부화 업로드
     */
    suspend fun uploadOcrReceipt(context: Context, uri: Uri): UploadGenericFileResult {
        return uploadFromUri(context, uri, customMemo = "영수증 촬영/선택 AI OCR", ocrType = "RECEIPT")
    }

    /**
     * 명함 전용 AI OCR 인맥 등록 업로드
     */
    suspend fun uploadOcrBusinessCard(context: Context, uri: Uri): UploadGenericFileResult {
        return uploadFromUri(context, uri, customMemo = "명함 촬영/선택 AI OCR", ocrType = "BUSINESS_CARD")
    }

    /**
     * 복수 URI 파일 일괄 업로드
     */
    suspend fun uploadMultipleUris(
        context: Context,
        uris: List<Uri>,
        customMemo: String? = null
    ): List<UploadGenericFileResult> = withContext(Dispatchers.IO) {
        val results = mutableListOf<UploadGenericFileResult>()
        var successCount = 0
        val prefs = PreferencesManager(context)

        for (uri in uris) {
            val res = uploadFromUri(context, uri, customMemo)
            results.add(res)
            if (res.success) successCount++
        }

        if (uris.size > 1 && successCount > 0) {
            val targetFolder = prefs.fileUploadDriveFolder.takeIf { it.isNotBlank() } ?: "[SheetBot] 파일 보관함"
            showBatchSuccessNotification(context, successCount, targetFolder)
            if (prefs.isTtsEnabled) {
                TtsManager.speak(context, "총 ${successCount}개의 파일이 구글 드라이브에 안전하게 업로드되었습니다.")
            }
        }

        results
    }

    /**
     * Content URI에서 파일명 및 MIME 타입 메타데이터 추출
     */
    private fun resolveUriMetadata(context: Context, uri: Uri): UriFileMetadata {
        var fileName: String? = null
        var fileSize: Long = 0L

        try {
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (cursor.moveToFirst()) {
                    if (nameIndex != -1) fileName = cursor.getString(nameIndex)
                    if (sizeIndex != -1) fileSize = cursor.getLong(sizeIndex)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "ContentResolver query error: ${e.message}")
        }

        val mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"

        if (fileName.isNullOrBlank()) {
            val extension = when {
                mimeType.contains("jpeg") || mimeType.contains("jpg") -> ".jpg"
                mimeType.contains("png") -> ".png"
                mimeType.contains("webp") -> ".webp"
                mimeType.contains("gif") -> ".gif"
                mimeType.contains("pdf") -> ".pdf"
                mimeType.contains("sheet") || mimeType.contains("excel") -> ".xlsx"
                mimeType.contains("word") -> ".docx"
                mimeType.contains("text") -> ".txt"
                else -> ""
            }
            val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.KOREA).format(Date())
            fileName = "스마트폰_업로드_${timeStamp}${extension}"
        }

        return UriFileMetadata(
            fileName = fileName!!,
            fileSize = fileSize,
            mimeType = mimeType
        )
    }

    /**
     * Content URI 내용을 앱 캐시 디렉터리의 임시 파일로 복사
     */
    private fun copyUriToTempFile(context: Context, uri: Uri, originalName: String): File? {
        return try {
            val cleanName = originalName.replace(Regex("[\\\\/:*?\"<>|]"), "_")
            val tempFile = File(context.cacheDir, "upload_${System.currentTimeMillis()}_$cleanName")
            context.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(tempFile).use { output ->
                    input.copyTo(output)
                }
            }
            tempFile
        } catch (e: Exception) {
            Log.e(TAG, "Failed to copy URI to temp file: ${e.message}", e)
            null
        }
    }

    private fun showUploadSuccessNotification(context: Context, fileName: String, folderName: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "SheetBot 파일 업로드 알림",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "사진 및 파일이 구글 드라이브로 업로드되었을 때 알립니다."
            }
            manager.createNotificationChannel(channel)
        }

        val noti = NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("📁 [구글 드라이브 업로드 완료]")
            .setContentText("'$fileName' 파일이 '$folderName' 폴더에 보관되었습니다.")
            .setStyle(NotificationCompat.BigTextStyle().bigText("파일명: $fileName\n저장 위치: 구글 드라이브 > $folderName\n대장 시트 실시간 자동 기록 완료"))
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setAutoCancel(true)
            .build()

        manager.notify((System.currentTimeMillis() % 100000).toInt(), noti)
    }

    private fun showOcrSuccessNotification(context: Context, title: String, text: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "SheetBot 파일 업로드 알림",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "사진 및 파일이 구글 드라이브로 업로드되었을 때 알립니다."
            }
            manager.createNotificationChannel(channel)
        }

        val noti = NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setAutoCancel(true)
            .build()

        manager.notify((System.currentTimeMillis() % 100000).toInt(), noti)
    }

    private fun showBatchSuccessNotification(context: Context, count: Int, folderName: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "SheetBot 파일 업로드 알림",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "사진 및 파일이 구글 드라이브로 업로드되었을 때 알립니다."
            }
            manager.createNotificationChannel(channel)
        }

        val noti = NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("📁 [구글 드라이브 일괄 업로드 완료]")
            .setContentText("총 ${count}건의 파일이 '$folderName' 폴더에 안전하게 보관되었습니다.")
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setAutoCancel(true)
            .build()

        manager.notify((System.currentTimeMillis() % 100000).toInt(), noti)
    }
}

data class UriFileMetadata(
    val fileName: String,
    val fileSize: Long,
    val mimeType: String
)
