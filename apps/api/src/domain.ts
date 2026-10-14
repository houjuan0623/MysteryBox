import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  Box,
  BoxResponse,
  Brief,
  CheckoutResponse,
  User,
  Tool,
} from "../../../packages/shared/src";
import { Analytics } from "./analytics";
import type { Config } from "./config";
import { catalog, CATALOG_VERSION } from "./catalog";
import { z } from "zod";
import { INTERESTS } from "../../../packages/shared/src";
import { createProviders } from "./providers";
import type { Records, Store } from "./store";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface BoxRecord {
  id: string;
  ownerId?: string;
  brief: Brief;
  tier: "free" | "premium";
  state: "queued" | "ready" | "failed";
  box?: Box;
  createdAt: string;
}
export interface OrderRecord {
  id: string;
  ownerId?: string;
  brief: Brief;
  amountCents: number;
  currency: "USD";
  providerOrderId: string;
  approvalUrl?: string;
  paymentStatus: "pending" | "completed";
  paymentEnvironment: "demo" | "sandbox" | "live";
  paidAt?: string;
  generationStatus: "queued" | "ready" | "failed";
  captureId?: string;
  boxId: string;
  createKey: string;
  captureKey: string;
  createdAt: string;
}
interface Challenge {
  id: string;
  email: string;
  hash: string;
  expiresAt: number;
  attempts: number;
  used: boolean;
}
interface Session {
  userId: string;
  expiresAt: number;
}
interface Idempotency {
  hash: string;
  resourceId: string;
}
interface DeliveryRecord {
  key: string;
  boxId: string;
  email: string;
  status: "pending" | "failed" | "sent" | "demo";
  attempts: number;
  nextAttemptAt: number;
  createdAt: string;
}
interface EventRecord {
  id: string;
  providerOrderId: string;
  status: "queued" | "done";
  attempts: number;
  nextAttemptAt: number;
}
const now = () => new Date().toISOString();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * 领域层是价格、归属和状态机的唯一可信来源。
 * 前端的金额、onApprove、邮箱文本或一个随机 boxId 都不能赋予付费/访问权限。
 */
