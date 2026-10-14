# Tasks: MysteryBox 三应用恢复与安全集成

**Input**: [plan.md](plan.md)、[spec.md](spec.md)、[research.md](research.md)、[data-model.md](data-model.md)、[contracts](contracts/README.md)

**Prerequisites**: 官方模板解析及 feature/plan/tasks 脚本已执行。当前根门禁和浏览器用例通过；未覆盖的验收条件保持开放。

**Tests**: 本功能明确要求测试。旧主机报告不算当前结果；测试存在也不代表测试通过。

**Organization**: 按共享底座与用户故事组织。`[x]` 只覆盖该任务完整描述；标注“局部”的任务不代表整个故事完成。

## Format: `[ID] [P?] [Story] Description`

`[P]` 表示不与其他任务写同一文件且前置条件满足时可并行。`[USn]` 对应 spec 的用户故事。每个任务均含路径或证据目标。

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 在隔离目录运行官方 specify-cli 1.2.0 初始化，非覆盖合并 `.specify/`，保留官方许可/哈希/命令证据于 `.specify/upstream/`。
- [x] T002 保留 `docs/source-plan.md` 原文及既有 SHA-256，引用 `docs/adr-latest-stack.md` 说明新 MongoDB 与三应用要求。
- [x] T003 按官方模板完成 `.specify/memory/constitution.md` 与 `specs/001-three-app-foundation/` 规格、设计、契约、质量清单和任务追溯。
- [ ] T004 [US6] 在根 `package.json`、三应用 package.json 与部署说明核对 dev/build/start、聚合检查和恰好三应用，保存独立运行证据。
- [x] T005 [P] [US6] 完成 ESLint、Prettier、EditorConfig 配置和中文关键注释，并保存当前 lint/format/typecheck 结果；不得格式化原始 `docs/source-plan.md`。

## Phase 2: Foundational (Blocking Integration Prerequisites)

- [x] T006 在 `apps/api/src/config.ts` 和 provider contracts 清理全部活跃 OpenAI 直连模式/字段/分支，验证 AI_MODE 仅 demo/vercel 与默认拒绝真实调用。
- [x] T007 在 `apps/api/src/store.ts`、migrate.ts、seed.ts 完成 MongoDB 官方驱动、replica-set 拓扑检查、唯一 `(kind,key)`、索引与 16 工具 seed。
- [x] T008 在 `apps/api/src/store.ts`、domain.ts 完成跨连接 guard、回滚与提交不确定状态；外部副作用不得随事务闭包自动重放。
- [x] T009 在 `apps/api/test/` 运行真实 replica-set 索引、唯一键、竞争、回滚、进程重启持久化及未知提交恢复测试，保留当前日志和跳过数。
- [x] T010 在 `apps/api/src/main.ts`、config.ts、两 Next 代理中完成固定 HTTP 上游、来源/会话/代理秘密边界并验证负例。

**Checkpoint**: Mongo 底座、扩展生命周期及本地根门禁已通过；UnknownTransactionCommitResult 使用合成故障验证。不得将单节点事务/重启扩大为多节点或生产灾备证明。

## Phase 3: User Story 1 - Free 推荐与交互 (Priority: P1)

**Goal**: 获取 1 个可信工具和具体指导，支持重复/失败恢复。

**Independent Test**: 全 demo 四兴趣、非法输入、同 key 并发、复制/导航/键盘和 reduced-motion。

- [x] T011 [US1] 保存 Web 当前局部类型/12 单元/独立构建报告到 `docs/qa/component-verification.json`；范围只限报告时间对应代码。
- [x] T012 [US1] 在 `apps/api/src/catalog.ts`、domain.ts 及当前测试验证四兴趣覆盖、Free 1 工具、Prompt/步骤与严格输出校验。
- [ ] T013 [US1] 在 `apps/api/test/` 与 `scripts/http-smoke.mjs` 验证同 key 重试/并发、异输入冲突、非法输入和所有者绑定。
- [ ] T014 [P] [US1] 在 `apps/web/` 浏览器测试验证英文 UI、移动布局、键盘焦点、真实复制、reduced-motion、刷新/关闭/Back/Forward 与失败重试。

## Phase 4: User Story 2 - Premium 与支付恢复 (Priority: P1)

**Goal**: 服务端权威订单与 3 工具工作流，不重复收费/交付。

**Independent Test**: 模拟 provider + 真实 Mongo 的创建、capture、取消、webhook 重放、超时/未知状态。

- [x] T015 [P] [US2] 保存 provider/budget 33 项局部通过及真实调用零次的记录于 `apps/api/src/providers/RECOVERY.md`；不宣称最新接口集成通过。
- [ ] T016 [US2] 在 domain.ts/paypal.ts 验证服务端价格/商户/币种/归属、稳定外部键、重复 capture/webhook 和未确认状态。
- [x] T017 [US2] 在 domain.ts/ai.ts 及测试验证 Premium 3 工具去重、目录约束、workflow 引用校验和失败不伪装成功。
- [ ] T018 [US2] 在 `apps/web/` 当前浏览器/HTTP 测试验证支付返回、取消、关闭、恢复与 demo 标识，不调用真实 PayPal/AI。

