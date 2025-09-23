# Stripe 支付与积分系统测试计划

## 1. 测试概述

### 1.1 测试目标
- 验证 Stripe 支付集成的完整性和正确性
- 确保积分系统的准确性和一致性
- 验证匿名用户免费试用流程
- 测试并发场景下的数据一致性
- 验证安全性和风控措施

### 1.2 测试范围
- 数据库迁移和表结构
- 匿名用户识别与限额控制
- 用户认证与积分管理
- Stripe Checkout 支付流程
- Webhook 处理与幂等性
- 积分有效期管理
- 并发控制与性能
- 安全防护措施

### 1.3 测试策略
- **单元测试**: 核心函数和工具类
- **集成测试**: API 端点和数据库操作
- **端到端测试**: 完整用户流程
- **性能测试**: 负载和并发测试
- **安全测试**: 注入防护和认证授权

## 2. 测试环境准备

### 2.1 环境变量配置
```bash
# Supabase 配置
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
SUPABASE_ANON_KEY=eyJyyy...

# Stripe 配置
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_STARTER=price_xxx_starter
STRIPE_PRICE_PRO=price_xxx_pro
STRIPE_PRICE_ELITE=price_xxx_elite

# Clerk 配置
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx

# 安全密钥
ANON_ID_SECRET=test-secret-for-hmac

# 测试配置
NODE_ENV=test
OPENROUTER_ENABLE_MOCK=true
TEST_INFO_PANEL_ENABLED=true
```

### 2.2 数据库准备
```sql
-- 清理测试数据
TRUNCATE TABLE orders, credit_logs, user_credits, anon_usage, stripe_events, users CASCADE;

-- 创建测试用户数据
INSERT INTO users (id, clerk_user_id, email, display_name) VALUES
  ('test-user-1', 'clerk_test_1', 'new@test.com', 'New User'),
  ('test-user-2', 'clerk_test_2', 'paid@test.com', 'Paid User'),
  ('test-user-3', 'clerk_test_3', 'expired@test.com', 'Expired User');

-- 初始化积分数据
INSERT INTO user_credits (user_id, balance, expires_at) VALUES
  ('test-user-1', 0, NULL),
  ('test-user-2', 50, NOW() + INTERVAL '180 days'),
  ('test-user-3', 10, NOW() - INTERVAL '1 day');
```

### 2.3 Stripe 测试配置
- 测试卡号：
  - 成功：`4242 4242 4242 4242`
  - 拒绝：`4000 0000 0000 0002`
  - 3D验证：`4000 0025 0000 3155`
- Webhook 本地监听：`stripe listen --forward-to http://localhost:3000/api/payments/webhook`

## 3. 数据库和基础设施测试

### TC-DB-001: 数据库迁移执行
**目的**: 验证数据库迁移脚本正确执行
**步骤**:
1. 执行 `supabase db reset`
2. 检查所有表创建成功
3. 验证索引和约束
4. 测试触发器功能

**预期结果**:
- 所有表结构正确创建
- 索引和约束生效
- `updated_at` 自动更新

**验证SQL**:
```sql
-- 验证表存在
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'user_credits', 'credit_logs', 'orders', 'anon_usage', 'stripe_events');

-- 验证约束
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_schema = 'public';
```

### TC-DB-002: 数据完整性约束
**目的**: 验证数据约束防止无效数据
**步骤**:
1. 尝试插入重复email
2. 尝试插入负数金额
3. 尝试删除有关联的用户

**预期结果**:
- 违反约束的操作失败
- 错误信息明确
- 匿名 ID 仅接受 43 位 base64url 字符串

**测试SQL**:
```sql
-- 测试唯一约束
INSERT INTO users (id, clerk_user_id, email) 
VALUES ('dup-1', 'clerk_dup_1', 'paid@test.com');
-- 预期: ERROR: duplicate key value violates unique constraint

-- 测试非负约束
UPDATE user_credits SET balance = -1 WHERE user_id = 'test-user-1';
-- 预期: ERROR: new row violates check constraint

-- 测试级联删除
DELETE FROM users WHERE id = 'test-user-2';
-- 验证 user_credits 相应记录也被删除

-- 测试 anon_id 格式约束
INSERT INTO anon_usage (anon_id) VALUES ('short-id');
-- 预期: ERROR: new row violates check constraint
```

### TC-DB-003: 触发器功能测试
**目的**: 验证 updated_at 自动更新
**步骤**:
1. 记录初始 updated_at
2. 更新记录
3. 验证 updated_at 变化

**测试SQL**:
```sql
-- 记录初始时间
SELECT updated_at FROM users WHERE id = 'test-user-1';

-- 等待1秒后更新
UPDATE users SET display_name = 'Updated Name' WHERE id = 'test-user-1';

-- 验证时间更新
SELECT updated_at > NOW() - INTERVAL '2 seconds' as is_updated 
FROM users WHERE id = 'test-user-1';
```

## 4. 匿名用户功能测试

### TC-ANON-001: 匿名ID生成
**目的**: 验证匿名用户ID正确生成和存储
**前置条件**: 清除所有Cookie
**步骤**:
1. 访问站点首页
2. 检查 anon_id Cookie
3. 调用 `/api/anonymous-usage`
4. 查询 anon_usage 表

**预期结果**:
- Cookie 设置正确（httpOnly, secure, sameSite）
- anon_usage 表新增记录
- ip_hash 和 ip_subnet_hash 为 HMAC 处理后的值

