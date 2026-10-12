import { normalizeSheetbotProjectId } from "@/lib/sheetbot-project-id";

// 프로젝트 경량 변환 헬퍼 (대시보드 렌더링 전용)
export function mapLightProject(row: any) {
  let parsedFeatures: string[] = [];
  try {
    parsedFeatures = typeof row.features === "string" ? JSON.parse(row.features) : row.features || [];
  } catch {
    parsedFeatures = [];
  }

  let parsedTriggers: any[] = [];
  try {
    parsedTriggers = typeof row.triggers === "string" ? JSON.parse(row.triggers) : row.triggers || [];
  } catch {
    parsedTriggers = [];
  }

  const primaryId = normalizeSheetbotProjectId(row);

  return {
    id: primaryId,
    userEmail: row.user_email || row.userEmail || "",
    name: row.name || "",
    description: row.description || "",
    spreadsheetId: row.spreadsheet_id || row.spreadsheetId || "",
    spreadsheetUrl: row.spreadsheet_url || row.spreadsheetUrl || "",
    gasProjectId: row.gas_project_id || row.gasProjectId || "",
    scriptId: row.script_id || row.scriptId || "",
    scriptUrl: row.script_url || row.scriptUrl || "",
    scriptCode: "",
    manifest: "",
    summary: row.summary || "",
    features: parsedFeatures,
    triggers: parsedTriggers,
    prompt: row.prompt || "",
    webappUrl: row.webapp_url || row.webappUrl || "",
    status: row.status || "ACTIVE",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    deleted_at: row.deleted_at || null,
  };
}

// 카드에 표시할 참조 ID (GAS/시트). API 호출은 항상 proj.id(시트봇 PK)를 사용.
export function getProjectDisplayId(proj: any): string {
  if (proj?.scriptId) return String(proj.scriptId);
  if (proj?.gasProjectId) return String(proj.gasProjectId);
  if (proj?.spreadsheetId) return String(proj.spreadsheetId);
  const raw = String(proj?.id || "");
  return raw.endsWith(".0") ? raw.slice(0, -2) : raw;
}

// 날짜 및 시각 표시 헬퍼 (YYYY.MM.DD HH:mm)
export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return String(dateStr).replace("T", " ").slice(0, 16);
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
  } catch {
    return String(dateStr).slice(0, 16);
  }
}
