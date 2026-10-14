# 官方 Spec Kit 接入与推进方式

日期：2026-10-14。MysteryBox 已实际运行官方 github/spec-kit 的 CLI 初始化与脚本，固定版本 **1.2.0**。工具接入和规格化已完成；最新本地根门禁及既有浏览器用例通过，剩余验收覆盖与交付门槛有明确记录。

## 1. 官方来源与实际执行

- 官方项目：[github/spec-kit](https://github.com/github/spec-kit)。
- 固定发布：[v1.2.0](https://github.com/github/spec-kit/releases/tag/v1.2.0)，官方发布页日期 2026-10-13。
- 使用官方 PyPI `specify-cli==1.2.0`；[安装指南](https://github.github.io/spec-kit/installation.html)确认 PyPI 与 GitHub 都是官方渠道。
- 本地 Python 3.12.14、uv 0.12.23；`specify version --json` 实际返回 CLI 1.2.0。
- MIT 许可保存在 [.specify/upstream/LICENSE.spec-kit](../.specify/upstream/LICENSE.spec-kit)；初始化文件的 SHA-256 保存在 [manifest.json](../.specify/upstream/manifest.json)。

实际执行的核心命令如下；临时缓存/工具目录均设在可写的隔离目录，未全局安装或变更账户权限：

```bash
uvx --from specify-cli==1.2.0 specify version --json
uvx --from specify-cli==1.2.0 specify init mysterybox-spec-kit   --integration generic   --integration-options='--commands-dir .specify/commands/'   --script sh --non-interactive --ignore-agent-tools
```

初始化仅在空临时目录完成，之后逐路径确认目标不存在，再复制 `.specify/`。未在非空 MysteryBox 工作目录执行 `init --here --force`，未覆盖应用代码、已有 docs、package.json 或原始计划。官方 [已有工程指南](https://github.github.io/spec-kit/guides/existing-projects.html)说明 force 会替换冲突的受管路径，因此本次使用非覆盖导入。

版本、初始化与验证证据见 [.specify/upstream/execution.json](../.specify/upstream/execution.json) 和同目录日志。最初一次 uvx 因默认工具目录不可写而未运行 CLI；随后将 UV_CACHE_DIR/UV_TOOL_DIR 指向隔离可写目录后，正式固定版命令成功。

## 2. 安装内容与实际用法

已保留官方原始文件：6 个 Bash 脚本、5 个模板、10 个 generic 命令提示、集成/初始化元数据及 bundled SDD workflow。模板/脚本不经本地翻译或格式改写，方便哈希复查；项目产物另以中文填充。

Generic integration 的命令在 [.specify/commands/](../.specify/commands/)。它是官方支持的通用集成，并未向当前代理环境注册原生 Codex slash commands。若使用者的代理没有显示命令，可显式让代理读取对应命令文件并完成该阶段，不要把 `/speckit.*` 当 shell 命令。未来切换 native integration 时先审查会变更的文件，不能直接覆盖已有配置。

官方流程的项目产物对应：

| 阶段               | 本仓库产物/状态                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| constitution       | [.specify/memory/constitution.md](../.specify/memory/constitution.md)，v1.0.0                                                                        |
| specify            | [spec.md](../specs/001-three-app-foundation/spec.md)，20 个可追溯需求、6 个故事                                                                      |
| plan               | [plan.md](../specs/001-three-app-foundation/plan.md)，附 research/data-model/contracts/quickstart                                                    |
| checklist          | [requirements.md](../specs/001-three-app-foundation/checklists/requirements.md)，只评审需求质量                                                      |
| tasks              | [tasks.md](../specs/001-three-app-foundation/tasks.md)，完成与未完成分开                                                                             |
| analyze / converge | [traceability.md](../specs/001-three-app-foundation/traceability.md)、[convergence.md](../specs/001-three-app-foundation/convergence.md)，当前未收敛 |
| implement          | 核心实现已有验证，未覆盖验收仍开放；不声称工具接入自动实现应用                                                                                       |

官方 `resolve-template.sh`、`create-new-feature.sh`、`setup-plan.sh`、`setup-tasks.sh` 已实际运行。后续从仓库根校验：

```bash
SPECIFY_FEATURE=001-three-app-foundation bash .specify/scripts/bash/check-prerequisites.sh   --json --require-spec --require-tasks --include-tasks
```

本工作副本由 `.specify/feature.json` 的相对路径选定当前功能；该文件属于官方忽略的本机状态，不应依赖它被 Git 提交。干净检出时使用上面的 `SPECIFY_FEATURE=001-three-app-foundation` 显式选择功能。没有创建 Git 分支，也没有运行会创建 GitHub issue 的 taskstoissues 命令。

## 3. 本项目不可变更的边界

- 恰好 `apps/web`、`apps/admin`、`apps/api` 三个独立运行/构建/部署应用。
- 两前端使用 Next.js + shadcn/ui + Tailwind，动态交互支持 reduced-motion；Admin 只读第一方统计，API 检查角色。
- NestJS 持有认证、所有权、幂等、MongoDB、PayPal、AI、邮件。MongoDB 官方驱动 + replica set；原 PostgreSQL 方案保留原文，由 [ADR-008](adr-latest-stack.md) 覆盖。
- 真实 AI 唯一 Vercel AI Gateway，demo 默认；模型/密钥和授权门槛尚未关闭，不进行真实调用。
- MCP 留在 Nest 内，默认关闭，仅 scope 控制统计读取/草稿创建/列出，必须审计与幂等；不新增应用或自动化。
- 中文说明/关键注释、ESLint/Prettier/EditorConfig 与最新测试证据必须落实。

Spec Kit 自身提供的开发 MCP 和 bundled workflow 与 MysteryBox 业务 MCP 不同。本次只导入工具文件，未启动 Spec Kit MCP、未执行自动工作流、未安装额外扩展、未创建任何自动化或外部通信。

## 4. 当前结果和诚实边界

本次 Spec Kit 初始化本身不产生应用测试结论。后续已取得新 API/MCP 组件、真实 Mongo 副本集局部集成和浏览器复测证据，最终本地整仓门禁也已通过，已发布阶段 CI 通过；后续测试增量、真实服务和生产仍独立待验收；最新应用结果以[验收记录](acceptance.md)为准。规格阶段差距另见 [当前差距](../specs/001-three-app-foundation/convergence.md)，其中早期未完成标记须与后续实测逐项核对，不能自动视为通过。

官方前置脚本通过只证明文档/模板结构可用。规格质量清单的勾选只证明需求经过审查，不代表功能验收、真实供应商通过或生产部署成功。早期/最终 Library 快照和 GitHub 发布由相应已授权交付流程另行核对；本接入不自动执行发布。
