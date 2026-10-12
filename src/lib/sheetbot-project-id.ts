/** Primary key for sheetbot_projects — never use gas/script/spreadsheet IDs here. */
export function normalizeSheetbotProjectId(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  const candidates = [row.id, row.uuid];
  for (const c of candidates) {
    if (c == null || c === "") continue;
    let s = String(c).trim();
    if (s.endsWith(".0")) s = s.slice(0, -2);
    if (s) return s;
  }
  return "";
}
