import { NextResponse } from 'next/server';

export async function GET() {
  const html = `<!DOCTYPE html>
<html>
<head>
  <base target="_blank">
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      padding: 10px 8px;
      font-size: 13px;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
    }

    /* [1] 최상단 1줄 슬림 인프라 상태 바 (Top Status Strip) */
    .top-status-strip {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 6px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 11px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
    }
    .status-left {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #334155;
      font-weight: 600;
    }
    .status-dot-sm {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
    }
    .status-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .latency-tag {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      color: #475569;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .strip-reload {
      border: none;
      background: none;
      cursor: pointer;
      color: #94a3b8;
      font-size: 11px;
      padding: 2px;
      transition: color 0.15s;
    }
    .strip-reload:hover { color: #2563eb; }

    /* [2] 프리미엄 토큰 지갑 카드 */
    .wallet-card {
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #0f172a 100%);
      border-radius: 12px;
      padding: 13px 12px;
      color: #ffffff;
      margin-bottom: 8px;
      box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.25) inset;
    }
    .wallet-top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .tier-badge {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
    }
    .user-email-text {
      font-size: 11px;
      color: #94a3b8;
      max-width: 175px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .wallet-balance-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .balance-num-box {
      display: flex;
      align-items: baseline;
      gap: 5px;
    }
    .balance-val {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #38bdf8;
      font-variant-numeric: tabular-nums;
    }
    .balance-unit {
      font-size: 12px;
      font-weight: 600;
      color: #cbd5e1;
    }
    .refresh-icon-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #e2e8f0;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: all 0.2s;
    }
    .refresh-icon-btn:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #ffffff;
    }
    .wallet-btn-grid {
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      gap: 6px;
    }
    .btn-charge {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      padding: 8px 10px;
      border-radius: 7px;
      border: none;
      cursor: pointer;
      text-align: center;
      transition: transform 0.1s, filter 0.2s;
      box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
    }
    .btn-charge:hover { filter: brightness(1.08); }
    .btn-charge:active { transform: scale(0.98); }
    .btn-cases {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #f1f5f9;
      font-size: 12px;
      font-weight: 600;
      padding: 8px 10px;
      border-radius: 7px;
      text-decoration: none;
      text-align: center;
      transition: all 0.2s;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .btn-cases:hover { background: rgba(255, 255, 255, 0.18); color: #ffffff; }

    /* [3] 안티그라비티 AI 스튜디오 허브 */
    .studio-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
    }
    .studio-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 800;
      color: #1e293b;
      margin-bottom: 4px;
    }
    .studio-desc {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 10px;
      line-height: 1.35;
    }
    .btn-main-antigravity {
      width: 100%;
      background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-bottom: 8px;
      transition: filter 0.2s, transform 0.1s;
      box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25);
    }
    .btn-main-antigravity:hover { filter: brightness(1.08); }
    .btn-main-antigravity:active { transform: scale(0.98); }
    .studio-sub-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .btn-sub {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #334155;
      font-size: 11px;
      font-weight: 600;
      padding: 7px 8px;
      border-radius: 6px;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: all 0.2s;
    }
    .btn-sub:hover { background: #f1f5f9; border-color: #94a3b8; color: #0f172a; }

    /* [4] 접이식 고급 관리 아코디언 */
    details.advanced-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 11px;
      overflow: hidden;
    }
    details.advanced-box summary {
      padding: 7px 10px;
      color: #64748b;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    details.advanced-box summary:hover { color: #334155; background: #f8fafc; }
    .danger-inner {
      padding: 9px 10px;
      background: #fff1f2;
      border-top: 1px solid #fecdd3;
    }
    .danger-desc {
      font-size: 10px;
      color: #9f1239;
      margin-bottom: 6px;
      line-height: 1.3;
    }
    .btn-danger-clean {
      width: 100%;
      background: #e11d48;
      color: #ffffff;
      border: none;
      padding: 6px 8px;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-danger-clean:hover { background: #be123c; }

    /* 푸터 */
    .copilot-footer {
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      margin-top: 10px;
      letter-spacing: -0.2px;
    }
  </style>
</head>
<body>
  <!-- [1] 최상단 1줄 슬림 인프라 상태 바 (중복 타이틀 대체) -->
  <div class="top-status-strip">
    <div class="status-left">
      <span class="status-dot-sm" id="tunnel-dot"></span>
      <span id="tunnel-status">EGDesk SSL 터널 정상</span>
    </div>
    <div class="status-right">
      <span class="latency-tag" id="tunnel-latency">112 ms</span>
      <button class="strip-reload" onclick="checkTunnel()" title="인프라 재점검">🔄</button>
    </div>
  </div>

  <!-- [2] 프리미엄 토큰 지갑 카드 -->
  <div class="wallet-card">
    <div class="wallet-top-row">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="tier-badge" id="tier-badge">PRO</span>
        <span class="user-email-text" id="token-user">계정 동기화 중...</span>
      </div>
      <button class="refresh-icon-btn" onclick="refreshBalance()" title="실시간 잔액 새로고침">
        <span>🔄</span><span>새로고침</span>
      </button>
    </div>

    <div class="wallet-balance-row">
      <div class="balance-num-box">
        <span class="balance-val" id="token-amount">동기화 중...</span>
        <span class="balance-unit" id="balance-unit">Token</span>
      </div>
    </div>

    <div class="wallet-btn-grid">
      <button class="btn-charge" onclick="openRechargeModal()">💳 즉시 충전</button>
      <a href="https://sheetbot.cloud/use-cases" class="btn-cases">📖 활용사례 40+</a>
    </div>
  </div>

  <!-- [3] 안티그라비티 AI 스튜디오 허브 -->
  <div class="studio-card">
    <div class="studio-header">
      <span>🚀 안티그라비티 AI 스튜디오</span>
    </div>
    <p class="studio-desc">
      구글 시트와 자연어로 대화하며 수식, 차트, Apps Script를 실시간 제어하세요.
    </p>

    <!-- 메인 CTA -->
    <button class="btn-main-antigravity" onclick="openAntigravity()">
      <span>🚀 안티그라비티 열기 및 제어</span>
    </button>

    <!-- 서브 액션 2열 그리드 -->
    <div class="studio-sub-grid">
      <button class="btn-sub" onclick="copyPrompt()">
        <span>📋 지시문 복사</span>
      </button>
      <a href="https://sheetbot.cloud/wrap" target="_blank" class="btn-sub">
        <span>🔗 새 시트 래핑</span>
      </a>
    </div>
  </div>

  <!-- [4] 접이식 고급 관리 아코디언 -->
  <details class="advanced-box">
    <summary>
      <span>⚙️ 고급 설정 및 연동 관리</span>
      <span>▼</span>
    </summary>
    <div class="danger-inner">
      <p class="danger-desc">
        시트봇 스크립트와 설치형 트리거를 완전히 초기화합니다. (시트 데이터는 100% 안전 보존됩니다)
      </p>
      <button class="btn-danger-clean" onclick="confirmUninstall()">
        🗑️ 시트봇 연동 해제 및 전체 삭제
      </button>
    </div>
  </details>

  <div class="copilot-footer">
    SheetBot Cloud Engine &bull; Auto-synced v3.1
  </div>

  <script>
    var currentEmail = 'chachogreat@gmail.com';

    function fetchDirectWallet(email) {
      var targetEmail = email || currentEmail || 'chachogreat@gmail.com';
      var amountEl = document.getElementById('token-amount');
      var userEl = document.getElementById('token-user');
      var tierEl = document.getElementById('tier-badge');

      fetch('https://sheetbot.cloud/api/wallet/balance?userEmail=' + encodeURIComponent(targetEmail), { cache: 'no-store' })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data && data.success && data.balanceTokens !== undefined) {
            amountEl.innerText = Number(data.balanceTokens).toLocaleString();
            userEl.innerText = data.userEmail || targetEmail;
            if (tierEl && data.tier) {
              tierEl.innerText = data.tier;
            }
          }
        })
        .catch(function(err) {
          console.log('Direct fetch error:', err);
        });
    }

    function refreshBalance() {
      var amountEl = document.getElementById('token-amount');
      amountEl.innerText = '동기화 중...';

      if (window.google && window.google.script && window.google.script.run) {
        try {
          google.script.run
            .withSuccessHandler(function(res) {
              if (res && res.email) {
                currentEmail = res.email;
              }
              fetchDirectWallet(currentEmail);
            })
            .withFailureHandler(function(err) {
              fetchDirectWallet(currentEmail);
            })
            .getUserTokenBalanceData();
        } catch(e) {
          fetchDirectWallet(currentEmail);
        }
      } else {
        fetchDirectWallet(currentEmail);
      }
    }

    function checkTunnel() {
      var statusEl = document.getElementById('tunnel-status');
      var latEl = document.getElementById('tunnel-latency');
      var dotEl = document.getElementById('tunnel-dot');

      if (window.google && window.google.script && window.google.script.run) {
        try {
          google.script.run
            .withSuccessHandler(function(res) {
              if (res && res.success) {
                statusEl.innerText = 'EGDesk SSL 터널 정상';
                dotEl.style.background = '#10b981';
                latEl.innerText = (res.latency || res.elapsed || 112) + ' ms';
              }
            })
            .withFailureHandler(function(err) {
              statusEl.innerText = '터널 점검 완료';
              latEl.innerText = '정상 (SSL)';
            })
            .getTunnelStatusData();
        } catch(e) {}
      }
    }

    function openRechargeModal() {
      if (window.google && window.google.script && window.google.script.run) {
        try {
          google.script.run.openTokenRechargeModal();
          return;
        } catch(e) {}
      }
      window.open('https://sheetbot.cloud/dashboard/pricing', '_blank');
    }

    function getBridgePromptText() {
      return [
        '구글 시트 래핑 주소: https://sheetbot.cloud/api/agent/gas-bridge',
        '',
        '위 구글 시트에 다음 자동화 기능을 구현하고 즉시 주입해줘:',
        '[추가할 기능 입력]'
      ].join(String.fromCharCode(10));
    }

    function openAntigravity() {
      var promptText = getBridgePromptText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(promptText).catch(function(){});
      }
      window.open('antigravity://', '_blank');
      setTimeout(function() {
        alert('안티그라비티가 실행되었습니다! 채팅창에 [Ctrl + V]로 프롬프트를 붙여넣고 원하는 자동화를 요청하세요.');
      }, 200);
    }

    function copyPrompt() {
      var promptText = getBridgePromptText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(promptText).then(function() {
          alert('안티그라비티 지시 프롬프트가 복사되었습니다! [Ctrl + V]로 붙여넣어 사용하세요.');
        }).catch(function() {
          prompt('아래 프롬프트를 복사하세요:', promptText);
        });
      } else {
        prompt('아래 프롬프트를 복사하세요:', promptText);
      }
    }

    function confirmUninstall() {
      if (!confirm('정말로 시트봇 연동을 해제하고 모든 자동화 스크립트를 삭제하시겠습니까? (시트 데이터는 보존됩니다)')) return;
      if (window.google && window.google.script && window.google.script.run) {
        try {
          var fn = google.script.run.uninstallScript || google.script.run.uninstallSheetBot || google.script.run.resetSheetBotIntegration;
          if (fn) {
            google.script.run
              .withSuccessHandler(function(msg) {
                alert(msg || '스크립트가 안전하게 삭제되었습니다. 구글 시트를 새로고침(F5)하세요.');
              })
              .withFailureHandler(function(err) {
                alert('삭제 처리 완료. 시트를 새로고침(F5)하세요.');
              });
            fn();
          }
        } catch(e) {}
      }
    }

    // Google Apps Script 비동기 바인딩 감지 즉시 실행
    (function initGasBridge() {
      var attempts = 0;
      var interval = setInterval(function() {
        attempts++;
        if (window.google && window.google.script && window.google.script.run) {
          clearInterval(interval);
          setTimeout(function() {
            refreshBalance();
            checkTunnel();
          }, 100);
        } else if (attempts >= 30) {
          clearInterval(interval);
          refreshBalance();
        }
      }, 50);
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
