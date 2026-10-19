# FileToSheet — Manager SMS Bridge Handoff Brief

Paste or reference this in a new session opened on `c:\dev\FileToSheet`.
The SheetBot side is finished (workspace `c:\dev\SheetBot`); this brief covers only what FileToSheet must change.

## Goal
Verification-code SMS must actually be sent. They go through the SheetBot bridge to the manager's phone
(app `cloud.sheetbot.agent.manager`), which sends them over the carrier network.

## Bridge contract (SheetBot → implemented)

`POST {SHEETBOT_BRIDGE_URL}/api/sms/bridge/dispatch`

Headers: `Content-Type: application/json`, `x-sheetbot-bridge-key: <SHEETBOT_BRIDGE_API_KEY>`

Body:
```json
{
  "purpose": "send-code",            // REQUIRED: "send-code" | "emergency-recovery" | "transfer-account"
  "sourceService": "FileToSheet",
  "recipient": "010-1234-5678",      // Korean mobile numbers only
  "message": "[FileToSheet] 인증번호 123456 ...",
  "callbackUrl": "https://file2sheet.cloud/api/sms/callback"   // must be https
}
```

Responses:
| HTTP | Body | Meaning |
|---|---|---|
| 200 | `{ success: true, dispatchId, uuid, status: "QUEUED" }` | Queued for the manager phone |
| 400 | `{ success: false, error }` | Bad `purpose`, number, message or callbackUrl |
| 401 | `{ success: false, error }` | Wrong bridge key |
| 503 | `{ success: false, code: "NO_MANAGER_ONLINE" }` | No manager phone polled in the last 60 s |
| 503 | `{ success: false, error }` (no `code`) | Bridge not configured on SheetBot |

Notes:
- Jobs older than **3 minutes** are expired by SheetBot and never sent. Keep code validity ≥ 5 min, and tell the user to retry on failure.
- SheetBot calls `callbackUrl` with `{ success, status: "SUCCESS"|"FAILED", dispatchId, uuid, recipient, error, sentAt, deviceId, reportedAt }`.
- SheetBot masks 4–8 digit numbers in its own logs, and replaces the queue message after completion. Do the same in FileToSheet logs (`sms_dispatch_logs.body`).

## Work to do

1. **`src/lib/sheetbot-sms-bridge.ts`**
   - Remove the hardcoded `DEFAULT_BRIDGE_KEY` and `DEFAULT_BRIDGE_URL`. Read `SHEETBOT_BRIDGE_URL` and `SHEETBOT_BRIDGE_API_KEY` from env only; if either is missing, return `{ success: false, error: 'bridge not configured' }` without sending.
   - Add a required `purpose` field to `DispatchSmsOptions` and forward it in the request body.
   - Return the `code` (e.g. `NO_MANAGER_ONLINE`) from SheetBot's error response in `DispatchSmsResult` so callers can branch on it.
   - Mask the verification code before writing `sms_dispatch_logs`.
2. **`src/app/api/auth/phone/send-code/route.ts`**
   - Currently only stores the code and returns it as `testCode`, which exposes the code to anyone. Call `dispatchSmsViaSheetBot({ purpose: 'send-code', ... })`.
   - Return `testCode` only when `NODE_ENV === 'development'`.
   - If dispatch fails, do not leave a usable code behind: delete/invalidate the stored code and return an error.
3. **`emergency-recovery` and `transfer-account` routes** — check for the same leak, then send with `purpose: 'emergency-recovery'` / `'transfer-account'` and apply the same dev-only `testCode` rule.
4. **Offline behaviour** — the decision is **fail** (no Aligo fallback for now). On `NO_MANAGER_ONLINE`, return a clear 503 message ("문자 발송 담당 기기가 오프라인입니다. 잠시 후 다시 시도해 주세요.").
5. **`src/app/api/sms/callback/route.ts`** — already updates `sms_dispatch_logs`; verify it matches on `dispatchId`/`uuid` and consider authenticating the callback (e.g. a shared secret) since it is a public endpoint.
6. **Env** — set in FileToSheet `.env.local` (dev) and production by the developer:
   ```
   SHEETBOT_BRIDGE_URL=https://sheetbot.cloud
   SHEETBOT_BRIDGE_API_KEY=<same value as in c:\dev\SheetBot\.env.local>
   ```
   The value is a generated secret that already lives in `c:\dev\SheetBot\.env.local` (variable `SHEETBOT_BRIDGE_API_KEY`). Do not commit it or paste it into logs/docs.
   The old key `sb_bridge_sec_98f41e0a82b3d17c` is in git history, so treat it as burned.

## Verification
- With the manager app paired and online, call `send-code` for a real number and confirm the SMS arrives and `sms_dispatch_logs` goes QUEUED → delivered via callback.
- Stop the app (or wait 60 s) and confirm the 503 path and that no code remains valid.
- Confirm the response body no longer contains `testCode` when `NODE_ENV=production`.
