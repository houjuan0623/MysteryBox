// 已退役直连适配器仅保留隔离回归测试；产品工厂只接受demo/vercel。
import { OpenAiProvider } from "./ai";
// Reconstructed focused tests from retained source; fake fetch only, never live credentials.
import assert from "node:assert/strict";
import test from "node:test";
import type { Box, Tool } from "@mysterybox/shared";
import {
  createProviders,
  DemoAiProvider,
  DemoPaymentProvider,
  PayPalProvider,
  ProviderError,
  ResendEmailProvider,
  VercelAiProvider,
  validateGeneratedBox,
  validatePayPalOrder,
} from "./index";
import type { GenerateInput, InspectInput, ProviderConfig } from "./index";
import { renderBoxEmail } from "./email";
const tools: Tool[] = ["first", "second", "third"].map((id, index) => ({
  id,
  name: `Tool ${index + 1}`,
  tagline: "Draft a practical outline.",
  description: "A curated testing tool.",
  category: "Writing",
  interests: ["creator"],
  website: `https://example.com/${id}`,
  pricingNote: "Check official pricing; third-party costs are separate.",
  sourceUrl: "https://example.com/",
  reviewedAt: null,
  capabilities: ["Draft an outline"],
  caveat: "Review the output yourself.",
}));
const input: GenerateInput = {
  id: "box-1",
  interest: "creator",
  tier: "free",
  goal: "Create a short video outline.",
  tools,
};
const config: ProviderConfig = {
  aiMode: "demo",
  paymentMode: "demo",
  emailMode: "demo",
};
const live: ProviderConfig = {
  ...config,
  openaiApiKey: "unit-test-only",
  openaiModel: "test-model",
  paypalClientId: "test-client",
  paypalClientSecret: "unit-test-only",
  paypalMerchantId: "MERCHANT1",
  paypalMode: "sandbox",
  paypalWebhookId: "WH-TEST",
  resendApiKey: "unit-test-only",
  resendFrom: "MysteryBox <hello@example.com>",
  appUrl: "https://example.com",
  timeoutMs: 1000,
};
type Call = { url: string; init: RequestInit };
type Reply = unknown | ((call: Call) => unknown | Promise<unknown>);
function fakeFetch(...replies: Reply[]): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    assert.ok(replies.length, `Unexpected request: ${call.url}`);
    const reply = replies.shift();
    const result = typeof reply === "function" ? await reply(call) : reply;
    return result instanceof Response
      ? result
      : new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
const payload = (call: Call): any => JSON.parse(String(call.init.body));
const headers = (call: Call) => new Headers(call.init.headers);
const hasCode = (code: string, indeterminate?: boolean) => (error: unknown) =>
  error instanceof ProviderError &&
  error.code === code &&
  (indeterminate === undefined || error.indeterminate === indeterminate);
