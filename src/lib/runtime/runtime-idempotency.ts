import crypto from "crypto";
import { queryTable, insertRows } from "@/lib/egdesk-helpers";

export type RuntimeIdempotencyHit = {
  response: unknown;
  deducted: number;
};

function requestFingerprint(service: string, tool: string, args: Record<string, unknown>): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ service, tool, arguments: args }))
    .digest("hex");
}

export async function loadRuntimeIdempotency(
  projectId: string,
  idempotencyKey: string,
  service: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<RuntimeIdempotencyHit | "miss" | "mismatch"> {
  const res = await queryTable("sheetbot_billing_idempotency", {
    filters: { idempotency_key: idempotencyKey },
    limit: 1,
  }).catch(() => ({ rows: [] }));

  const row = (res.rows || []).find((r: Record<string, unknown>) => !r.deleted_at);
  if (!row) return "miss";

  if (String(row.project_id || "") !== projectId) {
    return "mismatch";
  }

  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(String(row.metadata_json || "{}"));
  } catch {
    meta = {};
  }

  const fp = requestFingerprint(service, tool, args);
  if (meta.requestFingerprint && meta.requestFingerprint !== fp) {
    return "mismatch";
  }

  return {
    response: meta.cachedResponse,
    deducted: Number(row.amount) || 0,
  };
}

export async function saveRuntimeIdempotency(input: {
  projectId: string;
  userEmail: string;
  idempotencyKey: string;
  service: string;
  tool: string;
  args: Record<string, unknown>;
  cachedResponse: unknown;
  deducted: number;
}): Promise<void> {
  const now = new Date().toISOString();
  const rowId = `idem_rt_${crypto.randomBytes(10).toString("hex")}`;
  await insertRows("sheetbot_billing_idempotency", [
    {
      id: rowId,
      uuid: crypto.randomUUID(),
      user_email: input.userEmail.toLowerCase().trim(),
      project_id: input.projectId,
      idempotency_key: input.idempotencyKey,
      kind: "runtime",
      amount: input.deducted,
      balance_after: 0,
      metadata_json: JSON.stringify({
        service: input.service,
        tool: input.tool,
        requestFingerprint: requestFingerprint(input.service, input.tool, input.args),
        cachedResponse: input.cachedResponse,
      }),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  ]).catch((err) => {
    console.warn("[runtime-idempotency] insert failed:", err);
  });
}
