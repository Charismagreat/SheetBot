import { callAiCaller } from "@/lib/egdesk-helpers";
import { buildSheetBotBaseGs, combineGasFilesForPreview } from "@/lib/gas/sheetbot-base-gs";
import {
  USER_AUTOMATION_JSON_SCHEMA,
  assembleUserAutomationGs,
  applyFunctionReplacements,
  parseUserAutomationPayload,
  validateUserAutomationFunctions,
  type UserAutomationAiPayload,
  type UserAutomationFunction,
} from "@/lib/gas/user-automation-schema";
import { normalizeAiCallerUsage } from "@/lib/token-calculator";

export type GasScriptGenerateInput = {
  userEmail: string;
  prompt: string;
  sheetUrl?: string;
  customTitle?: string;
  analyzedSchema?: unknown;
  existingUserAutomation?: string;
  mergeMode?: "OVERWRITE" | "MERGE";
  includeCopilotSidebar?: boolean;
  targetModel: string;
  temperature?: number;
  learningFeedbackSection?: string;
};

export type GasScriptGenerateResult = {
  summary: string;
  features: string[];
  scriptFiles: { "Base.gs": string; "UserAutomation.gs": string };
  scriptCode: string;
  userAutomationCode: string;
  baseCode: string;
  manifest: string;
  triggers: Array<{ type: string; description: string }>;
  generationSource: "ai" | "fallback" | "noop";
  modelUsed: string;
  aiCallerUsage?: ReturnType<typeof normalizeAiCallerUsage>;
  validationErrors?: string[];
};

const STANDARD_MANIFEST = {
  timeZone: "Asia/Seoul",
  dependencies: {},
  exceptionLogging: "STACKDRIVER",
  runtimeVersion: "V8",
};

function buildNarrowSystemPrompt(): string {
  return `You extend a Google Apps Script project that ALREADY includes SheetBot Base.gs (menu, copilot sidebar, helpers).

Available helpers (do not redefine): toast_(message, title?, seconds?), getSheetByName_(name), SHEETBOT_USER_EMAIL, getTunnelStatusData().

Extension points (optional — implement only if the user needs them):
- registerSheetBotMenuItems_(menu) — return menu after adding .addItem(...) entries
- onSheetBotOpen_(e) — run after the standard menu is built
- onSheetBotEdit_(e) — simple onEdit handler if needed

STRICT RULES:
- Do NOT define onOpen, showAiCopilotSidebar, copilot HTML, token modals, or Egdesk tunnel helpers.
- Do NOT output Base.gs or full project code.
- If the user asks for no automation, minimal behavior, or "nothing", set noop: true and omit functions.
- Output ONLY valid JSON matching the schema (no markdown).

JSON fields:
- summary, features (short lists)
- noop (boolean)
- functions: [{ name, code }] — full function declarations for business logic only
- menuItems: [{ label, handler }] — server wires registerSheetBotMenuItems_
- triggers: [{ handler, type: "onEdit"|"onOpen"|"timeDriven", schedule? }]
- replaceFunctions: [{ name, code }] — when merging, replace entire functions by name`;
}

function buildUserMessage(input: GasScriptGenerateInput): string {
  const schemaNote = input.analyzedSchema
    ? `\n[Sheet schema hint]:\n${JSON.stringify(input.analyzedSchema).slice(0, 4000)}\n`
    : "";

  const mergeNote =
    input.mergeMode === "MERGE" && input.existingUserAutomation?.trim()
      ? `\n[Existing UserAutomation.gs — use replaceFunctions for changed functions only]:\n\`\`\`\n${input.existingUserAutomation.trim().slice(0, 12000)}\n\`\`\`\n`
      : "";

  return `[User]: ${input.userEmail}
[Sheet]: ${input.sheetUrl || "(bound spreadsheet)"}
[Project]: ${input.customTitle || "SheetBot project"}
${schemaNote}
[User request]:
${input.prompt}
${mergeNote}`;
}

function fallbackUserAutomation(prompt: string): string {
  return `/**
 * UserAutomation.gs — generation failed; stub only.
 * Request: ${prompt.replace(/\n/g, " ").slice(0, 200)}
 */
function onSheetBotOpen_(e) {
  toast_("자동화 코드 생성에 실패했습니다. SheetBot에서 다시 생성해 주세요.", "SheetBot", 5);
}
`;
}

function collectFunctionsFromPayload(payload: UserAutomationAiPayload): UserAutomationFunction[] {
  const list = [...(payload.functions || [])];
  if (payload.replaceFunctions?.length) {
    for (const r of payload.replaceFunctions) {
      list.push(r);
    }
  }
  return list;
}

function isLikelyNoopRequest(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();
  if (!p) return true;
  return /^(아무것도|하지\s*마|안\s*해|noop|nothing|minimal|테스트|빈\s*스크립트)/.test(p) && p.length < 120;
}

