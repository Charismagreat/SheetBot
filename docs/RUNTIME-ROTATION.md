# SheetBot / EGDesk — runtime & tunnel secret rotation

**Phase 1b** — rotate server-side secrets without redeploying every wrapped sheet.

## What to rotate

| Secret | Where it lives | Sheet impact |
|--------|----------------|--------------|
| EGDesk tunnel / MCP routing secret | EGDesk server / tunneling-service config | Legacy `EgdeskConfig.gs` sheets keep old key in Script Properties until re-wrap |
| SheetBot runtime token (`rt_*`) | `sheetbot_projects` (target) | Invalidates copied sheets; owner re-wraps |

## Tunnel / API key rotation (no bulk sheet redeploy)

1. Generate a new EGDesk user API key or tunnel auth secret on the server (EGDesk admin / env).
2. Update EGDesk so **new** tunnel handshakes accept the new secret; keep old secret valid for a overlap window (e.g. 24–72h) if possible.
3. Do **not** commit new secrets to git or push them into `EgdeskConfig.gs` in the repo.
4. Monitor failed `egdeskToolsCall` / gateway MCP errors; after overlap, revoke the old secret.

## Runtime token rotation (after Phase 6-lite)

1. Mint new `rt_*` per project in DB (`runtime-token-persist` — Phase 6L).
2. Re-run `wrap()` or shell bump push so `SheetBotClient.gs` + Script Properties receive the new token.
3. Optional: revoke old token hash server-side immediately for stolen-token response.

## Bulk sheet redeploy

Still required when changing **in-sheet** embedded config (`EgdeskConfig.gs` seed bytes) — track as Phase 6.5 migration script, not this runbook.

## Related

- [WRAPPING.md](./WRAPPING.md) — wrap vs update, no master key in sheet (target).
- [WRAPPING-PLAN.md](./WRAPPING-PLAN.md) — Phase 1b / 6-lite sequencing.