**验证代码**:
```typescript
// 测试匿名ID生成
const response = await fetch('/api/anonymous-usage');
const data = await response.json();

expect(data.remainingFree).toBe(1);
expect(response.headers.get('Set-Cookie')).toContain('anon_id=');

// 验证数据库
const { data: anonUsage } = await supabase
  .from('anon_usage')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(1);

expect(anonUsage[0].usage_count).toBe(0);
expect(anonUsage[0].anon_id).toMatch(/^[A-Za-z0-9_-]{43}$/); // 与 CHECK 约束一致
expect(anonUsage[0].ip_hash).toMatch(/^[A-Za-z0-9_-]+$/); // base64url格式
```

### TC-ANON-002: 免费试用限额
**目的**: 验证匿名用户只能试用一次
**步骤**:
1. 首次调用 `/api/ai-generate`
2. 验证成功生成
3. 再次调用 `/api/ai-generate`
4. 验证被拒绝

**预期结果**:
- 首次调用成功，usage_count 增加
- 第二次调用返回 402
- credit_logs 只有一条 type='free' 记录

**验证代码**:
```typescript
// 第一次调用
const firstCall = await fetch('/api/ai-generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ imageUrl: 'test.jpg', prompt: 'test' })
});
expect(firstCall.status).toBe(200);

// 第二次调用
const secondCall = await fetch('/api/ai-generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ imageUrl: 'test.jpg', prompt: 'test' })
});
expect(secondCall.status).toBe(402);

// 验证数据库
const { data: logs } = await supabase
  .from('credit_logs')
  .select('*')
  .eq('type', 'free');
expect(logs.length).toBe(1);
```

### TC-ANON-003: IP和指纹验证
**目的**: 验证缺少关键信号时拒绝匿名额度
**步骤**:
1. 模拟无法获取受信IP
2. 尝试获取匿名额度
3. 验证返回403错误

**预期结果**:
- 无受信IP返回403
- 提示用户登录或完成验证
- 不创建 anon_usage 记录

**验证代码**:
```typescript
// 模拟缺少IP头
const response = await fetch('/api/anonymous-usage', {
  headers: {
    // 不发送IP相关头部
    'X-Forwarded-For': '', 
  }
});

expect(response.status).toBe(403);
const data = await response.json();
expect(data.error).toContain('请登录或完成验证');
```

### TC-ANON-004: HMAC安全验证
**目的**: 验证IP信息经过HMAC处理，不存储明文
**步骤**:
1. 创建匿名用户
2. 查询 anon_usage 表
3. 验证 ip_hash 不等于原始IP

**预期结果**:
- ip_hash 和 ip_subnet_hash 为base64url字符串
- 无法从hash还原原始IP
- 相同IP产生相同hash

**验证代码**:
```typescript
const realIP = '192.168.1.100';
const ipHash = createHmac('sha256', process.env.ANON_ID_SECRET!)
  .update(realIP)
  .digest('base64url');

// 查询数据库
const { data } = await supabase
  .from('anon_usage')
  .select('ip_hash')
  .limit(1);

// 验证不是明文IP
expect(data[0].ip_hash).not.toBe(realIP);
expect(data[0].ip_hash).toMatch(/^[A-Za-z0-9_-]+$/);
```

## 5. 用户认证和积分系统测试

### TC-USER-001: 用户初始化（ensureUser）
**目的**: 验证新用户自动初始化
**步骤**:
1. 新用户首次登录
2. 调用 `/api/user/credits`
3. 验证数据库记录

**预期结果**:
- users 表创建新记录
- user_credits 初始余额为0
- 返回正确的userId和balance

**验证代码**:
```typescript
// 模拟已认证请求
const response = await fetch('/api/user/credits', {
  headers: {
    'Authorization': 'Bearer test_token',
    'x-clerk-user-id': 'clerk_new_user'
  }
});

const data = await response.json();
expect(data.balance).toBe(0);
expect(data.userId).toBeDefined();

// 验证数据库
const { data: user } = await supabase
  .from('users')
  .select('*')
  .eq('clerk_user_id', 'clerk_new_user')
  .single();

expect(user).toBeDefined();
expect(user.email).toBe('newuser@test.com');
```

### TC-USER-002: 积分扣减事务
**目的**: 验证积分扣减的原子性
**前置条件**: 用户有10积分
**步骤**:
1. 调用 `/api/ai-generate` 扣减积分
2. 验证余额减少
3. 验证日志记录

**预期结果**:
- 余额正确减少
- credit_logs 记录完整
- 事务保证原子性

**验证代码**:
```typescript
// 扣减前余额
const beforeBalance = 10;

// 执行扣减
const response = await fetch('/api/ai-generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ imageUrl: 'test.jpg', cost: 2 })
});

expect(response.status).toBe(200);

// 验证余额
const { data: credits } = await supabase
  .from('user_credits')
  .select('balance')
  .eq('user_id', 'test-user-2')
  .single();

expect(credits.balance).toBe(8);

// 验证日志
const { data: log } = await supabase
  .from('credit_logs')
  .select('*')
  .eq('type', 'consume')
  .eq('status', 'confirmed')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

expect(log.credits).toBe(2);
```

### TC-USER-003: 积分不足处理
**目的**: 验证余额不足时拒绝请求
**前置条件**: 用户余额为0
**步骤**:
1. 尝试扣减积分
2. 验证返回402错误
3. 验证余额未变化

**预期结果**:
- 返回402 Payment Required
- 余额保持为0
- 无新的扣减日志

