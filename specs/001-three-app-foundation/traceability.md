# 需求 → 任务 → 验证追溯

记录时间：2026-10-14。状态基于接入时可读证据；本表不代替最终测试。每个 FR 均有任务和验收门槛。

| 需求                          | 用户故事  | 实现/验收任务                 | 关键文件/证据                               | 当前状态                                 |
| ----------------------------- | --------- | ----------------------------- | ------------------------------------------- | ---------------------------------------- |
| FR-001 四兴趣/16 工具         | US1       | T007,T012                     | catalog.ts；docs/qa/restoration-checks.json | 目录静态结构有证据，当前运行验收待补     |
| FR-002 工具数量/工作流        | US1/2     | T012,T017                     | domain.ts、providers/ai.ts；当前 API 测试   | 未整体验收                               |
| FR-003 价格/模式/费用边界     | US1/2     | T016,T018                     | config.ts、Web UI；UI/HTTP                  | Web 局部通过，完整流程待补               |
| FR-004 稳定幂等               | US1/2/3/5 | T008,T009,T013,T016,T021,T029 | store.ts、domain.ts；跨连接/重放测试        | 未整体验收                               |
| FR-005 支付权威验证           | US2       | T016,T018                     | paypal.ts、domain.ts；provider mock/HTTP    | provider 局部通过，真实调用未进行        |
| FR-006 OTP/会话               | US3       | T019,T022                     | domain.ts、main.ts；API/浏览器              | 未整体验收                               |
| FR-007 所有权/认领            | US3       | T020,T022                     | authz.ts、domain.ts；跨用户负例             | 未整体验收                               |
| FR-008 可访问英文 UI          | US1/4     | T014,T026,T032                | Web/Admin UI、Playwright                    | 单元/构建局部通过；浏览器仍待            |
| FR-009 失败/导航恢复          | US1/2/3   | T014,T018,T022                | Web 状态/浏览器用例                         | 未整体验收                               |
| FR-010 独立只读 Admin         | US4       | T004,T024,T026                | apps/admin；main.ts；组件 QA                | Admin 局部通过，后端集成待补             |
| FR-011 当前角色               | US4       | T024                          | authz.ts、admin-role.ts；撤销负例           | 未整体验收                               |
| FR-012 可信统计               | US4       | T025,T026                     | analytics.ts；窗口/去重/保留期测试          | 未整体验收                               |
| FR-013 邮件权限/幂等          | US3       | T021                          | email.ts、domain.ts；模拟/重放测试          | provider 局部通过，不真实发送            |
| FR-014 demo/Vercel 唯一       | 全部      | T006,T015,T017                | config/provider；RECOVERY.md                | 默认 demo；旧分支清理/集成未验收         |
| FR-015 MCP 默认关/能力        | US5       | T027,T028,T030                | API MCP 模块及契约                          | 实现/集成待完成                          |
| FR-016 MCP 主体/审计/幂等     | US5       | T028,T029,T030                | Draft/Audit 仓储与测试                      | 实现/集成待完成                          |
| FR-017 三应用独立 HTTP        | US6       | T004,T010,T031,T033           | 三 package.json、代理、runbook              | Web/Admin 构建局部通过；最终独立运行待补 |
| FR-018 Mongo 事务/恢复        | US6       | T007,T008,T009,T031           | store/migrate/seed、replica-set 日志        | 真实集成待完成                           |
| FR-019 工程规范/中文/验证     | US6       | T005,T031,T032,T034           | 格式/lint/类型/测试日志、中文 docs          | 文档已编写；最终聚合结果待补             |
| FR-020 原文/ADR/Spec Kit/诚实 | US6       | T001,T002,T003,T034,T035      | source-plan、ADR、.specify/upstream         | 工具/规格已落地，最终交付待核对          |

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
