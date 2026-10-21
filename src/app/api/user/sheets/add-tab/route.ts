import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions, getWorkspaceCallOptionsForEmail } from "@/lib/auth";
import { callSheetsTool } from "@/lib/egdesk-helpers";
import { bindExistingUserSpreadsheet, SheetBindingType } from "@/lib/sheet-binding-helper";
import { deploySmsCheckboxScript } from "@/lib/gas-sms-checkbox-service";

export const dynamic = "force-dynamic";

/**
 * 구글 스프레드시트 URL 또는 ID 문자열에서 순수 spreadsheetId 추출
 */
function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  // URL이 아닌 직접 입력한 ID인 경우 (통상 30자 이상의 영숫자)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await req.json().catch(() => ({}));

    const userEmail = (
      body.userEmail ||
      session?.user?.email ||
      req.headers.get("x-user-email") ||
      ""
    ).toLowerCase().trim();

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "로그인이 필요하거나 사용자 이메일이 누락되었습니다." },
        { status: 401 }
      );
    }

    const rawInput = String(body.spreadsheetUrlOrId || body.spreadsheetUrl || body.spreadsheetId || "").trim();
    if (!rawInput) {
      return NextResponse.json(
        { success: false, error: "기존 구글 스프레드시트 링크(URL) 또는 ID를 입력해 주세요." },
        { status: 400 }
      );
    }

    const spreadsheetId = extractSpreadsheetId(rawInput);
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: "유효한 구글 스프레드시트 URL 또는 ID 형식이 아닙니다." },
        { status: 400 }
      );
    }

    const tabName = String(body.tabName || "문자발송목록").trim() || "문자발송목록";
    const sheetType = (body.sheetType || "SHEET_SMS_CHECKBOX") as SheetBindingType;

    const callOptions = await getWorkspaceCallOptionsForEmail(userEmail, req);

    // 1. 기존 스프레드시트 정보 조회
    let sheetTitle = "기존 연동 스프레드시트";
    let existingTabs: string[] = [];
    try {
      const meta = await callSheetsTool("sheets_get_spreadsheet", { spreadsheetId, preferOAuth: true }, callOptions);
      if (meta?.properties?.title) {
        sheetTitle = meta.properties.title;
      }
      if (Array.isArray(meta?.sheets)) {
        existingTabs = meta.sheets
          .map((s: any) => s?.properties?.title)
          .filter(Boolean);
      }
    } catch (metaErr: any) {
      console.warn(`[AddTab] Failed to get spreadsheet metadata for ${spreadsheetId}:`, metaErr.message);
    }

    // 2. 탭이 없는 경우 신규 생성
    const tabExists = existingTabs.includes(tabName);
    if (!tabExists) {
      try {
        await callSheetsTool("sheets_create_tab", {
          spreadsheetId,
          title: tabName,
          preferOAuth: true,
        }, callOptions);
        console.log(`[AddTab] Created tab '${tabName}' in spreadsheet ${spreadsheetId}`);
      } catch (createErr: any) {
        console.warn(`[AddTab] Tab create warning:`, createErr.message);
      }
    }

    // 3. 표준 5대 헤더 확인 및 기입 (A1:E1)
    const STANDARD_HEADERS = ["수신 번호", "고객명", "문자 내용", "발송 [V]", "발송 결과 및 일시"];
    try {
      const headerRange = `'${tabName}'!A1:E1`;
      await callSheetsTool("sheets_update_range", {
        spreadsheetId,
        range: headerRange,
        values: [STANDARD_HEADERS],
        preferOAuth: true,
      }, callOptions).catch(() => {});

      await callSheetsTool("sheets_format_headers", {
        spreadsheetId,
        tabName,
        headerBgColor: "#0284C7",
        headerTextColor: "#ffffff",
        preferOAuth: true,
      }, callOptions).catch(() => {});
    } catch (fmtErr: any) {
      console.warn(`[AddTab] Header formatting warning:`, fmtErr.message);
    }

    // 4. 체크박스 문자 자동화 Apps Script 배포
    let scriptDeployResult = null;
    if (sheetType === "SHEET_SMS_CHECKBOX") {
      try {
        scriptDeployResult = await deploySmsCheckboxScript({
          spreadsheetId,
          tabName,
          userEmail,
          callOptions,
        });
      } catch (gasErr: any) {
        console.warn(`[AddTab] Apps Script deploy warning:`, gasErr?.message);
      }
    }

    // 5. 시트봇 연동 대장 영구 바인딩
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    await bindExistingUserSpreadsheet({
      userEmail,
      sheetType,
      spreadsheetId,
      spreadsheetUrl,
      sheetTitle,
    });

    return NextResponse.json({
      success: true,
      spreadsheetId,
      spreadsheetUrl,
      sheetTitle,
      tabName,
      isNewTab: !tabExists,
      scriptApplied: scriptDeployResult?.success ?? false,
      scriptUrl: scriptDeployResult?.scriptUrl,
      message: `'${sheetTitle}' 시트에 '${tabName}' 탭 및 문자 발송 자동화 스크립트가 성공적으로 설정되었습니다.`,
    });
  } catch (err: any) {
    console.error("[AddTab] Fatal error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "기존 시트에 탭을 추가하는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
