export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { setupDatabase } from "@/lib/setup-db";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { callSheetsTool } from "@/lib/egdesk-helpers";
import { getKoreanTimeString } from "@/lib/date-utils";

interface ContactSyncItem {
  id: string | number;
  name: string;
  mobile?: string;
  extraPhone?: string;
  email?: string;
  company?: string;
  title?: string;
  note?: string;
  address?: string;
  updatedAt?: string;
}

const HEADERS = [
  "ID",
  "이름",
  "휴대전화",
  "추가 번호",
  "이메일",
  "회사/상호",
  "직함/부서",
  "메모",
  "주소",
  "동기화 기기",
  "최종 갱신일시",
];

/**
 * 구글 시트 Formula Injection 및 파싱 에러 방지 헬퍼
 * Google Sheets에서 +, =, -, @로 시작하는 문자열은 수식으로 파싱되어 #ERROR!가 발생하므로
 * 앞에 작은따옴표(')를 붙여 순수 텍스트로 보존합니다.
 */
function escapeSheetFormula(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val).trim();
  if (str.startsWith("+") || str.startsWith("=") || str.startsWith("-") || str.startsWith("@")) {
    return "'" + str;
  }
  return str;
}

/**
 * 전화번호 표준화 헬퍼 (010-XXXX-XXXX, 1522-XXXX, 02-XXXX-XXXX 포맷팅)
 */
function normalizePhoneNumber(raw?: string): string {
  if (!raw) return "";
  let trimmed = raw.trim();
  let cleaned = trimmed.replace(/[^0-9+]/g, "");

  // +82 또는 82 국가코드 처리
  if (cleaned.startsWith("+82")) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith("82") && cleaned.length >= 10) {
    cleaned = cleaned.substring(2);
  }

  // 앞선 0 정리 전 전국대표번호(15xx, 16xx, 18xx) 8자리 체크
  const noZero = cleaned.replace(/^0+/, "");
  if (noZero.length === 8 && /^(15|16|18)/.test(noZero)) {
    return `${noZero.substring(0, 4)}-${noZero.substring(4)}`;
  }

  // 한국 번호인데 0으로 시작하지 않으면 0 추가 (예: 1012345678 -> 01012345678)
  if (!cleaned.startsWith("0") && cleaned.length >= 8 && !cleaned.startsWith("+")) {
    cleaned = "0" + cleaned;
  }

  // 11자리 (010, 070, 031 등)
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 7)}-${cleaned.substring(7)}`;
  }

  // 10자리 (02 서울 유선전화 vs 기타 0xx)
  if (cleaned.length === 10 && cleaned.startsWith("02")) {
    return `${cleaned.substring(0, 2)}-${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
  }
  if (cleaned.length === 10 && cleaned.startsWith("0")) {
    return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
  }

  // 9자리 (02 서울 유선전화)
  if (cleaned.length === 9 && cleaned.startsWith("02")) {
    return `${cleaned.substring(0, 2)}-${cleaned.substring(2, 5)}-${cleaned.substring(5)}`;
  }

  return trimmed;
}

/**
 * 구글 시트용 전화번호 안전 변환
 * - 숫자만 있는 경우(15220741 등) 앞자리 0 탈락 및 숫자 캐스팅 방지를 위해 작은따옴표(') 부착
 * - +, =, -, @로 시작하는 경우 수식 파싱 오류 방지를 위해 작은따옴표(') 부착
 */
function formatPhoneForSheet(raw?: string): string {
  if (!raw) return "";
  const normalized = normalizePhoneNumber(raw);
  if (!normalized) return "";
  // 순수 숫자로만 구성되어 있거나 특수문자 시작인 경우 시트 텍스트 리터럴 강제
  if (/^[0-9]+$/.test(normalized) || /^[+=@-]/.test(normalized)) {
    return "'" + normalized;
  }
  return normalized;
}

/**
 * vCard 텍스트 감지 시 개별 필드로 지능형 분해(Unpacking) 헬퍼
 * 스마트폰 주소록에 BEGIN:VCARD... 전문이 이름란에 저장된 경우 정상 분해하여 시트에 적재
 */
