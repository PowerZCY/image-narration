-- =============================================
-- Stripe 支付与积分系统数据库结构
-- =============================================

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. users 表：用户主表
-- =============================================
CREATE TABLE users (
  user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),        -- 业务内部用户主键
  clerk_user_id text UNIQUE NOT NULL,                        -- 对应 Clerk 的用户 ID
  email text UNIQUE NOT NULL,                                -- 用户邮箱（唯一登录凭据）
  display_name text,                                         -- 展示昵称
  created_at timestamptz DEFAULT now() NOT NULL,            -- 记录创建时间
  updated_at timestamptz DEFAULT now() NOT NULL             -- 最近更新时间
);

-- 创建索引提升查询性能
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- =============================================
-- 2. user_credits 表：用户积分余额
-- =============================================
CREATE TABLE user_credits (
  user_id uuid PRIMARY KEY 
    REFERENCES users(user_id) ON DELETE CASCADE,             -- 用户删除时级联删除积分记录
  clerk_user_id text UNIQUE NOT NULL 
    REFERENCES users(clerk_user_id) ON DELETE CASCADE,       -- Clerk ID 冗余存储方便查询
  balance integer NOT NULL DEFAULT 0 
    CHECK (balance >= 0),                                    -- 积分余额不能为负
  expires_at timestamptz,                                    -- 当前余额的到期时间
  created_at timestamptz DEFAULT now() NOT NULL,            -- 记录创建时间
  updated_at timestamptz DEFAULT now() NOT NULL             -- 最近更新时间
);

-- 创建索引
CREATE INDEX idx_user_credits_expires_at ON user_credits(expires_at) 
  WHERE expires_at IS NOT NULL;

-- =============================================
-- 3. credit_logs 表：积分变动日志
-- =============================================
CREATE TABLE credit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),             -- 日志主键
  user_id uuid 
    REFERENCES users(user_id) ON DELETE SET NULL,            -- 用户删除后保留日志，设为NULL
  clerk_user_id text 
    REFERENCES users(clerk_user_id) ON DELETE SET NULL,      -- 对应 Clerk ID，便于排查
  anon_id text,                                             -- 匿名访客 ID（不建外键，因为可能清理）
  type text NOT NULL 
    CHECK (type IN ('recharge','consume','free','adjust','expire')), -- 积分变动类型
  status text NOT NULL DEFAULT 'confirmed' 
    CHECK (status IN ('pending','confirmed','refunded')),    -- 日志状态
  credits integer NOT NULL,                                  -- 变动数值（正数为增加，负数为减少）
  ref_id text,                                              -- 幂等引用，如 session_id / requestId
  metadata jsonb,                                           -- 补充上下文元数据
  created_at timestamptz DEFAULT now() NOT NULL,            -- 日志创建时间
  updated_at timestamptz DEFAULT now() NOT NULL             -- 最近更新时间
);

-- 创建唯一索引（仅对非NULL的ref_id生效）
CREATE UNIQUE INDEX credit_logs_ref_unique 
  ON credit_logs(type, ref_id) 
  WHERE ref_id IS NOT NULL;

-- 创建性能索引
CREATE INDEX idx_credit_logs_user_id ON credit_logs(user_id) 
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_credit_logs_clerk_user_id ON credit_logs(clerk_user_id) 
  WHERE clerk_user_id IS NOT NULL;
CREATE INDEX idx_credit_logs_anon_id ON credit_logs(anon_id) 
  WHERE anon_id IS NOT NULL;
CREATE INDEX idx_credit_logs_type ON credit_logs(type);
CREATE INDEX idx_credit_logs_status ON credit_logs(status);
CREATE INDEX idx_credit_logs_created_at ON credit_logs(created_at DESC);

-- =============================================
-- 4. stripe_events 表：Stripe Webhook 事件去重
-- =============================================
CREATE TABLE stripe_events (
  event_id text PRIMARY KEY,                                -- Stripe 事件ID
  created_at timestamptz DEFAULT now() NOT NULL            -- 处理时间
);

-- 创建索引用于清理旧事件
CREATE INDEX idx_stripe_events_created_at ON stripe_events(created_at DESC);

-- =============================================
-- 5. orders 表：订单记录
-- =============================================
CREATE TABLE orders (
  session_id text PRIMARY KEY,                              -- Stripe Checkout Session ID
  user_id uuid 
    REFERENCES users(user_id) ON DELETE SET NULL,           -- 用户删除后订单保留
  clerk_user_id text 
    REFERENCES users(clerk_user_id) ON DELETE SET NULL,     -- 冗余 Clerk ID，排查方便
  user_email text,                                          -- 下单时的邮箱，用于对账
  price_id text NOT NULL,                                   -- Stripe Price ID
  credits integer NOT NULL CHECK (credits > 0),             -- 本次订单对应的积分数
  amount numeric(10,2) NOT NULL CHECK (amount > 0),         -- 实付金额（货币单位）
  currency text NOT NULL,                                   -- 货币类型（如 usd）
  state text NOT NULL DEFAULT 'pending' 
    CHECK (state IN ('pending','paid','failed')),           -- 订单状态机
  extra jsonb,                                              -- 附加信息，如 Session 或 PaymentIntent
  created_at timestamptz DEFAULT now() NOT NULL,            -- 记录创建时间
  updated_at timestamptz DEFAULT now() NOT NULL             -- 最近更新时间
);

