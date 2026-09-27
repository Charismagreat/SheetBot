export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { setupDatabase } from "@/lib/setup-db";
import { parseKakaoChatText } from "@/lib/kakao-chat-parser";
import { syncKakaoChatToSheet } from "@/lib/kakao-sheet-sync";

/**
 * POST /api/user/messages/kakao/import
 * 카카오톡 대화 내용 내보내기(.txt) 파일 업로드 및 구글 시트 구간 덮어쓰기 API
 * 지원 형식:
 * 1. multipart/form-data: file 필드 (카톡 내보내기 텍스트 파일)
 * 2. application/json: { textContent: string, fileName?: string, myName?: string, sheetTitle?: string }
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    let userEmail = sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : "");

    let textContent = "";
    let fileName = "";
    let myName = "";
    let sheetTitle = "[SheetBot] 카카오톡 메시지 대장";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const bodyEmail = formData.get("userEmail") as string | null;
      if (bodyEmail && bodyEmail.includes("@")) {
        userEmail = bodyEmail.toLowerCase().trim();
      }
      if (formData.get("myName")) {
        myName = String(formData.get("myName"));
      }
      if (formData.get("sheetTitle")) {
        sheetTitle = String(formData.get("sheetTitle"));
      }

      if (!file) {
        return NextResponse.json(
          { success: false, error: "업로드할 카카오톡 대화 내용 파일(.txt)을 선택해 주세요." },
          { status: 400 }
        );
      }

      fileName = file.name;
      textContent = await file.text();
    } else {
      const body = await req.json().catch(() => ({}));
      if (body.userEmail && body.userEmail.includes("@")) {
        userEmail = body.userEmail.toLowerCase().trim();
      }
      textContent = body.textContent || "";
      fileName = body.fileName || "카카오톡 대화.txt";
      myName = body.myName || "";
      if (body.sheetTitle) {
        sheetTitle = body.sheetTitle;
      }
    }

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "사용자 로그인이 필요하거나 userEmail 파라미터가 누락되었습니다." },
        { status: 401 }
      );
    }

    if (!textContent || textContent.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "파일 내용이 비어있거나 읽을 수 없습니다." },
        { status: 400 }
      );
    }

    // 1. 카카오톡 대화 내용 텍스트 파싱
    const parseResult = parseKakaoChatText(textContent, fileName, myName);

    if (parseResult.totalCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "카카오톡 대화 패턴을 인식하지 못했습니다. 카카오톡 [대화 내용 내보내기]로 저장된 .txt 파일인지 확인해 주세요.",
        },
        { status: 422 }
      );
    }

    // 2. 구글 스프레드시트 구간 덮어쓰기 (Replace Window) 실행
    const syncResult = await syncKakaoChatToSheet(userEmail, parseResult, sheetTitle);

    if (!syncResult.success) {
      return NextResponse.json(
        { success: false, error: syncResult.error || "구글 시트 동기화에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      chatRoomName: parseResult.chatRoomName,
      totalCount: parseResult.totalCount,
      inboundCount: parseResult.inboundCount,
      outboundCount: parseResult.outboundCount,
      startTime: parseResult.startTime,
      endTime: parseResult.endTime,
      replacedRowsCount: syncResult.replacedRowsCount,
      newRowsCount: syncResult.newRowsCount,
      totalSheetRowsCount: syncResult.totalSheetRowsCount,
      spreadsheetUrl: syncResult.spreadsheetUrl,
      message: `카카오톡 대화 ${parseResult.totalCount}건(수신 ${parseResult.inboundCount}건, 발신 ${parseResult.outboundCount}건)이 구글 시트에 덮어쓰기 반영되었습니다. (기존 중복 ${syncResult.replacedRowsCount}행 교체)`,
    });
  } catch (error: any) {
    console.error("[KakaoImportRoute] 예외 발생:", error);
    return NextResponse.json(
      { success: false, error: error.message || "카카오톡 대화 파일 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
