import {
  createTable,
  queryTable,
  insertRows,
  listTables,
  getTableSchema,
  executeSQL,
  callUserDataTool,
} from './egdesk-helpers';

let isDbInitialized = false;

// 공통 7종 감사 컬럼 명세
const AUDIT_COLUMNS = [
  { name: 'uuid', type: 'TEXT' },
  { name: 'updated_at', type: 'TEXT' },
  { name: 'updated_by', type: 'TEXT' },
  { name: 'deleted_at', type: 'TEXT' },
  { name: 'deleted_by', type: 'TEXT' },
  { name: 'restored_at', type: 'TEXT' },
  { name: 'restored_by', type: 'TEXT' },
];

/**
 * 실제 물리 SQLite 테이블 존재 여부를 검사하고 누락된 감사 컬럼을 주입하여 안전하게 생성하는 헬퍼
 */
async function safeCreateTable(displayName: string, columns: any[], options: { tableName: string }) {
  const tableName = options.tableName;

  // 1. 감사 컬럼 주입
  for (const aCol of AUDIT_COLUMNS) {
    const exists = columns.some((c) => c.name.toLowerCase() === aCol.name.toLowerCase());
    if (!exists) {
      columns.push({ ...aCol });
    }
  }

  // 2. primaryKey 필드 제거 (EGDesk user_data_create_table 도구 파라미터 규격 준수)
  const sanitizedColumns = columns.map((c) => {
    const { primaryKey, ...rest } = c;
    return rest;
  });

  // 3. 실제 SQLite 물리 테이블 존재 여부 2중 검증 (sqlite_master 검사)
  let physicalExists = false;
  try {
    const masterRes = await executeSQL(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}';`);
    physicalExists = (masterRes.rows || []).length > 0;
  } catch (err) {
    physicalExists = false;
  }

  // 4. 물리 테이블이 없는 경우: 혹시 남아있을 수 있는 유령 메타데이터 삭제 후 정상 생성
  if (!physicalExists) {
    try {
      await callUserDataTool('user_data_delete_table', { tableName });
    } catch {}

    try {
      await createTable(displayName, sanitizedColumns, options);
      console.log(`[Setup-DB] ✅ Successfully created physical table: "${tableName}"`);
    } catch (createErr: any) {
      console.warn(`[Setup-DB] Table create warning for "${tableName}":`, createErr.message);
    }
  }
}

/**
 * 레거시 system_settings에 저장된 JSON 데이터를 정규 테이블로 무손실 마이그레이션
 */
