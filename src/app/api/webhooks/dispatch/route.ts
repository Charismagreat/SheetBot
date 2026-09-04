export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, insertRows, sendPhoneSms, callAiCaller } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * POST /api/webhooks/dispatch
 * 회원의 Google 스프레드시트(Apps Script)에서 이벤트 발생 시 실시간 수신하여
 * 자연어 규칙 평가 후 회원의 디바이스로 문자 자동 발송
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json().catch(() => ({}));
    const { userEmail, eventType, projectId, rowData, sheetName, triggerTime } = body;

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "회원 식별자(userEmail)가 누락되었습니다." },
        { status: 400 }
      );
    }

    const cleanEmail = String(userEmail).toLowerCase().trim();

    // 1. 회원의 활성화된 스마트 알림 규칙 목록 조회
    const rulesRes = await queryTable("sheetbot_user_smart_rules", {
      filters: { user_email: cleanEmail, is_active: 1 },
      limit: 50,
    }).catch(() => ({ rows: [] }));

    const activeRules = (rulesRes.rows || []).filter((r: any) => !r.deleted_at && r.is_active === 1);

    if (activeRules.length === 0) {
      return NextResponse.json({
        success: true,
        dispatched: 0,
        message: "현재 활성화된 스마트 알림 규칙이 없습니다.",
      });
    }

    // 2. 회원의 연결된 디바이스 조회
    const devRes = await queryTable("sheetbot_user_devices", {
      filters: { user_email: cleanEmail },
      limit: 5,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const userDevices = (devRes.rows || []).filter((d: any) => !d.deleted_at);
    const activeDevice = userDevices[0] || null;

    let dispatchCount = 0;
    const dispatchResults: any[] = [];

    // 3. 각 활성 규칙에 대해 AI 조건 평가 및 발송 실행
    for (const rule of activeRules) {
      // 프로젝트 필터링 (특정 프로젝트에만 지정된 규칙인 경우)
      if (rule.project_id && rule.project_id !== "all" && projectId && rule.project_id !== projectId) {
        continue;
      }

      // AI에게 이벤트 데이터와 규칙 조건을 넘겨 발송 대상 여부 및 최종 메시지 추출 요청
      const evalPrompt = `당신은 스프레드시트 자동화 알림 심사관입니다.
[사용자 설정 알림 규칙]: "${rule.prompt}"
[메시지 템플릿]: "${rule.message_template || ""}"
[수신 대상 설정]: target_recipient=${rule.target_recipient}, recipient_column=${rule.recipient_column || ""}, custom_phone=${rule.custom_phone || ""}
[발생한 시트 이벤트]:
- 이벤트 종류: ${eventType || "sheet_event"}
- 시트 이름: ${sheetName || "Sheet1"}
- 행(Row) 데이터: ${JSON.stringify(rowData || {})}

위 행 데이터가 사용자가 설정한 [알림 규칙]의 발송 조건에 정확히 부합하는지 판별하세요.
반드시 다음 JSON 형식으로만 응답하세요:
{
  "matched": true 또는 false,
  "reason": "조건 일치 또는 불일치 사유 요약",
  "recipient": "발송할 최종 수신자 전화번호 (조건 불일치 시 '')",
  "finalMessage": "수신자에게 보낼 완성된 문자 내용 (템플릿 변수가 실제 데이터로 치환된 결과, 불일치 시 '')"
}`;

      try {
        const aiEval = await callAiCaller(evalPrompt, { temperature: 0.1 });
        const text = typeof aiEval === "string" ? aiEval : aiEval?.text || aiEval?.content || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const evalResult = JSON.parse(jsonMatch[0]);

          if (evalResult.matched && evalResult.recipient && evalResult.finalMessage) {
            // 발송 대상 전화번호 결정 (AI 추출 번호 우선 또는 고정/본인 번호 폴백)
            const targetPhone = evalResult.recipient.trim();
            const messageToSend = evalResult.finalMessage.trim();

            let sendSuccess = false;
            let errorMsg = "";

            try {
              const sendRes = await sendPhoneSms({
                phoneNumber: targetPhone,
                message: messageToSend,
                deviceId: activeDevice?.device_id || undefined,
                isMarketing: false,
              });
              sendSuccess = !!(sendRes && (sendRes.success || sendRes.status === "sent" || sendRes.messageId));
            } catch (sErr: any) {
              sendSuccess = false;
              errorMsg = sErr.message || "문자 발송 실패";
            }

            // 발송 로그 DB 적재
            const logId = `dlog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            await insertRows("sheetbot_user_dispatch_logs", [
              {
                id: logId,
                user_email: cleanEmail,
                rule_id: rule.id,
                rule_name: rule.name,
                device_id: activeDevice?.device_id || "default",
                recipient: targetPhone,
                content: messageToSend,
                status: sendSuccess ? "SUCCESS" : "FAILED",
                error_message: errorMsg || null,
                created_at: new Date().toISOString(),
              },
            ]).catch(() => {});

            dispatchCount++;
            dispatchResults.push({
              ruleName: rule.name,
              recipient: targetPhone,
              status: sendSuccess ? "SUCCESS" : "FAILED",
              error: errorMsg || undefined,
            });
          }
        }
      } catch (ruleEvalErr: any) {
        console.warn(`[WebhookDispatch] Rule ${rule.id} eval warning:`, ruleEvalErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      dispatched: dispatchCount,
      results: dispatchResults,
    });
  } catch (err: any) {
    console.error("[WebhookDispatch] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
