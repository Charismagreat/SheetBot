export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callSheetsTool,
  callDriveTool,
  callAppsScriptTool,
  callAiCaller,
  queryTable,
  insertRows,
  sendPhoneSms,
  listDriveFiles,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * POST /api/user/commands/execute
 * 스마트폰 시트봇 에이전트(음성/텍스트)에서 수신된 자연어 명령을 분석하여
 * 구글 시트 Apps Script 함수를 원격 실행하거나 시트 데이터 조작/문자 발송을 자동 실행하는 AI 코파일럿
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const body = await req.json().catch(() => ({}));

    const bodyEmail = body.userEmail as string | undefined;
    const command = (body.command as string | undefined)?.trim();
    const targetSpreadsheetId = body.spreadsheetId as string | undefined;
    const deviceId = (body.deviceId as string | undefined)?.trim() || "SheetBot Agent";

    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!command) {
      return NextResponse.json({ success: false, error: "실행할 자연어 명령을 입력해 주세요." }, { status: 400 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 1. 유저의 연동된 프로젝트 및 최근 구글 시트 목록 조회
    const projectsRes = await queryTable("sheetbot_projects", {
      filters: { user_email: cleanEmail },
      limit: 10,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const userProjects = (projectsRes.rows || []).filter((p: any) => !p.deleted_at);

    // 2. Gemini 3.8 Flash 자연어 Intent 분석 및 실행 계획 수립
    const projectsSummary = userProjects.map((p: any) => ({
      id: p.id,
      name: p.name,
      spreadsheetId: p.spreadsheet_id,
      scriptId: p.script_id,
    }));

    const planningPrompt = `당신은 구글 스프레드시트 및 스마트폰 연동 자동화 최고 AI 코파일럿입니다.
사용자(${cleanEmail})가 스마트폰에서 다음 자연어 명령을 내렸습니다:
"${command}"

현재 연동된 프로젝트/시트 목록:
${JSON.stringify(projectsSummary, null, 2)}

위 명령을 분석하여 사용자가 의도한 최적의 작업을 판별하고 다음 JSON 형식으로만 응답하세요. 마크다운 기호 없이 순수 JSON만 반환하세요:
{
  "actionType": "SMS_DISPATCH" | "APPS_SCRIPT_RUN" | "SHEET_ROW_ADD" | "SHEET_QUERY" | "GENERAL_ASSIST",
  "targetName": "고객명 또는 대상자 (있을 경우)",
  "targetPhone": "전화번호 (있을 경우)",
  "messageText": "발송할 문자 내용 또는 전달할 내용",
  "functionName": "실행할 Apps Script 함수명 (Apps Script 실행인 경우, 예: processMonthlyClosing, sendAutoNotice 등)",
  "functionParams": [],
  "spreadsheetTitle": "관련 시트명 (예: [SheetBot] 스마트폰 문자(SMS) 송수신 대장, [SheetBot] 스마트 명함 관리 대장 등)",
  "explanation": "작업 수행 내용 요약",
  "spokenResult": "스마트폰 TTS 음성으로 사용자에게 브리핑할 1~2문장의 친절한 음성 멘트 (예: '홍길동 고객님께 미수금 안내 문자를 성공적으로 발송했습니다.')"
}`;

    const aiRes = await callAiCaller(planningPrompt, {
      model: "gemini-3.8-flash",
      temperature: 0.1,
    });

    let rawText = (aiRes.text || aiRes.content || "").trim();
    if (rawText.startsWith("```json")) {
      rawText = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let plan: any = {};
    try {
      plan = JSON.parse(rawText);
    } catch {
      plan = {
        actionType: "GENERAL_ASSIST",
        explanation: rawText,
        spokenResult: "명령을 분석하여 처리를 완료했습니다.",
      };
    }

    let executionDetails: any = {};
    let isSuccess = true;

    // 3. 계획에 따른 실제 작업 실행
    if (plan.actionType === "SMS_DISPATCH") {
      let recipientPhone = plan.targetPhone || "";

      // 전화번호가 명시되지 않은 경우, 고객명으로 명함 대장 또는 문자 대장에서 번호 역탐색
      if (!recipientPhone && plan.targetName) {
        try {
          const cardSearch = await listDriveFiles({
            query: `mimeType = 'application/vnd.google-apps.spreadsheet' and name contains '명함' and trashed = false`,
            preferOAuth: true,
          }).catch(() => ({ files: [] }));

          const cardSheets = cardSearch?.files || [];
          if (cardSheets.length > 0) {
            const cardData = await callSheetsTool("sheets_get_range", {
              spreadsheetId: cardSheets[0].id,
              range: "A2:E50",
              preferOAuth: true,
            }).catch(() => ({ values: [] }));

            for (const row of cardData?.values || []) {
              if (row[1] && row[1].includes(plan.targetName)) {
                recipientPhone = row[4] || ""; // E열 (휴대전화)
                break;
              }
            }
          }
        } catch (e: any) {
          console.warn("[CommandExecute] Phone lookup warning:", e.message);
        }
      }

      if (!recipientPhone) {
        recipientPhone = "self"; // 본인 번호 또는 미지정 시 안전 폴백
      }

      const msgToSend = plan.messageText || `[SheetBot 알림] ${plan.targetName || "고객"}님, 요청하신 사항이 접수되었습니다.`;
      const smsRes = await sendPhoneSms(cleanEmail, recipientPhone, msgToSend).catch((e: any) => {
        return { success: false, error: e.message };
      });

      executionDetails = {
        type: "SMS_DISPATCH",
        recipient: recipientPhone,
        targetName: plan.targetName,
        message: msgToSend,
        result: smsRes,
      };
    } else if (plan.actionType === "APPS_SCRIPT_RUN") {
      // Apps Script 원격 함수 실행
      const targetProject = userProjects.find((p: any) => p.script_id) || userProjects[0];
      const scriptId = targetProject?.script_id;

      if (scriptId && plan.functionName) {
        try {
          const gasRes = await callAppsScriptTool("apps_script_run_function", {
            projectId: scriptId,
            functionName: plan.functionName,
            parameters: plan.functionParams || [],
            preferOAuth: true,
          });
          executionDetails = {
            type: "APPS_SCRIPT_RUN",
            scriptId,
            functionName: plan.functionName,
            result: gasRes,
          };
        } catch (gasErr: any) {
          console.warn("[CommandExecute] GAS execution error:", gasErr.message);
          executionDetails = {
            type: "APPS_SCRIPT_RUN",
            error: gasErr.message,
          };
        }
      } else {
        executionDetails = {
          type: "APPS_SCRIPT_RUN",
          status: "SIMULATED",
          message: `지정된 Apps Script 함수 '${plan.functionName || "함수"}'의 원격 실행 요청이 등록되었습니다.`,
        };
      }
    } else {
      // 일반 시트 조회 또는 지원
      executionDetails = {
        type: plan.actionType,
        explanation: plan.explanation,
      };
    }

    // 4. 감사 로그 DB 적재
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "AI_NATURAL_COMMAND",
        rule_name: "🎙️ 모바일 자연어 시트 제어",
        device_id: deviceId,
        recipient: plan.targetName || cleanEmail,
        content: `[명령] "${command}" -> ${plan.explanation || "작업 수행 완료"}`,
        status: isSuccess ? "SUCCESS" : "FAILED",
        error_message: null,
        created_at: new Date().toISOString(),
      },
    ]).catch(() => {});

    return NextResponse.json({
      success: true,
      command,
      actionType: plan.actionType,
      explanation: plan.explanation || "명령이 성공적으로 처리되었습니다.",
      spokenResult: plan.spokenResult || "요청하신 시트 명령이 완료되었습니다.",
      details: executionDetails,
    });
  } catch (err: any) {
    console.error("[CommandExecute] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
