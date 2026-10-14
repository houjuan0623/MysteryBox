"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  analyticsPath,
  analyticsVisitor,
  subscribeAnalytics,
} from "@/lib/analytics";
export function ActivityTracker() {
  const pathname = usePathname();
  const lastEvent = useRef<string | null>(null);
  useEffect(() => {
    const track = () => {
      const path = analyticsPath(pathname);
      const visitorId = analyticsVisitor();
      if (!path || !visitorId) {
        lastEvent.current = null;
        return;
      }
      const key = `${visitorId}:${pathname}`;
      if (lastEvent.current === key) return;
      lastEvent.current = key;
      // 分析请求失败不影响产品，不重试、不记录请求正文。会话标识仅在当前 tab 存活。
      void fetch("/api/activity", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "x-analytics-visitor": visitorId,
        },
        body: JSON.stringify({ eventId: crypto.randomUUID(), visitorId, path }),
      }).catch(() => {});
    };
    track();
    return subscribeAnalytics(track);
  }, [pathname]);
  return null;
}
