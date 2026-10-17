/**
 * Standard AI Agent Handoff Prompt Builder
 * Used by Antigravity, Cursor, Claude Code, and Windsurf
 */

export interface SheetbotHandoffPromptOptions {
  projectName?: string;
  sheetUrl?: string;
  bridgeUrl?: string;
  requirement?: string;
  isNewSheet?: boolean;
}

export function buildSheetbotHandoffPrompt(options: SheetbotHandoffPromptOptions): string {
  const req = (options.requirement || "").trim();
  const isNew = Boolean(options.isNewSheet);

  const defaultReq = isNew
    ? "[원하는 기능 입력 (예: 비즈니스에 맞는 시트 탭과 컬럼 구조를 설계하고 필요한 자동화 메뉴 주입)]"
    : "[원하는 기능 입력 (예: 사이드바에서 영수증/명함 이미지를 올리면 분석 후 자동 기입)]";

  const finalReq = req || defaultReq;

  const intro = isNew
    ? "아래 웹 주소를 통해 새 구글 시트의 컬럼 구조와 자동화 스크립트를 처음부터 설계하고 주입해줘:"
    : "아래 웹 주소를 통해 내 구글 시트의 헤더 구조와 기존 코드를 확인하고, 필요한 기능 코드를 주입해줘:";

  const bridge = options.bridgeUrl || "https://sheetbot.cloud/api/agent/gas-bridge?token=...";

  return `${intro}
웹 주소: ${bridge}
요구사항: ${finalReq}`;
}

/**
 * Resolves a complete, valid handoff prompt from whatever inputs are available.
 * If promptTemplate already contains the bridgeUrl, it ensures sheetUrl is included.
 * If promptTemplate is just a short requirement text (or empty), it builds the full prompt.
 */
export function resolveCompleteHandoffPrompt(options: {
  bridgeUrl?: string;
  promptTemplate?: string;
  sheetUrl?: string;
  projectName?: string;
  isNewSheet?: boolean;
}): string {
  const { bridgeUrl, promptTemplate, isNewSheet } = options;

  // If promptTemplate already contains bridgeUrl or "웹 주소:", it is already formatted!
  if (promptTemplate && (promptTemplate.includes("웹 주소:") || (bridgeUrl && promptTemplate.includes(bridgeUrl)))) {
    return promptTemplate;
  }

  // Otherwise, promptTemplate is either just the user's raw requirement (e.g. "매일 발주서 정리해줘") or empty
  return buildSheetbotHandoffPrompt({
    bridgeUrl,
    requirement: promptTemplate,
    isNewSheet,
  });
}

/**
 * Safe clipboard copy with modern API and reliable document.execCommand fallback
 */
export async function copyTextSafely(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (success) return true;
    } catch {
      // Failed
    }
  }

  return false;
}
