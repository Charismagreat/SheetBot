import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { getWorkspaceCallOptionsForEmail } from "@/lib/auth";
import {
  callSheetsTool,
  insertRows,
  queryTable,
  getServerEgdeskApiUrl,
} from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { getKoreanTimeString } from "@/lib/date-utils";
import { resolveUserFtsPhoneNumber } from "@/lib/task-hub-helper";

export type CopilotActionCategory =
  | "SHEET_QUERY"
  | "SHEET_WRITE"
  | "DRIVE_FILE_ACTION"
  | "EMAIL_DISPATCH"
  | "SMS_DISPATCH"
  | "APPS_SCRIPT_RUN"
  | "COMMAND_PROMOTE"
  | "GENERAL_ASSIST";

export interface AiCopilotActivityMeta {
  timestamp: string;
  command: string;
  actionType: CopilotActionCategory | string;
  domainTag: string;
  targetSheet?: string;
  targetFolder?: string;
  targetFile?: string;
  fileId?: string;
  fileSizeFormatted?: string;
  webViewLink?: string;
  webContentLink?: string;
  targetRecipient?: string;
  targetEmail?: string;
  targetPhone?: string;
  keywords?: string[];
  dispatchMethod?: string;
  resultSummary: string;
  status: "SUCCESS" | "READY" | "FAILED";
}

export interface RecordAiCopilotActivityParams extends Partial<AiCopilotActivityMeta> {
  userEmail: string;
  command: string;
  actionType: string;
  resultSummary: string;
  status?: "SUCCESS" | "READY" | "FAILED";
  phoneNumber?: string;
  ftsProjectId?: string;
  ftsToken?: string;
  deviceId?: string;
  req?: NextRequest;
}

export interface UserCopilotLearningContext {
  recentActivities: AiCopilotActivityMeta[];
  lastFileAction: {
    fileName: string;
    folderName: string;
    fileId: string;
    fileSizeFormatted: string;
    webViewLink: string;
    webContentLink: string;
    timestamp: string;
  } | null;
  lastRecipient: {
    name: string;
    email: string;
    phone: string;
  } | null;
  frequentFolders: string[];
  frequentRecipients: string[];
  frequentSheets: string[];
  frequentKeywords: string[];
  personalizedSuggestions: Array<{
    id: string;
    type: "APPS_SCRIPT" | "SHEET_QUERY" | "SMS_DISPATCH";
    label: string;
    command: string;
    description: string;
  }>;
  promptContextText: string;
}

const META_DELIMITER = " ||META_JSON||";
const SHEETBOT_EGDESK_PROJECT_ID = "58311f71-0e17-4fd5-8680-1d74d0bcbf8c";

const FTS_INTERNAL_ENDPOINTS = [
  process.env.FILETOSHEET_INTERNAL_URL,
  "https://file2sheet.cloud",
  "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/FileToSheet",
  "http://127.0.0.1:3003",
  "http://127.0.0.1:4007",
  "http://127.0.0.1:3005",
  "http://localhost:3003",
  "http://localhost:4007",
  "http://localhost:3005",
].filter(Boolean) as string[];

// 1. 초고속 인메모리 & 로컬 디스크 영구 학습 스토어 (다중 프로젝트 전환 시에도 0ms 무결점 보장)
const memoryLearningStore = new Map<string, AiCopilotActivityMeta[]>();
const LOCAL_LEARNING_STORE_PATH = path.join(os.homedir(), ".egdesk", "sheetbot-ai-learning-store.json");

function loadDiskLearningStore(): Record<string, AiCopilotActivityMeta[]> {
  try {
    if (fs.existsSync(LOCAL_LEARNING_STORE_PATH)) {
      const raw = fs.readFileSync(LOCAL_LEARNING_STORE_PATH, "utf8");
      return JSON.parse(raw) || {};
    }
  } catch {}
  return {};
}

