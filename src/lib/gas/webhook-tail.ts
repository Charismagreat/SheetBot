/**
 * GAS fragment: doGet / doPost / _parseBankDepositSmsGas for TokenRecharge.gs.
 */
export const TOKEN_RECHARGE_WEBHOOK_TAIL = `function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "SheetBot Bank Deposit Webhook WebApp is active!",
    cachedBalance: props.getProperty("SHEETBOT_CACHED_BALANCE") || "1147439",
    lastWebhookLog: props.getProperty("SHEETBOT_LAST_WEBHOOK_LOG") ? JSON.parse(props.getProperty("SHEETBOT_LAST_WEBHOOK_LOG")) : "수신된 내역 없음",
    timestamp: new Date().toISOString()
  }, null, 2)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var rawText = "";
    var bodyJson = null;

    if (e && e.postData && e.postData.contents) {
      try {
        bodyJson = JSON.parse(e.postData.contents);
      } catch (err) {
        rawText = e.postData.contents;
      }
    }

    try {
      if (rawText && rawText.indexOf('%') !== -1) {
        rawText = decodeURIComponent(rawText.replace(/\\+/g, ' '));
      }
    } catch(e) {}

    if (e && e.parameter) {
      for (var k in e.parameter) {
        rawText += " " + e.parameter[k];
      }
    }
    if (bodyJson) {
      for (var jk in bodyJson) {
        rawText += " " + bodyJson[jk];
      }
    }

    var parsed = _parseBankDepositSmsGas(rawText);
    var amountKrw = (parsed && parsed.amountKrw) || 0;
    var depositCode = (parsed && parsed.depositCode) || "";

    if (!depositCode) {
      var cMatch = rawText.match(/([A-Za-z][0-9]{3})/);
      if (cMatch) depositCode = cMatch[1];
    }
    if (!amountKrw) {
      var aMatch = rawText.match(/([1-9][0-9]{0,2}(?:,[0-9]{3})+|[1-9][0-9]{3,6})\\s*원?/);
      if (aMatch) amountKrw = parseInt(aMatch[1].replace(/,/g, ''), 10);
    }

    var codeUpper = String(depositCode || "AUTO").toUpperCase().trim();
    var nowStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");

    var tokensToAdd = 50000;
    if (amountKrw >= 28000) tokensToAdd = 450000;
    else if (amountKrw >= 11000) tokensToAdd = 150000;
    else if (amountKrw >= 4500) tokensToAdd = 50000;

    var props = PropertiesService.getScriptProperties();
    var curBal = Number(props.getProperty("SHEETBOT_CACHED_BALANCE")) || 1147439;
    var newBal = curBal + tokensToAdd;

    props.setProperty("SHEETBOT_CACHED_BALANCE", String(newBal));
    props.setProperty("SHEETBOT_CACHED_TIER", "PRO");
    props.setProperty("SHEETBOT_LAST_APPROVED_CODE", codeUpper);
    props.setProperty("SHEETBOT_LAST_APPROVED_TIME", nowStr);
    props.setProperty("SHEETBOT_DEPOSIT_" + codeUpper, JSON.stringify({
      status: "COMPLETED",
      amountKrw: amountKrw,
      tokens: tokensToAdd,
      time: nowStr
    }));

    props.setProperty("SHEETBOT_LAST_WEBHOOK_LOG", JSON.stringify({
      time: nowStr,
      code: codeUpper,
      amount: amountKrw,
      tokens: tokensToAdd,
      raw: rawText.substring(0, 250)
    }));

    try {
      _callUserDataTool('user_data_update_rows', {
        tableName: 'sheetbot_deposit_requests',
        filters: { deposit_code: codeUpper },
        updates: { status: 'COMPLETED', updated_at: nowStr }
      });
      _callUserDataTool('user_data_update_rows', {
        tableName: 'sheetbot_user_wallets',
        filters: { user_email: 'chachogreat@gmail.com' },
        updates: { balance_tokens: newBal, updated_at: nowStr }
      });
    } catch(e) {}

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "입금 알림 수신 및 토큰 자동 충전 완료!",
      depositCode: codeUpper,
      amountKrw: amountKrw,
      tokensCredited: tokensToAdd,
      currentBalance: newBal,
      timestamp: nowStr
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function _parseBankDepositSmsGas(text) {
  var clean = (text || "").trim();
  if (!clean) return null;

  var kakaoMatch = clean.match(/\\[?카카오뱅크\\]?[\\s\\S]*?입금\\s*([\\d,]+)원\\s*\\(([^)]+)\\)/i);
  if (kakaoMatch) {
    return {
      bankName: "카카오뱅크",
      amountKrw: parseInt(kakaoMatch[1].replace(/,/g, ""), 10),
      depositCode: kakaoMatch[2].trim()
    };
  }

  var kakaoMatch2 = clean.match(/\\[?카카오뱅크\\]?[\\s\\S]*?입금\\s*([\\d,]+)원\\s*([A-Za-z0-9가-힣]+)/i);
  if (kakaoMatch2) {
    return {
      bankName: "카카오뱅크",
      amountKrw: parseInt(kakaoMatch2[1].replace(/,/g, ""), 10),
      depositCode: kakaoMatch2[2].trim()
    };
  }

  var tossMatch = clean.match(/\\[?토스(?:뱅크)?\\]?[\\s\\S]*?([A-Za-z0-9가-힣]+)님이\\s*([\\d,]+)원/i);
  if (tossMatch) {
    return {
      bankName: "토스뱅크",
      amountKrw: parseInt(tossMatch[2].replace(/,/g, ""), 10),
      depositCode: tossMatch[1].trim()
    };
  }

  var genMatch = clean.match(/(?:입금\\s*([\\d,]+)원|([\\d,]+)원\\s*입금)[\\s\\S]*?([A-Za-z][0-9]{3})/i);
  if (genMatch) {
    var amt = parseInt((genMatch[1] || genMatch[2]).replace(/,/g, ""), 10);
    return {
      bankName: "은행",
      amountKrw: amt,
      depositCode: genMatch[3].trim()
    };
  }

  return null;
}
`;