**验证代码**:
```typescript
const response = await fetch('/api/ai-generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ imageUrl: 'test.jpg' })
});

expect(response.status).toBe(402);
const data = await response.json();
expect(data.error).toContain('积分不足');

// 验证余额未变
const { data: credits } = await supabase
  .from('user_credits')
  .select('balance')
  .eq('user_id', 'test-user-1')
  .single();

expect(credits.balance).toBe(0);
```

### TC-USER-004: AI失败补偿机制
**目的**: 验证AI调用失败时积分正确补偿
**步骤**:
1. 模拟AI服务失败
2. 验证积分被补偿
3. 验证日志状态更新

**预期结果**:
- 积分先扣后补
- credit_logs status='refunded'
- metadata 记录失败原因

**验证代码**:
```typescript
// 模拟AI失败
jest.mock('@/lib/ai-service', () => ({
  generateNarration: jest.fn().mockRejectedValue(new Error('AI Service Error'))
}));

const initialBalance = 10;
const response = await fetch('/api/ai-generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ imageUrl: 'test.jpg' })
});

expect(response.status).toBe(500);

// 验证余额恢复
const { data: credits } = await supabase
  .from('user_credits')
  .select('balance')
  .eq('user_id', 'test-user-2')
  .single();

expect(credits.balance).toBe(initialBalance);

// 验证补偿日志
const { data: log } = await supabase
  .from('credit_logs')
  .select('*')
  .eq('status', 'refunded')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

expect(log.metadata.failReason).toContain('AI Service Error');
```

### TC-USER-005: 积分过期验证
**目的**: 验证过期积分无法使用
**前置条件**: 用户积分已过期
**步骤**:
1. 尝试使用过期积分
2. 验证返回402错误
3. 运行清理任务

**预期结果**:
- 过期积分无法使用
- 清理任务将余额清零
- 生成过期日志

**验证代码**:
```typescript
// 尝试使用过期积分
const response = await fetch('/api/ai-generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test_token',
    'x-clerk-user-id': 'clerk_test_3'
  },
  body: JSON.stringify({ imageUrl: 'test.jpg' })
});

expect(response.status).toBe(402);
const data = await response.json();
expect(data.error).toContain('积分已过期');

// 运行清理任务
await runExpirationCleanup();

// 验证余额清零
const { data: credits } = await supabase
  .from('user_credits')
  .select('*')
  .eq('user_id', 'test-user-3')
  .single();

expect(credits.balance).toBe(0);
expect(credits.expires_at).toBeNull();

// 验证过期日志
const { data: log } = await supabase
  .from('credit_logs')
  .select('*')
  .eq('type', 'expire')
  .eq('user_id', 'test-user-3')
  .single();

expect(log.credits).toBe(10); // 原余额
```

## 6. 支付流程测试

### TC-PAY-001: Checkout Session创建
**目的**: 验证支付会话正确创建
**步骤**:
1. 已登录用户选择套餐
2. 调用 `/api/payments/checkout`
3. 验证返回Stripe URL
4. 验证订单创建

**预期结果**:
- 返回有效的Stripe Checkout URL
- orders表创建pending记录
- 记录正确的套餐信息

**验证代码**:
```typescript
const response = await fetch('/api/payments/checkout', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    priceId: process.env.STRIPE_PRICE_STARTER
  })
});

expect(response.status).toBe(200);
const data = await response.json();
expect(data.url).toContain('checkout.stripe.com');

// 验证订单创建
const { data: order } = await supabase
  .from('orders')
  .select('*')
  .eq('state', 'pending')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

expect(order.credits).toBe(10);
expect(order.amount).toBe(2.00);
expect(order.currency).toBe('usd');
```

### TC-PAY-002: 支付成功处理
**目的**: 验证支付成功后积分发放
**步骤**:
1. 模拟Stripe webhook回调
2. 验证积分增加
3. 验证订单状态更新
4. 验证有效期延长

**预期结果**:
- 积分正确增加
- 订单状态变为paid
- expires_at延长365天
- credit_logs记录充值

**验证代码**:
```typescript
// 模拟Webhook事件
const webhookPayload = {
  id: 'evt_test_123',
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: 'cs_test_123',
      payment_status: 'paid',
      metadata: {
        userId: 'test-user-1',
        credits: '10'
      }
    }
  }
};

// 计算签名
const signature = stripe.webhooks.generateTestHeaderString({
  payload: JSON.stringify(webhookPayload),
  secret: process.env.STRIPE_WEBHOOK_SECRET
});

const response = await fetch('/api/payments/webhook', {
  method: 'POST',
  headers: {
    'stripe-signature': signature,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(webhookPayload)
});

expect(response.status).toBe(200);

// 验证积分增加
const { data: credits } = await supabase
  .from('user_credits')
  .select('*')
  .eq('user_id', 'test-user-1')
  .single();

expect(credits.balance).toBe(10);
expect(credits.expires_at).toBeDefined();

// 验证充值日志
const { data: log } = await supabase
  .from('credit_logs')
  .select('*')
  .eq('type', 'recharge')
  .eq('ref_id', 'cs_test_123')
  .single();

expect(log.credits).toBe(10);
expect(log.status).toBe('confirmed');
```

### TC-PAY-003: 未登录支付拦截
**目的**: 验证未登录用户无法创建支付
**步骤**:
1. 未登录调用checkout接口
2. 验证返回401错误

**预期结果**:
- 返回401 Unauthorized
- 不创建订单记录

