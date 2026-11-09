"use client";

import { apiFetch } from "@/lib/api";
import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Bot,
  ArrowLeft,
  Shield,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Gift,
  UploadCloud,
  FileCode,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Settings,
  AlertTriangle,
  Info,
  Smartphone,
} from "lucide-react";
import {
  getVisitorGoogleStatus,
  signOutVisitorGoogle,
  registerVisitorGcp,
  getVisitorGcpStatus,
  forgetVisitorGcp,
  getStoredVisitorGcpHandle,
  setStoredVisitorGcpHandle,
  resolveEgdeskPublicUrl,
} from "@/egdesk-visitor-google";
import { resolveVisitorGcpRedirectUriToRegister } from "@/lib/visitor-gcp-redirect-uri";
import {
  startSheetbotByoVisitorLogin,
  startSheetbotInstantVisitorLogin,
} from "@/lib/sheetbot-visitor-oauth";

export default function LoginPage() {
  const [visitorEmail, setVisitorEmail] = useState<string | null>(null);
  const [pendingSheetUrl, setPendingSheetUrl] = useState<string | null>(null);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // 🌟 BYO GCP (Bring Your Own Client ID) 전용 상태
  const [gcpHandle, setGcpHandle] = useState<string | null>(null);
  const [gcpStatus, setGcpStatus] = useState<{
    connected?: boolean;
    registered?: boolean;
    clientIdMasked?: string | null;
    projectId?: string | null;
    redirectUriToRegister?: string | null;
    message?: string | null;
  } | null>(null);
  const [isGcpChecking, setIsGcpChecking] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [storedGcpHandleHint, setStoredGcpHandleHint] = useState<string | null>(null);
  const [isForgettingGcp, setIsForgettingGcp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 📱 모바일 직접 입력 (파일 업로드 없이 Client ID / Secret / 핸들 입력) 상태
  const [isMobileInputOpen, setIsMobileInputOpen] = useState(false);
  const [manualClientId, setManualClientId] = useState("");
  const [manualClientSecret, setManualClientSecret] = useState("");
  const [manualHandleInput, setManualHandleInput] = useState("");

  // 🌐 GCP 콘솔 등록용 승인된 자바스크립트 원본 & 승인된 리디렉션 URI
  const [jsOrigin, setJsOrigin] = useState<string>("https://sheetbot.cloud");
  const [redirectUri, setRedirectUri] = useState<string>("https://sheetbot.cloud/visitor-auth/callback");

  // 카카오톡 인앱 브라우저 감지 시 스마트폰 기본 브라우저(크롬/삼성인터넷/사파리)로 자동 전환
  useEffect(() => {
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      const ua = navigator.userAgent || "";
      if (/KAKAOTALK/i.test(ua)) {
        window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`;
      }
    }
  }, []);

  // 현재 브라우저에 저장된 세션, 래핑 시트 주소, 추천인 코드 및 BYO GCP 핸들 초기화
  useEffect(() => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      const isCustomDomain = origin.includes("sheetbot.cloud");
      setJsOrigin(isCustomDomain ? "https://sheetbot.cloud" : origin);
      setRedirectUri(
        isCustomDomain
          ? "https://sheetbot.cloud/visitor-auth/callback"
          : resolveVisitorGcpRedirectUriToRegister()
      );

      const params = new URLSearchParams(window.location.search);
      const cb = params.get("callbackUrl");
      const localSheet = localStorage.getItem("pending_sheet_url");
      const ref = params.get("ref") || localStorage.getItem("pending_ref");
      if (ref) setRefCode(ref.trim());
      if (localSheet) {
        setPendingSheetUrl(localSheet);
      } else if (cb && cb.includes("sheetUrl=")) {
        try {
          const match = cb.match(/sheetUrl=([^&]+)/);
          if (match && match[1]) {
            setPendingSheetUrl(decodeURIComponent(match[1]));
          }
        } catch {}
      }

      // 저장된 GCP 핸들 확인
      const storedHandle = getStoredVisitorGcpHandle();
      if (storedHandle) {
        setGcpHandle(storedHandle);
        setStoredGcpHandleHint(storedHandle);
      }
    }

    // 1) 로그인된 방문자 세션 확인
    const checkVisitorStatus = async () => {
      try {
        const status = await getVisitorGoogleStatus();
        if (status?.connected && status?.email) {
          setVisitorEmail(status.email);
        }
      } catch (err) {
        console.warn("Visitor status check error:", err);
      } finally {
        setIsChecking(false);
      }
    };

    void checkVisitorStatus();
  }, []);

  // 2) 저장된 GCP 핸들이 있는 경우 서버 유효성 점검 (없으면 서버 DB에 등록된 공용/회원 BYO 핸들 자동 조회)
  // ⚠️ gcpHandle을 의존성에서 제거하여 null <-> handle 무한 재호출 루프를 원천 차단
  const refreshGcpStatus = useCallback(async (targetHandle?: string) => {
    setIsGcpChecking(true);
    try {
      const handleToQuery = targetHandle || getStoredVisitorGcpHandle();

      if (!handleToQuery) {
        // 모바일 브라우저 등 localStorage가 비어있는 경우 서버 DB에서 등록된 BYO 핸들 자동 동기화
        const serverRes = await apiFetch("/api/auth/gcp-handle").catch(() => null);
        const serverData = serverRes ? await serverRes.json().catch(() => null) : null;
        if (serverData?.registered && serverData?.handle) {
          const h = String(serverData.handle);
          setGcpStatus({
            connected: true,
            registered: true,
            clientIdMasked: serverData.clientIdMasked,
            projectId: serverData.projectId,
            redirectUriToRegister: serverData.redirectUriToRegister,
          });
          setGcpHandle(h);
          setStoredVisitorGcpHandle(h);
          setStoredGcpHandleHint(h);
          return;
        }
        setGcpStatus(null);
        return;
      }

      const statusRes = await getVisitorGcpStatus(handleToQuery);
      if (statusRes?.registered || statusRes?.connected) {
        setGcpStatus({
          connected: true,
          registered: true,
          clientIdMasked: statusRes.clientIdMasked,
          projectId: statusRes.projectId,
          redirectUriToRegister: statusRes.redirectUriToRegister,
        });
        setGcpHandle(handleToQuery);
        setStoredVisitorGcpHandle(handleToQuery);
        setStoredGcpHandleHint(handleToQuery);
        // PC 브라우저에 있던 핸들을 서버 DB에도 백그라운드 동기화하여 모바일에서도 즉시 사용 가능하게 보장
        void apiFetch("/api/auth/gcp-handle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handle: handleToQuery,
            clientIdMasked: statusRes.clientIdMasked,
            projectId: statusRes.projectId,
          }),
        }).catch(() => {});
      } else {
        setGcpStatus(null);
        setGcpHandle(null);
        setStoredVisitorGcpHandle(null);
        setStoredGcpHandleHint(null);
      }
    } catch (err) {
      console.warn("GCP status check error:", err);
      setGcpStatus(null);
      const stale = getStoredVisitorGcpHandle();
      if (stale) setStoredGcpHandleHint(stale);
    } finally {
      setIsGcpChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshGcpStatus();
  }, [refreshGcpStatus]);

  // 로그인 성공 후 돌아갈 타깃 URL 계산
  const getTargetRedirectUrl = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const cb = params.get("callbackUrl");
      if (cb) return cb;
      const localSheet = localStorage.getItem("pending_sheet_url");
      if (localSheet) return `/dashboard?sheetUrl=${encodeURIComponent(localSheet)}`;
    }
    return "/dashboard";
  };

  // 🌟 [핵심] 사용자가 업로드한 GCP JSON 파싱 및 등록 + 서버 DB 동기화
  const processGcpJsonFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const text = await file.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          "올바른 JSON 형식의 파일이 아닙니다. 구글 콘솔에서 다운로드한 .json 파일을 선택해 주세요."
        );
      }

      if (json.installed) {
        throw new Error(
          "업로드하신 파일은 '데스크톱 앱(Desktop)' 클라이언트입니다. Google Cloud Console에서 애플리케이션 유형을 반드시 '웹 애플리케이션(Web application)'으로 선택하여 다시 다운로드해 주세요."
        );
      }

      if (!json.web || !json.web.client_id) {
        throw new Error(
          "유효한 Google Web OAuth 클라이언트 JSON이 아닙니다. 'web.client_id' 필드가 포함되어 있는지 확인해 주세요."
        );
      }

      const egdeskPublicUrl = resolveEgdeskPublicUrl();
      const result = await registerVisitorGcp({
        oauthClientJson: json,
        handle: gcpHandle || undefined,
        egdeskPublicUrl,
      });

      if (!result?.handle) {
        throw new Error(result?.error || "GCP 클라이언트 등록에 실패했습니다.");
      }

      const nextHandle = String(result.handle);
      const projectId = json.web.project_id || "내 Google Cloud 프로젝트";
      setGcpHandle(nextHandle);
      setStoredVisitorGcpHandle(nextHandle);
      setStoredGcpHandleHint(nextHandle);
      setGcpStatus({
        connected: true,
        registered: true,
        clientIdMasked: result.clientIdMasked,
        projectId,
        redirectUriToRegister: result.redirectUriToRegister,
      });
      setIsGuideOpen(false);

      // 서버 DB에도 저장하여 모바일 브라우저/앱에서도 동일 BYO 핸들을 즉시 공유
      await apiFetch("/api/auth/gcp-handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: nextHandle,
          clientIdMasked: result.clientIdMasked,
          projectId,
        }),
      }).catch(() => {});
    } catch (err: any) {
      console.error("GCP JSON registration failed:", err);
      setUploadError(err?.message || "파일 처리 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 📱 모바일에서 파일 없이 Client ID + Client Secret 또는 핸들 직접 등록
  const handleMobileManualRegister = async () => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const trimmedHandle = manualHandleInput.trim();
      const trimmedId = manualClientId.trim();
      const trimmedSecret = manualClientSecret.trim();

      if (!trimmedHandle && (!trimmedId || !trimmedSecret)) {
        throw new Error(
          "Client ID와 Client Secret을 모두 입력하시거나, 발급된 GCP 핸들(gcp_...)을 입력해 주세요."
        );
      }

      const res = await apiFetch("/api/auth/gcp-handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: trimmedHandle || gcpHandle || undefined,
          clientId: trimmedId || undefined,
          clientSecret: trimmedSecret || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.handle) {
        throw new Error(data?.error || "모바일 GCP 클라이언트 등록에 실패했습니다.");
      }

      const nextHandle = String(data.handle);
      setGcpHandle(nextHandle);
      setStoredVisitorGcpHandle(nextHandle);
      setStoredGcpHandleHint(nextHandle);
      setGcpStatus({
        connected: true,
        registered: true,
        clientIdMasked: data.clientIdMasked,
        projectId: data.projectId || "내 Google Cloud 프로젝트",
        redirectUriToRegister: data.redirectUriToRegister,
      });
      setIsMobileInputOpen(false);
      setIsGuideOpen(false);
    } catch (err: any) {
      setUploadError(err?.message || "모바일 BYO 등록 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
    }
  };

  // 🌟 [핵심] BYO Client ID로 Google 로그인 실행 (gcp: 'self' 강제)
  const handleByoGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await Promise.race([
        signOutVisitorGoogle().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);

      const started = await startSheetbotByoVisitorLogin({
        next: getTargetRedirectUrl(),
        forceConsent: true,
        handle: gcpHandle || undefined,
      });
      if (!started) {
        // BYO 핸들이 없으면 즉시 1초 간편 로그인으로 폴백
        await startSheetbotInstantVisitorLogin({
          next: getTargetRedirectUrl(),
          forceConsent: true,
        });
      }
    } catch (err: any) {
      console.error("BYO Login error:", err);
      setIsLoading(false);
      alert("Google 로그인 시작 중 오류가 발생했습니다: " + (err?.message || "네트워크 오류"));
    }
  };

  // 📱 [모바일/일반 회원] GCP JSON 파일 업로드 없이 1초 즉시 Google 로그인
  const handleInstantGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await Promise.race([
        signOutVisitorGoogle().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);
      await startSheetbotInstantVisitorLogin({
        next: getTargetRedirectUrl(),
        forceConsent: true,
        handle: gcpHandle || undefined,
      });
    } catch (err: any) {
      console.error("Instant Google Login error:", err);
      setIsLoading(false);
      alert("Google 로그인 시작 중 오류가 발생했습니다: " + (err?.message || "네트워크 오류"));
    }
  };

  const showGcpReset =
    Boolean(gcpStatus?.registered || gcpStatus?.connected) ||
    Boolean(gcpHandle || storedGcpHandleHint) ||
    Boolean(uploadError);

  // 등록된 GCP 설정 해제 (초기화) — EGDesk MCP 프로필 + 서버 DB + 브라우저 localStorage
  const handleForgetGcp = async () => {
    if (
      !confirm(
        "등록된 Google Cloud OAuth 클라이언트를 해제할까요?\n\n다른 JSON 또는 Client ID로 다시 등록할 수 있습니다."
      )
    ) {
      return;
    }
    setIsForgettingGcp(true);
    const currentHandle = gcpHandle || getStoredVisitorGcpHandle() || storedGcpHandleHint;
    if (currentHandle) {
      try {
        await forgetVisitorGcp(currentHandle);
      } catch (err) {
        console.warn("forgetVisitorGcp error:", err);
      }
    }
    await apiFetch("/api/auth/gcp-handle", { method: "DELETE" }).catch(() => {});
    setStoredVisitorGcpHandle(null);
    setGcpHandle(null);
    setGcpStatus(null);
    setStoredGcpHandleHint(null);
    setUploadError(null);
    setIsForgettingGcp(false);
  };

  // 클립보드 복사 헬퍼
  const handleCopyText = (text: string, key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-800">
      <div className="w-full max-w-xl space-y-6 my-8">
        {/* 뒤로가기 링크 */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>홈으로 돌아가기</span>
        </Link>

        {/* 로그인 카드 */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xl shadow-slate-200/50 space-y-6">
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 mx-auto">
              <Bot className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                SheetBot 로그인
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed break-keep">
                스마트폰·PC 어디서나 <strong className="text-slate-800 font-extrabold">내 Google 계정</strong>으로 즉시 시작하거나<br />
                <strong className="text-slate-800 font-extrabold">나만의 Google Cloud(BYO Client ID)</strong>를 연결하여 로그인할 수 있습니다.
              </p>
            </div>
          </div>

          {/* 🎁 특별 초대 혜택 안내 배너 */}
          {refCode && (
            <div className="p-4 bg-gradient-to-br from-amber-50 via-emerald-50 to-teal-50 border-2 border-emerald-400/80 rounded-2xl text-left space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-black text-xs text-emerald-950">
                  <Gift className="w-4 h-4 text-emerald-600 animate-pulse" />
                  <span>특별 초대 혜택 적용됨</span>
                </span>
                <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full shadow-2xs">
                  10,000 토큰 선물 🎁
                </span>
              </div>
              <p className="text-[11px] text-slate-700 leading-relaxed break-keep">
                추천인 코드(<strong>{refCode}</strong>)가 적용되었습니다. Google 로그인 완료 시 지갑으로 <strong>10,000 보너스 토큰</strong>이 즉시 자동 충전됩니다.
              </p>
            </div>
          )}

          {/* 🌟 1초 래핑 대기 중인 시트 안내 배너 */}
          {pendingSheetUrl && (
            <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-300/80 rounded-2xl text-left space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-black text-xs text-emerald-900">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                  <span>⚡ 1초 래핑 대기 중</span>
                </span>
                <span className="text-[10px] font-bold bg-emerald-200/60 text-emerald-800 px-2 py-0.5 rounded-full">
                  자동 연동
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 font-mono truncate select-all bg-white/70 px-2 py-1 rounded-lg border border-emerald-100">
                {pendingSheetUrl}
              </p>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* 상태 A: GCP 등록 완료 상태 (Client ID 연결됨) */}
          {/* ------------------------------------------------------------- */}
          {gcpStatus?.connected || gcpStatus?.registered ? (
            <div className="space-y-4 pt-1">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/90 via-teal-50/50 to-white border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                      내 Google Cloud 프로젝트 연결됨 (PC·모바일 동기화)
                    </span>
                  </div>
                  <span className="text-[10px] font-black bg-emerald-600 text-white px-2.5 py-0.5 rounded-full">
                    BYO 활성화
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-700 bg-white/80 p-3 rounded-xl border border-emerald-100/80 font-mono">
                  {gcpStatus.projectId && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Project:</span>
                      <strong className="text-slate-800">{gcpStatus.projectId}</strong>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Client ID:</span>
                    <span className="text-emerald-700 font-bold">
                      {gcpStatus.clientIdMasked || "등록 완료"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">API 쿼터:</span>
                    <span className="text-slate-800 font-semibold">사용자 독자 쿼터 100% 적용</span>
                  </div>
                </div>
              </div>

              {/* 메인 BYO 로그인 실행 버튼 */}
              <button
                onClick={handleByoGoogleLogin}
                disabled={isLoading}
                className="w-full py-4 px-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:opacity-95 text-white font-extrabold text-sm sm:text-base rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-600/25 active:scale-[0.99] cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-5 h-5 text-white animate-spin" />
                    <span>Google 로그인 인증 페이지로 이동 중...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 shrink-0 bg-white p-0.5 rounded-full" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                    <span>Google 계정으로 1초 간편 로그인</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleForgetGcp}
                disabled={isForgettingGcp}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50/50 text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isForgettingGcp ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Settings className="w-3.5 h-3.5" />
                )}
                <span>GCP OAuth 클라이언트 등록 해제 / 다른 JSON으로 변경</span>
              </button>
            </div>
          ) : (
            /* ------------------------------------------------------------- */
            /* 상태 B: 최초 방문 또는 GCP 미등록 상태 (1초 간편 로그인 + PC/모바일 BYO 제공) */
            /* ------------------------------------------------------------- */
            <div className="space-y-4 pt-1">
              {/* 📱 1순위: 모바일·일반 회원용 1초 간편 Google 로그인 버튼 */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    <span>모바일 / 일반 회원 1초 간편 로그인</span>
                  </span>
                  <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                    JSON 파일 불필요
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed break-keep">
                  스마트폰이거나 아직 GCP JSON 파일이 없으신 경우, 아래 버튼으로 즉시 Google 계정을 연결할 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={handleInstantGoogleLogin}
                  disabled={isLoading}
                  className="w-full py-3.5 px-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:opacity-95 text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Google 로그인 페이지로 이동 중...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 shrink-0 bg-white p-0.5 rounded-full" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                        />
                      </svg>
                      <span>Google 계정으로 1초 간편 시작하기</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="grow border-t border-slate-200" />
                <span className="shrink mx-3 text-[11px] font-bold text-slate-400">
                  또는 나만의 Google Cloud (BYO Client ID) 연결
                </span>
                <div className="grow border-t border-slate-200" />
              </div>

              {/* 📱 모바일 직접 입력 아코디언 (파일 없이 Client ID / Secret 또는 핸들 입력) */}
              <div className="border border-indigo-200/80 rounded-2xl overflow-hidden bg-indigo-50/30">
                <button
                  type="button"
                  onClick={() => setIsMobileInputOpen(!isMobileInputOpen)}
                  className="w-full p-3.5 flex items-center justify-between text-left hover:bg-indigo-50/60 transition-colors cursor-pointer"
                >
                  <span className="font-extrabold text-xs text-indigo-950 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-indigo-600" />
                    <span>📱 모바일에서 파일 없이 BYO 직접 입력하기 (Client ID / Secret)</span>
                  </span>
                  {isMobileInputOpen ? (
                    <ChevronUp className="w-4 h-4 text-indigo-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-indigo-600" />
                  )}
                </button>

                {isMobileInputOpen && (
                  <div className="p-4 pt-2 space-y-3 bg-white border-t border-indigo-100 text-xs">
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      스마트폰에서 JSON 파일 다운로드가 어려운 경우, Google Cloud Console의 <strong>클라이언트 ID</strong>와 <strong>클라이언트 보안 비밀번호(Secret)</strong>를 그대로 복사해 붙여넣으시면 PC·모바일 전체에 즉시 등록됩니다.
                    </p>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          OAuth 클라이언트 ID (Client ID)
                        </label>
                        <input
                          type="text"
                          value={manualClientId}
                          onChange={(e) => setManualClientId(e.target.value)}
                          placeholder="예: 1234567890-xxx.apps.googleusercontent.com"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          클라이언트 보안 비밀번호 (Client Secret)
                        </label>
                        <input
                          type="password"
                          value={manualClientSecret}
                          onChange={(e) => setManualClientSecret(e.target.value)}
                          placeholder="예: GOCSPX-..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          또는 이미 발급된 GCP 핸들 (선택)
                        </label>
                        <input
                          type="text"
                          value={manualHandleInput}
                          onChange={(e) => setManualHandleInput(e.target.value)}
                          placeholder="예: gcp_..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleMobileManualRegister}
                      disabled={isUploading}
                      className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isUploading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>모바일 BYO 클라이언트 즉시 등록</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 📖 3분 완성 GCP 세팅 가이드 아코디언 */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => setIsGuideOpen(!isGuideOpen)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-100/60 transition-colors cursor-pointer"
                >
                  <span className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-indigo-600" />
                    <span>초보자도 3분 만에 끝내는 GCP 세팅 완벽 가이드</span>
                  </span>
                  {isGuideOpen ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  )}
                </button>

                {isGuideOpen && (
                  <div className="p-4 pt-0 text-xs text-slate-600 space-y-3.5 border-t border-slate-200/60 bg-white">
                    <ol className="list-decimal list-inside space-y-2.5 font-medium leading-relaxed">
                      <li>
                        <strong>Google Cloud Console 접속:</strong>{" "}
                        <a
                          href="https://console.cloud.google.com"
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline font-bold inline-flex items-center gap-0.5"
                        >
                          console.cloud.google.com <ExternalLink className="w-3 h-3" />
                        </a>
                        으로 이동하여 <strong>[새 프로젝트 만들기]</strong>를 클릭합니다.
                      </li>
                      <li>
                        <strong>필수 API 3종 활성화:</strong>
                        <br />
                        좌측 메뉴 <strong>[API 및 서비스] ➡️ [라이브러리]</strong>에서 아래 3개를 검색하여 각각 <strong>[사용]</strong> 버튼을 누릅니다:
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono text-slate-700">
                            Google Drive API
                          </span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono text-slate-700">
                            Google Sheets API
                          </span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono text-slate-700">
                            Google Apps Script API
                          </span>
                        </div>
                      </li>
                      <li>
                        <strong>OAuth 동의 화면 설정:</strong>
                        <br />
                        <strong>[API 및 서비스] ➡️ [OAuth 동의 화면]</strong>에서 사용자 유형을 <strong>[외부]</strong>로 선택하고, 앱 이름(예: <code>SheetBot</code>)과 이메일만 입력 후 저장합니다.
                      </li>
                      <li>
                        <strong>OAuth 클라이언트 ID 만들기:</strong>
                        <br />
                        <strong>[사용자 인증 정보] ➡️ [사용자 인증 정보 만들기] ➡️ [OAuth 클라이언트 ID]</strong> 클릭:
                        <ul className="list-disc list-inside pl-2 mt-1.5 space-y-2 text-slate-700">
                          <li>
                            애플리케이션 유형: <strong className="text-emerald-700">웹 애플리케이션 (Web application)</strong> 선택
                          </li>
                          <li className="list-none pt-1">
                            <span className="font-semibold text-slate-800 text-[11px] block mb-1">
                              1) 승인된 자바스크립트 원본 (Authorized JavaScript origins):
                            </span>
                            <div className="flex items-center gap-1.5">
                              <code className="flex-1 bg-slate-100 px-2 py-1.5 rounded text-[11px] font-mono text-slate-800 truncate select-all">
                                {jsOrigin}
                              </code>
                              <button
                                type="button"
                                onClick={() => handleCopyText(jsOrigin, "js_origin")}
                                className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-bold shrink-0 cursor-pointer flex items-center gap-1 transition-colors"
                              >
                                {copiedKey === "js_origin" ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                <span>복사</span>
                              </button>
                            </div>
                          </li>
                          <li className="list-none pt-1">
                            <span className="font-semibold text-slate-800 text-[11px] block mb-1">
                              2) 승인된 리디렉션 URI (Authorized redirect URIs):
                            </span>
                            <div className="flex items-center gap-1.5">
                              <code className="flex-1 bg-slate-100 px-2 py-1.5 rounded text-[11px] font-mono text-slate-800 truncate select-all">
                                {redirectUri}
                              </code>
                              <button
                                type="button"
                                onClick={() => handleCopyText(redirectUri, "redirect_uri")}
                                className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-bold shrink-0 cursor-pointer flex items-center gap-1 transition-colors"
                              >
                                {copiedKey === "redirect_uri" ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                <span>복사</span>
                              </button>
                            </div>
                          </li>
                        </ul>
                      </li>
                      <li>
                        <strong>JSON 파일 다운로드 또는 Client ID 복사:</strong>
                        <br />
                        생성된 클라이언트의 <strong>[JSON 다운로드]</strong> 아이콘을 눌러 파일을 업로드하거나, 모바일에서는 <strong>Client ID / Secret</strong>을 위 입력칸에 붙여넣으세요.
                      </li>
                    </ol>
                  </div>
                )}
              </div>

              {/* 📥 드래그 앤 드롭 JSON 파일 업로더 */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void processGcpJsonFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`p-5 sm:p-6 rounded-2xl border-2 border-dashed transition-all text-center space-y-2.5 cursor-pointer select-none ${
                  isDragging
                    ? "border-emerald-500 bg-emerald-50/70 scale-[1.01]"
                    : "border-slate-300 hover:border-emerald-400 bg-slate-50/60 hover:bg-emerald-50/30"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void processGcpJsonFile(file);
                  }}
                />

                <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mx-auto text-emerald-600">
                  {isUploading ? (
                    <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                  ) : (
                    <UploadCloud className="w-5 h-5" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-xs sm:text-sm font-extrabold text-slate-800">
                    {isUploading
                      ? "GCP 클라이언트 검증 및 등록 중..."
                      : "client_secret_xxx.json 파일 업로드 (PC/모바일)"}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    한 번 등록하면 PC와 모바일 스마트폰에서 자동으로 함께 사용됩니다
                  </p>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/60 text-slate-600 text-[10px] font-bold">
                  <FileCode className="w-3.5 h-3.5 text-slate-500" />
                  <span>애플리케이션 유형: 웹 애플리케이션 (.json)</span>
                </div>
              </div>

              {/* 에러 메시지 표출 */}
              {uploadError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 text-left">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{uploadError}</span>
                </div>
              )}

              {showGcpReset && (
                <button
                  type="button"
                  onClick={handleForgetGcp}
                  disabled={isForgettingGcp || isUploading}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50/50 text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isForgettingGcp ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Settings className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {storedGcpHandleHint || gcpHandle
                      ? "저장된 GCP 연결 지우고 새로 시작"
                      : "GCP 등록 초기화"}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* 하단 보안 보증 안내 */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            <span>Client Secret과 토큰은 로컬 게이트웨이에 안전하게 보관되며 외부에 유출되지 않습니다.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
