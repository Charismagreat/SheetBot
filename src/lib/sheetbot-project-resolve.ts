import { queryTable } from "@/lib/egdesk-helpers";
import { normalizeSheetbotProjectId } from "@/lib/sheetbot-project-id";

export { normalizeSheetbotProjectId };

const ALT_PROJECT_REF_FIELDS = ["gas_project_id", "script_id", "spreadsheet_id"] as const;

/**
 * Resolve a project row when the client sends proj_* id or a legacy/wrong id (GAS script id, etc.).
 */
export async function findSheetbotProjectByRef(
  userEmail: string,
  projectRef: string,
): Promise<Record<string, unknown> | null> {
  const email = userEmail.toLowerCase().trim();
  const ref = String(projectRef || "").trim();
  if (!ref || !email) return null;

  const tryQuery = async (filters: Record<string, string>) => {
    const res = await queryTable("sheetbot_projects", { filters, limit: 1 }).catch(() => ({ rows: [] }));
    const row = (res.rows || [])[0] as Record<string, unknown> | undefined;
    if (!row || row.deleted_at) return null;
    return row;
  };

  let row = await tryQuery({ id: ref, user_email: email });
  if (row) return row;

  for (const field of ALT_PROJECT_REF_FIELDS) {
    row = await tryQuery({ [field]: ref, user_email: email });
    if (row) return row;
  }

  return null;
}
