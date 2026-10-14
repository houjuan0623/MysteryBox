# MysteryBox

AI 工具发现与工作流指导：Next.js 用户前台与管理端 / NestJS API / MongoDB。英文产品界面，中文工程文档。

## 当前架构

- `apps/web`：Next.js 用户前台，使用 shadcn/ui 与 Tailwind CSS。
- `apps/admin`：独立的 Next.js 管理端，使用 shadcn/ui 与 Tailwind CSS。
- `apps/api`：NestJS HTTP API，使用 MongoDB 官方 Node.js 驱动。
- 持久化数据库为 MongoDB；多文档事务需要 replica set。未配置 `MONGODB_URI` 时的 MemoryStore 仅用于本地开发演示。

三个应用分别运行、构建和部署，通过 HTTP API 通信。当前仓库已包含 MongoDB 仓储与配置；真实 MongoDB 集成、完整端到端流程和生产部署仍需按 [验收记录](docs/acceptance.md) 验证。

[原始方案](docs/source-plan.md) 中的 PostgreSQL 是历史选择，原文保留用于追溯。当前数据库与三应用架构以 [ADR-008](docs/adr-latest-stack.md) 为准。

## 当前恢复状态

2026-10-14 云主机更换后，原本只存在旧主机的本地提交未能找回。项目正在从保留的源代码内容重建，并逐阶段同步此仓库及 Library 备份。旧主机测试结果不能视为本次恢复代码的验收结果。

当前为恢复中的开发版本。完成状态与新测试结果将写入 [验收记录](docs/acceptance.md)。源计划原文已完整恢复于 [docs/source-plan.md](docs/source-plan.md)。

本地模式全部采用模拟 AI / 支付 / 邮件；不收款、不发信、不调用真实模型。出售的是推荐与使用指导，不包含第三方工具许可或订阅。真实供应商和生产部署需要另行验收。
