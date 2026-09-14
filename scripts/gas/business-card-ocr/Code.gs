/**
 * ============================================================================
 * SheetBot 명함 관리 및 AI OCR 자동 등록 시스템
 * ============================================================================
 * 계정 식별자: sk_sheetbot_a38b5427ffde96c64ab63ba35b17fc7a8754d7d0cbfad4c4
 * 버전: v1.0.0
 */

// 터널 및 Gateway 설정
var SHEETBOT_CONFIG = {
  // 이지데스크 공용 터널 URL
  TUNNEL_URL: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/ai-caller/tools/call",
  // 백업용 시트봇 게이트웨이 엔드포인트
  GATEWAY_URL: "https://sheetbot.cloud/api/gateway/mcp",
  // 기본 마스터 API 키 (ScriptProperties에 설정되어 있으면 우선 사용)
  DEFAULT_API_KEY: "a67ddc0f-7e2b-4997-9a0b-9667a74c89d0",
  // 회원 개인 API 키
  USER_API_KEY: "sk_sheetbot_a38b5427ffde96c64ab63ba35b17fc7a8754d7d0cbfad4c4"
};

/**
 * 시트 오픈 시 전용 메뉴 자동 생성
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 SheetBot 메뉴')
    .addItem('📇 명함 사진 OCR 자동 등록', 'openBusinessCardSidebar')
    .addSeparator()
    .addItem('🔄 터널 연결 상태 점검', 'testEgdeskTunnel')
    .addSeparator()
    .addItem('📖 SheetBot 사용법 및 활용사례', 'openSheetBotGuide')
    .addToUi();
}

/**
 * 명함 OCR 등록 사이드바 열기
 */
function openBusinessCardSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('📇 SheetBot 명함 OCR 자동 등록')
    .setWidth(420);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * 활성 API 키 조회 (ScriptProperties 격리 우선)
 */
function getActiveApiKey() {
  var propKey = PropertiesService.getScriptProperties().getProperty('EGDESK_API_KEY');
  if (propKey && propKey.trim().length > 0) {
    return propKey.trim();
  }
  return SHEETBOT_CONFIG.DEFAULT_API_KEY;
}

/**
 * AI Caller 응답 2중 언래핑 헬퍼 (JSON 객체 안전 추출)
 */
function unwrapAiCallerJson(rawResponseText) {
  if (!rawResponseText) return null;
  
  var parsed1 = null;
  try {
    parsed1 = JSON.parse(rawResponseText);
  } catch (e) {
    // 텍스트 자체가 직접 JSON 문자열일 수 있음
  }
  
  // 1차 래퍼 분석 (result.content[0].text 형태)
  var contentText = "";
  if (parsed1 && parsed1.result && parsed1.result.content && parsed1.result.content[0]) {
    contentText = parsed1.result.content[0].text || "";
  } else if (parsed1 && parsed1.content) {
    contentText = typeof parsed1.content === 'string' ? parsed1.content : JSON.stringify(parsed1.content);
  } else if (parsed1 && parsed1.text) {
    contentText = parsed1.text;
  } else {
    contentText = rawResponseText;
  }
  
  // 만약 contentText 내부가 또 한 번 JSON 문자열로 감싸져 있다면 (e.g. {"content": "..."})
  try {
    var nested = JSON.parse(contentText);
    if (nested && nested.content && typeof nested.content === 'string') {
      contentText = nested.content;
    }
  } catch (ign) {}
  
  // 마크다운 코드블록 제거 (```json ... ```)
  var cleaned = contentText.trim();
  if (cleaned.indexOf('```') !== -1) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  
  // 최종 JSON 파싱
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    var match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (err2) {}
    }
    throw new Error('AI 응답을 JSON으로 변환할 수 없습니다: ' + cleaned.substring(0, 100));
  }
}

/**
 * 명함 이미지/문서 Base64 데이터를 AI Caller로 전송하여 OCR 데이터 추출
 */
