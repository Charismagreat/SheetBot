export default function GlobalLoading() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 🚀 상단 네비게이션 인라인 스켈레톤 */}
      <div className="w-full h-16 bg-white border-b border-slate-200/80 px-4 sm:px-8 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 animate-pulse" />
          <div className="h-5 w-24 bg-slate-200 rounded-md animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-20 bg-slate-100 rounded-xl animate-pulse hidden sm:block" />
          <div className="h-9 w-24 bg-emerald-100 rounded-xl animate-pulse" />
        </div>
      </div>

      {/* ⚡ 대시보드 및 콘텐츠 레이아웃 스켈레톤 */}
      <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* 상단 프로필 헤더 */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-4 w-32 bg-slate-100 rounded-md animate-pulse" />
          </div>
          <div className="h-8 w-28 bg-emerald-100/80 rounded-full animate-pulse hidden sm:block" />
        </div>

        {/* 4대 주요 카드 그리드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
              <div className="flex justify-between items-center">
                <div className="h-4 w-20 bg-slate-200 rounded animate-pulse" />
                <div className="w-6 h-6 rounded-lg bg-slate-100 animate-pulse" />
              </div>
              <div className="h-8 w-32 bg-slate-200 rounded-lg animate-pulse" />
              <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* 하단 프로젝트 대장 스켈레톤 */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <div className="h-5 w-36 bg-slate-200 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div className="h-4 w-3/4 bg-slate-200 rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
