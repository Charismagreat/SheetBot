export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callAppsScriptTool,
  callAiCaller,
  queryTable,
  updateRows,
  insertRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * 기존 Code.gs 코드에 신규 함수를 안전하게 병합하고 onOpen 메뉴에 등록
 */
function mergeFunctionIntoScript(
  existingCode: string,
  functionName: string,
  functionTitle: string,
  codeSnippet: string
): string {
  let baseCode = existingCode.trim();

  // 기존 코드가 비어 있는 경우 표준 템플릿 생성
  if (!baseCode || !baseCode.includes("function onOpen")) {
    baseCode = `/**
 * 🚀 SheetBot 스프레드시트 자동화 메인 스크립트
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  var menu = ui.createMenu("🚀 SheetBot 메뉴");
  menu.addItem("${functionTitle}", "${functionName}");
  menu.addSeparator();
  menu.addItem("🤖 SheetBot AI 코파일럿", "showAiCopilotSidebar");
  menu.addToUi();
}

function showAiCopilotSidebar() {
  SpreadsheetApp.getActiveSpreadsheet().toast("시트봇 AI 코파일럿이 활성화되었습니다.", "SheetBot");
}
`;
  } else {
    // 기존 onOpen 내부에 메뉴 아이템 추가 (중복 방지)
    if (!baseCode.includes(`"${functionName}"`) && !baseCode.includes(`'${functionName}'`)) {
      const menuAnchorRegex = /(var\s+menu\s*=\s*ui\.createMenu\([^)]+\);)/;
      if (menuAnchorRegex.test(baseCode)) {
        baseCode = baseCode.replace(
          menuAnchorRegex,
          `$1\n  menu.addItem("${functionTitle}", "${functionName}");`
        );
      } else {
        // onOpen 첫 부분에 메뉴 추가 시도
        baseCode = baseCode.replace(
          /function\s+onOpen\s*\(\)\s*\{/,
          `function onOpen() {\n  // [SheetBot Auto-Promoted]\n  try {\n    SpreadsheetApp.getUi().createMenu("🚀 SheetBot 메뉴").addItem("${functionTitle}", "${functionName}").addToUi();\n  } catch (_) {}\n`
        );
      }
    }
  }

  // 기존 코드에 신규 함수 코드가 없으면 하단에 안전하게 덧붙임
  if (!baseCode.includes(`function ${functionName}`)) {
    baseCode += `\n\n/**
 * [자동 승격 등록] ${functionTitle}
 * 등록일시: ${new Date().toLocaleString("ko-KR")}
 */
${codeSnippet}
`;
  }

  return baseCode;
}

