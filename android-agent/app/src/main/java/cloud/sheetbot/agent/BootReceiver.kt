package cloud.sheetbot.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.i("BootReceiver", "스마트폰 재부팅 완료 감지. SheetBot 입금확인 서비스를 자동 재시작합니다.")
            val prefs = PreferencesManager(context)
            if (prefs.isPaired) {
                KeepAliveService.start(context)
            }
        }
    }
}
