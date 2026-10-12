/**
 * Public site origin + gas-bridge URLs when SheetBot runs behind the EGDesk tunnel
 * (Next sees localhost host, but browsers/agents use sheetbot.cloud or /t/.../p/...).
 */

function firstHeaderValue(value: string | null): string {
  return (value || "").split(",")[0].trim();
}

/** Origin for visitor MCP calls (must match startVisitorGoogleLogin). */
export function resolvePublicSiteOrigin(headers: Headers): string {
  const host = firstHeaderValue(headers.get("x-forwarded-host") || headers.get("host")).toLowerCase();
  const proto = firstHeaderValue(headers.get("x-forwarded-proto") || "https");

  if (!host || host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    const fromEnv =
      process.env.NEXT_PUBLIC_EGDESK_VISITOR_ORIGIN ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXTAUTH_URL;
    if (fromEnv) {
      try {
        return new URL(fromEnv).origin;
      } catch {
        return fromEnv.replace(/\/$/, "");
      }
    }
    return "https://sheetbot.cloud";
  }

  return `${proto}://${host}`.replace(/\/$/, "");
}

function tunnelBasePathBeforeApi(pathname: string): string {
  const apiIdx = pathname.indexOf("/api/");
  if (apiIdx <= 0) return "";
  const prefix = pathname.slice(0, apiIdx);
  return prefix.startsWith("/t/") ? prefix.replace(/\/$/, "") : "";
}

/** Base URL for API routes (includes Next basePath when present on the request path). */
export function resolveGasBridgePublicBaseUrl(request: Request): string {
  const origin = resolvePublicSiteOrigin(request.headers);
  const path = new URL(request.url).pathname;

  const fromRequestPath = tunnelBasePathBeforeApi(path);
  if (fromRequestPath) {
    return `${origin}${fromRequestPath}`.replace(/\/$/, "");
  }

  const fromEnv =
    process.env.NEXT_PUBLIC_EGDESK_BASE_PATH || process.env.EGDESK_BASE_PATH || "";
  if (fromEnv.startsWith("/t/")) {
    return `${origin}${fromEnv.replace(/\/$/, "")}`;
  }

  return origin.replace(/\/$/, "");
}

export function resolveGasBridgePostEndpoint(request: Request, token: string): string {
  const base = resolveGasBridgePublicBaseUrl(request);
  return `${base}/api/agent/gas-bridge?token=${encodeURIComponent(token)}`;
}
