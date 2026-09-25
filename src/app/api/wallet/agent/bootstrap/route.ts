export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";
import { cachedQueryTable, fetchWithCache } from "@/lib/server-cache";
import crypto from "crypto";

/**
 * GET /api/wallet/agent/bootstrap
 * ⚡ 무통장 입금 감지 에이전트(SheetBot Agent M) 전용 단일 통합 번들 로더
 * 페어링 정보(QR/PIN), 기기 연결 대장, 최근 입금 내역 및 통계를 단 1회의 HTTP 왕복으로 반환
 */
export async function GET(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const isAdmin = await isCurrentUserAdmin(cleanEmail);

    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    // 1. 페어링 정보 생성 (서버 암호화 표준 일치)
    const secretKey = process.env.NEXTAUTH_SECRET || "sheetbot-agent-secret-key-2026";
    const todayStr = new Date().toISOString().slice(0, 10);
    const token = crypto
      .createHmac("sha256", secretKey)
      .update(`${cleanEmail}-${todayStr}`)
      .digest("hex")
      .slice(0, 16);

    const pinHash = crypto.createHash("md5").update(`${cleanEmail}-${token}`).digest("hex");
    const pinCode = "SB-" + ((parseInt(pinHash.slice(0, 6), 16) % 900000) + 100000);

    const qrUri = `sheetbot://pair?email=${encodeURIComponent(cleanEmail)}&token=${encodeURIComponent(token)}&pin=${encodeURIComponent(pinCode)}`;

    const pairingData = {
      success: true,
      userEmail: cleanEmail,
      token,
      pinCode,
      qrData: qrUri,
      webhookUrl: "https://sheetbot.cloud/api/wallet/bank-webhook",
      fallbackWebhookUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/bank-webhook",
      heartbeatUrl: "https://sheetbot.cloud/api/wallet/agent/heartbeat",
      fallbackHeartbeatUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/agent/heartbeat",
    };

    // 2. ⚡ 인메모리 캐시 & 병렬 쿼리로 기기 및 입금 대장 동시 수집
    const bundleData = await fetchWithCache(
      `deposit_agent_bootstrap_${cleanEmail}`,
      async () => {
        const [devicesRes, depositsRes] = await Promise.all([
          cachedQueryTable(
            "sheetbot_user_devices",
            { limit: 50, orderBy: "id", orderDirection: "DESC" },
            10,
            forceRefresh
          ),
          cachedQueryTable(
            "sheetbot_deposit_requests",
            { limit: 100, orderBy: "id", orderDirection: "DESC" },
            10,
            forceRefresh
          ),
        ]);

        // 기기 가공 및 중복 정리
        const rawDevices = (devicesRes.rows || []).filter((r: any) => !r.deleted_at);
        const agentDevices = rawDevices.filter(
          (r: any) => r.pairing_mode === "android_agent" || r.pairingMode === "android_agent"
        );

        agentDevices.sort((a: any, b: any) => {
          const tA = new Date(a.last_connected_at || a.lastConnectedAt || a.updated_at || a.created_at || 0).getTime();
          const tB = new Date(b.last_connected_at || b.lastConnectedAt || b.updated_at || b.created_at || 0).getTime();
          return tB - tA;
        });

        const uniqueDevices: any[] = [];
        const seenLabels = new Set<string>();
        for (const dev of agentDevices) {
          const key = (dev.label || dev.device_id || "").trim().toLowerCase();
          if (key && !seenLabels.has(key)) {
            seenLabels.add(key);
            uniqueDevices.push(dev);
          } else if (!key) {
            uniqueDevices.push(dev);
          }
        }

        // 입금 대장 가공
        const validDeposits = (depositsRes.rows || []).filter((r: any) => !r.deleted_at);

        // 통계 계산
        const completedDeposits = validDeposits.filter((d: any) => d.status === "COMPLETED" || d.status === "APPROVED");
        const totalCompletedAmount = completedDeposits.reduce((sum: number, d: any) => sum + (Number(d.amount_krw) || 0), 0);
        const holdCount = validDeposits.filter((d: any) => d.status === "ON_HOLD" || d.status === "COLLISION_HOLD").length;
        const delayedCount = validDeposits.filter((d: any) => d.status === "DELAYED_MATCH").length;
        const activeDevicesCount = uniqueDevices.filter((d: any) => d.status === "CONNECTED").length;

        const stats = {
          totalDepositsCount: validDeposits.length,
          completedCount: completedDeposits.length,
          totalCompletedAmount,
          holdCount,
          delayedCount,
          activeDevicesCount,
        };

        return {
          devices: uniqueDevices,
          device: uniqueDevices[0] || null,
          deposits: validDeposits,
          stats,
        };
      },
      10,
      forceRefresh
    );

    return NextResponse.json({
      success: true,
      isAdmin,
      pairing: pairingData,
      devices: bundleData.devices,
      device: bundleData.device,
      deposits: bundleData.deposits,
      stats: bundleData.stats,
    });
  } catch (error: any) {
    console.error("[Deposit-Agent-Bootstrap-API] GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load deposit agent bootstrap bundle" },
      { status: 500 }
    );
  }
}
