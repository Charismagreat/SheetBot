/**
 * SheetBot AI 무역/수입 수불부 자동화 시스템 & 표준 공통 코파일럿
 * - 【양방향 완전 비동기 웹훅 파이프라인 (Two-Way Async Webhook)】
 *   1단계 (트리거): Apps Script는 서버로 자신의 webhookUrl을 담아 0.5초 만에 신호 발송 후 즉시 종료
 *   2단계 (백그라운드): 서버가 시간 제약 없이 Gemini 2.5 Flash로 PDF 분석 완료
 *   3단계 (역방향 콜백): 서버가 Apps Script 웹앱 doPost(e)로 분석 결과 JSON을 웹훅으로 역전송 (302 Redirection 완벽 대응)
 *   4단계 (시트 반영): doPost(e)가 해당 셀만 파란색 글씨(#1a73e8, bold)로 기입하고 수식 자동 보완
 * - 통합 doPost(e) 라우터: AI 문서 분석 결과 및 은행 입금 알림(TokenRecharge.gs) 자동 분기
 * - SheetBot 공식 공통 코파일럿 사이드바 및 통합 제어 센터 연동
 */

var SHEETBOT_API_URL = "https://sheetbot.cloud/api/sheets/auto-import-doc";
var DEFAULT_SPREADSHEET_ID = "1pVbKBwySxMLCY0S4er3O-qbQKAwVYA8bbM51DGJItLM";
var DEFAULT_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbx7l5Ce6S4cwaU4mrDyUgZF5uKOSwU8zl3Nw_so5i6Rpl5MnMW6S98u1tgMrbHSl7zArw/exec";

var FOLDER_NAME_DONE = "📁 [완료] 처리완료함";
var FOLDER_NAME_REVIEW = "📁 [확인필요] 미처리보관함";

var COLOR_TARGET_CELL_FONT = "#1a73e8"; // AI 기입 셀 전용 파란색 글자

/**
 * UI 객체 안전 취득 (헤드리스/트리거 환경 대응)
 */
function getUiSafe() {
  try {
    return SpreadsheetApp.getUi();
  } catch (e) {
    return null;
  }
}

/**
 * 토스트 알림 안전 호출
 */
function toastSafe(ss, message, title, timeoutSec) {
  try {
    if (ss && ss.toast) {
      ss.toast(message, title || "SheetBot AI", timeoutSec || 5);
    }
  } catch (e) {}
}

/**
 * 구글 스프레드시트 열릴 때 상단 메뉴 등록
 */
function onOpen() {
  var ui = getUiSafe();
  if (ui) {
    ui.createMenu("🚀 SheetBot 메뉴")
      .addItem("📁 수불부 송장일자 AI 매칭 반영 (SPRING/BAND)", "runAiFolderDocSync")
      .addItem("📑 인보이스 AI 상세 분석 및 INVOICE 탭 등록 (다중 품목)", "runAiInvoiceTabSync")
      .addSeparator()
      .addItem("🔄 1시간 주기 자동 감시 설정", "installHourlyTrigger")
      .addItem("🛑 자동 감시 해제", "removeTriggers")
      .addSeparator()
      .addItem("🤖 SheetBot AI 코파일럿", "showAiCopilotSidebar")
      .addToUi();
  }
}

/**
 * 【1단계: 초고속 트리거 발송 (0.5초 Fast-Return)】
 * 자신의 웹앱 URL(ScriptApp.getService().getUrl())을 동봉하여 서버로 전송 후 즉시 종료합니다.
 */

/**
 * 【인보이스 전용 트리거 발송 (0.5초 Fast-Return)】
 * 폴더 내 상업송장(Commercial Invoice)을 분석하여 'INVOICE' 탭에 다중 품목 상세 행으로 등록하도록 백엔드에 요청합니다.
 */
