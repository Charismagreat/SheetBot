export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callDriveTool,
  callSheetsTool,
  listDriveFiles,
  createDriveFolder,
  moveDriveFile,
  insertRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * POST /api/user/crm/setup
 * 고객별 360도 통합 CRM 대장 구글 스프레드시트 자동 구축 API
 *
 * 1) [SheetBot] 고객 360도 통합 CRM 대장 생성
 * 2) 3개 핵심 워크시트 자동 프로비저닝:
 *    - '🔍 고객 360도 통합 조회' : 고객 전화번호/성함 입력 시 최근 통화, 문자, 카톡, 영수증 종합 요약
 *    - '📊 통합 타임라인 로그' : 전화, 부재중, SMS, 카톡, 영수증, 명함의 전체 히스토리
 *    - '📇 인맥 및 고객 프로필' : 명함 및 주소록 기반 마스터 고객 프로필
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const body = await req.json().catch(() => ({}));
    const bodyEmail = body.userEmail as string | undefined;

    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const sheetTitle = "[SheetBot] 고객 360도 통합 CRM 대장";
    const folderName = "[SheetBot] 비즈니스 CRM";

    // 1. 드라이브 폴더 탐색 또는 생성
    let targetFolderId: string | null = null;
    try {
      const folderSearch = await listDriveFiles({
        query: `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`,
        preferOAuth: true,
      });
      const existingFolders = folderSearch?.files || [];
      if (existingFolders.length > 0) {
        targetFolderId = existingFolders[0].id;
      } else {
        const newFolderRes = await createDriveFolder(folderName, undefined, true);
        targetFolderId = newFolderRes?.id || (typeof newFolderRes === "string" ? newFolderRes : null);
      }
    } catch (fErr: any) {
      console.warn("[CrmSetup] Folder search warning:", fErr.message);
    }

    // 2. 기존 CRM 시트가 있는지 검색
    let targetSpreadsheetId: string | null = null;
    let spreadsheetUrl = "";

    const queryStr = targetFolderId
      ? `'${targetFolderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${sheetTitle}' and trashed = false`
      : `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${sheetTitle}' and trashed = false`;

    const sheetSearch = await listDriveFiles({
      query: queryStr,
      preferOAuth: true,
    }).catch(() => ({ files: [] }));

    const foundSheets = sheetSearch?.files || [];
    if (foundSheets.length > 0) {
      targetSpreadsheetId = foundSheets[0].id;
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

      return NextResponse.json({
        success: true,
        message: "이미 구축된 고객 360도 통합 CRM 대장이 존재합니다.",
        spreadsheetId: targetSpreadsheetId,
        spreadsheetUrl,
        alreadyExists: true,
      });
    }

    // 3. 스프레드시트 신규 생성
    const createRes = await callSheetsTool("sheets_create_spreadsheet", {
      title: sheetTitle,
      preferOAuth: true,
    });

    targetSpreadsheetId = createRes?.spreadsheetId || createRes?.id || null;
    if (!targetSpreadsheetId) {
      throw new Error("스프레드시트 생성에 실패했습니다.");
    }
    spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

    // 4. 폴더 이동
    if (targetFolderId) {
      await moveDriveFile(targetSpreadsheetId, targetFolderId, true).catch(() => {});
    }

    // 5. 시트 탭 구성 (기본 시트1 -> '🔍 고객 360도 통합 조회'로 단일화/명명)
    // 탭 1: '🔍 고객 360도 통합 조회'
    // 탭 2: '📊 통합 타임라인 로그'
    // 탭 3: '📇 인맥 및 고객 프로필'
    await callSheetsTool("sheets_create_tab", {
      spreadsheetId: targetSpreadsheetId,
      tabName: "📊 통합 타임라인 로그",
      preferOAuth: true,
    }).catch(() => {});

    await callSheetsTool("sheets_create_tab", {
      spreadsheetId: targetSpreadsheetId,
      tabName: "📇 인맥 및 고객 프로필",
      preferOAuth: true,
    }).catch(() => {});

    // [탭 1: 🔍 고객 360도 통합 조회] 헤더 & 템플릿
    const tab1Content = [
      ["🚀 SheetBot 고객 360도 올인원 비즈니스 통합 CRM", "", "", "", "", ""],
      ["조회할 고객 전화번호 또는 성함 입력 ➡️", "010-", "", "", "최종 동기화", new Date().toISOString().replace("T", " ").slice(0, 19)],
      ["", "", "", "", "", ""],
      ["[고객 기본 프로필]", "", "", "", "", ""],
      ["성함 / 상호", "회사 / 소속", "직함", "휴대전화", "이메일", "최근 접촉일"],
      ["=IFERROR(VLOOKUP(B2, '📇 인맥 및 고객 프로필'!D:I, 1, FALSE), \"-\")",
       "=IFERROR(VLOOKUP(B2, '📇 인맥 및 고객 프로필'!D:I, 3, FALSE), \"-\")",
       "=IFERROR(VLOOKUP(B2, '📇 인맥 및 고객 프로필'!D:I, 2, FALSE), \"-\")",
       "=B2",
       "=IFERROR(VLOOKUP(B2, '📇 인맥 및 고객 프로필'!D:I, 4, FALSE), \"-\")",
       "=IFERROR(MAX(FILTER('📊 통합 타임라인 로그'!A:A, '📊 통합 타임라인 로그'!D:D=B2)), \"-\")"],
      ["", "", "", "", "", ""],
      ["[최근 360도 타임라인 통합 기록 (통화/문자/카톡/영수증/명함)]", "", "", "", "", ""],
      ["발생일시", "채널/구분", "고객명/상호", "연락처", "내용 요약 / 주요 대화 / 결제내역", "상세/녹음/영수증 링크"]
    ];

    await callSheetsTool("sheets_update_range", {
      spreadsheetId: targetSpreadsheetId,
      range: "시트1!A1:F9",
      values: tab1Content,
      preferOAuth: true,
    }).catch(() => {});

    // [탭 2: 📊 통합 타임라인 로그] 헤더
    const tab2Headers = [
      ["발생일시", "채널/구분", "고객명/상호", "연락처/식별자", "내용 요약 / 대화 / 품목", "금액 / 부가세", "상세/녹음/영수증 링크", "기기/출처", "기록일시"]
    ];
    await callSheetsTool("sheets_update_range", {
      spreadsheetId: targetSpreadsheetId,
      range: "'📊 통합 타임라인 로그'!A1:I1",
      values: tab2Headers,
      preferOAuth: true,
    }).catch(() => {});

    await callSheetsTool("sheets_format_headers", {
      spreadsheetId: targetSpreadsheetId,
      tabName: "📊 통합 타임라인 로그",
      headerBgColor: "#0f172a", // 슬레이트 다크
      headerTextColor: "#ffffff",
      preferOAuth: true,
    }).catch(() => {});

    // [탭 3: 📇 인맥 및 고객 프로필] 헤더
    const tab3Headers = [
      ["등록일시", "성함", "직함", "휴대전화", "회사/소속", "이메일", "회사전화", "주소", "명함 원본 링크", "메모"]
    ];
    await callSheetsTool("sheets_update_range", {
      spreadsheetId: targetSpreadsheetId,
      range: "'📇 인맥 및 고객 프로필'!A1:J1",
      values: tab3Headers,
      preferOAuth: true,
    }).catch(() => {});

    await callSheetsTool("sheets_format_headers", {
      spreadsheetId: targetSpreadsheetId,
      tabName: "📇 인맥 및 고객 프로필",
      headerBgColor: "#1e3a8a", // 네이비 블루
      headerTextColor: "#ffffff",
      preferOAuth: true,
    }).catch(() => {});

    // 6. 감사 로그 DB 기록
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "CRM_SETUP",
        rule_name: "📊 고객 360도 통합 CRM 구축",
        device_id: "SheetBot Cloud",
        recipient: cleanEmail,
        content: `고객 360도 통합 CRM 스프레드시트가 성공적으로 자동 구축되었습니다. (${sheetTitle})`,
        status: "SUCCESS",
        error_message: null,
        created_at: new Date().toISOString(),
      },
    ]).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "고객 360도 통합 CRM 대장이 성공적으로 구축되었습니다.",
      spreadsheetId: targetSpreadsheetId,
      spreadsheetUrl,
      folderId: targetFolderId,
    });
  } catch (err: any) {
    console.error("[CrmSetup] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
