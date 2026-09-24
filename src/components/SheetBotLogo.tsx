"use client";

import React from "react";

interface SheetBotLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  showText?: boolean;
  textClassName?: string;
  subText?: string;
  badgeText?: string;
}

const SIZE_MAP = {
  xs: { box: "w-6 h-6", px: 24 },
  sm: { box: "w-8 h-8", px: 32 },
  md: { box: "w-10 h-10", px: 40 },
  lg: { box: "w-12 h-12", px: 48 },
  xl: { box: "w-16 h-16", px: 64 },
  "2xl": { box: "w-20 h-20", px: 80 },
};

/**
 * 🌟 SheetBot 전용 독창적 브랜드 심볼 SVG
 * 스프레드시트 2x2 셀 격자(Grid) + 우상단에서 발광하는 AI 다이아몬드 스파크(Sparkle)의 융합
 */
export function SheetBotIcon({
  size = "md",
  className = "",
}: {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}) {
  const { box } = SIZE_MAP[size];

  return (
    <div
      className={`relative ${box} rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 shrink-0 overflow-hidden select-none ${className}`}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full p-1.5"
      >
        <defs>
          {/* 부드러운 내부 입체 섀도우 */}
          <linearGradient id="sbCellGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.12" />
          </linearGradient>

          <linearGradient id="sbActiveCellGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.25" />
          </linearGradient>

          {/* AI 스파크 빛 그라데이션 */}
          <linearGradient id="sbSparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="60%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#a7f3d0" />
          </linearGradient>

          {/* 은은한 백라이트 글로우 */}
          <filter id="sbGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. 좌상단 시트 데이터 셀 (행/열 데이터 바 포함) */}
        <rect
          x="20"
          y="20"
          width="26"
          height="26"
          rx="6"
          fill="url(#sbCellGrad)"
          stroke="#ffffff"
          strokeOpacity="0.4"
          strokeWidth="1.5"
        />
        <line x1="25" y1="29" x2="41" y2="29" stroke="#ffffff" strokeOpacity="0.65" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="25" y1="36" x2="35" y2="36" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />

        {/* 2. 좌하단 시트 데이터 셀 */}
        <rect
          x="20"
          y="54"
          width="26"
          height="26"
          rx="6"
          fill="url(#sbCellGrad)"
          stroke="#ffffff"
          strokeOpacity="0.4"
          strokeWidth="1.5"
        />
        <line x1="25" y1="63" x2="39" y2="63" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="25" y1="70" x2="33" y2="70" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />

        {/* 3. 우하단 시트 데이터 셀 */}
        <rect
          x="54"
          y="54"
          width="26"
          height="26"
          rx="6"
          fill="url(#sbCellGrad)"
          stroke="#ffffff"
          strokeOpacity="0.4"
          strokeWidth="1.5"
        />
        <line x1="59" y1="63" x2="73" y2="63" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="59" y1="70" x2="68" y2="70" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />

        {/* 4. 우상단 셀: AI 활성 셀 (글로우 & 스파크 중심) */}
        <rect
          x="54"
          y="20"
          width="26"
          height="26"
          rx="6"
          fill="url(#sbActiveCellGrad)"
          stroke="#a7f3d0"
          strokeOpacity="0.8"
          strokeWidth="2"
        />

        {/* 4포인트 다이아몬드 AI 스파크 (Sparkle) */}
        <g filter="url(#sbGlow)">
          {/* 수직/수평 빛 줄기 */}
          <path
            d="M67 25 C67 30 63 33 58 33 C63 33 67 36 67 41 C67 36 71 33 76 33 C71 33 67 30 67 25 Z"
            fill="url(#sbSparkGrad)"
          />
          {/* 중심 발광 코어 */}
          <circle cx="67" cy="33" r="2" fill="#ffffff" />
        </g>

        {/* 미니 보조 스파크 (좌측 상단에서 살짝 반짝이는 지능 파동) */}
        <path
          d="M48 48 C48 50 46 51 44 51 C46 51 48 52 48 54 C48 52 50 51 52 51 C50 51 48 50 48 48 Z"
          fill="#fef08a"
          opacity="0.9"
        />
      </svg>
    </div>
  );
}

/**
 * 🌟 통합 로고 (심볼 + 타이포그래피 워드마크)
 */
export default function SheetBotLogo({
  size = "md",
  className = "",
  showText = true,
  textClassName = "",
  subText = "구글 시트 AI 자동화",
  badgeText = "SaaS",
}: SheetBotLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <SheetBotIcon size={size} />

      {showText && (
        <div className="whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black tracking-tight text-slate-900 ${
                size === "xs"
                  ? "text-sm"
                  : size === "sm"
                  ? "text-base"
                  : size === "lg"
                  ? "text-xl"
                  : size === "xl"
                  ? "text-2xl"
                  : size === "2xl"
                  ? "text-3xl"
                  : "text-lg"
              } ${textClassName}`}
            >
              <span className="text-emerald-700">Sheet</span>
              <span>Bot</span>
            </span>

            {badgeText && (
              <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md">
                {badgeText}
              </span>
            )}
          </div>

          {subText && (
            <span className="text-[10px] text-slate-400 font-medium block -mt-0.5 whitespace-nowrap">
              {subText}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
