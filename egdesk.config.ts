/**
 * EGDesk User Data Configuration
 * Generated at: 2026-09-05T16:28:18.839Z
 *
 * This file contains type-safe definitions for your EGDesk tables.
 */

export const EGDESK_CONFIG = {
  apiUrl: 'http://localhost:8080',
  tunnelUrl: 'https://tunneling-service.onrender.com/t/mcp-server-fxkud1',
  apiKey: 'a67ddc0f-7e2b-4997-9a0b-9667a74c89d0',
} as const;

export interface TableDefinition {
  name: string;
  displayName: string;
  description?: string;
  /** Omitted or unknown until synced / counted */
  rowCount?: number;
  columnCount: number;
  columns: string[];
}

export const TABLES = {
  table1: {
    name: 'sheetbot_project_feedback',
    displayName: 'SheetBot 프로젝트 만족도 및 AI 자가 학습 대장',
    rowCount: 6,
    columnCount: 19,
    columns: ['id', '_version', 'project_id', 'project_name', 'user_email', 'rating', 'satisfaction_type', 'tags', 'comment', 'script_code_snapshot', 'ai_learned', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table2: {
    name: 'sheetbot_prompt_templates',
    displayName: 'SheetBot 추천 프롬프트 갤러리 대장',
    rowCount: 6,
    columnCount: 18,
    columns: ['id', '_version', 'category', 'category_name', 'title', 'description', 'prompt_text', 'tags', 'icon', 'is_featured', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table3: {
    name: 'sheetbot_dispatch_logs',
    displayName: 'SheetBot 알림 발송 이력 대장',
    rowCount: 1,
    columnCount: 19,
    columns: ['id', '_version', 'channel', 'event_type', 'rule_name', 'recipient', 'recipient_type', 'title', 'content', 'status', 'error_message', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table4: {
    name: 'sheetbot_users',
    displayName: 'SheetBot 회원 마스터 대장',
    rowCount: 1,
    columnCount: 17,
    columns: ['id', '_version', 'email', 'name', 'role', 'status', 'tier', 'note', 'created_at', 'last_login_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table5: {
    name: 'sheetbot_reviews',
    displayName: 'SheetBot 사용 후기 대장',
    rowCount: 3,
    columnCount: 17,
    columns: ['id', '_version', 'user_email', 'user_name', 'rating', 'title', 'content', 'use_case', 'image_url', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table6: {
    name: 'sheetbot_inquiries',
    displayName: 'SheetBot 고객 문의 대장',
    rowCount: 1,
    columnCount: 18,
    columns: ['id', '_version', 'user_email', 'user_name', 'category', 'title', 'content', 'status', 'answer', 'answered_at', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table7: {
    name: 'sheetbot_ai_usage_logs',
    displayName: 'SheetBot AI 토큰 및 사용료 감사 대장',
    rowCount: 3,
    columnCount: 21,
    columns: ['id', '_version', 'user_email', 'user_name', 'caller', 'purpose', 'model', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'estimated_cost_usd', 'estimated_cost_krw', 'prompt_preview', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table8: {
    name: 'sheetbot_schedules',
    displayName: 'SheetBot 스케줄 및 트리거 대장',
    rowCount: 0,
    columnCount: 28,
    columns: ['id', '_version', 'user_email', 'project_id', 'project_name', 'spreadsheet_id', 'spreadsheet_url', 'name', 'description', 'function_name', 'trigger_type', 'time_frequency', 'interval_value', 'at_hour', 'week_day', 'event_type', 'status', 'last_run_at', 'last_status', 'last_run_message', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table9: {
    name: 'sheetbot_projects',
    displayName: 'SheetBot 프로젝트 대장',
    rowCount: 1,
    columnCount: 25,
    columns: ['id', '_version', 'user_email', 'name', 'description', 'spreadsheet_id', 'spreadsheet_url', 'gas_project_id', 'script_id', 'script_url', 'script_code', 'manifest', 'summary', 'features', 'triggers', 'prompt', 'status', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table10: {
    name: 'sheetbot_user_dispatch_logs',
    displayName: 'SheetBot 회원 알림 발송 이력 대장',
    rowCount: 0,
    columnCount: 18,
    columns: ['id', '_version', 'user_email', 'rule_id', 'rule_name', 'device_id', 'recipient', 'content', 'status', 'error_message', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table11: {
    name: 'sheetbot_user_smart_rules',
    displayName: 'SheetBot 회원 자연어 알림 규칙 대장',
    rowCount: 0,
    columnCount: 20,
    columns: ['id', '_version', 'user_email', 'project_id', 'name', 'prompt', 'trigger_event', 'target_recipient', 'recipient_column', 'custom_phone', 'message_template', 'is_active', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table12: {
    name: 'sheetbot_user_devices',
    displayName: 'SheetBot 회원 SMS 디바이스 대장',
    rowCount: 0,
    columnCount: 18,
    columns: ['id', '_version', 'user_email', 'label', 'phone_number', 'device_id', 'pairing_mode', 'google_profile_name', 'status', 'last_connected_at', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table13: {
    name: 'sheetbot_easybot_chats',
    displayName: 'SheetBot AI 대화 이력 대장',
    rowCount: 0,
    columnCount: 13,
    columns: ['id', '_version', 'user_email', 'role', 'message', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table14: {
    name: 'sheetbot_faqs',
    displayName: 'SheetBot FAQ 관리 대장',
    rowCount: 8,
    columnCount: 14,
    columns: ['id', '_version', 'category', 'question', 'answer', 'sort_order', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table15: {
    name: 'sheetbot_tax_invoices',
    displayName: 'SheetBot 세금계산서 및 현금영수증 신청 대장',
    rowCount: 0,
    columnCount: 19,
    columns: ['id', '_version', 'order_id', 'user_email', 'type', 'company_name', 'biz_number', 'ceo_name', 'manager_email', 'amount_krw', 'status', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table16: {
    name: 'sheetbot_payment_orders',
    displayName: 'SheetBot 토큰 결제 및 충전 주문 대장',
    rowCount: 6,
    columnCount: 18,
    columns: ['id', '_version', 'order_id', 'user_email', 'package_name', 'amount_krw', 'tokens_credited', 'pg_provider', 'payment_method', 'status', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table17: {
    name: 'sheetbot_user_wallets',
    displayName: 'SheetBot 회원 토큰 지갑 대장',
    rowCount: 1,
    columnCount: 15,
    columns: ['id', '_version', 'user_email', 'balance_tokens', 'total_purchased_tokens', 'total_used_tokens', 'tier', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table18: {
    name: 'sheetbot_settings',
    displayName: 'SheetBot 시스템 및 AI 모델 설정 대장',
    rowCount: 2,
    columnCount: 13,
    columns: ['id', '_version', 'key', 'value', 'description', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table19: {
    name: 'example_table',
    displayName: 'Example Table',
    rowCount: 0,
    columnCount: 4,
    columns: ['id', '_version', 'name', 'created_at']
  } as TableDefinition
} as const;


// Main table (first table by default)
export const MAIN_TABLE = TABLES.table1;


// Helper to get table by name
export function getTableByName(tableName: string): TableDefinition | undefined {
  return Object.values(TABLES).find(t => t.name === tableName);
}

// Export table names for easy access
export const TABLE_NAMES = {
  table1: 'sheetbot_project_feedback',
  table2: 'sheetbot_prompt_templates',
  table3: 'sheetbot_dispatch_logs',
  table4: 'sheetbot_users',
  table5: 'sheetbot_reviews',
  table6: 'sheetbot_inquiries',
  table7: 'sheetbot_ai_usage_logs',
  table8: 'sheetbot_schedules',
  table9: 'sheetbot_projects',
  table10: 'sheetbot_user_dispatch_logs',
  table11: 'sheetbot_user_smart_rules',
  table12: 'sheetbot_user_devices',
  table13: 'sheetbot_easybot_chats',
  table14: 'sheetbot_faqs',
  table15: 'sheetbot_tax_invoices',
  table16: 'sheetbot_payment_orders',
  table17: 'sheetbot_user_wallets',
  table18: 'sheetbot_settings',
  table19: 'example_table'
} as const;
