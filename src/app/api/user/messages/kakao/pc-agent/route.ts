export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  completePcKakaoJob,
  getOrCreatePairingCode,
  getUserPcAgentStatus,
  recordPcAgentHeartbeat,
  resolveUserEmailFromAuth,
  waitForNextJobForUser,
} from "@/lib/kakao-pc-relay-store";
import {
  markKakaoMessagesDeletedInSheets,
  syncPcLiveKakaoMessageToSheets,
} from "@/lib/ai-copilot-learning";
import {
  getKakaoMediaUserSettings,
  KakaoMediaUserSettings,
} from "@/lib/kakao-media-analyzer";

/**
 * 이용자 맞춤형 원클릭 Windows 실행 배치 파일(.bat) 생성
 * - Windows 10/11 기본 내장 curl.exe로 최신 sheetbot_pc_kakao_agent.py를 자동 다운로드 후 실행합니다.
 */
function buildWindowsBatchLauncher(userEmail: string, pairingCode: string, serverOrigin: string): string {
  const lines = [
    "@echo off",
    "chcp 65001 >nul",
    "title [SheetBot] 내 PC 카카오톡 원격 자동 발송 브리지",
    "echo ===================================================================",
    "echo   💛 [SheetBot] 내 PC 카카오톡 원격 자동 발송 브리지 시작",
    `echo   • 연결 계정 : ${userEmail || "(실행 시 입력)"}`,
    `echo   • 페어링 키 : SB-${pairingCode}`,
    "echo ===================================================================",
    "echo.",
    'set "SB_DIR=%USERPROFILE%\\.sheetbot"',
    'if not exist "%SB_DIR%" mkdir "%SB_DIR%"',
    `set "SHEETBOT_SERVER_URL=${serverOrigin}"`,
    `set "SHEETBOT_USER_EMAIL=${userEmail}"`,
    `set "SHEETBOT_PAIRING_CODE=${pairingCode}"`,
    'echo [1/2] 최신 시트봇 PC 카톡 브리지 엔진 동기화 중...',
    `curl.exe -sSL "${serverOrigin}/downloads/sheetbot_pc_kakao_agent.py" -o "%SB_DIR%\\sheetbot_pc_kakao_agent.py"`,
    'if not exist "%SB_DIR%\\sheetbot_pc_kakao_agent.py" (',
    '  echo ❌ 브리지 스크립트 다운로드에 실패했습니다. 인터넷 연결을 확인해 주세요.',
    "  pause",
    "  exit /b 1",
    ")",
    "echo [2/2] Python 런타임 확인 및 브리지 가동...",
    "where python >nul 2>nul",
    "if %ERRORLEVEL% NEQ 0 (",
    "  where py >nul 2>nul",
    "  if %ERRORLEVEL% EQU 0 (",
    '    py "%SB_DIR%\\sheetbot_pc_kakao_agent.py"',
    "    pause",
    "    exit /b 0",
    "  )",
    "  echo ⚠️ 이 PC에 Python이 설치되어 있지 않습니다. Microsoft Store 또는 python.org에서 Python 3를 설치해 주세요.",
    "  start https://www.python.org/downloads/",
    "  pause",
    "  exit /b 1",
    ")",
    'python "%SB_DIR%\\sheetbot_pc_kakao_agent.py"',
    "pause",
  ];
  return lines.join("\r\n");
}

function formatDisplayAccount(userEmail: string): string {
  const ftsMatch = (userEmail || "").match(/^([0-9]{3})([0-9]{3,4})([0-9]{4})@(fts\.local|filetosheet\.cloud)$/);
  if (ftsMatch) {
    return `${ftsMatch[1]}-${ftsMatch[2]}-${ftsMatch[3]} (파투 휴대폰 계정)`;
  }
  return userEmail || "시트봇 / 파투 로그인 계정";
}

/**
 * 이용자 안내 및 원클릭 다운로드 웹페이지 HTML 생성
 */
