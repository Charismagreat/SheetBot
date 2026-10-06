package cloud.sheetbot.agent.user

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * 🔔 스마트 통합 할 일 허브 - 데일리 모닝 브리핑 매니저 (옵션 A)
 * - 매일 아침 9시 전후 시점에 오늘 마감 예정이거나 긴급한 할 일이 있을 경우 상단바 알림 발행
 * - 하루 1회 중복 발송 방지 (lastBriefingDate 멱등성 유지)
 */
object TaskBriefingManager {
    private const val TAG = "TaskBriefingManager"
    private const val CHANNEL_ID = "channel_task_briefing"
    private const val NOTIFICATION_ID = 3001
    private const val PREF_KEY_LAST_BRIEFING_DATE = "last_task_briefing_date"

    fun checkAndNotifyDailyBriefing(context: Context) {
        val prefs = PreferencesManager(context)
        val userEmail = prefs.userEmail ?: return

        val now = Calendar.getInstance()
        val hour = now.get(Calendar.HOUR_OF_DAY)

        // 아침 8시 ~ 11시 사이에만 브리핑 발행
        if (hour < 8 || hour >= 12) return

        val todayStr = SimpleDateFormat("yyyy-MM-dd", Locale.KOREA).format(Date())
        val lastDate = context.getSharedPreferences("sheetbot_prefs", Context.MODE_PRIVATE)
            .getString(PREF_KEY_LAST_BRIEFING_DATE, null)

        if (lastDate == todayStr) {
            // 오늘 이미 브리핑 발송 완료
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = ApiClient.fetchTasks(userEmail, "PENDING")
                if (!result.success || result.tasks.isEmpty()) return@launch

                val pendingTasks = result.tasks
                val dueTodayCount = pendingTasks.count { it.dueDate?.startsWith(todayStr) == true }
                val urgentCount = pendingTasks.count { it.priority.contains("URGENT") || it.priority.contains("HIGH") }

                if (pendingTasks.isNotEmpty()) {
                    showNotification(
                        context = context,
                        totalPending = pendingTasks.size,
                        dueTodayCount = dueTodayCount,
                        urgentCount = urgentCount
                    )

                    context.getSharedPreferences("sheetbot_prefs", Context.MODE_PRIVATE)
                        .edit()
                        .putString(PREF_KEY_LAST_BRIEFING_DATE, todayStr)
                        .apply()

                    Log.i(TAG, "🎉 [데일리 할 일 모닝 브리핑 발행 완료] 미완료: ${pendingTasks.size}건, 오늘마감: ${dueTodayCount}건")
                }
            } catch (e: Exception) {
                Log.w(TAG, "모닝 브리핑 체크 실패: ${e.localizedMessage}")
            }
        }
    }

    private fun showNotification(
        context: Context,
        totalPending: Int,
        dueTodayCount: Int,
        urgentCount: Int
    ) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "스마트 할 일 모닝 브리핑",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "매일 아침 오늘 마감 및 긴급 할 일 요약을 알려드립니다."
            }
            manager.createNotificationChannel(channel)
        }

        val intent = Intent(context, TasksActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getActivity(context, 0, intent, flags)

        val title = if (dueTodayCount > 0) {
            "📋 [SheetBot] 오늘 마감 할 일 ${dueTodayCount}건이 있습니다!"
        } else {
            "📋 [SheetBot] 진행 중인 할 일이 ${totalPending}건 있습니다."
        }

        val content = if (urgentCount > 0) {
            "긴급/높음 과업 ${urgentCount}건 포함 · 터치하여 즉시 확인하세요."
        } else {
            "터치하여 스마트 할 일 허브에서 오늘의 과업을 확인하세요."
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_agenda)
            .setContentTitle(title)
            .setContentText(content)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        manager.notify(NOTIFICATION_ID, notification)
    }
}
