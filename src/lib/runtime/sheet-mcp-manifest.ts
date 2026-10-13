/** Owner decisions — see docs/WRAPPING-MCP-CATALOG.md */
export const SHEET_MCP_MANIFEST_VERSION = "2026-03-13-owner";

export type SheetRuntimeToolExposure = {
  service: string;
  tool: string;
  baseFeeTokens: number;
  billUsageFromMcp: boolean;
};

/** Wire to sheetbot_settings.runtimeAiCallerBaseFeeTokens when exposed in admin UI. */
export const RUNTIME_AI_CALLER_BASE_FEE = 0;

function freeTools(service: string, tools: string[]): SheetRuntimeToolExposure[] {
  return tools.map((tool) => ({
    service,
    tool,
    baseFeeTokens: 0,
    billUsageFromMcp: false,
  }));
}

function aiCallerTool(tool: string, billUsageFromMcp = false): SheetRuntimeToolExposure {
  return {
    service: "ai-caller",
    tool,
    baseFeeTokens: RUNTIME_AI_CALLER_BASE_FEE,
    billUsageFromMcp,
  };
}

/** EGDesk MCP proxied through SheetBot runtime — phone NOT included */
export const SHEET_RUNTIME_TOOL_EXPOSURE: SheetRuntimeToolExposure[] = [
  aiCallerTool("ai_caller_call", true),
  aiCallerTool("ai_caller_generate_image", true),
  aiCallerTool("ai_caller_list_models"),
  aiCallerTool("ai_caller_get_capabilities"),
  aiCallerTool("ai_caller_get_usage"),
  aiCallerTool("ai_caller_get_logs"),
  aiCallerTool("ai_caller_batch_submit"),
  aiCallerTool("ai_caller_batch_get"),
  aiCallerTool("ai_caller_batch_list"),
  aiCallerTool("ai_caller_batch_cancel"),
  aiCallerTool("ai_caller_cache_create"),
  aiCallerTool("ai_caller_cache_list"),
  aiCallerTool("ai_caller_cache_get"),
  aiCallerTool("ai_caller_cache_delete"),
  aiCallerTool("ai_caller_get_call_body"),
  ...freeTools("user-data", [
    "user_data_query",
    "user_data_sql_query",
    "user_data_list_tables",
    "user_data_get_schema",
    "user_data_insert_rows",
    "user_data_update_rows",
    "user_data_delete_rows",
    "user_data_create_table",
    "user_data_search",
    "user_data_aggregate",
    "user_data_upload_file",
    "user_data_download_file",
    "user_data_list_files",
  ]),
];

/** Agent2 / SMS — intentionally empty until a future project */
export const SHEET_RUNTIME_SHEETBOT_EXPOSURE: SheetRuntimeToolExposure[] = [];

const exposureKey = (service: string, tool: string) => `${service}\0${tool}`;

const EXPOSURE_SET = new Set(
  [...SHEET_RUNTIME_TOOL_EXPOSURE, ...SHEET_RUNTIME_SHEETBOT_EXPOSURE].map((r) =>
    exposureKey(r.service, r.tool),
  ),
);

export function isRuntimeToolExposed(service: string, tool: string): boolean {
  return EXPOSURE_SET.has(exposureKey(service, tool));
}

export function getRuntimeToolExposure(
  service: string,
  tool: string,
): SheetRuntimeToolExposure | undefined {
  return [...SHEET_RUNTIME_TOOL_EXPOSURE, ...SHEET_RUNTIME_SHEETBOT_EXPOSURE].find(
    (r) => r.service === service && r.tool === tool,
  );
}

export function runtimeToolsForShellContract(
  rows: SheetRuntimeToolExposure[],
): { service: string; tool: string }[] {
  return rows.map(({ service, tool }) => ({ service, tool }));
}
