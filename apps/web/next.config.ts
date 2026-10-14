import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import type { NextConfig } from "next";
// 本地统一使用仓库根目录的 .env；已导出的环境变量优先，不向浏览器暴露服务端配置。
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) loadEnvFile(rootEnv);
const config: NextConfig = {
  transpilePackages: ["@mysterybox/shared"],
  poweredByHeader: false,
  reactStrictMode: true,
};
export default config;
