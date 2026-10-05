package cloud.sheetbot.agent.user

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
        val autoRecordSheet = if (ocrType.equals("RECEIPT", ignoreCase = true) || ocrType.equals("BUSINESS_CARD", ignoreCase = true)) {
            true
        } else {
            prefs.isFileUploadSheetEnabled
        }
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
                val ocrData = result.ocrData ?: org.json.JSONObject()
                val cName = ocrData.optString("name", "명함 고객").ifBlank { "명함 고객" }
                val rawComp = ocrData.optString("company", "")
                val comp = if (rawComp.isNotBlank()) "($rawComp)" else ""

                // 상단 헤드업 알림을 띄우고, 사용자가 알림을 터치했을 때 CardActionActivity 팝업이 열리도록 보장
                showBusinessCardActionNotification(context, cName, comp, ocrData)

                if (prefs.isTtsEnabled) {
                    TtsManager.speak(context, "${cName}님의 명함이 분석되어 인맥 대장에 등록되었습니다.")
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
    internal fun resolveUriMetadata(context: Context, uri: Uri): UriFileMetadata {
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
     * 이미지인 경우 AI OCR에 최적화된 최대 1600px 리사이즈 및 JPEG 85 압축 적용 (10MB -> 300KB 초고속 전송 및 터널 413 방지)
     */
    internal fun copyUriToTempFile(context: Context, uri: Uri, originalName: String): File? {
        return try {
            val cleanName = originalName.replace(Regex("[\\\\/:*?\"<>|]"), "_")
            val mimeType = context.contentResolver.getType(uri) ?: ""
            val isImage = mimeType.startsWith("image/") ||
                cleanName.endsWith(".jpg", ignoreCase = true) ||
                cleanName.endsWith(".jpeg", ignoreCase = true) ||
                cleanName.endsWith(".png", ignoreCase = true) ||
                cleanName.endsWith(".webp", ignoreCase = true)

            val tempFile = File(context.cacheDir, "upload_${System.currentTimeMillis()}_$cleanName")

            if (isImage) {
                // 이미지 최적화: 1600px 리사이즈 및 JPEG 압축으로 OOM 및 터널 413 타임아웃 완전 방지
                val bitmap = decodeSampledBitmapFromUri(context, uri, 1600, 1600)
                if (bitmap != null) {
                    FileOutputStream(tempFile).use { output ->
                        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, output)
                        output.flush()
                    }
                    bitmap.recycle()
                    Log.i(TAG, "📸 이미지 최적화 압축 완료: ${tempFile.length() / 1024} KB ($originalName)")
                    return tempFile
                }
            }

            // 일반 파일 또는 비트맵 디코딩 실패 시 원본 스트림 복사
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

    private fun decodeSampledBitmapFromUri(context: Context, uri: Uri, reqWidth: Int, reqHeight: Int): Bitmap? {
        try {
            // 1. inJustDecodeBounds로 이미지 원본 크기만 먼저 측정 (메모리 절약)
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            context.contentResolver.openInputStream(uri)?.use { input ->
                BitmapFactory.decodeStream(input, null, options)
            }

            val origWidth = options.outWidth
            val origHeight = options.outHeight
            if (origWidth <= 0 || origHeight <= 0) return null

            // 2. 적정 sampleSize 계산
            var inSampleSize = 1
            if (origHeight > reqHeight || origWidth > reqWidth) {
                val halfHeight = origHeight / 2
                val halfWidth = origWidth / 2
                while ((halfHeight / inSampleSize) >= reqHeight && (halfWidth / inSampleSize) >= reqWidth) {
                    inSampleSize *= 2
                }
            }

            // 3. 실제 비트맵 디코딩 (RGB_565로 메모리 절반 절약)
            val decodeOptions = BitmapFactory.Options().apply {
                this.inSampleSize = inSampleSize
                inPreferredConfig = Bitmap.Config.RGB_565
            }
            val sampledBitmap = context.contentResolver.openInputStream(uri)?.use { input ->
                BitmapFactory.decodeStream(input, null, decodeOptions)
            } ?: return null

            // 4. 가로/세로 비율 유지하며 최대 reqWidth/reqHeight로 스케일링
            val scale = Math.min(
                reqWidth.toFloat() / sampledBitmap.width,
                reqHeight.toFloat() / sampledBitmap.height
            )
            return if (scale < 1.0f) {
                val targetW = (sampledBitmap.width * scale).toInt()
                val targetH = (sampledBitmap.height * scale).toInt()
                val scaled = Bitmap.createScaledBitmap(sampledBitmap, targetW, targetH, true)
                if (scaled != sampledBitmap) {
                    sampledBitmap.recycle()
                }
                scaled
            } else {
                sampledBitmap
            }
        } catch (e: Exception) {
            Log.w(TAG, "decodeSampledBitmapFromUri failed: ${e.message}")
            return null
        }
    }

    /**
     * 이미 앱 캐시로 복사된 명함 파일 업로드 및 AI 인맥 등록 (창 전환 권한 소멸 방어)
     */
    suspend fun uploadPreparedBusinessCard(
        context: Context,
        tempFile: File,
        meta: UriFileMetadata
    ): UploadGenericFileResult = withContext(Dispatchers.IO) {
        val prefs = PreferencesManager(context)
        val userEmail = prefs.userEmail
        if (userEmail.isNullOrBlank()) {
            return@withContext UploadGenericFileResult(
                success = false,
                error = "연동된 계정 이메일이 없습니다."
            )
        }

        val targetFolder = "[SheetBot] 명함 보관함"
        val memo = "스마트폰 시트봇 에이전트 명함 AI 인맥화"

        val result = try {
            ApiClient.uploadGenericFile(
                file = tempFile,
                fileName = meta.fileName,
                mimeType = meta.mimeType,
                userEmail = userEmail,
                folderName = targetFolder,
                memo = memo,
                autoRecordSheet = true,
                ocrType = "BUSINESS_CARD"
            )
        } finally {
            try {
                if (tempFile.exists()) tempFile.delete()
            } catch (_: Exception) {}
        }

        if (result.success) {
            val ocrData = result.ocrData ?: org.json.JSONObject()
            val cName = ocrData.optString("name", "명함 고객").ifBlank { "명함 고객" }
            val rawComp = ocrData.optString("company", "")
            val comp = if (rawComp.isNotBlank()) "($rawComp)" else ""

            // 상단 헤드업 알림을 띄우고, 사용자가 알림을 터치했을 때 CardActionActivity 팝업이 열리도록 보장
            showBusinessCardActionNotification(context, cName, comp, ocrData)

            if (prefs.isTtsEnabled) {
                TtsManager.speak(context, "${cName}님의 명함이 분석되어 인맥 대장에 등록되었습니다.")
            }
        } else {
            showOcrSuccessNotification(context, "⚠️ [명함 AI 분석 실패]", result.error ?: "네트워크 또는 분석 오류가 발생했습니다.")
        }

        result
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

    const val CARD_NOTIFICATION_CHANNEL_ID = "sheetbot_card_action_channel_v4"

    fun showBusinessCardActionNotification(context: Context, name: String, company: String, cardJson: org.json.JSONObject) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val soundUri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val audioAttributes = android.media.AudioAttributes.Builder()
                .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                .build()

            val channel = NotificationChannel(
                CARD_NOTIFICATION_CHANNEL_ID,
                "SheetBot 명함 인맥 등록 알림",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "명함 사진 AI 분석 완료 시 연락처 저장 및 모바일 명함 발송을 위해 화면 상단에 알립니다."
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 400, 200, 400)
                enableLights(true)
                setSound(soundUri, audioAttributes)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(channel)
        }

        val intent = Intent(context, CardActionActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(CardActionActivity.EXTRA_NAME, cardJson.optString("name", ""))
            putExtra(CardActionActivity.EXTRA_TITLE, cardJson.optString("title", ""))
            putExtra(CardActionActivity.EXTRA_COMPANY, cardJson.optString("company", ""))
            putExtra(CardActionActivity.EXTRA_MOBILE, cardJson.optString("mobile", ""))
            putExtra(CardActionActivity.EXTRA_EMAIL, cardJson.optString("email", ""))
            putExtra(CardActionActivity.EXTRA_TEL, cardJson.optString("tel", ""))
            putExtra(CardActionActivity.EXTRA_ADDRESS, cardJson.optString("address", ""))
            putExtra(CardActionActivity.EXTRA_DETAILS, cardJson.optString("details", ""))
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            CardActionActivity.NOTIFICATION_ID,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val noti = NotificationCompat.Builder(context, CARD_NOTIFICATION_CHANNEL_ID)
            .setContentTitle("🪪 [명함 AI 분석 완료] $name $company")
            .setContentText("터치하여 스마트폰 연락처에 추가하고 내 모바일 명함을 발송하세요.")
            .setStyle(NotificationCompat.BigTextStyle().bigText("🪪 $name $company AI 인맥 등록 완료\n• 터치 시 연락처 자동 저장 & 내 모바일 명함 발송 팝업이 열립니다."))
            .setSmallIcon(R.drawable.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 400, 200, 400))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .addAction(android.R.drawable.ic_menu_send, "연락처 저장 & 명함 발송", pendingIntent)
            .build()

        manager.notify(CardActionActivity.NOTIFICATION_ID, noti)
    }
}

data class UriFileMetadata(
    val fileName: String,
    val fileSize: Long,
    val mimeType: String
)
