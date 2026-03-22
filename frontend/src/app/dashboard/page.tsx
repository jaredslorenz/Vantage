export default function DashboardPage() {
  return (
    <>
      {/* Project Header */}
      <div className="mb-6">
        <h1 className="text-[26px] font-medium text-white/95 tracking-tight mb-1.5">
          Cognify
        </h1>
        <p className="text-sm text-white/75">
          Full-stack monitoring across GitHub, Vercel, and Render
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5 mb-6">
        <div className="bg-white/95 backdrop-blur-[10px] border border-black/5 rounded-card p-4.5 shadow-card">
          <div className="text-xs text-gray-500 font-medium mb-2">
            Total Events
          </div>
          <div className="text-[30px] font-medium text-gray-900 leading-none">
            23
          </div>
          <div className="text-xs text-green-600 mt-1.5">
            ↑ 12% from last week
          </div>
        </div>
        <div className="bg-white/95 backdrop-blur-[10px] border border-black/5 rounded-card p-4.5 shadow-card">
          <div className="text-xs text-gray-500 font-medium mb-2">
            Success Rate
          </div>
          <div className="text-[30px] font-medium text-gray-900 leading-none">
            93%
          </div>
          <div className="text-xs text-green-600 mt-1.5">↑ 4% improvement</div>
        </div>
        <div className="bg-white/95 backdrop-blur-[10px] border border-black/5 rounded-card p-4.5 shadow-card">
          <div className="text-xs text-gray-500 font-medium mb-2">
            Active Services
          </div>
          <div className="text-[30px] font-medium text-gray-900 leading-none">
            3
          </div>
          <div className="text-xs text-gray-500 mt-1.5">All operational</div>
        </div>
      </div>

      {/* Section Header */}
      <div className="mb-2.5">
        <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider">
          Connected Services
        </h2>
      </div>

      {/* Service Cards Grid - Placeholder */}
      <div className="grid grid-cols-2 gap-3.5">
        <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-4.5 shadow-card">
          <p className="text-sm text-gray-500">Service cards coming next...</p>
        </div>
      </div>
    </>
  );
}
