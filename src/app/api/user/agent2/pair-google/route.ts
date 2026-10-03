export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getOrCreateUserWallet, processReferralReward } from "@/lib/token-wallet";
import crypto from "crypto";

/**
 * POST /api/user/agent2/pair-google
 * SheetBot Agent 앱에서 구글 원클릭 로그인(Sign in with Google) 시
 * Google idToken 검증 및 기기 자동 페어링(sheetbot_user_devices 등록)
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase().catch(() => {});
    const body = await req.json().catch(() => ({}));
    const { idToken, userEmail: clientEmail, deviceModel, appVersion, phoneNumber, referralCode } = body;


    let verifiedEmail = "";
    let googleName = "";

    // 1. Google ID Token이 전달된 경우 구글 공개 검증 엔드포인트를 통해 실시간 검증
    if (idToken && typeof idToken === "string" && idToken.length > 20) {
      try {
        const verifyRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
          { signal: AbortSignal.timeout(5000) }
        );

        if (verifyRes.ok) {
          const tokenInfo = await verifyRes.json();
          if (tokenInfo.email && (tokenInfo.email_verified === "true" || tokenInfo.email_verified === true)) {
            verifiedEmail = String(tokenInfo.email).toLowerCase().trim();
            googleName = tokenInfo.name || "";
          }
        } else {
          console.warn("[PairGoogle] tokeninfo verification returned status:", verifyRes.status);
        }
      } catch (tokenErr: any) {
        console.warn("[PairGoogle] Google tokeninfo verify error:", tokenErr.message);
      }
    }

    // 2. idToken 검증이 불가한 환경(오프라인/에뮬레이터/개발모드)일 경우 클라이언트 이메일 폴백 검증
    if (!verifiedEmail && clientEmail && typeof clientEmail === "string" && clientEmail.includes("@")) {
      verifiedEmail = clientEmail.toLowerCase().trim();
    }

    if (!verifiedEmail) {
      return NextResponse.json(
        { success: false, error: "구글 계정 인증 정보를 확인할 수 없습니다. 다시 시도해 주세요." },
        { status: 400 }
      );
    }

    const cleanEmail = verifiedEmail;
    const cleanModel = String(deviceModel || "Android Device (SheetBot Agent)").trim();
    const cleanVersion = String(appVersion || "1.8.0").trim();
    const cleanPhone = String(phoneNumber || "").trim();

    // 3. 기기 고유 토큰 및 핀코드 생성
    const secretKey = process.env.NEXTAUTH_SECRET || "sheetbot-agent2-secret-key-2026";
    const todayStr = new Date().toISOString().slice(0, 10);
    const token = crypto
      .createHmac("sha256", secretKey)
      .update(`${cleanEmail}-${todayStr}`)
      .digest("hex")
      .slice(0, 16);

    // 4. sheetbot_user_devices 대장 조회 및 업서트 (소프트 삭제 필터링)
    const existDevRes = await queryTable("sheetbot_user_devices", {
      filters: { user_email: cleanEmail, device_id: cleanModel },
      limit: 5,
    }).catch(() => ({ rows: [] }));

    const existingDevices = (existDevRes.rows || []).filter((d: any) => !d.deleted_at);

    const nowIso = new Date().toISOString();
    if (existingDevices.length > 0) {
      await updateRows("sheetbot_user_devices", {
        filters: { id: existingDevices[0].id },
        updates: {
          device_name: cleanModel,
          status: "CONNECTED",
          phone_number: cleanPhone || existingDevices[0].phone_number || null,
          pairing_mode: "google",
          app_version: cleanVersion,
          last_connected_at: nowIso,
          last_ping: nowIso,
          updated_at: nowIso,
          updated_by: cleanEmail,
        },
      }).catch((e) => console.warn("[PairGoogle] device update warning:", e.message));
    } else {
      await insertRows("sheetbot_user_devices", [
        {
          id: Date.now(),
          user_email: cleanEmail,
          device_id: cleanModel,
          device_name: cleanModel,
          status: "CONNECTED",
          phone_number: cleanPhone || null,
          pairing_mode: "google",
          app_version: cleanVersion,
          last_connected_at: nowIso,
          last_ping: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
          updated_by: cleanEmail,
          deleted_at: null,
          deleted_by: null,
          restored_at: null,
          restored_by: null,
        },
      ]).catch((e) => console.warn("[PairGoogle] device insert warning:", e.message));
    }

    // 5. 감사 대장 DB 적재
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "GOOGLE_SIGNIN_PAIR",
        rule_name: "🔐 Google 원클릭 모바일 기기 연동",
        device_id: cleanModel,
        recipient: cleanEmail,
        content: `구글 계정(${cleanEmail})으로 스마트폰 에이전트가 0초 만에 자동 페어링되었습니다.`,
        status: "SUCCESS",
        error_message: null,
        created_at: new Date().toISOString(),
      },
    ]).catch(() => {});

    // 6. 회원 지갑 초기화(웰컴 토큰) 및 추천 보너스 처리
    await getOrCreateUserWallet(cleanEmail).catch(() => {});
    let referralMessage: string | null = null;
    if (referralCode && typeof referralCode === "string" && referralCode.trim().length >= 2) {
      try {
        const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
        const refResult = await processReferralReward({
          inviterCodeOrEmail: referralCode.trim(),
          inviteeEmail: cleanEmail,
          deviceId: cleanModel,
          ipAddress: ip,
          channel: "MOBILE_AGENT",
        });
        if (refResult.success) {
          referralMessage = refResult.message;
        }
      } catch (e: any) {
        console.warn("[PairGoogle] Referral reward error:", e.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: `구글 계정(${cleanEmail})으로 시트봇 에이전트가 성공적으로 연동되었습니다!`,
      userEmail: cleanEmail,
      googleName,
      token,
      referralMessage,
      webhookUrl: "https://sheetbot.cloud/api/wallet/bank-webhook",
      fallbackWebhookUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/bank-webhook",
      heartbeatUrl: "https://sheetbot.cloud/api/user/agent2/heartbeat",
      fallbackHeartbeatUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/user/agent2/heartbeat",
    });
  } catch (err: any) {
    console.error("[PairGoogle] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }

}
