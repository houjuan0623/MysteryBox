# ADR-008：最新用户要求覆盖原方案数据库选择

状态：已接受的产品/架构要求；MongoDB实现和真实集成验收正在重新进行。
日期：2026-10-14。

## 决策来源与优先级

用户最新明确要求：NestJS后端、MongoDB数据库、能够独立运行/构建/部署的Next.js前端。这个要求覆盖原始规划文件中PostgreSQL的选择。source-plan.md作为历史输入原文保持不变，不修改、不删除，也不把历史方案误写成当前要求。

当前技术栈：

- 用户前台：apps/web，Next.js，独立进程/构建产物/部署单元。
- 管理端：apps/admin，Next.js + shadcn/ui + Tailwind，独立运行/构建/部署，第一方统计且服务端角色保护。
- 后端：apps/api，NestJS，独立HTTP API进程/构建产物/部署单元。
- 仓库恰好三个应用，管理端不是用户前台的一个页面。
- 真实AI唯一入口为Vercel AI Gateway；demo默认，不继续配置OpenAI直连。
- 持久化：MongoDB，官方Node.js mongodb驱动，需支持多文档事务的replica-set部署。
- 共享包：仅类型、契约和确需复用的服务端工具；不能让前端部署依赖后端运行代码或数据库。
- 演示：MemoryStore仍只限开发演示，不是生产数据库替代品。

## 并发与事务

使用文档聚合仓储和唯一复合(kind,key)约束，业务键竞争guard协调同订单/同验证码/同投递任务。不能把旧PostgreSQL advisory lock当作MongoDB原生能力。

官方Node驱动便利事务API具有自动重试行为，因此含PayPal、模型、邮件等外部操作的业务闭包不得交给自动重试机制。实现应显式区分事务重试、提交结果不确定与业务重放；先保存稳定外部幂等键，外部状态不明确时查询原订单，不能自动换key重新收费。[MongoDB Node事务文档](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/)

MongoDB standalone不能满足此多文档事务设计，需replica-set拓扑。生产拓扑、恢复能力和故障测试单独验收。[MongoDB事务生产注意事项](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)

## 前后端独立部署含义

Next.js和NestJS可共用仓库，但必须有独立dev/build/start命令与运行配置。Web 和 Admin 通过各自配置的 API_INTERNAL_URL 访问 API；API不需要启动Next就能提供接口。Web同源代理保留浏览器cookie/Origin体验，这不等于把业务API合并进前端。

部署 Web/Admin 不得携带 MongoDB、PayPal 秘密或 AI 密钥；API维护数据库和供应商凭据。PROXY_SHARED_SECRET 是 Web/Admin 与 API 间认证限流身份所需的明确共享秘密，单独配置。

## 后果与不做

- 旧SQL迁移、DATABASE_URL、Postgres镜像/测试不再是当前部署说明。
- 已确定MONGODB_URI、MONGODB_DB（默认mysterybox）、TEST_MONGODB_URI；db:init初始化索引/检查拓扑，db:seed写16工具。
- 旧API48/48、Web8/8、HTTP11/11和Postgres18.4测试全部只保留为历史。
- 必须新增真实MongoDB replica-set测试、独立前后端构建/启动测试。
- ESLint、Prettier、EditorConfig纳入工程约束；具体脚本以根package.json为准，未跑不能称通过。
- 不自动把旧数据库内容转入Mongo；若日后有真实用户数据，需另做映射、备份、核对和迁移授权。
