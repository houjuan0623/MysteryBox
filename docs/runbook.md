# 开发、运行与部署手册

> 恢复版（2026-10-14）：根据旧任务正文与修订重建。下述代码/接口为恢复目标，需对照新工程验证。历史通过记录不等于当前恢复目录通过。

## 0. 运行级别

本地全demo用于演练界面/免费/模拟付费/登录/收藏，不代表真实AI、扣款和邮件。测试MongoDB与供应商sandbox用于验证真实协议，不代表生产上线。公开生产还需要条款、预算、监控和支持。

不要把密钥放入聊天、源码、Issue或日志。恢复文件不含凭据，也不自动获得真实服务调用授权。

## 1. 环境与启动

Node.js24.x（>=24 <25），npm workspaces；Docker Compose可选，本地数据库为MongoDB8.0 replica set。恰好三个应用：Web3000、Admin3001、NestJS API4000/api。以下从项目根运行。实际目录为 /workspace/shared/MysteryBox-restoration；dot 云电脑桌面用户的 ~/MysteryBox 快捷符号链接已于 2026-10-14 08:11 UTC 创建，指向此目录。不同执行器的 home 可能不同，绝对路径是本次恢复工作的基准。

```bash
cd /workspace/shared/MysteryBox-restoration
cp .env.example .env
npm ci
npm run dev -w @mysterybox/api
# 另一个终端
npm run dev -w @mysterybox/web
# 第三个终端
npm run dev -w @mysterybox/admin
```

开发未配置MONGODB_URI时使用MemoryStore，重启清空账号/历史/订单/额度。demo登录码在开发响应/界面显示，不实际发信，禁止公开暴露。

可共用仓库与依赖安装，但三个应用分别运行。组合dev脚本只是便利入口，不得成为独立启动的前提。若使用bash scripts/dev-dot.sh激活dot云电脑现有Node，应先确认脚本已恢复；它不提供生产部署能力。

API和Next配置显式加载根.env，已导出环境优先。生产直接在平台注入需要的变量，不依赖偶然工作目录。

## 2. MongoDB replica set

当前Compose仅用于本机开发：mongo:8.0、rs0、端口只绑定127.0.0.1:27017，healthcheck负责初始化副本集。不使用旧PostgreSQL Compose或SQL迁移。

```bash
docker compose up -d mongo
docker compose ps
```

