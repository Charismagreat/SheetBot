"use client";

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Scale,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Printer,
  ShieldAlert,
  HelpCircle,
  FileCheck,
  ChevronRight,
  Loader2,
  Sparkles,
  BookOpen
} from "lucide-react";

interface ClauseAnalysisItem {
  clause: string;
  legality: string;
  riskLevel: string;
  reason: string;
}

interface LawReportData {
  advisoryId: string;
  queryDatetime: string;
  queryText: string;
  fileName?: string;
  fileDriveUrl?: string;
  documentSummary?: string;
  documentFullOcr?: string;
  lawTitle: string;
  lawLink?: string;
  caseNumber: string;
  caseName?: string;
  precLink?: string;
  rulingSummary: string;
  precedentDetailText?: string;
  executiveSummary: string;
  clauseAnalysis?: ClauseAnalysisItem[];
  actionItems?: string[];
  recommendedClause?: string;
}

function LawReportViewerContent() {
  const searchParams = useSearchParams();
  const advisoryId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<LawReportData | null>(null);

  useEffect(() => {
    if (!advisoryId) {
      setError("자문 식별자(id)가 누락되었습니다.");
      setLoading(false);
      return;
    }

    const fetchReport = async () => {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/user/law-advisory?id=${encodeURIComponent(advisoryId)}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "법률 자문 보고서를 불러올 수 없습니다.");
        }
        setReport(data.report);
      } catch (err: any) {
        setError(err.message || "보고서 로드 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [advisoryId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
        <p className="text-slate-600 font-medium">SheetBot 심층 법률 검토 보고서를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-50 text-red-700 p-6 rounded-2xl max-w-md border border-red-200 shadow-sm">
          <Scale className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold mb-2">보고서 조회 실패</h2>
          <p className="text-sm text-red-600 mb-4">{error || "보고서 정보를 찾을 수 없습니다."}</p>
          <a
            href="/"
            className="inline-flex items-center px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-100"
          >
            홈으로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 상단 헤더 카드 */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center shadow-md">
                <Scale className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    AI 법률·계약 심층 검토 보고서
                  </span>
                  <span className="text-xs text-slate-400">
                    작성일시: {report.queryDatetime}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                  법률 쟁점 및 계약 리스크 진단
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition"
              >
                <Printer className="w-3.5 h-3.5" />
                인쇄 / PDF 저장
              </button>
            </div>
          </div>

          {/* 질의 사실관계 요약 */}
          <div className="pt-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              의뢰인 질의 사실관계 및 쟁점
            </h3>
            <p className="text-base font-semibold text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-100">
              "{report.queryText}"
            </p>

            {report.fileName && (
              <div className="mt-3 flex items-center justify-between text-xs text-slate-600 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                  <span className="font-medium text-slate-700">첨부 증빙 서류:</span>
                  <span className="font-semibold text-slate-900 truncate">{report.fileName}</span>
                </div>
                {report.fileDriveUrl && (
                  <a
                    href={report.fileDriveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 font-semibold hover:underline flex-shrink-0 ml-2"
                  >
                    구글 드라이브 원본 보기
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 1. AI 종합 리스크 진단 (Executive Summary) */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-md">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-indigo-800">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold">1. AI 종합 리스크 진단 (3줄 Executive Summary)</h2>
          </div>
          <div className="space-y-3 text-slate-200 leading-relaxed whitespace-pre-line text-sm sm:text-base font-medium">
            {report.executiveSummary}
          </div>
        </div>

        {/* 2. 조항별 독소 조항 및 법적 효력 정밀 진단표 */}
        {report.clauseAnalysis && report.clauseAnalysis.length > 0 && (
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-6 pb-3 border-b border-slate-100">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <h2 className="text-lg font-bold text-slate-800">2. 계약 조항별 위법성 및 독소 조항 진단</h2>
            </div>

            <div className="space-y-4">
              {report.clauseAnalysis.map((item, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-bold text-slate-900 text-sm">{item.clause}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        item.legality.includes("무효") ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {item.legality}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        item.riskLevel.includes("위험") ? "bg-red-500 text-white" : "bg-amber-100 text-amber-800"
                      }`}>
                        {item.riskLevel}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {item.reason}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. 관련 법령 조항 및 대법원 리딩 판례 법리 */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-6 pb-3 border-b border-slate-100">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">3. 대한민국 법제처 법령 및 대법원 리딩 판례</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 법령 카드 */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-indigo-600 uppercase">근거 법령</span>
                  {report.lawLink && (
                    <a
                      href={report.lawLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-indigo-600 font-semibold hover:underline inline-flex items-center gap-0.5"
                    >
                      법제처 조문
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{report.lawTitle}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  국가법령정보센터 최신 현행 법률 규정 및 시행령 기준 적용.
                </p>
              </div>
            </div>

            {/* 판례 카드 */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-600 uppercase">대법원 리딩 판례</span>
                  {report.precLink && (
                    <a
                      href={report.precLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-amber-600 font-semibold hover:underline inline-flex items-center gap-0.5"
                    >
                      판례 전문
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{report.caseNumber}</h3>
                <p className="text-xs text-slate-700 leading-relaxed italic bg-white p-3 rounded-lg border border-slate-100">
                  "{report.rulingSummary}"
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 4. 실무 대응 전략 및 추천 수정 조항 */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-6 pb-3 border-b border-slate-100">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-800">4. 실무 대응 전략 및 표준 수정 계약 조항 가이드</h2>
          </div>

          {/* Action Items */}
          {report.actionItems && report.actionItems.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                권고 실행 단계 (Action Items)
              </h3>
              <ul className="space-y-2">
                {report.actionItems.map((action, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="font-medium">{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Clause */}
          {report.recommendedClause && (
            <div className="mt-4 bg-emerald-50/50 p-4 rounded-xl border border-emerald-200">
              <h4 className="text-xs font-bold text-emerald-800 uppercase mb-1.5 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-emerald-600" />
                분쟁 방지를 위한 추천 표준 수정 계약 문구
              </h4>
              <p className="text-xs sm:text-sm text-slate-800 font-mono bg-white p-3 rounded-lg border border-emerald-100 leading-relaxed whitespace-pre-wrap">
                {report.recommendedClause}
              </p>
            </div>
          )}
        </div>

        {/* 바닥글 및 법적 면책 공지 */}
        <div className="text-center text-xs text-slate-400 py-6 border-t border-slate-200 space-y-1">
          <p className="font-semibold text-slate-500">
            ⚠️ 법적 고지: 본 검토 보고서는 대한민국 법제처 공공데이터 및 판례에 기반한 AI 법률 자문 보조 참고 자료입니다.
          </p>
          <p>
            구체적인 소송 제기, 법적 분쟁 대응 및 계약 체결 시에는 반드시 변호사 또는 노무사 등 법률 전문가의 개별 자문을 받으시기 바랍니다.
          </p>
          <p className="text-slate-300 pt-2">
            © SheetBot Legal Intelligence Engine & EGDesk Korean Law MCP. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LawReportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      }
    >
      <LawReportViewerContent />
    </Suspense>
  );
}
