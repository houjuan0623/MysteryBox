import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MysteryBoxService, type OrderRecord } from "../src/domain";
import { MemoryStore } from "../src/store";
import { readConfig } from "../src/config";
import { createProviders } from "../src/providers";
import { briefSchema, INTERESTS } from "../../../packages/shared/src";

const fixture = () => {
  const config = readConfig({}),
    store = new MemoryStore(),
    providers = createProviders(config);
  return {
    config,
    store,
    providers,
    service: new MysteryBoxService(config, store, providers),
  };
};
const brief = (
  interest: "creator" | "developer" | "student" | "business" = "developer",
) => briefSchema.parse({ interest, goal: "Create a small useful example" });
const account = async (service: MysteryBoxService, email: string) => {
  const challenge = await service.requestCode(email);
  return service.verifyCode(challenge.challengeId, challenge.developmentCode!);
};

test("four interests create valid free boxes and require unguessable access tokens", async () => {
  const { service } = fixture();
  for (const interest of INTERESTS) {
    const result = await service.free(brief(interest), randomUUID());
    assert.equal(result.box.tools.length, 1);
    assert.equal(result.box.interest, interest);
    assert.equal(result.box.generationMode, "demo");
    assert.equal(
      (await service.readBox(result.box.id, result.accessToken)).id,
      result.box.id,
    );
    await assert.rejects(service.readBox(result.box.id, "invalid"), {
      code: "BOX_NOT_FOUND",
    });
  }
});
test("free idempotency survives concurrent retries and rejects mismatched inputs", async () => {
  const { service, providers } = fixture();
  let count = 0;
  const generate = providers.ai.generate.bind(providers.ai);
  providers.ai.generate = async (input) => {
    count++;
    return generate(input);
  };
  const key = randomUUID();
  const [a, b] = await Promise.all([
    service.free(brief(), key),
    service.free(brief(), key),
  ]);
  assert.equal(a.box.id, b.box.id);
  assert.equal(a.accessToken, b.accessToken);
  assert.equal(count, 1);
  await assert.rejects(service.free(brief("creator"), key), {
    code: "IDEMPOTENCY_CONFLICT",
  });
});
test("server controls price and captures exactly once under concurrent requests", async () => {
  const { service, providers } = fixture();
  let count = 0;
  const capture = providers.payments.capture.bind(providers.payments);
  providers.payments.capture = async (input) => {
    count++;
    return capture(input);
  };
  assert.equal(
    briefSchema.safeParse({ ...brief(), amountCents: 1 }).success,
    false,
  );
  const order = await service.createOrder(brief(), randomUUID());
  assert.equal(order.amountCents, 299);
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      service.captureOrder(order.orderId, order.accessToken, undefined, true),
    ),
  );
  assert.equal(new Set(results.map((r) => r.box.id)).size, 1);
  assert.equal(results[0]!.box.tools.length, 3);
  assert.equal(count, 1);
  await assert.rejects(
    service.captureOrder(order.orderId, "stolen", undefined, true),
    { code: "ORDER_NOT_FOUND" },
  );
  await assert.rejects(service.captureOrder(order.orderId, order.accessToken), {
    code: "PAYMENT_MODE",
  });
});
test("paid order remains paid after AI failure and retry does not charge again", async () => {
  const { service, store, providers } = fixture();
  const generate = providers.ai.generate.bind(providers.ai);
  let fail = true,
    captures = 0;
  const capture = providers.payments.capture.bind(providers.payments);
  providers.ai.generate = async (input) => {
    if (fail) throw Error("fake timeout");
    return generate(input);
  };
  providers.payments.capture = async (input) => {
    captures++;
    return capture(input);
  };
  const order = await service.createOrder(brief(), randomUUID());
  await assert.rejects(
    service.captureOrder(order.orderId, order.accessToken, undefined, true),
    { code: "GENERATION_FAILED" },
  );
  assert.equal(
    (await store.get<OrderRecord>("orders", order.orderId))?.paymentStatus,
    "completed",
  );
  assert.equal(
    (await service.orderStatus(order.orderId, order.accessToken))
      .generationStatus,
    "failed",
  );
  fail = false;
  const result = await service.captureOrder(
    order.orderId,
    order.accessToken,
    undefined,
    true,
  );
  assert.equal(result.box.tier, "premium");
  assert.equal(captures, 1);
});
test("pending payment cannot unlock a box", async () => {
  const { service, store, providers } = fixture();
  providers.payments.capture = async () => ({
    status: "pending",
    captureId: "pending-1",
  });
  const order = await service.createOrder(brief(), randomUUID());
  await assert.rejects(
    service.captureOrder(order.orderId, order.accessToken, undefined, true),
    { code: "PAYMENT_PENDING" },
  );
  assert.equal((await store.list("boxes")).length, 0);
  assert.equal(
    (await service.orderStatus(order.orderId, order.accessToken)).paymentStatus,
    "pending",
  );
});
test("capture association cannot be reused for another order", async () => {
  const { service, providers } = fixture();
  providers.payments.capture = async () => ({
    status: "completed",
    captureId: "same-capture",
  });
  const a = await service.createOrder(brief(), randomUUID()),
    b = await service.createOrder(brief(), randomUUID());
  await service.captureOrder(a.orderId, a.accessToken, undefined, true);
  await assert.rejects(
    service.captureOrder(b.orderId, b.accessToken, undefined, true),
    { code: "CAPTURE_CONFLICT" },
  );
});
test("email failure preserves the box and permits an independent idempotent retry", async () => {
  const { service, providers } = fixture();
  const send = providers.email.sendBox.bind(providers.email);
  let fail = true,
    count = 0;
  providers.email.sendBox = async (input) => {
    count++;
    if (fail) throw Error("mail unavailable");
    return send(input);
  };
  const result = await service.free(
    briefSchema.parse({
      ...brief(),
      email: "test@example.com",
      emailConsent: true,
    }),
    randomUUID(),
  );
  assert.equal(result.emailStatus, "failed");
  assert.ok(result.box.id);
  fail = false;
  assert.equal(
    (
      await service.emailBox(
        result.box.id,
        "test@example.com",
        result.accessToken,
      )
    ).status,
    "demo",
  );
  await service.emailBox(result.box.id, "test@example.com", result.accessToken);
  assert.equal(count, 2);
});
test("one-time codes have attempt limit, expire, and cannot be reused", async () => {
  const { service, store } = fixture();
  const challenge = await service.requestCode("one@example.com");
  const wrong = challenge.developmentCode === "000000" ? "000001" : "000000";
  for (let i = 0; i < 5; i++)
    await assert.rejects(service.verifyCode(challenge.challengeId, wrong), {
      code: "INVALID_CODE",
    });
  await assert.rejects(
    service.verifyCode(challenge.challengeId, challenge.developmentCode!),
    { code: "INVALID_CODE" },
  );
  const other = await service.requestCode("two@example.com");
  await service.verifyCode(other.challengeId, other.developmentCode!);
  await assert.rejects(
    service.verifyCode(other.challengeId, other.developmentCode!),
    { code: "INVALID_CODE" },
  );
  const expired = await service.requestCode("three@example.com");
  const record = (await store.get<Record<string, unknown>>(
    "challenges",
    expired.challengeId,
  ))!;
  record.expiresAt = 0;
  await store.put("challenges", expired.challengeId, record);
  await assert.rejects(
    service.verifyCode(expired.challengeId, expired.developmentCode!),
    { code: "INVALID_CODE" },
  );
});
test("two-account history, favorites, guest claim and logout stay isolated", async () => {
  const { service } = fixture();
  const a = await account(service, "a@example.com"),
    b = await account(service, "b@example.com");
  const result = await service.free(brief(), randomUUID(), a.user);
  assert.equal((await service.history(a.user)).length, 1);
  assert.equal((await service.history(b.user)).length, 0);
  await assert.rejects(service.readBox(result.box.id, undefined, b.user), {
    code: "BOX_NOT_FOUND",
  });
  await assert.rejects(
    service.claim(result.box.id, result.accessToken, b.user),
    { code: "BOX_NOT_FOUND" },
  );
  const guest = await service.free(brief(), randomUUID());
  await service.claim(guest.box.id, guest.accessToken, b.user);
  assert.equal((await service.history(b.user)).length, 1);
  const id = result.box.tools[0]!.toolId;
  await service.favorite(a.user, id, true);
  await service.favorite(a.user, id, true);
  assert.deepEqual(await service.favorites(a.user), [id]);
  assert.deepEqual(await service.favorites(b.user), []);
  await service.favorite(a.user, id, false);
  assert.deepEqual(await service.favorites(a.user), []);
  assert.equal((await service.userFromSession(a.token))?.id, a.user.id);
  await service.logout(a.token);
  assert.equal(await service.userFromSession(a.token), undefined);
});