export async function generateGasScriptBundle(
  input: GasScriptGenerateInput,
): Promise<GasScriptGenerateResult> {
  const includeCopilot = input.includeCopilotSidebar !== false;
  const baseCode = buildSheetBotBaseGs({
    userEmail: input.userEmail,
    includeCopilotSidebar: includeCopilot,
  });

  if (isLikelyNoopRequest(input.prompt) && input.mergeMode !== "MERGE") {
    const userAutomationCode = assembleUserAutomationGs({ noop: true });
    const scriptFiles = { "Base.gs": baseCode, "UserAutomation.gs": userAutomationCode };
    return {
      summary: "추가 자동화 없음 (noop)",
      features: ["Base.gs 메뉴 및 코파일럿만 사용"],
      scriptFiles,
      scriptCode: combineGasFilesForPreview(baseCode, userAutomationCode),
      userAutomationCode,
      baseCode,
      manifest: JSON.stringify(STANDARD_MANIFEST, null, 2),
      triggers: [{ type: "ON_OPEN", description: "Base.gs onOpen" }],
      generationSource: "noop",
      modelUsed: input.targetModel,
    };
  }

  const systemPrompt = buildNarrowSystemPrompt();
  const userMessage = buildUserMessage(input);
  const fullPrompt = `${systemPrompt}\n\n${input.learningFeedbackSection || ""}\n\n${userMessage}`;

  let payload: UserAutomationAiPayload | null = null;
  let modelUsed = input.targetModel;
  let aiCallerUsage: ReturnType<typeof normalizeAiCallerUsage>;
  let validationErrors: string[] | undefined;
  let generationSource: GasScriptGenerateResult["generationSource"] = "fallback";

  const runOnce = async (repairHint?: string) => {
    const prompt = repairHint ? `${fullPrompt}\n\n[REPAIR] Fix these errors:\n${repairHint}` : fullPrompt;
    const callerRes = await callAiCaller(prompt, {
      caller: "sheetbot-script-generator",
      model: modelUsed,
      temperature: input.temperature ?? 0.2,
      responseSchema: USER_AUTOMATION_JSON_SCHEMA,
    });
    aiCallerUsage = normalizeAiCallerUsage(callerRes.usage);
    const raw = callerRes.text || callerRes.content || "";
    try {
      return parseUserAutomationPayload(JSON.parse(raw));
    } catch {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start !== -1 && end > start) {
        try {
          return parseUserAutomationPayload(JSON.parse(raw.substring(start, end + 1)));
        } catch {
          return null;
        }
      }
      return null;
    }
  };

  try {
    payload = await runOnce();
    if (payload) {
      const fnList = collectFunctionsFromPayload(payload);
      const validation = validateUserAutomationFunctions(fnList);
      if (!validation.ok) {
        validationErrors = validation.errors;
        const repaired = await runOnce(validation.errors.join("\n"));
        if (repaired) {
          payload = repaired;
          const v2 = validateUserAutomationFunctions(collectFunctionsFromPayload(repaired));
          if (v2.ok) validationErrors = undefined;
          else validationErrors = v2.errors;
        }
      }
      if (payload && (!validationErrors || validationErrors.length === 0)) {
        generationSource = payload.noop ? "noop" : "ai";
      }
    }
  } catch (err: unknown) {
    console.warn("[GasScriptGenerate] AI call warning:", err instanceof Error ? err.message : err);
  }

  let userAutomationCode: string;
  if (payload && generationSource !== "fallback") {
    if (input.mergeMode === "MERGE" && input.existingUserAutomation?.trim() && payload.replaceFunctions?.length) {
      userAutomationCode = applyFunctionReplacements(
        input.existingUserAutomation,
        payload.replaceFunctions,
      );
    } else {
      userAutomationCode = assembleUserAutomationGs(payload);
    }
  } else {
    userAutomationCode = fallbackUserAutomation(input.prompt);
  }

  const summary =
    payload?.summary ||
    (generationSource === "noop" ? "추가 자동화 없음" : input.prompt.slice(0, 80) + " (자동화)");
  const features =
    payload?.features?.length
      ? payload.features
      : generationSource === "noop"
        ? ["Base.gs 메뉴 및 코파일럿만 사용"]
        : ["UserAutomation.gs 스텁 — 재생성 권장"];

  const scriptFiles = {
    "Base.gs": baseCode,
    "UserAutomation.gs": userAutomationCode,
  };

  return {
    summary,
    features,
    scriptFiles,
    scriptCode: combineGasFilesForPreview(baseCode, userAutomationCode),
    userAutomationCode,
    baseCode,
    manifest: JSON.stringify(STANDARD_MANIFEST, null, 2),
    triggers: [{ type: "ON_OPEN", description: "Base.gs onOpen" }],
    generationSource,
    modelUsed,
    aiCallerUsage,
    validationErrors,
  };
}
