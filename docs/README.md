# MysteryBox 项目文档

> 恢复版（2026-10-14）：依据旧任务保留的正文与修订重建。除原始方案外不声明字节级一致；涉及实现的描述是应恢复的设计，需与恢复代码及新测试对齐。旧主机结果不证明本目录已通过验收。

文档语言：中文；产品界面：英文。MysteryBox 提供 AI 工具发现、Prompt 和场景工作流，不销售随机许可证、不含第三方订阅。

## 恢复优先说明

阅读 [恢复记录](restoration.md)。用户原方案已从 Library 精确恢复；其余文档与 16 条目录记录依据本任务保留内容重建。旧主机的 API 48/48、Web 8/8、HTTP 11/11 是历史结果；新文件必须重跑后才能声明通过。

## 阅读顺序

1. [产品需求与验证策略](prd.md)
2. [技术架构与决策](architecture.md)
3. [HTTP API 契约](api.md)
4. [开发与部署手册](runbook.md)
5. [安全与隐私威胁模型](security.md)
6. [路线图](roadmap.md)
7. [验收与历史验证记录](acceptance.md)
8. [工具目录来源](catalog-sources.md)
9. [用户原始方案](source-plan.md)

## 原始方案溯源

- 文件：AI Mystery Box 项目技术架构、商业模式与成本规划文档.md
- Library ID：libfile_d6a60c43ef90819186cc3091b42ad884
- 原文 UTF-8：6,729 字节
- SHA-256：b2cd871409b4099d5f521c5e7b9875317fc139c966d033f15789581871738180

source-plan.md 保留原文。原文中的示意品牌、模型、价格与成本估算不等于实际核验数据。

## 当前工程要求

最新用户要求为NestJS + MongoDB + 独立运行/构建/部署的Next.js用户前台和Next.js管理端（shadcn/ui + Tailwind）；恰好web/api/admin三个应用。真实AI仅通过Vercel AI Gateway，demo仍默认。原方案中的PostgreSQL只保留为历史，不是当前要求。

- [需求与工程约束](requirements.md)
- [最新技术栈ADR](adr-latest-stack.md)
- [MongoDB数据模型](data-model.md)
- [管理端与第一方统计](admin.md)
- [变更记录](changelog.md)
- [官方 Spec Kit 接入与实际执行证据](spec-kit.md)
- [Nest 内 scoped MCP 模块说明](../apps/api/src/mcp/README.md)

## 产品边界

- Free 默认 1 个工具；Premium 默认 3 个工具和组合工作流。
- 默认演示价 299 美分（USD 2.99），由服务端配置，不是正式定价决定。
- 购买的是推荐与使用指导，不含第三方账号、许可证、订阅或使用额度。
- 阶段 0：发现与交易演示；阶段 1：邮箱验证码账户、历史、收藏。
- 阶段 2 的订阅、社区、画像、Agent、自动增长仍延期。
- 本恢复任务没有执行真实付款、真实模型调用、发信、生产部署或第三方推广。
