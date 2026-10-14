# 管理端、第一方统计与权限

更新：2026-10-14。当前新要求是恰好三个应用：apps/web、apps/api、apps/admin。Admin为独立Next.js应用，使用shadcn/ui与Tailwind，默认端口3001；对应workspace为@mysterybox/admin。

## 1. 独立运行与职责

Admin可单独dev/build/start。它只提供管理界面和受限同源代理；数据库查询、指标计算与管理员鉴权在NestJS。管理端不直接连接MongoDB，不含AI/PayPal/Resend密钥。

首次入口为邮箱OTP登录。会话使用API的mb_session HttpOnly cookie。登录成功不自动成为管理员；角色必须由服务端记录/管理流程决定，不能由浏览器字段、邮箱显示名或隐藏菜单赋予。

服务端每次请求从有效会话读取当前用户角色。未登录返回 401，普通 member 返回 403；CLI 撤权后，原有效会话的下一次请求也会失去报告权限。没有默认管理员或万能邮箱。

管理员通过本地运维命令赋权/撤权。仅支持 MongoDB，目标账户必须先完成邮箱验证码登录。命令不创建用户、密码或密钥；下列地址仅为占位示例，不授权为任何实际账户赋权：

```bash
npm run admin:role -- grant verified-operator@example.com
npm run admin:role -- revoke verified-operator@example.com
```

运维人员应确认目标邮箱、数据库环境和批准记录后执行；先在隔离库验证角色变更，再准备生产授权流程。MemoryStore 不提供此角色初始化。

## 2. 代理最小开放集

按管理端实现，代理仅允许：

- GET /api/admin/summary
- GET /api/admin/users
- GET /api/admin/events
- GET /api/me
- POST /api/auth/request-code
- POST /api/auth/verify-code
- POST /api/auth/logout

其他付款、订单或用户修改路径不应通过Admin代理。API 已提供 /api/me 与 /api/auth/me 两个身份查询别名，全部 admin/* 路由在后端检查当前管理员角色；代理 allowlist 不能替代后端授权。

API_INTERNAL_URL默认指向API4000。PROXY_SHARED_SECRET和TRUSTED_CLIENT_IP_HEADER遵循相同可信入口规范。后端ADMIN_APP_URL默认为http://localhost:3001，必须是精确origin；生产HTTPS。APP_URL与ADMIN_APP_URL应分别配置，不开放任意来源。

## 3. 指标口径

所有统计来自本项目第一方activity和users等记录；没有外部分析平台，没有生成假数据。空库显示0或空列表。

| 指标               | 当前口径/边界                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| page views         | UTC 窗口内可选 page_view 事件数                                                                      |
| visitors           | 页面事件中去重的 HMAC 浏览器标识；不是已验证真人数                                                   |
| new users          | 持久化用户 createdAt 在窗口内的账户数                                                                |
| active users       | 持久化用户的最近一次成功登录 lastLoginAt 落在窗口内；不是所有操作活跃度或完整历史登录频次            |
| Free/Premium boxes | 持久化 Box 为 ready 且 createdAt 在窗口内，按 tier 计数                                              |
| demo/test orders   | 持久化订单 createdAt 在窗口内，paymentEnvironment 为 demo/sandbox                                    |
| paid orders        | 持久化订单 paymentStatus=completed、paymentEnvironment=live 且 paidAt 在窗口内；不受生成成功与否影响 |
| interests          | 上述 ready Box 的 brief.interest 分布                                                                |
| funnel columns     | 可选事件中各阶段独立去重浏览器数；不是同一 cohort 转化率                                             |

订单、Box 与账户计数来自必要业务记录，不依赖可选活动采集；关闭可选统计不会删去必要业务总量。已付款生成失败和 webhook 履约按持久化付款状态计数。paidOrders 仍不是净收入，不扣退款/争议，也不是完整财务对账报告。Box 按创建时间而非就绪时间筛选；历史窗口的结果可能随稍后完成生成而变化。lastLoginAt 仅保留最近成功登录，后续登录可能使账户不再落在较早窗口，不能据此计算完整历史留存。

清除浏览器存储、机器人、重复设备都会影响访客数。用户列表含邮箱，属于私有管理数据，严格限管理员，不在公开首页或外部分析中展示。

日期过滤采用UTC、from包含/to不包含，默认近7天，窗口最多31天。用户报告按注册日期筛选，当前设计最多返回100个最近注册用户；分页/导出不在此次最小范围。三个报告使用同一筛选窗口。界面日期控件的结束日期按包含当天理解，发送 API 时转换为下一天 00:00:00 UTC 的排除端点，避免把结束当天漏掉。

## 4. 采集与保留

当前可选 activity 写入不保留账户 ID；字段为 event ID/type/time、可选 interest/mode/paymentEnvironment/path 及 HMAC 化浏览器标识，不采完整请求正文、原始 IP、设备指纹、邮箱、验证码或供应商秘密。业务入口没有 visitor header 时跳过可选事件。事件枚举含 page_view、registration、login、free_box、premium_box、checkout；新用户数直接读 users.createdAt，不依赖 registration 事件。

当前后台每小时运行 prune，删除超过 30 天的 activity；进程停机期间不会执行清理，因此这不是精确到秒的删除承诺。需在运营中观察清理异常及执行结果。账户/订单保留另由政策决定。

页面活动接口严格接收 eventId/visitorId UUID 与四个固定 path，不接收 goal、email 或任意 URL。前台 sessionStorage 保存短期访客 UUID，服务端只存 HMAC 后标识；前台提供关闭选项并遵守 Do Not Track。可选漏斗事件由带有访客标识的业务入口产生，记录失败不回滚订单或 Box；关闭可选统计不等于不保存必要订单、Box、账户和最近登录记录。

## 5. 新验收要求

- 未登录不能读报告，普通member不能读报告，admin可读，撤权后失去访问。
- 前端不自行赋权，API直接调用也不能绕过。
- UTC边界、空数据、坏日期/超31天、筛选一致。
- 模拟订单、sandbox与live标签不混淆，不显示假营收。
- 稳定事件ID防业务重试重复计数。
- 匿名浏览器数/漏斗的限制文案可见。
- 管理代理拒绝未列出的修改路由。
- 管理端独立build/start、cookie/Origin/代理身份和角色端到端测试。

上述都是当前 Mongo/三应用版的完整验收要求，旧 Web 测试不覆盖新增 Admin。当前已取得 Admin 5 项 UTC 单元、TypeScript、独立生产构建及 1 项实际 Next 代理请求检查结果；五个浏览器 UI 用例被环境 socket 限制阻塞，后端角色/统计集成仍待验证，详见[验收证据](acceptance.md)。
