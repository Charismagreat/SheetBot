export interface SnsChannel {
  id: string;
  type: "youtube" | "instagram" | "blog" | "github" | "kakao" | "twitter" | "custom";
  name: string;
  url: string;
  enabled: boolean;
}

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
  deposit_bank_name?: string;
  deposit_account_number?: string;
  deposit_account_holder?: string;
  deposit_toss_id?: string;
  deposit_notify_phone?: string;
  google_messages_enabled?: boolean;
  fast_burst_scan?: boolean;
  bank_origin_number?: string;
  auto_webhook_secret?: string;
  sns_channels: SnsChannel[];
}

export const DEFAULT_SNS_CHANNELS: SnsChannel[] = [
  {
    id: "sns_yt",
    type: "youtube",
    name: "유튜브",
    url: "https://youtube.com/@SheetBot",
    enabled: true,
  },
  {
    id: "sns_insta",
    type: "instagram",
    name: "인스타그램",
    url: "https://instagram.com/sheetbot_official",
    enabled: true,
  },
  {
    id: "sns_blog",
    type: "blog",
    name: "공식 블로그",
    url: "https://blog.naver.com/sheetbot",
    enabled: true,
  },
  {
    id: "sns_gh",
    type: "github",
    name: "GitHub",
    url: "https://github.com/Charismagreat/SheetBot",
    enabled: true,
  },
  {
    id: "sns_kakao",
    type: "kakao",
    name: "카카오 채널",
    url: "https://pf.kakao.com/_sheetbot",
    enabled: false,
  },
];

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
  easybot_info: "시트봇 AI(SheetBot AI) 24시간 상담",
  brand_description: "SheetBot은 복잡한 구글 스프레드시트 수식과 Google Apps Script(GAS)를 자연어로 간편하게 자동화하는 B2B 업무 생산성 플랫폼입니다.",
  copyright_text: "© 2026 SheetBot Corp. All rights reserved.",
  deposit_bank_name: "카카오뱅크",
  deposit_account_number: "3333-12-1695965",
  deposit_account_holder: "차호석",
  deposit_toss_id: "",
  deposit_notify_phone: "01072165884",
  google_messages_enabled: true,
  fast_burst_scan: true,
  bank_origin_number: "1599-3333",
  auto_webhook_secret: "sb_wh_sec_2026",
  sns_channels: DEFAULT_SNS_CHANNELS,
};
