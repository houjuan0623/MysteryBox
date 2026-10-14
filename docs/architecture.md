# 技术架构与工程决策

> 恢复版（2026-10-14）：依据旧任务保留的正文与修订重建。除原始方案外不声明字节级一致；涉及实现的描述是应恢复的设计，需与恢复代码及新测试对齐。旧主机结果不证明本目录已通过验收。

当前技术栈为NestJS + MongoDB + 独立Next.js，最新要求覆盖原方案，见[ADR-008](adr-latest-stack.md)和[数据模型](data-model.md)。MongoDB 真副本集、本地完整质量门禁与浏览器已有当前通过证据；e4c714e 阶段 CI 已通过；最新增量 CI、真实服务与生产另行验收，见 acceptance.md。

## 1. 系统边界与目录

```text
Browser → Next.js Web :3000 / Next.js Admin :3001 → same-origin proxies → NestJS API :4000
  API → contracts / identity / MysteryBoxService / catalog / Store / providers
  Store → MemoryStore (demo) | MongoDB (replica-set transactions + business-key guards)
  Providers → Demo | Vercel AI Gateway | PayPal REST | Resend
```

系统生成使用建议，不自动运行被推荐的工具。官网由受维护目录提供，用户自行决定是否注册和付款。

- apps/web：独立用户前台，Next.js页面/组件/同源代理。
- apps/admin：独立管理端，Next.js + shadcn/ui + Tailwind；第一方数据统计与管理员鉴权。
- apps/api：独立NestJS后端；恰好三个应用，不把管理端揉进用户前台。
- apps/api/src/domain.ts：价格、订单、履约、权限、身份、收藏。
- providers/：AI、付款、邮件和 HTTP 边界。
- catalog.ts / seed.ts：版本化工具资料及显式数据库 seed。
- store.ts / 数据库初始化入口：官方mongodb驱动仓储、索引初始化与版本化数据变更。
- packages/shared：类型、Zod、仅服务端的签名身份与限长请求流工具。

## 2. 架构决策

### ADR-001：前后端分离、固定同源代理

Web、Admin和NestJS API是三个独立运行、构建和部署的服务，可共享仓库但不共享进程。Next.js负责体验，NestJS是可信业务层。前端部署不需要数据库或供应商凭据，后端可在未启动Next时单独提供HTTP接口。代理只转发服务端固定 API_INTERNAL_URL，不接受用户指定任意 host。密钥不进入浏览器，cookie 同源流转；代价是增加 HTTP 跳数和部署进程。

Web 对限流主体加带时间戳的 HMAC（x-mb-client / x-mb-signature），API 验签后采用。生产只读取经验证 ingress 覆盖的 x-real-ip 或 x-vercel-forwarded-for，拒绝任意 XFF。Web 与 API 共用独立 PROXY_SHARED_SECRET，签名时效 60 秒。

生产必须禁止绕过 ingress 直连 Web；否则签名只是证明代理签了攻击者自选的 IP。开发 Web 用 HttpOnly mb_visitor 区分浏览器；这不能替代生产防刷。

Web 流式读取请求时实施 16 KB 上限，不只依赖 Content-Length；API 再限制 16 KB。生产 API 与数据库应置于私有网络。

### ADR-002：目录提供事实，模型组织建议

真实模型收到兴趣、目标和候选目录，返回 ID、理由、场景、Prompt、步骤、workflow。模型不产生任意官网。Zod/JSON Schema 限制结构、数量、长度和 ID 枚举，最终服务端再次验证去重和关联。

合法结构不等于内容正确，仍需人工抽查。demo 是可复现模板和目录组合，不代表真实推理。链接只由 catalog 解析，生成自由文本拒绝 URL 等载体。

### ADR-003：服务端金额是唯一事实

创建本地订单时读取 PREMIUM_PRICE_CENTS 并存 amountCents / USD。之后配置变化不改变原订单金额。整数美分和严格两位小数校验避免宽松 parseFloat。

前端价、回跳参数、onApprove 均不等于到账。服务器必须匹配本地 ID、PayPal order ID、custom_id、merchant、币种、金额和完成状态。

### ADR-004：付款与生成分离

订单的 paymentStatus=pending/completed 与 generationStatus=queued/ready/failed 独立。先确认并保存付款，再生成。失败不把已付款退回 pending。原订单恢复，不能再创建一次收费要求。capture ID 只能归属一个本地订单。

```text
local order → provider order → approval → verified capture
                                       → payment completed
                                       → Box queued → ready
                                                    → failed → retry original order
```

邮件是后置交付渠道，失败不删除结果，不回滚付款，也不触发再次收费。

### ADR-005：稳定幂等键覆盖不确定网络

Free 和订单创建要求 Idempotency-Key。同 key 同输入返回原资源；不同输入返回409。PayPal createKey/captureKey 在网络前持久化。超时不代表未扣款，应查询原订单，不能换 key 盲试。

浏览器 sessionStorage 保存当前 tab 的请求键与匿名凭证，不是跨设备恢复方案。付费前登录有利于历史找回。

### ADR-006（已替代）：旧关系数据库方案

旧PostgreSQL/JSONB方案仅作为历史，已被最新用户要求覆盖。当前模型和一致性边界完整定义于[MongoDB数据模型](data-model.md)，不运行旧SQL迁移作为当前初始化。

