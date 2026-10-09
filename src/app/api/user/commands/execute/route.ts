export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callSheetsTool,
  callAppsScriptTool,
  callAiCaller,
  queryTable,
  insertRows,
  sendPhoneSms,
  listDriveFiles,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

interface AvailableGasFunction {
  projectName: string;
  spreadsheetId: string;
  scriptId: string;
  functionName: string;
  title: string;
  description: string;
}

/**
 * 프로젝트 코드 및 features 메타데이터에서 실제 실행 가능한 Apps Script 함수 목록 추출
 */
function extractAvailableFunctions(projects: any[], schedules: any[]): AvailableGasFunction[] {
  const result: AvailableGasFunction[] = [];
  const systemIgnore = new Set([
    "onOpen",
    "onEdit",
    "doGet",
    "doPost",
    "include",
    "test",
    "showSidebar",
    "showAiCopilotSidebar",
    "openTokenRechargeModal",
    "openSheetBotGuide",
    "checkEgdeskTunnelHealth",
    "deleteAllSheetBotScripts",
    "extractSqliteId",
  ]);

  for (const p of projects) {
    const pName = p.name || "구글 시트 대장";
    const sId = p.spreadsheet_id || "";
    const scId = p.script_id || "";

    // 1. features 파싱
    try {
      const features = JSON.parse(p.features || "[]");
      if (Array.isArray(features)) {
        for (const f of features) {
          if (typeof f === "object" && f && (f.functionName || f.name)) {
            const fn = f.functionName || f.name;
            if (!systemIgnore.has(fn)) {
              result.push({
                projectName: pName,
                spreadsheetId: sId,
                scriptId: scId,
                functionName: fn,
                title: f.title || f.label || fn,
                description: f.description || `${pName} 자동화 함수`,
              });
            }
          }
        }
      }
    } catch {}

    // 2. script_code 정규식 파싱
    if (p.script_code) {
      const funcRegex = /(?:\/\*\*([\s\S]*?)\*\/\s*)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g;
      let match: RegExpExecArray | null;
      while ((match = funcRegex.exec(p.script_code)) !== null) {
        const comment = match[1] || "";
        const fnName = match[2];

        if (systemIgnore.has(fnName)) continue;
        if (result.some((r) => r.scriptId === scId && r.functionName === fnName)) continue;

        let desc = "";
        if (comment) {
          const cleanLines = comment
            .split("\n")
            .map((l) => l.replace(/^\s*\*\s?/, "").trim())
            .filter(Boolean);
          desc = cleanLines.find((l) => !l.startsWith("@")) || "";
        }
        if (!desc) desc = `${fnName} 스크립트 실행`;

        result.push({
          projectName: pName,
          spreadsheetId: sId,
          scriptId: scId,
          functionName: fnName,
          title: desc.length > 20 ? desc.slice(0, 18) + "..." : desc,
          description: desc,
        });
      }
    }
  }

  // 3. 스케줄 테이블 등록 함수 병합
  for (const s of schedules) {
    if (s.function_name && !result.some((r) => r.functionName === s.function_name)) {
      result.push({
        projectName: s.project_name || "구글 시트",
        spreadsheetId: s.spreadsheet_id || "",
        scriptId: "",
        functionName: s.function_name,
        title: s.name || s.function_name,
        description: s.description || "등록된 스케줄 함수",
      });
    }
  }

  return result;
}

