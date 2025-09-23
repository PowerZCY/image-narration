# Stripe 支付与积分系统实施方案

## 目标概述
- 引入 Stripe Checkout 处理一次性支付，为用户发放梯度积分。
- 用 Clerk 负责登录；自建 `user_id` 与 Clerk `user_id` 解耦。
- 允许匿名用户免费体验一次，并通过风控手段降低薅羊毛风险。
- 使用 Supabase Postgres 托管积分、订单、匿名使用等数据，同时保证 webhook 幂等。

## 环境与配置
- 在 Supabase 创建项目，获取 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_ANON_KEY`。
- `.env.local` 需新增：
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_ANON_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ELITE`
  - Clerk 所需的 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`、`CLERK_SECRET_KEY` 等。
  - `ANON_ID_SECRET`：用于 HMAC 派生匿名 ID 的服务端密钥。
- `src/lib/supabase.ts`：封装服务端 Supabase Client（使用 Service Role，`autoRefreshToken=false`）。支付、积分相关 API 需 `export const runtime = 'nodejs'`。
- 本地调试：`stripe listen --forward-to http://localhost:3000/api/payments/webhook`。

## 数据库结构（Supabase SQL）

数据库迁移文件已准备好，包含了所有必要的表结构、索引、约束和触发器：

- **主迁移文件**: `supabase/migrations/20250922_create_payment_tables.sql`
- **回滚脚本**: `supabase/rollback/20250922_create_payment_tables_rollback.sql`

### 数据库表说明

- `users`：持久化业务侧的用户主键，与 Clerk 解耦。
- `user_credits`：记录每个用户的积分余额与整体到期时间（多次购买取最大 `expires_at`）。
- `credit_logs`：追踪积分变动与支付流水，`status` 字段区分待确认/已确认/已退回状态，`type` 包含充值/消费/体验/调整/过期，`credits` 统一记录积分增减量。
- `orders`：映射 Stripe Checkout Session，与支付金额、发放积分、状态关联。
- `anon_usage`：针对匿名访客的限免使用、风控追踪字段，持久化 HMAC 处理后的 IP 信息，避免存储明文地址或子网。
- `stripe_events`：存储已处理的 Stripe Webhook `event_id`，用于重放防护。

### 关键改进

1. **数据完整性**：
   - `users.email` 添加了 UNIQUE 约束
   - `anon_usage.anon_id` 添加 CHECK 约束，限制为 43 位 base64url 字符串
   - 所有金额和积分字段添加了非负约束
   - 外键约束使用适当的级联策略（CASCADE 或 SET NULL）

2. **性能优化**：
   - 为所有外键和常用查询字段创建了索引
   - 使用部分索引优化 NULL 值查询
   - 创建复合索引优化复杂查询

3. **自动维护**：
   - 实现了 `update_updated_at_column()` 触发器函数
   - 所有表的 `updated_at` 字段自动更新

4. **运维友好**：
   - 添加了详细的表和字段注释
   - 创建了 `user_credits_overview` 视图便于监控

### 数据库迁移执行方式

#### 本地开发（使用 Supabase CLI）
```bash
# 启动本地 Supabase
supabase start

# 应用迁移
supabase db reset  # 重置并应用所有迁移
# 或
supabase migration up  # 仅应用新迁移
```

#### 生产环境
```bash
# 链接到生产项目
supabase link --project-ref YOUR_PROJECT_REF

# 推送迁移到生产
supabase db push --dry-run  # 预览变更
supabase db push            # 执行迁移
```

#### 直接在 Supabase Dashboard 执行
1. 登录 Supabase Dashboard
2. 进入 SQL Editor
3. 复制 `supabase/migrations/001_create_payment_tables.sql` 内容
4. 执行 SQL

### 回滚操作（紧急情况）
如需回滚，执行 `supabase/migrations/001_create_payment_tables_rollback.sql`。
**警告**：回滚会删除所有相关表和数据，请谨慎操作。

### 后续维护
- `ensureUser(clerkUserId, email, displayName)`：若 `users` 无记录则插入，并确保 `user_credits` 带初始余额 0；返回内部 `user_id`。
- 匿名记录 `anon_id` 时，`fingerprint_source` 存储生成时使用的原始信号（IP、UA、指纹 ID 等）。
- 所有积分操作必须在事务中执行，确保数据一致性。

