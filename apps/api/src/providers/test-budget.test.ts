import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  assertLiveTestApproved,
  createGuardedFetch,
  INPUT_NANO_USD_PER_TOKEN,
  LIVE_ENDPOINT,
  LIVE_MODEL,
  LIVE_TEST_APPROVAL,
  LiveBudgetGuard,
  MAX_OUTPUT_TOKENS,
  OUTPUT_NANO_USD_PER_TOKEN,
  SmokeGuardError,
} from "./test-budget";
const request = (extra: Record<string, unknown> = {}): RequestInit => ({
  method: "POST",
  redirect: "error",
  headers: { Authorization: "Bearer fake-unit-test-only" },
  body: JSON.stringify({
    model: LIVE_MODEL,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
    input: "Public synthetic test only",
    ...extra,
  }),
});
const code = (value: string) => (error: unknown) =>
  error instanceof SmokeGuardError && error.code === value;
function fixture(fetchImpl: typeof fetch) {
  const directory = mkdtempSync(path.join(tmpdir(), "mysterybox-budget-test-")),
    file = path.join(directory, "budget.json"),
    guard = new LiveBudgetGuard(file, randomUUID(), fetchImpl);
  return {
    directory,
    file,
    guard,
    cleanup: () => {
      guard.close();
      rmSync(directory, { recursive: true });
    },
  };
}
test("reviewed code gate cannot be bypassed with environment flags", () => {
  const before = process.env.APP_LIVE_TEST;
  process.env.APP_LIVE_TEST = "1";
  try {
    if (Object.values(LIVE_TEST_APPROVAL).every(Boolean))
      assert.doesNotThrow(assertLiveTestApproved);
    else {
      assert.throws(
        assertLiveTestApproved,
        code("BLOCKED_FREE_CREDIT_AND_NO_PAID_USAGE_VERIFICATION_REQUIRED"),
      );
      assert.throws(
        createGuardedFetch,
        code("BLOCKED_FREE_CREDIT_AND_NO_PAID_USAGE_VERIFICATION_REQUIRED"),
      );
    }
  } finally {
    if (before === undefined) delete process.env.APP_LIVE_TEST;
    else process.env.APP_LIVE_TEST = before;
  }
});
test("reservation persists before fake transmission, omits secrets, settles verified usage", async () => {
  let file = "";
  const f = fixture((async () => {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(saved.attempts.length, 1);
    assert.equal(saved.attempts[0].state, "reserved");
    assert.ok(!readFileSync(file, "utf8").includes("fake-unit-test-only"));
    return new Response(
      JSON.stringify({
        usage: { input_tokens: 100, output_tokens: 20 },
        output: [],
      }),
    );
  }) as typeof fetch);
  file = f.file;
  try {
    await f.guard.fetch(LIVE_ENDPOINT, request());
    const a = f.guard.snapshot().attempts[0]!;
    assert.equal(a.state, "succeeded");
    assert.equal(
      a.chargedNanoUsd,
      100 * INPUT_NANO_USD_PER_TOKEN + 20 * OUTPUT_NANO_USD_PER_TOKEN,
    );
  } finally {
    f.cleanup();
  }
});
test("unknown outcomes reserve full cost across restart; concurrent guard locks fail", async () => {
  const f = fixture((async () => {
    throw Error("fake timeout private detail");
  }) as typeof fetch);
  try {
    assert.throws(
      () => new LiveBudgetGuard(f.file, randomUUID(), fetch),
      code("BUDGET_LOCKED"),
    );
    await assert.rejects(
      f.guard.fetch(LIVE_ENDPOINT, request()),
      code("TRANSPORT_FAILED_RESERVATION_HELD"),
    );
    const a = f.guard.snapshot().attempts[0]!;
    assert.equal(a.chargedNanoUsd, a.reservedNanoUsd);
    f.guard.close();
    const second = new LiveBudgetGuard(f.file, randomUUID(), fetch);
    try {
      assert.equal(second.snapshot().attempts.length, 1);
      assert.equal(second.snapshot().attempts[0]!.state, "transport_error");
      await assert.rejects(
        second.fetch(LIVE_ENDPOINT, request()),
        code("TRANSPORT_UNCERTAIN_TEST_HALTED"),
      );
    } finally {
      second.close();
    }
  } finally {
    f.cleanup();
  }
});
test("20 actual attempts is a hard limit even with minimal successful usage", async () => {
  let calls = 0;
  const f = fixture((async () => {
    calls++;
    return new Response(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 } }));
  }) as typeof fetch);
  try {
    for (let i = 0; i < 20; i++) await f.guard.fetch(LIVE_ENDPOINT, request());
    await assert.rejects(f.guard.fetch(LIVE_ENDPOINT, request()), code("ATTEMPT_LIMIT"));
    assert.equal(calls, 20);
  } finally {
    f.cleanup();
  }
});
test("$1 limit reserves worst-case tokens before sending", async () => {
  let calls = 0;
  const f = fixture((async () => {
    calls++;
    return new Response(
      JSON.stringify({ usage: { input_tokens: 500000, output_tokens: 5000 } }),
    );
  }) as typeof fetch);
  try {
    const large = request({ input: "x".repeat(500_000) });
    await f.guard.fetch(LIVE_ENDPOINT, large);
    await f.guard.fetch(LIVE_ENDPOINT, large);
    await assert.rejects(f.guard.fetch(LIVE_ENDPOINT, large), code("BUDGET_LIMIT"));
    assert.equal(calls, 2);
    assert.ok(f.guard.snapshot().attempts.every((a) => a.state === "succeeded"));
  } finally {
    f.cleanup();
  }
});
test("missing usage retains full reservation and halts further calls", async () => {
  const f = fixture((async () => new Response("{}")) as typeof fetch);
  try {
    await f.guard.fetch(LIVE_ENDPOINT, request());
    const a = f.guard.snapshot().attempts[0]!;
    assert.equal(a.state, "usage_unavailable");
    assert.equal(a.chargedNanoUsd, a.reservedNanoUsd);
    await assert.rejects(
      f.guard.fetch(LIVE_ENDPOINT, request()),
      code("USAGE_UNVERIFIED_TEST_HALTED"),
    );
  } finally {
    f.cleanup();
  }
});
test("credit or permission rejection halts UI requests and restarts", async () => {
  let calls = 0;
  const f = fixture((async () => {
    calls++;
    return new Response("private detail", { status: 402 });
  }) as typeof fetch);
  try {
    assert.equal((await f.guard.fetch(LIVE_ENDPOINT, request())).status, 402);
    await assert.rejects(
      f.guard.fetch(LIVE_ENDPOINT, request()),
      code("UPSTREAM_REJECTED_TEST_HALTED"),
    );
    f.guard.close();
    const second = new LiveBudgetGuard(f.file, randomUUID(), (async () => {
      calls++;
      return new Response("{}");
    }) as typeof fetch);
    try {
      await assert.rejects(
        second.fetch(LIVE_ENDPOINT, request()),
        code("UPSTREAM_REJECTED_TEST_HALTED"),
      );
    } finally {
      second.close();
    }
    assert.equal(calls, 1);
  } finally {
    f.cleanup();
  }
});
test("alternative endpoint/model/fallback/output limit is denied before transport", async () => {
  let calls = 0;
  const f = fixture((async () => {
    calls++;
    return new Response("{}");
  }) as typeof fetch);
  try {
    await assert.rejects(
      f.guard.fetch("https://evil.example/v1/responses", request()),
      code("ENDPOINT_NOT_ALLOWED"),
    );
    await assert.rejects(
      f.guard.fetch(LIVE_ENDPOINT, request({ model: "openai/other-model" })),
      code("REQUEST_NOT_ALLOWED"),
    );
    await assert.rejects(
      f.guard.fetch(LIVE_ENDPOINT, request({ max_output_tokens: 5001 })),
      code("REQUEST_NOT_ALLOWED"),
    );
    await assert.rejects(
      f.guard.fetch(
        LIVE_ENDPOINT,
        request({
          providerOptions: { gateway: { models: ["another/model"] } },
        }),
      ),
      code("REQUEST_NOT_ALLOWED"),
    );
    assert.equal(calls, 0);
    assert.equal(f.guard.snapshot().attempts.length, 0);
  } finally {
    f.cleanup();
  }
});
test("corrupt or changed ledger fails closed rather than resets budget", () => {
  const f = fixture(fetch);
  try {
    f.guard.close();
    const value = JSON.parse(readFileSync(f.file, "utf8"));
    value.maximumNanoUsd = 5_000_000_000;
    writeFileSync(f.file, JSON.stringify(value));
    assert.throws(
      () => new LiveBudgetGuard(f.file, randomUUID(), fetch),
      code("BUDGET_LEDGER_INVALID"),
    );
  } finally {
    f.cleanup();
  }
});
