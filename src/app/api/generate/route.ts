export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { getSpreadsheetFullContext } from "@/lib/egdesk-helpers";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getAiModelSettings, getModelTokenMultiplier } from "@/lib/ai-settings";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";
import { queryTable } from "@/lib/setup-db";
import { calculateBillableTokens } from "@/lib/token-calculator";
import { generateGasScriptBundle } from "@/lib/gas/gas-script-generate-service";
import { splitLegacyScriptCode } from "@/lib/gas/deploy-script-files";

function extractSpreadsheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("/") && trimmed.length >= 20) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
}

async function buildSelfImprovingFeedbackContext(): Promise<string> {
  try {
    const feedbackRes = await queryTable("sheetbot_project_feedback", {
      orderBy: "created_at",
      orderDirection: "DESC",
      limit: 30,
    }).catch(() => ({ rows: [] }));

    const rawRows = feedbackRes.rows || [];
    const rows = rawRows.filter(
      (r: any) => !r.deleted_at && (r.ai_learned === 1 || r.ai_learned === "1" || r.ai_learned === true),
    );
    if (rows.length === 0) return "";

    const positiveCases = rows.filter((r: any) => r.rating >= 4).slice(0, 3);
    const negativeCases = rows.filter((r: any) => r.rating <= 2).slice(0, 3);

    let context = "\n[🧠 AI 자가 학습 시스템 - 사용자 실제 만족도 피드백 반영 지침]:\n";

    if (positiveCases.length > 0) {
      context += "🌟 [사용자 극찬 모범 패턴 (적극 준수)]:\n";
      positiveCases.forEach((c: any) => {
        let tags: string[] = [];
        try {
          tags = typeof c.tags === "string" ? JSON.parse(c.tags) : c.tags || [];
        } catch {
          tags = [];
        }
        const tagStr = tags.length > 0 ? ` [칭찬 요소: ${tags.join(", ")}]` : "";
        context += `  - 만족도 ${c.rating}점${tagStr}: ${c.comment || "완벽한 열 매핑과 안정적인 실행"}\n`;
      });
    }

    if (negativeCases.length > 0) {
      context += "⚠️ [이전 사용자 불만/오류 발생 요인 (절대 반복 금지)]:\n";
      negativeCases.forEach((c: any) => {
        let tags: string[] = [];
        try {
          tags = typeof c.tags === "string" ? JSON.parse(c.tags) : c.tags || [];
        } catch {
          tags = [];
        }
        const tagStr = tags.length > 0 ? ` [문제 유형: ${tags.join(", ")}]` : "";
        context += `  - 불만족 ${c.rating}점${tagStr}: ${c.comment || "컬럼 순서 불일치 또는 런타임 오류 방지 필수"}\n`;
      });
    }

    return context;
  } catch (err: any) {
    console.warn("[Self-Improving AI] Failed to load feedback context:", err.message);
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const {
      prompt,
      sheetUrl,
      customTitle,
      model: userRequestedModel,
      analyzedSchema,
      existingScriptCode,
      mergeMode = "OVERWRITE",
      includeCopilotSidebar = true,
    } = body;

    const aiSettings = await getAiModelSettings();
    const targetModel =
      userRequestedModel || aiSettings.scriptGeneratorModel || aiSettings.defaultModel || "gemini-3.8-flash";

    const tokenMultiplier = await getModelTokenMultiplier(targetModel);
    const requiredTokens = Math.round(1500 * tokenMultiplier);

    const tokenCheck = await checkTokenBalance(userEmail, requiredTokens);
    if (!tokenCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            tokenCheck.reason ||
            `잔여 토큰이 부족합니다. (선택 모델: ${targetModel}, 필요 토큰: ${requiredTokens.toLocaleString()})`,
          requirePayment: true,
          balance: tokenCheck.balance,
        },
        { status: 402 },
      );
    }

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ success: false, error: "요구사항 프롬프트를 입력해 주세요." }, { status: 400 });
    }

    let activeSchema = analyzedSchema;
    if (!activeSchema && sheetUrl) {
      const spreadsheetId = extractSpreadsheetId(sheetUrl);
      if (spreadsheetId) {
        try {
          const fullContext = await getSpreadsheetFullContext(spreadsheetId, 5);
          if (fullContext?.sheetsData?.length > 0) {
            const targetSheet =
              fullContext.sheetsData.find(
                (s: any) =>
                  s.sheetTitle.includes("발주") ||
                  s.sheetTitle.includes("접수") ||
                  s.sheetTitle.includes("대장"),
              ) || fullContext.sheetsData[0];

            const rawHeaders = (targetSheet.headers || []).filter((h: string) => h && h.trim());
            if (rawHeaders.length > 0) {
              activeSchema = {
                archetypeName: "실제 스프레드시트 검증 대장",
                targetTab: targetSheet.sheetTitle,
                headerRow: 1,
                dataStartRow: 2,
                columns: rawHeaders.map((h: string, idx: number) => ({
                  index: idx,
                  letter: String.fromCharCode(65 + idx),
                  name: h.trim(),
                  purpose: h.trim(),
                })),
                keyStrategies: [
                  `실제 시트 '${targetSheet.sheetTitle}'의 ${rawHeaders.length}개 열 순서 1:1 준수`,
                ],
              };
            }
          }
        } catch (e: any) {
          console.warn("[Generate] Auto inspect spreadsheet headers warning:", e.message);
        }
      }
    }

    const legacySplit = existingScriptCode
      ? splitLegacyScriptCode(String(existingScriptCode))
      : { userAutomationGs: "" };
    const existingUserAutomation =
      legacySplit.userAutomationGs ||
      (mergeMode === "MERGE" ? String(existingScriptCode || "") : "");

    const learningFeedbackSection = await buildSelfImprovingFeedbackContext();

    const bundle = await generateGasScriptBundle({
      userEmail,
      prompt: prompt.trim(),
      sheetUrl,
      customTitle,
      analyzedSchema: activeSchema,
      existingUserAutomation,
      mergeMode,
      includeCopilotSidebar,
      targetModel,
      temperature: aiSettings.temperature || 0.2,
      learningFeedbackSection,
    });

    const generatedData = {
      summary: bundle.summary,
      features: bundle.features,
      scriptCode: bundle.scriptCode,
      scriptFiles: bundle.scriptFiles,
      userAutomationCode: bundle.userAutomationCode,
      baseCode: bundle.baseCode,
      manifest: bundle.manifest,
      triggers: bundle.triggers,
      generationSource: bundle.generationSource,
      validationErrors: bundle.validationErrors,
    };

    const billingPrompt = `${prompt}\n${JSON.stringify(activeSchema || {}).slice(0, 2000)}`;
    const billingResponse = bundle.userAutomationCode;

    let estimatedUsedTokens = 0;
    if (bundle.generationSource === "noop" && !bundle.aiCallerUsage) {
      estimatedUsedTokens = 0;
    } else {
      const billing = calculateBillableTokens({
        promptText: billingPrompt,
        responseText: billingResponse,
        usage: bundle.aiCallerUsage,
        tokenMultiplier,
      });
      estimatedUsedTokens = billing.billableTokens;
    }

    const deductRes =
      estimatedUsedTokens > 0
        ? await deductTokens(userEmail, estimatedUsedTokens)
        : { newBalance: tokenCheck.balance };

    if (estimatedUsedTokens > 0) {
      const billing = calculateBillableTokens({
        promptText: billingPrompt,
        responseText: billingResponse,
        usage: bundle.aiCallerUsage,
        tokenMultiplier,
      });
      void recordAiUsageLog({
        userEmail,
        caller: "sheetbot-script-generator",
        purpose: `Apps Script UserAutomation.gs (${bundle.modelUsed} / ${tokenMultiplier}x / ${bundle.generationSource})`,
        model: bundle.modelUsed,
        promptTokens: billing.promptTokens,
        completionTokens: billing.completionTokens,
        totalTokens: estimatedUsedTokens,
        promptText: billingPrompt,
        responseText: billingResponse,
      });
    }

    return NextResponse.json({
      success: true,
      data: generatedData,
      modelUsed: bundle.modelUsed,
      multiplier: tokenMultiplier,
      tokensDeducted: estimatedUsedTokens,
      newBalance: deductRes.newBalance,
    });
  } catch (error: any) {
    console.error("Generate script error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
