/** template 在每次导航时重新挂载:给页面一个统一的入场动画(纯 CSS,不依赖水合) */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="enter-blur">{children}</div>
}
