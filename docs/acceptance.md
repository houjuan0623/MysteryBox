# 验收清单与历史验证记录

> 恢复版（2026-10-14）：根据旧任务正文与修订重建。下述代码/接口为恢复目标，需对照新工程验证。历史通过记录不等于当前恢复目录通过。

当前数据库与前后端独立要求见[ADR-008](adr-latest-stack.md)。ESLint/Prettier/EditorConfig及Mongo事务回归均需重新验证。

## 1. 当前恢复状态

更新至 2026-10-14 08:10 UTC，明确区分局部实测、最终质量门禁、历史主机结果。以下均来自新恢复工程；外部供应商仍全部使用 demo/mock，没有实际扣款、真实模型、真实邮件或生产部署证据。

| 当前项目                           | 最新结果/边界                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| 用户 source-plan.md                | Library 精确恢复，6,729 字节与已知 SHA-256 不变                                           |
| 目录与文档静态检查                 | 16 条目录、四兴趣至少 4 条，来源字段/HTTPS/ID/相对链接/围栏检查；重建文档非逐字节旧稿     |
| API 组件测试                       | 65/65，包含 scoped MCP 13 项，不含下面单独执行的 Mongo 测试；无真实供应商调用             |
| Mongo 集成                         | 实际 MongoDB 8.0.17 replica set，1/1；涵盖真实 Nest HTTP 角色切换和 mongod 完整停启持久化 |
| Web 单元                           | 17 项通过（包含新增隐私测试，核心任务报告）                                               |
| Admin 单元                         | 5 项通过                                                                                  |
| Web 浏览器                         | 8/8，通过真实 Chromium + 本地全 demo 应用；见范围说明                                     |
| Admin 浏览器/代理                  | 6/6，其中 5 个使用 API 测试 fixture 的 UI 用例，1 个实际 Next 代理 HTTP 用例              |
| TypeScript/独立构建                | 早先 Web/Admin scoped 结果通过；全部最终门禁正重新运行                                    |
| 根 npm run check / HTTP / 依赖审计 | 最终结果待核心任务完成；不能把组件通过当作整套通过                                        |
| 真实供应商/公开生产                | 未验证                                                                                    |

### API 与 scoped MCP

[API 当前组件日志](qa/api-component-verification.log)记录 65/65、0 失败、0 跳过。MCP 13 项已经包含在 65 中，不能再次相加。供应商适配器使用 mock，Mongo 的 1 项另行运行。MCP 覆盖真实 SDK 初始化、scope/身份隔离、严格参数、草稿幂等/并发/审计，以及实际 Nest 路由顺序；没有创建生产访问凭据、注册外部客户端或验证远程部署。

早先 17 项领域/安全与 33 项 adapter 分组只是中间结果，由当前 65 项结果替代；不再当作最终分组计数。完整项目门禁和依赖清理仍以稍后的根检查为准。

### MongoDB 真副本集

[Mongo 副本集日志](qa/mongo-replica-verification.log)记录退出成功、1/1、0 失败、0 跳过。代码为 apps/api/test/mongo.test.ts，使用真正的 mongod 8.0.17 单节点 replica set，并非 MemoryStore。

具体覆盖：

- 索引初始化/ready、重复 insert、两连接同 guard 的 20 次并发更新。
- 抛错回滚、未 seed 拒绝、16 工具与目录版本加载。
- 同订单并发模拟 capture 同一 Box，provider capture 只调用一次。
- 启动连接该 Mongo 的真实 Nest HTTP 进程：member 403，测试库赋 admin 后 200，撤回后同一会话 403。
- 未提供可选访客标识的业务请求不写可选 activity。
- 关闭客户端并完整停止/启动该 mongod 副本集后，重连读取已有 Box。

角色测试在隔离测试库中修改角色，不等于实际 admin:role CLI 或生产授予权限已执行。UnknownTransactionCommitResult 的回调不重放检查属于 API 模拟故障测试，不是 Mongo 集群网络分区注入。多节点故障切换、生产备份恢复、真实供应商和完整队列宕机恢复仍需独立验收。

### Web 与 Admin 浏览器

[Web 浏览器日志](qa/web-browser-verification.log)：npm run test:e2e，8/8，包含 Free/刷新、显式 demo Premium、demo OTP/claim/收藏、目录空态、窄屏/跳转导航、reduced-motion、加载防重复提交、关闭可选统计。测试前检查三供应商都是 demo；其中加载测试会局部拦截网络制造等待，不伪装真实支付或模型。

[Admin 浏览器日志](qa/admin-browser-verification.log)：npm run test:ui -w @mysterybox/admin，6/6。五个 UI 用例通过测试路由 fixture 展示匿名/member/admin、报告日期、空数据/窄屏和会话失效；这些数字只存在测试夹具，生产界面不预置假统计。第六项直接访问运行中的 Next 代理，验证 allowlist 与 16 KiB 拒绝。真正 Nest/Mongo 的角色检查证据在上面的 Mongo HTTP 测试，不把 fixture UI 当成后端授权证明。

