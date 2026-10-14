import { createHmac } from "node:crypto";
import type { Interest, User } from "../../../packages/shared/src";
import type { Store } from "./store";

export type ActivityType =
  "page_view" | "registration" | "login" | "free_box" | "premium_box" | "checkout";
export interface Activity {
  id: string;
  type: ActivityType;
  at: string;
  visitor?: string;
  userId?: string;
  interest?: Interest;
  mode?: "demo" | "paypal";
  paymentEnvironment?: "demo" | "sandbox" | "live";
  path?: string;
}
export interface Period {
  from: string;
  to: string;
  timezone: "UTC";
}
/** 只保存固定业务字段，不采集请求正文/IP/设备指纹/密钥/验证码。默认保留30天事件。 */
export class Analytics {
  constructor(
    private store: Store,
    private secret: string,
  ) {}
  async record(
    event: Omit<Activity, "at" | "visitor"> & { at?: string; visitorId?: string },
  ) {
    const { visitorId, ...rest } = event;
    const visitor =
      visitorId && /^[0-9a-f-]{36}$/i.test(visitorId)
        ? createHmac("sha256", this.secret).update(`analytics:${visitorId}`).digest("hex")
        : undefined;
    // 同一业务资源产生同一事件ID，刷新/重放不会重复计算Box或订单。
    await this.store.insert<Activity>("activity", event.id, {
      ...rest,
      at: event.at || new Date().toISOString(),
      ...(visitor ? { visitor } : {}),
    });
  }
  period(from?: string, to?: string): Period {
    const end = to ? new Date(to) : new Date(),
      start = from ? new Date(from) : new Date(end.getTime() - 7 * 86400000);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start >= end ||
      end.getTime() - start.getTime() > 31 * 86400000
    )
      throw new RangeError("Choose a valid UTC window of at most 31 days.");
    return { from: start.toISOString(), to: end.toISOString(), timezone: "UTC" };
  }
  async events(period: Period) {
    return (await this.store.list<Activity>("activity")).filter(
      (e) => e.at >= period.from && e.at < period.to,
    );
  }
  async summary(period: Period) {
    const events = await this.events(period),
      users = await this.store.list<User>("users");
    const inside = (date?: string) => !!date && date >= period.from && date < period.to;
    // 必要业务总量取自持久化订单/Box，不能依赖可选、可丢失的浏览事件。
    const orders = await this.store.list<{
      createdAt: string;
      paidAt?: string;
      paymentStatus: string;
      paymentEnvironment?: string;
    }>("orders");
    const boxes = (
      await this.store.list<{
        createdAt: string;
        tier: string;
        state: string;
        brief: { interest: Interest };
      }>("boxes")
    ).filter((b) => b.state === "ready" && inside(b.createdAt));
    const unique = (types: ActivityType[]) =>
      new Set(
        events
          .filter((e) => types.includes(e.type))
          .map((e) => e.visitor)
          .filter(Boolean),
      ).size;
    return {
      period,
      counts: {
        pageViews: events.filter((e) => e.type === "page_view").length,
        visitors: unique(["page_view"]),
        newUsers: users.filter((u) => inside(u.createdAt)).length,
        activeUsers: users.filter((u) => inside(u.lastLoginAt)).length,
        freeBoxes: boxes.filter((b) => b.tier === "free").length,
        premiumBoxes: boxes.filter((b) => b.tier === "premium").length,
        demoOrders: orders.filter(
          (o) =>
            inside(o.createdAt) &&
            ["demo", "sandbox"].includes(o.paymentEnvironment || ""),
        ).length,
        paidOrders: orders.filter(
          (o) =>
            inside(o.paidAt) &&
            o.paymentStatus === "completed" &&
            o.paymentEnvironment === "live",
        ).length,
      },
      interests: ["creator", "developer", "student", "business"].map((interest) => ({
        interest,
        count: boxes.filter((b) => b.brief.interest === interest).length,
      })),
      funnel: {
        visitors: unique(["page_view"]),
        boxUsers: unique(["free_box", "premium_box"]),
        checkoutUsers: unique(["checkout"]),
      },
      notes: [
        "UTC window is start-inclusive and end-exclusive.",
        "Optional analytics visitors are short-lived browser identifiers, not verified people. Bots and opt-out/storage clearing affect counts.",
        "Funnel columns are independent consenting visitors, not cohort conversion rates.",
        "Account activity counts accounts whose latest successful login is in this window. Historical login frequency is not retained.",
        "Essential order totals use stored payment state and captured environment, including webhook fulfillment and paid generation failures. Paid count is not net revenue/refund reconciliation.",
        "Optional event records contain no account identifiers and are removed after30days by an hourly job.",
      ],
    };
  }
  async users(period: Period) {
    return (await this.store.list<User>("users"))
      .filter((u) => u.createdAt && u.createdAt >= period.from && u.createdAt < period.to)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 100)
      .map((u) => ({
        id: u.id,
        email: u.email,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        role: u.role || "member",
      }));
  }
  async prune() {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    for (const event of await this.store.list<Activity>("activity"))
      if (event.at < cutoff) await this.store.delete("activity", event.id);
  }
}