**验证代码**:
```typescript
const response = await fetch('/api/payments/checkout', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    priceId: process.env.STRIPE_PRICE_STARTER
  })
});

expect(response.status).toBe(401);
const data = await response.json();
expect(data.error).toContain('请先登录');
```

### TC-PAY-004: 价格套餐验证
**目的**: 验证各套餐积分和金额正确
**步骤**:
1. 测试Starter套餐（$2, 10积分）
2. 测试Pro套餐（$5, 40积分）
3. 测试Elite套餐（$10, 100积分）

**预期结果**:
- 每个套餐积分正确发放
- 金额匹配配置
- 有效期正确设置

**测试数据**:
```typescript
const tiers = [
  { priceId: 'STRIPE_PRICE_STARTER', credits: 10, amount: 2 },
  { priceId: 'STRIPE_PRICE_PRO', credits: 40, amount: 5 },
  { priceId: 'STRIPE_PRICE_ELITE', credits: 100, amount: 10 }
];

for (const tier of tiers) {
  // 创建支付并验证
  await testPaymentFlow(tier);
}
```

### TC-PAY-005: 连续购买有效期
**目的**: 验证多次购买后有效期取最大值
**步骤**:
1. 首次购买设置expires_at
2. 30天后再次购买
3. 验证有效期延长

**预期结果**:
- 第二次购买后有效期为max(旧有效期, now+365天)
- 积分累加
- 两条充值日志

**验证代码**:
```typescript
// 首次购买
await processPayment('test-user-1', 10);
const { data: first } = await supabase
  .from('user_credits')
  .select('expires_at')
  .eq('user_id', 'test-user-1')
  .single();

const firstExpiry = new Date(first.expires_at);

// 模拟30天后
jest.setSystemTime(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

// 再次购买
await processPayment('test-user-1', 40);
const { data: second } = await supabase
  .from('user_credits')
  .select('*')
  .eq('user_id', 'test-user-1')
  .single();

const secondExpiry = new Date(second.expires_at);
expect(secondExpiry > firstExpiry).toBe(true);
expect(second.balance).toBe(50); // 10 + 40
```

### TC-PAY-006: 金额不匹配检测
**目的**: 验证系统能检测并拒绝金额不匹配的支付
**前置条件**: 创建一个期望金额为$5的订单
**步骤**:
1. 创建订单，期望金额$5，积分40
2. 模拟Stripe webhook，但amount_total为$3（300分）
3. 验证系统拒绝发放积分
4. 验证订单标记为disputed
5. 验证安全告警生成

**预期结果**:
- 订单状态变为disputed
- 不发放积分，余额保持不变
- 记录安全告警日志
- extra字段包含不匹配详情（expected_amount, received_amount）

**验证代码**:
```typescript
// 创建订单
const { data: order } = await supabase
  .from('orders')
  .insert({
    id: 'order_mismatch_1',
    user_id: 'test-user-1',
    session_id: 'cs_test_mismatch',
    amount: 5.00,  // 期望$5
    credits: 40,
    currency: 'usd',
    state: 'pending'
  })
  .select()
  .single();

// 记录初始余额
const { data: initialCredits } = await supabase
  .from('user_credits')
  .select('balance')
  .eq('user_id', 'test-user-1')
  .single();

// 模拟Webhook，但金额不匹配
const webhookPayload = {
  id: 'evt_test_mismatch',
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: 'cs_test_mismatch',
      payment_status: 'paid',
      amount_total: 300,  // 实际只收到$3（300分），而不是期望的$5（500分）
      currency: 'usd',
      metadata: {
        userId: 'test-user-1'
      }
    }
  }
};

// 计算签名并发送
const signature = stripe.webhooks.generateTestHeaderString({
  payload: JSON.stringify(webhookPayload),
  secret: process.env.STRIPE_WEBHOOK_SECRET
});

const response = await fetch('/api/payments/webhook', {
  method: 'POST',
  headers: {
    'stripe-signature': signature,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(webhookPayload)
});

expect(response.status).toBe(200); // 返回200避免Stripe重试

// 验证订单状态变为disputed
const { data: updatedOrder } = await supabase
  .from('orders')
  .select('*')
  .eq('session_id', 'cs_test_mismatch')
  .single();

expect(updatedOrder.state).toBe('disputed');
expect(updatedOrder.extra.amount_mismatch).toBe(true);
expect(updatedOrder.extra.expected_amount).toBe(5.00);
expect(updatedOrder.extra.received_amount).toBe(3.00);

// 验证没有发放积分
const { data: finalCredits } = await supabase
  .from('user_credits')
  .select('balance')
  .eq('user_id', 'test-user-1')
  .single();

expect(finalCredits.balance).toBe(initialCredits.balance); // 余额未变化

// 验证没有生成充值日志
const { data: rechargeLogs } = await supabase
  .from('credit_logs')
  .select('*')
  .eq('type', 'recharge')
  .eq('ref_id', 'cs_test_mismatch');

expect(rechargeLogs.length).toBe(0);

// 验证安全告警记录（如果实现了告警系统）
const { data: alerts } = await supabase
  .from('security_alerts')
  .select('*')
  .eq('type', 'amount_mismatch')
  .order('created_at', { ascending: false })
  .limit(1);

if (alerts && alerts.length > 0) {
  expect(alerts[0].metadata.orderId).toBe('order_mismatch_1');
  expect(alerts[0].metadata.expected).toBe(5.00);
  expect(alerts[0].metadata.received).toBe(3.00);
}
```

