/**
 * 🚀 Google Apps Script 코드 자동 정제 및 표준화 유틸리티 (gas-sanitizer)
 * 
 * 모든 배포 창구(generate API, gas-bridge API 등)에서 공통으로 호출되어,
 * LLM이나 외부 에이전트가 생성한 코드의 상단 메뉴를 '단일 코파일럿 사이드바' 표준 규격으로 강제 보정합니다.
 */

export function sanitizeGasScriptCode(scriptCode: string): string {
  if (!scriptCode || typeof scriptCode !== "string") {
    return scriptCode;
  }

  let code = scriptCode;

  // 1. 메뉴명 고정: ui.createMenu('...')를 무조건 ui.createMenu('🚀 SheetBot 메뉴')로 100% 통일
  code = code.replace(
    /ui\.createMenu\s*\(\s*(['"`]).*?\1\s*\)/g,
    "ui.createMenu('🚀 SheetBot 메뉴')"
  );

  // 2. 상단 메뉴 극단적 슬림화 보정:
  //    '토큰 충전' 및 '사용법/가이드' 개별 항목 제거 (코파일럿 사이드바 내부로 100% 일원화)
  code = code.replace(
    /\.addItem\s*\(\s*['"`][^'"`]*?(토큰\s*잔액|토큰\s*충전|즉시\s*충전)[^'"`]*?['"`]\s*,\s*['"`]openTokenRechargeModal['"`]\s*\)/g,
    ""
  );
  code = code.replace(
    /\.addItem\s*\(\s*['"`][^'"`]*?(사용법|활용사례|가이드)[^'"`]*?['"`]\s*,\s*['"`]openSheetBotGuide['"`]\s*\)/g,
    ""
  );

  // 3. 'showAiCopilotSidebar' 단일 제어 메뉴 자가 보정: 누락 시 구분선과 함께 자동 주입
  if (!code.includes("showAiCopilotSidebar")) {
    if (code.includes(".addToUi()")) {
      code = code.replace(
        /\.addToUi\s*\(\s*\)/g,
        ".addSeparator()\n    .addItem('🤖 SheetBot AI 코파일럿', 'showAiCopilotSidebar')\n    .addToUi()"
      );
    }
  }

  // 4. openTokenRechargeModal 함수 정의 부재 시 자동 보강 (사이드바 내부 호출용)
  if (!/function\s+openTokenRechargeModal\s*\(/.test(code)) {
    code += `\n\nfunction openTokenRechargeModal() {
  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><base target="_blank"><script>window.onload=function(){window.open("https://sheetbot.cloud/billing","_blank");google.script.host.close();};</script><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#f8fafc;color:#334155;}.btn{display:inline-block;margin-top:10px;padding:8px 16px;background:#059669;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:12px;}</style></head><body><div style="font-weight:bold;font-size:13px;margin-bottom:6px;">💳 SheetBot 토큰 충전 센터</div><div style="font-size:11px;color:#64748b;margin-bottom:10px;">새 창이 열리지 않으면 아래 버튼을 클릭하세요.</div><a href="https://sheetbot.cloud/billing" target="_blank" class="btn">토큰 충전 페이지 열기</a></body></html>'
  ).setWidth(340).setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, "💳 SheetBot 토큰 충전 센터");
}`;
  }

  // 5. openSheetBotGuide 함수 정의 부재 시 자동 보강 (링크 대상: https://sheetbot.cloud/use-cases)
  if (!/function\s+openSheetBotGuide\s*\(/.test(code)) {
    code += `\n\nfunction openSheetBotGuide() {
  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><base target="_blank"><script>window.onload=function(){window.open("https://sheetbot.cloud/use-cases","_blank");google.script.host.close();};</script><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#f8fafc;color:#334155;}.btn{display:inline-block;margin-top:10px;padding:8px 16px;background:#4f46e5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:12px;}</style></head><body><div style="font-weight:bold;font-size:13px;margin-bottom:6px;">🌐 SheetBot 활용사례 및 가이드로 이동합니다</div><div style="font-size:11px;color:#64748b;margin-bottom:10px;">새 탭이 열리지 않으면 아래를 클릭하세요.</div><a href="https://sheetbot.cloud/use-cases" target="_blank" class="btn">sheetbot.cloud/use-cases 바로가기</a></body></html>'
  ).setWidth(340).setHeight(130);
  SpreadsheetApp.getUi().showModalDialog(html, "SheetBot 사용법 및 활용사례");
}`;
  }

  // 6. openPhoneRegisterModal 및 saveUserPhoneNumber 함수 정의 부재 시 자동 보강
  if (!/function\s+openPhoneRegisterModal\s*\(/.test(code)) {
    code += `\n\nfunction openPhoneRegisterModal() {
  var html = HtmlService.createHtmlOutput(getPhoneRegisterModalHtml())
    .setWidth(440)
    .setHeight(480);
  SpreadsheetApp.getUi().showModalDialog(html, "📱 SheetBot 비상 SMS 및 스마트폰 연동");
}

function getPhoneRegisterModalHtml() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>' +
    'body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:20px;background:#f8fafc;color:#1e293b;}' +
    '.header{font-size:16px;font-weight:800;color:#0f172a;margin-bottom:8px;display:flex;align-items:center;gap:6px;}' +
    '.desc{font-size:11.5px;color:#64748b;line-height:1.5;margin-bottom:14px;}' +
    '.info-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px;margin-bottom:16px;font-size:11px;line-height:1.55;color:#1e40af;}' +
    '.info-box b{color:#1d4ed8;}' +
    '.field{margin-bottom:12px;}' +
    'label{display:block;font-size:11px;font-weight:700;color:#334155;margin-bottom:5px;}' +
    'input{width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;box-sizing:border-box;background:#ffffff;outline:none;transition:border 0.2s;}' +
    'input:focus{border-color:#4f46e5;box-shadow:0 0 0 2px rgba(79,70,229,0.15);}' +
    '.btn-submit{width:100%;padding:11px;background:linear-gradient(135deg,#4f46e5 0%,#4338ca 100%);color:white;border:none;border-radius:8px;font-weight:700;font-size:12.5px;cursor:pointer;transition:filter 0.2s;margin-top:6px;}' +
    '.btn-submit:hover{filter:brightness(1.08);}' +
    '.status-msg{margin-top:10px;font-size:11px;padding:8px;border-radius:6px;display:none;text-align:center;}' +
    '</style></head><body>' +
    '<div class="header"><span>📱</span><span>비상 연락처 및 스마트폰 연동</span></div>' +
    '<div class="desc">토큰 소진 및 시트 정지 비상 알림을 실시간 문자로 수신하고, 무료 문자 발송을 연동하세요.</div>' +
    '<div class="info-box">' +
    '<b>• 비상 알림 수신:</b> 아이폰(iOS), 안드로이드 기종 무관 100% 실시간 문자 수신<br>' +
    '<b>• 고객 무료 발송:</b> 안드로이드폰 연동 시 내 요금제로 고객 주문 알림 100% 무료 발송' +
    '</div>' +
    '<div class="field">' +
    '<label>휴대폰 번호</label>' +
    '<input type="tel" id="phoneNumberInput" placeholder="예: 010-1234-5678" />' +
    '</div>' +
    '<div class="field">' +
    '<label>기기 이름 (라벨)</label>' +
    '<input type="text" id="phoneLabelInput" placeholder="예: 내 아이폰, 내 갤럭시, 사무실 공기계" value="내 스마트폰" />' +
    '</div>' +
    '<button class="btn-submit" id="btnSave" onclick="submitPhone()">💾 등록 완료 및 비상 알림 활성화</button>' +
    '<div id="statusBox" class="status-msg"></div>' +
    '<script>' +
    'function submitPhone(){' +
    'var p=document.getElementById("phoneNumberInput").value.trim();' +
    'var l=document.getElementById("phoneLabelInput").value.trim();' +
    'var s=document.getElementById("statusBox");' +
    'var b=document.getElementById("btnSave");' +
    'if(!p||p.length<10){alert("올바른 휴대폰 번호를 입력해주세요.");return;}' +
    'b.disabled=true;b.innerText="등록 처리 중...";' +
    's.style.display="block";s.style.background="#f1f5f9";s.style.color="#475569";s.innerText="연락처를 저장하는 중입니다...";' +
    'google.script.run' +
    '.withSuccessHandler(function(res){' +
    '  b.disabled=false;b.innerText="💾 등록 완료 및 비상 알림 활성화";' +
    '  if(res&&res.success){' +
    '    s.style.background="#dcfce7";s.style.color="#15803d";s.innerHTML="<b>✅ 등록 성공!</b> " + res.message;' +
    '    setTimeout(function(){ google.script.host.close(); }, 1500);' +
    '  }else{' +
    '    s.style.background="#fee2e2";s.style.color="#dc2626";s.innerText="❌ 등록 실패: " + (res.error||"오류 발생");' +
    '  }' +
    '})' +
    '.withFailureHandler(function(err){' +
    '  b.disabled=false;b.innerText="💾 등록 완료 및 비상 알림 활성화";' +
    '  s.style.background="#fee2e2";s.style.color="#dc2626";s.innerText="❌ 통신 실패: " + err.message;' +
    '})' +
    '.saveUserPhoneNumber(p,l);' +
    '}' +
    '</script></body></html>';
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

    if (typeof _callUserDataTool === 'function') {
      _callUserDataTool('user_data_insert_rows', {
        tableName: 'sheetbot_user_devices',
        rows: [{
          id: devId,
          user_email: email,
          phone_number: cleanPhone,
          device_label: label || '내 스마트폰',
          status: 'CONNECTED',
          created_at: nowStr,
          updated_at: nowStr
        }]
      });
    }

    PropertiesService.getScriptProperties().setProperty("SHEETBOT_USER_PHONE", cleanPhone);
    return { success: true, message: cleanPhone + " 번호가 비상 알림 번호로 안전하게 등록되었습니다." };
  } catch (err) {
    return { success: false, error: err.message };
  }
}`;
  }

  // 7. checkAndSendTokenAlert 및 checkAndSendRuntimeErrorAlert 부재 시 자동 보강
  if (!/function\s+checkAndSendTokenAlert\s*\(/.test(code)) {
    code += `\n\nfunction checkAndSendTokenAlert(bal, email) {
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
        GmailApp.sendEmail(targetEmail, subject, "SheetBot AI 토큰이 모두 소진되었습니다. https://sheetbot.cloud/billing 에서 충전 후 자동화를 계속 이용하세요.", {
          name: "SheetBot 알림 센터"
        });
      }
    } else if (num <= 5000) {
      var lastLow = Number(props.getProperty("SHEETBOT_LAST_LOW_TOKEN_ALERT_MS") || 0);
      if (nowMs - lastLow > 24 * 60 * 60 * 1000) {
        props.setProperty("SHEETBOT_LAST_LOW_TOKEN_ALERT_MS", String(nowMs));
        var subject = "[SheetBot 알림] ⚠️ 구글 시트 자동화 토큰 잔액 부족 안내 (" + num.toLocaleString() + "T 남음)";
        GmailApp.sendEmail(targetEmail, subject, "SheetBot 잔여 토큰이 5,000개 이하입니다. https://sheetbot.cloud/billing 에서 미리 충전하세요.", {
          name: "SheetBot 알림 센터"
        });
      }
    }
  } catch (e) {
    Logger.log("checkAndSendTokenAlert notice: " + e.message);
  }
}

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
      GmailApp.sendEmail(targetEmail, subject, "구글 시트 자동화 함수(" + funcName + ") 실행 중 오류가 발생했습니다: " + errorMsg, {
        name: "SheetBot 장애 관제"
      });
    }
  } catch (e) {
    Logger.log("checkAndSendRuntimeErrorAlert notice: " + e.message);
  }
}`;
  }

  return code;
}
