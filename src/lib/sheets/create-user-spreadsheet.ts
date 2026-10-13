import {
  callDriveTool,
  callSheetsTool,
  callVisitorWorkspaceTool,
  WorkspaceVisitorCallOptions,
} from "@/lib/egdesk-helpers";

export type CreateUserSpreadsheetResult =
  | { ok: true; spreadsheetId: string; spreadsheetUrl: string; createdVia: string }
  | { ok: false; code: string; message: string; oauthRequired?: boolean };

/** Create a spreadsheet in the visitor's Google Drive (used by quick-wrap Phase 2). */
export async function createUserSpreadsheet(options: {
  title: string;
  visitorSessionId: string | null;
  siteOrigin?: string;
  visitorOptions: WorkspaceVisitorCallOptions;
  data?: unknown[];
}): Promise<CreateUserSpreadsheetResult> {
  const { title, visitorSessionId, siteOrigin, visitorOptions } = options;
  const data = options.data ?? [];

  if (!visitorSessionId && !visitorOptions.asVisitor) {
    return {
      ok: false,
      code: "VISITOR_SESSION_MISSING",
      message: "구글 시트 자동 생성에는 BYO Google 로그인이 필요합니다.",
      oauthRequired: true,
    };
  }

  let result: Record<string, unknown> | null = null;
  let createMethod = "sheets";

  try {
    if (visitorSessionId) {
      result = await callVisitorWorkspaceTool(
        "sheets",
        "sheets_create_spreadsheet",
        { title, data },
        visitorSessionId,
        siteOrigin,
      );
    } else {
      result = (await callSheetsTool("sheets_create_spreadsheet", { title, data }, visitorOptions)) as Record<
        string,
        unknown
      >;
    }
  } catch (sheetsErr: unknown) {
    console.warn("[createUserSpreadsheet] sheets_create_spreadsheet failed:", sheetsErr);
  }

  if (!result || (!result.spreadsheetId && !result.id)) {
    try {
      if (visitorSessionId) {
        result = await callVisitorWorkspaceTool(
          "drive",
          "drive_create_spreadsheet_in_folder",
          { title, subfolder: "Dev", data },
          visitorSessionId,
          siteOrigin,
        );
      } else {
        result = (await callDriveTool(
          "drive_create_spreadsheet_in_folder",
          { title, subfolder: "Dev", data },
          visitorOptions,
        )) as Record<string, unknown>;
      }
      createMethod = "drive";
    } catch (driveErr: unknown) {
      console.warn("[createUserSpreadsheet] drive fallback failed:", driveErr);
    }
  }

  if (result && (result.spreadsheetId || result.id)) {
    const spreadsheetId = String(result.spreadsheetId || result.id);
    const spreadsheetUrl =
      String(result.spreadsheetUrl || result.url || "") ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    return { ok: true, spreadsheetId, spreadsheetUrl, createdVia: createMethod };
  }

  const errorMsg = String(result?.error || result?.message || "구글 시트 자동 생성에 실패했습니다.");
  const isOauthError = errorMsg.includes("OAuth") || errorMsg.includes("token");
  return {
    ok: false,
    code: isOauthError ? "GOOGLE_OAUTH_TOKEN_MISSING" : "SHEET_CREATE_FAILED",
    message: errorMsg,
    oauthRequired: isOauthError,
  };
}
