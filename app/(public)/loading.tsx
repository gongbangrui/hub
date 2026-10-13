/** 路由切换时的骨架屏:服务端取数期间立即显示,避免白屏等待 */
export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="skeleton shimmer h-11 w-11 rounded-2xl" />
        <div className="skeleton shimmer h-9 w-40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[160, 200, 140, 180, 150, 190].map((h, i) => (
          <div key={i} className="liquid shimmer rounded-3xl p-5" style={{ height: h }}>
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton mt-3 h-3 w-1/3" />
            <div className="skeleton mt-6 h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
