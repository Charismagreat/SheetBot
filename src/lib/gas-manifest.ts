/**
 * Google Apps Script 표준 매니페스트(appsscript.json) 생성 및 필수 OAuth 스코프 자동 주입 헬퍼
 */

export { STANDARD_OAUTH_SCOPES, ensureStandardManifest } from './gas/oauth-manifest';
export { generateSecureEgdeskConfig } from './gas/egdesk-config';
export { generateStandardEgdeskClient } from './gas/egdesk-client';
export { generateStandardTokenRecharge } from './gas/token-recharge';
