import { NextRequest, NextResponse } from 'next/server';

function resolveEgdeskMcpApiUrl(): string {
  const internal = process.env.EGDESK_MCP_INTERNAL_URL;
  if (internal && internal.trim()) return internal.replace(/\/$/, '');
  return (process.env.NEXT_PUBLIC_EGDESK_API_URL || 'http://localhost:8080').replace(/\/$/, '');
}

function buildEgdeskHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {};
  const apiKey = process.env.NEXT_PUBLIC_EGDESK_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID;
  const egdeskEnv = process.env.NEXT_PUBLIC_EGDESK_ENV;
  if (apiKey) headers['X-Api-Key'] = apiKey;
  if (projectId) headers['X-EGDesk-Project-Id'] = projectId;
  if (egdeskEnv) headers['X-EGDesk-Env'] = egdeskEnv;
  if (extra) {
    const e = new Headers(extra);
    e.forEach((v, k) => {
      headers[k] = v;
    });
  }
  return headers;
}

export async function proxyJson(pathname: string, init?: RequestInit) {
  const apiUrl = resolveEgdeskMcpApiUrl();
  const response = await fetch(`${apiUrl}${pathname}`, {
    ...init,
    headers: buildEgdeskHeaders(init?.headers),
    cache: 'no-store',
  });
  const text = await response.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { success: false, error: text || `HTTP ${response.status}` };
  }
  return NextResponse.json(body, { status: response.status });
}

export async function proxyRaw(
  pathname: string,
  method: string,
  body: ArrayBuffer | null,
  headers?: HeadersInit,
) {
  const apiUrl = resolveEgdeskMcpApiUrl();
  const response = await fetch(`${apiUrl}${pathname}`, {
    method,
    headers: buildEgdeskHeaders(headers),
    body: body && body.byteLength > 0 ? body : undefined,
    // @ts-expect-error duplex required for streaming bodies in some runtimes
    duplex: 'half',
    cache: 'no-store',
  });
  const text = await response.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { success: false, error: text || `HTTP ${response.status}` };
  }
  return NextResponse.json(parsed, { status: response.status });
}
