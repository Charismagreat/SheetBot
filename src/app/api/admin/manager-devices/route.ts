export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";
import {
  MANAGER_DEVICES_TABLE,
  MANAGER_ONLINE_WINDOW_MS,
  PAIR_TOKEN_TTL_MS,
  publicBaseUrl,
  randomSecret,
  sha256,
} from "@/lib/manager-devices";

/** 세션 기반 관리자 검증 (쿼리/헤더 이메일은 신뢰하지 않음) */
async function requireAdmin(req: NextRequest): Promise<string | null> {
  const email = await getCurrentUserEmail(req).catch(() => null);
  if (!email) return null;
  const ok = await isCurrentUserAdmin(email).catch(() => false);
  return ok ? email.toLowerCase().trim() : null;
}

function forbidden() {
  return NextResponse.json({ success: false, error: "관리자 권한이 필요합니다." }, { status: 403 });
}

/** GET: 매니저 기기 목록 (해시/토큰은 노출하지 않음) */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return forbidden();

  const res = await queryTable(MANAGER_DEVICES_TABLE, {
    limit: 100,
    orderBy: "id",
    orderDirection: "DESC",
  }).catch(() => ({ rows: [] as any[] }));

  const now = Date.now();
  const managerDevices = (res.rows || [])
    .filter((r: any) => !r.deleted_at)
    .map((r: any) => {
      const seen = r.last_seen_at ? Date.parse(r.last_seen_at) : NaN;
      const pairExpired = r.pair_expires_at ? Date.parse(r.pair_expires_at) < now : false;
      return {
        id: r.id,
        label: r.label,
        status: r.status === "PENDING" && pairExpired ? "EXPIRED" : r.status,
        deviceModel: r.device_model || "",
        appVersion: r.app_version || "",
        pairedAt: r.paired_at || null,
        lastSeenAt: r.last_seen_at || null,
        online: r.status === "ACTIVE" && Number.isFinite(seen) && now - seen <= MANAGER_ONLINE_WINDOW_MS,
        createdAt: r.created_at,
        source: "MANAGER_RELAY",
      };
    });

  // Agent M (입금 에이전트 + 인증번호 릴레이) 기기도 함께 목록에 표시
  const userDevRes = await queryTable("sheetbot_user_devices", {
    filters: { pairing_mode: "android_agent" },
    limit: 20,
    orderBy: "id",
    orderDirection: "DESC",
  }).catch(() => ({ rows: [] as any[] }));

  const agentMDevices = (userDevRes.rows || [])
    .filter((r: any) => !r.deleted_at)
    .map((r: any) => {
      const rawSeen = r.last_connected_at;
      const timeStr = rawSeen ? (rawSeen.includes("T") ? rawSeen : rawSeen.replace(" ", "T") + "Z") : "";
      const seen = timeStr ? Date.parse(timeStr) : NaN;
      const isOnline = r.status === "CONNECTED" && Number.isFinite(seen) && now - seen <= 150 * 1000;
      return {
        id: `agent_m_${r.id}`,
        label: `${r.label || "Agent M (입금 에이전트)"} (${r.user_email})`,
        status: r.status === "CONNECTED" ? "ACTIVE" : r.status,
        deviceModel: r.label || "Android Device",
        appVersion: "Agent M v2.3.5+",
        pairedAt: r.created_at || null,
        lastSeenAt: r.last_connected_at || null,
        online: isOnline,
        createdAt: r.created_at,
        source: "AGENT_M_UNIFIED",
      };
    });

  const devices = [...agentMDevices, ...managerDevices];

  return NextResponse.json({ success: true, devices });
}

/**
 * POST: 새 매니저 기기 페어링 토큰 발급 (1회용, 10분 유효).
 * 응답의 pairToken/qrData 는 이 응답에서만 확인할 수 있으며 서버에는 해시만 저장됩니다.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return forbidden();

  const body = await req.json().catch(() => ({}));
  const label = String(body.label || "").trim().slice(0, 60) || "Manager Phone";

  const token = randomSecret(24);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAIR_TOKEN_TTL_MS).toISOString();
  const id = `mgr_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  await insertRows(MANAGER_DEVICES_TABLE, [
    {
      id,
      uuid: crypto.randomUUID(),
      label,
      status: "PENDING",
      pair_token_hash: sha256(token),
      pair_expires_at: expiresAt,
      device_key_hash: null,
      device_model: null,
      app_version: null,
      paired_at: null,
      last_seen_at: null,
      created_by: admin,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      updated_by: admin,
      deleted_at: null,
      deleted_by: null,
      restored_at: null,
      restored_by: null,
    },
  ]);

  const server = publicBaseUrl();
  const qrData = `sheetbot-manager://pair?server=${encodeURIComponent(server)}&token=${encodeURIComponent(token)}`;

  return NextResponse.json({ success: true, id, label, pairToken: token, qrData, expiresAt });
}

/** DELETE ?id=... : 기기 폐기 (소프트 삭제 + 키 무효화) */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return forbidden();

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "id가 필요합니다." }, { status: 400 });
  }

  const now = new Date().toISOString();
  await updateRows(MANAGER_DEVICES_TABLE, {
    updates: {
      status: "REVOKED",
      device_key_hash: null,
      pair_token_hash: null,
      deleted_at: now,
      deleted_by: admin,
      updated_at: now,
      updated_by: admin,
    },
    filters: { id: String(id) },
  });

  return NextResponse.json({ success: true });
}
