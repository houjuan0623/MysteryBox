# HTTP API 契约

> 恢复版（2026-10-14）：根据旧任务正文与修订重建。下述代码/接口为恢复目标，需对照新工程验证。历史通过记录不等于当前恢复目录通过。

业务HTTP契约从原0.1.0设计恢复，底层数据库现改为MongoDB。Next.js Web、Next.js Admin和NestJS API独立运行/构建/部署；接口均由NestJS提供，Next同源代理只是浏览器入口。业务 REST 路径均以 /api 开头；当前新增的独立 MCP 协议入口为 /mcp，使用独立认证和校验，不是本节 REST 会话接口。最终枚举/字段以 main.ts、domain.ts 和共享契约为准。

## 共同约定

- JSON体，Web流式读取/API双层16KB上限；代理超限413 REQUEST_TOO_LARGE。
- 非 webhook 修改请求带 Origin，必须与 APP_URL 或 ADMIN_APP_URL 中一个精确 origin 一致，curl 亦如此。
- Cache-Control:no-store，正常响应含X-Request-Id。
- mb_session：HttpOnly、SameSite=Lax、Path=/api，生产Secure。
- 浏览器通过各自 Web/Admin 同源代理。x-mb-client/x-mb-signature是服务间签名身份，不接受浏览器自报限流身份。
- 开发Web以HttpOnly mb_visitor区分浏览器；生产通过可信ingress的单个IP。
- 错误形态：{error:{code,message,requestId?}}。部分代理/来源拒绝无requestId。
- 401身份/验证码，403来源/代理身份，404资源不存在或隐藏越权，409状态或幂等冲突，429限流，503暂不可用。

### Brief

```json
{
  "interest": "creator",
  "goal": "Turn a short interview into a clear first draft.",
  "emailConsent": false
}
```

interest为creator/developer/student/business。goal可省略，默认空串，最多500字符。email可选，提供时emailConsent必须true。strict拒绝额外字段，不接收客户端price/currency/tier。

### 幂等与限流

Free和订单创建需Idempotency-Key：16–128位字母/数字/下划线/连字符。同输入保留key重试，改变输入换key。同key改输入409 IDEMPOTENCY_CONFLICT。限额在幂等处理前计数，安全重试仍可能消耗额度。

当前AI_MODE只支持demo/vercel，Vercel AI Gateway是唯一真实入口；公开配置不提供OpenAI直连模式。管理统计是NestJS第一方聚合API，必须服务端验证管理员角色；管理端目标路由为GET /api/admin/summary、/admin/users、/admin/events及/me；后端已接入当前会话与管理员角色检查，完整 HTTP 集成仍需最终验证，详见[管理端契约](admin.md)。这些不是匿名公开接口。

## 公开接口

| 方法与路径       | 输入            | 输出                                                                             |
| ---------------- | --------------- | -------------------------------------------------------------------------------- |
| GET /api/health  | 无              | ok、storage=memory/mongo、demo                                                   |
| GET /api/config  | 无              | demo、aiMode、paymentMode、emailMode、premiumPriceCents、USD、paymentEnvironment |
| GET /api/catalog | interest和q可选 | catalogVersion、tools；q最多取100字符                                            |

公开配置不含秘密。数据库目录版本从catalog_versions/current读取；工具链接只能由目录提供。

## Box

| 方法与路径                | 权限/输入                       | 输出                          |
| ------------------------- | ------------------------------- | ----------------------------- |
| POST /api/boxes/free      | Brief+Idempotency-Key；登录可选 | box、accessToken、emailStatus |
| GET /api/boxes/:id        | owner会话或X-Box-Token          | {box}                         |
| POST /api/boxes/:id/email | 访问权+{email,consent:true}     | {status:demo/sent/failed}     |

Box含id/title/summary/interest/tier/tools/workflow/createdAt/generationMode。推荐含toolId/why/useCase/prompt/steps。Free正好1，Premium正好3且不重复；workflow仅引用本Box所选ID。

emailStatus=skipped/demo/sent/failed。失败持久化，后台恢复pending/failed，自动总尝试最多5次且创建未满23小时；手动独立限流。sent只表示邮件供应商接受，不证明送达。

## 订单

| 方法与路径                                  | 权限/输入                  | 输出                                                                      |
| ------------------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| POST /api/checkout/orders                   | Brief+Idempotency-Key      | orderId、paypalOrderId、approvalUrl?、demo、accessToken、amountCents、USD |
| GET /api/checkout/orders/:id                | owner或X-Order-Token       | id、付款/生成状态、金额；付款完成可含boxId                                |
| POST /api/checkout/orders/:id/capture       | 订单访问权+{}；paypal模式  | BoxResponse                                                               |
| POST /api/checkout/orders/:id/demo-complete | 订单访问权+{}；demo模式    | BoxResponse                                                               |
| POST /api/webhooks/paypal                   | 原始事件正文和PayPal签名头 | 验签入库后202 {accepted:true}                                             |

