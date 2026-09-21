"use client";

import React from "react";
import { 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  XCircle,
} from "lucide-react";
import { KILLER_WEBAPPS } from "@/constants/landing";

interface KillerWebappsSectionProps {
  onSelectKillerWebApp: (app: typeof KILLER_WEBAPPS[0]) => void;
}

export function KillerWebappsSection({ onSelectKillerWebApp }: KillerWebappsSectionProps) {
  return (
    <div id="killer-webapps" className="w-full space-y-8 pt-6">
      <div className="space-y-3 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-rose-50 via-amber-50 to-emerald-50 border border-amber-200 text-amber-900 text-xs font-black shadow-xs mx-auto">
          <Sparkles className="w-4 h-4 text-amber-600 animate-bounce" />
          <span>화제의 킬러 기능 • 구글 시트가 1초 만에 웹앱이 되는 마법</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight break-keep">
          "구글 시트 링크 하나로 1초 만에 열리는 킬러 웹앱 6선"
        </h2>
        <p className="text-xs sm:text-base text-slate-500 max-w-2xl mx-auto break-keep leading-relaxed">
          비싼 외주 개발비나 월 구독료 없이, 구글 시트에 데이터만 적어두면<br className="hidden sm:inline" />
          스마트폰으로 누구나 접속할 수 있는 모바일 웹앱 링크(URL)를 1초 만에 배포해 드립니다.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left max-w-6xl mx-auto items-stretch">
        {KILLER_WEBAPPS.map((app, idx) => {
          const IconComp = app.icon;
          return (
            <div
              key={idx}
              className="bg-white rounded-3xl border-2 border-slate-200/90 hover:border-emerald-500 hover:shadow-xl transition-all duration-300 p-6 flex flex-col justify-between space-y-5 group relative overflow-hidden h-full"
            >
              {/* 상단 액센트 그라디언트 바 */}
              <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${app.color}`} />

              <div className="space-y-4 flex-1 flex flex-col">
                {/* 순위 & 뱃지 */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black px-3 py-1 bg-slate-900 text-white rounded-xl shadow-xs">
                    {app.rank}
                  </span>
                  <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border ${app.lightColor}`}>
                    {app.badge}
                  </span>
                </div>

                {/* 아이콘 & 타이틀 */}
                <div className="flex items-start gap-3 pt-1">
                  <div className={`p-3 rounded-2xl bg-gradient-to-br ${app.color} text-white shadow-md group-hover:scale-110 transition-transform shrink-0`}>
                    <IconComp className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wide truncate">
                      타깃: {app.target}
                    </div>
                    <div className="min-h-[3.25rem] flex items-center mt-0.5">
                      <h3 className="font-black text-base sm:text-[17px] text-slate-900 leading-snug break-keep">
                        {app.title}
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Pain vs SheetBot Solution 대비 */}
                <div className="space-y-2 text-xs min-h-[7rem] flex flex-col justify-between">
                  <div className="p-2.5 bg-rose-50/70 border border-rose-100 rounded-xl text-rose-700 flex items-start gap-2 flex-1">
                    <XCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                    <span className="leading-relaxed break-keep line-clamp-2">{app.pain}</span>
                  </div>
                  <div className="p-2.5 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-emerald-900 flex items-start gap-2 font-medium flex-1">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                    <span className="leading-relaxed break-keep"><strong>{app.solution}</strong></span>
                  </div>
                </div>

                {/* 시트 컬럼 태그 목록 */}
                <div className="space-y-1.5 pt-1 min-h-[3.25rem]">
                  <div className="text-[10px] font-bold text-slate-400">필요한 구글 시트 컬럼:</div>
                  <div className="flex flex-wrap gap-1">
                    {app.columns.map((col, cIdx) => (
                      <span
                        key={cIdx}
                        className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-semibold rounded-md border border-slate-200 whitespace-nowrap"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 하단 생성 버튼 (칼각 정렬) */}
              <button
                type="button"
                onClick={() => onSelectKillerWebApp(app)}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-2xl shadow-xs transition-all flex items-center justify-center gap-2 group-hover:shadow-md cursor-pointer active:scale-95 mt-auto"
              >
                <span>🚀 1초 만에 이 웹앱 래핑하기</span>
                <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
