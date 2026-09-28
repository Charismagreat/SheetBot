export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveUserSpreadsheet, SheetBindingType } from "@/lib/sheet-binding-helper";
import { callSheetsTool, callDriveTool, listDriveFiles, createDriveFolder, trashDriveFile } from "@/lib/egdesk-helpers";

interface SheetDefinition {
  defaultTitle: string;
  headers: string[];
  range: string;
  defaultFolder?: string;
}

export const SHEET_DEFINITIONS: Record<string, SheetDefinition> = {
  SMS: {
    defaultTitle: "[SheetBot] 스마트폰 문자(SMS) 송수신 대장",
    headers: ["일시", "구분", "상대방 이름", "상대방 전화번호", "메시지 내용", "기기명"],
    range: "A1:F1",
  },
  KAKAO: {
    defaultTitle: "[SheetBot] 카카오톡 메시지 대장",
    headers: ["수신 일시", "채팅방/발신자", "메시지 내용", "기기명", "동기화 일시"],
    range: "A1:E1",
  },
  MISSED_CALL: {
    defaultTitle: "[SheetBot] 부재중 전화 대장",
    headers: ["부재중 일시", "발신 번호", "연락처 이름", "자동 회신 내용", "회신 상태", "기기명"],
    range: "A1:F1",
  },
  RECORDING: {
    defaultTitle: "[SheetBot] 통화 녹음 대장",
    headers: ["통화 일시", "상대방 이름", "파일명", "파일 크기", "드라이브 링크", "동기화 일시"],
    range: "A1:F1",
    defaultFolder: "[SheetBot] 통화 녹음",
  },
  LINK_BOOKMARK: {
    defaultTitle: "[SheetBot] 웹 링크 & 유튜브 스크랩 대장",
    headers: ["등록 일시", "구분", "제목", "웹 링크(URL)", "AI 핵심 3줄 요약", "출처"],
    range: "A1:F1",
  },
  FILE_UPLOAD: {
    defaultTitle: "[SheetBot] 파일 업로드 대장",
    headers: ["업로드 일시", "구분", "파일명", "파일 크기", "드라이브 링크", "비고"],
    range: "A1:F1",
    defaultFolder: "[SheetBot] 파일 보관함",
  },
  CALL_ENDED_CARD: {
    defaultTitle: "[SheetBot] 모바일 명함 발송 대장",
    headers: ["발송 일시", "상대방 번호", "연락처 이름", "발송 방식", "명함 내용/URL", "발송 결과", "기기명"],
    range: "A1:G1",
  },
  PAYMENT_PUSH: {
    defaultTitle: "[SheetBot] 매장 결제 및 매출 대장",
    headers: ["결제 일시", "결제 채널/금융사", "입금/고객명", "결제 금액(원)", "주문/결제 내용", "수신 기기"],
    range: "A1:F1",
  },
  RECEIPT_SMS: {
    defaultTitle: "[SheetBot] 고객 영수증 문자 발송 대장",
    headers: ["발송 일시", "수신 번호", "고객/입금자명", "결제 금액(원)", "발송 영수증 내용", "발송 상태", "기기명"],
    range: "A1:G1",
  },
  WEBSITE_MONITOR: {
    defaultTitle: "[SheetBot] 웹사이트 모니터링 & 장애 대장",
    headers: ["점검/감지 일시", "대상 URL", "상태 코드", "응답 속도", "상태/장애 내용", "교차 검증 결과", "기기명"],
    range: "A1:G1",
  },
  QUOTE: {
    defaultTitle: "[SheetBot] 스마트 견적 및 단가표 대장",
    headers: ["카테고리", "품목코드", "품목명", "규격/단위", "기본단가(원)", "할인가(원)", "옵션구분", "비고/설명"],
    range: "A1:H1",
  },
};

/**
 * 구글 드라이브 폴더 선제 생성 헬퍼
 */
