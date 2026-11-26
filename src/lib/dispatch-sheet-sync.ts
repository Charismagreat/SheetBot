import { callSheetsTool } from "@/lib/egdesk-helpers";
import { getWorkspaceCallOptionsForEmail, HOST_WORKSPACE_OWNER_EMAIL } from "@/lib/auth";
import {
  HOST_KNOWN_SHEET_IDS,
  resolveUserSpreadsheet,
} from "@/lib/sheet-binding-helper";

export interface RecordDispatchParams {
  userEmail: string;
  dispatchTime?: string;
  direction?: "발신(SMS)" | "수신(SMS)" | "결제푸시" | string;
  ruleName?: string;
  recipient: string;
  content: string;
  status?: "SUCCESS" | "FAILED" | "INBOUND" | "PENDING" | string;
  errorMessage?: string | null;
  deviceId?: string;
  sheetTitle?: string;
  req?: Request;
}

// 90초 이내 완전 동일 메시지 중복 기록 방지를 위한 인메모리 디바운싱 맵
const recentDispatchDedupeMap = new Map<string, number>();

function cleanOldDispatchDedupeEntries() {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5분 지난 키 정리
  for (const [key, timestamp] of recentDispatchDedupeMap.entries()) {
    if (timestamp < cutoff) {
      recentDispatchDedupeMap.delete(key);
    }
  }
}

export interface RecordDispatchResult {
  success: boolean;
  spreadsheetUrl?: string;
  duplicated?: boolean;
  message?: string;
  error?: string;
}

const DEFAULT_DISPATCH_SHEET_TITLE = "[SheetBot] 고객 알림 발송 및 수신 대장";

/**
 * 회원별 [SheetBot] 고객 알림 발송 및 수신 대장 시트 URL 조회 (0초 캐시 및 바인딩)
 */
export async function getDispatchSheetUrl(
  userEmail: string,
  req?: Request
): Promise<string | null> {
  if (!userEmail) return null;
  try {
    const cleanEmail = userEmail.toLowerCase().trim();
    const callOptions = await getWorkspaceCallOptionsForEmail(cleanEmail, req);
    const resolved = await resolveUserSpreadsheet({
      userEmail: cleanEmail,
      sheetType: "DISPATCH_LOG",
      defaultTitle: DEFAULT_DISPATCH_SHEET_TITLE,
      preferOAuth: true,
      callOptions,
    });
    return resolved?.spreadsheetUrl || null;
  } catch (err: any) {
    console.warn("[DispatchSheetSync] getDispatchSheetUrl error:", err?.message);
    return null;
  }
}

/**
 * 🛡️ [Zero-Retention & 멀티테넌트 완전 격리]
 * 고객 알림 발송 및 수신 내역을 반드시 이용자 본인의 구글 OAuth 세션(callOptions)으로만
 * 본인 구글 스프레드시트에 기록합니다. (타 회원이 호스트 소유자 시트에 접근·기록하는 것을 100% 원천 차단)
 */
