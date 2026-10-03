package cloud.sheetbot.agent.user

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * 이용자용 SheetBot Agent 전용 SMS 수신 리시버
 * 스마트폰으로 수신된 고객 SMS를 실시간 감지하여 사용자의 구글 시트 대장으로 동기화
 */
class SmsReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "UserSmsReceiver"
        const val SMS_CHANNEL_ID = "sheetbot_user_sms_channel"
        const val ACTION_SMS_RECEIVED = "cloud.sheetbot.agent.user.SMS_RECEIVED"
        const val ACTION_DEPOSIT_DETECTED = "cloud.sheetbot.agent.user.DEPOSIT_DETECTED"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val prefs = PreferencesManager(context)
        val userEmail = prefs.userEmail

        if (!prefs.isPaired || userEmail.isNullOrBlank()) {
            Log.w(TAG, "시트봇 계정에 연동되지 않아 SMS 수신 동기화를 건너뜁니다.")
            return
        }

        try {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            if (messages.isNullOrEmpty()) return

            val rawSender = messages[0].originatingAddress ?: ""
            val fullBody = messages.joinToString("") { it.messageBody ?: "" }

            // 1. 15초 이내 동일 발신자+본문 중복 수신 원천 차단 (SmsReceiver & BankNotificationListener 공통 선점 가드)
            if (!SmsDedupeManager.shouldProcessMessage("INBOUND", rawSender, fullBody)) {
                Log.d(TAG, "15초 이내 동일한 수신 SMS 중복 감지 - 무시합니다.")
                return
            }

            // 2. 발신자 번호 정규화 (82 국가코드 제거 및 하이픈 표준화)
            val sender = ContactHelper.formatPhoneNumber(rawSender)

            Log.i(TAG, "📱 [고객 SMS 수신 감지] 발신: $sender / 본문: ${fullBody.take(40)}...")

            // 3. 주소록 매칭 및 필터 검사
            val contactName = ContactHelper.getContactName(context, sender)
            val filter = prefs.smsTargetFilter.trim()
            if (!matchesSmsFilter(sender, contactName, filter)) {
                Log.d(TAG, "SMS 필터 제외 대상: $sender / $contactName")
                return
            }

            val pendingResult = goAsync()
            CoroutineScope(Dispatchers.IO).launch {
                var pendingFinished = false
                try {
                    val syncResult = if (prefs.isSmsSheetSyncEnabled) {
                        ApiClient.sendSmsSync(
                            userEmail = userEmail,
                            direction = "INBOUND",
                            phoneNumber = sender,
                            contactName = contactName,
                            message = fullBody,
                            sheetTitle = prefs.smsDriveSheetTitle
                        )
                    } else {
                        ApiClient.sendInboundSms(
                            userEmail = userEmail,
                            sender = sender,
                            message = fullBody
                        )
                    }

                    val isSynced = syncResult.success
                    showInboundSmsNotification(context, contactName ?: sender, fullBody, isSynced)

                    // UI 로그 갱신용 브로드캐스트 발송
                    val updateIntent = Intent(ACTION_SMS_RECEIVED).apply {
                        putExtra("smsBody", "[수신] ${contactName?.let { "$it: " } ?: ""}$fullBody")
                        putExtra("sender", contactName ?: sender)
                        putExtra("success", isSynced)
                        setPackage(context.packageName)
                    }
                    context.sendBroadcast(updateIntent)

                    // ⚡ [ANR 방어]: BroadcastReceiver 생명주기를 여기서 즉시 안전하게 마감하여 OS ANR 다이얼로그 원천 차단
                    pendingResult.finish()
                    pendingFinished = true

                    // 🎯 고객 영수증 문자 자동 발송 (스마트 간편 주문 매칭 시 - 백그라운드 코루틴에서 무중단 발송)
                    if (prefs.isReceiptSmsEnabled && !syncResult.replySmsPhone.isNullOrBlank()) {
                        val custName = syncResult.depositorName?.takeIf { it.isNotBlank() } ?: "고객"
                        val custAmount = syncResult.amountKrw

                        // 🎯 [앱 설정 최우선] 고객 발송 영수증 문구 템플릿 란에 설정된 문구를 1순위로 적용
                        val template = prefs.receiptSmsTemplate.takeIf { it.isNotBlank() }
                            ?: (syncResult.replySmsText?.takeIf { it.isNotBlank() }
                                ?: "[SheetBot] {고객명}님, {금액} 결제가 정상 확인되었습니다. 이용해 주셔서 감사합니다.")

                        val msgToSend = SmsSenderUtil.formatReceiptMessage(
                            template = template,
                            customerName = custName,
                            amountKrw = custAmount
                        )

                        if (msgToSend.isNotBlank()) {
                            val (isSent, finalMsg) = SmsSenderUtil.sendSmsDetailed(context, syncResult.replySmsPhone, msgToSend)
                            val statusLabel = if (isSent) "전송 완료" else "전송 실패"
                            Log.i(TAG, "📲 [SMS 수신 연계 영수증 SMS $statusLabel] 수신: ${syncResult.replySmsPhone} (고객: $custName) / 내용: $finalMsg")
                            ApiClient.sendReceiptSmsSync(
                                userEmail = userEmail,
                                recipientPhone = syncResult.replySmsPhone,
                                customerName = custName,
                                amount = custAmount,
                                receiptContent = finalMsg,
                                status = statusLabel
                            )
                        }
                    }

                    if (isSynced) {
                        val who = if (contactName != null) "$contactName($sender)" else sender
                        Log.i(TAG, "✅ [고객 문자 시트 동기화 완료] $who")
                        if (prefs.isTtsEnabled) {
                            val ttsMsg = syncResult.ttsText ?: "${contactName ?: "고객"}님의 새 문자가 구글 시트에 기록되었습니다."
                            TtsManager.speak(context, ttsMsg)
                        }
                    } else {
                        Log.w(TAG, "⚠️ [고객 문자 동기화 실패] 발신: $sender")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "고객 문자 동기화 중 오류 발생", e)
                } finally {
                    if (!pendingFinished) {
                        try { pendingResult.finish() } catch (_: Exception) {}
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "onReceive SMS 파싱 오류", e)
        }
    }

    private fun matchesSmsFilter(sender: String, contactName: String?, filter: String): Boolean {
        if (filter.isBlank()) return true
        val keywords = filter.split(",", ";", " ").map { it.trim() }.filter { it.isNotBlank() }
        val cleanSender = sender.replace("-", "").replace(" ", "").lowercase()
        val cleanName = (contactName ?: "").replace(" ", "").lowercase()

        for (kw in keywords) {
            val cleanKw = kw.replace("-", "").replace(" ", "").lowercase()
            if (cleanSender.contains(cleanKw) || cleanName.contains(cleanKw) || (contactName != null && contactName.contains(kw))) {
                return true
            }
        }
        return false
    }

    private fun showInboundSmsNotification(context: Context, sender: String, body: String, isSuccess: Boolean) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                SMS_CHANNEL_ID,
                "SheetBot 고객 문자 수신 알림",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "고객 문의 문자가 수신되어 구글 시트로 동기화되었을 때 알립니다."
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }

        val statusText = if (isSuccess) "시트 동기화 완료" else "동기화 재시도 대기"
        val title = "💬 [고객 문자] $sender ($statusText)"
        val snippet = body.replace("\n", " ").take(80)

        val notification = NotificationCompat.Builder(context, SMS_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(snippet)
            .setStyle(NotificationCompat.BigTextStyle().bigText("발신: $sender\n\n$body"))
            .setSmallIcon(android.R.drawable.sym_action_chat)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        manager.notify((System.currentTimeMillis() % 100000).toInt(), notification)
    }
}
