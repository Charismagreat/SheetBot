export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { MANAGER_DEVICES_TABLE, randomSecret, sha256 } from "@/lib/manager-devices";

/**
 * POST /api/manager-agent/pair
 * 매니저 앱이 QR의 1회용 페어링 토큰을 장기 기기 키(deviceKey)로 교환합니다.
 * deviceKey 는 이 응답에서만 반환되며 서버에는 해시만 저장됩니다.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    if (!token) {
      return NextResponse.json({ success: false, error: "token이 필요합니다." }, { status: 400 });
    }

    const res = await queryTable(MANAGER_DEVICES_TABLE, {
      filters: { pair_token_hash: sha256(token), status: "PENDING" },
      limit: 1,
    }).catch(() => ({ rows: [] as any[] }));
    const row = (res.rows || [])[0];

    const invalid = () =>
      NextResponse.json(
        { success: false, error: "유효하지 않거나 만료된 페어링 코드입니다. 관리자 화면에서 QR을 다시 발급하세요." },
        { status: 401 }
      );

    if (!row || row.deleted_at) return invalid();
    if (!row.pair_expires_at || Date.parse(row.pair_expires_at) < Date.now()) return invalid();

    const deviceKey = randomSecret(32);
    const deviceKeyHash = sha256(deviceKey);
    const now = new Date().toISOString();

    // status=PENDING 조건으로 갱신 → 동시에 2대가 같은 토큰을 쓰면 먼저 반영된 1대만 성공
    await updateRows(MANAGER_DEVICES_TABLE, {
      updates: {
        status: "ACTIVE",
        pair_token_hash: null,
        pair_expires_at: null,
        device_key_hash: deviceKeyHash,
        device_model: String(body.deviceModel || "").slice(0, 80),
        app_version: String(body.appVersion || "").slice(0, 20),
        paired_at: now,
        last_seen_at: now,
        updated_at: now,
        updated_by: "manager-pair",
      },
      filters: { id: String(row.id), status: "PENDING" },
    });

    const check = await queryTable(MANAGER_DEVICES_TABLE, {
      filters: { id: String(row.id) },
      limit: 1,
    }).catch(() => ({ rows: [] as any[] }));
    if ((check.rows || [])[0]?.device_key_hash !== deviceKeyHash) return invalid();

    return NextResponse.json({ success: true, deviceId: row.id, label: row.label, deviceKey });
  } catch (error: any) {
    console.error("[ManagerPair] Error:", error);
    return NextResponse.json({ success: false, error: "페어링 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
