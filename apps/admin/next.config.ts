import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import type { NextConfig } from "next";
// 本地统一使用仓库根目录的 .env；已导出的环境变量优先，不向浏览器暴露服务端配置。
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) loadEnvFile(rootEnv);
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 本地浏览器测试使用回环 IP；只增加明确的本机来源，不开放通配来源。
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@mysterybox/shared"],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
