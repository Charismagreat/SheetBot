# EGDesk-generated files (not in git)

These paths are **removed from git history** and recreated locally by EGDesk / `@egdesk/next-api-plugin` when you open the project in EGDesk and start dev or production:

| File | Role |
|------|------|
| `egdesk.config.ts` | Runtime DB/tunnel snapshot (from live user-data + `egdesk.schema.ts`) |
| `egdesk.config.js` | Legacy/runtime alias if present |
| `egdesk-helpers.ts` | Generated helper client (`queryTable`, MCP wrappers, `apiFetch`, etc.) |

**Still committed:** `egdesk.schema.ts` (portable seed schema).

**App code** may extend helpers via `src/lib/egdesk-helpers.ts` (re-exports generated root file + SheetBot-specific helpers). After clone, run the app under EGDesk once so the root files exist before `tsc` / `next build`.
