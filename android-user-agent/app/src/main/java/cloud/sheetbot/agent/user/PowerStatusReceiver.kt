package cloud.sheetbot.agent.user

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * 전원 충전기 연결/분리 및 배터리 방전 비상 경보 리시버
 */
class PowerStatusReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "PowerStatusReceiver"
        const val POWER_CHANNEL_ID = "sheetbot_power_alerts"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val prefs = PreferencesManager(context)
        val userEmail = prefs.userEmail

        Log.i(TAG, "전원 상태 이벤트 감지: $action")

        when (action) {
            Intent.ACTION_POWER_CONNECTED -> {
                val status = BatteryUtil.getBatteryStatus(context)
                Log.i(TAG, "⚡ 충전기 연결됨 (잔량: ${status.level}%)")

                if (prefs.isTtsEnabled) {
                    TtsManager.speak(context, "충전기가 정상 연결되었습니다. 배터리 ${status.level}퍼센트입니다.")
                }

                showPowerNotification(context, "⚡ 충전기 연결됨", "전원이 공급 중입니다. (배터리 ${status.level}%)", false)

                // 서버 대시보드로 즉각 배터리 상태 갱신
                if (prefs.isPaired && !userEmail.isNullOrBlank()) {
                    CoroutineScope(Dispatchers.IO).launch {
                        ApiClient.sendHeartbeat(
                            prefs.heartbeatUrl,
                            prefs.fallbackHeartbeatUrl,
                            userEmail,
                            batteryLevel = status.level,
                            isCharging = true
                        )
                    }
                }
            }

            Intent.ACTION_POWER_DISCONNECTED -> {
                val status = BatteryUtil.getBatteryStatus(context)
                Log.w(TAG, "⚠️ 충전기 분리됨! (잔량: ${status.level}%)")

                if (prefs.isTtsEnabled) {
                    TtsManager.speak(context, "경고! 충전기가 분리되었습니다. 배터리 방전에 주의하세요.")
                }

                showPowerNotification(context, "⚠️ [경고] 충전기 분리 감지", "충전 케이블이 분리되었습니다! 24시간 무인 감지를 위해 전원을 다시 연결해 주세요.", true)

                // 서버 대시보드로 즉각 배터리 상태 갱신
                if (prefs.isPaired && !userEmail.isNullOrBlank()) {
                    CoroutineScope(Dispatchers.IO).launch {
                        ApiClient.sendHeartbeat(
                            prefs.heartbeatUrl,
                            prefs.fallbackHeartbeatUrl,
                            userEmail,
                            batteryLevel = status.level,
                            isCharging = false
                        )
                    }
                }
            }

            Intent.ACTION_BATTERY_LOW -> {
                val status = BatteryUtil.getBatteryStatus(context)
                Log.e(TAG, "🚨 배터리 위험 수준 도달! (잔량: ${status.level}%)")

                if (prefs.isTtsEnabled) {
                    TtsManager.speak(context, "비상 경고! 배터리가 부족하여 곧 꺼질 수 있습니다. 충전기를 즉시 연결하세요.")
                }

                showPowerNotification(context, "🚨 [비상] 배터리 방전 위험", "배터리 잔량이 ${status.level}%로 떨어졌습니다! 즉시 충전기를 연결하세요.", true)

                if (prefs.isPaired && !userEmail.isNullOrBlank()) {
                    CoroutineScope(Dispatchers.IO).launch {
                        ApiClient.sendHeartbeat(
                            prefs.heartbeatUrl,
                            prefs.fallbackHeartbeatUrl,
                            userEmail,
                            batteryLevel = status.level,
                            isCharging = status.isCharging
                        )
                    }
                }
            }
        }
    }

    private fun showPowerNotification(context: Context, title: String, message: String, isWarning: Boolean) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                POWER_CHANNEL_ID,
                "SheetBot 전원/배터리 경보",
                if (isWarning) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "충전기 분리 및 배터리 방전 위험 시 관리자에게 즉시 경고합니다."
                if (isWarning) enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(context, POWER_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setSmallIcon(if (isWarning) android.R.drawable.ic_dialog_alert else android.R.drawable.ic_dialog_info)
            .setPriority(if (isWarning) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .build()

        manager.notify(9002, notification)
    }
}