## 匿名用户策略
1. `middleware.ts` 检查 `anon_id` Cookie；缺失时基于可获取信号派生稳定 ID（若关键信号缺失则直接拒绝匿名额度）：
  ```ts
  import { createHmac } from 'crypto';

  const trustedIp = request.headers.get('x-vercel-ip')
    ?? request.headers.get('x-real-ip')
    ?? request.ip; // 仅使用受信代理注入的头
   if (!trustedIp) throw new Error('missing-ip');
   const ipHash = createHmac('sha256', process.env.ANON_ID_SECRET!).update(trustedIp).digest('base64url');
   // 支持IPv4和IPv6的子网计算
   const getIPSubnet = (ip: string): string => {
     if (ip.includes(':')) { // IPv6: 取前4段
       return ip.split(':').slice(0, 4).join(':');
     } else { // IPv4: 取前3段
       return ip.split('.').slice(0, 3).join('.');
     }
   };
   const ipSubnetHash = createHmac('sha256', process.env.ANON_ID_SECRET!).update(getIPSubnet(trustedIp)).digest('base64url');
   const ua = request.headers.get('user-agent') ?? '';
   const lang = request.headers.get('accept-language')?.split(',')[0] ?? '';
   const timezone = request.headers.get('x-timezone') ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
   const fingerprint = await getBrowserFingerprint(); // Turnstile 校验后再取 canvas/WebGL 指纹，无指纹则拒绝（可接入 FingerprintJS）
   const payload = `${ipHash}|${ua}|${lang}|${timezone}|${fingerprint}`;
   const anonId = createHmac('sha256', process.env.ANON_ID_SECRET!).update(payload).digest('base64url');

   cookies.set('anon_id', anonId, {
     httpOnly: true,
     secure: true,
     sameSite: 'lax',
     maxAge: 60 * 60 * 24 * 30,
     path: '/',
   });
  ```
  - 无法获取受信 IP / Turnstile token / 指纹时直接返回 403，让用户完成验证或登录。
  - `ANON_ID_SECRET` 建议定期轮换，如需额外过期控制可在 payload 中追加时间因子（例如按月滚动）。
   - 服务端需捕获 `missing-ip` 异常，统一返回“请关闭代理或登录”，避免泄露内部实现细节。
2. 首次生成时写入 `anon_usage`：记录 `usage_count=0`、`ip_hash=ipHash`、`ip_subnet_hash=ipSubnetHash`、`fingerprint_source`（存 `ua`/`lang`/Turnstile token/浏览器指纹等）和 `user_agent`；`anon_id` 必须符合 43 位 base64url 字符串格式（由 CHECK 约束保证）。
3. 匿名调用 `/api/ai-generate`：
   - 若 `usage_count >= 1` 返回 402，前端提示登录。
   - 否则允许生成，成功后 `usage_count++`，在 `credit_logs` 写入 `type='free'`、`anon_id`、`credits=trialCredits`、`metadata` 保留风险信息（`trialCredits` 默认为 1，可配置）。
4. 风控落地要点：
   - Supabase Row Level Policy + Edge 限流：按 `anon_id`、`ip_hash`、`fingerprint` 三个维度做速率限制（如 1 天 1 次，新指纹 24 小时最多 3 个账号）。
   - 这个先不做，结合 Cloudflare Turnstile（或 ReCAPTCHA）在人机入口校验，通过后才写入试用次数，降低脚本攻击；多次失败后提升验证等级。
   - 这个先不做，基于 `ip_hash` + 指纹聚合，检测一个指纹关联多个 Clerk 账号时直接阻断匿名额度并提示登录；同时计算异常指标（短时间内新注册/相似邮箱等），触发渐进式限制或人工审核。

## 积分有效期策略
- `user_credits.expires_at` 记录当前余额的统一到期日；默认购买后固定延长一年。
- Stripe Webhook 在发放积分时执行 `expires_at = greatest(coalesce(expires_at, '-infinity'), now() + make_interval(days => 365))`，确保后买积分覆盖前一次的到期日。
- `/api/ai-generate` 扣减前校验 `expires_at`，到期即返回 402 并提示续费或联系支持。
- 每日定时任务在统一时区（建议 UTC）扫描 `expires_at < now()` 的记录，将剩余余额清零，写入 `credit_logs(type='expire', status='confirmed', credits=剩余积分)`，并清空 `expires_at`；可复用同一逻辑处理运营赠送到期。
- `/api/user/credits` 返回 `expiresAt`，前端展示“积分将于 YYYY-MM-DD 到期”。运营可在到期前发送提醒邮件。

