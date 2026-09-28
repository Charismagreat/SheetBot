/**
 * 🏦 금융(은행/카드사) 입출금 및 결제 알림 SMS/RCS 초고속 파서 (bank-sms-parser.ts)
 * 대한민국 주요 시중은행, 인터넷은행, 카드사의 입금 및 출금(체크/신용카드 승인) 문자에서
 * 거래 구분(입금/출금), 금액(KRW), 입금자/가맹점명을 초고속(0.01ms)으로 정밀 추출합니다.
 */

export interface ParsedDepositSms {
  success: boolean;
  transactionType: "입금" | "출금"; // 입금 또는 출금
  bankName: string;
  amountKrw: number;
  depositCode: string;
  depositorName?: string;
  rawText: string;
  matchedRule: string;
}

// 주요 시중은행 및 카드사 공식 대표 발신번호 프리셋
export const BANK_ORIGIN_NUMBERS: Record<string, { name: string; number: string; type: "bank" | "card" }> = {
  // 인터넷 및 시중은행
  kakaobank: { name: "카카오뱅크", number: "1599-3333", type: "bank" },
  tossbank: { name: "토스뱅크", number: "1661-7654", type: "bank" },
  kbank: { name: "케이뱅크", number: "1522-1000", type: "bank" },
  kb: { name: "KB국민은행", number: "1588-9999", type: "bank" },
  shinhan: { name: "신한은행", number: "1577-8000", type: "bank" },
  woori: { name: "우리은행", number: "1588-5000", type: "bank" },
  hana: { name: "하나은행", number: "1599-1111", type: "bank" },
  nh: { name: "NH농협은행", number: "1588-2100", type: "bank" },
  ibk: { name: "IBK기업은행", number: "1566-2566", type: "bank" },
  sc: { name: "SC제일은행", number: "1588-1599", type: "bank" },
  epost: { name: "우체국", number: "1588-1900", type: "bank" },
  kfcc: { name: "새마을금고", number: "1599-9000", type: "bank" },
  cu: { name: "신협", number: "1566-6000", type: "bank" },

  // 주요 신용/체크 카드사
  kbcard: { name: "KB국민카드", number: "1588-1688", type: "card" },
  shinhancard: { name: "신한카드", number: "1544-7000", type: "card" },
  samsungcard: { name: "삼성카드", number: "1588-8700", type: "card" },
  hyundaicard: { name: "현대카드", number: "1577-6000", type: "card" },
  lottecard: { name: "롯데카드", number: "1588-8100", type: "card" },
  bccard: { name: "BC카드", number: "1588-4000", type: "card" },
  hanacard: { name: "하나카드", number: "1800-1111", type: "card" },
  wooricard: { name: "우리카드", number: "1588-9955", type: "card" },
  nhcard: { name: "NH농협카드", number: "1644-4000", type: "card" },
};

// 스팸/광고/대출안내 등 거래와 무관한 제외 키워드
const SPAM_EXCLUDE_KEYWORDS = ["광고", "대출", "금리인하", "한도조회", "이벤트", "마케팅동의", "인증번호"];

/**
 * 입출금 및 카드 결제 알림 SMS/RCS 텍스트 정밀 파싱
 */
