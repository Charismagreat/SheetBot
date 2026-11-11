package cloud.sheetbot.agent.user

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            action == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            Log.i("BootReceiver", "시스템 이벤트($action) 감지 -> SheetBot 상주 서비스 및 알림 리스너 자동 재바인딩 실행")
            BankNotificationListener.ensureListenerBound(context)
            val prefs = PreferencesManager(context)
            if (prefs.isPaired || prefs.isFtsPaired) {
                KeepAliveService.start(context)
            }
        }
    }
}