## 价格梯度与前端逻辑
- `src/lib/pricing.ts`：
  ```ts
  export const pricingTiers = [
    { tier: 'Starter', label: 'Starter Plan', priceId: process.env.STRIPE_PRICE_STARTER!, credits: 10,  amount: 2,  currency: 'usd' },
    { tier: 'Pro',     label: 'Pro Plan',      priceId: process.env.STRIPE_PRICE_PRO!,     credits: 40,  amount: 5,  currency: 'usd' },
    { tier: 'Elite',     label: 'Elite Plan',      priceId: process.env.STRIPE_PRICE_ELITE!,   credits: 100, amount: 10, currency: 'usd' },
  ];
  ```
- `label` 为 UI 可见英文文案，需与营销页面保持一致。
- 价格组件按钮：
  ```tsx
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const router = useRouter();

  const handleClick = async () => {
    if (!isSignedIn) {
      openSignIn({ afterSignInUrl: window.location.href });
      return;
    }
    const res = await fetch('/api/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    });
    if (!res.ok) {
      // TODO: toast
      return;
    }
    const { url } = await res.json();
    router.push(url);
  };
  ```
- 价格按钮会区分是否登录；未登录立即弹出 Clerk 登录，已登录跳转 Stripe Checkout。
- 首页需额外渲染一个测试用信息面板（仅在 `NODE_ENV!=='production'` 时显示），调用 `/api/user/credits`、`/api/anonymous-usage` 并从 Clerk 获取当前 `clerkUserId`，展示：
  - `anonId`（来自 cookie 或接口返回）；
  - `userId` / `clerkUserId`；
  - 匿名剩余额度、`anon_usage.usage_count`；
  - 当前积分余额与 `expiresAt`；
  - 最近一笔订单信息（`orders` by `state='paid'` desc，含 `priceId`、`credits`、`amount`）。
  该面板用于开发调试，发布前应默认隐藏或加上 `TEST_INFO_PANEL_ENABLED` 开关。

## 余额与生成按钮流程
1. `useSWR('/api/user/credits')` 获取 `{ loggedIn, userId, clerkUserId, balance }`。接口无记录时自动初始化 `users`、`user_credits`。
2. 未登录时再调用 `/api/anonymous-usage`，得到 `remainingFree = max(0, 1 - usage_count)`。
3. 生成按钮判断：
   - 未登录且 `remainingFree > 0` → 调 `/api/ai-generate`（匿名路径）。
   - 未登录且 `remainingFree = 0` → 调 `openSignUp()` 提示注册。
   - 已登录且 `balance <= 0` → 弹价格组件。
   - 已登录且 `balance > 0` → 调用生成 API，成功后 `mutate('/api/user/credits')` 刷新。

## 服务端 API 设计
- `/api/user/credits` (GET)：鉴权后调用 `ensureUser`，返回 `{ userId, clerkUserId, balance }`。
  - 响应中附带 `expiresAt`（可为空，表示未设置有效期），供前端提示。
- `/api/anonymous-usage` (GET)：读取 `anon_id`；如无则生成，返回 `{ remainingFree }`。
- `/api/ai-generate` (POST)：
  - 匿名：校验 `anon_usage`，超限报 402；成功后 `usage_count++`，写 `credit_logs(type='free', credits=trialCredits, ref_id=requestId)`。
  - 登录：在事务内校验积分是否过期（`expires_at is null or expires_at > now()`）；若已过期直接返回 402 并提示购买；未过期则执行
    ```sql
    with deducted as (
      update user_credits
      set balance = balance - {cost}
      where user_id = $1 and balance >= {cost}
      returning balance, expires_at
    )
    insert into credit_logs(id, user_id, clerk_user_id, type, status, credits, ref_id)
      select gen_random_uuid(), $1, $2, 'consume', 'pending', {cost}, $3
    returning id;
    ```
    - 拿到 `logId` 后在事务内 `select for update` 记录，防止后续补偿并发。
    - 成功扣减则提交事务并调用 AI；AI 成功时调用 `update credit_logs set status='confirmed', updated_at=now() where id=$logId`。
    - AI 失败时开启补偿事务：`update user_credits set balance = balance + {cost} where user_id=$1 returning balance; update credit_logs set status='refunded', metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{failReason}', to_jsonb(reason)) where id=$logId;`，确保按日志 ID 回滚，避免覆盖其他扣减。