function runAiInvoiceTabSync() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.openById(DEFAULT_SPREADSHEET_ID);
  }
  var ssId = ss.getId();
  var ui = getUiSafe();

  try {
    // 1. 부모 폴더 자동 취득
    var currentFile = DriveApp.getFileById(ssId);
    var parents = currentFile.getParents();
    if (!parents.hasNext()) {
      if (ui) ui.alert("⚠️ 알림", "스프레드시트가 위치한 상위 폴더를 찾을 수 없습니다.", ui.ButtonSet.OK);
      return { success: false, message: "부모 폴더를 찾을 수 없습니다." };
    }
    var parentFolder = parents.next();
    var folderId = parentFolder.getId();
    var folderName = parentFolder.getName();

    // 1-1. 폴더 내 처리 대상 파일 존재 여부 점검
    var files = parentFolder.getFiles();
    var pendingCount = 0;
    while (files.hasNext()) {
      var f = files.next();
      var mType = f.getMimeType();
      var fName = f.getName().toLowerCase();
      if (mType === "application/pdf" || fName.indexOf(".pdf") !== -1 || fName.indexOf(".png") !== -1 || fName.indexOf(".jpg") !== -1) {
        pendingCount++;
      }
    }

    if (pendingCount === 0) {
      if (ui) {
        ui.alert(
          "ℹ️ 처리 대기 문서 없음",
          "폴더 '" + folderName + "'에 새로 처리할 인보이스 문서(PDF)가 없습니다.\n\n"
          + "• 이전에 처리된 문서는 '" + FOLDER_NAME_DONE + "'으로 자동 이동되었습니다.\n"
          + "• 다시 테스트하시려면 '" + FOLDER_NAME_DONE + "' 안의 PDF를 상위 폴더로 꺼내놓으시거나 새 문서를 업로드해 주세요.",
          ui.ButtonSet.OK
        );
      }
      toastSafe(ss, "처리 대기 중인 신규 인보이스 문서가 없습니다.", "SheetBot 알림", 4);
      return { success: true, message: "대기 문서 없음" };
    }

    toastSafe(ss, "🚀 " + pendingCount + "건의 인보이스에 대해 INVOICE 탭 상세 분석 요청을 전송합니다...", "SheetBot AI", 3);

    var myWebhookUrl = DEFAULT_WEBAPP_URL;
    try {
      var savedUrl = PropertiesService.getScriptProperties().getProperty("SHEETBOT_WEBHOOK_URL");
      if (savedUrl && savedUrl.indexOf("http") !== -1) {
        myWebhookUrl = savedUrl;
      }
    } catch (_) {}

    var userEmail = "chachogreat@gmail.com";
    try {
      userEmail = Session.getActiveUser().getEmail() || userEmail;
    } catch (e) {}

    var payload = {
      spreadsheetId: ssId,
      folderId: folderId,
      webhookUrl: myWebhookUrl,
      mode: "async_webhook"
    };

    var apiUrl = "https://sheetbot.cloud/api/sheets/auto-import-invoice";
    var options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "X-User-Email": userEmail,
        "X-SheetBot-User-Email": userEmail
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(apiUrl, options);
    var resCode = res.getResponseCode();
    var resText = res.getContentText();

    if (resCode !== 200) {
      Logger.log("인보이스 분석 요청 오류 (" + resCode + "): " + resText);
      if (ui) ui.alert("⚠️ 통신 알림", "서버 응답 오류 (" + resCode + "):\n" + resText, ui.ButtonSet.OK);
      return { success: false, error: resText };
    }

    var jsonRes = JSON.parse(resText);
    toastSafe(ss, "✅ 인보이스 상세 분석 작업이 백그라운드에 등록되었습니다. 완료 시 'INVOICE' 탭에 등록됩니다.", "SheetBot AI", 6);

    if (ui) {
      ui.alert(
        "🎉 인보이스 상세 분석 작업 등록 완료",
        "폴더 '" + folderName + "' 내 인보이스 문서에 대한 상세 품목 분석이 백그라운드에 등록되었습니다.\n\n"
        + "• 서버가 백그라운드에서 AI 분석을 완료한 후, 'INVOICE' 탭에 품목별(Line Item)로 분할 적재합니다.\n"
        + "• 인보이스 번호와 품목명은 파란색 굵은 글씨로 식별하기 쉽게 강조됩니다.\n"
        + "• 완료된 문서는 '" + FOLDER_NAME_DONE + "'으로 자동 이동됩니다.\n"
        + "• 시트 창을 닫아도 백그라운드에서 안전하게 진행됩니다.",
        ui.ButtonSet.OK
      );
    }

    return { success: true, message: jsonRes.message || "작업 등록 완료" };
  } catch (err) {
    Logger.log("runAiInvoiceTabSync 오류: " + err.toString());
    if (ui) ui.alert("❌ 오류 발생", "작업 중 오류가 발생했습니다:\n" + err.toString(), ui.ButtonSet.OK);
    return { success: false, error: err.toString() };
  }
}

