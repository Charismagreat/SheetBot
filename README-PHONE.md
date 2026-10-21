"# Android In-App Update: Fixing Blocked Installs (Samsung Auto Blocker)

Applies to both apps: `android-user-agent` (`cloud.sheetbot.agent.user`) and `android-agent` (`cloud.sheetbot.agent`), in `UpdateManager.kt`.

## Problem

After tapping the update button, users can't find or open the APK in Files by Google / Samsung My Files, and the update never installs.

## Diagnosis

| Claim | Verdict |
|---|---|
| APK is saved to `cacheDir`, so file managers can't see it | True, but **this is expected and not the bug**. |
| Moving the APK to `Downloads` will fix it | **Unlikely.** Samsung Auto Blocker restricts installs from sources other than Play Store / Galaxy Store, so an APK in Downloads is blocked too. |
| `canRequestPackageInstalls() == false` makes `checkInstallPermissionAndDownload` return early | True. Today the user is left stuck with no way forward. |
| Install is blocked silently and the user gets no feedback | **The real problem.** |

> Verify on a real Samsung device before relying on any of the above (see ""Testing"").

## Fix overview

1. Keep downloading to `cacheDir` and install via `FileProvider` / `PackageInstaller`. Do not move the file to Downloads.
2. Handle the ""install unknown apps"" permission explicitly and resume automatically.
3. Detect and explain Samsung Auto Blocker.
4. Use `PackageInstaller` sessions to get real success/failure callbacks.
5. Verify the APK hash before installing.
6. Offer a browser fallback.
7. Long term: distribute via Play Store (internal/closed testing is fine) or Galaxy Store.

---

## 1. Handle the install-permission state

When `canRequestPackageInstalls()` is false, send the user to the per-app settings screen, then continue the download when they return.

```kotlin
private var pendingUpdate: UpdateInfo? = null

fun checkInstallPermissionAndDownload(activity: Activity, info: UpdateInfo) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        !activity.packageManager.canRequestPackageInstalls()
    ) {
        pendingUpdate = info
        AlertDialog.Builder(activity)
            .setTitle(""앱 설치 권한 필요"")
            .setMessage(""업데이트를 설치하려면 '이 출처 허용'을 켜 주세요."")
            .setPositiveButton(""설정 열기"") { _, _ ->
                activity.startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse(""package:${activity.packageName}"")
                    )
                )
            }
            .setNegativeButton(""취소"") { _, _ -> pendingUpdate = null }
            .show()
        return
    }
    downloadAndInstall(activity, info)
}

// Call this from the Activity's onResume()
fun onActivityResumed(activity: Activity) {
    val info = pendingUpdate ?: return
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
        activity.packageManager.canRequestPackageInstalls()
    ) {
        pendingUpdate = null
        downloadAndInstall(activity, info)
    }
}
```

## 2. Explain Samsung Auto Blocker

If the toggle is greyed out or the install is blocked, tell the user what to do. Show this only when relevant (Samsung device, and the install was blocked).

```kotlin
fun isSamsung() = Build.MANUFACTURER.equals(""samsung"", ignoreCase = true)

fun showAutoBlockerDialog(activity: Activity) {
    AlertDialog.Builder(activity)
        .setTitle(""설치가 차단되었습니다"")
        .setMessage(
            ""삼성 '자동 차단' 기능이 앱 설치를 막고 있을 수 있습니다.\n\n"" +
            ""설정 → 보안 및 개인정보 보호 → 자동 차단 → 끄기\n\n"" +
            ""설치 후 다시 켜셔도 됩니다.""
        )
        .setPositiveButton(""설정 열기"") { _, _ ->
            activity.startActivity(Intent(Settings.ACTION_SETTINGS))
        }
        .setNegativeButton(""닫기"", null)
        .show()
}
```

Menu names can differ between One UI versions. Check them on a real device and adjust the wording.

## 3. Install with `PackageInstaller` (recommended)

Replaces `ACTION_VIEW` + `FileProvider`. You get status callbacks instead of silent failures.