async function validGenerated() {
  const { generationMode: _, ...value } = await new DemoAiProvider().generate(input);
  return value;
}
const envelope = (value: unknown) => ({
  status: "completed",
  error: null,
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(value) }],
    },
  ],
});
const orderInput: InspectInput = {
  id: "internal-1",
  providerOrderId: "PAYPAL1",
  amountCents: 299,
  currency: "USD",
};
function order(status = "COMPLETED", captureStatus: string | null = "COMPLETED"): any {
  return {
    id: "PAYPAL1",
    status,
    purchase_units: [
      {
        custom_id: "internal-1",
        amount: { value: "2.99", currency_code: "USD" },
        payee: { merchant_id: "MERCHANT1" },
        ...(captureStatus
          ? {
              payments: {
                captures: [
                  {
                    id: "CAPTURE1",
                    status: captureStatus,
                    amount: { value: "2.99", currency_code: "USD" },
                    custom_id: "internal-1",
                  },
                ],
              },
            }
          : {}),
      },
    ],
  };
}
const token = { access_token: "unit-test-token", expires_in: 300 };
test("all demo adapters are deterministic and make zero network requests", async () => {
  let requests = 0;
  const p = createProviders(config, (async () => {
    requests++;
    throw Error("Network forbidden");
  }) as typeof fetch);
  const a = await p.ai.generate(input);
  assert.deepEqual(a, await p.ai.generate(input));
  assert.equal(a.tools.length, 1);
  assert.equal(a.generationMode, "demo");
  assert.equal((await p.ai.generate({ ...input, tier: "premium" })).tools.length, 3);
  const payment = await p.payments.create({
    ...orderInput,
    createKey: "create/1",
  });
  assert.match(payment.providerOrderId, /^DEMO-/);
  assert.equal(
    (
      await p.payments.capture({
        ...orderInput,
        ...payment,
        captureKey: "capture/1",
      })
    ).status,
    "completed",
  );
  assert.equal(
    (await p.payments.inspect({ ...orderInput, ...payment })).status,
    "pending",
  );
  assert.equal(
    (
      await p.email.sendCode({
        email: "person@example.com",
        code: "123456",
        idempotencyKey: "code/1",
      })
    ).status,
    "demo",
  );
  assert.equal(await p.payments.verifyWebhook({}, {}), false);
  assert.equal(requests, 0);
});
test("demo capture cannot be associated with another internal order", async () => {
  const p = new DemoPaymentProvider(),
    created = await p.create({ ...orderInput, createKey: "create/1" });
  await assert.rejects(
    p.capture({
      ...orderInput,
      id: "another-order",
      ...created,
      captureKey: "capture/2",
    }),
    hasCode("PAYMENT_MISMATCH"),
  );
});
test("AI rejects malicious IDs, URL fields, duplicate recommendations, and foreign workflow IDs", async () => {
  const original = await validGenerated();
  const bad = structuredClone(original);
  bad.tools[0]!.toolId = "evil-tool";
  assert.throws(() => validateGeneratedBox(bad, input), hasCode("AI_INVALID_OUTPUT"));
  const extra: any = structuredClone(original);
  extra.tools[0].website = "https://evil.example/";
  assert.throws(() => validateGeneratedBox(extra, input), hasCode("AI_INVALID_OUTPUT"));
  const link = structuredClone(original);
  link.tools[0]!.prompt += " Visit https://evil.example/.";
  assert.throws(() => validateGeneratedBox(link, input), hasCode("AI_INVALID_OUTPUT"));
  const foreign = structuredClone(original);
  foreign.workflow[0]!.toolId = tools.find((t) => t.id !== original.tools[0]!.toolId)!.id;
  assert.throws(() => validateGeneratedBox(foreign, input), hasCode("AI_INVALID_OUTPUT"));
  assert.throws(
    () =>
      validateGeneratedBox(
        {
          ...original,
          tools: [original.tools[0], original.tools[0], original.tools[0]],
        },
        { ...input, tier: "premium" },
      ),
    hasCode("AI_INVALID_OUTPUT"),
  );
});
test("OpenAI uses strict catalog schema and store false", async () => {
  const f = fakeFetch(envelope(await validGenerated()));
  assert.equal(
    (await new OpenAiProvider(live, f.fetchImpl).generate(input)).generationMode,
    "openai",
  );
  assert.equal(f.calls[0]!.url, "https://api.openai.com/v1/responses");
  const p = payload(f.calls[0]!);
  assert.equal(p.store, false);
  assert.equal(p.text.format.strict, true);
  assert.equal(p.text.format.schema.additionalProperties, false);
  assert.deepEqual(
    p.text.format.schema.properties.tools.items.properties.toolId.enum,
    tools.map((t) => t.id),
  );
  assert.equal(p.text.format.schema.properties.tools.minItems, 1);
  assert.equal(f.calls[0]!.init.redirect, "error");
});
test("OpenAI refusal, incomplete, malformed, HTTP error and timeout are explicit failures", async () => {
  const cases: [unknown, string][] = [
    [
      {
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }],
      },
      "AI_REFUSED",
    ],
    [{ status: "incomplete", output: [] }, "AI_INCOMPLETE"],
    [
      {
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "{bad" }] }],
      },
      "AI_INVALID_OUTPUT",
    ],
    [new Response("private upstream text", { status: 500 }), "AI_UNAVAILABLE"],
  ];
  for (const [response, code] of cases)
    await assert.rejects(
      new OpenAiProvider(live, fakeFetch(response).fetchImpl).generate(input),
      hasCode(code),
    );
  await assert.rejects(
    new OpenAiProvider(
      live,
      fakeFetch(() => {
        throw Error("secret-key/timeout");
      }).fetchImpl,
    ).generate(input),
    (error) =>
      hasCode("AI_UNAVAILABLE")(error) &&
      !(error as Error).message.includes("secret-key"),
  );
});
test("Vercel uses fixed Responses endpoint, gateway auth and provider/model ID", async () => {
  const f = fakeFetch(envelope(await validGenerated())),
    c: ProviderConfig = {
      ...config,
      aiMode: "vercel",
      gatewayApiKey: "gateway-test-only",
      gatewayModel: "openai/test-model",
    };
  assert.equal(
    (await createProviders(c, f.fetchImpl).ai.generate(input)).generationMode,
    "vercel",
  );
  assert.equal(f.calls[0]!.url, "https://ai-gateway.vercel.sh/v1/responses");
  assert.equal(headers(f.calls[0]!).get("authorization"), "Bearer gateway-test-only");
  assert.equal(payload(f.calls[0]!).model, "openai/test-model");
  assert.equal(payload(f.calls[0]!).text.format.strict, true);
  assert.equal(f.calls[0]!.init.redirect, "error");
  assert.throws(
    () =>
      new VercelAiProvider(
        { ...c, gatewayModel: "https://evil.example/model" },
        f.fetchImpl,
      ),
    hasCode("PROVIDER_NOT_CONFIGURED"),
  );
  assert.throws(
    () => new VercelAiProvider({ ...c, gatewayApiKey: undefined }, f.fetchImpl),
    hasCode("PROVIDER_NOT_CONFIGURED"),
  );
});
test("Vercel malicious output is rejected without demo fallback", async () => {
  const value = await validGenerated();
  value.tools[0]!.toolId = "unknown-tool";
  await assert.rejects(
    new VercelAiProvider(
      {
        ...config,
        gatewayApiKey: "gateway-test-only",
        gatewayModel: "openai/test-model",
      },
      fakeFetch(envelope(value)).fetchImpl,
    ).generate(input),
    hasCode("AI_INVALID_OUTPUT"),
  );
});
test("provider timeout aborts the request", async () => {
  let aborted = false;
  const f = ((_: unknown, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) =>
      init.signal!.addEventListener("abort", () => {
        aborted = true;
        reject(Error("aborted"));
      }),
    )) as typeof fetch;
  await assert.rejects(
    new OpenAiProvider({ ...live, timeoutMs: 5 }, f).generate(input),
    hasCode("AI_UNAVAILABLE"),
  );
  assert.equal(aborted, true);
});
test("real mode never silently falls back without credentials or explicit PayPal mode", () => {
  assert.throws(
    () => createProviders({ ...config, aiMode: "openai" } as unknown as ProviderConfig),
    /Only demo or Vercel/,
  );
  assert.throws(
    () => new PayPalProvider({ ...live, paypalMode: undefined }),
    hasCode("PROVIDER_NOT_CONFIGURED"),
  );
  assert.throws(
    () => new PayPalProvider({ ...live, paypalMerchantId: undefined }),
    hasCode("PROVIDER_NOT_CONFIGURED"),
  );
});
test("PayPal create controls amount/merchant/host/return and stable idempotency", async () => {
  const created = {
      id: "PAYPAL1",
      status: "PAYER_ACTION_REQUIRED",
      links: [
        {
          rel: "payer-action",
          href: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL1",
        },
      ],
    },
    f = fakeFetch(token, created, created),
    p = new PayPalProvider(live, f.fetchImpl),
    args = { ...orderInput, createKey: "create-internal-1" };
  assert.equal((await p.create(args)).providerOrderId, "PAYPAL1");
  await p.create(args);
  assert.equal(f.calls.length, 3);
  for (const call of f.calls.slice(1)) {
    assert.equal(call.url, "https://api-m.sandbox.paypal.com/v2/checkout/orders");
    assert.equal(headers(call).get("paypal-request-id"), "create-internal-1");
    assert.equal(payload(call).purchase_units[0].amount.value, "2.99");
    assert.equal(payload(call).purchase_units[0].custom_id, "internal-1");
    assert.equal(payload(call).purchase_units[0].payee.merchant_id, "MERCHANT1");
    assert.equal(
      payload(call).payment_source.paypal.experience_context.return_url,
      "https://example.com/checkout/return?order=internal-1",
    );
    assert.equal(
      payload(call).payment_source.paypal.experience_context.cancel_url,
      "https://example.com/discover?cancelled=1",
    );
  }
});
test("PayPal rejects malicious approval links", async () => {
  const f = fakeFetch(token, {
    id: "PAYPAL1",
    status: "CREATED",
    links: [{ rel: "approve", href: "https://www.paypal.com.evil.example/" }],
  });
  await assert.rejects(
    new PayPalProvider(live, f.fetchImpl).create({
      ...orderInput,
      createKey: "create/1",
    }),
    hasCode("PAYMENT_INVALID_RESPONSE", true),
  );
});
test("PayPal capture validates before charging and reads final state", async () => {
  const f = fakeFetch(
    token,
    order("APPROVED", null),
    { id: "PAYPAL1", status: "COMPLETED" },
    order(),
  );
  assert.deepEqual(
    await new PayPalProvider(live, f.fetchImpl).capture({
      ...orderInput,
      captureKey: "capture-internal-1",
    }),
    { status: "completed", captureId: "CAPTURE1" },
  );
  assert.equal(f.calls[1]!.init.method, "GET");
  assert.equal(
    f.calls[2]!.url,
    "https://api-m.sandbox.paypal.com/v2/checkout/orders/PAYPAL1/capture",
  );
  assert.equal(headers(f.calls[2]!).get("paypal-request-id"), "capture-internal-1");
  assert.equal(f.calls[3]!.init.method, "GET");
});
test("PayPal never captures unapproved or cross-order payment", async () => {
  const mismatch = order("APPROVED", null);
  mismatch.purchase_units[0].custom_id = "other-order";
  for (const [value, code] of [
    [mismatch, "PAYMENT_MISMATCH"],
    [order("CREATED", null), "PAYMENT_NOT_APPROVED"],
  ] as const) {
    const f = fakeFetch(token, value);
    await assert.rejects(
      new PayPalProvider(live, f.fetchImpl).capture({
        ...orderInput,
        captureKey: "capture/1",
      }),
      hasCode(code),
    );
    assert.equal(f.calls.length, 2);
  }
});
test("completed retries and pending captures do not charge again", async () => {
  for (const status of ["COMPLETED", "PENDING"]) {
    const f = fakeFetch(token, order("COMPLETED", status));
    assert.equal(
      (
        await new PayPalProvider(live, f.fetchImpl).capture({
          ...orderInput,
          captureKey: "capture/1",
        })
      ).status,
      status === "COMPLETED" ? "completed" : "pending",
    );
    assert.equal(f.calls.length, 2);
  }
});
test("all amount/currency/custom/merchant/order/capture mismatches fail closed", () => {
  const mutations = [
    (v: any) => {
      v.purchase_units[0].amount.value = "1.00";
    },
    (v: any) => {
      v.purchase_units[0].amount.value = "2.990";
    },
    (v: any) => {
      v.purchase_units[0].amount.currency_code = "EUR";
    },
    (v: any) => {
      v.purchase_units[0].custom_id = "another";
    },
    (v: any) => {
      v.purchase_units[0].payee.merchant_id = "ANOTHER";
    },
    (v: any) => {
      v.id = "ANOTHER";
    },
    (v: any) => {
      v.purchase_units[0].payments.captures[0].amount.value = "0.01";
    },
    (v: any) => {
      v.purchase_units[0].payments.captures[0].custom_id = "another";
    },
    (v: any) => {
      v.purchase_units[0].payments.captures.push(
        v.purchase_units[0].payments.captures[0],
      );
    },
  ];
  for (const change of mutations) {
    const v = order();
    change(v);
    assert.throws(
      () => validatePayPalOrder(v, orderInput, "MERCHANT1"),
      hasCode("PAYMENT_MISMATCH"),
    );
  }
});
test("PayPal requires COMPLETED, never refunded, declined or failed", () => {
  for (const status of ["REFUNDED", "PARTIALLY_REFUNDED", "DECLINED", "FAILED"])
    assert.throws(
      () => validatePayPalOrder(order("COMPLETED", status), orderInput, "MERCHANT1"),
      hasCode("PAYMENT_NOT_COMPLETED"),
    );
  assert.throws(
    () => validatePayPalOrder(order("APPROVED", "COMPLETED"), orderInput, "MERCHANT1"),
    hasCode("PAYMENT_NOT_COMPLETED"),
  );
  assert.deepEqual(
    validatePayPalOrder(order("APPROVED", null), orderInput, "MERCHANT1").result,
    { status: "pending", captureId: "" },
  );
});
test("capture timeout and post-capture read failure remain indeterminate", async () => {
  const f = fakeFetch(token, order("APPROVED", null), () => {
    throw Error("network timeout");
  });
  await assert.rejects(
    new PayPalProvider(live, f.fetchImpl).capture({
      ...orderInput,
      captureKey: "capture/1",
    }),
    hasCode("PAYMENT_REQUEST_FAILED", true),
  );
  assert.equal(f.calls.length, 3);
  const g = fakeFetch(
    token,
    order("APPROVED", null),
    { id: "PAYPAL1" },
    new Response("unavailable", { status: 503 }),
  );
  await assert.rejects(
    new PayPalProvider(live, g.fetchImpl).capture({
      ...orderInput,
      captureKey: "capture/1",
    }),
    hasCode("PAYMENT_UNAVAILABLE", true),
  );
});
test("inspect is read-only and rejects mismatched merchant", async () => {
  const v = order();
  v.purchase_units[0].payee.merchant_id = "ANOTHER";
  const f = fakeFetch(token, v);
  await assert.rejects(
    new PayPalProvider(live, f.fetchImpl).inspect(orderInput),
    hasCode("PAYMENT_MISMATCH"),
  );
  assert.equal(f.calls[1]!.init.method, "GET");
});
test("unsigned webhook is rejected without network", async () => {
  const f = fakeFetch();
  assert.equal(
    await new PayPalProvider(live, f.fetchImpl).verifyWebhook(
      {},
      { event_type: "PAYMENT.CAPTURE.COMPLETED" },
    ),
    false,
  );
  assert.equal(f.calls.length, 0);
});
test("webhook uses configured ID and official signature verification", async () => {
  const h = {
      "PAYPAL-AUTH-ALGO": "SHA256withRSA",
      "PAYPAL-CERT-URL":
        "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-TEST",
      "PAYPAL-TRANSMISSION-ID": "transmission-1",
      "PAYPAL-TRANSMISSION-SIG": "test-signature",
      "PAYPAL-TRANSMISSION-TIME": "2026-10-14T01:00:00Z",
    },
    event = {
      id: "EVENT1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {},
    },
    f = fakeFetch(
      token,
      { verification_status: "SUCCESS" },
      { verification_status: "FAILURE" },
    ),
    p = new PayPalProvider(live, f.fetchImpl);
  assert.equal(await p.verifyWebhook(h, event), true);
  assert.equal(
    f.calls[1]!.url,
    "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature",
  );
  assert.equal(payload(f.calls[1]!).webhook_id, "WH-TEST");
  assert.deepEqual(payload(f.calls[1]!).webhook_event, event);
  assert.equal(await p.verifyWebhook(h, event), false);
  assert.equal(
    await p.verifyWebhook(
      { ...h, "PAYPAL-CERT-URL": "https://evil.example/cert" },
      event,
    ),
    false,
  );
  assert.equal(f.calls.length, 3);
});
async function box(): Promise<Box> {
  return {
    ...(await new DemoAiProvider().generate(input)),
    id: input.id,
    interest: input.interest,
    tier: input.tier,
    createdAt: "2026-10-14T00:00:00Z",
  };
}
test("Resend escapes HTML and uses catalog links/text/fixed sender/idempotency", async () => {
  const v = await box();
  v.title = '<script>alert("bad")</script>';
  v.tools[0]!.prompt = "<img src=x onerror=alert(1)> & prompt";
  const f = fakeFetch({ id: "mail-1" }, { id: "mail-1" }),
    p = new ResendEmailProvider(live, f.fetchImpl),
    args = {
      email: "person@example.com",
      box: v,
      tools,
      idempotencyKey: "box/box-1",
    };
  assert.deepEqual(await p.sendBox(args), { status: "sent" });
  await p.sendBox(args);
  for (const call of f.calls) {
    const b = payload(call);
    assert.equal(call.url, "https://api.resend.com/emails");
    assert.equal(b.from, "MysteryBox <hello@example.com>");
    assert.deepEqual(b.to, ["person@example.com"]);
    assert.equal(headers(call).get("idempotency-key"), "box/box-1");
    assert.ok(!b.html.includes("<script>"));
    assert.ok(!b.html.includes("<img src=x"));
    assert.ok(b.html.includes("&lt;script&gt;"));
    assert.ok(b.text.includes("YOUR WORKFLOW"));
    assert.ok(b.html.includes("third-party costs are separate"));
  }
});
test("Resend failures do not claim sent or leak upstream data", async () => {
  const f = fakeFetch(new Response("secret/private upstream detail", { status: 500 }));
  await assert.rejects(
    new ResendEmailProvider(live, f.fetchImpl).sendCode({
      email: "person@example.com",
      code: "123456",
      idempotencyKey: "code/1",
    }),
    (error) =>
      hasCode("EMAIL_UNAVAILABLE", true)(error) &&
      !(error as Error).message.includes("secret"),
  );
  await assert.rejects(
    new ResendEmailProvider(live, fakeFetch({ error: "failed" }).fetchImpl).sendCode({
      email: "person@example.com",
      code: "123456",
      idempotencyKey: "code/1",
    }),
    hasCode("EMAIL_INVALID_RESPONSE", true),
  );
});
test("invalid email/code/sender/catalog links are rejected before sending", async () => {
  const f = fakeFetch(),
    p = new ResendEmailProvider(live, f.fetchImpl);
  await assert.rejects(
    p.sendCode({
      email: "person@example.com\nBcc:other@example.com",
      code: "123456",
      idempotencyKey: "code/1",
    }),
    hasCode("INVALID_EMAIL"),
  );
  await assert.rejects(
    p.sendCode({
      email: "person@example.com",
      code: "<bad>",
      idempotencyKey: "code/1",
    }),
    hasCode("INVALID_CODE"),
  );
  assert.throws(
    () =>
      new ResendEmailProvider(
        { ...live, resendFrom: "hello@example.com\nBcc:x@example.com" },
        f.fetchImpl,
      ),
    hasCode("PROVIDER_NOT_CONFIGURED"),
  );
  const v = await box();
  assert.throws(
    () =>
      renderBoxEmail({
        email: "person@example.com",
        box: v,
        tools: tools.map((t) => ({ ...t, website: "javascript:alert(1)" })),
        idempotencyKey: "box/1",
      }),
    hasCode("INVALID_CATALOG_URL"),
  );
  assert.equal(f.calls.length, 0);
});
test("raw webhook JSON is preserved in verification and mismatched raw body is rejected", async () => {
  const h = {
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url":
        "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-TEST",
      "paypal-transmission-id": "transmission-1",
      "paypal-transmission-sig": "test-signature",
      "paypal-transmission-time": "2026-10-14T01:00:00Z",
    },
    raw = '{ "id":"EVENT1", "sequence":90071992547409931234, "resource":{} }',
    body = JSON.parse(raw),
    f = fakeFetch(token, { verification_status: "SUCCESS" }),
    p = new PayPalProvider(live, f.fetchImpl);
  assert.equal(await p.verifyWebhook(h, body, raw), true);
  assert.ok(String(f.calls[1]!.init.body).includes(raw));
  assert.equal(await p.verifyWebhook(h, body, '{"id":"OTHER"}'), false);
  assert.equal(await p.verifyWebhook(h, body, "{bad"), false);
  assert.equal(f.calls.length, 2);
});