### ADR-007（更新）：MongoDB聚合与受控事务

采用官方mongodb驱动、replica-set事务、唯一(kind,key)文档聚合及业务键竞争guard。连接/索引/事务能力缺失不能静默降级。目录seed与版本一致，用户/订单/历史不被清空。

外部供应商动作无法被数据库回滚。含扣款、AI或发信的业务回调不得由驱动自动重跑；显式处理竞争、事务失败和commit结果不确定，保留稳定provider key并查询原订单。必须以新真实Mongo集成测试证明跨连接竞争与失败恢复。

当前设计不是严格端到端exactly-once；高并发或长网络临界区需要任务lease/outbox和短事务演进。已恢复实现使用app_records与transaction_guards；guard竞争只在领域回调开始前重试，回调不重跑，UnknownTransactionCommitResult最多重试同一commit六次。初始化命令db:init，详见数据模型；已有局部真副本集结果；未知 commit 等故障场景仍需扩展测试。

## 3. 身份与访问

六位随机验证码有效10分钟、最多5次尝试；HMAC存储，demo才返回 developmentCode。错误计数必须在抛错前提交。成功登录产生高熵token，只存哈希，有效7天；cookie HttpOnly、SameSite=Lax、Path=/api，生产Secure，退出删会话。

匿名 Box/Order 是绑定资源的 HMAC bearer token，无独立撤销/过期记录。owner或正确token才能读，仅知道ID不够。claim要求登录+正确Box token且不夺取他人归属。sessionStorage凭证可被同源脚本读，必须防XSS且不得写入日志或分析事件。轮换SESSION_SECRET会使所有此秘密派生的匿名token/验证码失效，需恢复方案。

## 4. 外部服务

### Vercel AI Gateway（唯一真实AI入口）

AI_MODE只支持demo/vercel；真实模式使用AI_GATEWAY_API_KEY/AI_GATEWAY_MODEL（provider/model）及固定Vercel网关端点，不开放OpenAI直连配置或任意baseURL。下游模型可以来自网关支持的供应商，但调用入口仍唯一是Vercel。store:false、结构化输出、候选枚举、二次校验。拒绝、不完整、超时、非法JSON和ID都失败，不偷偷回退demo。

目标可能包含隐私，提交前须披露网关与下游模型接收方；不需要发送邮箱。store:false不代表所有留存或合规义务消失。

### PayPal

服务端创建、读取、capture、再读验证；批准URL限制到对应sandbox/live官方host。webhook保持原始JSON文本，验签API envelope中嵌入原事件文本，同时验证与解析body一致。验签后按Event ID去重并落库返回202，后台5秒处理，重新读取canonical订单确认后履约。

当前重点是PAYMENT.CAPTURE.COMPLETED，退款、撤销、争议必须另建支持与对账路径，不能宣称完整金融生命周期。

### Resend

登录码与Box邮件分开，Box需同意。网络前提交pending投递意图，失败记录failed。后台5秒循环恢复到期pending/failed，有限指数退避，自动总尝试最多5次（含首次），任务创建未满23小时；旧不确定任务人工确认。手动重试另限流，sent/demo不重发。登录码失败不进入Box重试队列。

稳定供应商幂等键降低重复；sent仅表示供应商接受，不是收件确认。退信、投诉、最终投递仍需接入。

## 5. 配置与限制

AI_MODE=demo/vercel；付款demo/paypal；邮件demo/resend。任何demo或PayPal sandbox须可见，public config含paymentEnvironment。

production要求MongoDB replica-set持久化、独立高熵SESSION_SECRET/PROXY_SHARED_SECRET、HTTPS APP_URL和真实适配器；拒绝demo。Web还要求可信IP头配置与合法请求头，缺失拒绝。sandbox不是实收开启。

当前无目录后台/热更新，无订阅/自动退款/争议管理，无自动执行工作流，无完整过期清理、删除导出。备份、支持、告警、入口与真实供应商必须独立验收。

## 6. 当前追加的受限 MCP 与规格流程

MCP 位于现有 NestJS 内，Streamable HTTP 路径为 /mcp，不是第四个应用。默认 MCP_ENABLED 未设置或为 0 时不注册路由；独立 bearer 鉴权与 scope，不能用 Web cookie/admin 会话代替。仅提供 analytics_summary、draft_create、draft_list；草稿是私有未发布内容，不执行推广、付款、邮件、模型、shell 或任意数据库操作。工具发现与调用均检查 scope，草稿/幂等回执/成功审计一起提交。详见[模块契约](../apps/api/src/mcp/README.md)。

MCP 放在业务通用 JSON/Origin 中间件之前，并自带 16 KiB 解析与 Host/Origin/本地入口校验；这不改变普通 /api 路由的来源防护。默认只允许 loopback，远程启用还需要明确域名、HTTPS 可信入口与独立限流。模块不创建凭据或授权外部客户端，配置和远程接入需另行批准。

实际引入官方 Spec Kit 1.2.0 的 generic 集成、官方脚本/模板及中文规格产物；这是一套工程推进材料，不自动实现业务或创建自动化。当前项目差距保留在 specs/001-three-app-foundation/convergence.md，详见[接入与执行证据](spec-kit.md)。
