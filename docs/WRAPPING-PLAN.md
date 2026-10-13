# SheetBot — Wrapping implementation plan

Scaffolding for migration. **Spec (stable):** [`WRAPPING.md`](WRAPPING.md). Shrink or delete sections here as phases ship.

**Sequencing choice (recorded):** Option **A** — quick-wrap runs `wrap()` by default; legacy bridge-only via `SHEETBOT_LEGACY_QUICK_WRAP=1`. Runtime 6-lite still required before removing `EgdeskConfig.gs` at scale.

---

## Implementation baseline (current code)

| Area | Today | Primary files |
|------|--------|----------------|
| GAS push | `pushFiles` → `deploy-script-files.ts` only (routes use deploy service) | `sheetbot-deploy-service.ts`, `deploy-script-files.ts` |
| Dashboard create | POST → `wrapProject`; PATCH redeploy → `updateAutomation` | `projects/route.ts` |
| Quick-wrap | Default → `wrapProject` + `WrapResult`; legacy → `SHEETBOT_LEGACY_QUICK_WRAP=1` | `quick-wrap/route.ts` |
| Agent bridge | POST → `updateAutomation`; GET → `shellContract` | `gas-bridge/route.ts` |
| Shell | Base + UserAutomation + EgdeskConfig (runtime client pending 6-lite) | `deploy-script-files.ts` |
| Wallet push fee | `settleWalletDebit` + idempotency rows | `token-wallet.ts` |

---

## Phase status

| Phase | Status | Notes |
|-------|--------|--------|
| **0** | ✅ Done | Types, schema, route comments, `AGENTS.md` |
| **1** | ✅ Done | Deploy service, bridge POST, projects wrap/update, errors, client GS template, sweeper, tests |
| **1b** | ✅ Done (doc) | `RUNTIME-ROTATION.md`; **1b.2 execute rotation** = ops manual |
| **6-lite** | ✅ Done | Runtime token, `/api/runtime/call`, gated `SheetBotClient.gs` deploy |
| **2** | ✅ Done | Quick-wrap wrap-by-default, sheet create helper, `wrap/page` WrapResult |
| **3** | ✅ Done | `wrapOnly` POST, NewProjectModal wrap→generate→PATCH, `WrapSuccessCard` |
| **4** | ✅ Done | `automation` + trimmed `data`; `includeShellPreview` |
| **5** | ✅ Done | UserAutomation pull, `bridge-coding-instructions`, shell v2 |
| **6** | 🟡 Partial | Runtime deploy flags + `SHEETBOT_RUNTIME_DEPLOY_DEFAULT`; bulk redeploy = ops |
| **7** | 🟡 Partial | `sync-code` → UserAutomation; bridge `userAutomationCode`; split kept for agents |

---

## Sequencing: security before high-volume deploy

See [`WRAPPING.md`](WRAPPING.md) and [`RUNTIME-ROTATION.md`](RUNTIME-ROTATION.md). Until 6-lite ships, new wraps still push `EgdeskConfig.gs`; rotate tunnel secrets per 1b without bulk redeploy.

---

## Phase tables

### Phase 0 — Documentation & types ✅

| ID | Task | AC |
|----|------|-----|
| 0.1 | `wrap-result.ts`, `automation-update-result.ts` | ✅ |
| 0.4 | Idempotency schema | ✅ `egdesk.schema.ts` |
| 0.2 | Route comments | ✅ quick-wrap, projects, gas-bridge |
| 0.3 | `AGENTS.md` | ✅ |

### Phase 1 — `wrap` / `updateAutomation` / `pushFiles` ✅

| ID | Task | AC |
|----|------|-----|
| 1.1 | `sheetbot-deploy-service.ts` | ✅ `wrap`/`wrapProject`, lock, idempotent replay |
| 1.6 | `settleWalletDebit` | ✅ sweeper: `wallet-settlement-sweeper.ts` |
| 1.2 | `projects/route.ts` | ✅ POST wrap, PATCH `updateAutomation` |
| 1.3 | `gas-bridge/route.ts` POST | ✅ |
| 1.4 | Unit tests | ✅ `sheetbot-deploy.test.ts` |
| 1.5 | `gas-deploy-errors.ts` | ✅ `sheetbotApiErrorFromGasDeploy` |
| 1.7 | `SheetBotClient.gs` | ✅ generator `sheetbot-client-gs.ts` (deploy wire in 6-lite) |

### Phase 1b — Key rotation ✅ (documentation)

| ID | Task | AC |
|----|------|-----|
| 1b.1 | `docs/RUNTIME-ROTATION.md` | ✅ |
| 1b.2 | Execute rotation | ⬜ ops |

### Phase 6-lite — Minimal runtime ✅

| ID | Task | AC |
|----|------|-----|
| 6L.1 | `runtime-token-persist.ts` + DB | ✅ `runtime_token_hash` on projects |
| 6L.2 | `POST /api/runtime/call` | ✅ manifest, wallet, idempotency, caps, rate limit |
| 6L.5 | Long AI guidance | ✅ `docs/RUNTIME-LONG-AI.md` |
| 6L.3 | `sheetbot-client-gs.ts` deploy | ✅ seeded on wrap when flag on |
| 6L.4 | `deploy-script-files.ts` runtime path | ✅ `USE_SHEETBOT_RUNTIME` or `SHEETBOT_RUNTIME_DEPLOY=1` |

