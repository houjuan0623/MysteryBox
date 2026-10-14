// 只收集四个粗粒度页面名称；不读取 query、目标输入、邮箱、支付字段或设备指纹。
export const ANALYTICS_PREFERENCE_KEY = "mysterybox:analytics";
export const ANALYTICS_VISITOR_KEY = "mysterybox:analytics-visitor";
export const ANALYTICS_CHANGE_EVENT = "mysterybox:analytics-change";
export type AnalyticsPath = "/" | "/discover" | "/box" | "/account";
export function analyticsPath(pathname: string): AnalyticsPath | null {
  if (pathname === "/") return "/";
  if (pathname === "/discover") return "/discover";
  if (pathname === "/account") return "/account";
  if (pathname.startsWith("/box/")) return "/box";
  return null;
}
export function doNotTrackEnabled(): boolean {
  return typeof window !== "undefined" && window.navigator.doNotTrack === "1";
}
export type AnalyticsPreference =
  "loading" | "enabled" | "disabled" | "do-not-track" | "unavailable";
// 保存失败时也立即停止当前 tab 的分析，不能因存储异常继续发送访问标识。
const blockedTabs = new WeakSet<object>();
export function analyticsServerSnapshot(): AnalyticsPreference {
  return "loading";
}
export function analyticsPreference(): AnalyticsPreference {
  if (typeof window === "undefined") return "loading";
  if (doNotTrackEnabled()) return "do-not-track";
  if (blockedTabs.has(window)) return "disabled";
  try {
    return window.localStorage.getItem(ANALYTICS_PREFERENCE_KEY) === "off"
      ? "disabled"
      : "enabled";
  } catch {
    return "unavailable";
  }
}
export function analyticsAllowed(): boolean {
  return analyticsPreference() === "enabled";
}
export function analyticsVisitor(): string | null {
  if (!analyticsAllowed()) {
    // 同步清理其他 tab 的退出选择或 Do Not Track 变更后留下的旧标识。
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(ANALYTICS_VISITOR_KEY);
      } catch {
        /* Storage may be unavailable. */
      }
    }
    return null;
  }
  try {
    const previous = window.sessionStorage.getItem(ANALYTICS_VISITOR_KEY);
    if (
      previous &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        previous,
      )
    )
      return previous;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(ANALYTICS_VISITOR_KEY, id);
    return id;
  } catch {
    return null;
  }
}
export function setAnalyticsAllowed(enabled: boolean): boolean {
  if (typeof window === "undefined") return false;
  let saved = false;
  try {
    window.localStorage.setItem(ANALYTICS_PREFERENCE_KEY, enabled ? "on" : "off");
    saved = true;
    blockedTabs.delete(window);
  } catch {
    blockedTabs.add(window);
  }
  if (!enabled || !saved) {
    try {
      window.sessionStorage.removeItem(ANALYTICS_VISITOR_KEY);
    } catch {
      /* Sending remains disabled even if storage cannot be cleared. */
    }
  }
  window.dispatchEvent(new Event(ANALYTICS_CHANGE_EVENT));
  return saved;
}
export function subscribeAnalytics(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(ANALYTICS_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(ANALYTICS_CHANGE_EVENT, listener);
  };
}
