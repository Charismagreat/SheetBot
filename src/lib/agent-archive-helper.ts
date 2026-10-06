import {
  callDriveTool,
  callSheetsTool,
  WorkspaceVisitorCallOptions,
} from "@/lib/egdesk-helpers";

export interface ArchiveRecord {
  timestamp: string;
  sheetLink: string;
  userPrompt: string;
  actionSummary: string;
  injectedFunctions: string;
  resultStatus: string;
  digest: string;
  caller: string;
}

export interface RecordToArchiveOptions {
  userEmail: string;
  targetSpreadsheetId?: string;
  targetSpreadsheetName?: string;
  scriptCode?: string;
  comment?: string;
  caller?: string;
  visitorOptions?: WorkspaceVisitorCallOptions;
}

/**
 * Apps Script 코드에서 정의된 주요 함수명(function 이름)들을 안전하게 추출합니다.
 */
export function extractFunctionNamesFromCode(code: string): string[] {
  if (!code) return [];
  const functionRegex = /function\s+([a-zA-Z0-9_$]+)\s*\(/g;
  const matches: string[] = [];
  let match;
  while ((match = functionRegex.exec(code)) !== null) {
    const fnName = match[1];
    // 시스템/기본 함수가 아닌 의미 있는 사용자 정의 함수 우선
    if (fnName && !matches.includes(fnName)) {
      matches.push(fnName);
    }
  }
  return matches;
}

/**
 * 계정 A의 구글 드라이브에서 '[SheetBot] 아카이빙' 시트를 찾고 최근 N개 작업 이력을 조회합니다.
 */
export async function getArchiveHistory(
  userEmail: string,
  limit: number = 5,
  visitorOptions?: WorkspaceVisitorCallOptions
): Promise<{
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  history: ArchiveRecord[];
}> {
  try {
    // 1. 드라이브에서 '[SheetBot] 아카이빙' 스프레드시트 탐색
    const listRes = await callDriveTool(
      "drive_list_files",
      {
        query: "name = '[SheetBot] 아카이빙' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
        pageSize: 1,
      },
      visitorOptions
    ).catch(() => null);

    const files = Array.isArray(listRes) ? listRes : listRes?.files || listRes?.result?.files || [];
    if (!files || files.length === 0) {
      return { history: [] };
    }

    const archiveFile = files[0];
    const spreadsheetId = archiveFile.id;
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // 2. 시트 데이터 조회 (A2:H)
    const sheetData = await callSheetsTool(
      "sheets_get_range",
      {
        spreadsheetId,
        range: "시트1!A2:H",
      },
      visitorOptions
    ).catch(() => null);

    const rows: any[][] = sheetData?.values || [];
    if (rows.length === 0) {
      return { spreadsheetId, spreadsheetUrl, history: [] };
    }

    // 최신 행들(하단부) 추출
    const recentRows = rows.slice(-limit).reverse();
    const history: ArchiveRecord[] = recentRows.map((r) => ({
      timestamp: String(r[0] || ""),
      sheetLink: String(r[1] || ""),
      userPrompt: String(r[2] || ""),
      actionSummary: String(r[3] || ""),
      injectedFunctions: String(r[4] || ""),
      resultStatus: String(r[5] || ""),
      digest: String(r[6] || ""),
      caller: String(r[7] || ""),
    }));

    return {
      spreadsheetId,
      spreadsheetUrl,
      history,
    };
  } catch (err: any) {
    console.warn("[AgentArchiveHelper] getArchiveHistory note:", err.message);
    return { history: [] };
  }
}

/**
 * 코드 배포 성공 시 계정 A의 드라이브에 '[SheetBot] 아카이빙' 시트를 보장하고 1개 행을 추가합니다.
 */
export async function recordToArchiveSheet(
  options: RecordToArchiveOptions
): Promise<{
  success: boolean;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  error?: string;
}> {
  const {
    targetSpreadsheetId,
    targetSpreadsheetName = "시트봇 자동화 시트",
    scriptCode = "",
    comment = "AI 에이전트 코드 주입",
    caller = "AI Agent",
    visitorOptions,
  } = options;

  try {
    // 1. 기존 아카이빙 시트 탐색
    let spreadsheetId: string | null = null;
    const listRes = await callDriveTool(
      "drive_list_files",
      {
        query: "name = '[SheetBot] 아카이빙' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
        pageSize: 1,
      },
      visitorOptions
    ).catch(() => null);

    const files = Array.isArray(listRes) ? listRes : listRes?.files || listRes?.result?.files || [];
    if (files && files.length > 0) {
      spreadsheetId = files[0].id;
    }

    const headers = [
      "작업 일시",
      "대상 시트명 (링크)",
      "사용자 요청 사항",
      "AI 에이전트 조치 요약",
      "주입된 주요 함수/트리거",
      "작업 결과",
      "변경 요약",
      "에이전트/도구",
    ];

    // 2. 시트가 없으면 신규 생성 및 헤더 포맷팅
    if (!spreadsheetId) {
      const createRes = await callSheetsTool(
        "sheets_create_spreadsheet",
        {
          title: "[SheetBot] 아카이빙",
        },
        visitorOptions
      ).catch(() => null);

      spreadsheetId = createRes?.spreadsheetId || createRes?.id || null;

      if (spreadsheetId) {
        // 1행 헤더 기록
        await callSheetsTool(
          "sheets_update_range",
          {
            spreadsheetId,
            range: "시트1!A1:H1",
            values: [headers],
          },
          visitorOptions
        ).catch(() => null);

        // 헤더 다크 테마 포맷팅
        await callSheetsTool(
          "sheets_format_headers",
          {
            spreadsheetId,
            tabName: "시트1",
            headerBgColor: "#1e293b",
            headerTextColor: "#ffffff",
          },
          visitorOptions
        ).catch(() => null);
      }
    }

    if (!spreadsheetId) {
      return { success: false, error: "아카이빙 시트 생성에 실패했습니다." };
    }

    // 3. 주입된 함수명 목록 추출
    const fnList = extractFunctionNamesFromCode(scriptCode);
    const fnDisplay = fnList.length > 0 ? fnList.slice(0, 8).join(", ") : "자동화 스크립트";

    // 4. 대상 시트 하이퍼링크 수식 조립
    const sheetCellFormula = targetSpreadsheetId
      ? `=HYPERLINK("https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit", "${targetSpreadsheetName}")`
      : targetSpreadsheetName;

    // 5. 1개 행 원자적 추가 (`sheets_append_values`)
    const nowTimeStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const newRow = [
      nowTimeStr,
      sheetCellFormula,
      comment,
      `AI 에이전트(${caller}) 코드 자동 주입 및 배포 완료`,
      fnDisplay,
      "성공 (배포 완료)",
      comment,
      caller,
    ];

    await callSheetsTool(
      "sheets_append_values",
      {
        spreadsheetId,
        range: "시트1!A:H",
        values: [newRow],
      },
      visitorOptions
    );

    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    return {
      success: true,
      spreadsheetId,
      spreadsheetUrl,
    };
  } catch (err: any) {
    console.warn("[AgentArchiveHelper] recordToArchiveSheet error:", err.message);
    return { success: false, error: err.message };
  }
}