## Phase 5: User Story 3 - 账户与个人内容 (Priority: P1)

**Goal**: OTP 登录、匿名认领、历史/收藏与退出始终守住所有权。

**Independent Test**: 两用户加匿名主体；并发验证码消费、过期、跨所有者、退出及邮件重复。

- [ ] T019 [US3] 在 domain.ts/main.ts 及真实存储测试验证 OTP 限时/限次/并发单次消费、安全 cookie 与退出失效。
- [ ] T020 [US3] 在 domain.ts/authz.ts 及测试验证匿名认领、历史、收藏和付费内容的跨所有者负例。
- [ ] T021 [US3] 在 email.ts/domain.ts 验证用户请求/同意、稳定发送键、状态恢复及 demo 不真实发信。
- [ ] T022 [P] [US3] 在 `apps/web/` 浏览器测试验证 OTP 中断、认领、历史、收藏增删和退出后的状态。

## Phase 6: User Story 4 - 独立只读 Admin (Priority: P2)

**Goal**: 管理员独立访问第一方报表，角色和指标真实。

**Independent Test**: 未登录/member/admin、撤销角色后旧会话、UTC 边界、去重、保留期及模拟收入。

- [x] T023 [P] [US4] 保存 Admin 5 单元、类型、独立构建及代理 HTTP 1 项局部结果于 `docs/qa/component-verification.json`；保留浏览器未执行/受阻说明。
- [ ] T024 [US4] 在 authz.ts/admin-role.ts/main.ts 真实 API 集成验证默认 member、admin 读取、客户端 role 不赋权及撤销后旧会话失权。
- [ ] T025 [US4] 在 analytics.ts 与真实 Mongo 测试验证用户/访客指标、UTC 默认 7 天/最多 31 天、事件去重、无数据、模式分类、最小字段和 30 天清理。
- [ ] T026 [P] [US4] 在 `apps/admin/` 浏览器/独立启动测试验证只读报表、错误/空态、键盘/移动/reduced-motion；Web 停机不影响 Admin 连接 API。

## Phase 7: User Story 5 - 默认关闭的受限 MCP (Priority: P2)

**Goal**: 同一 Nest 内完成受 scope 控制的统计读取和草稿创建/列出，具备审计与幂等。

**Independent Test**: 默认关闭、凭据、scope、未知工具、跨主体、同写键并发/冲突、正文上限与审计脱敏。

- [x] T027 [US5] 在 `apps/api/src/` 内实现 MCP 配置、挂载与验证；更新 `contracts/README.md` 的最终协议/工具/schema/scope 名称，不创建第四应用。
- [x] T028 [US5] 为统计读取、草稿创建/列出实现最小权限和主体隔离；不能调用发送/收费/执行/自动化能力。
- [x] T029 [US5] 为草稿写入实现持久幂等和异输入冲突，为成功/拒绝/失败记录脱敏审计。
- [x] T030 [US5] 在 `apps/api/test/` 运行完整 MCP 正负例和 Mongo 持久化测试，核对允许工具全集恰好为约定三类能力。

## Phase 8: User Story 6 与完整交付 (Priority: P1)

- [x] T031 [US6] 在当前最终代码上重跑三应用类型、全部单元/契约、构建、HTTP 与真实 Mongo 测试，将原始日志保存于 `docs/qa/`。
- [ ] T032 [US6] 完成 Web/Admin 真浏览器验收；若环境阻塞则准确记录失败阶段，不以 mock/HTTP 代替浏览器结果。
- [ ] T033 [US6] 按干净环境复核 `docs/runbook.md` 的安装、demo 启动、索引/seed、三个独立部署单元与恢复说明。
- [x] T034 [US6] 更新 `traceability.md`、`convergence.md`、`docs/acceptance.md`，记录最终结果和未关闭真实 provider/生产门槛。
- [ ] T035 [US6] 按已授权发布流程产生早期/最终 Library 源码快照；GitHub 写入仅由指定发布任务执行并核对远端 commit/CI，不由本规格脚本操作。

## Dependencies & Execution Order

- T001–T003 → 官方前置/设计基础。T004–T010 → 新集成基线。
- US1/US2/US3 的后端验证依赖 T006–T010；UI 叶子和 provider mock 可以并行，但不是端到端替代。
- US4 依赖认证、Mongo 和事件入口；US5 依赖授权、Mongo、幂等和统计能力。
- T031–T035 在最终集成代码冻结后执行；后续变更需重跑受影响检查。
- 真实 Vercel/PayPal/邮件与生产部署在用户授权/凭据门槛关闭后才可开始，当前不执行。

