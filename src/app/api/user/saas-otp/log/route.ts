export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { callSheetsTool } from "@/lib/egdesk-helpers";

/**
 * POST /api/user/saas-otp/log
 * SaaS 휴대폰 인증번호(OTP) 발송 및 검증 이력을 사용자의 구글 스프레드시트([SheetBot] SaaS 인증발송 대장)에 자동 기록
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userEmail,
      brandName = "내서비스",
      recipientPhone = "",
      purpose = "로그인",
      maskedCode = "••••••",
      status = "✅ 발송성공",
      elapsedMs = 0,
      verifiedStatus = "⏳ 미인증 (대기중)",
      deviceModel = "SheetBot Agent",
    } = body;

    if (!userEmail || typeof userEmail !== "string" || userEmail.endsWith("@filetosheet.cloud")) {
      return NextResponse.json(
        { success: false, error: "유효한 구글 연동 이메일이 필요합니다." },
        { status: 400 }
      );
    }

    const { spreadsheetId, spreadsheetUrl } = await resolveUserSpreadsheet({
      userEmail,
      sheetType: "SAAS_OTP_RELAY",
      defaultTitle: "[SheetBot] SaaS 인증발송 대장",
      preferOAuth: true,
    });

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

    const firstRowCheck = await callSheetsTool(
      "sheets_get_range",
      {
        spreadsheetId,
        range: "A1:A1",
        preferOAuth: true,
      },
      { preferOAuth: true }
    ).catch(() => null);

    const hasHeaderOrData =
      firstRowCheck?.values && firstRowCheck.values.length > 0 && firstRowCheck.values[0]?.[0];
    if (!hasHeaderOrData) {
      const headerValues = [
        [
          "요청 일시",
          "서비스명",
          "수신 번호",
          "인증 목적",
          "인증번호(마스킹)",
          "발송 상태",
          "소요시간(ms)",
          "인증완료 여부",
          "발송 기기",
        ],
      ];
      await callSheetsTool(
        "sheets_update_range",
        {
          spreadsheetId,
          range: "A1:I1",
          values: headerValues,
          preferOAuth: true,
        },
        { preferOAuth: true }
      ).catch(() => {});

      await callSheetsTool(
        "sheets_format_headers",
        {
          spreadsheetId,
          tabName: "시트1",
          headerBgColor: "#0f172a",
          headerTextColor: "#f8fafc",
          preferOAuth: true,
        },
        { preferOAuth: true }
      ).catch(() => {});
    }

    const rowValues = [
      kstTime,
      brandName,
      recipientPhone,
      purpose,
      maskedCode,
      status,
      elapsedMs > 0 ? `${elapsedMs}ms` : "-",
      verifiedStatus,
      deviceModel,
    ];

    await callSheetsTool(
      "sheets_append_values",
      {
        spreadsheetId,
        range: "A:I",
        values: [rowValues],
        preferOAuth: true,
      },
      { preferOAuth: true }
    );

    return NextResponse.json({
      success: true,
      spreadsheetId,
      spreadsheetUrl,
      loggedAt: kstTime,
    });
  } catch (err: any) {
    console.error("[SaaS OTP Log] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "구글 시트 기록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
