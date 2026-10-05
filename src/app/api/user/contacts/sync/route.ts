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
 * 전화번호 표준화 헬퍼 (010-XXXX-XXXX 포맷팅)
 */
function normalizePhoneNumber(raw?: string): string {
  if (!raw) return "";
  let cleaned = raw.replace(/[^0-9+]/g, "").trim();
  if (cleaned.startsWith("+82")) {
    cleaned = "0" + cleaned.substring(3);
  }
  // 한국 휴대폰 번호 (10자리 또는 11자리)
  if (cleaned.length === 11 && cleaned.startsWith("01")) {
    return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 7)}-${cleaned.substring(7)}`;
  }
  if (cleaned.length === 10 && cleaned.startsWith("01")) {
    return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
  }
  // 일반 지역번호 (02, 031 등)
  if (cleaned.length === 10 && cleaned.startsWith("02")) {
    return `${cleaned.substring(0, 2)}-${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
  }
  if (cleaned.length === 9 && cleaned.startsWith("02")) {
    return `${cleaned.substring(0, 2)}-${cleaned.substring(2, 5)}-${cleaned.substring(5)}`;
  }
  if (cleaned.length === 10) {
    return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
  }
  if (cleaned.length === 11) {
    return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 7)}-${cleaned.substring(7)}`;
  }
  return raw.trim();
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
      const contactId = String(c.id || "").trim();
      const name = String(c.name || "").trim();
      const mobile = normalizePhoneNumber(c.mobile);
      const extraPhone = normalizePhoneNumber(c.extraPhone);
      const email = String(c.email || "").trim();
      const company = String(c.company || "").trim();
      const title = String(c.title || "").trim();
      const note = String(c.note || "").trim();
      const address = String(c.address || "").trim();
      const updatedAt = c.updatedAt || nowStr;

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
