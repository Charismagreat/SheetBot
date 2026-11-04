import {
  VISITOR_WORKSPACE_SCOPES,
  getStoredVisitorGcpHandle,
  setStoredVisitorGcpHandle,
  startVisitorGoogleLogin,
} from "@/egdesk-visitor-google";
import { apiFetch } from "@/lib/api";

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
  handle?: string;
};

/**
 * Start Google OAuth with the visitor's BYO GCP client (same as /login).
 * Automatically checks server-stored BYO handle if localStorage is empty (e.g., on mobile).
 * Returns false if no BYO handle is registered.
 */
export async function startSheetbotByoVisitorLogin(
  options: StartSheetbotByoVisitorLoginOptions = {},
): Promise<boolean> {
  let handle = options.handle?.trim() || getStoredVisitorGcpHandle()?.trim() || "";

  if (!handle) {
    try {
      const res = await apiFetch("/api/auth/gcp-handle");
      const data = await res.json().catch(() => null);
      if (data?.registered && data?.handle) {
        handle = String(data.handle).trim();
        setStoredVisitorGcpHandle(handle);
      }
    } catch {}
  }

  if (!handle) {
    return false;
  }

  await startVisitorGoogleLogin({
    next: options.next ?? "/dashboard",
    forceConsent: options.forceConsent ?? true,
    scopes: [...SHEETBOT_WORKSPACE_SCOPES],
    gcp: "self",
    handle,
  });
  return true;
}

/**
 * Start 1-click Google OAuth without requiring a BYO GCP JSON upload (ideal for mobile users).
 * If a server/local BYO handle exists, uses it automatically; otherwise uses platform OAuth.
 */
export async function startSheetbotInstantVisitorLogin(
  options: StartSheetbotByoVisitorLoginOptions = {},
): Promise<void> {
  let handle = options.handle?.trim() || getStoredVisitorGcpHandle()?.trim() || "";
  if (!handle) {
    try {
      const res = await apiFetch("/api/auth/gcp-handle");
      const data = await res.json().catch(() => null);
      if (data?.registered && data?.handle) {
        handle = String(data.handle).trim();
        setStoredVisitorGcpHandle(handle);
      }
    } catch {}
  }

  if (handle) {
    await startVisitorGoogleLogin({
      next: options.next ?? "/dashboard",
      forceConsent: options.forceConsent ?? true,
      scopes: [...SHEETBOT_WORKSPACE_SCOPES],
      gcp: "self",
      handle,
    });
    return;
  }

  await startVisitorGoogleLogin({
    next: options.next ?? "/dashboard",
    forceConsent: options.forceConsent ?? true,
    scopes: [...SHEETBOT_WORKSPACE_SCOPES],
  });
}
