import React from "react";

function Bone({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-[#e7eaf1] ${className}`}
      style={style}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(231,234,241,0) 0%, rgba(255,255,255,0.7) 50%, rgba(231,234,241,0) 100%)",
          animation: "skdash-sweep 1.8s ease-in-out infinite",
        }}
      />
    </div>
  );
}

export function SkeletonDashboard() {
  const barHeights = [45, 68, 52, 84, 60, 96, 72, 50];

  return (
    <div className="flex min-h-dvh w-full bg-white">
      <style>{`
        @keyframes skdash-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      <aside className="hidden w-[190px] shrink-0 flex-col gap-6 border-r border-zinc-100 p-4 lg:flex">
        <Bone className="h-8 w-28" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bone key={i} className="h-4 w-full" style={{ width: `${70 + (i % 3) * 10}%` }} />
          ))}
        </div>
        <div className="mt-auto flex items-center gap-2">
          <Bone className="h-8 w-8 rounded-full" />
          <Bone className="h-3 w-20" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div className="flex flex-col gap-2">
            <Bone className="h-3 w-24" />
            <Bone className="h-5 w-40" />
          </div>
          <div className="flex items-center gap-3">
            <Bone className="h-9 w-9 rounded-full" />
            <Bone className="h-9 w-9 rounded-full" />
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-xl border border-zinc-100 p-4">
                <Bone className="h-3 w-20" />
                <Bone className="h-7 w-28" />
                <Bone className="h-3 w-16" />
              </div>
            ))}
          </div>

          <div className="flex flex-1 flex-col gap-4 rounded-xl border border-zinc-100 p-4">
            <div className="flex items-center justify-between">
              <Bone className="h-4 w-32" />
              <Bone className="h-4 w-20" />
            </div>
            <div className="flex flex-1 items-end gap-3">
              {barHeights.map((h, i) => (
                <Bone
                  key={i}
                  className="flex-1 rounded-t-md rounded-b-none"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default SkeletonDashboard;