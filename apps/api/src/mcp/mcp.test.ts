import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  createServer,
  request as httpRequest,
  type Server as HttpServer,
} from "node:http";
import { after, test } from "node:test";
import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Analytics } from "../analytics";
import { MemoryStore, type Records, type Store } from "../store";
import { attachMcp, readMcpConfig } from "./index";
import {
  authenticateMcp,
  mcpRequestAllowed,
  type McpConfig,
  type McpScope,
} from "./config";
import type { McpAudit, McpDraft } from "./service";

const servers: HttpServer[] = [];
after(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});
function configured(
  token: string,
  id = "synthetic-operator",
  scopes: readonly McpScope[] = ["analytics:read", "drafts:read", "drafts:write"],
): Extract<McpConfig, { enabled: true }> {
  const config = readMcpConfig({
    MCP_ENABLED: "1",
    MCP_TOKEN_SHA256: createHash("sha256").update(token).digest("hex"),
    MCP_PRINCIPAL_ID: id,
    MCP_SCOPES: scopes.join(","),
  });
  assert.equal(config.enabled, true);
  return config as Extract<McpConfig, { enabled: true }>;
}
async function fixture(
  options: {
    store?: Store;
    id?: string;
    scopes?: readonly McpScope[];
    disabled?: boolean;
  } = {},
) {
  // 随机身份凭据仅存在测试进程内；不输出、不写 .env、不授予持久访问。
  const token = randomBytes(32).toString("base64url");
  const store = options.store || new MemoryStore();
  const config = options.disabled
    ? ({ enabled: false } as const)
    : configured(token, options.id, options.scopes);
  const app = express();
  attachMcp(
    app,
    { store, analytics: new Analytics(store, randomBytes(32).toString("hex")) },
    config,
  );
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/mcp`;
  const rpc = async (
    method: string,
    params?: unknown,
    overrides: Record<string, string> = {},
  ) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        ...overrides,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: randomUUID(),
        method,
        ...(params === undefined ? {} : { params }),
      }),
    });
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers,
    };
  };
  return { token, store, config, url, rpc };
}
const draftArgs = (key = randomUUID()) => ({
  type: "tool",
  title: "Synthetic draft",
  content: "Private synthetic draft body, never executed.",
  tags: ["test"],
  idempotencyKey: key,
});
function output(value: unknown): Record<string, unknown> {
  assert.ok(
    value &&
      typeof value === "object" &&
      "structuredContent" in value &&
      value.structuredContent,
  );
  return value.structuredContent as Record<string, unknown>;
}
function code(body: { result?: { structuredContent?: { error?: { code?: string } } } }) {
  return body.result?.structuredContent?.error?.code;
}

test("MCP is disabled by default and incomplete or invalid enabled configuration fails closed", async () => {
  assert.deepEqual(readMcpConfig({}), { enabled: false });
  assert.deepEqual(readMcpConfig({ MCP_ENABLED: "0", MCP_TOKEN_SHA256: "invalid" }), {
    enabled: false,
  });
  assert.throws(() => readMcpConfig({ MCP_ENABLED: "true" }));
  assert.throws(() => readMcpConfig({ MCP_ENABLED: "1" }));
  const base = {
    MCP_ENABLED: "1",
    MCP_TOKEN_SHA256: "0".repeat(64),
    MCP_PRINCIPAL_ID: "synthetic",
    MCP_SCOPES: "analytics:read",
  };
  for (const extra of [
    { MCP_SCOPES: "*" },
    { MCP_SCOPES: "shell:write" },
    { MCP_ALLOW_REMOTE: "true" },
    { MCP_ALLOW_REMOTE: "1" },
    { MCP_ALLOWED_HOSTS: "*.example.com" },
    { MCP_ALLOWED_HOSTS: "example.com" },
    { MCP_ALLOWED_ORIGINS: "https://example.com/path" },
    { MCP_ALLOWED_ORIGINS: "http://example.com" },
  ])
    assert.throws(() => readMcpConfig({ ...base, ...extra }));
  const { url } = await fixture({ disabled: true });
  assert.equal((await fetch(url, { method: "POST" })).status, 404);
});

test("strict bearer authentication, Host/Origin and local socket boundaries", async () => {
  const f = await fixture();
  assert.ok(f.config.enabled);
  if (!f.config.enabled) return;
  assert.equal(authenticateMcp(undefined, f.config), undefined);
  assert.equal(
    authenticateMcp(`Bearer ${randomBytes(32).toString("base64url")}`, f.config),
    undefined,
  );
  assert.equal(authenticateMcp(`Bearer ${f.token}`, f.config)?.id, "synthetic-operator");
  assert.equal(
    mcpRequestAllowed(
      { host: "127.0.0.1:4000", remoteAddress: "10.0.0.1", forwarded: false },
      f.config,
    ),
    false,
  );
  assert.equal(
    mcpRequestAllowed(
      { host: "127.0.0.1:4000", remoteAddress: "127.0.0.1", forwarded: true },
      f.config,
    ),
    false,
  );
  assert.equal((await f.rpc("tools/list", {}, { authorization: "" })).status, 401);
  assert.equal(
    (
      await f.rpc(
        "tools/list",
        {},
        { authorization: "Bearer incorrect", cookie: "mb_session=synthetic-admin" },
      )
    ).status,
    401,
  );
  assert.equal(
    (await f.rpc("tools/list", {}, { origin: "https://evil.example" })).status,
    403,
  );
  const badHost = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(
      f.url,
      {
        method: "POST",
        headers: { host: "evil.example", authorization: `Bearer ${f.token}` },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
    request.end();
  });
  assert.equal(badHost, 403);
  assert.equal(
    (await f.rpc("tools/list", {}, { "x-forwarded-for": "10.0.0.1" })).status,
    403,
  );
  assert.equal(
    (await fetch(f.url, { headers: { authorization: `Bearer ${f.token}` } })).status,
    405,
  );
});

test("real SDK client initializes, lists tools and calls aggregate statistics and private draft tools over HTTP", async () => {
  const f = await fixture();
  const client = new Client({ name: "synthetic-mcp-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(f.url), {
    requestInit: { headers: { authorization: `Bearer ${f.token}` } },
  });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.name, "mysterybox-scoped-mcp");
    assert.ok(client.getServerCapabilities()?.tools);
    assert.equal(transport.sessionId, undefined);
    const list = await client.listTools();
    assert.deepEqual(list.tools.map((tool) => tool.name).sort(), [
      "analytics_summary",
      "draft_create",
      "draft_list",
    ]);
    assert.equal(
      list.tools.find((tool) => tool.name === "draft_create")?.inputSchema
        .additionalProperties,
      false,
    );
    const stats = await client.callTool({ name: "analytics_summary", arguments: {} });
    assert.equal(stats.isError, undefined);
    assert.ok(output(stats).counts);
    assert.equal("users" in output(stats), false);
    const created = await client.callTool({
      name: "draft_create",
      arguments: draftArgs(),
    });
    assert.equal(created.isError, undefined);
    const data = output(created);
    assert.equal((data.draft as McpDraft).status, "draft");
    assert.equal("owner" in (data.draft as object), false);
    const drafts = output(await client.callTool({ name: "draft_list", arguments: {} }));
    assert.equal((drafts.drafts as unknown[]).length, 1);
  } finally {
    await client.close();
  }
});

test("raw JSON-RPC initialize negotiates a real protocol and scope restrictions apply to discovery and direct calls", async () => {
  const f = await fixture({ scopes: ["analytics:read"] });
  const init = await f.rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "synthetic-test", version: "1.0" },
  });
  assert.equal(init.status, 200);
  assert.equal(init.body.jsonrpc, "2.0");
  assert.equal(init.body.result.protocolVersion, "2025-11-25");
  assert.deepEqual(
    (await f.rpc("tools/list")).body.result.tools.map(
      (tool: { name: string }) => tool.name,
    ),
    ["analytics_summary"],
  );
  assert.equal(
    code(
      (await f.rpc("tools/call", { name: "draft_create", arguments: draftArgs() })).body,
    ),
    "FORBIDDEN",
  );
  assert.equal(
    code((await f.rpc("tools/call", { name: "draft_list", arguments: {} })).body),
    "FORBIDDEN",
  );
  assert.equal(
    code((await f.rpc("tools/call", { name: "shell_exec", arguments: {} })).body),
    "UNKNOWN_TOOL",
  );
  assert.equal((await f.store.list("mcp_drafts")).length, 0);
});

test("strict bounded schemas reject extra fields, invalid types and ranges without persisting drafts", async () => {
  const f = await fixture();
  const samples = [
    { ...draftArgs(), publish: true },
    { ...draftArgs(), type: "refund" },
    { ...draftArgs(), title: " " },
    { ...draftArgs(), title: "a".repeat(121) },
    { ...draftArgs(), content: "a".repeat(8001) },
    { ...draftArgs(), tags: Array(9).fill("a") },
    { ...draftArgs(), idempotencyKey: "tiny" },
  ];
  for (const args of samples)
    assert.equal(
      code((await f.rpc("tools/call", { name: "draft_create", arguments: args })).body),
      "INVALID_INPUT",
    );
  assert.equal(
    code(
      (await f.rpc("tools/call", { name: "draft_list", arguments: { limit: 51 } })).body,
    ),
    "INVALID_INPUT",
  );
  assert.equal(
    code(
      (await f.rpc("tools/call", { name: "draft_list", arguments: { owner: "another" } }))
        .body,
    ),
    "INVALID_INPUT",
  );
  assert.equal(
    code(
      (
        await f.rpc("tools/call", {
          name: "analytics_summary",
          arguments: { from: "2026-01-01T00:00:00Z", to: "2026-03-01T00:00:00Z" },
        })
      ).body,
    ),
    "INVALID_PERIOD",
  );
  assert.equal(
    code(
      (
        await f.rpc("tools/call", {
          name: "analytics_summary",
          arguments: { from: "2026-01-02T00:00:00Z", to: "2026-01-01T00:00:00Z" },
        })
      ).body,
    ),
    "INVALID_PERIOD",
  );
  assert.equal((await f.store.list("mcp_drafts")).length, 0);
});

test("draft idempotency is atomic under concurrent calls and rejects payload conflicts", async () => {
  const f = await fixture();
  const args = draftArgs();
  const calls = await Promise.all(
    Array.from({ length: 12 }, () =>
      f.rpc("tools/call", { name: "draft_create", arguments: args }),
    ),
  );
  assert.ok(calls.every((call) => !call.body.result.isError));
  assert.equal(
    new Set(calls.map((call) => call.body.result.structuredContent.draft.id)).size,
    1,
  );
  assert.equal(
    calls.filter((call) => call.body.result.structuredContent.replayed === false).length,
    1,
  );
  assert.equal((await f.store.list("mcp_drafts")).length, 1);
  assert.equal((await f.store.list("mcp_idempotency")).length, 1);
  assert.equal(
    code(
      (
        await f.rpc("tools/call", {
          name: "draft_create",
          arguments: { ...args, content: "Different content" },
        })
      ).body,
    ),
    "IDEMPOTENCY_CONFLICT",
  );
  const audits = await f.store.list<McpAudit>("mcp_audit");
  assert.equal(audits.filter((audit) => audit.outcome === "success").length, 1);
  assert.equal(audits.filter((audit) => audit.outcome === "replay").length, 11);
  assert.equal(audits.filter((audit) => audit.code === "IDEMPOTENCY_CONFLICT").length, 1);
  assert.equal(JSON.stringify(audits).includes(args.content), false);
  assert.equal(JSON.stringify(audits).includes(args.idempotencyKey), false);
  assert.equal(JSON.stringify(audits).includes(f.token), false);
});

test("drafts and idempotency keys are isolated by principal; pagination and type filters are bounded", async () => {
  const store = new MemoryStore();
  const a = await fixture({ store, id: "synthetic-a" });
  const b = await fixture({ store, id: "synthetic-b" });
  const args = draftArgs();
  const createdA = (await a.rpc("tools/call", { name: "draft_create", arguments: args }))
    .body.result.structuredContent.draft;
  assert.deepEqual(
    (await b.rpc("tools/call", { name: "draft_list", arguments: {} })).body.result
      .structuredContent.drafts,
    [],
  );
  const createdB = (
    await b.rpc("tools/call", {
      name: "draft_create",
      arguments: { ...args, title: "Different principal content" },
    })
  ).body.result.structuredContent.draft;
  assert.notEqual(createdA.id, createdB.id);
  assert.equal(
    code(
      (
        await b.rpc("tools/call", {
          name: "draft_list",
          arguments: { cursor: createdA.id },
        })
      ).body,
    ),
    "INVALID_CURSOR",
  );
  for (const type of ["box", "promotion"])
    await a.rpc("tools/call", {
      name: "draft_create",
      arguments: { ...draftArgs(), type },
    });
  const page1 = (
    await a.rpc("tools/call", { name: "draft_list", arguments: { limit: 2 } })
  ).body.result.structuredContent;
  assert.equal(page1.drafts.length, 2);
  assert.ok(page1.nextCursor);
  const page2 = (
    await a.rpc("tools/call", {
      name: "draft_list",
      arguments: { limit: 2, cursor: page1.nextCursor },
    })
  ).body.result.structuredContent;
  assert.equal(page2.drafts.length, 1);
  assert.equal(page2.nextCursor, undefined);
  assert.equal(
    (await a.rpc("tools/call", { name: "draft_list", arguments: { type: "promotion" } }))
      .body.result.structuredContent.drafts.length,
    1,
  );
});

test("audit failure rolls back draft and receipt, returns sanitized failure and permits safe retry", async () => {
  class FailingAuditStore extends MemoryStore {
    fail = true;
    override async insert<T>(kind: string, key: string, value: T) {
      if (kind === "mcp_audit" && this.fail) throw new Error("private-database-secret");
      return super.insert(kind, key, value);
    }
  }
  const store = new FailingAuditStore();
  const f = await fixture({ store });
  const args = draftArgs();
  const failed = await f.rpc("tools/call", { name: "draft_create", arguments: args });
  assert.equal(code(failed.body), "SERVICE_UNAVAILABLE");
  assert.equal(JSON.stringify(failed.body).includes("private-database-secret"), false);
  assert.equal((await store.list("mcp_drafts")).length, 0);
  assert.equal((await store.list("mcp_idempotency")).length, 0);
  const listing = await f.rpc("tools/list");
  assert.equal(listing.body.error.code, -32603);
  assert.equal(JSON.stringify(listing.body).includes("private-database-secret"), false);
  store.fail = false;
  assert.equal(
    (await f.rpc("tools/call", { name: "draft_create", arguments: args })).body.result
      .structuredContent.replayed,
    false,
  );
});

test("large and malformed HTTP input is rejected with safe errors; only draft collections can be mutated", async () => {
  class ObservedStore extends MemoryStore {
    kinds = new Set<string>();
    override async insert<T>(kind: string, key: string, value: T) {
      this.kinds.add(kind);
      return super.insert(kind, key, value);
    }
    override async atomic<T>(lock: string, operation: (tx: Records) => Promise<T>) {
      assert.ok(lock.startsWith("mcp:drafts:"));
      return super.atomic(lock, operation);
    }
  }
  const store = new ObservedStore();
  const f = await fixture({ store });
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${f.token}`,
  };
  const large = await fetch(f.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: "x".repeat(20_000) }),
  });
  assert.equal(large.status, 413);
  const invalid = await fetch(f.url, {
    method: "POST",
    headers,
    body: "{invalid-secret-content",
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.text()).includes("invalid-secret-content"), false);
  await f.rpc("tools/call", { name: "draft_create", arguments: draftArgs() });
  assert.deepEqual([...store.kinds].sort(), [
    "mcp_audit",
    "mcp_drafts",
    "mcp_idempotency",
  ]);
});

