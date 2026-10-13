# SheetBot runtime — long AI & UrlFetchApp

Apps Script `UrlFetchApp` has short timeouts and response size limits. **Do not** proxy multi-minute `ai_caller_call` synchronously through `/api/runtime/call` for heavy agent work.

## Recommended patterns

1. **Fast calls** — small prompts, fast models via `sheetbotCall_('ai-caller', 'ai_caller_call', …)`.
2. **Batch async** — `ai_caller_batch_submit` + `ai_caller_batch_get` with **separate idempotency keys** per poll (polls should be cheap reads).
3. **Off-sheet agent** — Antigravity / bridge runs long jobs; on completion POST **`updateAutomation`** with results. Sheet only triggers a small start call or opens the bridge URL.
4. **Future** — server callback / user-data row the sheet reads on `onOpen`.

## Errors

Treat UrlFetch timeout as client-side failure; retry with a **new** `idempotencyKey` only when the user intentionally retries the same action.

See [WRAPPING.md](./WRAPPING.md#runtime-transport-urlfetchapp-and-long-ai).