### TC-PAY-007: 货币不匹配检测
**目的**: 验证系统能检测并拒绝货币类型不匹配的支付
**步骤**:
1. 创建USD订单
2. 模拟EUR支付webhook
3. 验证拒绝处理

**预期结果**:
- 订单状态变为disputed
- 不发放积分
- extra字段记录货币不匹配信息

**验证代码**:
```typescript
// 创建USD订单
const { data: order } = await supabase
  .from('orders')
  .insert({
    id: 'order_currency_1',
    user_id: 'test-user-1',
    session_id: 'cs_test_currency',
    amount: 5.00,
    credits: 40,
    currency: 'usd',  // 期望USD
    state: 'pending'
  })
  .select()
  .single();

// 模拟EUR支付
const webhookPayload = {
  id: 'evt_test_currency',
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: 'cs_test_currency',
      payment_status: 'paid',
      amount_total: 500,  // 金额正确
      currency: 'eur',    // 但货币不匹配！
      metadata: {
        userId: 'test-user-1'
      }
    }
  }
};

const response = await sendWebhook(webhookPayload);
expect(response.status).toBe(200);

// 验证订单被标记为异常
const { data: updatedOrder } = await supabase
  .from('orders')
  .select('*')
  .eq('session_id', 'cs_test_currency')
  .single();

expect(updatedOrder.state).toBe('disputed');
expect(updatedOrder.extra.currency_mismatch).toBe(true);
expect(updatedOrder.extra.expected_currency).toBe('usd');
expect(updatedOrder.extra.received_currency).toBe('eur');

// 验证没有发放积分
const { data: credits } = await supabase
  .from('user_credits')
  .select('balance')
  .eq('user_id', 'test-user-1')
  .single();

expect(credits.balance).toBe(0);
```

### TC-PAY-008: 支付状态验证
**目的**: 验证只有payment_status='paid'才发放积分
**步骤**:
1. 发送payment_status='processing'的webhook
2. 验证不发放积分
3. 订单标记为failed

**预期结果**:
- 订单状态变为failed
- 不发放积分
- extra字段记录失败原因

**验证代码**:
```typescript
// 创建订单
const { data: order } = await supabase
  .from('orders')
  .insert({
    id: 'order_status_1',
    user_id: 'test-user-1',
    session_id: 'cs_test_status',
    amount: 5.00,
    credits: 40,
    currency: 'usd',
    state: 'pending'
  })
  .select()
  .single();

// 模拟未完成支付的webhook
const webhookPayload = {
  id: 'evt_test_status',
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: 'cs_test_status',
      payment_status: 'processing',  // 支付还在处理中，不是'paid'
      amount_total: 500,
      currency: 'usd',
      metadata: {
        userId: 'test-user-1'
      }
    }
  }
};

const response = await sendWebhook(webhookPayload);
expect(response.status).toBe(200);

// 验证订单状态
const { data: updatedOrder } = await supabase
  .from('orders')
  .select('*')
  .eq('session_id', 'cs_test_status')
  .single();

expect(updatedOrder.state).toBe('failed');
expect(updatedOrder.extra.reason).toBe('payment_not_completed');

// 验证没有发放积分
const { data: credits } = await supabase
  .from('user_credits')
  .select('balance')
  .eq('user_id', 'test-user-1')
  .single();

expect(credits.balance).toBe(0);

// 验证没有充值日志
const { data: logs } = await supabase
  .from('credit_logs')
  .select('*')
  .eq('type', 'recharge')
  .eq('ref_id', 'cs_test_status');

expect(logs.length).toBe(0);
```

### TC-PAY-009: 正确支付金额验证通过
**目的**: 验证金额、货币、状态都正确时正常发放积分
**步骤**:
1. 创建订单
2. 发送完全匹配的webhook
3. 验证积分正确发放

**预期结果**:
- 订单状态变为paid
- 积分正确增加
- 生成充值日志

**验证代码**:
```typescript
// 创建订单
const { data: order } = await supabase
  .from('orders')
  .insert({
    id: 'order_correct_1',
    user_id: 'test-user-1',
    session_id: 'cs_test_correct',
    amount: 5.00,
    credits: 40,
    currency: 'usd',
    state: 'pending'
  })
  .select()
  .single();

// 发送完全匹配的webhook
const webhookPayload = {
  id: 'evt_test_correct',
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: 'cs_test_correct',
      payment_status: 'paid',     // 状态正确
      amount_total: 500,           // 金额正确（$5 = 500分）
      currency: 'usd',            // 货币正确
      metadata: {
        userId: 'test-user-1'
      }
    }
  }
};

const response = await sendWebhook(webhookPayload);
expect(response.status).toBe(200);

// 验证订单状态
const { data: updatedOrder } = await supabase
  .from('orders')
  .select('*')
  .eq('session_id', 'cs_test_correct')
  .single();

expect(updatedOrder.state).toBe('paid');

// 验证积分增加
const { data: credits } = await supabase
  .from('user_credits')
  .select('balance')
  .eq('user_id', 'test-user-1')
  .single();

expect(credits.balance).toBe(40); // 正确增加40积分

// 验证充值日志
const { data: log } = await supabase
  .from('credit_logs')
  .select('*')
  .eq('type', 'recharge')
  .eq('ref_id', 'cs_test_correct')
  .single();

expect(log.credits).toBe(40);
expect(log.status).toBe('confirmed');
```

## 7. Webhook处理测试

