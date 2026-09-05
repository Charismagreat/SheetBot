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
