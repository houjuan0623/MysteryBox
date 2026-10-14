# 变更记录

## 2026-10-14：最新技术栈要求

- 当前数据库改为MongoDB，覆盖原方案PostgreSQL选择。
- 恰好apps/web、apps/api、apps/admin三个应用。用户前台与管理端均Next.js，管理端使用shadcn/ui + Tailwind，NestJS后端；全部独立运行/构建/部署。
- 管理端新增第一方统计，服务端管理员角色保护。
- 真实AI唯一Vercel AI Gateway，demo仍默认，旧OpenAI直连从活跃配置移除。
- 选择官方mongodb驱动、replica-set多文档事务、唯一(kind,key)聚合和业务竞争guard。
- 明确禁止自动重试包含外部供应商调用的事务业务闭包。
- 工程质量约束新增/明确ESLint、Prettier、EditorConfig；检查状态待实际运行。
- 新增requirements、data-model和ADR-008，更新架构/接口/开发部署/验收。
- MongoDB真库、独立构建/部署与新集成测试尚未验证；旧测试不转记为通过。
- source-plan.md保持原文与已知SHA-256。

## 2026-10-14：主机替换后的恢复

恢复到MysteryBox-restoration。原方案从Library精确取回，16工具定义与中文文档语义重建。分阶段ZIP保存Library；文档显式区分恢复检查与历史工程结果。

## 历史设计与结果

早期工程使用PostgreSQL18.4测试fixture并曾报告API48/Web8/HTTP11通过；这些只记录在历史证据中，不是当前MongoDB方案或恢复工程的验收。本次不伪造CI、真实服务或生产部署结果。

## 2026-10-14 管理后端与真 Mongo 局部验证

- 已对齐 /api/me 别名、双精确来源、三个管理员报告、严格第一方 activity 接口及 grant/revoke 角色 CLI。
- 活动后台每小时清理超过 30 天记录，live 已完成付款按持久订单与 paidAt 计数，模拟/sandbox 另计；Box/账户也取必要记录。可选浏览事件不写账户 ID，统计不是净收入或完整付款账本。
- 当前 API 组件 65 项通过（含 MCP 13 项），MongoDB 8.0.17 真副本集另 1 项通过，扩展到真实 Nest HTTP 角色切换与 mongod 停启持久化。
- Web 单元 17、Admin 单元 5；原生 Web 浏览器 8/8、Admin UI/代理 6/6 通过，fixture 与真实后端验证明确区分。全部最终质量门禁与依赖审计仍在重新运行，真实供应商和生产未验证。

- 新增实际官方 Spec Kit 接入证据链接与现有 Nest 内默认关闭的 scoped MCP 边界；规格/模块局部成功不等于生产配置或外部自动化已执行。