function analyzeBusinessCard(base64Data, fileName, mimeType) {
  try {
    if (!base64Data) {
      return { success: false, error: '파일 데이터가 비어 있습니다.' };
    }
    
    var apiKey = getActiveApiKey();
    var tunnelUrl = SHEETBOT_CONFIG.TUNNEL_URL;
    
    var promptText = [
      '당신은 대한민국 비즈니스 명함 인식 전문 AI OCR 엔진입니다.',
      '첨부된 명함 이미지(또는 PDF 문서)의 모든 텍스트와 시각 요소를 면밀히 판독하여 인물과 회사 정보를 정확히 추출하세요.',
      '반드시 오직 아래 스키마에 맞는 유효한 JSON 형식으로만 응답해야 합니다(마크다운 설명 제외):',
      '{',
      '  "name": "성명(이름)",',
      '  "position": "직책/직급 (예: 대표이사, 부장, 팀장 등)",',
      '  "company": "회사명/상호명 (주식회사 등 표기 포함)",',
      '  "department": "소속 부서/팀",',
      '  "mobile": "휴대전화 번호 (010-XXXX-XXXX 형식)",',
      '  "phone": "회사 대표번호 또는 직통 일반전화",',
      '  "email": "이메일 주소",',
      '  "address": "사업장 주소 (도로명/지번 포함)",',
      '  "website": "홈페이지 주소 또는 SNS 링크",',
      '  "notes": "슬로건, 전문분야, 계좌번호 등 추가 메모"',
      '}',
      '주의사항:',
      '1. 명함에 기재되지 않은 항목은 null이 아닌 빈 문자열("")로 반환하세요.',
      '2. 전화번호와 휴대전화 번호가 혼동되지 않도록 명확히 분류하세요 (010은 mobile, 02/031/1588 등은 phone).',
      '3. 한글과 영문이 함께 있는 경우 한국인 성명을 우선으로 기입하세요.'
    ].join('\n');
    
    var payload = {
      tool: 'ai_caller_call',
      arguments: {
        caller: 'sheetbot-businesscard-ocr',
        model: 'gemini-2.5-flash',
        temperature: 0.1,
        prompt: promptText,
        files: [
          {
            name: fileName || 'business_card.png',
            content: base64Data,
            encoding: 'base64',
            mimeType: mimeType || 'image/png'
          }
        ]
      }
    };
    
    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'X-Api-Key': apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    var startTime = new Date().getTime();
    var response = UrlFetchApp.fetch(tunnelUrl, options);
    var elapsedMs = new Date().getTime() - startTime;
    var statusCode = response.getResponseCode();
    var responseBody = response.getContentText();
    
    if (statusCode !== 200) {
      return {
        success: false,
        error: 'AI Caller 서버 통신 오류 (HTTP ' + statusCode + '): ' + responseBody.substring(0, 150)
      };
    }
    
    var extractedData = unwrapAiCallerJson(responseBody);
    return {
      success: true,
      data: extractedData,
      elapsedMs: elapsedMs
    };
  } catch (err) {
    Logger.log('analyzeBusinessCard 에러: ' + err.toString());
    return {
      success: false,
      error: 'OCR 분석 처리 중 예외 발생: ' + err.message
    };
  }
}

/**
 * 추출된 명함 데이터를 시트에 신규 행으로 추가
 */
function saveBusinessCardToSheet(cardData) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Sheet1') || ss.getActiveSheet();
    
    var now = new Date();
    var timestamp = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    
    var newRow = [
      timestamp,
      cardData.name || '',
      cardData.position || '',
      cardData.company || '',
      cardData.department || '',
      cardData.mobile || '',
      cardData.phone || '',
      cardData.email || '',
      cardData.address || '',
      cardData.website || '',
      cardData.notes || '',
      'OCR 자동등록'
    ];
    
    sheet.appendRow(newRow);
    var lastRow = sheet.getLastRow();
    
    var dataRange = sheet.getRange(lastRow, 1, 1, 12);
    dataRange.setFontFamily('Noto Sans KR');
    dataRange.setFontSize(10);
    
    sheet.getRange(lastRow, 1).setHorizontalAlignment('center');
    sheet.getRange(lastRow, 2).setHorizontalAlignment('center');
    sheet.getRange(lastRow, 3).setHorizontalAlignment('center');
    sheet.getRange(lastRow, 5).setHorizontalAlignment('center');
    sheet.getRange(lastRow, 6).setHorizontalAlignment('center');
    sheet.getRange(lastRow, 7).setHorizontalAlignment('center');
    sheet.getRange(lastRow, 12).setHorizontalAlignment('center');
    sheet.getRange(lastRow, 12).setBackground('#ecfdf5').setFontColor('#065f46').setFontWeight('bold');
    
    return {
      success: true,
      rowNumber: lastRow,
      message: (cardData.name || '명함') + ' 님의 정보가 ' + lastRow + '행에 성공적으로 기록되었습니다.'
    };
  } catch (err) {
    Logger.log('saveBusinessCardToSheet 에러: ' + err.toString());
    return {
      success: false,
      error: '시트 저장 실패: ' + err.message
    };
  }
}

