export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { callSheetsTool } from "@/lib/egdesk-helpers";

/**
 * POST /api/user/website-monitor/log
 * 웹사이트 다운타임 감시 결과 및 장애/복구 이력을 구글 시트에 실시간 자동 기록
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userEmail,
      targetUrl,
      statusCode = 0,
      responseTimeMs = 0,
      statusMessage = "정상",
      isCrossCheckOk = true,
      deviceModel = "SheetBot Agent",
    } = body;

    if (!userEmail || typeof userEmail !== "string") {
      return NextResponse.json(
        { success: false, error: "userEmail is required" },
        { status: 400 }
      );
    }

    if (!targetUrl || typeof targetUrl !== "string") {
      return NextResponse.json(
        { success: false, error: "targetUrl is required" },
        { status: 400 }
      );
    }

    // 1. 웹사이트 모니터링 대장 시트 확보 (없으면 헤더 포함 자동 생성)
    const { spreadsheetId, spreadsheetUrl } = await resolveUserSpreadsheet({
      userEmail,
      sheetType: "WEBSITE_MONITOR",
      defaultTitle: "[SheetBot] 웹사이트 모니터링 & 장애 대장",
      preferOAuth: true,
    });

    // 2. KST 기준 타임스탬프 포맷
    const now = new Date();
    const kstTime = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now);

    const crossCheckText = isCrossCheckOk
      ? "정상 (스마트폰 인터넷 연결 확인)"
      : "오탐 의심 (휴대폰 인터넷 단절)";

    const statusText = statusCode > 0
      ? `HTTP ${statusCode} (${statusMessage})`
      : statusMessage;

    // 3. 자가 치유(Self-Healing) 헤더 검사 및 보장
    const firstRowCheck = await callSheetsTool("sheets_get_range", {
      spreadsheetId,
      range: "A1:A1",
      preferOAuth: true,
    }, { preferOAuth: true }).catch(() => null);

    const hasHeaderOrData = firstRowCheck?.values && firstRowCheck.values.length > 0 && firstRowCheck.values[0]?.[0];
    if (!hasHeaderOrData) {
      const headerValues = [
        ["점검/감지 일시", "대상 URL", "상태 코드", "응답 속도", "상태/장애 내용", "교차 검증 결과", "기기명"]
      ];
      await callSheetsTool("sheets_update_range", {
        spreadsheetId,
        range: "A1:G1",
        values: headerValues,
        preferOAuth: true,
      }, { preferOAuth: true }).catch(() => {});

      await callSheetsTool("sheets_format_headers", {
        spreadsheetId,
        tabName: "시트1",
        headerBgColor: "#0f172a", // Slate 900
        headerTextColor: "#f8fafc",
        preferOAuth: true,
      }, { preferOAuth: true }).catch(() => {});
    }

    // 4. 구글 시트에 행 추가 (A열~G열)
    // headers: ["점검/감지 일시", "대상 URL", "상태 코드", "응답 속도", "상태/장애 내용", "교차 검증 결과", "기기명"]
    const rowValues = [
      kstTime,
      targetUrl,
      statusCode > 0 ? statusCode : "-",
      `${responseTimeMs}ms`,
      statusText,
      crossCheckText,
      deviceModel,
    ];

    await callSheetsTool("sheets_append_values", {
      spreadsheetId,
      range: "A:G",
      values: [rowValues],
    }, { preferOAuth: true }).catch((err: any) => {
      console.warn("[WebsiteMonitorLog] sheets_append_values warning:", err.message);
    });

    return NextResponse.json({
      success: true,
      spreadsheetId,
      spreadsheetUrl,
      loggedAt: kstTime,
    });
  } catch (error: any) {
    console.error("[WebsiteMonitorLog] Internal error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to log website status" },
      { status: 500 }
    );
  }
}
