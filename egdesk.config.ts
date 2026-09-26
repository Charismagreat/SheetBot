/**
 * EGDesk User Data Configuration
 * Generated at: 2026-09-26T02:32:16.741Z
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
    name: 'user_data_queue_jobs',
    displayName: 'user_data_queue_jobs',
    description: 'Imported from user_database_export_2026-09-21.sql',
    rowCount: 0,
    columnCount: 17,
    columns: ['id', '_version', 'name', 'action_type', 'action_payload', 'status', 'priority', 'attempts', 'max_attempts', 'run_after', 'started_at', 'completed_at', 'last_error', 'result_message', 'idempotency_key', 'created_at', 'updated_at']
  } as TableDefinition,
  table2: {
    name: 'user_data_queue_runs',
    displayName: 'user_data_queue_runs',
    description: 'Imported from user_database_export_2026-09-21.sql',
    rowCount: 0,
    columnCount: 11,
    columns: ['id', '_version', 'job_id', 'attempt', 'status', 'started_at', 'completed_at', 'duration_ms', 'result_message', 'error_message', 'created_at']
  } as TableDefinition,
  table3: {
    name: '_migration_state',
    displayName: '_migration_state',
    description: 'Imported from user_database_export_2026-09-21.sql',
    rowCount: 1,
    columnCount: 3,
    columns: ['name', '_version', 'applied_at']
  } as TableDefinition,
  table4: {
    name: '_mesh_deletions',
    displayName: '_mesh_deletions',
    description: 'Imported from user_database_export_2026-09-21.sql',
    rowCount: 0,
    columnCount: 5,
    columns: ['seq', '_version', 'table_name', 'row_id', 'deleted_at']
  } as TableDefinition,
  table5: {
    name: 'sheet_table_links',
    displayName: 'sheet_table_links',
    description: 'Imported from user_database_export_2026-09-21.sql',
    rowCount: 0,
    columnCount: 13,
    columns: ['id', '_version', 'user_table_id', 'spreadsheet_id', 'spreadsheet_url', 'data_tab_name', 'header_row', 'sync_mode', 'periodic_interval_ms', 'last_pulled_at', 'last_pushed_at', 'created_at', 'updated_at']
  } as TableDefinition,
  table6: {
    name: 'sheet_sync_configs',
    displayName: 'sheet_sync_configs',
    description: 'Imported from user_database_export_2026-09-21.sql',
    rowCount: 0,
    columnCount: 20,
    columns: ['id', '_version', 'source_table', 'target_sheet_id', 'target_tab_name', 'date_column', 'window_days', 'fallback_mode', 'fallback_condition', 'enabled', 'trigger_mode', 'interval_ms', 'last_run_at', 'last_run_status', 'last_run_error', 'last_row_count', 'schedule_owner_device_id', 'schedule_version', 'created_at', 'updated_at']
  } as TableDefinition,
  table7: {
    name: 'user_data_files',
    displayName: 'user_data_files',
    description: 'Imported from user_database_export_2026-09-21.sql',
    rowCount: 0,
    columnCount: 16,
    columns: ['id', '_version', 'table_id', 'row_id', 'column_name', 'filename', 'mime_type', 'size_bytes', 'storage_type', 'file_data', 'file_path', 'is_compressed', 'compression_type', 'original_size', 'created_at', 'updated_at']
  } as TableDefinition,
  table8: {
    name: 'sheetbot_deposit_requests',
    displayName: 'SheetBot 다이렉트 송금 입금 대기 대장',
    rowCount: 42,
    columnCount: 23,
    columns: ['id', '_version', 'deposit_code', 'user_email', 'user_name', 'package_id', 'package_name', 'amount_krw', 'tokens_to_credit', 'bank_name', 'account_number', 'account_holder', 'status', 'expires_at', 'completed_at', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table9: {
    name: 'sheetbot_inquiries',
    displayName: 'SheetBot 고객 문의 대장',
    rowCount: 2,
    columnCount: 21,
    columns: ['id', '_version', 'user_email', 'user_name', 'category', 'title', 'content', 'status', 'answer', 'answered_at', 'ai_draft', 'ai_score', 'ai_company_analysis', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table10: {
    name: 'sheetbot_enterprise_inquiries',
    displayName: 'SheetBot 기업 맞춤 AX 문의 대장',
    rowCount: 2,
    columnCount: 24,
    columns: ['id', '_version', 'company_name', 'contact_name', 'contact_position', 'phone', 'email', 'industry', 'target_areas', 'use_voucher', 'content', 'status', 'answer', 'ai_draft', 'ai_score', 'ai_company_analysis', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table11: {
    name: 'call_intelligence_logs',
    displayName: 'SheetBot 통화 녹음 AI 분석 및 고객 상담 대장',
    description: 'SheetBot Voice Intelligence 통화 녹음 AI 분석 및 고객 상담 대장',
    rowCount: 1,
    columnCount: 27,
    columns: ['id', '_version', 'user_email', 'call_datetime', 'customer_name', 'customer_phone', 'agent_name', 'call_type', 'duration_sec', 'summary', 'sentiment_score', 'churn_risk', 'intent_score', 'climax_timestamp', 'action_items', 'transcript_pii', 'audio_drive_url', 'audio_file_id', 'file_sha256', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table12: {
    name: 'business_cards_sqlite',
    displayName: '명함 기록 대장',
    rowCount: 0,
    columnCount: 15,
    columns: ['id', '_version', 'name', 'company', 'position', 'mobile', 'email', 'phone', 'address', 'website', 'image_url', 'is_duplicate', 'memo', 'registered_at', 'user_email']
  } as TableDefinition,
  table13: {
    name: 'email_send_logs_sqlite',
    displayName: 'Gmail 발송 대장',
    rowCount: 0,
    columnCount: 10,
    columns: ['id', '_version', 'name', 'email', 'subject', 'content', 'status', 'send_time', 'result_msg', 'user_email']
  } as TableDefinition,
  table14: {
    name: 'sheetbot_bridge_tokens',
    displayName: 'SheetBot 브릿지 토큰 매핑 대장',
    rowCount: 36,
    columnCount: 6,
    columns: ['id', '_version', 'token', 'project_id', 'user_email', 'created_at']
  } as TableDefinition,
  table15: {
    name: 'smartti_orders',
    displayName: '스마띠 주문 대장',
    rowCount: 11,
    columnCount: 12,
    columns: ['id', '_version', 'order_date', 'customer_name', 'band_color', 'quantity', 'print_type', 'print_front', 'print_back', 'memo', 'order_amount', 'status']
  } as TableDefinition,
  table16: {
    name: 'sheetbot_user_api_keys',
    displayName: 'SheetBot 사용자 개인 API 키 대장',
    rowCount: 5,
    columnCount: 15,
    columns: ['id', '_version', 'user_email', 'api_key', 'name', 'status', 'last_used_at', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table17: {
    name: 'sheetbot_project_feedback',
    displayName: 'SheetBot 프로젝트 만족도 및 AI 자가 학습 대장',
    rowCount: 9,
    columnCount: 19,
    columns: ['id', '_version', 'project_id', 'project_name', 'user_email', 'rating', 'satisfaction_type', 'tags', 'comment', 'script_code_snapshot', 'ai_learned', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table18: {
    name: 'sheetbot_prompt_templates',
    displayName: 'SheetBot 추천 프롬프트 갤러리 대장',
    rowCount: 6,
    columnCount: 18,
    columns: ['id', '_version', 'category', 'category_name', 'title', 'description', 'prompt_text', 'tags', 'icon', 'is_featured', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table19: {
    name: 'sheetbot_dispatch_logs',
    displayName: 'SheetBot 알림 발송 이력 대장',
    rowCount: 15,
    columnCount: 19,
    columns: ['id', '_version', 'channel', 'event_type', 'rule_name', 'recipient', 'recipient_type', 'title', 'content', 'status', 'error_message', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table20: {
    name: 'sheetbot_users',
    displayName: 'SheetBot 회원 마스터 대장',
    rowCount: 5,
    columnCount: 17,
    columns: ['id', '_version', 'email', 'name', 'role', 'status', 'tier', 'note', 'created_at', 'last_login_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table21: {
    name: 'sheetbot_reviews',
    displayName: 'SheetBot 사용 후기 대장',
    rowCount: 3,
    columnCount: 17,
    columns: ['id', '_version', 'user_email', 'user_name', 'rating', 'title', 'content', 'use_case', 'image_url', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table22: {
    name: 'sheetbot_ai_usage_logs',
    displayName: 'SheetBot AI 토큰 및 사용료 감사 대장',
    rowCount: 40,
    columnCount: 21,
    columns: ['id', '_version', 'user_email', 'user_name', 'caller', 'purpose', 'model', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'estimated_cost_usd', 'estimated_cost_krw', 'prompt_preview', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table23: {
    name: 'sheetbot_schedules',
    displayName: 'SheetBot 스케줄 및 트리거 대장',
    rowCount: 0,
    columnCount: 28,
    columns: ['id', '_version', 'user_email', 'project_id', 'project_name', 'spreadsheet_id', 'spreadsheet_url', 'name', 'description', 'function_name', 'trigger_type', 'time_frequency', 'interval_value', 'at_hour', 'week_day', 'event_type', 'status', 'last_run_at', 'last_status', 'last_run_message', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table24: {
    name: 'sheetbot_projects',
    displayName: 'SheetBot 프로젝트 대장',
    rowCount: 42,
    columnCount: 25,
    columns: ['id', '_version', 'user_email', 'name', 'description', 'spreadsheet_id', 'spreadsheet_url', 'gas_project_id', 'script_id', 'script_url', 'script_code', 'manifest', 'summary', 'features', 'triggers', 'prompt', 'status', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table25: {
    name: 'sheetbot_user_dispatch_logs',
    displayName: 'SheetBot 회원 알림 발송 이력 대장',
    rowCount: 7,
    columnCount: 18,
    columns: ['id', '_version', 'user_email', 'rule_id', 'rule_name', 'device_id', 'recipient', 'content', 'status', 'error_message', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table26: {
    name: 'sheetbot_user_smart_rules',
    displayName: 'SheetBot 회원 자연어 알림 규칙 대장',
    rowCount: 0,
    columnCount: 20,
    columns: ['id', '_version', 'user_email', 'project_id', 'name', 'prompt', 'trigger_event', 'target_recipient', 'recipient_column', 'custom_phone', 'message_template', 'is_active', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table27: {
    name: 'sheetbot_user_devices',
    displayName: 'SheetBot 회원 SMS 디바이스 대장',
    rowCount: 0,
    columnCount: 18,
    columns: ['id', '_version', 'user_email', 'label', 'phone_number', 'device_id', 'pairing_mode', 'google_profile_name', 'status', 'last_connected_at', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table28: {
    name: 'sheetbot_easybot_chats',
    displayName: 'SheetBot AI 대화 이력 대장',
    rowCount: 31,
    columnCount: 13,
    columns: ['id', '_version', 'user_email', 'role', 'message', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table29: {
    name: 'sheetbot_faqs',
    displayName: 'SheetBot FAQ 관리 대장',
    rowCount: 45,
    columnCount: 14,
    columns: ['id', '_version', 'category', 'question', 'answer', 'sort_order', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table30: {
    name: 'sheetbot_tax_invoices',
    displayName: 'SheetBot 세금계산서 및 현금영수증 신청 대장',
    rowCount: 0,
    columnCount: 19,
    columns: ['id', '_version', 'order_id', 'user_email', 'type', 'company_name', 'biz_number', 'ceo_name', 'manager_email', 'amount_krw', 'status', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table31: {
    name: 'sheetbot_payment_orders',
    displayName: 'SheetBot 토큰 결제 및 충전 주문 대장',
    rowCount: 18,
    columnCount: 18,
    columns: ['id', '_version', 'order_id', 'user_email', 'package_name', 'amount_krw', 'tokens_credited', 'pg_provider', 'payment_method', 'status', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table32: {
    name: 'sheetbot_user_wallets',
    displayName: 'SheetBot 회원 토큰 지갑 대장',
    rowCount: 4,
    columnCount: 15,
    columns: ['id', '_version', 'user_email', 'balance_tokens', 'total_purchased_tokens', 'total_used_tokens', 'tier', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table33: {
    name: 'sheetbot_settings',
    displayName: 'SheetBot 시스템 및 AI 모델 설정 대장',
    rowCount: 3,
    columnCount: 13,
    columns: ['id', '_version', 'key', 'value', 'description', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table34: {
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
  table1: 'user_data_queue_jobs',
  table2: 'user_data_queue_runs',
  table3: '_migration_state',
  table4: '_mesh_deletions',
  table5: 'sheet_table_links',
  table6: 'sheet_sync_configs',
  table7: 'user_data_files',
  table8: 'sheetbot_deposit_requests',
  table9: 'sheetbot_inquiries',
  table10: 'sheetbot_enterprise_inquiries',
  table11: 'call_intelligence_logs',
  table12: 'business_cards_sqlite',
  table13: 'email_send_logs_sqlite',
  table14: 'sheetbot_bridge_tokens',
  table15: 'smartti_orders',
  table16: 'sheetbot_user_api_keys',
  table17: 'sheetbot_project_feedback',
  table18: 'sheetbot_prompt_templates',
  table19: 'sheetbot_dispatch_logs',
  table20: 'sheetbot_users',
  table21: 'sheetbot_reviews',
  table22: 'sheetbot_ai_usage_logs',
  table23: 'sheetbot_schedules',
  table24: 'sheetbot_projects',
  table25: 'sheetbot_user_dispatch_logs',
  table26: 'sheetbot_user_smart_rules',
  table27: 'sheetbot_user_devices',
  table28: 'sheetbot_easybot_chats',
  table29: 'sheetbot_faqs',
  table30: 'sheetbot_tax_invoices',
  table31: 'sheetbot_payment_orders',
  table32: 'sheetbot_user_wallets',
  table33: 'sheetbot_settings',
  table34: 'example_table'
} as const;
