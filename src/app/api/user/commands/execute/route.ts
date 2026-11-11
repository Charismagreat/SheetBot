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
import {
  resolveUserFtsPhoneNumber,
  createTaskItem,
} from "@/lib/task-hub-helper";

const FTS_INTERNAL_ENDPOINTS = [
  process.env.FILETOSHEET_INTERNAL_URL,
  "https://file2sheet.cloud",
  "https://tunneling-service.onrender.com/t/mcp-server-fxkud1-i01o2oa/p/FileToSheet",
  "http://127.0.0.1:4007",
  "http://127.0.0.1:3005",
  "http://localhost:4007",
  "http://localhost:3005",
].filter(Boolean) as string[];

export interface FtsSheetBundle {
  projectId: string;
  projectName: string;
  projectCategory: string;
  sheetId: string;
  sheetName: string;
  headers: string[];
  rows: Record<string, any>[];
}

export interface FtsMatchedRowDto {
  projectId: string;
  projectName: string;
  sheetName: string;
  rowNumber: number;
  rawRowIndex: number;
  serialNumber: string;
  approvalStatus: string;
  primaryTitle: string;
  primarySubtitle: string;
  timestampText: string;
  amountText: string;
  phoneNumber: string;
  audioFileName: string;
  matchedFields: Array<{ key: string; value: string }>;
  rowJson: Record<string, any>;
  headers: string[];
}

function parseMcpToolResultJson(rawBody: string): any {
  try {
    const outer = JSON.parse(rawBody);
    const resultObj = outer?.result || outer;
    const contentArr = resultObj?.content;
    if (Array.isArray(contentArr) && contentArr.length > 0) {
      const firstText = String(contentArr[0]?.text || "").trim();
      if (firstText) {
        return JSON.parse(firstText);
      }
    }
    if (resultObj && (Array.isArray(resultObj.rows) || resultObj.updated !== undefined)) {
      return resultObj;
    }
    return outer;
  } catch {
    return null;
  }
}

function extractCleanString(obj: Record<string, any>, key: string): string {
  const val = obj?.[key];
  if (val === null || val === undefined) return "";
  const str = String(val).trim();
  if (!str || str.toLowerCase() === "null" || str.toLowerCase() === "undefined") return "";
  return str;
}

function buildMatchedRowDto(
  bundle: FtsSheetBundle,
  rowObj: Record<string, any>,
  rawRowIndex: number
): FtsMatchedRowDto {
  const keys = bundle.headers.length > 0
    ? bundle.headers
    : Object.keys(rowObj).filter((k) => !k.startsWith("_"));

  const findFirstByKeywords = (kwList: string[]): string => {
    for (const kw of kwList) {
      for (const k of keys) {
        if (k.includes(kw)) {
          const v = extractCleanString(rowObj, k);
          if (v && v !== "-") return v;
        }
      }
    }
    return "";
  };

  const serialNumber = findFirstByKeywords(["일련번호", "번호"]) || String(rawRowIndex + 1);
  const approvalStatus = extractCleanString(rowObj, "_approvalStatus").toUpperCase() || "PENDING";
  const timestampText = findFirstByKeywords([
    "일시",
    "일자",
    "날짜",
    "등록일",
    "수신일",
    "통화일",
    "거래일",
    "발행일",
    "주문일",
  ]);
  const amountText = findFirstByKeywords(["합계금액", "결제금액", "금액", "공급가액", "단가", "잔액"]);

  let phoneNumber = findFirstByKeywords(["전화번호", "휴대폰", "휴대전화", "연락처", "발신번호", "수신번호"]);
  if (!phoneNumber) {
    // 전체 셀 텍스트에서 전화번호 정규식 추출
    for (const k of keys) {
      const v = extractCleanString(rowObj, k);
      const m = v.match(/(01[016789][-\s]?\d{3,4}[-\s]?\d{4}|0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}|1[568]\d{2}[-\s]?\d{4})/);
      if (m) {
        phoneNumber = m[1];
        break;
      }
    }
  }

  const audioFileName = findFirstByKeywords(["파일명"]).replace(/\s+/g, " ").trim();

  // 대표 제목 결정
  let primaryTitle = findFirstByKeywords([
    "할일제목",
    "메일제목",
    "회의제목",
    "포스트제목",
    "문서/질의제목",
    "제목",
    "상대방이름",
    "상대방",
    "채팅방/발신자",
    "발신자",
    "성함",
    "고객명",
    "고객/가맹점명",
    "상호",
    "기업명",
    "회사명",
    "이름",
    "품목",
  ]);

  // 대표 부제(요약 본문) 결정
  let primarySubtitle = findFirstByKeywords([
    "요약내용",
    "본문요약",
    "AI요약",
    "핵심요약",
    "법률검토요약",
    "메시지내용",
    "거래내용",
    "품목내역",
    "견적내용",
    "발송할문자내용",
    "발송문구",
    "자동회신내용",
    "주요결정사항",
    "상세정보",
    "품목",
    "메모",
    "비고",
  ]);

  if (!primaryTitle) {
    // 첫 번째 의미 있는 비어있지 않은 값
    for (const k of keys) {
      if (k === "일련번호" || k.includes("일시") || k.includes("일자")) continue;
      const v = extractCleanString(rowObj, k);
      if (v && v !== "-") {
        primaryTitle = v;
        break;
      }
    }
  }
  if (!primaryTitle) primaryTitle = `${bundle.sheetName} #${rawRowIndex + 1}`;

  if (primarySubtitle === primaryTitle) {
    primarySubtitle = "";
  }
  if (!primarySubtitle) {
    for (const k of keys) {
      if (k === "일련번호" || k.includes("일시") || k.includes("일자")) continue;
      const v = extractCleanString(rowObj, k);
      if (v && v !== "-" && v !== primaryTitle && v !== amountText) {
        primarySubtitle = `${k}: ${v}`;
        break;
      }
    }
  }

  // 카드 하단에 보여줄 주요 필드 Key-Value (최대 5개)
  const matchedFields: Array<{ key: string; value: string }> = [];
  for (const k of keys) {
    if (k.startsWith("_") || k === "일련번호") continue;
    const v = extractCleanString(rowObj, k);
    if (!v || v === "-") continue;
    if (v === primaryTitle || v === primarySubtitle || v === timestampText || v === amountText) continue;
    matchedFields.push({
      key: k,
      value: v.length > 60 ? v.slice(0, 58) + "…" : v,
    });
    if (matchedFields.length >= 5) break;
  }

  // 원본 행 JSON 정리 (_로 시작하는 내부 필드 외에 _rawRowIndex, _approvalStatus 유지)
  const cleanRowJson: Record<string, any> = {};
  for (const [k, v] of Object.entries(rowObj)) {
    cleanRowJson[k] = v;
  }
  cleanRowJson._rawRowIndex = rawRowIndex;

  return {
    projectId: bundle.projectId,
    projectName: bundle.projectName,
    sheetName: bundle.sheetName,
    rowNumber: rawRowIndex + 1,
    rawRowIndex,
    serialNumber,
    approvalStatus,
    primaryTitle: primaryTitle.length > 90 ? primaryTitle.slice(0, 88) + "…" : primaryTitle,
    primarySubtitle: primarySubtitle.length > 180 ? primarySubtitle.slice(0, 178) + "…" : primarySubtitle,
    timestampText,
    amountText,
    phoneNumber,
    audioFileName,
    matchedFields,
    rowJson: cleanRowJson,
    headers: keys,
  };
}

