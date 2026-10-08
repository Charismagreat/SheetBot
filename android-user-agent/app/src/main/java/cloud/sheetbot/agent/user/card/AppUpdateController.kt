package cloud.sheetbot.agent.user.card

import android.app.Activity
import android.graphics.Color
import cloud.sheetbot.agent.user.BuildConfig
import cloud.sheetbot.agent.user.R
import cloud.sheetbot.agent.user.UpdateManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding

/**
 * 📲 앱 버전 감지 및 업데이트 뱃지 컨트롤러 (v2.1.99 모듈화)
 *
 * - 패키지 매니저 기반 앱 버전명 조회 및 BuildConfig 폴백
 * - 백그라운드 무음 업데이트 검사 및 시각적 알림 뱃지 표시 (UPDATE 🔴)
 * - 상단 버전 뱃지 및 업데이트 확인 버튼 수동 검사 리스너 바인딩
 */
class AppUpdateController(
    private val activity: Activity,
    private val binding: ActivityMainBinding
) {
    fun setup() {
        binding.btnCheckUpdate.setOnClickListener {
            UpdateManager.checkForUpdates(activity, showToastIfLatest = true)
        }

        binding.tvAppVersionBadge.setOnClickListener {
            UpdateManager.checkForUpdates(activity, showToastIfLatest = true)
        }
    }

    fun getAppVersionName(): String {
        return try {
            val pInfo = activity.packageManager.getPackageInfo(activity.packageName, 0)
            pInfo.versionName ?: BuildConfig.VERSION_NAME
        } catch (_: Exception) {
            BuildConfig.VERSION_NAME
        }
    }

    fun updateVersionBadge() {
        val verName = getAppVersionName()
        binding.tvAppVersionBadge.text = "v$verName"
        checkAppUpdateBadge()
    }

    /**
     * 상단 우측 앱 버전 뱃지의 업데이트 감지 및 시각적 알림 표시 (v2.1.20)
     */
    fun checkAppUpdateBadge() {
        UpdateManager.checkUpdateSilently(activity) { hasUpdate, _ ->
            if (!activity.isFinishing && !activity.isDestroyed) {
                val verName = getAppVersionName()
                if (hasUpdate) {
                    binding.tvAppVersionBadge.text = "v$verName (UPDATE 🔴)"
                    binding.tvAppVersionBadge.setBackgroundResource(R.drawable.bg_badge_version_update)
                    binding.tvAppVersionBadge.setTextColor(Color.parseColor("#FCA5A5"))
                } else {
                    binding.tvAppVersionBadge.text = "v$verName"
                    binding.tvAppVersionBadge.setBackgroundResource(R.drawable.bg_badge_version)
                    binding.tvAppVersionBadge.setTextColor(Color.parseColor("#10B981"))
                }
            }
        }
    }
}
