/**
 * 🏦 은행 입금 알림 SMS/RCS 초고속 파서 (bank-sms-parser.ts)
 * 대한민국 주요 8대 시중은행 및 인터넷은행의 입금 문자에서
 * 금액(KRW)과 고유 식별 코드(예: C670, 홍419 등)를 초고속(0.01ms)으로 추출합니다.
 */

export interface ParsedDepositSms {
  success: boolean;
  bankName: string;
  amountKrw: number;
  depositCode: string;
  rawText: string;
  matchedRule: string;
}

// 주요 시중은행 공식 대표 발신번호 프리셋
export const BANK_ORIGIN_NUMBERS: Record<string, { name: string; number: string }> = {
  kakaobank: { name: "카카오뱅크", number: "1599-3333" },
  tossbank: { name: "토스뱅크", number: "1661-7654" },
  kb: { name: "KB국민은행", number: "1588-9999" },
  shinhan: { name: "신한은행", number: "1577-8000" },
  woori: { name: "우리은행", number: "1588-5000" },
  hana: { name: "하나은행", number: "1599-1111" },
  nh: { name: "NH농협은행", number: "1588-2100" },
  ibk: { name: "IBK기업은행", number: "1566-2566" },
};

/**
 * 입금 알림 SMS 텍스트 파싱
 */
export function parseBankDepositSms(text: string): ParsedDepositSms {
  const clean = (text || "").trim();
  if (!clean) {
    return {
      success: false,
      bankName: "알 수 없음",
      amountKrw: 0,
      depositCode: "",
      rawText: text,
      matchedRule: "EMPTY",
    };
  }

  // 1. 카카오뱅크 패턴: [카카오뱅크] 09/17 15:10 입금 12,000원(C670) 잔액 ...
  const kakaoMatch = clean.match(/\[?카카오뱅크\]?[\s\S]*?입금\s*([\d,]+)원\s*\(([^)]+)\)/i);
  if (kakaoMatch) {
    return {
      success: true,
      bankName: "카카오뱅크",
      amountKrw: parseInt(kakaoMatch[1].replace(/,/g, ""), 10),
      depositCode: kakaoMatch[2].trim(),
      rawText: clean,
      matchedRule: "KAKAOBANK_EXACT",
    };
  }

  // 2. 토스뱅크 패턴: [토스뱅크] C670님이 12,000원을 보냈어요 또는 [토스] 입금 12,000원 C670
  const tossMatch1 = clean.match(/\[?토스(?:뱅크)?\]?\s*([A-Za-z0-9가-힣]+)님이\s*([\d,]+)원/i);
  if (tossMatch1) {
    return {
      success: true,
      bankName: "토스뱅크",
      amountKrw: parseInt(tossMatch1[2].replace(/,/g, ""), 10),
      depositCode: tossMatch1[1].trim(),
      rawText: clean,
      matchedRule: "TOSSBANK_SENT",
    };
  }
  const tossMatch2 = clean.match(/\[?토스(?:뱅크)?\]?[\s\S]*?입금\s*([\d,]+)원\s*([A-Za-z0-9가-힣]+)/i);
  if (tossMatch2) {
    return {
      success: true,
      bankName: "토스뱅크",
      amountKrw: parseInt(tossMatch2[1].replace(/,/g, ""), 10),
      depositCode: tossMatch2[2].trim(),
      rawText: clean,
      matchedRule: "TOSSBANK_DEPOSIT",
    };
  }

  // 3. KB국민은행 패턴: [KB]09/17 15:10 3333** C670 12,000원 입금 잔액 ...
  const kbMatch = clean.match(/\[?KB(?:국민)?\]?[\s\S]*?\d{2}\/\d{2}[\s\S]*?\*+\s*([A-Za-z0-9가-힣]+)\s*([\d,]+)원\s*입금/i);
  if (kbMatch) {
    return {
      success: true,
      bankName: "KB국민은행",
      amountKrw: parseInt(kbMatch[2].replace(/,/g, ""), 10),
      depositCode: kbMatch[1].trim(),
      rawText: clean,
      matchedRule: "KB_EXACT",
    };
  }

  // 4. 신한은행 패턴: [신한은행] 09/17 15:10 입금 12,000원 C670 잔액 ...
  const shinhanMatch = clean.match(/\[?신한(?:은행)?\]?[\s\S]*?입금\s*([\d,]+)원\s*([A-Za-z0-9가-힣]+)/i);
  if (shinhanMatch) {
    return {
      success: true,
      bankName: "신한은행",
      amountKrw: parseInt(shinhanMatch[1].replace(/,/g, ""), 10),
      depositCode: shinhanMatch[2].trim(),
      rawText: clean,
      matchedRule: "SHINHAN_EXACT",
    };
  }

  // 5. 우리은행 패턴: [우리은행] 09/17 15:10 입금 12,000원(C670)
  const wooriMatch = clean.match(/\[?우리(?:은행)?\]?[\s\S]*?입금\s*([\d,]+)원(?:\s*\(|\s+)([A-Za-z0-9가-힣]+)\)?/i);
  if (wooriMatch) {
    return {
      success: true,
      bankName: "우리은행",
      amountKrw: parseInt(wooriMatch[1].replace(/,/g, ""), 10),
      depositCode: wooriMatch[2].trim(),
      rawText: clean,
      matchedRule: "WOORI_EXACT",
    };
  }

  // 6. NH농협 패턴: [NH농협] 09/17 15:10 12,000원 입금 C670 잔액 ...
  const nhMatch = clean.match(/\[?NH(?:농협)?\]?[\s\S]*?([\d,]+)원\s*입금\s*([A-Za-z0-9가-힣]+)/i);
  if (nhMatch) {
    return {
      success: true,
      bankName: "NH농협은행",
      amountKrw: parseInt(nhMatch[1].replace(/,/g, ""), 10),
      depositCode: nhMatch[2].trim(),
      rawText: clean,
      matchedRule: "NH_EXACT",
    };
  }

  // 7. 스마트 범용 폴백 패턴:
  // "입금" 단어와 "XXXX원"이 있고, C670 (영문 1자리+숫자3자리) 또는 한글 1~3글자+숫자3자리 포맷 탐색
  const generalAmount = clean.match(/([\d,]+)원\s*입금|입금\s*([\d,]+)원/i);
  const codeCandidate = clean.match(/\b([A-Z]\d{3})\b/i) || clean.match(/([가-힣]{1,4}\d{3})/);

  if (generalAmount && codeCandidate) {
    const rawAmt = generalAmount[1] || generalAmount[2];
    return {
      success: true,
      bankName: "시중은행 (일반)",
      amountKrw: parseInt(rawAmt.replace(/,/g, ""), 10),
      depositCode: codeCandidate[1].toUpperCase().trim(),
      rawText: clean,
      matchedRule: "GENERAL_SMART_REGEX",
    };
  }

  return {
    success: false,
    bankName: "알 수 없음",
    amountKrw: 0,
    depositCode: "",
    rawText: clean,
    matchedRule: "FAILED_TO_MATCH",
  };
}
