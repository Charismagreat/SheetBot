import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export interface DispatchLog {
  id: string;
  uuid?: string | null;
  channel: "SMS" | "EMAIL";
  event_type: "inquiry" | "tax_invoice" | "payment" | "test" | "other";
  rule_name?: string;
  recipient: string;
  recipient_type: "ADMIN" | "CUSTOMER";
  title?: string;
  content?: string;
  status: "SUCCESS" | "FAILED";
  error_message?: string;
  created_at: string;
  updated_at?: string;
  updated_by?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  restored_at?: string | null;
  restored_by?: string | null;
}

/**
 * 발송 이력 기록
 */
export async function recordDispatchLog(data: {
  channel: "SMS" | "EMAIL";
  eventType: "inquiry" | "tax_invoice" | "payment" | "test" | "other";
  ruleName?: string;
  recipient: string;
  recipientType?: "ADMIN" | "CUSTOMER";
  title?: string;
  content?: string;
  status: "SUCCESS" | "FAILED";
  errorMessage?: string;
}): Promise<void> {
  try {
    await setupDatabase();
    const now = new Date().toISOString();
    const id = `dlog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    await insertRows("sheetbot_dispatch_logs", [
      {
        id,
        uuid: crypto.randomUUID(),
        channel: data.channel,
        event_type: data.eventType,
        rule_name: data.ruleName || "기본 시스템 알림",
        recipient: data.recipient,
        recipient_type: data.recipientType || "ADMIN",
        title: data.title || "",
        content: data.content || "",
        status: data.status,
        error_message: data.errorMessage || null,
        created_at: now,
        updated_at: now,
        updated_by: "system",
        deleted_at: null,
        deleted_by: null,
        restored_at: null,
        restored_by: null,
      },
    ]);
  } catch (err: any) {
    console.warn("[DispatchLogger] Failed to record log:", err.message);
  }
}

/**
 * 발송 이력 목록 조회 (소프트 삭제 제외, 최신순 정렬)
 */
export async function getDispatchLogs(options: {
  channel?: string;
  status?: string;
  limit?: number;
} = {}): Promise<DispatchLog[]> {
  try {
    await setupDatabase();
    const filters: Record<string, any> = {};
    if (options.channel && options.channel !== "ALL") {
      filters.channel = options.channel.toUpperCase();
    }
    if (options.status && options.status !== "ALL") {
      filters.status = options.status.toUpperCase();
    }

    const res = await queryTable("sheetbot_dispatch_logs", {
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      orderBy: "id",
      orderDirection: "DESC",
      limit: options.limit || 100,
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
    return validRows as DispatchLog[];
  } catch (err: any) {
    console.warn("[DispatchLogger] Failed to fetch logs:", err.message);
    return [];
  }
}

/**
 * 특정 발송 이력 소프트 삭제
 */
export async function softDeleteDispatchLog(id: string, adminEmail: string): Promise<boolean> {
  try {
    await setupDatabase();
    const now = new Date().toISOString();
    await updateRows("sheetbot_dispatch_logs", {
      filters: { id },
      updates: {
        deleted_at: now,
        deleted_by: adminEmail,
        updated_at: now,
        updated_by: adminEmail,
      },
    });
    return true;
  } catch (err: any) {
    console.warn("[DispatchLogger] Failed to delete log:", err.message);
    return false;
  }
}
