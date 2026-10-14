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
export function analyticsAllowed(): boolean {
  if (typeof window === "undefined" || doNotTrackEnabled()) return false;
  try {
    return window.localStorage.getItem(ANALYTICS_PREFERENCE_KEY) !== "off";
  } catch {
    return false;
  }
}
export function analyticsVisitor(): string | null {
  if (!analyticsAllowed()) return null;
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
  try {
    window.localStorage.setItem(
      ANALYTICS_PREFERENCE_KEY,
      enabled ? "on" : "off",
    );
    if (!enabled) window.sessionStorage.removeItem(ANALYTICS_VISITOR_KEY);
    window.dispatchEvent(new Event(ANALYTICS_CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}
export function subscribeAnalytics(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(ANALYTICS_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(ANALYTICS_CHANGE_EVENT, listener);
  };
}
