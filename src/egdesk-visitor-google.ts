// Central re-export of root egdesk-visitor-google (prefer @/egdesk-visitor-google → repo root via tsconfig paths)
export * from '../egdesk-visitor-google';
export { resolveVisitorGcpRedirectUriToRegister } from '../egdesk-visitor-google';

// Fallback & Explicit exports to ensure scopes are always available
export const VISITOR_BASIC_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid',
] as const;

export const VISITOR_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/presentations',
  'openid',
] as const;

