export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { callSheetsTool } from "@/lib/egdesk-helpers";

interface CallSummaryCacheEntry {
  timestamp: number;
  data: any;
}

// 15초 단기 인메모리 캐시 (동일 번호 연속 요청 시 0초 즉각 반환)
const summaryCache = new Map<string, CallSummaryCacheEntry>();
const CACHE_TTL_MS = 15_000;

/**
 * 전화번호 문자열 정규화 (하이픈 제거 및 끝 8자리 추출용)
 */
function normalizePhoneNumber(raw: string): { clean: string; last8: string; formatted: string } {
  const digits = raw.replace(/\D/g, "");
  let clean = digits;
  if (clean.startsWith("82")) {
    clean = "0" + clean.slice(2);
  }
  const last8 = clean.slice(-8);

  let formatted = raw.trim();
  if (clean.length === 11 && clean.startsWith("010")) {
    formatted = `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7)}`;
  } else if (clean.length === 10 && clean.startsWith("02")) {
    formatted = `${clean.slice(0, 2)}-${clean.slice(2, 6)}-${clean.slice(6)}`;
  } else if (clean.length === 10) {
    formatted = `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }

  return { clean, last8, formatted };
}

/**
 * 시트 행에서 전화번호 매칭 여부 검사
 */
function isPhoneMatch(cellValue: string | undefined, cleanPhone: string, last8: string): boolean {
  if (!cellValue) return false;
  const cellDigits = cellValue.replace(/\D/g, "");
  if (!cellDigits) return false;
  if (cellDigits === cleanPhone) return true;
  if (last8.length === 8 && cellDigits.endsWith(last8)) return true;
  return false;
}

/**
 * GET/POST /api/user/calls/summary
 * 수신 전화 번호(callerPhone) 기반으로 구글 시트에서 고객 프로필, 직전 통화 AI 요약, 특이사항을 초고속 조회
 */
export async function GET(req: NextRequest) {
  return handleCallSummary(req);
}

export async function POST(req: NextRequest) {
  return handleCallSummary(req);
}

async function handleCallSummary(req: NextRequest) {
  try {
    const url = new URL(req.url);
    let callerPhone = url.searchParams.get("phone") || url.searchParams.get("callerPhone");
    let userEmail = url.searchParams.get("email") || url.searchParams.get("userEmail");

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (!callerPhone && body.callerPhone) callerPhone = body.callerPhone;
      if (!callerPhone && body.phone) callerPhone = body.phone;
      if (!userEmail && body.userEmail) userEmail = body.userEmail;
    }

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const resolvedEmail = (userEmail && userEmail.includes("@"))
      ? userEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!resolvedEmail) {
      return NextResponse.json({ success: false, error: "사용자 이메일 인증이 필요합니다." }, { status: 401 });
    }
    if (!callerPhone) {
      return NextResponse.json({ success: false, error: "전화번호가 누락되었습니다." }, { status: 400 });
    }

    const { clean: cleanPhone, last8, formatted: formattedPhone } = normalizePhoneNumber(callerPhone);
    const cacheKey = `${resolvedEmail}_${cleanPhone}`;
    const now = Date.now();

    // 15초 인메모리 캐시 확인
    const cached = summaryCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      });
    }

    let customerName = "";
    let companyName = "";
    let positionName = "";
    let customerMemo = "";
    let lastCallTime = "";
    let lastCallSummary = "";
    let actionItems = "";
    let lastMissedCallTime = "";
    let isFoundInSheet = false;

    // 1. [CONTACTS] 스마트폰 연락처 대장 시트 조회
    try {
      const resolvedContacts = await resolveUserSpreadsheet({
        userEmail: resolvedEmail,
        sheetType: "CONTACTS",
        defaultTitle: "[SheetBot] 스마트폰 연락처 대장",
        preferOAuth: true,
      });

      if (resolvedContacts?.spreadsheetId) {
        const rangeRes = await callSheetsTool("sheets_get_range", {
          spreadsheetId: resolvedContacts.spreadsheetId,
          range: "시트1!A1:K100",
          preferOAuth: true,
        }).catch(() => null);

        const rows: string[][] = rangeRes?.values || [];
        if (rows.length > 1) {
          // 헤더: ["ID", "이름"(1), "휴대전화"(2), "추가 번호"(3), "이메일"(4), "회사/상호"(5), "직함/부서"(6), "메모"(7), "주소"(8), ...]
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const p1 = row[2];
            const p2 = row[3];
            if (isPhoneMatch(p1, cleanPhone, last8) || isPhoneMatch(p2, cleanPhone, last8)) {
              customerName = row[1] || "";
              companyName = row[5] || "";
              positionName = row[6] || "";
              customerMemo = row[7] || "";
              isFoundInSheet = true;
              break;
            }
          }
        }
      }
    } catch (e: any) {
      console.warn("[CallSummary] Contacts sheet lookup warning:", e?.message);
    }

    // 2. [BUSINESS_CARD] 스마트 명함 관리 대장 시트 조회 (연락처에 없거나 회사/직책 보강용)
    if (!customerName || !companyName) {
      try {
        const resolvedCard = await resolveUserSpreadsheet({
          userEmail: resolvedEmail,
          sheetType: "BUSINESS_CARD",
          defaultTitle: "[SheetBot] 스마트 명함 관리 대장",
          preferOAuth: true,
        });

        if (resolvedCard?.spreadsheetId) {
          const rangeRes = await callSheetsTool("sheets_get_range", {
            spreadsheetId: resolvedCard.spreadsheetId,
            range: "시트1!A1:K100",
            preferOAuth: true,
          }).catch(() => null);

          const rows: string[][] = rangeRes?.values || [];
          if (rows.length > 1) {
            // 헤더: ["등록 일시"(0), "성함"(1), "직함/직책"(2), "회사명"(3), "휴대폰"(4), "이메일"(5), "유선전화"(6), ..., "상세정보"(8)]
            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              const phone1 = row[4];
              const phone2 = row[6];
              if (isPhoneMatch(phone1, cleanPhone, last8) || isPhoneMatch(phone2, cleanPhone, last8)) {
                if (!customerName) customerName = row[1] || "";
                if (!positionName) positionName = row[2] || "";
                if (!companyName) companyName = row[3] || "";
                if (!customerMemo) customerMemo = row[8] || "";
                isFoundInSheet = true;
                break;
              }
            }
          }
        }
      } catch (e: any) {
        console.warn("[CallSummary] Business card sheet lookup warning:", e?.message);
      }
    }

    // 3. [RECORDING] 통화 녹음 대장 시트 조회 (직전 통화 AI 3줄 요약 및 후속 할 일)
    try {
      const resolvedRec = await resolveUserSpreadsheet({
        userEmail: resolvedEmail,
        sheetType: "RECORDING",
        defaultTitle: "[SheetBot] 통화 녹음 대장",
        preferOAuth: true,
      });

      if (resolvedRec?.spreadsheetId) {
        const rangeRes = await callSheetsTool("sheets_get_range", {
          spreadsheetId: resolvedRec.spreadsheetId,
          range: "시트1!A1:H100",
          preferOAuth: true,
        }).catch(() => null);

        const rows: string[][] = rangeRes?.values || [];
        if (rows.length > 1) {
          // 헤더: ["통화 일시"(0), "상대방"(1), "파일명"(2), "파일 크기"(3), "AI 3줄 핵심 요약"(4), "후속 할 일"(5), ...]
          // 최신 통화부터 찾기 위해 아래(끝)에서부터 역순 탐색
          for (let i = rows.length - 1; i >= 1; i--) {
            const row = rows[i];
            const callerCell = row[1] || "";
            const fileCell = row[2] || "";

            const isMatchByPhone = isPhoneMatch(callerCell, cleanPhone, last8) || isPhoneMatch(fileCell, cleanPhone, last8);
            const isMatchByName = Boolean(customerName && (callerCell.includes(customerName) || fileCell.includes(customerName)));

            if (isMatchByPhone || isMatchByName) {
              lastCallTime = row[0] || "";
              lastCallSummary = row[4] || "";
              actionItems = row[5] || "";
              if (!customerName && callerCell) {
                // "홍길동 (010-1234-5678)" 형식에서 이름만 추출
                const nameMatch = callerCell.match(/^([^(]+)/);
                if (nameMatch) customerName = nameMatch[1].trim();
              }
              isFoundInSheet = true;
              break;
            }
          }
        }
      }
    } catch (e: any) {
      console.warn("[CallSummary] Recording sheet lookup warning:", e?.message);
    }

    // 4. [MISSED_CALL] 최근 부재중 전화 이력 확인
    try {
      const resolvedMissed = await resolveUserSpreadsheet({
        userEmail: resolvedEmail,
        sheetType: "MISSED_CALL",
        defaultTitle: "[SheetBot] 부재중 전화 대장",
        preferOAuth: true,
      });

      if (resolvedMissed?.spreadsheetId) {
        const rangeRes = await callSheetsTool("sheets_get_range", {
          spreadsheetId: resolvedMissed.spreadsheetId,
          range: "시트1!A1:F50",
          preferOAuth: true,
        }).catch(() => null);

        const rows: string[][] = rangeRes?.values || [];
        if (rows.length > 1) {
          // 헤더: ["부재중 일시"(0), "발신 번호"(1), "연락처 이름"(2), ...]
          for (let i = rows.length - 1; i >= 1; i--) {
            const row = rows[i];
            if (isPhoneMatch(row[1], cleanPhone, last8)) {
              lastMissedCallTime = row[0] || "";
              if (!customerName && row[2]) customerName = row[2];
              isFoundInSheet = true;
              break;
            }
          }
        }
      }
    } catch (e: any) {
      console.warn("[CallSummary] Missed call sheet lookup warning:", e?.message);
    }

    const responsePayload = {
      success: true,
      found: isFoundInSheet,
      phone: formattedPhone,
      cleanPhone,
      name: customerName.trim() || (isFoundInSheet ? "등록 고객" : "신규 연락처"),
      company: companyName.trim(),
      position: positionName.trim(),
      memo: customerMemo.trim(),
      lastCallTime: lastCallTime.trim(),
      lastCallSummary: lastCallSummary.trim(),
      actionItems: actionItems.trim(),
      lastMissedCallTime: lastMissedCallTime.trim(),
      checkedAt: new Date().toISOString(),
    };

    // 캐시 저장
    summaryCache.set(cacheKey, { timestamp: now, data: responsePayload });

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("[CallSummary] Internal error:", error);
    return NextResponse.json({ success: false, error: error.message || "서버 내부 오류가 발생했습니다." }, { status: 500 });
  }
}
