import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readConfig } from "../src/config";
import { MysteryBoxService, type OrderRecord } from "../src/domain";
import { MemoryStore } from "../src/store";
import { createProviders } from "../src/providers";
import { requireAdmin } from "../src/authz";
import { Analytics } from "../src/analytics";
import { briefSchema } from "../../../packages/shared/src";
import {
  signClientIdentity,
  verifyClientIdentity,
} from "../../../packages/shared/src/proxy";
import { readLimitedBody, MAX_REQUEST_BYTES } from "../../../packages/shared/src/body";
const fixture = () => {
  const c = readConfig({}),
    s = new MemoryStore(),
    p = createProviders(c);
  return { c, s, p, service: new MysteryBoxService(c, s, p) };
};
test("admin authorization is enforced for guest/member and allows server role only", () => {
  assert.throws(() => requireAdmin(undefined), { code: "AUTH_REQUIRED" });
  assert.throws(() => requireAdmin({ id: "1", email: "member@example.test" }), {
    code: "ADMIN_REQUIRED",
  });
  assert.equal(
    requireAdmin({ id: "1", email: "admin@example.test", role: "admin" }).id,
    "1",
  );
});
test("production fails closed without database, strong secrets, exact HTTPS and real modes", () => {
  assert.throws(() => readConfig({ NODE_ENV: "production" }));
  assert.throws(() => readConfig({ AI_MODE: "openai" }));
  assert.throws(() => readConfig({ AI_MODE: "vercel" }));
  assert.throws(() => readConfig({ ADMIN_APP_URL: "https://admin.example/" }));
});
test("signed visitor identity rejects tampering and distinguishes visitors", () => {
  const secret = "test-secret-unique-32-characters-long";
  const a = signClientIdentity("visitor:a", secret),
    b = signClientIdentity("visitor:b", secret);
  assert.equal(verifyClientIdentity(a.payload, a.signature, secret), "visitor:a");
  assert.notEqual(a.signature, b.signature);
  assert.equal(verifyClientIdentity(a.payload, "bad", secret), undefined);
});
test("streaming body limits reject oversized chunks without Content-Length", async () => {
  const good = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(MAX_REQUEST_BYTES));
      c.close();
    },
  });
  assert.equal((await readLimitedBody(good)).byteLength, MAX_REQUEST_BYTES);
  const bad = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(MAX_REQUEST_BYTES));
      c.enqueue(new Uint8Array(1));
      c.close();
    },
  });
  await assert.rejects(readLimitedBody(bad));
});
test("persisted failed email is retried after browser closes without regenerating the box", async () => {
  const { c, s, p, service } = fixture();
  c.paymentMode = "paypal";
  p.payments.verifyWebhook = async () => true;
  p.payments.inspect = async () => ({
    status: "completed",
    captureId: "fixture-capture",
  });
  let calls = 0;
  p.email.sendBox = async () => {
    if (++calls === 1) throw Error("fake mail fail");
    return { status: "demo" };
  };
  const order = await service.createOrder(
    briefSchema.parse({
      interest: "business",
      email: "fixture@example.test",
      emailConsent: true,
    }),
    randomUUID(),
  );
  await service.webhook(
    {},
    {
      id: "event-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        supplementary_data: { related_ids: { order_id: order.paypalOrderId } },
      },
    },
  );
  await service.processEvents();
  assert.equal(calls, 1);
  const delivery = (
    await s.list<{ key: string; nextAttemptAt: number; status: string }>("deliveries")
  )[0]!;
  assert.equal(delivery.status, "failed");
  delivery.nextAttemptAt = 0;
  await s.put("deliveries", delivery.key, delivery);
  await service.processEvents();
  assert.equal(calls, 2);
  assert.equal((await s.list("boxes")).length, 1);
  assert.equal(
    (await s.get<OrderRecord>("orders", order.orderId))?.generationStatus,
    "ready",
  );
});
test("concurrent automatic email retries respect attempts and stale cutoff", async () => {
  const { s, p, service } = fixture();
  let count = 0;
  p.email.sendBox = async () => {
    count++;
    throw Error("fake");
  };
  const result = await service.free(
    briefSchema.parse({
      interest: "student",
      email: "student@example.test",
      emailConsent: true,
    }),
    randomUUID(),
  );
  const d = (await s.list<Record<string, unknown>>("deliveries"))[0]!;
  d.attempts = 4;
  d.nextAttemptAt = 0;
  await s.put("deliveries", String(d.key), d);
  await Promise.all([service.processDeliveries(), service.processDeliveries()]);
  assert.equal(count, 2);
  d.attempts = 0;
  d.createdAt = new Date(Date.now() - 24 * 3600000).toISOString();
  await s.put("deliveries", String(d.key), d);
  await service.processDeliveries();
  assert.equal(count, 2);
  assert.ok(result.box.id);
});
test("analytics deduplicates resource events and uses UTC exclusive boundaries and hashed visitor IDs", async () => {
  const s = new MemoryStore(),
    a = new Analytics(s, "test-only"),
    v = randomUUID();
  const event = {
    id: "page-1",
    type: "page_view" as const,
    visitorId: v,
    at: "2026-10-14T12:00:00.000Z",
  };
  await a.record(event);
  await a.record(event);
  await a.record({
    id: "excluded",
    type: "page_view",
    visitorId: randomUUID(),
    at: "2026-10-15T00:00:00.000Z",
  });
  await a.record({
    id: "sandbox",
    type: "premium_box",
    mode: "paypal",
    paymentEnvironment: "sandbox",
    at: event.at,
  });
  await a.record({
    id: "live",
    type: "premium_box",
    mode: "paypal",
    paymentEnvironment: "live",
    at: event.at,
  });
  await s.put("orders", "live", {
    createdAt: event.at,
    paidAt: event.at,
    paymentStatus: "completed",
    paymentEnvironment: "live",
  });
  await s.put("orders", "sandbox", {
    createdAt: event.at,
    paidAt: event.at,
    paymentStatus: "completed",
    paymentEnvironment: "sandbox",
  });
  const summary = await a.summary(
    a.period("2026-10-14T00:00:00Z", "2026-10-15T00:00:00Z"),
  );
  assert.equal(summary.counts.pageViews, 1);
  assert.equal(summary.counts.visitors, 1);
  assert.equal(summary.counts.paidOrders, 1);
  assert.ok(!JSON.stringify(await s.list("activity")).includes(v));
  assert.throws(() => a.period("2026-01-01", "2026-03-01"));
});
test("analytics pruning removes only events older than30 days and preserves users", async () => {
  const s = new MemoryStore(),
    a = new Analytics(s, "test");
  await a.record({ id: "old", type: "page_view", at: "2020-01-01T00:00:00Z" });
  await a.record({ id: "new", type: "page_view" });
  await s.put("users", "u", { id: "u" });
  await a.prune();
  assert.equal((await s.list("activity")).length, 1);
  assert.equal((await s.list("users")).length, 1);
});
test("webhook-only payment is counted durably even when generation fails", async () => {
  const { c, p, service } = fixture();
  c.paymentMode = "paypal";
  c.paypalMode = "live";
  p.payments.verifyWebhook = async () => true;
  p.payments.inspect = async () => ({
    status: "completed",
    captureId: "durable-fixture",
  });
  p.ai.generate = async () => {
    throw Error("simulated generation failure");
  };
  const order = await service.createOrder(
    briefSchema.parse({ interest: "business" }),
    randomUUID(),
  );
  await service.webhook(
    {},
    {
      id: "durable-event",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        supplementary_data: { related_ids: { order_id: order.paypalOrderId } },
      },
    },
  );
  await service.processEvents();
  const stats = await service.analytics.summary(
    service.analytics.period(
      new Date(Date.now() - 60000).toISOString(),
      new Date(Date.now() + 1000).toISOString(),
    ),
  );
  assert.equal(stats.counts.paidOrders, 1);
  assert.equal(stats.counts.premiumBoxes, 0);
});