/**
 * 터널 연결 상태 점검 (사용자 친화적 알림창)
 */
function testEgdeskTunnel() {
  var ui = SpreadsheetApp.getUi();
  var apiKey = getActiveApiKey();
  var tunnelUrl = SHEETBOT_CONFIG.TUNNEL_URL;
  
  var startTime = new Date().getTime();
  try {
    var response = UrlFetchApp.fetch(tunnelUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Api-Key': apiKey },
      payload: JSON.stringify({
        tool: 'ai_caller_call',
        arguments: {
          caller: 'sheetbot-tunnel-health',
          model: 'gemini-2.5-flash',
          prompt: 'ping test. Reply with: PONG'
        }
      }),
      muteHttpExceptions: true
    });
    
    var elapsed = new Date().getTime() - startTime;
    var status = response.getResponseCode();
    
    if (status === 200) {
      ui.alert(
        '🚀 SheetBot 터널 연결 정상',
        '✅ EGDesk 클라우드 터널과 AI 엔진이 정상적으로 연결되어 있습니다!\n\n' +
        '• 연결 상태: 정상 작동 중 (HTTP 200)\n' +
        '• 응답 속도: ' + elapsed + ' ms\n' +
        '• 서비스: AI OCR & 데이터 연동 활성화 완료',
        ui.ButtonSet.OK
      );
    } else {
      ui.alert(
        '⚠️ 터널 응답 오류',
        '서버 응답 상태 코드: HTTP ' + status + '\n' +
        '응답 내용: ' + response.getContentText().substring(0, 150),
        ui.ButtonSet.OK
      );
    }
  } catch (e) {
    ui.alert(
      '❌ 터널 연결 실패',
      '터널 연결 중 오류가 발생했습니다:\n' + e.message + '\n\n' +
      '네트워크 상태 및 SheetBot 터널 가동 여부를 확인해 주세요.',
      ui.ButtonSet.OK
    );
  }
}

/**
 * 사용법 및 활용사례 모달 열기
 */
function openSheetBotGuide() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #1e293b;">' +
    '  <h2 style="color: #4f46e5; margin-top: 0;">📖 SheetBot 명함 자동화 가이드</h2>' +
    '  <p>스마트폰 카메라로 촬영한 명함 사진을 업로드하면 AI가 텍스트를 자동 판독하여 시트에 깔끔하게 정리해 줍니다.</p>' +
    '  <h4 style="margin-bottom: 8px;">💡 주요 기능:</h4>' +
    '  <ul style="padding-left: 20px; margin-top: 0;">' +
    '    <li><strong>드래그 & 드롭</strong>: 명함 이미지(JPG, PNG) 및 PDF 간편 업로드</li>' +
    '    <li><strong>정밀 AI OCR</strong>: 이름, 직함, 회사명, 휴대전화, 이메일 자동 분류</li>' +
    '    <li><strong>사전 검토 및 수정</strong>: 시트에 넣기 전 직접 확인하고 수정 가능</li>' +
    '    <li><strong>원클릭 연속 등록</strong>: 등록 완료 즉시 다음 명함을 바로 이어서 등록</li>' +
    '  </ul>' +
    '  <div style="margin-top: 24px; text-align: center;">' +
    '    <a href="https://sheetbot.cloud" target="_blank" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">' +
    '      🚀 SheetBot 공식 웹사이트 방문' +
    '    </a>' +
    '  </div>' +
    '</div>'
  ).setWidth(460).setHeight(380);
  
  SpreadsheetApp.getUi().showModalDialog(html, 'SheetBot 안내 센터');
}