function runAiFolderDocSync() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.openById(DEFAULT_SPREADSHEET_ID);
  }
  var ssId = ss.getId();
  var ui = getUiSafe();

  try {
    // 1. 부모 폴더 자동 취득
    var currentFile = DriveApp.getFileById(ssId);
    var parents = currentFile.getParents();
    if (!parents.hasNext()) {
      if (ui) ui.alert("⚠️ 알림", "스프레드시트가 위치한 상위 폴더를 찾을 수 없습니다.", ui.ButtonSet.OK);
      return { success: false, message: "부모 폴더를 찾을 수 없습니다." };
    }
    var parentFolder = parents.next();
    var folderId = parentFolder.getId();
    var folderName = parentFolder.getName();

    // 1-1. 폴더 내 처리 대상 파일(PDF/이미지 등) 존재 여부 사전 점검
    var files = parentFolder.getFiles();
    var pendingCount = 0;
    while (files.hasNext()) {
      var f = files.next();
      var mType = f.getMimeType();
      var fName = f.getName().toLowerCase();
      if (mType === "application/pdf" || fName.indexOf(".pdf") !== -1 || fName.indexOf(".png") !== -1 || fName.indexOf(".jpg") !== -1) {
        pendingCount++;
      }
    }

    if (pendingCount === 0) {
      if (ui) {
        ui.alert(
          "ℹ️ 처리 대기 문서 없음",
          "폴더 '" + folderName + "'에 새로 처리할 문서(PDF)가 없습니다.\n\n"
          + "• 이전에 처리된 문서는 '" + FOLDER_NAME_DONE + "'으로 자동 이동되었습니다.\n"
          + "• 다시 테스트하시려면 '" + FOLDER_NAME_DONE + "' 안의 PDF를 상위 폴더로 꺼내놓으시거나 새 문서를 업로드해 주세요.",
          ui.ButtonSet.OK
        );
      }
      toastSafe(ss, "처리 대기 중인 신규 문서가 없습니다.", "SheetBot 알림", 4);
      return { success: true, message: "대기 문서 없음" };
    }

    toastSafe(ss, "🚀 " + pendingCount + "건의 문서에 대해 백그라운드 AI 분석 요청을 전송합니다...", "SheetBot AI", 3);

    // 2. 검증된 활성 웹앱 URL 취득 (바운드 세션 가상 URL 404 원천 차단)
    var myWebhookUrl = DEFAULT_WEBAPP_URL;
    try {
      var savedUrl = PropertiesService.getScriptProperties().getProperty("SHEETBOT_WEBHOOK_URL");
      if (savedUrl && savedUrl.indexOf("http") !== -1) {
        myWebhookUrl = savedUrl;
      }
    } catch (_) {}

    // 3. 사용자 이메일 취득
    var userEmail = "chachogreat@gmail.com";
    try {
      userEmail = Session.getActiveUser().getEmail() || userEmail;
    } catch (e) {}

    // 4. 서버에 웹훅 트리거 전송 (자신의 webhookUrl 동봉)
    var payload = {
      spreadsheetId: ssId,
      folderId: folderId,
      webhookUrl: myWebhookUrl,
      mode: "async_webhook"
    };

    var options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "X-User-Email": userEmail,
        "X-SheetBot-User-Email": userEmail
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(SHEETBOT_API_URL, options);
    var resCode = res.getResponseCode();
    var resText = res.getContentText();

    if (resCode !== 200) {
      Logger.log("웹훅 요청 오류 (" + resCode + "): " + resText);
      if (ui) ui.alert("⚠️ 통신 알림", "서버 응답 오류 (" + resCode + "):\n" + resText, ui.ButtonSet.OK);
      return { success: false, error: resText };
    }

    var jsonRes = JSON.parse(resText);

    toastSafe(ss, "✅ AI 분석 작업이 백그라운드에 등록되었습니다. 완료 시 시트에 파란색 글씨로 기입됩니다.", "SheetBot AI", 6);

    if (ui) {
      ui.alert(
        "🎉 AI 문서 분석 작업 등록 완료 (웹훅 방식)",
        "폴더 '" + folderName + "' 내 문서들에 대한 AI 분석 작업이 백그라운드에 안전하게 등록되었습니다.\n\n"
        + "• 서버가 백그라운드에서 AI 분석을 완료한 후, 시트의 웹앱으로 결과를 역전송(Webhook Callback)합니다.\n"
        + "• 자동 기입된 항목은 해당 셀만 파란색 굵은 글씨로 선명하게 표시됩니다.\n"
        + "• 비어 있던 송금예정일 수식(=N+60)도 자동으로 채워집니다.\n"
        + "• 완료된 문서는 '" + FOLDER_NAME_DONE + "'으로 자동 이동됩니다.\n"
        + "• 시트 창을 닫아도 백그라운드에서 안전하게 진행됩니다.",
        ui.ButtonSet.OK
      );
    }

    return { success: true, message: jsonRes.message || "작업 등록 완료" };

  } catch (err) {
    Logger.log("웹훅 오류: " + err.toString());
    if (ui) {
      ui.alert("❌ 오류 발생", "작업 중 오류가 발생했습니다:\n" + err.toString(), ui.ButtonSet.OK);
    }
    return { success: false, error: err.toString() };
  }
}

