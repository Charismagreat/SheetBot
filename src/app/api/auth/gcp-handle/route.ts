export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, insertRows, updateRows, getServerEgdeskApiUrl } from "@/lib/egdesk-helpers";
import { EGDESK_CONFIG } from "../../../../../egdesk.config";
import crypto from "crypto";

const DEFAULT_HANDLE_KEY = "default_byo_gcp_handle";
const SITE_ORIGIN = "https://sheetbot.cloud";
const SAMPLE_RETURN_TO = "https://sheetbot.cloud/auth/callback";

function extractClientIp(req: NextRequest): string | undefined {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return undefined;
}

function buildMcpHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Key": EGDESK_CONFIG.apiKey,
    Origin: SITE_ORIGIN,
    "X-Visitor-Origin": SITE_ORIGIN,
  };
  const clientIp = extractClientIp(req);
  if (clientIp) {
    headers["X-EGDesk-Visitor-Client-Ip"] = clientIp;
  }
  return headers;
}

async function callDesktopVisitorAuth(
  req: NextRequest,
  tool: string,
  args: Record<string, unknown>
): Promise<any> {
  const apiUrl = getServerEgdeskApiUrl();
  const res = await fetch(`${apiUrl}/visitor-auth/tools/call`, {
    method: "POST",
    headers: buildMcpHeaders(req),
    body: JSON.stringify({ tool, arguments: args }),
    signal: AbortSignal.timeout(12_000),
  });
  const json: any = await res.json().catch(() => null);
  const textContent = json?.result?.content?.[0]?.text;
  if (textContent) {
    try {
      return JSON.parse(textContent);
    } catch {
      return json?.result || json;
    }
  }
  return json?.result || json;
}

async function upsertSetting(key: string, valueObj: Record<string, unknown>, description: string) {
  const now = new Date().toISOString();
  const existing = await queryTable("sheetbot_settings", {
    filters: { key },
    limit: 5,
  }).catch(() => ({ rows: [] }));

  const activeRow = (existing.rows || []).find((r: any) => !r.deleted_at);
  const valueStr = JSON.stringify({ ...valueObj, updatedAt: now });

  if (activeRow) {
    await updateRows(
      "sheetbot_settings",
      {
        value: valueStr,
        description,
        updated_at: now,
        deleted_at: null,
      },
      { filters: { id: String(activeRow.id) } }
    );
  } else {
    await insertRows("sheetbot_settings", [
      {
        id: String(Date.now()),
        uuid: crypto.randomUUID(),
        key,
        value: valueStr,
        description,
        created_at: now,
        updated_at: now,
      },
    ]);
  }
}

