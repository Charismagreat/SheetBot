export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import crypto from "crypto";

/**
 * GET /api/wallet/agent/pair
 * 로그인된 회원의 실시간 QR 페어링 토큰 및 6자리 핀코드 발급/조회
 */
export async function GET(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 1회용/지속 페어링 해시 생성 (1시간 유효 또는 고정 토큰)
    const secretKey = process.env.NEXTAUTH_SECRET || "sheetbot-agent-secret-key-2026";
    const todayStr = new Date().toISOString().slice(0, 10);
    const token = crypto
      .createHmac("sha256", secretKey)
      .update(`${cleanEmail}-${todayStr}`)
      .digest("hex")
      .slice(0, 16);

    // 사용자가 입력하기 쉬운 6자리 숫자 핀코드 생성
    const pinHash = crypto.createHash("md5").update(`${cleanEmail}-${token}`).digest("hex");
    const pinCode = "SB-" + (parseInt(pinHash.slice(0, 6), 16) % 900000 + 100000);

    // QR코드에 인코딩될 JSON 데이터 (1차 메인 & 2차 터널 폴백 URL 이중화)
    const qrPayload = {
      app: "SheetBotDepositAgent",
      version: "1.0",
      userEmail: cleanEmail,
      token,
      pinCode,
      webhookUrl: "https://sheetbot.cloud/api/wallet/bank-webhook",
      fallbackWebhookUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/bank-webhook",
      heartbeatUrl: "https://sheetbot.cloud/api/wallet/agent/heartbeat",
      fallbackHeartbeatUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/agent/heartbeat",
      createdAt: new Date().toISOString(),
    };

    const qrUri = `sheetbot://pair?email=${encodeURIComponent(cleanEmail)}&token=${encodeURIComponent(token)}&pin=${encodeURIComponent(pinCode)}`;

    return NextResponse.json({
      success: true,
      userEmail: cleanEmail,
      token,
      pinCode,
      qrData: qrUri,
      webhookUrl: qrPayload.webhookUrl,
      fallbackWebhookUrl: qrPayload.fallbackWebhookUrl,
    });
  } catch (err: any) {
    console.error("[Agent-Pair] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/wallet/agent/pair
 * 안드로이드 앱에서 QR코드 스캔 또는 핀코드 입력으로 페어링 요청
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json().catch(() => ({}));
    const { userEmail, token, pinCode, deviceModel, appVersion, phoneNumber } = body;

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "userEmail이 누락되었습니다." }, { status: 400 });
    }

    const cleanEmail = String(userEmail).toLowerCase().trim();

    // 토큰 또는 핀코드 유효성 검증
    // 1. 슈퍼 마스터 핀코드 (긴급 연동용)
    const normalizedPin = String(pinCode || "").replace(/[^0-9]/g, "");
    const isMasterPin = ["777777", "123456", "000000"].includes(normalizedPin);

    // 2. 최근 3일간의 날짜 기반 토큰 및 핀코드 검증 (시차 및 만료 오차 방지)
    const secretKeys = [
      process.env.NEXTAUTH_SECRET || "",
      "sheetbot-agent-secret-key-2026",
      "sheetbot_secret_2026_default_key_32chars",
    ].filter(Boolean);

    let isTokenValid = false;
    let isPinValid = false;

    // 관리자 이메일(chachogreat@gmail.com 등) 여부 사전 체크
    const { isCurrentUserAdmin } = await import("@/lib/auth");
    const isAdminEmail = cleanEmail === "chachogreat@gmail.com" || (await isCurrentUserAdmin(cleanEmail).catch(() => false));

    // 관리자 계정이면서 QR 스캔 토큰이나 핀코드가 함께 전달된 경우 즉시 통과
    if (isAdminEmail && (token || pinCode)) {
      isTokenValid = true;
    }

    if (!isTokenValid && !isMasterPin) {
      for (let offset = -2; offset <= 2; offset++) {
        const d = new Date(Date.now() + offset * 86400000);
        const dayStr = d.toISOString().slice(0, 10);

        for (const secKey of secretKeys) {
          const expToken = crypto
            .createHmac("sha256", secKey)
            .update(`${cleanEmail}-${dayStr}`)
            .digest("hex")
            .slice(0, 16);

          const pHash = crypto.createHash("md5").update(`${cleanEmail}-${expToken}`).digest("hex");
          const expPin = (parseInt(pHash.slice(0, 6), 16) % 900000 + 100000).toString();

          if (token && token === expToken) {
            isTokenValid = true;
            break;
          }
          if (normalizedPin && normalizedPin === expPin) {
            isPinValid = true;
            break;
          }
        }
        if (isTokenValid || isPinValid) break;
      }
    }

    if (!isTokenValid && !isPinValid && !isMasterPin && !isAdminEmail) {
      return NextResponse.json(
        { success: false, error: "유효하지 않거나 만료된 페어링 정보입니다. PC 화면의 QR코드를 새로고침 후 다시 스캔해 주세요." },
        { status: 403 }
      );
    }

    const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
    const deviceId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const label = deviceModel ? `스마트폰 (${deviceModel})` : "SheetBot 안드로이드 전용 에이전트";

    // 기존 등록된 동일 기기 모델이 있는지 우선 탐색 (동일 기기 중복 등록 방지)
    const allExisting = await queryTable("sheetbot_user_devices", {
      filters: { user_email: cleanEmail, pairing_mode: "android_agent" },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 20,
    }).catch(() => ({ rows: [] }));

    const matchingDev = (allExisting.rows || []).find(
      (r: any) => !r.deleted_at && deviceModel && r.label && r.label.includes(deviceModel)
    );

    if (matchingDev) {
      // 동일 기기 모델이 이미 있으면 해당 기기 상태 갱신
      await updateRows(
        "sheetbot_user_devices",
        {
          label,
          status: "CONNECTED",
          phone_number: phoneNumber || matchingDev.phone_number || "",
          last_connected_at: nowStr,
          updated_at: nowStr,
        },
        { filters: { id: matchingDev.id } }
      );
    } else {
      // 새로운 스마트폰 모델이면 신규 등록 (이중화 기기 추가)
      const latestDev = await queryTable("sheetbot_user_devices", {
        limit: 1,
        orderBy: "id",
        orderDirection: "DESC",
      }).catch(() => ({ rows: [] }));
      const nextId = (Number(latestDev.rows?.[0]?.id) || 0) + 1;

      await insertRows("sheetbot_user_devices", [
        {
          id: nextId,
          user_email: cleanEmail,
          label,
          phone_number: phoneNumber || "",
          device_id: deviceId,
          pairing_mode: "android_agent",
          status: "CONNECTED",
          last_connected_at: nowStr,
          created_at: nowStr,
        },
      ]);
    }

    // 디바이스 전용 인증 토큰 발급
    const deviceToken = crypto.randomBytes(24).toString("hex");

    return NextResponse.json({
      success: true,
      message: "SheetBot Agent M 연동이 성공적으로 완료되었습니다!",
      userEmail: cleanEmail,
      deviceToken,
      webhookUrl: "https://sheetbot.cloud/api/wallet/bank-webhook",
      fallbackWebhookUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/bank-webhook",
      heartbeatUrl: "https://sheetbot.cloud/api/wallet/agent/heartbeat",
      fallbackHeartbeatUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/agent/heartbeat",
      testSmsUrl: "https://sheetbot.cloud/api/wallet/agent/test-sms",
      serverTime: nowStr,
    });
  } catch (err: any) {
    console.error("[Agent-Pair] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
