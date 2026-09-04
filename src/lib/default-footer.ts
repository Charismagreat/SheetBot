export interface FooterInfo {
  company_name: string;
  ceo_name: string;
  biz_number: string;
  mail_order_biz_number: string;
  address: string;
  privacy_manager: string;
  hosting_provider: string;
  cs_email: string;
  cs_phone: string;
  easybot_info: string;
  brand_description: string;
  copyright_text: string;
}

export const DEFAULT_FOOTER: FooterInfo = {
  company_name: "시트봇 (SheetBot Co., Ltd.)",
  ceo_name: "대표이사",
  biz_number: "123-45-67890",
  mail_order_biz_number: "제2026-서울강남-0000호",
  address: "서울특별시 강남구 테헤란로 123 시트봇 빌딩 8층",
  privacy_manager: "관리자 (privacy@sheetbot.io)",
  hosting_provider: "EGDesk Cloud Infrastructure",
  cs_email: "support@sheetbot.io",
  cs_phone: "평일 09:00 - 18:00 (점심 12-13)",
  easybot_info: "이지봇(EasyBot) 24시간 상담",
  brand_description: "SheetBot은 복잡한 구글 스프레드시트 수식과 Google Apps Script(GAS)를 자연어로 간편하게 자동화하는 B2B 업무 생산성 플랫폼입니다.",
  copyright_text: "© 2026 SheetBot Corp. All rights reserved.",
};
