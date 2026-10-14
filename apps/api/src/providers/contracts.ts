import type { Box, Interest, Tool } from "@mysterybox/shared";

/** 从保留的源代码文本重建；配置仅由服务端环境加载。 */
export interface ProviderConfig {
  aiMode: "demo" | "vercel";
  paymentMode: "demo" | "paypal";
  emailMode: "demo" | "resend";
  openaiApiKey?: string;
  openaiModel?: string;
  gatewayApiKey?: string;
  gatewayModel?: string;
  paypalClientId?: string;
  paypalClientSecret?: string;
  paypalMode?: "sandbox" | "live";
  paypalMerchantId?: string;
  paypalWebhookId?: string;
  resendApiKey?: string;
  resendFrom?: string;
  appUrl?: string;
  timeoutMs?: number;
}
export interface GenerateInput {
  id: string;
  interest: Interest;
  tier: "free" | "premium";
  goal: string;
  tools: Tool[];
}
export type GeneratedBox = Pick<
  Box,
  "title" | "summary" | "tools" | "workflow" | "generationMode"
>;
export interface AiProvider {
  generate(input: GenerateInput): Promise<GeneratedBox>;
}
export interface OrderAssociation {
  id: string;
  amountCents: number;
  currency: "USD";
}
export interface InspectInput extends OrderAssociation {
  providerOrderId: string;
}
export interface CaptureResult {
  captureId: string;
  status: "completed" | "pending";
}
export interface PaymentProvider {
  create(
    input: OrderAssociation & { createKey: string },
  ): Promise<{ providerOrderId: string; approvalUrl?: string }>;
  capture(input: InspectInput & { captureKey: string }): Promise<CaptureResult>;
  inspect(input: InspectInput): Promise<CaptureResult>;
  verifyWebhook(
    headers: Record<string, string | undefined>,
    body: unknown,
    rawBody?: string,
  ): Promise<boolean>;
}
export interface SendBoxInput {
  email: string;
  box: Box;
  tools: Tool[];
  idempotencyKey: string;
}
export interface SendCodeInput {
  email: string;
  code: string;
  idempotencyKey: string;
}
export interface EmailResult {
  status: "sent" | "demo";
}
export interface EmailProvider {
  sendBox(input: SendBoxInput): Promise<EmailResult>;
  sendCode(input: SendCodeInput): Promise<EmailResult>;
}
/** 固定安全错误文案，不泄漏上游正文、邮箱或凭据。 */
export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly indeterminate = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
