"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Edit3,
  Copy,
  Check,
  ExternalLink,
  Printer,
  Sparkles,
  Image as ImageIcon,
  Share2,
  FileText,
  Loader2
} from "lucide-react";
import { apiFetch } from "@/lib/egdesk-helpers";

interface BlogPostData {
  id: string;
  title: string;
  topic: string;
  keywords: string;
  refUrls?: string[];
  imageDriveUrls?: Array<{ name: string; url: string }>;
  contentHtml: string;
  summary: string;
  naverPostUrl?: string;
  naverBlogId?: string;
  naverBlogUrl?: string;
  naverWriteUrl?: string;
  charCount: number;
  imageCount: number;
  status: string;
  createdAt: string;
}

function BlogPostViewerContent() {
  const searchParams = useSearchParams();
  const blogId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<BlogPostData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!blogId) {
      setError("블로그 포스팅 식별자(id)가 누락되었습니다.");
      setLoading(false);
      return;
    }

    const fetchPost = async () => {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/user/blog/post?id=${encodeURIComponent(blogId)}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "블로그 포스팅을 불러올 수 없습니다.");
        }
        setPost(data.post);
      } catch (err: any) {
        setError(err.message || "포스팅 로드 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [blogId]);

  const handleCopyContent = () => {
    if (!post) return;
    const cleanText = post.contentHtml
      .replace(/<h2>/gi, "\n\n■ ")
      .replace(/<\/h2>/gi, "\n")
      .replace(/<p>/gi, "")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "");

    const fullToCopy = `${post.title}\n\n${cleanText}\n\n${post.keywords}`;
    navigator.clipboard.writeText(fullToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
        <p className="text-slate-600 font-medium">AI 네이버 블로그 원고를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-50 text-red-700 p-6 rounded-2xl max-w-md border border-red-200 shadow-sm">
          <Edit3 className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold mb-2">원고 조회 실패</h2>
          <p className="text-sm text-red-600 mb-4">{error || "포스팅 정보를 찾을 수 없습니다."}</p>
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

  // 본문 내 [IMAGE:x] 마커를 실제 이미지 태그 또는 플레이스홀더로 교체하여 렌더링
  const renderRenderedHtml = () => {
    let html = post.contentHtml;
    const images = post.imageDriveUrls || [];

    // [IMAGE:x] 치환
    images.forEach((img, idx) => {
      const marker = `[IMAGE:${idx}]`;
      const replacement = `
        <div class="my-6 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
          <div class="flex items-center justify-center gap-2 text-emerald-700 font-semibold text-sm mb-2">
            <span class="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs">📷</span>
            첨부 사진 #${idx + 1} (${img.name})
          </div>
          <a href="${img.url}" target="_blank" rel="noreferrer" class="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
            구글 드라이브 원본 보기
          </a>
        </div>
      `;
      html = html.replace(marker, replacement);
    });

    return { __html: html };
  };

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 상단 컨트롤 헤더 */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                <Edit3 className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    네이버 블로그 완성형 원고
                  </span>
                  <span className="text-xs text-slate-400">
                    생성일시: {post.createdAt}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                  {post.title}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCopyContent}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-sm transition"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "클립보드 복사 완료!" : "전체 원고 복사"}
              </button>
              <a
                href={post.naverWriteUrl || "https://blog.naver.com/GoBlogWrite.naver"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-white bg-[#03C75A] rounded-xl hover:bg-[#02b350] shadow-sm transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                ✍️ 네이버 글쓰기 열기
              </a>
              {post.naverBlogUrl && (
                <a
                  href={post.naverBlogUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition"
                >
                  내 블로그 홈 ↗
                </a>
              )}
            </div>
          </div>

          {/* 발행 안내 가이드 배너 */}
          <div className="mt-4 p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900 leading-relaxed">
            <span className="text-base flex-shrink-0">💡</span>
            <div>
              <span className="font-bold">발행 방법:</span> 위 <span className="font-bold underline text-emerald-800">[전체 원고 복사]</span> 버튼을 누른 뒤, 바로 옆 <span className="font-bold underline text-[#028a3d]">[✍️ 네이버 글쓰기 열기]</span>를 클릭하세요. 열리는 사장님의 네이버 스마트에디터 화면에서 마우스 우클릭 후 <b>'붙여넣기'</b>를 하시고 <b>'발행'</b>만 누르시면 1분 만에 블로그 포스팅이 완성됩니다.
              {post.naverBlogId && (
                <span className="block mt-1 font-semibold text-emerald-800">
                  📍 대상 블로그: <span className="underline">{post.naverBlogUrl}</span>
                </span>
              )}
            </div>
          </div>

          {/* 메타 지표 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="text-xs font-medium text-slate-500 block">메인 주제</span>
              <span className="text-sm font-bold text-slate-800 mt-0.5 block truncate">
                {post.topic}
              </span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="text-xs font-medium text-slate-500 block">첨부 사진</span>
              <span className="text-sm font-bold text-emerald-600 mt-0.5 block">
                {post.imageCount}장 자동 배치
              </span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="text-xs font-medium text-slate-500 block">원고 글자 수</span>
              <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                공백 포함 {post.charCount.toLocaleString()}자
              </span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="text-xs font-medium text-slate-500 block">타깃 키워드</span>
              <span className="text-xs font-semibold text-indigo-600 mt-1 block truncate">
                {post.keywords || "-"}
              </span>
            </div>
          </div>
        </div>

        {/* 3줄 요약 카드 */}
        <div className="bg-gradient-to-br from-emerald-900 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-md">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-emerald-800">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">포스팅 핵심 요약 (3줄 Executive Summary)</h2>
          </div>
          <div className="space-y-2 text-slate-200 leading-relaxed whitespace-pre-line text-sm sm:text-base font-medium">
            {post.summary}
          </div>
        </div>

        {/* 네이버 스마트에디터 스타일 원고 본문 */}
        <div className="bg-white rounded-2xl p-6 sm:p-10 shadow-sm border border-slate-200">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                {post.title}
              </h2>
              <div className="flex items-center gap-2 mt-3 text-xs text-slate-400">
                <span>네이버 스마트에디터 ONE 서식</span>
                <span>•</span>
                <span>DIA+ 알고리즘 최적화</span>
              </div>
            </div>

            <div
              className="prose max-w-none text-slate-800 leading-relaxed text-base space-y-4"
              dangerouslySetInnerHTML={renderRenderedHtml()}
            />

            {/* 해시태그 영역 */}
            {post.keywords && (
              <div className="pt-6 border-t border-slate-100 flex flex-wrap gap-2">
                {post.keywords.split(/\s+/).map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-full"
                  >
                    {tag.startsWith("#") ? tag : `#${tag}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 바닥글 */}
        <div className="text-center text-xs text-slate-400 py-4">
          <p>© SheetBot AI Blog Engine & EGDesk Blog MCP. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

export default function BlogPostPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        </div>
      }
    >
      <BlogPostViewerContent />
    </Suspense>
  );
}
