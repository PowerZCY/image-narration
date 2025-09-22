# Stripe 支付与积分系统测试用例

本测试文档基于《Stripe 支付与积分系统实施方案》，目的是验证积分扣减、匿名限免、支付充值和时序逻辑是否符合设计，防止支付积分错配或匿名滥用。

## 方案覆盖映射

| 实施方案章节 | 关键能力 | 对应测试用例 |
| --- | --- | --- |
| 匿名限免与风控 | 匿名额度发放、HMAC 匿名 ID、异常信号拦截 | TC-01 ~ TC-03C, TC-15 |
| 用户初始化与积分账户 | `ensureUser` 幂等、余额读取、过期校验 | TC-04 ~ TC-06A, TC-12A ~ TC-12D, TC-USER-001 |
| `/api/ai-generate` 事务 | 扣减流程、失败补偿、并发锁 | TC-06, TC-06A, TC-08A, TC-12, TC-12E, TC-CREDIT-001, TC-CREDIT-002 |
| 价格梯度与前端逻辑 | 余额前置校验、价格弹窗、开发调试面板 | TC-05, TC-05A, TC-DEV-001, TC-14 |
| Checkout 与订单表 | 订单创建、`priceId` 校验、未登录拦截 | TC-07, TC-07A, TC-14 |
| Webhook 幂等与权益发放 | 支付成功、重放保护、失败路径 | TC-08, TC-08B, TC-08C, TC-09, TC-10, TC-10A, TC-PAY-002 |
| 积分有效期策略 | 到期前后扣减、批量清算、前端提示 | TC-12A ~ TC-12C, TC-EXPIRE-001 |
| 并发控制策略 | 多端并发、防止超卖、锁超时回退 | TC-12, TC-12E, TC-PERF-001 |
| 安全与运维 | 签名校验、速率限制、日志与监控 | TC-03C, TC-10, TC-15, TC-SEC-001 ~ TC-SEC-003 |

## 测试环境准备

### 必需的环境变量配置
```env
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
SUPABASE_ANON_KEY=eyJyyy...

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_STARTER=price_xxx_starter
STRIPE_PRICE_PRO=price_xxx_pro
STRIPE_PRICE_ELITE=price_xxx_elite

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx

# 安全密钥
ANON_ID_SECRET=your-secret-for-hmac
```

### 数据库准备
- Supabase 项目：包含 `users`、`user_credits`、`credit_logs`、`orders`、`anon_usage`、`stripe_events` 等表
- 确保 `anon_usage.anon_id` 为 `text` 类型
- IP 相关字段存储为 HMAC 处理后的 base64url 字符串
- 配置 moddatetime 扩展或触发器自动维护 `updated_at`

### Stripe 配置
- 创建三个 Price ID：Starter ($2)、Pro ($5)、Elite ($10)
- 本地运行：`stripe listen --forward-to http://localhost:3000/api/payments/webhook`
- 使用测试模式密钥

### Clerk 配置
- 启用邮箱登录
- 准备测试账号：
  - paid_user@example.com (已有积分用户)
  - zcy777et@gmail.com (新注册用户)
  - test_user_1@example.com (并发测试用户)

### 前端准备
- 运行 `pnpm dev` 启动开发服务器
- 浏览器开启第三方 Cookie
- 准备多个浏览器/无痕窗口用于测试

## 公共前置条件
1. 清空测试数据：
   ```sql
   TRUNCATE TABLE orders, credit_logs, user_credits, anon_usage, stripe_events CASCADE;
   ```
2. 准备 Stripe 测试卡：
   - 成功卡：4242 4242 4242 4242
   - 拒绝卡：4000 0000 0000 0002
   - 3D验证：4000 0025 0000 3155
3. 浏览器准备：
   - Chrome 无痕模式（匿名测试）
   - Firefox 普通模式（登录测试）
   - Safari（兼容性测试）

## 测试用例

