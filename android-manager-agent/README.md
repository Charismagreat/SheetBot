# SheetBot Manager SMS Agent

Android app for the **manager's phone**. It sends FileToSheet's verification-code SMS over the carrier network.
It is the only app that sends bridge SMS (the SMS bridge code was removed from `android-user-agent` in 2.3.5).

- applicationId: `cloud.sheetbot.agent.manager`
- Scope: `send-code`, `emergency-recovery`, `transfer-account` only (enforced server-side by `purpose`)

## Flow

```
FileToSheet ──POST /api/sms/bridge/dispatch (x-sheetbot-bridge-key, purpose)──▶ SheetBot queue
Manager app ──GET  /api/manager-agent/sms-queue   (x-manager-device-key)──────▶ claims jobs
Manager app ──SmsManager.sendTextMessage (waits for carrier SENT result)
Manager app ──POST /api/manager-agent/sms-queue/report ───────────────────────▶ callbackUrl → FileToSheet
```

## Pairing

1. Admin → SheetBot dashboard → Admin → SMS tab → **페어링 QR 발급** (`/api/admin/manager-devices`).
2. In the app tap **QR 스캔하여 페어링** (or paste the `sheetbot-manager://pair?...` address).
3. The one-time token (10 min) is exchanged at `/api/manager-agent/pair` for a long-lived device key.
   The server stores only SHA-256 hashes. Revoking the device in the admin page makes the app unpair itself (HTTP 401).

Multiple manager phones are supported; a job is claimed by exactly one of them.

## Behaviour notes

- Polls every 5 s from a foreground service (wake lock held). Ask the user to exempt the app from battery optimisation.
- A job id is recorded locally *before* sending, so a crash never causes a duplicate verification SMS.
- Results that fail to upload are retried on the next poll.
- Jobs older than 3 minutes are expired server-side and never sent.
- If no manager phone polled in the last 60 s, the dispatch endpoint answers `503 { code: "NO_MANAGER_ONLINE" }`
  so the caller (FileToSheet) can decide to fail or fall back.

## Build

Open `android-manager-agent` in Android Studio, or run Gradle with JDK 17 (`gradle :app:assembleRelease`).
Signed with the shared `android-user-agent/keystore/sheetbot-agent.jks`.