Web 8/8 浏览器运行发生在移除未使用的 shadcn CLI、将其 MIT CSS 逐字节移入本地源码之前；不是新 lockfile/样式位置之后的浏览器重跑。当前等待该依赖整理后的完整安装、构建与审计证据。

此前环境中 Chromium 启动限制和第一次 UI 断言失败均是中间尝试，后续原生运行及修复复测已取得上述通过结果。不是所有环境都能直接启动 Chromium；CI 与公网部署仍需自己的运行证据。

单元/构建的原始局部证据仍保留：[Admin 单元/类型](qa/admin-unit-verification.log)、[早先 Admin 代理](qa/admin-proxy-verification.log)。Web 初始 TypeScript/12 项单元/独立 Next 16.4 构建来自任务保留工具输出，未捏造原始 stdout；最新 Web 单元已增至 17 项。详见 [component-verification.json](qa/component-verification.json)。

## 2. 历史结果（不可转用为当前通过）

旧主机约2026-10-14 03:56 UTC报告：

- npm run check退出0，API/Web/shared类型检查与API/Next构建通过。
- API48/48，0skip，使用TEST_DATABASE_URL，包含PostgreSQL18.4迁移/seed/版本/20并发跨连接锁/回滚/唯一键/同单capture/新连接池持久化。
- Web8/8：客户端key/token/导航存储、请求、价格、日期时区。
- HTTP11/11，原报告时间2026-10-14T03:55:47.567Z，全demo。
- 生产依赖npm audit报告0漏洞，不是源码安全证明。
- 云浏览器实际验证首页价格/demo、Developer Free刷新、Business Premium3工具手工workflow、真实剪贴板、demo邮件同意与不发送提示、OTP/claim/历史/收藏增删/退出、桌面无横向溢出。
- 5个headlessE2E已编写，旧环境Unix socket限制阻塞Chromium，未形成CI通过结果。
- OpenAI/Vercel/PayPal/Resend真实调用及公开生产均未验证。

历史机器报告只按对话证据重建在 [historical-http-smoke.json](qa/historical-http-smoke.json)，其中标记historicalOnly/reconstructedFromConversation。不是新的测试运行。

## 3. 恢复后必须重新执行的验收

除上面已注明的组件和 Mongo 局部检查外，下表均仍需完整集成验证。局部函数或代理测试不自动勾选整个产品用例，历史覆盖仅供选择优先级。

### 独立服务与MongoDB新增验收

- [ ] Next.js独立dev/build/start；无需Nest源码进程参与构建。
- [ ] NestJS独立dev/build/start；无需Next进程提供API。
- [ ] 恰好apps/web、apps/api、apps/admin三个应用；Admin为独立Next.js + shadcn/ui + Tailwind。
- [ ] 管理统计来自第一方库，管理员服务端角色保护；普通用户/未登录拒绝；demo交易非真实收入。
- [ ] 真实AI唯一Vercel网关；demo默认，OpenAI直连模式/凭据不再是活跃配置。
- [ ] 三个应用通过配置的HTTP地址通信；部署秘密各归其服务。
- [ ] MongoDB replica-set能力、唯一(kind,key)、索引/seed/版本、重启持久化。
- [ ] 跨连接竞争与rollback/commit不确定时，不自动重放外部供应商回调。
- [ ] ESLint、Prettier检查、EditorConfig和TypeScript/测试/构建有当前结果。

### 产品与界面

| ID  | 用例与预期                                        |
| --- | ------------------------------------------------- |
| P01 | 英文首页价值清楚，无虚构评价/人数                 |
| P02 | Free/Premium、服务端USD一次性价格、第三方费用边界 |
| P03 | 四兴趣切换不残留错误状态                          |
| P04 | 空目标/500字符、超长与非法interest                |
| P05 | Free正好1个目录工具，理由/场景/Prompt/步骤齐全    |
| P06 | Premium3个不重复，workflow只引所选ID              |
| P07 | 真实复制Prompt、可信官方外链、无自动上传          |
| P08 | demo AI/支付/邮件都不冒充真实                     |
| P09 | 加载/失败/重试保留输入与幂等                      |
| P10 | Back/Forward/关闭/支付取消后能继续                |
| P11 | 移动宽度、键盘焦点、reduced motion                |
| P12 | 示例质量具体、人工核验点、手动交接清晰            |

### 管理端与第一方统计

