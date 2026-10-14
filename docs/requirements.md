# 当前需求与工程约束

更新：2026-10-14。最新用户要求优先于原始方案，详见[ADR-008](adr-latest-stack.md)。

## 必须满足

| 编号 | 要求                                       | 验收证据                                                         |
| ---- | ------------------------------------------ | ---------------------------------------------------------------- |
| S01  | NestJS独立后端                             | 独立dev/build/start，API不依赖Next进程                           |
| S02  | MongoDB持久化                              | 官方驱动、replica-set事务、唯一(kind,key)、真实集成测试          |
| S03  | Next.js独立前端                            | 独立dev/build/start和部署单元，API地址可配置                     |
| S04  | 前后端通过HTTP通信                         | 固定API上游、明确契约、错误/身份边界                             |
| S05  | ESLint+Prettier+EditorConfig               | 对应配置与当前检查结果，不能只存在文件                           |
| S06  | 不沿用旧测试结论                           | 新恢复/Mongo版本重新验证，旧结果标历史                           |
| S07  | 保留用户原方案                             | source-plan.md字节及SHA-256不变                                  |
| S08  | 恰好apps/web、apps/api、apps/admin三个应用 | 各自独立dev/build/start；Admin使用Next.js + shadcn/ui + Tailwind |
| S09  | 管理端第一方统计与角色保护                 | 非管理员服务端拒绝，demo金额不当真实收入                         |
| S10  | 真实AI只走Vercel AI Gateway                | AI_MODE仅demo/vercel，移除活跃OpenAI直连配置                     |

## 产品范围继续有效

四兴趣creator/developer/student/business，16条真实工具且各兴趣不少于4候选；Free1工具、Premium3工具和手工workflow/Prompt；默认demo USD2.99可配置。邮箱验证码账户、历史、收藏、匿名认领；PayPal/Vercel AI Gateway/Resend适配器。

不含第三方许可证、订阅/额度，不做抽奖。订阅计费、社区、Agent执行、自动增长延期。英文UI，中文说明。

## 权限与运行边界

没有真实凭据就不调用真实供应商；demo不能冒充实扣/推理/送达。库结构改变不授权生产数据迁移或外部服务权限扩大。发布与GitHub操作由主任务按用户授权处理。
