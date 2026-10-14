"use client";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";

// 重建后的新增体验：路由提交时仅让新页面做短暂淡入，不阻塞导航、不人为延迟请求。
// 动效全部由 CSS 的 transform / opacity 完成；系统减少动态效果偏好会关闭动画。
export function MotionFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="motion-frame">
      {children}
    </div>
  );
}

// 这是请求进行中的装饰反馈，真实状态仍由按钮里的可读 loading 文本播报。
export function OpeningAnimation() {
  return (
    <div className="opening-scene" aria-hidden="true">
      <span className="opening-ring" />
      <span className="opening-star star-a">✦</span>
      <span className="opening-star star-b">✧</span>
      <span className="opening-mini-box">
        <Icon name="box" size={32} />
      </span>
      <span className="opening-dots">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