等待服务健康后，本地API进程配置：

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0
MONGODB_DB=mysterybox
```

该示例没有生产鉴权/TLS配置，只允许本地隔离开发，不向公网开放27017。副本集广告主机为localhost，容器间/远端部署必须重新设计可达主机名，不能照抄该本地连接。

```bash
npm run db:init
npm run db:seed
npm run dev -w @mysterybox/api
curl --fail http://localhost:4000/api/health
```

health.storage应为mongo。db:init连接副本集、检查事务拓扑并建立kind_key_unique和kind_created_at索引，初始化transaction_guards。db:seed将16条公共工具和版本写入MongoDB；不删用户数据或旧工具。代码保留db:migrate作为兼容脚本名时，它执行的是Mongo初始化，不是旧SQL迁移，优先使用db:init。

旧方案的DATABASE_URL/TEST_DATABASE_URL已不适用。至少重测“登录→Box→收藏→API重启→再查询”以及两个连接对同一订单的并发。仅容器启动不等于事务/持久化验收。

## 3. 环境变量

| 名称                     | 用途/约束                                                                   |
| ------------------------ | --------------------------------------------------------------------------- |
| NODE_ENV                 | development / production                                                    |
| APP_URL                  | 用户前台精确origin，无末尾/；生产HTTPS                                      |
| ADMIN_APP_URL            | 后端允许的管理端精确origin，默认http://localhost:3001；生产HTTPS            |
| API_INTERNAL_URL         | Web/Admin上游根地址，不带/api，默认http://127.0.0.1:4000                    |
| PORT                     | API默认4000                                                                 |
| MONGODB_URI              | API的MongoDB replica-set连接，生产必需                                      |
| MONGODB_DB               | API数据库名，默认mysterybox                                                 |
| SESSION_SECRET           | 唯一高熵，生产至少32字符                                                    |
| PROXY_SHARED_SECRET      | Web/Admin/API一致，独立于SESSION_SECRET，生产至少32字符                     |
| TRUSTED_CLIENT_IP_HEADER | 生产Web/Admin的x-real-ip或x-vercel-forwarded-for；必须由验证过的ingress覆盖 |
| AI_MODE                  | demo/vercel；真实AI唯一走Vercel AI Gateway                                  |
| PAYMENT_MODE             | demo/paypal                                                                 |
| EMAIL_MODE               | demo/resend                                                                 |
| PREMIUM_PRICE_CENTS      | 整数美分99–49900，默认299                                                   |
| FREE_DAILY_LIMIT         | 整数1–10000；production默认5，开发50                                        |
| AI_GATEWAY_API_KEY       | vercel模式网关密钥，不混用OpenAI直连key                                     |
| AI_GATEWAY_MODEL         | provider/model格式                                                          |
| PAYPAL_MODE              | sandbox/live，默认sandbox                                                   |
| PAYPAL_CLIENT_ID         | 当前应用标识                                                                |
| PAYPAL_CLIENT_SECRET     | 服务端应用秘密                                                              |
| PAYPAL_MERCHANT_ID       | 收款人核验                                                                  |
| PAYPAL_WEBHOOK_ID        | 对应环境/应用webhook                                                        |
| RESEND_API_KEY           | resend模式密钥                                                              |
| RESEND_FROM              | 已验证发信域身份                                                            |
| TEST_MONGODB_URI         | 独立可丢弃replica-set集成测试库，禁止指向生产                               |

秘密不能使用NEXT_PUBLIC_前缀。production拒绝demo适配器，要求数据库、HTTPS、两个独立秘密和Vercel网关/PayPal/Resend必填配置。OpenAI直连不是当前支持模式，不配置OPENAI_API_KEY/OPENAI_MODEL。

生产Web必须有可信IP头配置及实际合法单IP值。ingress需覆盖该头并禁止绕过入口直连Web；不可采用用户自报XFF。配置缺失返回INGRESS_NOT_CONFIGURED，值缺失/非法返回INGRESS_IDENTITY_MISSING；API签名身份失效返回PROXY_IDENTITY_REQUIRED。不要关闭校验绕过问题。

.env.example的50会覆盖生产默认5，上线须明确设额度与成本预算。PAYPAL_MODE=sandbox不是实收开启。

## 4. 分层测试

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:mongo
npm test
npm run build -w @mysterybox/api
npm run build -w @mysterybox/web
npm run build -w @mysterybox/admin
RUN_MONGO_TESTS=1 npm run check
npm run test:e2e
npm run test:ui -w @mysterybox/admin
# API构建后运行demo HTTP检查
node scripts/http-smoke.mjs
```

必须运行ESLint、Prettier检查、TypeScript、单元、三个应用构建和HTTP测试；EditorConfig控制编辑格式。根check的实际覆盖以package.json为准，缺失某项不能视为该项通过。真实供应商和浏览器E2E仍单独验收。Mongo 真库用 TEST_MONGODB_URI 或 npm run test:mongo 显式启动 MongoDB 8.0.17 单节点 replica-set fixture；默认 npm test 在未设置 RUN_MONGO_TESTS=1/TEST_MONGODB_URI 时跳过 Mongo 集成，必须在报告中注明。fixture 仍是真正的 mongod，不是 MemoryStore。外部 URI 测试使用随机名称的 mysterybox_test_* 数据库，当前不自动删除该外部数据库；需按授权与保留政策清理，绝不能指向生产。测试会写demo订单/测试记录，禁止生产库。

