import { ProviderError } from "./contracts";
interface RequestOptions {
  fetchImpl: typeof fetch;
  timeoutMs?: number;
  code: string;
  message: string;
  mutation?: boolean;
}
export async function requestJson(
  url: string,
  init: RequestInit,
  options: RequestOptions,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 25_000,
  );
  try {
    // 不跟随重定向，认证头不得发往未经选择的主机。
    const response = await options.fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderError(
        options.code,
        options.message,
        Boolean(
          options.mutation &&
          (response.status >= 500 || response.status === 408),
        ),
      );
    }
    if (!response.body)
      throw new ProviderError(
        options.code,
        options.message,
        Boolean(options.mutation),
      );
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1_048_576) {
        await reader.cancel();
        throw new ProviderError(
          options.code,
          options.message,
          Boolean(options.mutation),
        );
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      options.code,
      options.message,
      Boolean(options.mutation),
    );
  } finally {
    clearTimeout(timer);
  }
}
export function required(value: string | undefined, name: string): string {
  if (!value?.trim())
    throw new ProviderError(
      "PROVIDER_NOT_CONFIGURED",
      `${name} is not configured.`,
    );
  return value;
}
export function stableKey(value: string, maximum: number): string {
  if (!/^[A-Za-z0-9_:/.-]+$/.test(value) || value.length > maximum)
    throw new ProviderError(
      "INVALID_IDEMPOTENCY_KEY",
      "The request identifier is invalid.",
    );
  return value;
}
