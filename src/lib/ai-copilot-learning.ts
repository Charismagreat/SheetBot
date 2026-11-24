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
import { isDuplicateAndRegisterKakaoMessage } from "@/lib/kakao-message-dedupe";

export type CopilotActionCategory =
  | "SHEET_QUERY"
  | "SHEET_WRITE"
  | "DRIVE_FILE_ACTION"
  | "EMAIL_DISPATCH"
  | "SMS_DISPATCH"
  | "KAKAO_DISPATCH"
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
  if (actionType === "KAKAO_DISPATCH" || text.includes("카톡") || text.includes("카카오")) {
    return "카카오톡/소통";
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
    case "KAKAO_DISPATCH":
      return "카카오톡발송";
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
  const ftsEmailDigits = cleanEmail.match(/^([0-9]{9,12})@(fts\.local|filetosheet\.cloud)$/)?.[1] || "";
  const resolvedPhone =
    (params.phoneNumber || "").replace(/[^0-9]/g, "") ||
    ftsEmailDigits ||
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
 * 시트봇 AI 비서 카드를 통해 발송(PC 카톡 브리지 무포커스 자동발송 / 스마트폰 즉시답장 / 카톡방 이동 발송)한
 * 카카오톡 메시지를 파투(FileToSheet) '시트봇 연동 장부 -> 카카오톡대화대장' 시트에 실시간 기록합니다.
 */
export async function appendOutboundKakaoToFtsSheet(params: {
  userEmail: string;
  phoneNumber?: string;
  roomName: string;
  recipientName: string;
  message: string;
  methodLabel: string;
}): Promise<boolean> {
  try {
    const cleanEmail = (params.userEmail || "").toLowerCase().trim();
    const ftsEmailDigits = cleanEmail.match(/^([0-9]{9,12})@(fts\.local|filetosheet\.cloud)$/)?.[1] || "";
    const resolvedPhone =
      (params.phoneNumber || "").replace(/[^0-9]/g, "") ||
      ftsEmailDigits ||
      (cleanEmail ? await resolveUserFtsPhoneNumber(cleanEmail).catch(() => null) : null) ||
      (cleanEmail === "chachogreat@gmail.com" ? "01072165884" : "");

    if (!resolvedPhone) return false;

    const nowStr = getKoreanTimeString();
    const roomLabel = params.roomName || params.recipientName || "대화방";
    const recipientLabel = params.recipientName || params.roomName || "상대방";

    // AI 비서 발송 시 통합 지문 캐시에 선등록하여, 1~2초 뒤 PC 카톡 로컬 DB 감시(kakao_native)가 동일 메시지를 중복 적재하지 않도록 차단
    isDuplicateAndRegisterKakaoMessage({
      userKey: resolvedPhone,
      roomName: roomLabel,
      senderName: recipientLabel,
      message: params.message,
    });
    if (cleanEmail) {
      isDuplicateAndRegisterKakaoMessage({
        userKey: cleanEmail,
        roomName: roomLabel,
        senderName: recipientLabel,
        message: params.message,
      });
    }

    const ftsHeaders = [
      "일련번호",
      "수신일시",
      "채팅방/발신자",
      "메시지내용",
      "기기명",
      "동기화일시",
    ];

    const rowDataObj = {
      수신일시: nowStr,
      "채팅방/발신자": `📤 [나 ➔ ${roomLabel}]`,
      메시지내용: params.message,
      기기명: params.methodLabel,
      동기화일시: nowStr,
    };

    for (const baseUrl of FTS_INTERNAL_ENDPOINTS) {
      try {
        let inboxToken = "";
        const ensureCtrl = new AbortController();
        const ensureTimer = setTimeout(() => ensureCtrl.abort(), 4500);
        const ensureRes = await fetch(`${baseUrl}/api/inbox/ensure-sheet`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumber: resolvedPhone,
            cardId: "kakao_sync",
            sheetName: "카카오톡대화대장",
            headers: ftsHeaders,
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

        if (inboxToken) {
          const rowCtrl = new AbortController();
          const rowTimer = setTimeout(() => rowCtrl.abort(), 4500);
          const rowRes = await fetch(`${baseUrl}/api/inbox/${encodeURIComponent(inboxToken)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: `카톡발송_${roomLabel}`,
              memo: `[${params.methodLabel}] ${params.message}`,
              rowData: rowDataObj,
            }),
            signal: rowCtrl.signal,
          });
          clearTimeout(rowTimer);
          if (rowRes.ok) return true;
        } else {
          const copilotCtrl = new AbortController();
          const copilotTimer = setTimeout(() => copilotCtrl.abort(), 4000);
          const res = await fetch(`${baseUrl}/api/inbox/copilot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phoneNumber: resolvedPhone,
              operation: "ADD_ROW",
              sheetName: "카카오톡대화대장",
              rowValues: rowDataObj,
            }),
            signal: copilotCtrl.signal,
          });
          clearTimeout(copilotTimer);
          if (res.ok) return true;
        }
      } catch {
        // try next endpoint
      }
    }
  } catch (err: any) {
    console.warn("[AiCopilotLearning] appendOutboundKakaoToFtsSheet error:", err.message);
  }
  return false;
}