- `/api/payments/checkout` (POST)：
  - 校验登录 → `ensureUser` → 校验 `priceId` 合法性（必须匹配配置的价格梯度）。
  - 从 `pricingTiers` 获取对应套餐信息，确保金额、积分数、货币等信息来自服务端配置，防止客户端篡改。
  - 创建 Checkout Session (`mode='payment'`)，`success_url` 包含 `session_id`，在 metadata 中附加 `userId`、`orderId` 等关键信息用于后续验证。
  - 在 `orders` 插入 `state='pending'`，写入 `user_id`、`clerk_user_id`、`user_email`、`credits`（从服务端配置获取）、`amount`（从服务端配置获取）、`currency`、`price_tier`（记录套餐类型）、`extra` 包含完整的价格快照和 session 摘要：
    ```ts
    const tier = pricingTiers.find(t => t.priceId === priceId);
    if (!tier) {
      return res.status(400).json({ error: 'Invalid price ID' });
    }
    
    const order = await createOrder({
      user_id: userId,
      clerk_user_id: clerkUserId,
      session_id: session.id,
      state: 'pending',
      credits: tier.credits,        // 从服务端配置获取
      amount: tier.amount,           // 从服务端配置获取
      currency: tier.currency,       // 从服务端配置获取
      price_tier: tier.tier,          // 记录套餐名称
      extra: {
        price_snapshot: tier,        // 保存当时的完整价格配置
        session_created_at: new Date().toISOString(),
        stripe_price_id: priceId
      }
    });
    ```
- `/api/payments/webhook` (POST)：
  - 验证签名 → 验证事件时效性：
    ```ts
    const MAX_EVENT_AGE_MS = 5 * 60 * 1000; // 5分钟
    const eventAge = Date.now() - event.created * 1000;
    if (eventAge > MAX_EVENT_AGE_MS) {
      throw new Error('Event too old');
    }
    ```
  - 处理 `checkout.session.completed`：
    1. 查询 `orders`，若 `state='paid'` 直接 200。
    2. **金额和货币验证**（关键安全步骤）：
       ```ts
       const session = event.data.object;
       const order = await getOrderBySessionId(session.id);
       
       // 验证支付状态
       if (session.payment_status !== 'paid') {
         await updateOrder(order.id, { state: 'failed', extra: { reason: 'payment_not_completed' } });
         return res.status(200).json({ received: true });
       }
       
       // 验证金额是否匹配（Stripe金额单位是分，需要转换）
       const expectedAmountCents = Math.round(order.amount * 100);
       if (session.amount_total !== expectedAmountCents) {
         await logSecurityAlert({
           type: 'amount_mismatch',
           orderId: order.id,
           sessionId: session.id,
           expected: order.amount,
           received: session.amount_total / 100,
           currency: session.currency
         });
         
         // 标记订单异常，需要人工审核
         await updateOrder(order.id, { 
           state: 'disputed',
           extra: { 
             ...order.extra, 
             amount_mismatch: true,
             expected_amount: order.amount,
             received_amount: session.amount_total / 100
           }
         });
       
       // 验证货币是否匹配
       if (session.currency !== order.currency.toLowerCase()) {
         await updateOrder(order.id, { 
           state: 'disputed',
           extra: { 
             ...order.extra, 
             currency_mismatch: true,
             expected_currency: order.currency,
             received_currency: session.currency
           }
         });
         return res.status(200).json({ received: true });
       }
       ```
    3. 验证通过后，在事务中更新 `state='paid'`、插入 `credit_logs(type='recharge', status='confirmed', credits=credits, ref_id=session.id)`（冲突忽略）、`user_credits.balance += credits`，同时刷新 `user_credits.expires_at = greatest(coalesce(expires_at, 'epoch'), now() + make_interval(days => creditTtlDays))`（`creditTtlDays` 默认为 365，可配置）；同事务内将 `stripe_events` 表记录 `event_id`，防止重放。
    4. `orders.extra` 更新为完整 `session` JSON，包含实际支付金额、货币等信息，便于审计和对账。

