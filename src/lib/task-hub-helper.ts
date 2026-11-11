import {
  callSheetsTool,
  listDriveFiles,
  queryTable,
  insertRows,
  callUserDataTool,
  callAiCaller,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { realtimeHub } from "@/lib/realtime-hub";
import { getKoreanTimeString } from "@/lib/date-utils";

export interface TaskItemInput {
  userEmail: string;
  userPhone?: string;
  ftsProjectId?: string;
  title?: string;
  taskTitle?: string;
  description?: string;
  sourceType: "CALL_RECORDING" | "MEETING_RECORDING" | "MISSED_CALL" | "ORDER_DELAY" | "ORDER" | "KAKAO" | "SMS";
  sourceId?: string;
  sourceRef?: string;
  contactName?: string;
  contactPhone?: string;
  dueDate?: string;
  priority?: string;
  badgeText?: string;
  deepLink?: string;
  skipFtsSync?: boolean;
}

export interface ParsedTaskItem {
  title: string;
  dueDate?: string;
  priority: "URGENT 🔴" | "HIGH 🟡" | "NORMAL ⚪";
}

function normalizePriority(raw?: string): "URGENT 🔴" | "HIGH 🟡" | "NORMAL ⚪" {
  if (!raw) return "NORMAL ⚪";
  const upper = raw.toUpperCase();
  if (upper.includes("URGENT") || upper.includes("긴급")) return "URGENT 🔴";
  if (upper.includes("HIGH") || upper.includes("높음")) return "HIGH 🟡";
  return "NORMAL ⚪";
}

// 사용자별 마스터 할 일 시트 ID 메모리 캐시 (0초 즉각 매핑)
const userTaskSheetCache = new Map<string, string>();

// 🛡️ 1시간 멱등성 메모리 캐시 (동일 출처 + 동일 제목 중복 등록 원천 차단)
const recentTasksMemoryCache = new Set<string>();

/**
 * 회원별 '[SheetBot] 통합 할 일 대장' 구글 스프레드시트 탐색 또는 자동 프로비저닝
 */
export async function resolveUserTaskSpreadsheet(userEmail: string): Promise<string | null> {
  const cleanEmail = userEmail.toLowerCase().trim();
  if (userTaskSheetCache.has(cleanEmail)) {
    return userTaskSheetCache.get(cleanEmail)!;
  }

  const sheetTitle = "[SheetBot] 통합 할 일 대장";

  try {
    // 1. 드라이브에서 기존 시트 탐색
    const searchRes = (await listDriveFiles(
      {
        query: `name = '${sheetTitle}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      },
      { preferOAuth: true }
    )) as any;

    const files = searchRes?.files || [];
    if (files.length > 0) {
      const sheetId = files[0].id;
      userTaskSheetCache.set(cleanEmail, sheetId);
      return sheetId;
    }

    // 2. 시트가 없으면 신규 생성
    const createRes = (await callSheetsTool("sheets_create_spreadsheet", {
      title: sheetTitle,
      preferOAuth: true,
    })) as any;

    const newSheetId = createRes?.spreadsheetId;
    if (newSheetId) {
      // 3. 마스터 헤더 초기화 및 열 서식 설정
      const headers = [
        "완료",
        "마감 기한",
        "중요도",
        "할 일 내용",
        "안내/상태 뱃지",
        "관련 고객",
        "출처 구분",
        "원본 바로가기",
        "완료 일시",
      ];

      await callSheetsTool("sheets_update_range", {
        spreadsheetId: newSheetId,
        range: "A1:I1",
        values: [headers],
        preferOAuth: true,
      }).catch(() => {});

      // 상단 헤더 서식 스타일링
      await callSheetsTool("sheets_format_headers", {
        spreadsheetId: newSheetId,
        tabName: "시트1",
        headers,
        theme: "emerald",
        preferOAuth: true,
      }).catch(() => {});

      userTaskSheetCache.set(cleanEmail, newSheetId);
      return newSheetId;
    }
  } catch (err: any) {
    console.warn(`[TaskHubHelper] Failed to resolve task spreadsheet for ${cleanEmail}:`, err.message);
  }

  return null;
}

/**
 * 스마트 통합 할 일 허브에 신규 과업 원자적 등록 (DB + 구글 시트 마스터 대장)
 */
export async function createTaskItem(input: TaskItemInput): Promise<{ success: boolean; taskId?: number }> {
  try {
    await setupDatabase();
    const cleanEmail = input.userEmail.toLowerCase().trim();
    const nowStr = getKoreanTimeString();
    const priority = normalizePriority(input.priority);
    const status = "PENDING";
    const taskId = Date.now();
    const finalTitle = (input.taskTitle || input.title || "새로운 할 일").trim();
    const finalSourceId = input.sourceRef || input.sourceId || null;
    // 🛡️ 중복 방어 키 생성 (사용자 + 출처식별자 + 할일제목)
    const idempotencyKey = `${cleanEmail}::${finalSourceId || 'none'}::${finalTitle}`;
    if (recentTasksMemoryCache.has(idempotencyKey)) {
      console.log(`[TaskHubHelper] 🛡️ Duplicate task blocked by memory cache: "${finalTitle}" (${finalSourceId})`);
      return { success: true, taskId };
    }

    // DB 기존 등록 여부 사전 검증
    if (finalSourceId) {
      const existingRes = await queryTable("sheetbot_tasks", {
        filters: {
          user_email: cleanEmail,
          source_id: String(finalSourceId),
        },
        limit: 50,
      }).catch(() => ({ rows: [] }));

      const isDuplicate = (existingRes?.rows || []).some(
        (r: any) => !r.deleted_at && String(r.title).trim() === finalTitle
      );

      if (isDuplicate) {
        console.log(`[TaskHubHelper] 🛡️ Task already registered in DB: "${finalTitle}" (${finalSourceId}). Skipping duplicate.`);
        recentTasksMemoryCache.add(idempotencyKey);
        return { success: true, taskId };
      }
    }

    recentTasksMemoryCache.add(idempotencyKey);
    setTimeout(() => recentTasksMemoryCache.delete(idempotencyKey), 3600000);


    // 1. My DB sheetbot_tasks 테이블 적재
    await insertRows("sheetbot_tasks", [
      {
        id: taskId,
        user_email: cleanEmail,
        title: finalTitle,
        description: input.description || null,
        source_type: input.sourceType,
        source_id: finalSourceId,
        contact_name: input.contactName || null,
        contact_phone: input.contactPhone || null,
        due_date: input.dueDate || null,
        priority: priority,
        status: status,
        badge_text: input.badgeText || null,
        deep_link: input.deepLink || null,
        created_at: nowStr,
        updated_at: nowStr,
        updated_by: "system",
      },
    ]);

    // 2. 구글 스프레드시트 마스터 대장에 원자적 행 추가 (비동기 병렬)
    void (async () => {
      try {
        const sheetId = await resolveUserTaskSpreadsheet(cleanEmail);
        if (sheetId) {
          const sourceIcon = whenSourceTypeToIcon(input.sourceType);
          const contactDisplay = input.contactName
            ? (input.contactPhone ? `${input.contactName} (${input.contactPhone})` : input.contactName)
            : (input.contactPhone || "-");

          const linkFormula = input.deepLink
            ? (input.deepLink.startsWith("http") ? `=HYPERLINK("${input.deepLink}", "▶ 바로가기")` : input.deepLink)
            : "-";

          const rowValues = [
            [
              false, // A열: 완료 체크박스
              input.dueDate || "-",
              priority,
              finalTitle,
              input.badgeText || "-",
              contactDisplay,
              sourceIcon,
              linkFormula,
              "-", // I열: 완료 일시
            ],
          ];

          await callSheetsTool("sheets_append_values", {
            spreadsheetId: sheetId,
            range: "A:I",
            values: rowValues,
            preferOAuth: true,
          });
        }
      } catch (sheetErr: any) {
        console.warn(`[TaskHubHelper] Sheet append warning:`, sheetErr.message);
      }
    })();

    // 3. 파일투시트(FileToSheet / 파투) '통합할일대장' 시트에 양방향 자동 기록 (비동기 병렬)
    if (!input.skipFtsSync) {
      void syncTaskItemToFileToSheet(
        cleanEmail,
        {
          id: taskId,
          title: finalTitle,
          description: input.description || null,
          sourceType: input.sourceType,
          sourceId: finalSourceId ? String(finalSourceId) : undefined,
          contactName: input.contactName || null,
          contactPhone: input.contactPhone || null,
          dueDate: input.dueDate || null,
          priority,
          status,
          badgeText: input.badgeText || null,
          createdAt: nowStr,
        },
        {
          phoneNumber: input.userPhone,
          projectId: input.ftsProjectId,
        }
      ).catch((ftsErr: any) => {
        console.warn(`[TaskHubHelper] FileToSheet task sync warning:`, ftsErr?.message);
      });
    }

    // 4. SSE DB Watcher 변경 알림 브로드캐스트
    realtimeHub.notifyTableChanged("sheetbot_tasks");

    return { success: true, taskId };
  } catch (err: any) {
    console.error("[TaskHubHelper] createTaskItem failed:", err);
    return { success: false };
  }
}

/**
 * 부재중 전화 사후 자동 해결 (Auto-Resolve Engine)
 * - 통화 녹음이 업로드되거나 발신 통화가 성사되었을 때, 해당 고객 번호의 PENDING 부재중 전화 할 일을 찾아 자동 완료
 */
export async function autoResolveMissedCallTasks(userEmail: string, contactPhone: string): Promise<number> {
  if (!contactPhone || contactPhone.length < 8) return 0;
  try {
    await setupDatabase();
    const cleanEmail = userEmail.toLowerCase().trim();
    const cleanPhone = contactPhone.replace(/[^0-9]/g, "");

    // 1. 해당 고객의 PENDING 부재중 전화 과업 조회
    const queryRes = await queryTable("sheetbot_tasks", {
      filters: {
        user_email: cleanEmail,
        source_type: "MISSED_CALL",
        status: "PENDING",
      },
      limit: 10,
    }).catch(() => ({ rows: [] }));

    const matchedTasks = (queryRes.rows || []).filter((r: any) => {
      const taskPhone = (r.contact_phone || r.contact_name || "").replace(/[^0-9]/g, "");
      return taskPhone.length >= 8 && (taskPhone.includes(cleanPhone) || cleanPhone.includes(taskPhone));
    });

    if (matchedTasks.length === 0) return 0;

    const nowStr = getKoreanTimeString();
    let resolvedCount = 0;

    for (const task of matchedTasks) {
      await callUserDataTool("user_data_update_rows", {
        tableName: "sheetbot_tasks",
        filters: { id: task.id },
        updates: {
          status: "DONE",
          completed_at: nowStr,
          completed_by: "auto-callback",
          updated_at: nowStr,
          badge_text: "재통화 완료(자동해결)",
        },
      }).catch(() => {});
      resolvedCount++;
    }

    if (resolvedCount > 0) {
      realtimeHub.notifyTableChanged("sheetbot_tasks");
      console.log(`[TaskHubHelper] 🎉 Auto-resolved ${resolvedCount} missed call task(s) for ${contactPhone}`);
    }

    return resolvedCount;
  } catch (err: any) {
    console.warn("[TaskHubHelper] autoResolveMissedCallTasks error:", err.message);
    return 0;
  }
}

/**
 * 통화 녹음 AI STT actionItems 원문에서 개별 과업 분리 파싱
 */
export function parseActionItems(actionItemsText: string): ParsedTaskItem[] {
  if (!actionItemsText || actionItemsText.trim().length === 0) return [];
  const lines = actionItemsText.split("\n");
  const result: ParsedTaskItem[] = [];

  for (const line of lines) {
    const cleaned = line.replace(/^[•\-\*\d\.\s]+/, "").trim();
    if (
      cleaned.length >= 4 &&
      !cleaned.includes("확인 완료") &&
      !cleaned.includes("특이사항 없음") &&
      !/^\[후속\s*조치\s*\d*\]$/i.test(cleaned) &&
      !cleaned.startsWith("(없음") &&
      !cleaned.startsWith("없음 -")
    ) {
      let priority: "URGENT 🔴" | "HIGH 🟡" | "NORMAL ⚪" = "NORMAL ⚪";
      if (cleaned.includes("긴급") || cleaned.includes("당일") || cleaned.includes("즉시")) {
        priority = "URGENT 🔴";
      } else if (cleaned.includes("내일") || cleaned.includes("확인 요망") || cleaned.includes("콜백")) {
        priority = "HIGH 🟡";
      }

      // 기한 추론
      let dueDate: string | undefined = undefined;
      const today = new Date();
      if (cleaned.includes("오늘") || cleaned.includes("당일")) {
        dueDate = today.toISOString().slice(0, 10);
      } else if (cleaned.includes("내일")) {
        const tomorrow = new Date(today.getTime() + 86400000);
        dueDate = tomorrow.toISOString().slice(0, 10);
      }

      result.push({
        title: cleaned,
        dueDate,
        priority,
      });
    }
  }

  return result;
}

/**
 * 간편 주문 대장 지연 감지기 (Order Delay Threshold Sweeper)
 * - 24시간 미입금: [안내요망] 뱃지와 함께 할 일 등록
 * - 결제 후 48시간 미출고: [출고지연 🔴] 뱃지와 함께 할 일 등록
 */
export async function checkOrderDelayTasks(userEmail: string): Promise<{ unbilledCount: number; delayedCount: number }> {
  const cleanEmail = userEmail.toLowerCase().trim();
  let unbilledCount = 0;
  let delayedCount = 0;

  try {
    await setupDatabase();
    const quotesRes = await queryTable("sheetbot_quotes", {
      filters: { user_email: cleanEmail },
      limit: 100,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const quotes = quotesRes.rows || [];
    if (quotes.length === 0) return { unbilledCount: 0, delayedCount: 0 };

    // 기존에 등록된 미완료(PENDING) ORDER_DELAY 할 일 조회 (중복 등록 방어)
    const existingTasksRes = await queryTable("sheetbot_tasks", {
      filters: { user_email: cleanEmail, status: "PENDING" },
      limit: 100,
    }).catch(() => ({ rows: [] }));

    const existingSourceIds = new Set(
      (existingTasksRes.rows || []).map((t: any) => `${t.source_id}_${t.badge_text}`)
    );

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const twoDaysMs = 48 * 60 * 60 * 1000;

    for (const q of quotes) {
      if (q.deleted_at) continue;
      const orderId = String(q.id);
      const createdAt = new Date(q.created_at || q.viewed_at || 0).getTime();
      const elapsed = now - createdAt;
      const status = String(q.status || "접수").toUpperCase();
      const customer = q.customer_name || "고객";
      const phone = q.customer_phone || "";

      // 1. 주문 후 24시간 경과 미입금 건
      const isUnpaid = ["ORDERED", "접수", "PENDING"].includes(status);
      if (isUnpaid && elapsed >= oneDayMs) {
        const badgeText = "안내요망";
        const key = `${orderId}_${badgeText}`;
        if (!existingSourceIds.has(key)) {
          await createTaskItem({
            userEmail: cleanEmail,
            sourceType: "ORDER_DELAY",
            sourceId: orderId,
            contactName: `${customer} (${phone})`,
            contactPhone: phone,
            title: `[미입금 안내요망] ${customer}님 주문 입금 확인 및 안내 (24시간 경과)`,
            dueDate: new Date().toISOString().slice(0, 10),
            priority: "HIGH 🟡",
            badgeText,
          });
          existingSourceIds.add(key);
          unbilledCount++;
        }
      }

      // 2. 결제 완료 후 48시간 경과 미출고 건
      const isPaid = ["PAID", "결제완료"].includes(status);
      if (isPaid && elapsed >= twoDaysMs) {
        const badgeText = "출고지연 🔴";
        const key = `${orderId}_${badgeText}`;
        if (!existingSourceIds.has(key)) {
          await createTaskItem({
            userEmail: cleanEmail,
            sourceType: "ORDER_DELAY",
            sourceId: orderId,
            contactName: `${customer} (${phone})`,
            contactPhone: phone,
            title: `[출고지연 🔴] ${customer}님 주문 48시간 미출고 긴급 조치`,
            dueDate: new Date().toISOString().slice(0, 10),
            priority: "URGENT 🔴",
            badgeText,
          });
          existingSourceIds.add(key);
          delayedCount++;
        }
      }
    }
  } catch (err: any) {
    console.warn(`[TaskHubHelper] checkOrderDelayTasks error:`, err.message);
  }

  return { unbilledCount, delayedCount };
}

function whenSourceTypeToIcon(type: string): string {
  switch (type) {
    case "CALL_RECORDING":
      return "🎙️ 통화 녹음";
    case "MEETING_RECORDING":
      return "🎙️ 회의 녹음";
    case "MISSED_CALL":
      return "📞 부재중 전화";
    case "ORDER_DELAY":
      return "📦 주문 지연";
    case "KAKAO":
      return "💬 카카오톡";
    case "SMS":
      return "📱 문자 메시지";
    default:
      return "📋 일반 과업";
  }
}

export interface MessageTaskExtractInput {
  userEmail: string;
  sourceType: "SMS" | "KAKAO";
  message: string;
  contactName?: string;
  contactPhone?: string;
  chatRoomName?: string;
  timestamp?: string;
  sourceId?: string;
  deepLink?: string;
}

/**
 * AI Caller 응답 텍스트에서 2중 메타데이터 래퍼({ content: "..." }) 및 마크다운 코드 블록을 안전하게 언래핑하여 JSON 객체 반환
 */
function unwrapMessageTasksJson(rawText: string): any {
  if (!rawText) return null;
  let text = String(rawText).trim();

  // 1단계: 메타데이터 래퍼 JSON({ content: "..." }) 언래핑
  if (text.startsWith("{")) {
    try {
      const firstPass = JSON.parse(text);
      if (firstPass && typeof firstPass.content === "string") {
        text = firstPass.content.trim();
      } else if (firstPass && Array.isArray(firstPass.tasks)) {
        return firstPass;
      }
    } catch {}
  }

  // 2단계: 마크다운 코드 펜스(```json ... ```) 제거 후 파싱
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
  }
  return null;
}

/**
 * 광고, OTP 인증번호, 단순 입출금/결제 알림, 택배 배송 완료 등 할 일 추출 제외 대상인지 판별
 * 또한 실질적인 업무 요청/일정/확인/회신 단서가 포함되어 있는지 1차 고속 필터링 (Zero-Waste Token Guard)
 */
export function isActionableBusinessMessage(rawMessage: string): boolean {
  if (!rawMessage) return false;
  const text = rawMessage.replace(/^\[Web발신\]\s*/i, "").trim();
  if (text.length < 6) return false;

  // 1. 스팸/광고성 메시지 제외
  if (/\(광고\)|\[광고\]|무료수신거부|수신거부\s*080/i.test(text)) {
    return false;
  }

  // 2. 일회용 인증번호(OTP) 및 보안코드 제외
  if (/인증번호|보안코드|확인코드|본인확인.*\[\d{4,6}\]|\[\d{4,6}\].*인증/i.test(text)) {
    return false;
  }

  // 3. 단순 택배 배송/배달 완료 시스템 알림 제외
  if (/택배.*배송.*완료|배달이?\s*완료되었습니다|운송장\s*번호.*배송/i.test(text)) {
    return false;
  }

  // 4. 순수 은행 입출금 / 카드 결제 승인 알림 제외 (단, 사람이 직접 요청하는 문장이 함께 있는 경우는 허용)
  const isBankOrCardAlert =
    /(?:신한|국민|KB|우리|하나|농협|NH|기업|IBK|카카오뱅크|토스뱅크|새마을|우체국|수협|신협|씨티|SC제일|현대카드|삼성카드|롯데카드|비씨카드|BC카드)[\s\S]{0,40}(?:입금|출금|승인|잔액|체크|결제)/i.test(
      text
    );
  const hasHumanRequestVerb =
    /부탁|요청|주세요|주시면|바랍니다|확인해|보내주|발행해|연락주|전화주|회신/i.test(text);
  if (isBankOrCardAlert && !hasHumanRequestVerb) {
    return false;
  }

  // 5. 업무 요청·회신·일정·서류·결제/발주 단서 포함 여부 검사
  const actionableCueRegex =
    /부탁|요청|주세요|주시면|바랍니다|바래요|요망|확인해|체크해|알려주|보내주|전달해|회신|답장|연락|전화|콜백|통화|견적|발주|세금계산서|계산서|거래명세서|영수증|계약서|제안서|시안|도면|샘플|파일|자료|송금|입금|결제|정산|환불|출고|납품|배송|발송|주문|예약|접수|수정|변경|취소|미팅|회의|방문|출장|일정|약속|내일|모레|오늘|금일|명일|이번\s*주|다음\s*주|월요일|화요일|수요일|목요일|금요일|\d{1,2}월\s*\d{1,2}일|\d{1,2}시\s*(?:반|\d{1,2}분)?|까지|언제|가능한가요|가능할까요|되나요|\?/;

  return actionableCueRegex.test(text);
}

/**
 * 메시지 본문에서 마감 기한(YYYY-MM-DD) 추론 헬퍼
 */
function inferDueDateFromText(text: string): string | undefined {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kstNow.getUTCFullYear();

  // YYYY-MM-DD 명시
  const isoMatch = text.match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/);
  if (isoMatch) {
    const m = isoMatch[2].padStart(2, "0");
    const d = isoMatch[3].padStart(2, "0");
    return `${isoMatch[1]}-${m}-${d}`;
  }

  // M월 D일 명시
  const mdMatch = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (mdMatch) {
    const m = mdMatch[1].padStart(2, "0");
    const d = mdMatch[2].padStart(2, "0");
    return `${year}-${m}-${d}`;
  }

  if (/오늘|당일|금일|지금\s*바로|즉시/.test(text)) {
    return kstNow.toISOString().slice(0, 10);
  }
  if (/내일|명일/.test(text)) {
    const tomorrow = new Date(kstNow.getTime() + 86400000);
    return tomorrow.toISOString().slice(0, 10);
  }
  if (/모레/.test(text)) {
    const dayAfter = new Date(kstNow.getTime() + 2 * 86400000);
    return dayAfter.toISOString().slice(0, 10);
  }
  return undefined;
}

/**
 * AI Caller 지연/오류 시 즉시 작동하는 결정론적 규칙 기반 할 일 추출 폴백 (Heuristic Fallback)
 */
function extractTasksFromMessageHeuristic(
  cleanText: string,
  senderLabel: string,
  sourceType: "SMS" | "KAKAO"
): Array<{ title: string; dueDate?: string; priority: string; badgeText: string }> {
  const dueDate = inferDueDateFromText(cleanText);
  const isUrgent = /긴급|급한|급히|즉시|당장|오늘까지|금일\s*중|바랍니다/.test(cleanText);
  const priority = isUrgent ? "URGENT 🔴" : "HIGH 🟡";
  const prefix = senderLabel && senderLabel !== "미등록 연락처" ? `[${senderLabel}] ` : "";

  let summary = cleanText
    .replace(/\s+/g, " ")
    .trim();
  if (summary.length > 56) {
    summary = summary.slice(0, 56) + "...";
  }

  let badgeText = sourceType === "KAKAO" ? "카톡 요청" : "문자 요청";
  if (/견적|발주|단가/.test(cleanText)) badgeText = "견적/발주";
  else if (/세금계산서|계산서|입금|송금|결제|정산/.test(cleanText)) badgeText = "정산/계산서";
  else if (/미팅|회의|방문|일정|약속|\d{1,2}시/.test(cleanText)) badgeText = "일정/약속";
  else if (/연락|전화|콜백|회신|답장/.test(cleanText)) badgeText = "회신요망";
  else if (/출고|납품|배송|발송/.test(cleanText)) badgeText = "출고/납품";

  return [
    {
      title: `${prefix}${summary}`,
      dueDate,
      priority,
      badgeText,
    },
  ];
}

/**
 * 📱💬 수신된 문자(SMS/LMS) 및 카카오톡 메시지에서 AI가 할 일(Action Item)을 실시간 추출하여
 * 스마트 통합 할 일 허브(sheetbot_tasks + [SheetBot] 통합 할 일 대장)에 자동 등록
 */
export async function extractAndCreateTasksFromMessage(
  input: MessageTaskExtractInput
): Promise<{ extractedCount: number; taskIds: number[] }> {
  const taskIds: number[] = [];
  try {
    const rawMsg = (input.message || "").trim();
    if (!isActionableBusinessMessage(rawMsg)) {
      return { extractedCount: 0, taskIds };
    }

    const cleanText = rawMsg.replace(/^\[Web발신\]\s*/i, "").trim();
    const senderLabel =
      input.contactName && input.contactName !== "미등록 연락처"
        ? input.contactName.trim()
        : input.chatRoomName && input.chatRoomName !== "미지정 방"
        ? input.chatRoomName.trim()
        : input.contactPhone || "고객";

    const channelLabel = input.sourceType === "KAKAO" ? "카카오톡" : "문자 메시지(SMS)";
    const todayIso = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let extractedTasks: Array<{
      title: string;
      dueDate?: string;
      priority: string;
      badgeText?: string;
    }> = [];

    // 1. 이지데스크 표준 AI Caller 호출 (6초 타임아웃 방어 + 2중 언래핑)
    try {
      const prompt = [
        `오늘 날짜: ${todayIso}`,
        `수신 채널: ${channelLabel}`,
        `발신자/대화방: ${senderLabel}${input.contactPhone ? ` (${input.contactPhone})` : ""}`,
        `메시지 원문:`,
        `"""`,
        cleanText.slice(0, 800),
        `"""`,
        ``,
        `위 메시지에서 수신자(사용자)가 처리해야 할 실질적인 업무 할 일(Action Item: 견적/자료 발송, 회신/콜백, 미팅/방문 일정, 발주/출고/입금/세금계산서 처리, 확인 요청 등)만 추출하여 아래 JSON 형식으로만 응답하세요.`,
        `단순 인사, 광고, 단순 알림, 할 일이 없는 잡담이면 {"tasks": []}를 반환하세요.`,
        `할 일 제목(title)에는 발신자명과 핵심 행동을 45자 이내로 명확히 작성하세요 (예: "${senderLabel}님께 수정 견적서 발송").`,
        `JSON 형식:`,
        `{"tasks":[{"title":"할 일 내용","dueDate":"YYYY-MM-DD 또는 빈 문자열","priority":"URGENT 또는 HIGH 또는 NORMAL","badgeText":"견적/발주 | 일정/약속 | 회신요망 | 정산/계산서 | 카톡 요청 | 문자 요청 중 택1"}]}`,
      ].join("\n");

      const aiRes = await Promise.race([
        callAiCaller(prompt, {
          caller: "sheetbot-message-task-extractor",
          temperature: 0.1,
          maxOutputTokens: 350,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
      ]);

      if (aiRes && aiRes.text) {
        const parsed = unwrapMessageTasksJson(aiRes.text);
        if (parsed && Array.isArray(parsed.tasks)) {
          for (const item of parsed.tasks.slice(0, 3)) {
            const t = String(item?.title || "").trim();
            if (t.length >= 4 && !t.startsWith("(없음") && !t.includes("할 일 없음")) {
              extractedTasks.push({
                title: t,
                dueDate:
                  item?.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(String(item.dueDate).trim())
                    ? String(item.dueDate).trim()
                    : inferDueDateFromText(cleanText),
                priority: String(item?.priority || "HIGH"),
                badgeText:
                  String(item?.badgeText || "").trim() ||
                  (input.sourceType === "KAKAO" ? "카톡 요청" : "문자 요청"),
              });
            }
          }
        } else {
          // JSON 파싱에 실패한 경우 규칙 기반 폴백 작동
          extractedTasks = extractTasksFromMessageHeuristic(
            cleanText,
            senderLabel,
            input.sourceType
          );
        }
      } else {
        // AI 타임아웃 시 규칙 기반 폴백 작동
        extractedTasks = extractTasksFromMessageHeuristic(
          cleanText,
          senderLabel,
          input.sourceType
        );
      }
    } catch (aiErr: any) {
      console.warn("[TaskHubHelper] AI task extraction fallback:", aiErr?.message);
      extractedTasks = extractTasksFromMessageHeuristic(
        cleanText,
        senderLabel,
        input.sourceType
      );
    }

    if (extractedTasks.length === 0) {
      return { extractedCount: 0, taskIds };
    }

    // 2. 추출된 할 일을 sheetbot_tasks DB 및 [SheetBot] 통합 할 일 대장 시트에 등록
    const baseSourceId =
      input.sourceId ||
      `${input.sourceType}_${senderLabel}_${cleanText.slice(0, 24).replace(/\s+/g, "_")}`;

    for (const task of extractedTasks) {
      const created = await createTaskItem({
        userEmail: input.userEmail,
        title: task.title,
        description: cleanText.slice(0, 300),
        sourceType: input.sourceType,
        sourceId: baseSourceId,
        contactName:
          input.contactName && input.contactName !== "미등록 연락처"
            ? input.contactName
            : input.chatRoomName || senderLabel,
        contactPhone: input.contactPhone,
        dueDate: task.dueDate,
        priority: task.priority,
        badgeText: task.badgeText || (input.sourceType === "KAKAO" ? "카톡 요청" : "문자 요청"),
        deepLink: input.deepLink,
      });
      if (created.success && created.taskId) {
        taskIds.push(created.taskId);
      }
    }

    if (taskIds.length > 0) {
      console.log(
        `[TaskHubHelper] ✅ Extracted ${taskIds.length} task(s) from ${input.sourceType} (${senderLabel})`
      );
    }
  } catch (err: any) {
    console.warn("[TaskHubHelper] extractAndCreateTasksFromMessage error:", err?.message);
  }

  return { extractedCount: taskIds.length, taskIds };
}

// ============================================================================
// 🔗 파일투시트(FileToSheet / 파투) '통합할일대장' 및 기존 시트 양방향 할 일 연동 엔진
// ============================================================================

const userFtsPhoneCache = new Map<string, string>();
const FTS_INTERNAL_ENDPOINTS = [
  "https://file2sheet.cloud",
  "https://tunneling-service.onrender.com/t/mcp-server-fxkud1-i01o2oa/p/FileToSheet",
  "http://127.0.0.1:4007",
  "http://127.0.0.1:3005",
  "http://localhost:4007",
  "http://localhost:3005",
];

/**
 * 시트봇 사용자 이메일 또는 명시적 전화번호로부터 파일투시트 연동 휴대폰 번호 조회 (메모리 캐싱)
 */
export async function resolveUserFtsPhoneNumber(
  userEmail: string,
  explicitPhone?: string | null
): Promise<string | null> {
  const cleanExplicit = String(explicitPhone || "").replace(/[^0-9]/g, "");
  const cleanEmail = (userEmail || "").toLowerCase().trim();

  if (cleanExplicit.length >= 10) {
    if (cleanEmail) userFtsPhoneCache.set(cleanEmail, cleanExplicit);
    return cleanExplicit;
  }

  if (!cleanEmail) return null;

  // 이메일 자체가 010xxxxxxxx@... 형태인 경우
  const emailPhoneMatch = cleanEmail.match(/^(01[016789]\d{7,8})@/);
  if (emailPhoneMatch) {
    userFtsPhoneCache.set(cleanEmail, emailPhoneMatch[1]);
    return emailPhoneMatch[1];
  }

  const cached = userFtsPhoneCache.get(cleanEmail);
  if (cached) return cached;

  try {
    // 1순위: sheetbot_users 테이블에서 phone 확인
    const userRes = await queryTable("sheetbot_users", {
      filters: { email: cleanEmail },
      limit: 5,
    }).catch(() => ({ rows: [] }));

    for (const r of userRes?.rows || []) {
      if (r.deleted_at) continue;
      const p = String(r.phone || "").replace(/[^0-9]/g, "");
      if (p.length >= 10) {
        userFtsPhoneCache.set(cleanEmail, p);
        return p;
      }
    }

    // 2순위: sheetbot_user_devices 테이블에서 phone_number 확인
    const devRes = await queryTable("sheetbot_user_devices", {
      filters: { user_email: cleanEmail },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 10,
    }).catch(() => ({ rows: [] }));

    for (const d of devRes?.rows || []) {
      if (d.deleted_at) continue;
      const p = String(d.phone_number || "").replace(/[^0-9]/g, "");
      if (p.length >= 10) {
        userFtsPhoneCache.set(cleanEmail, p);
        return p;
      }
    }
  } catch (err: any) {
    console.warn("[TaskHubHelper] resolveUserFtsPhoneNumber warning:", err?.message);
  }

  return null;
}

/**
 * 시트봇에서 생성된 할 일(단건 또는 다건)을 파일투시트 '통합할일대장' 시트에 자동 기록
 */
export async function syncTaskItemToFileToSheet(
  userEmail: string,
  taskPayload: Record<string, any> | Array<Record<string, any>>,
  options?: { phoneNumber?: string | null; projectId?: string | null }
): Promise<boolean> {
  const phone = await resolveUserFtsPhoneNumber(userEmail, options?.phoneNumber);
  const projectId = options?.projectId || "";
  if (!phone && !projectId) return false;

  const tasks = Array.isArray(taskPayload) ? taskPayload : [taskPayload];
  if (tasks.length === 0) return false;

  const bodyStr = JSON.stringify({
    phoneNumber: phone || undefined,
    projectId: projectId || undefined,
    tasks,
  });

  for (const baseUrl of FTS_INTERNAL_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${baseUrl}/api/inbox/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(phone ? { "x-user-phone": phone } : {}),
        },
        body: bodyStr,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json?.success) return true;
      }
    } catch {
      // 다음 엔드포인트 폴백
    }
  }
  return false;
}

/**
 * 시트봇에서 완료/미완료 토글 시 파일투시트 '통합할일대장' 상태 동시 업데이트
 */
export async function syncTaskStatusToFileToSheet(
  userEmail: string,
  params: {
    taskId?: number;
    title?: string;
    status: "PENDING" | "DONE";
    phoneNumber?: string | null;
    projectId?: string | null;
  }
): Promise<boolean> {
  const phone = await resolveUserFtsPhoneNumber(userEmail, params.phoneNumber);
  const projectId = params.projectId || "";
  if (!phone && !projectId) return false;

  const bodyStr = JSON.stringify({
    phoneNumber: phone || undefined,
    projectId: projectId || undefined,
    taskId: params.taskId,
    title: params.title,
    status: params.status,
  });

  for (const baseUrl of FTS_INTERNAL_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${baseUrl}/api/inbox/tasks`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(phone ? { "x-user-phone": phone } : {}),
        },
        body: bodyStr,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json?.success) return true;
      }
    } catch {
      // 다음 엔드포인트 폴백
    }
  }
  return false;
}