## Implementation Strategy

先守住持久化/身份/副作用边界，再以 US1 提供可验证 demo，逐个叠加购买、账户、管理与 MCP。每个故事均需正负例。最新需求变更先更新规格和 ADR，再修改实现；不能让任务列表落后于架构。

## Notes

已勾选 T011/T015/T023 表示局部证据已保存，而非那些组件永远无需重测。上次结果晚于/早于代码变更需明确核对。当前本地门禁通过，整体需求覆盖仍未收敛；真实调用与生产仍未验收。

## 2026-10-14 最终本地结果回填

[原始日志与摘要](../../.specify/verification/current-evidence.json)：根 check 退出 0；API 66/66（含 MCP 13 与真实 Mongo 1，0 跳过）、Web 单元 17、Admin 单元 5、HTTP 13。lint/format/typecheck 和三应用构建通过。最终浏览器重跑 Web 12/12、Admin 6/6，均在 shadcn CSS 本地化之后；Admin 为 5 fixture UI + 1 真代理。审计 0 已知漏洞不等于源码安全证明。

以下为原开放任务逐项回填，完整目标不因结果不足而缩短；已关闭项目会明确注明：

- T004/T033：独立构建与开发/测试服务运行已有证据，干净环境下三个生产 start/部署单元演练仍缺。
- 已关闭 T009：真Mongo索引/竞争/回滚/capture/完整重启及合成UnknownTransactionCommitResult回调不重放测试通过。真实网络分区/多节点灾备属于未执行的生产验证范围，不据此扩大已完成测试结论。
- T013：Free 同键并发、异输入冲突和 HTTP 有证据；完整非法输入及跨主体幂等负例矩阵未覆盖。
- T014/T018/T022/T032：最终12个Web用例已覆盖精确复制payload、Back/Forward、demo取消/回编辑和提交后503同键重试；系统剪贴板为边界替身，标签页关闭/OTP中断等剩余矩阵未覆盖。Admin仍为5个fixture UI+1个实际代理。
- T016：金额/商户/币种、同单 capture、pending/timeout 和签名 mock 有证据；完整 webhook 重复/恢复集成及供应商真实调用未测。
- T020/T021：两账户历史/收藏/认领和邮件失败重试组件通过；付费内容跨用户、邮件入口同意/归属的完整HTTP负例仍未覆盖。
- T019：OTP过期/限次/复用/退出通过；08:18:43新增真实Mongo双连接并发兑换，恰好一个成功/会话、另一个INVALID_CODE。cookie安全属性专项断言仍未覆盖。
- T024：08:18:43已关闭真实Nest+Mongo全部summary/users/events路由guest401/member403/admin200/同会话撤销403矩阵；admin:role CLI仍未执行。
- T025：窗口/模式组件通过；08:18:43新增真实Mongo跨连接事件去重、访客哈希、31天事件清理、近期事件保留和重启后结果确认。完整指标窗口组合仍主要由组件测试覆盖。
- T026：Admin fixture UI/真代理通过；完整 Admin 浏览器→真实 Nest/Mongo、Web 停机及 Admin reduced-motion 断言未覆盖。
- 已关闭 T030：MCP13项HTTP/Nest/语义测试，加08:18:43真实MongoSDK生命周期通过：两连接12并发创建仅一draft/receipt、异输入冲突、success/replay/conflict审计、完整mongod重启后重放/列出/审计持久化。Mongo测试使用官方SDK InMemoryTransport，HTTP层单独验证；不冒称远程部署。
- T035：指定发布流程正在处理稳定 checkpoint，远端提交与 CI、最终 Library 快照均不得由本地通过推定完成。

T006 完成的是应用活跃配置/工厂的 demo/vercel 限制。ai.ts 中仍保留历史 OpenAiProvider 类及隔离单元测试，provider contracts 有兼容字段；config 不加载其环境变量、工厂不导出/选择该类，不能据此声称仓库中完全没有 OpenAI 字样。

### 08:18:43 Mongo扩展复核

[原始日志](../../.specify/verification/mongo-lifecycle-final.log)1/1、0失败/0跳过；该1项是扩展已有Mongo用例，不应在API66之外再当作新增功能数量相加。08:20:24最终根check已包含扩展用例并全部通过。当前不扩大验收范围，未执行的生产/运维项目明确留作后续条件。

### 冻结说明

08:22:25 Web12/12、08:22:30 Admin6/6最终重跑均退出0；根check为API66+Web17+Admin5=88项，HTTP13另计。最新字段/日志见 [冻结结果](convergence.md)。本轮不继续扩大覆盖；未勾选复合任务保留其未验证部分，不能解释为已测功能仍未实现。checkpoint e4c714e CI成功；最终发布增量/CI仍由指定发布任务核对。
