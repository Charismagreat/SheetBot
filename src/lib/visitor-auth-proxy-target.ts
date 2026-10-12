/**
 * Server-side visitor-auth proxy routing (keep aligned with @egdesk/next-api-plugin generate-proxy.ts).
 */

const DESKTOP_ONLY_TOOLS = new Set(['register_gcp', 'gcp_status', 'forget_gcp']);

function normalizeMcpRoot(value: string): string {
  return value.replace(/\/$/, '');
}

export function resolveVisitorAuthMcpApiUrl(): string {
  const internal = process.env.EGDESK_MCP_INTERNAL_URL;
  if (internal?.trim()) return normalizeMcpRoot(internal);
  const tunnel = process.env.NEXT_PUBLIC_EGDESK_TUNNEL_URL;
  if (tunnel?.trim()) return normalizeMcpRoot(tunnel);
  const publicUrl = process.env.NEXT_PUBLIC_EGDESK_API_URL;
  if (publicUrl?.trim()) return normalizeMcpRoot(publicUrl);
  return 'http://localhost:8080';
}

function visitorAuthToolFromBody(body: Record<string, unknown>): string {
  return String(body.tool || body.op || '').trim();
}

function toolArguments(body: Record<string, unknown>): Record<string, unknown> {
  const args = body.arguments;
  return args && typeof args === 'object' ? (args as Record<string, unknown>) : body;
}

/** BYO (gcp:self) and register_gcp must hit desktop MCP, not the tunnel gateway. */
export function resolveVisitorAuthMcpApiUrlForProxyBody(body: Record<string, unknown>): string {
  const tool = visitorAuthToolFromBody(body);
  if (DESKTOP_ONLY_TOOLS.has(tool)) {
    const internal = process.env.EGDESK_MCP_INTERNAL_URL;
    if (internal?.trim()) return normalizeMcpRoot(internal);
    return 'http://localhost:8080';
  }
  if (tool === 'start') {
    const args = toolArguments(body);
    const gcp = typeof args.gcp === 'string' ? args.gcp.trim() : '';
    const handle = typeof args.handle === 'string' ? args.handle.trim() : '';
    if (gcp === 'self' || handle) {
      const internal = process.env.EGDESK_MCP_INTERNAL_URL;
      if (internal?.trim()) return normalizeMcpRoot(internal);
      return 'http://localhost:8080';
    }
  }
  return resolveVisitorAuthMcpApiUrl();
}

export function resolveVisitorForwardOrigin(
  headers: Headers,
  nextUrlOrigin: string,
): string {
  const fromVisitor = headers.get('x-visitor-origin')?.trim();
  if (fromVisitor && fromVisitor !== 'null') return fromVisitor;
  const fromOrigin = headers.get('origin')?.trim();
  if (fromOrigin && fromOrigin !== 'null') return fromOrigin;
  const referer = headers.get('referer')?.trim();
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // ignore
    }
  }
  return nextUrlOrigin;
}
