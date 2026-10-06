"use client";

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Building2, 
  FileText, 
  ExternalLink, 
  Calendar, 
  ShieldCheck, 
  Users, 
  Briefcase, 
  Award, 
  Sparkles,
  Loader2,
  Printer
} from "lucide-react";

interface ResearchDoc {
  id: string;
  businessNumber: string;
  companyName: string;
  domain?: string | null;
  title: string;
  content?: {
    type: string;
    content?: any[];
  };
  slides?: any[];
  blockCount?: number;
  createdAt: string;
  updatedAt: string;
}

function ResearchViewerContent() {
  const searchParams = useSearchParams();
  const docId = searchParams.get("id");
  const bNo = searchParams.get("bNo");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<ResearchDoc | null>(null);

  useEffect(() => {
    if (!docId && !bNo) {
      setError("문서 식별자(id 또는 bNo)가 전달되지 않았습니다.");
      setLoading(false);
      return;
    }

    const fetchDoc = async () => {
      try {
        setLoading(true);
        const q = docId ? `id=${encodeURIComponent(docId)}` : `bNo=${encodeURIComponent(bNo!)}`;
        const res = await apiFetch(`/api/user/company-research/doc?${q}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "리서치 문서를 불러올 수 없습니다.");
        }
        setDoc(data.doc);
      } catch (err: any) {
        setError(err.message || "문서 로드 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchDoc();
  }, [docId, bNo]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
        <p className="text-slate-600 font-medium">이지데스크 기업 리서치 문서를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-50 text-red-700 p-6 rounded-2xl max-w-md border border-red-200 shadow-sm">
          <FileText className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold mb-2">리서치 문서 조회 실패</h2>
          <p className="text-sm text-red-600 mb-4">{error || "문서 정보를 찾을 수 없습니다."}</p>
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

  // TipTap 내용 텍스트 추출 헬퍼
  const renderContentNodes = (nodes?: any[]) => {
    if (!nodes || nodes.length === 0) {
      return (
        <div className="text-slate-400 italic py-6 text-center">
          수집된 세부 리서치 블록이 없습니다.
        </div>
      );
    }

    return nodes.map((node, idx) => {
      if (node.type === "paragraph") {
        const text = node.content?.map((c: any) => c.text).join("") || "";
        return (
          <p key={idx} className="text-slate-700 leading-relaxed my-2 whitespace-pre-wrap">
            {text}
          </p>
        );
      }
      if (node.type === "heading") {
        const level = node.attrs?.level || 2;
        const text = node.content?.map((c: any) => c.text).join("") || "";
        if (level === 1) {
          return <h1 key={idx} className="text-2xl font-bold text-slate-900 mt-6 mb-3">{text}</h1>;
        }
        if (level === 2) {
          return <h2 key={idx} className="text-xl font-bold text-slate-800 mt-5 mb-2 border-b pb-1">{text}</h2>;
        }
        return <h3 key={idx} className="text-lg font-semibold text-slate-800 mt-4 mb-2">{text}</h3>;
      }
      return null;
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 상단 헤더 카드 */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                <Building2 className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    기업 리서치 보고서
                  </span>
                  <span className="text-xs text-slate-400">
                    생성일: {new Date(doc.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                  {doc.companyName}
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

          {/* 메타 그리드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="text-xs font-medium text-slate-500 block">사업자등록번호</span>
              <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                {doc.businessNumber}
              </span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="text-xs font-medium text-slate-500 block">홈페이지 / 도메인</span>
              <span className="text-sm font-bold text-slate-800 mt-0.5 block truncate">
                {doc.domain || "-"}
              </span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="text-xs font-medium text-slate-500 block">수집 데이터 블록</span>
              <span className="text-sm font-bold text-indigo-600 mt-0.5 block">
                {doc.blockCount || 0}개 블록 통합
              </span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="text-xs font-medium text-slate-500 block">문서 식별자 (UUID)</span>
              <span className="text-xs font-mono text-slate-600 mt-1 block truncate">
                {doc.id}
              </span>
            </div>
          </div>
        </div>

        {/* 본문 리서치 캔버스 영역 */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">심층 리서치 캔버스 본문</h2>
          </div>

          <div className="prose max-w-none text-slate-800">
            {renderContentNodes(doc.content?.content)}
          </div>
        </div>

        {/* 바닥글 안내 */}
        <div className="text-center text-xs text-slate-400 py-4">
          <p>© SheetBot & EGDesk Company Research AI Engine. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

export default function ResearchViewerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      }
    >
      <ResearchViewerContent />
    </Suspense>
  );
}
