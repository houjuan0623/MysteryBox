# MysteryBox

AI 工具发现、Prompt 与工作流指导。三个独立应用，共享 TypeScript 契约：

| 应用 | 技术 | 本地端口 | 独立命令 |
|---|---|---:|---|
| `apps/web` | Next.js + shadcn/ui + Tailwind CSS | 3000 | `npm run dev -w @mysterybox/web` |
| `apps/admin` | Next.js + shadcn/ui + Tailwind CSS | 3001 | `npm run dev -w @mysterybox/admin` |
| `apps/api` | NestJS + MongoDB 官方驱动 | 4000 | `npm run dev -w @mysterybox/api` |

## 当前验收范围

本地验证与远端 CI 结果按对应代码版本分别记录，详见 [验收状态](docs/acceptance.md)。真实供应商调用和生产部署不在本轮本地验收范围。

## 启动

需要 Node.js 24 LTS。`npm ci` 后运行 `npm run dev` 启动 Web+API，另开终端运行 `npm run dev:admin`。默认 AI、支付、邮件均为本地模拟，不收款、不发邮件、不调用真实模型。管理员权限必须经服务端运维命令明确赋予，普通登录不能读取统计数据。

MongoDB 持久化：`docker compose up -d` 启动本地副本集，按 `.env.example` 配置 `MONGODB_URI`，再执行 `npm run db:init` 和 `npm run db:seed`。生产不允许内存数据库或模拟供应商。真实 AI 统一经 NestJS 调用 Vercel AI Gateway；密钥永远不进入 Web/Admin。

每个应用可用 `npm run build -w @mysterybox/<应用名>` 独立构建。`npm run check` 执行格式、lint、类型、单元、构建和 HTTP 验证；真 MongoDB 与浏览器验证单独记录执行环境。

## 文档与边界

- [文档索引](docs/README.md)、[最新需求](docs/requirements.md)、[验收状态](docs/acceptance.md)
- [原始方案](docs/source-plan.md) 逐字节保留；其中 PostgreSQL 是已被覆盖的历史选择，当前 MongoDB/三应用架构以 [ADR-008](docs/adr-latest-stack.md) 为准
- MCP 是 API 内部模块，默认关闭，提供最小统计/草稿工具，不自动发布内容或注册定时任务
- 购买内容是推荐与指导，不包含第三方工具订阅/许可证；模拟订单不是营收
- 新代码由旧主机保留的源码文本重建并逐阶段备份，原本未推送的 Git 对象没有找回。旧测试结果不冒充本轮验证

详细配置、安全边界、运维与实际已通过/待验证项目，请以验收文档为准。
