import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoStore } from "../src/store";
import { MysteryBoxService } from "../src/domain";
import { readConfig } from "../src/config";
import { createProviders } from "../src/providers";
import { catalog, CATALOG_VERSION } from "../src/catalog";
import { briefSchema } from "../../../packages/shared/src";
/** 真正的mongod副本集，不把内存仓储当作Mongo集成证据。测试库为随机名称。 */
test(
  "MongoDB replica-set indexes, atomic contention, rollback and restart persistence",
  {
    skip: process.env.RUN_MONGO_TESTS !== "1" && !process.env.TEST_MONGODB_URI,
    timeout: 180000,
  },
  async () => {
    const repl = process.env.TEST_MONGODB_URI
      ? undefined
      : await MongoMemoryReplSet.create({
          binary: {
            version: "8.0.17",
            downloadDir: process.env.MONGOMS_DOWNLOAD_DIR,
          },
          instanceOpts: [{ args: ["--nounixsocket"] }],
          replSet: { count: 1, storageEngine: "wiredTiger" },
        });
    const uri = process.env.TEST_MONGODB_URI || repl!.getUri();
    const db = `mysterybox_test_${randomUUID().replaceAll("-", "")}`;
    const a = MongoStore.fromUrl(uri, db),
      b = MongoStore.fromUrl(uri, db);
    try {
      await a.initialize();
      await b.ready();
      assert.equal(await a.insert("unique", "a", { x: 1 }), true);
      assert.equal(await b.insert("unique", "a", { x: 2 }), false);
      await a.put("counter", "one", { n: 0 });
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          (i % 2 ? a : b).atomic("counter:one", async (tx) => {
            const row = (await tx.get<{ n: number }>("counter", "one"))!;
            await tx.put("counter", "one", { n: row.n + 1 });
          }),
        ),
      );
      assert.equal((await a.get<{ n: number }>("counter", "one"))?.n, 20);
      await assert.rejects(
        a.atomic("rollback", async (tx) => {
          await tx.put("rollback", "x", { x: 1 });
          throw Error("rollback");
        }),
      );
      assert.equal(await b.get("rollback", "x"), undefined);
      const c = readConfig({}),
        providers = createProviders(c);
      const one = new MysteryBoxService(c, a, providers),
        two = new MysteryBoxService(c, b, providers);
      await assert.rejects(one.loadCatalog());
      for (const tool of catalog) await a.put("tools", tool.id, tool);
      await a.put("catalog_versions", "current", { version: CATALOG_VERSION });
      await one.loadCatalog();
      assert.equal(one.catalog.length, 16);
      let captures = 0;
      const capture = providers.payments.capture.bind(providers.payments);
      providers.payments.capture = async (input) => {
        captures++;
        return capture(input);
      };
      const order = await one.createOrder(
        briefSchema.parse({ interest: "business" }),
        randomUUID(),
      );
      const results = await Promise.all([
        one.captureOrder(order.orderId, order.accessToken, undefined, true),
        two.captureOrder(order.orderId, order.accessToken, undefined, true),
      ]);
      assert.equal(captures, 1);
      assert.equal(results[0]!.box.id, results[1]!.box.id);
      // 同一真实Mongo库上的HTTP授权：普通用户拒绝，运维授予/撤销后即时生效。
      const account = await one.requestCode("mongo-admin-fixture@example.test");
      const signed = await one.verifyCode(account.challengeId, account.developmentCode!);
      const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
        cwd: path.resolve(import.meta.dirname, ".."),
        env: {
          ...process.env,
          PORT: "14001",
          NODE_ENV: "development",
          MONGODB_URI: uri,
          MONGODB_DB: db,
          AI_MODE: "demo",
          PAYMENT_MODE: "demo",
          EMAIL_MODE: "demo",
          MCP_ENABLED: "0",
          APP_LIVE_TEST: "0",
          APP_URL: "http://localhost:3000",
          ADMIN_APP_URL: "http://localhost:3001",
        },
        stdio: "ignore",
      });
      try {
        const base = "http://127.0.0.1:14001/api";
        for (let i = 0; i < 100; i++) {
          try {
            if ((await fetch(base + "/health")).ok) break;
          } catch {
            /* 等待测试进程启动。 */
          }
          if (i === 99) throw Error("Mongo-backed HTTP API did not start");
          await new Promise((r) => setTimeout(r, 50));
        }
        const headers = { Cookie: `mb_session=${signed.token}` };
        assert.equal((await fetch(base + "/admin/summary", { headers })).status, 403);
        await a.put("users", signed.user.id, { ...signed.user, role: "admin" });
        const report = await fetch(base + "/admin/summary", { headers });
        assert.equal(report.status, 200);
        assert.equal((await report.json()).counts.premiumBoxes, 1);
        await a.put("users", signed.user.id, { ...signed.user, role: "member" });
        assert.equal((await fetch(base + "/admin/summary", { headers })).status, 403);
        const free = await fetch(base + "/boxes/free", {
          method: "POST",
          headers: {
            ...headers,
            Origin: "http://localhost:3000",
            "Content-Type": "application/json",
            "Idempotency-Key": randomUUID(),
          },
          body: JSON.stringify({ interest: "student" }),
        });
        assert.equal(free.status, 200);
        assert.equal(
          (await a.list("activity")).length,
          0,
          "omitted optional identity must not create person-linked usage events",
        );
      } finally {
        child.kill("SIGTERM");
        await new Promise<void>((resolve) => {
          if (child.exitCode !== null) return resolve();
          child.once("exit", () => resolve());
          setTimeout(() => {
            child.kill("SIGKILL");
            resolve();
          }, 5000).unref();
        });
      }
      await b.close();
      await a.close();
      if (repl) {
        await repl.stop({ doCleanup: false, force: false });
        await repl.start();
      }
      const reopened = MongoStore.fromUrl(uri, db);
      try {
        await reopened.ready();
        const after = new MysteryBoxService(c, reopened, providers);
        assert.equal(
          (await after.readBox(results[0]!.box.id, results[0]!.accessToken)).id,
          results[0]!.box.id,
        );
      } finally {
        await reopened.close();
      }
    } finally {
      await a.close();
      await b.close();
      await repl?.stop();
    }
  },
);
