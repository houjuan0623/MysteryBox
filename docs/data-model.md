# MongoDB数据模型与一致性设计

当前要求以[ADR-008](adr-latest-stack.md)为准。本文描述要恢复/实现的MongoDB设计，不表示真实集成测试已经通过。

## 1. 存储结构

使用官方mongodb驱动。物理集合app_records包含_id（sha256编码的[kind,key]）、kind、key、payload、createdAt/updatedAt（BSON Date）。payload是BSON对象，不是JSONB或SQL行。

唯一复合索引(kind,key)保证同类型业务键只能一份。MongoDB支持复合唯一约束；已有重复数据会阻止建立唯一索引，不能通过忽略错误启动。[官方唯一索引说明](https://www.mongodb.com/docs/manual/core/index-unique/)

当前初始化建立kind_key_unique（kind,key唯一）与kind_created_at（kind,createdAt倒序）。owner/provider/任务调度查询索引尚属后续优化，不冒充已建。索引是否真实建立须由初始化和真库测试证明。

## 2. 逻辑聚合

| kind                           | key                   | 主要payload                                                                                                                                    |
| ------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| tools                          | 稳定Tool ID           | 名称、兴趣、能力、HTTPS官网/来源、核验日期、费用提示、限制                                                                                     |
| catalog_versions               | current               | 目录版本 version；条数由 tools 实际记录计算                                                                                                    |
| boxes                          | Box UUID              | ownerId、brief、tier、queued/ready/failed、box                                                                                                 |
| orders                         | 本地Order UUID        | brief、amountCents、USD、providerOrderId、createKey、captureKey、paymentStatus、generationStatus、captureId、boxId、paymentEnvironment、paidAt |
| captures                       | Provider Capture ID   | 不可改成另一订单的orderId                                                                                                                      |
| users                          | User UUID             | 已验证规范化邮箱、member/admin角色、createdAt/lastLoginAt                                                                                      |
| user_emails                    | 邮箱哈希              | 唯一User ID映射                                                                                                                                |
| challenges                     | Challenge UUID        | 邮箱、码HMAC、expiresAt、attempts、used                                                                                                        |
| sessions                       | 高熵session token哈希 | User ID、expiresAt                                                                                                                             |
| favorites                      | User ID               | 不重复Tool ID数组                                                                                                                              |
| free_requests / order_requests | 请求幂等键            | brief/user指纹与原资源ID                                                                                                                       |
| deliveries                     | Box+邮箱关联键        | 收件邮箱、pending/failed/sent/demo、attempts、nextAttemptAt、createdAt                                                                         |
| webhooks                       | PayPal Event ID       | providerOrderId、queued/done、attempts、nextAttemptAt                                                                                          |
| limits                         | scope+主体哈希+时间桶 | count                                                                                                                                          |
| activity                       | 稳定事件ID            | 可选事件 type/at、HMAC 访客标识、interest/mode/paymentEnvironment/path；当前写入去掉账户 ID                                                    |

transaction_guards集合保存_id=业务键与version。事务先递增对应guard以引发同键竞争；不存在lease/TTL自动解锁承诺。只在领域回调开始前为TransientTransactionError重试竞争，等待窗口最多45秒；回调开始后不重跑业务。commit不明确时最多重试同一commit六次，不能再次执行provider动作。

## 3. 原子性边界

- 请求映射与对应Box/订单创建一致。
- 验证码错误次数先提交，失败不能回滚成无限猜码；成功消费只能一次。
- capture唯一归属、订单paid状态与对应待生成Box一致。
- 收藏集合增删幂等。
- 同邮件/同事件/同订单竞争受业务guard保护。
- 目录seed与版本更新一致，不清用户数据，不自动删旧工具。

## 4. 事务和外部调用

只在支持事务的replica-set拓扑使用真实仓储，启动应验证必要能力，不静默退回memory。事务内操作使用同一session，避免同一session内并行操作。[官方Node事务说明](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/)

禁止自动重新运行包含PayPal扣款、模型调用或发信的事务闭包。外部动作不会随MongoDB回滚而撤销，commit结果不确定也不能直接等同失败。

低流量实现仍可能有长业务临界区，应设置边界和超时。后续用持久任务lease/outbox与短事务分离网络操作；不声称严格端到端exactly-once。

## 5. 目录发布

版本化catalog.ts为编辑来源，显式seed将16条工具写入MongoDB，记录版本；启动从数据库加载快照并校验字段/HTTPS/唯一ID/条数/版本。MemoryStore在开发使用同一代码目录。改seed后重启加载，保留历史ID兼容。

## 6. 生命周期

挑战、会话、限流桶、任务和用户历史各需明确保留期。业务expiresAt检查不等于物理自动删除；除非实际创建并验证TTL索引，不宣称已自动清理。付款关联、删除导出与财务保留由产品/运营决定，不能直接删除恢复困难的记录。

## 7. 真库测试与剩余故障覆盖

连接replica set、索引唯一性、未初始化拒绝、回滚、竞争guard跨连接互斥、同订单并发、同验证码并发、持久化重开、目录seed/版本、进程中断后任务恢复、事务冲突不重放外部回调、提交结果不明确恢复。2026-10-14 已有 MongoDB 8.0.17 真副本集局部检查通过：索引初始化、重复 insert、20 并发 guard、回滚、目录、同订单模拟 capture、真实 Nest HTTP 角色撤权，以及 mongod 完整停启后的持久化。08:18 补充真库测试已覆盖 OTP 并发单次成功、全部管理报告授权、分析去重/prune、MCP 草稿 12 次跨连接并发及重启后草稿/幂等/审计保留。未知 commit 回调不重放另有模拟故障单元；真实网络分区、队列宕机恢复及生产部署仍未验证，见[验收证据](acceptance.md)。

## 8. 管理统计的数据边界

Admin 从必要 orders/boxes/users 记录计算订单、ready Box 和账户总量，从可选 activity 计算页面浏览与独立访客列。事件 ID 去重，UTC 起含止不含。浏览器标识不是真人数，漏斗列不是cohort转化率。activity 保留期 30 天，后台每小时调度清理；角色由本地授权 CLI 赋予，报告每次检查服务端当前角色。邮箱只在管理员用户报告中返回。详见[管理端说明](admin.md)。