function unpackVCardIfPresent(c: ContactSyncItem): ContactSyncItem {
  const rawName = String(c.name || "").trim();
  if (!rawName.includes("BEGIN:VCARD")) {
    return c;
  }

  const lines = rawName.split(/\r?\n/);
  let name = "";
  let mobile = c.mobile || "";
  let extraPhone = c.extraPhone || "";
  let email = c.email || "";
  let company = c.company || "";
  let title = c.title || "";
  let note = c.note || "";
  let address = c.address || "";
  const extraNotes: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("BEGIN:") || trimmed.startsWith("END:") || trimmed.startsWith("VERSION:")) {
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const keyPart = trimmed.substring(0, colonIdx).toUpperCase();
    const valPart = trimmed.substring(colonIdx + 1).trim();

    if (keyPart === "FN") {
      name = valPart;
    } else if (keyPart.startsWith("N") && !name) {
      const parts = valPart.split(";").map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) name = parts.join("");
    } else if (keyPart.startsWith("ORG")) {
      company = company || valPart.replace(/;/g, " ").trim();
    } else if (keyPart.startsWith("TITLE")) {
      title = title || valPart;
    } else if (keyPart.startsWith("TEL")) {
      const cleanPhone = valPart.replace(/;/g, "").trim();
      if (!mobile) {
        mobile = cleanPhone;
      } else if (!extraPhone && mobile !== cleanPhone) {
        extraPhone = cleanPhone;
      } else if (mobile !== cleanPhone && extraPhone !== cleanPhone) {
        extraNotes.push(`기타번호: ${cleanPhone}`);
      }
    } else if (keyPart.startsWith("EMAIL")) {
      email = email || valPart;
    } else if (keyPart.startsWith("ADR")) {
      const cleanAddr = valPart.split(";").map((p) => p.trim()).filter(Boolean).join(" ");
      address = address || cleanAddr;
    } else if (keyPart.startsWith("URL")) {
      extraNotes.push(`웹사이트: ${valPart}`);
    } else if (keyPart.startsWith("NOTE")) {
      extraNotes.push(valPart);
    }
  }

  if (extraNotes.length > 0) {
    note = note ? `${note} | ${extraNotes.join(", ")}` : extraNotes.join(", ");
  }

  return {
    ...c,
    name: name || "이름 없음",
    mobile,
    extraPhone,
    email,
    company,
    title,
    note,
    address,
  };
}

