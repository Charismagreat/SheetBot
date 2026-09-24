package cloud.sheetbot.agent

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager

data class BatteryStatus(
    val level: Int,
    val isCharging: Boolean,
    val pluggedType: String
)

/**
 * 실시간 배터리 잔량 및 충전 상태 조회 유틸리티
 */
object BatteryUtil {
    fun getBatteryStatus(context: Context): BatteryStatus {
        val ifilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus: Intent? = context.registerReceiver(null, ifilter)

        val level: Int = batteryStatus?.let { intent ->
            val rawLevel = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            if (rawLevel >= 0 && scale > 0) {
                ((rawLevel.toFloat() / scale.toFloat()) * 100).toInt()
            } else {
                -1
            }
        } ?: -1

        val status: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging: Boolean = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL

        val chargePlug: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1
        val pluggedType = when (chargePlug) {
            BatteryManager.BATTERY_PLUGGED_USB -> "USB"
            BatteryManager.BATTERY_PLUGGED_AC -> "AC 어댑터"
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> "무선충전"
            else -> "배터리 사용 중"
        }

        return BatteryStatus(
            level = if (level >= 0) level else 100,
            isCharging = isCharging,
            pluggedType = pluggedType
        )
    }
}
