export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { findSheetbotProjectByRef } from "@/lib/sheetbot-project-resolve";
import { ensureBridgeTokenForProject } from "@/lib/bridge-token-persist";
import { resolveGasBridgePostEndpoint } from "@/lib/bridge-public-url";
import { setupDatabase } from "@/lib/setup-db";

export async function POST(request: NextRequest) {
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

    const project = await findSheetbotProjectByRef(userEmail, projectId);
    if (!project) {
      return NextResponse.json({ success: false, error: "존재하지 않는 프로젝트입니다." }, { status: 404 });
    }

    const canonicalId = String(project.id || "");
    if (!canonicalId) {
      return NextResponse.json(
        { success: false, error: "프로젝트 레코드에 ID가 없습니다. 지원팀에 문의해 주세요." },
        { status: 500 },
      );
    }

    // 다중 사용자 격리 검증 (관리자나 개발 모드 제외)
    if (project.user_email !== userEmail && process.env.NODE_ENV !== "development") {
      return NextResponse.json({ success: false, error: "해당 프로젝트에 대한 접근 권한이 없습니다." }, { status: 403 });
    }

    const token = await ensureBridgeTokenForProject(
      canonicalId,
      userEmail,
      project.bridge_token as string | undefined,
    );

    const bridgeUrl = resolveGasBridgePostEndpoint(request, token);

    const promptTemplate = `아래 웹 주소를 통해 내 구글 시트의 헤더 구조와 기존 코드를 확인하고, 필요한 기능 코드를 주입해줘:
웹 주소: ${bridgeUrl}
요구사항: [원하는 기능 입력 (예: 사이드바에서 영수증/명함 이미지를 올리면 분석 후 자동 기입)]`;

    return NextResponse.json({
      success: true,
      token,
      bridgeUrl,
      promptTemplate,
      project: {
        id: canonicalId,
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
