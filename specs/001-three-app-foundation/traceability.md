# 需求 → 任务 → 验证追溯

记录时间：2026-10-14 08:24 UTC。已复核根门禁与浏览器最终日志；本表区分已通过检查与尚未覆盖的完整需求。每个 FR 均有任务和验收门槛。

| 需求                          | 用户故事  | 实现/验收任务                 | 关键文件/证据                               | 当前状态                                                                                      |
| ----------------------------- | --------- | ----------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| FR-001 四兴趣/16 工具         | US1       | T007,T012                     | catalog.ts；docs/qa/restoration-checks.json | 目录结构/四兴趣 Free、Mongo 16 工具/version 加载通过                                          |
| FR-002 工具数量/工作流        | US1/2     | T012,T017                     | domain.ts、providers/ai.ts；当前 API 测试   | 当前领域/provider 校验与 demo UI 通过；不代表真实 AI 输出已验证                               |
| FR-003 价格/模式/费用边界     | US1/2     | T016,T018                     | config.ts、Web UI；UI/HTTP                  | 服务端价格、全 demo Premium/界面通过；未真实收费                                              |
| FR-004 稳定幂等               | US1/2/3/5 | T008,T009,T013,T016,T021,T029 | store.ts、domain.ts；跨连接/重放测试        | Free/capture及真实Mongo MCP/OTP并发通过；scope和异输入负例有当前证据                          |
| FR-005 支付权威验证           | US2       | T016,T018                     | paypal.ts、domain.ts；provider mock/HTTP    | provider mock、同单 capture/待付款/超时通过；真实支付和完整 webhook 重放未验收                |
| FR-006 OTP/会话               | US3       | T019,T022                     | domain.ts、main.ts；API/浏览器              | OTP限时/限次/复用/退出及真实Mongo双连接单次消费通过；cookie属性矩阵未测                       |
| FR-007 所有权/认领            | US3       | T020,T022                     | authz.ts、domain.ts；跨用户负例             | 两账户隔离、匿名认领、收藏/历史/退出组件及 demo UI 通过                                       |
| FR-008 可访问英文 UI          | US1/4     | T014,T026,T032                | Web/Admin UI、Playwright                    | Web键盘/窄屏/reduced-motion及精确复制payload通过；OS剪贴板边界使用替身，Admin动态降级未专项测 |
| FR-009 失败/导航恢复          | US1/2/3   | T014,T018,T022                | Web 状态/浏览器用例                         | 刷新/加载防重、真Back/Forward、demo取消和503同键重试通过；标签页关闭/OTP中断矩阵未测          |
| FR-010 独立只读 Admin         | US4       | T004,T024,T026                | apps/admin；main.ts；组件 QA                | 独立构建/代理及真实Nest+Mongo三个管理路由授权通过；UI后端全链路仍为分层验证                   |
| FR-011 当前角色               | US4       | T024                          | authz.ts、admin-role.ts；撤销负例           | 三个路由guest401/member403/admin200/同会话撤销403通过；角色CLI未执行                          |
| FR-012 可信统计               | US4       | T025,T026                     | analytics.ts；窗口/去重/保留期测试          | 窗口/模式组件通过；真实Mongo跨连接去重/访客哈希/30天清理/重启结果通过                         |
| FR-013 邮件权限/幂等          | US3       | T021                          | email.ts、domain.ts；模拟/重放测试          | demo/HTML 转义/发送键/失败重试组件通过；不真实发送                                            |
| FR-014 demo/Vercel 唯一       | 全部      | T006,T015,T017                | config/provider；RECOVERY.md                | 活跃配置与工厂仅 demo/vercel；默认零网络 mock 通过；真实模型/凭据门槛未关闭                   |
| FR-015 MCP 默认关/能力        | US5       | T027,T028,T030                | API MCP 模块及契约                          | Nest /mcp、官方 SDK、3 工具/default-off/scope 测试通过；远程部署未验收                        |
| FR-016 MCP 主体/审计/幂等     | US5       | T028,T029,T030                | Draft/Audit 仓储与测试                      | 13项HTTP/语义测试及真Mongo12并发单draft/receipt、冲突、重启重放/列出/审计通过                 |
| FR-017 三应用独立 HTTP        | US6       | T004,T010,T031,T033           | 三 package.json、代理、runbook              | 三应用独立构建、API HTTP 启动通过；干净生产 start/部署演练待补                                |
| FR-018 Mongo 事务/恢复        | US6       | T007,T008,T009,T031           | store/migrate/seed、replica-set 日志        | 真单节点 replica-set 索引/竞争/回滚/mongod 重启通过；未知提交为合成故障测试                   |
| FR-019 工程规范/中文/验证     | US6       | T005,T031,T032,T034           | 格式/lint/类型/测试日志、中文 docs          | 当前根 lint/format/typecheck/API66/Web17/Admin5/构建/HTTP13 通过；浏览器18项有明确范围        |
| FR-020 原文/ADR/Spec Kit/诚实 | US6       | T001,T002,T003,T034,T035      | source-plan、ADR、.specify/upstream         | 官方工具/规格、原文 hash/ADR 与新日志完成；最终远端 CI/Library 交付待核对                     |

## 与既有需求编号对齐

- S01/S03/S04/S08 → FR-017，T004/T010。
- S02 → FR-018，T007–T009。
- S05 → FR-019，T005/T031。
- S06/S07 → FR-020，T002/T034。
- S09 → FR-010–012，T024–T026。
- S10 → FR-014，T006。
- 最新 MCP 要求 → FR-015/016，T027–T030。

## 成功标准映射

SC-001 → T004/T031/T033；SC-002 → T012/T017；SC-003 → T008/T009/T013/T016/T021；SC-004 → T019/T020/T024；SC-005 → T006/T015/T018/T021；SC-006 → T027–T030；SC-007 → T002/T003/T034。

关键既有资料：[需求](../../docs/requirements.md)、[组件证据](../../docs/qa/component-verification.json)、[provider 局部证据](../../apps/api/src/providers/RECOVERY.md)、[验收](../../docs/acceptance.md)。

## 当前验证总览

[最终本地证据](../../.specify/verification/current-evidence.json)：API 66 包含 MCP 13 与 Mongo 1，不能再次相加。Web12浏览器针对本地demo应用；Admin 6 是 5 fixture UI + 1 实际代理。详细未覆盖项见 [tasks.md 回填](tasks.md#2026-10-14-最终本地结果回填)。checkpoint e4c714e CI已绿；最终增量CI与生产另行验证。

08:18:43扩展真实Mongo生命周期1/1通过，关闭上轮MCP持久化、并发OTP、三个管理路由角色和统计去重/清理差距；详见 [新日志](../../.specify/verification/mongo-lifecycle-final.log)。Mongo MCP使用官方SDK InMemoryTransport+真Mongo，HTTP/Nest层由另外13项测试覆盖。
