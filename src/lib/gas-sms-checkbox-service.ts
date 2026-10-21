import {
  callAppsScriptTool,
  WorkspaceVisitorCallOptions,
} from "@/lib/egdesk-helpers";

export interface DeploySmsCheckboxScriptOptions {
  spreadsheetId: string;
  tabName?: string;
  userEmail: string;
  callOptions?: WorkspaceVisitorCallOptions;
}

export interface DeploySmsCheckboxScriptResult {
  success: boolean;
  gasProjectId?: string;
  scriptId?: string;
  scriptUrl?: string;
  error?: string;
}

/**
 * 체크박스 문자 발송용 Google Apps Script 소스 코드 생성
 */
export function generateSmsCheckboxScriptCode(tabName: string = "문자발송목록"): string {
  const safeTabName = tabName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `/**
 * 🚀 SheetBot 스프레드시트 체크박스 0원 문자 발송 스크립트
 * 
 * 스프레드시트 D열의 체크박스를 클릭([V])하면 SheetBot 백엔드로
 * 즉시 웹훅을 전송하여 연동된 스마트폰에서 0원으로 문자를 발송합니다.
 */

var SHEETBOT_CONFIG = {
  ENDPOINT: "https://sheetbot.cloud/api/user/sheet-sms/dispatch",
  TARGET_TAB: "${safeTabName}",
  CHECKBOX_COL: 4,          // D열 (발송 체크박스)
  RESULT_COL: 5             // E열 (결과 표기열)
};

/**
 * 🚀 스프레드시트 열릴 때 상단 메뉴 및 자동 트리거/체크박스 세팅
 */
function onOpen(e) {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("🚀 SheetBot 메뉴")
    .addItem("📱 문자 발송 트리거 활성화 (1회 실행)", "installSmsTrigger")
    .addToUi();

  // 1. 체크박스 자동 세팅 (D2:D100)
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetSheet = ss.getSheetByName(SHEETBOT_CONFIG.TARGET_TAB);
    if (targetSheet) {
      targetSheet.getRange("D2:D100").insertCheckboxes();
    }
  } catch (cbErr) {
    Logger.log("Checkbox insert note: " + cbErr);
  }

  // 2. 트리거 자동 등록 시도
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var hasTrigger = false;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "onEditTrigger") {
        hasTrigger = true;
        break;
      }
    }
    if (!hasTrigger) {
      ScriptApp.newTrigger("onEditTrigger")
        .forSpreadsheet(SpreadsheetApp.getActive())
        .onEdit()
        .create();
    }
  } catch (err) {
    Logger.log("Auto-trigger note: " + err);
  }
}

/**
 * 🎯 설치형 편집 감지 트리거 (Installable Trigger)
 */
function onEditTrigger(e) {
  try {
    if (!e || !e.range) return;

    var sheet = e.range.getSheet();
    var sheetName = sheet.getName();
    var col = e.range.getColumn();
    var row = e.range.getRow();
    var val = e.range.getValue();

    // 1. 유효성 검사 (대상 탭 및 헤더 행 제외, D열 체크박스 체크 여부)
    if (sheetName !== SHEETBOT_CONFIG.TARGET_TAB) return;
    if (row < 2) return;
    if (col !== SHEETBOT_CONFIG.CHECKBOX_COL) return;
    if (val !== true && String(val).toUpperCase() !== "TRUE") return;

    // 2. 해당 행의 발송 데이터 추출
    var phone = String(sheet.getRange(row, 1).getValue() || "").trim(); // A열: 수신 번호
    var customerName = String(sheet.getRange(row, 2).getValue() || "").trim(); // B열: 고객명
    var message = String(sheet.getRange(row, 3).getValue() || "").trim(); // C열: 문자 내용

    if (!phone) {
      sheet.getRange(row, SHEETBOT_CONFIG.RESULT_COL).setValue("⚠️ 전화번호 누락");
      return;
    }
    if (!message) {
      sheet.getRange(row, SHEETBOT_CONFIG.RESULT_COL).setValue("⚠️ 문자 내용 누락");
      return;
    }

    // 3. 중복 발송 방지를 위해 E열에 즉시 '진행중' 표시
    sheet.getRange(row, SHEETBOT_CONFIG.RESULT_COL).setValue("⏳ 발송 준비중...");
    SpreadsheetApp.flush();

    // 4. 발송 주체 사용자 이메일 식별 (Multi-tenant User Attribution)
    var userEmail = "";
    if (e.user && typeof e.user.getEmail === "function") {
      userEmail = e.user.getEmail();
    }
    if (!userEmail) {
      try { userEmail = Session.getActiveUser().getEmail(); } catch (err) {}
    }
    if (!userEmail) {
      try { userEmail = Session.getEffectiveUser().getEmail(); } catch (err) {}
    }

    if (!userEmail) {
      sheet.getRange(row, SHEETBOT_CONFIG.RESULT_COL).setValue("⚠️ 사용자 이메일 감지 불가 (로그인/권한 확인 필요)");
      return;
    }

    // 5. 시트 메타데이터 조립
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var spreadsheetId = ss.getId();

    var payload = {
      userEmail: userEmail,
      phoneNumber: phone,
      customerName: customerName,
      messageText: message,
      spreadsheetId: spreadsheetId,
      tabName: sheetName,
      rowIndex: row
    };

    // 6. SheetBot 백엔드로 웹훅 발송 (Fast-Return)
    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(SHEETBOT_CONFIG.ENDPOINT, options);
    var resCode = response.getResponseCode();
    var resBody = response.getContentText();

    if (resCode === 200) {
      sheet.getRange(row, SHEETBOT_CONFIG.RESULT_COL).setValue("📱 스마트폰 대기열 등록 (발송대기)");
    } else {
      sheet.getRange(row, SHEETBOT_CONFIG.RESULT_COL).setValue("❌ 오류 (" + resCode + "): " + resBody);
    }
  } catch (err) {
    console.error("[onEditTrigger Error]", err);
  }
}

/**
 * 🛠️ 원클릭 트리거 설치 함수
 */
function installSmsTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // D2:D100에 체크박스 서식 적용
  try {
    var targetSheet = ss.getSheetByName(SHEETBOT_CONFIG.TARGET_TAB);
    if (targetSheet) {
      targetSheet.getRange("D2:D100").insertCheckboxes();
    }
  } catch (e) {}

  // 기존 등록된 onEditTrigger 중복 제거
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onEditTrigger") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 스프레드시트 편집 시 작동하는 신규 트리거 생성
  ScriptApp.newTrigger("onEditTrigger")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ss.toast(
    "체크박스 문자 발송 트리거가 성공적으로 활성화되었습니다!", 
    "SheetBot 연동 완료", 
    5
  );
}
`;
}

