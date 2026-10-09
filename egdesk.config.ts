/**
 * EGDesk User Data Configuration
 * Generated at: 2026-10-09T05:56:01.429Z
 *
 * This file contains type-safe definitions for your EGDesk tables.
 */

export const EGDESK_CONFIG = {
  apiUrl: 'http://localhost:8080',
  tunnelUrl: 'http://localhost:8080',
  apiKey: undefined,
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
    name: 'sheetbot_marketplace_cards',
    displayName: 'SheetBot 카드 마켓플레이스 CMS 대장',
    description: 'SheetBot 동적 카드 마켓플레이스 CMS 대장',
    rowCount: 1,
    columnCount: 23,
    columns: ['id', '_version', 'key', 'title', 'icon', 'category', 'category_name', 'description', 'badge', 'author', 'is_exclusive', 'allowed_emails', 'is_installed_by_default', 'status', 'display_order', 'version', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table2: {
    name: 'sheetbot_feature_requests',
    displayName: 'SheetBot 맞춤 기능 제작 의뢰 및 출시알림 대장',
    description: 'SheetBot 맞춤 기능 제작 의뢰 및 출시알림 접수 대장',
    rowCount: 1,
    columnCount: 18,
    columns: ['id', '_version', 'request_type', 'card_key', 'title', 'description', 'contact', 'user_email', 'status', 'admin_notes', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table3: {
    name: 'sheetbot_quotes',
    displayName: 'SheetBot 견적 및 주문 관리 대장',
    description: 'SheetBot 전자 견적서 및 주문 발급 관리 대장',
    rowCount: 2,
    columnCount: 26,
    columns: ['id', '_version', 'quote_id', 'user_email', 'customer_name', 'customer_phone', 'customer_address', 'preferred_date', 'notes', 'source', 'inquiry_text', 'items_json', 'supply_amount', 'vat_amount', 'total_amount', 'status', 'spreadsheet_id', 'viewed_at', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table4: {
    name: 'sheetbot_sites',
    displayName: 'SheetBot 모바일 홈페이지 관리 대장',
    description: 'AI 모바일 홈페이지 및 랜딩페이지 관리 대장',
    rowCount: 1,
    columnCount: 28,
    columns: ['id', '_version', 'uuid', 'user_email', 'site_slug', 'title', 'category', 'slogan', 'description', 'phone', 'address', 'business_hours', 'banner_images_json', 'menu_items_json', 'notice', 'social_links_json', 'theme_color', 'site_url', 'sheet_url', 'drive_folder_url', 'status', 'created_at', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table5: {
    name: 'sheetbot_instagram_posts',
    displayName: 'SheetBot 인스타그램 마케팅 대장',
    description: 'AI 인스타그램 마케팅 관리 대장',
    rowCount: 2,
    columnCount: 26,
    columns: ['id', '_version', 'user_email', 'topic', 'keywords', 'tone', 'caption', 'hashtags', 'carousel_slides_json', 'summary', 'image_drive_urls_json', 'drive_folder_url', 'ref_urls_json', 'image_count', 'report_url', 'sheet_url', 'instagram_post_url', 'status', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table6: {
    name: 'sheetbot_blog_posts',
    displayName: 'SheetBot 블로그 마케팅 대장',
    description: 'SheetBot AI 네이버 블로그 자동 포스팅 관리 대장',
    rowCount: 2,
    columnCount: 22,
    columns: ['id', '_version', 'user_email', 'title', 'topic', 'keywords', 'ref_urls_json', 'image_drive_urls_json', 'content_html', 'summary', 'naver_post_url', 'char_count', 'image_count', 'status', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table7: {
    name: 'sheetbot_law_advisories',
    displayName: 'SheetBot 법률·계약 자문 대장',
    description: 'SheetBot 법률·계약 자문 및 심층 보고서 관리 대장',
    rowCount: 1,
    columnCount: 20,
    columns: ['id', '_version', 'user_email', 'query', 'file_name', 'file_drive_url', 'document_ocr_summary', 'related_laws', 'related_precedents', 'executive_summary', 'full_report_json', 'status', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table8: {
    name: 'sheetbot_ai_batch_jobs',
    displayName: 'SheetBot AI 배치 비동기 수거 대장',
    rowCount: 6,
    columnCount: 20,
    columns: ['id', '_version', 'job_name', 'job_type', 'user_email', 'file_name', 'spreadsheet_id', 'row_index', 'model', 'status', 'error_message', 'completed_at', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table9: {
    name: 'sheetbot_user_sheet_bindings',
    displayName: 'SheetBot 회원별 시트 고유 ID 바인딩 대장',
    description: 'SheetBot 회원별 시트 고유 ID 영구 바인딩 대장',
    rowCount: 26,
    columnCount: 16,
    columns: ['id', '_version', 'user_email', 'sheet_type', 'spreadsheet_id', 'spreadsheet_url', 'sheet_title', 'folder_id', 'created_at', 'updated_at', 'uuid', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table10: {
    name: 'sheetbot_user_devices',
    displayName: 'SheetBot 회원 SMS 디바이스 대장',
    rowCount: 9,
    columnCount: 18,
    columns: ['id', '_version', 'user_email', 'label', 'phone_number', 'device_id', 'pairing_mode', 'google_profile_name', 'status', 'last_connected_at', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table11: {
    name: 'sheetbot_deposit_requests',
    displayName: 'SheetBot 다이렉트 송금 입금 대기 대장',
    rowCount: 43,
    columnCount: 23,
    columns: ['id', '_version', 'deposit_code', 'user_email', 'user_name', 'package_id', 'package_name', 'amount_krw', 'tokens_to_credit', 'bank_name', 'account_number', 'account_holder', 'status', 'expires_at', 'completed_at', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table12: {
    name: 'sheetbot_user_smart_rules',
    displayName: 'SheetBot 회원 자연어 알림 규칙 대장',
    rowCount: 0,
    columnCount: 20,
    columns: ['id', '_version', 'user_email', 'project_id', 'name', 'prompt', 'trigger_event', 'target_recipient', 'recipient_column', 'custom_phone', 'message_template', 'is_active', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table13: {
    name: 'sheetbot_schedules',
    displayName: 'SheetBot 스케줄 및 트리거 대장',
    rowCount: 0,
    columnCount: 28,
    columns: ['id', '_version', 'user_email', 'project_id', 'project_name', 'spreadsheet_id', 'spreadsheet_url', 'name', 'description', 'function_name', 'trigger_type', 'time_frequency', 'interval_value', 'at_hour', 'week_day', 'event_type', 'status', 'last_run_at', 'last_status', 'last_run_message', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table14: {
    name: 'sheetbot_projects',
    displayName: 'SheetBot 프로젝트 대장',
    rowCount: 43,
    columnCount: 25,
    columns: ['id', '_version', 'user_email', 'name', 'description', 'spreadsheet_id', 'spreadsheet_url', 'gas_project_id', 'script_id', 'script_url', 'script_code', 'manifest', 'summary', 'features', 'triggers', 'prompt', 'status', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table15: {
    name: 'sheetbot_inquiries',
    displayName: 'SheetBot 고객 문의 대장',
    rowCount: 2,
    columnCount: 21,
    columns: ['id', '_version', 'user_email', 'user_name', 'category', 'title', 'content', 'status', 'answer', 'answered_at', 'ai_draft', 'ai_score', 'ai_company_analysis', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table16: {
    name: 'sheetbot_enterprise_inquiries',
    displayName: 'SheetBot 기업 맞춤 AX 문의 대장',
    rowCount: 2,
    columnCount: 24,
    columns: ['id', '_version', 'company_name', 'contact_name', 'contact_position', 'phone', 'email', 'industry', 'target_areas', 'use_voucher', 'content', 'status', 'answer', 'ai_draft', 'ai_score', 'ai_company_analysis', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table17: {
    name: 'call_intelligence_logs',
    displayName: 'SheetBot 통화 녹음 AI 분석 및 고객 상담 대장',
    description: 'SheetBot Voice Intelligence 통화 녹음 AI 분석 및 고객 상담 대장',
    rowCount: 1,
    columnCount: 27,
    columns: ['id', '_version', 'user_email', 'call_datetime', 'customer_name', 'customer_phone', 'agent_name', 'call_type', 'duration_sec', 'summary', 'sentiment_score', 'churn_risk', 'intent_score', 'climax_timestamp', 'action_items', 'transcript_pii', 'audio_drive_url', 'audio_file_id', 'file_sha256', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table18: {
    name: 'business_cards_sqlite',
    displayName: '명함 기록 대장',
    rowCount: 0,
    columnCount: 15,
    columns: ['id', '_version', 'name', 'company', 'position', 'mobile', 'email', 'phone', 'address', 'website', 'image_url', 'is_duplicate', 'memo', 'registered_at', 'user_email']
  } as TableDefinition,
  table19: {
    name: 'email_send_logs_sqlite',
    displayName: 'Gmail 발송 대장',
    rowCount: 0,
    columnCount: 10,
    columns: ['id', '_version', 'name', 'email', 'subject', 'content', 'status', 'send_time', 'result_msg', 'user_email']
  } as TableDefinition,
  table20: {
    name: 'sheetbot_bridge_tokens',
    displayName: 'SheetBot 브릿지 토큰 매핑 대장',
    rowCount: 37,
    columnCount: 6,
    columns: ['id', '_version', 'token', 'project_id', 'user_email', 'created_at']
  } as TableDefinition,
  table21: {
    name: 'smartti_orders',
    displayName: '스마띠 주문 대장',
    rowCount: 11,
    columnCount: 12,
    columns: ['id', '_version', 'order_date', 'customer_name', 'band_color', 'quantity', 'print_type', 'print_front', 'print_back', 'memo', 'order_amount', 'status']
  } as TableDefinition,
  table22: {
    name: 'sheetbot_user_api_keys',
    displayName: 'SheetBot 사용자 개인 API 키 대장',
    rowCount: 5,
    columnCount: 15,
    columns: ['id', '_version', 'user_email', 'api_key', 'name', 'status', 'last_used_at', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table23: {
    name: 'sheetbot_project_feedback',
    displayName: 'SheetBot 프로젝트 만족도 및 AI 자가 학습 대장',
    rowCount: 9,
    columnCount: 19,
    columns: ['id', '_version', 'project_id', 'project_name', 'user_email', 'rating', 'satisfaction_type', 'tags', 'comment', 'script_code_snapshot', 'ai_learned', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table24: {
    name: 'sheetbot_prompt_templates',
    displayName: 'SheetBot 추천 프롬프트 갤러리 대장',
    rowCount: 6,
    columnCount: 18,
    columns: ['id', '_version', 'category', 'category_name', 'title', 'description', 'prompt_text', 'tags', 'icon', 'is_featured', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table25: {
    name: 'sheetbot_dispatch_logs',
    displayName: 'SheetBot 알림 발송 이력 대장',
    rowCount: 15,
    columnCount: 19,
    columns: ['id', '_version', 'channel', 'event_type', 'rule_name', 'recipient', 'recipient_type', 'title', 'content', 'status', 'error_message', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table26: {
    name: 'sheetbot_users',
    displayName: 'SheetBot 회원 마스터 대장',
    rowCount: 39,
    columnCount: 17,
    columns: ['id', '_version', 'email', 'name', 'role', 'status', 'tier', 'note', 'created_at', 'last_login_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table27: {
    name: 'sheetbot_reviews',
    displayName: 'SheetBot 사용 후기 대장',
    rowCount: 3,
    columnCount: 17,
    columns: ['id', '_version', 'user_email', 'user_name', 'rating', 'title', 'content', 'use_case', 'image_url', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table28: {
    name: 'sheetbot_ai_usage_logs',
    displayName: 'SheetBot AI 토큰 및 사용료 감사 대장',
    rowCount: 40,
    columnCount: 21,
    columns: ['id', '_version', 'user_email', 'user_name', 'caller', 'purpose', 'model', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'estimated_cost_usd', 'estimated_cost_krw', 'prompt_preview', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table29: {
    name: 'sheetbot_user_dispatch_logs',
    displayName: 'SheetBot 회원 알림 발송 이력 대장',
    rowCount: 781,
    columnCount: 18,
    columns: ['id', '_version', 'user_email', 'rule_id', 'rule_name', 'device_id', 'recipient', 'content', 'status', 'error_message', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table30: {
    name: 'sheetbot_easybot_chats',
    displayName: 'SheetBot AI 대화 이력 대장',
    rowCount: 31,
    columnCount: 13,
    columns: ['id', '_version', 'user_email', 'role', 'message', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table31: {
    name: 'sheetbot_faqs',
    displayName: 'SheetBot FAQ 관리 대장',
    rowCount: 50,
    columnCount: 14,
    columns: ['id', '_version', 'category', 'question', 'answer', 'sort_order', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table32: {
    name: 'sheetbot_tax_invoices',
    displayName: 'SheetBot 세금계산서 및 현금영수증 신청 대장',
    rowCount: 0,
    columnCount: 19,
    columns: ['id', '_version', 'order_id', 'user_email', 'type', 'company_name', 'biz_number', 'ceo_name', 'manager_email', 'amount_krw', 'status', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table33: {
    name: 'sheetbot_payment_orders',
    displayName: 'SheetBot 토큰 결제 및 충전 주문 대장',
    rowCount: 19,
    columnCount: 18,
    columns: ['id', '_version', 'order_id', 'user_email', 'package_name', 'amount_krw', 'tokens_credited', 'pg_provider', 'payment_method', 'status', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table34: {
    name: 'sheetbot_user_wallets',
    displayName: 'SheetBot 회원 토큰 지갑 대장',
    rowCount: 4,
    columnCount: 15,
    columns: ['id', '_version', 'user_email', 'balance_tokens', 'total_purchased_tokens', 'total_used_tokens', 'tier', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table35: {
    name: 'sheetbot_settings',
    displayName: 'SheetBot 시스템 및 AI 모델 설정 대장',
    rowCount: 56,
    columnCount: 13,
    columns: ['id', '_version', 'key', 'value', 'description', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table36: {
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
  table1: 'sheetbot_marketplace_cards',
  table2: 'sheetbot_feature_requests',
  table3: 'sheetbot_quotes',
  table4: 'sheetbot_sites',
  table5: 'sheetbot_instagram_posts',
  table6: 'sheetbot_blog_posts',
  table7: 'sheetbot_law_advisories',
  table8: 'sheetbot_ai_batch_jobs',
  table9: 'sheetbot_user_sheet_bindings',
  table10: 'sheetbot_user_devices',
  table11: 'sheetbot_deposit_requests',
  table12: 'sheetbot_user_smart_rules',
  table13: 'sheetbot_schedules',
  table14: 'sheetbot_projects',
  table15: 'sheetbot_inquiries',
  table16: 'sheetbot_enterprise_inquiries',
  table17: 'call_intelligence_logs',
  table18: 'business_cards_sqlite',
  table19: 'email_send_logs_sqlite',
  table20: 'sheetbot_bridge_tokens',
  table21: 'smartti_orders',
  table22: 'sheetbot_user_api_keys',
  table23: 'sheetbot_project_feedback',
  table24: 'sheetbot_prompt_templates',
  table25: 'sheetbot_dispatch_logs',
  table26: 'sheetbot_users',
  table27: 'sheetbot_reviews',
  table28: 'sheetbot_ai_usage_logs',
  table29: 'sheetbot_user_dispatch_logs',
  table30: 'sheetbot_easybot_chats',
  table31: 'sheetbot_faqs',
  table32: 'sheetbot_tax_invoices',
  table33: 'sheetbot_payment_orders',
  table34: 'sheetbot_user_wallets',
  table35: 'sheetbot_settings',
  table36: 'example_table'
} as const;
