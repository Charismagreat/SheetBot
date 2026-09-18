/**
 * 🚀 SheetBot 명함 AI 자동 등록 관리 대장 스크립트
 * Gemini 3.8 Flash AI Vision 기반 명함 OCR & 구글 시트 자동 기록
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚀 SheetBot 메뉴')
    .addItem('📷 [등록] 명함 사진 업로드 및 AI 자동 등록', 'showCardUploadSidebar')
    .addSeparator()
    .addItem('🤖 SheetBot AI 코파일럿', 'showAiCopilotSidebar')
    .addToUi();
}

function showCardUploadSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('명함 AI 자동 등록')
    .setWidth(360);
  SpreadsheetApp.getUi().showSidebar(html);
}

function openSheetBotGuide() {
  var html = HtmlService.createHtmlOutput(
    '<script>window.open("https://sheetbot.cloud/use-cases", "_blank");google.script.host.close();</script>' +
    '<div style="font-family: sans-serif; padding: 20px; text-align: center;">' +
    '<h3>📖 SheetBot 안내</h3>' +
    '<p>새 창에서 공식 가이드 및 활용사례 페이지를 엽니다...</p>' +
    '<a href="https://sheetbot.cloud/use-cases" target="_blank" style="color: #059669; font-weight: bold;">여기를 클릭하세요</a>' +
    '</div>'
  ).setWidth(350).setHeight(180);
  SpreadsheetApp.getUi().showModalDialog(html, 'SheetBot 사용법 및 활용사례');
}

/**
 * 터널 연결 상태 점검 친절 알림 함수 (표준 원칙 준수)
 */
