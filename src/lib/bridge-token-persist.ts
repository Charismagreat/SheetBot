import { insertRows, queryTable, updateRows } from "./egdesk-helpers";

/**
 * Keep sheetbot_projects.bridge_token and sheetbot_bridge_tokens in sync.
 * gas-bridge resolves sec_* via the mapping table first, then bridge_token on the project row.
 */
export async function persistBridgeToken(
  projectId: string,
  token: string,
  userEmail: string,
): Promise<void> {
  const now = new Date().toISOString();

  await updateRows(
    "sheetbot_projects",
    { bridge_token: token, updated_at: now },
    { filters: { id: projectId } },
  ).catch((err) => {
    console.warn("[bridge-token-persist] sheetbot_projects update failed:", err?.message || err);
  });

  const existing = await queryTable("sheetbot_bridge_tokens", {
    filters: { project_id: projectId },
    limit: 1,
  }).catch(() => ({ rows: [] }));

  if (existing.rows?.length) {
    const row = existing.rows[0];
    if (row.token === token) return;
    await updateRows(
      "sheetbot_bridge_tokens",
      { token, user_email: userEmail },
      { filters: { id: row.id } },
    ).catch((err) => {
      console.warn("[bridge-token-persist] sheetbot_bridge_tokens update failed:", err?.message || err);
    });
    return;
  }

  await insertRows("sheetbot_bridge_tokens", [
    {
      token,
      project_id: projectId,
      user_email: userEmail,
      created_at: now,
    },
  ]).catch((err) => {
    console.warn("[bridge-token-persist] sheetbot_bridge_tokens insert failed:", err?.message || err);
  });
}
