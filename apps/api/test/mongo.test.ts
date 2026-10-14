import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { Analytics, type Activity } from "../src/analytics";
import { createMcpServer, type McpAudit, type McpDraft } from "../src/mcp/service";
import type { McpIdentity } from "../src/mcp/config";
import { MongoStore } from "../src/store";
import { MysteryBoxService } from "../src/domain";
import { readConfig } from "../src/config";
import { createProviders } from "../src/providers";
import { catalog, CATALOG_VERSION } from "../src/catalog";
import { briefSchema } from "../../../packages/shared/src";

/** 真实官方协议握手；合成身份只注入测试服务，不创建 bearer 或持久访问凭据。 */
async function connectMongoMcp(store: MongoStore, identity: McpIdentity) {
  const server = createMcpServer(
    { store, analytics: new Analytics(store, randomUUID()) },
    identity,
  );
  const client = new Client({ name: "synthetic-mongo-mcp-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    assert.equal(client.getServerVersion()?.name, "mysterybox-scoped-mcp");
    return {
      client,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  } catch (error) {
    await client.close();
    await server.close();
    throw error;
  }
}
async function mcpCall(client: Client, name: string, args: Record<string, unknown>) {
  return CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));
}
function draftOutput(result: Awaited<ReturnType<typeof mcpCall>>) {
  assert.equal(result.isError, undefined);
  assert.ok(result.structuredContent);
  const draft = result.structuredContent.draft as McpDraft;
  assert.ok(draft && typeof draft.id === "string");
  assert.equal(draft.status, "draft");
  assert.equal("owner" in draft, false);
  assert.equal(typeof result.structuredContent.replayed, "boolean");
  return { draft, replayed: result.structuredContent.replayed as boolean };
}
/** 真正的mongod副本集，不把内存仓储当作Mongo集成证据。测试库为随机名称。 */
test(
  "MongoDB replica-set contention, admin/OTP, analytics and MCP restart persistence",
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
    const mcpConnections: Awaited<ReturnType<typeof connectMongoMcp>>[] = [];
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
      // 两个独立Mongo连接同时消费同一OTP，只能一个成功且仅建立一个会话。
      const sessionsBefore = (await a.list("sessions")).length;
      const attempts = await Promise.allSettled([
        one.verifyCode(account.challengeId, account.developmentCode!),
        two.verifyCode(account.challengeId, account.developmentCode!),
      ]);
      assert.equal(
        attempts.filter((attempt) => attempt.status === "fulfilled").length,
        1,
      );
      assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);
      const success = attempts.find((attempt) => attempt.status === "fulfilled");
      assert.ok(success && success.status === "fulfilled");
      const signed = success.value;
      const denied = attempts.find((attempt) => attempt.status === "rejected");
      assert.ok(denied && denied.status === "rejected");
      assert.equal(denied.reason.code, "INVALID_CODE");
      assert.equal((await a.list("sessions")).length, sessionsBefore + 1);
      assert.equal(
        (await b.get<{ used: boolean }>("challenges", account.challengeId))?.used,
        true,
      );
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
        const adminRoutes = ["/admin/summary", "/admin/users", "/admin/events"];
        for (const route of adminRoutes) {
          assert.equal((await fetch(base + route)).status, 401, `guest ${route}`);
          assert.equal(
            (await fetch(base + route, { headers })).status,
            403,
            `member ${route}`,
          );
        }
        await a.put("users", signed.user.id, { ...signed.user, role: "admin" });
        const report = await fetch(base + "/admin/summary", { headers });
        assert.equal(report.status, 200);
        assert.equal((await report.json()).counts.premiumBoxes, 1);
        for (const route of adminRoutes) {
          assert.equal(
            (await fetch(base + route, { headers })).status,
            200,
            `admin ${route}`,
          );
        }
        await a.put("users", signed.user.id, { ...signed.user, role: "member" });
        for (const route of adminRoutes) {
          assert.equal(
            (await fetch(base + route, { headers })).status,
            403,
            `revoked ${route}`,
          );
        }
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
      // 可选分析事件在真实Mongo中跨连接去重；清理只删除30天前的事件。
      const visitorId = randomUUID();
      const recentEventId = randomUUID();
      const expiredEventId = randomUUID();
      const recentEvent = {
        id: recentEventId,
        type: "page_view" as const,
        at: new Date(Date.now() - 3600000).toISOString(),
        visitorId,
        path: "/",
      };
      const analyticsA = new Analytics(a, c.sessionSecret);
      const analyticsB = new Analytics(b, c.sessionSecret);
      await Promise.all([analyticsA.record(recentEvent), analyticsB.record(recentEvent)]);
      await analyticsA.record({
        ...recentEvent,
        id: expiredEventId,
        at: new Date(Date.now() - 31 * 86400000).toISOString(),
      });
      assert.equal(
        (await a.list<Activity>("activity")).filter((event) => event.id === recentEventId)
          .length,
        1,
      );
      const storedEvent = await b.get<Activity>("activity", recentEventId);
      assert.match(storedEvent!.visitor!, /^[a-f0-9]{64}$/);
      assert.equal(JSON.stringify(storedEvent).includes(visitorId), false);
      assert.equal(storedEvent?.userId, undefined);
      await analyticsA.prune();
      assert.equal(await b.get("activity", expiredEventId), undefined);
      assert.ok(await b.get("activity", recentEventId));

      // 同一真实Mongo库的两条连接经SDK执行工具，不能用MemoryStore替代持久化证据。
      const identity: McpIdentity = {
        id: `synthetic-mongo-${randomUUID()}`,
        scopes: ["analytics:read", "drafts:read", "drafts:write"],
      };
      const mcpA = await connectMongoMcp(a, identity);
      mcpConnections.push(mcpA);
      const mcpB = await connectMongoMcp(b, identity);
      mcpConnections.push(mcpB);
      assert.deepEqual(
        (await mcpA.client.listTools()).tools.map((tool) => tool.name).sort(),
        ["analytics_summary", "draft_create", "draft_list"],
      );
      const draftArgs = {
        type: "promotion",
        title: "Synthetic persisted draft",
        content: "Synthetic Mongo persistence content; never published.",
        tags: ["synthetic"],
        idempotencyKey: randomUUID(),
      };
      const drafts = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          mcpCall(index % 2 ? mcpA.client : mcpB.client, "draft_create", draftArgs).then(
            draftOutput,
          ),
        ),
      );
      assert.equal(new Set(drafts.map((output) => output.draft.id)).size, 1);
      assert.equal(drafts.filter((output) => !output.replayed).length, 1);
      const persistedDraft = drafts[0].draft;
      assert.equal((await a.list<McpDraft>("mcp_drafts")).length, 1);
      assert.equal((await b.list("mcp_idempotency")).length, 1);
      const conflict = await mcpCall(mcpB.client, "draft_create", {
        ...draftArgs,
        content: "Conflicting synthetic payload.",
      });
      assert.equal(conflict.isError, true);
      assert.equal(
        (conflict.structuredContent?.error as { code: string }).code,
        "IDEMPOTENCY_CONFLICT",
      );
      const beforeRestartAudit = await a.list<McpAudit>("mcp_audit");
      assert.equal(
        beforeRestartAudit.filter(
          (audit) => audit.action === "draft_create" && audit.outcome === "success",
        ).length,
        1,
      );
      assert.equal(
        beforeRestartAudit.filter(
          (audit) => audit.action === "draft_create" && audit.outcome === "replay",
        ).length,
        11,
      );
      assert.equal(
        beforeRestartAudit.filter((audit) => audit.code === "IDEMPOTENCY_CONFLICT")
          .length,
        1,
      );
      assert.equal(JSON.stringify(beforeRestartAudit).includes(draftArgs.content), false);
      assert.equal(
        JSON.stringify(beforeRestartAudit).includes(draftArgs.idempotencyKey),
        false,
      );
      await mcpA.close();
      await mcpB.close();
      mcpConnections.length = 0;
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
        // 本地副本集实际重启后重新握手；外接测试库仅验证新连接，不擅自重启外部服务。
        const mcpReopened = await connectMongoMcp(reopened, identity);
        try {
          const persistedAudit = await reopened.list<McpAudit>("mcp_audit");
          assert.deepEqual(
            persistedAudit.map((audit) => audit.id).sort(),
            beforeRestartAudit.map((audit) => audit.id).sort(),
          );
          const replay = draftOutput(
            await mcpCall(mcpReopened.client, "draft_create", draftArgs),
          );
          assert.equal(replay.replayed, true);
          assert.deepEqual(replay.draft, persistedDraft);
          const listed = await mcpCall(mcpReopened.client, "draft_list", {
            type: "promotion",
            limit: 10,
          });
          assert.equal(listed.isError, undefined);
          assert.deepEqual(listed.structuredContent?.drafts, [persistedDraft]);
          assert.equal((await reopened.list("mcp_drafts")).length, 1);
          assert.equal((await reopened.list("mcp_idempotency")).length, 1);
          const afterRestartAudit = await reopened.list<McpAudit>("mcp_audit");
          assert.equal(afterRestartAudit.length, beforeRestartAudit.length + 2);
          assert.equal(
            afterRestartAudit.filter(
              (audit) => audit.action === "draft_create" && audit.outcome === "success",
            ).length,
            1,
          );
          assert.equal(
            afterRestartAudit.filter(
              (audit) => audit.action === "draft_create" && audit.outcome === "replay",
            ).length,
            12,
          );
          assert.equal(
            new Set(afterRestartAudit.map((audit) => audit.id)).size,
            afterRestartAudit.length,
          );
          assert.ok(await reopened.get("activity", recentEventId));
          assert.equal(await reopened.get("activity", expiredEventId), undefined);
        } finally {
          await mcpReopened.close();
        }
      } finally {
        await reopened.close();
      }
    } finally {
      for (const connection of mcpConnections) await connection.close();
      await a.close();
      await b.close();
      await repl?.stop();
    }
  },
);
