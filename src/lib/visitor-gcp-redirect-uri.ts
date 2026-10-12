/**
 * BYO visitor GCP redirect URI for the Google Cloud Console (gateway mode).
 * Lives outside generated egdesk-visitor-google.ts so dev regen does not drop it.
 * Keep in sync with visitor-auth-origin.ts resolveOperatorVisitorWebCallbackUri (gateway).
 */

import { resolveEgdeskPublicUrl, resolveVisitorAppPath } from '@/egdesk-visitor-google';

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isPrivateLanHostname(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isDevSiteHostname(hostname: string): boolean {
  return isLoopbackHostname(hostname) || isPrivateLanHostname(hostname);
}

function isLocalEgdeskUrl(value: string): boolean {
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

function isTunnelMcpRoot(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.hostname === 'tunneling-service.onrender.com' ||
      parsed.hostname.endsWith('.egdesk.cloud') ||
      /\/t\/[^/]+/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function isKnownGatewayHostname(hostname: string): boolean {
  return hostname === 'tunneling-service.onrender.com' || hostname.endsWith('.egdesk.cloud');
}

function sanitizeVisitorOAuthBase(returnTo: string, egdeskPublicUrl: string): string {
  const base = egdeskPublicUrl.replace(/\/$/, '');
  try {
    const publicUrl = new URL(base);
    const site = new URL(returnTo);
    if (isKnownGatewayHostname(publicUrl.hostname)) return base;
    if (!/^\/t\/[^/]+/.test(publicUrl.pathname)) return base;
    if (
      (site.protocol === 'http:' || site.protocol === 'https:') &&
      !isDevSiteHostname(site.hostname)
    ) {
      return site.origin;
    }
    return publicUrl.origin;
  } catch {
    return base;
  }
}

function resolveLocalVisitorMcpRoot(egdeskPublicUrl: string): string {
  const trimmed = egdeskPublicUrl.replace(/\/$/, '');
  try {
    const parsed = new URL(trimmed);
    if (isLoopbackHostname(parsed.hostname)) {
      const port = parsed.port || '8080';
      return `http://localhost:${port}`;
    }
  } catch {
    // ignore
  }
  return 'http://localhost:8080';
}

/** Loopback dev uses local MCP, not NEXT_PUBLIC_EGDESK_TUNNEL_URL or the Next dev port. */
function effectiveEgdeskPublicUrlForGcpRedirect(): string {
  const configured = (
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_EGDESK_API_URL) ||
    ''
  ).replace(/\/$/, '');
  const tunnelUrl = (
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_EGDESK_TUNNEL_URL) ||
    ''
  ).replace(/\/$/, '');
  if (typeof window !== 'undefined' && isLoopbackHostname(window.location.hostname)) {
    if (configured && isLocalEgdeskUrl(configured)) return configured;
    if (tunnelUrl && isLocalEgdeskUrl(tunnelUrl)) return tunnelUrl;
    return 'http://localhost:8080';
  }
  return resolveEgdeskPublicUrl();
}

export function resolveVisitorGcpRedirectUriToRegister(): string {
  if (typeof window === 'undefined') {
    throw new Error('resolveVisitorGcpRedirectUriToRegister() must run in the browser');
  }
  const returnTo = new URL(resolveVisitorAppPath('/auth/callback'), window.location.origin).toString();
  const egdeskPublicUrl = effectiveEgdeskPublicUrlForGcpRedirect();
  const returnHostname = new URL(returnTo).hostname;

  if (isLoopbackHostname(returnHostname)) {
    return `${resolveLocalVisitorMcpRoot(egdeskPublicUrl)}/visitor-auth/callback`;
  }
  if (isDevSiteHostname(returnHostname)) {
    const base = sanitizeVisitorOAuthBase(returnTo, egdeskPublicUrl);
    if (isTunnelMcpRoot(base)) {
      return `${base.replace(/\/$/, '')}/visitor-auth/callback`;
    }
    return `${resolveLocalVisitorMcpRoot(egdeskPublicUrl)}/visitor-auth/callback`;
  }
  const sanitized = sanitizeVisitorOAuthBase(returnTo, egdeskPublicUrl);
  return `${sanitized.replace(/\/$/, '')}/visitor-auth/callback`;
}
