import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MysteryBoxService } from "../apps/api/src/domain";
import { MemoryStore } from "../apps/api/src/store";
import type { Config } from "../apps/api/src/config";
import { createProviders } from "../apps/api/src/providers";
import { briefSchema, INTERESTS } from "../packages/shared/src";
import type { BoxResponse, Interest } from "../packages/shared/src";
import {
  assertLiveTestApproved,
  LiveBudgetGuard,
  LIVE_MODEL,
  MAX_ATTEMPTS,
  MAX_NANO_USD,
  nanoUsdToUsd,
  SmokeGuardError,
} from "./live-smoke-budget";
// 重建版本；真实请求仍受代码审核门禁约束，不能由命令行或环境变量解除。
const GOALS: Record<Interest, string> = {
  creator:
    "Create a 60-second public-interest video explaining how a bicycle works, using only original or public-domain material.",
  developer:
    "Plan a tiny local task-list app with TypeScript, a test checklist, and no personal data or external accounts.",
  student:
    "Study the water cycle from public textbook material, compare explanations, and make a self-test without doing graded work.",
  business:
    "Draft a one-page plan for a fictional neighborhood book swap using invented quantities and no customer information.",
};
type Check = {
  name: string;
  status: "passed" | "failed" | "skipped";
  category?: Interest;
  tier?: "free" | "premium";
  recommendationCount?: number;
  code?: string;
};
function safeCode(error: unknown): string {
  if (error instanceof SmokeGuardError) return error.code;
  if (error instanceof assert.AssertionError) return "ASSERTION_FAILED";
  const code =
    typeof error === "object" && error && "code" in error
      ? error.code
      : undefined;
  return typeof code === "string" &&
    /^(?:GENERATION_FAILED|PAYMENT_PENDING|PAYMENT_MODE|INVALID_CODE|BOX_NOT_FOUND|ORDER_NOT_FOUND|EMAIL_UNAVAILABLE)$/.test(
      code,
    )
    ? code
    : "SMOKE_FAILED";
}
async function run(): Promise<void> {
  assertLiveTestApproved();
  if (process.argv.includes("--preflight")) {
    process.stdout.write(
      `Ready: ${LIVE_MODEL}; no more than ${MAX_ATTEMPTS} attempts and $${nanoUsdToUsd(MAX_NANO_USD)} for the retained ledger. Payments and email remain simulated.\n`,
    );
    return;
  }
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key?.trim())
    throw new SmokeGuardError("CREDENTIAL_MISSING_NO_NETWORK_REQUESTS");
  delete process.env.AI_GATEWAY_API_KEY;
  const root = path.resolve(__dirname, ".."),
    startedAt = new Date().toISOString(),
    runId = randomUUID();
  const guard = new LiveBudgetGuard(
      path.join(root, ".local/live-budget.json"),
      runId,
      fetch,
    ),
    initialAttempts = guard.snapshot().attempts.length,
    checks: Check[] = [];
  const config: Config = {
    production: false,
    port: 4000,
    mongoDb: "mysterybox_live_smoke",
    proxySecret: randomBytes(32).toString("hex"),
    sessionSecret: randomBytes(32).toString("hex"),
    appUrl: "http://localhost:3000",
    adminAppUrl: "http://localhost:3001",
    premiumPriceCents: 299,
    currency: "USD",
    freeLimit: 50,
    aiMode: "vercel",
    gatewayApiKey: key,
    gatewayModel: LIVE_MODEL,
    paymentMode: "demo",
    emailMode: "demo",
    timeoutMs: 45_000,
  };
  const store = new MemoryStore(),
    service = new MysteryBoxService(
      config,
      store,
      createProviders(config, guard.fetch),
    );
  let failed = false,
    completedBoxes = 0;
  const record = async (name: string, action: () => Promise<void>) => {
    try {
      await action();
      checks.push({ name, status: "passed" });
    } catch (error) {
      checks.push({ name, status: "failed", code: safeCode(error) });
      failed = true;
      throw error;
    }
  };
  try {
    await store.ready();
    const login = async (email: string) => {
      const challenge = await service.requestCode(email);
      assert.ok(challenge.developmentCode);
      return service.verifyCode(
        challenge.challengeId,
        challenge.developmentCode,
      );
    };
    const a = await login("synthetic-a@example.com"),
      b = await login("synthetic-b@example.com");
    checks.push({
      name: "Synthetic accounts through demo email codes",
      status: "passed",
    });
    let first: BoxResponse | undefined;
    for (const interest of INTERESTS)
      for (const tier of ["free", "premium"] as const) {
        const brief = briefSchema.parse({
            interest,
            goal: GOALS[interest],
            email: "synthetic-a@example.com",
            emailConsent: true,
          }),
          idempotencyKey = randomUUID(),
          before = guard.snapshot().attempts.length;
        try {
          let result: BoxResponse, repeat: () => Promise<BoxResponse>;
          if (tier === "free") {
            result = await service.free(brief, idempotencyKey, a.user);
            repeat = () => service.free(brief, idempotencyKey, a.user);
          } else {
            const checkout = await service.createOrder(
              brief,
              idempotencyKey,
              a.user,
            );
            assert.equal(checkout.demo, true);
            assert.match(checkout.paypalOrderId, /^DEMO-/);
            const same = await service.createOrder(
              brief,
              idempotencyKey,
              a.user,
            );
            assert.equal(same.orderId, checkout.orderId);
            result = await service.captureOrder(
              checkout.orderId,
              checkout.accessToken,
              a.user,
              true,
            );
            repeat = () =>
              service.captureOrder(
                checkout.orderId,
                checkout.accessToken,
                a.user,
                true,
              );
          }
          assert.equal(guard.snapshot().attempts.length, before + 1);
          assert.equal(result.box.generationMode, "vercel");
          assert.equal(result.box.interest, interest);
          assert.equal(result.box.tier, tier);
          assert.equal(result.box.tools.length, tier === "free" ? 1 : 3);
          assert.equal(result.emailStatus, "demo");
          assert.ok(result.box.workflow.length >= 2);
          completedBoxes++;
          first ??= result;
          const count = guard.snapshot().attempts.length,
            repeated = await Promise.all([repeat(), repeat()]);
          assert.ok(repeated.every((item) => item.box.id === result.box.id));
          assert.equal(guard.snapshot().attempts.length, count);
          checks.push({
            name: `${interest} ${tier} generation and same-key idempotence`,
            status: "passed",
            category: interest,
            tier,
            recommendationCount: result.box.tools.length,
          });
          process.stdout.write(
            `${interest} ${tier}: passed (${result.box.tools.length} recommendations; repeated requests made no extra AI call).\n`,
          );
        } catch (error) {
          checks.push({
            name: `${interest} ${tier} generation and same-key idempotence`,
            status: "failed",
            category: interest,
            tier,
            code: safeCode(error),
          });
          failed = true;
          throw error;
        }
      }
    await record("History and account isolation", async () => {
      assert.equal((await service.history(a.user)).length, completedBoxes);
      assert.equal((await service.history(b.user)).length, 0);
      await assert.rejects(service.readBox(first!.box.id, undefined, b.user));
    });
    await record("Favorites isolation and remove", async () => {
      const toolId = first!.box.tools[0]!.toolId;
      await service.favorite(a.user, toolId, true);
      assert.deepEqual(await service.favorites(a.user), [toolId]);
      assert.deepEqual(await service.favorites(b.user), []);
      await service.favorite(a.user, toolId, false);
      assert.deepEqual(await service.favorites(a.user), []);
    });
    await record("Logout clears synthetic session", async () => {
      assert.equal((await service.userFromSession(a.token))?.id, a.user.id);
      await service.logout(a.token);
      assert.equal(await service.userFromSession(a.token), undefined);
    });
    await record("Exactly eight actual AI calls", async () =>
      assert.equal(guard.snapshot().attempts.length - initialAttempts, 8),
    );
  } catch (error) {
    failed = true;
    if (!checks.some((c) => c.status === "failed"))
      checks.push({
        name: "Smoke setup",
        status: "failed",
        code: safeCode(error),
      });
    process.stderr.write(
      `Live smoke stopped: ${safeCode(error)}. No automatic retry or fallback.\n`,
    );
  } finally {
    for (const category of INTERESTS)
      for (const tier of ["free", "premium"] as const)
        if (!checks.some((c) => c.category === category && c.tier === tier))
          checks.push({
            name: `${category} ${tier} generation and same-key idempotence`,
            status: "skipped",
            category,
            tier,
          });
    const ledger = guard.snapshot(),
      sum = ledger.attempts.reduce((total, a) => total + a.chargedNanoUsd, 0),
      attempts = ledger.attempts.filter((a) => a.runId === runId);
    const report = {
      version: 1,
      runId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: failed ? "failed" : "passed",
      model: LIVE_MODEL,
      paymentMode: "demo",
      emailMode: "demo",
      realPaymentsAttempted: false,
      realEmailsAttempted: false,
      syntheticDataOnly: true,
      scope:
        "In-process backend service; does not validate HTTP transport, UI, real payments, or delivery.",
      budget: {
        maximumAttempts: MAX_ATTEMPTS,
        maximumUsd: nanoUsdToUsd(MAX_NANO_USD),
        totalAttempts: ledger.attempts.length,
        thisRunAttempts: attempts.length,
        totalReservedOrSettledUsd: nanoUsdToUsd(sum),
        remainingUsd: nanoUsdToUsd(MAX_NANO_USD - sum),
        unknownUsageReservationsRetained: ledger.attempts.filter(
          (a) => a.state !== "succeeded",
        ).length,
      },
      usage: attempts.map(
        ({
          number,
          state,
          httpStatus,
          inputTokens,
          outputTokens,
          reservedNanoUsd,
          chargedNanoUsd,
        }) => ({
          number,
          state,
          httpStatus,
          inputTokens,
          outputTokens,
          reservedUsd: nanoUsdToUsd(reservedNanoUsd),
          chargedOrReservedUsd: nanoUsdToUsd(chargedNanoUsd),
        }),
      ),
      checks,
    };
    try {
      const directory = path.join(root, "docs/qa");
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        path.join(directory, "live-smoke.json"),
        JSON.stringify(report, null, 2) + "\n",
      );
      writeFileSync(
        path.join(directory, "live-smoke.md"),
        `# Live AI smoke test\n\nStatus: **${report.status}**\n\nModel: ${LIVE_MODEL}\n\n${report.scope}\n\nAll prompts and accounts were synthetic. Payments and email were simulated. No credentials, account identifiers, session tokens, or generated text are retained.\n\n## Budget\n\n- This run: ${attempts.length} actual requests\n- Retained ledger: ${ledger.attempts.length}/${MAX_ATTEMPTS} attempts\n- Settled or conservatively reserved: $${nanoUsdToUsd(sum)} of $1\n- This is a token-price estimate, not proof of free-credit funding or a billing statement.\n\n## Checks\n\n${checks.map((c) => `- ${c.status.toUpperCase()}: ${c.name}${c.code ? ` (${c.code})` : ""}`).join("\n")}\n`,
      );
      process.stdout.write(
        `Report saved. This run: ${attempts.length} requests. Retained budget used/reserved: $${nanoUsdToUsd(sum)} of $1.\n`,
      );
    } finally {
      await store.close();
      guard.close();
      config.gatewayApiKey = undefined;
    }
  }
  if (failed) process.exitCode = 1;
}
void run().catch((error) => {
  process.stderr.write(`${safeCode(error)}. No new requests will be made.\n`);
  process.exitCode = 1;
});
