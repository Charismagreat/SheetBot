"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Bot,
  ArrowLeft,
  Shield,
  CheckCircle2,
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
  Info
} from "lucide-react";
import {
  startVisitorGoogleLogin,
  getVisitorGoogleStatus,
  signOutVisitorGoogle,
  registerVisitorGcp,
  getVisitorGcpStatus,
  forgetVisitorGcp,
  getStoredVisitorGcpHandle,
  setStoredVisitorGcpHandle,
  resolveEgdeskPublicUrl,
  VISITOR_WORKSPACE_SCOPES,
} from "@/egdesk-visitor-google";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setRedirectUri(isCustomDomain ? "https://sheetbot.cloud/visitor-auth/callback" : `${origin}/visitor-auth/callback`);

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
        } catch (e) {}
      }

      // 저장된 GCP 핸들 확인
      const storedHandle = getStoredVisitorGcpHandle();
      if (storedHandle) {
        setGcpHandle(storedHandle);
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

  // 2) 저장된 GCP 핸들이 있는 경우 서버 유효성 점검
  const refreshGcpStatus = useCallback(async (targetHandle?: string) => {
    const handleToQuery = targetHandle || gcpHandle || getStoredVisitorGcpHandle();
    if (!handleToQuery) {
      setGcpStatus(null);
      setIsGcpChecking(false);
      return;
    }
    setIsGcpChecking(true);
    try {
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
      } else {
        // 유효하지 않은 핸들이면 초기화
        setGcpStatus(null);
        setGcpHandle(null);
        setStoredVisitorGcpHandle(null);
      }
    } catch (err) {
      console.warn("GCP status check error:", err);
      setGcpStatus(null);
    } finally {
      setIsGcpChecking(false);
    }
  }, [gcpHandle]);

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

  // SheetBot 자동화를 위한 확장 권한 스코프 (시트 + 드라이브 + Apps Script 프로젝트 생성)
  const SHEETBOT_WORKSPACE_SCOPES = [
    ...VISITOR_WORKSPACE_SCOPES,
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.projects",
    "https://www.googleapis.com/auth/script.external_request",
  ];

  // 🌟 [핵심] 사용자가 업로드한 GCP JSON 파싱 및 등록
  const processGcpJsonFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const text = await file.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("올바른 JSON 형식의 파일이 아닙니다. 구글 콘솔에서 다운로드한 .json 파일을 선택해 주세요.");
      }

      // JSON 포맷 검증 (Web application 여부 확인)
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

      // 이지데스크 Visitor Auth 게이트웨이에 등록
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
      setGcpHandle(nextHandle);
      setStoredVisitorGcpHandle(nextHandle);
      setGcpStatus({
        connected: true,
        registered: true,
        clientIdMasked: result.clientIdMasked,
        projectId: json.web.project_id || "내 Google Cloud 프로젝트",
        redirectUriToRegister: result.redirectUriToRegister,
      });
      setIsGuideOpen(false); // 등록 성공 시 가이드는 자동으로 접기
    } catch (err: any) {
      console.error("GCP JSON registration failed:", err);
      setUploadError(err?.message || "파일 처리 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 🌟 [핵심] BYO Client ID로 Google 로그인 실행 (gcp: 'self' 강제)
  const handleByoGoogleLogin = async () => {
    if (!gcpHandle && !getStoredVisitorGcpHandle()) {
      alert("먼저 본인의 Google Cloud(GCP) OAuth 클라이언트 JSON 파일을 업로드해 주세요.");
      return;
    }

    setIsLoading(true);
    try {
      // 기존 잔류 세션 폐기는 비동기 300ms 타임아웃 제한
      await Promise.race([
        signOutVisitorGoogle().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);

      const currentHandle = gcpHandle || getStoredVisitorGcpHandle() || undefined;

      // BYO 전용 로그인 실행: gcp: 'self'와 유저 전용 handle 주입
      await startVisitorGoogleLogin({
        next: getTargetRedirectUrl(),
        forceConsent: true,
        scopes: SHEETBOT_WORKSPACE_SCOPES,
        gcp: "self",
        handle: currentHandle,
      });
    } catch (err: any) {
      console.error("BYO Login error:", err);
      setIsLoading(false);
      alert("Google 로그인 시작 중 오류가 발생했습니다: " + (err?.message || "네트워크 오류"));
    }
  };

  // 등록된 GCP 설정 해제 (초기화)
  const handleForgetGcp = async () => {
    if (!confirm("등록된 Google Cloud 설정을 초기화하시겠습니까? 다른 GCP JSON을 다시 등록할 수 있습니다.")) {
      return;
    }
    const currentHandle = gcpHandle || getStoredVisitorGcpHandle();
    if (currentHandle) {
      try {
        await forgetVisitorGcp(currentHandle);
      } catch {}
    }
    setStoredVisitorGcpHandle(null);
    setGcpHandle(null);
    setGcpStatus(null);
    setUploadError(null);
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
                완전한 쿼터 독립과 강력한 데이터 보안을 위해<br />
                <strong className="text-slate-800 font-extrabold">나만의 Google Cloud(BYO Client ID)</strong>로 연결하여 로그인합니다.
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
          {(gcpStatus?.connected || gcpStatus?.registered) ? (
            <div className="space-y-4 pt-1">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/90 via-teal-50/50 to-white border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                      내 Google Cloud 프로젝트 연결됨
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
                    <span className="text-emerald-700 font-bold">{gcpStatus.clientIdMasked || "등록 완료"}</span>
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
                    <span>내 Google 계정으로 시트봇 로그인</span>
                  </>
                )}
              </button>

              <div className="flex justify-between items-center text-xs text-slate-500 pt-1">
                <button
                  type="button"
                  onClick={handleForgetGcp}
                  className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>다른 GCP 클라이언트 JSON으로 변경</span>
                </button>

                <span className="text-[11px] text-slate-400">
                  Client ID 바인딩 완료
                </span>
              </div>
            </div>
          ) : (
            /* ------------------------------------------------------------- */
            /* 상태 B: 최초 방문 또는 GCP 미등록 상태 (세팅 및 업로드 필수) */
            /* ------------------------------------------------------------- */
            <div className="space-y-4 pt-1">
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-left space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900">
                  <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>사내/개인 Google Cloud(GCP) OAuth 클라이언트 등록 필요</span>
                </div>
                <p className="text-[11px] text-amber-900/80 leading-relaxed break-keep">
                  SheetBot은 <strong>사용자 전용 독립 쿼터 및 완전한 보안 격리</strong>를 위해, 모든 회원이 직접 생성한 GCP의 웹 클라이언트 ID(BYO Client ID)로만 로그인하도록 운영됩니다.
                </p>
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
                        <strong>필수 API 3종 활성화:</strong><br />
                        좌측 메뉴 <strong>[API 및 서비스] ➡️ [라이브러리]</strong>에서 아래 3개를 검색하여 각각 <strong>[사용]</strong> 버튼을 누릅니다:
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono text-slate-700">Google Drive API</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono text-slate-700">Google Sheets API</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono text-slate-700">Google Apps Script API</span>
                        </div>
                      </li>
                      <li>
                        <strong>OAuth 동의 화면 설정:</strong><br />
                        <strong>[API 및 서비스] ➡️ [OAuth 동의 화면]</strong>에서 사용자 유형을 <strong>[외부]</strong>로 선택하고, 앱 이름(예: <code>SheetBot</code>)과 이메일만 입력 후 저장합니다.
                      </li>
                      <li>
                        <strong>OAuth 클라이언트 ID 만들기:</strong><br />
                        <strong>[사용자 인증 정보] ➡️ [사용자 인증 정보 만들기] ➡️ [OAuth 클라이언트 ID]</strong> 클릭:
                        <ul className="list-disc list-inside pl-2 mt-1.5 space-y-2 text-slate-700">
                          <li>애플리케이션 유형: <strong className="text-emerald-700">웹 애플리케이션 (Web application)</strong> 선택</li>
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
                                {copiedKey === "js_origin" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
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
                                {copiedKey === "redirect_uri" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                <span>복사</span>
                              </button>
                            </div>
                          </li>
                        </ul>
                      </li>
                      <li>
                        <strong>JSON 파일 다운로드:</strong><br />
                        생성된 클라이언트의 우측 <strong>[JSON 다운로드]</strong> 아이콘을 눌러 <code>client_secret_xxx.json</code> 파일을 받습니다.
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
                className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed transition-all text-center space-y-3 cursor-pointer select-none ${
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

                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mx-auto text-emerald-600">
                  {isUploading ? (
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                  ) : (
                    <UploadCloud className="w-6 h-6" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-extrabold text-slate-800">
                    {isUploading ? "GCP 클라이언트 검증 및 등록 중..." : "client_secret_xxx.json 파일을 여기에 끌어다 놓으세요"}
                  </div>
                  <p className="text-xs text-slate-500">
                    또는 클릭하여 내 PC의 Google Cloud JSON 파일 선택
                  </p>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/60 text-slate-600 text-[11px] font-bold">
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