function saveToDiskAndMemory(cleanEmail: string, meta: AiCopilotActivityMeta): void {
  try {
    const store = loadDiskLearningStore();
    const existing = store[cleanEmail] || memoryLearningStore.get(cleanEmail) || [];
    const updated = [meta, ...existing].slice(0, 60);
    memoryLearningStore.set(cleanEmail, updated);
    store[cleanEmail] = updated;
    const dir = path.dirname(LOCAL_LEARNING_STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_LEARNING_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (e: any) {
    console.warn("[AiCopilotLearning] Disk store write warning:", e.message);
  }
}

function getFromDiskAndMemory(cleanEmail: string): AiCopilotActivityMeta[] {
  const mem = memoryLearningStore.get(cleanEmail);
  if (mem && mem.length > 0) return mem;
  const store = loadDiskLearningStore();
  const diskList = store[cleanEmail] || [];
  if (diskList.length > 0) {
    memoryLearningStore.set(cleanEmail, diskList);
  }
  return diskList;
}

async function ensureSheetBotUserDataProject(): Promise<void> {
  try {
    const apiUrl = getServerEgdeskApiUrl();
    await fetch(`${apiUrl}/user-data/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "user_data_select_project",
        arguments: {
          projectId: SHEETBOT_EGDESK_PROJECT_ID,
          environment: "development",
        },
      }),
    });
  } catch {}
}

// 구글 시트 헤더 초기화 여부 메모리 캐시 (spreadsheetId -> boolean)
const initializedLearningSheets = new Set<string>();

/**
 * 명령 원문과 작업 유형을 바탕으로 업무 도메인 태그를 자동 분류합니다.
 */
export function inferDomainTag(command: string, actionType: string, targetSheet?: string): string {
  const text = `${command} ${targetSheet || ""}`.toLowerCase();
  if (actionType === "EMAIL_DISPATCH" || (text.includes("@") && text.includes("보내")) || text.includes("메일") || text.includes("이메일")) {
    return "이메일발송";
  }
  if (actionType === "DRIVE_FILE_ACTION" || text.includes("폴더") || text.includes("파일") || text.includes("드라이브") || text.includes("노트북")) {
    return "파일/드라이브";
  }
  if (actionType === "SMS_DISPATCH" || text.includes("문자") || text.includes("메시지")) {
    return "문자/소통";
  }
  if (actionType === "COMMAND_PROMOTE") {
    return "메뉴영구저장";
  }
  if (actionType === "APPS_SCRIPT_RUN" || text.includes("스크립트") || text.includes("자동화")) {
    return "자동화스크립트";
  }
  if (text.includes("대출") || text.includes("이자") || text.includes("은행") || text.includes("통장") || text.includes("송금")) {
    return "금융/자금";
  }
  if (text.includes("영수증") || text.includes("식대") || text.includes("지출") || text.includes("경비") || text.includes("부가세") || text.includes("세금")) {
    return "영수증/세무";
  }
  if (text.includes("승인") || text.includes("결재") || text.includes("보류") || text.includes("반려") || text.includes("미결재")) {
    return "결재/승인";
  }
  if (text.includes("할일") || text.includes("할 일") || text.includes("일정") || text.includes("미팅") || text.includes("예약")) {
    return "할일/일정";
  }
  if (text.includes("명함") || text.includes("연락처") || text.includes("거래처") || text.includes("고객")) {
    return "인맥/CRM";
  }
  if (text.includes("통화") || text.includes("녹음") || text.includes("부재중")) {
    return "통화/상담";
  }
  if (text.includes("매출") || text.includes("견적") || text.includes("발주") || text.includes("미수금") || text.includes("정산")) {
    return "매출/정산";
  }
  return "시트통합업무";
}

function formatActionTypeKorean(actionType: string): string {
  switch (actionType) {
    case "SHEET_QUERY":
      return "시트조회/검색";
    case "SHEET_WRITE":
      return "시트기록/결재";
    case "DRIVE_FILE_ACTION":
      return "파일탐색/전송";
    case "EMAIL_DISPATCH":
      return "이메일발송";
    case "SMS_DISPATCH":
      return "문자발송";
    case "APPS_SCRIPT_RUN":
      return "자동화실행";
    case "COMMAND_PROMOTE":
      return "메뉴영구승격";
    default:
      return "AI비서지원";
  }
}

/**
 * 시트봇 AI 비서 카드를 통한 모든 활동을:
 * 1) 초고속 메모리 & 로컬 영구 스토어 (`~/.egdesk/sheetbot-ai-learning-store.json`)
 * 2) SQLite DB (`sheetbot_user_dispatch_logs`)
 * 3) 구글 드라이브 시트 (`[SheetBot] AI 비서 활동 및 업무 학습 대장`)
 * 4) 파투(FileToSheet) 연동 장부 (`AI비서활동대장`)
 * 에 실시간 기록하여 사용자에 대한 지속적 학습 데이터를 축적합니다.
 */
export async function recordAiCopilotActivity(params: RecordAiCopilotActivityParams): Promise<void> {
  try {
    const cleanEmail = (params.userEmail || "").toLowerCase().trim();
    if (!cleanEmail) return;

    const nowStr = params.timestamp || getKoreanTimeString();
    const status = params.status || "SUCCESS";
    const domainTag = params.domainTag || inferDomainTag(params.command, params.actionType, params.targetSheet);

    const meta: AiCopilotActivityMeta = {
      timestamp: nowStr,
      command: params.command,
      actionType: params.actionType,
      domainTag,
      targetSheet: params.targetSheet || "",
      targetFolder: params.targetFolder || "",
      targetFile: params.targetFile || "",
      fileId: params.fileId || "",
      fileSizeFormatted: params.fileSizeFormatted || "",
      webViewLink: params.webViewLink || "",
      webContentLink: params.webContentLink || "",
      targetRecipient: params.targetRecipient || params.targetEmail || params.targetPhone || "",
      targetEmail: params.targetEmail || "",
      targetPhone: params.targetPhone || "",
      keywords: params.keywords || [],
      dispatchMethod: params.dispatchMethod || "",
      resultSummary: (params.resultSummary || "").replace(/\s+/g, " ").trim().slice(0, 300),
      status,
    };

    // 1. 인메모리 및 디스크 스토어에 0ms 즉시 적재
    saveToDiskAndMemory(cleanEmail, meta);

    const recipientLabel =
      meta.targetEmail ||
      meta.targetRecipient ||
      meta.targetFile ||
      meta.targetSheet ||
      cleanEmail;

    const readableContent = `[${domainTag}/${formatActionTypeKorean(meta.actionType)}] "${meta.command}" -> ${meta.resultSummary}`;
    const combinedContent = `${readableContent}${META_DELIMITER}${JSON.stringify(meta)}`;

    // 2. SQLite DB 및 구글 시트 / 파투 시트 백그라운드 기록
    void (async () => {
      await ensureSheetBotUserDataProject();
      await insertRows("sheetbot_user_dispatch_logs", [
        {
          id: Date.now() + Math.floor(Math.random() * 1000),
          user_email: cleanEmail,
          rule_id: "AI_COPILOT_LEARNING",
          rule_name: `🧠 AI 비서 학습 (${domainTag})`,
          device_id: params.deviceId || "SheetBot AI Copilot",
          recipient: recipientLabel,
          content: combinedContent,
          status: status === "FAILED" ? "FAILED" : "SUCCESS",
          error_message: status === "FAILED" ? meta.resultSummary : null,
          created_at: new Date().toISOString(),
        },
      ]).catch((err) => {
        console.warn("[AiCopilotLearning] DB insert warning:", err.message);
      });

      await syncActivityToSheetsBackground(cleanEmail, meta, params);
    })();
  } catch (err: any) {
    console.warn("[AiCopilotLearning] recordAiCopilotActivity error:", err.message);
  }
}

async function syncActivityToSheetsBackground(
  cleanEmail: string,
  meta: AiCopilotActivityMeta,
  params: RecordAiCopilotActivityParams
): Promise<void> {
  const fileOrFolderCol = [
    meta.targetFolder ? `[폴더:${meta.targetFolder}]` : "",
    meta.targetFile ? `${meta.targetFile}${meta.fileSizeFormatted ? ` (${meta.fileSizeFormatted})` : ""}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const recipientCol = [
    meta.targetRecipient,
    meta.targetEmail && meta.targetEmail !== meta.targetRecipient ? `<${meta.targetEmail}>` : "",
    meta.targetPhone && meta.targetPhone !== meta.targetRecipient ? `(${meta.targetPhone})` : "",
    meta.dispatchMethod ? `[${meta.dispatchMethod}]` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const keywordsCol = [
    ...(meta.keywords || []),
    meta.webViewLink ? `링크:${meta.webViewLink}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const statusKorean = meta.status === "SUCCESS" ? "성공" : meta.status === "READY" ? "선택대기" : "실패";

  // 2-A. 구글 드라이브 스프레드시트 기록 (`[SheetBot] AI 비서 활동 및 업무 학습 대장`)
  if (cleanEmail && !cleanEmail.endsWith("@fts.local") && !cleanEmail.endsWith("@filetosheet.cloud")) {
    try {
      const callOptions = await getWorkspaceCallOptionsForEmail(cleanEmail, params.req);
      const resolved = await resolveUserSpreadsheet({
        userEmail: cleanEmail,
        sheetType: "AI_COPILOT_LOG",
        defaultTitle: "[SheetBot] AI 비서 활동 및 업무 학습 대장",
        preferOAuth: true,
        callOptions,
      });

      const spreadsheetId = resolved.spreadsheetId;
      if (spreadsheetId) {
        if (!initializedLearningSheets.has(spreadsheetId)) {
          const firstRowCheck = await callSheetsTool(
            "sheets_get_range",
            {
              spreadsheetId,
              range: "A1:A1",
              preferOAuth: true,
            },
            callOptions
          ).catch(() => null);

          const hasHeader =
            firstRowCheck?.values &&
            firstRowCheck.values.length > 0 &&
            firstRowCheck.values[0]?.[0];

          if (!hasHeader) {
            const headers = [
              [
                "일시",
                "발화 원문(명령)",
                "작업 유형",
                "업무 도메인 태그",
                "대상 프로젝트/시트",
                "대상 파일/폴더",
                "고객/수신처/발송방식",
                "핵심 키워드/링크",
                "실행 결과 요약",
                "상태",
              ],
            ];
            await callSheetsTool(
              "sheets_update_range",
              {
                spreadsheetId,
                range: "A1:J1",
                values: headers,
                preferOAuth: true,
              },
              callOptions
            ).catch(() => {});

            await callSheetsTool(
              "sheets_format_headers",
              {
                spreadsheetId,
                backgroundColor: "#1E293B",
                textColor: "#FFFFFF",
                bold: true,
                preferOAuth: true,
              },
              callOptions
            ).catch(() => {});
          }
          initializedLearningSheets.add(spreadsheetId);
        }

        const rowValues = [
          [
            meta.timestamp,
            meta.command,
            formatActionTypeKorean(meta.actionType),
            meta.domainTag,
            meta.targetSheet || "-",
            fileOrFolderCol || "-",
            recipientCol || "-",
            keywordsCol || "-",
            meta.resultSummary,
            statusKorean,
          ],
        ];

        await callSheetsTool(
          "sheets_append_values",
          {
            spreadsheetId,
            range: "A1",
            values: rowValues,
            preferOAuth: true,
          },
          callOptions
        ).catch((e: any) => {
          console.warn("[AiCopilotLearning] Google Sheets append warning:", e.message);
        });
      }
    } catch (sheetErr: any) {
      console.warn("[AiCopilotLearning] Google Sheets sync warning:", sheetErr.message);
    }
  }

  // 2-B. 파투(FileToSheet) '시트봇 연동 장부' -> 'AI비서활동대장' 시트 자동 생성(ensure-sheet) 및 행 동시 적재
  const resolvedPhone =
    params.phoneNumber ||
    (await resolveUserFtsPhoneNumber(cleanEmail).catch(() => null)) ||
    (cleanEmail === "chachogreat@gmail.com" ? "01072165884" : "");

  if (resolvedPhone || params.ftsProjectId || params.ftsToken) {
    const ftsHeaders = [
      "일련번호",
      "일시",
      "발화원문",
      "작업유형",
      "도메인태그",
      "대상시트",
      "대상파일폴더",
      "고객수신처",
      "핵심키워드",
      "실행결과요약",
      "상태",
    ];
    const rowDataObj = {
      일시: meta.timestamp,
      발화원문: meta.command,
      작업유형: formatActionTypeKorean(meta.actionType),
      도메인태그: meta.domainTag,
      대상시트: meta.targetSheet || "-",
      대상파일폴더: fileOrFolderCol || "-",
      고객수신처: recipientCol || "-",
      핵심키워드: keywordsCol || "-",
      실행결과요약: meta.resultSummary,
      상태: statusKorean,
    };

    for (const baseUrl of FTS_INTERNAL_ENDPOINTS) {
      try {
        // Step 1: ensure-sheet 호출로 '시트봇 연동 장부' 내 'AI비서활동대장' 시트 보장 및 토큰 획득
        let inboxToken = params.ftsToken || "";
        if (resolvedPhone) {
          const ensureCtrl = new AbortController();
          const ensureTimer = setTimeout(() => ensureCtrl.abort(), 4500);
          const ensureRes = await fetch(`${baseUrl}/api/inbox/ensure-sheet`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phoneNumber: resolvedPhone,
              cardId: "ai_copilot_log",
              sheetName: "AI비서활동대장",
              headers: ftsHeaders,
              projectId: params.ftsProjectId || undefined,
            }),
            signal: ensureCtrl.signal,
          }).catch(() => null);
          clearTimeout(ensureTimer);
          if (ensureRes && ensureRes.ok) {
            const ensureJson = await ensureRes.json().catch(() => ({}));
            if (ensureJson?.token) {
              inboxToken = ensureJson.token;
            }
          }
        }

        // Step 2: 획득한 inboxToken으로 행 데이터 즉시 적재 (또는 /api/inbox/copilot 폴백)
        if (inboxToken) {
          const rowCtrl = new AbortController();
          const rowTimer = setTimeout(() => rowCtrl.abort(), 4500);
          const rowRes = await fetch(`${baseUrl}/api/inbox/${encodeURIComponent(inboxToken)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: meta.targetFile || `AI비서_${meta.domainTag}`,
              memo: meta.command,
              rowData: rowDataObj,
            }),
            signal: rowCtrl.signal,
          });
          clearTimeout(rowTimer);
          if (rowRes.ok) break;
        } else {
          const copilotCtrl = new AbortController();
          const copilotTimer = setTimeout(() => copilotCtrl.abort(), 4000);
          const res = await fetch(`${baseUrl}/api/inbox/copilot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phoneNumber: resolvedPhone || undefined,
              projectId: params.ftsProjectId || undefined,
              token: params.ftsToken || undefined,
              operation: "ADD_ROW",
              sheetName: "AI비서활동대장",
              rowValues: rowDataObj,
            }),
            signal: copilotCtrl.signal,
          });
          clearTimeout(copilotTimer);
          if (res.ok) break;
        }
      } catch {
        // try next endpoint
      }
    }
  }
}

/**
 * 사용자의 누적된 AI 비서 활동 로그를 분석하여:
 * - 최근 작업 문맥(직전 탐색 파일, 직전 수신자 등)
 * - 자주 찾는 폴더, 자주 연락하는 수신자, 자주 조회하는 시트, 빈출 키워드
 * - 맞춤형 추천 칩(Personalized Suggestions)
 * - LLM 프롬프트 주입용 학습 메모리 텍스트
 * 를 생성합니다.
 */
export async function getUserCopilotLearningContext(
  userEmail: string,
  limit = 35
): Promise<UserCopilotLearningContext> {
  const emptyContext: UserCopilotLearningContext = {
    recentActivities: [],
    lastFileAction: null,
    lastRecipient: null,
    frequentFolders: [],
    frequentRecipients: [],
    frequentSheets: [],
    frequentKeywords: [],
    personalizedSuggestions: [],
    promptContextText: "아직 누적된 이전 작업 이력이 없습니다.",
  };

  try {
    const cleanEmail = (userEmail || "").toLowerCase().trim();
    if (!cleanEmail) return emptyContext;

    // 1. 인메모리 + 로컬 디스크 스토어에서 최우선 로드
    const localActivities = getFromDiskAndMemory(cleanEmail);

    // 2. SQLite DB에서 보조 병합
    await ensureSheetBotUserDataProject();
    const logsRes = await queryTable("sheetbot_user_dispatch_logs", {
      filters: { user_email: cleanEmail },
      limit,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const validRows = (logsRes.rows || []).filter((r: any) => !r.deleted_at);
    const dbActivities: AiCopilotActivityMeta[] = [];

    for (const row of validRows) {
      const rawContent = String(row.content || "");
      let meta: AiCopilotActivityMeta | null = null;

      if (rawContent.includes(META_DELIMITER)) {
        const jsonPart = rawContent.split(META_DELIMITER)[1];
        try {
          meta = JSON.parse(jsonPart);
        } catch {}
      } else if (row.rule_id === "AI_NATURAL_COMMAND" || row.rule_id === "AI_EMAIL_DISPATCH") {
        const cmdMatch = rawContent.match(/\[명령\]\s*"([^"]+)"\s*->\s*([\s\S]*)/);
        if (cmdMatch) {
          const cmd = cmdMatch[1].trim();
          const summary = cmdMatch[2].trim();
          meta = {
            timestamp: row.created_at || "",
            command: cmd,
            actionType: "GENERAL_ASSIST",
            domainTag: inferDomainTag(cmd, "GENERAL_ASSIST"),
            targetRecipient: row.recipient !== cleanEmail ? row.recipient : "",
            resultSummary: summary.slice(0, 200),
            status: row.status === "FAILED" ? "FAILED" : "SUCCESS",
          };
        }
      }

      if (meta && meta.command) {
        dbActivities.push(meta);
      }
    }

    // 중복 제거 병합 (최신 로컬 스토어 우선)
    const seenKeys = new Set<string>();
    const activities: AiCopilotActivityMeta[] = [];
    for (const item of [...localActivities, ...dbActivities]) {
      const key = `${item.timestamp}::${item.command}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        activities.push(item);
      }
    }

    if (activities.length === 0) return emptyContext;

    const folderCounts = new Map<string, number>();
    const recipientCounts = new Map<string, number>();
    const sheetCounts = new Map<string, number>();
    const keywordCounts = new Map<string, number>();
    const commandCounts = new Map<string, { count: number; meta: AiCopilotActivityMeta }>();

    let lastFileAction: UserCopilotLearningContext["lastFileAction"] = null;
    let lastRecipient: UserCopilotLearningContext["lastRecipient"] = null;

    for (const meta of activities) {
      // 1. 가장 최근 파일 탐색/전송 컨텍스트 보존
      if (!lastFileAction && meta.targetFile && (meta.webViewLink || meta.webContentLink || meta.fileId)) {
        lastFileAction = {
          fileName: meta.targetFile,
          folderName: meta.targetFolder || "",
          fileId: meta.fileId || "",
          fileSizeFormatted: meta.fileSizeFormatted || "",
          webViewLink: meta.webViewLink || "",
          webContentLink: meta.webContentLink || "",
          timestamp: meta.timestamp,
        };
      }

      // 2. 가장 최근 수신자 컨텍스트 보존
      if (!lastRecipient && (meta.targetEmail || meta.targetPhone || meta.targetRecipient)) {
        const email = meta.targetEmail || (meta.targetRecipient?.includes("@") ? meta.targetRecipient : "");
        const phone = meta.targetPhone || "";
        const name = meta.targetRecipient || email || phone;
        if (name && name !== cleanEmail) {
          lastRecipient = { name, email, phone };
        }
      }

      // 3. 빈도 집계
      if (meta.targetFolder) {
        const f = meta.targetFolder.trim();
        folderCounts.set(f, (folderCounts.get(f) || 0) + 1);
      }
      if (meta.targetEmail || (meta.targetRecipient && meta.targetRecipient !== cleanEmail)) {
        const r = (meta.targetEmail || meta.targetRecipient || "").trim();
        if (r) recipientCounts.set(r, (recipientCounts.get(r) || 0) + 1);
      }
      if (meta.targetSheet) {
        const s = meta.targetSheet.trim();
        sheetCounts.set(s, (sheetCounts.get(s) || 0) + 1);
      }
      if (Array.isArray(meta.keywords)) {
        for (const kw of meta.keywords) {
          const cleanKw = String(kw || "").trim();
          if (cleanKw.length >= 2) {
            keywordCounts.set(cleanKw, (keywordCounts.get(cleanKw) || 0) + 1);
          }
        }
      }

      if (meta.status !== "FAILED" && !meta.command.startsWith("[방식 ")) {
        const normCmd = meta.command.trim();
        const existing = commandCounts.get(normCmd);
        if (existing) {
          existing.count += 1;
        } else {
          commandCounts.set(normCmd, { count: 1, meta });
        }
      }
    }

    const topEntries = (map: Map<string, number>, max: number) =>
      Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, max)
        .map(([k]) => k);

    const frequentFolders = topEntries(folderCounts, 5);
    const frequentRecipients = topEntries(recipientCounts, 5);
    const frequentSheets = topEntries(sheetCounts, 5);
    const frequentKeywords = topEntries(keywordCounts, 8);

    // 4. 개인화 추천 칩(Personalized Suggestions) 생성
    const personalizedSuggestions: UserCopilotLearningContext["personalizedSuggestions"] = [];
    const sortedCommands = Array.from(commandCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    for (let i = 0; i < sortedCommands.length; i++) {
      const { meta, count } = sortedCommands[i];
      const shortLabel =
        meta.targetFile
          ? `📁 ${meta.targetFile.slice(0, 12)}`
          : meta.targetSheet
            ? `📊 ${meta.targetSheet.slice(0, 12)}`
            : meta.command.length > 14
              ? `🧠 ${meta.command.slice(0, 13)}..`
              : `🧠 ${meta.command}`;

      personalizedSuggestions.push({
        id: `learned_cmd_${i}`,
        type: meta.actionType === "APPS_SCRIPT_RUN" ? "APPS_SCRIPT" : meta.actionType === "SMS_DISPATCH" ? "SMS_DISPATCH" : "SHEET_QUERY",
        label: shortLabel,
        command: meta.command,
        description: `[학습된 맞춤 명령 (${count}회)] ${meta.resultSummary.slice(0, 50)}`,
      });
    }

    // 5. LLM 프롬프트 주입용 학습 메모리 요약 생성
    const recentLines = activities.slice(0, 10).map((a, idx) => {
      const targetParts = [
        a.targetFolder ? `폴더:${a.targetFolder}` : "",
        a.targetFile ? `파일:${a.targetFile}` : "",
        a.targetSheet ? `시트:${a.targetSheet}` : "",
        a.targetEmail ? `이메일:${a.targetEmail}` : "",
        a.targetRecipient && a.targetRecipient !== a.targetEmail ? `대상:${a.targetRecipient}` : "",
      ].filter(Boolean);
      return `  ${idx + 1}. [${a.timestamp}] (${a.domainTag}/${a.actionType}) 발화: "${a.command}" ${targetParts.length > 0 ? `| 추출대상: [${targetParts.join(", ")}]` : ""} -> 결과: ${a.resultSummary.slice(0, 80)}`;
    });

    const promptContextText = [
      `• 직전 탐색/취급 파일: ${lastFileAction ? `"${lastFileAction.fileName}" (폴더: ${lastFileAction.folderName || "루트"}, 용량: ${lastFileAction.fileSizeFormatted || "미상"})` : "없음"}`,
      `• 직전 연락/발송 대상: ${lastRecipient ? `${lastRecipient.name} (이메일: ${lastRecipient.email || "없음"}, 전화: ${lastRecipient.phone || "없음"})` : "없음"}`,
      `• 자주 찾는 폴더: ${frequentFolders.length > 0 ? frequentFolders.join(", ") : "없음"}`,
      `• 자주 연락하는 수신처: ${frequentRecipients.length > 0 ? frequentRecipients.join(", ") : "없음"}`,
      `• 자주 다루는 시트: ${frequentSheets.length > 0 ? frequentSheets.join(", ") : "없음"}`,
      `• 자주 검색하는 키워드: ${frequentKeywords.length > 0 ? frequentKeywords.join(", ") : "없음"}`,
      `• 최근 AI 비서 실행 이력 (최신순 최대 10건):`,
      ...(recentLines.length > 0 ? recentLines : ["  (이력 없음)"]),
    ].join("\n");

    return {
      recentActivities: activities.slice(0, 15),
      lastFileAction,
      lastRecipient,
      frequentFolders,
      frequentRecipients,
      frequentSheets,
      frequentKeywords,
      personalizedSuggestions,
      promptContextText,
    };
  } catch (err: any) {
    console.warn("[AiCopilotLearning] getUserCopilotLearningContext warning:", err.message);
    return emptyContext;
  }
}
