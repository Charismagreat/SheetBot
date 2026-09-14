// Central re-export of root egdesk-helpers
export * from '../../egdesk-helpers';

export interface AiCallerOptions {
  caller?: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
}

export interface AiCallerResponse {
  text: string;
  content?: string;
  usage?: any;
  raw?: any;
}

/**
 * 이지데스크 표준 AI Caller 호출 함수
 * http://localhost:8080/ai-caller/tools/call 경유
 */
export async function callAiCaller(
  prompt: string,
  options: AiCallerOptions = {}
): Promise<AiCallerResponse> {
  const apiUrl =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_EGDESK_API_URL) ||
    'http://localhost:8080';

  const args: Record<string, any> = {
    prompt,
    ...(options.model ? { model: options.model } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
  };

  const response = await fetch(`${apiUrl}/ai-caller/tools/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tool: 'ai_caller_call',
      arguments: args,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI Caller HTTP error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  let innerText = '';
  if (json?.result?.content?.[0]?.text) {
    try {
      const parsed = JSON.parse(json.result.content[0].text);
      innerText = parsed.content || parsed.text || json.result.content[0].text;
    } catch {
      innerText = json.result.content[0].text;
    }
  } else if (json?.content) {
    innerText = json.content;
  } else if (json?.text) {
    innerText = json.text;
  }

  return {
    text: innerText,
    content: innerText,
    usage: json?.result?.usage,
    raw: json,
  };
}

/** Run company research search with options */
export async function runCompanyResearch(
  query: string,
  options?: { companyName?: string; clientBusinessNumber?: string; bypassCache?: boolean }
) {
  const { callCompanyResearchTool } = await import('../../egdesk-helpers');
  return callCompanyResearchTool('companyresearch_search', {
    searchText: query,
    ...(options || {})
  });
}

/**
 * 서버 사이드에서 유저 방문자 세션으로 Google Workspace MCP 도구(sheets, drive, apps-script)를 호출할 때
 * X-Visitor-Origin 헤더를 반드시 동봉하여 안전하게 실행하는 헬퍼
 */
export async function callVisitorWorkspaceTool(
  service: 'sheets' | 'drive' | 'apps-script',
  toolName: string,
  args: Record<string, any> = {},
  visitorSessionId?: string | null,
  siteOrigin: string = 'http://localhost:4003'
) {
  const apiUrl =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_EGDESK_API_URL) ||
    'http://localhost:8080';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const payloadArgs = { ...args };

  if (visitorSessionId) {
    headers['Authorization'] = `Bearer ${visitorSessionId}`;
    headers['X-EGDesk-As-Visitor'] = 'true';
    headers['X-Visitor-Origin'] = siteOrigin;
    payloadArgs.asVisitor = true;
  }

  const response = await fetch(`${apiUrl}/${service}/tools/call`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tool: toolName,
      arguments: payloadArgs,
    }),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.success === false) {
    const msg = json?.error || json?.message || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(msg);
  }

  const textContent = json.result?.content?.[0]?.text;
  if (!textContent) return json.result || json;
  try {
    return JSON.parse(textContent);
  } catch {
    return textContent;
  }
}


