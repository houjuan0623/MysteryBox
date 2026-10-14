# 数据模型与安全不变量

本文件为当前功能设计摘要。字段与仓储细节以 [数据模型](../../docs/data-model.md)、实际共享类型和完成后的迁移/索引测试共同核对，不能据此声称数据库已验收。

## MongoDB 与集合

采用官方 Node.js 驱动和 replica-set 事务。当前聚合仓储通过 `(kind,key)` 标识文档并建立唯一复合索引；聚合内容仍须按模型校验。上线前校验索引、拓扑、seed、持久化恢复；MemoryStore 不满足生产要求。

| 聚合         | 关键字段/状态                                               | 不变量                                                   |
| ------------ | ----------------------------------------------------------- | -------------------------------------------------------- |
| Tool         | id、interests、官方 URL、指导                               | 16 条真实目录；每兴趣至少 4 候选                         |
| Box          | id、owner/匿名凭据、brief、tier、tool IDs、workflow、mode   | Free=1，Premium=3 不重复；只能引用目录工具               |
| User         | id、email、role、createdAt、lastLoginAt                     | 默认 member；浏览器不得写 role；统计含邮箱时仅管理员可见 |
| Session      | token 摘要、userId、expiresAt                               | 有效期和退出失效；授权读当前用户角色                     |
| Verification | 邮箱关联、验证码摘要、expiry、消费状态/次数                 | 限时、限尝试、并发单次消费；不在普通日志输出原码         |
| Order        | owner、brief 指纹、金额/币种、mode、供应商引用、status      | 服务端权威金额和归属；退款/失败状态不冒充成功            |
| Idempotency  | 主体、操作、业务 key、输入指纹、状态、结果引用              | 同键同输入复用；不同输入冲突；不能串用户                 |
| Delivery     | box/order 引用、recipient、稳定发送 key、状态               | 重试不重复发送；demo 不冒称送达                          |
| Activity     | id、type、at、interest、mode、environment、userId/visitorId | 事件去重；不含原始目标/原始 IP/验证码/密钥；保留期 30 天 |
| MCP Draft    | id、principalId、kind/content、createdAt、幂等引用          | 同主体同写键同内容返回同一记录；列表按授权主体隔离       |
| MCP Audit    | requestId、principalId、工具/操作、结果、时间               | 无原始令牌、密钥或草稿正文；失败也按允许范围记审计       |

MCP 已实现 `mcp_drafts`、`mcp_idempotency`、`mcp_audit`；草稿字段为 id/owner/type/title/content/tags/status/createdAt，status 固定 draft。13项HTTP/语义测试之外，08:18:43扩展真Mongo测试已验证这三类文档：双连接12并发仅一draft/receipt、冲突、审计脱敏、完整mongod重启后重放/列出与审计持久化。Mongo链路使用官方SDK InMemoryTransport，不能描述为同一HTTP数据库端到端测试。

## 状态与一致性

1. 业务输入先标准化，再生成/比较输入指纹；所有权是幂等范围的一部分。
2. 数据库业务 guard 与唯一索引共同保护竞争；并发测试必须跨连接，不能仅依赖进程内 mutex。
3. 订单的 pending、外部进行中、成功、失败/待核对等状态必须能区别；不确定提交不等同于业务失败。
4. 供应商调用不放在会自动重跑的事务闭包里；保留稳定外部 key 和请求引用。
5. 邮箱认领、验证码消费、收藏写入、MCP 草稿均须验证所有者/主体并在需要时事务提交。
6. 统计事件不是支付账本，demo/sandbox/live 分开，不能直接将计数标为净收入。

## 必须验证的故障

- 唯一键竞争、事务回滚、同 key 不同指纹、进程重启后读取。
- 提交响应丢失、外部成功而数据库响应未知、重复 capture/webhook。
- 两个用户/匿名凭据交叉访问、角色撤销后旧会话。
- 统计重复事件与过期清理、MCP scope 和草稿越权。
