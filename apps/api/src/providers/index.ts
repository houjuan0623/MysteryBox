import { DemoAiProvider, OpenAiProvider, VercelAiProvider } from "./ai";
import { DemoEmailProvider, ResendEmailProvider } from "./email";
import { DemoPaymentProvider, PayPalProvider } from "./paypal";
import type {
  AiProvider,
  EmailProvider,
  PaymentProvider,
  ProviderConfig,
} from "./contracts";
export * from "./contracts";
export {
  DemoAiProvider,
  OpenAiProvider,
  VercelAiProvider,
  validateGeneratedBox,
} from "./ai";
export { DemoEmailProvider, ResendEmailProvider } from "./email";
export {
  DemoPaymentProvider,
  PayPalProvider,
  validatePayPalOrder,
} from "./paypal";
/** 明确选择模式，不因密钥缺失静默退回模拟成功。 */
export function createProviders(
  config: ProviderConfig,
  fetchImpl: typeof fetch = fetch,
): { ai: AiProvider; payments: PaymentProvider; email: EmailProvider } {
  return {
    ai:
      config.aiMode === "demo"
        ? new DemoAiProvider()
        : config.aiMode === "vercel"
          ? new VercelAiProvider(config, fetchImpl)
          : new OpenAiProvider(config, fetchImpl),
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