### TC-WEBHOOK-001: 签名验证
**目的**: 验证Webhook签名校验
**步骤**:
1. 发送无签名请求
2. 发送错误签名请求
3. 发送正确签名请求

**预期结果**:
- 无签名返回401
- 错误签名返回401
- 正确签名处理成功

**验证代码**:
```typescript
// 无签名
let response = await fetch('/api/payments/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'checkout.session.completed' })
});
expect(response.status).toBe(401);

// 错误签名
response = await fetch('/api/payments/webhook', {
  method: 'POST',
  headers: {
    'stripe-signature': 'wrong_signature',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ type: 'checkout.session.completed' })
});
expect(response.status).toBe(401);

// 正确签名
const validSignature = generateValidSignature(payload);
response = await fetch('/api/payments/webhook', {
  method: 'POST',
  headers: {
    'stripe-signature': validSignature,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
});
expect(response.status).toBe(200);
```

### TC-WEBHOOK-002: 幂等性保证
**目的**: 验证重复事件不会重复处理
**步骤**:
1. 发送支付成功事件
2. 再次发送相同event_id
3. 验证积分只增加一次

**预期结果**:
- 第一次处理成功
- 第二次直接返回200
- 积分只增加一次
- stripe_events表防重

**验证代码**:
```typescript
const event = createTestEvent('evt_test_idempotent');

// 第一次发送
await sendWebhook(event);
const { data: firstBalance } = await supabase
  .from('user_credits')
  .select('balance')
  .eq('user_id', 'test-user-1')
  .single();

// 第二次发送相同事件
await sendWebhook(event);
const { data: secondBalance } = await supabase
  .from('user_credits')
  .select('balance')
  .eq('user_id', 'test-user-1')
  .single();

expect(secondBalance.balance).toBe(firstBalance.balance);

// 验证stripe_events表
const { data: events } = await supabase
  .from('stripe_events')
  .select('*')
  .eq('event_id', 'evt_test_idempotent');

expect(events.length).toBe(1);
```

### TC-WEBHOOK-003: 事件时效性
**目的**: 验证过期事件被拒绝
**步骤**:
1. 发送5分钟内的事件
2. 发送超过5分钟的事件

**预期结果**:
- 5分钟内事件正常处理
- 超时事件被拒绝

**验证代码**:
```typescript
// 4分钟前的事件（应该成功）
const recentEvent = {
  ...baseEvent,
  created: Math.floor((Date.now() - 4 * 60 * 1000) / 1000)
};
let response = await sendWebhook(recentEvent);
expect(response.status).toBe(200);

// 6分钟前的事件（应该失败）
const oldEvent = {
  ...baseEvent,
  created: Math.floor((Date.now() - 6 * 60 * 1000) / 1000)
};
response = await sendWebhook(oldEvent);
expect(response.status).toBe(400);
expect(response.body.error).toContain('Event too old');
```

### TC-WEBHOOK-004: 订单状态更新
**目的**: 验证订单状态正确转换
**步骤**:
1. 创建pending订单
2. 处理支付成功webhook
3. 验证订单变为paid

**预期结果**:
- 订单状态从pending变为paid
- extra字段更新Session详情
- 时间戳正确记录

**验证代码**:
```typescript
// 创建pending订单
const { data: order } = await supabase
  .from('orders')
  .insert({
    id: 'order_test_1',
    user_id: 'test-user-1',
    session_id: 'cs_test_status',
    state: 'pending',
    credits: 10,
    amount: 2.00
  })
  .select()
  .single();

// 发送支付成功事件
await sendPaymentSuccessWebhook('cs_test_status');

// 验证状态更新
const { data: updated } = await supabase
  .from('orders')
  .select('*')
  .eq('id', 'order_test_1')
  .single();

expect(updated.state).toBe('paid');
expect(updated.extra).toHaveProperty('payment_intent');
```

## 8. 并发和性能测试

### TC-PERF-001: 并发扣减测试
**目的**: 验证并发扣减不会超卖
**前置条件**: 用户有10积分
**步骤**:
1. 并发发起20个扣减请求
2. 每个请求扣1积分
3. 验证最终状态

**预期结果**:
- 只有10个请求成功
- 余额最终为0
- 无负数余额

**验证代码**:
```typescript
const userId = 'test-user-concurrent';
await setUserBalance(userId, 10);

// 并发20个请求
const requests = Array(20).fill(null).map(() => 
  fetch('/api/ai-generate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer test_token',
      'x-user-id': userId
    },
    body: JSON.stringify({ cost: 1 })
  })
);

const responses = await Promise.all(requests);
const successCount = responses.filter(r => r.status === 200).length;
const failureCount = responses.filter(r => r.status === 402).length;

expect(successCount).toBe(10);
expect(failureCount).toBe(10);

// 验证最终余额
const { data } = await supabase
  .from('user_credits')
  .select('balance')
  .eq('user_id', userId)
  .single();

expect(data.balance).toBe(0);
```

### TC-PERF-002: 并发充值测试
**目的**: 验证并发充值的正确性
**步骤**:
1. 模拟5个并发webhook
2. 每个充值10积分
3. 验证总额正确

**预期结果**:
- 所有充值成功
- 总额等于50
- 无重复充值

