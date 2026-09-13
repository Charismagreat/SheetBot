export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    await setupDatabase();
    const sessionEmail = await getCurrentUserEmail();
    const userEmail = sessionEmail || (process.env.NODE_ENV === "development" ? "test.user@sheetbot.dev" : null);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId가 필요합니다." }, { status: 400 });
    }

    // 프로젝트 조회 (소유자 검증 및 소프트 삭제 제외)
    const projectRes = await queryTable("sheetbot_projects", {
      filters: { id: projectId },
      limit: 1,
    });

    const project = (projectRes.rows || [])[0];
    if (!project || project.deleted_at) {
      return NextResponse.json({ success: false, error: "존재하지 않는 프로젝트입니다." }, { status: 404 });
    }

    // 다중 사용자 격리 검증 (관리자나 개발 모드 제외)
    if (project.user_email !== userEmail && process.env.NODE_ENV !== "development") {
      return NextResponse.json({ success: false, error: "해당 프로젝트에 대한 접근 권한이 없습니다." }, { status: 403 });
    }

    let token = project.bridge_token;
    if (!token) {
      // 기존 발급된 토큰 확인
      const existingTokenRes = await queryTable("sheetbot_bridge_tokens", {
        filters: { project_id: project.id },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      if (existingTokenRes.rows && existingTokenRes.rows.length > 0) {
        token = existingTokenRes.rows[0].token;
      } else {
        token = `sec_${crypto.randomBytes(16).toString("hex")}`;
        await insertRows("sheetbot_bridge_tokens", [
          {
            token,
            project_id: project.id,
            user_email: userEmail,
            created_at: new Date().toISOString(),
          },
        ]).catch(() => null);
      }
    }

    const host = request.headers.get("host") || "localhost:3002";
    const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const baseUrl = `${protocol}://${host}`;
    const bridgeUrl = `${baseUrl}/api/agent/gas-bridge?token=${token}`;

    const promptTemplate = `아래 웹 주소를 통해 내 구글 시트의 헤더 구조와 기존 코드를 확인하고, 필요한 기능 코드를 주입해줘:
웹 주소: ${bridgeUrl}
요구사항: `;

    return NextResponse.json({
      success: true,
      token,
      bridgeUrl,
      promptTemplate,
      project: {
        id: project.id,
        name: project.name,
        spreadsheetId: project.spreadsheet_id,
        spreadsheetUrl: project.spreadsheet_url,
      },
    });
  } catch (err: any) {
    console.error("[Bridge-Token API] Error:", err);
    return NextResponse.json({ success: false, error: err.message || "토큰 발급 실패" }, { status: 500 });
  }
}
