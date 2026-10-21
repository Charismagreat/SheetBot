export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { insertRows, queryTable, callSheetsTool } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getCurrentUserEmail } from "@/lib/auth";

/**
 * 📨 시트 체크박스 문자 웹훅 디스패처
 * 
 * 구글 스프레드시트의 체크박스([V]) 클릭 또는 Apps Script 웹훅 호출을 수신하여
 * 스마트폰 시트봇 에이전트의 0원 발송 대기열(sheetbot_user_dispatch_logs)에 PENDING 적재
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const sessionEmail = await getCurrentUserEmail().catch(() => null);
    const body = await req.json().catch(() => ({}));

    const userEmail = (body.userEmail || sessionEmail || req.headers.get("x-sheetbot-user-email") || "").toLowerCase().trim();
    const phoneNumber = String(body.phoneNumber || body.phone || body.recipient || "").trim();
    const messageText = String(body.messageText || body.message || body.content || "").trim();
    const customerName = String(body.customerName || body.name || "").trim();
    const spreadsheetId = String(body.spreadsheetId || "").trim();
    const tabName = String(body.tabName || "문자발송").trim();
    const rowIndex = Number(body.rowIndex || 0);

    // 1. 유효성 검증
    if (!userEmail) {
      return NextResponse.json({
        success: false,
        error: "사용자 이메일(userEmail)이 누락되었습니다.",
      }, { status: 400 });
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
    if (!cleanPhone || cleanPhone.length < 8) {
      return NextResponse.json({
        success: false,
        error: `유효하지 않은 수신 전화번호입니다: '${phoneNumber}'`,
      }, { status: 400 });
    }

    if (!messageText) {
      return NextResponse.json({
        success: false,
        error: "발송할 문자 내용이 비어 있습니다.",
      }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const logId = `disp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 2. 부가 정보 (시트 역추적용 메타데이터)
    const ruleInfo = customerName ? `시트 체크박스 문자 (${customerName})` : "시트 체크박스 문자";
    const sheetMeta = (spreadsheetId && rowIndex > 0) ? JSON.stringify({
      spreadsheetId,
      tabName,
      rowIndex,
      customerName,
    }) : null;

    // 3. sheetbot_user_dispatch_logs 테이블에 PENDING 적재
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: userEmail,
        rule_id: sheetMeta || "sheet_checkbox_sms",
        rule_name: ruleInfo,
        device_id: null,
        recipient: cleanPhone,
        content: messageText,
        status: "PENDING",
        error_message: null,
        created_at: nowIso,
        updated_at: nowIso,
        updated_by: userEmail,
        deleted_at: null,
        deleted_by: null,
        restored_at: null,
        restored_by: null,
      },
    ]);

    // 4. (선택적) 구글 시트 E열(결과)에 ⏳ 대기 상태 선제 기입
    if (spreadsheetId && rowIndex >= 2) {
      try {
        const timeStr = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
        await callSheetsTool("sheets_update_range", {
          spreadsheetId,
          range: `'${tabName}'!E${rowIndex}:E${rowIndex}`,
          values: [[`⏳ 발송 대기 중 (${timeStr})`]],
        }).catch((e: any) => {
          console.warn("[Sheet-Sms-Dispatch] Sheet status update warning:", e?.message);
        });
      } catch (e: any) {
        console.warn("[Sheet-Sms-Dispatch] Non-critical sheet update skip:", e?.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: "발송 대기열에 등록되었습니다. 스마트폰 에이전트에서 0원 문자가 즉시 자동 발송됩니다.",
      logId,
      recipient: cleanPhone,
      customerName,
      targetRow: rowIndex > 0 ? rowIndex : undefined,
    });
  } catch (err: any) {
    console.error("[Sheet-Sms-Dispatch] POST error:", err);
    return NextResponse.json({
      success: false,
      error: err?.message || "문자 발송 디스패치 처리 중 서버 오류가 발생했습니다.",
    }, { status: 500 });
  }
}

/**
 * GET: 헬스체크 및 최근 발송 대기 상태 조회
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const sessionEmail = await getCurrentUserEmail().catch(() => null);
    const url = new URL(req.url);
    const userEmail = (url.searchParams.get("userEmail") || sessionEmail || "").toLowerCase().trim();

    const filters: Record<string, string> = { rule_name: "시트 체크박스 문자" };
    if (userEmail) {
      filters.user_email = userEmail;
    }

    const res = await queryTable("sheetbot_user_dispatch_logs", {
      filters,
      limit: 10,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    return NextResponse.json({
      success: true,
      count: validRows.length,
      logs: validRows,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
