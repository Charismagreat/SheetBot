package cloud.sheetbot.agent.user

import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * 스마트폰 기본 메시지 앱에서 사용자가 직접 발신한 문자(Outbound SMS)를 실시간 감지하여
 * 구글 드라이브 [SheetBot] 스마트폰 문자(SMS) 송수신 대장 시트에 자동 기록하는 Observer
 */
class SmsSentObserver(
    private val context: Context,
    handler: Handler = Handler(Looper.getMainLooper())
) : ContentObserver(handler) {

    companion object {
        private const val TAG = "SmsSentObserver"
        val SENT_SMS_URI: Uri = Telephony.Sms.Sent.CONTENT_URI
        val SMS_CONTENT_URI: Uri = Telephony.Sms.CONTENT_URI
    }

    private val prefs = PreferencesManager(context)
    private val scope = CoroutineScope(Dispatchers.IO)

    override fun onChange(selfChange: Boolean, uri: Uri?) {
        super.onChange(selfChange, uri)

        if (!prefs.isPaired || !prefs.isSmsSheetSyncEnabled) return
        val userEmail = prefs.userEmail ?: return

        scope.launch {
            try {
                // 구글 메시지 비동기 DB 커밋 대기 (300ms)
                kotlinx.coroutines.delay(300)

                // 발신함(Sent) 최신 레코드 1건 조회
                val projection = arrayOf(
                    Telephony.Sms._ID,
                    Telephony.Sms.ADDRESS,
                    Telephony.Sms.BODY,
                    Telephony.Sms.DATE,
                    Telephony.Sms.TYPE
                )

                // 1순위: Sent URI 조회, 2순위: SMS 전체 URI 중 type=2 조회
                var cursor = try {
                    context.contentResolver.query(
                        SENT_SMS_URI,
                        projection,
                        null,
                        null,
                        "${Telephony.Sms.DATE} DESC"
                    )
                } catch (_: Exception) { null }

                if (cursor == null || !cursor.moveToFirst()) {
                    cursor?.close()
                    cursor = try {
                        context.contentResolver.query(
                            SMS_CONTENT_URI,
                            projection,
                            "${Telephony.Sms.TYPE} = ?",
                            arrayOf(Telephony.Sms.MESSAGE_TYPE_SENT.toString()),
                            "${Telephony.Sms.DATE} DESC"
                        )
                    } catch (_: Exception) { null }
                }

                cursor?.use { c ->
                    if (c.moveToFirst()) {
                        val idCol = c.getColumnIndex(Telephony.Sms._ID)
                        val addressCol = c.getColumnIndex(Telephony.Sms.ADDRESS)
                        val bodyCol = c.getColumnIndex(Telephony.Sms.BODY)
                        val dateCol = c.getColumnIndex(Telephony.Sms.DATE)

                        if (idCol != -1 && addressCol != -1 && bodyCol != -1) {
                            val id = c.getLong(idCol)
                            val rawRecipient = c.getString(addressCol) ?: ""
                            val body = c.getString(bodyCol) ?: ""
                            val dateLong = if (dateCol != -1) c.getLong(dateCol) else System.currentTimeMillis()

                            // 1. 중복 발신 감지 방어 (이미 동기화된 ID인지 선점 확인)
                            if (prefs.isSentSmsSynced(id)) {
                                return@use
                            }

                            // 2. 15초 이내 동일 수신자+본문 중복 발화 원천 차단 (SmsDedupeManager 선점 검사)
                            if (!SmsDedupeManager.shouldProcessMessage("OUTBOUND", rawRecipient, body)) {
                                Log.d(TAG, "15초 이내 동일한 발신 SMS 이벤트 중복 감지 - 무시합니다.")
                                return@use
                            }

                            // 3. 선점 마킹 (비동기 네트워크 완료 전에 마킹하여 동시 발화된 코루틴 즉시 차단!)
                            prefs.markSentSmsSynced(id)

                            // 4. 60초 이내에 작성된 최근 발신건만 동기화
                            if (System.currentTimeMillis() - dateLong > 60_000L) {
                                return@use
                            }

                            // 5. 수신자 번호 정규화 (82 국가코드 제거 및 하이픈 표준화)
                            val recipient = ContactHelper.formatPhoneNumber(rawRecipient)

                            // 6. 주소록 매칭 및 필터 검사
                            val contactName = ContactHelper.getContactName(context, recipient)
                            val filter = prefs.smsTargetFilter.trim()
                            if (!matchesSmsFilter(recipient, contactName, filter)) {
                                Log.d(TAG, "발신 SMS 필터 제외: $recipient / $contactName")
                                return@use
                            }

                            Log.i(TAG, "📤 [발신 SMS 감지] 수신자: $recipient / 내용: ${body.take(30)}...")

                            val isSynced = ApiClient.sendSmsSync(
                                userEmail = userEmail,
                                direction = "OUTBOUND",
                                phoneNumber = recipient,
                                contactName = contactName,
                                message = body,
                                sheetTitle = prefs.smsDriveSheetTitle
                            )

                            if (isSynced) {
                                val who = if (contactName != null) "$contactName($recipient)" else recipient
                                Log.i(TAG, "🎉 [발신 문자 시트 기록 완료] $who")

                                // UI 갱신 브로드캐스트
                                val updateIntent = Intent(SmsReceiver.ACTION_SMS_RECEIVED).apply {
                                    putExtra("smsBody", "[발신] -> ${contactName ?: recipient}: $body")
                                    putExtra("sender", contactName ?: recipient)
                                    putExtra("success", true)
                                    setPackage(context.packageName)
                                }
                                context.sendBroadcast(updateIntent)
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "발신 SMS 감지 중 오류: ${e.message}")
            }
        }
    }

    private fun matchesSmsFilter(recipient: String, contactName: String?, filter: String): Boolean {
        if (filter.isBlank()) return true
        val keywords = filter.split(",", ";", " ").map { it.trim() }.filter { it.isNotBlank() }
        val cleanRecipient = recipient.replace("-", "").replace(" ", "").lowercase()
        val cleanName = (contactName ?: "").replace(" ", "").lowercase()

        for (kw in keywords) {
            val cleanKw = kw.replace("-", "").replace(" ", "").lowercase()
            if (cleanRecipient.contains(cleanKw) || cleanName.contains(cleanKw) || (contactName != null && contactName.contains(kw))) {
                return true
            }
        }
        return false
    }
}
