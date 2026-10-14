import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
// 重建自保留源文本；此处旧待审核模型不表示现在可用或已批准，全部执行门禁仍关闭。
export const LIVE_MODEL = "openai/gpt-5.4-mini";
export const LIVE_ENDPOINT = "https://ai-gateway.vercel.sh/v1/responses";
export const MAX_ATTEMPTS = 20;
export const MAX_OUTPUT_TOKENS = 5000;
export const MAX_NANO_USD = 1_000_000_000;
export const INPUT_NANO_USD_PER_TOKEN = 750;
export const OUTPUT_NANO_USD_PER_TOKEN = 4500;
export const LIVE_TEST_APPROVAL = Object.freeze({
  freeCreditEligibilityVerified: false,
  paidUsagePrevented: false,
  liveExecutionApproved: false,
});
export class SmokeGuardError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SmokeGuardError";
  }
}
export function assertLiveTestApproved(): void {
  if (
    !LIVE_TEST_APPROVAL.freeCreditEligibilityVerified ||
    !LIVE_TEST_APPROVAL.paidUsagePrevented ||
    !LIVE_TEST_APPROVAL.liveExecutionApproved
  )
    throw new SmokeGuardError(
      "BLOCKED_FREE_CREDIT_AND_NO_PAID_USAGE_VERIFICATION_REQUIRED",
    );
}
function projectRoot(): string {
  let directory = __dirname;
  for (let depth = 0; depth < 12; depth++) {
    const manifest = path.join(directory, "package.json");
    if (existsSync(manifest)) {
      try {
        if (JSON.parse(readFileSync(manifest, "utf8")).name === "mysterybox")
          return directory;
      } catch {
        /*损坏的文件不能重置预算*/
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new SmokeGuardError("PROJECT_ROOT_NOT_FOUND");
}
export function createGuardedFetch(): LiveBudgetGuard {
  assertLiveTestApproved();
  return new LiveBudgetGuard(
    path.join(projectRoot(), ".local/live-budget.json"),
    randomUUID(),
    fetch,
  );
}
const attemptSchema = z
  .object({
    number: z.number().int().positive(),
    runId: z.string().uuid(),
    startedAt: z.string(),
    state: z.enum([
      "reserved",
      "succeeded",
      "usage_unavailable",
      "http_error",
      "transport_error",
    ]),
    inputUpperBound: z.number().int().nonnegative(),
    reservedNanoUsd: z.number().int().nonnegative(),
    chargedNanoUsd: z.number().int().nonnegative(),
    httpStatus: z.number().int().optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
  })
  .strict();
const ledgerSchema = z
  .object({
    version: z.literal(1),
    model: z.literal(LIVE_MODEL),
    maximumAttempts: z.literal(MAX_ATTEMPTS),
    maximumNanoUsd: z.literal(MAX_NANO_USD),
    inputNanoUsdPerToken: z.literal(INPUT_NANO_USD_PER_TOKEN),
    outputNanoUsdPerToken: z.literal(OUTPUT_NANO_USD_PER_TOKEN),
    attempts: z.array(attemptSchema).max(MAX_ATTEMPTS),
    haltReason: z
      .enum(["UPSTREAM_REJECTED", "TRANSPORT_UNCERTAIN", "USAGE_UNVERIFIED"])
      .optional(),
  })
  .strict();
export type BudgetLedger = z.infer<typeof ledgerSchema>;
export const nanoUsdToUsd = (value: number): string => (value / 1_000_000_000).toFixed(9);
function newLedger(): BudgetLedger {
  return {
    version: 1,
    model: LIVE_MODEL,
    maximumAttempts: MAX_ATTEMPTS,
    maximumNanoUsd: MAX_NANO_USD,
    inputNanoUsdPerToken: INPUT_NANO_USD_PER_TOKEN,
    outputNanoUsdPerToken: OUTPUT_NANO_USD_PER_TOKEN,
    attempts: [],
  };
}
/** 发请求前 fsync 预算预留，未知结果全额保留，失败持久化熔断；无认证头、提示词或生成内容落盘。 */
export class LiveBudgetGuard {
  private ledger: BudgetLedger;
  private closed = false;
  private readonly directory: string;
  private readonly lock: string;
  constructor(
    private readonly ledgerFile: string,
    private readonly runId: string,
    private readonly actualFetch: typeof fetch,
  ) {
    this.directory = path.dirname(ledgerFile);
    this.lock = `${ledgerFile}.lock`;
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    try {
      mkdirSync(this.lock, { mode: 0o700 });
    } catch {
      throw new SmokeGuardError("BUDGET_LOCKED");
    }
    try {
      this.ledger = existsSync(ledgerFile)
        ? ledgerSchema.parse(JSON.parse(readFileSync(ledgerFile, "utf8")))
        : newLedger();
      if (
        this.ledger.attempts.some(
          (a, i) =>
            a.number !== i + 1 ||
            a.chargedNanoUsd > a.reservedNanoUsd ||
            a.reservedNanoUsd !==
              a.inputUpperBound * INPUT_NANO_USD_PER_TOKEN +
                MAX_OUTPUT_TOKENS * OUTPUT_NANO_USD_PER_TOKEN ||
            (a.state !== "succeeded" && a.chargedNanoUsd !== a.reservedNanoUsd) ||
            (a.state === "succeeded" &&
              (a.inputTokens === undefined ||
                a.outputTokens === undefined ||
                a.inputTokens > a.inputUpperBound ||
                a.outputTokens > MAX_OUTPUT_TOKENS ||
                a.chargedNanoUsd !==
                  a.inputTokens * INPUT_NANO_USD_PER_TOKEN +
                    a.outputTokens * OUTPUT_NANO_USD_PER_TOKEN)),
        ) ||
        this.spent() > MAX_NANO_USD
      )
        throw new Error("Invalid ledger");
      this.persist();
    } catch {
      rmdirSync(this.lock);
      throw new SmokeGuardError("BUDGET_LEDGER_INVALID");
    }
  }
  private persist(): void {
    const temporary = `${this.ledgerFile}.pending`,
      fd = openSync(temporary, "w", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(this.ledger, null, 2));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, this.ledgerFile);
    const dirFd = openSync(this.directory, "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  }
  private spent(): number {
    return this.ledger.attempts.reduce((sum, a) => sum + a.chargedNanoUsd, 0);
  }
  snapshot(): BudgetLedger {
    return structuredClone(this.ledger);
  }
  close(): void {
    if (!this.closed) {
      rmdirSync(this.lock);
      this.closed = true;
    }
  }
  readonly fetch: typeof fetch = (async (
    url: string | URL | Request,
    init: RequestInit = {},
  ) => {
    if (this.closed) throw new SmokeGuardError("BUDGET_CLOSED");
    if (this.ledger.haltReason)
      throw new SmokeGuardError(`${this.ledger.haltReason}_TEST_HALTED`);
    if (
      typeof url !== "string" ||
      url !== LIVE_ENDPOINT ||
      init.method !== "POST" ||
      init.redirect !== "error" ||
      typeof init.body !== "string"
    )
      throw new SmokeGuardError("ENDPOINT_NOT_ALLOWED");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      throw new SmokeGuardError("INVALID_REQUEST_BODY");
    }
    if (
      body.model !== LIVE_MODEL ||
      body.max_output_tokens !== MAX_OUTPUT_TOKENS ||
      body.store !== false ||
      body.stream === true ||
      body.providerOptions ||
      body.tools ||
      body.previous_response_id
    )
      throw new SmokeGuardError("REQUEST_NOT_ALLOWED");
    const auth = new Headers(init.headers).get("authorization");
    if (!auth?.startsWith("Bearer ") || auth.length < 8)
      throw new SmokeGuardError("CREDENTIAL_MISSING");
    const inputUpperBound = Buffer.byteLength(init.body, "utf8"),
      reservation =
        inputUpperBound * INPUT_NANO_USD_PER_TOKEN +
        MAX_OUTPUT_TOKENS * OUTPUT_NANO_USD_PER_TOKEN;
    if (!Number.isSafeInteger(reservation) || this.ledger.attempts.length >= MAX_ATTEMPTS)
      throw new SmokeGuardError("ATTEMPT_LIMIT");
    if (this.spent() + reservation > MAX_NANO_USD)
      throw new SmokeGuardError("BUDGET_LIMIT");
    const attempt: BudgetLedger["attempts"][number] = {
      number: this.ledger.attempts.length + 1,
      runId: this.runId,
      startedAt: new Date().toISOString(),
      state: "reserved",
      inputUpperBound,
      reservedNanoUsd: reservation,
      chargedNanoUsd: reservation,
    };
    this.ledger.attempts.push(attempt);
    this.persist();
    let response: Response;
    try {
      response = await this.actualFetch(url, init);
    } catch {
      attempt.state = "transport_error";
      this.ledger.haltReason = "TRANSPORT_UNCERTAIN";
      this.persist();
      throw new SmokeGuardError("TRANSPORT_FAILED_RESERVATION_HELD");
    }
    attempt.httpStatus = response.status;
    if (!response.ok) {
      attempt.state = "http_error";
      this.ledger.haltReason = "UPSTREAM_REJECTED";
      this.persist();
      return response;
    }
    try {
      const reader = response.clone().body?.getReader();
      if (!reader) throw new Error("No usage");
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 1_048_576) {
          void reader.cancel();
          throw new Error("Oversized response");
        }
        chunks.push(value);
      }
      const usage = z
        .object({
          usage: z.object({
            input_tokens: z.number().int().nonnegative(),
            output_tokens: z.number().int().nonnegative(),
          }),
        })
        .parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))).usage;
      const actual =
        usage.input_tokens * INPUT_NANO_USD_PER_TOKEN +
        usage.output_tokens * OUTPUT_NANO_USD_PER_TOKEN;
      if (
        usage.input_tokens > inputUpperBound ||
        usage.output_tokens > MAX_OUTPUT_TOKENS ||
        actual > reservation ||
        !Number.isSafeInteger(actual)
      )
        throw new Error("Usage outside reservation");
      attempt.state = "succeeded";
      attempt.chargedNanoUsd = actual;
      attempt.inputTokens = usage.input_tokens;
      attempt.outputTokens = usage.output_tokens;
    } catch {
      attempt.state = "usage_unavailable";
      this.ledger.haltReason = "USAGE_UNVERIFIED";
    }
    this.persist();
    return response;
  }) as typeof fetch;
}