Playwright 的 Web 配置使用 3000 与 Chromium；Admin 有独立 test:ui 配置。最新原生运行 Web 12/12、Admin 6/6 已通过，包含实际浏览器用例；Admin 五个 UI 用例使用 API fixture，第六项是运行中代理 HTTP 检查。真实 Nest/Mongo 角色授权另由集成测试验证，不能混淆这三层证据。环境受限时应记录浏览器启动阻塞，不把 HTTP 测试冒充浏览器；最新范围见 acceptance.md。

当前 scripts/http-smoke.mjs 使用独立 14000 端口、已构建 API、强制 demo，报告写入 docs/qa/http-smoke-restored.json。旧主机的历史报告单独保存在 docs/qa/historical-http-smoke.json，不能与新运行混用。

当前本地最终证据：根质量门禁通过，Admin 5 + API 66（含真 Mongo 1）+ Web 17 共 88 项、0 跳过；三个应用生产构建、HTTP13、Web 浏览器12、Admin UI/代理6通过，npm audit 0。这些是最新本地结果；已发布 e4c714e 阶段的 CI 另已通过，但不含后续测试增强。真实供应商和公网/手机访问仍需独立验证。运行时应用代码不因此获得真实凭据或收款授权。

可选 NEXT_DIST_DIR 用于 Next 开发/验证产物隔离，默认 .next；同一实例 build/start 必须使用相同目录。PLAYWRIGHT_EXECUTABLE_PATH 可选择已安装浏览器，ADMIN_TEST_URL 可选择管理端测试入口；测试只能指向明确的本地隔离 demo，不指向生产。APP_LIVE_TEST 默认为 0，没有另行批准的模型/预算和安全凭据交接不要启用。

## 5. 本地API演练

```bash
curl --fail http://localhost:4000/api/catalog
curl --fail -X POST http://localhost:4000/api/boxes/free \
  -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: local-demo-free-0001' \
  -d '{"interest":"creator","goal":"Create an interview outline","emailConsent":false}'
```

同请求同key应同Box ID；改goal沿用key应冲突。accessToken是敏感访问权，不贴报告。

```bash
curl --fail -X POST http://localhost:4000/api/checkout/orders \
  -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: local-demo-order-0001' \
  -d '{"interest":"developer","goal":"Plan a testable prototype","emailConsent":false}'
```

仅demo使用返回id/token调demo-complete，{}与X-Order-Token。真实PayPal不能使用该入口。不要把demo脚本改成实收后自动测试。

## 6. 真实服务受控验证

独立MongoDB副本集与备份恢复 → 经授权的Vercel AI Gateway模型/预算 → 经授权收件人的Resend域与投递 → PayPal sandbox批准/取消/pending/重投/capture → 公网HTTPS回调原始正文与签名头 → 模拟已付款生成失败/响应丢失/重启 → 明确批准后再讨论live发布。

本说明不授权创建密钥、扩权限、接受协议或实际交易。真实使用模型还需核对最新能力与费用，不能假设原方案价格仍有效。

## 7. 部署轮廓

- 恰好三个应用：apps/web、apps/admin、apps/api，分别构建/运行/部署；MongoDB为外部持久化服务，不是第四个前端应用。
- Web、Admin和API分别使用各自workspace的start命令，发布可以独立进行。
- API注入Mongo/供应商/会话秘密并执行db:init/seed；Web/Admin只注入各自API上游、受信任入口和代理签名配置。数据库/供应商key不能放到前端部署。
- 管理端配置 ADMIN_APP_URL 精确 origin，服务端每次读取当前管理员角色。运维使用 npm run admin:role -- grant|revoke verified-email，仅对 Mongo 中已完成验证码登录的账户生效，不创建默认管理员；执行前核对授权和环境。详见 admin.md。
- TLS入口覆盖可信IP，禁止旁路，内部API/数据库私网。
- 验证Origin、cookie、签名身份、PayPal签名头和不改变正文。
- 告警覆盖paid-but-not-ready、队列重试、邮件失败、登录失败、成本。
- 备份恢复副本验证回滚；旧版本不能盲目读取新数据格式。
- Compose只含本地数据库，不是完整生产编排。

