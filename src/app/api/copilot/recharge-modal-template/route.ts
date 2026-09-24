export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  const defaultEmail = "chachogreat@gmail.com";
  const defaultQrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent("은행명 :카카오뱅크 / 계좌번호 :3333-12-1695965");

  const html = `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;600;700;800;900&display=swap");
    * { font-family: "Pretendard", -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif; }
    @keyframes pulse-subtle { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .animate-pulse-subtle { animation: pulse-subtle 2s infinite; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 p-2.5 select-none overflow-hidden">
  <div class="max-w-md mx-auto space-y-2">
    <!-- 상단 지갑 카드 -->
    <div class="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-2.5 rounded-2xl shadow-md">
      <div class="flex items-center justify-between">
        <div class="space-y-0.5">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300">SheetBot Wallet</span>
            <span id="userTierBadge" class="px-2 py-0.5 text-[9px] font-black rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">PRO</span>
          </div>
          <div id="userEmailTxt" class="text-xs text-slate-300 font-medium truncate max-w-[180px]">${defaultEmail}</div>
        </div>
        <div class="text-right">
          <div class="text-[10px] font-bold text-slate-400">보유 잔액</div>
          <div class="text-base font-black text-emerald-400 flex items-baseline justify-end gap-1 tracking-tight">
            <span id="tokenBalanceTxt">1,495,439</span>
            <span class="text-[11px] font-semibold text-slate-300">토큰</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 1. 패키지 선택 -->
    <div class="space-y-1">
      <div class="flex items-center justify-between px-1">
        <span class="text-[11px] font-black text-slate-700">1. 충전 패키지 선택</span>
        <span class="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">⚡ PG 수수료 0원 혜택</span>
      </div>
      <div class="grid grid-cols-3 gap-1.5" id="packageGrid">
        <button type="button" onclick="selectPackage('pkg_starter')" id="btn_pkg_starter" class="p-2 bg-white border-2 border-slate-200 rounded-xl text-center transition-all duration-150 hover:border-indigo-300 hover:shadow-xs cursor-pointer flex flex-col items-center justify-between min-h-[74px]">
          <span class="text-[10.5px] font-bold text-slate-500">스타터</span>
          <div class="my-0.2">
            <div class="text-[14px] font-black text-slate-800 leading-tight">5만 토큰</div>
            <div class="text-[11px] font-bold text-slate-500">5,000원</div>
          </div>
          <span class="text-[8.5px] text-slate-400 font-semibold">입문용</span>
        </button>
        <button type="button" onclick="selectPackage('pkg_standard')" id="btn_pkg_standard" class="p-2 bg-indigo-50/90 border-2 border-indigo-600 rounded-xl text-center transition-all duration-150 relative shadow-md ring-2 ring-indigo-300/40 cursor-pointer flex flex-col items-center justify-between min-h-[74px]">
          <div class="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 bg-indigo-600 text-white rounded-full text-[7.5px] font-black tracking-tight shadow-xs whitespace-nowrap">🔥 인기추천</div>
          <span class="text-[10.5px] font-black text-indigo-900">스탠다드</span>
          <div class="my-0.2">
            <div class="text-[14px] font-black text-indigo-700 leading-tight">15만 토큰</div>
            <div class="text-[11px] font-black text-indigo-950">12,000원</div>
          </div>
          <span class="text-[8.5px] text-indigo-600 font-extrabold bg-indigo-100/60 px-1 py-0.2 rounded">가장 인기</span>
        </button>
        <button type="button" onclick="selectPackage('pkg_pro')" id="btn_pkg_pro" class="p-2 bg-white border-2 border-slate-200 rounded-xl text-center transition-all duration-150 hover:border-indigo-300 hover:shadow-xs cursor-pointer flex flex-col items-center justify-between min-h-[74px]">
          <span class="text-[10.5px] font-bold text-slate-500">프로</span>
          <div class="my-0.2">
            <div class="text-[14px] font-black text-slate-800 leading-tight">45만 토큰</div>
            <div class="text-[11px] font-bold text-slate-500">30,000원</div>
          </div>
          <span class="text-[8.5px] text-emerald-600 font-bold bg-emerald-50 px-1 py-0.2 rounded">최대 혜택</span>
        </button>
      </div>
    </div>

    <!-- 2. 입금인명 및 영수증 번호 입력 게이트 (Gate) -->
    <div class="bg-gradient-to-r from-indigo-50 via-indigo-50/60 to-purple-50 border-2 border-indigo-200 rounded-xl p-2.5 space-y-2 shadow-2xs">
      <div class="flex items-center justify-between">
        <label class="text-[11px] font-black text-indigo-950 flex items-center gap-1">
          <span>👤</span>
          <span>2. 송금자 정보 및 영수증 알림</span>
        </label>
        <span id="gateBadge" class="text-[9px] font-extrabold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-300">🔒 계좌 잠김</span>
      </div>
      <div class="space-y-1.5">
        <div>
          <label for="depositorNameInput" class="text-[9.5px] font-bold text-slate-600 block mb-0.5">송금자 실명 <span class="text-rose-500 font-extrabold">*필수</span></label>
          <input type="text" id="depositorNameInput" placeholder="은행 송금 시 보낼 실명 (예: 홍길동)" class="w-full bg-white border-2 border-indigo-300 rounded-lg px-2.5 py-1.5 text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs placeholder:text-slate-400" />
        </div>
        <div>
          <label for="receiptPhoneInput" class="text-[9.5px] font-bold text-slate-600 flex items-center justify-between mb-0.5">
            <span>영수증 수신 번호 <span class="text-indigo-600 font-medium">(선택)</span></span>
            <span class="text-[8.5px] text-emerald-600 font-extrabold">⚡ 입금 즉시 0원 영수증 SMS 자동 발송</span>
          </label>
          <input type="tel" id="receiptPhoneInput" placeholder="010-0000-0000 (미입력 시 SMS 발송 생략)" class="w-full bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs placeholder:text-slate-400" />
        </div>
        <button type="button" id="btnUnlockAccount" onclick="confirmDepositorAndRequest()" class="w-full py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-lg text-xs font-black transition-all shadow-xs shrink-0 cursor-pointer active:scale-95 flex items-center justify-center gap-1">
          <span>계좌 확인 🔓</span>
        </button>
      </div>
      <div class="text-[9px] text-indigo-900/90 font-medium leading-tight">
        ※ 성함을 입력하시면 <b>1원 단위 전용 할인 금액</b>과 <b>입금 계좌</b>가 열리며, 번호 입력 시 <b>무료 충전 영수증</b>이 문자로 전송됩니다.
      </div>
    </div>

    <!-- 3. 계좌정보 & 결제 영역 (입금자명 입력 전 블러 잠금) -->
    <div id="depositInfoCard" class="bg-white rounded-xl border border-slate-200 p-2.5 shadow-xs space-y-2 relative overflow-hidden">
      <!-- 잠금 안내 오버레이 -->
      <div id="lockedOverlay" class="p-6 bg-slate-50/95 border-2 border-dashed border-slate-300 rounded-xl text-center space-y-2 my-0.5">
        <div class="text-2xl animate-bounce">🔒</div>
        <div class="text-xs font-black text-slate-800">송금자 성함을 먼저 입력해 주세요</div>
        <div class="text-[10.5px] text-slate-500 leading-relaxed">
          위 입력창에 실제 송금하실 분의 성함을 입력하신 후<br>
          <span class="font-bold text-indigo-600">[계좌 확인 🔓]</span> 버튼을 누르면 전용 입금 계좌가 열립니다.
        </div>
      </div>

      <!-- 잠금 해제 후 활성화되는 컨텐츠 -->
      <div id="unlockedContent" class="hidden space-y-2">
        <div class="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border-2 border-emerald-300/90 rounded-xl p-2.5 flex items-center justify-between shadow-2xs">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-xs shadow-xs">₩</div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-black text-slate-900">송금할 정확한 금액</span>
                <span id="discountBadge" class="text-[9px] font-black text-rose-600 bg-rose-100 px-1.5 py-0.2 rounded-full border border-rose-200">-13원 할인</span>
              </div>
              <div class="text-[9.5px] text-slate-500 font-medium">정가: <span id="originalPriceTxt" class="line-through">12,000</span>원 → 0초 자동충전 전용</div>
            </div>
          </div>
          <div class="text-right">
            <div class="flex items-baseline justify-end gap-0.5">
              <span id="amountBadge" class="text-xl font-black text-emerald-600 tracking-tight font-mono">11,987</span>
              <span class="text-xs font-black text-slate-900">원</span>
            </div>
          </div>
        </div>

        <div class="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-300 rounded-xl p-2 space-y-1 shadow-2xs">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-[11px] font-black text-amber-950 flex-wrap">
              <span>⚠️</span>
              <span>입금자명:</span>
              <span id="confirmedDepositorName" class="text-indigo-900 bg-white border border-indigo-200 px-1.5 py-0.2 rounded font-black text-xs">--</span>
              <span id="confirmedPhoneBadge" class="hidden text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-1.5 py-0.2 rounded font-bold text-[9px]">📱 영수증: --</span>
            </div>
            <button type="button" onclick="changeDepositor()" class="text-[9.5px] text-slate-600 hover:text-indigo-600 underline font-bold cursor-pointer">✏️ 수정</button>
          </div>
          <div class="text-[9.5px] text-amber-900 font-medium text-center bg-white/70 p-1 rounded-lg border border-amber-200 leading-tight">
            ※ 은행 송금 시 <b>입금자명</b>을 위 성함으로, 금액은 <b>1원 단위까지 정확히 송금</b>하시면 0초 자동 충전됩니다.
          </div>
        </div>

        <div class="grid grid-cols-12 gap-2 items-center">
          <div class="col-span-4 flex flex-col items-center justify-center p-1.5 bg-slate-50 border border-slate-200 rounded-xl">
            <img id="qrImg" src="${defaultQrUrl}" alt="QR" class="w-18 h-18 bg-white p-0.5 rounded-lg border border-slate-200 object-contain shadow-xs" />
            <div class="text-[8.5px] font-bold text-slate-500 mt-0.5">📸 카메라 스캔</div>
          </div>
          <div class="col-span-8 space-y-1.5">
            <div class="space-y-0.5">
              <div class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-yellow-400 shrink-0"></span>
                <span id="bankNameTxt" class="text-[13px] font-black text-slate-900">카카오뱅크</span>
                <span id="accountHolderTxt" class="text-[11px] font-semibold text-slate-500">(예금주: 차호석)</span>
              </div>
              <div class="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 flex items-center justify-between">
                <span id="accountNumberTxt" class="text-[13px] font-black text-slate-900 font-mono tracking-wide select-all">3333-12-1695965</span>
              </div>
            </div>
            <button type="button" onclick="copyAccountNumber()" class="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-[10.5px] rounded-lg transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer active:scale-95">
              <span>📋 계좌번호 복사</span>
            </button>
          </div>
        </div>

        <div id="statusPulseBar" class="p-2 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-subtle"></span>
            <span id="pollingStatusTxt" class="text-emerald-900 font-bold text-[10.5px]">실시간 입금 대기 중...</span>
          </div>
          <button type="button" onclick="checkStatusNow(false)" id="manualCheckBtn" class="text-[9.5px] px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-md shadow-xs transition-colors cursor-pointer">🔄 확인</button>
        </div>

        <div id="adminSimContainer" class="pt-0.2 text-center hidden">
          <button type="button" onclick="triggerSimulateDeposit()" id="simBtn" class="text-[9.5px] text-slate-400 hover:text-slate-600 underline font-medium cursor-pointer">🔒 [관리자 테스트] 즉시 승인 시뮬레이션</button>
        </div>
      </div>
    </div>

    <!-- 성공 카드 -->
    <div id="successCard" class="hidden bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-6 text-center space-y-3.5 shadow-md">
      <div class="text-4xl">🎉</div>
      <h3 class="font-black text-emerald-950 text-base">토큰 충전이 완료되었습니다!</h3>
      <p id="successMsg" class="text-xs text-emerald-800 font-medium">토큰이 성공적으로 충전되었습니다.</p>
      <div class="p-3.5 bg-white rounded-xl border border-emerald-200 text-xs text-slate-700 font-bold shadow-xs">
        현재 총 잔여 토큰: <span id="finalBalanceTxt" class="text-emerald-600 text-base font-black">--</span>개
      </div>
      <div class="space-y-2">
        <button onclick="google.script.host.close()" class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer">확인 및 닫기</button>
        <button type="button" onclick="resetToRechargeView()" class="w-full py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-all cursor-pointer">➕ 다른 패키지 / 추가 충전하기</button>
      </div>
    </div>
  </div>

  <script>
    var curRequestId = ""; var curDepositCode = ""; var curDepositorName = ""; var curPhone = ""; var curAmount = 12000; var curSelectedPkg = "pkg_standard"; var pollTimer = null;
    var PKG_META = { pkg_starter: { price: 5000, priceStr: "5,000", tokens: 50000 }, pkg_standard: { price: 12000, priceStr: "12,000", tokens: 150000 }, pkg_pro: { price: 30000, priceStr: "30,000", tokens: 450000 } };
    function init() {
      if (window.google && window.google.script && window.google.script.run) {
        google.script.run.withSuccessHandler(function(res){
          if (res && res.success) {
            document.getElementById("userEmailTxt").innerText = res.email;
            document.getElementById("userTierBadge").innerText = res.tier;
            document.getElementById("tokenBalanceTxt").innerText = Number(res.balance).toLocaleString();
            if (res.isAdmin) { var simEl = document.getElementById("adminSimContainer"); if (simEl) simEl.classList.remove("hidden"); }
            if (res.email) {
              var guess = res.email.split("@")[0].replace(/[^a-zA-Z0-9가-힣]/g, "");
              var input = document.getElementById("depositorNameInput");
              if (input && !input.value && guess) input.placeholder = "예: " + guess + " (은행 송금자 성함)";
            }
            if (res.phoneNumber) {
              var pInput = document.getElementById("receiptPhoneInput");
              if (pInput && !pInput.value) pInput.value = res.phoneNumber;
            }
          }
        }).getUserTokenBalanceData();
      }
      selectPackage("pkg_standard");
    }

    function selectPackage(pkgId) {
      curSelectedPkg = pkgId;
      var pkgs = ["pkg_starter", "pkg_standard", "pkg_pro"];
      pkgs.forEach(function(p){
        var btn = document.getElementById("btn_" + p);
        if (btn) {
          if (p === pkgId) {
            btn.className = "p-2.5 bg-indigo-50/90 border-2 border-indigo-600 rounded-2xl text-center transition-all duration-150 relative shadow-md ring-2 ring-indigo-300/40 cursor-pointer flex flex-col items-center justify-between min-h-[92px]";
          } else {
            btn.className = "p-2.5 bg-white border-2 border-slate-200 rounded-2xl text-center transition-all duration-150 hover:border-indigo-300 hover:shadow-xs cursor-pointer flex flex-col items-center justify-between min-h-[92px]";
          }
        }
      });
      if (curDepositorName) {
        requestSession(pkgId, curDepositorName, curPhone);
      }
    }

    function confirmDepositorAndRequest() {
      var input = document.getElementById("depositorNameInput");
      var val = (input ? input.value : "").trim();
      if (!val || val.length < 2) {
        alert("실제 송금하실 분의 성함(입금자명)을 2글자 이상 입력해 주세요.\\n예: 홍길동");
        if (input) input.focus();
        return;
      }
      curDepositorName = val;
      var pInput = document.getElementById("receiptPhoneInput");
      curPhone = (pInput ? pInput.value : "").replace(/[^0-9-]/g, "").trim();
      requestSession(curSelectedPkg, curDepositorName, curPhone);
    }

    function requestSession(pkgId, depositorName, phoneNumber) {
      phoneNumber = phoneNumber !== undefined ? phoneNumber : (curPhone || "");
      var unlockBtn = document.getElementById("btnUnlockAccount");
      if (unlockBtn) unlockBtn.innerText = "발급 중...";
      if (window.google && window.google.script && window.google.script.run) {
        google.script.run.withSuccessHandler(function(data){
          if (unlockBtn) unlockBtn.innerHTML = "<span>확인됨 🔓</span>";
          if (data && data.success) {
            curRequestId = data.requestId;
            curDepositCode = data.depositCode;

            var origPrice = Number(data.originalPriceKrw || data.originalAmountKrw || (data.package && data.package.originalPriceKrw) || 12000);
            var disc = Number(data.discountKrw || 0);
            var finPrice = Number(data.finalPriceKrw || data.finalAmountKrw || data.amountKrw || (data.package && data.package.priceKrw) || (origPrice - disc));
            if (isNaN(finPrice) || finPrice <= 0) {
              finPrice = Math.max(1000, origPrice - disc);
            }
            curAmount = finPrice;

            document.getElementById("lockedOverlay").classList.add("hidden");
            document.getElementById("unlockedContent").classList.remove("hidden");
            var gateBadge = document.getElementById("gateBadge");
            if (gateBadge) { gateBadge.innerText = "🔓 계좌 열림"; gateBadge.className = "text-[9px] font-extrabold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300"; }
            document.getElementById("confirmedDepositorName").innerText = data.depositorName;
            var phoneBadge = document.getElementById("confirmedPhoneBadge");
            if (phoneBadge) {
              if (curPhone) {
                phoneBadge.innerText = "📱 영수증: " + curPhone;
                phoneBadge.classList.remove("hidden");
              } else {
                phoneBadge.classList.add("hidden");
              }
            }
            document.getElementById("originalPriceTxt").innerText = Number(origPrice).toLocaleString();
            document.getElementById("discountBadge").innerText = "-" + disc + "원 즉시할인";
            document.getElementById("amountBadge").innerText = Number(finPrice).toLocaleString();

            var bankObj = data.bank || {};
            if (document.getElementById("bankNameTxt")) document.getElementById("bankNameTxt").innerText = bankObj.bankName || "카카오뱅크";
            var accNum = String(bankObj.accountNumber || "3333-12-1695965");
            if (accNum.length === 13 && accNum.indexOf("-") === -1) {
              accNum = accNum.substring(0, 4) + "-" + accNum.substring(4, 6) + "-" + accNum.substring(6);
            }
            document.getElementById("accountNumberTxt").innerText = accNum;
            document.getElementById("accountHolderTxt").innerText = "(예금주: " + (bankObj.accountHolder || "차호석") + ")";
            if (data.qrImageUrl) document.getElementById("qrImg").src = data.qrImageUrl;
            document.getElementById("pollingStatusTxt").innerText = "실시간 입금 대기 중...";
            startPolling();
          } else {
            var errMsg = (data && data.error) ? data.error : "알 수 없는 오류";
            if (data && data.isTunnelError) {
              alert("⚠️ [EGDesk 터널 통신 오류]\\n\\n이지데스크 MCP 서버를 확인해 주세요.\\n(" + errMsg + ")");
            } else {
              alert("발급 오류: " + errMsg);
            }
          }
        }).withFailureHandler(function(err){
          if (unlockBtn) unlockBtn.innerHTML = "<span>계좌 확인 🔓</span>";
          alert("⚠️ [EGDesk 터널 통신 오류]\\n\\n이지데스크 MCP 서버를 확인해 주세요.\\n(" + err.message + ")");
        }).requestDirectDepositSession(pkgId, depositorName, phoneNumber);
      }
    }

    function changeDepositor() {
      if (pollTimer) clearInterval(pollTimer);
      document.getElementById("unlockedContent").classList.add("hidden");
      document.getElementById("lockedOverlay").classList.remove("hidden");
      var gateBadge = document.getElementById("gateBadge");
      if (gateBadge) { gateBadge.innerText = "🔒 계좌 잠김"; gateBadge.className = "text-[9px] font-extrabold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-300"; }
      var input = document.getElementById("depositorNameInput");
      if (input) { input.focus(); input.select(); }
      var unlockBtn = document.getElementById("btnUnlockAccount");
      if (unlockBtn) unlockBtn.innerHTML = "<span>계좌 확인 🔓</span>";
    }

    function startPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(function(){
        if (!curRequestId) return;
        checkStatusNow(true);
      }, 3000);
    }

    function checkStatusNow(isAuto) {
      if (!curRequestId) return;
      var btn = document.getElementById("manualCheckBtn");
      if (!isAuto && btn) btn.innerText = "확인중..";
      if (window.google && window.google.script && window.google.script.run) {
        google.script.run.withSuccessHandler(function(res){
          if (!isAuto && btn) btn.innerText = "🔄 확인";
          if (res && res.isTunnelError) {
            var pText = document.getElementById("pollingStatusTxt");
            if (pText) {
              pText.innerHTML = '<span class="text-rose-600 font-extrabold animate-pulse">⚠️ [터널 오류] 이지데스크 MCP 서버를 확인해 주세요.</span>';
            }
            if (!isAuto) {
              alert("⚠️ [EGDesk 터널 통신 지연]\\n\\n터널링 서비스 연결이 일시 지연되고 있습니다.\\n이지데스크 MCP 서버가 실행 중인지 확인해 주세요.");
            }
            return;
          }
          var pText2 = document.getElementById("pollingStatusTxt");
          if (pText2 && pText2.innerHTML.indexOf("터널 오류") !== -1) {
            pText2.innerText = "실시간 입금 대기 중...";
          }
          if (res && res.success && (res.status === "COMPLETED" || res.status === "APPROVED")) {
            if (pollTimer) clearInterval(pollTimer);
            showSuccess(res);
          } else if (!isAuto) {
            alert("아직 입금이 확인되지 않았습니다.\\n송금을 완료하셨다면 5~10초 후 다시 [확인]을 누르시거나 잠시 기다려 주세요.\\n(입금자명: " + curDepositorName + " / 금액: " + Number(curAmount).toLocaleString() + "원)");
          }
        }).withFailureHandler(function(err){
          if (!isAuto && btn) btn.innerText = "🔄 확인";
          var pText = document.getElementById("pollingStatusTxt");
          if (pText) {
            pText.innerHTML = '<span class="text-rose-600 font-extrabold animate-pulse">⚠️ [터널 오류] 이지데스크 MCP 서버를 확인해 주세요.</span>';
          }
          if (!isAuto) alert("⚠️ [EGDesk 터널 통신 오류]\\n\\n이지데스크 MCP 서버를 확인해 주세요.\\n(" + err.message + ")");
        }).checkDepositStatus(curRequestId, curDepositCode);
      }
    }

    function showSuccess(res) {
      document.getElementById("depositInfoCard").classList.add("hidden");
      document.getElementById("packageGrid").parentElement.classList.add("hidden");
      document.getElementById("successCard").classList.remove("hidden");
      document.getElementById("finalBalanceTxt").innerText = Number(res.currentBalance).toLocaleString();
      document.getElementById("tokenBalanceTxt").innerText = Number(res.currentBalance).toLocaleString();
      if (res.message) document.getElementById("successMsg").innerText = res.message;
    }

    function copyAccountNumber() {
      var num = document.getElementById("accountNumberTxt").innerText;
      navigator.clipboard.writeText(num).then(function(){
        alert("계좌번호 [" + num + "] 가 복사되었습니다.\\n은행 앱에 붙여넣기 하여 송금하세요!");
      });
    }

    function triggerSimulateDeposit() {
      if (!confirm("관리자 전용 기능: 즉시 입금 승인을 시뮬레이션하시겠습니까?")) return;
      var btn = document.getElementById("simBtn");
      btn.innerText = "승인 처리 중...";
      if (window.google && window.google.script && window.google.script.run) {
        google.script.run.withSuccessHandler(function(res){
          if (res && res.success) {
            if (pollTimer) clearInterval(pollTimer);
            showSuccess(res);
          } else {
            alert("시뮬레이션 실패: " + (res && res.error));
            btn.innerText = "🔒 [관리자 테스트] 즉시 승인 시뮬레이션";
          }
        }).withFailureHandler(function(err){
          alert("오류: " + err.message);
          btn.innerText = "🔒 [관리자 테스트] 즉시 승인 시뮬레이션";
        }).simulateAdminDepositApproval(curRequestId, curDepositCode, curSelectedPkg);
      }
    }

    function resetToRechargeView() {
      document.getElementById("successCard").classList.add("hidden");
      document.getElementById("depositInfoCard").classList.remove("hidden");
      document.getElementById("packageGrid").parentElement.classList.remove("hidden");
      selectPackage("pkg_standard");
    }
    window.onload = init;
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