| ID  | 用例与预期                                                         |
| --- | ------------------------------------------------------------------ |
| A01 | Admin 单独 dev/build/start，用户前台停机时仍可连接 API             |
| A02 | 未登录拒绝报告；普通 member 拒绝；admin 可读                       |
| A03 | 撤销管理员角色后，旧有效会话也失去报告权限                         |
| A04 | 浏览器传 role、隐藏导航或直连 API 不能赋权/绕过                    |
| A05 | Admin 代理只允许明列读报告/身份/登录退出路径                       |
| A06 | ADMIN_APP_URL 精确来源允许 OTP，其他来源拒绝；cookie 保持 HttpOnly |
| A07 | UTC 起含止不含、默认近 7 天、最多 31 天，三报告窗口一致            |
| A08 | 坏日期、倒置窗口和过大窗口有明确错误；无数据为零/空列表            |
| A09 | 同一资源事件 ID 去重，重试不重复计数；浏览器标识不称真人           |
| A10 | demo/sandbox/live 分类明确，付费计数不称净收入                     |
| A11 | 事件只含固定字段，没有原始 IP、goal、邮箱、验证码、密钥            |
| A12 | 30 天活动清理实际执行；用户报告邮箱仅限管理员                      |

### 领域与安全

| ID  | 用例与预期                                             |
| --- | ------------------------------------------------------ |
| D01 | 并发同Free key只建一个资源                             |
| D02 | 同key不同brief返回409                                  |
| D03 | 额外金额/tier字段与缺key拒绝                           |
| D04 | 无token/跨账号读取拒绝不泄内容                         |
| D05 | 匿名claim有权才成功，不夺他人归属                      |
| D06 | 收藏重复添加/删除幂等                                  |
| D07 | 未知toolId拒绝                                         |
| D08 | 错误/过期/重用码拒绝，错误计数不回滚                   |
| D09 | 同码并发最多一次成功                                   |
| D10 | logout/会话到期失效                                    |
| D11 | 无/恶意Origin拒绝；验签webhook独立                     |
| D12 | 无Content-Length大流超过16KB拒绝；配额有界             |
| D13 | production缺配置/HTTP/demo拒绝，代理缺可信IP或签名拒绝 |
| D14 | 模型未知ID/错数量/重复/外链/外workflow拒绝             |
| D15 | 模型拒绝/不完整/非法JSON/超时明确失败，无假成功        |
| D16 | 内存和MongoDB回滚，外部状态不能假定回滚                |
| D17 | 代理签名分离主体，伪造/超60秒拒绝                      |
| D18 | 数据库catalog字段/HTTPS/版本/唯一ID/未seed检查         |

### 付款与交付

| ID  | 用例与预期                                         |
| --- | -------------------------------------------------- |
| B01 | 调价不改变已建订单金额                             |
| B02 | 客户端success参数不能履约                          |
| B03 | 错金额/币种/merchant/custom_id/order/capture拒绝   |
| B04 | 未批准/PENDING/部分或多capture不误发               |
| B05 | 同订单反复/并发capture同Box、不重扣                |
| B06 | 同capture不能归属另一订单                          |
| B07 | 网络响应丢失查询原单、保留key                      |
| B08 | 已付后AI失败保留付款并原单恢复                     |
| B09 | 邮件failed结果仍可读；pending/failed持久化恢复     |
| B10 | 假webhook/证书host/篡改原JSON拒绝                  |
| B11 | 事件重投/并发去重，canonical再核验                 |
| B12 | API重启后MongoDB queued事件继续                    |
| B13 | 无邮箱同意不发；登录不等于营销订阅                 |
| B14 | sent不当收件确认，退信需另监控                     |
| B15 | 邮件自动最多5尝试/23小时、并发不越界，手动独立限流 |

## 4. 真库与运营门槛

- [ ] 可重入migrate/seed，不清用户数据，目录版本准确。
- [ ] 重启后用户/历史/收藏/订单/幂等/事件保持。
- [ ] 两API实例竞争一致，DB断开/池耗尽/上游超时不假成功。
- [ ] 备份恢复后与PayPal对账，避免落后快照导致重复收费。
- [ ] 日志不含body、验证码、token、cookie、secret。
- [ ] 当前lockfile依赖审计与secret扫描。
- [ ] paid-but-not-ready、队列、邮件、成本告警。
- [ ] 正式条款/隐私/退款/支持/保留删除机制。
- [ ] 生产ingress覆盖真实IP、无旁路、原始webhook正文与头。
- [ ] 所选真实AI/sandbox付款/实际发信单独批准后验收。
- [ ] MongoDB replica-set真实部署与事务/索引/跨连接测试；历史PostgreSQL证据不能替代。

## 5. 需求追踪

Web→Next/Nest；10–100工具→16真实种子及来源；四兴趣→共享enum与过滤；工具+workflow+教程→Box契约；免费/Premium→1/3工具及可配置价格；AI/PayPal/Email→独立适配器；历史/收藏→验证码账号与claim；持久化→MongoDB；平台化/增长→明确延期。

## 6. 新验证记录填写规则

每次记录实际日期、环境、代码版本/文件范围、命令、退出码、通过/失败/跳过数、有限覆盖与阻塞。部分测试不是全通过，mock不是实网，构建不是部署，Library持久化不是Git远端发布。主任务确认的新报告才可更新当前状态。
