"use client";

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface CarouselSlide {
  slide: number;
  title: string;
  text: string;
}

interface ImageItem {
  name: string;
  url: string;
  base64?: string;
}

interface InstagramPostData {
  id: string;
  topic: string;
  keywords: string;
  tone: string;
  caption: string;
  hashtags: string;
  carouselSlides: CarouselSlide[];
  summary: string;
  imageList: ImageItem[];
  driveFolderUrl: string;
  refUrls: string[];
  imageCount: number;
  reportUrl: string;
  sheetUrl: string;
  instagramPostUrl: string;
  status: string;
  createdAt: string;
}

function InstagramPostContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [post, setPost] = useState<InstagramPostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedTags, setCopiedTags] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("인스타그램 포스팅 ID가 지정되지 않았습니다.");
      setLoading(false);
      return;
    }

    apiFetch(`/api/user/instagram/post?id=${encodeURIComponent(id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.post) {
          setPost(data.post);
        } else {
          setError(data.error || "포스팅 정보를 불러오지 못했습니다.");
        }
      })
      .catch((err) => {
        setError(err.message || "네트워크 오류가 발생했습니다.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  const copyToClipboard = async (text: string, type: "caption" | "tags") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "caption") {
        setCopiedCaption(true);
        setTimeout(() => setCopiedCaption(false), 2000);
      } else {
        setCopiedTags(true);
        setTimeout(() => setCopiedTags(false), 2000);
      }
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400">인스타그램 피드 원고를 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#1E293B] border border-red-500/30 rounded-2xl p-6 text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <h2 className="text-lg font-bold text-red-400 mb-2">원고 조회 실패</h2>
          <p className="text-xs text-slate-300 mb-4">{error || "포스팅 정보가 없습니다."}</p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-semibold"
          >
            홈으로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  const fullContentForCopy = `${post.caption}\n\n.\n.\n.\n${post.hashtags}`;

  return (
    <div className="min-h-screen bg-[#0A0E17] text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto space-y-5">
        {/* 상단 액션 바 */}
        <div className="flex items-center justify-between bg-[#131D2E] p-4 rounded-2xl border border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">📸</span>
              <span className="text-sm font-bold bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 bg-clip-text text-transparent">
                SheetBot AI 인스타그램 코파일럿
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              작성: {post.createdAt} • 사진 {post.imageCount}장
            </p>
          </div>
          <div className="flex items-center gap-2">
            {post.sheetUrl && (
              <a
                href={post.sheetUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition"
              >
                📊 대장 시트
              </a>
            )}
            <a
              href="https://www.instagram.com/"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg text-xs font-semibold shadow-sm transition"
            >
              🚀 인스타 열기
            </a>
          </div>
        </div>

        {/* 3줄 요약 카드 */}
        <div className="bg-gradient-to-br from-pink-950/20 to-slate-900 border border-pink-500/20 rounded-2xl p-4">
          <div className="text-xs font-bold text-pink-400 mb-2 flex items-center gap-1.5">
            <span>✨</span> 3줄 핵심 요약 &amp; 타깃팅
          </div>
          <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
            {post.summary}
          </div>
        </div>

        {/* 인스타그램 피드 목업 카드 */}
        <div className="bg-black border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          {/* 프로필 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-900">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full p-[2px] bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-600">
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-xs font-bold text-white">
                  SB
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-white leading-tight">sheetbot_official</div>
                <div className="text-[10px] text-slate-400">SheetBot Creator Studio</div>
              </div>
            </div>
            <span className="text-slate-500 text-sm">•••</span>
          </div>

          {/* 피드 사진 영역 (첨부 사진이 있는 경우 렌더링) */}
          {post.imageList && post.imageList.length > 0 ? (
            <div className="relative bg-slate-950 flex flex-col items-center">
              <div className="w-full aspect-square overflow-hidden flex items-center justify-center bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.imageList[0].url}
                  alt={post.imageList[0].name}
                  className="w-full h-full object-cover"
                />
              </div>
              {post.imageList.length > 1 && (
                <div className="w-full px-3 py-2 bg-slate-900/80 flex gap-2 overflow-x-auto">
                  {post.imageList.map((img, i) => (
                    <a
                      key={i}
                      href={img.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] px-2 py-1 bg-slate-800 rounded-md text-slate-300 flex-shrink-0 hover:bg-slate-700"
                    >
                      슬라이드 {i + 1} 열기
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-square bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
              <span className="text-4xl mb-2">📸</span>
              <p className="text-xs font-medium text-slate-300">첨부된 사진 미리보기 영역</p>
              <p className="text-[11px] text-slate-400 mt-1">인스타그램 업로드 시 사용할 대표 사진</p>
            </div>
          )}

          {/* 소셜 인터랙션 아이콘 바 */}
          <div className="px-4 pt-3 pb-2 flex items-center justify-between text-lg text-slate-200">
            <div className="flex items-center gap-4">
              <span>❤️</span>
              <span>💬</span>
              <span>✈️</span>
            </div>
            <span>📌</span>
          </div>

          {/* 피드 캡션 본문 영역 */}
          <div className="px-4 pb-4 space-y-2">
            <div className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
              <span className="font-bold text-white mr-1.5">sheetbot_official</span>
              {post.caption}
            </div>

            {/* 해시태그 */}
            <div className="text-xs text-pink-400 font-medium leading-relaxed break-words pt-1">
              {post.hashtags}
            </div>
          </div>
        </div>

        {/* 캐러셀 슬라이드 가이드 (있는 경우) */}
        {post.carouselSlides && post.carouselSlides.length > 0 && (
          <div className="bg-[#131D2E] border border-slate-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-amber-400 mb-3 flex items-center gap-1.5">
              <span>📑</span> 카드뉴스 캐러셀 슬라이드 텍스트 가이드
            </div>
            <div className="space-y-2">
              {post.carouselSlides.map((slide, idx) => (
                <div key={idx} className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                  <div className="text-[11px] font-bold text-slate-300">
                    슬라이드 {slide.slide || idx + 1}: {slide.title}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{slide.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 하단 원클릭 복사 & 실행 액션 바 */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => copyToClipboard(fullContentForCopy, "caption")}
            className="w-full py-3 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center justify-center gap-1.5"
          >
            <span>📋</span>
            <span>{copiedCaption ? "전체 캡션 복사 완료!" : "전체 캡션 + 해시태그 복사"}</span>
          </button>

          <button
            onClick={() => copyToClipboard(post.hashtags, "tags")}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition flex items-center justify-center gap-1.5"
          >
            <span>🏷️</span>
            <span>{copiedTags ? "해시태그 복사 완료!" : "해시태그만 복사"}</span>
          </button>
        </div>

        {/* 사진 보관함 링크 안내 */}
        {post.driveFolderUrl && (
          <div className="text-center pt-1">
            <a
              href={post.driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-slate-400 hover:text-slate-200 underline"
            >
              📁 구글 드라이브 인스타그램 사진 보관함 열기
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InstagramPostPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0F172A] text-slate-100 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      }
    >
      <InstagramPostContent />
    </Suspense>
  );
}