**Enable runtime shell on wrap:** `USE_SHEETBOT_RUNTIME=true`, `SHEETBOT_RUNTIME_DEPLOY=1`, or `SHEETBOT_RUNTIME_DEPLOY_DEFAULT=1`. Opt out: `SHEETBOT_LEGACY_EGDESK_TUNNEL=1`.

### Phase 2 — Quick-wrap calls `wrap()` ✅

| ID | Task | AC |
|----|------|-----|
| 2.1 | `starter-user-automation.ts` | ✅ |
| 2.2 | `quick-wrap/route.ts` | ✅ sheet create + `wrapProject` |
| 2.3 | `wrap/page.tsx` | ✅ `WrapResult` normalization |
| 2.4 | No partial wrap | ✅ default path; legacy flag only |
| 2.5 | Starter wrap push fee | ✅ via `settlePushFee` |

**Env:** `SHEETBOT_LEGACY_QUICK_WRAP=1` → old bridge-only response (no shell).

### Phase 3 — Response shapes ✅

| ID | Task | AC |
|----|------|-----|
| 3.1 | builders | ✅ |
| 3.2 | quick-wrap | ✅ |
| 3.3 | bridge POST + project update | ✅ PATCH returns `automationUpdate` |
| 3.4 | `NewProjectModal` | ✅ `wrapOnly` → generate → PATCH `redeploy` |
| 3.5 | `WrapSuccessCard.tsx` | ✅ dashboard + modal step 3 |
| 3.6 | `409 NOT_WRAPPED` | ✅ bridge POST + docs |

### Phase 4 — Generate trim ✅

| ID | Task | AC |
|----|------|-----|
| 4.1 | `build-generated-automation.ts` | ✅ `GeneratedAutomation` builder |
| 4.2 | `POST /api/generate` | ✅ top-level `automation`; `data` without base/scriptFiles unless `includeShellPreview` |
| 4.3 | Dashboard consumers | ✅ PATCH uses `userAutomationCode` (Edit + New modals) |

### Phase 5 — Bridge GET polish ✅

| ID | Task | AC |
|----|------|-----|
| 5.1 | `read-remote-gas-files.ts` | ✅ UserAutomation.gs first |
| 5.2 | `bridge-coding-instructions.ts` | ✅ runtime vs tunnel copy |
| 5.3 | `gas-bridge` GET | ✅ `existingCode.userAutomationGs`, shell `2026-wrapping-2` |
| 5.4 | `gas-bridge` POST | ✅ `userAutomationCode` alias |

### Phase 6 — Runtime shell migration 🟡

| ID | Task | AC |
|----|------|-----|
| 6.1 | `shouldDeploySheetbotRuntimeClient` | ✅ `SHEETBOT_RUNTIME_DEPLOY_DEFAULT=1`, opt-out `SHEETBOT_LEGACY_EGDESK_TUNNEL=1` |
| 6.2 | New wraps use `SheetBotClient.gs` | ✅ when flag on (existing 6-lite) |
| 6.3 | Bulk re-wrap / retire `EgdeskConfig.gs` on old projects | ⬜ ops / script |

**Enable runtime on new wraps:** `USE_SHEETBOT_RUNTIME=true`, `SHEETBOT_RUNTIME_DEPLOY=1`, or `SHEETBOT_RUNTIME_DEPLOY_DEFAULT=1`.

### Phase 7 — Legacy cleanup 🟡

| ID | Task | AC |
|----|------|-----|
| 7.1 | `sync-code` | ✅ UserAutomation read/write |
| 7.2 | `splitLegacyScriptCode` | kept for agent `scriptCode` blobs |
| 7.3 | Retire monolithic POST create path | ✅ dashboard uses wrap→generate→PATCH |
| 7.4 | Remove `promote` / sync bespoke push | ⬜ follow-up |

---

## Migration checklist

| Done | Item | Phase |
|------|------|-------|
| [x] | Multi-file GAS + structured generate | shipped |
| [x] | Generate billing on user portion; noop → 0 | shipped |
| [x] | `wrap` / `updateAutomation` / `pushFiles` | 1 |
| [x] | `wrapped_at`; idempotent re-wrap | 1–2 |
| [x] | `settleWalletDebit` + idempotency tables | 1 |
| [x] | Pending settlement sweeper | 1.6 |
| [x] | Key rotation runbook | 1b |
| [x] | Runtime 6-lite | 6L |
| [x] | quick-wrap → `wrap()` (default) | 2 |
| [x] | `WrapResult` vs `AutomationUpdateResult` (API) | 2–3 |
| [x] | Bridge `409 NOT_WRAPPED` (POST) | 1/3 |
| [x] | `SheetbotApiError` + `sheetbotHandleApiError_` generator | 1.5/1.7 |
| [x] | Dashboard wrap → generate → update (NewProjectModal) | 3 |
| [x] | Bridge GET `shellContract` | 5 partial |
| [x] | Runtime deploy flags + default opt-in env | 6 partial |
| [ ] | Bulk re-wrap all projects off `EgdeskConfig.gs` | 6 ops |
| [x] | scriptId binding + spend cap on runtime | 6L |
| [x] | sync-code + bridge on UserAutomation.gs | 7 partial |
| [ ] | Remove `splitLegacyScriptCode` / promote path | 7 |

---

## Out of scope

- EGDesk MCP tool renames (coordinate with desktop app).
- One-time wallet credits for historic overbilling (product).
- **Phone / Agent2 runtime APIs** — [catalog Future section](WRAPPING-MCP-CATALOG.md#future--phone--agent2-out-of-scope).
