package cloud.sheetbot.agent.user.card

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding

/**
 * 🛡️ 시스템 권한 및 무중단 백그라운드 최적화 예외 전담 컨트롤러
 *
 * - 런타임 필수 권한(SMS, 카메라, 알림, 오디오, 통화기록, 연락처 등) 확인 및 일괄 요청
 * - 은행 입금/푸시 및 메시지 실시간 감지를 위한 '알림 접근 허용(NotificationListener)' 확인 및 설정 안내 다이얼로그
 * - 절전 모드로 인한 서비스 종료 방지 '배터리 최적화 예외' 확인 및 시스템 요청
 * - 안드로이드 11+ 서드파티 통화녹음 폴더 읽기를 위한 '모든 파일에 대한 접근(MANAGE_EXTERNAL_STORAGE)' 권한 점검 및 안내
 */
class PermissionController(
    private val activity: AppCompatActivity,
    private val binding: ActivityMainBinding,
    private val launchPermissionRequest: (Array<String>) -> Unit
) {

    fun setup() {
        // 배터리 최적화 예외 요청 버튼
        binding.btnBatteryOpt.setOnClickListener {
            requestIgnoreBatteryOptimization()
        }

        // 금융사 앱 푸시 감지 권한 요청 버튼
        binding.btnNotificationPermission.setOnClickListener {
            requestNotificationListenerPermission()
        }
    }

    fun checkPermissions() {
        val permissionsToRequest = mutableListOf<String>()

        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.RECEIVE_SMS)
        }
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.READ_SMS)
        }
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.SEND_SMS)
        }
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.CAMERA)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.READ_MEDIA_AUDIO)
            }
        } else {
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
        }
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.READ_PHONE_STATE)
        }
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.READ_CALL_LOG)
        }
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.READ_CONTACTS)
        }
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.WRITE_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.WRITE_CONTACTS)
        }

        if (permissionsToRequest.isNotEmpty()) {
            launchPermissionRequest(permissionsToRequest.toTypedArray())
        } else {
            checkAndRequestBatteryOptimization()
            checkNotificationListenerPermission()
        }
    }

    fun onPermissionResult(permissions: Map<String, Boolean>) {
        val smsGranted = permissions[Manifest.permission.RECEIVE_SMS] == true
        if (smsGranted) {
            Toast.makeText(activity, "SMS 감지 권한이 승인되었습니다.", Toast.LENGTH_SHORT).show()
        }
        checkAndRequestBatteryOptimization()
        checkNotificationListenerPermission()
    }

    fun isNotificationListenerEnabled(): Boolean {
        val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(activity)
        return enabledPackages.contains(activity.packageName)
    }

    fun checkNotificationListenerPermission() {
        if (!isNotificationListenerEnabled()) {
            binding.btnNotificationPermission.visibility = View.VISIBLE
        } else {
            binding.btnNotificationPermission.visibility = View.GONE
        }
    }

    fun requestNotificationListenerPermission() {
        AlertDialog.Builder(activity)
            .setTitle("🔔 알림 접근 권한 필요")
            .setMessage("구글 메시지(RCS 채팅 포함), 카카오톡 및 은행 입금 푸시 알림을 0원으로 실시간 감지하여 구글 시트에 자동 기록하기 위해 '알림 접근 권한'을 허용해 주세요.\n\n[설정으로 이동]을 누른 후 'SheetBot Agent'를 활성화해 주시면 됩니다.")
            .setPositiveButton("설정으로 이동") { _, _ ->
                try {
                    val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                    activity.startActivity(intent)
                } catch (_: Exception) {
                    Toast.makeText(activity, "알림 접근 설정 화면을 열 수 없습니다.", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("나중에", null)
            .show()
    }

    fun checkAndRequestBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = activity.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(activity.packageName)) {
                binding.btnBatteryOpt.visibility = View.VISIBLE
            } else {
                binding.btnBatteryOpt.visibility = View.GONE
            }
        }
    }

    fun requestIgnoreBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${activity.packageName}")
                }
                activity.startActivity(intent)
            } catch (_: Exception) {
                val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                activity.startActivity(intent)
            }
        }
    }

    /**
     * 안드로이드 11+ (API 30+) 환경에서 서드파티 통화 녹음(에이닷, T전화 등) 폴더 파일 읽기를 위한
     * '모든 파일에 대한 접근'(MANAGE_EXTERNAL_STORAGE) 권한 점검 및 안내 다이얼로그 (v2.1.27)
     */
    fun checkAndRequestAllFilesAccess(onGranted: (() -> Unit)? = null) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (Environment.isExternalStorageManager()) {
                onGranted?.invoke()
            } else {
                AlertDialog.Builder(activity)
                    .setTitle("📁 모든 파일 관리 권한 허용 안내")
                    .setMessage("에이닷(A.), T전화 등 별도 통화 녹음 어플에 저장된 녹음 파일을 구글 드라이브로 자동 백업하기 위해 '모든 파일에 대한 접근' 권한이 필요합니다.\n\n[설정으로 이동]을 누른 후 '모든 파일 관리 허용' 스위치를 켜주세요.")
                    .setPositiveButton("설정으로 이동") { _, _ ->
                        try {
                            val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                                data = Uri.fromParts("package", activity.packageName, null)
                            }
                            activity.startActivity(intent)
                        } catch (e: Exception) {
                            try {
                                val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                                activity.startActivity(intent)
                            } catch (e2: Exception) {
                                Toast.makeText(activity, "설정 화면을 열 수 없습니다: ${e2.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                    .setNegativeButton("나중에", null)
                    .show()
            }
        } else {
            // Android 10 이하
            val perm = Manifest.permission.READ_EXTERNAL_STORAGE
            if (ContextCompat.checkSelfPermission(activity, perm) == PackageManager.PERMISSION_GRANTED) {
                onGranted?.invoke()
            } else {
                androidx.core.app.ActivityCompat.requestPermissions(activity, arrayOf(perm, Manifest.permission.WRITE_EXTERNAL_STORAGE), 1099)
            }
        }
    }
}
