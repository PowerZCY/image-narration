# 生产环境部署检查清单

## 1. Supabase 生产环境设置

### 1.1 执行数据库迁移
- [ ] 登录 Supabase Dashboard
- [ ] 选择或创建生产项目
- [ ] 在 SQL Editor 中执行 `supabase/migrations/20250929_complete_schema.sql`
- [ ] 验证所有表和函数创建成功

### 1.2 配置 Schema 访问（二选一）

#### 选项 A：使用 narration schema（需要额外配置）
- [ ] Dashboard → Settings → API → Exposed schemas
- [ ] 添加 `narration` 到暴露的 schemas 列表
- [ ] 保存更改

#### 选项 B：使用 public schema（推荐，更简单）
- [ ] 修改环境变量 `SUPABASE_SCHEMA=public`
- [ ] 更新迁移文件，移除 `narration.` 前缀
- [ ] 重新执行迁移

### 1.3 获取连接信息
- [ ] 复制 `SUPABASE_URL`
- [ ] 复制 `SUPABASE_ANON_KEY`
- [ ] 复制 `SUPABASE_SERVICE_ROLE_KEY`

## 2. Vercel 项目配置

### 2.1 创建 Vercel 项目
- [ ] 登录 Vercel Dashboard
- [ ] Import Git Repository
- [ ] 选择你的 GitHub 仓库

### 2.2 配置环境变量
在 Vercel Project Settings → Environment Variables 添加：

#### 基础配置
- [ ] `NEXT_PUBLIC_BASE_URL` (生产域名)
- [ ] `NODE_ENV=production`

#### Supabase 配置
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `SUPABASE_SCHEMA=narration` (或 `public`)

#### Clerk 认证
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- [ ] `CLERK_SECRET_KEY`
- [ ] `CLERK_WEBHOOK_SECRET` (稍后配置)
- [ ] `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- [ ] `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`

#### Stripe 支付
- [ ] `STRIPE_SECRET_KEY` (生产密钥)
- [ ] `STRIPE_WEBHOOK_SECRET` (稍后配置)
- [ ] `NEXT_PUBLIC_STRIPE_PRICE_STARTER`
- [ ] `NEXT_PUBLIC_STRIPE_PRICE_PRO`
- [ ] `NEXT_PUBLIC_STRIPE_PRICE_ELITE`

#### OpenRouter AI
- [ ] `OPENROUTER_API_KEY`
- [ ] `NEXT_PUBLIC_OPENROUTER_MODEL_NAME`
- [ ] `NEXT_PUBLIC_OPENROUTER_TRANSLATION_MODEL_NAME`
- [ ] `OPENROUTER_ENABLE_MOCK=false`

#### R2 存储
- [ ] `NEXT_PUBLIC_R2_API_TOKEN`
- [ ] `NEXT_PUBLIC_R2_BASE_URL`
- [ ] `NEXT_PUBLIC_R2_BUCKET_NAME`
- [ ] `NEXT_PUBLIC_R2_ENABLE_MOCK=false`

#### 其他
- [ ] `ANON_ID_SECRET` (生产密钥)
- [ ] `NEXT_PUBLIC_APP_NAME=Image Narration`

## 3. Webhook 配置

### 3.1 Clerk Webhook
1. [ ] 部署应用后获取生产 URL
2. [ ] 在 Clerk Dashboard 创建 Webhook
3. [ ] Endpoint URL: `https://your-domain.vercel.app/api/clerk/webhook`
4. [ ] 订阅事件：`user.created`, `user.updated`, `user.deleted`
5. [ ] 复制 Signing Secret
6. [ ] 更新 Vercel 环境变量 `CLERK_WEBHOOK_SECRET`

### 3.2 Stripe Webhook
1. [ ] 在 Stripe Dashboard 创建 Webhook
2. [ ] Endpoint URL: `https://your-domain.vercel.app/api/payments/webhook`
3. [ ] 订阅事件：`checkout.session.completed`
4. [ ] 复制 Signing Secret
5. [ ] 更新 Vercel 环境变量 `STRIPE_WEBHOOK_SECRET`

## 4. 部署验证

### 4.1 初始部署
- [ ] 在 Vercel 触发部署
- [ ] 检查构建日志无错误
- [ ] 访问生产 URL

### 4.2 功能测试
- [ ] 用户注册/登录
- [ ] 图片上传和分析
- [ ] 积分消费
- [ ] 支付流程
- [ ] Webhook 触发（查看 Vercel Functions 日志）

### 4.3 监控设置
- [ ] 设置 Vercel Analytics
- [ ] 设置错误监控（可选）
- [ ] 配置日志收集（可选）

## 5. 常见问题排查

### Schema 相关错误
如果遇到 "The schema must be one of the following: public, graphql_public"：
1. 检查 Supabase Dashboard 是否已暴露 `narration` schema
2. 或切换到使用 `public` schema

### Webhook 失败
1. 检查 Webhook Secret 是否正确
2. 查看 Vercel Functions 日志
3. 验证 Webhook URL 可访问

### 数据库连接失败
1. 检查环境变量是否正确设置
2. 验证 Supabase 项目是否活跃
3. 检查网络连接和防火墙设置

## 备注

- 建议先在 Vercel Preview 环境测试
- 保存所有生产环境密钥到安全的密码管理器
- 定期备份数据库