export async function recordDispatchToGoogleSheet(
  params: RecordDispatchParams
): Promise<RecordDispatchResult> {
  try {
    const {
      userEmail,
      dispatchTime,
      direction = "발신(SMS)",
      ruleName = "스마트 알림",
      recipient,
      content,
      status = "SUCCESS",
      errorMessage = null,
      deviceId = "SheetBot Agent",
      sheetTitle: rawSheetTitle = DEFAULT_DISPATCH_SHEET_TITLE,
      req,
    } = params;

    if (!userEmail) {
      return { success: false, error: "userEmail이 누락되었습니다." };
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const isHostOwner = cleanEmail === HOST_WORKSPACE_OWNER_EMAIL;
    const cleanRecipient = (recipient || "").trim();
    const cleanContent = (content || "").trim();

    // 🛡️ [1차 멀티테넌트 격리 가드] 일반 회원이 유효한 본인 Google OAuth 세션이 없으면 즉시 차단 (호스트 시트 유출 원천 방지)
    const callOptions = await getWorkspaceCallOptionsForEmail(cleanEmail, req);
    if (!isHostOwner && (!callOptions?.asVisitor || !callOptions?.visitorSessionId?.trim())) {
      return {
        success: false,
        error: `[GOOGLE_OAUTH_REQUIRED] 본인 구글 계정 연동이 완료되지 않아 대장 기록을 건너뛰었습니다. (${cleanEmail})`,
      };
    }

    // 🛡️ [90초 스마트 중복 방지 필터]
    const dedupeKey = `${cleanEmail}_${direction}_${cleanRecipient}_${cleanContent.slice(0, 30)}`;
    const nowMs = Date.now();
    const lastRecordedAt = recentDispatchDedupeMap.get(dedupeKey);

    if (lastRecordedAt && nowMs - lastRecordedAt < 90 * 1000) {
      console.log(`🛡️ [DispatchSheetSync] 90초 이내 중복 알림 감지 - 시트 기록 방어: ${dedupeKey}`);
      return {
        success: true,
        duplicated: true,
        message: "동일 알림 내역이 이미 대장에 기록되었습니다.",
      };
    }

    recentDispatchDedupeMap.set(dedupeKey, nowMs);
    cleanOldDispatchDedupeEntries();

    let sheetTitle = rawSheetTitle.trim();
    if (!sheetTitle.startsWith("[SheetBot]")) {
      sheetTitle = `[SheetBot] ${sheetTitle}`;
    }

    const nowStr =
      dispatchTime ||
      new Date().toISOString().replace("T", " ").slice(0, 19);

    // 1. 회원별 대장 고유 ID 영구 바인딩 및 즉시 조회 (실패 시 호스트 드라이브 폴백 절대 금지)
    const resolved = await resolveUserSpreadsheet({
      userEmail: cleanEmail,
      sheetType: "DISPATCH_LOG",
      defaultTitle: DEFAULT_DISPATCH_SHEET_TITLE,
      requestedTitle: sheetTitle,
      preferOAuth: true,
      callOptions,
    });

    const targetSpreadsheetId = resolved?.spreadsheetId || null;
    const spreadsheetUrl = resolved?.spreadsheetUrl || "";

    if (!targetSpreadsheetId) {
      return { success: false, error: "알림 발송 대장 스프레드시트를 생성하거나 찾을 수 없습니다." };
    }

    // 🛡️ [2차 멀티테넌트 격리 가드] 일반 회원이 호스트 소유자 시트 ID를 절대 수정하지 못하도록 최종 차단
    if (!isHostOwner && HOST_KNOWN_SHEET_IDS.has(targetSpreadsheetId)) {
      console.error(
        `[DispatchSheetSync] 🛡️ Cross-tenant write blocked! user=${cleanEmail}, sheet=${targetSpreadsheetId}`
      );
      return {
        success: false,
        error: "타 계정의 스프레드시트 접근이 보안 정책에 의해 차단되었습니다.",
      };
    }

    // 2. 자가 치유(Self-Healing) 헤더 검사 및 보장 (8열 표준 헤더, 반드시 callOptions 경유)
    const headerValues = [
      ["일시", "구분", "규칙/이벤트명", "대상 연락처", "메시지 내용", "발송 상태", "발신 기기", "오류 메시지"],
    ];

    const firstRowCheck = await callSheetsTool(
      "sheets_get_range",
      {
        spreadsheetId: targetSpreadsheetId,
        range: "A1:H1",
        preferOAuth: true,
      },
      callOptions
    ).catch(() => null);

    const firstRowValues = firstRowCheck?.values?.[0] || [];
    const hasHeader = firstRowValues.length > 0 && Boolean(firstRowValues[0]);

    if (!hasHeader) {
      await callSheetsTool(
        "sheets_update_range",
        {
          spreadsheetId: targetSpreadsheetId,
          range: "A1:H1",
          values: headerValues,
          preferOAuth: true,
        },
        callOptions
      ).catch(() => {});

      await callSheetsTool(
        "sheets_format_headers",
        {
          spreadsheetId: targetSpreadsheetId,
          tabName: "시트1",
          headerBgColor: "#1e1b4b", // Deep Indigo
          headerTextColor: "#e0e7ff", // Light Indigo Mint
          preferOAuth: true,
        },
        callOptions
      ).catch(() => {});
    }

    // 3. 상태 텍스트 한글화
    let statusLabel = status;
    if (status === "SUCCESS") statusLabel = "발송 성공";
    else if (status === "FAILED") statusLabel = "발송 실패";
    else if (status === "INBOUND") statusLabel = "수신 완료";
    else if (status === "PENDING") statusLabel = "대기 중";

    // 4. 새 발송/수신 내역 행 추가 (반드시 callOptions 경유)
    const newRowValues = [
      [nowStr, direction, ruleName, cleanRecipient, cleanContent, statusLabel, deviceId, errorMessage || "-"],
    ];

    await callSheetsTool(
      "sheets_append_values",
      {
        spreadsheetId: targetSpreadsheetId,
        range: "A:H",
        values: newRowValues,
        preferOAuth: true,
      },
      callOptions
    ).catch((err: any) => {
      console.warn("[DispatchSheetSync] append_values warning:", err.message);
    });

    return {
      success: true,
      spreadsheetUrl,
    };
  } catch (err: any) {
    console.error("[DispatchSheetSync] Error:", err);
    return { success: false, error: err.message };
  }
}