| 编号 | 模块 | 场景 | 步骤 | 预期结果 |
| ---- | ---- | ---- | ---- | -------- |
| TC-01 | 匿名限免 | 首次匿名访问 | 1. 无痕模式访问首页；2. 浏览器检查请求 `/api/anonymous-usage`；3. 通过 Turnstile；4. 调用 `/api/ai-generate` | 返回 200；`anon_usage` 新增记录，`usage_count=1`；`anon_id`/`ip_hash`/`ip_subnet_hash` 均为 base64url 字符串；`credit_logs` 写入 `type=free`、`anon_id` 关联；按钮提示“还可体验 0 次”。 |
| TC-01A | 匿名限免 | 风控元数据 | 1. 执行 TC-01；2. 查询 `credit_logs` 与 `anon_usage.metadata` | `credit_logs.metadata` 保存 `trialCredits`、Turnstile 校验信息、UA/IP hash；`anon_usage.metadata` 记录 `fingerprint_source`、`user_agent`；敏感字段已脱敏。 |
| TC-02 | 匿名限免 | 匿名二次调用超限 | 1. 在 TC-01 同一会话再次调用生成；2. 若需要刷新页面 | 接口返回 402/错误提示；前端弹出登录/注册引导；`usage_count` 保持 1；不新增 `credit_logs`。 |
| TC-03 | 匿名 Cookie | 匿名切换设备 | 1. 换浏览器或清 Cookie；2. 再次访问并生成 | 因相同受信 IP/UA/指纹，服务端返回相同 `anon_id`；`anon_usage` 不重置；仍提示额度已用完。 |
| TC-03A | 缺失关键信号 | 1. 通过代理屏蔽 IP 或禁用指纹 API；2. 调用 `/api/anonymous-usage` | 返回 403 并提示完成人机验证或登录；`anon_usage` 无新增。 |
| TC-03B | 伪造 IP 头 | 1. 拦截请求手动添加 `X-Forwarded-For`；2. 保持受信头为空；3. 调用 `/api/anonymous-usage` | 服务端忽略该头，仍使用受信源 IP；若无法解析受信 IP 则返回 403；数据库未新增异常 `anon_usage` 记录。 |
| TC-03C | 明文泄露检查 | 1. 查询 `anon_usage` 最近记录；2. 与真实 IP 对比 | `ip_hash`/`ip_subnet_hash` 不等于明文 IP 或子网，均为 HMAC 后的 base64 字符串，无法直接还原。 |
| TC-04 | 登录状态检测 | 页面初始时序 | 1. 登录已存在积分用户；2. 打开首页；3. 观察网络请求顺序 | `useAuth` 立即请求 Clerk；并行触发 `/api/user/credits`（含 `ensureUser`）和 `/api/anonymous-usage`；页面中按钮依余额展示；无阻塞。 |
| TC-DEV-001 | 调试面板 | NODE_ENV=development 展示信息 | 1. 设置 `NODE_ENV=development`；2. 登录后访问首页；3. 展开测试信息面板 | 面板展示 `anonId`、`userId`、`clerkUserId`、匿名剩余额度、最新订单摘要与 `expiresAt`；所有字段与 API 返回一致；生产环境下默认隐藏。 |
| TC-05 | 登录用户余额不足 | 余额为 0 调起支付 | 1. 登录积分为 0 的用户；2. 点击生成按钮 | 前端延迟检查余额后弹出价格组件；`/api/ai-generate` 不被调用；`credit_logs` 无新增。 |
| TC-05A | 价格组件 | 未登录点击购买 | 1. 清除登录状态；2. 点击任一价格按钮 | 触发 Clerk `openSignIn`；不会发起 `/api/payments/checkout`；弹窗 `afterSignInUrl` 指向当前页面以完成回跳。 |
| TC-06 | 登录用户有余额 | 扣减积分 | 1. 手工给用户 `user_credits.balance=5`、`expires_at` 在未来；2. 登录并调用生成 | 接口返回 200；`user_credits.balance` 减为 4；对应 `credit_logs` 首写 `status=pending`，请求成功后更新为 `confirmed`、`credits=1`；`expires_at` 保持不变；前端刷新余额。 |
| TC-06A | 积分日志 | `metadata` 与 `ref_id` 校验 | 1. 登录用户发起生成请求；2. 记录前端请求 ID；3. 查询 `credit_logs` | 日志 `ref_id` 匹配请求 ID；`metadata` 包含生成上下文（模型、输入 hash 等）；重复请求触发唯一索引报错，防止重复扣减。 |
| TC-07 | Checkout | 创建订单 | 1. 登录余额 0 用户；2. 点击价格组件 Starter；3. 进入 Stripe Checkout 不支付退出 | `/api/payments/checkout` 返回 200，跳转 Stripe；Supabase `orders` 插入 `state=pending`，记录 `credits=10`、`amount=2.00`、`currency='usd'`；`credit_logs` 无新增。 |
| TC-07A | Checkout | 未登录访问 | 1. 清除 Clerk session；2. 直接调用 `/api/payments/checkout` | 接口返回 401/未登录错误；不写入 `orders`；前端提示重新登录。 |
| TC-08 | Checkout | 支付成功 | 1. 接续 TC-07，完成 Stripe 测试支付；2. Webhook 回调 | Webhook 200；`orders.state` 更新为 `paid`；`credit_logs` 写入 `type=recharge`、`status=confirmed`、`credits=10`；`user_credits.balance` 加 10；`user_credits.expires_at` 更新为 `now()+1y`（或更晚）；`stripe_events` 新增 `event_id`；`orders.extra` 更新 Session 详情。 |
| TC-08A | AI 失败补偿 | 生成过程出错 | 1. 模拟 AI 服务返回 500；2. 登录用户积分为 1；3. 触发生成 | 扣减事务写入 `status=pending`、`credits=1`；AI 失败后触发补偿，`user_credits.balance` 恢复 1；`credit_logs` 更新为 `status=refunded`，`metadata.failReason` 保存错误。 |
| TC-08B | 连续购买延长有效期 | 1. 首次支付成功记录 `expires_at=A`；2. 30 天后再次支付；3. 读取 `/api/user/credits` | 第二次支付后 `expires_at` 更新为 `max(A, now()+1y)`；余额累计 20；两条 `recharge` 日志均为 `confirmed`。 |
| TC-08C | Webhook 重放 | 1. 记录 TC-08 `event_id`；2. 5 分钟后附带同签名重放；3. 伪造过期事件 (timestamp 1h ago) | 首次重放返回 200 且无新增日志（`stripe_events` 去重）；过期事件被拒绝并记录安全告警。 |
| TC-09 | Webhook 幂等 | 重发回调 | 1. 记录 TC-08 `session_id`；2. 手动重发 `stripe trigger checkout.session.completed --add checkout_session=id=<session>` | Webhook 返回 200；`orders.state` 保持 `paid`；`credit_logs` 未重复插入（唯一索引生效）；`balance` 不再增加；`stripe_events` 无重复条目。 |
| TC-10 | Webhook 异常 | 校验失败 | 1. 停止 `stripe listen`；2. 手动发起无签名 POST 到 webhook | 返回 400/401；数据库无更改；日志记录错误；系统可重试。 |
| TC-10A | Webhook | 未知 session 或已删除订单 | 1. 构造合法签名但 `session_id` 无匹配订单的事件；2. 触发 webhook | Webhook 返回 200；写入 `stripe_events` 记录避免重复处理；不会新建订单或积分；产生告警日志提示手工对账。 |
| TC-11 | 金额准确性 | 积分与订单匹配 | 1. 完成一笔 Starter 支付；2. 审核 `orders.amount`、`credit_logs.credits`、`orders.credits` | `orders.amount=2.00`；`orders.credits=10`；`credit_logs.credits=10`；余额为历史余额+10；`expires_at` 正确延长。 |
| TC-12 | 多端同步 | 并发生成 | 1. 登录账号在两个浏览器各开启生成；2. 准备余额 10；3. 模拟 20 并发请求 | 最终余额不为负；`credit_logs` `consume` 条数与成功请求一致；所有日志均处于 `confirmed`；`expires_at` 保持不变。 |
| TC-12A | 到期前使用 | 1. 设置 `user_credits.balance=5`、`expires_at=未来 1 分钟`；2. 在到期前调用生成 | 请求成功；余额扣减；到期时间仍为原值。 |
| TC-12B | 到期后阻断 | 1. 设置 `user_credits.balance=5`、`expires_at=过去时间`；2. 调用 `/api/ai-generate` | 返回 402 并提示积分过期；`credit_logs` 无新增；引导购买。 |
| TC-12C | 到期清算任务 | 1. 设置 `user_credits.balance=5`、`expires_at=过去时间`；2. 运行到期清算任务 | 清算后 `balance=0`、`expires_at` 置空；新增 `credit_logs(type='expire', credits=5, status='confirmed')`。 |
| TC-12D | 过期边界时间 | 1. 设置 `expires_at` 为当日 23:59:59 UTC；2. 在该时间点前后各执行一次扣减 | 截至 23:59:58 成功；23:59:59 后返回过期；日志与余额符合预期。 |
| TC-12E | AI 失败并发补偿 | 1. 模拟两个并发生成；2. 将其中一个请求的 AI 回调强制失败 | 成功请求写 `consume/confirmed`；失败请求回滚余额并生成 `consume/refunded`；`balance` 与预期一致。 |
| TC-13 | 匿名到登录迁移 | 匿名体验后注册 | 1. 匿名用完免费额度；2. 注册并登录；3. 调用生成 | 登录后按余额判断；匿名 `usage_count` 保持 1；登录后必须购买或拥有积分才可继续；无免费额度累加。 |
| TC-14 | 价格配置 | 错误 priceId | 1. 手动篡改请求 `priceId='fake'`；2. 调用 `/api/payments/checkout` | 接口返回 400；不创建订单；前端提示失败。 |
| TC-15 | 速率限制 | 匿名频繁调用 | 1. 使用脚本循环请求匿名 `ai-generate`；2. 观察响应 | 命中速率限制返回 429；`anon_usage` 无异常增长；系统日志有记录。 |
| TC-16 | Clerk 失效 | 未登录访问余额接口 | 1. 清除 Clerk session；2. 调用 `/api/user/credits` | 接口返回 401/未登录；前端 fallback 到匿名逻辑；不执行 `ensureUser`。 |
| TC-17 | `ensureUser` 幂等 | 重复登录 | 1. 使用同一个 Clerk 用户多次刷新页面；2. 观察数据库 | `users` 仅一条；`user_credits` 不重复插入；`updated_at` 正常刷新。 |
| TC-18 | 订单失败 | Stripe 未完成支付 | 1. 在 Checkout 中失败（卡拒付模拟 `4000 0000 0000 0002`）；2. 触发回调 | Webhook 接收 `payment_failed` 后 `orders.state` 更新为 `failed`（若实现）；无积分发放；前端提示错误。 |
| TC-19 | 连接中断恢复 | 1. 模拟 Supabase 连接短暂中断（kill session）；2. 重试 `/api/ai-generate` 与 webhook | 接口捕获异常并返回 503；重试后恢复；无重复扣减或充值。 |
| TC-20 | 负载测试 | 1. 使用 k6/JMeter 模拟 5QPS 并发调用 `/api/ai-generate`（余额充足）；2. 运行 10 分钟 | 接口成功率 ≥ 99%；平均延迟符合预期；`credit_logs` 与余额一致；无锁超时。 |

## 语义验证
- 数据校验：确认 `credit_logs.credits` 在不同类型下与实际发放/扣减的积分一致（充值、消费、试用、过期等），并保证 `user_credits.expires_at` 与最新充值有效期一致。
- 安全校验：检查 `stripe_events` 记录的 `event_id`，Turnstile token 使用率、匿名限额触发情况，确保无重放或越权访问。
- 并发校验：对 `consume` 日志的 `status`、`metadata` 进行抽查，确保失败补偿、锁粒度生效。
- 日志与监控：验证 Sentry/日志系统捕获接口异常、Webhook 重试等关键路径。
- 订单校验：比对 `orders.extra` 中的 Checkout Session 摘要与 Stripe Dashboard，一致后再归档；确认测试信息面板数据与数据库同步。
- 文档回归：如逻辑有调整，及时更新实施方案与当前测试文档，保持一致性。

