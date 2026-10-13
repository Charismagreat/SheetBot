export type UserAutomationMenuItem = {
  label: string;
  handler: string;
};

export type UserAutomationTrigger = {
  handler: string;
  type: "onEdit" | "onOpen" | "timeDriven" | string;
  /** For timeDriven: e.g. everyDays, everyHours — kept as opaque string for GAS */
  schedule?: string;
};

export type UserAutomationFunction = {
  name: string;
  code: string;
};

export type UserAutomationAiPayload = {
  summary?: string;
  features?: string[];
  functions?: UserAutomationFunction[];
  menuItems?: UserAutomationMenuItem[];
  triggers?: UserAutomationTrigger[];
  noop?: boolean;
  /** Function-level replace when merging existing automation */
  replaceFunctions?: UserAutomationFunction[];
};

export const RESERVED_GAS_FUNCTION_NAMES = new Set([
  "onOpen",
  "onEdit",
  "onInstall",
  "doGet",
  "doPost",
  "showAiCopilotSidebar",
  "getAiCopilotSidebarHtml",
  "openTokenRechargeModal",
  "openSheetBotGuide",
  "getTunnelStatusData",
  "toast_",
  "getSheetByName_",
  "installSheetBotTriggers_",
  "registerSheetBotMenuItems_",
  "onSheetBotOpen_",
  "onSheetBotEdit_",
  "executeUninstallSheetBot",
  "getUserTokenBalanceData",
  "updateSheetBotMenuWithBalance",
]);

export const USER_AUTOMATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    features: { type: "array", items: { type: "string" } },
    noop: { type: "boolean" },
    functions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          code: { type: "string" },
        },
        required: ["name", "code"],
      },
    },
    menuItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          handler: { type: "string" },
        },
        required: ["label", "handler"],
      },
    },
    triggers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          handler: { type: "string" },
          type: { type: "string" },
          schedule: { type: "string" },
        },
        required: ["handler", "type"],
      },
    },
    replaceFunctions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          code: { type: "string" },
        },
        required: ["name", "code"],
      },
    },
  },
};

export function extractFunctionNamesFromGas(code: string): string[] {
  const names: string[] = [];
  const re = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    names.push(m[1]);
  }
  return names;
}

export function validateUserAutomationFunctions(
  functions: UserAutomationFunction[],
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const fn of functions) {
    const name = String(fn.name || "").trim();
    if (!name) {
      errors.push("함수 name이 비어 있습니다.");
      continue;
    }
    if (seen.has(name)) {
      errors.push(`중복 함수명: ${name}`);
    }
    seen.add(name);
    if (RESERVED_GAS_FUNCTION_NAMES.has(name)) {
      errors.push(`예약된 함수명 사용 금지: ${name}`);
    }
    const body = String(fn.code || "").trim();
    if (!body) {
      errors.push(`함수 ${name}의 code가 비어 있습니다.`);
      continue;
    }
    if (!body.includes(`function ${name}`) && !body.includes(`function ${name}(`)) {
      errors.push(`함수 ${name}: code 블록에 function ${name} 선언이 포함되어야 합니다.`);
    }
    if (/[{}]/.test(body) && (body.match(/\{/g) || []).length !== (body.match(/\}/g) || []).length) {
      errors.push(`함수 ${name}: 중괄호 개수가 맞지 않습니다.`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

function buildRegisterMenuItemsFunction(menuItems: UserAutomationMenuItem[]): string {
  const lines = menuItems
    .filter((m) => m.label && m.handler)
    .map((m) => `  menu = menu.addItem(${JSON.stringify(m.label)}, ${JSON.stringify(m.handler)});`);
  if (lines.length === 0) return "";
  return `function registerSheetBotMenuItems_(menu) {
${lines.join("\n")}
  return menu;
}`;
}

function buildInstallTriggersFunction(triggers: UserAutomationTrigger[]): string {
  const blocks: string[] = [];
  for (const t of triggers) {
    const handler = String(t.handler || "").trim();
    const type = String(t.type || "").toLowerCase();
    if (!handler) continue;
    if (type === "onedit") {
      blocks.push(
        `  ScriptApp.newTrigger(${JSON.stringify(handler)}).forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();`,
      );
    } else if (type === "onopen") {
      blocks.push(
        `  ScriptApp.newTrigger(${JSON.stringify(handler)}).forSpreadsheet(SpreadsheetApp.getActive()).onOpen().create();`,
      );
    } else if (type === "timedriven" || type === "time_driven") {
      blocks.push(
        `  ScriptApp.newTrigger(${JSON.stringify(handler)}).timeBased().everyDays(1).atHour(9).create();`,
      );
    }
  }
  if (blocks.length === 0) return "";
  return `function installSheetBotTriggers_() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    ScriptApp.deleteTrigger(existing[i]);
  }
${blocks.join("\n")}
}`;
}

export function assembleUserAutomationGs(payload: UserAutomationAiPayload): string {
  if (payload.noop) {
    return `/**
 * UserAutomation.gs — no business automation requested (noop).
 */
function onSheetBotOpen_(e) {
  toast_("요구사항에 따른 추가 자동화는 없습니다.", "SheetBot", 3);
}
`;
  }

  const parts: string[] = [
    "/**",
    " * UserAutomation.gs — AI-generated business logic only.",
    " */",
    "",
  ];

  const serverMenu = buildRegisterMenuItemsFunction(payload.menuItems || []);
  if (serverMenu) parts.push(serverMenu, "");

  const serverTriggers = buildInstallTriggersFunction(payload.triggers || []);
  if (serverTriggers) parts.push(serverTriggers, "");

  for (const fn of payload.functions || []) {
    const code = String(fn.code || "").trim();
    if (code) parts.push(code, "");
  }

  if (parts.length <= 4) {
    return `/**
 * UserAutomation.gs — placeholder (add handlers via SheetBot regenerate).
 */
function onSheetBotOpen_(e) {}
`;
  }

  return parts.join("\n").trim() + "\n";
}

/** Merge replaceFunctions into existing UserAutomation.gs by function name. */
export function applyFunctionReplacements(
  existingCode: string,
  replacements: UserAutomationFunction[],
): string {
  let code = existingCode || "";
  for (const rep of replacements) {
    const name = String(rep.name || "").trim();
    const newBlock = String(rep.code || "").trim();
    if (!name || !newBlock) continue;
    const fnRe = new RegExp(
      `function\\s+${name}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`,
      "m",
    );
    if (fnRe.test(code)) {
      code = code.replace(fnRe, newBlock);
    } else {
      code = `${code.trim()}\n\n${newBlock}\n`;
    }
  }
  return code.trim() + "\n";
}

export function parseUserAutomationPayload(raw: unknown): UserAutomationAiPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    summary: typeof o.summary === "string" ? o.summary : undefined,
    features: Array.isArray(o.features) ? o.features.map(String) : undefined,
    noop: o.noop === true,
    functions: Array.isArray(o.functions) ? (o.functions as UserAutomationFunction[]) : undefined,
    menuItems: Array.isArray(o.menuItems) ? (o.menuItems as UserAutomationMenuItem[]) : undefined,
    triggers: Array.isArray(o.triggers) ? (o.triggers as UserAutomationTrigger[]) : undefined,
    replaceFunctions: Array.isArray(o.replaceFunctions)
      ? (o.replaceFunctions as UserAutomationFunction[])
      : undefined,
  };
}
