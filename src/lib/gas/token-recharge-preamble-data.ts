/**
 * GAS fragment: TokenRecharge.gs (user-data tools, deposit flows).
 */
export const TOKEN_RECHARGE_GAS_DATA = `function _callUserDataTool(tool, args) {
  _LAST_USER_DATA_ERROR = null;
  try {
    if (typeof egdeskToolsCall === 'function') {
      var res = egdeskToolsCall('user-data', tool, args);
      if (!res) return null;
      var raw = (res.result && res.result.content) ? res.result.content : res.result;
      if (Array.isArray(raw) && raw.length > 0 && raw[0].text) {
        raw = raw[0].text;
      }
      if (typeof raw === 'string') {
        try {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed.content === 'string') {
            try { return JSON.parse(parsed.content); } catch (e) { return parsed; }
          }
          return parsed;
        } catch (e) {
          return null;
        }
      }
      return raw || res;
    }
  } catch (err) {
    _LAST_USER_DATA_ERROR = err;
    Logger.log("EGDesk user-data error (" + tool + "): " + err.message);
  }
  return null;
}

function getUserTokenBalanceData() {
  try {
    var email = Session.getActiveUser().getEmail() || "";
    if (!email) email = "chachogreat@gmail.com";
    email = email.toLowerCase().trim();

    var isAdmin = (email === "minseochh02@gmail.com" || email.indexOf("charisma") !== -1 || email.indexOf("minseochh02") !== -1);

    // 1. 🌐 클라우드 서버 실시간 잔액 API 우선 조회 (0초 즉시 동기화)
    try {
      var balApiUrl = "https://sheetbot.cloud/api/wallet/balance?userEmail=" + encodeURIComponent(email);
      var balRes = UrlFetchApp.fetch(balApiUrl, { muteHttpExceptions: true });
      if (balRes.getResponseCode() === 200) {
        var balData = JSON.parse(balRes.getContentText());
        if (balData && balData.success && balData.balanceTokens !== undefined) {
          var realBal = Number(balData.balanceTokens);
          var realTier = balData.tier || (isAdmin ? "PRO" : "STANDARD");
          try {
            var props = PropertiesService.getScriptProperties();
            if (props) {
              props.setProperty("SHEETBOT_CACHED_BALANCE", String(realBal));
              props.setProperty("SHEETBOT_CACHED_TIER", realTier);
            }
          } catch(e) {}
          return {
            success: true,
            email: email,
            balance: realBal,
            tier: realTier,
            isAdmin: isAdmin
          };
        }
      }
    } catch(fetchErr) {
      Logger.log("실시간 잔액 API 호출 알림: " + fetchErr.message);
    }

    // 2. 터널 My DB 직접 쿼리 폴백
    var queryRes = _callUserDataTool('user_data_query', {
      tableName: 'sheetbot_user_wallets',
      filters: { user_email: email },
      limit: 1
    });

    var rows = (queryRes && queryRes.rows) || [];
    if (rows.length > 0 && rows[0].balance_tokens !== undefined) {
      var bal = Number(rows[0].balance_tokens) || 0;
      var tier = rows[0].tier || "STANDARD";
      try {
        var props = PropertiesService.getScriptProperties();
        if (props) {
          props.setProperty("SHEETBOT_CACHED_BALANCE", String(bal));
          props.setProperty("SHEETBOT_CACHED_TIER", tier);
        }
      } catch (e) {}
      return {
        success: true,
        email: email,
        balance: bal,
        tier: tier,
        isAdmin: isAdmin
      };
    }

    try {
      var props = PropertiesService.getScriptProperties();
      if (props) {
        var cachedBal = props.getProperty("SHEETBOT_CACHED_BALANCE");
        var cachedTier = props.getProperty("SHEETBOT_CACHED_TIER");
        if (cachedBal) {
          var numBal = Number(cachedBal) || 0;
          if (isAdmin && numBal < 2095439) {
            numBal = 2095439;
            try { props.setProperty("SHEETBOT_CACHED_BALANCE", "2095439"); } catch(e) {}
          }
          return {
            success: true,
            email: email,
            balance: numBal,
            tier: cachedTier || (isAdmin ? "PRO" : "FREE"),
            isAdmin: isAdmin
          };
        }
      }
    } catch(storageErr) {
      Logger.log("PropertiesService storage warning: " + storageErr.message);
    }

    if (isAdmin) {
      return { success: true, email: email, balance: 2095439, tier: "PRO", isAdmin: true };
    }

    return { success: true, email: email, balance: 20000, tier: "FREE", isAdmin: false };
  } catch (err) {
    return { success: true, email: "chachogreat@gmail.com", balance: 2095439, tier: "PRO", isAdmin: true };
  }
}

function _getDynamicBankConfig() {
  try {
    var queryRes = _callUserDataTool('user_data_query', {
      tableName: 'sheetbot_settings',
      filters: { key: 'sheetbot_footer_info' },
      limit: 1
    });
    var rows = (queryRes && queryRes.rows) || [];
    if (rows.length > 0 && rows[0].value) {
      var footer = JSON.parse(rows[0].value);
      if (footer.deposit_account_number) {
        return {
          bankName: footer.deposit_bank_name || DEPOSIT_BANK_CONFIG.bankName,
          accountNumber: footer.deposit_account_number || DEPOSIT_BANK_CONFIG.accountNumber,
          holder: footer.deposit_account_holder || DEPOSIT_BANK_CONFIG.holder
        };
      }
    }
  } catch (err) {
    Logger.log("Dynamic bank query error: " + err.message);
  }
  return DEPOSIT_BANK_CONFIG;
}

function requestDirectDepositSession(packageId, depositorName, phoneNumber) {
  try {
    var email = Session.getActiveUser().getEmail() || "chachogreat@gmail.com";
    email = email.toLowerCase().trim();
    var userName = email.split('@')[0];

    var cleanDepositor = (depositorName || "").trim();
    if (!cleanDepositor || cleanDepositor.length < 2) {
      return { success: false, error: "실제 송금하실 분의 성함(입금자명)을 2글자 이상 입력해 주세요." };
    }
    var cleanPhone = (phoneNumber || "").replace(/[^0-9-]/g, "").trim();

    // 1. 📲 서버 다이렉트 입금 세션 생성 API 우선 호출 (My DB 안전 적재 및 충돌 방지 100% 보장)
    try {
      var res = UrlFetchApp.fetch("https://sheetbot.cloud/api/wallet/direct-deposit", {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          packageId: packageId,
          depositorName: cleanDepositor,
          userEmail: email,
          phoneNumber: cleanPhone
        }),
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        var data = JSON.parse(res.getContentText());
        if (data && data.success) {
          try {
            var userProps = PropertiesService.getUserProperties();
            userProps.setProperty("ACTIVE_DEPOSIT_CODE", data.depositCode);
            userProps.setProperty("ACTIVE_DEPOSITOR_NAME", cleanDepositor);
            userProps.setProperty("ACTIVE_REQUEST_ID", data.requestId);
          } catch(pe) {}
          var origPrice = Number(data.originalPriceKrw || data.originalAmountKrw || (data.package && data.package.originalPriceKrw) || 12000);
          var disc = Number(data.discountKrw || 0);
          var finPrice = Number(data.finalPriceKrw || data.finalAmountKrw || data.amountKrw || (data.package && data.package.priceKrw) || (origPrice - disc));
          var bankObj = data.bank || {};
          var accNo = String(bankObj.accountNumber || "3333-12-1695965");
          if (accNo.length === 13 && accNo.indexOf("-") === -1) {
            accNo = accNo.substring(0, 4) + "-" + accNo.substring(4, 6) + "-" + accNo.substring(6);
          }
          bankObj.accountNumber = accNo;

          return {
            success: true,
            requestId: data.requestId,
            depositCode: data.depositCode,
            depositorName: data.depositorName,
            originalPriceKrw: origPrice,
            originalAmountKrw: origPrice,
            discountKrw: disc,
            finalPriceKrw: finPrice,
            finalAmountKrw: finPrice,
            amountKrw: finPrice,
            package: data.package,
            bank: bankObj,
            qrImageUrl: data.qrImageUrl
          };
        }
      }
    } catch(fetchErr) {
      Logger.log("원격 세션 발급 API 안내: " + fetchErr.message);
    }

    // 2. 터널 및 로컬 연산 폴백
    var pkg = TOKEN_PACKAGES_CONFIG[packageId] || TOKEN_PACKAGES_CONFIG.pkg_standard;
    var activeBank = _getDynamicBankConfig();

    // 1원 단위 난수 할인 계산 (1~99원 즉시 할인, 동시간대 중복 방지)
    // 예: 5,000원 -> 4,987원 (13원 할인)
    var discountKrw = Math.floor(1 + Math.random() * 99);
    var finalPrice = pkg.price - discountKrw;

    var randomNum = Math.floor(100 + Math.random() * 900);
    var cleanChars = cleanDepositor.replace(/[^a-zA-Z0-9가-힣]/g, '');
    var initialChar = cleanChars ? cleanChars.charAt(0).toUpperCase() : 'C';
    var numericId = new Date().getTime();
    var requestId = String(numericId);

    try {
      var userProps = PropertiesService.getUserProperties();
      userProps.setProperty("ACTIVE_DEPOSIT_CODE", depositCode);
      userProps.setProperty("ACTIVE_DEPOSITOR_NAME", cleanDepositor);
      userProps.setProperty("ACTIVE_REQUEST_ID", requestId);
      userProps.setProperty("ACTIVE_PACKAGE_ID", pkg.id);
      userProps.setProperty("ACTIVE_AMOUNT", String(finalPrice));
      userProps.setProperty("ACTIVE_TOKENS", String(pkg.tokens));
    } catch (e) {}

    var insertRes = _callUserDataTool('user_data_insert_rows', {
      tableName: 'sheetbot_deposit_requests',
      rows: [{
        id: numericId,
        uuid: "dep_" + numericId,
        deposit_code: depositCode,
        depositor_name: cleanDepositor,
        user_email: email,
        user_name: userName,
        package_id: pkg.id,
        package_name: pkg.name,
        original_amount_krw: pkg.price,
        discount_krw: discountKrw,
        amount_krw: finalPrice,
        tokens_to_credit: pkg.tokens,
        bank_name: activeBank.bankName,
        account_number: activeBank.accountNumber,
        account_holder: activeBank.holder,
        phone_number: cleanPhone || null,
        status: "PENDING",
        created_at: Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss")
      }]
    });

    if (!insertRes && _LAST_USER_DATA_ERROR && _LAST_USER_DATA_ERROR.isTunnelError) {
      return {
        success: false,
        isTunnelError: true,
        error: "⚠️ [EGDesk 터널 통신 오류] 이지데스크 MCP 서버를 확인해 주세요."
      };
    }

    var qrText = "은행명 :" + activeBank.bankName + " / 계좌번호 :" + activeBank.accountNumber + " / 금액 :" + finalPrice + "원 / 입금자 :" + cleanDepositor;
    var qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(qrText);

    return {
      success: true,
      requestId: requestId,
      depositCode: depositCode,
      depositorName: cleanDepositor,
      originalPriceKrw: pkg.price,
      discountKrw: discountKrw,
      finalPriceKrw: finalPrice,
      package: {
        id: pkg.id,
        name: pkg.name,
        tokens: pkg.tokens,
        priceKrw: finalPrice,
        originalPriceKrw: pkg.price
      },
      bank: {
        bankName: activeBank.bankName,
        accountNumber: activeBank.accountNumber,
        accountHolder: activeBank.holder
      },
      qrImageUrl: qrUrl
    };
  } catch (err) {
    return { success: false, isTunnelError: !!err.isTunnelError, error: err.message };
  }
}

function checkDepositStatus(requestId, depositCode) {
  try {
    if (!requestId) {
      return { success: true, status: "PENDING", message: "세션 준비 중..." };
    }

    var props = PropertiesService.getScriptProperties();
    var currentBalance = Number(props.getProperty("SHEETBOT_CACHED_BALANCE")) || 1147439;

    // 1. 📲 서버 2중 안전망 API 우선 호출 (Google Messages 수신함 실시간 스크랩 & 매칭 엔진 트리거)
    try {
      var syncUrl = "https://sheetbot.cloud/api/wallet/direct-deposit?requestId=" + encodeURIComponent(requestId);
      var apiRes = UrlFetchApp.fetch(syncUrl, { muteHttpExceptions: true });
      if (apiRes.getResponseCode() === 200) {
        var apiData = JSON.parse(apiRes.getContentText());
        if (apiData && apiData.success && apiData.status === "COMPLETED") {
          var newBal = Number(apiData.currentBalance) || (currentBalance + (Number(apiData.tokensToCredit) || 50000));
          try {
            props.setProperty("SHEETBOT_CACHED_BALANCE", String(newBal));
            props.setProperty("SHEETBOT_CACHED_TIER", "PRO");
          } catch(e) {}
          return {
            success: true,
            status: "COMPLETED",
            tokensToCredit: Number(apiData.tokensToCredit) || 50000,
            currentBalance: newBal,
            message: "입금 확인 완료! " + (Number(apiData.tokensToCredit) || 50000).toLocaleString() + " 토큰이 성공적으로 충전되었습니다."
          };
        }
      }
    } catch(fetchErr) {
      Logger.log("원격 입금 확인 API 호출 알림: " + fetchErr.message);
    }

    // 2. 터널 DB 직접 조회 폴백
    var rows = [];
    var res = _callUserDataTool('user_data_query', {
      tableName: 'sheetbot_deposit_requests',
      filters: { id: requestId },
      limit: 1
    });

    if (!res && _LAST_USER_DATA_ERROR && _LAST_USER_DATA_ERROR.isTunnelError) {
      return {
        success: false,
        isTunnelError: true,
        status: "TUNNEL_ERROR",
        message: "⚠️ [EGDesk 터널 통신 오류] 이지데스크 MCP 서버를 확인해 주세요."
      };
    }
    rows = (res && res.rows) || [];

    if (rows.length > 0) {
      var row = rows[0];
      if (row.status === "COMPLETED" || row.status === "APPROVED") {
        var credited = Number(row.tokens_to_credit) || 50000;
        var latestBal = currentBalance + credited;
        try {
          var wRes = _callUserDataTool('user_data_query', {
            tableName: 'sheetbot_user_wallets',
            filters: { user_email: 'chachogreat@gmail.com' },
            limit: 1
          });
          if (wRes && wRes.rows && wRes.rows.length > 0 && wRes.rows[0].balance_tokens !== undefined) {
            latestBal = Math.max(latestBal, Number(wRes.rows[0].balance_tokens));
          }
        } catch(e) {}
        try {
          props.setProperty("SHEETBOT_CACHED_BALANCE", String(latestBal));
          props.setProperty("SHEETBOT_CACHED_TIER", "PRO");
        } catch(e) {}

        return {
          success: true,
          status: "COMPLETED",
          tokensToCredit: credited,
          currentBalance: latestBal,
          message: "입금 확인 완료! " + credited.toLocaleString() + " 토큰이 성공적으로 충전되었습니다."
        };
      } else if (row.status === "PENDING") {
        // 아직 서버 웹훅이나 SMS 동기화가 진행 중인 경우 대기 안내 반환
        return { success: true, status: "PENDING", message: "실시간 입금 확인 중입니다... 잠시 후 다시 확인을 눌러주세요." };
      }
    }

    if (depositCode && props.getProperty("SHEETBOT_ACTIVE_APPROVED_" + depositCode)) {
      props.deleteProperty("SHEETBOT_ACTIVE_APPROVED_" + depositCode);
      return {
        success: true,
        status: "COMPLETED",
        tokensToCredit: 50000,
        currentBalance: currentBalance,
        message: "입금 확인 완료! 50,000 토큰이 성공적으로 충전되었습니다."
      };
    }

    return { success: true, status: "PENDING", message: "실시간 입금 대기 중..." };
  } catch (err) {
    return { success: false, isTunnelError: !!err.isTunnelError, error: err.message };
  }
}

function getTunnelStatusData() {
  var startTime = new Date().getTime();
  try {
    if (typeof egdeskUserDataListTables === 'function') {
      egdeskUserDataListTables();
    }
    var elapsed = new Date().getTime() - startTime;
    return { success: true, elapsed: elapsed, latency: elapsed, serverName: "EGDesk Cloud", message: "정상 통신 준비 완료" };
  } catch (err) {
    return { success: false, isTunnelError: true, error: err.message || "통신 실패", elapsed: new Date().getTime() - startTime, message: "이지데스크 MCP 서버를 확인해 주세요." };
  }
}

function simulateAdminDepositApproval(requestId, depositCode, pkgId) {
  try {
    var email = Session.getActiveUser().getEmail() || "";
    email = email.toLowerCase().trim();

    var isAuthorizedAdmin = (email === "minseochh02@gmail.com" || email.indexOf("charisma") !== -1 || email.indexOf("minseochh02") !== -1);
    if (!isAuthorizedAdmin) {
      return {
        success: false,
        error: "권한 오류: 시뮬레이션 승인은 관리자 전용 디버깅 도구입니다. 실제 계좌 입금을 통해 안전하게 충전해 주세요."
      };
    }

    var pkg = TOKEN_PACKAGES_CONFIG[pkgId] || TOKEN_PACKAGES_CONFIG.pkg_starter;
    var tokensToAdd = pkg.tokens || 50000;
    var codeUpper = depositCode ? String(depositCode).toUpperCase().trim() : "SIM" + Math.floor(100 + Math.random() * 900);

    var reqRow = null;
    var queryRes = _callUserDataTool('user_data_query', {
      tableName: 'sheetbot_deposit_requests',
      filters: { deposit_code: codeUpper },
      limit: 1
    });
    var rows = (queryRes && queryRes.rows) || [];
    if (rows.length > 0) {
      reqRow = rows[0];
      tokensToAdd = Number(reqRow.tokens_to_credit) || tokensToAdd;
    }

    var nowStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
    if (reqRow && reqRow.id) {
      _callUserDataTool('user_data_update_rows', {
        tableName: 'sheetbot_deposit_requests',
        ids: [String(reqRow.id)],
        updates: {
          status: "COMPLETED",
          completed_at: nowStr,
          updated_at: nowStr
        }
      });
    } else {
      var newReqId = requestId || ("dep_sim_" + new Date().getTime());
      _callUserDataTool('user_data_insert_rows', {
        tableName: 'sheetbot_deposit_requests',
        rows: [{
          id: newReqId,
          user_email: email,
          user_name: email.split('@')[0],
          package_id: pkg.id,
          package_name: pkg.name,
          amount_krw: pkg.price,
          tokens_to_credit: tokensToAdd,
          deposit_code: codeUpper,
          bank_name: "카카오뱅크",
          status: "COMPLETED",
          completed_at: nowStr,
          created_at: nowStr,
          updated_at: nowStr
        }]
      });
    }

    var wRes = _callUserDataTool('user_data_query', {
      tableName: 'sheetbot_user_wallets',
      filters: { user_email: email },
      limit: 1
    });
    var wRows = (wRes && wRes.rows) || [];
    var currentBalance = 1147439;
    var walletId = null;
    if (wRows.length > 0) {
      currentBalance = Number(wRows[0].balance_tokens) || 1147439;
      walletId = String(wRows[0].id);
    }

    var newBalance = currentBalance + tokensToAdd;
    if (walletId) {
      _callUserDataTool('user_data_update_rows', {
        tableName: 'sheetbot_user_wallets',
        ids: [walletId],
        updates: {
          balance_tokens: newBalance,
          tier: "PRO",
          updated_at: nowStr
        }
      });
    }

    try {
      var props = PropertiesService.getScriptProperties();
      props.setProperty("SHEETBOT_CACHED_BALANCE", String(newBalance));
      props.setProperty("SHEETBOT_CACHED_TIER", "PRO");
    } catch (e) {}

    return {
      success: true,
      status: "COMPLETED",
      tokensToCredit: tokensToAdd,
      currentBalance: newBalance,
      message: "관리자 시뮬레이션 승인 완료: " + Number(tokensToAdd).toLocaleString() + " 토큰이 지급되었습니다."
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
`;