async function ensureDriveFolder(folderName: string): Promise<string | null> {
  try {
    const queryStr = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`;
    const searchRes = await listDriveFiles(
      { query: queryStr },
      { preferOAuth: true }
    ).catch(() => ({ files: [] }));

    if (searchRes?.files && searchRes.files.length > 0) {
      const primaryFolder = searchRes.files[0];
      if (searchRes.files.length > 1) {
        console.log(`[ProvisionSheet] Found ${searchRes.files.length} folders for '${folderName}', cleaning up duplicates...`);
        for (let i = 1; i < searchRes.files.length; i++) {
          trashDriveFile(searchRes.files[i].id, true).catch(() => {});
        }
      }
      return primaryFolder.id;
    }

    const createRes = await createDriveFolder(folderName, undefined, true).catch((err: any) => {
      console.warn(`[ProvisionSheet] drive_create_folder warning for ${folderName}:`, err.message);
      return null;
    });

    return (createRes as any)?.folderId || (createRes as any)?.id || null;
  } catch (err: any) {
    console.warn(`[ProvisionSheet] Failed to ensure folder ${folderName}:`, err.message);
    return null;
  }
}

/**
 * 스마트 견적 대장 (QUOTE) 전용 3종 탭 및 초기 서식/데이터 자동 주입 함수
 */
async function setupQuoteSpreadsheet(spreadsheetId: string, primaryTabName: string): Promise<void> {
  console.log(`[ProvisionSheet] Setting up full QUOTE spreadsheet layout for ${spreadsheetId}...`);

  // 1. 첫 번째 탭: '단가표' 데이터 주입
  const catalogHeaders = [
    "카테고리", "품목코드", "품목명", "규격/단위", "기본단가(원)", "할인가(원)", "옵션구분", "비고/설명"
  ];
  const sampleCatalogRows = [
    catalogHeaders,
    ["에어컨 세척", "AC-001", "스탠드 에어컨 분해세척", "1대", 150000, 140000, "메인", "필터 및 열교환기 고압 살균"],
    ["에어컨 세척", "AC-002", "벽걸이 에어컨 분해세척", "1대", 80000, 80000, "메인", "가정용/원룸 기준"],
    ["에어컨 세척", "AC-003", "천장형 시스템 에어컨 (4WAY)", "1대", 130000, 120000, "메인", "사무실/상가 천장형"],
    ["추가 옵션", "OPT-001", "실외기 고압 세척", "1대", 30000, 30000, "옵션", "실외기 오염물 제거"],
    ["추가 옵션", "OPT-002", "피톤치드 연무 살균 소독", "1식", 0, 0, "옵션", "무료 서비스 이벤트 (기본 제공)"],
  ];

  await callSheetsTool(
    "sheets_update_range",
    {
      spreadsheetId,
      range: `${primaryTabName}!A1:H6`,
      values: sampleCatalogRows,
      preferOAuth: true,
    },
    { preferOAuth: true }
  ).catch((err: any) => console.warn(`[ProvisionQuote] Catalog insert warning:`, err.message));

  await callSheetsTool(
    "sheets_format_headers",
    {
      spreadsheetId,
      tabName: primaryTabName,
      headerBgColor: "#0f172a", // Slate 900
      headerTextColor: "#ffffff",
      preferOAuth: true,
    },
    { preferOAuth: true }
  ).catch(() => {});

  // 2. 두 번째 탭: '견적발급대장' 생성 및 헤더 주입
  const logTabName = "견적발급대장";
  await callSheetsTool(
    "sheets_create_tab",
    {
      spreadsheetId,
      tabName: logTabName,
      preferOAuth: true,
    },
    { preferOAuth: true }
  ).catch((err: any) => console.warn(`[ProvisionQuote] Create log tab warning:`, err.message));

  const logHeaders = [
    ["견적번호", "발급일시", "고객명", "연락처", "견적품목요약", "공급가액", "부가세", "합계금액(원)", "견적서링크", "발송상태", "고객열람"]
  ];
  await callSheetsTool(
    "sheets_update_range",
    {
      spreadsheetId,
      range: `${logTabName}!A1:K1`,
      values: logHeaders,
      preferOAuth: true,
    },
    { preferOAuth: true }
  ).catch(() => {});

  await callSheetsTool(
    "sheets_format_headers",
    {
      spreadsheetId,
      tabName: logTabName,
      headerBgColor: "#1e3a8a", // Blue 900
      headerTextColor: "#ffffff",
      preferOAuth: true,
    },
    { preferOAuth: true }
  ).catch(() => {});

  // 3. 세 번째 탭: '견적서출력서식' 생성 및 공식 견적 양식 주입
  const templateTabName = "견적서출력서식";
  await callSheetsTool(
    "sheets_create_tab",
    {
      spreadsheetId,
      tabName: templateTabName,
      preferOAuth: true,
    },
    { preferOAuth: true }
  ).catch((err: any) => console.warn(`[ProvisionQuote] Create template tab warning:`, err.message));

  const todayStr = new Date().toISOString().split("T")[0];
  const templateRows = [
    ["견        적        서", "", "", "", "", "", ""],
    ["견적일자: " + todayStr, "", "", "공급자", "상호: 시트봇 공식 대리점", "", ""],
    ["고 객 명: 고객님 귀하", "", "", "", "대표자: 대표자명 (인)", "", ""],
    ["연 락 처: 010-0000-0000", "", "", "", "사업자등록번호: 000-00-00000", "", ""],
    ["합계금액: 일금 이십삼만원정 (\\230,000)", "", "", "", "사업장 소재지: 서울특별시 강남구", "", ""],
    ["", "", "", "", "연락처: 02-0000-0000", "", ""],
    ["No.", "품목명", "규격/단위", "수량", "단가(원)", "공급가액(원)", "세액(원)"],
    [1, "스탠드 에어컨 분해세척", "1대", 1, 150000, 150000, 15000],
    [2, "벽걸이 에어컨 분해세척", "1대", 1, 80000, 80000, 8000],
    ["", "합계 (VAT 포함)", "", "", "", "=SUM(F8:F9)", "=SUM(G8:G9)"],
    ["", "총 결제 예상 금액", "", "", "", "", "=F10+G10"],
    ["", "", "", "", "", "", ""],
    ["[안내 및 유의사항]", "", "", "", "", "", ""],
    ["• 본 견적서는 발행일로부터 14일간 유효합니다.", "", "", "", "", "", ""],
    ["• 작업 일정 및 추가 옵션은 현장 상황에 따라 조율될 수 있습니다.", "", "", "", "", "", ""],
    ["• 문의 및 상담: 시트봇 고객센터 또는 문자 회신", "", "", "", "", "", ""]
  ];

  await callSheetsTool(
    "sheets_update_range",
    {
      spreadsheetId,
      range: `${templateTabName}!A1:G16`,
      values: templateRows,
      preferOAuth: true,
    },
    { preferOAuth: true }
  ).catch(() => {});

  await callSheetsTool(
    "sheets_format_headers",
    {
      spreadsheetId,
      tabName: templateTabName,
      headerBgColor: "#047857", // Emerald 700
      headerTextColor: "#ffffff",
      preferOAuth: true,
    },
    { preferOAuth: true }
  ).catch(() => {});

  console.log(`[ProvisionQuote] ✅ Successfully initialized 3 tabs for QUOTE spreadsheet.`);
}

/**
 * POST /api/user/sheets/provision
 * 기능 스위치 ON 시 헤더가 포함된 구글 스프레드시트 대장 및 드라이브 폴더 선제 생성 (Eager Provisioning)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userEmail, sheetType, sheetTitle, folderName } = body;

    if (!userEmail || typeof userEmail !== "string") {
      return NextResponse.json(
        { success: false, error: "userEmail is required" },
        { status: 400 }
      );
    }

    const cleanEmail = userEmail.trim().toLowerCase();
    const typeKey = (sheetType || "").toUpperCase();
    const def = SHEET_DEFINITIONS[typeKey];

    if (!def) {
      return NextResponse.json(
        { success: false, error: `Unsupported sheetType: ${sheetType}` },
        { status: 400 }
      );
    }

    // 1. 필요한 경우 구글 드라이브 폴더 선제 생성
    const targetFolder = folderName || def.defaultFolder;
    let createdFolderId: string | null = null;
    if (targetFolder) {
      createdFolderId = await ensureDriveFolder(targetFolder);
    }

    // 2. 구글 스프레드시트 대장 고유 ID 영구 바인딩 및 생성
    const resolved = await resolveUserSpreadsheet({
      userEmail: cleanEmail,
      sheetType: typeKey as SheetBindingType,
      defaultTitle: def.defaultTitle,
      requestedTitle: sheetTitle,
      folderId: createdFolderId,
      preferOAuth: true,
    });

    const targetSpreadsheetId = resolved.spreadsheetId;

    if (!targetSpreadsheetId) {
      return NextResponse.json(
        { success: false, error: "Failed to resolve or create spreadsheet" },
        { status: 500 }
      );
    }

    // 3. 스프레드시트 첫 번째 메인 탭 이름 동적 확인 및 1행 A1 헤더 주입
    try {
      let primaryTabName = "시트1";
      try {
        const meta = await callSheetsTool(
          "sheets_get_spreadsheet",
          { spreadsheetId: targetSpreadsheetId, preferOAuth: true },
          { preferOAuth: true }
        );
        if (meta?.sheets && meta.sheets.length > 0 && meta.sheets[0].title) {
          primaryTabName = meta.sheets[0].title;
        }
      } catch (metaErr: any) {
        console.warn(`[ProvisionSheet] sheets_get_spreadsheet warning:`, metaErr.message);
      }

      const checkRange = `${primaryTabName}!A1:A1`;
      const firstRowCheck = await callSheetsTool(
        "sheets_get_range",
        {
          spreadsheetId: targetSpreadsheetId,
          range: checkRange,
          preferOAuth: true,
        },
        { preferOAuth: true }
      ).catch(() => null);

      const hasHeaderOrData =
        firstRowCheck?.values &&
        firstRowCheck.values.length > 0 &&
        firstRowCheck.values[0]?.[0];

      if (!hasHeaderOrData) {
        if (typeKey === "QUOTE") {
          await setupQuoteSpreadsheet(targetSpreadsheetId, primaryTabName);
        } else {
          const updateRange = `${primaryTabName}!${def.range}`;
          console.log(`[ProvisionSheet] Injecting headers to ${updateRange} for ${typeKey}...`);
          await callSheetsTool(
            "sheets_update_range",
            {
              spreadsheetId: targetSpreadsheetId,
              range: updateRange,
              values: [def.headers],
              preferOAuth: true,
            },
            { preferOAuth: true }
          );

          await callSheetsTool(
            "sheets_format_headers",
            {
              spreadsheetId: targetSpreadsheetId,
              tabName: primaryTabName,
              headerBgColor: "#1e293b",
              headerTextColor: "#ffffff",
              preferOAuth: true,
            },
            { preferOAuth: true }
          ).catch((fmtErr: any) => {
            console.warn(`[ProvisionSheet] sheets_format_headers warning:`, fmtErr.message);
          });
        }
      }
    } catch (fmtErr: any) {
      console.warn(`[ProvisionSheet] Header format warning:`, fmtErr.message);
    }

    const finalSpreadsheetUrl =
      resolved.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
    const finalFolderUrl = createdFolderId
      ? `https://drive.google.com/drive/folders/${createdFolderId}`
      : null;

    return NextResponse.json({
      success: true,
      isNew: resolved.isNew,
      spreadsheetId: targetSpreadsheetId,
      spreadsheetUrl: finalSpreadsheetUrl,
      folderId: createdFolderId,
      folderUrl: finalFolderUrl,
      folderName: targetFolder,
      title: sheetTitle || def.defaultTitle,
      message: resolved.isNew
        ? "새 구글 스프레드시트 대장과 헤더가 성공적으로 준비되었습니다."
        : "기존 연결된 구글 스프레드시트 대장을 확인하였습니다.",
    });
  } catch (error: any) {
    console.error("[ProvisionSheet] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
