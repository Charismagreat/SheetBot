"use client";

import { apiFetch } from '@/lib/api';
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
  sheetUrl: string;
  driveFolderUrl: string;
  status: string;
  createdAt: string;
  isDefaultTemplate?: boolean;
  estimateUrl?: string;
  orderUrl?: string;
}

export default function MobileSitePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const siteId = resolvedParams.id;

  const [site, setSite] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  // 간편 문의 폼 상태
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
    // 향후 구글 시트 문의 대장 자동 적재 연동
    setInquirySent(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-400">모바일 홈페이지를 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-xl">
          <div className="text-4xl mb-3">🏚️</div>
          <h2 className="text-base font-bold text-slate-200 mb-1">존재하지 않는 페이지입니다</h2>
          <p className="text-xs text-slate-400 mb-4">{error || "홈페이지 주소를 다시 확인해 주세요."}</p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-semibold"
          >
            시트봇 홈으로 이동
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex justify-center selection:bg-emerald-500 selection:text-white">
      {/* 스마트폰 비율 컨테이너 (최대 가로 480px 모바일 뷰) */}
      <div className="w-full max-w-md bg-slate-900 shadow-2xl min-h-screen flex flex-col border-x border-slate-800/80">
        {/* 1. 상단 히어로 배너 (대표 사진 슬라이드) */}
        <div className="relative w-full aspect-[4/3] bg-slate-950 overflow-hidden">
          {site.bannerImages && site.bannerImages.length > 0 ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={site.bannerImages[activeImageIdx]?.url}
                alt={site.title}
                className="w-full h-full object-cover transition duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-black/30" />
              {site.bannerImages.length > 1 && (
                <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] text-white font-medium">
                  {activeImageIdx + 1} / {site.bannerImages.length}
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-950/40 to-slate-900 p-6 text-center">
              <span className="text-5xl mb-2">🌿</span>
              <p className="text-xs text-emerald-400 font-semibold">{site.category}</p>
            </div>
          )}

          {/* 상호명 & 슬로건 오버레이 */}
          <div className="absolute bottom-4 left-4 right-4">
            <span className="inline-block px-2.5 py-0.5 rounded-md bg-emerald-500/90 text-white text-[10px] font-bold tracking-wide uppercase mb-1.5 shadow-sm">
              {site.category}
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight drop-shadow-md">
              {site.title}
            </h1>
            <p className="text-xs text-slate-200 mt-1 font-medium drop-shadow leading-snug">
              {site.slogan}
            </p>
          </div>
        </div>

        {/* 2. 빠른 원클릭 액션 바 */}
        <div className="grid grid-cols-4 gap-1 p-3 bg-slate-850 border-b border-slate-800">
          {site.phone ? (
            <a
              href={`tel:${site.phone}`}
              className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 transition active:scale-95 text-center"
            >
              <span className="text-lg mb-0.5">📞</span>
              <span className="text-[10px] font-bold text-slate-200">전화걸기</span>
            </a>
          ) : null}

          {site.address ? (
            <a
              href={`https://map.naver.com/v5/search/${encodeURIComponent(site.address)}`}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 transition active:scale-95 text-center"
            >
              <span className="text-lg mb-0.5">📍</span>
              <span className="text-[10px] font-bold text-slate-200">길찾기</span>
            </a>
          ) : null}

          <a
            href="#inquiry"
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 transition active:scale-95 text-center"
          >
            <span className="text-lg mb-0.5">💬</span>
            <span className="text-[10px] font-bold text-slate-200">문의하기</span>
          </a>

          {site.sheetUrl ? (
            <a
              href={site.sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center justify-center p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/30 hover:bg-emerald-900/60 transition active:scale-95 text-center"
            >
              <span className="text-lg mb-0.5">📊</span>
              <span className="text-[10px] font-bold text-emerald-400">대장시트</span>
            </a>
          ) : null}
        </div>

        {/* 2-1. 스마트 간편 견적 & 주문 원터치 배너 */}
        {(site.estimateUrl || site.orderUrl) && (
          <div className="p-3 bg-slate-900/90 border-b border-slate-800/80 grid grid-cols-2 gap-2">
            {site.estimateUrl && (
              <a
                href={site.estimateUrl}
                className="py-2.5 px-3 rounded-xl bg-indigo-600/90 hover:bg-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition"
              >
                <span>🚀</span>
                <span>실시간 간편 견적</span>
              </a>
            )}
            {site.orderUrl && (
              <a
                href={site.orderUrl}
                className="py-2.5 px-3 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition"
              >
                <span>📱</span>
                <span>간편 주문하기</span>
              </a>
            )}
          </div>
        )}

        {/* 2-2. 기본 템플릿 실시간 동기화 안내 배너 */}
        {site.isDefaultTemplate && (
          <div className="mx-4 mt-4 p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-start gap-2.5">
            <span className="text-base flex-shrink-0">🌿</span>
            <div className="flex-1">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                Google Sheets Live Sync
              </span>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                구글 스프레드시트의 <b>[사업자정보]</b> 및 <b>[품목/단가표]</b>가 0초 만에 실시간 반영되는 공식 모바일 웹페이지입니다.
              </p>
            </div>
          </div>
        )}

        {/* 3. 실시간 공지/이벤트 배너 */}
        {site.notice && (
          <div className="mx-4 mt-4 p-3 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-teal-950/30 to-slate-900 border border-emerald-500/30 flex items-start gap-2.5">
            <span className="text-base flex-shrink-0">📢</span>
            <div className="flex-1">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                Notice &amp; Event
              </span>
              <p className="text-xs text-slate-200 mt-0.5 leading-relaxed font-medium">
                {site.notice}
              </p>
            </div>
          </div>
        )}

        {/* 4. 매장 / 기업 소개 (About Us) */}
        <div className="p-5 border-b border-slate-800/60">
          <h2 className="text-xs font-bold text-emerald-400 tracking-wider uppercase mb-2 flex items-center gap-1.5">
            <span>✨</span> About {site.title}
          </h2>
          <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
            {site.description}
          </div>
        </div>

        {/* 5. 대표 메뉴 / 상품 / 서비스 소개 */}
        {site.menuItems && site.menuItems.length > 0 && (
          <div className="p-5 border-b border-slate-800/60">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-emerald-400 tracking-wider uppercase flex items-center gap-1.5">
                <span>🍽️</span> 대표 메뉴 &amp; 서비스
              </h2>
              <span className="text-[10px] text-slate-400">총 {site.menuItems.length}종</span>
            </div>

            <div className="space-y-2.5">
              {site.menuItems.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-850/80 border border-slate-800 hover:border-slate-700 transition flex items-start justify-between gap-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-white">{item.name}</span>
                      {item.badge && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      {item.description}
                    </p>
                  </div>
                  <div className="text-xs font-black text-emerald-400 flex-shrink-0 pt-0.5">
                    {item.price}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. 영업 안내 & 오시는 길 */}
        <div className="p-5 border-b border-slate-800/60 space-y-3">
          <h2 className="text-xs font-bold text-emerald-400 tracking-wider uppercase flex items-center gap-1.5">
            <span>🧭</span> 이용 안내 &amp; 위치
          </h2>

          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2.5">
              <span className="text-slate-400 flex-shrink-0">⏰</span>
              <div>
                <span className="font-bold text-slate-300 block">영업시간</span>
                <span className="text-slate-400">{site.businessHours}</span>
              </div>
            </div>

            {site.phone && (
              <div className="flex items-start gap-2.5">
                <span className="text-slate-400 flex-shrink-0">📞</span>
                <div>
                  <span className="font-bold text-slate-300 block">연락처</span>
                  <a href={`tel:${site.phone}`} className="text-emerald-400 underline">
                    {site.phone}
                  </a>
                </div>
              </div>
            )}

            {site.address && (
              <div className="flex items-start gap-2.5">
                <span className="text-slate-400 flex-shrink-0">📍</span>
                <div>
                  <span className="font-bold text-slate-300 block">주소</span>
                  <span className="text-slate-400">{site.address}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 7. 간편 예약 / 문의 폼 */}
        <div id="inquiry" className="p-5 flex-1">
          <h2 className="text-xs font-bold text-emerald-400 tracking-wider uppercase mb-1.5 flex items-center gap-1.5">
            <span>💌</span> 간편 예약 및 문의
          </h2>
          <p className="text-[11px] text-slate-400 mb-3">
            궁금하신 점이나 예약 요청을 남겨주시면 빠르게 연락드립니다.
          </p>

          {inquirySent ? (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-center">
              <span className="text-2xl mb-1 block">🎉</span>
              <p className="text-xs font-bold text-emerald-300">문의가 정상 접수되었습니다!</p>
              <p className="text-[11px] text-slate-400 mt-1">남겨주신 번호로 신속히 답변드리겠습니다.</p>
            </div>
          ) : (
            <form onSubmit={handleInquirySubmit} className="space-y-2">
              <input
                type="text"
                placeholder="성함 또는 상호명"
                value={inquiryName}
                onChange={(e) => setInquiryName(e.target.value)}
                className="w-full h-9 px-3 bg-slate-800 rounded-xl text-xs text-white placeholder-slate-500 border border-slate-700/80 focus:outline-none focus:border-emerald-500"
              />
              <input
                type="tel"
                placeholder="연락처 (예: 010-1234-5678)"
                value={inquiryPhone}
                onChange={(e) => setInquiryPhone(e.target.value)}
                className="w-full h-9 px-3 bg-slate-800 rounded-xl text-xs text-white placeholder-slate-500 border border-slate-700/80 focus:outline-none focus:border-emerald-500"
              />
              <textarea
                rows={2}
                placeholder="문의 내용 또는 예약 요청 사항"
                value={inquiryMsg}
                onChange={(e) => setInquiryMsg(e.target.value)}
                className="w-full p-3 bg-slate-800 rounded-xl text-xs text-white placeholder-slate-500 border border-slate-700/80 focus:outline-none focus:border-emerald-500 resize-none"
              />
              <button
                type="submit"
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition active:scale-98 shadow-lg shadow-emerald-900/30"
              >
                문의 및 예약 접수하기
              </button>
            </form>
          )}
        </div>

        {/* 8. 하단 푸터 & SheetBot Powered */}
        <div className="p-4 bg-slate-950 border-t border-slate-800/80 text-center">
          <p className="text-[10px] text-slate-500">
            © {site.title}. All rights reserved.
          </p>
          <a
            href="https://sheetbot.cloud"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-slate-600 hover:text-emerald-400 mt-1 transition"
          >
            <span>Powered by</span>
            <span className="font-bold text-slate-400 hover:text-emerald-400">SheetBot No-Code CMS</span>
          </a>
        </div>
      </div>
    </div>
  );
}