**验证代码**:
```typescript
const userId = 'test-user-recharge';
await setUserBalance(userId, 0);

// 创建5个不同的session
const sessions = ['cs_1', 'cs_2', 'cs_3', 'cs_4', 'cs_5'];
const webhooks = sessions.map(sessionId => 
  sendPaymentWebhook(userId, sessionId, 10)
);

await Promise.all(webhooks);

// 验证最终余额
const { data } = await supabase
  .from('user_credits')
  .select('balance')
  .eq('user_id', userId)
  .single();

expect(data.balance).toBe(50);

// 验证充值日志
const { data: logs } = await supabase
  .from('credit_logs')
  .select('*')
  .eq('user_id', userId)
  .eq('type', 'recharge');

expect(logs.length).toBe(5);
```

### TC-PERF-003: 事务超时处理
**目的**: 验证事务超时机制
**步骤**:
1. 设置5秒超时
2. 模拟长时间锁等待
3. 验证超时处理

**预期结果**:
- 5秒后事务超时
- 自动回滚
- 返回适当错误

**验证代码**:
```typescript
// 开启一个长事务锁定记录
const longTransaction = supabase.rpc('begin_long_transaction', {
  userId: 'test-user-1'
});

// 尝试另一个事务
const start = Date.now();
const response = await fetch('/api/ai-generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test_token',
    'x-user-id': 'test-user-1'
  },
  body: JSON.stringify({ cost: 1 })
});

const elapsed = Date.now() - start;
expect(elapsed).toBeGreaterThan(5000);
expect(elapsed).toBeLessThan(6000);
expect(response.status).toBe(503);
expect(response.body.error).toContain('timeout');
```

### TC-PERF-004: 负载测试
**目的**: 验证系统在高负载下的表现
**工具**: k6或JMeter
**步骤**:
1. 模拟100并发用户
2. 持续10分钟
3. 记录性能指标

**预期指标**:
- 95%响应时间 < 2秒
- 错误率 < 1%
- TPS > 100

**k6脚本**:
```javascript
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // 爬升到100用户
    { duration: '5m', target: 100 }, // 维持100用户
    { duration: '3m', target: 0 },   // 降到0
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95%请求小于2秒
    http_req_failed: ['rate<0.01'],    // 错误率小于1%
  },
};

export default function () {
  const response = http.post(
    'http://localhost:3000/api/ai-generate',
    JSON.stringify({ imageUrl: 'test.jpg' }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token',
      },
    }
  );

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });
}
```

## 9. 安全和风控测试

### TC-SEC-001: SQL注入防护
**目的**: 验证防止SQL注入攻击
**步骤**:
1. 在各输入点尝试注入
2. 验证参数化查询

**预期结果**:
- 所有注入尝试失败
- 使用参数化查询
- 错误信息安全

**测试用例**:
```typescript
const injectionPayloads = [
  "'; DROP TABLE users; --",
  "1' OR '1'='1",
  "admin'--",
  "1; UPDATE user_credits SET balance=9999",
];

for (const payload of injectionPayloads) {
  const response = await fetch('/api/user/credits', {
    headers: {
      'Authorization': 'Bearer test_token',
      'x-user-email': payload
    }
  });
  
  // 应该返回错误但不执行SQL
  expect(response.status).not.toBe(200);
  
  // 验证表未被删除
  const tables = await supabase.rpc('check_tables_exist');
  expect(tables).toBeTruthy();
}
```

### TC-SEC-002: XSS防护
**目的**: 验证防止跨站脚本攻击
**步骤**:
1. 尝试注入脚本
2. 验证输出转义

**预期结果**:
- 脚本被转义
- 无法执行注入代码

**测试用例**:
```typescript
const xssPayloads = [
  '<script>alert("XSS")</script>',
  '<img src=x onerror="alert(1)">',
  'javascript:alert(1)',
];

for (const payload of xssPayloads) {
  const response = await fetch('/api/ai-generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt: payload
    })
  });
  
  const html = await response.text();
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('onerror=');
}
```

### TC-SEC-003: 认证授权
**目的**: 验证访问控制
**步骤**:
1. 未认证访问保护接口
2. 尝试访问他人数据
3. 伪造token

**预期结果**:
- 未认证返回401
- 无法访问他人数据
- 伪造token被拒绝

**测试用例**:
```typescript
// 未认证访问
let response = await fetch('/api/user/credits');
expect(response.status).toBe(401);

// 尝试访问他人数据
response = await fetch('/api/user/credits', {
  headers: {
    'Authorization': 'Bearer user1_token',
    'x-user-id': 'other_user_id' // 尝试冒充
  }
});
expect(response.status).toBe(403);

// 伪造token
response = await fetch('/api/user/credits', {
  headers: {
    'Authorization': 'Bearer fake_token_123'
  }
});
expect(response.status).toBe(401);
```

### TC-SEC-004: 速率限制
**目的**: 验证API速率限制
**步骤**:
1. 快速重复请求
2. 超过阈值触发限制

**预期结果**:
- 超限返回429
- 包含重试信息
- 冷却后恢复

**测试用例**:
```typescript
const endpoint = '/api/ai-generate';
const requests = [];

// 快速发送50个请求
for (let i = 0; i < 50; i++) {
  requests.push(
    fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ test: i })
    })
  );
}

const responses = await Promise.all(requests);
const rateLimited = responses.filter(r => r.status === 429);

expect(rateLimited.length).toBeGreaterThan(0);

// 检查Retry-After头
const limitedResponse = rateLimited[0];
expect(limitedResponse.headers.get('Retry-After')).toBeDefined();

// 等待冷却后重试
await new Promise(resolve => setTimeout(resolve, 60000));
const retryResponse = await fetch(endpoint, {
  method: 'POST',
  body: JSON.stringify({ test: 'retry' })
});
expect(retryResponse.status).not.toBe(429);
```