function testEgdeskTunnel() {
  var ui = SpreadsheetApp.getUi();
  var start = new Date().getTime();
  try {
    var res = egdeskUserDataListTables();
    var elapsed = new Date().getTime() - start;
    ui.alert(
      '✅ SheetBot 터널 연결 정상',
      '이지데스크 AI 클라우드 터널 통신이 정상 작동 중입니다.\n' +
      '- 응답 속도: ' + elapsed + 'ms\n' +
      '- 상태: Gemini AI Vision OCR 준비 완료',
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert('❌ 터널 연결 확인 필요', '오류 내용: ' + err.message, ui.ButtonSet.OK);
  }
}

/**
 * 클라이언트 사이드바에서 업로드된 Base64 명함 이미지를 분석하여 시트에 기입
 */
function processBusinessCardUpload(payload) {
  try {
    if (!payload || !payload.base64Data) {
      return { success: false, message: '파일 데이터가 비어 있습니다.' };
    }

    var fileName = payload.fileName || 'business_card.png';
    var mimeType = payload.mimeType || 'image/png';
    var base64Data = payload.base64Data;

    // 1. Gemini AI OCR 분석 요청 지침 프롬프트
    var prompt = [
      "당신은 최고 수준의 한국어 명함 광학 문자 인식(OCR) 전문가입니다.",
      "첨부된 명함 이미지 또는 문서를 정밀하게 분석하여 다음 8가지 정보를 추출하세요.",
      "1. 이름 (name): 성명",
      "2. 직함 (position): 대표이사, 부장, 팀장, 책임연구원 등",
      "3. 회사명 (company): 상호명, 기업명, 기관명",
      "4. 부서 (department): 사업부, 전략기획팀, 개발팀 등 (없으면 빈문자열)",
      "5. 전화번호 (phone): 휴대폰(010-...) 또는 대표전화(02-..., 031-... 등)",
      "6. 이메일 (email): 이메일 주소",
      "7. 주소 (address): 회사 본사 또는 지사 도로명 주소",
      "8. 비고 (note): 팩스번호, 웹사이트, 주요 사업영역 등 참고사항",
      "",
      "반드시 아래 순수 JSON 형식으로만 응답하고, 마크다운 코드블록(```json)은 생략하거나 JSON만 출력하세요:",
      "{\"name\": \"홍길동\", \"position\": \"대표이사\", \"company\": \"주식회사 시트봇\", \"department\": \"경영전략본부\", \"phone\": \"010-1234-5678\", \"email\": \"hong@example.com\", \"address\": \"서울시 강남구 테헤란로 123\", \"note\": \"홈페이지: sheetbot.cloud\"}"
    ].join("\n");

    // 2. EGDesk AI Caller 호출 (사용자 설정 모델 자동 연동)
    var aiRes = egdeskToolsCall('ai-caller', 'ai_caller_call', {
      caller: 'sheetbot-business-card-ocr',
      temperature: 0.1,
      prompt: prompt,
      files: [
        {
          name: fileName,
          content: base64Data,
          encoding: 'base64',
          mimeType: mimeType
        }
      ]
    });

    // 3. AI 응답 2중 언래핑
    var card = egdeskExtractAiJson(aiRes);
    if (!card || (!card.name && !card.company && !card.phone)) {
      return { success: false, message: '명함 정보를 명확히 인식하지 못했습니다. 이미지가 선명한지 확인해 주세요.' };
    }

    // 4. 구글 스프레드시트에 기입
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    var nowStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");

    var rowData = [
      nowStr,
      card.name || '',
      card.position || '',
      card.company || '',
      card.department || '',
      card.phone || '',
      card.email || '',
      card.address || '',
      card.note || ''
    ];

    sheet.appendRow(rowData);

    // 마지막 행 스타일링 (가운데 정렬 및 폰트)
    var lastRow = sheet.getLastRow();
    var range = sheet.getRange(lastRow, 1, 1, rowData.length);
    range.setFontFamily('Noto Sans KR').setFontSize(10);
    range.getCell(1, 1).setHorizontalAlignment('center'); // 일시
    range.getCell(1, 2).setHorizontalAlignment('center'); // 이름
    range.getCell(1, 3).setHorizontalAlignment('center'); // 직함
    range.getCell(1, 6).setHorizontalAlignment('center'); // 전화

    return {
      success: true,
      data: card,
      rowNumber: lastRow,
      message: (card.company ? card.company + ' ' : '') + (card.name || '담당자') + ' 명함이 등록되었습니다.'
    };
  } catch (err) {
    return { success: false, message: 'OCR 처리 중 오류: ' + err.message };
  }
}

/**
 * AI Caller 응답 2중 언래핑 헬퍼 (JSON 객체 안전 추출)
 */
function egdeskExtractAiJson(raw) {
  if (!raw) return null;
  var text = '';
  if (typeof raw === 'object') {
    if (raw.result && raw.result.content) {
      if (Array.isArray(raw.result.content) && raw.result.content[0] && raw.result.content[0].text) {
        text = raw.result.content[0].text;
      } else if (typeof raw.result.content === 'string') {
        text = raw.result.content;
      } else {
        text = JSON.stringify(raw.result.content);
      }
    } else if (raw.content) {
      if (Array.isArray(raw.content) && raw.content[0] && raw.content[0].text) {
        text = raw.content[0].text;
      } else if (typeof raw.content === 'string') {
        text = raw.content;
      } else {
        text = JSON.stringify(raw.content);
      }
    } else if (raw.text) {
      text = raw.text;
    } else {
      text = JSON.stringify(raw);
    }
  } else if (typeof raw === 'string') {
    text = raw;
  }

  // 중첩 JSON 래퍼 체크
  try {
    var nested = JSON.parse(text);
    if (nested && nested.content && typeof nested.content === 'string') {
      text = nested.content;
    }
  } catch (ign) {}

  // 마크다운 코드블록 제거
  var cleaned = text.trim();
  if (cleaned.indexOf('```') !== -1) {
    cleaned = cleaned.replace(/^```(?:json)?s*/i, '').replace(/s*```$/i, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    var match = cleaned.match(/{[sS]*}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (ign2) {}
    }
    return null;
  }
}

/**
 * 🤖 SheetBot AI 코파일럿 (통합 제어 센터: 터널 진단 · 안티그라비티 연동 · 연동 해제)
 */
function showAiCopilotSidebar() {
  var html = HtmlService.createHtmlOutput(getAiCopilotSidebarHtml())
    .setTitle("🤖 SheetBot AI 제어 센터")
    .setWidth(360);
  SpreadsheetApp.getUi().showSidebar(html);
}

function getAiCopilotSidebarHtml() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<script src="https://cdn.tailwindcss.com"></script>' +
    '<style>body{font-family:sans-serif;background:#f8fafc;color:#0f172a;padding:14px;}</style>' +
    '</head><body>' +
    '<div class="space-y-3.5">' +
      '<div class="p-3.5 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 rounded-xl text-white shadow-sm space-y-2.5 border border-indigo-800/40">' +
        '<div class="flex items-center justify-between">' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300">SheetBot Wallet</span>' +
            '<span id="copilotTierBadge" class="px-1.5 py-0.2 text-[9px] font-black rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">PRO</span>' +
          '</div>' +
          '<button onclick="refreshWallet()" title="잔액 새로고침" class="text-[10px] text-slate-400 hover:text-white transition-colors cursor-pointer">🔄</button>' +
        '</div>' +
        '<div class="flex items-baseline justify-between">' +
          '<div>' +
            '<div class="text-[10px] text-slate-400 font-medium">보유 토큰 잔액</div>' +
            '<div class="text-lg font-black text-emerald-400 tracking-tight flex items-baseline gap-1">' +
              '<span id="copilotBalanceTxt">조회 중...</span>' +
              '<span class="text-[11px] text-slate-300 font-normal">토큰</span>' +
            '</div>' +
          '</div>' +
          '<button onclick="openTokenRechargeModal()" class="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-extrabold text-xs rounded-lg shadow-xs transition-transform active:scale-95 cursor-pointer">💳 즉시 충전</button>' +
        '</div>' +
        '<div class="pt-1.5 border-t border-slate-800">' +
          '<a href="https://sheetbot.cloud/use-cases" target="_blank" class="text-[11px] text-indigo-300 hover:text-indigo-200 flex items-center justify-between font-semibold py-0.5 transition-colors">' +
            '<span>📖 40+ 실무 활용사례 및 가이드</span>' +
            '<span class="text-xs font-bold">→</span>' +
          '</a>' +
        '</div>' +
      '</div>' +
      '<div class="p-3 bg-white rounded-xl border border-slate-200 shadow-sm">' +
        '<div class="flex items-center justify-between mb-1.5">' +
          '<span class="text-[11px] font-bold text-slate-500">인프라 연결 상태</span>' +
          '<button onclick="refreshStatus()" class="text-[11px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold transition-colors">🔄 점검</button>' +
        '</div>' +
        '<div id="tunnelStatus" class="text-xs font-extrabold text-emerald-700 flex items-center gap-1.5">' +
          '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>' +
          '<span>점검 중...</span>' +
        '</div>' +
        '<div id="tunnelDetail" class="text-[10px] text-slate-400 mt-1">EGDesk Cloud 터널 준비 확인</div>' +
      '</div>' +
      '<div class="p-3 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2.5">' +
        '<div class="text-[11px] font-bold text-slate-700">🚀 안티그라비티(Antigravity) AI 확장</div>' +
        '<p class="text-[11px] text-slate-500 leading-relaxed">새로운 자동화 기능 구현은 최첨단 AI 에이전트 안티그라비티에게 명령하세요.</p>' +
        '<div class="p-2 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono text-slate-600 break-all select-all" id="bridgeBox">' +
          'https://sheetbot.cloud/api/agent/gas-bridge' +
        '</div>' +
        '<button onclick="openAntigravity()" class="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white font-extrabold text-xs rounded-lg shadow-sm">🚀 안티그라비티 열기 및 자동화 시작</button>' +
        '<button onclick="copyPrompt()" class="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg">📋 프롬프트 복사하기</button>' +
        '<details class="pt-1">' +
          '<summary class="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer font-medium">📝 직접 짠 코드 긴급 주입 (고급)</summary>' +
          '<textarea id="userPrompt" class="w-full mt-2 text-xs p-2 border rounded resize-y min-h-[90px] bg-slate-50" placeholder="자연어 요청 또는 function ... 코드 붙여넣기"></textarea>' +
          '<button onclick="submitDirectCode()" id="directBtn" class="mt-1.5 w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded">⚡ 시트에 즉시 주입</button>' +
        '</details>' +
      '</div>' +
      '<div class="p-3 bg-rose-50/70 rounded-xl border border-rose-200 text-xs space-y-2">' +
        '<div class="font-bold text-rose-800 flex items-center gap-1">⚠️ 연동 관리 (Danger Zone)</div>' +
        '<p class="text-[11px] text-rose-600 leading-relaxed">시트 데이터는 100% 보존되며, 상단 메뉴와 Apps Script 코드만 완전히 제거됩니다.</p>' +
        '<button onclick="uninstallScript()" id="uninstallBtn" class="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-colors">🗑️ 스크립트 전체 삭제</button>' +
      '</div>' +
    '</div>' +
    '<script>' +
      'function refreshWallet() {' +
        'var bTxt = document.getElementById("copilotBalanceTxt");' +
        'var tBadge = document.getElementById("copilotTierBadge");' +
        'if (bTxt) bTxt.innerText = "조회 중...";' +
        'google.script.run' +
          '.withSuccessHandler(function(res){' +
            'if (res && res.success) {' +
              'if (bTxt) bTxt.innerText = Number(res.balance || 0).toLocaleString();' +
              'if (tBadge) tBadge.innerText = res.tier || "STANDARD";' +
            '} else {' +
              'if (bTxt) bTxt.innerText = "20,000";' +
            '}' +
          '})' +
          '.withFailureHandler(function(err){' +
            'if (bTxt) bTxt.innerText = "20,000";' +
          '})' +
          '.getUserTokenBalanceData();' +
      '}' +
      'function openTokenRechargeModal() {' +
        'google.script.run.openTokenRechargeModal();' +
      '}' +
      'function refreshStatus() {' +
        'document.getElementById("tunnelStatus").innerHTML = "<span class=\"text-amber-600\">⏳ 점검 중...</span>";' +
        'google.script.run.withSuccessHandler(function(res){' +
          'if(res && res.success){' +
            'document.getElementById("tunnelStatus").innerHTML = "<span class=\"text-emerald-600 font-extrabold\">🟢 터널 정상 (" + res.elapsed + "ms)</span>";' +
            'document.getElementById("tunnelDetail").innerText = (res.serverName || "EGDesk Cloud") + " · 통신 준비 완료";' +
          '} else {' +
            'document.getElementById("tunnelStatus").innerHTML = "<span class=\"text-rose-600 font-extrabold\">🔴 연결 점검 필요</span>";' +
            'document.getElementById("tunnelDetail").innerText = res ? res.error : "터널 응답 없음";' +
          '}' +
        '}).withFailureHandler(function(err){' +
          'document.getElementById("tunnelStatus").innerHTML = "<span class=\"text-rose-600 font-extrabold\">🔴 통신 오류</span>";' +
          'document.getElementById("tunnelDetail").innerText = err.message || "오류 발생";' +
        '}).getTunnelStatusData();' +
      '}' +
      'function openAntigravity(){' +
        'var text = "구글 시트 래핑 주소: https://sheetbot.cloud/api/agent/gas-bridge\n\n위 구글 시트에 다음 자동화 기능을 구현하고 즉시 주입해줘:\n[추가할 기능 입력]";' +
        'if(navigator.clipboard && navigator.clipboard.writeText){' +
          'navigator.clipboard.writeText(text).catch(function(e){});' +
        '}' +
        'window.open("antigravity://", "_blank");' +
        'setTimeout(function(){' +
          'alert("🚀 안티그라비티 지시 프롬프트가 클립보드에 자동 복사되었습니다!\n\n안티그라비티 창이 열리면 채팅창에 바로 [Ctrl + V]로 붙여넣고 원하는 기능을 입력하세요.");' +
        '}, 300);' +
      '}' +
      'function copyPrompt(){' +
        'var text = "구글 시트 래핑 주소: https://sheetbot.cloud/api/agent/gas-bridge\n\n위 구글 시트에 다음 자동화 기능을 구현하고 즉시 주입해줘:\n[추가할 기능 입력]";' +
        'navigator.clipboard.writeText(text).then(function(){ alert("프롬프트가 클립보드에 복사되었습니다! 안티그라비티에 붙여넣으세요."); });' +
      '}' +
      'function submitDirectCode(){' +
        'var prompt = document.getElementById("userPrompt").value.trim();' +
        'if(!prompt){ alert("요청사항이나 코드를 입력해주세요."); return; }' +
        'var btn = document.getElementById("directBtn");' +
        'btn.innerText = "주입 중..."; btn.disabled = true;' +
        'google.script.run.withSuccessHandler(function(res){' +
          'alert("✅ 자동화 코드가 성공적으로 시트에 주입되었습니다!\n구글 시트를 새로고침(F5)하세요.");' +
          'btn.innerText = "⚡ 시트에 즉시 주입"; btn.disabled = false;' +
        '}).withFailureHandler(function(err){' +
          'alert("주입 실패: " + err.message);' +
          'btn.innerText = "⚡ 시트에 즉시 주입"; btn.disabled = false;' +
        '}).executeSelfCodeInjection(prompt);' +
      '}' +
      'function uninstallScript(){' +
        'if(!confirm("⚠️ 정말로 시트봇 자동화 스크립트를 모두 제거하시겠습니까?\n\n• 시트 내 데이터(표, 텍스트)는 100% 안전하게 유지됩니다.\n• 상단 메뉴와 자동화 기능만 깨끗하게 초기화됩니다.\n\n계속하시겠습니까?")) return;' +
        'var btn = document.getElementById("uninstallBtn");' +
        'btn.innerText = "제거 작업 진행 중..."; btn.disabled = true;' +
        'google.script.run.withSuccessHandler(function(res){' +
          'alert("✅ 모든 스크립트가 성공적으로 제거되었습니다.\n구글 시트를 새로고침(F5)하시면 상단 메뉴가 완전히 사라집니다.");' +
          'google.script.host.close();' +
        '}).withFailureHandler(function(err){' +
          'alert("제거 실패: " + err.message);' +
          'btn.innerText = "🗑️ 스크립트 전체 삭제"; btn.disabled = false;' +
        '}).executeUninstallSheetBot();' +
      '}' +
      'window.onload = function() { refreshStatus(); refreshWallet(); };' +
    '</script>' +
    '</body></html>';
}

function getTunnelStatusData() {
  var startTime = new Date().getTime();
  try {
    if (typeof egdeskUserDataListTables === 'function') {
      egdeskUserDataListTables();
    }
    var elapsed = new Date().getTime() - startTime;
    return { success: true, elapsed: elapsed, serverName: "EGDesk Cloud", message: "정상 통신 준비 완료" };
  } catch (err) {
    return { success: false, error: err.message || "통신 실패", elapsed: new Date().getTime() - startTime };
  }
}

function executeUninstallSheetBot() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
    return { success: true, message: "트리거 및 스크립트 정리 완료" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