async function migrateLegacySettingsData() {
  try {
    // 1. system_settings 테이블에서 sheetbot_projects_% 및 sheetbot_schedules_% 조회
    const settingsRes = await queryTable('system_settings', { limit: 500 }).catch(() => ({ rows: [] }));
    const rows = settingsRes.rows || [];

    for (const row of rows) {
      const key = String(row.key || '');
      const valStr = String(row.value || '[]');

      // 프로젝트 마이그레이션
      if (key.startsWith('sheetbot_projects_')) {
        const userEmail = key.replace('sheetbot_projects_', '');
        try {
          const legacyProjects: any[] = JSON.parse(valStr);
          if (Array.isArray(legacyProjects) && legacyProjects.length > 0) {
            for (const p of legacyProjects) {
              // 이미 신규 테이블에 존재하는지 확인
              const existCheck = await queryTable('sheetbot_projects', {
                filters: { id: p.id },
                limit: 1,
              }).catch(() => ({ rows: [] }));

              if (!existCheck.rows || existCheck.rows.length === 0) {
                await insertRows('sheetbot_projects', [
                  {
                    id: p.id,
                    user_email: p.userEmail || userEmail,
                    name: p.name || '제목 없음',
                    description: p.description || '',
                    spreadsheet_id: p.spreadsheetId || '',
                    spreadsheet_url: p.spreadsheetUrl || '',
                    gas_project_id: p.gasProjectId || '',
                    script_id: p.scriptId || '',
                    script_url: p.scriptUrl || '',
                    script_code: p.scriptCode || '',
                    manifest: p.manifest || '',
                    summary: p.summary || '',
                    features: JSON.stringify(p.features || []),
                    triggers: JSON.stringify(p.triggers || []),
                    prompt: p.prompt || '',
                    status: p.status || 'ACTIVE',
                    created_at: p.created_at || new Date().toISOString(),
                    updated_at: p.updated_at || new Date().toISOString(),
                    deleted_at: p.deleted_at || null,
                  },
                ]).catch((err) => console.warn(`Migration insert project failed for ${p.id}:`, err.message));
              }
            }
          }
        } catch (parseErr: any) {
          console.warn(`Failed to parse legacy projects for key: ${key}`, parseErr.message);
        }
      }

      // 스케줄 마이그레이션
      if (key.startsWith('sheetbot_schedules_')) {
        const userEmail = key.replace('sheetbot_schedules_', '');
        try {
          const legacySchedules: any[] = JSON.parse(valStr);
          if (Array.isArray(legacySchedules) && legacySchedules.length > 0) {
            for (const s of legacySchedules) {
              const existCheck = await queryTable('sheetbot_schedules', {
                filters: { id: s.id },
                limit: 1,
              }).catch(() => ({ rows: [] }));

              if (!existCheck.rows || existCheck.rows.length === 0) {
                await insertRows('sheetbot_schedules', [
                  {
                    id: s.id,
                    user_email: s.userEmail || userEmail,
                    project_id: s.projectId || '',
                    project_name: s.projectName || '',
                    spreadsheet_id: s.spreadsheetId || '',
                    spreadsheet_url: s.spreadsheetUrl || '',
                    name: s.name || '',
                    description: s.description || '',
                    function_name: s.functionName || '',
                    trigger_type: s.triggerType || 'TIME_DRIVEN',
                    time_frequency: s.timeFrequency || 'DAILY',
                    interval_value: s.intervalValue ?? 1,
                    at_hour: s.atHour ?? 9,
                    week_day: s.weekDay || 'MONDAY',
                    event_type: s.eventType || 'ON_EDIT',
                    status: s.status || 'ACTIVE',
                    last_run_at: s.lastRunAt || '',
                    last_status: s.lastStatus || 'PENDING',
                    last_run_message: s.lastRunMessage || '',
                    created_at: s.created_at || new Date().toISOString(),
                    updated_at: s.updated_at || new Date().toISOString(),
                    deleted_at: s.deleted_at || null,
                  },
                ]).catch((err) => console.warn(`Migration insert schedule failed for ${s.id}:`, err.message));
              }
            }
          }
        } catch (parseErr: any) {
          console.warn(`Failed to parse legacy schedules for key: ${key}`, parseErr.message);
        }
      }
    }
  } catch (err: any) {
    console.warn('[Setup-DB] Legacy data migration note:', err.message);
  }
}

/**
 * 전역 데이터베이스 초기화 및 테이블 무결성 확인
 */
