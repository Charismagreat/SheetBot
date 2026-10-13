import { queryTable, updateRows } from "./egdesk-helpers";
import { settleWalletDebit } from "./token-wallet";

/**
 * Retry pending wallet debits after a successful GAS push (WRAPPING.md § Wallet settlement).
 * Invoke from cron / admin route — Phase 1.6.
 */
export async function sweepPendingWalletSettlements(limit = 20): Promise<{
  processed: number;
  settled: number;
  failed: number;
}> {
  const res = await queryTable("sheetbot_wallet_settlements", {
    filters: { status: "pending" },
    limit,
  }).catch(() => ({ rows: [] }));

  const rows = (res.rows || []).filter((r: Record<string, unknown>) => !r.deleted_at);
  let settled = 0;
  let failed = 0;

  for (const row of rows) {
    const userEmail = String(row.user_email || "");
    const amount = Number(row.amount) || 0;
    const idempotencyKey = String(row.idempotency_key || "");
    const kind = String(row.kind || "gas-push") as "gas-push" | "runtime" | "generate" | "other";
    if (!userEmail || !idempotencyKey || amount <= 0) {
      failed += 1;
      continue;
    }

    const result = await settleWalletDebit({
      userEmail,
      amount,
      idempotencyKey,
      kind,
      metadata: { projectId: row.project_id, settlementId: row.id },
      allowDebt: true,
    });

    if (result.status === "settled") {
      settled += 1;
      const now = new Date().toISOString();
      await updateRows(
        "sheetbot_wallet_settlements",
        { status: "settled", settled_at: now, updated_at: now },
        { filters: { id: String(row.id) } },
      ).catch(() => null);
    } else {
      failed += 1;
    }
  }

  return { processed: rows.length, settled, failed };
}