### TC-SEC-005: 敏感信息保护
**目的**: 验证不泄露敏感信息
**步骤**:
1. 检查响应内容
2. 验证日志脱敏
3. 检查错误信息

**预期结果**:
- 不暴露内部ID
- 日志不含密钥
- 错误信息通用化

**验证代码**:
```typescript
// 触发错误
const response = await fetch('/api/payments/webhook', {
  method: 'POST',
  body: 'invalid'
});

const error = await response.json();

// 不应包含敏感信息
expect(error.message).not.toContain('STRIPE_SECRET_KEY');
expect(error.message).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
expect(error.stack).toBeUndefined();

// 检查日志
const logs = await getLogs();
for (const log of logs) {
  expect(log).not.toMatch(/sk_test_/);
  expect(log).not.toMatch(/eyJ[A-Za-z0-9]/); // JWT pattern
}
```

## 10. 测试数据和工具

### 测试数据生成器
```typescript
// 生成测试用户
function createTestUser(overrides = {}) {
  return {
    id: `test-user-${Date.now()}`,
    clerk_user_id: `clerk_${Date.now()}`,
    email: `test${Date.now()}@test.com`,
    display_name: 'Test User',
    ...overrides
  };
}

// 生成测试订单
function createTestOrder(userId, overrides = {}) {
  return {
    id: `order_${Date.now()}`,
    user_id: userId,
    session_id: `cs_test_${Date.now()}`,
    state: 'pending',
    credits: 10,
    amount: 2.00,
    currency: 'usd',
    ...overrides
  };
}

// 生成Webhook事件
function createWebhookEvent(type, data) {
  return {
    id: `evt_${Date.now()}`,
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object: data }
  };
}
```

### 测试辅助函数
```typescript
// 设置用户余额
async function setUserBalance(userId, balance, expiresAt = null) {
  return supabase
    .from('user_credits')
    .upsert({
      user_id: userId,
      balance,
      expires_at: expiresAt
    });
}

// 清理测试数据
async function cleanupTestData() {
  await supabase.from('credit_logs').delete().match({ user_id: /test-user-/ });
  await supabase.from('orders').delete().match({ user_id: /test-user-/ });
  await supabase.from('user_credits').delete().match({ user_id: /test-user-/ });
  await supabase.from('users').delete().match({ id: /test-user-/ });
  await supabase.from('anon_usage').delete().match({ created_at: { gte: 'today' } });
}

// 模拟认证请求
function authenticatedRequest(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': 'Bearer test_token',
      'x-clerk-user-id': 'clerk_test_user',
      ...options.headers
    }
  });
}
```

### 测试配置
```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./test/setup.js'],
  testTimeout: 30000,
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};

// test/setup.js
beforeAll(async () => {
  // 初始化测试数据库
  await initTestDatabase();
  // 启动mock服务
  await startMockServers();
});

afterAll(async () => {
  // 清理测试数据
  await cleanupTestData();
  // 关闭连接
  await closeConnections();
});

beforeEach(() => {
  // 重置mock
  jest.clearAllMocks();
});
```

## 11. 测试报告模板

### 测试执行报告
```markdown
# 测试报告 - [日期]

## 概要
- **版本**: v1.0.0
- **环境**: Staging
- **执行时间**: 2024-01-20 10:00 - 12:00
- **执行人**: QA Team

## 结果统计
| 类别 | 总数 | 通过 | 失败 | 跳过 | 通过率 |
|------|------|------|------|------|---------|
| 单元测试 | 150 | 148 | 2 | 0 | 98.7% |
| 集成测试 | 80 | 78 | 1 | 1 | 97.5% |
| E2E测试 | 30 | 29 | 1 | 0 | 96.7% |
| **总计** | **260** | **255** | **4** | **1** | **98.1%** |

## 失败用例
| ID | 名称 | 错误信息 | 优先级 |
|----|------|----------|--------|
| TC-PAY-002 | 支付成功处理 | Timeout waiting for webhook | 高 |
| TC-PERF-001 | 并发扣减测试 | Race condition detected | 中 |

## 性能指标
- 平均响应时间: 245ms
- 95%响应时间: 980ms
- 并发用户数: 100
- 错误率: 0.3%

## 建议
1. 修复webhook超时问题
2. 优化并发处理逻辑
3. 增加重试机制

## 下一步
- [ ] 修复失败用例
- [ ] 执行回归测试
- [ ] 性能优化
```

## 12. 测试最佳实践

### 测试原则
1. **独立性**: 每个测试独立运行，不依赖其他测试
2. **可重复**: 测试结果一致，不受环境影响
3. **快速**: 单元测试秒级，集成测试分钟级
4. **全面**: 覆盖正常、异常、边界情况
5. **可维护**: 清晰的命名和结构

### 测试金字塔
```
        /\
       /E2E\      (10%)
      /------\
     /Integration\ (30%)
    /------------\
   /  Unit Tests  \(60%)
  /----------------\
```

### 测试覆盖率目标
- 单元测试: > 80%
- 集成测试: > 70%
- 关键路径: 100%

### 持续改进
- 定期审查测试用例
- 收集失败模式
- 优化测试性能
- 更新测试文档

## 结语

本测试计划涵盖了Stripe支付与积分系统的所有关键功能。通过系统化的测试，确保系统的可靠性、安全性和性能达到生产要求。测试团队应根据实际情况调整测试策略，持续改进测试质量。