capture只接受已创建本地id，不接受客户端金额或任意provider ID。demo-complete不能在真实模式使用。付款完成生成失败时从原capture路径恢复，不再扣款。

webhook不得修改原始JSON；保留paypal-auth-algo/cert-url/transmission-id/transmission-sig/transmission-time。入口验证签名后去重入库；后台读取canonical order再次检查。实际sandbox验签仍需真实环境测试。

## 账号

| 方法与路径                    | 输入                     | 输出                                   |
| ----------------------------- | ------------------------ | -------------------------------------- |
| POST /api/auth/request-code   | {email}                  | challengeId；仅demo额外developmentCode |
| POST /api/auth/verify-code    | {challengeId,code}       | {user}和会话cookie                     |
| GET /api/auth/me 或 /api/me   | cookie可选               | {user}或{user:null}                    |
| POST /api/auth/logout         | cookie可选               | {ok:true}并清会话/cookie               |
| GET /api/me/boxes             | 必须登录                 | {boxes}                                |
| GET /api/me/favorites         | 必须登录                 | {toolIds}                              |
| PUT /api/me/favorites/:toolId | 登录+{saved:true/false}  | {toolIds}                              |
| POST /api/me/claim-box        | 登录+{boxId,accessToken} | {claimed:true}                         |

challengeId为UUID，码6位，有效10分钟，最多5次尝试，成功不可重用。claim需要正确资源凭证，不能夺取其他用户已归属Box。

## 第一方活动与管理报告

| 方法与路径             | 输入/权限                                                                                    | 输出                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| POST /api/activity     | 严格 JSON：eventId UUID、visitorId UUID、path 为 /、/discover、/box、/account；正常来源/限流 | 202 {accepted:true}                                                           |
| GET /api/admin/summary | 当前 admin 会话；from/to 可选                                                                | period、counts、interests、funnel、notes                                      |
| GET /api/admin/users   | 当前 admin 会话；同一 UTC 窗口                                                               | {users}，最多 100 个窗口内最近注册账户                                        |
| GET /api/admin/events  | 当前 admin 会话；同一 UTC 窗口                                                               | {events}，最多 100 个最新事件，仅 id/type/at/interest/mode/paymentEnvironment |

未登录报告返回 401，member 返回 403。角色每次从服务端账户读取，客户端不能传 role 赋权。日期起含止不含，默认近 7 天，最多 31 天；错误窗口返回 400 INVALID_PERIOD。页面事件只允许固定粗粒度路径，不接收查询串或完整 Box ID。可选活动写入失败不回滚成功业务，因此 202 不承诺该事件已持久保存。订单/Box/账户总量另由必要持久化业务记录计算，可选事件不保留账户 ID；报表仍不是净收入或完整付款对账。实际口径及角色 CLI 见[管理端说明](admin.md)。

## 预设额度

| 范围                  | 额度                                                                |
| --------------------- | ------------------------------------------------------------------- |
| Free                  | FREE_DAILY_LIMIT；production默认5，开发默认50，每个固定24小时时间桶 |
| 创建订单              | 20/限流主体/小时                                                    |
| capture/demo-complete | 50/限流主体/小时                                                    |
| 手动Box邮件           | 10/限流主体/小时                                                    |
| 请求登录码            | 20/限流主体/小时，另5/规范化邮箱/小时                               |

登录用户Free按userId；匿名经Web按生产可信IP/开发visitor。开发直连API才回退req.ip；生产无有效签名不能提供限流主体。不能把任意XFF当事实。这不是对外正式套餐承诺，需边缘防刷与预算。

页面活动另限 200 次/限流主体/小时；管理报告限管理员，用户与事件列表各最多 100 条。

## 拒绝路径

无/错Origin、额外金额字段、同key改输入、无凭证读Box、跨账号访问、无效/重放验证码、未知收藏工具、无效webhook、错商户/金额/币种、重复capture、模型未知ID均不得误报成功。错误不泄漏上游原文、密钥、验证码或完整个人数据。

## MCP 协议入口

/mcp 是现有 Nest 内的可选 Streamable HTTP 入口，默认关闭，不接受网站会话 cookie。支持的 scope 为 analytics:read、drafts:read、drafts:write；仅汇总统计和私有未发布草稿，不能导出用户邮箱或发起外部动作。配置、幂等、审计与验证范围以[模块说明](../apps/api/src/mcp/README.md)为准。此处不提供可直接使用的访问凭据，不授权配置持续访问或远程发布。