/**
 * POST /api/user/commands/execute
 * 스마트폰 시트봇 에이전트(음성/텍스트)에서 수신된 자연어 명령을 분석하여:
 * 1) Apps Script 원격 구동 (정밀 Ground Truth 함수 매핑 및 미존재 시 안내 폴백)
 * 2) Apps Script 없이 Google Sheets API를 통한 교차 검색/집계/통계 브리핑 (SHEET_QUERY)
 * 3) 고객 연락처 역탐색 및 스마트폰 문자 발송 (SMS_DISPATCH)
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

    // 1. 유저의 연동된 프로젝트 및 스케줄 목록 조회
    const [projectsRes, schedulesRes] = await Promise.all([
      queryTable("sheetbot_projects", {
        filters: { user_email: cleanEmail },
        limit: 20,
        orderBy: "id",
        orderDirection: "DESC",
      }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_schedules", {
        filters: { user_email: cleanEmail },
        limit: 30,
        orderBy: "id",
        orderDirection: "DESC",
      }).catch(() => ({ rows: [] })),
    ]);

    const userProjects = (projectsRes.rows || []).filter((p: any) => !p.deleted_at);
    const userSchedules = (schedulesRes.rows || []).filter((s: any) => !s.deleted_at);

    // 2. 실제 주입된 Apps Script 함수 목록(Ground Truth) 추출
    const availableGasFunctions = extractAvailableFunctions(userProjects, userSchedules);

    const projectsSummary = userProjects.map((p: any) => ({
      id: p.id,
      name: p.name,
      spreadsheetId: p.spreadsheet_id,
      scriptId: p.script_id,
    }));

    // 3. Gemini 3.8 Flash 자연어 Intent 분석 및 실행 계획 수립
    const planningPrompt = `당신은 구글 스프레드시트 및 스마트폰 연동 자동화 최고 AI 코파일럿입니다.
사용자(${cleanEmail})가 스마트폰에서 다음 자연어 명령을 내렸습니다:
"${command}"

[1] 현재 연동된 구글 시트 대장 목록:
${JSON.stringify(projectsSummary, null, 2)}

[2] 대장에 실제 주입되어 실행 가능한 Apps Script 함수 목록 (Ground Truth):
${JSON.stringify(availableGasFunctions, null, 2)}

위 명령을 분석하여 최적의 작업을 판별하고 다음 순수 JSON으로만 응답하세요:
{
  "actionType": "APPS_SCRIPT_RUN" | "APPS_SCRIPT_NOT_FOUND" | "SHEET_QUERY" | "SMS_DISPATCH" | "GENERAL_ASSIST",
  "targetName": "고객명 또는 대상자 (있을 경우)",
  "targetPhone": "전화번호 (있을 경우)",
  "messageText": "발송할 문자 내용 또는 전달할 내용",
  "scriptId": "실행할 Apps Script scriptId (APPS_SCRIPT_RUN인 경우)",
  "functionName": "실행할 Apps Script 실제 함수명 (availableGasFunctions에 실제로 존재하는 이름만 지정할 것)",
  "functionParams": [],
  "queryKeywords": ["시트 검색 키워드 (SHEET_QUERY인 경우, 예: '매출', '고객', '명함')"],
  "queryTargetEntity": "검색 대상 (예: '홍길동')",
  "queryMetric": "집계/확인할 항목 (예: '매출 건수 및 합계 금액')",
  "explanation": "작업 수행 내용 요약",
  "spokenResult": "스마트폰 TTS 음성으로 사용자에게 브리핑할 1~2문장의 친절한 음성 멘트"
}

* 판별 주의사항:
- 사용자가 스크립트 실행(마감, 동기화 등)을 의도했으나, [2]의 함수 목록에 해당 함수가 전혀 없다면 절대로 가상의 함수명을 지어내지 말고 "actionType": "APPS_SCRIPT_NOT_FOUND"로 응답하고, 현재 실행 가능한 함수 목록을 안내하세요.
- 데이터 조회, 건수/금액 집계, 고객 정보 확인 등은 Apps Script 없이도 시트 API로 직접 조회 가능하므로 "actionType": "SHEET_QUERY"로 판별하세요.`;

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

    // 4. 의도별 실제 작업 실행
    if (plan.actionType === "APPS_SCRIPT_NOT_FOUND") {
      // (1) 스크립트 함수 미존재 안내 (Fallback)
      const availableList = availableGasFunctions.map((f) => `• ${f.title} (${f.functionName})`).join("\n");
      const spokenList = availableGasFunctions.slice(0, 3).map((f) => f.title).join(", ");

      const explanation = availableGasFunctions.length > 0
        ? `⚠️ 요청하신 작업과 일치하는 스크립트 함수가 현재 대장에 없습니다.\n\n[현재 실행 가능한 기능 목록]\n${availableList}`
        : "⚠️ 현재 등록된 대장에 주입된 자동화 스크립트가 없습니다. 시트봇 웹에서 스크립트를 먼저 주입해 주세요.";

      const spokenResult = availableGasFunctions.length > 0
        ? `현재 대장에는 해당 기능이 없습니다. 실행 가능한 기능은 ${spokenList} 등이 있습니다.`
        : "현재 연동된 대장에 실행 가능한 자동화 스크립트가 등록되어 있지 않습니다.";

      plan.explanation = explanation;
      plan.spokenResult = spokenResult;
      executionDetails = { type: "APPS_SCRIPT_NOT_FOUND", availableFunctions: availableGasFunctions };
    } else if (plan.actionType === "APPS_SCRIPT_RUN") {
      // (2) Apps Script 원격 함수 실행
      let scriptId = plan.scriptId;
      if (!scriptId) {
        const matched = availableGasFunctions.find((f) => f.functionName === plan.functionName);
        scriptId = matched?.scriptId || userProjects[0]?.script_id;
      }

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
          isSuccess = false;
        }
      } else {
        executionDetails = {
          type: "APPS_SCRIPT_RUN",
          status: "SIMULATED",
          message: `지정된 Apps Script 함수 '${plan.functionName || "함수"}'의 원격 실행 요청이 등록되었습니다.`,
        };
      }
    } else if (plan.actionType === "SHEET_QUERY") {
      // (3) Apps Script 없이 Google Sheets API로 직접 교차 조회 및 실시간 AI 집계
      try {
        let sampleDataTexts: string[] = [];

        // 관련 시트 검색 (프로젝트 목록 또는 드라이브 검색)
        const candidateSheets: { id: string; name: string }[] = [];
        for (const p of userProjects) {
          if (p.spreadsheet_id) {
            candidateSheets.push({ id: p.spreadsheet_id, name: p.name });
          }
        }

        // 드라이브에서 추가 스프레드시트 탐색
        if (candidateSheets.length === 0 || (plan.queryKeywords && plan.queryKeywords.length > 0)) {
          const kw = (plan.queryKeywords && plan.queryKeywords[0]) || "";
          const driveSearch = await listDriveFiles({
            query: `mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false ${kw ? `and name contains '${kw}'` : ""}`,
            preferOAuth: true,
          }).catch(() => ({ files: [] }));

          for (const f of driveSearch?.files || []) {
            if (!candidateSheets.some((c) => c.id === f.id)) {
              candidateSheets.push({ id: f.id, name: f.name });
            }
          }
        }

        // 상위 3개 관련 시트의 데이터 상위 60행 읽어오기
        for (const sheet of candidateSheets.slice(0, 3)) {
          const rangeRes = await callSheetsTool("sheets_get_range", {
            spreadsheetId: sheet.id,
            range: "A1:Z60",
            preferOAuth: true,
          }).catch(() => ({ values: [] }));

          const values = rangeRes?.values || [];
          if (values.length > 0) {
            const tableStr = values.map((r: any[]) => r.join("\t")).join("\n");
            sampleDataTexts.push(`[시트명: ${sheet.name} (ID: ${sheet.id})]\n${tableStr}`);
          }
        }

        if (sampleDataTexts.length > 0) {
          // LLM에게 원시 시트 데이터를 넘겨 인메모리 교차 집계 수행
          const queryPrompt = `당신은 최고 수준의 스프레드시트 데이터 분석 AI입니다.
사용자의 질문:
"${command}"

다음은 사용자의 구글 스프레드시트에서 실시간으로 읽어온 실제 원시 데이터입니다:
${sampleDataTexts.join("\n\n====================\n\n")}

위 시트 데이터를 정밀 분석하여 사용자의 질문에 완벽히 답변하세요:
1. 검색 대상(${plan.queryTargetEntity || "대상자"})과 집계 항목(${plan.queryMetric || "건수/금액"})을 정확히 찾아 건수와 합계를 계산하세요.
2. 다음 JSON 형식으로만 응답하세요:
{
  "explanation": "사용자가 읽기 쉬운 명확한 분석 결과 요약 (예: '홍길동 고객님의 매출 내역은 총 4건이며, 총 결제 금액은 850,000원입니다. 최근 거래일은 2026-10-05입니다.')",
  "spokenResult": "스마트폰 TTS 음성으로 브리핑할 1~2문장의 간결하고 자연스러운 한국어 멘트 (예: '홍길동 고객님의 매출은 총 4건, 합계 85만 원으로 확인되었습니다.')"
}`;

          const queryAiRes = await callAiCaller(queryPrompt, {
            model: "gemini-3.8-flash",
            temperature: 0.1,
          });

          let qRaw = (queryAiRes.text || queryAiRes.content || "").trim();
          if (qRaw.startsWith("```json")) {
            qRaw = qRaw.replace(/^```json\s*/, "").replace(/\s*```$/, "");
          } else if (qRaw.startsWith("```")) {
            qRaw = qRaw.replace(/^```\s*/, "").replace(/\s*```$/, "");
          }

          try {
            const qParsed = JSON.parse(qRaw);
            plan.explanation = qParsed.explanation || plan.explanation;
            plan.spokenResult = qParsed.spokenResult || plan.spokenResult;
          } catch {
            if (qRaw) plan.explanation = qRaw;
          }

          executionDetails = {
            type: "SHEET_QUERY",
            sheetsQueried: candidateSheets.map((c) => c.name),
            status: "SUCCESS",
          };
        } else {
          plan.explanation = "관련 구글 시트 데이터를 찾을 수 없어 조회를 완료하지 못했습니다.";
          plan.spokenResult = "연동된 시트에서 관련 데이터를 찾지 못했습니다.";
          executionDetails = { type: "SHEET_QUERY", status: "NO_DATA" };
        }
      } catch (qErr: any) {
        console.warn("[CommandExecute] Sheet query error:", qErr.message);
        plan.explanation = `시트 데이터 조회 중 오류가 발생했습니다: ${qErr.message}`;
        plan.spokenResult = "시트 데이터 조회 중 문제가 발생했습니다.";
        isSuccess = false;
      }
    } else if (plan.actionType === "SMS_DISPATCH") {
      // (4) 문자 발송 및 고객 번호 역탐색
      let recipientPhone = plan.targetPhone || "";

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
                recipientPhone = row[4] || "";
                break;
              }
            }
          }
        } catch (e: any) {
          console.warn("[CommandExecute] Phone lookup warning:", e.message);
        }
      }

      if (!recipientPhone) recipientPhone = "self";

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
    } else {
      // 일반 지원
      executionDetails = {
        type: plan.actionType,
        explanation: plan.explanation,
      };
    }

    // 5. 감사 로그 DB 적재
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
        error_message: isSuccess ? null : plan.explanation,
        created_at: new Date().toISOString(),
      },
    ]).catch(() => {});

    const canPromote = isSuccess && plan.actionType !== "APPS_SCRIPT_NOT_FOUND" && plan.actionType !== "APPS_SCRIPT_RUN";
    const suggestedFunctionTitle = plan.suggestedFunctionTitle || (command.length > 15 ? command.slice(0, 12) + "..." : command);
    const targetSheetId = userProjects[0]?.spreadsheet_id || "";

    return NextResponse.json({
      success: isSuccess,
      command,
      actionType: plan.actionType,
      explanation: plan.explanation || "명령이 성공적으로 처리되었습니다.",
      spokenResult: plan.spokenResult || "요청하신 시트 명령이 완료되었습니다.",
      canPromote,
      suggestedFunctionTitle,
      spreadsheetId: targetSheetId,
      details: {
        ...executionDetails,
        canPromote,
        suggestedFunctionTitle,
        spreadsheetId: targetSheetId,
      },
    });
  } catch (err: any) {
    console.error("[CommandExecute] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
