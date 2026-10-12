/** 背景：深夜蓝底 + 浅蓝→紫光晕 + 星点 + 网格 */
const STARS = Array.from({ length: 46 }, (_, i) => {
  // 确定性伪随机：服务端/客户端一致，避免水合差异
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1
  return { x: r(1) * 100, y: r(2) * 100, s: 1 + r(3) * 1.6, d: r(4) * 6, t: 3 + r(5) * 5 }
})

export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,#141a44_0%,#0a0d26_45%,#060818_100%)]" />
      <div
        className="aurora-a absolute -top-[28%] -left-[12%] h-[78vmax] w-[78vmax] rounded-full opacity-[0.55] blur-[110px]"
        style={{ background: 'radial-gradient(circle, rgba(125,211,252,0.34) 0%, rgba(96,165,250,0.08) 42%, transparent 68%)' }}
      />
      <div
        className="aurora-b absolute -right-[18%] top-[6%] h-[68vmax] w-[68vmax] rounded-full opacity-[0.55] blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgba(192,132,252,0.32) 0%, rgba(167,139,250,0.09) 45%, transparent 70%)' }}
      />
      <div
        className="aurora-a absolute bottom-[-28%] left-[22%] h-[62vmax] w-[62vmax] rounded-full opacity-[0.4] blur-[130px]"
        style={{ background: 'radial-gradient(circle, rgba(129,140,248,0.34) 0%, transparent 65%)' }}
      />
      {STARS.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-indigo-100"
          style={{
            left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s,
            animation: `twinkle ${s.t}s ease-in-out ${s.d}s infinite`,
            boxShadow: '0 0 6px rgba(199,210,254,0.8)',
          }}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[#060818] via-[#060818]/60 to-transparent" />
      <div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(165,180,252,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(165,180,252,0.035) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, #000 15%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, #000 15%, transparent 75%)',
        }}
      />
    </div>
  )
}
