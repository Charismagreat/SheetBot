import crypto from "crypto";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";

export function hashRuntimeToken(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

export function mintRuntimeTokenPlain(): string {
  return `rt_${crypto.randomBytes(24).toString("hex")}`;
}

/**
 * Mint runtime token for wrap (stores hash only). Returns null if a token already exists and rotate is false.
 */
export async function issueRuntimeTokenForProject(
  projectId: string,
  options?: { rotate?: boolean },
): Promise<{ token: string; issuedAt: string; rotated: boolean } | null> {
  const res = await queryTable("sheetbot_projects", {
    filters: { id: projectId },
    limit: 1,
  }).catch(() => ({ rows: [] }));
  const row = res.rows?.[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const existingHash = String(row.runtime_token_hash || "").trim();
  if (existingHash && !options?.rotate) {
    return null;
  }

  const token = mintRuntimeTokenPlain();
  const issuedAt = new Date().toISOString();
  const tokenHash = hashRuntimeToken(token);

  await updateRows(
    "sheetbot_projects",
    {
      runtime_token_hash: tokenHash,
      runtime_token_issued_at: issuedAt,
      updated_at: issuedAt,
    },
    { filters: { id: projectId } },
  );

  return { token, issuedAt, rotated: Boolean(existingHash) };
}

export async function findProjectByRuntimeToken(
  bearerToken: string,
): Promise<Record<string, unknown> | null> {
  const hash = hashRuntimeToken(bearerToken);
  const res = await queryTable("sheetbot_projects", {
    filters: { runtime_token_hash: hash },
    limit: 1,
  }).catch(() => ({ rows: [] }));
  const row = (res.rows || []).find((r: Record<string, unknown>) => !r.deleted_at);
  return row ?? null;
}

export function scriptIdMatchesProject(project: Record<string, unknown>, scriptId: string): boolean {
  const sid = String(scriptId || "").trim();
  if (!sid) return false;
  const gas = String(project.gas_project_id || "").trim();
  const script = String(project.script_id || "").trim();
  return sid === gas || sid === script || gas === sid;
}