/**
 * POST /api/user/contacts/sync
 * 스마트폰 연락처 목록을 [SheetBot] 스마트폰 연락처 대장 구글 스프레드시트에 고속 동기화
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const body = await req.json().catch(() => ({}));

    let userEmail = (body.userEmail && body.userEmail.includes("@"))
      ? body.userEmail.toLowerCase().trim()
      : (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : "");

    if (!userEmail) {
      const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
      if (sessionEmail && sessionEmail.includes("@")) {
        userEmail = sessionEmail.toLowerCase().trim();
      }
    }

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "사용자 로그인이 필요하거나 userEmail 파라미터가 누락되었습니다." },
        { status: 401 }
      );
    }

    const deviceId = body.deviceId || "스마트폰 시트봇 에이전트";
    const isFullSync = body.isFullSync !== false; // 기본값 true (전체 동기화)
    const contacts: ContactSyncItem[] = Array.isArray(body.contacts) ? body.contacts : [];

    if (contacts.length === 0) {
      return NextResponse.json(
        { success: false, error: "동기화할 연락처 데이터가 비어 있습니다." },
        { status: 400 }
      );
    }

    const nowStr = getKoreanTimeString();

    // 1. 구글 스프레드시트 대장 조회 또는 선제 자동 생성
    const sheetRes = await resolveUserSpreadsheet({
      userEmail,
      sheetType: "CONTACTS",
      defaultTitle: "[SheetBot] 스마트폰 연락처 대장",
    });

    const spreadsheetId = sheetRes.spreadsheetId;
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: "구글 스프레드시트 대장을 바인딩할 수 없습니다." },
        { status: 500 }
      );
    }

    // 2. 1행 헤더 확인 및 누락 시 선제 주입
    try {
      const headerCheck = await callSheetsTool("sheets_get_range", {
        spreadsheetId,
        range: "A1:K1",
      });
      const firstRow = headerCheck?.values?.[0] || [];
      if (firstRow.length === 0 || firstRow[0] !== "ID") {
        await callSheetsTool("sheets_update_range", {
          spreadsheetId,
          range: "A1:K1",
          values: [HEADERS],
        });
      }
    } catch (headerErr: any) {
      console.warn("[ContactsSync] Header check warning:", headerErr.message);
      // 안전 주입 재시도
      await callSheetsTool("sheets_update_range", {
        spreadsheetId,
        range: "A1:K1",
        values: [HEADERS],
      }).catch(() => null);
    }

    // 3. 연락처 행 데이터 빌드
    const rowsToInsert = contacts.map((c) => {
      const parsed = unpackVCardIfPresent(c);
      const contactId = escapeSheetFormula(parsed.id);
      const name = escapeSheetFormula(parsed.name);
      const mobile = formatPhoneForSheet(parsed.mobile);
      const extraPhone = formatPhoneForSheet(parsed.extraPhone);
      const email = escapeSheetFormula(parsed.email);
      const company = escapeSheetFormula(parsed.company);
      const title = escapeSheetFormula(parsed.title);
      const note = escapeSheetFormula(parsed.note);
      const address = escapeSheetFormula(parsed.address);
      const updatedAt = escapeSheetFormula(parsed.updatedAt || nowStr);

      return [
        contactId,
        name,
        mobile,
        extraPhone,
        email,
        company,
        title,
        note,
        address,
        deviceId,
        updatedAt,
      ];
    });

    // 4. 동기화 실행 (Full Sync vs Incremental Upsert)
    let updatedCount = 0;
    let insertedCount = 0;

    if (isFullSync) {
      // [전체 동기화 최적화]: 기존 데이터를 일괄 교체하여 폰과 100% 일치시킴
      // 4-1. 기존 시트의 행 수 확인
      let oldRowCount = 0;
      try {
        const idColRes = await callSheetsTool("sheets_get_range", {
          spreadsheetId,
          range: "A2:A",
        });
        oldRowCount = idColRes?.values ? idColRes.values.length : 0;
      } catch {}

      // 4-2. 2행부터 전체 연락처 데이터 한 번에 덮어쓰기 (초고속 배치 업데이트)
      const endRow = rowsToInsert.length + 1;
      const targetRange = `A2:K${endRow}`;

      await callSheetsTool("sheets_update_range", {
        spreadsheetId,
        range: targetRange,
        values: rowsToInsert,
      });

      // 4-3. 만약 기존 시트에 더 많은 행이 있었다면 초과 행들 클리어
      if (oldRowCount > rowsToInsert.length) {
        const clearStart = endRow + 1;
        const clearEnd = oldRowCount + 1;
        await callSheetsTool("sheets_clear_range", {
          spreadsheetId,
          range: `A${clearStart}:K${clearEnd}`,
        }).catch(() => null);
      }

      insertedCount = rowsToInsert.length;
    } else {
      // [부분/단건 Upsert]: A열의 ID를 검색하여 존재하면 업데이트, 없으면 추가
      let existingIds: string[] = [];
      try {
        const idColRes = await callSheetsTool("sheets_get_range", {
          spreadsheetId,
          range: "A2:A",
        });
        existingIds = (idColRes?.values || []).map((r: any) => String(r[0] || "").trim());
      } catch {}

      const appendList: any[][] = [];

      for (const row of rowsToInsert) {
        const contactId = row[0];
        const existingIndex = existingIds.indexOf(contactId);

        if (existingIndex >= 0) {
          // 2행부터 시작하므로 rowIndex = existingIndex + 2
          const targetRowIndex = existingIndex + 2;
          await callSheetsTool("sheets_update_range", {
            spreadsheetId,
            range: `A${targetRowIndex}:K${targetRowIndex}`,
            values: [row],
          });
          updatedCount++;
        } else {
          appendList.push(row);
        }
      }

      if (appendList.length > 0) {
        await callSheetsTool("sheets_append_values", {
          spreadsheetId,
          range: "A:K",
          values: appendList,
        });
        insertedCount = appendList.length;
      }
    }

    return NextResponse.json({
      success: true,
      message: `스마트폰 연락처 ${contacts.length}건이 구글 시트 대장에 동기화되었습니다.`,
      totalCount: contacts.length,
      insertedCount,
      updatedCount,
      spreadsheetId,
      spreadsheetUrl: sheetRes.spreadsheetUrl,
      syncTime: nowStr,
    });
  } catch (error: any) {
    console.error("[ContactsSync] Error syncing contacts:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "연락처 동기화 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
