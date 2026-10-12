/**
 * AI Caller 응답 2중 언래핑 헬퍼가 완비된 표준 EgdeskClient.gs 생성기 (영구 재발 방지)
 */
export function generateStandardEgdeskClient(): string {
  return `/**
 * EGDesk tunnel client — UrlFetchApp wrapper for MCP tools/call.
 * Includes automatic 2-stage response unwrappers for AI Caller.
 */

function egdeskToolsCall(service, tool, args) {
  var config = getEgdeskConfig();
  if (!config.tunnelUrl) {
    throw new Error('EGDESK_CONFIG.tunnelUrl is empty.');
  }
  if (!config.apiKey) {
    throw new Error('EGDESK_CONFIG.apiKey is empty.');
  }
  var path = String(service || '');
  while (path.charAt(0) === '/' || path.charAt(0) === '\\') path = path.substring(1);
  while (path.charAt(path.length - 1) === '/' || path.charAt(path.length - 1) === '\\') path = path.substring(0, path.length - 1);
  var baseTunnel = String(config.tunnelUrl || '');
  while (baseTunnel.charAt(baseTunnel.length - 1) === '/' || baseTunnel.charAt(baseTunnel.length - 1) === '\\') baseTunnel = baseTunnel.substring(0, baseTunnel.length - 1);
  var url = baseTunnel + '/' + path + '/tools/call';
  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Api-Key': config.apiKey },
      payload: JSON.stringify({
        tool: tool,
        arguments: args || {}
      }),
      muteHttpExceptions: true
    });
  } catch (netErr) {
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast('⚠️ [EGDesk 터널 통신 오류] 이지데스크 MCP 서버를 확인해 주세요. (' + netErr.message + ')', '터널 연결 끊김', 10);
    } catch(eToast) {}
    var netErrObj = new Error('⚠️ [EGDesk 터널 통신 오류] 이지데스크 MCP 서버를 확인해 주세요: ' + netErr.message);
    netErrObj.isTunnelError = true;
    throw netErrObj;
  }

  var code = response.getResponseCode();
  var text = response.getContentText();
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast('⚠️ [EGDesk 터널 오류] 이지데스크 MCP 서버를 확인해 주세요. (HTTP ' + code + ')', '터널 연결 끊김', 10);
    } catch(eToast) {}
    var nonJsonErr = new Error('⚠️ [EGDesk 터널 오류] 이지데스크 MCP 서버를 확인해 주세요. (HTTP ' + code + ')');
    nonJsonErr.isTunnelError = true;
    nonJsonErr.statusCode = code;
    throw nonJsonErr;
  }

  if (code === 410) {
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast('⚠️ 삭제된 프로젝트입니다. 자동화 실행이 즉시 중단되었습니다.', 'SheetBot 서비스 차단', 10);
    } catch (eToast) {}
    throw new Error('PROJECT_REVOKED (HTTP 410): 삭제된 프로젝트이므로 서비스 실행이 즉시 중단되었습니다.');
  }

  if (code >= 400) {
    var message = parsed.error || parsed.message || text;
    if (code === 404 || code === 502 || code === 503 || code === 504) {
      try {
        SpreadsheetApp.getActiveSpreadsheet().toast('⚠️ [EGDesk 터널 오류] 이지데스크 MCP 서버를 확인해 주세요. (HTTP ' + code + ')', '터널 연결 끊김', 10);
      } catch(eToast) {}
      var tErr = new Error('⚠️ [EGDesk 터널 오류] 이지데스크 MCP 서버를 확인해 주세요. (HTTP ' + code + ': ' + message + ')');
      tErr.isTunnelError = true;
      tErr.statusCode = code;
      throw tErr;
    }
    throw new Error('EGDesk tunnel HTTP ' + code + ': ' + message);
  }
  return parsed;
}

function egdeskUserDataCall(tool, args) {
  return egdeskToolsCall('user-data', tool, args);
}

function egdeskUserDataListTables() {
  return egdeskUserDataCall('user_data_list_tables', {});
}

function egdeskUserDataSql(query) {
  return egdeskUserDataCall('user_data_sql_query', { query: query });
}

/**
 * egdesk-helpers.ts 와 1:1 호환되는 Apps Script 표준 queryTable 함수
 * 구조적 user_data_query 도구를 사용하여 DELETE, UPDATE 등 금지 키워드 차단(HTTP 500)을 완벽 방지
 */
function egdeskUserDataQuery(tableName, options) {
  options = options || {};
  return egdeskUserDataCall('user_data_query', {
    tableName: tableName,
    filters: options.filters || {},
    limit: options.limit || 100,
    offset: options.offset || 0,
    orderBy: options.orderBy || 'id',
    orderDirection: options.orderDirection || 'DESC'
  });
}

function queryTable(tableName, options) {
  return egdeskUserDataQuery(tableName, options);
}

/**
 * 🛠️ 이지데스크 AI Caller 표준 텍스트 언래핑 헬퍼 (영구 재발 방지)
 * 메타데이터 래퍼({ content: "실제응답", usage: ... })에서 순수 LLM 텍스트를 추출
 */
function egdeskExtractAiText(aiRes) {
  if (!aiRes) return "";
  if (typeof aiRes === "string") return aiRes;

  var textCandidate = "";
  if (aiRes.result && aiRes.result.content && aiRes.result.content[0] && aiRes.result.content[0].text) {
    textCandidate = aiRes.result.content[0].text;
  } else if (aiRes.content && Array.isArray(aiRes.content) && aiRes.content[0] && aiRes.content[0].text) {
    textCandidate = aiRes.content[0].text;
  } else if (typeof aiRes.result === "string") {
    textCandidate = aiRes.result;
  } else {
    textCandidate = JSON.stringify(aiRes);
  }

  try {
    var outerJson = JSON.parse(textCandidate);
    if (outerJson && typeof outerJson === "object" && typeof outerJson.content === "string") {
      return outerJson.content;
    }
  } catch (e) {}

  return textCandidate;
}

/**
 * 🛠️ 이지데스크 AI Caller 표준 JSON 언래핑 헬퍼 (영구 재발 방지)
 * 래퍼 객체 및 마크다운 코드블록을 안전하게 해제하여 순수 비즈니스 JSON 객체를 반환
 */
function egdeskExtractAiJson(aiRes) {
  if (!aiRes) return {};
  if (typeof aiRes === "object" && !Array.isArray(aiRes)) {
    // 이미 비즈니스 필드가 파싱되어 있는 경우
    if (aiRes.name !== undefined || aiRes.company !== undefined || aiRes.items !== undefined) {
      return aiRes;
    }
  }

  var rawText = egdeskExtractAiText(aiRes);
  if (!rawText) return {};

  var cleanText = rawText.replace(/\`\`\`json/gi, "").replace(/\`\`\`/g, "").trim();
  try {
    var parsed = JSON.parse(cleanText);
    if (parsed && typeof parsed === "object" && typeof parsed.content === "string") {
      var innerClean = parsed.content.replace(/\`\`\`json/gi, "").replace(/\`\`\`/g, "").trim();
      return JSON.parse(innerClean);
    }
    return parsed;
  } catch (eParse) {
    return {};
  }
}
`;
}
