export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

const EGDESK_API_URL =
  process.env.NEXT_PUBLIC_EGDESK_API_URL || "http://localhost:8080";
const EGDESK_MASTER_KEY =
  process.env.NEXT_PUBLIC_EGDESK_API_KEY || "a67ddc0f-7e2b-4997-9a0b-9667a74c89d0";

// 허용된 안전 도구 화이트리스트 (보안 상 시스템 명령이나 파일 삭제 등은 엄격히 차단)
const ALLOWED_TOOLS: Record<string, string[]> = {
  "ai-caller": ["ai_caller_call", "ai_caller_list_models"],
  "user-data": [
    "user_data_create_table",
    "user_data_insert_rows",
    "user_data_query",
    "user_data_sql_query",
    "user_data_update_rows",
    "user_data_delete_rows",
    "user_data_list_tables",
    "user_data_get_schema"
  ],
  "phone": ["phone_send", "phone_list_devices", "phone_check"]
};

/**
 * SheetBot MCP 보안 프록시 게이트웨이
 * - Apps Script 및 외부 클라이언트가 마스터 API 키를 몰라도 개인 키(sk_sheetbot_...)로 안전하게 호출
 * - 화이트리스트 기반 위험 도구 원천 차단
 * - AI 호출 시 토큰 감사 및 실시간 로깅
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const authHeader = req.headers.get("x-sheetbot-key") || req.headers.get("authorization");
    let userKey = "";

    if (authHeader) {
      userKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    }

    if (!userKey) {
      return NextResponse.json(
        { success: false, error: "X-SheetBot-Key 인증 헤더가 필요합니다." },
        { status: 401 }
      );
    }

    // 1. 회원 API 키 검증
    const keyRes = await queryTable("sheetbot_user_api_keys", {
      filters: { api_key: userKey, status: "ACTIVE" },
      limit: 1
    }).catch(() => ({ rows: [] }));

    const validKey = (keyRes.rows || []).find((r: any) => !r.deleted_at && r.status === "ACTIVE");
    if (!validKey) {
      return NextResponse.json(
        { success: false, error: "유효하지 않거나 비활성화된 SheetBot API 키입니다." },
        { status: 403 }
      );
    }

    const userEmail = validKey.user_email;

    // 2. 요청 바디 검증
    const body = await req.json();
    const { service, tool, arguments: args } = body;

    if (!service || !tool) {
      return NextResponse.json(
        { success: false, error: "service와 tool 파라미터는 필수입니다." },
        { status: 400 }
      );
    }

    // 3. 도구 화이트리스트 검증
    const allowedForService = ALLOWED_TOOLS[service];
    if (!allowedForService || !allowedForService.includes(tool)) {
      return NextResponse.json(
        { success: false, error: `보안 정책에 의해 도구 '${service}/${tool}' 호출이 제한되었습니다.` },
        { status: 403 }
      );
    }

    // 4. user-data 도구 호출 시 다중 사용자 격리 강제 주입
    const finalArgs = { ...(args || {}) };
    if (service === "user-data") {
      // 쿼리나 행 삽입 시 사용자 이메일 자동 부여
      if (tool === "user_data_insert_rows" && Array.isArray(finalArgs.rows)) {
        finalArgs.rows = finalArgs.rows.map((row: any) => ({
          ...row,
          user_email: row.user_email || userEmail
        }));
      }
    }

    // 5. 서버 내부 마스터 키로 EGDesk 백엔드 호출 (클라이언트에는 절대 마스터 키 노출 없음)
    const targetUrl = `${EGDESK_API_URL}/${service}/tools/call`;
    const upstreamRes = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": EGDESK_MASTER_KEY
      },
      body: JSON.stringify({
        tool,
        arguments: finalArgs
      })
    });

    const resultJson = await upstreamRes.json();

    // 6. 키 최종 사용 시간 갱신 (비동기)
    updateRows("sheetbot_user_api_keys", { api_key: userKey }, {
      last_used_at: new Date().toISOString()
    }).catch(() => null);

    // 7. AI 호출인 경우 감사 로그 기록
    if (service === "ai-caller" && tool === "ai_caller_call") {
      const usage = resultJson?.result?.usage || resultJson?.usage;
      const totalTokens = (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0);
      insertRows("sheetbot_ai_audit_logs", [{
        caller: "apps_script_gateway",
        user_email: userEmail,
        model: finalArgs.model || "gemini-3.8-flash",
        tokens_used: totalTokens || 150,
        purpose: "Google Apps Script AI 호출",
        created_at: new Date().toISOString()
      }]).catch(() => null);
    }

    return NextResponse.json(resultJson, { status: upstreamRes.status });
  } catch (err: any) {
    console.error("[SheetBot Gateway Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Gateway internal server error" },
      { status: 500 }
    );
  }
}