export async function getActiveServerByoHandle(
  req: NextRequest,
  email?: string | null
): Promise<{
  handle: string | null;
  registered: boolean;
  clientIdMasked?: string | null;
  projectId?: string | null;
  redirectUriToRegister?: string | null;
}> {
  const candidateHandles: string[] = [];
  const storedProjects = new Map<string, string>();

  const cleanEmail = (email || "").toLowerCase().trim();
  const keysToCheck = cleanEmail
    ? [`byo_gcp_handle_${cleanEmail}`, DEFAULT_HANDLE_KEY]
    : [DEFAULT_HANDLE_KEY];

  for (const key of keysToCheck) {
    const res = await queryTable("sheetbot_settings", {
      filters: { key },
      limit: 5,
    }).catch(() => ({ rows: [] }));
    const active = (res.rows || []).find((r: any) => !r.deleted_at && r.value);
    if (active?.value) {
      try {
        const parsed = JSON.parse(active.value);
        const h = String(parsed?.handle || "").trim();
        if (h && !candidateHandles.includes(h)) {
          candidateHandles.push(h);
          if (parsed?.projectId) storedProjects.set(h, String(parsed.projectId));
        }
      } catch {}
    }
  }

  for (const handle of candidateHandles) {
    try {
      const status = await callDesktopVisitorAuth(req, "gcp_status", {
        handle,
        sampleReturnTo: SAMPLE_RETURN_TO,
        egdeskPublicUrl: SITE_ORIGIN,
      });
      if (status?.registered || status?.connected) {
        return {
          handle,
          registered: true,
          clientIdMasked: status.clientIdMasked || null,
          projectId: status.projectId || storedProjects.get(handle) || "내 Google Cloud 프로젝트",
          redirectUriToRegister:
            status.redirectUriToRegister || `${SITE_ORIGIN}/visitor-auth/callback`,
        };
      }
    } catch {}
  }

  return { handle: null, registered: false };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const explicitHandle = (url.searchParams.get("handle") || "").trim();
    const email = (url.searchParams.get("email") || "").toLowerCase().trim();

    if (explicitHandle) {
      const status = await callDesktopVisitorAuth(req, "gcp_status", {
        handle: explicitHandle,
        sampleReturnTo: SAMPLE_RETURN_TO,
        egdeskPublicUrl: SITE_ORIGIN,
      });
      if (status?.registered || status?.connected) {
        return NextResponse.json({
          success: true,
          handle: explicitHandle,
          registered: true,
          clientIdMasked: status.clientIdMasked || null,
          projectId: status.projectId || "내 Google Cloud 프로젝트",
          redirectUriToRegister:
            status.redirectUriToRegister || `${SITE_ORIGIN}/visitor-auth/callback`,
        });
      }
      return NextResponse.json({ success: true, handle: null, registered: false });
    }

    const active = await getActiveServerByoHandle(req, email);
    return NextResponse.json({
      success: true,
      ...active,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, registered: false, error: err?.message || "GCP 상태 조회 실패" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const email = String(body.email || "").toLowerCase().trim();
    let handle = String(body.handle || "").trim();
    let projectId = String(body.projectId || "").trim();
    let clientIdMasked = String(body.clientIdMasked || "").trim();
    let redirectUriToRegister = `${SITE_ORIGIN}/visitor-auth/callback`;

    // 모바일/웹에서 Client ID + Client Secret 직접 입력 시 표준 Web OAuth JSON으로 자동 변환하여 등록
    let oauthClientJson = body.oauthClientJson;
    const rawClientId = String(body.clientId || "").trim();
    const rawClientSecret = String(body.clientSecret || "").trim();

    if (!oauthClientJson && rawClientId && rawClientSecret) {
      oauthClientJson = {
        web: {
          client_id: rawClientId,
          project_id: projectId || "sheetbot-mobile-byo",
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
          client_secret: rawClientSecret,
          redirect_uris: [`${SITE_ORIGIN}/visitor-auth/callback`],
          javascript_origins: [SITE_ORIGIN],
        },
      };
    }

    if (oauthClientJson) {
      if (typeof oauthClientJson === "string") {
        try {
          oauthClientJson = JSON.parse(oauthClientJson);
        } catch {
          return NextResponse.json(
            { success: false, error: "올바른 JSON 형식이 아닙니다." },
            { status: 400 }
          );
        }
      }
      // 모바일에서 업로드/붙여넣은 JSON에 redirect_uris가 누락된 경우 자동 보강
      if (oauthClientJson?.web && typeof oauthClientJson.web === "object") {
        const uris = Array.isArray(oauthClientJson.web.redirect_uris)
          ? [...oauthClientJson.web.redirect_uris]
          : [];
        const requiredUri = `${SITE_ORIGIN}/visitor-auth/callback`;
        if (!uris.includes(requiredUri)) {
          uris.push(requiredUri);
        }
        oauthClientJson = {
          ...oauthClientJson,
          web: {
            ...oauthClientJson.web,
            redirect_uris: uris,
          },
        };
        if (!projectId && oauthClientJson.web.project_id) {
          projectId = String(oauthClientJson.web.project_id);
        }
      }

      const regRes = await callDesktopVisitorAuth(req, "register_gcp", {
        oauthClientJson,
        handle: handle || undefined,
        egdeskPublicUrl: SITE_ORIGIN,
        sampleReturnTo: SAMPLE_RETURN_TO,
      });

      if (!regRes?.handle) {
        return NextResponse.json(
          {
            success: false,
            error: regRes?.error || "GCP OAuth 클라이언트 등록에 실패했습니다.",
          },
          { status: 400 }
        );
      }
      handle = String(regRes.handle).trim();
      clientIdMasked = String(regRes.clientIdMasked || clientIdMasked || "");
      projectId = String(regRes.projectId || projectId || "내 Google Cloud 프로젝트");
      redirectUriToRegister = String(
        regRes.redirectUriToRegister || `${SITE_ORIGIN}/visitor-auth/callback`
      );
    }

    if (!handle) {
      return NextResponse.json(
        { success: false, error: "등록할 GCP 핸들 또는 클라이언트 정보가 없습니다." },
        { status: 400 }
      );
    }

    // 핸들 유효성 확인
    const statusRes = await callDesktopVisitorAuth(req, "gcp_status", {
      handle,
      sampleReturnTo: SAMPLE_RETURN_TO,
      egdeskPublicUrl: SITE_ORIGIN,
    });

    if (!statusRes?.registered && !statusRes?.connected) {
      return NextResponse.json(
        {
          success: false,
          error: "유효하지 않거나 만료된 GCP 핸들입니다. JSON 또는 Client ID를 다시 등록해 주세요.",
        },
        { status: 400 }
      );
    }

    clientIdMasked = String(statusRes.clientIdMasked || clientIdMasked || "등록 완료");
    projectId = String(statusRes.projectId || projectId || "내 Google Cloud 프로젝트");
    redirectUriToRegister = String(
      statusRes.redirectUriToRegister || redirectUriToRegister
    );

    const payload = {
      handle,
      clientIdMasked,
      projectId,
      redirectUriToRegister,
    };

    await upsertSetting(
      DEFAULT_HANDLE_KEY,
      payload,
      "기본 BYO GCP OAuth 클라이언트 핸들 (PC/모바일 공용)"
    );

    if (email && email.includes("@")) {
      await upsertSetting(
        `byo_gcp_handle_${email}`,
        payload,
        `회원별 BYO GCP OAuth 클라이언트 핸들 (${email})`
      );
    }

    return NextResponse.json({
      success: true,
      registered: true,
      ...payload,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "GCP 핸들 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const email = (url.searchParams.get("email") || "").toLowerCase().trim();
    const now = new Date().toISOString();

    const keys = email ? [`byo_gcp_handle_${email}`, DEFAULT_HANDLE_KEY] : [DEFAULT_HANDLE_KEY];
    for (const key of keys) {
      const existing = await queryTable("sheetbot_settings", {
        filters: { key },
        limit: 5,
      }).catch(() => ({ rows: [] }));
      for (const row of existing.rows || []) {
        if (!row.deleted_at) {
          await updateRows(
            "sheetbot_settings",
            { value: "", deleted_at: now, updated_at: now },
            { filters: { id: String(row.id) } }
          ).catch(() => {});
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "GCP 핸들 해제 실패" },
      { status: 500 }
    );
  }
}