test("aggregate result excludes seeded user, email, visitor and raw activity identities", async () => {
  const f = await fixture({ scopes: ["analytics:read"] });
  await f.store.put("users", "private-user", {
    id: "private-user",
    email: "synthetic-private@example.invalid",
    createdAt: "2026-01-02T10:00:00Z",
    lastLoginAt: "2026-01-02T11:00:00Z",
  });
  await f.store.put("activity", "private-activity", {
    id: "private-activity",
    userId: "private-user",
    visitor: "private-visitor",
    type: "login",
    at: "2026-01-02T11:00:00Z",
  });
  const response = await f.rpc("tools/call", {
    name: "analytics_summary",
    arguments: { from: "2026-01-01T00:00:00Z", to: "2026-01-03T00:00:00Z" },
  });
  assert.equal(response.body.result.structuredContent.counts.newUsers, 1);
  assert.equal(response.body.result.structuredContent.counts.activeUsers, 1);
  for (const sensitive of [
    "private-user",
    "synthetic-private@example.invalid",
    "private-activity",
    "private-visitor",
  ])
    assert.equal(JSON.stringify(response.body).includes(sensitive), false);
});

test("per-identity draft cap preserves existing records and idempotent replays", async () => {
  const f = await fixture();
  const args = draftArgs();
  const first = await f.rpc("tools/call", { name: "draft_create", arguments: args });
  const draft = first.body.result.structuredContent.draft;
  for (let index = 1; index < 1000; index++) {
    const id = randomUUID();
    await f.store.put("mcp_drafts", id, { ...draft, id, owner: "synthetic-operator" });
  }
  assert.equal(
    code(
      (await f.rpc("tools/call", { name: "draft_create", arguments: draftArgs() })).body,
    ),
    "DRAFT_LIMIT",
  );
  assert.equal(
    (await f.rpc("tools/call", { name: "draft_create", arguments: args })).body.result
      .structuredContent.replayed,
    true,
  );
  assert.equal((await f.store.list("mcp_drafts")).length, 1000);
});