-- 创建索引优化查询
CREATE INDEX idx_orders_user_id ON orders(user_id) 
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_orders_state ON orders(state);
CREATE INDEX idx_orders_user_email ON orders(user_email);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
-- 复合索引用于查询用户最近的已支付订单
CREATE INDEX idx_orders_user_paid ON orders(user_id, state, created_at DESC) 
  WHERE state = 'paid';

-- =============================================
-- 6. anon_usage 表：匿名用户使用记录
-- =============================================
CREATE TABLE anon_usage (
  anon_id text PRIMARY KEY
    CHECK (anon_id ~ '^[A-Za-z0-9_-]{43}$'),               -- 匿名访客 ID（Cookie 储存）
  usage_count integer NOT NULL DEFAULT 0 
    CHECK (usage_count >= 0),                               -- 已消耗的免费次数不能为负
  last_used_at timestamptz,                                 -- 最近使用时间
  ip_hash text,                                            -- 受信 IP 信号的 HMAC 哈希值
  ip_subnet_hash text,                                     -- IP 段的 HMAC 哈希（用于风控）
  user_agent text,                                         -- 最近一次使用时的 User-Agent
  fingerprint_source jsonb,                                -- 指纹原始信息（生成时的信号）
  created_at timestamptz DEFAULT now() NOT NULL,           -- 记录创建时间
  updated_at timestamptz DEFAULT now() NOT NULL            -- 最近更新时间
);

-- 创建索引用于风控查询
CREATE INDEX idx_anon_usage_ip_hash ON anon_usage(ip_hash);
CREATE INDEX idx_anon_usage_ip_subnet_hash ON anon_usage(ip_subnet_hash);
CREATE INDEX idx_anon_usage_last_used_at ON anon_usage(last_used_at DESC);
CREATE INDEX idx_anon_usage_usage_count ON anon_usage(usage_count);

-- =============================================
-- 7. 创建自动更新 updated_at 的触发器函数
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 8. 为每个表应用 updated_at 触发器
-- =============================================

-- users 表触发器
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- user_credits 表触发器
CREATE TRIGGER update_user_credits_updated_at 
  BEFORE UPDATE ON user_credits
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- credit_logs 表触发器
CREATE TRIGGER update_credit_logs_updated_at 
  BEFORE UPDATE ON credit_logs
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- orders 表触发器
CREATE TRIGGER update_orders_updated_at 
  BEFORE UPDATE ON orders
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- anon_usage 表触发器
CREATE TRIGGER update_anon_usage_updated_at 
  BEFORE UPDATE ON anon_usage
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 9. 添加表注释（用于文档生成）
-- =============================================

-- 表注释
COMMENT ON TABLE users IS '用户主表，存储基本用户信息';
COMMENT ON TABLE user_credits IS '用户积分余额表，一对一关联用户';
COMMENT ON TABLE credit_logs IS '积分变动日志，记录所有积分操作';
COMMENT ON TABLE stripe_events IS 'Stripe Webhook事件去重表';
COMMENT ON TABLE orders IS '订单记录表，存储所有支付订单';
COMMENT ON TABLE anon_usage IS '匿名用户使用记录，用于限免和风控';

-- 重要字段注释
COMMENT ON COLUMN users.email IS '用户邮箱，作为唯一登录凭据';
COMMENT ON COLUMN user_credits.balance IS '当前积分余额，不能为负数';
COMMENT ON COLUMN user_credits.expires_at IS '积分到期时间，NULL表示永不过期';
COMMENT ON COLUMN credit_logs.type IS '变动类型：recharge充值/consume消费/free免费/adjust调整/expire过期';
COMMENT ON COLUMN credit_logs.status IS '状态：pending待确认/confirmed已确认/refunded已退款';
COMMENT ON COLUMN orders.state IS '订单状态：pending待支付/paid已支付/failed失败';
COMMENT ON COLUMN anon_usage.anon_id IS '匿名访客 ID，要求为 43 位 base64url 字符串';
COMMENT ON COLUMN anon_usage.usage_count IS '已使用的免费次数，用于限制匿名使用';

-- =============================================
-- 10. 创建常用查询的视图（可选）
-- =============================================

-- 用户积分概览视图
CREATE OR REPLACE VIEW user_credits_overview AS
SELECT 
  u.user_id,
  u.clerk_user_id,
  u.email,
  u.display_name,
  uc.balance,
  uc.expires_at,
  uc.updated_at as balance_updated_at,
  (SELECT COUNT(*) FROM orders WHERE user_id = u.user_id AND state = 'paid') as paid_orders_count,
  (SELECT SUM(amount) FROM orders WHERE user_id = u.user_id AND state = 'paid') as total_paid_amount
FROM users u
LEFT JOIN user_credits uc ON u.user_id = uc.user_id;

COMMENT ON VIEW user_credits_overview IS '用户积分概览，包含余额和订单统计';

-- =============================================
-- 迁移完成提示
-- =============================================
-- 迁移成功后，请确保：
-- 1. 配置环境变量（SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY等）
-- 2. 在 Stripe Dashboard 创建对应的 Price ID
-- 3. 配置 Clerk 认证
-- 4. 实现 ensureUser 函数逻辑
-- 5. 设置定时任务处理过期积分