export async function setupDatabase(): Promise<void> {
  if (isDbInitialized) return;

  try {
    // 1. sheetbot_projects 테이블 생성
    await safeCreateTable(
      'SheetBot 프로젝트 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'user_email', type: 'TEXT', notNull: true },
        { name: 'name', type: 'TEXT', notNull: true },
        { name: 'description', type: 'TEXT' },
        { name: 'spreadsheet_id', type: 'TEXT' },
        { name: 'spreadsheet_url', type: 'TEXT' },
        { name: 'gas_project_id', type: 'TEXT' },
        { name: 'script_id', type: 'TEXT' },
        { name: 'script_url', type: 'TEXT' },
        { name: 'script_code', type: 'TEXT' },
        { name: 'manifest', type: 'TEXT' },
        { name: 'summary', type: 'TEXT' },
        { name: 'features', type: 'TEXT' },
        { name: 'triggers', type: 'TEXT' },
        { name: 'prompt', type: 'TEXT' },
        { name: 'status', type: 'TEXT' },
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_projects' }
    );

    // 2. sheetbot_schedules 테이블 생성
    await safeCreateTable(
      'SheetBot 스케줄 및 트리거 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'user_email', type: 'TEXT', notNull: true },
        { name: 'project_id', type: 'TEXT', notNull: true },
        { name: 'project_name', type: 'TEXT' },
        { name: 'spreadsheet_id', type: 'TEXT' },
        { name: 'spreadsheet_url', type: 'TEXT' },
        { name: 'name', type: 'TEXT', notNull: true },
        { name: 'description', type: 'TEXT' },
        { name: 'function_name', type: 'TEXT', notNull: true },
        { name: 'trigger_type', type: 'TEXT', notNull: true },
        { name: 'time_frequency', type: 'TEXT' },
        { name: 'interval_value', type: 'INTEGER' },
        { name: 'at_hour', type: 'INTEGER' },
        { name: 'week_day', type: 'TEXT' },
        { name: 'event_type', type: 'TEXT' },
        { name: 'status', type: 'TEXT' },
        { name: 'last_run_at', type: 'TEXT' },
        { name: 'last_status', type: 'TEXT' },
        { name: 'last_run_message', type: 'TEXT' },
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_schedules' }
    );

    // 3. sheetbot_ai_usage_logs 테이블 생성 (AI API 사용료 관제용)
    await safeCreateTable(
      'SheetBot AI 토큰 및 사용료 감사 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'user_email', type: 'TEXT', notNull: true },
        { name: 'user_name', type: 'TEXT' },
        { name: 'caller', type: 'TEXT', notNull: true },
        { name: 'purpose', type: 'TEXT' },
        { name: 'model', type: 'TEXT' },
        { name: 'prompt_tokens', type: 'INTEGER' },
        { name: 'completion_tokens', type: 'INTEGER' },
        { name: 'total_tokens', type: 'INTEGER' },
        { name: 'estimated_cost_usd', type: 'REAL' },
        { name: 'estimated_cost_krw', type: 'REAL' },
        { name: 'prompt_preview', type: 'TEXT' },
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_ai_usage_logs' }
    );

    // 4. sheetbot_settings 테이블 생성 (시스템 및 AI 모델 설정 저장용)
    await safeCreateTable(
      'SheetBot 시스템 및 AI 모델 설정 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'key', type: 'TEXT', notNull: true },
        { name: 'value', type: 'TEXT', notNull: true },
        { name: 'description', type: 'TEXT' },
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_settings' }
    );

    // 5. sheetbot_user_wallets 테이블 생성 (회원 토큰 지갑 및 잔액 관리)
    await safeCreateTable(
      'SheetBot 회원 토큰 지갑 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'user_email', type: 'TEXT', notNull: true },
        { name: 'balance_tokens', type: 'INTEGER', notNull: true },
        { name: 'total_purchased_tokens', type: 'INTEGER' },
        { name: 'total_used_tokens', type: 'INTEGER' },
        { name: 'tier', type: 'TEXT' }, // 'FREE', 'PRO', 'ENTERPRISE'
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_user_wallets' }
    );

    // 6. sheetbot_payment_orders 테이블 생성 (토큰 결제 및 충전 대장)
    await safeCreateTable(
      'SheetBot 토큰 결제 및 충전 주문 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'order_id', type: 'TEXT', notNull: true },
        { name: 'user_email', type: 'TEXT', notNull: true },
        { name: 'package_name', type: 'TEXT', notNull: true },
        { name: 'amount_krw', type: 'INTEGER', notNull: true },
        { name: 'tokens_credited', type: 'INTEGER', notNull: true },
        { name: 'pg_provider', type: 'TEXT' },
        { name: 'payment_method', type: 'TEXT' },
        { name: 'status', type: 'TEXT' }, // 'PAID', 'PENDING', 'CANCELLED'
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_payment_orders' }
    );

    // 7. sheetbot_tax_invoices 테이블 생성 (세금계산서 및 현금영수증 발행 요청 대장)
    await safeCreateTable(
      'SheetBot 세금계산서 및 현금영수증 신청 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'order_id', type: 'TEXT', notNull: true },
        { name: 'user_email', type: 'TEXT', notNull: true },
        { name: 'type', type: 'TEXT', notNull: true }, // 'TAX_INVOICE'(세금계산서), 'CASH_RECEIPT'(현금영수증)
        { name: 'company_name', type: 'TEXT' },
        { name: 'biz_number', type: 'TEXT', notNull: true },
        { name: 'ceo_name', type: 'TEXT' },
        { name: 'manager_email', type: 'TEXT', notNull: true },
        { name: 'amount_krw', type: 'INTEGER', notNull: true },
        { name: 'status', type: 'TEXT' }, // 'REQUESTED', 'ISSUED', 'REJECTED'
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_tax_invoices' }
    );

    // 8. sheetbot_inquiries 테이블 생성 (1:1 고객 문의 접수 대장)
    await safeCreateTable(
      'SheetBot 고객 문의 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'user_email', type: 'TEXT', notNull: true },
        { name: 'user_name', type: 'TEXT' },
        { name: 'category', type: 'TEXT', notNull: true }, // 'GAS_ERROR', 'PAYMENT', 'PROPOSAL', 'OTHER'
        { name: 'title', type: 'TEXT', notNull: true },
        { name: 'content', type: 'TEXT', notNull: true },
        { name: 'status', type: 'TEXT' }, // 'PENDING', 'ANSWERED'
        { name: 'answer', type: 'TEXT' },
        { name: 'answered_at', type: 'TEXT' },
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_inquiries' }
    );

    // 9. sheetbot_reviews 테이블 생성 (사용 후기 및 평점 대장)
    await safeCreateTable(
      'SheetBot 사용 후기 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'user_email', type: 'TEXT', notNull: true },
        { name: 'user_name', type: 'TEXT' },
        { name: 'rating', type: 'INTEGER', notNull: true }, // 1 ~ 5
        { name: 'title', type: 'TEXT', notNull: true },
        { name: 'content', type: 'TEXT', notNull: true },
        { name: 'use_case', type: 'TEXT' }, // 예: '일일 마감 자동화', '이메일 웹훅 알림'
        { name: 'image_url', type: 'TEXT' }, // 후기 첨부 사진 (Data URL 또는 이미지 URL)
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_reviews' }
    );

    // 10. sheetbot_faqs 테이블 생성 (FAQ 관리 대장)
    await safeCreateTable(
      'SheetBot FAQ 관리 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'category', type: 'TEXT', notNull: true }, // '시작하기', '토큰/결제', 'Apps Script/기능', '보안/계정'
        { name: 'question', type: 'TEXT', notNull: true },
        { name: 'answer', type: 'TEXT', notNull: true },
        { name: 'sort_order', type: 'INTEGER' },
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_faqs' }
    );

    // 11. sheetbot_users 테이블 생성 (회원 마스터 및 상태 관리 대장)
    await safeCreateTable(
      'SheetBot 회원 마스터 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'email', type: 'TEXT', notNull: true },
        { name: 'name', type: 'TEXT' },
        { name: 'role', type: 'TEXT' }, // 'USER', 'ADMIN'
        { name: 'status', type: 'TEXT' }, // 'ACTIVE', 'SUSPENDED'
        { name: 'tier', type: 'TEXT' }, // 'FREE', 'PRO', 'ENTERPRISE'
        { name: 'note', type: 'TEXT' },
        { name: 'created_at', type: 'TEXT' },
        { name: 'last_login_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_users' }
    );

    // 12. sheetbot_dispatch_logs 테이블 생성 (알림 발송 이력 대장)
    await safeCreateTable(
      'SheetBot 알림 발송 이력 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'channel', type: 'TEXT', notNull: true }, // 'SMS', 'EMAIL'
        { name: 'event_type', type: 'TEXT', notNull: true }, // 'inquiry', 'tax_invoice', 'payment', 'test', 'other'
        { name: 'rule_name', type: 'TEXT' }, // 적용된 스마트 규칙명 또는 기본 알림
        { name: 'recipient', type: 'TEXT', notNull: true }, // 전화번호 또는 이메일
        { name: 'recipient_type', type: 'TEXT' }, // 'ADMIN', 'CUSTOMER'
        { name: 'title', type: 'TEXT' },
        { name: 'content', type: 'TEXT' },
        { name: 'status', type: 'TEXT', notNull: true }, // 'SUCCESS', 'FAILED'
        { name: 'error_message', type: 'TEXT' },
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_dispatch_logs' }
    );

    // 13. sheetbot_easybot_chats 테이블 생성 (시트봇 AI 대화 영구 보관 대장)
    await safeCreateTable(
      'SheetBot AI 대화 이력 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'user_email', type: 'TEXT', notNull: true },
        { name: 'role', type: 'TEXT', notNull: true }, // 'user', 'bot'
        { name: 'message', type: 'TEXT', notNull: true },
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_easybot_chats' }
    );

    // 14. sheetbot_user_devices 테이블 생성 (회원 전용 구글메시지 디바이스 대장)
    await safeCreateTable(
      'SheetBot 회원 SMS 디바이스 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'user_email', type: 'TEXT', notNull: true },
        { name: 'label', type: 'TEXT', notNull: true },
        { name: 'phone_number', type: 'TEXT' },
        { name: 'device_id', type: 'TEXT' },
        { name: 'pairing_mode', type: 'TEXT' }, // 'qr' | 'google_account'
        { name: 'google_profile_name', type: 'TEXT' },
        { name: 'status', type: 'TEXT' }, // 'CONNECTED' | 'DISCONNECTED' | 'PAIRING'
        { name: 'last_connected_at', type: 'TEXT' },
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_user_devices' }
    );

    // 15. sheetbot_user_smart_rules 테이블 생성 (회원 자연어 스마트 발송 규칙 대장)
    await safeCreateTable(
      'SheetBot 회원 자연어 알림 규칙 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'user_email', type: 'TEXT', notNull: true },
        { name: 'project_id', type: 'TEXT' }, // 'all' 또는 특정 sheetbot_projects id
        { name: 'name', type: 'TEXT', notNull: true },
        { name: 'prompt', type: 'TEXT', notNull: true },
        { name: 'trigger_event', type: 'TEXT' }, // 'sheet_edit', 'row_added', 'status_change', 'daily_summary', 'custom'
        { name: 'target_recipient', type: 'TEXT' }, // 'self', 'column_phone', 'custom_number'
        { name: 'recipient_column', type: 'TEXT' }, // 예: '연락처', '고객전화'
        { name: 'custom_phone', type: 'TEXT' },
        { name: 'message_template', type: 'TEXT' },
        { name: 'is_active', type: 'INTEGER' }, // 1: 활성, 0: 비활성
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_user_smart_rules' }
    );

    // 16. sheetbot_user_dispatch_logs 테이블 생성 (회원 알림 발송 이력 대장)
    await safeCreateTable(
      'SheetBot 회원 알림 발송 이력 대장',
      [
        { name: 'id', type: 'TEXT', notNull: true, primaryKey: true },
        { name: 'user_email', type: 'TEXT', notNull: true },
        { name: 'rule_id', type: 'TEXT' },
        { name: 'rule_name', type: 'TEXT' },
        { name: 'device_id', type: 'TEXT' },
        { name: 'recipient', type: 'TEXT', notNull: true },
        { name: 'content', type: 'TEXT' },
        { name: 'status', type: 'TEXT', notNull: true }, // 'SUCCESS', 'FAILED'
        { name: 'error_message', type: 'TEXT' },
        { name: 'created_at', type: 'TEXT' },
      ],
      { tableName: 'sheetbot_user_dispatch_logs' }
    );

    // 17. 레거시 데이터 마이그레이션 실행
    await migrateLegacySettingsData();

    isDbInitialized = true;
    console.log('[Setup-DB] ✅ SheetBot Database schema initialized and verified.');
  } catch (err: any) {
    console.warn('[Setup-DB] Setup warning:', err.message);
  }
}
