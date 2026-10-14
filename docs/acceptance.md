# 验收清单与历史验证记录

> 恢复版（2026-10-14）：根据旧任务正文与修订重建。下述代码/接口为恢复目标，需对照新工程验证。历史通过记录不等于当前恢复目录通过。

当前数据库与前后端独立要求见[ADR-008](adr-latest-stack.md)。ESLint/Prettier/EditorConfig及Mongo事务回归均需重新验证。

## 1. 当前恢复状态

本文件严格区分历史运行与当前恢复检查。新的完整工程、CI和供应商结果须由主任务完成后更新，不能沿用旧主机的通过标签。

| 当前恢复项目                  | 状态                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| 用户source-plan.md            | 已重读Library并核对6,729字节与已知SHA-256                                              |
| 16条catalog语义               | 已由保留完整定义重建；16条结构/来源字段/兴趣覆盖检查已记录在恢复QA文件                 |
| 文档                          | 依据保留正文/修订恢复，不声明字节级一致                                                |
| 当前TypeScript/单元/构建/HTTP | Web/Admin 局部通过；API 领域/安全 17 项、适配器 mock 33 项通过；全门禁待最终运行       |
| 当前MongoDB/浏览器/CI         | Mongo 真副本集局部 1/1 通过；浏览器/CI 待验证                                          |
| 新Admin/角色/第一方统计       | Admin 单元/类型/独立构建/代理通过；后端契约和角色/统计函数测试已接通，完整 HTTP 待验收 |
| 真实供应商/生产部署           | 未在此恢复任务验证                                                                     |

### 当前用户前台局部证据（2026-10-14 约 07:13 UTC）

Web 实现任务在新恢复目录执行以下组合命令，工具返回退出码 0：

```bash
npm run typecheck -w @mysterybox/web && npm run test -w @mysterybox/web && npm run build -w @mysterybox/web
```

- TypeScript：tsc --noEmit，无诊断。
- 单元：12/12，0 失败、0 跳过。
- Next.js 16.4.0 生产构建：成功，静态生成 9/9；包含首页、discover、box、account、checkout/return、代理、privacy 和 terms 等路由。
- 原始 stdout 未另存文件；此记录依据实现任务保留的工具输出报告，不伪装成原始运行日志。
- 八个 Web Playwright 用例已编写，在替换主机上尚未执行；类型、单元与构建不代表浏览器或 Nest/Mongo 端到端通过。

### 当前管理端局部证据（2026-10-14 07:20 UTC）

以下为新恢复目录实际运行，不继承旧主机结果。管理端实现任务报告独立生产构建通过；文档任务已读取并保留单元/类型和代理测试日志。

| 命令                                                                              | 结果与范围                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| npm test -w @mysterybox/admin                                                     | 5/5，UTC 默认/完整日期/无效及超限日期/缺失时间戳等纯函数                                    |
| npm run typecheck -w @mysterybox/admin                                            | 退出成功，管理端 TypeScript                                                                 |
| npm run build -w @mysterybox/admin                                                | 管理端任务报告 Next 16.4 独立生产构建成功（安全头更新后）；持久构建日志尚未保存             |
| npm run test:ui -w @mysterybox/admin -- --grep 'real proxy'                       | 1/1，实际运行的 Next 代理拒绝未列路由和 16KB 以上登录正文；这是 HTTP 请求测试，不启动浏览器 |
| PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium npm run test:ui -w @mysterybox/admin | 浏览器启动被运行环境 socket 限制阻塞，未进入 UI 断言；五个 UI 用例仍未验证                  |

证据：[单元与类型日志](qa/admin-unit-verification.log)、[实际代理日志](qa/admin-proxy-verification.log)。这些结果不证明管理员角色、真实 Nest 后端报表、MongoDB、OTP 浏览器流或生产部署已通过。后续代码变更还需重跑对应检查。

### 当前 API 与 MongoDB 局部证据（2026-10-14 约 07:49 UTC）

核心实现任务报告：恢复后的 API 领域/安全测试 17 项通过，供应商适配器测试 33 项通过。适配器测试使用 stub/mock，不是实际 Vercel、PayPal 或 Resend 调用。完整 npm run check 与 HTTP 集成尚未提供最终结果，不把这些分组加总当成最终全套验收。

真实 MongoDB 8.0.17 单节点 replica-set 测试取得退出码 0，1/1、0 失败、0 跳过。原运行 stdout 已复制到[Mongo 副本集日志](qa/mongo-replica-verification.log)，测试代码为 apps/api/test/mongo.test.ts。它不是 MemoryStore 测试，当前记录不宣称完整生产拓扑已验证。

具体覆盖：

- 索引初始化/ready 与重复 insert 行为。
- 两个 Mongo 连接竞争同一业务 guard，20 次更新无丢失。
- 领域回调抛错后的事务回滚。
- 未 seed 目录拒绝，写入 16 工具与版本后加载。
- 同订单并发 capture 返回同一 Box，模拟供应商 capture 只调用一次。
- 关闭一个客户端后以新连接重开，仍能读取已完成 Box。

这没有测试 mongod 进程重启、网络分区、UnknownTransactionCommitResult 故障注入、真实扣款、生产备份恢复或跨进程 webhook 队列恢复；仍保留为后续验收项。局部命令与证据汇总在 [component-verification.json](qa/component-verification.json)。

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
