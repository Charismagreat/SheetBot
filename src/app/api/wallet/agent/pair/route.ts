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
    await setupDatabase();
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

    // QR코드에 인코딩될 JSON 데이터
    const qrPayload = {
      app: "SheetBotDepositAgent",
      version: "1.0",
      userEmail: cleanEmail,
      token,
      pinCode,
      webhookUrl: "https://sheetbot.cloud/api/wallet/bank-webhook",
      heartbeatUrl: "https://sheetbot.cloud/api/wallet/agent/heartbeat",
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      userEmail: cleanEmail,
      token,
      pinCode,
      qrData: JSON.stringify(qrPayload),
      webhookUrl: qrPayload.webhookUrl,
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
    const secretKey = process.env.NEXTAUTH_SECRET || "sheetbot-agent-secret-key-2026";
    const todayStr = new Date().toISOString().slice(0, 10);
    const expectedToken = crypto
      .createHmac("sha256", secretKey)
      .update(`${cleanEmail}-${todayStr}`)
      .digest("hex")
      .slice(0, 16);

    const pinHash = crypto.createHash("md5").update(`${cleanEmail}-${expectedToken}`).digest("hex");
    const expectedPin = "SB-" + (parseInt(pinHash.slice(0, 6), 16) % 900000 + 100000);

    const isTokenValid = token && token === expectedToken;
    const isPinValid = pinCode && (pinCode === expectedPin || pinCode.replace(/[^0-9]/g, "") === expectedPin.replace(/[^0-9]/g, ""));

    if (!isTokenValid && !isPinValid) {
      return NextResponse.json(
        { success: false, error: "유효하지 않거나 만료된 페어링 정보입니다. PC 화면의 QR코드를 다시 스캔해 주세요." },
        { status: 403 }
      );
    }

    const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
    const deviceId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const label = deviceModel ? `스마트폰 (${deviceModel})` : "SheetBot 안드로이드 전용 에이전트";

    // 기존 등록된 동일 이메일의 AGENT 기기 업데이트 또는 신규 등록
    const existing = await queryTable("sheetbot_user_devices", {
      filters: { user_email: cleanEmail, pairing_mode: "android_agent" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (existing.rows && existing.rows.length > 0) {
      const existingId = existing.rows[0].id;
      await updateRows(
        "sheetbot_user_devices",
        {
          label,
          status: "CONNECTED",
          phone_number: phoneNumber || existing.rows[0].phone_number || "",
          last_connected_at: nowStr,
          updated_at: nowStr,
        },
        { filters: { id: existingId } }
      );
    } else {
      await insertRows("sheetbot_user_devices", [
        {
          id: deviceId,
          user_email: cleanEmail,
          label,
          phone_number: phoneNumber || "",
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
      message: "SheetBot 무통장 입금확인기 연동이 성공적으로 완료되었습니다!",
      userEmail: cleanEmail,
      deviceToken,
      webhookUrl: "https://sheetbot.cloud/api/wallet/bank-webhook",
      heartbeatUrl: "https://sheetbot.cloud/api/wallet/agent/heartbeat",
      testSmsUrl: "https://sheetbot.cloud/api/wallet/agent/test-sms",
      serverTime: nowStr,
    });
  } catch (err: any) {
    console.error("[Agent-Pair] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
