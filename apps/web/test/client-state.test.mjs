import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
// 用浏览器存储替身验证重试规则；不访问第三方服务，不需要真实模型或支付凭据。
const analyticsSource = readFileSync(
  new URL("../lib/analytics.ts", import.meta.url),
  "utf8",
);
const analyticsCompiled = ts.transpileModule(analyticsSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const analyticsUrl = `data:text/javascript;base64,${Buffer.from(analyticsCompiled).toString("base64")}`;
const analytics = await import(analyticsUrl);
const source = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace("./analytics", analyticsUrl);
const client = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
beforeEach(() => {
  delete globalThis.window;
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
});
test("a retry retains its idempotency key; changed inputs get a new key", () => {
  const brief = {
    interest: "developer",
    goal: "Build a useful tool",
    emailConsent: false,
  };
  const first = client.requestKey("free", brief);
  assert.equal(first, client.requestKey("free", brief));
  assert.notEqual(first, client.requestKey("free", { ...brief, goal: "Another goal" }));
});
test("completed requests reset their key without dropping access tokens", () => {
  const first = client.requestKey("free", { interest: "student" });
  client.saveBox({ box: { id: "box-1" }, accessToken: "private-box-token" });
  client.clearRequestKey("free");
  assert.notEqual(first, client.requestKey("free", { interest: "student" }));
  assert.equal(client.boxTokens()["box-1"], "private-box-token");
});
test("checkout records survive client navigation within the session", () => {
  const order = {
    orderId: "order-1",
    paypalOrderId: "DEMO-1",
    accessToken: "private-order-token",
    demo: true,
    amountCents: 299,
    currency: "USD",
  };
  client.saveOrder(order);
  assert.deepEqual(client.orderRecord("order-1"), order);
  assert.equal(client.orderRecord("missing"), null);
});
test("corrupt browser state is handled without exposing or inventing a token", () => {
  sessionStorage.setItem("mysterybox:boxes", "{invalid-json");
  assert.deepEqual(client.boxTokens(), {});
});
test("API requests keep cookies same-origin and send JSON plus explicit access headers", async () => {
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  assert.deepEqual(
    await client.api("/boxes/example/email", {
      method: "POST",
      body: '{"email":"example@example.com","consent":true}',
      headers: { "x-box-token": "private" },
    }),
    { ok: true },
  );
  assert.equal(captured.url, "/api/boxes/example/email");
  assert.equal(captured.options.credentials, "same-origin");
  assert.equal(captured.options.cache, "no-store");
  assert.equal(captured.options.headers["Content-Type"], "application/json");
  assert.equal(captured.options.headers["x-box-token"], "private");
});
test("API failures preserve the service error and safely tolerate non-JSON errors", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: { code: "PAYMENT_PENDING", message: "Still pending." },
      }),
      { status: 409 },
    );
  await assert.rejects(
    client.api("/checkout/orders/example/capture"),
    (error) =>
      error.status === 409 &&
      error.code === "PAYMENT_PENDING" &&
      error.message === "Still pending.",
  );
  globalThis.fetch = async () =>
    new Response("<html>unavailable</html>", { status: 503 });
  await assert.rejects(
    client.api("/config"),
    (error) => error.status === 503 && error.message.includes("Please try again"),
  );
});
test("price formatter displays the configured one-time USD amount", () => {
  assert.equal(client.price(299), "$2.99");
  assert.equal(client.price(499), "$4.99");
});
test("catalog calendar dates do not shift in a west-of-UTC browser timezone", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    assert.equal(client.catalogDate("2026-10-14"), "Oct 14, 2026");
  } finally {
    if (previous) process.env.TZ = previous;
    else delete process.env.TZ;
  }
});

