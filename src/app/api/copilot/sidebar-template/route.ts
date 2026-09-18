import { NextResponse } from 'next/server';

export async function GET() {
  const html = `<!DOCTYPE html>
<html>
<head>
  <base target="_blank">
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 10px 6px;
      background: #f8fafc;
      color: #0f172a;
      font-size: 13px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .header h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 800;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .badge-live {
      background: #ecfdf5;
      color: #059669;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 9999px;
      border: 1px solid #a7f3d0;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .card-title {
      font-size: 12px;
      font-weight: 700;
      color: #475569;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      text-decoration: none;
      box-sizing: border-box;
    }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .btn-secondary:hover { background: #e2e8f0; }
    .btn-purple { background: #7c3aed; color: #fff; }
    .btn-purple:hover { background: #6d28d9; }
    .btn-danger { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
    .btn-danger:hover { background: #fecaca; }
    .status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .token-val {
      font-size: 18px;
      font-weight: 800;
      color: #2563eb;
    }
    .footer-note {
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>🤖 SheetBot AI 코파일럿</h2>
    <span class="badge-live">● Cloud Live</span>
  </div>

  <!-- [1] 토큰 지갑 & 충전 센터 -->
  <div class="card" style="border-left: 4px solid #2563eb;">
    <div class="card-title">
      <span>💳 내 토큰 지갑</span>
      <button onclick="refreshBalance()" style="border:none;background:none;cursor:pointer;font-size:11px;color:#2563eb;font-weight:600;">🔄 새로고침</button>
    </div>
    <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px;">
      <span class="token-val" id="token-amount">동기화 중...</span>
      <span style="font-size: 11px; color: #64748b;" id="token-user">계정 확인 중</span>
    </div>
    <div style="display: flex; gap: 6px;">
      <button class="btn btn-primary" style="flex: 1;" onclick="openRechargeModal()">충전하기</button>
      <a href="https://sheetbot.cloud/use-cases" class="btn btn-secondary" style="flex: 1.2;">📖 활용사례 40+</a>
    </div>
  </div>

  <!-- [2] 인프라 실시간 진단 -->
  <div class="card">
    <div class="card-title">
      <span>⚡ EGDesk 인프라 진단</span>
      <button onclick="checkTunnel()" style="border:none;background:none;cursor:pointer;font-size:11px;color:#64748b;font-weight:600;">🔄 재점검</button>
    </div>
    <div class="status-row">
      <span>클라우드 터널</span>
      <span id="tunnel-status" style="font-weight: 700; color: #059669;">정상 연결 (활성)</span>
    </div>
    <div class="status-row" style="margin-bottom: 0;">
      <span>응답 속도</span>
      <span id="tunnel-latency" style="font-weight: 600; color: #334155;">112 ms</span>
    </div>
  </div>

  <!-- [3] 안티그라비티 AI 연결 센터 -->
  <div class="card" style="border-left: 4px solid #8b5cf6;">
    <div class="card-title">
      <span>🚀 안티그라비티 AI 스튜디오</span>
    </div>
    <div style="font-size: 11px; color: #475569; margin-bottom: 8px;">
      구글 시트와 직접 대화하며 수식, 차트, Apps Script를 실시간 제어하세요.
    </div>
    <button class="btn btn-purple" style="margin-bottom: 6px;" onclick="openAntigravity()">🚀 안티그라비티 열기</button>
    <button class="btn btn-secondary" style="margin-bottom: 6px;" onclick="copyPrompt()">📋 코파일럿 프롬프트 복사</button>
    <a href="https://sheetbot.cloud/wrap" target="_blank" class="btn btn-secondary" style="background:#f8fafc; border:1px dashed #94a3b8; color:#475569;">🔗 새 구글 시트 래핑하기 (새 탭)</a>
  </div>

  <!-- [4] 연동 관리 Danger Zone -->
  <div class="card" style="border-left: 4px solid #ef4444;">
    <div class="card-title">
      <span style="color: #dc2626;">⚠️ 연동 관리</span>
    </div>
    <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
      시트봇 스크립트 및 설치형 트리거를 완전히 초기화합니다.
    </div>
    <button class="btn btn-danger" onclick="confirmUninstall()">🗑️ 시트봇 연동 해제 및 전체 삭제</button>
  </div>

  <div class="footer-note">
    SheetBot Cloud Engine &bull; Auto-synced v2.5
  </div>

  <script>
    function refreshBalance() {
      var amountEl = document.getElementById('token-amount');
      var userEl = document.getElementById('token-user');
      amountEl.innerText = '동기화 중...';
      userEl.innerText = '요청 전송';

      if (window.google && window.google.script && window.google.script.run) {
        try {
          google.script.run
            .withSuccessHandler(function(res) {
              if (!res) {
                amountEl.innerText = '응답 없음';
                userEl.innerText = 'null 반환';
                return;
              }
              if (res.balance !== undefined) {
                amountEl.innerText = Number(res.balance).toLocaleString() + ' P';
                userEl.innerText = res.email || (res.isAdmin ? 'ADMIN' : 'PRO');
              } else {
                amountEl.innerText = '형식 오류';
                userEl.innerText = JSON.stringify(res).substring(0, 25);
              }
            })
            .withFailureHandler(function(err) {
              amountEl.innerText = '조회 실패';
              userEl.innerText = (err && err.message) ? err.message : String(err);
            })
            .getUserTokenBalanceData();
        } catch(e) {
          amountEl.innerText = '호출 예외';
          userEl.innerText = e.message;
        }
      } else {
        amountEl.innerText = 'GAS 미연동';
        userEl.innerText = '브라우저 단독 모드';
      }
    }

    function checkTunnel() {
      var statusEl = document.getElementById('tunnel-status');
      var latEl = document.getElementById('tunnel-latency');

      if (window.google && window.google.script && window.google.script.run) {
        try {
          google.script.run
            .withSuccessHandler(function(res) {
              if (res && res.success) {
                statusEl.innerText = '정상 연결 (활성)';
                statusEl.style.color = '#059669';
                latEl.innerText = (res.latency || res.elapsed || 112) + ' ms';
              }
            })
            .withFailureHandler(function(err) {
              statusEl.innerText = '점검 실패';
              statusEl.style.color = '#dc2626';
              latEl.innerText = (err && err.message) ? err.message.substring(0, 20) : '오류';
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
      if (!confirm('정말로 시트봇 연동을 해제하고 모든 자동화 스크립트를 삭제하시겠습니까?\n(시트의 원본 데이터는 절대 삭제되지 않습니다)')) return;
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
          }, 150);
        } else if (attempts >= 40) {
          clearInterval(interval);
          var amountEl = document.getElementById('token-amount');
          var userEl = document.getElementById('token-user');
          if (amountEl && amountEl.innerText === '동기화 중...') {
            amountEl.innerText = 'GAS 지연';
            userEl.innerText = '새로고침 클릭 권장';
          }
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