function buildGuideHtml(
  userEmail: string,
  status: ReturnType<typeof getUserPcAgentStatus>,
  serverOrigin: string,
  mediaSettings: KakaoMediaUserSettings
): string {
  const encodedEmail = encodeURIComponent(userEmail);
  const displayAccount = formatDisplayAccount(userEmail);
  const batUrl = `${serverOrigin}/api/user/messages/kakao/pc-agent?download=bat&email=${encodedEmail}`;
  const pyUrl = `${serverOrigin}/downloads/sheetbot_pc_kakao_agent.py`;
  const oneLineCmd = `curl.exe -sSL "${batUrl}" -o "%TEMP%\\sb_kakao.bat" && "%TEMP%\\sb_kakao.bat"`;
  const aiChecked = mediaSettings.aiSummaryEnabled ? "checked" : "";
  const taskChecked = mediaSettings.autoTaskFromAttachment ? "checked" : "";

  const badgeHtml = status.online
    ? `<div style="display:inline-flex;align-items:center;gap:8px;background:#ECFDF5;border:1px solid #10B981;color:#065F46;padding:8px 14px;border-radius:999px;font-weight:700;font-size:14px;">
         🟢 내 PC 연결됨 (${status.pcName}) · ${status.kakaoReady ? "PC 카카오톡 준비 완료" : "⚠️ PC 카카오톡 로그인/잠금해제 필요"}
       </div>`
    : `<div style="display:inline-flex;align-items:center;gap:8px;background:#FEF3C7;border:1px solid #F59E0B;color:#92400E;padding:8px 14px;border-radius:999px;font-weight:700;font-size:14px;">
         ⚪ 아직 내 PC 브리지가 실행되지 않았습니다
       </div>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SheetBot 내 PC 카카오톡 원격 발송 및 첨부파일 자동 기록</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Malgun Gothic", sans-serif; background: #0F172A; color: #F8FAFC; margin: 0; padding: 24px 16px; line-height: 1.6; }
    .container { max-width: 640px; margin: 0 auto; background: #1E293B; border: 1px solid #334155; border-radius: 20px; padding: 28px 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.4); }
    h1 { font-size: 22px; margin: 0 0 8px 0; color: #FDE047; }
    .sub { color: #94A3B8; font-size: 14px; margin-bottom: 20px; }
    .card { background: #0F172A; border: 1px solid #334155; border-radius: 14px; padding: 18px; margin-top: 16px; }
    .btn { display: block; text-align: center; background: #FACC15; color: #1E1B4B; font-weight: 800; font-size: 16px; padding: 15px 20px; border-radius: 12px; text-decoration: none; margin-top: 14px; }
    .btn:hover { background: #FDE047; }
    code { display: block; background: #020617; color: #38BDF8; padding: 12px; border-radius: 10px; font-size: 12.5px; word-break: break-all; margin-top: 8px; border: 1px solid #1E293B; }
    .step { font-weight: 700; color: #E2E8F0; margin-bottom: 6px; font-size: 15px; }
    .meta { font-size: 13px; color: #CBD5E1; }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid #1E293B; }
    .toggle-row:first-of-type { border-top: none; padding-top: 4px; }
    .toggle-label { font-size: 14px; font-weight: 600; color: #F1F5F9; }
    .toggle-desc { font-size: 12px; color: #94A3B8; margin-top: 2px; }
    .switch { position: relative; display: inline-block; width: 46px; height: 26px; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; inset: 0; background-color: #475569; transition: .2s; border-radius: 999px; }
    .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background-color: white; transition: .2s; border-radius: 50%; }
    input:checked + .slider { background-color: #10B981; }
    input:checked + .slider:before { transform: translateX(20px); }
    .save-status { font-size: 12px; color: #34D399; margin-top: 6px; min-height: 18px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>💛 시트봇 내 PC 카카오톡 브리지 (v2.2)</h1>
    <div class="sub">외출 중 무포커스 카톡 발송, 실시간 대화·삭제 감지, 첨부 사진·파일(최대 20MB 청크 업로드) 구글 드라이브 보관 및 AI 자동 요약까지 지원합니다.</div>
    ${badgeHtml}

    <div class="card">
      <div class="step">1단계 · 내 Windows PC에서 카카오톡 로그인</div>
      <div class="meta">카톡을 받을 내 개인/사무실 PC에서 <b>PC 카카오톡</b>을 실행하고 로그인(잠금모드 해제)해 두세요.</div>
    </div>

    <div class="card">
      <div class="step">2단계 · 내 계정 전용 원클릭 브리지 실행 (최초 1회)</div>
      <div class="meta">
        연결 계정: <b style="color:#FDE047;">${displayAccount}</b> &nbsp;|&nbsp;
        페어링 코드: <b style="color:#38BDF8;">SB-${status.pairingCode}</b>
      </div>
      <a class="btn" href="${batUrl}">📥 내 PC 전용 원클릭 실행파일 (.bat) 다운로드</a>
      <div class="meta" style="margin-top:12px;">
        다운로드한 <b>SheetBot_PC_Kakao_Bridge.bat</b> 파일을 내 PC에서 더블클릭하면 즉시 연결됩니다.<br/>
        (시트봇 구글 이메일 회원과 <b>파투(FileToSheet) 휴대폰 번호 회원</b> 모두 동일하게 사용 가능합니다.)<br/>
        (단독 Python 스크립트 직접 받기: <a href="${pyUrl}" style="color:#38BDF8;">sheetbot_pc_kakao_agent.py</a>)
      </div>
    </div>

    <div class="card">
      <div class="step">📎 첨부 사진·파일 AI 자동 요약 및 할 일 연계 설정</div>
      <div class="toggle-row">
        <div>
          <div class="toggle-label">첨부 사진·파일 AI 내용 자동 요약</div>
          <div class="toggle-desc">엑셀·텍스트 무료 즉시 요약 + 사진·PDF·음성 경량 AI 1줄 요약(짤방 자동 제외)을 구글 시트 E열에 자동 기록합니다.</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="toggleAiSummary" ${aiChecked} onchange="saveKakaoSettings()" />
          <span class="slider"></span>
        </label>
      </div>
      <div class="toggle-row">
        <div>
          <div class="toggle-label">업무 문서 첨부 시 할 일 자동 생성</div>
          <div class="toggle-desc">견적서·발주서·계약서·입금요청 등 업무 문서가 첨부되면 요약 내용을 분석해 할 일 허브에 자동 등록합니다.</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="toggleAutoTask" ${taskChecked} onchange="saveKakaoSettings()" />
          <span class="slider"></span>
        </label>
      </div>
      <div id="settingSaveStatus" class="save-status"></div>
    </div>

    <div class="card">
      <div class="step">💡 Windows 명령 프롬프트(CMD) 1줄 즉시 실행 명령어</div>
      <div class="meta">파일 다운로드 없이 내 PC의 CMD 창에 아래 한 줄을 붙여넣어도 즉시 실행됩니다:</div>
      <code id="cmdBox">${oneLineCmd}</code>
      <button onclick="navigator.clipboard.writeText(document.getElementById('cmdBox').innerText);this.innerText='✅ 복사되었습니다!';" style="margin-top:10px;background:#334155;color:#F8FAFC;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:700;">📋 1줄 명령어 복사</button>
    </div>
  </div>
  <script>
    async function saveKakaoSettings() {
      const statusEl = document.getElementById('settingSaveStatus');
      const aiSummaryEnabled = document.getElementById('toggleAiSummary').checked;
      const autoTaskFromAttachment = document.getElementById('toggleAutoTask').checked;
      statusEl.textContent = '저장 중...';
      try {
        const res = await fetch('/api/user/messages/kakao/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: ${JSON.stringify(userEmail)},
            aiSummaryEnabled,
            autoTaskFromAttachment
          })
        });
        const data = await res.json();
        statusEl.textContent = data.success ? '✅ 설정이 저장되었습니다.' : ('⚠️ ' + (data.error || '저장 실패'));
      } catch (e) {
        statusEl.textContent = '⚠️ 네트워크 오류로 저장하지 못했습니다.';
      }
    }
  </script>
</body>
</html>`;
}

