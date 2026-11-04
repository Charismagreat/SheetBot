"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function MobileOAuthCallbackPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("Google 드라이브 및 시트 권한을 연동하는 중입니다…");
  const [email, setEmail] = useState<string>("");
  const [deepLinkUri, setDeepLinkUri] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") || "";
    const ref = params.get("ref") || "";

    if (!code) {
      setStatus("error");
      setMessage("인증 코드가 누락되었습니다. 앱으로 돌아가 다시 Google 계정 연동을 시도해 주세요.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/user/agent2/google-oauth/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, ref }),
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (!res.ok || !data?.success || !data?.deepLinkUri) {
          setStatus("error");
          setMessage(data?.error || "Google 권한 연동에 실패했습니다. 다시 시도해 주세요.");
          return;
        }

        if (data.visitorSessionId) {
          try {
            localStorage.setItem("egdesk_visitor_session", data.visitorSessionId);
            localStorage.setItem("sheetbot_synced_visitor_sid", data.visitorSessionId);
            sessionStorage.setItem("sheetbot_session_synced", data.visitorSessionId);
          } catch {}
        }

        setEmail(data.email || "");
        setDeepLinkUri(data.deepLinkUri);
        setStatus("success");
        setMessage("본인 Google 드라이브 및 스프레드시트 연동이 완료되었습니다!");

        // 자동으로 SheetBot Agent 앱(sheetbot://pair)으로 복귀
        setTimeout(() => {
          window.location.href = data.deepLinkUri;
        }, 250);
      } catch (err: any) {
        if (cancelled) return;
        setStatus("error");
        setMessage(err?.message || "네트워크 오류가 발생했습니다.");
      }
    })();

    return () => {
      cancelled = true;
    };
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

        {status === "success" && deepLinkUri && (
          <div className="pt-2 space-y-3">
            <a
              href={deepLinkUri}
              className="block w-full py-4 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base shadow-lg shadow-emerald-600/25 transition-all"
            >
              📲 시트봇 앱으로 돌아가기
            </a>
            <p className="text-xs text-slate-400">
              자동으로 앱이 열리지 않으면 위 버튼을 눌러 주세요.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="pt-2">
            <a
              href="/api/user/agent2/google-oauth/start"
              className="block w-full py-3.5 px-5 rounded-2xl bg-slate-900 text-white font-bold text-sm"
            >
              🔄 다시 Google 로그인 시도하기
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
