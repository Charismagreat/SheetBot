"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { exchangeVisitorAuthCode } from "@/egdesk-visitor-google";

// 모듈 레벨 1회 실행 가드: React StrictMode 또는 모바일 브라우저 재마운트 시 1회용 code 중복 소모 원천 차단
const processedMobileCodes = new Set<string>();

export default function MobileOAuthCallbackPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("Google 드라이브 및 시트 권한을 연동하는 중입니다…");
  const [email, setEmail] = useState<string>("");
  const [deepLinkUri, setDeepLinkUri] = useState<string>("");
  const [nextUrl, setNextUrl] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = (params.get("code") || "").trim();
    const ref = (params.get("ref") || "").trim();
    const emailParam = (params.get("email") || "").trim();
    const nextParam = (params.get("next") || "").trim();
    if (nextParam) setNextUrl(nextParam);

    if (!code) {
      setStatus("error");
      setMessage("인증 코드가 누락되었습니다. 다시 Google 계정 연동을 시도해 주세요.");
      return;
    }

    if (processedMobileCodes.has(code)) {
      return;
    }
    processedMobileCodes.add(code);

    (async () => {
      try {
        // 1) 브라우저 컨텍스트(/__visitor_auth_proxy)에서 1회용 code 선교환 시도 (클라이언트 IP/Origin 100% 일치 보장)
        let browserSessionId = "";
        try {
          const exRes = await exchangeVisitorAuthCode(code);
          if (exRes?.sessionId) {
            browserSessionId = String(exRes.sessionId).trim();
          }
        } catch (exErr) {
          console.warn("[MobileCallback] Browser exchange fallback to server complete:", exErr);
        }

        // 2) 서버 DB 동기화 및 앱 복귀 딥링크(sheetbot://pair) + 웹 세션 쿠키 발급
        const res = await apiFetch("/api/user/agent2/google-oauth/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            visitorSessionId: browserSessionId || undefined,
            ref,
            email: emailParam,
          }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.success || !data?.deepLinkUri) {
          processedMobileCodes.delete(code);
          setStatus("error");
          setMessage(data?.error || "Google 권한 연동에 실패했습니다. 다시 시도해 주세요.");
          return;
        }

        const finalSid = data.visitorSessionId || browserSessionId;
        if (finalSid) {
          try {
            localStorage.setItem("egdesk_visitor_session", finalSid);
            localStorage.setItem("sheetbot_synced_visitor_sid", finalSid);
            sessionStorage.setItem("sheetbot_session_synced", finalSid);
            const isSecure = window.location.protocol === "https:";
            document.cookie = `egdesk_visitor_session=${encodeURIComponent(finalSid)}; path=/; max-age=2592000; SameSite=Lax${isSecure ? "; Secure" : ""}`;
          } catch {}
        }

        setEmail(data.email || emailParam || "");
        setDeepLinkUri(data.deepLinkUri);
        setStatus("success");
        setMessage("본인 Google 드라이브 및 스프레드시트 연동이 완료되었습니다!");

        // 웹 로그인(/login)에서 진입한 경우 next 경로로 이동, 앱에서 진입한 경우 딥링크 복귀
        if (nextParam && nextParam.startsWith("/")) {
          setTimeout(() => {
            window.location.replace(nextParam);
          }, 300);
        } else {
          setTimeout(() => {
            window.location.href = data.deepLinkUri;
          }, 250);
        }
      } catch (err: any) {
        processedMobileCodes.delete(code);
        setStatus("error");
        setMessage(err?.message || "네트워크 오류가 발생했습니다.");
      }
    })();
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-5">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-7 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-3xl mx-auto shadow-lg shadow-emerald-600/25">
          {status === "loading" ? "⏳" : status === "success" ? "✅" : "⚠️"}
        </div>

        <h1 className="text-xl font-black text-slate-900">
          {status === "loading"
            ? "Google 권한 연동 중..."
            : status === "success"
              ? "Google 계정 연동 완료!"
              : "연동 확인 필요"}
        </h1>

        {email && (
          <div className="inline-block px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
            {email}
          </div>
        )}

        <p className="text-sm text-slate-600 leading-relaxed break-keep">{message}</p>

        {status === "success" && (
          <div className="pt-2 space-y-2.5">
            {deepLinkUri && (
              <a
                href={deepLinkUri}
                className="block w-full py-4 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base shadow-lg shadow-emerald-600/25 transition-all"
              >
                📲 시트봇 앱으로 돌아가기
              </a>
            )}
            <a
              href={nextUrl || "/dashboard"}
              className="block w-full py-3 px-5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-all"
            >
              🌐 웹 대시보드로 이동하기
            </a>
            <p className="text-xs text-slate-400">
              자동으로 이동하지 않으면 위 버튼을 눌러 주세요.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="pt-2 space-y-2">
            <a
              href="/api/user/agent2/google-oauth/start"
              className="block w-full py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md"
            >
              🔄 다시 Google 로그인 시도하기
            </a>
            <a
              href="/login"
              className="block w-full py-3 px-5 rounded-2xl border border-slate-200 text-slate-600 font-bold text-xs"
            >
              로그인 페이지로 이동
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
