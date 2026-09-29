export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* 상단 프로필 헤더 스켈레톤 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div className="space-y-2">
            <div className="h-7 w-64 bg-slate-200 rounded-xl animate-pulse" />
            <div className="h-4 w-40 bg-slate-100 rounded-md animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-36 bg-emerald-100/70 rounded-xl animate-pulse" />
            <div className="h-8 w-28 bg-slate-200 rounded-xl animate-pulse" />
          </div>
        </div>

        {/* 4대 주요 지표 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
              <div className="flex justify-between items-center">
                <div className="h-4 w-24 bg-slate-200 rounded-md animate-pulse" />
                <div className="w-6 h-6 rounded-lg bg-slate-100 animate-pulse" />
              </div>
              <div className="h-8 w-36 bg-slate-200 rounded-lg animate-pulse" />
              <div className="h-3 w-28 bg-slate-100 rounded-md animate-pulse" />
            </div>
          ))}
        </div>

        {/* 모바일 에이전트 배너 스켈레톤 */}
        <div className="h-24 bg-emerald-50/50 border border-emerald-100 rounded-2xl animate-pulse" />

        {/* 내 프로젝트 대장 섹션 */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <div className="flex justify-between items-center">
            <div className="h-5 w-40 bg-slate-200 rounded-md animate-pulse" />
            <div className="h-8 w-28 bg-emerald-100 rounded-xl animate-pulse" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 space-y-3">
                <div className="h-5 w-3/4 bg-slate-200 rounded-md animate-pulse" />
                <div className="h-3 w-1/3 bg-slate-100 rounded animate-pulse" />
                <div className="h-12 w-full bg-white rounded-xl border border-slate-100 mt-2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
