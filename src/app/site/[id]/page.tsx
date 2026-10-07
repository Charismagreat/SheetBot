"use client";

import { apiFetch } from "@/lib/api";
import React, { useEffect, useState, use } from "react";

interface MenuItem {
  name: string;
  price: string;
  description: string;
  badge?: string;
}

interface BannerImage {
  name: string;
  url: string;
}

interface SiteData {
  id: string;
  title: string;
  category: string;
  slogan: string;
  description: string;
  phone: string;
  address: string;
  businessHours: string;
  bannerImages: BannerImage[];
  menuItems: MenuItem[];
  notice: string;
  socialLinks: Record<string, string>;
  themeColor: string;
  siteUrl: string;
  status: string;
  createdAt: string;
  isDefaultTemplate?: boolean;
}

export default function ModernBusinessSitePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const siteId = resolvedParams.id;

  const [site, setSite] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  // 1:1 상담 및 예약 문의 폼 상태
  const [inquiryName, setInquiryName] = useState("");
  const [inquiryPhone, setInquiryPhone] = useState("");
  const [inquiryMsg, setInquiryMsg] = useState("");
  const [inquirySent, setInquirySent] = useState(false);

  useEffect(() => {
    if (!siteId) return;

    apiFetch(`/api/user/site?id=${encodeURIComponent(siteId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.site) {
          setSite(data.site);
        } else {
          setError(data.error || "홈페이지 정보를 불러올 수 없습니다.");
        }
      })
      .catch((err) => {
        setError(err.message || "네트워크 연결 중 오류가 발생했습니다.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [siteId]);

  const handleInquirySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryName.trim() || !inquiryPhone.trim()) {
      alert("성함과 연락처를 입력해 주세요.");
      return;
    }
    setInquirySent(true);
  };

  const handleSelectService = (serviceName: string) => {
    setInquiryMsg(`[${serviceName}] 관련 상담 및 예약 문의드립니다.`);
    const formElem = document.getElementById("inquiry-form");
    if (formElem) {
      formElem.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-400 font-medium tracking-wide">공식 모바일 웹페이지를 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
          <div className="text-5xl mb-4">🏛️</div>
          <h2 className="text-lg font-bold text-slate-100 mb-1.5">페이지를 찾을 수 없습니다</h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            {error || "홈페이지 주소를 다시 한번 확인해 주세요."}
          </p>
          <button
            onClick={() => window.history.back()}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-900/30"
          >
            이전 화면으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const hasMultipleImages = site.bannerImages && site.bannerImages.length > 1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex justify-center selection:bg-indigo-500 selection:text-white font-sans">
      {/* 스마트폰 최적화 컨테이너 (최대 가로 480px) */}
      <div className="w-full max-w-md bg-slate-900 min-h-screen flex flex-col border-x border-slate-800/80 shadow-2xl">
        
        {/* [1] 상단 Sticky 헤더 */}
        <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-extrabold text-sm text-white truncate tracking-tight">
              {site.title}
            </span>
          </div>
          {site.phone ? (
            <a
              href={`tel:${site.phone}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition active:scale-95 shadow-md shadow-indigo-950"
            >
              <span>📞</span>
              <span>전화 상담</span>
            </a>
          ) : null}
        </header>

        {/* [2] 프리미엄 비주얼 히어로 섹션 */}
        <section className="relative w-full aspect-[4/3] bg-slate-950 overflow-hidden">
          {site.bannerImages && site.bannerImages.length > 0 ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={site.bannerImages[activeImageIdx]?.url}
                alt={site.title}
                className="w-full h-full object-cover transition-all duration-700 scale-100"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/50 to-black/20" />
              {hasMultipleImages && (
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] text-white font-medium">
                  {activeImageIdx + 1} / {site.bannerImages.length}
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 p-6 text-center">
              <span className="text-5xl mb-2">✨</span>
              <p className="text-xs text-indigo-400 font-semibold">{site.category}</p>
            </div>
          )}

          {/* 히어로 텍스트 오버레이 */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/90 text-white text-[10px] font-bold tracking-wide uppercase mb-2 shadow-sm">
              <span>★</span>
              <span>{site.category || "맞춤 전문 서비스"}</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight drop-shadow-md leading-tight">
              {site.title}
            </h1>
            <p className="text-xs text-slate-200 mt-1.5 font-medium drop-shadow leading-snug">
              {site.slogan}
            </p>
          </div>
        </section>

        {/* [3] 빠른 직통 퀵 액션 바 (전화 / 문자 / 길찾기 / 상담예약) */}
        <section className="grid grid-cols-4 gap-1.5 p-3 bg-slate-900 border-b border-slate-800">
          {site.phone ? (
            <a
              href={`tel:${site.phone}`}
              className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-750 transition active:scale-95 text-center group border border-slate-750"
            >
              <span className="text-xl mb-1 group-hover:scale-110 transition">📞</span>
              <span className="text-[11px] font-bold text-slate-200">전화 상담</span>
            </a>
          ) : null}

          {site.phone ? (
            <a
              href={`sms:${site.phone}`}
              className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-750 transition active:scale-95 text-center group border border-slate-750"
            >
              <span className="text-xl mb-1 group-hover:scale-110 transition">💬</span>
              <span className="text-[11px] font-bold text-slate-200">문자 문의</span>
            </a>
          ) : null}

          {site.address ? (
            <a
              href={`https://map.naver.com/v5/search/${encodeURIComponent(site.address)}`}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-750 transition active:scale-95 text-center group border border-slate-750"
            >
              <span className="text-xl mb-1 group-hover:scale-110 transition">📍</span>
              <span className="text-[11px] font-bold text-slate-200">오시는 길</span>
            </a>
          ) : null}

          <a
            href="#inquiry-form"
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/40 transition active:scale-95 text-center group"
          >
            <span className="text-xl mb-1 group-hover:scale-110 transition">✍️</span>
            <span className="text-[11px] font-bold text-indigo-300">상담 예약</span>
          </a>
        </section>

        {/* [4] 핵심 가치 및 3대 약속 (Why Choose Us) */}
        <section className="p-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-750 text-center">
              <span className="text-2xl mb-1 block">💎</span>
              <h3 className="text-xs font-bold text-white mb-0.5">정직과 신뢰</h3>
              <p className="text-[10px] text-slate-400">투명하고 정직한 기준</p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-750 text-center">
              <span className="text-2xl mb-1 block">⚡</span>
              <h3 className="text-xs font-bold text-white mb-0.5">신속한 응대</h3>
              <p className="text-[10px] text-slate-400">1:1 맞춤 친절 상담</p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-750 text-center">
              <span className="text-2xl mb-1 block">🛡️</span>
              <h3 className="text-xs font-bold text-white mb-0.5">철저한 사후관리</h3>
              <p className="text-[10px] text-slate-400">책임감 있는 품질 보증</p>
            </div>
          </div>
        </section>

        {/* [5] 브랜드 스토리 & 소개 (About Us) */}
        <section className="p-6 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="w-1.5 h-3.5 bg-indigo-500 rounded-full"></span>
            <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider">About Us</span>
          </div>
          <h2 className="text-base font-bold text-white mb-3">
            {site.title}을 소개합니다
          </h2>
          <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 text-xs text-slate-300 leading-relaxed whitespace-pre-line font-normal">
            {site.description}
          </div>
        </section>

        {/* [6] 주요 서비스 / 대표 상품 쇼케이스 (Our Services & Highlights) */}
        {site.menuItems && site.menuItems.length > 0 && (
          <section className="p-6 border-b border-slate-800/80">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-1.5 h-3.5 bg-indigo-500 rounded-full"></span>
                  <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider">Services</span>
                </div>
                <h2 className="text-base font-bold text-white">주요 서비스 및 안내</h2>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-medium text-slate-400 border border-slate-700">
                총 {site.menuItems.length}개
              </span>
            </div>

            <div className="space-y-3">
              {site.menuItems.map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-slate-800/70 border border-slate-750 hover:border-indigo-500/50 transition-all flex flex-col gap-2 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-white group-hover:text-indigo-300 transition">
                          {item.name}
                        </span>
                        {item.badge && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed font-normal">
                        {item.description}
                      </p>
                    </div>
                    {item.price ? (
                      <div className="text-xs font-extrabold text-indigo-400 flex-shrink-0 pt-0.5">
                        {item.price}
                      </div>
                    ) : null}
                  </div>

                  {/* 원터치 이 항목 문의하기 버튼 */}
                  <div className="pt-2 border-t border-slate-750/60 flex justify-end">
                    <button
                      onClick={() => handleSelectService(item.name)}
                      className="text-[11px] text-slate-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition"
                    >
                      <span>이 서비스 상담 문의</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* [7] 공지사항 / 안내 배너 (Notice) */}
        {site.notice && (
          <section className="p-6 border-b border-slate-800/80">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-slate-850 to-slate-900 border border-indigo-500/30 flex items-start gap-3">
              <span className="text-xl flex-shrink-0 mt-0.5">📢</span>
              <div className="flex-1">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">
                  Notice
                </span>
                <p className="text-xs text-slate-200 leading-relaxed font-normal">
                  {site.notice}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* [8] 이용 안내 및 오시는 길 (Information & Location) */}
        <section className="p-6 border-b border-slate-800/80 space-y-4">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-3.5 bg-indigo-500 rounded-full"></span>
            <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider">Information</span>
          </div>
          <h2 className="text-base font-bold text-white mb-2">이용 안내 및 위치</h2>

          <div className="space-y-3 bg-slate-800/40 border border-slate-800 p-4 rounded-2xl text-xs">
            {site.businessHours && (
              <div className="flex items-start gap-3">
                <span className="text-base text-slate-400 flex-shrink-0">⏰</span>
                <div>
                  <span className="font-bold text-slate-200 block mb-0.5">운영 시간</span>
                  <span className="text-slate-400 leading-relaxed">{site.businessHours}</span>
                </div>
              </div>
            )}

            {site.phone && (
              <div className="flex items-start gap-3 pt-2.5 border-t border-slate-800">
                <span className="text-base text-slate-400 flex-shrink-0">📞</span>
                <div>
                  <span className="font-bold text-slate-200 block mb-0.5">대표 번호</span>
                  <a href={`tel:${site.phone}`} className="text-indigo-400 font-semibold hover:underline">
                    {site.phone}
                  </a>
                </div>
              </div>
            )}

            {site.address && (
              <div className="flex items-start gap-3 pt-2.5 border-t border-slate-800">
                <span className="text-base text-slate-400 flex-shrink-0">📍</span>
                <div className="flex-1">
                  <span className="font-bold text-slate-200 block mb-0.5">찾아오시는 길</span>
                  <span className="text-slate-400 leading-relaxed block mb-2">{site.address}</span>
                  <a
                    href={`https://map.naver.com/v5/search/${encodeURIComponent(site.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold transition active:scale-95"
                  >
                    <span>네이버 지도로 보기</span>
                    <span>↗</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* [9] 1:1 상담 및 방문/예약 문의 폼 */}
        <section id="inquiry-form" className="p-6 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-3.5 bg-indigo-500 rounded-full"></span>
            <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider">Contact Us</span>
          </div>
          <h2 className="text-base font-bold text-white mb-1.5">상담 및 예약 문의</h2>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed font-normal">
            문의사항을 남겨주시면 확인 후 신속하게 연락드리겠습니다.
          </p>

          {inquirySent ? (
            <div className="p-6 rounded-2xl bg-indigo-950/40 border border-indigo-500/40 text-center animate-fade-in">
              <span className="text-4xl mb-2 block">🎉</span>
              <p className="text-sm font-bold text-indigo-300">문의가 성공적으로 접수되었습니다!</p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                남겨주신 연락처로 담당자가 신속히 안내해 드리겠습니다.
              </p>
              <button
                onClick={() => {
                  setInquirySent(false);
                  setInquiryName("");
                  setInquiryPhone("");
                  setInquiryMsg("");
                }}
                className="mt-4 px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition"
              >
                추가 문의 작성하기
              </button>
            </div>
          ) : (
            <form onSubmit={handleInquirySubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  성함 / 연락처 <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="성함 또는 상호"
                    value={inquiryName}
                    onChange={(e) => setInquiryName(e.target.value)}
                    required
                    className="w-full h-11 px-3.5 bg-slate-800 rounded-xl text-xs text-white placeholder-slate-500 border border-slate-700 focus:outline-none focus:border-indigo-500 transition"
                  />
                  <input
                    type="tel"
                    placeholder="연락처 (010-0000-0000)"
                    value={inquiryPhone}
                    onChange={(e) => setInquiryPhone(e.target.value)}
                    required
                    className="w-full h-11 px-3.5 bg-slate-800 rounded-xl text-xs text-white placeholder-slate-500 border border-slate-700 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  문의 / 요청 사항
                </label>
                <textarea
                  rows={3}
                  placeholder="궁금하신 내용이나 원하시는 서비스 일정을 남겨주세요."
                  value={inquiryMsg}
                  onChange={(e) => setInquiryMsg(e.target.value)}
                  className="w-full p-3.5 bg-slate-800 rounded-xl text-xs text-white placeholder-slate-500 border border-slate-700 focus:outline-none focus:border-indigo-500 transition resize-none leading-relaxed"
                />
              </div>

              <button
                type="submit"
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition active:scale-98 shadow-lg shadow-indigo-950 flex items-center justify-center gap-1.5"
              >
                <span>상담 및 예약 신청하기</span>
                <span>→</span>
              </button>
            </form>
          )}
        </section>

        {/* [10] 깔끔하고 정돈된 비즈니스 푸터 */}
        <footer className="p-6 bg-slate-950 border-t border-slate-800/80 text-center">
          <div className="mb-2">
            <span className="font-bold text-xs text-slate-300">{site.title}</span>
            {site.phone ? (
              <span className="text-[11px] text-slate-500 block mt-0.5">고객센터: {site.phone}</span>
            ) : null}
            {site.address ? (
              <span className="text-[10px] text-slate-600 block mt-0.5">{site.address}</span>
            ) : null}
          </div>
          <p className="text-[10px] text-slate-600 mt-3 pt-3 border-t border-slate-900">
            © {site.title}. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
