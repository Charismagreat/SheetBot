/**
 * Visitor Google login defaults for this site.
 *
 * OWNED BY THIS PROJECT — EGDesk will not overwrite this file.
 * Generated helpers (egdesk-visitor-google.ts) read these defaults.
 *
 * Customize login UI in your own pages. Do not edit generated helpers.
 */
export const VISITOR_AUTH = {
  /**
   * 'basic' — email/profile only (smaller Google consent).
   * 'workspace' — Drive (per-file), Sheets, Docs, Slides.
   * A page can still pass startVisitorGoogleLogin({ scopes: VISITOR_WORKSPACE_SCOPES }).
   */
  scopes: 'basic' as 'basic' | 'workspace',
};