test("fixed request guard caps anonymous attempts independently of valid callers", async () => {
  const f = await fixture();
  for (let index = 0; index < 120; index++)
    assert.equal((await f.rpc("tools/list", {}, { authorization: "" })).status, 401);
  const rejected = await f.rpc("tools/list", {}, { authorization: "" });
  assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get("retry-after"), "60");
  assert.equal((await f.rpc("tools/list")).status, 200);
  assert.equal(
    (await f.store.list<McpAudit>("mcp_audit")).filter(
      (row) => row.principal === "anonymous",
    ).length,
    120,
  );
});

test("existing Nest API bootstrap serves MCP before cookie origin checks while preserving ordinary API boundaries", async () => {
  const { spawn } = await import("node:child_process");
  const { resolve } = await import("node:path");
  const script = `
    const assert = require('node:assert/strict');
    const { randomBytes, createHash } = require('node:crypto');
    const token = randomBytes(32).toString('base64url');
    process.env.MCP_ENABLED = '1';
    process.env.MCP_TOKEN_SHA256 = createHash('sha256').update(token).digest('hex');
    process.env.MCP_PRINCIPAL_ID = 'synthetic-bootstrap';
    process.env.MCP_SCOPES = 'analytics:read';
    const { start } = require(${JSON.stringify(resolve(__dirname, "../main.ts"))});
    (async () => {
      const app = await start();
      try {
        const port = app.getHttpServer().address().port;
        const base = 'http://127.0.0.1:' + port;
        const response = await fetch(base + '/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({jsonrpc:'2.0', id:1, method:'tools/list'}) });
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).result.tools.map(tool => tool.name), ['analytics_summary']);
        const unauthorized = await fetch(base + '/mcp', {method:'POST'});
        assert.equal(unauthorized.status, 401);
        const ordinary = await fetch(base + '/api/boxes/free', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({interest:'developer'})});
        assert.equal(ordinary.status, 403);
        assert.equal((await fetch(base + '/api/health')).status, 200);
      } finally { await app.close(); }
    })().catch(() => { console.error('Synthetic Nest MCP integration failed.'); process.exitCode = 1; });
  `;
  const child = spawn(process.execPath, ["--import", "tsx", "-e", script], {
    cwd: resolve(__dirname, "../../../.."),
    env: {
      ...process.env,
      TSX_TSCONFIG_PATH: resolve(__dirname, "../../tsconfig.json"),
      NODE_ENV: "development",
      PORT: "0",
      AI_MODE: "demo",
      PAYMENT_MODE: "demo",
      EMAIL_MODE: "demo",
      MONGODB_URI: "",
      APP_LIVE_TEST: "0",
      MCP_ALLOW_REMOTE: "0",
      MCP_ALLOWED_HOSTS: "localhost,127.0.0.1,[::1]",
      MCP_ALLOWED_ORIGINS: "",
    },
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 15_000,
  });
  let error = "";
  child.stderr.on("data", (chunk) => {
    error += chunk.toString();
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  assert.equal(exitCode, 0, error);
});
