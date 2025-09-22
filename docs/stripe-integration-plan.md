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
```sql
create table users (
  user_id uuid primary key default gen_random_uuid(), -- 业务内部用户主键
  clerk_user_id text unique not null,                -- 对应 Clerk 的用户 ID
  email text not null,                               -- 用户邮箱（唯一登陆凭据）
  display_name text,                                 -- 展示昵称
  created_at timestamptz default now(),              -- 记录创建时间
  updated_at timestamptz default now()               -- 最近更新时间
);

create table user_credits (
  user_id uuid primary key references users(user_id), -- 关联业务用户，保持一对一
  clerk_user_id text unique not null references users(clerk_user_id), -- Clerk ID 冗余存储方便查询
  balance integer not null default 0,                 -- 当前积分余额（单位：积分）
  expires_at timestamptz,                             -- 当前余额的到期时间（取最近一次购买延长后的截止日）
  created_at timestamptz default now(),               -- 记录创建时间
  updated_at timestamptz default now()                -- 最近更新时间
);

create table credit_logs (
  id uuid primary key default gen_random_uuid(),                                 -- 日志主键
  user_id uuid references users(user_id),                                        -- 登录用户关联，可为空
  clerk_user_id text references users(clerk_user_id),                            -- 对应 Clerk ID，便于排查
  anon_id uuid,                                                                  -- 匿名访客 ID
  type text not null check (type in ('recharge','consume','free','adjust','expire')), -- 积分变动类型
  status text not null default 'confirmed' check (status in ('pending','confirmed','refunded')), -- 日志状态
  credits integer not null,                                                      -- 变动数值：统一使用积分单位，充值时写入发放的积分量
  ref_id text,                                                                   -- 幂等引用，如 session_id / requestId
  metadata jsonb,                                                                -- 补充上下文元数据
  created_at timestamptz default now(),                                          -- 日志创建时间
  updated_at timestamptz default now()                                           -- 最近更新时间
);
create unique index credit_logs_ref_unique on credit_logs(type, ref_id);

create table stripe_events (
  event_id text primary key,
  created_at timestamptz default now()
);

create table orders (
  session_id text primary key,                                                     -- Stripe Checkout Session ID
  user_id uuid references users(user_id),                                         -- 关联业务用户
  clerk_user_id text references users(clerk_user_id),                             -- 冗余 Clerk ID，排查方便
  user_email text,                                                                -- 下单时的邮箱，可能用于对账
  price_id text not null,                                                         -- Stripe Price ID
  credits integer not null,                                                       -- 本次订单对应的积分数
  amount numeric(10,2) not null,                                                  -- 实付金额（货币单位）
  currency text not null,                                                         -- 货币类型（如 usd）
  state text not null check (state in ('pending','paid','failed')) default 'pending', -- 订单状态机
  extra jsonb,                                                                    -- 附加信息，如 Session 或 PaymentIntent 摘要
  created_at timestamptz default now(),                                           -- 记录创建时间
  updated_at timestamptz default now()                                            -- 最近更新时间
);

create table anon_usage (
  anon_id text primary key,               -- 匿名访客 ID（Cookie 储存，base64url 字符串）
  usage_count integer not null default 0, -- 已消耗的免费次数
  last_used_at timestamptz,               -- 最近使用时间
  ip_hash text,                           -- 受信 IP 信号的 HMAC 哈希值
  ip_subnet_hash text,                    -- IP 段的 HMAC 哈希（可选，用于风控）
  user_agent text,                        -- 最近一次使用时的 UA
  fingerprint_source jsonb,               -- 指纹原始信息（早期生成记录）
  created_at timestamptz default now(),   -- 记录创建时间
  updated_at timestamptz default now()    -- 最近更新时间
);
```
- `users`：持久化业务侧的用户主键，与 Clerk 解耦。
- `user_credits`：记录每个用户的积分余额与整体到期时间（多次购买取最大 `expires_at`）。
- `credit_logs`：追踪积分变动与支付流水，`status` 字段区分待确认/已确认/已退回状态，`type` 包含充值/消费/体验/调整/过期，`credits` 统一记录积分增减量。
- `orders`：映射 Stripe Checkout Session，与支付金额、发放积分、状态关联。
- `anon_usage`：针对匿名访客的限免使用、风控追踪字段，持久化 HMAC 处理后的 IP 信息，避免存储明文地址或子网。
- `ensureUser(clerkUserId, email, displayName)`：若 `users` 无记录则插入，并确保 `user_credits` 带初始余额 0；返回内部 `user_id`。
- 匿名记录 `anon_id` 时，`fingerprint_source` 存储生成时使用的原始信号（IP、UA、指纹 ID 等）。
- `stripe_events`：存储已处理的 Stripe Webhook `event_id`，用于重放防护。
- 必须为 `users`/`user_credits`/`credit_logs`/`orders`/`anon_usage` 配置 Supabase `extension moddatetime` 或写 `set_updated_at` 触发器，自动维护 `updated_at`（扣减、充值、补偿时都会触发），否则并发扣减会产生脏数据。

