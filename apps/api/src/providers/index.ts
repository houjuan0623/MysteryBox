import { DemoAiProvider, VercelAiProvider } from "./ai";
import { DemoEmailProvider, ResendEmailProvider } from "./email";
import { DemoPaymentProvider, PayPalProvider } from "./paypal";
import type {
  AiProvider,
  EmailProvider,
  PaymentProvider,
  ProviderConfig,
} from "./contracts";
export * from "./contracts";
export { DemoAiProvider, VercelAiProvider, validateGeneratedBox } from "./ai";
export { DemoEmailProvider, ResendEmailProvider } from "./email";
export { DemoPaymentProvider, PayPalProvider, validatePayPalOrder } from "./paypal";
/** 明确选择模式，不因密钥缺失静默退回模拟成功。 */
export function createProviders(
  config: ProviderConfig,
  fetchImpl: typeof fetch = fetch,
): { ai: AiProvider; payments: PaymentProvider; email: EmailProvider } {
  if (!["demo", "vercel"].includes(config.aiMode))
    throw new Error("Only demo or Vercel AI Gateway is supported by the application");
  return {
    ai:
      config.aiMode === "demo"
        ? new DemoAiProvider()
        : new VercelAiProvider(config, fetchImpl),
    payments:
      config.paymentMode === "demo"
        ? new DemoPaymentProvider()
        : new PayPalProvider(config, fetchImpl),
    email:
      config.emailMode === "demo"
        ? new DemoEmailProvider()
        : new ResendEmailProvider(config, fetchImpl),
  };
}
