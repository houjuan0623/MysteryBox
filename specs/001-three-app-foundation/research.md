# 研究与决策记录

日期：2026-10-14。这里只记录影响本功能的确定决策和未关闭门槛。

## R1：使用真正的官方 Spec Kit 工具

- 决策：固定官方 `specify-cli==1.2.0`，在隔离临时目录运行 `specify init`，使用 generic integration 与 Bash，之后只复制不存在的 `.specify/` 路径。
- 原因：已有代码正在恢复；不能对非空工程直接 `--force` 初始化而覆盖文件。
- 证据：[官方仓库](https://github.com/github/spec-kit)、[v1.2.0 发布页](https://github.com/github/spec-kit/releases/tag/v1.2.0)、[官方安装渠道](https://github.github.io/spec-kit/installation.html)、[已有工程指南](https://github.github.io/spec-kit/guides/existing-projects.html)。安装指南确认 PyPI `specify-cli` 是维护者发布的官方渠道。
- 结果：CLI 成功执行；模板/脚本随包初始化，不是自行仿写。已运行官方 feature、plan、tasks 与 prerequisite 脚本；完整执行证据见 [spec-kit.md](../../docs/spec-kit.md)。
- 替代方案：直接在工作目录 `init --here --force` 被弃用，以免破坏并行恢复代码。仅写同名 Markdown 的仿制方案不采用。

## R2：历史计划保持原文，MongoDB 按最新要求实现

- 决策：原计划的 PostgreSQL 不修改；当前使用 MongoDB 官方驱动与 replica set。
- 原因：历史输入必须可追溯，最新明确要求是当前交付标准。
- 证据：[ADR-008](../../docs/adr-latest-stack.md)、[原始计划](../../docs/source-plan.md)、[恢复 QA](../../docs/qa/restoration-checks.json)。
- 风险：standalone 不支持本方案多文档事务；必须测真实 replica set，不可用 MemoryStore 代替。

## R3：外部副作用和事务重试分离

- 决策：稳定业务键先持久化；数据库重试策略不自动重放 PayPal、AI、邮件。提交不确定时查询既有业务/供应商状态。
- 原因：数据库事务并不能回滚外部收款或邮件。
- 依据：[MongoDB Node.js 事务文档](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/)与现有 ADR。实际故障与竞争验证仍是开放任务。

## R4：真实 AI 仅 Vercel AI Gateway

- 决策：AI_MODE 仅 demo/vercel；真实模式需模型、密钥与授权门槛，默认不发起网络调用。
- 原因：最新用户要求覆盖历史 OpenAI 直连支持。
- 待办：初次规格检查仍看到 config.ts 中残留 openai 类型/字段/不可达分支，必须清理并重跑测试；这是实现差距，不是产品决策不明确。
- 上线门槛：真实模型及凭据选择尚未关闭；demo 可继续验收。

## R5：MCP 是 API 的受限入口

- 决策：在 Nest 内实现，默认关闭；仅统计读取与草稿创建/列出；scope、所有权、审计与幂等不可省略。
- 原因：不增加第四个应用，也不把草稿升级为外部发送或自动化。
- 待办：最终工具名称、传输挂载和测试日志以实现后的契约/验收更新为准；本文不把不存在的接口说成可用。
- 区分：Spec Kit CLI 自带的开发辅助 MCP 与 MysteryBox 业务 MCP 无关，本次未启动 Spec Kit MCP 服务。

## R6：验证结果分层

- 决策：保留已有 Web/Admin/provider 局部新结果，但数据库、认证、角色、MCP 与浏览器集成逐项重新验收。
- 原因：编译、UI 单元与代理 HTTP 均不能证明真实授权和数据库事务正确。
- 来源：[组件证据](../../docs/qa/component-verification.json)、[provider 恢复记录](../../apps/api/src/providers/RECOVERY.md)、[验收记录](../../docs/acceptance.md)。
