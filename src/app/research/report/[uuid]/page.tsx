"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Building2,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Printer,
} from "lucide-react";

interface SharedResearchReport {
  uuid: string;
  companyName: string;
  domain: string;
  businessNumber: string;
  driveHtmlUrl: string;
  shareUrl: string;
  createdAt: string;
  reportHtml: string;
}

export default function SharedCompanyResearchReportPage() {
  const params = useParams();
  const uuid = String(params?.uuid || "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SharedResearchReport | null>(null);
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!uuid) {
      setError("보고서 식별자(UUID)가 없습니다.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/user/company-research/report/${encodeURIComponent(uuid)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.success || !data.report) {
          throw new Error(data.error || "보고서를 불러올 수 없습니다.");
        }
        setReport(data.report);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "보고서 로드 중 오류가 발생했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uuid]);

  const handleCopyLink = async () => {
    const url = typeof window !== "undefined" ? window.location.href : report?.shareUrl || "";
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 미지원 폴백
    }
  };

  const handlePrint = () => {
    try {
      iframeRef.current?.contentWindow?.print();
    } catch {
      window.print();
    }
  };

  const handleDownloadHtml = () => {
    if (!report) return;
    const blob = new Blob([report.reportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(report.companyName || "기업리서치").replace(/[/\\?%*:|"<>]/g, "_")}_기업리서치보고서.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-sky-400 animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-300">AI 기업 심층 리서치 HTML 보고서를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl">
          <FileText className="w-11 h-11 text-rose-400 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-white mb-2">보고서를 찾을 수 없습니다</h1>
          <p className="text-sm text-slate-400 mb-5">{error || "링크가 만료되었거나 존재하지 않습니다."}</p>
          <a
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition"
          >
            SheetBot 홈으로 이동
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* 상단 고정 공유·다운로드 툴바 */}
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-3 sm:px-6 py-2.5">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">{report.companyName}</div>
              <div className="text-[11px] text-slate-400 truncate">
                SheetBot AI · MCP 기업 심층 리서치 · {report.createdAt}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-slate-700 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "링크 복사됨" : "공유 링크 복사"}
            </button>

            <button
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              HTML 저장
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-slate-700 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              인쇄/PDF
            </button>

            {report.driveHtmlUrl ? (
              <a
                href={report.driveHtmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-semibold transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                드라이브 파일
              </a>
            ) : null}
          </div>
        </div>
      </header>

      {/* AI 자유 생성 HTML 본문 격리 렌더링 */}
      <main className="flex-1 w-full bg-white">
        <iframe
          ref={iframeRef}
          title={`${report.companyName} 기업 심층 리서치 보고서`}
          srcDoc={report.reportHtml}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals"
          className="w-full min-h-[calc(100vh-56px)] border-0 block"
        />
      </main>
    </div>
  );
}
