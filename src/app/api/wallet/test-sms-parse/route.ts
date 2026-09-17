export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { parseBankDepositSms } from "@/lib/bank-sms-parser";
import { queryTable } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export async function POST(request: Request) {
  try {
    await setupDatabase();
    const body = await request.json();
    const { smsText } = body;

    if (!smsText) {
      return NextResponse.json({ success: false, error: "smsText 파라미터가 필요합니다." }, { status: 400 });
    }

    // 1. SMS 텍스트 초고속 파싱
    const parsed = parseBankDepositSms(smsText);

    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        message: "은행 입금 문자 패턴을 인식하지 못했습니다. 입금 문자가 맞는지 확인해 주세요.",
        parsed,
      });
    }

    // 2. 현재 PENDING 상태인 대기 세션 중 매칭되는 건 탐색
    const res = await queryTable("sheetbot_deposit_requests", {
      filters: { status: "PENDING" },
      limit: 20,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
    const matchedSession = validRows.find((r: any) => {
      const code = (r.deposit_code || "").toUpperCase().trim();
      const amount = Number(r.amount_krw);
      return code === parsed.depositCode && amount === parsed.amountKrw;
    });

    return NextResponse.json({
      success: true,
      message: matchedSession
        ? `대기 중인 [${matchedSession.user_email}]님의 충전 세션(${matchedSession.deposit_code} / ${Number(matchedSession.amount_krw).toLocaleString()}원)과 100% 매칭되었습니다!`
        : `파싱 성공: ${parsed.bankName} ${parsed.amountKrw.toLocaleString()}원 (${parsed.depositCode}) 감지 완료! (현재 일치하는 입금 대기 세션은 없습니다)`,
      parsed,
      matchedSession: matchedSession || null,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
