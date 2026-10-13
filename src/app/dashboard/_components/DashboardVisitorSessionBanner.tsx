"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";
import {
  getStoredVisitorGcpHandle,
  getVisitorGoogleStatus,
} from "@/egdesk-visitor-google";

const VISITOR_SESSION_KEY = "egdesk_visitor_session";

type VisitorBannerKind = "no_byo" | "no_session" | "disconnected";

/**
 * Warns when Apps Script deploy cannot use the user's BYO visitor Google session.
 * Hidden for admins (deploy uses operator MCP credentials).
 */
export function DashboardVisitorSessionBanner({
  mounted,
  isAdminUser,
}: {
  mounted: boolean;
  isAdminUser: boolean;
}) {
  const [kind, setKind] = useState<VisitorBannerKind | null>(null);
  const [checking, setChecking] = useState(true);

  const evaluate = useCallback(async () => {
    if (!mounted || isAdminUser) {
      setKind(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    try {
      const byoHandle = getStoredVisitorGcpHandle();
      const sessId =
        typeof window !== "undefined" ? localStorage.getItem(VISITOR_SESSION_KEY) : null;

      if (!byoHandle?.trim()) {
        setKind("no_byo");
        return;
      }
      if (!sessId?.trim()) {
        setKind("no_session");
        return;
      }

      const status = await getVisitorGoogleStatus();
      if (status?.connected && status?.email) {
        setKind(null);
        return;
      }
      setKind("disconnected");
    } catch {
      setKind("disconnected");
    } finally {
      setChecking(false);
    }
  }, [mounted, isAdminUser]);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  useEffect(() => {
    if (!mounted || isAdminUser) return;

    const refresh = () => {
      if (document.visibilityState === "visible") {
        void evaluate();
      }
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("sheetbot-auth-change", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("sheetbot-auth-change", refresh);
    };
  }, [mounted, isAdminUser, evaluate]);

  if (!mounted || isAdminUser || checking || !kind) {
    return null;
  }

  const copy =
    kind === "no_byo"
      ? {
          title: "BYO Google Cloud OAuth가 등록되지 않았습니다",
          body:
            "새 구글 시트 자동 생성과 Apps Script 배포 모두 본인 GCP 웹 클라이언트 JSON 등록 후 BYO Google 로그인이 필요합니다.",
          cta: "로그인 · GCP 등록",
        }
      : kind === "no_session"
        ? {
            title: "EGDesk 방문자 세션이 없습니다",
            body:
              "대시보드에는 로그인되어 있지만, 시트 자동 생성·Apps Script 배포에 필요한 EGDesk 방문자 세션이 없습니다. BYO Google로 다시 로그인해 주세요.",
            cta: "BYO Google 다시 로그인",
          }
        : {
            title: "Google Workspace 연동이 끊어진 것 같습니다",
            body:
              "방문자 세션은 있으나 Google Drive·Sheets 권한이 만료되었거나 EGDesk와 동기화되지 않았습니다. BYO Google로 다시 로그인하면 시트 생성·프로젝트 배포가 정상화됩니다.",
            cta: "연동 다시 하기",
          };

  return (
    <div
      className="rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50 via-orange-50/80 to-amber-50 p-4 shadow-xs"
      role="status"
      data-easybot-hint="방문자 Google 세션 안내: Apps Script 시트 바인딩·배포는 EGDesk BYO 방문자 OAuth 세션이 필요합니다."
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-extrabold text-amber-950">{copy.title}</p>
            <p className="text-xs font-medium text-amber-900/85 leading-relaxed">{copy.body}</p>
          </div>
        </div>
        <Link
          href="/login?callbackUrl=%2Fdashboard"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold bg-amber-600 hover:bg-amber-700 text-white shadow-sm shrink-0 transition-colors"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{copy.cta}</span>
          <ArrowRight className="w-3.5 h-3.5 opacity-80" />
        </Link>
      </div>
    </div>
  );
}
