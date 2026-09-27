export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveUserSpreadsheet, SheetBindingType } from "@/lib/sheet-binding-helper";
import { callSheetsTool } from "@/lib/egdesk-helpers";

interface SheetDefinition {
  defaultTitle: string;
  headers: string[];
  range: string;
}

const SHEET_DEFINITIONS: Record<string, SheetDefinition> = {
  SMS: {
    defaultTitle: "[SheetBot] 스마트폰 문자(SMS) 송수신 대장",
    headers: ["일시", "구분", "상대방 이름", "상대방 전화번호", "메시지 내용", "기기명"],
    range: "A1:F1",
  },
  KAKAO: {
    defaultTitle: "[SheetBot] 카카오톡 메시지 대장",
    headers: ["수신 일시", "채팅방/발신자", "메시지 내용", "기기명", "동기화 일시"],
    range: "A1:E1",
  },
  MISSED_CALL: {
    defaultTitle: "[SheetBot] 부재중 전화 대장",
    headers: ["부재중 일시", "발신 번호", "연락처 이름", "자동 회신 내용", "회신 상태", "기기명"],
    range: "A1:F1",
  },
  RECORDING: {
    defaultTitle: "[SheetBot] 통화 녹음 대장",
    headers: ["통화 일시", "상대방 이름", "파일명", "파일 크기", "드라이브 링크", "동기화 일시"],
    range: "A1:F1",
  },
  LINK_BOOKMARK: {
    defaultTitle: "[SheetBot] 웹 링크 & 유튜브 스크랩 대장",
    headers: ["등록 일시", "구분", "제목", "웹 링크(URL)", "AI 핵심 3줄 요약", "출처"],
    range: "A1:F1",
  },
  FILE_UPLOAD: {
    defaultTitle: "[SheetBot] 파일 업로드 대장",
    headers: ["업로드 일시", "구분", "파일명", "파일 크기", "드라이브 링크", "비고"],
    range: "A1:F1",
  },
};

/**
 * POST /api/user/sheets/provision
 * 기능 스위치 ON 시 헤더가 포함된 구글 스프레드시트 대장 선제 생성(Eager Provisioning)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userEmail, sheetType, sheetTitle } = body;

    if (!userEmail || typeof userEmail !== "string") {
      return NextResponse.json(
        { success: false, error: "userEmail is required" },
        { status: 400 }
      );
    }

    const cleanEmail = userEmail.trim().toLowerCase();
    const typeKey = (sheetType || "").toUpperCase();
    const def = SHEET_DEFINITIONS[typeKey];

    if (!def) {
      return NextResponse.json(
        { success: false, error: `Unsupported sheetType: ${sheetType}` },
        { status: 400 }
      );
    }

    const resolved = await resolveUserSpreadsheet({
      userEmail: cleanEmail,
      sheetType: typeKey as SheetBindingType,
      defaultTitle: def.defaultTitle,
      requestedTitle: sheetTitle,
      preferOAuth: true,
    });

    const targetSpreadsheetId = resolved.spreadsheetId;

    if (!targetSpreadsheetId) {
      return NextResponse.json(
        { success: false, error: "Failed to resolve or create spreadsheet" },
        { status: 500 }
      );
    }

    // 1행 A1 확인 후 비어있으면 헤더 및 고급 서식 주입
    try {
      const firstRowCheck = await callSheetsTool("sheets_get_range", {
        spreadsheetId: targetSpreadsheetId,
        range: "A1:A1",
        preferOAuth: true,
      }).catch(() => null);

      const hasHeaderOrData =
        firstRowCheck?.values &&
        firstRowCheck.values.length > 0 &&
        firstRowCheck.values[0]?.[0];

      if (!hasHeaderOrData) {
        await callSheetsTool("sheets_update_range", {
          spreadsheetId: targetSpreadsheetId,
          range: def.range,
          values: [def.headers],
          preferOAuth: true,
        }).catch(() => {});

        await callSheetsTool("sheets_format_headers", {
          spreadsheetId: targetSpreadsheetId,
          tabName: "시트1",
          headerBgColor: "#1e293b",
          headerTextColor: "#ffffff",
          preferOAuth: true,
        }).catch(() => {});
      }
    } catch (fmtErr: any) {
      console.warn(`[ProvisionSheet] Header format warning:`, fmtErr.message);
    }

    return NextResponse.json({
      success: true,
      isNew: resolved.isNew,
      spreadsheetId: targetSpreadsheetId,
      spreadsheetUrl: resolved.spreadsheetUrl,
      title: sheetTitle || def.defaultTitle,
      message: resolved.isNew
        ? "새 구글 스프레드시트 대장과 헤더가 성공적으로 생성되었습니다."
        : "기존 연결된 구글 스프레드시트 대장을 확인하였습니다.",
    });
  } catch (error: any) {
    console.error("[ProvisionSheet] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
