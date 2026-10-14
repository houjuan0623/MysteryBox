import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const MCP_SCOPES = ["analytics:read", "drafts:read", "drafts:write"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];
export interface McpIdentity {
  id: string;
  scopes: readonly McpScope[];
}
export type McpConfig =
  | { enabled: false }
  | {
      enabled: true;
      tokenSha256: string;
      identity: McpIdentity;
      allowRemote: boolean;
      allowedHosts: readonly string[];
      allowedOrigins: readonly string[];
    };
const split = (value?: string) =>
  (value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const flag = z.enum(["0", "1"]);
const hostname = z
  .string()
  .max(253)
  .refine((value) => {
    if (value === "[::1]") return true;
    return /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i.test(value) && !value.includes("..");
  });
/** 显式开启且完整配置才注册路由；不生成、保存或颁发任何持久密钥。 */
export function readMcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  if (env.MCP_ENABLED === undefined || env.MCP_ENABLED === "0") return { enabled: false };
  if (!flag.safeParse(env.MCP_ENABLED).success)
    throw new Error("Invalid MCP_ENABLED configuration.");
  const remote = flag.safeParse(env.MCP_ALLOW_REMOTE || "0");
  const digest = z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .safeParse(env.MCP_TOKEN_SHA256);
  const principal = z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/)
    .safeParse(env.MCP_PRINCIPAL_ID);
  const scopes = z
    .array(z.enum(MCP_SCOPES))
    .min(1)
    .max(3)
    .safeParse(split(env.MCP_SCOPES));
  const hosts = z
    .array(hostname)
    .min(1)
    .max(20)
    .safeParse(split(env.MCP_ALLOWED_HOSTS || "localhost,127.0.0.1,[::1]"));
  const origins = split(env.MCP_ALLOWED_ORIGINS);
  const validOrigins =
    origins.length <= 20 &&
    origins.every((origin) => {
      try {
        const url = new URL(origin);
        return (
          origin === url.origin &&
          !url.username &&
          !url.password &&
          (url.protocol === "https:" ||
            (url.protocol === "http:" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
        );
      } catch {
        return false;
      }
    });
  if (
    !remote.success ||
    !digest.success ||
    !principal.success ||
    !scopes.success ||
    !hosts.success ||
    !validOrigins ||
    (remote.success && remote.data === "1" && !env.MCP_ALLOWED_HOSTS?.trim())
  ) {
    // 配置错误不回显环境变量，避免密钥/身份进入日志。
    throw new Error(
      "Enabled MCP requires valid token digest, principal, explicit scopes and host/origin configuration.",
    );
  }
  const allowedHosts = [...new Set(hosts.data.map((host) => host.toLowerCase()))];
  if (
    remote.data === "0" &&
    allowedHosts.some((host) => !["localhost", "127.0.0.1", "[::1]"].includes(host))
  ) {
    throw new Error("Local-only MCP requires loopback hosts.");
  }
  return {
    enabled: true,
    tokenSha256: digest.data.toLowerCase(),
    identity: { id: principal.data, scopes: [...new Set(scopes.data)] },
    allowRemote: remote.data === "1",
    allowedHosts,
    allowedOrigins: [...new Set(origins)],
  };
}
export function authenticateMcp(
  header: string | undefined,
  config: Extract<McpConfig, { enabled: true }>,
): McpIdentity | undefined {
  // 只接受独立 bearer，不沿用浏览器 cookie、管理员会话或可猜测演示身份。
  const match = /^Bearer ([A-Za-z0-9._~+/-]{32,512}=*)$/.exec(header || "");
  if (!match || match[1].length > 512) return undefined;
  const actual = createHash("sha256").update(match[1]).digest();
  const expected = Buffer.from(config.tokenSha256, "hex");
  return expected.length === 32 && timingSafeEqual(actual, expected)
    ? config.identity
    : undefined;
}
export function mcpRequestAllowed(
  request: { host?: string; origin?: string; remoteAddress?: string; forwarded: boolean },
  config: Extract<McpConfig, { enabled: true }>,
) {
  let host: string;
  try {
    if (!request.host || /[\s/@?#\\]/.test(request.host)) return false;
    host = new URL(`http://${request.host}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!config.allowedHosts.includes(host)) return false;
  if (request.origin && !config.allowedOrigins.includes(request.origin)) return false;
  if (
    !config.allowRemote &&
    (request.forwarded ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.remoteAddress || ""))
  )
    return false;
  return true;
}
