package cloud.sheetbot.agent.user

import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import android.util.Log
import android.webkit.MimeTypeMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream

/**
 * 스마트폰에서 수발신되는 MMS(사진·PDF·문서·동영상 등 첨부파일 포함 문자)를 실시간 감지하여
 * 첨부파일 원본과 본문을 파일투시트(FileToSheet) 및 구글시트(구글 드라이브 포함)에 자동 저장하는 Observer
 */
class MmsObserver(
    private val context: Context,
    handler: Handler = Handler(Looper.getMainLooper())
) : ContentObserver(handler) {

    companion object {
        private const val TAG = "MmsObserver"
        val MMS_SMS_URI: Uri = Uri.parse("content://mms-sms/")
        private val MMS_CONTENT_URI: Uri = Telephony.Mms.CONTENT_URI
        private val MMS_PART_URI: Uri = Uri.parse("content://mms/part")

        private const val ADDR_TYPE_FROM = 137
        private const val ADDR_TYPE_TO = 151
        private const val MAX_ATTACHMENT_BYTES = 10L * 1024L * 1024L // 파일당 최대 10MB
        private const val RECENT_WINDOW_MS = 180_000L // 최근 3분 이내 MMS만 동기화
    }

    private val prefs = PreferencesManager(context)
    private val scope = CoroutineScope(Dispatchers.IO)

    override fun onChange(selfChange: Boolean, uri: Uri?) {
        super.onChange(selfChange, uri)

        if ((!prefs.isPaired && !prefs.isFtsPaired) || !prefs.isSmsSheetSyncEnabled) return
        val userEmail = prefs.userEmail ?: ""

        scope.launch {
            try {
                // 통신사 MMS 다운로드 및 DB 파트 커밋 대기
                delay(1500)
                processLatestMms(userEmail, allowRetry = true)
            } catch (e: Exception) {
                Log.e(TAG, "MMS 감지 처리 중 오류: ${e.message}")
            }
        }
    }

    private suspend fun processLatestMms(userEmail: String, allowRetry: Boolean) {
        val projection = arrayOf(
            Telephony.Mms._ID,
            Telephony.Mms.DATE,
            Telephony.Mms.MESSAGE_BOX,
            Telephony.Mms.SUBJECT
        )

        val cursor = try {
            context.contentResolver.query(
                MMS_CONTENT_URI,
                projection,
                "${Telephony.Mms.MESSAGE_BOX} IN (?, ?)",
                arrayOf(
                    Telephony.Mms.MESSAGE_BOX_INBOX.toString(),
                    Telephony.Mms.MESSAGE_BOX_SENT.toString()
                ),
                "${Telephony.Mms.DATE} DESC"
            )
        } catch (e: Exception) {
            Log.w(TAG, "MMS ContentResolver 조회 실패: ${e.message}")
            null
        } ?: return

        var mmsId = -1L
        var dateMs = 0L
        var msgBox = -1
        var subject = ""

        cursor.use { c ->
            if (c.moveToFirst()) {
                val idCol = c.getColumnIndex(Telephony.Mms._ID)
                val dateCol = c.getColumnIndex(Telephony.Mms.DATE)
                val boxCol = c.getColumnIndex(Telephony.Mms.MESSAGE_BOX)
                val subCol = c.getColumnIndex(Telephony.Mms.SUBJECT)
                if (idCol != -1 && boxCol != -1) {
                    mmsId = c.getLong(idCol)
                    val rawDate = if (dateCol != -1) c.getLong(dateCol) else 0L
                    // 안드로이드 MMS DATE 컬럼은 초(seconds) 단위
                    dateMs = if (rawDate in 1L..9_999_999_999L) rawDate * 1000L else rawDate
                    msgBox = c.getInt(boxCol)
                    subject = if (subCol != -1) (c.getString(subCol) ?: "").trim() else ""
                }
            }
        }

        if (mmsId <= 0L) return
        if (prefs.isMmsSynced(mmsId)) return
        if (dateMs > 0L && (System.currentTimeMillis() - dateMs) > RECENT_WINDOW_MS) return

        val isOutbound = (msgBox == Telephony.Mms.MESSAGE_BOX_SENT)
        val direction = if (isOutbound) "OUTBOUND" else "INBOUND"

        val (bodyText, attachments) = extractMmsParts(mmsId)

        // 수신 직후 아직 MMS 본문/첨부 다운로드가 완료되지 않았으면 1회 재시도
        if (bodyText.isBlank() && attachments.isEmpty() && allowRetry) {
            delay(2500)
            processLatestMms(userEmail, allowRetry = false)
            return
        }

        // 첨부파일이 하나도 없는 순수 텍스트 LMS/MMS는 이미 알림/SMS 경로로 처리됐는지 중복 검사
        val fullMessage = buildString {
            if (subject.isNotBlank() && !bodyText.contains(subject)) {
                append("[").append(subject).append("] ")
            }
            append(bodyText.trim())
        }.trim()

        val rawAddress = queryMmsAddress(mmsId, isOutbound)
        if (rawAddress.isBlank()) {
            cleanupTempFiles(attachments)
            return
        }

        val formattedPhone = ContactHelper.formatPhoneNumber(rawAddress)
        val contactName = ContactHelper.getContactName(context, formattedPhone)

        // 필터 검사
        val filter = prefs.smsTargetFilter.trim()
        if (!matchesSmsFilter(formattedPhone, contactName, filter)) {
            cleanupTempFiles(attachments)
            prefs.markMmsSynced(mmsId)
            return
        }

        // 첨부파일이 없는 경우에만 텍스트 중복 가드 적용 (첨부파일이 있는 MMS는 반드시 파일 포함 동기화!)
        if (attachments.isEmpty()) {
            if (fullMessage.isBlank() || !SmsDedupeManager.shouldProcessMessage(direction, rawAddress, fullMessage)) {
                prefs.markMmsSynced(mmsId)
                return
            }
        }

        // 선점 마킹하여 동시 onChange 중복 발화 차단
        prefs.markMmsSynced(mmsId)

        try {
            val dirLabel = if (isOutbound) "발신" else "수신"
            Log.i(
                TAG,
                "📎 [MMS($dirLabel) 감지] 상대방: $formattedPhone / 첨부: ${attachments.size}건 / 본문: ${fullMessage.take(30)}..."
            )

            val result = ApiClient.sendSmsSyncWithAttachments(
                userEmail = userEmail,
                direction = direction,
                phoneNumber = formattedPhone,
                contactName = contactName,
                message = fullMessage,
                attachments = attachments,
                sheetTitle = prefs.smsDriveSheetTitle
            )

            if (result.success) {
                val summaryBody = if (attachments.isNotEmpty()) {
                    "[$dirLabel MMS · 첨부 ${attachments.size}건] ${fullMessage.ifBlank { attachments.first().fileName }}"
                } else {
                    "[$dirLabel] $fullMessage"
                }
                val updateIntent = Intent(SmsReceiver.ACTION_SMS_RECEIVED).apply {
                    putExtra("smsBody", summaryBody)
                    putExtra("sender", contactName ?: formattedPhone)
                    putExtra("success", true)
                    setPackage(context.packageName)
                }
                context.sendBroadcast(updateIntent)
            }
        } finally {
            cleanupTempFiles(attachments)
        }
    }

    private fun queryMmsAddress(mmsId: Long, isOutbound: Boolean): String {
        val targetType = if (isOutbound) ADDR_TYPE_TO else ADDR_TYPE_FROM
        val addrUri = Uri.parse("content://mms/$mmsId/addr")
        val cursor = try {
            context.contentResolver.query(
                addrUri,
                arrayOf("address", "type"),
                "type = ?",
                arrayOf(targetType.toString()),
                null
            )
        } catch (_: Exception) {
            null
        } ?: return ""

        cursor.use { c ->
            while (c.moveToNext()) {
                val addr = c.getString(0)?.trim() ?: ""
                if (addr.isNotBlank() && !addr.equals("insert-address-token", ignoreCase = true)) {
                    return addr
                }
            }
        }
        return ""
    }

    private fun extractMmsParts(mmsId: Long): Pair<String, List<FtsAttachmentFile>> {
        val textParts = mutableListOf<String>()
        val attachmentList = mutableListOf<FtsAttachmentFile>()
        val tmpDir = File(context.cacheDir, "mms_sync_tmp").apply { mkdirs() }

        val cursor = try {
            context.contentResolver.query(
                MMS_PART_URI,
                arrayOf("_id", "ct", "name", "cl", "fn", "_data", "text"),
                "mid = ?",
                arrayOf(mmsId.toString()),
                null
            )
        } catch (e: Exception) {
            Log.w(TAG, "MMS 파트 조회 실패 (mid=$mmsId): ${e.message}")
            null
        } ?: return Pair("", emptyList())

        cursor.use { c ->
            var fileIndex = 0
            while (c.moveToNext()) {
                val partId = c.getString(0) ?: continue
                val contentType = (c.getString(1) ?: "").trim().lowercase()
                val nameCol = (c.getString(2) ?: "").trim()
                val clCol = (c.getString(3) ?: "").trim()
                val fnCol = (c.getString(4) ?: "").trim()
                val dataPath = c.getString(5)
                val inlineText = c.getString(6)

                // SMIL 레이아웃 메타데이터는 무시
                if (contentType == "application/smil" || contentType.isBlank()) continue

                if (contentType == "text/plain") {
                    val extracted = if (!dataPath.isNullOrBlank()) {
                        readTextPart(partId)
                    } else {
                        inlineText ?: ""
                    }
                    if (extracted.isNotBlank()) textParts.add(extracted.trim())
                    continue
                }

                // 이미지, PDF, 문서, 오디오, 비디오, 연락처(.vcf) 등 실제 첨부파일 파트 추출
                if (dataPath.isNullOrBlank()) continue
                fileIndex++

                val rawName = listOf(fnCol, clCol, nameCol).firstOrNull { it.isNotBlank() }
                val extFromMime = MimeTypeMap.getSingleton().getExtensionFromMimeType(contentType)
                    ?: when {
                        contentType.contains("jpeg") || contentType.contains("jpg") -> "jpg"
                        contentType.contains("png") -> "png"
                        contentType.contains("gif") -> "gif"
                        contentType.contains("webp") -> "webp"
                        contentType.contains("pdf") -> "pdf"
                        contentType.contains("mp4") -> "mp4"
                        contentType.contains("vcard") -> "vcf"
                        else -> "bin"
                    }

                val safeFileName = (rawName ?: "mms_${mmsId}_${fileIndex}.$extFromMime")
                    .replace(Regex("[/\\\\?%*:|\"<>]"), "_")
                    .let { if (it.contains('.')) it else "$it.$extFromMime" }

                val outFile = File(tmpDir, "mms_${mmsId}_${fileIndex}_$safeFileName")
                val copiedBytes = copyPartToFile(partId, outFile)
                if (copiedBytes in 1L..MAX_ATTACHMENT_BYTES) {
                    attachmentList.add(
                        FtsAttachmentFile(
                            file = outFile,
                            fileName = safeFileName,
                            mimeType = contentType
                        )
                    )
                } else {
                    try { outFile.delete() } catch (_: Exception) {}
                }
            }
        }

        return Pair(textParts.joinToString("\n"), attachmentList)
    }

    private fun readTextPart(partId: String): String {
        val partUri = Uri.parse("content://mms/part/$partId")
        return try {
            context.contentResolver.openInputStream(partUri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
        } catch (_: Exception) {
            ""
        }
    }

    private fun copyPartToFile(partId: String, destFile: File): Long {
        val partUri = Uri.parse("content://mms/part/$partId")
        return try {
            var total = 0L
            context.contentResolver.openInputStream(partUri)?.use { input ->
                FileOutputStream(destFile).use { output ->
                    val buffer = ByteArray(8192)
                    var read: Int
                    while (input.read(buffer).also { read = it } != -1) {
                        total += read
                        if (total > MAX_ATTACHMENT_BYTES) return -1L
                        output.write(buffer, 0, read)
                    }
                }
            }
            total
        } catch (e: Exception) {
            Log.w(TAG, "MMS 첨부 파트 복사 실패 (partId=$partId): ${e.message}")
            -1L
        }
    }

    private fun cleanupTempFiles(files: List<FtsAttachmentFile>) {
        for (att in files) {
            try {
                if (att.file.exists()) att.file.delete()
            } catch (_: Exception) {}
        }
    }

    private fun matchesSmsFilter(phone: String, contactName: String?, filter: String): Boolean {
        if (filter.isBlank()) return true
        val keywords = filter.split(",", ";", " ").map { it.trim() }.filter { it.isNotBlank() }
        val cleanPhone = phone.replace("-", "").replace(" ", "").lowercase()
        val cleanName = (contactName ?: "").replace(" ", "").lowercase()
        for (kw in keywords) {
            val cleanKw = kw.replace("-", "").replace(" ", "").lowercase()
            if (cleanPhone.contains(cleanKw) || cleanName.contains(cleanKw) || (contactName != null && contactName.contains(kw))) {
                return true
            }
        }
        return false
    }
}
