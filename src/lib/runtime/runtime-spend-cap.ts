import { queryTable } from "@/lib/egdesk-helpers";
import { defaultRuntimeDailyCap } from "./runtime-guards";

export async function getRuntimeSpendToday(project: Record<string, unknown>): Promise<number> {
  const projectId = String(project.id || "");
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const since = startOfDay.toISOString();

  const res = await queryTable("sheetbot_billing_idempotency", {
    filters: { project_id: projectId, kind: "runtime" },
    limit: 500,
  }).catch(() => ({ rows: [] }));

  let sum = 0;
  for (const row of res.rows || []) {
    if (row.deleted_at) continue;
    const created = String(row.created_at || "");
    if (created && created < since) continue;
    sum += Number(row.amount) || 0;
  }
  return sum;
}

export async function assertRuntimeSpendCap(project: Record<string, unknown>): Promise<{
  ok: boolean;
  used: number;
  limit: number;
}> {
  const limit = defaultRuntimeDailyCap(project);
  const used = await getRuntimeSpendToday(project);
  return { ok: used < limit, used, limit };
}
