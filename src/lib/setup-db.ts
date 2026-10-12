import { queryTable, insertRows } from './egdesk-helpers';

export { queryTable, insertRows };

let isDbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

/**
 * Runtime DB bootstrap for SheetBot.
 *
 * Schema (tables/columns) is owned by `egdesk.schema.ts` at the project root.
 * EGDesk applies it on server start via createTablesFromParsed — do not recreate
 * tables here.
 *
 * This function only runs optional data seeding (prompt templates).
 */
export async function setupDatabase(_force = false): Promise<void> {
  if (isDbInitialized && !_force) return;
  if (dbInitPromise && !_force) return dbInitPromise;

  dbInitPromise = (async () => {
    try {
      await seedDefaultPromptTemplates();
      isDbInitialized = true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Setup-DB] Setup warning:', message);
    } finally {
      dbInitPromise = null;
    }
  })();

  return dbInitPromise;
}

/**
 * @deprecated Schema is defined in egdesk.schema.ts. EGDesk creates tables on start.
 */
export async function safeCreateTable(
  _displayName: string,
  _columns: unknown[],
  _options: { tableName: string },
): Promise<void> {
  if (process.env.SHEETBOT_WARN_DEPRECATED_DB_HELPERS === '1') {
    console.warn(
      '[Setup-DB] safeCreateTable is deprecated; edit egdesk.schema.ts and restart EGDesk.',
    );
  }
}

