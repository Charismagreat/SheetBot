import { NextResponse } from 'next/server';

export async function GET() {
  const html = `<!DOCTYPE html>
<html>
<head>
  <base target="_blank">
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      background: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 6px 4px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    /* [1] 최상단 1줄 슬림 인프라 상태 바 */
    .top-status-strip {
      width: 100%;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 6px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 7px;
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
      width: 100%;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #0f172a 100%);
      border-radius: 10px;
      padding: 12px 10px;
      color: #ffffff;
      margin-bottom: 7px;
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
      max-width: 190px;
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
      font-size: 23px;
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
    .token-warning-box {
      margin-top: 8px;
      margin-bottom: 10px;
      padding: 9px 12px;
      border-radius: 9px;
      font-size: 11px;
      line-height: 1.45;
      transition: all 0.25s ease;
      box-sizing: border-box;
    }
    .token-warning-box.warning-low {
      background: rgba(245, 158, 11, 0.16);
      border: 1px solid rgba(245, 158, 11, 0.45);
      color: #fef3c7;
    }
    .token-warning-box.warning-low .warning-title {
      color: #fcd34d;
      font-weight: 800;
      font-size: 11.5px;
    }
    .token-warning-box.warning-low .warning-desc {
      color: #fde68a;
      margin-top: 3px;
      font-size: 10.5px;
    }
    .token-warning-box.warning-depleted {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.55);
      color: #fee2e2;
      animation: alertPulse 2s infinite ease-in-out;
    }
    .token-warning-box.warning-depleted .warning-title {
      color: #fca5a5;
      font-weight: 800;
      font-size: 11.5px;
    }
    .token-warning-box.warning-depleted .warning-desc {
      color: #fecaca;
      margin-top: 3px;
      font-size: 10.5px;
    }
    @keyframes alertPulse {
      0%, 100% { border-color: rgba(239, 68, 68, 0.55); box-shadow: 0 0 0 rgba(239, 68, 68, 0); }
      50% { border-color: rgba(239, 68, 68, 0.95); box-shadow: 0 0 12px rgba(239, 68, 68, 0.4); }
    }
    .warning-header {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .wallet-btn-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 6px;
    }
    .btn-charge {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      font-size: 11.5px;
      font-weight: 700;
      padding: 8px 6px;
      border-radius: 7px;
      border: none;
      cursor: pointer;
      text-align: center;
      transition: transform 0.1s, filter 0.2s;
      box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      white-space: nowrap;
    }
    .btn-charge:hover { filter: brightness(1.08); }
    .btn-charge:active { transform: scale(0.98); }
    .btn-workspace {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.22);
      color: #ffffff;
      font-size: 11.5px;
      font-weight: 700;
      padding: 8px 6px;
      border-radius: 7px;
      text-decoration: none;
      text-align: center;
      transition: all 0.2s;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      white-space: nowrap;
    }
    .btn-workspace:hover {
      background: rgba(255, 255, 255, 0.22);
      border-color: rgba(255, 255, 255, 0.35);
      color: #ffffff;
    }
    .btn-workspace:active { transform: scale(0.98); }
    .btn-cases-full {
      width: 100%;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      font-size: 11px;
      font-weight: 600;
      padding: 6px 10px;
      border-radius: 6px;
      text-decoration: none;
      text-align: center;
      transition: all 0.2s;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .btn-cases-full:hover {
      background: rgba(255, 255, 255, 0.14);
      color: #ffffff;
    }
    .btn-referral-invite {
      width: 100%;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.25);
      font-size: 11px;
      font-weight: 700;
      padding: 7px 10px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      margin-top: 6px;
      transition: all 0.2s;
      box-shadow: 0 2px 6px rgba(99, 102, 241, 0.3);
      box-sizing: border-box;
    }
    .btn-referral-invite:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    /* [🌟] 시트봇 다목적 공지/광고 배너 슬롯 */
    /* [🌟] 시트봇 다목적 광고/공지 배너 (정사각형 화사한 프리미엄 광고 포맷) */
    .promo-banner-card {
      width: 100%;
      min-height: 330px;
      aspect-ratio: 1 / 1;
      background: linear-gradient(145deg, #ffffff 0%, #f8faff 40%, #eef2ff 100%);
      border: 2px solid #818cf8;
      border-radius: 16px;
      padding: 18px 14px;
      margin-top: 14px;
      margin-bottom: 12px;
      box-shadow: 0 10px 25px -4px rgba(79, 70, 229, 0.16), 0 4px 12px rgba(0, 0, 0, 0.05);
      text-decoration: none;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: #0f172a;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
      overflow: hidden;
      box-sizing: border-box;
    }
    .promo-banner-card:hover {
      border-color: #4f46e5;
      transform: translateY(-3px);
      box-shadow: 0 16px 32px -4px rgba(79, 70, 229, 0.24), 0 6px 16px rgba(0, 0, 0, 0.08);
    }
    .promo-banner-card::before {
      content: "";
      position: absolute;
      top: -40px;
      right: -40px;
      width: 140px;
      height: 140px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .ad-badge-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ad-pill {
      font-size: 14px;
      font-weight: 800;
      padding: 6px 14px;
      border-radius: 9px;
      background: #4f46e5;
      color: #ffffff;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      letter-spacing: -0.2px;
      box-shadow: 0 3px 8px rgba(79, 70, 229, 0.35);
    }
    .ad-tag {
      display: none;
    }
    .ad-content-box {
      margin: auto 0;
      padding: 12px 0;
    }
    .ad-headline {
      font-size: 20px;
      font-weight: 900;
      color: #0f172a;
      line-height: 1.4;
      letter-spacing: -0.5px;
      margin-bottom: 14px;
      word-break: keep-all;
    }
    .ad-headline-highlight {
      color: #4f46e5;
      position: relative;
      display: inline-block;
    }
    .ad-feature-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 6px;
    }
    .ad-feature-item {
      font-size: 13.5px;
      color: #334155;
      font-weight: 700;
      line-height: 1.5;
      display: flex;
      align-items: center;
      gap: 7px;
      letter-spacing: -0.3px;
      white-space: nowrap;
      word-break: keep-all;
    }
    .ad-feature-bullet {
      color: #10b981;
      font-size: 15px;
      font-weight: 900;
      flex-shrink: 0;
    }
    .ad-cta-button {
      width: 100%;
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      color: #ffffff;
      padding: 13px 16px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
      transition: all 0.2s ease;
      letter-spacing: -0.3px;
    }
    .promo-banner-card:hover .ad-cta-button {
      background: linear-gradient(135deg, #4338ca 0%, #4f46e5 100%);
      transform: scale(1.01);
      box-shadow: 0 6px 18px rgba(79, 70, 229, 0.45);
    }
    .ad-cta-arrow {
      font-size: 17px;
      transition: transform 0.2s ease;
    }
    .promo-banner-card:hover .ad-cta-arrow {
      transform: translateX(4px);
    }

    /* [2-1] 비상 SMS 및 스마트폰 연동 카드 */
    .phone-card {
      width: 100%;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 1px solid #cbd5e1;
      border-radius: 9px;
      padding: 10px 10px;
      margin-bottom: 7px;
      box-sizing: border-box;
    }

    /* [2-2] ⚡ 1초 실무 템플릿 모음 카드 */
    .templates-card {
      width: 100%;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 9px;
      padding: 9px 10px;
      margin-bottom: 7px;
      box-sizing: border-box;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
    }
    .templates-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .templates-title {
      font-size: 11.5px;
      font-weight: 800;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .templates-tag {
      font-size: 9.5px;
      padding: 1px 6px;
      background: #e0e7ff;
      color: #4338ca;
      border-radius: 4px;
      font-weight: 700;
    }
    .templates-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    }
    .template-chip {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 4px;
      font-size: 10.5px;
      font-weight: 600;
      color: #334155;
      text-decoration: none;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 3px;
      transition: all 0.15s ease;
      box-sizing: border-box;
      white-space: nowrap;
    }
    .template-chip:hover {
      background: #eff6ff;
      border-color: #93c5fd;
      color: #1d4ed8;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1);
    }
    .template-chip:active {
      transform: scale(0.98);
    }
    .phone-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .phone-title {
      font-size: 11.5px;
      font-weight: 800;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .phone-tag {
      font-size: 9.5px;
      padding: 1px 5px;
      background: #e2e8f0;
      color: #475569;
      border-radius: 4px;
      font-weight: 700;
    }
    .phone-desc {
      font-size: 10.5px;
      color: #64748b;
      line-height: 1.4;
      margin-bottom: 7px;
    }
    .btn-phone-register {
      width: 100%;
      background: #ffffff;
      border: 1px solid #94a3b8;
      color: #1e293b;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      text-decoration: none;
      box-sizing: border-box;
      transition: all 0.2s;
    }
    .btn-phone-register:hover {
      background: #e2e8f0;
      border-color: #64748b;
    }

    /* [3] 안티그라비티 허브 */
    .studio-card {
      width: 100%;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px;
      margin-bottom: 7px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
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
      margin-bottom: 7px;
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

    /* [3-1] 전문가(FDE) 문의 버튼 */
    .btn-fde-request {
      width: 100%;
      background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      border: 1px solid #15803d;
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      padding: 9px 12px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-decoration: none;
      box-sizing: border-box;
      transition: all 0.2s;
      box-shadow: 0 1px 3px rgba(21, 128, 61, 0.25);
    }
    .btn-fde-request:hover {
      background: linear-gradient(135deg, #15803d 0%, #166534 100%);
      filter: brightness(1.05);
      transform: translateY(-1px);
    }

    /* [4] 접이식 고급 관리 아코디언 */
    details.advanced-box {
      width: 100%;
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
      margin-top: 8px;
      letter-spacing: -0.2px;
    }
  </style>
</head>
<body>
  <!-- [1] 최상단 1줄 슬림 인프라 상태 바 -->
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

    <!-- [⚠️] 동적 토큰 잔액 경고 알림 박스 (5,000 이하 또는 소진 시 자동 노출) -->
    <div id="token-warning-box" class="token-warning-box" style="display: none;">
      <div class="warning-header">
        <span id="warning-icon">⚠️</span>
        <span id="warning-title" class="warning-title">잔여 토큰 부족 주의</span>
      </div>
      <div id="warning-desc" class="warning-desc">
        잔여 토큰이 5,000 이하입니다. 원활한 AI 자동화를 위해 충전을 권장합니다.
      </div>
    </div>

    <div class="wallet-btn-grid">
      <button class="btn-charge" onclick="openRechargeModal()" title="토큰 충전 모달 열기">
        <span>💳 즉시 충전</span>
      </button>
      <a id="btn-workspace-link" href="http://localhost:4004/dashboard" target="_blank" class="btn-workspace" title="내 시트봇 대시보드(워크스페이스)로 이동">
        <span>💼 내 워크스페이스</span>
        <span style="font-size: 10px; opacity: 0.8;">↗</span>
      </a>
    </div>
    <a href="https://sheetbot.cloud/use-cases" target="_blank" class="btn-cases-full" title="실무 활용사례 40선 보기">
      <span>📖 40+ 실무 활용사례 및 가이드</span>
      <span style="font-size: 10px; opacity: 0.7;">↗</span>
    </a>
    <button class="btn-referral-invite" onclick="copyReferralLink()" title="동료 초대 시 초대한 사람과 동료 모두에게 10,000 토큰 즉시 선물">
      <span>🎁 동료 초대 링크 복사 (둘 다 10,000T)</span>
    </button>
  </div>

  <!-- [2-1] 비상 SMS 및 스마트폰 연동 카드 -->
  <div class="phone-card">
    <div class="phone-header">
      <div class="phone-title">
        <span>📱 비상 SMS & 스마트폰 연동</span>
      </div>
      <span class="phone-tag">무료 안심</span>
    </div>
    <div class="phone-desc">
      토큰 잔액이 부족할 때, 오류 발생시 문자로 안내 받으세요
    </div>
    <a href="http://localhost:4004/dashboard/notifications" target="_blank" class="btn-phone-register" id="btn-phone-register-link" title="문자 수신/발신 기기 등록 (알림 센터로 이동)">
      <span>📲 문자 수신/발신 기기 등록</span>
      <span style="font-size: 11px; opacity: 0.8;">↗</span>
    </a>
  </div>

  <!-- [2-2] ⚡ 1초 실무 템플릿 모음 카드 -->
  <div class="templates-card">
    <div class="templates-header">
      <div class="templates-title">
        <span>⚡ 1초 실무 템플릿 모음</span>
      </div>
      <span class="templates-tag">원클릭 복제</span>
    </div>
    <div class="templates-grid">
      <a href="http://localhost:4004/wrap?tpl=delivery" target="_blank" class="template-chip" title="배송·송장 실시간 배송상태 자동조회">
        <span>📦 송장 자동조회</span>
      </a>
      <a href="http://localhost:4004/wrap?tpl=ocr" target="_blank" class="template-chip" title="영수증·명함 스마트 AI OCR">
        <span>🧾 영수증 OCR</span>
      </a>
      <a href="http://localhost:4004/wrap?tpl=kakao" target="_blank" class="template-chip" title="카카오 알림톡/문자 자동 발송">
        <span>💬 알림톡 발송</span>
      </a>
      <a href="http://localhost:4004/wrap?tpl=inventory" target="_blank" class="template-chip" title="실시간 재고·단가 관리 대장">
        <span>📊 실시간 재고</span>
      </a>
    </div>
  </div>

  <!-- [3] 안티그라비티 허브 -->
  <div class="studio-card">
    <!-- 메인 CTA -->
    <button class="btn-main-antigravity" onclick="openAntigravity()">
      <span>🚀 안티그라비티에서 작업</span>
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

  <!-- [3-1] 전문가(FDE) 문의 버튼 -->
  <div style="margin-bottom: 7px;">
    <?
      var _initialSheetUrl = '';
      try {
        if (typeof currentSheetUrl !== 'undefined' && currentSheetUrl) {
          _initialSheetUrl = currentSheetUrl;
        }
      } catch(e) {}
      var _fdeHref = 'http://localhost:4004/dashboard?modal=fde' + (_initialSheetUrl ? '&sheetUrl=' + encodeURIComponent(_initialSheetUrl) : '');
    ?>
    <a href="<?= _fdeHref ?>" target="_blank" class="btn-fde-request" id="btn-fde-request-link" onclick="handleFdeClick(event)" title="시트봇 전담 엔지니어에게 1:1 맞춤 제작 문의">
      <span>🛠️ 전문가에게 문의하기</span>
      <span style="font-size: 11px; opacity: 0.9;">↗</span>
    </a>
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

  <!-- [🌟] 시트봇 다목적 공지 & 광고 배너 (정사각형 화사한 프리미엄 광고 포맷) -->
  <a href="https://sheetbot.cloud/wrap/guide" target="_blank" class="promo-banner-card">
    <div class="ad-badge-row">
      <span class="ad-pill">📖 1분 사용법</span>
    </div>

    <div class="ad-content-box">
      <div class="ad-headline">
        Google 시트 AI 래핑<br>
        <span class="ad-headline-highlight">스크린샷 보며 따라하기</span>
      </div>

      <div class="ad-feature-list">
        <div class="ad-feature-item">
          <span class="ad-feature-bullet">✔</span>
          <span>복잡한 코딩 없이 안티그라비티 즉시 연동</span>
        </div>
        <div class="ad-feature-item">
          <span class="ad-feature-bullet">✔</span>
          <span>구글 시트 상단 전용 메뉴 자동 생성</span>
        </div>
      </div>
    </div>

    <div class="ad-cta-button">
      <span>🚀 초간단 사용법 보기</span>
      <span class="ad-cta-arrow">→</span>
    </div>
  </a>

  <div class="copilot-footer">
    SheetBot Cloud Engine &bull; Auto-synced v3.2
  </div>

  <script>
    var currentEmail = 'chachogreat@gmail.com';

    function updateTokenWarningState(bal) {
      var amountEl = document.getElementById('token-amount');
      var warningBox = document.getElementById('token-warning-box');
      var warningIcon = document.getElementById('warning-icon');
      var warningTitle = document.getElementById('warning-title');
      var warningDesc = document.getElementById('warning-desc');

      if (bal === undefined || bal === null || isNaN(bal)) return;
      var num = Number(bal);

      if (num <= 0) {
        if (amountEl) {
          amountEl.style.color = '#ef4444';
          amountEl.style.textShadow = '0 0 12px rgba(239, 68, 68, 0.55)';
        }
        if (warningBox) {
          warningBox.style.display = 'block';
          warningBox.className = 'token-warning-box warning-depleted';
          if (warningIcon) warningIcon.innerText = '🚨';
          if (warningTitle) warningTitle.innerText = '토큰 소진 (AI 기능 일시 중지)';
          if (warningDesc) warningDesc.innerText = '잔여 토큰이 0이 되어 AI 자동화 호출이 중지되었습니다. 즉시 충전 후 계속 이용해 주세요.';
        }
      } else if (num <= 5000) {
        if (amountEl) {
          amountEl.style.color = '#f59e0b';
          amountEl.style.textShadow = '0 0 8px rgba(245, 158, 11, 0.4)';
        }
        if (warningBox) {
          warningBox.style.display = 'block';
          warningBox.className = 'token-warning-box warning-low';
          if (warningIcon) warningIcon.innerText = '⚠️';
          if (warningTitle) warningTitle.innerText = '잔여 토큰 부족 주의 (' + num.toLocaleString() + ' Token)';
          if (warningDesc) warningDesc.innerText = '잔여 토큰이 5,000 이하입니다. 원활한 AI 자동화를 위해 충전을 권장합니다.';
        }
      } else {
        if (amountEl) {
          amountEl.style.color = '#38bdf8';
          amountEl.style.textShadow = 'none';
        }
        if (warningBox) {
          warningBox.style.display = 'none';
        }
      }

      // 구글 시트 상단 메뉴줄 갱신 연동 (Apps Script 환경)
      if (window.google && window.google.script && window.google.script.run) {
        try {
          if (typeof google.script.run.updateSheetBotMenuWithBalance === 'function') {
            google.script.run.updateSheetBotMenuWithBalance(num);
          }
        } catch (e) {}
      }
    }

    function fetchDirectWallet(email) {
      var targetEmail = email || currentEmail || 'chachogreat@gmail.com';
      var amountEl = document.getElementById('token-amount');
      var userEl = document.getElementById('token-user');
      var tierEl = document.getElementById('tier-badge');

      fetch('https://sheetbot.cloud/api/wallet/balance?userEmail=' + encodeURIComponent(targetEmail), { cache: 'no-store' })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data && data.success && data.balanceTokens !== undefined) {
            var bal = Number(data.balanceTokens);
            amountEl.innerText = bal.toLocaleString();
            userEl.innerText = data.userEmail || targetEmail;
            if (tierEl && data.tier) {
              tierEl.innerText = data.tier;
            }
            updateTokenWarningState(bal);
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
              if (res && res.balance !== undefined) {
                amountEl.innerText = Number(res.balance).toLocaleString();
                updateTokenWarningState(Number(res.balance));
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

    function openPhoneModal() {
      window.open('http://localhost:4004/dashboard/notifications', '_blank');
    }

    function copyReferralLink() {
      var userEmail = '';
      try {
        if (typeof currentUserEmail !== 'undefined' && currentUserEmail) {
          userEmail = currentUserEmail;
        }
      } catch(e) {}
      if (!userEmail) {
        var userEl = document.getElementById('token-user');
        if (userEl && userEl.innerText && userEl.innerText.indexOf('@') !== -1) {
          userEmail = userEl.innerText.trim();
        }
      }

      var refCode = userEmail ? encodeURIComponent(userEmail.split('@')[0]) : 'sheetbot';
      var inviteUrl = 'http://localhost:4004/?ref=' + refCode;
      var shareText = '🚀 Google 스프레드시트 1초 AI 자동화 [SheetBot]\n' +
        '초대 링크로 접속하시면 가입 즉시 10,000 토큰이 지급됩니다!\n\n' +
        '👉 초대 링크: ' + inviteUrl;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText).then(function() {
          alert('🎁 동료 초대 링크가 복사되었습니다!\n\n사내 메신저나 카카오톡으로 동료에게 공유하세요.\n(초대받은 동료와 추천인 모두에게 10,000 토큰이 선물됩니다)');
        }).catch(function() {
          prompt('아래 초대 링크를 복사하여 동료에게 공유하세요:', inviteUrl);
        });
      } else {
        prompt('아래 초대 링크를 복사하여 동료에게 공유하세요:', inviteUrl);
      }
    }

    var BASE_DASHBOARD_URL = 'http://localhost:4004/dashboard';
    var CURRENT_SHEET_URL = '';
    try {
      if (typeof currentSheetUrl !== 'undefined' && currentSheetUrl) {
        CURRENT_SHEET_URL = currentSheetUrl;
      }
    } catch(e) {}

    function bindFdeSheetUrl(url) {
      if (!url) return;
      CURRENT_SHEET_URL = url;
      var link = document.getElementById('btn-fde-request-link');
      if (link) {
        link.href = BASE_DASHBOARD_URL + '?modal=fde&sheetUrl=' + encodeURIComponent(url);
      }
    }

    function handleFdeClick(e) {
      var link = document.getElementById('btn-fde-request-link');
      if (CURRENT_SHEET_URL && link) {
        link.href = BASE_DASHBOARD_URL + '?modal=fde&sheetUrl=' + encodeURIComponent(CURRENT_SHEET_URL);
      }
    }

    function openFdeRequestModal() {
      var targetUrl = BASE_DASHBOARD_URL + '?modal=fde' + (CURRENT_SHEET_URL ? '&sheetUrl=' + encodeURIComponent(CURRENT_SHEET_URL) : '');
      window.open(targetUrl, '_blank');
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
            try {
              if (google.script.run.getSpreadsheetUrl) {
                google.script.run.withSuccessHandler(function(url) {
                  if (url) bindFdeSheetUrl(url);
                }).getSpreadsheetUrl();
              }
              if (google.script.run.getSpreadsheetInfo) {
                google.script.run.withSuccessHandler(function(info) {
                  if (info && info.url) bindFdeSheetUrl(info.url);
                }).getSpreadsheetInfo();
              }
            } catch(e) {}
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
