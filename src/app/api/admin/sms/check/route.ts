export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { checkPhoneDevice } from "@/lib/egdesk-helpers";

export async function POST(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const deviceId = body.deviceId?.trim();

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "점검할 디바이스 ID를 전달해 주세요." },
        { status: 400 }
      );
    }

    try {
      const checkRes = await checkPhoneDevice(deviceId);
      
      let parsed = checkRes;
      if (typeof checkRes === "string") {
        try {
          parsed = JSON.parse(checkRes);
        } catch {
          parsed = { raw: checkRes };
        }
      }

      const isPaired = parsed?.paired === true || parsed?.device?.status === "paired";
      const statusText = parsed?.device?.status || (isPaired ? "paired" : "unknown");

      return NextResponse.json({
        success: true,
        online: isPaired,
        status: statusText,
        device: parsed?.device || null,
        message: isPaired
          ? "✅ 구글메시지 세션이 정상 연결되어 즉시 문자 발송이 가능합니다."
          : "⚠️ 기기 페어링이 끊어졌거나 오프라인 상태입니다.",
      });
    } catch (checkErr: any) {
      return NextResponse.json({
        success: false,
        online: false,
        status: "offline",
        error: checkErr.message || "기기 연결 상태를 확인할 수 없습니다.",
        message: "❌ 스마트폰이 오프라인 상태이거나 구글메시지 연결 세션이 만료되었습니다.",
      });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