```bash
npm run start -w @mysterybox/web
npm run start -w @mysterybox/admin
npm run start -w @mysterybox/api
```

### 构建产物与独立部署的含义

独立部署指三个独立进程/发布单元，并不表示把某个 apps 子目录单独复制走就拥有全部依赖。当前 npm workspace 共享 lockfile 和 packages/shared；构建环境应取仓库根并执行 npm ci，再选择目标 workspace 构建。API 的 start 依赖其 TypeScript 输出树；Next 的 start 依赖该应用 .next 构建及运行依赖。当前没有已验收的多应用容器镜像或 standalone 打包步骤，部署平台应保持需要的 workspace 路径。

升级 API 与前端可分别发布，但共享 HTTP 契约变更须保持向后兼容或协调发布。前端构建成功不要求 API 当时运行；实际使用仍需 API 可达。生产端口调整应通过明确的部署启动命令与反向代理配置，不能仅假定 API 的 PORT 同时改变两个 Next 应用。

## 8. 排错

| 现象                    | 检查                                                                           |
| ----------------------- | ------------------------------------------------------------------------------ |
| 启动失败                | env、origin格式、数据库、迁移、seed                                            |
| ORIGIN_REJECTED         | Origin 与 APP_URL 或 ADMIN_APP_URL 精确一致、代理透传                          |
| API_UNAVAILABLE         | API进程和API_INTERNAL_URL                                                      |
| 会话不保留              | 同源、/api路径、HTTPS/Secure、独立Set-Cookie                                   |
| INGRESS_*               | IP头受可信入口覆盖，禁止用户自填/绕过                                          |
| PROXY_IDENTITY_REQUIRED | 代理路径、两端秘密、60秒签名时钟                                               |
| 429                     | 额度、真实IP/开发visitor、重试频率                                             |
| 生成失败                | 原key/原订单恢复，模型ID、预算、超时                                           |
| 已付款无结果            | 查原provider订单，不新收费                                                     |
| webhook不处理           | 环境/ID/原始正文/签名头、队列、canonical关联                                   |
| 邮件failed              | pending/failed、attempts、nextAttemptAt；自动最多5次且23小时内，旧任务人工确认 |
| sent没收到              | 供应商投递/域/退信/垃圾箱；sent不等于到达                                      |
| 重启数据消失            | memory还是mongo、数据库名/副本集/卷/连接                                       |

## 9. 停机与恢复

SIGTERM/SIGINT停止事件循环、关闭连接；memory不保留。MongoDB生产建立加密备份、恢复演练与最小权限。数据库恢复快照可能落后PayPal，必须对账后继续capture/履约，不能按旧pending重复扣款。当前设计没有完整自动备份、删除、退款与财务对账作业。

## 10. MCP 与官方 Spec Kit

公开演示维持 MCP_ENABLED=0。若经授权启用，仅在 API 设置独立 MCP_TOKEN_SHA256、MCP_PRINCIPAL_ID、MCP_SCOPES，默认仍只允许本机；不把 token、摘要或数据库秘密放在前端部署。模块不代建凭据、不代配置客户端。MCP_ALLOW_REMOTE、MCP_ALLOWED_HOSTS、MCP_ALLOWED_ORIGINS 的严格约束与安全限制见[模块说明](../apps/api/src/mcp/README.md)，不能仅设置远程开关就认为安全部署已完成。

撤销接入可关闭 MCP 或替换已配置 token 摘要并重启；保留 principal 才能在轮换后访问同一私有草稿空间。审计记录尚无自动保留清理策略，应在广泛使用前明确。每进程限流不是分布式防刷。

Spec Kit 使用已保存的官方 generic 命令与项目规格；干净检出显式设置 SPECIFY_FEATURE=001-three-app-foundation 再运行前置校验。不要把 /speckit.* 当作 shell 命令，也不要在非空仓库使用未经审查的 force 初始化。官方原始模板/脚本与 source-plan.md 都不应被通用格式化改写；参见[Spec Kit 运行说明](spec-kit.md)。
