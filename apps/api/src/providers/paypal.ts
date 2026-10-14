import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  CaptureResult,
  InspectInput,
  OrderAssociation,
  PaymentProvider,
  ProviderConfig,
} from "./contracts";
import { ProviderError } from "./contracts";
import { requestJson, required, stableKey } from "./http";
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const amountSchema = z
  .object({ value: z.string(), currency_code: z.string() })
  .passthrough();
const captureSchema = z
  .object({
    id: identifier,
    status: z.string(),
    amount: amountSchema,
    custom_id: z.string().optional(),
  })
  .passthrough();
const orderSchema = z
  .object({
    id: identifier,
    status: z.string(),
    purchase_units: z
      .array(
        z
          .object({
            custom_id: z.string(),
            amount: amountSchema,
            payee: z.object({ merchant_id: z.string() }).passthrough(),
            payments: z
              .object({ captures: z.array(captureSchema).optional() })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();
function validAssociation(input: OrderAssociation): void {
  if (
    !identifier.safeParse(input.id).success ||
    input.currency !== "USD" ||
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents < 1 ||
    input.amountCents > 1_000_000
  )
    throw new ProviderError(
      "INVALID_PAYMENT",
      "The payment details are invalid.",
    );
}
function validOrder(input: InspectInput): void {
  validAssociation(input);
  if (!identifier.safeParse(input.providerOrderId).success)
    throw new ProviderError(
      "INVALID_PAYMENT",
      "The payment details are invalid.",
    );
}
function cents(value: string): number | null {
  if (!/^(?:0|[1-9]\d{0,8})\.\d{2}$/.test(value)) return null;
  const result = Number(value.replace(".", ""));
  return Number.isSafeInteger(result) ? result : null;
}
function matchesAmount(
  value: z.infer<typeof amountSchema>,
  input: OrderAssociation,
): boolean {
  return (
    value.currency_code === input.currency &&
    cents(value.value) === input.amountCents
  );
}
/** 完整金额、货币、商户及订单关联全部一致，且单笔 capture 与 order 均 COMPLETED 才能履约。 */
export function validatePayPalOrder(
  raw: unknown,
  input: InspectInput,
  merchantId: string,
): { orderStatus: string; result: CaptureResult } {
  const parsed = orderSchema.safeParse(raw);
  if (!parsed.success)
    throw new ProviderError(
      "PAYMENT_INVALID_RESPONSE",
      "Payment verification is incomplete. Please contact support.",
      true,
    );
  const order = parsed.data,
    unit = order.purchase_units[0]!;
  if (
    order.id !== input.providerOrderId ||
    unit.custom_id !== input.id ||
    unit.payee.merchant_id !== merchantId ||
    !matchesAmount(unit.amount, input)
  )
    throw new ProviderError(
      "PAYMENT_MISMATCH",
      "Payment details did not match this order. Please contact support.",
    );
  const captures = unit.payments?.captures ?? [];
  if (captures.length > 1)
    throw new ProviderError(
      "PAYMENT_MISMATCH",
      "Payment details did not match this order. Please contact support.",
    );
  const capture = captures[0];
  if (!capture)
    return {
      orderStatus: order.status,
      result: { captureId: "", status: "pending" },
    };
  if (
    !matchesAmount(capture.amount, input) ||
    (capture.custom_id !== undefined && capture.custom_id !== input.id)
  )
    throw new ProviderError(
      "PAYMENT_MISMATCH",
      "Payment details did not match this order. Please contact support.",
    );
  if (capture.status === "COMPLETED" && order.status === "COMPLETED")
    return {
      orderStatus: order.status,
      result: { captureId: capture.id, status: "completed" },
    };
  if (capture.status === "PENDING")
    return {
      orderStatus: order.status,
      result: { captureId: capture.id, status: "pending" },
    };
  throw new ProviderError(
    "PAYMENT_NOT_COMPLETED",
    "The payment has not completed. Please contact support before trying another payment.",
  );
}
export class DemoPaymentProvider implements PaymentProvider {
  async create(
    input: OrderAssociation & { createKey: string },
  ): Promise<{ providerOrderId: string }> {
    validAssociation(input);
    stableKey(input.createKey, 108);
    return {
      providerOrderId: `DEMO-${createHash("sha256").update(input.id).digest("hex").slice(0, 24)}`,
    };
  }
  async capture(
    input: InspectInput & { captureKey: string },
  ): Promise<CaptureResult> {
    validOrder(input);
    stableKey(input.captureKey, 108);
    const expected = `DEMO-${createHash("sha256").update(input.id).digest("hex").slice(0, 24)}`;
    if (input.providerOrderId !== expected)
      throw new ProviderError(
        "PAYMENT_MISMATCH",
        "The demo payment does not match this order.",
      );
    return {
      captureId: `DEMO-CAP-${createHash("sha256").update(input.id).digest("hex").slice(0, 24)}`,
      status: "completed",
    };
  }
  async inspect(input: InspectInput): Promise<CaptureResult> {
    validOrder(input);
    return { captureId: "", status: "pending" };
  }
  async verifyWebhook(): Promise<boolean> {
    return false;
  }
}
export class PayPalProvider implements PaymentProvider {
  private readonly base: string;
  private readonly merchantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private token?: { value: string; expiresAt: number };
  private tokenInFlight?: Promise<string>;
  constructor(
    private readonly config: ProviderConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.clientId = required(config.paypalClientId, "PayPal client ID");
    this.clientSecret = required(
      config.paypalClientSecret,
      "PayPal client secret",
    );
    this.merchantId = required(config.paypalMerchantId, "PayPal merchant ID");
    if (config.paypalMode !== "sandbox" && config.paypalMode !== "live")
      throw new ProviderError(
        "PROVIDER_NOT_CONFIGURED",
        "PayPal mode must explicitly be sandbox or live.",
      );
    this.base =
      config.paypalMode === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";
  }
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now())
      return this.token.value;
    if (this.tokenInFlight) return this.tokenInFlight;
    this.tokenInFlight = (async () => {
      const raw = await requestJson(
        `${this.base}/v1/oauth2/token`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        },
        {
          fetchImpl: this.fetchImpl,
          timeoutMs: this.config.timeoutMs,
          code: "PAYMENT_UNAVAILABLE",
          message: "Payment service is temporarily unavailable.",
        },
      );
      const parsed = z
        .object({
          access_token: z.string().min(1),
          expires_in: z.number().positive(),
          token_type: z.string().optional(),
        })
        .safeParse(raw);
      if (!parsed.success)
        throw new ProviderError(
          "PAYMENT_UNAVAILABLE",
          "Payment service is temporarily unavailable.",
        );
      this.token = {
        value: parsed.data.access_token,
        expiresAt: Date.now() + Math.max(0, parsed.data.expires_in - 60) * 1000,
      };
      return this.token.value;
    })();
    try {
      return await this.tokenInFlight;
    } finally {
      this.tokenInFlight = undefined;
    }
  }
  private async api(
    path: string,
    init: RequestInit,
    mutation = false,
  ): Promise<unknown> {
    const token = await this.accessToken();
    return requestJson(
      `${this.base}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      },
      {
        fetchImpl: this.fetchImpl,
        timeoutMs: this.config.timeoutMs,
        mutation,
        code: mutation ? "PAYMENT_REQUEST_FAILED" : "PAYMENT_UNAVAILABLE",
        message: mutation
          ? "The payment result could not be confirmed. Check this order before trying another payment."
          : "Payment verification is temporarily unavailable.",
      },
    );
  }
  async create(
    input: OrderAssociation & { createKey: string },
  ): Promise<{ providerOrderId: string; approvalUrl?: string }> {
    validAssociation(input);
    const raw = await this.api(
      "/v2/checkout/orders",
      {
        method: "POST",
        headers: {
          "PayPal-Request-Id": stableKey(input.createKey, 108),
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: input.id,
              custom_id: input.id,
              description:
                "MysteryBox premium AI-tool discovery box (one-time purchase)",
              amount: {
                currency_code: input.currency,
                value: (input.amountCents / 100).toFixed(2),
              },
              payee: { merchant_id: this.merchantId },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                shipping_preference: "NO_SHIPPING",
                user_action: "PAY_NOW",
                ...(this.config.appUrl
                  ? {
                      return_url: new URL(
                        `/checkout/return?order=${encodeURIComponent(input.id)}`,
                        this.config.appUrl,
                      ).href,
                      cancel_url: new URL(
                        "/discover?cancelled=1",
                        this.config.appUrl,
                      ).href,
                    }
                  : {}),
              },
            },
          },
        }),
      },
      true,
    );
    const parsed = z
      .object({
        id: identifier,
        status: z.string(),
        links: z
          .array(z.object({ href: z.string(), rel: z.string() }).passthrough())
          .optional(),
      })
      .passthrough()
      .safeParse(raw);
    if (
      !parsed.success ||
      !["CREATED", "PAYER_ACTION_REQUIRED", "APPROVED"].includes(
        parsed.data.status,
      )
    )
      throw new ProviderError(
        "PAYMENT_INVALID_RESPONSE",
        "The payment order could not be confirmed.",
        true,
      );
    const approval = parsed.data.links?.find(
      (link) => link.rel === "approve" || link.rel === "payer-action",
    );
    let approvalUrl: string | undefined;
    if (approval) {
      try {
        const url = new URL(approval.href),
          expectedHost =
            this.config.paypalMode === "live"
              ? "www.paypal.com"
              : "www.sandbox.paypal.com";
        if (
          url.protocol !== "https:" ||
          url.hostname !== expectedHost ||
          url.username ||
          url.password ||
          url.port
        )
          throw new Error("Invalid host");
        approvalUrl = url.href;
      } catch {
        throw new ProviderError(
          "PAYMENT_INVALID_RESPONSE",
          "The payment approval link could not be verified.",
          true,
        );
      }
    }
    return {
      providerOrderId: parsed.data.id,
      ...(approvalUrl ? { approvalUrl } : {}),
    };
  }
  private async readOrder(
    input: InspectInput,
  ): Promise<ReturnType<typeof validatePayPalOrder>> {
    validOrder(input);
    const raw = await this.api(`/v2/checkout/orders/${input.providerOrderId}`, {
      method: "GET",
    });
    return validatePayPalOrder(raw, input, this.merchantId);
  }
  async inspect(input: InspectInput): Promise<CaptureResult> {
    return (await this.readOrder(input)).result;
  }
  async capture(
    input: InspectInput & { captureKey: string },
  ): Promise<CaptureResult> {
    stableKey(input.captureKey, 108);
    const before = await this.readOrder(input);
    if (before.result.status === "completed" || before.result.captureId)
      return before.result;
    if (before.orderStatus !== "APPROVED")
      throw new ProviderError(
        "PAYMENT_NOT_APPROVED",
        "Approve this PayPal order before completing payment.",
      );
    const raw = await this.api(
      `/v2/checkout/orders/${input.providerOrderId}/capture`,
      {
        method: "POST",
        headers: {
          "PayPal-Request-Id": input.captureKey,
          Prefer: "return=representation",
        },
        body: "{}",
      },
      true,
    );
    const association = z
      .object({ id: identifier })
      .passthrough()
      .safeParse(raw);
    if (!association.success || association.data.id !== input.providerOrderId)
      throw new ProviderError(
        "PAYMENT_MISMATCH",
        "Payment details did not match this order. Please contact support.",
        true,
      );
    try {
      return await this.inspect(input);
    } catch (error) {
      if (error instanceof ProviderError)
        throw new ProviderError(error.code, error.message, true);
      throw new ProviderError(
        "PAYMENT_UNAVAILABLE",
        "The payment result could not be confirmed. Please check this order.",
        true,
      );
    }
  }
  async verifyWebhook(
    headers: Record<string, string | undefined>,
    body: unknown,
    rawBody?: string,
  ): Promise<boolean> {
    // 验证失败时不执行任何履约。事件去重、订单关联和退款策略由核心服务处理。
    const normalized = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
    );
    const fields = [
      "paypal-auth-algo",
      "paypal-cert-url",
      "paypal-transmission-id",
      "paypal-transmission-sig",
      "paypal-transmission-time",
    ] as const;
    if (
      !this.config.paypalWebhookId ||
      fields.some(
        (key) => !normalized[key] || normalized[key]!.length > 4096,
      ) ||
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    )
      return false;
    let certificate: URL;
    try {
      certificate = new URL(normalized["paypal-cert-url"]!);
    } catch {
      return false;
    }
    const allowedHosts =
      this.config.paypalMode === "live"
        ? ["api.paypal.com", "api-m.paypal.com"]
        : ["api.sandbox.paypal.com", "api-m.sandbox.paypal.com"];
    if (
      certificate.protocol !== "https:" ||
      !allowedHosts.includes(certificate.hostname) ||
      certificate.username ||
      certificate.password ||
      certificate.port ||
      !certificate.pathname.startsWith("/v1/notifications/certs/")
    )
      return false;
    let eventText = JSON.stringify(body);
    if (rawBody !== undefined) {
      try {
        if (JSON.stringify(JSON.parse(rawBody)) !== JSON.stringify(body))
          return false;
        eventText = rawBody;
      } catch {
        return false;
      }
    }
    const envelope = {
      auth_algo: normalized["paypal-auth-algo"],
      cert_url: normalized["paypal-cert-url"],
      transmission_id: normalized["paypal-transmission-id"],
      transmission_sig: normalized["paypal-transmission-sig"],
      transmission_time: normalized["paypal-transmission-time"],
      webhook_id: this.config.paypalWebhookId,
    };
    const raw = await this.api("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body:
        JSON.stringify(envelope).slice(0, -1) +
        ',"webhook_event":' +
        eventText +
        "}",
    });
    return z
      .object({ verification_status: z.literal("SUCCESS") })
      .safeParse(raw).success;
  }
}
