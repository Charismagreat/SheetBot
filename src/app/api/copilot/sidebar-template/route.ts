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
    .code-box {
      background: #0f172a;
      color: #38bdf8;
      font-family: monospace;
      font-size: 11px;
      padding: 8px;
      border-radius: 6px;
      word-break: break-all;
      margin: 6px 0;
      user-select: all;
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
      <button onclick="refreshBalance()" style="border:none;background:none;cursor:pointer;font-size:11px;color:#2563eb;">🔄 새로고침</button>
    </div>
    <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px;">
      <span class="token-val" id="token-amount">조회 중...</span>
      <span style="font-size: 11px; color: #64748b;" id="token-user">연동 확인 중</span>
    </div>
    <div style="display: flex; gap: 6px;">
      <button class="btn btn-primary" style="flex: 1;" onclick="google.script.run.openTokenRechargeModal()">충전하기</button>
      <a href="https://sheetbot.cloud/use-cases" class="btn btn-secondary" style="flex: 1.2;">📖 활용사례 40+</a>
    </div>
  </div>

  <!-- [2] 인프라 실시간 진단 -->
  <div class="card">
    <div class="card-title">
      <span>⚡ EGDesk 인프라 진단</span>
      <span id="tunnel-status" style="font-size: 10px; color: #eab308;">진단 중...</span>
    </div>
    <div class="status-row">
      <span>클라우드 터널</span>
      <span id="tunnel-latency" style="font-weight: 600;">-</span>
    </div>
    <button class="btn btn-secondary" style="margin-top: 6px;" onclick="checkTunnel()">인프라 재점검</button>
  </div>

  <!-- [3] 안티그라비티 AI 연결 센터 -->
  <div class="card" style="border-left: 4px solid #8b5cf6;">
    <div class="card-title">
      <span>🚀 안티그라비티 AI 스튜디오</span>
    </div>
    <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">
      구글 시트와 직접 대화하며 수식, 차트, Apps Script를 실시간 제어하세요.
    </div>
    <button class="btn btn-primary" style="background: #7c3aed; margin-bottom: 6px;" onclick="openAntigravity()">안티그라비티 열기</button>
    <div class="code-box" id="sheet-bridge-info">시트 정보 수집 중...</div>
    <button class="btn btn-secondary" onclick="copyPrompt()">📋 코파일럿 프롬프트 복사</button>
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
    SheetBot Cloud Engine &bull; Auto-synced v2.0
  </div>

  <script>
    function refreshBalance() {
      document.getElementById('token-amount').innerText = '조회 중...';
      if (window.google && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(data) {
            document.getElementById('token-amount').innerText = (data.balance || '0') + ' P';
            document.getElementById('token-user').innerText = data.email || '연동됨';
          })
          .withFailureHandler(function() {
            document.getElementById('token-amount').innerText = '오류';
          })
          .getUserTokenBalanceData();
      } else {
        document.getElementById('token-amount').innerText = '1,000 P';
        document.getElementById('token-user').innerText = 'demo@sheetbot.cloud';
      }
    }

    function checkTunnel() {
      var statusEl = document.getElementById('tunnel-status');
      var latEl = document.getElementById('tunnel-latency');
      statusEl.innerText = '진단 중...';
      statusEl.style.color = '#eab308';
      if (window.google && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(res) {
            statusEl.innerText = res.ok ? '정상 연결됨' : '연결 지연';
            statusEl.style.color = res.ok ? '#059669' : '#dc2626';
            latEl.innerText = res.latency ? res.latency + ' ms' : '정상';
          })
          .withFailureHandler(function() {
            statusEl.innerText = '점검 실패';
            statusEl.style.color = '#dc2626';
          })
          .getTunnelStatusData();
      } else {
        setTimeout(function() {
          statusEl.innerText = '정상 연결됨';
          statusEl.style.color = '#059669';
          latEl.innerText = '112 ms';
        }, 300);
      }
    }

    function openAntigravity() {
      if (window.google && google.script && google.script.run) {
        google.script.run.openAntigravityStudio();
      } else {
        window.open('https://antigravity.google/', '_blank');
      }
    }

    function copyPrompt() {
      var box = document.getElementById('sheet-bridge-info');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(box.innerText).then(function() {
          alert('프롬프트가 클립보드에 복사되었습니다.');
        });
      }
    }

    function confirmUninstall() {
      if (confirm('정말로 시트봇 연동을 해제하고 모든 자동화 스크립트를 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.')) {
        if (window.google && google.script && google.script.run) {
          google.script.run
            .withSuccessHandler(function(msg) {
              alert(msg || '연동 해제가 완료되었습니다. 시트를 새로고침(F5)하세요.');
            })
            .withFailureHandler(function(err) {
              alert('해제 실패: ' + err.message);
            })
            .uninstallSheetBot();
        }
      }
    }

    window.onload = function() {
      refreshBalance();
      checkTunnel();
      if (window.google && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(info) {
            document.getElementById('sheet-bridge-info').innerText = info;
          })
          .getSheetBridgePrompt();
      } else {
        document.getElementById('sheet-bridge-info').innerText = 'Sheet ID: sample-sheet-id\nActive Tab: Sheet1';
      }
    };
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
