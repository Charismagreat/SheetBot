export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows, callSheetsTool } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getKoreanTimeString } from "@/lib/date-utils";

/**
 * POST /api/user/estimate/[estimateId]/accept
 * 고객이 전자 견적서를 수락 및 최종 승인 (주문/계약 확정)
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ estimateId: string }> }
) {
  try {
    await setupDatabase();
    const { estimateId } = await context.params;

    if (!estimateId) {
      return NextResponse.json({ success: false, error: "견적 ID가 필요합니다." }, { status: 400 });
    }

    let res = await queryTable("sheetbot_quotes", {
      filters: { quote_id: estimateId },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    let idKey = "quote_id";
    if (!res.rows || res.rows.length === 0) {
      res = await queryTable("sheetbot_quotes", {
        filters: { id: estimateId },
        limit: 1,
      }).catch(() => ({ rows: [] }));
      idKey = "id";
    }

    if (!res.rows || res.rows.length === 0) {
      return NextResponse.json({ success: false, error: "견적서를 찾을 수 없습니다." }, { status: 404 });
    }

    const raw = res.rows[0];
    const nowFormatted = getKoreanTimeString(new Date());

    // 1. DB 상태 'ACCEPTED'(승인)로 업데이트
    await updateRows("sheetbot_quotes", {
      filters: { [idKey]: estimateId },
      updates: {
        status: "ACCEPTED",
        notes: raw.notes ? `${raw.notes} | [고객 승인 완료: ${nowFormatted}]` : `[고객 승인 완료: ${nowFormatted}]`,
      },
    }).catch(() => {});

    // 2. 구글 시트 '견적발행대장' 상태 갱신
    if (raw.spreadsheet_id) {
      try {
        const listRes = await callSheetsTool(
          "sheets_get_range",
          {
            spreadsheetId: raw.spreadsheet_id,
            range: "견적발행대장!A1:M100",
            preferOAuth: true,
          },
          { preferOAuth: true }
        ).catch(() => null);

        if (listRes?.values && listRes.values.length > 0) {
          const rowIndex = listRes.values.findIndex((row: any[]) => row && row[0] === estimateId);
          if (rowIndex >= 0) {
            const sheetRowNumber = rowIndex + 1;
            // K열(11번째) = 견적상태, M열(13번째) = 승인일시
            await callSheetsTool(
              "sheets_update_range",
              {
                spreadsheetId: raw.spreadsheet_id,
                range: `견적발행대장!K${sheetRowNumber}:M${sheetRowNumber}`,
                values: [["승인", listRes.values[rowIndex][11] || nowFormatted, nowFormatted]],
                preferOAuth: true,
              },
              { preferOAuth: true }
            );
          }
        }
      } catch (sheetErr: any) {
        console.warn("[AcceptEstimate] Sheet update warning:", sheetErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      estimateId,
      status: "ACCEPTED",
      acceptedAt: nowFormatted,
      message: "견적이 성공적으로 승인되었습니다. 담당자가 곧 연락드릴 예정입니다.",
    });
  } catch (error: any) {
    console.error("[AcceptEstimateAPI] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to accept estimate" },
      { status: 500 }
    );
  }
}
