import React from "react";
import { Layers, Terminal, Workflow } from "lucide-react";

export default function HowItWorksSection() {
  return (
    <div id="how-it-works" className="w-full space-y-6 pt-4">
      <div className="space-y-2 text-center">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Simple 3-Step Flywheel</span>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 break-keep">시트봇 3단계 워크플로우</h2>
        <p className="text-xs sm:text-sm text-slate-500 break-keep">인프라 구축도, API 키 설정도 필요 없는 가장 직관적인 자동화 여정</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
        {/* Step 1 */}
        <div className="relative bg-white p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg">STEP 1</span>
            <Layers className="w-5 h-5 text-emerald-600" />
          </div>
          <h3 className="font-extrabold text-lg text-slate-900 break-keep">1초 시트 래핑</h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-keep">
            내 구글 시트 주소(URL)를 시트봇에 입력하기만 하면, AI 및 외부 도구와 통신할 수 있는 안전한 보안 터널과 인프라가 단 1초 만에 래핑됩니다.
          </p>
        </div>

        {/* Step 2 */}
        <div className="relative bg-white p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black px-2.5 py-1 bg-teal-100 text-teal-800 rounded-lg">STEP 2</span>
            <Terminal className="w-5 h-5 text-teal-600" />
          </div>
          <h3 className="font-extrabold text-lg text-slate-900 break-keep">안티그라비티 &amp; MCP 바이브코딩</h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-keep">
            개발 지식 없이도 "홈택스 세금계산서 대조해줘", "나라장터 입찰공고 스크랩해줘"처럼 자연어로 대화하면, 안티그라비티와 이지데스크 MCP가 시트에 최적화된 로직을 즉시 바이브코딩합니다.
          </p>
        </div>

        {/* Step 3 */}
        <div className="relative bg-white p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg">STEP 3</span>
            <Workflow className="w-5 h-5 text-indigo-600" />
          </div>
          <h3 className="font-extrabold text-lg text-slate-900 break-keep">원클릭 코드 주입 &amp; 배포</h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-keep">
            완성된 코드가 구글 시트에 원클릭으로 직접 주입됩니다. API 키는 소스에 노출되지 않으며, 시트 상단 메뉴와 버튼으로 즉시 자동화가 가동됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
