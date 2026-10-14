import path from "node:path";
import { config as dotenv } from "dotenv";
import type { PublicConfig } from "../../../packages/shared/src";
import type { ProviderConfig } from "./providers";

dotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
dotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });

export interface Config extends ProviderConfig {
  proxySecret: string;
  production: boolean;
  port: number;
  mongoUrl?: string;
  mongoDb: string;
  sessionSecret: string;
  premiumPriceCents: number;
  currency: "USD";
  freeLimit: number;
  appUrl: string;
  adminAppUrl: string;
}
/** 配置缺失应阻止上线，而不是悄悄降级成“模拟付款成功”。 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
  const mode = (name: string, allowed: string[], fallback: string) => {
    const value = env[name] || fallback;
    if (!allowed.includes(value))
      throw new Error(`${name} has an unsupported value`);
    return value;
  };
  const aiMode = mode("AI_MODE", ["demo", "vercel"], "demo") as
    "demo" | "vercel";
  const paymentMode = mode("PAYMENT_MODE", ["demo", "paypal"], "demo") as
    "demo" | "paypal";
  const emailMode = mode("EMAIL_MODE", ["demo", "resend"], "demo") as
    "demo" | "resend";
  const price = Number(env.PREMIUM_PRICE_CENTS || 299);
  if (!Number.isInteger(price) || price < 99 || price > 49900)
    throw new Error("PREMIUM_PRICE_CENTS must be 99–49900 integer cents");
  const freeLimit = Number(env.FREE_DAILY_LIMIT || (production ? 5 : 50));
  if (!Number.isSafeInteger(freeLimit) || freeLimit < 1 || freeLimit > 10000)
    throw new Error("FREE_DAILY_LIMIT must be a positive integer up to 10000");
  const appUrl = env.APP_URL || "http://localhost:3000";
  const parsed = new URL(appUrl);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.origin !== appUrl
  )
    throw new Error(
      "APP_URL must be an exact http(s) origin without trailing slash",
    );
  const adminAppUrl = env.ADMIN_APP_URL || "http://localhost:3001";
  const adminOrigin = new URL(adminAppUrl);
  if(adminOrigin.origin !== adminAppUrl || !["http:","https:"].includes(adminOrigin.protocol) || (production && adminOrigin.protocol !== "https:")) throw new Error("ADMIN_APP_URL must be an exact allowed origin");
  const required = (name: string) => {
    if (!env[name]) throw new Error(`${name} is required`);
  };
  if (aiMode === "vercel") {
    required("AI_GATEWAY_API_KEY");
    required("AI_GATEWAY_MODEL");
  }
  if (paymentMode === "paypal")
    for (const name of [
      "PAYPAL_CLIENT_ID",
      "PAYPAL_CLIENT_SECRET",
      "PAYPAL_MERCHANT_ID",
      "PAYPAL_WEBHOOK_ID",
    ])
      required(name);
  if (emailMode === "resend")
    for (const name of ["RESEND_API_KEY", "RESEND_FROM"]) required(name);
  const proxySecret =
    env.PROXY_SHARED_SECRET || "local-demo-proxy-secret-never-deploy";
  const sessionSecret =
    env.SESSION_SECRET || "local-demo-only-never-use-in-production-2026";
  if (production) {
    for (const name of [
      "MONGODB_URI",
      "SESSION_SECRET",
      "APP_URL",
      "PROXY_SHARED_SECRET",
    ])
      required(name);
    if (proxySecret.length < 32 || proxySecret.startsWith("local-demo"))
      throw new Error(
        "PROXY_SHARED_SECRET must be a unique 32+ character value",
      );
    if (sessionSecret.length < 32 || sessionSecret.startsWith("local-demo"))
      throw new Error(
        "A unique SESSION_SECRET of at least 32 characters is required",
      );
    if (
      parsed.protocol !== "https:" ||
      aiMode === "demo" ||
      paymentMode === "demo" ||
      emailMode === "demo"
    )
      throw new Error(
        "Production requires HTTPS and configured real providers; demo modes are refused",
      );
  }
  return {
    proxySecret,
    production,
    port: Number(env.PORT || 4000),
    mongoUrl: env.MONGODB_URI,
    mongoDb: env.MONGODB_DB || "mysterybox",
    sessionSecret,
    premiumPriceCents: price,
    currency: "USD",
    freeLimit,
    appUrl,
    adminAppUrl,
    aiMode,
    paymentMode,
    emailMode,
    gatewayApiKey: env.AI_GATEWAY_API_KEY,
    gatewayModel: env.AI_GATEWAY_MODEL,
    paypalClientId: env.PAYPAL_CLIENT_ID,
    paypalClientSecret: env.PAYPAL_CLIENT_SECRET,
    paypalMode: mode("PAYPAL_MODE", ["sandbox", "live"], "sandbox") as
      "sandbox" | "live",
    paypalMerchantId: env.PAYPAL_MERCHANT_ID,
    paypalWebhookId: env.PAYPAL_WEBHOOK_ID,
    resendApiKey: env.RESEND_API_KEY,
    resendFrom: env.RESEND_FROM,
    timeoutMs: 30000,
  };
}
export function publicConfig(c: Config): PublicConfig {
  return {
    demo:
      c.aiMode === "demo" ||
      c.paymentMode === "demo" ||
      c.emailMode === "demo" ||
      c.paypalMode === "sandbox",
    aiMode: c.aiMode,
    paymentMode: c.paymentMode,
    emailMode: c.emailMode,
    premiumPriceCents: c.premiumPriceCents,
    currency: c.currency,
    paymentEnvironment: c.paymentMode === "demo" ? "demo" : c.paypalMode,
  };
}
