package cloud.sheetbot.agent.manager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && Prefs(context).isPaired) {
            try { SmsQueueService.start(context) } catch (_: Exception) {}
        }
    }
}