### 页面加载时序
- 入口页加载时即触发前端 `useAuth` 或 Clerk hooks，异步判断登录状态。
- 在登录态判定的并行流程中，`middleware` / `anonymous usage` hook 会检查 `anon_id`，若缺失立即生成并写入 `anon_usage`。
- 登录态解析完成后，前端并发拉取 `/api/user/credits` 与 `/api/anonymous-usage`，以便迅速决定按钮分支。
- 随后的生成/支付行为沿用上述积分与订单流程。

### 并发控制策略
- 积分扣减：在 `/api/ai-generate` 登录路径中使用数据库事务与条件更新（或 `select ... for update`）保证原子扣款；扣减事务返回 `logId` 并锁定该条日志，后续补偿或确认均针对同一 ID；在事务开头执行 `set local lock_timeout '5s'; set local statement_timeout '10s';` 防止请求悬挂并及时抛错。
- Stripe 充值：Webhook 处理 `checkout.session.completed` 时同样包裹在事务里，对 `orders` 行加锁（`for update`）后写入 `status='confirmed'` 的充值日志并增加余额，同时写入 `stripe_events(event_id)` 去重，借助唯一索引避免重复发放。

## Stripe & 幂等策略
- 通过 `orders.session_id` 唯一约束 + `credit_logs(type, ref_id)` 唯一索引防止重复加积分。
- Webhook 入站时使用 Stripe SDK 校验签名，并验证 `event.created` 与服务器时间差（默认 5 分钟，具体实现见 `/api/payments/webhook` 中的时效性验证代码）以抵御重放；处理完成后将 `event.id` 落入 `stripe_events`，重复事件直接返回 200。
- Webhook 处理失败时可安全重试；成功返回 200。
- 订单的 `extra` 字段持久化 Stripe 关键返回值，便于风控或客服核对。

## 安全与运维
- Service Role key 仅用于服务端；客户端不暴露数据库写权限。
- 所有扣减/充值操作放在事务或 Supabase RPC 中，保证原子性。
- 对匿名与生成接口加入速率限制（每 IP / 指纹/账号 N 次 / min），并对 Turnstile 失败次数做渐进式惩罚。
- 部署时确保仅保留受信代理注入的真实 IP 头（如 `x-vercel-ip`/`x-real-ip`），统一剥离客户端自带的 `X-Forwarded-For`，防止匿名额度被伪造。
- **支付安全验证**：
  - Webhook 处理必须验证实际支付金额与订单金额是否匹配，防止金额篡改攻击。
  - 验证货币类型是否一致，避免汇率差异导致的损失。
  - 验证 `payment_status === 'paid'` 确保实际支付成功。
  - 金额不匹配的订单标记为 `disputed` 状态，触发告警并人工审核。
  - 所有价格和积分配置必须从服务端 `pricingTiers` 读取，不信任客户端传递的任何金额参数。
- 建立异常检测任务：监控短时间内大量注册、相似邮箱模式、同指纹多账号、多订单退款、金额异常等指标，自动降级或人工审核。
- 记录关键日志（订单创建、Webhook 触发、金额验证、异常路径），必要时接入 Sentry；对 Stripe webhook 启用重放保护监控。
- 定期对账：每日生成对账报告，比对 Stripe Dashboard 与本地订单数据，确保金额、状态一致。
- 更新 `AGENTS.md` 引用本方案，说明迁移步骤（执行 SQL、配置环境变量、测试流程）。

## 实施顺序
1. 创建 Supabase 表结构：
   - 本地开发：使用 `supabase db reset` 执行 `supabase/migrations/001_create_payment_tables.sql`
   - 生产环境：通过 Supabase Dashboard 或 CLI 执行迁移文件
2. 实现 `ensureUser`、`user_credits` 初始化逻辑，落地匿名 Cookie 生成功能（受信 IP + HMAC 派生）。
3. 接入 `/api/user/credits`、`/api/anonymous-usage`、`/api/ai-generate` 的积分与风控逻辑，完成匿名与登录扣减/补偿闭环。
4. 开发价格组件与 `/api/payments/checkout`，配置 Stripe Price 并接通 Clerk 登录流程。
5. 接通 Stripe Webhook，验证积分发放幂等，确认 `expires_at` 固定延长 365 天。
6. 引入首页测试信息面板（开发环境开关），方便核对匿名 ID、余额与订单数据。
7. 按测试用例执行回归，更新文档与 `AGENTS.md`。
