import {
  VISITOR_WORKSPACE_SCOPES,
  getStoredVisitorGcpHandle,
  startVisitorGoogleLogin,
} from "@/egdesk-visitor-google";

/** SheetBot automation: workspace scopes + full Drive + Apps Script deploy. */
export const SHEETBOT_WORKSPACE_SCOPES = [
  ...VISITOR_WORKSPACE_SCOPES,
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/script.projects",
  "https://www.googleapis.com/auth/script.external_request",
] as const;

export type StartSheetbotByoVisitorLoginOptions = {
  next?: string;
  forceConsent?: boolean;
};

/**
 * Start Google OAuth with the visitor's BYO GCP client (same as /login).
 * Returns false if no BYO handle is registered (caller should prompt upload on /login).
 */
export async function startSheetbotByoVisitorLogin(
  options: StartSheetbotByoVisitorLoginOptions = {},
): Promise<boolean> {
  const handle = getStoredVisitorGcpHandle();
  if (!handle?.trim()) {
    return false;
  }

  await startVisitorGoogleLogin({
    next: options.next ?? "/dashboard",
    forceConsent: options.forceConsent ?? true,
    scopes: [...SHEETBOT_WORKSPACE_SCOPES],
    gcp: "self",
    handle: handle.trim(),
  });
  return true;
}