async function seedDefaultPromptTemplates(): Promise<void> {
  try {
    const existing = await queryTable('sheetbot_prompt_templates', { limit: 1 }).catch(() => ({ rows: [] }));
    if (existing.rows && existing.rows.length > 0) return;

    const defaultPrompts = [
      {
        id: 'prompt_webapp_survey',
        category: 'WEBAPP',
        category_name: '🌐 대중 공개 웹 접수폼',
        title: '모바일 반응형 참가신청 및 설문 접수 독립 웹페이지',
        description:
          '구글 로그인 없이 일반 대중 누구나 스마트폰/PC로 접속해 실시간 제출하는 웹페이지(Web App)',
        prompt_text:
          "시트에 '접수일시, 성함, 연락처, 참여구분, 희망세션, 사전질문, 비고' 열이 있습니다. 일반 대중에게 배포할 수 있는 깔끔하고 모던한 Tailwind CSS 기반의 독립 설문/신청 웹페이지(doGet Web App)를 만들어줘. 제출 시 즉시 시트의 마지막 행에 안전하게 추가되고 감사의 완료 화면이 표시되어야 해.",
        tags: JSON.stringify(['웹앱', '설문조사', '참가신청', '비회원접수', '실시간연동']),
        icon: 'Globe',
        is_featured: 1,
        created_at: new Date().toISOString(),
      },
      {
        id: 'prompt_order_inventory',
        category: 'ORDER_INVENTORY',
        category_name: '📦 발주/재고 관리',
        title: '안전재고 미달 자동 감지 및 발주 권고서 작성',
        description: '현재고가 안전재고 이하로 떨어지면 자동으로 계산하여 발주필요목록 탭에 적재하고 알림',
        prompt_text:
          "재고현황 시트에서 '현재고'가 '안전재고' 이하로 떨어진 품목을 자동으로 감지하여, '발주권고목록' 탭에 해당 품목명, 규격, 부족수량, 추천발주수량을 계산하여 기록하고 상단 메뉴에 [재고 점검 실행] 기능을 만들어줘.",
        tags: JSON.stringify(['재고관리', '자동발주', '안전재고', '스케줄자동화']),
        icon: 'Package',
        is_featured: 1,
        created_at: new Date().toISOString(),
      },
      {
        id: 'prompt_ai_ocr',
        category: 'AI_OCR',
        category_name: '📑 문서/영수증 OCR',
        title: '발주서/영수증 이미지 AI 자동 판독 및 시트 행 입력',
        description:
          'PDF나 영수증 이미지를 업로드하면 이지데스크 AI Caller가 표 데이터를 인식하여 시트에 기입',
        prompt_text:
          "시트 상단 메뉴에 [AI 영수증/발주서 판독] 사이드바를 제공하고, 영수증이나 거래명세서 이미지를 첨부하면 이지데스크 AI Caller를 통해 '거래일자, 거래처명, 품목, 공급가액, 세액, 합계'를 자동 추출하여 장부에 한 행씩 등록해줘.",
        tags: JSON.stringify(['AI OCR', '영수증인식', '거래명세서', '자동입력']),
        icon: 'FileText',
        is_featured: 1,
        created_at: new Date().toISOString(),
      },
      {
        id: 'prompt_report_stats',
        category: 'REPORT_STATS',
        category_name: '📊 보고서/자동통계',
        title: '매일 오후 6시 판매원장 일일 마감 집계 및 일보 시트 생성',
        description: '하루 매출 데이터를 자동으로 필터링 및 집계하여 깔끔한 일일 마감 리포트 탭 생성',
        prompt_text:
          "판매원장 시트의 오늘 일자 데이터를 자동으로 필터링하여 결제수단별 매출 합계, 베스트셀러 TOP 5, 총 객단가를 계산한 뒤 새로운 '일일마감_YYYYMMDD' 탭을 생성하고 깔끔한 테두리와 배경색 서식으로 정돈해줘.",
        tags: JSON.stringify(['일일마감', '매출보고서', '통계집계', '서식적용']),
        icon: 'BarChart3',
        is_featured: 1,
        created_at: new Date().toISOString(),
      },
      {
        id: 'prompt_data_clean',
        category: 'DATA_CLEAN',
        category_name: '🔍 데이터 정제/검증',
        title: '중복 고객 식별 및 전화번호/사업자번호 표준 서식 변환',
        description:
          '형식이 뒤섞인 연락처를 010-XXXX-XXXX로 표준화하고 중복 등록 고객을 자동 탐지하여 하이라이트',
        prompt_text:
          "고객DB 시트의 전화번호 하이픈(-) 누락이나 공백을 010-XXXX-XXXX 표준형식으로 자동 변환하고, 중복 등록된 이메일이나 연락처를 찾아 노란색 배경색으로 하이라이트 표시 및 중복 사유를 비고열에 기록해줘.",
        tags: JSON.stringify(['데이터정제', '중복제거', '전화번호정규화', '유효성검사']),
        icon: 'Sparkles',
        is_featured: 1,
        created_at: new Date().toISOString(),
      },
      {
        id: 'prompt_webapp_inquiry',
        category: 'WEBAPP',
        category_name: '🌐 대중 공개 웹 접수폼',
        title: '고객 A/S 및 1:1 상담 접수용 반응형 모바일 웹페이지',
        description: '접수번호 자동 채번(CS-YYYYMMDD-번호) 및 상태 관리(접수완료/처리중) 연동 웹앱',
        prompt_text:
          "고객 문의접수 시트에 '접수번호, 접수일시, 고객명, 연락처, 문의유형, 증상설명, 처리상태' 열이 있습니다. 고객이 스마트폰으로 간편하게 문의를 남길 수 있는 공개 웹페이지(Web App)를 배포하고, 접수 시 접수번호(CS-YYYYMMDD-번호)를 자동 채번하여 시트에 등록해줘.",
        tags: JSON.stringify(['고객센터', 'AS접수', '웹앱', '자동채번', '모바일최적화']),
        icon: 'Send',
        is_featured: 1,
        created_at: new Date().toISOString(),
      },
    ];

    await insertRows('sheetbot_prompt_templates', defaultPrompts);
    console.log(`[Setup-DB] ✅ Seeded ${defaultPrompts.length} default prompt templates.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[Setup-DB] Prompt seeding warning:', message);
  }
}
