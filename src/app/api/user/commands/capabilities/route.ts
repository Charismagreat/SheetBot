export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export interface GasFunctionMeta {
  functionName: string;
  title: string;
  description: string;
  example: string;
  projectName: string;
  spreadsheetId: string;
  scriptId: string;
}

export interface CommandSuggestion {
  id: string;
  type: "APPS_SCRIPT" | "SHEET_QUERY" | "SMS_DISPATCH";
  label: string;
  command: string;
  description?: string;
  functionName?: string;
  projectName?: string;
}

/**
 * 스크립트 코드 및 features 메타데이터에서 실행 가능한 함수 목록 추출
 */
function extractGasFunctions(
  scriptCode: string,
  featuresRaw: string,
  projectName: string,
  spreadsheetId: string,
  scriptId: string
): GasFunctionMeta[] {
  const result: GasFunctionMeta[] = [];
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

  // 1. features JSON 파싱
  try {
    const features = JSON.parse(featuresRaw || "[]");
    if (Array.isArray(features)) {
      for (const f of features) {
        if (typeof f === "object" && f && (f.functionName || f.name)) {
          const fn = f.functionName || f.name;
          if (!systemIgnore.has(fn)) {
            result.push({
              functionName: fn,
              title: f.title || f.label || fn,
              description: f.description || `${projectName} 자동화 스크립트`,
              example: f.example || `${projectName}의 ${f.title || fn} 실행해줘`,
              projectName,
              spreadsheetId,
              scriptId,
            });
          }
        }
      }
    }
  } catch {}

  // 2. scriptCode에서 정규식으로 함수 선언 추출
  if (scriptCode) {
    const funcRegex = /(?:\/\*\*([\s\S]*?)\*\/\s*)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = funcRegex.exec(scriptCode)) !== null) {
      const comment = match[1] || "";
      const fnName = match[2];

      if (systemIgnore.has(fnName)) continue;
      if (result.some((r) => r.functionName === fnName)) continue;

      let desc = "";
      if (comment) {
        const cleanLines = comment
          .split("\n")
          .map((l) => l.replace(/^\s*\*\s?/, "").trim())
          .filter(Boolean);
        desc = cleanLines.find((l) => !l.startsWith("@")) || "";
      }
      if (!desc) {
        desc = `${fnName} 스크립트 실행`;
      }

      result.push({
        functionName: fnName,
        title: desc.length > 20 ? desc.slice(0, 18) + "..." : desc,
        description: desc,
        example: `${projectName}의 ${desc} 실행해줘`,
        projectName,
        spreadsheetId,
        scriptId,
      });
    }
  }

  return result;
}

/**
 * GET /api/user/commands/capabilities
 * 사용자의 연동 대장 및 주입된 Apps Script를 분석하여
 * 말로 실행 가능한 추천 명령 칩(Chips) 및 함수 매니페스트 목록을 반환
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const queryEmail = req.nextUrl.searchParams.get("userEmail");

    const userEmail = (queryEmail && queryEmail.includes("@"))
      ? queryEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
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

    // 2. 유저의 스케줄/트리거 함수 조회
    const schedulesRes = await queryTable("sheetbot_schedules", {
      filters: { user_email: cleanEmail },
      limit: 30,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const userSchedules = (schedulesRes.rows || []).filter((s: any) => !s.deleted_at);

    // 3. 주입된 Apps Script 함수 메타데이터 추출
    const functions: GasFunctionMeta[] = [];

    for (const project of userProjects) {
      const extracted = extractGasFunctions(
        project.script_code || "",
        project.features || "[]",
        project.name || "구글 시트 대장",
        project.spreadsheet_id || "",
        project.script_id || ""
      );
      functions.push(...extracted);
    }

    // 스케줄 테이블에 등록된 함수들도 추가
    for (const sched of userSchedules) {
      if (sched.function_name && !functions.some((f) => f.functionName === sched.function_name)) {
        functions.push({
          functionName: sched.function_name,
          title: sched.name || sched.function_name,
          description: sched.description || `${sched.project_name || "프로젝트"} 스케줄 함수`,
          example: `${sched.name || sched.function_name} 실행해줘`,
          projectName: sched.project_name || "구글 시트",
          spreadsheetId: sched.spreadsheet_id || "",
          scriptId: "",
        });
      }
    }

    // 4. 모바일 앱 상단에 띄울 추천 명령 칩(Command Suggestions) 구성
    const suggestions: CommandSuggestion[] = [];

    // (A) 스크립트 실행 칩들
    for (const fn of functions.slice(0, 4)) {
      suggestions.push({
        id: `gas_${fn.functionName}`,
        type: "APPS_SCRIPT",
        label: `⚡ ${fn.title}`,
        command: fn.example,
        description: fn.description,
        functionName: fn.functionName,
        projectName: fn.projectName,
      });
    }

    // (B) Apps Script 없이 바로 가능한 지능형 시트 데이터 조회/집계(CRUD) 칩들
    suggestions.push({
      id: "query_customer_sales",
      type: "SHEET_QUERY",
      label: "🔍 고객별 매출 집계",
      command: "고객 대장에서 홍길동 매출 건수와 금액 집계해서 알려줘",
      description: "특정 고객의 매출 건수 및 합계 금액을 즉시 교차 분석하여 브리핑",
    });

    suggestions.push({
      id: "query_unpaid_list",
      type: "SHEET_QUERY",
      label: "📢 미수금 거래처 확인",
      command: "미수금 남아있는 거래처 목록과 금액 알려줘",
      description: "미수 잔액이 있는 거래처를 조회하여 음성 브리핑",
    });

    suggestions.push({
      id: "query_today_count",
      type: "SHEET_QUERY",
      label: "📊 오늘 등록 건수",
      command: "오늘 시트에 새로 등록된 내역 몇 건인지 알려줘",
      description: "오늘 날짜 기준으로 신규 추가된 행 개수 카운팅",
    });

    suggestions.push({
      id: "query_recent_sms",
      type: "SHEET_QUERY",
      label: "📱 최근 문자 확인",
      command: "최근 수신된 문자 대장에서 최신 3건 알려줘",
      description: "문자 수신 대장의 최근 3건 내역 요약 브리핑",
    });

    return NextResponse.json({
      success: true,
      userEmail: cleanEmail,
      totalProjects: userProjects.length,
      suggestions,
      functions,
    });
  } catch (err: any) {
    console.error("[CommandCapabilities] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
