# 管理端、第一方统计与权限

更新：2026-10-14。当前新要求是恰好三个应用：apps/web、apps/api、apps/admin。Admin为独立Next.js应用，使用shadcn/ui与Tailwind，默认端口3001；对应workspace为@mysterybox/admin。

## 1. 独立运行与职责

Admin可单独dev/build/start。它只提供管理界面和受限同源代理；数据库查询、指标计算与管理员鉴权在NestJS。管理端不直接连接MongoDB，不含AI/PayPal/Resend密钥。

首次入口为邮箱OTP登录。会话使用API的mb_session HttpOnly cookie。登录成功不自动成为管理员；角色必须由服务端记录/管理流程决定，不能由浏览器字段、邮箱显示名或隐藏菜单赋予。

最终管理员赋权命令尚待核心实现确认，本检查点不臆造默认管理员或万能邮箱。公开部署前必须完成明确的安全赋权/撤权和非管理员拒绝测试。

## 2. 代理最小开放集

按管理端实现，代理仅允许：

- GET /api/admin/summary
- GET /api/admin/users
- GET /api/admin/events
- GET /api/me
- POST /api/auth/request-code
- POST /api/auth/verify-code
- POST /api/auth/logout

其他付款、订单或用户修改路径不应通过Admin代理。API必须实际提供/me或对齐代理契约，并在全部admin/*路由进行角色检查；代理allowlist不能替代后端授权。

API_INTERNAL_URL默认指向API4000。PROXY_SHARED_SECRET和TRUSTED_CLIENT_IP_HEADER遵循相同可信入口规范。后端ADMIN_APP_URL默认为http://localhost:3001，必须是精确origin；生产HTTPS。APP_URL与ADMIN_APP_URL应分别配置，不开放任意来源。

## 3. 指标口径

所有统计来自本项目第一方activity和users等记录；没有外部分析平台，没有生成假数据。空库显示0或空列表。

| 指标                    | 口径/边界                                              |
| ----------------------- | ------------------------------------------------------ |
| page views              | 指定UTC窗口内page_view事件数                           |
| visitors                | 页面浏览事件中去重的短期浏览器标识，不是已验证真人数   |
| new users               | createdAt在窗口内的账户数                              |
| active users            | 登录/Box/checkout活动中的去重userId                    |
| Free/Premium boxes      | 对应业务事件数，资源事件ID去重                         |
| demo orders             | 模拟checkout事件，不能代表收费                         |
| PayPal/paid-order相关数 | 必须区分sandbox/live；不计算净收入，不含退款/争议对账  |
| interests               | Free/Premium事件的兴趣分布                             |
| funnel columns          | 同窗口中不同阶段的独立去重访客数，不是同一cohort转化率 |

清除浏览器存储、机器人、重复设备都会影响访客数。用户列表含邮箱，属于私有管理数据，严格限管理员，不在公开首页或外部分析中展示。

日期过滤采用UTC、from包含/to不包含，默认近7天，窗口最多31天。用户报告按注册日期筛选，当前设计最多返回100个最近注册用户；分页/导出不在此次最小范围。三个报告使用同一筛选窗口。界面日期控件的结束日期按包含当天理解，发送 API 时转换为下一天 00:00:00 UTC 的排除端点，避免把结束当天漏掉。

## 4. 采集与保留

activity仅保存固定字段：event ID/type/time、可选userId/interest/mode/path以及HMAC化浏览器标识，不采完整请求正文、原始IP、设备指纹、验证码或供应商秘密。事件类型包含page_view、registration、login、free_box、premium_box、checkout。

设计事件保留期为30天，prune清理函数和实际调度必须一起验证；不能仅因函数存在就宣称数据已按期删除。账户/订单保留另由政策决定。

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
