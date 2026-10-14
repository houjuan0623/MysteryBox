import { analyticsVisitor } from "./analytics";
import type {
  BoxResponse,
  CheckoutResponse,
  PublicConfig,
} from "@mysterybox/shared";
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const visitor = analyticsVisitor();
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(visitor ? { "x-analytics-visitor": visitor } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new RequestError(
      data?.error?.message ||
        "We couldn’t complete that request. Please try again.",
      response.status,
      data?.error?.code,
    );
  return data as T;
}
export const price = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
// 目录审核日期是日历日期而不是本地时间戳，固定 UTC 避免西半球显示前一天。
export const catalogDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
const readStorage = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
};
export function boxTokens(): Record<string, string> {
  return readStorage("mysterybox:boxes", {});
}
export function saveBox(result: BoxResponse) {
  const tokens = boxTokens();
  tokens[result.box.id] = result.accessToken;
  sessionStorage.setItem("mysterybox:boxes", JSON.stringify(tokens));
}
export function orderRecord(id: string): CheckoutResponse | null {
  return readStorage(`mysterybox:order:${id}`, null);
}
export function saveOrder(order: CheckoutResponse) {
  sessionStorage.setItem(
    `mysterybox:order:${order.orderId}`,
    JSON.stringify(order),
  );
}
// 同一个请求在网络失败后保留原幂等键，避免重试产生重复盒子或订单。内容改变才创建新键。
export function requestKey(kind: string, payload: unknown): string {
  const key = `mysterybox:request:${kind}`;
  const fingerprint = JSON.stringify(payload);
  const previous = readStorage<{ fingerprint: string; id: string } | null>(
    key,
    null,
  );
  if (previous?.fingerprint === fingerprint) return previous.id;
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ fingerprint, id }));
  return id;
}
export function clearRequestKey(kind: string) {
  sessionStorage.removeItem(`mysterybox:request:${kind}`);
}
let configPromise: Promise<PublicConfig> | null = null;
export function getConfig() {
  return (configPromise ||= api<PublicConfig>("/config").catch((error) => {
    configPromise = null;
    throw error;
  }));
}
