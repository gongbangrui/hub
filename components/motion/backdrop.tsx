import { ParticlesLazy } from './particles-lazy'

/**
 * 全站背景：冰蓝渐变 + 三团柔光（只做 transform 动画，合成层处理，不用 filter: blur）
 * + 点阵 + 一块 canvas 漂浮光球。服务端渲染，首屏零 JS 也有完整背景。
 */
export function Backdrop() {
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[linear-gradient(180deg,#e9f3ff_0%,#f4f8ff_46%,#f3f7ff_100%)]">
        <div
          className="blob-a absolute -left-[14%] -top-[26%] h-[70vmax] w-[70vmax] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.30) 0%, rgba(56,189,248,0.10) 38%, transparent 66%)' }}
        />
        <div
          className="blob-b absolute -right-[18%] top-[2%] h-[62vmax] w-[62vmax] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.26) 0%, rgba(167,139,250,0.08) 40%, transparent 68%)' }}
        />
        <div
          className="blob-a absolute -bottom-[30%] left-[18%] h-[58vmax] w-[58vmax] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.20) 0%, rgba(99,102,241,0.08) 42%, transparent 66%)' }}
        />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: 'radial-gradient(rgba(79,70,229,0.14) 1px, transparent 1.2px)',
            backgroundSize: '26px 26px',
            maskImage: 'radial-gradient(ellipse 85% 65% at 50% 25%, #000 10%, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(ellipse 85% 65% at 50% 25%, #000 10%, transparent 72%)',
          }}
        />
      </div>
      <ParticlesLazy />
    </>
  )
}