/**
 * 파일투시트(파투)의 '통합할일대장' 및 기존 업무 시트(통화녹음, 회의록, 부재중, 문자, 카톡, 주문/견적 등)에서
 * 할 일 목록을 가져오고 시트봇 DB(sheetbot_tasks)와 양방향 동기화 수행
 */
export async function fetchAndSyncTasksFromFileToSheet(
  userEmail: string,
  options?: {
    phoneNumber?: string | null;
    projectId?: string | null;
    existingSheetBotTasks?: any[];
  }
): Promise<any[]> {
  const cleanEmail = (userEmail || "").toLowerCase().trim();
  const phone = await resolveUserFtsPhoneNumber(cleanEmail, options?.phoneNumber);
  const projectId = options?.projectId || "";
  if (!phone && !projectId) return [];

  const query = new URLSearchParams();
  if (phone) query.set("phoneNumber", phone);
  if (projectId) query.set("projectId", projectId);

  let ftsTasks: any[] = [];
  for (const baseUrl of FTS_INTERNAL_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${baseUrl}/api/inbox/tasks?${query.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(phone ? { "x-user-phone": phone } : {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json?.success && Array.isArray(json.tasks)) {
          ftsTasks = json.tasks;
          break;
        }
      }
    } catch {
      // 다음 엔드포인트 폴백
    }
  }

  // 1. 시트봇에는 있으나 파투 통합할일대장에 아직 없는 과업을 파투로 백그라운드 푸시
  const existingSbTasks = options?.existingSheetBotTasks || [];
  if (existingSbTasks.length > 0) {
    const ftsTitleSet = new Set(ftsTasks.map((t: any) => String(t.title || "").trim()));
    const missingInFts = existingSbTasks
      .filter((t: any) => !t.deleted_at && t.title && !ftsTitleSet.has(String(t.title).trim()))
      .slice(0, 30)
      .map((t: any) => ({
        title: t.title,
        description: t.description,
        sourceType: t.source_type,
        sourceId: t.source_id,
        contactName: t.contact_name,
        contactPhone: t.contact_phone,
        dueDate: t.due_date,
        priority: t.priority,
        status: t.status,
        badgeText: t.badge_text,
        createdAt: t.created_at,
        completedAt: t.completed_at,
      }));

    if (missingInFts.length > 0) {
      void syncTaskItemToFileToSheet(cleanEmail, missingInFts, { phoneNumber: phone, projectId }).catch(() => {});
    }
  }

  // 2. 파투 시트에서 추출/조회된 할 일 중 시트봇 DB에 없는 항목은 시트봇 DB(sheetbot_tasks)에도 적재
  if (cleanEmail && ftsTasks.length > 0) {
    const sbTitleSet = new Set(existingSbTasks.map((t: any) => String(t.title || "").trim()));
    const nowStr = getKoreanTimeString();
    const rowsToInsert: any[] = [];

    for (const ft of ftsTasks) {
      const fTitle = String(ft.title || "").trim();
      if (!fTitle || sbTitleSet.has(fTitle)) continue;
      sbTitleSet.add(fTitle);

      rowsToInsert.push({
        id: Date.now() + Math.floor(Math.random() * 10000),
        user_email: cleanEmail,
        title: fTitle,
        description: ft.description || null,
        source_type: ft.source_type || "SMS",
        source_id: ft.source_id || `fts_${Date.now()}`,
        contact_name: ft.contact_name || null,
        contact_phone: ft.contact_phone || null,
        due_date: ft.due_date || null,
        priority: ft.priority || "HIGH 🟡",
        status: ft.status === "DONE" ? "DONE" : "PENDING",
        badge_text: ft.badge_text || "파투 시트 연동",
        deep_link: null,
        completed_at: ft.status === "DONE" ? ft.completed_at || nowStr : null,
        completed_by: ft.status === "DONE" ? "filetosheet" : null,
        created_at: ft.created_at || nowStr,
        updated_at: nowStr,
        updated_by: "filetosheet_sync",
      });
    }

    if (rowsToInsert.length > 0) {
      await insertRows("sheetbot_tasks", rowsToInsert).catch((e: any) =>
        console.warn("[TaskHubHelper] FTS -> sheetbot_tasks insert warning:", e?.message)
      );
    }
  }

  return ftsTasks;
}


