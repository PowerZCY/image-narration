# Stripe 支付与积分系统部署指南

## 1. 前置准备

### 1.1 Supabase 设置
1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 创建新项目或选择现有项目
3. 获取以下凭据：
   - `SUPABASE_URL`: 项目 URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Service Role 密钥
   - `SUPABASE_ANON_KEY`: Anon 密钥

### 1.2 Stripe 设置
1. 登录 [Stripe Dashboard](https://dashboard.stripe.com)
2. 创建产品和价格：
   ```
   Starter Plan - $2 - 10 credits
   Pro Plan - $5 - 40 credits  
   Elite Plan - $10 - 100 credits
   ```
3. 获取价格 ID（格式：`price_xxx`）
4. 获取 API 密钥：
   - 测试密钥：`sk_test_xxx`
   - 生产密钥：`sk_live_xxx`

### 1.3 Clerk 配置
确保 Clerk 已正确配置并获取：
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

## 2. 数据库迁移

### 2.1 本地开发环境
```bash
# 安装 Supabase CLI
brew install supabase/tap/supabase

# 初始化并启动本地 Supabase
supabase init
supabase start

# 执行迁移
supabase db reset
```

### 2.2 生产环境
```bash
# 链接到生产项目
supabase link --project-ref YOUR_PROJECT_REF

# 执行迁移（先预览）
supabase db push --dry-run

# 确认后执行
supabase db push
```

或通过 Dashboard：
1. 进入 SQL Editor
2. 依次执行：
   - `20250922_create_payment_tables.sql`
   - `20250923_create_rpc_functions.sql`

## 3. 环境变量配置

### 3.1 创建 `.env.local` 文件
```env
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
SUPABASE_ANON_KEY=eyJyyy...

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx  # 测试环境用 sk_test, 生产用 sk_live
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_STARTER=price_xxx_starter
STRIPE_PRICE_PRO=price_xxx_pro
STRIPE_PRICE_ELITE=price_xxx_elite

# 安全
ANON_ID_SECRET=your-secret-key-for-hmac

# 定时任务（可选）
CRON_SECRET=your-cron-secret

# 测试面板（仅开发）
TEST_INFO_PANEL_ENABLED=true  # 生产环境设为 false
```

### 3.2 Vercel 部署配置
在 Vercel Dashboard 中添加所有环境变量

## 4. Stripe Webhook 设置

### 4.1 本地测试
```bash
# 安装 Stripe CLI
brew install stripe/stripe-cli/stripe

# 登录
stripe login

# 转发 webhook 到本地
stripe listen --forward-to http://localhost:3000/api/payments/webhook
```

### 4.2 生产环境
1. 在 Stripe Dashboard > Webhooks 添加端点
2. URL: `https://your-domain.com/api/payments/webhook`
3. 选择事件：
   - `checkout.session.completed`
   - `payment_intent.payment_failed`
   - `charge.dispute.created`
4. 获取签名密钥并配置为 `STRIPE_WEBHOOK_SECRET`

## 5. 定时任务配置（积分过期处理）

### 5.1 Vercel Cron Jobs
创建 `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/expire-credits",
    "schedule": "0 0 * * *"
  }]
}
```

### 5.2 外部定时服务
使用 [cron-job.org](https://cron-job.org) 或类似服务：
- URL: `https://your-domain.com/api/cron/expire-credits`
- 频率：每日一次
- Headers: `Authorization: Bearer YOUR_CRON_SECRET`

## 6. 测试流程

### 6.1 本地测试
```bash
# 安装依赖
pnpm install

# 运行测试
pnpm test

# 测试覆盖率
pnpm test:coverage
```

### 6.2 手动测试清单

#### 匿名用户测试
- [ ] 访问首页，自动生成匿名 ID
- [ ] 首次使用免费额度成功
- [ ] 第二次使用提示登录
- [ ] Cookie 被正确设置

#### 登录用户测试  
- [ ] 新用户自动初始化积分余额为 0
- [ ] 积分余额正确显示
- [ ] 积分不足时无法使用
- [ ] 积分扣减和恢复正确

#### 支付测试
- [ ] 未登录用户点击购买跳转登录
- [ ] 选择套餐跳转 Stripe Checkout
- [ ] 支付成功后积分正确增加
- [ ] 订单状态正确更新
- [ ] 重复 webhook 不会重复加积分

#### 安全测试
- [ ] 金额不匹配的支付被拒绝
- [ ] 货币不匹配的支付被拒绝
- [ ] 未完成的支付不发放积分
- [ ] Webhook 签名验证生效

### 6.3 测试 Stripe 支付
使用测试卡号：
- 成功：`4242 4242 4242 4242`
- 拒绝：`4000 0000 0000 0002`
- 3D 验证：`4000 0025 0000 3155`

## 7. 监控和维护

### 7.1 关键指标监控
- 支付成功率
- 积分消耗速度
- 匿名用户转化率
- Webhook 处理延迟

### 7.2 日常维护
- 定期检查过期积分清理任务
- 监控异常订单（disputed 状态）
- 审查大额或频繁购买
- 更新积分价格和套餐

### 7.3 故障排查

#### 积分未到账
1. 检查 Stripe Dashboard 支付状态
2. 查看 orders 表订单状态
3. 检查 stripe_events 表是否有记录
4. 查看 credit_logs 表充值记录

#### Webhook 失败
1. 验证 webhook 密钥配置
2. 检查网络和 SSL 证书
3. 查看 Stripe webhook 日志
4. 验证签名和时效性

#### 匿名用户问题
1. 检查 ANON_ID_SECRET 配置
2. 验证 IP 头获取逻辑
3. 检查 Cookie 设置
4. 查看 anon_usage 表记录

## 8. 安全建议

1. **定期轮换密钥**
   - ANON_ID_SECRET 每季度更换
   - Stripe API 密钥定期更新
   - Supabase Service Role 密钥保护

2. **监控异常行为**
   - 短时间大量注册
   - 同 IP 多账号
   - 频繁退款请求
   - 金额异常订单

3. **备份策略**
   - 定期备份数据库
   - 保存关键交易日志
   - 订单数据归档

## 9. 上线检查清单

- [ ] 所有环境变量已配置
- [ ] 数据库迁移已执行
- [ ] Stripe 产品和价格已创建
- [ ] Webhook 已配置并测试
- [ ] 定时任务已设置
- [ ] 测试环境标志已关闭
- [ ] 监控和告警已配置
- [ ] 备份策略已实施
- [ ] 安全审查已完成

## 10. 回滚方案

如需回滚：
1. 停止 webhook 处理
2. 执行回滚 SQL：`20250922_create_payment_tables_rollback.sql`
3. 恢复代码到上一版本
4. 验证服务正常

---

**重要提醒**：
- 生产环境务必使用 `sk_live_` 开头的 Stripe 密钥
- 确保 `TEST_INFO_PANEL_ENABLED` 在生产环境设为 false
- 定期检查积分过期处理任务是否正常运行