## 匿名用户策略
1. `middleware.ts` 检查 `anon_id` Cookie；缺失时基于可获取信号派生稳定 ID（若关键信号缺失则直接拒绝匿名额度）：
  ```ts
  import { createHmac } from 'crypto';

  const trustedIp = request.headers.get('x-vercel-ip')
    ?? request.headers.get('x-real-ip')
    ?? request.ip; // 仅使用受信代理注入的头
   if (!trustedIp) throw new Error('missing-ip');
   const ipHash = createHmac('sha256', process.env.ANON_ID_SECRET!).update(trustedIp).digest('base64url');
   const ipSubnetHash = createHmac('sha256', process.env.ANON_ID_SECRET!).update(trustedIp.replace(/(\d+\.\d+\.\d+)\.\d+/, '$1')).digest('base64url');
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
2. 首次生成时写入 `anon_usage`：记录 `usage_count=0`、`ip_hash=ipHash`、`ip_subnet_hash=ipSubnetHash`、`fingerprint_source`（存 `ua`/`lang`/Turnstile token/浏览器指纹等）和 `user_agent`。
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
  - 校验登录 → `ensureUser` → 校验 `priceId` → 创建 Checkout Session (`mode='payment'`)，`success_url` 包含 `session_id`。
  - 在 `orders` 插入 `state='pending'`，写入 `user_id`、`clerk_user_id`、`user_email`、`credits`、`amount`、`currency`、`extra=session` 摘要。
- `/api/payments/webhook` (POST)：
  - 验证签名 → 处理 `checkout.session.completed`：
    1. 查询 `orders`，若 `state='paid'` 直接 200。
    2. 若 `pending`，在事务中更新 `state='paid'`、插入 `credit_logs(type='recharge', status='confirmed', credits=credits, ref_id=session.id)`（冲突忽略）、`user_credits.balance += credits`，同时刷新 `user_credits.expires_at = greatest(coalesce(expires_at, 'epoch'), now() + make_interval(days => creditTtlDays))`（`creditTtlDays` 默认为 365，可配置）；同事务内将 `stripe_events` 表记录 `event_id`，防止重放。
    3. `orders.extra` 更新为完整 `session` JSON，如需追踪 payment intent。

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
- Webhook 入站时使用 Stripe SDK 校验签名，并验证 `event.created` 与服务器时间差（默认 5 分钟，需确保 Webhook 节点保持 NTP 同步）以抵御重放；处理完成后将 `event.id` 落入 `stripe_events`，重复事件直接返回 200。
- Webhook 处理失败时可安全重试；成功返回 200。
- 订单的 `extra` 字段持久化 Stripe 关键返回值，便于风控或客服核对。

## 安全与运维
- Service Role key 仅用于服务端；客户端不暴露数据库写权限。
- 所有扣减/充值操作放在事务或 Supabase RPC 中，保证原子性。
- 对匿名与生成接口加入速率限制（每 IP / 指纹/账号 N 次 / min），并对 Turnstile 失败次数做渐进式惩罚。
- 部署时确保仅保留受信代理注入的真实 IP 头（如 `x-vercel-ip`/`x-real-ip`），统一剥离客户端自带的 `X-Forwarded-For`，防止匿名额度被伪造。
- 建立异常检测任务：监控短时间内大量注册、相似邮箱模式、同指纹多账号、多订单退款等指标，自动降级或人工审核。
- 记录关键日志（订单创建、Webhook 触发、异常路径），必要时接入 Sentry；对 Stripe webhook 启用重放保护监控。
- 更新 `AGENTS.md` 引用本方案，说明迁移步骤（执行 SQL、配置环境变量、测试流程）。

## 实施顺序
1. 创建 Supabase 表结构（执行上述 SQL，并新增 `user_fingerprints` 表或等效视图以支持风控聚合）。
2. 实现 `ensureUser`、`user_credits` 初始化逻辑，落地匿名 Cookie 生成功能（受信 IP + HMAC 派生）。
3. 接入 `/api/user/credits`、`/api/anonymous-usage`、`/api/ai-generate` 的积分与风控逻辑，完成匿名与登录扣减/补偿闭环。
4. 开发价格组件与 `/api/payments/checkout`，配置 Stripe Price 并接通 Clerk 登录流程。
5. 接通 Stripe Webhook，验证积分发放幂等，确认 `expires_at` 固定延长 365 天。
6. 引入首页测试信息面板（开发环境开关），方便核对匿名 ID、余额与订单数据。
7. 按测试用例执行回归，更新文档与 `AGENTS.md`。