export function parseBankDepositSms(text: string): ParsedDepositSms {
  const clean = (text || "").trim();
  if (!clean) {
    return {
      success: false,
      transactionType: "입금",
      bankName: "알 수 없음",
      amountKrw: 0,
      depositCode: "",
      rawText: text,
      matchedRule: "EMPTY",
    };
  }

  // 거래와 무관한 단순 광고/대출안내/인증번호 즉시 배제
  if (SPAM_EXCLUDE_KEYWORDS.some((kw) => clean.includes(kw))) {
    return {
      success: false,
      transactionType: "입금",
      bankName: "스팸/광고 제외",
      amountKrw: 0,
      depositCode: "",
      rawText: clean,
      matchedRule: "EXCLUDED_SPAM",
    };
  }

  // ==========================================
  // [A] 출금 및 카드 결제 승인 패턴 우선 검사
  // ==========================================
  const isWithdrawOrApproval =
    clean.includes("출금") ||
    clean.includes("승인") ||
    clean.includes("결제") ||
    clean.includes("체크승인") ||
    clean.includes("카드승인") ||
    clean.includes("송금완료") ||
    clean.includes("이체완료") ||
    clean.includes("일시불");

  if (isWithdrawOrApproval && !clean.includes("승인취소") && !clean.includes("입금")) {
    // 1-A. 카드사 승인 패턴 A: [카드사명] ... 금액원 가맹점 승인 (예: [KB국민카드] 15,800원 스타벅스 승인)
    const cardMatchA = clean.match(/\[?([가-힣A-Za-z0-9]+(?:카드|Pay|페이))\]?[\s\S]*?([\d,]+)원\s+([A-Za-z0-9가-힣\s()]+?)\s*(?:승인|결제)/i);
    if (cardMatchA) {
      const amt = parseInt(cardMatchA[2].replace(/,/g, ""), 10);
      const merchant = cardMatchA[3].replace(/누적|잔액|일시불/g, "").trim();
      return {
        success: true,
        transactionType: "출금",
        bankName: cardMatchA[1],
        amountKrw: amt,
        depositCode: merchant || "가맹점",
        depositorName: merchant || "가맹점",
        rawText: clean,
        matchedRule: "CARD_APPROVAL_BEFORE",
      };
    }

    // 1-B. 카드사 승인 패턴 B: [카드사명] ... 금액원 승인 가맹점 (예: [현대카드] 50,000원 승인 교보문고)
    const cardMatchB = clean.match(/\[?([가-힣A-Za-z0-9]+(?:카드|Pay|페이))\]?[\s\S]*?([\d,]+)원[\s\S]*?(?:승인|결제)\s+([A-Za-z0-9가-힣\s()]+)/i);
    if (cardMatchB) {
      const amt = parseInt(cardMatchB[2].replace(/,/g, ""), 10);
      const merchant = cardMatchB[3].replace(/누적[\s\S]*|잔액[\s\S]*|일시불/g, "").trim();
      return {
        success: true,
        transactionType: "출금",
        bankName: cardMatchB[1],
        amountKrw: amt,
        depositCode: merchant || "가맹점",
        depositorName: merchant || "가맹점",
        rawText: clean,
        matchedRule: "CARD_APPROVAL_AFTER",
      };
    }

    // 2. 은행 출금 패턴 1: [은행명] 09/28 10:10 출금 15,000원(수취인) 잔액 ...
    const bankWithdrawMatch1 = clean.match(/\[?([가-힣A-Za-z0-9]+(?:은행|뱅크|금고|신협|우체국|농협))\]?[\s\S]*?출금\s*([\d,]+)원(?:\s*\(([^)]+)\)|\s+([A-Za-z0-9가-힣]+))?/i);
    if (bankWithdrawMatch1) {
      const amt = parseInt(bankWithdrawMatch1[2].replace(/,/g, ""), 10);
      const recipient = (bankWithdrawMatch1[3] || bankWithdrawMatch1[4] || "").replace(/잔액[\s\S]*|통장/g, "").trim();
      return {
        success: true,
        transactionType: "출금",
        bankName: bankWithdrawMatch1[1],
        amountKrw: amt,
        depositCode: recipient || "출금처",
        depositorName: recipient || "출금처",
        rawText: clean,
        matchedRule: "BANK_WITHDRAW_EXACT",
      };
    }

    // 2-2. 은행 출금 패턴 2: [은행명] 금액원 출금 가맹점/수취인 (예: [NH농협] 55,000원 출금 GS25)
    const bankWithdrawMatch2 = clean.match(/\[?([가-힣A-Za-z0-9]+(?:은행|뱅크|금고|신협|우체국|농협))\]?[\s\S]*?([\d,]+)원\s*출금\s*([A-Za-z0-9가-힣]+)?/i);
    if (bankWithdrawMatch2) {
      const amt = parseInt(bankWithdrawMatch2[2].replace(/,/g, ""), 10);
      const recipient = (bankWithdrawMatch2[3] || "").replace(/잔액[\s\S]*|통장/g, "").trim();
      return {
        success: true,
        transactionType: "출금",
        bankName: bankWithdrawMatch2[1],
        amountKrw: amt,
        depositCode: recipient || "출금처",
        depositorName: recipient || "출금처",
        rawText: clean,
        matchedRule: "BANK_WITHDRAW_AMOUNT_FIRST",
      };
    }

    // 3. 범용 출금/승인 패턴: 금액원 + 출금/승인/결제
    const generalWithdrawMatch = clean.match(/([\d,]+)원\s*(?:출금|승인|결제)|(?:출금|승인|결제)\s*([\d,]+)원/i);
    if (generalWithdrawMatch) {
      const rawAmt = generalWithdrawMatch[1] || generalWithdrawMatch[2];
      const amt = parseInt(rawAmt.replace(/,/g, ""), 10);

      // 금융사/가맹점명 추출 시도
      const bankHeadMatch = clean.match(/\[([가-힣A-Za-z0-9]+)\]/);
      const bankFound = bankHeadMatch ? bankHeadMatch[1] : "카드/금융사";

      const parenMatch = clean.match(/\(([^)]+)\)/);
      const nameCand = parenMatch && !parenMatch[1].includes("잔액") ? parenMatch[1].trim() : "가맹점/출금처";

      if (amt > 0) {
        return {
          success: true,
          transactionType: "출금",
          bankName: bankFound,
          amountKrw: amt,
          depositCode: nameCand,
          depositorName: nameCand,
          rawText: clean,
          matchedRule: "GENERAL_WITHDRAW_REGEX",
        };
      }
    }
  }

  // ==========================================
  // [B] 입금 알림 패턴 검사
  // ==========================================

  // 1. 카카오뱅크 패턴 1: [카카오뱅크] 09/17 15:10 입금 12,000원(C670) 잔액 ...
  const kakaoMatch = clean.match(/\[?카카오뱅크\]?[\s\S]*?입금\s*([\d,]+)원\s*\(([^)]+)\)/i);
  if (kakaoMatch) {
    return {
      success: true,
      transactionType: "입금",
      bankName: "카카오뱅크",
      amountKrw: parseInt(kakaoMatch[1].replace(/,/g, ""), 10),
      depositCode: kakaoMatch[2].trim(),
      depositorName: kakaoMatch[2].trim(),
      rawText: clean,
      matchedRule: "KAKAOBANK_EXACT",
    };
  }

  // 1-2. 카카오뱅크 패턴 2 (통신사 SMS 및 푸시 변환 실물): [카카오뱅크] 날짜 입금 11,911원 입금자명 잔액 ...
  const kakaoMatch2 = clean.match(/\[?카카오뱅크\]?[\s\S]*?입금\s*([\d,]+)원\s*([A-Za-z0-9가-힣]+)/i);
  if (kakaoMatch2) {
    return {
      success: true,
      transactionType: "입금",
      bankName: "카카오뱅크",
      amountKrw: parseInt(kakaoMatch2[1].replace(/,/g, ""), 10),
      depositCode: kakaoMatch2[2].trim(),
      depositorName: kakaoMatch2[2].trim(),
      rawText: clean,
      matchedRule: "KAKAOBANK_AMOUNT_NAME",
    };
  }

  // 2. 토스뱅크 패턴: [토스뱅크] C670님이 12,000원을 보냈어요 또는 [토스] 입금 12,000원 C670
  const tossMatch1 = clean.match(/\[?토스(?:뱅크)?\]?\s*([A-Za-z0-9가-힣]+)님이\s*([\d,]+)원/i);
  if (tossMatch1) {
    return {
      success: true,
      transactionType: "입금",
      bankName: "토스뱅크",
      amountKrw: parseInt(tossMatch1[2].replace(/,/g, ""), 10),
      depositCode: tossMatch1[1].trim(),
      depositorName: tossMatch1[1].trim(),
      rawText: clean,
      matchedRule: "TOSSBANK_SENT",
    };
  }
  const tossMatch2 = clean.match(/\[?토스(?:뱅크)?\]?[\s\S]*?입금\s*([\d,]+)원\s*([A-Za-z0-9가-힣]+)/i);
  if (tossMatch2) {
    return {
      success: true,
      transactionType: "입금",
      bankName: "토스뱅크",
      amountKrw: parseInt(tossMatch2[1].replace(/,/g, ""), 10),
      depositCode: tossMatch2[2].trim(),
      depositorName: tossMatch2[2].trim(),
      rawText: clean,
      matchedRule: "TOSSBANK_DEPOSIT",
    };
  }

  // 3. KB국민은행 패턴: [KB]09/17 15:10 3333** C670 12,000원 입금 잔액 ...
  const kbMatch = clean.match(/\[?KB(?:국민)?\]?[\s\S]*?\d{2}\/\d{2}[\s\S]*?\*+\s*([A-Za-z0-9가-힣]+)\s*([\d,]+)원\s*입금/i);
  if (kbMatch) {
    return {
      success: true,
      transactionType: "입금",
      bankName: "KB국민은행",
      amountKrw: parseInt(kbMatch[2].replace(/,/g, ""), 10),
      depositCode: kbMatch[1].trim(),
      depositorName: kbMatch[1].trim(),
      rawText: clean,
      matchedRule: "KB_EXACT",
    };
  }

  // 4. 신한은행 패턴: [신한은행] 09/17 15:10 입금 12,000원 C670 잔액 ...
  const shinhanMatch = clean.match(/\[?신한(?:은행)?\]?[\s\S]*?입금\s*([\d,]+)원\s*([A-Za-z0-9가-힣]+)/i);
  if (shinhanMatch) {
    return {
      success: true,
      transactionType: "입금",
      bankName: "신한은행",
      amountKrw: parseInt(shinhanMatch[1].replace(/,/g, ""), 10),
      depositCode: shinhanMatch[2].trim(),
      depositorName: shinhanMatch[2].trim(),
      rawText: clean,
      matchedRule: "SHINHAN_EXACT",
    };
  }

  // 5. 우리은행 패턴: [우리은행] 09/17 15:10 입금 12,000원(C670)
  const wooriMatch = clean.match(/\[?우리(?:은행)?\]?[\s\S]*?입금\s*([\d,]+)원(?:\s*\(|\s+)([A-Za-z0-9가-힣]+)\)?/i);
  if (wooriMatch) {
    return {
      success: true,
      transactionType: "입금",
      bankName: "우리은행",
      amountKrw: parseInt(wooriMatch[1].replace(/,/g, ""), 10),
      depositCode: wooriMatch[2].trim(),
      depositorName: wooriMatch[2].trim(),
      rawText: clean,
      matchedRule: "WOORI_EXACT",
    };
  }

  // 6. NH농협 패턴: [NH농협] 09/17 15:10 12,000원 입금 C670 잔액 ...
  const nhMatch = clean.match(/\[?NH(?:농협)?\]?[\s\S]*?([\d,]+)원\s*입금\s*([A-Za-z0-9가-힣]+)/i);
  if (nhMatch) {
    return {
      success: true,
      transactionType: "입금",
      bankName: "NH농협은행",
      amountKrw: parseInt(nhMatch[1].replace(/,/g, ""), 10),
      depositCode: nhMatch[2].trim(),
      depositorName: nhMatch[2].trim(),
      rawText: clean,
      matchedRule: "NH_EXACT",
    };
  }

  // 7. 하나은행 / IBK기업은행 / SC제일은행 / 우체국 / 새마을금고 / 케이뱅크 / 신협
  const otherBanksMatch = clean.match(/\[?([가-힣A-Za-z0-9]+(?:은행|금고|우체국|신협))\]?[\s\S]*?입금\s*([\d,]+)원(?:\s*\(([^)]+)\)|\s+([A-Za-z0-9가-힣]+))?/i);
  if (otherBanksMatch) {
    const rawAmt = otherBanksMatch[2];
    const amountVal = parseInt(rawAmt.replace(/,/g, ""), 10);
    const depositor = (otherBanksMatch[3] || otherBanksMatch[4] || "").replace(/잔액|통장/g, "").trim();
    return {
      success: true,
      transactionType: "입금",
      bankName: otherBanksMatch[1],
      amountKrw: amountVal,
      depositCode: depositor || "입금자",
      depositorName: depositor || "입금자",
      rawText: clean,
      matchedRule: "OTHER_BANKS_EXACT",
    };
  }

  // 8. 스마트 범용 폴백 입금 패턴:
  // "입금" 단어와 "XXXX원"이 있고, (입금자명) 또는 금액 뒤/앞의 한글 성명 및 코드 탐색
  const generalAmount = clean.match(/([\d,]+)원\s*입금|입금\s*([\d,]+)원/i);
  if (generalAmount) {
    const rawAmt = generalAmount[1] || generalAmount[2];
    const amountVal = parseInt(rawAmt.replace(/,/g, ""), 10);

    let extractedName = "";
    const parenMatch = clean.match(/\(([^)]+)\)/);
    const codeMatch = clean.match(/\b([A-Za-z]\d{3})\b/);
    const nameMatchAfter = clean.match(/(?:입금\s*[\d,]+원|[\d,]+원\s*입금)\s*([A-Za-z0-9가-힣()]+)/i);
    const nameMatchBefore = clean.match(/([A-Za-z0-9가-힣()]+)\s*(?:[\d,]+원\s*입금|입금\s*[\d,]+원)/i);

    const bankHeadMatch = clean.match(/\[([가-힣A-Za-z0-9]+)\]/);
    const foundBankName = bankHeadMatch ? bankHeadMatch[1] : "시중은행 (일반)";

    if (codeMatch) {
      extractedName = codeMatch[1].toUpperCase().trim();
    } else if (parenMatch && parenMatch[1].trim().length >= 2 && !parenMatch[1].includes("잔액")) {
      extractedName = parenMatch[1].trim();
    } else if (nameMatchAfter && nameMatchAfter[1].trim().length >= 2 && !nameMatchAfter[1].includes("잔액")) {
      extractedName = nameMatchAfter[1].trim();
    } else if (nameMatchBefore && nameMatchBefore[1].trim().length >= 2 && !nameMatchBefore[1].includes("잔액")) {
      extractedName = nameMatchBefore[1].trim();
    }

    if (amountVal > 0) {
      return {
        success: true,
        transactionType: "입금",
        bankName: foundBankName,
        amountKrw: amountVal,
        depositCode: extractedName || "AUTO",
        depositorName: extractedName || undefined,
        rawText: clean,
        matchedRule: extractedName ? "GENERAL_SMART_REGEX" : "GENERAL_AMOUNT_ONLY",
      };
    }
  }

  return {
    success: false,
    transactionType: "입금",
    bankName: "알 수 없음",
    amountKrw: 0,
    depositCode: "",
    rawText: clean,
    matchedRule: "FAILED_TO_MATCH",
  };
}
