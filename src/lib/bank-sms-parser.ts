/**
 * 🏦 금융(은행/카드사/POS) 입출금 및 결제 알림 SMS/RCS 초고속 파서 (bank-sms-parser.ts)
 * 대한민국 주요 시중은행, 인터넷은행, 카드사, POS 결제앱의 입금 및 출금(체크/신용카드 승인) 문자에서
 * 거래 구분(매출(계좌)/매출(카드)/지출(계좌)/지출(카드)), 계좌/카드번호, 금액(KRW), 입금자/가맹점명을 초고속(0.01ms)으로 정밀 추출합니다.
 */

export type FinancialTransactionType =
  | "매출(계좌)"
  | "매출(카드)"
  | "지출(계좌)"
  | "지출(카드)"
  | "매출"
  | "지출";

export interface ParsedDepositSms {
  success: boolean;
  transactionType: FinancialTransactionType;
  bankName: string;
  accountOrCardNumber: string; // 계좌번호 또는 카드 마스킹 번호 (예: *1234, 3333**)
  amountKrw: number;
  depositCode: string;
  depositorName?: string;
  rawText: string;
  matchedRule: string;
}

// 주요 시중은행 및 카드사 공식 대표 발신번호 프리셋
export const BANK_ORIGIN_NUMBERS: Record<string, { name: string; number: string; type: "bank" | "card" | "pos" }> = {
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
 * 텍스트에서 계좌번호 또는 카드 마스킹 번호 자동 추출
 */
export function extractAccountOrCardNumber(text: string): string {
  if (!text) return "-";

  // 1. 하이픈/별표가 섞인 마스킹 계좌번호 패턴 (하이픈 다중 포함 지원):
  // 예: 3333-01-2345678, 110-***-567890, 9876**-**-123456, 1002-***-9988, 3333**01234
  const multiHyphenAccMatch = text.match(/\b([0-9]{2,6}(?:[-*]+[0-9*]+)+)\b/);
  if (multiHyphenAccMatch) {
    return multiHyphenAccMatch[1].trim();
  }

  // 2. 카카오뱅크/은행 계좌 끝자리 또는 카드 끝자리 괄호 패턴: 예: 성명(1234), 홍길동(1234), (9876)
  const parenAccMatch = text.match(/(?:통장|계좌|성명|[가-힣A-Za-z]+)?\s*\(([0-9*]{4,6})\)/);
  if (parenAccMatch && !parenAccMatch[1].includes("잔액")) {
    const rawNum = parenAccMatch[1];
    return rawNum.startsWith("*") ? rawNum : `*${rawNum}`;
  }

  // 3. 카드 끝 4자리 패턴: [카드사] 1234 승인 또는 카드 1234 승인
  const cardEndMatch = text.match(/(?:카드|체크|신용)?\s*(?:끝자리|번호)?\s*([0-9*]{4})\s*(?:승인|결제)/i);
  if (cardEndMatch) {
    const rawNum = cardEndMatch[1];
    return rawNum.startsWith("*") ? rawNum : `*${rawNum}`;
  }

  return "-";
}

/**
 * 텍스트에서 금융사 또는 카드사 이름 추출
 */
function detectFinancialOrgName(text: string): string {
  if (text.includes("카카오페이") || text.includes("페이머니") || text.includes("kakaopay")) return "카카오페이";
  if (text.includes("카카오뱅크") || text.includes("kakaobank")) return "카카오뱅크";
  if (text.includes("토스뱅크") || text.includes("토스") || text.includes("toss")) return "토스뱅크";
  if (text.includes("케이뱅크")) return "케이뱅크";
  if (text.includes("KB국민은행") || text.includes("국민은행") || text.includes("[KB]")) return "KB국민은행";
  if (text.includes("신한은행")) return "신한은행";
  if (text.includes("우리은행")) return "우리은행";
  if (text.includes("하나은행")) return "하나은행";
  if (text.includes("NH농협") || text.includes("농협은행") || text.includes("농협")) return "NH농협은행";
  if (text.includes("IBK기업은행") || text.includes("기업은행")) return "IBK기업은행";
  if (text.includes("SC제일은행") || text.includes("제일은행")) return "SC제일은행";
  if (text.includes("우체국")) return "우체국";
  if (text.includes("새마을금고")) return "새마을금고";
  if (text.includes("신협")) return "신협";

  // 카드사
  if (text.includes("현대카드")) return "현대카드";
  if (text.includes("국민카드") || text.includes("KB카드")) return "KB국민카드";
  if (text.includes("신한카드")) return "신한카드";
  if (text.includes("삼성카드")) return "삼성카드";
  if (text.includes("하나카드")) return "하나카드";
  if (text.includes("롯데카드")) return "롯데카드";
  if (text.includes("우리카드")) return "우리카드";
  if (text.includes("농협카드") || text.includes("NH카드")) return "NH농협카드";
  if (text.includes("BC카드") || text.includes("비씨카드")) return "BC카드";

  const headMatch = text.match(/\[([가-힣A-Za-z0-9]+)\]/);
  if (headMatch && headMatch[1] !== "Web발신" && headMatch[1] !== "포스결제") {
    return headMatch[1];
  }

  return "시중은행/카드사";
}

/**
 * 입출금 및 카드 결제 알림 SMS/RCS 텍스트 정밀 파싱
 */
export function parseBankDepositSms(text: string): ParsedDepositSms {
  const clean = (text || "").trim();
  if (!clean) {
    return {
      success: false,
      transactionType: "매출(계좌)",
      bankName: "알 수 없음",
      accountOrCardNumber: "-",
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
      transactionType: "매출(계좌)",
      bankName: "스팸/광고 제외",
      accountOrCardNumber: "-",
      amountKrw: 0,
      depositCode: "",
      rawText: clean,
      matchedRule: "EXCLUDED_SPAM",
    };
  }

  // 계좌번호 또는 카드 식별 번호 자동 추출
  const detectedAccount = extractAccountOrCardNumber(clean);



  // ==========================================
  // [A] POS / 결제단말기 매장 매출 알림 판별 (고객 카드 결제)
  // ==========================================
  const isPosOrMerchantSales =
    clean.includes("페이히어") ||
    clean.includes("토스플레이스") ||
    clean.includes("토스페이먼츠") ||
    clean.includes("이지포스") ||
    clean.includes("포스") ||
    clean.includes("배민") ||
    clean.includes("요기요") ||
    clean.includes("쿠팡이츠") ||
    clean.includes("가맹점 정산") ||
    clean.includes("결제대금 입금") ||
    clean.includes("카드매출");

  if (isPosOrMerchantSales && (clean.includes("결제") || clean.includes("승인") || clean.includes("주문") || clean.includes("입금"))) {
    const posAmount = clean.match(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*원?/);
    if (posAmount) {
      const amt = parseInt(posAmount[1].replace(/,/g, ""), 10);
      const channel = detectFinancialOrgName(clean);
      return {
        success: true,
        transactionType: "매출(카드)",
        bankName: channel === "시중은행/카드사" ? "포스/결제단말기" : channel,
        accountOrCardNumber: detectedAccount,
        amountKrw: amt,
        depositCode: "고객(매장카드)",
        depositorName: "고객(매장카드)",
        rawText: clean,
        matchedRule: "POS_MERCHANT_CARD_SALES",
      };
    }
  }

  // ==========================================
  // [B] 출금, 송금 및 카드/간편결제(지출) 패턴 검사 ➡️ 지출(카드) / 지출(계좌)
  // ==========================================
  const isWithdrawOrApproval =
    clean.includes("출금") ||
    clean.includes("승인") ||
    clean.includes("결제") ||
    clean.includes("체크승인") ||
    clean.includes("카드승인") ||
    clean.includes("송금완료") ||
    clean.includes("이체완료") ||
    clean.includes("일시불") ||
    clean.includes("간편결제") ||
    clean.includes("매장결제") ||
    clean.includes("온라인결제") ||
    (clean.includes("보냈어요") && !clean.includes("받았어요")) ||
    (clean.includes("송금") && !clean.includes("송금받") && !clean.includes("받았어요"));

  if (isWithdrawOrApproval && !clean.includes("승인취소") && (!clean.includes("입금") || clean.includes("출금"))) {
    const detectedOrg = detectFinancialOrgName(clean);
    const isCard =
      detectedOrg.includes("카드") ||
      clean.includes("카드") ||
      clean.includes("일시불") ||
      clean.includes("승인") ||
      clean.includes("결제") ||
      clean.includes("매장결제") ||
      clean.includes("온라인결제");

    // 1. 금액 추출 ('원'이 명시된 금액을 1순위, 없을 시 출금/결제/송금 직후 4자리 이상 숫자)
    let amt = 0;
    const amountWithWon = clean.match(/([\d,]+)\s*원/);
    if (amountWithWon) {
      amt = parseInt(amountWithWon[1].replace(/,/g, ""), 10);
    } else {
      const amountAfterKeyword = clean.match(/(?:출금|결제|승인|송금|보냈어요)\s*([\d,]{4,})/);
      if (amountAfterKeyword) {
        amt = parseInt(amountAfterKeyword[1].replace(/,/g, ""), 10);
      }
    }

    if (amt > 0) {
      let merchantName = isCard ? "가맹점" : "출금처";

      // 1-0. 줄바꿈 기준 금액 다음 줄 텍스트 검사 (예: 15,000원 \n 스타벅스강남점 \n 잔액)
      const lines = clean.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
      const amtLineIdx = lines.findIndex((l) => /[\d,]+\s*원/.test(l));
      if (amtLineIdx >= 0 && amtLineIdx + 1 < lines.length) {
        const nextLine = lines[amtLineIdx + 1].trim();
        if (
          nextLine.length >= 2 &&
          !nextLine.includes("잔액") &&
          !nextLine.includes("승인") &&
          !nextLine.includes("누적") &&
          !nextLine.includes("일시불") &&
          !/^[\d*-]+$/.test(nextLine)
        ) {
          merchantName = nextLine.replace(/[()[\]]/g, "").trim();
        }
      }

      // 1-1. '금액원' 직후에 오는 가맹점/수취인명: 예: "15,000원 스타벅스", "50,000원 홍길동 (잔액..."
      if (merchantName === (isCard ? "가맹점" : "출금처")) {
        const afterAmtMatch = clean.match(/[\d,]+\s*원\s+([가-힣A-Za-z0-9&㈜(주)]{2,15})/);
        if (afterAmtMatch) {
          const candidate = afterAmtMatch[1].trim();
          if (
            candidate.length >= 2 &&
            !candidate.includes("잔액") &&
            !candidate.includes("일시불") &&
            !candidate.includes("승인") &&
            !candidate.includes("누적")
          ) {
            merchantName = candidate.replace(/[()[\]]/g, "").trim();
          }
        }
      }

      // 1-2. 송금 대상자 추출: "홍길동님에게 송금", "홍길동에게 보냈어요", "홍길동 송금"
      if (merchantName === (isCard ? "가맹점" : "출금처")) {
        const transferTargetMatch = clean.match(/([가-힣A-Za-z0-9]+?)(?:님에게|에게)?\s*(?:송금|보냈어요)/);
        if (transferTargetMatch && transferTargetMatch[1].trim().length >= 2 && !transferTargetMatch[1].includes("카카오")) {
          merchantName = transferTargetMatch[1].trim();
        }
      }

      // 1-3. 괄호 내 상호명 검사: (스타벅스), ((주)우아한형제들)
      if (merchantName === (isCard ? "가맹점" : "출금처")) {
        const juCompanyMatch = clean.match(/(?:\((?:주|유)\)|(?:주|유)\))\s*([가-힣A-Za-z0-9]+)/);
        const parenMatch = clean.match(/\(([^)]+)\)/);

        if (juCompanyMatch) {
          merchantName = `(주)${juCompanyMatch[1].trim()}`;
        } else if (
          parenMatch &&
          !parenMatch[1].includes("잔액") &&
          parenMatch[1].trim().length >= 2 &&
          !/^[\d*-]+$/.test(parenMatch[1].trim())
        ) {
          merchantName = parenMatch[1].trim();
        }
      }

      return {
        success: true,
        transactionType: isCard ? "지출(카드)" : "지출(계좌)",
        bankName: detectedOrg,
        accountOrCardNumber: detectedAccount,
        amountKrw: amt,
        depositCode: merchantName,
        depositorName: merchantName,
        rawText: clean,
        matchedRule: isCard ? "CARD_APPROVAL" : "BANK_WITHDRAW",
      };
    }
  }

  // ==========================================
  // [C] 은행 계좌 및 페이 입금 패턴 검사 ➡️ 매출(계좌)
  // ==========================================
  const isDepositKeyword =
    clean.includes("입금") ||
    clean.includes("받았어요") ||
    clean.includes("송금받") ||
    clean.includes("충전완료") ||
    clean.includes("머니충전") ||
    clean.includes("페이머니 충전");

  if (isDepositKeyword && !clean.includes("출금")) {
    const detectedBank = detectFinancialOrgName(clean);

    // 1. 금액 추출 (숫자,콤마 + 원 또는 '입금 120,000')
    let amt = 0;
    const amountWithWon = clean.match(/([\d,]+)\s*원/);
    if (amountWithWon) {
      amt = parseInt(amountWithWon[1].replace(/,/g, ""), 10);
    } else {
      const amountAfterDeposit = clean.match(/(?:입금|받았어요|충전)\s*([\d,]{4,})/);
      if (amountAfterDeposit) {
        amt = parseInt(amountAfterDeposit[1].replace(/,/g, ""), 10);
      }
    }

    // 2. 입금자명 추출
    let depositor = "고객";

    // 패턴 2-1: 김철수(5678) 형태 -> 김철수
    const nameWithParenAcc = clean.match(/([가-힣A-Za-z]{2,8})\s*\([0-9*]+\)/);
    if (nameWithParenAcc) {
      depositor = nameWithParenAcc[1].trim();
    } else {
      // 패턴 2-2: 줄바꿈 기준 금액 다음 줄 텍스트 검사 (예: 1,000원 \n 차호석 \n 잔액)
      const lines = clean.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
      const amtLineIdx = lines.findIndex((l) => /[\d,]+\s*원/.test(l));
      if (amtLineIdx >= 0 && amtLineIdx + 1 < lines.length) {
        const nextLine = lines[amtLineIdx + 1].trim();
        if (
          nextLine.length >= 2 &&
          nextLine.length <= 8 &&
          /^[가-힣A-Za-z0-9*]{2,8}$/.test(nextLine) &&
          !nextLine.includes("잔액") &&
          !nextLine.includes("알림")
        ) {
          depositor = nextLine;
        }
      }

      if (depositor === "고객") {
        const parenMatch = clean.match(/\(([^)]+)\)/);
        if (parenMatch && !parenMatch[1].includes("잔액") && !/^\d+$/.test(parenMatch[1]) && !parenMatch[1].includes("*")) {
          depositor = parenMatch[1].trim();
        } else {
          // 단어 분리 후 잔액/계좌번호/날짜/시간/은행명/금액/알림류를 제외한 한글 이름 탐색
          const tokens = clean.split(/\s+/).map((t) => t.replace(/[()[\]]/g, "").trim());
          for (const token of tokens) {
            if (
              token.length >= 2 &&
              token.length <= 6 &&
              /^[가-힣]{2,6}$/.test(token) &&
              !["입금", "출금", "잔액", "보냈어요", "받았어요", "카카오뱅크", "국민은행", "신한은행", "우리은행", "농협", "토스", "하나은행", "입금알림", "출금알림", "결제알림", "Web발신"].includes(token)
            ) {
              depositor = token;
              break;
            }
          }
        }
      }
    }

    if (amt > 0) {
      return {
        success: true,
        transactionType: "매출(계좌)",
        bankName: detectedBank === "시중은행/카드사" ? "시중은행" : detectedBank,
        accountOrCardNumber: detectedAccount,
        amountKrw: amt,
        depositCode: depositor,
        depositorName: depositor,
        rawText: clean,
        matchedRule: "BANK_DEPOSIT_ENHANCED",
      };
    }
  }

  return {
    success: false,
    transactionType: "매출(계좌)",
    bankName: "알 수 없음",
    accountOrCardNumber: "-",
    amountKrw: 0,
    depositCode: "",
    rawText: clean,
    matchedRule: "FAILED_TO_MATCH",
  };
}