function enableAnalyticsWindow(doNotTrack = "0") {
  const preferences = new Map();
  const localStorage = {
    getItem: (key) => preferences.get(key) ?? null,
    setItem: (key, value) => preferences.set(key, value),
    removeItem: (key) => preferences.delete(key),
  };
  globalThis.window = {
    navigator: { doNotTrack },
    localStorage,
    sessionStorage,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return preferences;
}
test("analytics collapses box IDs and excludes other routes and query text", () => {
  assert.equal(analytics.analyticsPath("/box/private-box-id"), "/box");
  assert.equal(analytics.analyticsPath("/discover"), "/discover");
  assert.equal(analytics.analyticsPath("/privacy"), null);
  assert.equal(analytics.analyticsPath("/discover?goal=private"), null);
});
test("Do Not Track prevents generating any analytics visitor", () => {
  enableAnalyticsWindow("1");
  assert.equal(analytics.analyticsAllowed(), false);
  assert.equal(analytics.analyticsVisitor(), null);
  assert.equal(sessionStorage.getItem(analytics.ANALYTICS_VISITOR_KEY), null);
});
test("analytics opt-out removes the session ID and stops optional headers", async () => {
  enableAnalyticsWindow();
  const first = analytics.analyticsVisitor();
  assert.match(first, /^[\da-f-]{36}$/i);
  assert.equal(first, analytics.analyticsVisitor());
  assert.equal(analytics.setAnalyticsAllowed(false), true);
  assert.equal(analytics.analyticsVisitor(), null);
  assert.equal(sessionStorage.getItem(analytics.ANALYTICS_VISITOR_KEY), null);
  let headers;
  globalThis.fetch = async (_url, options) => {
    headers = options.headers;
    return new Response("{}", { status: 200 });
  };
  await client.api("/config");
  assert.equal(headers["x-analytics-visitor"], undefined);
});
test("enabled analytics adds only a random session UUID header to normal API calls", async () => {
  enableAnalyticsWindow();
  let headers;
  globalThis.fetch = async (_url, options) => {
    headers = options.headers;
    return new Response("{}", { status: 200 });
  };
  await client.api("/config");
  assert.match(headers["x-analytics-visitor"], /^[\da-f-]{36}$/i);
});

test("analytics server snapshot is unknown until the browser preference is read", () => {
  assert.equal(analytics.analyticsServerSnapshot(), "loading");
  assert.equal(analytics.analyticsPreference(), "loading");
  assert.equal(analytics.analyticsAllowed(), false);
  enableAnalyticsWindow();
  assert.equal(analytics.analyticsPreference(), "enabled");
  analytics.setAnalyticsAllowed(false);
  assert.equal(analytics.analyticsPreference(), "disabled");
});
test("reading a saved opt-out clears a stale session visitor", () => {
  const preferences = enableAnalyticsWindow();
  assert.ok(analytics.analyticsVisitor());
  preferences.set(analytics.ANALYTICS_PREFERENCE_KEY, "off");
  assert.equal(analytics.analyticsVisitor(), null);
  assert.equal(sessionStorage.getItem(analytics.ANALYTICS_VISITOR_KEY), null);
});
test("Do Not Track changes clear a visitor created earlier in the session", () => {
  enableAnalyticsWindow();
  assert.ok(analytics.analyticsVisitor());
  window.navigator.doNotTrack = "1";
  assert.equal(analytics.analyticsPreference(), "do-not-track");
  assert.equal(analytics.analyticsVisitor(), null);
  assert.equal(sessionStorage.getItem(analytics.ANALYTICS_VISITOR_KEY), null);
});
test("unavailable preference storage fails closed", () => {
  enableAnalyticsWindow();
  window.localStorage.getItem = () => {
    throw new Error("Storage unavailable");
  };
  assert.equal(analytics.analyticsPreference(), "unavailable");
  assert.equal(analytics.analyticsVisitor(), null);
});
test("an opt-out stops this tab even when saving the preference fails", async () => {
  enableAnalyticsWindow();
  assert.ok(analytics.analyticsVisitor());
  window.localStorage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  assert.equal(analytics.setAnalyticsAllowed(false), false);
  assert.equal(analytics.analyticsAllowed(), false);
  assert.equal(analytics.analyticsVisitor(), null);
  assert.equal(sessionStorage.getItem(analytics.ANALYTICS_VISITOR_KEY), null);
  let headers;
  globalThis.fetch = async (_url, options) => {
    headers = options.headers;
    return new Response("{}", { status: 200 });
  };
  await client.api("/config");
  assert.equal(headers["x-analytics-visitor"], undefined);
});
