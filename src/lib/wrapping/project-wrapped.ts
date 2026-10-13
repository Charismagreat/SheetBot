/** TTL for `wrap_started_at` lock (concurrent wrap). */
export const WRAP_LOCK_TTL_MS = 5 * 60 * 1000;

export type SheetbotProjectRow = Record<string, unknown>;

export function getWrappedAt(project: SheetbotProjectRow): string | null {
  const v = project.wrapped_at ?? project.wrappedAt;
  return v ? String(v) : null;
}

/**
 * Target: `wrapped_at` set by successful `wrap()`.
 * Migration: bound GAS project counts as wrapped so existing bridge users keep working.
 */
export function isProjectWrapped(project: SheetbotProjectRow): boolean {
  if (getWrappedAt(project)) return true;
  const gas = project.gas_project_id ?? project.gasProjectId;
  return Boolean(gas && String(gas).trim());
}

/** Bridge GET: sheet context for agents. Target: require `wrapped_at`; migration allows registered spreadsheet. */
export function isBridgeGetAllowed(project: SheetbotProjectRow): boolean {
  if (isProjectWrapped(project)) return true;
  const sheetId = project.spreadsheet_id ?? project.spreadsheetId;
  return Boolean(sheetId && String(sheetId).trim());
}

export function isWrapLockActive(project: SheetbotProjectRow, nowMs = Date.now()): boolean {
  const started = project.wrap_started_at ?? project.wrapStartedAt;
  if (!started) return false;
  const t = Date.parse(String(started));
  if (!Number.isFinite(t)) return false;
  return nowMs - t < WRAP_LOCK_TTL_MS && !getWrappedAt(project);
}
