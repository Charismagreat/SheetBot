/**
 * GAS fragment: TokenRecharge.gs (UI, alerts, phone/FDE modals).
 */
export const TOKEN_RECHARGE_GAS_UI = `// ==============================================================================
// 💳 SheetBot 인-시트(In-Sheet) 토큰 충전 및 실시간 입금 감지 모듈 (TokenRecharge.gs)
// EGDesk 공용 터널(user-data) 기반 My DB 직접 통신 (외부 도메인 DNS 의존성 완전 제거)
// 🔒 일반 사용자 어뷰징 방지 관리자(ADMIN) 전용 시뮬레이션 보안 잠금 장착
// ==============================================================================

var TOKEN_PACKAGES_CONFIG = {
  pkg_starter: { id: "pkg_starter", name: "Starter", tokens: 50000, price: 5000 },
  pkg_standard: { id: "pkg_standard", name: "Standard", tokens: 150000, price: 12000 },
  pkg_pro: { id: "pkg_pro", name: "Pro", tokens: 450000, price: 30000 }
};

var DEPOSIT_BANK_CONFIG = {
  bankName: "카카오뱅크",
  accountNumber: "3333-12-1695965",
  holder: "차호석"
};

function openTokenRechargeModal() {
  var htmlOutput;
  try {
    var res = UrlFetchApp.fetch("https://sheetbot.cloud/api/copilot/recharge-modal-template", {
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200 && res.getContentText().indexOf("<!DOCTYPE html>") !== -1) {
      htmlOutput = HtmlService.createHtmlOutput(res.getContentText());
    }
  } catch (e) {
    Logger.log("원격 충전 모달 로드 알림: " + e.message);
  }
  if (!htmlOutput) {
    htmlOutput = HtmlService.createHtmlOutput(getTokenRechargeModalHtml());
  }
  htmlOutput.setWidth(450).setHeight(670);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, "💳 SheetBot 토큰 잔액 확인 및 즉시 충전");
}

/**
 * 잔액 변동 시(사이드바 동기화 또는 AI 실행 직후) 구글 시트 상단 메뉴줄을 실시간 갱신하는 공통 함수
 */
function updateSheetBotMenuWithBalance(bal) {
  try {
    var balNum = Number(bal);
    if (isNaN(balNum)) return;
    try {
      PropertiesService.getScriptProperties().setProperty("SHEETBOT_CACHED_BALANCE", String(balNum));
    } catch (e) {}
    if (typeof onOpen === 'function') {
      onOpen();
    }
  } catch (err) {
    Logger.log("updateSheetBotMenuWithBalance error: " + err.message);
  }
}

/**
 * 토큰 잔액 상태 점검 및 비상 이메일 안내 발송 (24시간/12시간 쿨다운, 서버 부하 0%)
 */
function checkAndSendTokenAlert(bal, email) {
  try {
    if (bal === undefined || bal === null) return;
    var num = Number(bal);
    if (isNaN(num)) return;

    var targetEmail = email || Session.getActiveUser().getEmail();
    if (!targetEmail) return;

    var props = PropertiesService.getScriptProperties();
    var nowMs = new Date().getTime();

    if (num <= 0) {
      var lastDepleted = Number(props.getProperty("SHEETBOT_LAST_DEPLETED_ALERT_MS") || 0);
      if (nowMs - lastDepleted > 12 * 60 * 60 * 1000) {
        props.setProperty("SHEETBOT_LAST_DEPLETED_ALERT_MS", String(nowMs));
        var subject = "[SheetBot 긴급] 🚨 AI 자동화 일시 중지 안내 (토큰 완전 소진)";
        var htmlBody = '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;background:#f8fafc;color:#1e293b;border-radius:12px;max-width:540px;margin:0 auto;border:1px solid #fee2e2;">' +
          '<div style="font-size:22px;font-weight:900;color:#dc2626;margin-bottom:12px;">🚨 SheetBot AI 자동화 일시 중지</div>' +
          '<p style="font-size:13px;line-height:1.6;color:#475569;margin-bottom:16px;">' +
          '회원님의 시트봇 토큰 잔액이 <b>0 Token</b>으로 모두 소진되어, 구글 시트의 AI OCR 분석 및 자동화 호출이 일시 중지되었습니다.<br><br>' +
          '업무가 중단되지 않도록 토큰을 충전하시면 기존 모든 자동화가 즉시 재개됩니다.' +
          '</p>' +
          '<div style="background:#fef2f2;border:1px solid #fecaca;padding:12px 16px;border-radius:8px;margin-bottom:20px;font-size:12px;color:#991b1b;">' +
          '• 대상 계정: <b>' + targetEmail + '</b><br>' +
          '• 현재 잔여 토큰: <b style="color:#dc2626;">0 Token</b><br>' +
          '• 상태: AI 자동화 호출 대기 (충전 즉시 자동 재개)' +
          '</div>' +
          '<a href="https://sheetbot.cloud/billing" target="_blank" style="display:inline-block;padding:11px 24px;background:#dc2626;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:13px;box-shadow:0 2px 6px rgba(220,38,38,0.3);">' +
          '💳 토큰 즉시 충전하기 →' +
          '</a>' +
          '<div style="margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;">' +
          '본 메일은 구글 시트 자동화 안전 관리를 위해 발송되는 시스템 긴급 알림입니다. (12시간당 최대 1회 발송)' +
          '</div>' +
          '</div>';

        GmailApp.sendEmail(targetEmail, subject, "SheetBot AI 토큰이 소진되어 자동화가 일시 중지되었습니다. https://sheetbot.cloud/billing 에서 충전하세요.", {
          name: "SheetBot 알림 센터",
          htmlBody: htmlBody
        });
      }
    } else if (num <= 5000) {
      var lastLow = Number(props.getProperty("SHEETBOT_LAST_LOW_TOKEN_ALERT_MS") || 0);
      if (nowMs - lastLow > 24 * 60 * 60 * 1000) {
        props.setProperty("SHEETBOT_LAST_LOW_TOKEN_ALERT_MS", String(nowMs));
        var subject = "[SheetBot 알림] ⚠️ 구글 시트 자동화 토큰 잔액 부족 안내 (" + num.toLocaleString() + "T 남음)";
        var htmlBody = '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;background:#f8fafc;color:#1e293b;border-radius:12px;max-width:540px;margin:0 auto;border:1px solid #fef3c7;">' +
          '<div style="font-size:22px;font-weight:900;color:#d97706;margin-bottom:12px;">⚠️ SheetBot 잔여 토큰 부족 주의</div>' +
          '<p style="font-size:13px;line-height:1.6;color:#475569;margin-bottom:16px;">' +
          '회원님의 시트봇 잔여 토큰이 <b>' + num.toLocaleString() + ' Token</b>으로 5,000토큰 이하입니다.<br><br>' +
          '자동화 작업(OCR, AI 질의 등) 중단 없이 원활하게 업무를 지속할 수 있도록 미리 충전해 두시는 것을 권장합니다.' +
          '</p>' +
          '<div style="background:#fffbeb;border:1px solid #fde68a;padding:12px 16px;border-radius:8px;margin-bottom:20px;font-size:12px;color:#92400e;">' +
          '• 대상 계정: <b>' + targetEmail + '</b><br>' +
          '• 현재 잔액: <b style="color:#d97706;">' + num.toLocaleString() + ' Token</b><br>' +
          '• 권장 조치: 안정적인 자동화를 위한 선제적 토큰 충전' +
          '</div>' +
          '<a href="https://sheetbot.cloud/billing" target="_blank" style="display:inline-block;padding:11px 24px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:13px;box-shadow:0 2px 6px rgba(245,158,11,0.3);">' +
          '💳 토큰 충전하기 →' +
          '</a>' +
          '<div style="margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;">' +
          '본 메일은 구글 시트 자동화 안전 관리를 위해 발송되는 알림입니다. (24시간당 최대 1회 발송)' +
          '</div>' +
          '</div>';

        GmailApp.sendEmail(targetEmail, subject, "SheetBot 잔여 토큰이 " + num.toLocaleString() + "개로 부족합니다. https://sheetbot.cloud/billing 에서 충전하세요.", {
          name: "SheetBot 알림 센터",
          htmlBody: htmlBody
        });
      }
    }
  } catch (alertErr) {
    Logger.log("checkAndSendTokenAlert notice: " + alertErr.message);
  }
}

/**
 * 트리거 런타임 오류 감지 및 비상 이메일 안내 (연속 3회 이상 실패 시 발송, 2시간 쿨다운)
 */
function checkAndSendRuntimeErrorAlert(funcName, errorMsg) {
  try {
    var props = PropertiesService.getScriptProperties();
    var nowMs = new Date().getTime();
    var errCount = Number(props.getProperty("SHEETBOT_ERR_COUNT") || 0) + 1;
    props.setProperty("SHEETBOT_ERR_COUNT", String(errCount));

    var lastErrAlert = Number(props.getProperty("SHEETBOT_LAST_ERR_ALERT_MS") || 0);

    if (errCount >= 3 && (nowMs - lastErrAlert > 2 * 60 * 60 * 1000)) {
      props.setProperty("SHEETBOT_LAST_ERR_ALERT_MS", String(nowMs));
      props.setProperty("SHEETBOT_ERR_COUNT", "0");

      var targetEmail = Session.getActiveUser().getEmail() || "chachogreat@gmail.com";
      var subject = "[SheetBot 긴급] 🚨 구글 시트 자동화 실행 오류 알림 (" + funcName + ")";
      var htmlBody = '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;background:#f8fafc;color:#1e293b;border-radius:12px;max-width:540px;margin:0 auto;border:1px solid #fee2e2;">' +
        '<div style="font-size:22px;font-weight:900;color:#dc2626;margin-bottom:12px;">🚨 구글 시트 자동화 오류 감지</div>' +
        '<p style="font-size:13px;line-height:1.6;color:#475569;margin-bottom:16px;">' +
        '구글 시트의 자동화 트리거(<b>' + funcName + '</b>)가 연속 3회 이상 실패했습니다.<br><br>' +
        '시트 서식 변경, 외부 서비스 연결 지연, 또는 일시적 오류일 수 있으니 스프레드시트 상태를 확인해 주세요.' +
        '</p>' +
        '<div style="background:#fef2f2;border:1px solid #fecaca;padding:12px 16px;border-radius:8px;margin-bottom:20px;font-size:12px;color:#991b1b;word-break:break-all;">' +
        '• 발생 함수: <b>' + funcName + '</b><br>' +
        '• 오류 메시지: <code>' + String(errorMsg).substring(0, 300) + '</code><br>' +
        '• 발생 시각: ' + Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") +
        '</div>' +
        '<div style="font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;">' +
        '본 메일은 구글 시트 무중단 운영을 위한 시스템 비상 리포트입니다.' +
        '</div>' +
        '</div>';

      GmailApp.sendEmail(targetEmail, subject, "구글 시트 자동화 함수(" + funcName + ") 실행 중 오류가 발생했습니다: " + errorMsg, {
        name: "SheetBot 장애 관제",
        htmlBody: htmlBody
      });
    }
  } catch (e) {
    Logger.log("checkAndSendRuntimeErrorAlert notice: " + e.message);
  }
}

/**
 * SheetBot Agent2 스마트폰 연동 모달 창 호출
 */
function openPhoneRegisterModal() {
  var html = HtmlService.createHtmlOutput(getPhoneRegisterModalHtml())
    .setWidth(450)
    .setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, "📱 SheetBot Agent2 0초 QR 스마트폰 연동");
}

function getPhoneRegisterModalHtml() {
  var userEmail = "";
  try {
    userEmail = Session.getActiveUser().getEmail() || "";
  } catch (e) {}
  if (!userEmail) userEmail = "user@example.com";

  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>' +
    'body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:18px;background:#f8fafc;color:#1e293b;text-align:center;}' +
    '.header{font-size:16px;font-weight:900;color:#0f172a;margin-bottom:4px;display:flex;align-items:center;justify-content:center;gap:6px;}' +
    '.desc{font-size:11.5px;color:#64748b;line-height:1.45;margin-bottom:12px;}' +
    '.apk-box{background:#f1f5f9;border:1px solid #cbd5e1;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;text-align:left;}' +
    '.apk-title{font-size:11.5px;font-weight:800;color:#0f172a;}' +
    '.apk-desc{font-size:10.5px;color:#64748b;margin-top:2px;}' +
    '.apk-btn{background:#0f172a;color:#ffffff;padding:6px 12px;border-radius:7px;font-size:11px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:4px;}' +
    '.qr-box{background:#ecfdf5;border:1.5px solid #a7f3d0;border-radius:12px;padding:14px;margin-bottom:12px;}' +
    '.qr-title{font-size:12px;font-weight:800;color:#065f46;margin-bottom:8px;}' +
    '.qr-img-wrap{background:#ffffff;padding:8px;border-radius:10px;display:inline-block;box-shadow:0 1px 4px rgba(0,0,0,0.06);border:1px solid #d1fae5;}' +
    '.qr-img{width:160px;height:160px;display:block;margin:0 auto;}' +
    '.pin-badge{margin-top:8px;font-size:11.5px;font-weight:800;color:#047857;font-family:monospace;background:#ffffff;padding:4px 10px;border-radius:6px;display:inline-block;border:1px solid #a7f3d0;}' +
    '.qr-desc{font-size:10.5px;color:#065f46;margin-top:8px;line-height:1.4;}' +
    '.btn-dashboard{display:block;width:100%;padding:10px;background:#ffffff;color:#334155;border:1px solid #cbd5e1;border-radius:8px;font-size:11.5px;font-weight:700;text-decoration:none;box-sizing:border-box;transition:background 0.15s;}' +
    '.btn-dashboard:hover{background:#f1f5f9;}' +
    '</style></head><body>' +
    '<div class="header"><span>📱</span><span>SheetBot Agent2 기기 연동</span></div>' +
    '<div class="desc">스마트폰 요금제로 <strong>0원 고객 문자 발송</strong> & 수신 문자 시트 자동 기록</div>' +
    '<div class="apk-box">' +
    '  <div><div class="apk-title">1. 스마트폰에 앱 설치</div><div class="apk-desc">안드로이드 스마트폰에 Agent2 앱 설치</div></div>' +
    '  <a href="https://sheetbot.cloud/download/SheetBotAgent2.apk" target="_blank" class="apk-btn">📥 APK 받기</a>' +
    '</div>' +
    '<div class="qr-box">' +
    '  <div class="qr-title">2. 앱 실행 후 아래 QR 코드를 비추세요</div>' +
    '  <div class="qr-img-wrap">' +
    '    <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent('{"app":"SheetBotAgent2","userEmail":"' + userEmail + '"}') + '" class="qr-img" alt="QR" />' +
    '  </div>' +
    '  <div><span class="pin-badge">계정: ' + userEmail + '</span></div>' +
    '  <div class="qr-desc">스캔 즉시 스마트폰과 구글 시트가 1:1 결합되어 0원 문자 발송이 시작됩니다.</div>' +
    '</div>' +
    '<a href="https://sheetbot.cloud/dashboard/notifications" target="_blank" class="btn-dashboard">🌐 웹 대시보드 스마트 알림 센터 열기 ↗</a>' +
    '</body></html>';
}

function saveUserPhoneNumber(phone, label) {
  try {
    var email = Session.getActiveUser().getEmail() || "chachogreat@gmail.com";
    email = email.toLowerCase().trim();
    var cleanPhone = String(phone || "").replace(/[^0-9]/g, "");
    if (cleanPhone.length < 10) {
      return { success: false, error: "올바른 10~11자리 휴대폰 번호를 입력하세요." };
    }
    if (cleanPhone.length === 11) {
      cleanPhone = cleanPhone.substring(0, 3) + "-" + cleanPhone.substring(3, 7) + "-" + cleanPhone.substring(7, 11);
    } else if (cleanPhone.length === 10) {
      cleanPhone = cleanPhone.substring(0, 3) + "-" + cleanPhone.substring(3, 6) + "-" + cleanPhone.substring(6, 10);
    }

    var nowStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
    var devId = "dev_" + new Date().getTime() + "_" + Math.random().toString(36).substring(2, 6);

    _callUserDataTool('user_data_insert_rows', {
      tableName: 'sheetbot_user_devices',
      rows: [{
        id: devId,
        user_email: email,
        label: label || "내 스마트폰",
        phone_number: cleanPhone,
        pairing_mode: "google_account",
        status: "CONNECTED",
        last_connected_at: nowStr,
        created_at: nowStr
      }]
    });

    try {
      PropertiesService.getUserProperties().setProperty("SHEETBOT_REGISTERED_PHONE", cleanPhone);
    } catch (e) {}

    return {
      success: true,
      phone: cleanPhone,
      message: "비상 연락처(" + cleanPhone + ")가 성공적으로 등록되었습니다!"
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 👨‍💻 1:1 전문가(FDE) 맞춤 제작 의뢰 모달 표출
 */
function openFdeRequestModal() {
  var html = HtmlService.createHtmlOutput(getFdeRequestModalHtml())
    .setWidth(480)
    .setHeight(580);
  SpreadsheetApp.getUi().showModalDialog(html, "👨‍💻 SheetBot 1:1 전문가(FDE) 맞춤 제작 의뢰");
}

function getFdeRequestModalHtml() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetUrl = ss ? ss.getUrl() : "";
  var userEmail = Session.getActiveUser().getEmail() || "chachogreat@gmail.com";
  var savedPhone = "";
  try {
    savedPhone = PropertiesService.getScriptProperties().getProperty("SHEETBOT_USER_PHONE") || "";
  } catch (e) {}

  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>' +
    'body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:20px;background:#f8fafc;color:#1e293b;}' +
    '.header{font-size:16px;font-weight:800;color:#0f172a;margin-bottom:6px;display:flex;align-items:center;gap:6px;}' +
    '.desc{font-size:11.5px;color:#64748b;line-height:1.5;margin-bottom:14px;}' +
    '.info-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;margin-bottom:16px;font-size:11px;line-height:1.55;color:#15803d;}' +
    '.info-box b{color:#166534;}' +
    '.field{margin-bottom:12px;}' +
    'label{display:block;font-size:11px;font-weight:700;color:#334155;margin-bottom:5px;}' +
    'input,textarea,select{width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;box-sizing:border-box;background:#ffffff;outline:none;transition:border 0.2s;font-family:inherit;}' +
    'input:focus,textarea:focus,select:focus{border-color:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,0.15);}' +
    'textarea{resize:vertical;min-height:90px;}' +
    '.btn-submit{width:100%;padding:12px;background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);color:white;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;transition:filter 0.2s;margin-top:6px;box-shadow:0 2px 6px rgba(22,163,74,0.25);}' +
    '.btn-submit:hover{filter:brightness(1.08);}' +
    '.status-msg{margin-top:10px;font-size:11.5px;padding:10px;border-radius:6px;display:none;text-align:center;}' +
    '</style></head><body>' +
    '<div class="header"><span>👨‍💻</span><span>전문가(FDE) 1:1 맞춤 제작 의뢰</span></div>' +
    '<div class="desc">시트봇 전담 엔지니어에게 원하는 기능을 남겨주시면 귀사 시트에 100% 동작하도록 구축해 드립니다.</div>' +
    '<div class="info-box">' +
    '<b>• 원스톱 구축 지원:</b> 특수 수식, 카카오 알림톡/문자, ERP/DB 동기화, 영수증/명함 OCR 등<br>' +
    '<b>• 신속 지원:</b> 현재 구글 시트 정보가 안전하게 함께 전달되어 설명 부담이 대폭 줄어듭니다.' +
    '</div>' +
    '<div class="field">' +
    '<label>의뢰자 이메일</label>' +
    '<input type="email" id="reqEmail" value="' + userEmail + '" readonly style="background:#f1f5f9;color:#64748b;" />' +
    '</div>' +
    '<div class="field">' +
    '<label>연락처 (휴대폰 번호)</label>' +
    '<input type="tel" id="reqPhone" placeholder="예: 010-1234-5678" value="' + savedPhone + '" />' +
    '</div>' +
    '<div class="field">' +
    '<label>희망 추가 기능 및 요구사항 (자연어로 편하게 작성)</label>' +
    '<textarea id="reqContent" placeholder="예: D열에 입금완료가 되면 고객에게 카카오 알림톡을 자동으로 발송하고, 당일 주문 건을 19시에 관리자 메일로 요약 리포트해 주는 기능을 만들어주세요."></textarea>' +
    '</div>' +
    '<div class="field">' +
    '<label>희망 완료 일정</label>' +
    '<select id="reqUrgency">' +
    '<option value="NORMAL">보통 (3~5일 이내)</option>' +
    '<option value="URGENT">급함 (24시간 이내 빠른 진행)</option>' +
    '<option value="RELAXED">여유있음 (1주일 이상)</option>' +
    '</select>' +
    '</div>' +
    '<button class="btn-submit" id="btnSubmit" onclick="submitRequest()">🚀 전담 엔지니어에게 의뢰 접수하기</button>' +
    '<div id="statusBox" class="status-msg"></div>' +
    '<script>' +
    'function submitRequest(){' +
    '  var email = document.getElementById("reqEmail").value.trim();' +
    '  var phone = document.getElementById("reqPhone").value.trim();' +
    '  var content = document.getElementById("reqContent").value.trim();' +
    '  var urgency = document.getElementById("reqUrgency").value;' +
    '  var btn = document.getElementById("btnSubmit");' +
    '  var msg = document.getElementById("statusBox");' +
    '  if (!content) { alert("추가하고자 하시는 요구사항을 입력해 주세요."); return; }' +
    '  btn.disabled = true; btn.innerText = "의뢰 접수 중...";' +
    '  msg.style.display = "block"; msg.style.background = "#f1f5f9"; msg.style.color = "#475569"; msg.innerText = "전담 엔지니어에게 의뢰를 접수하는 중입니다...";' +
    '  google.script.run' +
    '    .withSuccessHandler(function(res){' +
    '      btn.disabled = false; btn.innerText = "🚀 전담 엔지니어에게 의뢰 접수하기";' +
    '      if(res && res.success){' +
    '        msg.style.background = "#dcfce7"; msg.style.color = "#15803d";' +
    '        msg.innerHTML = "<b>✅ 의뢰 접수 완료!</b> " + (res.message || "24시간 내에 답변 드립니다.");' +
    '        setTimeout(function(){ google.script.host.close(); }, 2000);' +
    '      } else {' +
    '        msg.style.background = "#fee2e2"; msg.style.color = "#dc2626";' +
    '        msg.innerText = "❌ 접수 실패: " + (res.error || "오류가 발생했습니다.");' +
    '      }' +
    '    })' +
    '    .withFailureHandler(function(err){' +
    '      btn.disabled = false; btn.innerText = "🚀 전담 엔지니어에게 의뢰 접수하기";' +
    '      msg.style.background = "#fee2e2"; msg.style.color = "#dc2626";' +
    '      msg.innerText = "❌ 통신 오류: " + err.message;' +
    '    })' +
    '    .submitFdeRequest({' +
    '      email: email,' +
    '      phone: phone,' +
    '      content: content,' +
    '      urgency: urgency,' +
    '      sheetUrl: "' + sheetUrl + '"' +
    '    });' +
    '}' +
    '</script></body></html>';
}

function submitFdeRequest(formObj) {
  try {
    var email = formObj.email || Session.getActiveUser().getEmail() || "chachogreat@gmail.com";
    var phone = formObj.phone || "";
    var content = formObj.content || "";
    var urgency = formObj.urgency || "NORMAL";
    var sheetUrl = formObj.sheetUrl || (SpreadsheetApp.getActiveSpreadsheet() ? SpreadsheetApp.getActiveSpreadsheet().getUrl() : "");
    var sheetTitle = SpreadsheetApp.getActiveSpreadsheet() ? SpreadsheetApp.getActiveSpreadsheet().getName() : "구글 시트";

    if (phone) {
      try { PropertiesService.getScriptProperties().setProperty("SHEETBOT_USER_PHONE", phone); } catch(e){}
    }

    var urgencyLabel = urgency === "URGENT" ? "급함 (24시간 이내)" : urgency === "RELAXED" ? "여유있음 (1주일 이상)" : "보통 (3~5일 이내)";
    var title = "[FDE 맞춤 구축 의뢰] " + sheetTitle + " - " + email;
    var fullContent = "[의뢰자 정보]\\n" +
      "- 이메일: " + email + "\\n" +
      "- 연락처: " + (phone || "미기재") + "\\n\\n" +
      "[구글 시트 정보]\\n" +
      "- 시트명: " + sheetTitle + "\\n" +
      "- 시트 URL: " + sheetUrl + "\\n\\n" +
      "[희망 일정]\\n" +
      "- " + urgencyLabel + "\\n\\n" +
      "[상세 요구사항]\\n" + content;

    // 1단계: 백엔드 API 직접 호출 시도
    var apiSuccess = false;
    try {
      var response = UrlFetchApp.fetch("https://sheetbot.cloud/api/inquiries", {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          category: "FDE_REQUEST",
          email: email,
          name: email.split("@")[0],
          title: title,
          content: fullContent
        }),
        muteHttpExceptions: true
      });
      var code = response.getResponseCode();
      if (code >= 200 && code < 300) {
        apiSuccess = true;
      }
    } catch(fetchErr) {
      Logger.log("UrlFetchApp inquiry warning: " + fetchErr.message);
    }

    // 2단계: 백엔드 API 실패 시 user_data_insert_rows로 직접 DB 적재 2중 폴백
    if (!apiSuccess && typeof _callUserDataTool === 'function') {
      var inqId = "inq_" + new Date().getTime() + "_" + Math.random().toString(36).substring(2, 6);
      var nowIso = new Date().toISOString();
      _callUserDataTool('user_data_insert_rows', {
        tableName: 'sheetbot_inquiries',
        rows: [{
          id: inqId,
          user_email: email.toLowerCase().trim(),
          user_name: email.split("@")[0],
          category: 'FDE_REQUEST',
          title: title,
          content: fullContent,
          status: 'PENDING',
          created_at: nowIso
        }]
      });
    }

    SpreadsheetApp.getActiveSpreadsheet().toast("전문가(FDE) 맞춤 제작 의뢰가 정상 접수되었습니다.", "의뢰 완료", 5);
    return {
      success: true,
      message: "의뢰가 성공적으로 접수되었습니다. 전담 엔지니어가 검토 후 빠르게 회신드립니다."
    };
  } catch(err) {
    return { success: false, error: err.message };
  }
}

var _LAST_USER_DATA_ERROR = null;
`;