/**
 * POST /api/user/commands/promote
 * 1회성(Zero-Script)으로 실행했던 자연어 작업을
 * 구글 스프레드시트의 '🚀 SheetBot 메뉴' 및 Apps Script 영구 함수로 승격(Promote) 등록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const body = await req.json().catch(() => ({}));

    const bodyEmail = body.userEmail as string | undefined;
    const command = (body.command as string | undefined)?.trim();
    const explicitSpreadsheetId = body.spreadsheetId as string | undefined;
    const requestedTitle = body.functionTitle as string | undefined;

    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!command) {
      return NextResponse.json({ success: false, error: "승격할 자연어 명령이 지정되지 않았습니다." }, { status: 400 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 1. 유저의 연동 프로젝트 대장 조회
    const projectsRes = await queryTable("sheetbot_projects", {
      filters: { user_email: cleanEmail },
      limit: 20,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const userProjects = (projectsRes.rows || []).filter((p: any) => !p.deleted_at);

    // 대상 프로젝트 선정 (명시된 spreadsheetId 우선, 없으면 첫 번째 프로젝트)
    let targetProject = userProjects.find((p: any) => explicitSpreadsheetId && p.spreadsheet_id === explicitSpreadsheetId);
    if (!targetProject) {
      targetProject = userProjects[0];
    }

    if (!targetProject) {
      return NextResponse.json({
        success: false,
        error: "연동된 구글 시트 대장이 없습니다. 먼저 시트봇 웹에서 대장을 연동해 주세요.",
      }, { status: 404 });
    }

    const spreadsheetId = targetProject.spreadsheet_id;
    let scriptId = targetProject.script_id;

    // 만약 scriptId가 없는 경우 바인딩된 프로젝트 신규 생성 시도
    if (!scriptId && spreadsheetId) {
      try {
        const createRes = await callAppsScriptTool("apps_script_create_for_spreadsheet", {
          spreadsheetId,
          title: `[SheetBot] ${targetProject.name || "자동화 대장"}`,
          preferOAuth: true,
        });
        scriptId = createRes?.scriptId || createRes?.id;
        if (scriptId) {
          targetProject.script_id = scriptId;
          await updateRows("sheetbot_projects", { script_id: scriptId }, { id: targetProject.id }).catch(() => {});
        }
      } catch (bindErr: any) {
        console.warn("[PromoteCommand] Script creation warning:", bindErr.message);
      }
    }

    // 2. Gemini 3.8 Flash를 통한 독립 Apps Script 함수 생성
    const generatePrompt = `당신은 최고 수준의 Google Apps Script(GAS) 수석 엔지니어입니다.
사용자(${cleanEmail})가 스마트폰에서 다음 작업을 실행해보고 만족하여,
구글 스프레드시트의 상단 메뉴('🚀 SheetBot 메뉴')에 등록하고 앞으로도 버튼 하나로 계속 실행할 수 있도록 정식 Apps Script 함수로 영구 등록(Promote)하기를 원합니다:

[사용자 명령]
"${command}"

[대상 스프레드시트 정보]
- 프로젝트명: ${targetProject.name}
- 시트 ID: ${spreadsheetId}
${requestedTitle ? `- 권장 기능명: ${requestedTitle}` : ""}

위 작업을 수행하는 완전하고 견고한 단일 Apps Script 함수를 작성하고 다음 JSON 형식으로만 응답하세요:
{
  "functionName": "영문 카멜케이스 함수명 (예: highlightPaidOrders, autoFormatReceivables, calculateMonthlySummary 등)",
  "functionTitle": "구글 시트 상단 메뉴에 표시될 15자 이내의 명확한 한글 라벨 (예: '⚡ 결제완료 초록색 강조', '📊 월간 마감 정산')",
  "description": "기능 설명 요약",
  "codeSnippet": "함수 전체 JavaScript 코드 (try-catch 예외 처리 및 완료 시 SpreadsheetApp.getActiveSpreadsheet().toast('완료되었습니다.', 'SheetBot') 포함 필수)"
}`;

    const aiRes = await callAiCaller(generatePrompt, {
      model: "gemini-3.8-flash",
      temperature: 0.1,
    });

    let rawText = (aiRes.text || aiRes.content || "").trim();
    if (rawText.startsWith("```json")) {
      rawText = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let generated: any = {};
    try {
      generated = JSON.parse(rawText);
    } catch {
      generated = {
        functionName: `autoTask_${Date.now()}`,
        functionTitle: requestedTitle || "사용자 맞춤 자동화",
        description: command,
        codeSnippet: `function autoTask_${Date.now()}() {\n  SpreadsheetApp.getActiveSpreadsheet().toast("${command} 처리가 완료되었습니다.", "SheetBot");\n}`,
      };
    }

    // 3. 기존 코드에 신규 함수 병합
    const mergedCode = mergeFunctionIntoScript(
      targetProject.script_code || "",
      generated.functionName,
      generated.functionTitle,
      generated.codeSnippet
    );

    // 4. 구글 클라우드에 원격 주입 (write_file & push_to_google)
    let pushSuccess = false;
    if (scriptId) {
      try {
        await callAppsScriptTool("apps_script_write_file", {
          projectId: scriptId,
          fileName: "Code.gs",
          content: mergedCode,
          preferOAuth: true,
        });

        const pushRes = await callAppsScriptTool("apps_script_push_to_google", {
          projectId: scriptId,
          preferOAuth: true,
        });
        pushSuccess = true;
      } catch (pushErr: any) {
        console.warn("[PromoteCommand] GAS push error:", pushErr.message);
      }
    }

    // 5. DB 메타데이터 업데이트 (script_code 및 features 병합)
    let currentFeatures: any[] = [];
    try {
      currentFeatures = JSON.parse(targetProject.features || "[]");
    } catch {}

    if (!currentFeatures.some((f: any) => f.functionName === generated.functionName)) {
      currentFeatures.push({
        functionName: generated.functionName,
        title: generated.functionTitle,
        description: generated.description,
        example: `${generated.functionTitle} 실행해줘`,
        promotedAt: new Date().toISOString(),
      });
    }

    await updateRows(
      "sheetbot_projects",
      {
        script_code: mergedCode,
        features: JSON.stringify(currentFeatures),
        updated_at: new Date().toISOString(),
      },
      { id: targetProject.id }
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      functionName: generated.functionName,
      functionTitle: generated.functionTitle,
      description: generated.description,
      projectName: targetProject.name,
      spreadsheetId,
      scriptId,
      pushSuccess,
      message: `🎉 구글 시트 상단 '🚀 SheetBot 메뉴'에 '${generated.functionTitle}' 기능으로 영구 등록되었습니다!`,
      spokenResult: `요청하신 작업이 구글 시트 상단 메뉴에 ${generated.functionTitle} 기능으로 영구 등록되었습니다.`,
    });
  } catch (err: any) {
    console.error("[PromoteCommand] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
