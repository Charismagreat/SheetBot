package cloud.sheetbot.agent.user.card

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import cloud.sheetbot.agent.user.SmsReceiver
import cloud.sheetbot.agent.user.SmsSentObserver

/**
 * 📨 실시간 SMS 발신 감지 및 입금 브로드캐스트 리시버 컨트롤러 (v2.1.99 모듈화)
 *
 * - 스마트폰 직접 발신(Sent) 문자 실시간 감지 ContentObserver 등록 및 해제
 * - 고객 실시간 수신 SMS 및 입금 감지 BroadcastReceiver 등록 및 해제 (Android 13+ RECEIVER_NOT_EXPORTED 대응)
 * - 입금/SMS 감지 시 실시간 로그 추가 및 타겟 뱃지 갱신 콜백 연동
 */
class SmsObserverController(
    private val context: Context,
    private val onDepositOrSmsReceived: (sender: String, body: String, success: Boolean) -> Unit
) {
    private var smsSentObserver: SmsSentObserver? = null
    private var isDepositReceiverRegistered = false

    private val depositUpdateReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
            val body = intent?.getStringExtra("smsBody") ?: ""
            val sender = intent?.getStringExtra("sender") ?: ""
            val success = intent?.getBooleanExtra("success", false) ?: false
            onDepositOrSmsReceived(sender, body, success)
        }
    }

    fun register() {
        // 1. 스마트폰 직접 발신(Sent) 문자 실시간 감지 Observer 등록
        try {
            smsSentObserver = SmsSentObserver(context)
            context.contentResolver.registerContentObserver(
                SmsSentObserver.SMS_CONTENT_URI,
                true,
                smsSentObserver!!
            )
        } catch (e: Exception) {
            Log.w("SmsObserverController", "SmsSentObserver 등록 실패: ${e.message}")
        }

        // 2. 실시간 고객 SMS 수신 및 입금 감지 브로드캐스트 리시버 등록
        try {
            val filter = IntentFilter().apply {
                addAction(SmsReceiver.ACTION_SMS_RECEIVED)
                addAction(SmsReceiver.ACTION_DEPOSIT_DETECTED)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(depositUpdateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                context.registerReceiver(depositUpdateReceiver, filter)
            }
            isDepositReceiverRegistered = true
        } catch (e: Throwable) {
            Log.w("SmsObserverController", "depositUpdateReceiver 등록 예외: ${e.message}")
        }
    }

    fun unregister() {
        try {
            smsSentObserver?.let { context.contentResolver.unregisterContentObserver(it) }
            smsSentObserver = null
        } catch (_: Throwable) {}

        try {
            if (isDepositReceiverRegistered) {
                context.unregisterReceiver(depositUpdateReceiver)
                isDepositReceiverRegistered = false
            }
        } catch (_: Throwable) {}
    }
}