/**
 * GET /api/user/messages/kakao/pc-agent
 * 1) ?download=bat&email=... : 이용자 전용 원클릭 실행 .bat 다운로드
 * 2) ?guide=1&email=...      : 내 PC 카톡 연결 안내 및 상태 확인 웹페이지
 * 3) ?status=1&email=...     : 모바일 앱용 내 PC 브리지 온라인 상태 조회
 * 4) ?email=...&waitMs=12000 : 이용자 PC 브리지의 아웃바운드 Long-Polling 작업 수신
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const downloadMode = url.searchParams.get("download");
  const isGuide = url.searchParams.get("guide") === "1";
  const isStatusOnly = url.searchParams.get("status") === "1";

  const queryEmail = url.searchParams.get("email") || "";
  const queryPhone = url.searchParams.get("phone") || "";
  const queryCode = url.searchParams.get("code") || "";
  const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
  const headerEmail = req.headers.get("x-sheetbot-user-email") || "";
  const headerPhone =
    req.headers.get("x-filetosheet-phone") || req.headers.get("x-user-phone") || "";

  const resolvedEmail =
    resolveUserEmailFromAuth(
      queryEmail || headerEmail || sessionEmail || queryPhone || headerPhone || "",
      queryCode,
      queryPhone || headerPhone
    ) || "";

  const serverOrigin = "https://sheetbot.cloud";

  // 1. 원클릭 .bat 실행 파일 다운로드
  if (downloadMode === "bat") {
    const pairingCode = getOrCreatePairingCode(resolvedEmail);
    const batContent = buildWindowsBatchLauncher(resolvedEmail, pairingCode, serverOrigin);
    return new NextResponse(batContent, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream; charset=utf-8",
        "Content-Disposition": 'attachment; filename="SheetBot_PC_Kakao_Bridge.bat"',
        "Cache-Control": "no-store",
      },
    });
  }

  // 2. 연결 가이드 웹페이지
  if (isGuide) {
    const status = getUserPcAgentStatus(resolvedEmail);
    const mediaSettings = await getKakaoMediaUserSettings(resolvedEmail);
    const html = buildGuideHtml(resolvedEmail, status, serverOrigin, mediaSettings);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // 3. 모바일 앱 및 파투(FileToSheet) 웹에서 내 PC 연결 상태 조회 (CORS 허용)
  if (isStatusOnly) {
    const status = getUserPcAgentStatus(resolvedEmail);
    const encodedEmail = encodeURIComponent(resolvedEmail);
    return NextResponse.json(
      {
        success: true,
        userEmail: resolvedEmail,
        ...status,
        guideUrl: `${serverOrigin}/api/user/messages/kakao/pc-agent?guide=1&email=${encodedEmail}`,
        downloadBatUrl: `${serverOrigin}/api/user/messages/kakao/pc-agent?download=bat&email=${encodedEmail}`,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  // 4. 이용자 개인 PC 브리지의 아웃바운드 Long-Polling
  let effectiveEmail = resolvedEmail;
  if (!effectiveEmail) {
    const cleanPhoneFallback = (queryPhone || headerPhone || queryEmail).replace(/[^0-9]/g, "");
    const cleanCodeFallback = (queryCode || queryEmail).toUpperCase().trim().replace(/^SB-/, "");
    if (cleanPhoneFallback.length >= 9 && cleanPhoneFallback.startsWith("01")) {
      effectiveEmail = `${cleanPhoneFallback}@fts.local`;
    } else if (/^[0-9A-F]{6}$/.test(cleanCodeFallback)) {
      effectiveEmail = `code-${cleanCodeFallback.toLowerCase()}@fts.local`;
    }
  }

  if (!effectiveEmail) {
    return NextResponse.json(
      {
        ok: false,
        error: "시트봇 계정 이메일(email) 또는 페어링 코드(code)가 필요합니다.",
      },
      { status: 400 }
    );
  }

  const pcName = url.searchParams.get("pcName") || "내 Windows PC";
  const kakaoReady = url.searchParams.get("kakaoReady") === "1";
  const kakaoDetail = url.searchParams.get("kakaoDetail") || "";
  const waitMs = Number(url.searchParams.get("waitMs") || "8000");

  recordPcAgentHeartbeat({
    userEmail: effectiveEmail,
    phoneNumber: queryPhone || headerPhone,
    pcName,
    kakaoReady,
    kakaoDetail,
  });

  const job = await waitForNextJobForUser(effectiveEmail, pcName, waitMs);

  return NextResponse.json(
    {
      ok: true,
      userEmail: effectiveEmail,
      job: job
        ? {
            jobId: job.jobId,
            roomName: job.roomName,
            recipientName: job.recipientName,
            message: job.message,
          }
        : null,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

/**
 * POST /api/user/messages/kakao/pc-agent
 * 이용자 PC 브리지가 카톡 전송을 마친 뒤 성공/실패 결과를 보고하는 엔드포인트
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      action = "",
      jobId = "",
      email = "",
      phone = "",
      code = "",
      pcName = "내 PC",
      ok = false,
      confirmed = false,
      alreadyOpen = false,
      draftPresent = false,
      error = "",
      messages = [],
      deletedMessages = [],
    } = body;

    const resolvedEmail = resolveUserEmailFromAuth(email || phone, code, phone) || "";

    // 0. PC 카톡 브리지(kakao_native)가 감지한 삭제 메시지/첨부파일 -> 시트 원본 보존 + G열 '삭제됨' 상태 표시
    if (action === "MARK_DELETED" && Array.isArray(deletedMessages)) {
      if (resolvedEmail) {
        recordPcAgentHeartbeat({
          userEmail: resolvedEmail,
          phoneNumber: phone,
          pcName,
          kakaoReady: true,
        });
      }

      const normalized = deletedMessages
        .filter((m: any) => m && typeof m === "object")
        .map((m: any) => ({
          logId: m.logId ?? m.log_id,
          roomName: String(m.roomName || m.room || ""),
          senderName: String(m.senderName || m.sender || ""),
          message: String(m.message || m.text || ""),
          deleteType: String(m.deleteType || "LOCAL"),
          deletedAtStr: String(m.deletedAtStr || ""),
        }));

      const res = await markKakaoMessagesDeletedInSheets({
        userEmail: resolvedEmail || email,
        phoneNumber: phone,
        deletedMessages: normalized,
        pcName: String(pcName || "내 PC"),
        req,
      });

      return NextResponse.json({
        ok: true,
        action: "MARK_DELETED",
        ...res,
      });
    }

    // 1. PC 카톡 브리지(kakao_native)가 감지한 '열린 대화창 실시간 대화(수신 + 내 PC 직접 발신)' 일괄 적재
    if (action === "SYNC_MESSAGES" && Array.isArray(messages)) {
      if (resolvedEmail) {
        recordPcAgentHeartbeat({
          userEmail: resolvedEmail,
          phoneNumber: phone,
          pcName,
          kakaoReady: true,
        });
      }

      let syncedCount = 0;
      let deduplicatedCount = 0;
      for (const m of messages) {
        if (!m || typeof m !== "object") continue;
        const res = await syncPcLiveKakaoMessageToSheets({
          userEmail: resolvedEmail || email,
          phoneNumber: phone,
          roomName: String(m.roomName || m.room || ""),
          senderName: String(m.senderName || m.sender || ""),
          message: String(m.message || m.text || ""),
          mine: Boolean(m.mine),
          sentAtStr: String(m.sentAtStr || ""),
          logId: m.logId ?? m.log_id,
          pcName: String(pcName || "내 PC"),
          req,
        });
        if (res.synced) syncedCount++;
        if (res.deduplicated) deduplicatedCount++;
      }

      return NextResponse.json({
        ok: true,
        action: "SYNC_MESSAGES",
        syncedCount,
        deduplicatedCount,
      });
    }

    if (!jobId) {
      return NextResponse.json({ ok: false, error: "jobId가 누락되었습니다." }, { status: 400 });
    }

    if (resolvedEmail) {
      recordPcAgentHeartbeat({
        userEmail: resolvedEmail,
        pcName,
        kakaoReady: Boolean(ok),
      });
    }

    const updated = completePcKakaoJob({
      jobId,
      userEmail: resolvedEmail,
      ok: Boolean(ok),
      confirmed: Boolean(confirmed),
      alreadyOpen: Boolean(alreadyOpen),
      draftPresent: Boolean(draftPresent),
      error: String(error || ""),
      pcName: String(pcName || "내 PC"),
    });

    return NextResponse.json({
      ok: true,
      jobId,
      status: updated?.status || "UNKNOWN",
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "결과 보고 처리 실패" },
      { status: 500 }
    );
  }
}
