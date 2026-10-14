import { z } from "zod";
import type {
  EmailProvider,
  EmailResult,
  ProviderConfig,
  SendBoxInput,
  SendCodeInput,
} from "./contracts";
import { ProviderError } from "./contracts";
import { requestJson, required, stableKey } from "./http";
const emailSchema = z.email().max(254);
function validateDestination(email: string, idempotencyKey: string): void {
  if (!emailSchema.safeParse(email).success)
    throw new ProviderError("INVALID_EMAIL", "The email address is invalid.");
  stableKey(idempotencyKey, 256);
}
function plain(value: string): string {
  // 删除邮件正文中不可显示的控制字符，防止上游内容污染输出。
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}
export function escapeHtml(value: string): string {
  return plain(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}
function catalogUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderError("INVALID_CATALOG_URL", "A tool link could not be validated.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new ProviderError("INVALID_CATALOG_URL", "A tool link could not be validated.");
  return url.href;
}
/** HTML 和纯文本并行提供；动态内容转义，链接仅来自受维护目录。 */
export function renderBoxEmail(input: SendBoxInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { box } = input,
    catalog = new Map(input.tools.map((tool) => [tool.id, tool]));
  const sections = box.tools.map((recommendation, index) => {
    const tool = catalog.get(recommendation.toolId);
    if (!tool)
      throw new ProviderError(
        "INVALID_CATALOG_TOOL",
        "A recommended tool could not be validated.",
      );
    const url = catalogUrl(tool.website);
    return {
      html: `<section><h2>${index + 1}. ${escapeHtml(tool.name)}</h2><p>${escapeHtml(recommendation.why)}</p><p><strong>Try this:</strong> ${escapeHtml(recommendation.useCase)}</p><p><strong>Starter prompt or planning brief:</strong></p><p style="white-space:pre-wrap">${escapeHtml(recommendation.prompt)}</p><ol>${recommendation.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol><p><a href="${escapeHtml(url)}">Open ${escapeHtml(tool.name)}</a></p><p>${escapeHtml(tool.pricingNote)} ${escapeHtml(tool.caveat)}</p></section>`,
      text: `${index + 1}. ${plain(tool.name)}\n${plain(recommendation.why)}\nTry this: ${plain(recommendation.useCase)}\nStarter prompt or planning brief:\n${plain(recommendation.prompt)}\n${recommendation.steps.map((step, i) => `${i + 1}) ${plain(step)}`).join("\n")}\nOpen tool: ${url}\n${plain(tool.pricingNote)} ${plain(tool.caveat)}`,
    };
  });
  const disclosure = `${box.generationMode === "demo" ? "This is a curated demo box. " : ""}Recommendations are guidance, not an automated integration. Tool accounts, subscriptions, and usage fees are separate. Check current plans on each official site.`;
  return {
    subject: "Your MysteryBox is ready",
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;line-height:1.6;color:#232323;max-width:640px;margin:auto;padding:24px"><p>MYSTERYBOX</p><h1>${escapeHtml(box.title)}</h1><p>${escapeHtml(box.summary)}</p>${sections.map((s) => s.html).join("")}<h2>Your workflow</h2><ol>${box.workflow.map((step) => `<li><strong>${escapeHtml(step.title)}</strong><br>${escapeHtml(step.description)}</li>`).join("")}</ol><p>${escapeHtml(disclosure)}</p><p>Keep this email private. You received it because you requested a MysteryBox email.</p></body></html>`,
    text: `MYSTERYBOX\n\n${plain(box.title)}\n${plain(box.summary)}\n\n${sections.map((s) => s.text).join("\n\n")}\n\nYOUR WORKFLOW\n${box.workflow.map((step, i) => `${i + 1}. ${plain(step.title)}: ${plain(step.description)}`).join("\n")}\n\n${disclosure}\nKeep this email private. You received it because you requested a MysteryBox email.`,
  };
}
export class DemoEmailProvider implements EmailProvider {
  async sendBox(input: SendBoxInput): Promise<EmailResult> {
    validateDestination(input.email, input.idempotencyKey);
    return { status: "demo" };
  }
  async sendCode(input: SendCodeInput): Promise<EmailResult> {
    validateDestination(input.email, input.idempotencyKey);
    return { status: "demo" };
  }
}
export class ResendEmailProvider implements EmailProvider {
  private readonly key: string;
  private readonly from: string;
  constructor(
    private readonly config: ProviderConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.key = required(config.resendApiKey, "Resend API key");
    this.from = required(config.resendFrom, "Resend sender address");
    const address = this.from.match(/^[^<>\r\n]+<([^<>\r\n]+)>$/)?.[1] ?? this.from;
    if (/[\r\n]/.test(this.from) || !emailSchema.safeParse(address).success)
      throw new ProviderError(
        "PROVIDER_NOT_CONFIGURED",
        "Resend sender address is invalid.",
      );
  }
  private async send(
    email: string,
    idempotencyKey: string,
    content: { subject: string; html: string; text: string },
  ): Promise<EmailResult> {
    validateDestination(email, idempotencyKey);
    const raw = await requestJson(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ from: this.from, to: [email], ...content }),
      },
      {
        fetchImpl: this.fetchImpl,
        timeoutMs: this.config.timeoutMs,
        code: "EMAIL_UNAVAILABLE",
        message:
          "The email could not be confirmed as sent. Your box is still available here.",
        mutation: true,
      },
    );
    if (!z.object({ id: z.string().min(1) }).safeParse(raw).success)
      throw new ProviderError(
        "EMAIL_INVALID_RESPONSE",
        "The email could not be confirmed as sent.",
        true,
      );
    return { status: "sent" }; // 服务商已接受，并非确认收件箱送达。
  }
  async sendBox(input: SendBoxInput): Promise<EmailResult> {
    return this.send(input.email, input.idempotencyKey, renderBoxEmail(input));
  }
  async sendCode(input: SendCodeInput): Promise<EmailResult> {
    if (!/^\d{6}$/.test(input.code))
      throw new ProviderError("INVALID_CODE", "The sign-in code is invalid.");
    return this.send(input.email, input.idempotencyKey, {
      subject: "Your MysteryBox sign-in code",
      html: `<p>Your MysteryBox sign-in code is:</p><p style="font-size:28px;letter-spacing:6px"><strong>${escapeHtml(input.code)}</strong></p><p>This code expires soon. Do not share it. If you did not request it, you can ignore this email.</p>`,
      text: `Your MysteryBox sign-in code is: ${input.code}\nThis code expires soon. Do not share it. If you did not request it, you can ignore this email.`,
    });
  }
}
