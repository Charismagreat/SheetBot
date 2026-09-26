export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { DEFAULT_GUIDE_STEPS, DEFAULT_RECIPES, GuideRecipe } from "@/lib/default-guide-data";

/**
 * OPTIONS /api/guide/bootstrap
 * 브라우저 CORS 프리플라이트 대응
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-email, x-admin-key",
    },
  });
}

/**
 * GET /api/guide/bootstrap
 * ⚡ 가이드 페이지 전체 초기 데이터(5단계 로드맵 + 실전 레시피 대장 + DB 프롬프트 템플릿 + 회원 컨텍스트)를
 * 단 1회의 초고속 HTTP 왕복으로 번들링하여 반환
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail(req);

    // DB에서 관리자/공식 등록 프롬프트 템플릿 조회
    const promptRes = await queryTable("sheetbot_prompt_templates", {
      limit: 100,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const validPromptRows = (promptRes.rows || []).filter((r: any) => !r.deleted_at);

    // DB 템플릿을 GuideRecipe 형식으로 정규화
    const dynamicRecipes: GuideRecipe[] = validPromptRows.map((r: any) => ({
      id: r.id || `prompt_${Math.random()}`,
      title: r.title || "맞춤 자동화 레시피",
      tag: r.category || "사용자 추천 레시피",
      iconName: "Sparkles",
      color: "border-indigo-200 bg-indigo-50/60 text-indigo-800",
      prompt: r.prompt_text || r.description || "",
    }));

    // 기본 레시피와 DB 동적 레시피 병합 (기본 레시피 우선 유지 + 신규 추가분 결합)
    const existingIds = new Set(DEFAULT_RECIPES.map((r) => r.id));
    const uniqueDynamic = dynamicRecipes.filter((r) => !existingIds.has(r.id));
    const mergedRecipes = [...DEFAULT_RECIPES, ...uniqueDynamic];

    const response = NextResponse.json({
      success: true,
      steps: DEFAULT_GUIDE_STEPS,
      recipes: mergedRecipes,
      totalRecipeCount: mergedRecipes.length,
      userContext: {
        email: userEmail,
        isLoggedIn: Boolean(userEmail),
      },
    });

    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  } catch (err: any) {
    console.error("[Guide Bootstrap API Error]:", err);
    const errResponse = NextResponse.json(
      {
        success: true,
        steps: DEFAULT_GUIDE_STEPS,
        recipes: DEFAULT_RECIPES,
        totalRecipeCount: DEFAULT_RECIPES.length,
        error: err.message,
      },
      { status: 200 }
    );
    errResponse.headers.set("Access-Control-Allow-Origin", "*");
    return errResponse;
  }
}
