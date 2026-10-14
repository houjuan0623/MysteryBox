# Implementation Plan: MysteryBox 三应用恢复与安全集成

**Branch**: `001-three-app-foundation`（功能标识，未创建 Git 分支） | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: [功能规格](spec.md)、[宪章](../../.specify/memory/constitution.md)、[最新栈 ADR](../../docs/adr-latest-stack.md)。此计划描述目标实现；状态见 tasks 和 convergence，不以代码文件存在作为验证。

## Summary

在已恢复代码上补齐三个独立应用与安全业务闭环。用户前台、只读 Admin 分别为 Next.js + shadcn/ui + Tailwind；NestJS 持有认证、所有权、幂等、MongoDB、PayPal、Vercel AI Gateway、邮件及默认关闭的 MCP。先完成持久化和授权底座，再验证端到端、失败恢复与交接。demo 可以独立验收；真实供应商与生产部署另设门槛。

## Technical Context

**Language/Version**: TypeScript；仓库 Node.js 引擎为 >=24 <25，准确依赖以 package-lock.json 为准。

**Primary Dependencies**: 两个 Next.js 16 应用、React 19、shadcn/ui/Radix/Tailwind、NestJS 12、官方 mongodb Node.js driver、Zod。

**Storage**: MongoDB replica set，多文档事务与唯一 `(kind,key)`；MemoryStore 仅限 demo。原计划 PostgreSQL 仅保留为历史，不再作为当前部署路径。

**Testing**: TypeScript、Node test/tsx、真实 replica-set 测试、HTTP smoke、Playwright、ESLint、Prettier；官方 Spec Kit 前置检查与模板来源校验。

**Target Platform**: 三个独立 Node.js 服务；浏览器通过各自同源代理访问配置的 API 地址。

**Project Type**: npm workspace monorepo；恰好三个部署应用和共享契约包。

**Performance Goals**: 当前没有已授权的吞吐/SLA 指标；记录测试环境与时延，不虚构性能承诺。业务请求必须有有界正文、超时、速率和输入限制。

**Constraints**: 不真实收费/发信/推理；不生成或扩大持久访问凭据；不自动迁移生产数据；不把临时初始化覆盖既有代码。

**Scale/Scope**: 四兴趣、16 工具、Free/Premium、邮箱账户、历史/收藏/认领、只读管理统计、3 类受限 MCP 能力。

## Constitution Check

设计层一致，不等于运行门槛通过。

| 原则            | 设计检查                                         | 运行门槛                                                |
| --------------- | ------------------------------------------------ | ------------------------------------------------------- |
| I 用户要求/追溯 | 原文保留，ADR 覆盖数据库；FR/任务/证据映射       | 待最终源计划 hash 和整体报告复查                        |
| II 独立/权威    | 三应用，API 拥有角色/金额/所有权                 | Web/Admin 局部通过；独立联调与服务端角色测试待补        |
| III 事务/幂等   | Mongo 官方驱动/replica set，外部副作用不自动重放 | 真实 Mongo 回滚/竞争/不确定提交待补                     |
| IV demo/权限    | Vercel 唯一路由，MCP 默认关且不发送              | 旧 OpenAI 分支清理、MCP 集成待补；真实调用门槛保持关闭  |
| V 质量/验证     | 中文工程、动态降级、分层证据                     | 类型/单元/构建局部证据已记录；整体 lint/格式/浏览器待补 |

任何门槛不满足时，保留开放任务。不得为方便验收删减安全检查。

## Project Structure

### Documentation (this feature)

```text
specs/001-three-app-foundation/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/README.md
├── tasks.md
├── traceability.md
├── convergence.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
apps/web/       # Next 用户前台，默认 3000
apps/admin/     # 独立 Next 只读管理端，默认 3001
apps/api/       # Nest 业务 API，默认 4000；MCP 留在此服务
packages/shared/ # 前后端类型和 HTTP 契约，不泄露数据库/供应商秘密
.specify/       # 官方工具、模板、命令、宪章和来源
```

## Phase 0: 证据与决策

1. 读取最新用户要求、保留原始 source-plan，按 ADR 确认 MongoDB 覆盖 PostgreSQL。
2. 官方 specify-cli 1.2.0 在隔离目录初始化，复制缺失路径，保留脚本模板、MIT 许可、版本和 SHA-256。
3. 读取当前 QA 记录，区分 worker 报告、原始日志和历史结果。
4. 将真实供应商模型/凭据、生产基础设施列为上线门槛，demo 不为此停工。

研究决策与来源见 [research.md](research.md)。

## Phase 1: 契约与状态机

- API 请求使用严格校验，金额与身份由服务端决定；Web/Admin 代理固定上游和允许路由。
- Mongo 仓储与业务键 guard 分离；事务重试和外部副作用重放分离；不确定提交不变更外部业务键。
- 认证与角色检查从持久状态读取，角色撤销即时生效；匿名认领必须证明原资源持有权。
- Admin 第一方事件最小化、去重、UTC 统一窗口及保留期，demo/sandbox/live 明确分离。
- MCP 仅提供 scope 控制的统计读取和草稿创建/列出，写入需要幂等，操作记录脱敏审计。

[数据模型](data-model.md)与[接口契约](contracts/README.md)给出安全不变量；已有 docs/api.md 是 HTTP 路由详情来源。

## Phase 2: 实现顺序与并行边界

1. 底座：当前配置清理、Mongo 索引/seed、事务/幂等、三应用脚本和质量工具。
2. 业务安全：OTP、所有权、支付/邮件状态恢复；Admin 角色和统计。
3. 可并行的叶子工作：Web 视觉/交互、Admin 只读 UI、provider 单元、规格/中文文档。
4. MCP 在同一 Nest 服务内实现；不可通过新应用或发送工具扩大范围。
5. 集成：新恢复代码完整检查、真实 Mongo、HTTP、浏览器、独立启动、证据与快照。

## Complexity Tracking

- 同仓三应用是明确要求，不合并成单个 Next 应用。
- 事务和外部副作用状态机是防止重复收费/邮件的必要复杂度，不能用“一次数据库 transaction”掩盖外部不确定性。
- Generic Spec Kit integration 将命令保留于 `.specify/commands/`，避免改写已有代理环境；没有声称 Codex 原生 slash command 自动注册。

## 当前验收基线

Web 12/12、Admin 5/5 和代理 HTTP 1/1、provider/budget 33 项，以及 Web/Admin 构建是已有局部报告；准确证据与局限见 [convergence.md](convergence.md)。新变化后须重跑。API/Mongo/Admin 后端/MCP 整体集成未标为完成。