```kotlin
private const val ACTION_INSTALL_RESULT = ""cloud.sheetbot.agent.INSTALL_RESULT""

fun installApk(context: Context, apkFile: File) {
    val installer = context.packageManager.packageInstaller
    val params = PackageInstaller.SessionParams(
        PackageInstaller.SessionParams.MODE_FULL_INSTALL
    )
    val sessionId = installer.createSession(params)

    installer.openSession(sessionId).use { session ->
        apkFile.inputStream().use { input ->
            session.openWrite(""update.apk"", 0, apkFile.length()).use { out ->
                input.copyTo(out)
                session.fsync(out)
            }
        }
        val intent = Intent(ACTION_INSTALL_RESULT).setPackage(context.packageName)
        // Must be MUTABLE: the system adds status extras to this intent.
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                PendingIntent.FLAG_MUTABLE else 0)
        val pi = PendingIntent.getBroadcast(context, sessionId, intent, flags)
        session.commit(pi.intentSender)
    }
}
```

Receiver:

```kotlin
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // System needs the user to confirm the install.
                val confirm: Intent? = if (Build.VERSION.SDK_INT >= 33)
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                else @Suppress(""DEPRECATION"") intent.getParcelableExtra(Intent.EXTRA_INTENT)
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                confirm?.let(context::startActivity)
            }
            PackageInstaller.STATUS_SUCCESS -> { /* app restarts with new version */ }
            PackageInstaller.STATUS_FAILURE_BLOCKED -> {
                // Show Auto Blocker / policy guidance (section 2)
                notifyBlocked(context)
            }
            else -> {
                val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                Log.w(""UpdateManager"", ""Install failed: status=$status msg=$msg"")
                notifyFailed(context, msg)
            }
        }
    }
}
```

Manifest (not exported, since the intent is explicit to our own package):

```xml
<receiver
    android:name="".InstallResultReceiver""
    android:exported=""false"">
    <intent-filter>
        <action android:name=""cloud.sheetbot.agent.INSTALL_RESULT"" />
    </intent-filter>
</receiver>
```

`notifyBlocked` / `notifyFailed` should surface a dialog or notification. A receiver can't show a dialog by itself, so post a notification or send an event to the foreground Activity.

Keep `REQUEST_INSTALL_PACKAGES` in the manifest. It's required for `canRequestPackageInstalls()` and for the install flow.

## 4. Verify the download before installing

Expose a SHA-256 in your version API (the `route.ts` endpoint) and check it client-side.

```kotlin
fun sha256(file: File): String {
    val md = MessageDigest.getInstance(""SHA-256"")
    file.inputStream().use { s ->
        val buf = ByteArray(8192)
        while (true) { val n = s.read(buf); if (n <= 0) break; md.update(buf, 0, n) }
    }
    return md.digest().joinToString("""") { ""%02x"".format(it) }
}

if (!sha256(apkFile).equals(info.sha256, ignoreCase = true)) {
    apkFile.delete()
    showError(""다운로드한 파일이 손상되었습니다. 다시 시도해 주세요."")
    return
}
```

Also delete any old `sheetbot_*_update.apk` in `cacheDir` before starting a new download.

## 5. Browser fallback

If the in-app install fails, let users download manually:

```kotlin
fun openInBrowser(activity: Activity, url: String) {
    activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
}
// e.g. https://sheetbot.cloud/downloads/SheetBotAgent.apk
```

This only helps users who aren't blocked by Auto Blocker. Auto Blocker will still block browser-downloaded APKs from being installed, but the file will then be visible in Files by Google, which is what users were asking for.

## 6. Long-term recommendation

If much of your user base is on Samsung phones with Auto Blocker on (it is on by default on some newer One UI versions), self-hosted APK updates will keep causing support issues. Consider:

- **Google Play** (internal or closed testing is fine) with the Play In-App Updates API.
- **Galaxy Store** for Samsung users.

## Testing checklist

- [ ] Samsung device, One UI 6+, Auto Blocker **on**: confirm what `canRequestPackageInstalls()` returns and whether the settings toggle is greyed out.
- [ ] Same device, Auto Blocker **off**: update succeeds end to end.
- [ ] Non-Samsung device: update succeeds, permission flow resumes automatically after returning from Settings.
- [ ] Corrupt/partial download: hash check rejects it and the user sees a clear message.
- [ ] Capture logs: `adb logcat | grep -i -E ""PackageInstaller|UpdateManager""`
- [ ] Verify both apps (`android-user-agent` and `android-agent`), since each has its own `UpdateManager.kt` with a different cache file name.

## Files to touch

- `android-user-agent/.../UpdateManager.kt`
- `android-agent/.../UpdateManager.kt`
- `AndroidManifest.xml` (both apps): add the receiver
- Version API route (`route.ts`): add a `sha256` field
- Activity `onResume()`: call `onActivityResumed`"