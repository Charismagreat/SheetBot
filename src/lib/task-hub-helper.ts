import {
  callSheetsTool,
  listDriveFiles,
  queryTable,
  insertRows,
  callUserDataTool,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { realtimeHub } from "@/lib/realtime-hub";
import { getKoreanTimeString } from "@/lib/date-utils";

export interface TaskItemInput {
  userEmail: string;
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

    // 3. SSE DB Watcher 변경 알림 브로드캐스트
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
    if (cleaned.length >= 4 && !cleaned.includes("확인 완료") && !cleaned.includes("특이사항 없음")) {
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