export class MysteryBoxService {
  catalog: Tool[] = catalog;
  catalogVersion = CATALOG_VERSION;
  async loadCatalog() {
    if (this.store.mode === "mongo") {
      const tools = await this.store.list<Tool>("tools");
      if (tools.length < 10)
        throw new Error("Tool catalog is not seeded; run npm run db:seed");
      const schema = z
        .object({
          id: z.string().regex(/^[a-z0-9-]+$/),
          name: z.string().min(1),
          tagline: z.string(),
          description: z.string(),
          category: z.string(),
          interests: z.array(z.enum(INTERESTS)).min(1),
          website: z.url().refine((v) => new URL(v).protocol === "https:"),
          pricingNote: z.string(),
          sourceUrl: z.url().refine((v) => new URL(v).protocol === "https:"),
          reviewedAt: z.string().nullable(),
          capabilities: z.array(z.string()).min(1),
          caveat: z.string(),
        })
        .strict();
      for (const tool of tools) schema.parse(tool);
      const version = await this.store.get<{ version: string }>(
        "catalog_versions",
        "current",
      );
      if (!version?.version || new Set(tools.map((t) => t.id)).size !== tools.length)
        throw new Error("Catalog metadata invalid");
      this.catalog = tools;
      this.catalogVersion = version.version;
    }
  }
  readonly analytics: Analytics;
  readonly providers: ReturnType<typeof createProviders>;
  constructor(
    readonly config: Config,
    readonly store: Store,
    providers?: ReturnType<typeof createProviders>,
  ) {
    this.providers = providers || createProviders(config);
    this.analytics = new Analytics(store, config.sessionSecret);
  }
  private token(kind: string, id: string) {
    return createHmac("sha256", this.config.sessionSecret)
      .update(`${kind}:${id}`)
      .digest("base64url");
  }
  private access(kind: string, id: string, token?: string) {
    return !!token && safeEqual(this.token(kind, id), token);
  }
  private owner(ownerId: string | undefined, user?: User) {
    return !!user && ownerId === user.id;
  }
  private verifyIdempotency(
    key: string,
    existing: Idempotency | undefined,
    hash: string,
  ) {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new AppError(
        400,
        "IDEMPOTENCY_REQUIRED",
        "Use a stable Idempotency-Key of 16–128 letters, digits, hyphens or underscores.",
      );
    if (existing && existing.hash !== hash)
      throw new AppError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This request key was already used for different inputs.",
      );
  }
  async limit(scope: string, subject: string, maximum: number, windowMs: number) {
    const key = `${scope}:${sha(subject)}:${Math.floor(Date.now() / windowMs)}`;
    await this.store.atomic(`limit:${key}`, async (tx) => {
      const record = (await tx.get<{ count: number }>("limits", key)) || {
        count: 0,
      };
      if (record.count >= maximum)
        throw new AppError(
          429,
          "RATE_LIMIT",
          "Too many requests. Please try again later.",
        );
      record.count++;
      await tx.put("limits", key, record);
    });
  }
  async userFromSession(sessionToken?: string): Promise<User | undefined> {
    if (!sessionToken) return;
    const session = await this.store.get<Session>("sessions", sha(sessionToken));
    if (!session || session.expiresAt < Date.now()) return;
    return this.store.get<User>("users", session.userId);
  }
  async requestCode(email: string) {
    email = email.trim().toLowerCase();
    await this.limit("login-email", email, 5, 3600000);
    const id = randomUUID(),
      code = String(randomInt(0, 1000000)).padStart(6, "0");
    const challenge: Challenge = {
      id,
      email,
      hash: this.token("code", `${id}:${code}`),
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
      used: false,
    };
    await this.store.put("challenges", id, challenge);
    try {
      await this.providers.email.sendCode({
        email,
        code,
        idempotencyKey: `login-${id}`,
      });
    } catch {
      await this.store.delete("challenges", id);
      throw new AppError(
        503,
        "EMAIL_UNAVAILABLE",
        "We could not send your sign-in code. Please try again.",
      );
    }
    return {
      challengeId: id,
      ...(this.config.emailMode === "demo" ? { developmentCode: code } : {}),
    };
  }
  async verifyCode(id: string, code: string) {
    const result = await this.store.atomic(`challenge:${id}`, async (tx) => {
      const challenge = await tx.get<Challenge>("challenges", id);
      if (
        !challenge ||
        challenge.used ||
        challenge.expiresAt < Date.now() ||
        challenge.attempts >= 5
      )
        return undefined;
      challenge.attempts++;
      const valid = safeEqual(challenge.hash, this.token("code", `${id}:${code}`));
      if (valid) challenge.used = true;
      await tx.put("challenges", id, challenge);
      return valid ? challenge.email : undefined;
    });
    // 错误次数必须先提交，再抛出异常，避免事务回滚让攻击者无限猜码。
    if (!result)
      throw new AppError(
        401,
        "INVALID_CODE",
        "The code is incorrect, expired, or already used. Request a new one.",
      );
    return this.store.atomic(`user-email:${sha(result)}`, async (tx) => {
      const index = await tx.get<{ id: string }>("user_emails", sha(result));
      let user = index ? await tx.get<User>("users", index.id) : undefined;
      if (!user) {
        user = { id: randomUUID(), email: result, role: "member", createdAt: now() };
        await tx.put("users", user.id, user);
        await tx.put("user_emails", sha(result), { id: user.id });
      }
      user.lastLoginAt = now();
      await tx.put("users", user.id, user);
      const token = randomBytes(32).toString("base64url");
      await tx.put<Session>("sessions", sha(token), {
        userId: user.id,
        expiresAt: Date.now() + 7 * 86400000,
      });
      return { user, token };
    });
  }
  async logout(sessionToken?: string) {
    if (sessionToken) await this.store.delete("sessions", sha(sessionToken));
  }
  async free(brief: Brief, key: string, user?: User): Promise<BoxResponse> {
    const hash = sha(JSON.stringify({ brief, user: user?.id || null }));
    const boxId = await this.store.atomic(`free:${key}`, async (tx) => {
      const previous = await tx.get<Idempotency>("free_requests", key);
      this.verifyIdempotency(key, previous, hash);
      if (previous) return previous.resourceId;
      const id = randomUUID();
      await tx.put<BoxRecord>("boxes", id, {
        id,
        ownerId: user?.id,
        brief,
        tier: "free",
        state: "queued",
        createdAt: now(),
      });
      await tx.put("free_requests", key, { hash, resourceId: id });
      return id;
    });
    const box = await this.generate(boxId);
    const emailStatus =
      brief.email && brief.emailConsent
        ? await this.sendBoxEmail(boxId, brief.email)
        : "skipped";
    return { box, accessToken: this.token("box", boxId), emailStatus };
  }
  private async generate(id: string): Promise<Box> {
    const result = await this.store.atomic(`box:${id}`, async (tx) => {
      const record = await tx.get<BoxRecord>("boxes", id);
      if (!record) throw new AppError(404, "BOX_NOT_FOUND", "Box not found.");
      if (record.box && record.state === "ready") return { box: record.box };
      try {
        const data = await this.providers.ai.generate({
          id,
          interest: record.brief.interest,
          tier: record.tier,
          goal: record.brief.goal,
          tools: this.catalog.filter((t) => t.interests.includes(record.brief.interest)),
        });
        record.box = {
          ...data,
          id,
          interest: record.brief.interest,
          tier: record.tier,
          createdAt: record.createdAt,
        };
        record.state = "ready";
        await tx.put("boxes", id, record);
        return { box: record.box };
      } catch {
        record.state = "failed";
        await tx.put("boxes", id, record);
        return { box: undefined };
      }
    });
    if (!result.box)
      throw new AppError(
        503,
        "GENERATION_FAILED",
        "Your request is saved. Generation is temporarily unavailable. Retry the same request; completed payments are not charged again.",
      );
    return result.box;
  }
  async readBox(id: string, token?: string, user?: User) {
    const record = await this.store.get<BoxRecord>("boxes", id);
    if (!record || (!this.owner(record.ownerId, user) && !this.access("box", id, token)))
      throw new AppError(404, "BOX_NOT_FOUND", "Box not found or access expired.");
    if (!record.box)
      throw new AppError(409, "BOX_NOT_READY", "This box is not ready yet.");
    return record.box;
  }
  async createOrder(brief: Brief, key: string, user?: User): Promise<CheckoutResponse> {
    const hash = sha(JSON.stringify({ brief, user: user?.id || null }));
    const id = await this.store.atomic(`checkout:${key}`, async (tx) => {
      const previous = await tx.get<Idempotency>("order_requests", key);
      this.verifyIdempotency(key, previous, hash);
      if (previous) return previous.resourceId;
      const id = randomUUID();
      await tx.put<OrderRecord>("orders", id, {
        id,
        ownerId: user?.id,
        brief,
        amountCents: this.config.premiumPriceCents,
        currency: "USD",
        providerOrderId: "",
        paymentStatus: "pending",
        paymentEnvironment:
          this.config.paymentMode === "demo"
            ? "demo"
            : this.config.paypalMode || "sandbox",
        generationStatus: "queued",
        boxId: randomUUID(),
        createKey: randomUUID(),
        captureKey: randomUUID(),
        createdAt: now(),
      });
      await tx.put("order_requests", key, { hash, resourceId: id });
      return id;
    });
    // 先持久化本地订单和稳定 provider key。即使网络结果不明确，重试也不会换 key。
    return this.store.atomic(`order:${id}`, async (tx) => {
      const order = (await tx.get<OrderRecord>("orders", id))!;
      if (!order.providerOrderId) {
        const external = await this.providers.payments.create({
          id,
          amountCents: order.amountCents,
          currency: order.currency,
          createKey: order.createKey,
        });
        order.providerOrderId = external.providerOrderId;
        order.approvalUrl = external.approvalUrl;
        await tx.put("orders", id, order);
      }
      return {
        orderId: id,
        paypalOrderId: order.providerOrderId,
        approvalUrl: order.approvalUrl,
        demo: this.config.paymentMode === "demo",
        accessToken: this.token("order", id),
        amountCents: order.amountCents,
        currency: order.currency,
      };
    });
  }
  private authorizeOrder(
    order: OrderRecord | undefined,
    token?: string,
    user?: User,
  ): asserts order is OrderRecord {
    if (
      !order ||
      (!this.owner(order.ownerId, user) && !this.access("order", order.id, token))
    )
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found or access expired.");
  }
  private async markPaid(tx: Records, order: OrderRecord, captureId: string) {
    if (!captureId)
      throw new AppError(409, "PAYMENT_PENDING", "Payment is still pending.");
    const claimed = await tx.insert("captures", captureId, {
      orderId: order.id,
    });
    if (
      !claimed &&
      (await tx.get<{ orderId: string }>("captures", captureId))?.orderId !== order.id
    )
      throw new AppError(
        409,
        "CAPTURE_CONFLICT",
        "Payment could not be matched to this order.",
      );
    order.paymentStatus = "completed";
    order.paidAt ||= now();
    order.captureId = captureId;
    await tx.put("orders", order.id, order);
    if (!(await tx.get("boxes", order.boxId)))
      await tx.put<BoxRecord>("boxes", order.boxId, {
        id: order.boxId,
        ownerId: order.ownerId,
        brief: order.brief,
        tier: "premium",
        state: "queued",
        createdAt: now(),
      });
  }
  async captureOrder(
    id: string,
    token?: string,
    user?: User,
    demo = false,
  ): Promise<BoxResponse> {
    if ((this.config.paymentMode === "demo") !== demo)
      throw new AppError(
        400,
        "PAYMENT_MODE",
        "Use the checkout method shown for this environment.",
      );
    const order = await this.store.atomic(`order:${id}`, async (tx) => {
      const order = await tx.get<OrderRecord>("orders", id);
      this.authorizeOrder(order, token, user);
      if (order.paymentStatus !== "completed") {
        const capture = await this.providers.payments.capture({
          id,
          providerOrderId: order.providerOrderId,
          amountCents: order.amountCents,
          currency: order.currency,
          captureKey: order.captureKey,
        });
        if (capture.status !== "completed")
          throw new AppError(
            409,
            "PAYMENT_PENDING",
            "Payment is pending. You can safely retry this checkout.",
          );
        await this.markPaid(tx, order, capture.captureId);
      }
      return order;
    });
    return this.fulfill(order);
  }
  private async fulfill(
    order: OrderRecord,
    automaticEmail = false,
  ): Promise<BoxResponse> {
    try {
      const box = await this.generate(order.boxId);
      await this.store.atomic(`order:${order.id}`, async (tx) => {
        const current = (await tx.get<OrderRecord>("orders", order.id))!;
        current.generationStatus = "ready";
        await tx.put("orders", order.id, current);
      });
      const emailStatus =
        order.brief.email && order.brief.emailConsent
          ? await this.sendBoxEmail(order.boxId, order.brief.email, automaticEmail)
          : "skipped";
      return { box, accessToken: this.token("box", order.boxId), emailStatus };
    } catch (error) {
      await this.store.atomic(`order:${order.id}`, async (tx) => {
        const current = (await tx.get<OrderRecord>("orders", order.id))!;
        if (current.generationStatus !== "ready") current.generationStatus = "failed";
        await tx.put("orders", order.id, current);
      });
      throw error;
    }
  }
  async orderStatus(id: string, token?: string, user?: User) {
    const order = await this.store.get<OrderRecord>("orders", id);
    this.authorizeOrder(order, token, user);
    return {
      id,
      paymentStatus: order.paymentStatus,
      generationStatus: order.generationStatus,
      boxId: order.paymentStatus === "completed" ? order.boxId : undefined,
      amountCents: order.amountCents,
      currency: order.currency,
    };
  }
  private async sendBoxEmail(
    id: string,
    email: string,
    automatic = false,
  ): Promise<"demo" | "sent" | "failed"> {
    const key = `${id}:${sha(email.toLowerCase())}`;
    // 发送前先提交投递意图；进程在网络调用中退出后仍可恢复 pending 任务。
    await this.store.atomic(`email:${key}`, async (tx) => {
      if (!(await tx.get("deliveries", key)))
        await tx.put<DeliveryRecord>("deliveries", key, {
          key,
          boxId: id,
          email,
          status: "pending",
          attempts: 0,
          nextAttemptAt: Date.now(),
          createdAt: now(),
        });
    });
    return this.store.atomic(`email:${key}`, async (tx) => {
      let delivery = await tx.get<DeliveryRecord>("deliveries", key);
      if (delivery?.status === "sent" || delivery?.status === "demo")
        return delivery.status;
      if (
        automatic &&
        delivery &&
        (delivery.attempts >= 5 ||
          delivery.nextAttemptAt > Date.now() ||
          Date.now() - Date.parse(delivery.createdAt) >= 23 * 3600000)
      )
        return "failed";
      delivery ||= {
        key,
        boxId: id,
        email,
        status: "pending",
        attempts: 0,
        nextAttemptAt: Date.now(),
        createdAt: now(),
      };
      const record = (await tx.get<BoxRecord>("boxes", id))!;
      delivery.attempts++;
      try {
        const result = await this.providers.email.sendBox({
          email,
          box: record.box!,
          tools: this.catalog,
          idempotencyKey: `box-${sha(key)}`,
        });
        delivery.status = result.status;
        await tx.put("deliveries", key, delivery);
        return result.status;
      } catch {
        // 失败也必须持久化。已付款访客关闭浏览器后，后台仍可独立重试邮件。
        delivery.status = "failed";
        delivery.nextAttemptAt =
          Date.now() + Math.min(300000, 2 ** Math.min(delivery.attempts, 8) * 5000);
        await tx.put("deliveries", key, delivery);
        return "failed";
      }
    });
  }
  async processDeliveries() {
    const pending = (await this.store.list<DeliveryRecord>("deliveries")).filter(
      (d) =>
        (d.status === "failed" || d.status === "pending") &&
        d.attempts < 5 &&
        d.nextAttemptAt <= Date.now() &&
        Date.now() - Date.parse(d.createdAt) < 23 * 3600000,
    );
    // Resend 的幂等窗口有限。旧的不确定任务保留给人工对账，不在24小时后盲目重发。
    for (const delivery of pending)
      await this.sendBoxEmail(delivery.boxId, delivery.email, true);
  }
  async emailBox(id: string, email: string, token?: string, user?: User) {
    await this.readBox(id, token, user);
    return { status: await this.sendBoxEmail(id, email) };
  }
  async history(user: User) {
    return (await this.store.list<BoxRecord>("boxes"))
      .filter((b) => b.ownerId === user.id && b.box)
      .map((b) => b.box!)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async claim(id: string, token: string, user: User) {
    return this.store.atomic(`box:${id}`, async (tx) => {
      const record = await tx.get<BoxRecord>("boxes", id);
      if (
        !record ||
        !this.access("box", id, token) ||
        (record.ownerId && record.ownerId !== user.id)
      )
        throw new AppError(
          404,
          "BOX_NOT_FOUND",
          "Box not found or already owned by another account.",
        );
      record.ownerId = user.id;
      await tx.put("boxes", id, record);
      return { claimed: true };
    });
  }
  async favorites(user: User) {
    return (
      (await this.store.get<{ toolIds: string[] }>("favorites", user.id))?.toolIds || []
    );
  }
  async favorite(user: User, toolId: string, saved: boolean) {
    if (!this.catalog.some((t) => t.id === toolId))
      throw new AppError(404, "TOOL_NOT_FOUND", "Tool not found.");
    return this.store.atomic(`favorites:${user.id}`, async (tx) => {
      const favorites = new Set(
        (await tx.get<{ toolIds: string[] }>("favorites", user.id))?.toolIds || [],
      );
      if (saved) favorites.add(toolId);
      else favorites.delete(toolId);
      const result = { toolIds: [...favorites] };
      await tx.put("favorites", user.id, result);
      return result;
    });
  }
  async webhook(
    headers: Record<string, string | undefined>,
    body: unknown,
    rawBody?: string,
  ) {
    if (
      this.config.paymentMode !== "paypal" ||
      !(await this.providers.payments.verifyWebhook(headers, body, rawBody))
    )
      throw new AppError(
        400,
        "INVALID_WEBHOOK",
        "Webhook signature could not be verified.",
      );
    const event = body as {
      id?: string;
      event_type?: string;
      resource?: {
        supplementary_data?: { related_ids?: { order_id?: string } };
      };
    };
    if (!event.id || event.id.length > 200)
      throw new AppError(400, "INVALID_WEBHOOK", "Webhook event id is missing.");
    if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") return { accepted: true };
    const providerOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
    if (!providerOrderId)
      throw new AppError(400, "INVALID_WEBHOOK", "Webhook order reference is missing.");
    // 验签后先落库再返回 202；外部邮件/模型绝不能阻塞 PayPal webhook 的确认。
    await this.store.insert<EventRecord>("webhooks", event.id, {
      id: event.id,
      providerOrderId,
      status: "queued",
      attempts: 0,
      nextAttemptAt: Date.now(),
    });
    return { accepted: true };
  }
  async processEvents() {
    for (const event of (await this.store.list<EventRecord>("webhooks")).filter(
      (e) => e.status === "queued" && e.nextAttemptAt <= Date.now(),
    )) {
      try {
        const orders = await this.store.list<OrderRecord>("orders");
        const candidate = orders.find((o) => o.providerOrderId === event.providerOrderId);
        if (!candidate) throw new Error("Unknown order");
        const order = await this.store.atomic(`order:${candidate.id}`, async (tx) => {
          const order = (await tx.get<OrderRecord>("orders", candidate.id))!;
          if (order.paymentStatus !== "completed") {
            const external = await this.providers.payments.inspect({
              id: order.id,
              providerOrderId: order.providerOrderId,
              amountCents: order.amountCents,
              currency: order.currency,
            });
            if (external.status !== "completed") throw new Error("Not completed");
            await this.markPaid(tx, order, external.captureId);
          }
          return order;
        });
        await this.fulfill(order, true);
        event.status = "done";
        await this.store.put("webhooks", event.id, event);
      } catch {
        event.attempts++;
        event.nextAttemptAt =
          Date.now() + Math.min(3600000, 2 ** Math.min(event.attempts, 10) * 5000);
        await this.store.put("webhooks", event.id, event);
      }
    }
    await this.processDeliveries();
  }
}
