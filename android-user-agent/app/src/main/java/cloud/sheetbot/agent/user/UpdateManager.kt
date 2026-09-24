package cloud.sheetbot.agent.user

import android.app.Activity
import android.app.AlertDialog
import android.app.ProgressDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.core.content.FileProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/**
 * 인앱 원클릭 무삭제 덮어쓰기 업데이트 매니저
 */
object UpdateManager {
    private const val TAG = "UpdateManager"

    private val downloadClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    fun checkForUpdates(activity: Activity, showToastIfLatest: Boolean = false) {
        CoroutineScope(Dispatchers.IO).launch {
            val versionInfo = ApiClient.fetchLatestVersion()
            val currentPackageInfo = try {
                activity.packageManager.getPackageInfo(activity.packageName, 0)
            } catch (_: Exception) {
                null
            }
            val currentVersionCode = try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    currentPackageInfo?.longVersionCode?.toInt() ?: 1
                } else {
                    @Suppress("DEPRECATION")
                    currentPackageInfo?.versionCode ?: 1
                }
            } catch (_: Exception) {
                1
            }
            val currentVersionName = currentPackageInfo?.versionName ?: "1.0.0"

            withContext(Dispatchers.Main) {
                if (activity.isFinishing || activity.isDestroyed) return@withContext

                val hasUpdate = versionInfo != null && (
                    versionInfo.latestVersionCode > currentVersionCode ||
                    isNewerVersion(versionInfo.latestVersionName, currentVersionName)
                )

                if (hasUpdate && versionInfo != null) {
                    showUpdateDialog(activity, versionInfo)
                } else if (showToastIfLatest) {
                    val ver = versionInfo?.latestVersionName ?: currentVersionName
                    Toast.makeText(activity, "현재 최신 버전(v${ver})을 사용 중입니다.", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun isNewerVersion(remote: String, local: String): Boolean {
        try {
            val rParts = remote.split(".").mapNotNull { it.toIntOrNull() }
            val lParts = local.split(".").mapNotNull { it.toIntOrNull() }
            val maxLen = maxOf(rParts.size, lParts.size)
            for (i in 0 until maxLen) {
                val r = rParts.getOrElse(i) { 0 }
                val l = lParts.getOrElse(i) { 0 }
                if (r > l) return true
                if (r < l) return false
            }
        } catch (_: Exception) {}
        return false
    }

    private fun showUpdateDialog(activity: Activity, info: VersionInfo) {
        val notes = if (info.releaseNotes.isNotBlank()) info.releaseNotes else "새로운 기능과 안정성 개선이 포함되었습니다."
        AlertDialog.Builder(activity)
            .setTitle("🚀 새로운 업데이트 (v${info.latestVersionName})")
            .setMessage("${notes}\n\n기존 앱을 삭제하지 않고 [업데이트] 버튼으로 바로 덮어쓰기 설치가 가능합니다. 지금 진행하시겠습니까?")
            .setPositiveButton("지금 업데이트") { _, _ ->
                checkInstallPermissionAndDownload(activity, info)
            }
            .setNegativeButton("나중에", null)
            .show()
    }

    private fun checkInstallPermissionAndDownload(activity: Activity, info: VersionInfo) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!activity.packageManager.canRequestPackageInstalls()) {
                AlertDialog.Builder(activity)
                    .setTitle("앱 설치 권한 필요")
                    .setMessage("인앱 원클릭 업데이트를 위해 '출처를 알 수 없는 앱 설치' 권한을 허용해 주세요.")
                    .setPositiveButton("설정으로 이동") { _, _ ->
                        val intent = Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:${activity.packageName}")
                        )
                        activity.startActivity(intent)
                    }
                    .setNegativeButton("취소", null)
                    .show()
                return
            }
        }

        downloadAndInstall(activity, info)
    }

    private fun downloadAndInstall(activity: Activity, info: VersionInfo) {
        @Suppress("DEPRECATION")
        val progressDialog = ProgressDialog(activity).apply {
            setTitle("업데이트 다운로드")
            setMessage("최신 버전을 내려받고 있습니다... 잠시만 기다려 주세요.")
            setProgressStyle(ProgressDialog.STYLE_HORIZONTAL)
            max = 100
            setCancelable(false)
            show()
        }

        CoroutineScope(Dispatchers.IO).launch {
            val targetUrls = listOfNotNull(
                info.apkUrl.takeIf { it.isNotBlank() },
                info.fallbackApkUrl.takeIf { it.isNotBlank() }
            )

            var downloadSuccess = false
            val apkFile = File(activity.cacheDir, "sheetbot_agent_m_update.apk")
            if (apkFile.exists()) {
                apkFile.delete()
            }

            for (url in targetUrls) {
                try {
                    Log.i(TAG, "APK 다운로드 시도: $url")
                    val request = Request.Builder().url(url).build()
                    val response = downloadClient.newCall(request).execute()

                    if (response.isSuccessful && response.body != null) {
                        val body = response.body!!
                        val totalBytes = body.contentLength()
                        var downloadedBytes = 0L

                        body.byteStream().use { input ->
                            FileOutputStream(apkFile, false).use { output ->
                                val buffer = ByteArray(8 * 1024)
                                var bytesRead: Int
                                while (input.read(buffer).also { bytesRead = it } != -1) {
                                    output.write(buffer, 0, bytesRead)
                                    downloadedBytes += bytesRead
                                    if (totalBytes > 0) {
                                        val percent = ((downloadedBytes * 100) / totalBytes).toInt()
                                        withContext(Dispatchers.Main) {
                                            progressDialog.progress = percent
                                        }
                                    }
                                }
                                output.flush()
                            }
                        }

                        if (apkFile.exists() && apkFile.length() > 2 * 1024 * 1024) {
                            downloadSuccess = true
                            Log.i(TAG, "✅ APK 다운로드 완료 및 검증 성공: ${apkFile.length()} bytes")
                            break
                        } else {
                            Log.w(TAG, "⚠️ APK 파일 크기 이상 (${apkFile.length()} bytes). 다음 URL 시도...")
                            if (apkFile.exists()) apkFile.delete()
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "다운로드 실패 ($url): ${e.message}")
                    if (apkFile.exists()) apkFile.delete()
                }
            }

            withContext(Dispatchers.Main) {
                progressDialog.dismiss()

                if (downloadSuccess && apkFile.exists() && apkFile.length() > 0) {
                    installApk(activity, apkFile)
                } else {
                    Toast.makeText(activity, "업데이트 파일 다운로드에 실패했습니다. 네트워크를 확인해 주세요.", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun installApk(activity: Activity, apkFile: File) {
        try {
            val contentUri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            Log.i(TAG, "🚀 안드로이드 패키지 인스톨러 호출: $contentUri")
            activity.startActivity(installIntent)
        } catch (e: Exception) {
            Log.e(TAG, "인스톨러 호출 실패", e)
            Toast.makeText(activity, "설치 화면 호출 실패: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}