/**
 * 【통합 doPost 라우터】
 * AI 문서 분석 역방향 콜백과 은행 입금 감지(TokenRecharge.gs)를 안전하게 분기 라우팅합니다.
 */
function doPost(e) {
  try {
    var rawText = (e && e.postData && e.postData.contents) || "{}";
    var data = null;
    try {
      data = JSON.parse(rawText);
    } catch (_) {}

    // 1. 상업송장(INVOICE) 탭 상세 누적 웹훅 콜백인 경우
    if (data && (data.action === "APPLY_INVOICE_TAB" || data.targetTab === "INVOICE")) {
      return handleInvoiceTabWebhook(data);
    }

    // 2. 수불부(SPRING/BAND) 매칭 역방향 웹훅 콜백인 경우
    if (data && (data.targetTab || data.appliedRow !== undefined || data.action === "APPLY_DOC_RESULT" || data.mode === "doc_sync")) {
      return handleDocImportWebhook(data);
    }

    // 2. 은행 입금 감지 알림인 경우 (TokenRecharge.gs 위임)
    if (typeof handleBankDepositWebhook === 'function') {
      return handleBankDepositWebhook(e, rawText, data);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "SheetBot Webhook received (unhandled router event)"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("doPost 라우터 예외: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 【4단계: 서버로부터의 역방향 웹훅 콜백 수신 및 시트 반영 처리기】
 * 서버 백엔드가 AI 분석을 마친 후 쏴준 JSON을 받아 시트 셀 기입, 파란색 서식 적용, 수식 보완, 파일 이동을 실행합니다.
 */

/**
 * 【상업송장 상세 내역 수신 및 'INVOICE' 탭 누적 적재 처리기】
 */
function handleInvoiceTabWebhook(data) {
  try {
    var ss = null;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (_) {}
    if (!ss && data.spreadsheetId) {
      ss = SpreadsheetApp.openById(data.spreadsheetId);
    }
    if (!ss) {
      ss = SpreadsheetApp.openById(DEFAULT_SPREADSHEET_ID);
    }

    var sheet = ss.getSheetByName("INVOICE");
    if (!sheet) {
      // 탭이 없으면 신규 생성 및 25개 표준 헤더 세팅
      sheet = ss.insertSheet("INVOICE");
      var headers = [
        "No.", "등록일시", "INVOICE NUMBER", "BILL TO", "SHIP TO",
        "ORDER NUMBER", "ORDER DATE", "PURCHASE ORDER", "BILLING CURRENCY",
        "INVOICE DATE", "SHIP DATE", "SHIP VIA", "PAYMENT TERMS",
        "Line", "Qty", "Part No. / Description", "Rev", "Cust Part No.",
        "Cust Po Line", "Unit Price", "Amount", "Country of Origin",
        "TAX", "TOTAL", "Etc"
      ];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, 25)
        .setBackground("#1a73e8")
        .setFontColor("#ffffff")
        .setFontWeight("bold");
    }

    var rows = data.rows || [];
    var insertedCount = 0;

    if (rows && rows.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      var numCols = rows[0].length || 25;

      var range = sheet.getRange(startRow, 1, rows.length, numCols);
      range.setValues(rows);
      insertedCount = rows.length;

      // C열(INVOICE NUMBER = 3)과 P열(Part No = 16) 파란색 볼드체 서식 적용
      for (var r = 0; r < rows.length; r++) {
        var currRow = startRow + r;
        sheet.getRange(currRow, 3).setFontColor(COLOR_TARGET_CELL_FONT).setFontWeight("bold");
        sheet.getRange(currRow, 16).setFontColor(COLOR_TARGET_CELL_FONT).setFontWeight("bold");
      }
    }

    // 파일 완료함으로 안전하게 이동
    if (data.fileId && data.doneFolderId) {
      try {
        var file = DriveApp.getFileById(data.fileId);
        var doneFolder = DriveApp.getFolderById(data.doneFolderId);
        moveFileSafe(file, doneFolder);
      } catch (fErr) {
        Logger.log("인보이스 파일 이동 예외: " + fErr.toString());
      }
    }

    // 로그 시트 기록
    try {
      var logSheet = ss.getSheetByName("_SheetBot_Log");
      if (logSheet) {
        logSheet.appendRow([
          new Date(),
          data.fileName || "인보이스",
          data.fileId || "-",
          "INVOICE",
          insertedCount + "개 품목 적재",
          "INVOICE_TAB_APPLIED",
          "상업송장 상세 내역 적재 완료",
          FOLDER_NAME_DONE
        ]);
      }
    } catch (_) {}

    toastSafe(ss, "✅ 'INVOICE' 탭에 " + insertedCount + "개 품목 상세 내역이 등록되었습니다.", "SheetBot 인보이스 완료", 6);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      insertedCount: insertedCount,
      targetTab: "INVOICE",
      message: "Invoice tab rows applied successfully"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("handleInvoiceTabWebhook 예외: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleDocImportWebhook(data) {
  try {
    var ss = null;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (_) {}
    if (!ss && data.spreadsheetId) {
      ss = SpreadsheetApp.openById(data.spreadsheetId);
    }
    if (!ss) {
      ss = SpreadsheetApp.openById(DEFAULT_SPREADSHEET_ID);
    }

    var targetTabName = data.targetTab || "SPRING";
    var sheet = ss.getSheetByName(targetTabName);
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Sheet tab not found: " + targetTabName }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var appliedRow = Number(data.appliedRow);
    var colLetter = String(data.colLetter || "N").toUpperCase().trim();
    var colIdx = letterToColumn(colLetter);

    // 1. 【그 특정 셀만】 파란색 글씨(#1a73e8, 볼드)로 값 기입
    if (appliedRow > 0 && colIdx > 0 && data.value) {
      var cell = sheet.getRange(appliedRow, colIdx);
      cell.setValue(data.value);
      cell.setFontColor(COLOR_TARGET_CELL_FONT); // 오직 이 셀만 파란색 글씨!
      cell.setFontWeight("bold");

      // 2. 비어있는 필수 수식 자동 보완 (송금예정일 =N+60 등)
      fillMissingRowFormulas(sheet, targetTabName, appliedRow);
    }

    // 3. 파일 완료함으로 안전하게 이동
    if (data.fileId && data.doneFolderId) {
      try {
        var file = DriveApp.getFileById(data.fileId);
        var doneFolder = DriveApp.getFolderById(data.doneFolderId);
        moveFileSafe(file, doneFolder);
      } catch (fErr) {
        Logger.log("파일 이동 예외: " + fErr.toString());
      }
    }

    // 4. 로그 시트 기록
    try {
      var logSheet = ss.getSheetByName("_SheetBot_Log");
      if (logSheet) {
        logSheet.appendRow([
          new Date(),
          data.fileName || "문서",
          data.fileId || "-",
          targetTabName,
          appliedRow,
          "WEBHOOK_APPLIED",
          data.reasoning || "웹훅 콜백 자동 기입 완료",
          FOLDER_NAME_DONE
        ]);
      }
    } catch (_) {}

    toastSafe(ss, "✅ [" + targetTabName + "] " + appliedRow + "행에 파란색 글씨로 자동 기입되었습니다.", "SheetBot 웹훅 완료", 6);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      appliedRow: appliedRow,
      targetTab: targetTabName,
      message: "Webhook callback applied successfully"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("handleDocImportWebhook 예외: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 웹앱 GET 엔드포인트
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "status";
  if (action === "apply_doc" || action === "apply_doc_style" || action === "fallback_style") {
    var p = (e && e.parameter) || {};
    return handleDocImportWebhook({
      spreadsheetId: p.spreadsheetId || DEFAULT_SPREADSHEET_ID,
      targetTab: p.targetTab || "SPRING",
      appliedRow: Number(p.appliedRow),
      colLetter: p.colLetter || "N",
      value: p.value || "",
      fileName: p.fileName || "",
      fileId: p.fileId || "",
      doneFolderId: p.doneFolderId || "",
      reasoning: p.reasoning || "이중안전가드 전용 파란색 스타일링 자동 반영"
    });
  }
  if (action === "sync") {
    var result = runAiFolderDocSync();
    return ContentService.createTextOutput(JSON.stringify({ success: true, result: result }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (action === "deposit" && typeof handleBankDepositDoGet === 'function') {
    return handleBankDepositDoGet(e);
  }
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "SheetBot Two-Way Webhook Endpoint Ready",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 해당 행에 필수 계산 수식이 비어 있는 경우 안전하게 자동 보완
 */
function fillMissingRowFormulas(sheet, tabName, row) {
  try {
    if (tabName === "SPRING") {
      var cellJ = sheet.getRange(row, 10);
      if (!cellJ.getFormula() && String(cellJ.getValue()).trim() === "") {
        cellJ.setFormula("=F" + row + "*I" + row);
      }
      var cellW = sheet.getRange(row, 23);
      if (!cellW.getFormula() && String(cellW.getValue()).trim() === "") {
        cellW.setFormula("=U" + row + "*10");
      }
      var cellY = sheet.getRange(row, 25);
      if (!cellY.getFormula() && String(cellY.getValue()).trim() === "") {
        cellY.setFormula("=X" + row + "*J" + row);
      }
      var cellZ = sheet.getRange(row, 26);
      if (!cellZ.getFormula() && String(cellZ.getValue()).trim() === "") {
        cellZ.setFormula("=R" + row + "+U" + row + "+Y" + row);
      }
      var cellAA = sheet.getRange(row, 27);
      if (!cellAA.getFormula() && String(cellAA.getValue()).trim() === "") {
        cellAA.setFormula("=N" + row + "+60");
      }
    } else if (tabName === "BAND") {
      var cellF = sheet.getRange(row, 6);
      if (!cellF.getFormula() && String(cellF.getValue()).trim() === "") {
        cellF.setFormula("=C" + row + "*E" + row);
      }
      var cellR = sheet.getRange(row, 18);
      if (!cellR.getFormula() && String(cellR.getValue()).trim() === "") {
        cellR.setFormula("=P" + row + "*10");
      }
      var cellT = sheet.getRange(row, 20);
      if (!cellT.getFormula() && String(cellT.getValue()).trim() === "") {
        cellT.setFormula("=S" + row + "*F" + row);
      }
      var cellU = sheet.getRange(row, 21);
      if (!cellU.getFormula() && String(cellU.getValue()).trim() === "") {
        cellU.setFormula("=T" + row + "+P" + row + "+M" + row);
      }
      var cellV = sheet.getRange(row, 22);
      if (!cellV.getFormula() && String(cellV.getValue()).trim() === "") {
        cellV.setFormula("=J" + row + "+30");
      }
    }
  } catch (err) {
    Logger.log("수식 자동 보완 예외: " + err.toString());
  }
}

/**
 * 파일을 대상 폴더로 안전하게 이동
 */
function moveFileSafe(file, targetFolder) {
  try {
    if (file.moveTo) {
      file.moveTo(targetFolder);
    } else {
      targetFolder.addFile(file);
      var parents = file.getParents();
      while (parents.hasNext()) {
        parents.next().removeFile(file);
      }
    }
  } catch (err) {
    Logger.log("파일 이동 오류 (" + file.getName() + "): " + err.toString());
  }
}

/**
 * 열 문자(A, B, N 등)를 열 번호(1, 2, 14 등)로 변환
 */
function letterToColumn(letter) {
  var column = 0;
  var str = String(letter).toUpperCase().trim();
  for (var i = 0; i < str.length; i++) {
    column += (str.charCodeAt(i) - 64) * Math.pow(26, str.length - i - 1);
  }
  return column;
}

/**
 * 1시간 주기 자동 감시 트리거 설치
 */
function installHourlyTrigger() {
  removeTriggers();
  ScriptApp.newTrigger("runAiFolderDocSync")
    .timeBased()
    .everyHours(1)
    .create();
  var ui = getUiSafe();
  if (ui) {
    ui.alert("✅ 자동 감시 설정 완료", "이제 1시간마다 폴더에 새로 올라온 문서를 AI가 백그라운드 웹훅으로 감지하여 시트에 파란색 글씨로 기입하고 완료함으로 정리합니다.", ui.ButtonSet.OK);
  }
}

/**
 * 등록된 자동 감시 트리거 전체 삭제
 */
function removeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "runAiFolderDocSync") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  toastSafe(ss, "자동 감시 트리거가 해제되었습니다.", "알림", 3);
}

/**
 * 공식 SheetBot 공통 코파일럿 사이드바 열기
 */
function showAiCopilotSidebar() {
  try {
    var template = HtmlService.createTemplateFromFile('Sidebar');
    var email = 'chachogreat@gmail.com';
    try {
      email = Session.getActiveUser().getEmail() || email;
    } catch (e) {}

    template.currentUserEmail = email;
    template.initialBalance = 2495439;
    template.initialTier = 'PRO';
    var sUrl = "";
    try { sUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl(); } catch(e) {}
    template.currentSheetUrl = sUrl;

    var html = template.evaluate()
      .setTitle('🤖 SheetBot AI 코파일럿')
      .setWidth(360);

    SpreadsheetApp.getUi().showSidebar(html);
  } catch (err) {
    SpreadsheetApp.getUi().alert('코파일럿 사이드바 오류: ' + err.message);
  }
}

function getSpreadsheetUrl() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet().getUrl();
  } catch(e) {
    return "";
  }
}

function openSheetBotGuide() {
  var html = HtmlService.createHtmlOutput(
    '<script>window.open("https://sheetbot.cloud/use-cases", "_blank");google.script.host.close();</script>'
  ).setWidth(300).setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, '📖 SheetBot 활용 가이드 이동');
}

function uninstallSheetBot() {
  removeTriggers();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  toastSafe(ss, 'SheetBot 연동이 정상 해제되었습니다.', '알림', 3);
}

function uninstallScript() {
  uninstallSheetBot();
}