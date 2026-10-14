# 功能推进与验证入口

日期：2026-10-14。下面的应用命令来自当前仓库；完整环境、Mongo replica-set 和风险说明见 [运行手册](../../docs/runbook.md)。真实 provider 门槛保持关闭。

## 1. 读取规格并验证官方工具前置条件

从仓库根运行：

```bash
SPECIFY_FEATURE=001-three-app-foundation bash .specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
```

成功只代表文档前置文件存在，不代表产品功能通过。官方 generic 命令在 `.specify/commands/`；当前代理不自动注册这些 slash commands，可显式要求代理阅读对应提示文件再执行当前阶段。不要把 `/speckit.*` 当作终端命令。

## 2. 分别启动与构建

```bash
npm ci
npm run dev -w @mysterybox/api
npm run dev -w @mysterybox/web
npm run dev -w @mysterybox/admin
```

三个 dev 命令分别在独立终端运行，默认端口 API 4000、Web 3000、Admin 3001。分别执行：

```bash
npm run build -w @mysterybox/api
npm run build -w @mysterybox/web
npm run build -w @mysterybox/admin
```

三个应用各有 start 脚本。配置准确要求以各自 README/.env.example 和当前运行手册为准；不能把示例秘密用于部署，也不能为了启动而打开真实供应商模式。若 production 模式要求真实 provider，必须先完成授权和配置门槛，不能用 demo 冒充上线。

## 3. MongoDB 与无真实供应商的测试

使用测试用 replica set 和隔离测试库，设置 TEST_MONGODB_URI；不要指向生产数据库。索引和 seed 按 runbook 执行。真实 Mongo 测试必须报告版本、拓扑、退出码、跳过数量和失败，不可只测内存。

```bash
npm run typecheck
npm test
npm run build -w @mysterybox/api
npm run build -w @mysterybox/web
npm run build -w @mysterybox/admin
npm run test:http
```

根聚合命令和 lint/format 脚本可能仍在恢复整合；执行前检查 package.json，缺少脚本记录为开放任务，不能假定 npm run check 已覆盖 Admin。浏览器与真实后端集成另行运行并保留日志。

## 4. 按任务实现与回填证据

读取 [tasks.md](tasks.md)，每次只勾选其完整描述已经满足的任务。更新 [traceability.md](traceability.md) 与 [convergence.md](convergence.md)，记录当前代码、命令、时间、通过/失败/阻塞。真实 provider 调用、生产部署、GitHub 写入和备份发布不由本入口自动执行。