/**
 * 파투(FileToSheet) 내 사용자의 모든 프로젝트(user_projects)와 하위 모든 시트를 조회합니다.
 * - 1순위: /__user_data_proxy (user_projects 테이블 전체 스캔 -> 일반 프로젝트 + 시트봇 연동 장부 모두 포함)
 * - 2순위 폴백: /api/inbox/copilot
 */
async function fetchFtsCopilotContext(params: {
  phoneNumber?: string;
  projectId?: string;
  token?: string;
}): Promise<{
  success: boolean;
  projectId?: string;
  projectTitle?: string;
  projectsSummary: { projectId: string; projectName: string; category: string; sheetCount: number; totalRows: number }[];
  sheets: { id: string; name: string; projectId: string; projectName: string; headers: string[]; rowCount: number }[];
  sheetBundles: FtsSheetBundle[];
  sampleDataTexts: string[];
  contacts: { name: string; phone: string; company: string; sheetName: string; projectName?: string }[];
}> {
  const empty = {
    success: false,
    projectsSummary: [],
    sheets: [],
    sheetBundles: [],
    sampleDataTexts: [],
    contacts: [],
  };
  if (!params.phoneNumber && !params.projectId && !params.token) return empty;

  const cleanPhone = String(params.phoneNumber || "").replace(/[^0-9]/g, "");
  const reqProjectId = String(params.projectId || "").trim();

  // 1순위: /__user_data_proxy 를 통해 사용자의 파투 내 모든 프로젝트(user_projects) 조회
  if (cleanPhone || reqProjectId) {
    for (const baseUrl of FTS_INTERNAL_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5500);
        const mcpReq = {
          tool: "user_data_query",
          arguments: {
            tableName: "user_projects",
            limit: 100,
          },
        };
        const res = await fetch(`${baseUrl}/__user_data_proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mcpReq),
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timer);
        if (!res.ok) continue;

        const rawStr = await res.text();
        const dataJson = parseMcpToolResultJson(rawStr);
        const rowsArr = dataJson?.rows;
        if (!Array.isArray(rowsArr)) continue;

        const matchedProjects = rowsArr.filter((pObj: any) => {
          if (!pObj || typeof pObj !== "object") return false;
          if (pObj.deleted_at) return false;
          const cat = String(pObj.category || "").trim();
          if (cat === "trash_project") return false;
          const rowPhone = String(pObj.phone_number || "").replace(/[^0-9]/g, "");
          const rowId = String(pObj.id ?? "").trim();
          return (
            (cleanPhone.length >= 9 && rowPhone === cleanPhone) ||
            (reqProjectId.length > 0 && rowId === reqProjectId)
          );
        });

        if (matchedProjects.length === 0) continue;

        // 시트봇 연동 장부가 맨 앞에 오도록 정렬
        matchedProjects.sort((a: any, b: any) => {
          const aInbox = a.category === "sheetbot_inbox" || a.project_name === "시트봇 연동 장부" ? 1 : 0;
          const bInbox = b.category === "sheetbot_inbox" || b.project_name === "시트봇 연동 장부" ? 1 : 0;
          if (aInbox !== bInbox) return bInbox - aInbox;
          return (Number(a.id) || 0) - (Number(b.id) || 0);
        });

        const projectsSummary: { projectId: string; projectName: string; category: string; sheetCount: number; totalRows: number }[] = [];
        const sheets: { id: string; name: string; projectId: string; projectName: string; headers: string[]; rowCount: number }[] = [];
        const sheetBundles: FtsSheetBundle[] = [];
        const sampleDataTexts: string[] = [];
        const contacts: { name: string; phone: string; company: string; sheetName: string; projectName?: string }[] = [];

        for (const pObj of matchedProjects) {
          const pId = String(pObj.id ?? "").trim();
          const pName = String(pObj.project_name || `프로젝트 #${pId}`).trim();
          const pCat = String(pObj.category || "일반").trim();

          let sheetsArr: any[] = [];
          try {
            const parsed = typeof pObj.sheets_data === "string" ? JSON.parse(pObj.sheets_data || "[]") : pObj.sheets_data;
            if (Array.isArray(parsed)) sheetsArr = parsed;
          } catch {
            sheetsArr = [];
          }

          let pTotalRows = 0;
          let pSheetCount = 0;

          for (const sObj of sheetsArr) {
            if (!sObj || typeof sObj !== "object") continue;
            const sName = String(sObj.name || "").trim();
            if (!sName) continue;
            const sId = String(sObj.id || sName).trim();
            const sRows: Record<string, any>[] = Array.isArray(sObj.rows) ? sObj.rows : [];
            let headers: string[] = Array.isArray(sObj.headers)
              ? sObj.headers
                  .map((h: any) => String(h ?? "").trim())
                  .filter((h: string) => h && h.toLowerCase() !== "null" && !h.startsWith("_"))
              : [];

            if (headers.length === 0 && sRows.length > 0 && typeof sRows[0] === "object") {
              headers = Object.keys(sRows[0]).filter((k) => k && !k.startsWith("_"));
            }

            pTotalRows += sRows.length;
            pSheetCount++;

            sheets.push({
              id: sId,
              name: sName,
              projectId: pId,
              projectName: pName,
              headers,
              rowCount: sRows.length,
            });

            sheetBundles.push({
              projectId: pId,
              projectName: pName,
              projectCategory: pCat,
              sheetId: sId,
              sheetName: sName,
              headers,
              rows: sRows,
            });

            // 연락처 자동 수집 (문자 발송 역탐색용)
            for (const r of sRows) {
              if (!r || typeof r !== "object") continue;
              const nameVal =
                extractCleanString(r, "성함") ||
                extractCleanString(r, "이름") ||
                extractCleanString(r, "고객명") ||
                extractCleanString(r, "상대방이름") ||
                extractCleanString(r, "상대방") ||
                extractCleanString(r, "연락처이름");
              const phoneVal =
                extractCleanString(r, "휴대폰") ||
                extractCleanString(r, "휴대전화") ||
                extractCleanString(r, "전화번호") ||
                extractCleanString(r, "연락처") ||
                extractCleanString(r, "발신번호");
              const compVal =
                extractCleanString(r, "회사명") ||
                extractCleanString(r, "회사/상호") ||
                extractCleanString(r, "상호") ||
                extractCleanString(r, "기업명");
              if ((nameVal || compVal) && phoneVal && phoneVal !== "-") {
                contacts.push({
                  name: nameVal || compVal,
                  phone: phoneVal,
                  company: compVal,
                  sheetName: sName,
                  projectName: pName,
                });
              }
            }

            // 텍스트 샘플 생성 (최근 40행 기준)
            if (sRows.length > 0) {
              const recentSlice = sRows.slice(-40);
              const headerLine = headers.join(" | ");
              const rowLines = recentSlice.map((r, idx) => {
                const vals = headers.map((h) => extractCleanString(r, h) || "-");
                return `[#${sRows.length - recentSlice.length + idx + 1}] ${vals.join(" | ")}`;
              });
              sampleDataTexts.push(
                `[파투 프로젝트: ${pName} > 시트: ${sName} (총 ${sRows.length}건)]\n컬럼: ${headerLine}\n${rowLines.join("\n")}`
              );
            }
          }

          projectsSummary.push({
            projectId: pId,
            projectName: pName,
            category: pCat,
            sheetCount: pSheetCount,
            totalRows: pTotalRows,
          });
        }

        const primaryProj = matchedProjects[0];
        return {
          success: true,
          projectId: String(primaryProj.id ?? ""),
          projectTitle: String(primaryProj.project_name || "시트봇 연동 장부"),
          projectsSummary,
          sheets,
          sheetBundles,
          sampleDataTexts,
          contacts,
        };
      } catch {
        // try next endpoint
      }
    }
  }

  // 2순위 폴백: 기존 /api/inbox/copilot 호출
  const qs = new URLSearchParams();
  if (params.phoneNumber) qs.set("phoneNumber", params.phoneNumber);
  if (params.projectId) qs.set("projectId", params.projectId);
  if (params.token) qs.set("token", params.token);

  for (const baseUrl of FTS_INTERNAL_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${baseUrl}/api/inbox/copilot?${qs.toString()}`, {
        method: "GET",
        headers: {
          ...(params.phoneNumber ? { "x-user-phone": params.phoneNumber } : {}),
          ...(params.projectId ? { "x-fts-project-id": params.projectId } : {}),
        },
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.success) {
        const pId = String(data.projectId || params.projectId || "");
        const pTitle = String(data.projectTitle || "시트봇 연동 장부");
        const rawSheets = Array.isArray(data.sheets) ? data.sheets : [];
        return {
          success: true,
          projectId: pId,
          projectTitle: pTitle,
          projectsSummary: [
            {
              projectId: pId,
              projectName: pTitle,
              category: "sheetbot_inbox",
              sheetCount: rawSheets.length,
              totalRows: rawSheets.reduce((acc: number, s: any) => acc + (Number(s.rowCount) || 0), 0),
            },
          ],
          sheets: rawSheets.map((s: any) => ({
            id: String(s.id || s.name || ""),
            name: String(s.name || ""),
            projectId: pId,
            projectName: pTitle,
            headers: Array.isArray(s.headers) ? s.headers : [],
            rowCount: Number(s.rowCount) || 0,
          })),
          sheetBundles: [],
          sampleDataTexts: Array.isArray(data.sampleDataTexts) ? data.sampleDataTexts : [],
          contacts: Array.isArray(data.contacts) ? data.contacts : [],
        };
      }
    } catch {
      // try next endpoint
    }
  }
  return empty;
}

async function executeFtsCopilotWrite(payload: {
  phoneNumber?: string;
  projectId?: string;
  token?: string;
  operation: "ADD_ROW" | "UPDATE_ROW";
  sheetName: string;
  rowValues?: Record<string, any>;
  filterKeyword?: string;
  updates?: Record<string, any>;
}): Promise<any> {
  for (const baseUrl of FTS_INTERNAL_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${baseUrl}/api/inbox/copilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.success) return data;
    } catch {
      // try next endpoint
    }
  }
  return { success: false };
}

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
    const headerPhone = req.headers.get("x-user-phone");
    const headerFtsProjectId = req.headers.get("x-fts-project-id");
    const body = await req.json().catch(() => ({}));

    const bodyEmail = body.userEmail as string | undefined;
    const bodyPhone = (body.phoneNumber || headerPhone || "") as string;
    const ftsProjectId = (body.projectId || headerFtsProjectId || "") as string;
    const ftsToken = (body.token || "") as string;
    const command = (body.command as string | undefined)?.trim();
    const targetSpreadsheetId = body.spreadsheetId as string | undefined;
    const deviceId = (body.deviceId as string | undefined)?.trim() || "SheetBot Agent";

    let cleanPhone = bodyPhone.replace(/[^0-9]/g, "");
    const rawEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    const userEmail = rawEmail || (cleanPhone ? `${cleanPhone}@fts.local` : (ftsProjectId ? `${ftsProjectId}@fts.local` : ""));

    if (!userEmail && !cleanPhone && !ftsProjectId && !ftsToken) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!command) {
      return NextResponse.json({ success: false, error: "실행할 자연어 명령을 입력해 주세요." }, { status: 400 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    if (!cleanPhone && cleanEmail && !cleanEmail.endsWith("@fts.local")) {
      cleanPhone = (await resolveUserFtsPhoneNumber(cleanEmail)) || "";
    }

    // 1. 유저의 연동된 구글 시트 프로젝트/스케줄 목록 및 파투(FileToSheet) 시트 컨텍스트 병렬 조회
    const [projectsRes, schedulesRes, ftsContext] = await Promise.all([
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
      fetchFtsCopilotContext({
        phoneNumber: cleanPhone || undefined,
        projectId: ftsProjectId || undefined,
        token: ftsToken || undefined,
      }),
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

    const ftsProjectsSummary = ftsContext.projectsSummary || [];
    const ftsSheetsSummary = (ftsContext.sheets || []).map((s) => ({
      projectId: s.projectId,
      projectName: s.projectName,
      sheetName: s.name,
      headers: s.headers,
      rowCount: s.rowCount,
    }));

    // 3. Gemini 3.8 Flash 자연어 Intent 분석 및 실행 계획 수립
    const planningPrompt = `당신은 파투(FileToSheet) 전 프로젝트·전 시트 자연어 통합 검색 및 구글 스프레드시트/스마트폰 자동화 최고 AI 코파일럿입니다.
사용자(${cleanEmail})가 스마트폰에서 다음 자연어 질문/명령을 입력했습니다:
"${command}"

[1-1] 현재 연동된 파투(FileToSheet) 전체 프로젝트 목록 (${ftsProjectsSummary.length}개):
${JSON.stringify(ftsProjectsSummary, null, 2)}

[1-2] 현재 연동된 파투(FileToSheet) 전체 시트 대장 목록 (${ftsSheetsSummary.length}개):
${JSON.stringify(ftsSheetsSummary, null, 2)}

[1-3] 현재 연동된 구글 시트 대장 목록:
${JSON.stringify(projectsSummary, null, 2)}

[2] 구글 시트 대장에 실제 주입되어 실행 가능한 Apps Script 함수 목록 (Ground Truth):
${JSON.stringify(availableGasFunctions, null, 2)}

위 입력을 분석하여 최적의 작업을 판별하고 다음 순수 JSON으로만 응답하세요:
{
  "actionType": "SHEET_QUERY" | "SHEET_WRITE" | "SMS_DISPATCH" | "APPS_SCRIPT_RUN" | "APPS_SCRIPT_NOT_FOUND" | "GENERAL_ASSIST",
  "targetName": "고객명 또는 대상자 (있을 경우)",
  "targetPhone": "전화번호 (있을 경우)",
  "messageText": "발송할 문자 내용 또는 전달할 내용",
  "scriptId": "실행할 Apps Script scriptId (APPS_SCRIPT_RUN인 경우)",
  "functionName": "실행할 Apps Script 실제 함수명 (availableGasFunctions에 실제로 존재하는 이름만 지정할 것)",
  "functionParams": [],
  "queryKeywords": ["파투 시트 행 데이터에서 검색할 핵심 단어들 (조사/어미 제외, 유의어 포함. 예: ['국민건강보험공단', '건강보험', '분납'], ['032디자인', '이항식'], ['영수증', '식대'])"],
  "queryTargetEntity": "핵심 검색 대상 인물/기관/상호명 (있을 경우, 예: '국민건강보험공단', '이항식', '홍길동', 없으면 '')",
  "queryTargetProjects": ["특정 파투 프로젝트명을 지칭한 경우 해당 프로젝트명 배열 (전체 검색이면 [])"],
  "queryTargetSheets": ["특정 시트 성격이나 시트명을 지칭한 경우 [1-2]의 sheetName 중 매칭되는 시트명 배열 (예: 통화/녹음 질문 시 ['통화녹음대장'], 문자 질문 시 ['문자송수신대장'], 카톡 질문 시 ['카카오톡대화대장'], 이메일 질문 시 ['이메일수신대장'], 전체 시트 통합 검색이면 [])"],
  "queryApprovalStatus": "결재 상태 조건이 명시된 경우 'PENDING'(대기/미결재) | 'APPROVED'(승인) | 'HELD'(보류) | 'REJECTED'(반려), 없으면 ''",
  "queryDateHint": "날짜/기간 조건이 있는 경우 'TODAY'(오늘) | 'YESTERDAY'(어제) | 'THIS_MONTH'(이번 달) | 'YYYY-MM' | 'MM/DD', 없으면 ''",
  "queryMetric": "집계/확인할 항목 요약 (예: '관련 내역 전체 검색 및 요약', '매출/지출 건수 및 합계 금액', '연락처 및 통화 내용')",
  "writeOperation": "ADD_ROW 또는 UPDATE_ROW (SHEET_WRITE인 경우)",
  "targetSheetName": "기록/수정할 대상 시트명 (SHEET_WRITE인 경우, 예: '통합할일대장', '영수증대장', '간편주문대장', '명함관리', '견적서발행대장')",
  "rowValues": {
    "컬럼명": "기록할 값 (SHEET_WRITE + ADD_ROW인 경우)"
  },
  "filterKeyword": "수정할 행을 찾을 검색어 (SHEET_WRITE + UPDATE_ROW인 경우)",
  "rowUpdates": {
    "상태": "변경할 상태값 (SHEET_WRITE + UPDATE_ROW인 경우)"
  },
  "explanation": "작업 수행 내용 요약",
  "spokenResult": "스마트폰 TTS 음성으로 사용자에게 브리핑할 1~2문장의 친절한 음성 멘트"
}

* 판별 주의사항:
- 파투 내 프로젝트/시트 데이터 검색, 특정 키워드/고객/기관 내역 찾기, 건수/금액 집계, 연락처/통화/문자/카톡/이메일/영수증/할일 조회, 결재 대기건 조회 등 모든 검색·질의는 반드시 "actionType": "SHEET_QUERY"로 판별하세요.
- queryKeywords에는 '찾아줘', '보여줘', '알려줘', '내역', '관련', '시트', '파투' 같은 일반 서술어를 넣지 말고, 실제 셀 값과 매칭될 명사/키워드만 추출하세요.
- 새로운 할일 등록("내일 3시 미팅 할일 추가해줘"), 지출/영수증 수기 기록, 또는 기존 항목의 상태 변경은 "actionType": "SHEET_WRITE"로 판별하세요.
- 누군가에게 문자 발송("홍길동에게 문자 보내줘")을 요청한 경우 "actionType": "SMS_DISPATCH"로 판별하세요.`;

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
        actionType: "SHEET_QUERY",
        queryKeywords: command
          .replace(/(찾아줘|보여줘|알려줘|검색해줘|검색|조회해줘|조회|내역|관련|에서|파투|시트)/g, " ")
          .split(/\s+/)
          .map((w) => w.trim())
          .filter((w) => w.length >= 2),
        explanation: rawText,
        spokenResult: "명령을 분석하여 처리를 완료했습니다.",
      };
    }

    let executionDetails: any = {};
    let isSuccess = true;
    let matchedRowsResult: FtsMatchedRowDto[] = [];
    let matchedProjectsCount = 0;
    let matchedSheetsCount = 0;
    let totalMatchedCount = 0;
    let resolvedQueryKeywords: string[] = [];

    // 4. 의도별 실제 작업 실행
    if (plan.actionType === "APPS_SCRIPT_NOT_FOUND" || plan.actionType === "GENERAL_ASSIST") {
      // 파투 시트 데이터가 존재할 경우 SHEET_QUERY로 자동 전환하여 통합 검색 수행
      if ((ftsContext.sheetBundles && ftsContext.sheetBundles.length > 0) || ftsContext.sampleDataTexts.length > 0) {
        plan.actionType = "SHEET_QUERY";
      } else if (plan.actionType === "APPS_SCRIPT_NOT_FOUND") {
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
      }
    }

    if (plan.actionType === "APPS_SCRIPT_RUN") {
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
      // (3) 파투(FileToSheet) 전 프로젝트·전 시트 자연어 통합 검색 + 실시간 AI 브리핑/집계
      try {
        const stopWords = new Set([
          "파투", "파일투시트", "시트", "프로젝트", "대장", "장부", "내역", "목록", "리스트",
          "찾아줘", "보여줘", "알려줘", "검색해줘", "검색", "조회해줘", "조회", "확인해줘", "확인",
          "전체", "모두", "다", "관련", "최근", "최신", "오늘", "어제", "이번달", "이번", "달",
          "건수", "금액", "합계", "얼마", "몇건", "몇",
        ]);

        const rawKeywords: string[] = Array.isArray(plan.queryKeywords)
          ? plan.queryKeywords.map((k: any) => String(k || "").trim()).filter((k: string) => k && !stopWords.has(k))
          : [];
        const entity = String(plan.queryTargetEntity || "").trim();
        if (entity && !stopWords.has(entity) && !rawKeywords.includes(entity)) {
          rawKeywords.unshift(entity);
        }
        resolvedQueryKeywords = rawKeywords;

        const targetProjects: string[] = Array.isArray(plan.queryTargetProjects)
          ? plan.queryTargetProjects.map((p: any) => String(p || "").trim()).filter(Boolean)
          : [];
        const targetSheets: string[] = Array.isArray(plan.queryTargetSheets)
          ? plan.queryTargetSheets.map((s: any) => String(s || "").trim()).filter(Boolean)
          : [];
        const approvalFilter = String(plan.queryApprovalStatus || "").trim().toUpperCase();
        const dateHint = String(plan.queryDateHint || "").trim().toUpperCase();

        // KST 날짜 문자열 계산
        const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const yyyy = nowKst.getUTCFullYear();
        const mm = String(nowKst.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(nowKst.getUTCDate()).padStart(2, "0");
        const todayIso = `${yyyy}-${mm}-${dd}`;
        const todayShort = `${mm}/${dd}`;
        const thisMonthIso = `${yyyy}-${mm}`;

        const yestKst = new Date(Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
        const yMm = String(yestKst.getUTCMonth() + 1).padStart(2, "0");
        const yDd = String(yestKst.getUTCDate()).padStart(2, "0");
        const yesterdayIso = `${yestKst.getUTCFullYear()}-${yMm}-${yDd}`;
        const yesterdayShort = `${yMm}/${yDd}`;

        interface ScoredRowCandidate {
          score: number;
          bundle: FtsSheetBundle;
          rowObj: Record<string, any>;
          rawRowIndex: number;
        }

        const scoredCandidates: ScoredRowCandidate[] = [];
        const hasSpecificKeyword = rawKeywords.length > 0;

        for (const bundle of ftsContext.sheetBundles || []) {
          const projMatches =
            targetProjects.length === 0 ||
            targetProjects.some(
              (tp) =>
                bundle.projectName.toLowerCase().includes(tp.toLowerCase()) ||
                tp.toLowerCase().includes(bundle.projectName.toLowerCase())
            );
          const sheetMatches =
            targetSheets.length === 0 ||
            targetSheets.some(
              (ts) =>
                bundle.sheetName.toLowerCase().includes(ts.toLowerCase()) ||
                ts.toLowerCase().includes(bundle.sheetName.toLowerCase())
            );

          for (let rIdx = 0; rIdx < bundle.rows.length; rIdx++) {
            const rowObj = bundle.rows[rIdx];
            if (!rowObj || typeof rowObj !== "object") continue;

            const rowApproval = extractCleanString(rowObj, "_approvalStatus").toUpperCase() || "PENDING";
            if (approvalFilter && ["PENDING", "APPROVED", "HELD", "REJECTED"].includes(approvalFilter)) {
              if (rowApproval !== approvalFilter) continue;
            }

            // 셀 전체 문자열 결합
            const cellValues: string[] = [];
            for (const [k, v] of Object.entries(rowObj)) {
              if (k.startsWith("_")) continue;
              const s = String(v ?? "").trim();
              if (s && s !== "-" && s.toLowerCase() !== "null") {
                cellValues.push(s);
              }
            }
            if (cellValues.length === 0) continue;
            const joinedRowLower = cellValues.join(" ").toLowerCase();

            // 날짜 힌트 체크
            let dateMatched = true;
            if (dateHint === "TODAY") {
              dateMatched = joinedRowLower.includes(todayIso) || joinedRowLower.includes(todayShort);
            } else if (dateHint === "YESTERDAY") {
              dateMatched = joinedRowLower.includes(yesterdayIso) || joinedRowLower.includes(yesterdayShort);
            } else if (dateHint === "THIS_MONTH") {
              dateMatched = joinedRowLower.includes(thisMonthIso) || joinedRowLower.includes(`${mm}/`);
            } else if (dateHint.length >= 4) {
              dateMatched = joinedRowLower.includes(dateHint.toLowerCase());
            }

            let score = 0;

            if (entity && joinedRowLower.includes(entity.toLowerCase())) {
              score += 12;
            }

            let matchedKwCount = 0;
            for (const kw of rawKeywords) {
              const kwLower = kw.toLowerCase();
              if (joinedRowLower.includes(kwLower)) {
                score += 6;
                matchedKwCount++;
              } else if (
                bundle.sheetName.toLowerCase().includes(kwLower) ||
                bundle.projectName.toLowerCase().includes(kwLower)
              ) {
                score += 2;
              }
            }

            if (targetProjects.length > 0 && projMatches) score += 4;
            if (targetSheets.length > 0 && sheetMatches) score += 5;
            if (approvalFilter && rowApproval === approvalFilter) score += 5;
            if (dateHint && dateMatched) score += 5;

            if (hasSpecificKeyword) {
              // 특정 키워드가 있을 때는 셀 본문에 최소 1개라도 매칭되거나, 시트/프로젝트명이 직접 매칭된 경우만 채택
              if (matchedKwCount === 0 && !(targetSheets.length > 0 && sheetMatches && rawKeywords.length <= 1)) {
                continue;
              }
              if (dateHint && !dateMatched) continue;
            } else {
              // 특정 키워드가 없는 광범위 조회(예: "오늘 내역", "미결재 내역", "통화녹음 보여줘", "전체 최근 내역")
              if (targetProjects.length > 0 && !projMatches) continue;
              if (targetSheets.length > 0 && !sheetMatches) continue;
              if (dateHint && !dateMatched) continue;
              score += 1;
            }

            scoredCandidates.push({
              score,
              bundle,
              rowObj,
              rawRowIndex: rIdx,
            });
          }
        }

        // 키워드 매칭 결과가 0건이고 시트/프로젝트 필터만 있었던 경우, 또는 토큰 부분 매칭 재시도
        if (scoredCandidates.length === 0 && rawKeywords.length > 0) {
          const subTokens = rawKeywords
            .flatMap((k) => k.split(/[\s,·/()]+/))
            .map((t) => t.trim())
            .filter((t) => t.length >= 2 && !stopWords.has(t));

          if (subTokens.length > 0) {
            for (const bundle of ftsContext.sheetBundles || []) {
              for (let rIdx = 0; rIdx < bundle.rows.length; rIdx++) {
                const rowObj = bundle.rows[rIdx];
                if (!rowObj || typeof rowObj !== "object") continue;
                const joinedLower = Object.entries(rowObj)
                  .filter(([k]) => !k.startsWith("_"))
                  .map(([, v]) => String(v ?? ""))
                  .join(" ")
                  .toLowerCase();
                let subScore = 0;
                for (const st of subTokens) {
                  if (joinedLower.includes(st.toLowerCase())) subScore += 4;
                }
                if (subScore > 0) {
                  scoredCandidates.push({
                    score: subScore,
                    bundle,
                    rowObj,
                    rawRowIndex: rIdx,
                  });
                }
              }
            }
          }
        }

        // 점수 내림차순 -> 최신 행(rawRowIndex 큰 순) 정렬
        scoredCandidates.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return b.rawRowIndex - a.rawRowIndex;
        });

        totalMatchedCount = scoredCandidates.length;
        const uniqueProjIds = new Set(scoredCandidates.map((c) => c.bundle.projectId));
        const uniqueSheetKeys = new Set(scoredCandidates.map((c) => `${c.bundle.projectId}::${c.bundle.sheetName}`));
        matchedProjectsCount = uniqueProjIds.size;
        matchedSheetsCount = uniqueSheetKeys.size;

        // 상위 25건을 모바일 가독성 카드용 DTO로 변환
        matchedRowsResult = scoredCandidates.slice(0, 25).map((c) =>
          buildMatchedRowDto(c.bundle, c.rowObj, c.rawRowIndex)
        );

        const sampleDataTexts: string[] = [];
        const queriedSheetNames: string[] = [];

        // 매칭된 행들을 시트별로 묶어 AI 컨텍스트 최우선 주입
        if (scoredCandidates.length > 0) {
          const groupedBySheet = new Map<string, ScoredRowCandidate[]>();
          for (const c of scoredCandidates.slice(0, 45)) {
            const key = `[파투 프로젝트: ${c.bundle.projectName} > 시트: ${c.bundle.sheetName}]`;
            if (!groupedBySheet.has(key)) groupedBySheet.set(key, []);
            groupedBySheet.get(key)!.push(c);
          }

          for (const [sheetLabel, list] of groupedBySheet.entries()) {
            const headers = list[0].bundle.headers;
            const lines = list.map((item) => {
              const vals = headers.map((h) => `${h}: ${extractCleanString(item.rowObj, h) || "-"}`);
              return `• [행 #${item.rawRowIndex + 1}] ${vals.join(" | ")}`;
            });
            sampleDataTexts.push(`${sheetLabel} (검색 매칭 ${list.length}건)\n${lines.join("\n")}`);
            queriedSheetNames.push(`${list[0].bundle.projectName} > ${list[0].bundle.sheetName}`);
          }
        } else if (ftsContext.sampleDataTexts && ftsContext.sampleDataTexts.length > 0) {
          // 직접 매칭 행이 없을 때는 시트 스코어링 기반 샘플 컨텍스트 제공
          const scoredFtsTexts = ftsContext.sampleDataTexts.map((text, idx) => {
            let score = 0;
            for (const kw of rawKeywords) {
              if (text.toLowerCase().includes(kw.toLowerCase())) score += 3;
            }
            if (entity && text.toLowerCase().includes(entity.toLowerCase())) score += 5;
            const sInfo = ftsContext.sheets[idx];
            return {
              text,
              score,
              name: sInfo ? `${sInfo.projectName} > ${sInfo.name}` : `파투시트#${idx + 1}`,
            };
          });
          scoredFtsTexts.sort((a, b) => b.score - a.score);

          for (const item of scoredFtsTexts.slice(0, 6)) {
            sampleDataTexts.push(item.text);
            queriedSheetNames.push(`[파투] ${item.name}`);
          }
        }

        // 3-B. Google Sheets 데이터 조회 (연동된 경우 보조 병합)
        const candidateSheets: { id: string; name: string }[] = [];
        for (const p of userProjects) {
          if (p.spreadsheet_id) {
            candidateSheets.push({ id: p.spreadsheet_id, name: p.name });
          }
        }

        for (const sheet of candidateSheets.slice(0, 2)) {
          const rangeRes = await callSheetsTool("sheets_get_range", {
            spreadsheetId: sheet.id,
            range: "A1:Z50",
            preferOAuth: true,
          }).catch(() => ({ values: [] }));

          const values = rangeRes?.values || [];
          if (values.length > 0) {
            const tableStr = values.map((r: any[]) => r.join("\t")).join("\n");
            sampleDataTexts.push(`[구글시트명: ${sheet.name} (ID: ${sheet.id})]\n${tableStr}`);
            queriedSheetNames.push(sheet.name);
          }
        }

        if (sampleDataTexts.length > 0) {
          const queryPrompt = `당신은 파투(FileToSheet) 전 프로젝트·전 시트 통합 자연어 검색 및 데이터 분석 AI입니다.
사용자의 검색/질문:
"${command}"

[검색 요약 통계]
- 파투 전체 프로젝트 수: ${ftsProjectsSummary.length}개 (전체 시트 ${ftsSheetsSummary.length}개)
- 직접 매칭된 데이터: ${matchedProjectsCount}개 프로젝트 · ${matchedSheetsCount}개 시트 · 총 ${totalMatchedCount}건

[매칭된 시트 데이터 상세 내역]
${sampleDataTexts.join("\n\n====================\n\n")}

위 데이터를 바탕으로 사용자의 질문에 가장 가독성 높고 정확하게 답변하세요:
1. 어떤 프로젝트와 시트에서 몇 건이 검색되었는지, 합계 금액이나 핵심 내용(일시, 상대방/상호, 주요 요지, 전화번호 등)이 무엇인지 일목요연하게 요약하세요.
2. 모바일 화면에서 아래에 매칭된 카드 리스트(${matchedRowsResult.length}건)가 함께 표시되므로, explanation에는 전체 결론과 핵심 요약 브리핑을 깔끔하게 작성하세요.
3. 다음 순수 JSON 형식으로만 응답하세요:
{
  "explanation": "사용자가 한눈에 파악할 수 있는 명확한 검색/분석 요약 (예: '파투 [시트봇 연동 장부] 내 통화녹음대장(2건), 문자송수신대장(1건), 카카오톡대화대장(1건)에서 국민건강보험공단 관련 내역 총 4건을 찾았습니다. • 핵심 내용: 10개월 분납 신청(내일까지 88,000원 선납) 및 가상계좌 발송 안내 • 담당 번호: 02-2186-4164')",
  "spokenResult": "스마트폰 TTS 음성으로 브리핑할 1~2문장의 간결하고 자연스러운 한국어 멘트"
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
            sheetsQueried: queriedSheetNames,
            matchedProjectsCount,
            matchedSheetsCount,
            totalMatchedCount,
            queryKeywords: resolvedQueryKeywords,
            matchedRows: matchedRowsResult,
            status: "SUCCESS",
          };
        } else {
          plan.explanation = "연동된 파투(FileToSheet) 프로젝트 및 시트에서 일치하는 내역을 찾지 못했습니다. 다른 검색어로 다시 시도해 보세요.";
          plan.spokenResult = "연동된 파투 시트에서 일치하는 데이터를 찾지 못했습니다.";
          executionDetails = {
            type: "SHEET_QUERY",
            matchedProjectsCount: 0,
            matchedSheetsCount: 0,
            totalMatchedCount: 0,
            queryKeywords: resolvedQueryKeywords,
            matchedRows: [],
            status: "NO_DATA",
          };
        }
      } catch (qErr: any) {
        console.warn("[CommandExecute] Sheet query error:", qErr.message);
        plan.explanation = `시트 데이터 조회 중 오류가 발생했습니다: ${qErr.message}`;
        plan.spokenResult = "시트 데이터 조회 중 문제가 발생했습니다.";
        isSuccess = false;
      }
    } else if (plan.actionType === "SHEET_WRITE") {
      // (4) 파투(FileToSheet) 시트 및 할일 허브에 자연어 행 추가(ADD_ROW) / 상태 수정(UPDATE_ROW)
      const operation: "ADD_ROW" | "UPDATE_ROW" =
        plan.writeOperation === "UPDATE_ROW" ? "UPDATE_ROW" : "ADD_ROW";
      const targetSheetName = String(plan.targetSheetName || "통합할일대장").trim();
      const rowValues = plan.rowValues && typeof plan.rowValues === "object" ? plan.rowValues : {};
      const rowUpdates = plan.rowUpdates && typeof plan.rowUpdates === "object" ? plan.rowUpdates : {};
      const filterKeyword = String(plan.filterKeyword || plan.targetName || "").trim();

      const isTaskTarget =
        targetSheetName.includes("할일") ||
        command.includes("할일") ||
        command.includes("할 일") ||
        Boolean(rowValues["할일내용"]);

      let ftsWriteRes: any = { success: false };

      if (operation === "ADD_ROW" && isTaskTarget) {
        // 할일 추가인 경우 createTaskItem을 호출하여 sheetbot_tasks + 파투 [통합할일대장] 동시 기록
        const taskTitle = String(
          rowValues["할일내용"] ||
            rowValues["내용"] ||
            rowValues["제목"] ||
            plan.messageText ||
            command
        ).trim();
        const dueDate = String(rowValues["마감기한"] || rowValues["기한"] || "").trim();
        const assignee = String(rowValues["담당자"] || plan.targetName || "").trim();

        const createdTask = await createTaskItem({
          userEmail: cleanEmail,
          title: taskTitle,
          description: `[AI 비서 음성/자연어 등록] "${command}"`,
          sourceType: "MANUAL",
          priority: "MEDIUM",
          dueDate: dueDate || undefined,
          assignee: assignee || undefined,
          phoneNumber: cleanPhone || undefined,
        });

        plan.explanation =
          plan.explanation ||
          `파투 [통합할일대장] 및 할일 허브에 '${taskTitle}' 할 일을 등록했습니다.${dueDate ? ` (기한: ${dueDate})` : ""}`;
        plan.spokenResult =
          plan.spokenResult ||
          `통합할일대장에 ${taskTitle} 일정을 추가했습니다.`;

        executionDetails = {
          type: "SHEET_WRITE",
          operation: "ADD_ROW",
          sheetName: "통합할일대장",
          taskId: createdTask?.id,
          status: "SUCCESS",
        };
      } else {
        // 파투 시트 직접 추가/수정 호출
        ftsWriteRes = await executeFtsCopilotWrite({
          phoneNumber: cleanPhone || undefined,
          projectId: ftsProjectId || ftsContext.projectId || undefined,
          token: ftsToken || undefined,
          operation,
          sheetName: targetSheetName,
          rowValues,
          filterKeyword,
          updates: Object.keys(rowUpdates).length > 0 ? rowUpdates : rowValues,
        });

        if (ftsWriteRes && ftsWriteRes.success) {
          plan.explanation = ftsWriteRes.message || plan.explanation || `파투 [${ftsWriteRes.sheetName || targetSheetName}] 시트에 반영했습니다.`;
          plan.spokenResult =
            plan.spokenResult ||
            (operation === "UPDATE_ROW"
              ? `파투 ${ftsWriteRes.sheetName || targetSheetName} 시트의 상태를 변경했습니다.`
              : `파투 ${ftsWriteRes.sheetName || targetSheetName} 시트에 내역을 추가했습니다.`);
          executionDetails = {
            type: "SHEET_WRITE",
            operation,
            sheetName: ftsWriteRes.sheetName || targetSheetName,
            result: ftsWriteRes,
            status: "SUCCESS",
          };
        } else {
          plan.explanation = ftsWriteRes?.error || "파투 시트에 데이터를 기록하지 못했습니다. 파투 연동 상태를 확인해 주세요.";
          plan.spokenResult = "시트 기록 중 문제가 발생했습니다.";
          executionDetails = {
            type: "SHEET_WRITE",
            operation,
            sheetName: targetSheetName,
            status: "FAILED",
          };
          isSuccess = false;
        }
      }
    } else if (plan.actionType === "SMS_DISPATCH") {
      // (5) 문자 발송 및 파투 시트(명함관리/연락처대장/간편주문대장) + 구글 시트 고객 번호 역탐색
      let recipientPhone = plan.targetPhone || "";
      let matchedContactSource = "";

      // 5-A. 파투(FileToSheet) 시트 연락처에서 최우선 탐색
      if (!recipientPhone && plan.targetName && ftsContext.contacts && ftsContext.contacts.length > 0) {
        const target = String(plan.targetName).trim();
        const found = ftsContext.contacts.find(
          (c) =>
            (c.name && (c.name.includes(target) || target.includes(c.name))) ||
            (c.company && (c.company.includes(target) || target.includes(c.company)))
        );
        if (found && found.phone) {
          recipientPhone = found.phone;
          matchedContactSource = `파투 [${found.sheetName}]`;
        }
      }

      // 5-B. Google Drive 명함 시트에서 보조 탐색
      if (!recipientPhone && plan.targetName && cleanEmail && !cleanEmail.endsWith("@fts.local")) {
        try {
          const cardSearch = await listDriveFiles(
            {
              query: `mimeType = 'application/vnd.google-apps.spreadsheet' and name contains '명함' and trashed = false`,
            },
            { preferOAuth: true }
          ).catch(() => ({ files: [] }));

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
                matchedContactSource = `구글시트 [${cardSheets[0].name}]`;
                break;
              }
            }
          }
        } catch (e: any) {
          console.warn("[CommandExecute] Phone lookup warning:", e.message);
        }
      }

      if (!recipientPhone) recipientPhone = "self";

      const msgToSend =
        plan.messageText ||
        `[SheetBot 알림] ${plan.targetName || "고객"}님, 요청하신 사항이 접수되었습니다.`;
      const smsRes = await sendPhoneSms({
        deviceId,
        phoneNumber: recipientPhone,
        message: msgToSend,
      }).catch((e: any) => {
        return { success: false, error: e.message };
      });

      if (matchedContactSource && recipientPhone !== "self") {
        plan.explanation = `${matchedContactSource}에서 ${plan.targetName}님의 연락처(${recipientPhone})를 찾아 문자를 발송했습니다.\n내용: "${msgToSend}"`;
      }

      executionDetails = {
        type: "SMS_DISPATCH",
        recipient: recipientPhone,
        targetName: plan.targetName,
        contactSource: matchedContactSource || undefined,
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

    const targetSheetId = targetSpreadsheetId || userProjects[0]?.spreadsheet_id || "";
    const canPromote =
      isSuccess &&
      Boolean(targetSheetId) &&
      plan.actionType !== "APPS_SCRIPT_NOT_FOUND" &&
      plan.actionType !== "APPS_SCRIPT_RUN";
    const suggestedFunctionTitle =
      plan.suggestedFunctionTitle || (command.length > 15 ? command.slice(0, 12) + "..." : command);

    return NextResponse.json({
      success: isSuccess,
      command,
      actionType: plan.actionType,
      explanation: plan.explanation || "명령이 성공적으로 처리되었습니다.",
      spokenResult: plan.spokenResult || "요청하신 시트 명령이 완료되었습니다.",
      canPromote,
      suggestedFunctionTitle,
      spreadsheetId: targetSheetId,
      matchedProjectsCount,
      matchedSheetsCount,
      totalMatchedCount,
      queryKeywords: resolvedQueryKeywords,
      matchedRows: matchedRowsResult,
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
