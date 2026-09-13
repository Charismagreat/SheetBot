/**
 * Google Apps Script 표준 매니페스트(appsscript.json) 생성 및 필수 OAuth 스코프 자동 주입 헬퍼
 */

export const STANDARD_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/script.container.ui',
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/drive',
];

export function ensureStandardManifest(rawManifest?: string | null): string {
  let parsed: any = {};
  if (rawManifest && rawManifest.trim()) {
    try {
      parsed = JSON.parse(rawManifest);
    } catch {
      parsed = {};
    }
  }

  parsed.timeZone = parsed.timeZone || 'Asia/Seoul';
  parsed.dependencies = parsed.dependencies || {};
  parsed.exceptionLogging = parsed.exceptionLogging || 'STACKDRIVER';
  parsed.runtimeVersion = parsed.runtimeVersion || 'V8';

  const scopeSet = new Set<string>(Array.isArray(parsed.oauthScopes) ? parsed.oauthScopes : []);
  STANDARD_OAUTH_SCOPES.forEach((scope) => scopeSet.add(scope));
  parsed.oauthScopes = Array.from(scopeSet);

  return JSON.stringify(parsed, null, 2);
}
