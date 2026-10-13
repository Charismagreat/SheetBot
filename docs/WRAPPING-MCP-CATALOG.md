# SheetBot — Runtime API catalog (sheet exposure)

**Purpose:** SheetBot publishes a **versioned catalog** of what a wrapped sheet may call at run time. You mark each capability **yes / no / subset**. Runtime and bridge `shellContract` embed the effective manifest.

**Two buckets (do not mix them):**


| Bucket                   | What it is                                                             | Examples                                                                              |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **SheetBot platform**    | SheetBot cloud + own apps (not “generic EGDesk MCP”)                   | Copilot sidebar, token wallet UI (**SMS/Agent2 = future**) |
| **EGDesk MCP** (proxied) | Tools on the EGDesk stack SheetBot server calls on behalf of the sheet | `ai-caller`, `user-data`, `company-research`, Google workspace MCPs, …                |


**Phone / Agent2 / SMS — future (out of scope for current wrapping work).**  
Do not implement `sheetbot` SMS runtime APIs or migrate off `egdeskToolsCall('phone', …)` in Phase 1–7. Legacy tunnel + existing Agent2 product keep working as today. See [Future — phone & Agent2](#future--phone--agent2-out-of-scope).

**How to use this file**

1. For each **service** row, set **Expose to sheet?** to `yes` | `no` | `subset`.
2. For `subset`, list allowed **tool** names in the **Notes / allowed tools** column (or link a PR).
3. When done, we copy choices into `src/lib/runtime/sheet-mcp-manifest.ts` (or JSON) and bump `shellContract.mcp.manifestVersion`.

**Legend — proposed default (change as you decide)**


| Symbol | Meaning                                                           |
| ------ | ----------------------------------------------------------------- |
| ✅      | Likely yes for typical sheet automation (current gateway or docs) |
| ❌      | Build-time / owner-only — never from sheet                        |
| ⏳      | Needs your decision                                               |
| 🔧     | Subset only — list tools                                          |


---



## Policy (all services)


| Rule                   |                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Never from sheet**   | `apps-script` (push/deploy), `workspace-oauth`, `egdesk-config`, `filesystem`, `hosting-coding`, anything that changes EGDesk or another user’s Google account without visitor scope |
| **Always server-only** | `wrap` / `updateAutomation` use `apps_script_`* on SheetBot backend, not sheet runtime                                                                                               |
| **Billing**            | All runtime tools share one wallet shape (`baseFee` + `usage`); **only `ai-caller`** rows use non-zero **`baseFeeTokens`**; usage via `billUsageFromMcp` — see WRAPPING.md [Runtime calls](WRAPPING.md#runtime-calls--single-wallet-shape) |


---



## SheetBot platform (UI in shell — not runtime MCP manifest yet)

| Capability | Expose? | Notes |
|------------|---------|--------|
| **Token wallet / recharge** | ✅ | `TokenRecharge.gs` + Base — UI in shell, not `egdeskToolsCall` from user file |
| **AI copilot sidebar** | ✅ | `showAiCopilotSidebar` in Base |
| **Agent2 SMS / devices** | — | **Deferred** → [Future — phone & Agent2](#future--phone--agent2-out-of-scope) |

`SHEET_EXPOSED_SHEETBOT` stays **empty** until phone work is scheduled. No engineering on Agent2 runtime in wrapping phases.

---

## Future — phone & Agent2 (out of scope)

**Do not build** in wrap / runtime / manifest Phase 1–7:

- `sheetbot` runtime tools (`agent2_send_sms`, device check, …)
- Removing `phone` from `api/gateway/mcp` `ALLOWED_TOOLS`
- Documenting Agent2 in `shellContract` beyond “use existing Base menus / legacy tunnel”

**Today (unchanged):** Agent2 Android app ↔ sheetbot.cloud; optional `egdeskToolsCall('phone', …)` via EGDesk tunnel. EGDesk `phone` MCP row remains **❌** for sheet exposure catalog — not proxied through target runtime.

When this bucket is picked up later, design `SHEET_EXPOSED_SHEETBOT` separately from EGDesk MCP.

---



## EGDesk MCP (proxied via SheetBot server)

Below: EGDesk HTTP `POST /{service}/tools/call` that SheetBot may proxy for sheets. **Exclude** `phone` from this list for target architecture (see SheetBot platform above).

---



## System


| Service         | EGDesk path                 | Display name  | Expose to sheet? | Notes / allowed tools                                                                                                         |
| --------------- | --------------------------- | ------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ai-caller`     | `/ai-caller/tools/call`     | AI Caller     | ✅ **subset**     | All tools in table below — expand gateway/runtime beyond today’s 2-tool draft |
| `ai-center`     | `/ai-center/tools/call`     | AI Center     | ❌                | Full tool list: `GET /ai-center/tools` on EGDesk                                                                              |
| `egdesk-config` | `/egdesk-config/tools/call` | EGDesk Config | ❌                | API keys, tunnel — server only                                                                                                |
| `filesystem`    | `/filesystem/tools/call`    | File system   | ❌                | Local EGDesk machine                                                                                                          |
| `file-organizer` | `/file-organizer/tools/call` | File organizer | ❌                | v1: `organize_files` classify/scan (read disk); `confirm` local-only (references). Phase 2 filing not from sheet. Pair with `filesystem` for ad-hoc path I/O |




### `ai-caller` tools (for subset picks)


| Tool                         | Description (short) | Expose? |
| ---------------------------- | ------------------- | ------- |
| `ai_caller_call`             | LLM completion      | ✅       |
| `ai_caller_list_models`      | List models         | ✅       |
| `ai_caller_generate_image`   | Image generation    | ✅       |
| `ai_caller_get_capabilities` | Capabilities        | ✅       |
| `ai_caller_get_usage`        | Usage read          | ✅       |
| `ai_caller_get_logs`         | Logs                | ✅       |
| `ai_caller_batch_*`          | Batch jobs          | ✅       |
| `ai_caller_cache_*`          | Context cache       | ✅       |


---



## Workspace (Google)

// can be done via Appsscript already


| Service       | Display name | Expose to sheet? | Notes                                                    |
| ------------- | ------------ | ---------------- | -------------------------------------------------------- |
| `gmail`       | Gmail        | ❌                | Visitor OAuth scope — high risk                          |
| `drive`       | Drive        | ❌                |                                                          |
| `sheets`      | Sheets       | ❌                | Often needed for automation; still owner/visitor session |
| `docs`        | Docs         | ❌                |                                                          |
| `slides`      | Slides       | ❌                |                                                          |
| `apps-script` | Apps Script  | ❌                | **All** `apps_script_`* — SheetBot server only           |


---



## Knowledge / data


| Service            | Display name     | Expose to sheet? | Notes                                                                                                                                                                                                                                                                                         |
| ------------------ | ---------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user-data`        | My DB            | ✅ **subset**     | Tools in table below (incl. search / aggregate / file) |
| `knowledge-wiki`   | Knowledge Wiki   | ❌                |                                                                                                                                                                                                                                                                                               |
| `pageindex`        | PageIndex        | ❌                |                                                                                                                                                                                                                                                                                               |
| `korean-law`       | Korean Law       | **✅**            |                                                                                                                                                                                                                                                                                               |
| `company-research` | Company Research | **✅**            | Used in SheetBot easybot / helpers                                                                                                                                                                                                                                                            |
| `financehub`       | FinanceHub       | ❌                |                                                                                                                                                                                                                                                                                               |
| `voice-transcript` | Voice Transcript | ❌                |                                                                                                                                                                                                                                                                                               |
| `local-agent`      | Local Agent      | ❌                |                                                                                                                                                                                                                                                                                               |




### `user-data` tools (partial — EGDesk has more)

See `egdesk-scratch/apps/egdesk/src/main/mcp/user-data/user-data-mcp-service.ts` `listTools()` for the full list. Common sheet patterns:


| Tool                                                    | Expose? |
| ------------------------------------------------------- | ------- |
| `user_data_query`                                       | ✅       |
| `user_data_sql_query`                                   | ✅       |
| `user_data_list_tables`                                 | ✅       |
| `user_data_get_schema`                                  | ✅       |
| `user_data_insert_rows`                                 | ✅       |
| `user_data_update_rows`                                 | ✅       |
| `user_data_delete_rows`                                 | ✅       |
| `user_data_create_table`                                | ✅       |
| `user_data_search` / `user_data_aggregate` / file tools | ✅       |


---



## Actionable


| Service             | Display name       | Expose to sheet? | Notes                                                                                                                                               |
| ------------------- | ------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scheduler`         | Scheduler          | ❌                | already available via appsscript                                                                                                                    |
| `browser-recording` | Browser recording  | ✅                |                                                                                                                                                     |
| `blog`              | Blog               | ✅                |                                                                                                                                                     |
| `instagram`         | Instagram          | ✅                |                                                                                                                                                     |
| `youtube`           | YouTube Shorts     | ✅                |                                                                                                                                                     |
| `business-identity` | Business Identity  | ❌                |                                                                                                                                                     |
| `phone`             | Phone (EGDesk MCP) | ❌                | **Future / legacy only** — not in runtime manifest; see [Future — phone & Agent2](#future--phone--agent2-out-of-scope) |
| `kakao`             | Kakao              | ✅                |                                                                                                                                                     |
| `printing`          | Printing           | ❌                |                                                                                                                                                     |
| `hosting-coding`    | Hosting & Coding   | ❌                | Deploy/hosting — server                                                                                                                             |
| `inventory`         | Inventory          | ❌                |                                                                                                                                                     |
| `seo`               | SEO                | ❌                |                                                                                                                                                     |
| `file-conversion`   | File conversion    | ❌                |                                                                                                                                                     |




## Other EGDesk services (SheetBot / helpers reference)

Not in EGDesk UI groups file but present in EGDesk HTTP router or SheetBot `egdesk-helpers`:


| Service           | Expose to sheet? | Notes                     |
| ----------------- | ---------------- | ------------------------- |
| `nps`             | ✅                | NPS lookup                |
| `koneps`          | ✅                | KONEPS contracts          |
| `bidnotice`       | ✅                | Bid notices               |
| `bizinfo`         | ✅                | Bizinfo                   |
| `bizverify`       | ✅                | Biz verify                |
| `workspace-oauth` | ❌                | Operator BYO OAuth config |


---



## Signed decisions (owner-filled)

Summary of answers in this file (2026-03-13):

| Area | Decision |
|------|----------|
| **Workspace** (`gmail`, `drive`, `sheets`, …) | ❌ — use native Apps Script |
| **ai-caller** | ✅ all listed tools |
| **user-data** | ✅ all listed tools |
| **korean-law**, **company-research** | ✅ |
| **browser-recording**, **blog**, **instagram**, **youtube**, **kakao** | ✅ |
| **nps**, **koneps**, **bidnotice**, **bizinfo**, **bizverify** | ✅ |
| **scheduler** | ❌ (Apps Script) |
| **phone / Agent2 runtime** | **Not now** — future bucket |
| **Copilot + wallet UI** | ✅ in shell (not EGDesk MCP rows) |

---

## Published manifest (copy to code when runtime ships)

```ts
// sheet-mcp-manifest.ts — derived from owner decisions above
export const SHEET_MCP_MANIFEST_VERSION = "2026-03-13-owner";

/** One row per allowlisted tool — same shape for every service. */
export type SheetRuntimeToolExposure = {
  service: string;
  tool: string;
  baseFeeTokens: number;
  billUsageFromMcp: boolean;
};

/** Default flat base per `ai-caller` runtime call (0 = base fee disabled). */
export const RUNTIME_AI_CALLER_BASE_FEE = 0; // wire to sheetbot_settings.runtimeAiCallerBaseFeeTokens

function freeTools(service: string, tools: string[]): SheetRuntimeToolExposure[] {
  return tools.map((tool) => ({
    service,
    tool,
    baseFeeTokens: 0,
    billUsageFromMcp: false,
  }));
}

function aiCallerTool(tool: string, billUsageFromMcp = false): SheetRuntimeToolExposure {
  return {
    service: "ai-caller",
    tool,
    baseFeeTokens: RUNTIME_AI_CALLER_BASE_FEE,
    billUsageFromMcp,
  };
}

/** EGDesk MCP proxied through SheetBot runtime — phone NOT included */
export const SHEET_RUNTIME_TOOL_EXPOSURE: SheetRuntimeToolExposure[] = [
  aiCallerTool("ai_caller_call", true),
  aiCallerTool("ai_caller_generate_image", true),
  aiCallerTool("ai_caller_list_models"),
  aiCallerTool("ai_caller_get_capabilities"),
  aiCallerTool("ai_caller_get_usage"),
  aiCallerTool("ai_caller_get_logs"),
  aiCallerTool("ai_caller_batch_submit"),
  aiCallerTool("ai_caller_batch_get"),
  aiCallerTool("ai_caller_batch_list"),
  aiCallerTool("ai_caller_batch_cancel"),
  aiCallerTool("ai_caller_cache_create"),
  aiCallerTool("ai_caller_cache_list"),
  aiCallerTool("ai_caller_cache_get"),
  aiCallerTool("ai_caller_cache_delete"),
  aiCallerTool("ai_caller_get_call_body"),
  ...freeTools("user-data", [
    "user_data_query",
    "user_data_sql_query",
    "user_data_list_tables",
    "user_data_get_schema",
    "user_data_insert_rows",
    "user_data_update_rows",
    "user_data_delete_rows",
    "user_data_create_table",
    "user_data_search",
    "user_data_aggregate",
    "user_data_upload_file",
    "user_data_download_file",
    "user_data_list_files",
  ]),
  // At implementation: expand each ✅ service via EGDesk listTools() → freeTools(service, names)
  ...freeTools("korean-law", [] /* populate */),
  ...freeTools("company-research", []),
  ...freeTools("browser-recording", []),
  ...freeTools("blog", []),
  ...freeTools("instagram", []),
  ...freeTools("youtube", []),
  ...freeTools("kakao", []),
  ...freeTools("nps", []),
  ...freeTools("koneps", []),
  ...freeTools("bidnotice", []),
  ...freeTools("bizinfo", []),
  ...freeTools("bizverify", []),
];

/** Agent2 / SMS — intentionally empty until a future project */
export const SHEET_RUNTIME_SHEETBOT_EXPOSURE: SheetRuntimeToolExposure[] = [];

/** Bridge / shellContract: service + tool only (no billing fields). */
export function runtimeToolsForShellContract(
  rows: SheetRuntimeToolExposure[],
): { service: string; tool: string }[] {
  return rows.map(({ service, tool }) => ({ service, tool }));
}
```

- **Runtime** `/api/runtime/call`: reject if `(service, tool)` not in `SHEET_RUNTIME_TOOL_EXPOSURE` (+ `SHEET_RUNTIME_SHEETBOT_EXPOSURE` when used); charge with one helper: `baseFeeTokens + usage`.
- **Bridge GET `shellContract`:** `exposedRuntimeTools` = `runtimeToolsForShellContract(SHEET_RUNTIME_TOOL_EXPOSURE)` (no phone).
- **Gateway today:** still `ai-caller` + `user-data` + `phone` hardcoded — widen when runtime work starts; **do not expand phone**.

---



## Current code (migration)


| Location                                    | What it does today                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `SheetBot/src/app/api/gateway/mcp/route.ts` | `ALLOWED_TOOLS` — interim; align to `SHEET_RUNTIME_TOOL_EXPOSURE` when runtime ships; **leave `phone` as-is** until future Agent2 project |
| `SheetBot/docs/WRAPPING.md` shell section   | Documents same subset as gateway                                                                        |
| EGDesk `local-server-manager.ts`            | Full MCP surface — **not** all should be sheet-callable                                                 |


**Target:** one manifest derived from **this catalog**, shared by gateway (if kept), runtime, and bridge.