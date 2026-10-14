# 接口契约与验证边界

这是实现需满足的契约约束，不是所有路由已通过的声明。详细既有路由参见 [API 文档](../../../docs/api.md)；实际字段/错误码与共享包完成后必须一起复查。

## 三应用通信

| 调用者          | 目标                          | 允许职责                                  | 禁止职责                                        |
| --------------- | ----------------------------- | ----------------------------------------- | ----------------------------------------------- |
| Web 浏览器      | Web 同源代理 → 固定 API       | 用户交互、请求/错误展示、cookie 转发      | 决定金额/身份/所有权、访问 DB 或供应商秘密      |
| Admin 浏览器    | Admin 允许列表代理 → 固定 API | 登录/会话及只读报表                       | 以客户端 role 赋权、任意 API 转发、修改业务数据 |
| API             | MongoDB/已配置供应商          | 认证、授权、幂等、业务状态、provider 调用 | 在未授权 demo 环境发起真实收费/推理/邮件        |
| 授权 MCP 客户端 | 同一 Nest 服务内受控端点      | 受 scope 限制的统计读取、草稿创建/列出    | 任意执行/外部发送/收费/创建第四应用             |

API_INTERNAL_URL 是 Web/Admin 各自固定上游。APP_URL、ADMIN_APP_URL 使用明确来源；PROXY_SHARED_SECRET 是明确的代理边界共享秘密。会话 cookie 保持 HttpOnly 等安全属性。不得由任意客户端头直接提升角色或更改代理目标。

## 用户业务接口不变量

- 输入严格校验，拒绝未声明字段、非法兴趣、超长目标和客户端指定金额/tier 的越权字段。
- 创建请求必须带符合接口约定的幂等键；键与操作、主体、规范输入绑定。同键异输入产生冲突。
- 读取 Box/Order、认领、历史、收藏和邮件必须验证用户或匿名资源凭据；无凭据不可返回私人内容。
- 支付 capture/webhook 检查金额、币种、商户、归属与供应商完成状态；重复通知复用结果。
- AI 输出必须通过目录、工具数量、去重和工作流引用校验。
- 失败响应稳定且脱敏，日志不暴露会话、验证码、供应商密钥或原始目标。

## 管理读取契约

现有路由：GET /admin/summary、GET /admin/users、GET /admin/events。每次读取均须在 API 检查当前 admin 角色；未登录和 member 拒绝；撤销角色后旧会话拒绝。

日期窗默认近 7 天，UTC 起含止不含，最多 31 天；非法/倒置日期拒绝。无数据返回零/空列表。用户与访客指标不混淆，demo/sandbox/live 明确区分；事件详情不输出原始目标、IP、验证码或秘密。

## MCP 能力契约（已实现并完成局部验证）

实际入口为同一 Nest 进程的 `/mcp`，官方 `@modelcontextprotocol/sdk` 1.32.1 Streamable HTTP；独立 bearer 鉴权，不接受网站 cookie/admin 会话。MCP_ENABLED 未设置或为 0 时不挂载路由。

| 工具              | scope          | 严格输入                                                                                  | 输出/副作用                                             |
| ----------------- | -------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| analytics_summary | analytics:read | from/to ISO 日期，可省略，UTC 最多31天                                                    | 汇总，不暴露原始用户/邮箱/visitor/activity              |
| draft_create      | drafts:write   | type=tool/box/promotion；title 1–120、content 1–8000、tags 最多8×32、idempotencyKey 8–128 | 状态固定 draft，主体隔离；不发送/执行；每主体最多1000条 |
| draft_list        | drafts:read    | 可选 type、UUID cursor、limit 1–50，默认20                                                | 仅当前主体草稿，有界分页                                |

未知字段/方法/工具拒绝；tools/list 按 scope 过滤，直接调用再次校验。默认本机 socket+Host，拒绝 forwarded；带 Origin 的请求须精确允许。独立配置 token SHA-256 摘要和主体，恒定时间比较，不自动发行或配置凭据。正文上限16 KiB。

草稿、哈希幂等 receipt 与成功审计在同一个 Store 原子操作内写入；同主体同键同规范输入复用，异输入冲突；审计失败不得成功提交。审计无 bearer、正文、邮箱、IP 或原始错误。使用 `mcp_drafts`、`mcp_idempotency`、`mcp_audit` 三类文档。

实现与完整配置见 [模块说明](../../../apps/api/src/mcp/README.md)。当前13项SDK/HTTP/事务语义测试使用MemoryStore（含真正Nest bootstrap）；08:18:43另通过官方SDK InMemoryTransport+真Mongo生命周期，覆盖12并发单draft/receipt、冲突、重启重放/列出与审计持久化。无远程客户端/生产凭据注册，audit 无自动保留期、限流是进程内固定桶，广泛远程使用前需独立运维审查。

## 契约测试矩阵

必须有正例与负例：未登录、错误角色、撤销角色、跨所有者、缺 key/不同输入、未知工具、错误 scope、默认关闭、正文超限、超时和供应商未知状态。仅 UI mock 或代理 allowlist 测试不能代替实际 Nest 路由集成。