/**
 * PC 카카오톡 브리지(kakao_native 로컬 DB 감시)에서 감지한 '열린 대화창 실시간 대화(수신 + 내 PC 직접 발신)'를
 * 3단계 중복 방어(logId + 교차 채널 지문 캐시 + 파투 시트 최근 30행 대조)를 거쳐
 * 파투(FileToSheet) '시트봇 연동 장부 -> 카카오톡대화대장' 및 구글 시트에 실시간 적재합니다.
 */
export async function syncPcLiveKakaoMessageToSheets(params: {
  userEmail: string;
  phoneNumber?: string;
  roomName: string;
  senderName: string;
  message: string;
  mine: boolean;
  sentAtStr?: string;
  logId?: string | number;
  pcName?: string;
  req?: NextRequest;
}): Promise<{ synced: boolean; deduplicated: boolean }> {
  try {
    const cleanEmail = (params.userEmail || "").toLowerCase().trim();
    const ftsEmailDigits = cleanEmail.match(/^([0-9]{9,12})@(fts\.local|filetosheet\.cloud)$/)?.[1] || "";
    const resolvedPhone =
      (params.phoneNumber || "").replace(/[^0-9]/g, "") ||
      ftsEmailDigits ||
      (cleanEmail ? await resolveUserFtsPhoneNumber(cleanEmail).catch(() => null) : null) ||
      (cleanEmail === "chachogreat@gmail.com" ? "01072165884" : "");

    const msgText = (params.message || "").trim();
    if (!msgText) return { synced: false, deduplicated: true };

    const primaryKey = resolvedPhone || cleanEmail;
    if (!primaryKey) return { synced: false, deduplicated: false };

    // 2단계 교차 채널 통합 지문 검사 (스마트폰 알림 또는 AI 비서 발송으로 이미 기록된 메시지이면 즉시 스킵)
    // 주의: userEmail이 "01072165884@fts.local"이고 resolvedPhone이 "01072165884"일 때
    // isDuplicateAndRegisterKakaoMessage 내부에서 @fts.local을 제거하므로 두 키가 동일한 cleanUser("01072165884")가 됩니다.
    // 따라서 두 번 호출하면 자기 자신이 방금 등록한 지문에 걸려 항상 중복(true)으로 판정되므로 반드시 서로 다른 정규화 키일 때만 2차 호출합니다.
    const isDupPrimary = isDuplicateAndRegisterKakaoMessage({
      userKey: primaryKey,
      roomName: params.roomName,
      senderName: params.senderName,
      message: msgText,
      logId: params.logId,
    });
    if (isDupPrimary) {
      return { synced: false, deduplicated: true };
    }
    const strippedEmailKey = cleanEmail.replace(/@(fts\.local|filetosheet\.cloud)$/, "");
    if (strippedEmailKey && strippedEmailKey !== primaryKey) {
      const isDupEmail = isDuplicateAndRegisterKakaoMessage({
        userKey: strippedEmailKey,
        roomName: params.roomName,
        senderName: params.senderName,
        message: msgText,
        logId: params.logId,
      });
      if (isDupEmail) {
        return { synced: false, deduplicated: true };
      }
    }

    const nowStr = getKoreanTimeString();
    const sentAt = (params.sentAtStr || "").trim() || nowStr;
    const roomLabel = (params.roomName || params.senderName || "대화방").trim();
    const senderLabel = (params.senderName || roomLabel).trim();
    const pcLabel = (params.pcName || "Windows PC").trim();

    const roomOrSenderCol = params.mine
      ? `📤 [나 ➔ ${roomLabel}]`
      : senderLabel && senderLabel !== roomLabel
        ? `[${roomLabel}] ${senderLabel}`
        : roomLabel;

    const deviceCol = params.mine
      ? `🖥️ 내 PC(${pcLabel}) 카톡 직접발신`
      : `🖥️ 내 PC(${pcLabel}) 카톡 열린창 수신`;

    let ftsSuccess = false;

    // 1. 파투(FileToSheet) '시트봇 연동 장부 -> 카카오톡대화대장' 적재
    const logIdStr = params.logId !== undefined && params.logId !== null ? String(params.logId).trim() : "";
    if (resolvedPhone) {
      const ftsHeaders = [
        "일련번호",
        "수신일시",
        "채팅방/발신자",
        "메시지내용",
        "기기명",
        "동기화일시",
        "상태",
        "메시지ID",
        "파일링크",
      ];
      const rowDataObj = {
        수신일시: sentAt,
        "채팅방/발신자": roomOrSenderCol,
        메시지내용: msgText,
        기기명: deviceCol,
        동기화일시: nowStr,
        상태: "정상",
        메시지ID: logIdStr,
        파일링크: "",
      };

      for (const baseUrl of FTS_INTERNAL_ENDPOINTS) {
        try {
          let inboxToken = "";
          const ensureCtrl = new AbortController();
          const ensureTimer = setTimeout(() => ensureCtrl.abort(), 4500);
          const ensureRes = await fetch(`${baseUrl}/api/inbox/ensure-sheet`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phoneNumber: resolvedPhone,
              cardId: "kakao_sync",
              sheetName: "카카오톡대화대장",
              headers: ftsHeaders,
            }),
            signal: ensureCtrl.signal,
          }).catch(() => null);
          clearTimeout(ensureTimer);

          if (ensureRes && ensureRes.ok) {
            const ensureJson = await ensureRes.json().catch(() => ({}));
            if (ensureJson?.token) inboxToken = ensureJson.token;
          }

          if (inboxToken) {
            const rowCtrl = new AbortController();
            const rowTimer = setTimeout(() => rowCtrl.abort(), 4500);
            const rowRes = await fetch(`${baseUrl}/api/inbox/${encodeURIComponent(inboxToken)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileName: `PC카톡_${roomLabel}`,
                memo: `[${deviceCol}] ${msgText}`,
                rowData: rowDataObj,
              }),
              signal: rowCtrl.signal,
            });
            clearTimeout(rowTimer);
            if (rowRes.ok) {
              ftsSuccess = true;
              break;
            }
          }
        } catch {
          // try next endpoint
        }
      }
    }

    // 2. 구글 시트 '[SheetBot] 카카오톡 메시지 대장' 적재 (구글 계정 연동 회원인 경우)
    let googleSheetSuccess = false;
    if (cleanEmail && cleanEmail.includes("@") && !cleanEmail.endsWith("@fts.local") && !cleanEmail.endsWith("@filetosheet.cloud")) {
      try {
        const callOptions = await getWorkspaceCallOptionsForEmail(cleanEmail, params.req);
        const resolved = await resolveUserSpreadsheet({
          userEmail: cleanEmail,
          sheetType: "KAKAO",
          defaultTitle: "[SheetBot] 카카오톡 메시지 대장",
          preferOAuth: true,
          callOptions,
        });
        if (resolved?.spreadsheetId) {
          await ensureKakaoSheetStatusHeaders(resolved.spreadsheetId, callOptions);
          const dirCol = params.mine ? "📤 PC카톡 발신" : "💬 PC카톡 수신";
          const senderCol = params.mine ? `나 ➔ ${roomLabel}` : senderLabel;
          const logIdStr = params.logId !== undefined && params.logId !== null ? String(params.logId).trim() : "";
          await callSheetsTool(
            "sheets_append_values",
            {
              spreadsheetId: resolved.spreadsheetId,
              range: "A:I",
              values: [[sentAt, dirCol, roomLabel, senderCol, msgText, deviceCol, "정상", logIdStr, ""]],
              preferOAuth: true,
            },
            callOptions
          ).catch(() => {});
          googleSheetSuccess = true;
        }
      } catch {}
    }

    return { synced: ftsSuccess || googleSheetSuccess, deduplicated: false };
  } catch (err: any) {
    console.warn("[AiCopilotLearning] syncPcLiveKakaoMessageToSheets error:", err.message);
    return { synced: false, deduplicated: false };
  }
}

/**
 * 구글 시트 '[SheetBot] 카카오톡 메시지 대장'의 1행 헤더(A1:I1)를 보장합니다.
 * - 빈 시트: A1:I1 전체 헤더 생성
 * - 기존 6/8컬럼 시트: G1("상태"), H1("메시지ID"), I1("파일링크")만 안전하게 자동 확장
 */
export async function ensureKakaoSheetStatusHeaders(
  spreadsheetId: string,
  callOptions?: any
): Promise<void> {
  const firstRowCheck = await callSheetsTool(
    "sheets_get_range",
    {
      spreadsheetId,
      range: "A1:I1",
      preferOAuth: true,
    },
    callOptions
  ).catch(() => null);

  const firstRow = firstRowCheck?.values?.[0] || [];
  const hasHeader = Boolean(firstRow[0]);
  const hasStatusHeader = Boolean(firstRow[6]);
  const hasFileLinkHeader = Boolean(firstRow[8]);

  if (!hasHeader) {
    await callSheetsTool(
      "sheets_update_range",
      {
        spreadsheetId,
        range: "A1:I1",
        values: [["수신 일시", "채팅방 구분", "채팅방/상대방 이름", "발신자", "메시지 내용", "기기명", "상태", "메시지ID", "파일링크"]],
        preferOAuth: true,
      },
      callOptions
    ).catch(() => {});
  } else if (!hasStatusHeader || !hasFileLinkHeader) {
    await callSheetsTool(
      "sheets_update_range",
      {
        spreadsheetId,
        range: "G1:I1",
        values: [["상태", "메시지ID", "파일링크"]],
        preferOAuth: true,
      },
      callOptions
    ).catch(() => {});
  }
}

export interface DeletedKakaoMessageEvent {
  logId?: string | number;
  roomName: string;
  senderName?: string;
  message?: string;
  deleteType?: "ALL" | "LOCAL" | string;
  deletedAtStr?: string;
}

/**
 * 파투(FileToSheet) '카카오톡대화대장' 인박스 토큰을 확보하고 PATCH 요청을 전송하는 공용 헬퍼
 */
async function patchFtsKakaoSheet(
  resolvedPhone: string,
  patchBody: Record<string, any>
): Promise<{ ok: boolean; data?: any }> {
  if (!resolvedPhone) return { ok: false };
  const ftsHeaders = [
    "일련번호",
    "수신일시",
    "채팅방/발신자",
    "메시지내용",
    "기기명",
    "동기화일시",
    "상태",
    "메시지ID",
    "파일링크",
  ];
  for (const baseUrl of FTS_INTERNAL_ENDPOINTS) {
    try {
      let inboxToken = "";
      const ensureCtrl = new AbortController();
      const ensureTimer = setTimeout(() => ensureCtrl.abort(), 4500);
      const ensureRes = await fetch(`${baseUrl}/api/inbox/ensure-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: resolvedPhone,
          cardId: "kakao_sync",
          sheetName: "카카오톡대화대장",
          headers: ftsHeaders,
        }),
        signal: ensureCtrl.signal,
      }).catch(() => null);
      clearTimeout(ensureTimer);

      if (ensureRes && ensureRes.ok) {
        const ensureJson = await ensureRes.json().catch(() => ({}));
        if (ensureJson?.token) inboxToken = ensureJson.token;
      }

      if (inboxToken) {
        const patchCtrl = new AbortController();
        const patchTimer = setTimeout(() => patchCtrl.abort(), 8000);
        const patchRes = await fetch(`${baseUrl}/api/inbox/${encodeURIComponent(inboxToken)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
          signal: patchCtrl.signal,
        });
        clearTimeout(patchTimer);
        if (patchRes.ok) {
          const data = await patchRes.json().catch(() => ({}));
          return { ok: true, data };
        }
      }
    } catch {
      // try next endpoint
    }
  }
  return { ok: false };
}

/**
 * PC 카톡 브리지에서 감지한 삭제 메시지/첨부파일을 시트에서 삭제하지 않고
 * 원본 내용은 그대로 보존한 채 구글 시트(G열) 및 파투 시트('상태' 열)에 '🗑️ 삭제됨 (...)' 표시를 기록합니다.
 */
export async function markKakaoMessagesDeletedInSheets(params: {
  userEmail: string;
  phoneNumber?: string;
  deletedMessages: DeletedKakaoMessageEvent[];
  pcName?: string;
  req?: NextRequest;
}): Promise<{ updatedCount: number; alreadyMarkedCount: number; notFoundCount: number; ftsUpdatedCount?: number }> {
  let updatedCount = 0;
  let alreadyMarkedCount = 0;
  let notFoundCount = 0;
  let ftsUpdatedCount = 0;

  try {
    const cleanEmail = (params.userEmail || "").toLowerCase().trim();
    const items = Array.isArray(params.deletedMessages) ? params.deletedMessages : [];
    if (!items.length) {
      return { updatedCount, alreadyMarkedCount, notFoundCount, ftsUpdatedCount };
    }

    // 1. 파투(FileToSheet) '카카오톡대화대장' 삭제 상태 반영
    const ftsEmailDigits = cleanEmail.match(/^([0-9]{9,12})@(fts\.local|filetosheet\.cloud)$/)?.[1] || "";
    const resolvedPhone =
      (params.phoneNumber || "").replace(/[^0-9]/g, "") ||
      ftsEmailDigits ||
      (cleanEmail ? await resolveUserFtsPhoneNumber(cleanEmail).catch(() => null) : null) ||
      (cleanEmail === "chachogreat@gmail.com" ? "01072165884" : "");

    if (resolvedPhone) {
      const ftsRes = await patchFtsKakaoSheet(resolvedPhone, {
        action: "MARK_DELETED",
        deletedMessages: items,
      });
      if (ftsRes.ok && ftsRes.data) {
        ftsUpdatedCount = Number(ftsRes.data.updatedCount || 0);
      }
    }

    // 2. 구글 계정 연동 회원 시트('[SheetBot] 카카오톡 메시지 대장') 반영
    if (!cleanEmail || !cleanEmail.includes("@") || cleanEmail.endsWith("@fts.local") || cleanEmail.endsWith("@filetosheet.cloud")) {
      return {
        updatedCount: ftsUpdatedCount,
        alreadyMarkedCount,
        notFoundCount: Math.max(0, items.length - ftsUpdatedCount),
        ftsUpdatedCount,
      };
    }

    const callOptions = await getWorkspaceCallOptionsForEmail(cleanEmail, params.req);
    const resolved = await resolveUserSpreadsheet({
      userEmail: cleanEmail,
      sheetType: "KAKAO",
      defaultTitle: "[SheetBot] 카카오톡 메시지 대장",
      preferOAuth: true,
      callOptions,
    });

    if (!resolved?.spreadsheetId) {
      return { updatedCount, alreadyMarkedCount, notFoundCount: items.length };
    }

    const spreadsheetId = resolved.spreadsheetId;
    await ensureKakaoSheetStatusHeaders(spreadsheetId, callOptions);

    // 시트 데이터 조회 (A1:H5000 범위)
    const sheetData = await callSheetsTool(
      "sheets_get_range",
      {
        spreadsheetId,
        range: "A1:H5000",
        preferOAuth: true,
      },
      callOptions
    ).catch(() => null);

    const rows: string[][] = Array.isArray(sheetData?.values) ? sheetData.values : [];
    if (rows.length <= 1) {
      return { updatedCount, alreadyMarkedCount, notFoundCount: items.length };
    }

    const nowStr = getKoreanTimeString();
    const matchedRowsInBatch = new Set<number>();

    for (const item of items) {
      const targetLogId = item.logId !== undefined && item.logId !== null ? String(item.logId).trim() : "";
      const targetRoom = (item.roomName || "").trim();
      const targetMsg = (item.message || "").trim();
      const deletedAt = (item.deletedAtStr || "").trim() || nowStr;
      const deleteScopeLabel = item.deleteType === "ALL" ? "모두에게 삭제" : "삭제됨";
      const statusText = `🗑️ ${deleteScopeLabel} (${deletedAt})`;

      let targetRowIndex = -1; // 0-based index in `rows`

      // 1순위: H열(메시지ID / logId) 정확 일치 검색 (최신 행부터 역순 탐색)
      if (targetLogId) {
        for (let i = rows.length - 1; i >= 1; i--) {
          const rowLogId = String(rows[i]?.[7] ?? "").trim();
          if (rowLogId && rowLogId === targetLogId) {
            targetRowIndex = i;
            break;
          }
        }
      }

      // 2순위: 모바일 알림 선행 적재 등으로 H열이 비어있는 경우, C열(채팅방) + E열(메시지 내용) 지문 역순 매칭
      if (targetRowIndex === -1 && targetRoom && targetMsg) {
        for (let i = rows.length - 1; i >= 1; i--) {
          if (matchedRowsInBatch.has(i)) continue;
          const rowRoom = String(rows[i]?.[2] ?? "").trim();
          const rowMsg = String(rows[i]?.[4] ?? "").trim();
          const rowStatus = String(rows[i]?.[6] ?? "").trim();
          const rowLogId = String(rows[i]?.[7] ?? "").trim();
          if (rowRoom === targetRoom && rowMsg === targetMsg && !rowLogId && !rowStatus.includes("삭제")) {
            targetRowIndex = i;
            break;
          }
        }
      }

      if (targetRowIndex === -1) {
        notFoundCount++;
        continue;
      }

      const existingStatus = String(rows[targetRowIndex]?.[6] ?? "").trim();
      if (existingStatus.includes("삭제")) {
        alreadyMarkedCount++;
        continue;
      }

      const sheetRowNumber = targetRowIndex + 1; // 1-based Google Sheet row number
      const existingLogId = String(rows[targetRowIndex]?.[7] ?? "").trim();
      const finalLogId = existingLogId || targetLogId;

      await callSheetsTool(
        "sheets_update_range",
        {
          spreadsheetId,
          range: `G${sheetRowNumber}:H${sheetRowNumber}`,
          values: [[statusText, finalLogId]],
          preferOAuth: true,
        },
        callOptions
      );

      // 메모리 스냅샷 갱신 (동일 배치 내 중복 매칭 방지)
      while (rows[targetRowIndex].length < 8) {
        rows[targetRowIndex].push("");
      }
      rows[targetRowIndex][6] = statusText;
      rows[targetRowIndex][7] = finalLogId;
      matchedRowsInBatch.add(targetRowIndex);
      updatedCount++;
    }

    return {
      updatedCount: Math.max(updatedCount, ftsUpdatedCount),
      alreadyMarkedCount,
      notFoundCount,
      ftsUpdatedCount,
    };
  } catch (err: any) {
    console.warn("[AiCopilotLearning] markKakaoMessagesDeletedInSheets error:", err?.message || err);
    return { updatedCount, alreadyMarkedCount, notFoundCount, ftsUpdatedCount };
  }
}

/**
 * 구글 드라이브에 업로드된 카카오톡 첨부 파일의 링크(webViewLink) 및 원본 파일을
 * 구글 시트 '[SheetBot] 카카오톡 메시지 대장'(I열)과 파투 '카카오톡대화대장'('파일링크' + _fileId)에 동시 연결합니다.
 */
export async function attachDriveLinkToKakaoSheetRow(params: {
  userEmail: string;
  phoneNumber?: string;
  logId?: string | number;
  roomName: string;
  senderName?: string;
  fileName: string;
  mimeType?: string;
  fileBase64?: string;
  webViewLink: string;
  pcName?: string;
  req?: NextRequest;
}): Promise<{ updated: boolean; appended: boolean; spreadsheetUrl: string; ftsUpdated?: boolean; ftsFileUrl?: string }> {
  let ftsUpdated = false;
  let ftsFileUrl = "";
  try {
    const cleanEmail = (params.userEmail || "").toLowerCase().trim();

    // 1. 파투(FileToSheet) '카카오톡대화대장' 원본 파일 저장 + '파일링크' 연결
    const ftsEmailDigits = cleanEmail.match(/^([0-9]{9,12})@(fts\.local|filetosheet\.cloud)$/)?.[1] || "";
    const resolvedPhone =
      (params.phoneNumber || "").replace(/[^0-9]/g, "") ||
      ftsEmailDigits ||
      (cleanEmail ? await resolveUserFtsPhoneNumber(cleanEmail).catch(() => null) : null) ||
      (cleanEmail === "chachogreat@gmail.com" ? "01072165884" : "");

    if (resolvedPhone) {
      const ftsRes = await patchFtsKakaoSheet(resolvedPhone, {
        action: "ATTACH_FILE",
        logId: params.logId,
        roomName: params.roomName,
        senderName: params.senderName,
        fileName: params.fileName,
        mimeType: params.mimeType,
        fileBase64: params.fileBase64,
        webViewLink: params.webViewLink,
        pcName: params.pcName,
      });
      if (ftsRes.ok && ftsRes.data) {
        ftsUpdated = Boolean(ftsRes.data.updated || ftsRes.data.appended);
        ftsFileUrl = String(ftsRes.data.fileUrl || "");
      }
    }

    // 2. 구글 시트 '[SheetBot] 카카오톡 메시지 대장' I열('파일링크') 연결
    if (!cleanEmail || !cleanEmail.includes("@") || cleanEmail.endsWith("@fts.local") || cleanEmail.endsWith("@filetosheet.cloud")) {
      return { updated: ftsUpdated, appended: false, spreadsheetUrl: "", ftsUpdated, ftsFileUrl };
    }
    if (!params.webViewLink) {
      return { updated: ftsUpdated, appended: false, spreadsheetUrl: "", ftsUpdated, ftsFileUrl };
    }

    const callOptions = await getWorkspaceCallOptionsForEmail(cleanEmail, params.req);
    const resolved = await resolveUserSpreadsheet({
      userEmail: cleanEmail,
      sheetType: "KAKAO",
      defaultTitle: "[SheetBot] 카카오톡 메시지 대장",
      preferOAuth: true,
      callOptions,
    });

    if (!resolved?.spreadsheetId) {
      return { updated: false, appended: false, spreadsheetUrl: "" };
    }

    const spreadsheetId = resolved.spreadsheetId;
    await ensureKakaoSheetStatusHeaders(spreadsheetId, callOptions);

    const sheetData = await callSheetsTool(
      "sheets_get_range",
      {
        spreadsheetId,
        range: "A1:I5000",
        preferOAuth: true,
      },
      callOptions
    ).catch(() => null);

    const rows: string[][] = Array.isArray(sheetData?.values) ? sheetData.values : [];
    const targetLogId = params.logId !== undefined && params.logId !== null ? String(params.logId).trim() : "";
    const targetRoom = (params.roomName || "").trim();
    const targetFileName = (params.fileName || "").trim();

    let targetRowIndex = -1;

    // 1순위: H열(메시지ID) 정확 일치
    if (targetLogId) {
      for (let i = rows.length - 1; i >= 1; i--) {
        const rowLogId = String(rows[i]?.[7] ?? "").trim();
        if (rowLogId && rowLogId === targetLogId) {
          targetRowIndex = i;
          break;
        }
      }
    }

    // 2순위: C열(채팅방) + E열(메시지 내용에 파일명 포함) 역순 매칭
    if (targetRowIndex === -1 && targetRoom && targetFileName) {
      for (let i = rows.length - 1; i >= 1; i--) {
        const rowRoom = String(rows[i]?.[2] ?? "").trim();
        const rowMsg = String(rows[i]?.[4] ?? "").trim();
        if (rowRoom === targetRoom && rowMsg.includes(targetFileName)) {
          targetRowIndex = i;
          break;
        }
      }
    }

    if (targetRowIndex !== -1) {
      const sheetRowNumber = targetRowIndex + 1;
      const existingLink = String(rows[targetRowIndex]?.[8] ?? "").trim();
      const existingLogId = String(rows[targetRowIndex]?.[7] ?? "").trim();
      const finalLogId = existingLogId || targetLogId;

      // 사진 묶음 등으로 여러 파일이 같은 logId에 매칭되면 줄바꿈으로 누적 (중복 링크 방지)
      let finalLink = params.webViewLink;
      if (existingLink && !existingLink.includes(params.webViewLink)) {
        finalLink = `${existingLink}\n${params.webViewLink}`;
      } else if (existingLink.includes(params.webViewLink)) {
        finalLink = existingLink;
      }

      await callSheetsTool(
        "sheets_update_range",
        {
          spreadsheetId,
          range: `H${sheetRowNumber}:I${sheetRowNumber}`,
          values: [[finalLogId, finalLink]],
          preferOAuth: true,
        },
        callOptions
      );

      return { updated: true, appended: false, spreadsheetUrl: resolved.spreadsheetUrl, ftsUpdated, ftsFileUrl };
    }

    // 매칭되는 기존 행이 없는 경우 신규 행으로 안전하게 기록
    const nowStr = getKoreanTimeString();
    const roomLabel = targetRoom || "대화방";
    const senderLabel = (params.senderName || roomLabel).trim();
    const deviceLabel = `🖥️ 내 PC(${(params.pcName || "Windows PC").trim()}) 카톡 첨부파일`;

    await callSheetsTool(
      "sheets_append_values",
      {
        spreadsheetId,
        range: "A:I",
        values: [[nowStr, "📎 PC카톡 첨부", roomLabel, senderLabel, `[파일: ${targetFileName}]`, deviceLabel, "정상", targetLogId, params.webViewLink]],
        preferOAuth: true,
      },
      callOptions
    );

    return { updated: false, appended: true, spreadsheetUrl: resolved.spreadsheetUrl, ftsUpdated, ftsFileUrl };
  } catch (err: any) {
    console.warn("[AiCopilotLearning] attachDriveLinkToKakaoSheetRow error:", err?.message || err);
    return { updated: false, appended: false, spreadsheetUrl: "", ftsUpdated, ftsFileUrl };
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