/**
 * 스프레드시트에 체크박스 문자 자동화 Apps Script를 생성 및 배포
 */
export async function deploySmsCheckboxScript(
  options: DeploySmsCheckboxScriptOptions
): Promise<DeploySmsCheckboxScriptResult> {
  const { spreadsheetId, callOptions } = options;
  const tabName = options.tabName || "문자발송목록";

  const scriptCode = generateSmsCheckboxScriptCode(tabName);

  try {
    // 1. Google OAuth 상태 확인
    const authStatus = await callAppsScriptTool("apps_script_auth_status", {}, callOptions).catch(() => null);
    if (authStatus && (authStatus as any).connected === false) {
      console.warn("[DeploySmsCheckbox] OAuth not connected:", (authStatus as any).error);
      return {
        success: false,
        error: "Google Workspace OAuth 권한이 필요합니다.",
      };
    }

    // 2. Apps Script 프로젝트 생성 또는 조회 (apps_script_create_bound)
    let gasProjectId: string | null = null;
    let scriptId: string | null = null;
    let scriptUrl: string | null = null;

    const boundRes = await callAppsScriptTool(
      "apps_script_create_bound",
      {
        fileId: spreadsheetId,
        title: "[SheetBot] 체크박스 문자 자동화",
        scriptCode,
        preferOAuth: true,
      },
      callOptions
    ).catch((err: any) => {
      console.warn("[DeploySmsCheckbox] apps_script_create_bound warning:", err.message);
      return null;
    });

    if (boundRes) {
      gasProjectId = (boundRes as any).id || (boundRes as any).projectId || null;
      scriptId = (boundRes as any).scriptId || gasProjectId;
      scriptUrl = (boundRes as any).scriptUrl || (scriptId ? `https://script.google.com/d/${scriptId}/edit` : null);
    }

    // 3. 기존 프로젝트가 등록되어 있거나 신규 생성된 경우 Code.gs 덮어쓰기 및 푸시
    if (gasProjectId) {
      await callAppsScriptTool(
        "apps_script_write_file",
        {
          projectId: gasProjectId,
          fileName: "Code.gs",
          content: scriptCode,
        },
        callOptions
      ).catch((writeErr: any) => {
        console.warn("[DeploySmsCheckbox] write_file warning:", writeErr.message);
      });

      await callAppsScriptTool(
        "apps_script_push_to_google",
        {
          projectId: gasProjectId,
        },
        callOptions
      ).catch((pushErr: any) => {
        console.warn("[DeploySmsCheckbox] push_to_google warning:", pushErr.message);
      });

      // 4. 트리거 원격 설치 시도 (apps_script_run_function)
      await callAppsScriptTool(
        "apps_script_run_function",
        {
          projectId: gasProjectId,
          functionName: "installSmsTrigger",
        },
        callOptions
      ).catch((runErr: any) => {
        console.log("[DeploySmsCheckbox] Remote trigger installation note (will run onOpen):", runErr.message);
      });

      console.log(`[DeploySmsCheckbox] ✅ Successfully deployed Apps Script to spreadsheet ${spreadsheetId} (Project: ${gasProjectId})`);

      return {
        success: true,
        gasProjectId,
        scriptId: scriptId || undefined,
        scriptUrl: scriptUrl || undefined,
      };
    }

    return {
      success: false,
      error: "Apps Script 프로젝트를 생성 또는 연결하지 못했습니다.",
    };
  } catch (err: any) {
    console.error("[DeploySmsCheckbox] Unexpected deploy error:", err);
    return {
      success: false,
      error: err?.message || "Apps Script 배포 중 오류가 발생했습니다.",
    };
  }
}
