import { randomUUID } from "node:crypto";
import { Router, json, type Request, type Response, type NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  authenticateMcp,
  mcpRequestAllowed,
  readMcpConfig,
  type McpConfig,
  type McpIdentity,
} from "./config";
import { createMcpServer, recordMcpAudit, type McpDependencies } from "./service";
export { readMcpConfig } from "./config";
export const MCP_PATH = "/mcp";
const reply = (res: Response, status: number, message: string) =>
  res.status(status).json({ jsonrpc: "2.0", id: null, error: { code: -32000, message } });

/** 在 API 的普通 cookie/origin 中间件之前挂载。无独立端口、应用、后台任务或公开演示令牌。 */
export function attachMcp(
  app: { use(path: string, handler: ReturnType<typeof Router>): unknown },
  dependencies: McpDependencies,
  config: McpConfig = readMcpConfig(),
) {
  if (!config.enabled) return;
  const router = Router();
  // 两个固定桶（已授权/匿名），不储存IP；单进程120次/分钟，生产入口还需独立限流。
  const buckets = { authorized: { at: 0, count: 0 }, anonymous: { at: 0, count: 0 } };
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.locals.mcpRequestId = randomUUID();
    try {
      const identity = authenticateMcp(req.get("authorization"), config);
      const bucket = buckets[identity ? "authorized" : "anonymous"];
      if (Date.now() - bucket.at >= 60_000) {
        bucket.at = Date.now();
        bucket.count = 0;
      }
      if (++bucket.count > 120) {
        res.setHeader("Retry-After", "60");
        reply(res, 429, "MCP request limit reached.");
        return;
      }
      const allowed = mcpRequestAllowed(
        {
          host: req.get("host"),
          origin: req.get("origin"),
          remoteAddress: req.socket.remoteAddress,
          forwarded: ["forwarded", "x-forwarded-for", "x-forwarded-host"].some(
            (header) => req.get(header) !== undefined,
          ),
        },
        config,
      );
      if (!allowed || !identity) {
        await recordMcpAudit(dependencies.store, {
          principal: identity?.id || "anonymous",
          requestId: res.locals.mcpRequestId,
          action: "access",
          outcome: "denied",
          code: allowed ? "UNAUTHORIZED" : "BOUNDARY_REJECTED",
        });
        if (allowed) res.setHeader("WWW-Authenticate", 'Bearer realm="mysterybox-mcp"');
        reply(
          res,
          allowed ? 401 : 403,
          allowed
            ? "MCP bearer authentication required."
            : "MCP request boundary rejected.",
        );
        return;
      }
      res.locals.mcpIdentity = identity;
      next();
    } catch {
      reply(res, 503, "MCP is temporarily unavailable.");
    }
  });
  router.use(json({ limit: "16kb", strict: true }));
  router.post("/", async (req: Request, res: Response) => {
    const server = createMcpServer(
      dependencies,
      res.locals.mcpIdentity as McpIdentity,
      res.locals.mcpRequestId,
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 16_384,
    });
    let closed = false;
    const close = () => {
      if (!closed) {
        closed = true;
        void server.close().catch(() => undefined);
      }
    };
    res.once("close", close);
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) reply(res, 503, "MCP is temporarily unavailable.");
      else res.end();
      close();
    }
  });
  router.all("/", (_req, res) => {
    res.setHeader("Allow", "POST");
    reply(res, 405, "Only POST is supported by this stateless MCP endpoint.");
  });
  router.use((_req, res) => {
    reply(res, 404, "MCP endpoint not found.");
  });
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const tooLarge =
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large";
    void recordMcpAudit(dependencies.store, {
      principal: (res.locals.mcpIdentity as McpIdentity | undefined)?.id || "anonymous",
      requestId: res.locals.mcpRequestId,
      action: "protocol",
      outcome: "invalid",
      code: tooLarge ? "BODY_TOO_LARGE" : "INVALID_JSON",
    })
      .then(() =>
        reply(
          res,
          tooLarge ? 413 : 400,
          tooLarge ? "MCP request exceeds 16 KiB." : "Invalid MCP JSON request.",
        ),
      )
      .catch(() => reply(res, 503, "MCP is temporarily unavailable."));
  });
  app.use(MCP_PATH, router);
}
