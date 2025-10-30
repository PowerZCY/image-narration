-- =============================================
-- 完整的数据库架构 - 合并后的表结构
-- 创建日期: 2025-09-29
-- 说明: 包含完整的表结构、RPC函数、索引、视图和权限设置
-- Schema: narration (用于项目隔离)
-- =============================================

-- =============================================
-- 0. 基础设置
-- =============================================

-- 创建专用 schema
CREATE SCHEMA IF NOT EXISTS narration;

-- 授予必要的权限给不同角色
GRANT USAGE ON SCHEMA narration TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA narration TO postgres;

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 创建自动更新 updated_at 的触发器函数（在 narration schema 中）
CREATE OR REPLACE FUNCTION narration.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 1. 核心表结构
-- =============================================

-- =============================================
-- 1.1 user_credits 表：合并用户信息和积分
-- =============================================
CREATE TABLE narration.user_credits (
  -- 主键和标识
  user_id bigserial PRIMARY KEY,                              -- 用户唯一ID（自增）
  clerk_user_id text UNIQUE NOT NULL,                         -- Clerk用户ID，唯一标识
  
  -- 用户基本信息
  email text UNIQUE NOT NULL,                                 -- 用户邮箱，唯一登录凭据
  display_name text,                                           -- 用户显示名称
  
  -- 积分相关字段
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),    -- 积分余额，不能为负
  expires_at timestamptz,                                      -- 积分到期时间，NULL表示永不过期
  
  -- 状态字段
  deleted_at timestamptz,                                      -- 软删除时间戳，NULL表示未删除
  
  -- 时间戳字段
  created_at timestamptz DEFAULT now() NOT NULL,              -- 记录创建时间
  updated_at timestamptz DEFAULT now() NOT NULL               -- 最近更新时间
);

-- 创建索引
CREATE INDEX idx_user_credits_email ON narration.user_credits(email);
CREATE INDEX idx_user_credits_clerk_user_id ON narration.user_credits(clerk_user_id);
CREATE INDEX idx_user_credits_created_at ON narration.user_credits(created_at DESC);
CREATE INDEX idx_user_credits_expires_at ON narration.user_credits(expires_at) 
  WHERE expires_at IS NOT NULL;
CREATE INDEX idx_user_credits_balance ON narration.user_credits(balance);
CREATE INDEX idx_user_credits_deleted_at ON narration.user_credits(deleted_at) 
  WHERE deleted_at IS NOT NULL;

-- =============================================
-- 1.2 credit_logs 表：积分变动日志
-- =============================================
CREATE TABLE narration.credit_logs (
  id bigserial PRIMARY KEY,                                  -- 日志主键（自增）
  user_id bigint 
    REFERENCES narration.user_credits(user_id) ON DELETE SET NULL,     -- 用户删除后保留日志
  clerk_user_id text,                                        -- Clerk ID，便于排查
  anon_id text,                                             -- 匿名访客 ID
  type text NOT NULL 
    CHECK (type IN ('recharge','consume','expire')),        -- 积分变动类型  20251023添加signup_bonus注册赠送
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
  ON narration.credit_logs(type, ref_id) 
  WHERE ref_id IS NOT NULL;

-- 创建性能索引
CREATE INDEX idx_credit_logs_user_id ON narration.credit_logs(user_id) 
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_credit_logs_clerk_user_id ON narration.credit_logs(clerk_user_id) 
  WHERE clerk_user_id IS NOT NULL;
CREATE INDEX idx_credit_logs_anon_id ON narration.credit_logs(anon_id) 
  WHERE anon_id IS NOT NULL;
CREATE INDEX idx_credit_logs_type ON narration.credit_logs(type);
CREATE INDEX idx_credit_logs_status ON narration.credit_logs(status);
CREATE INDEX idx_credit_logs_created_at ON narration.credit_logs(created_at DESC);

-- =============================================
-- 1.3 orders 表：订单记录
-- =============================================
CREATE TABLE narration.orders (
  order_id bigserial PRIMARY KEY,                           -- 订单唯一ID（自增）
  session_id text UNIQUE NOT NULL,                         -- Stripe Checkout Session ID
  user_id bigint 
    REFERENCES narration.user_credits(user_id) ON DELETE SET NULL,    -- 用户删除后订单保留
  clerk_user_id text,                                       -- Clerk ID，排查方便
  user_email text,                                          -- 下单时的邮箱，用于对账
  price_id text NOT NULL,                                   -- Stripe Price ID
  price_tier text,                                          -- 套餐类型（Starter/Pro/Elite）
  credits integer NOT NULL CHECK (credits > 0),             -- 本次订单对应的积分数
  amount numeric(10,2) NOT NULL CHECK (amount > 0),         -- 实付金额（货币单位）
  currency text NOT NULL,                                   -- 货币类型（如 usd）
  state text NOT NULL DEFAULT 'pending' 
    CHECK (state IN ('pending','paid','failed','disputed')), -- 订单状态
  paid_at timestamptz,                                      -- 支付完成时间
  extra jsonb,                                              -- 附加信息
  created_at timestamptz DEFAULT now() NOT NULL,            -- 记录创建时间
  updated_at timestamptz DEFAULT now() NOT NULL             -- 最近更新时间
);

-- 创建索引
CREATE INDEX idx_orders_user_id ON narration.orders(user_id) 
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_orders_state ON narration.orders(state);
CREATE INDEX idx_orders_user_email ON narration.orders(user_email);
CREATE INDEX idx_orders_created_at ON narration.orders(created_at DESC);
CREATE INDEX idx_orders_paid_at ON narration.orders(paid_at) 
  WHERE paid_at IS NOT NULL;
-- 复合索引用于查询用户最近的已支付订单
CREATE INDEX idx_orders_user_paid ON narration.orders(user_id, state, created_at DESC) 
  WHERE state = 'paid';

-- =============================================
-- 1.4 stripe_events 表：Stripe Webhook 事件记录
-- =============================================
CREATE TABLE narration.stripe_events (
  id bigserial PRIMARY KEY,                                 -- 自增主键
  event_id text NOT NULL,                                   -- Stripe 事件ID（允许重复）
  event_name text NOT NULL,                                 -- 事件类型名称
  event_data jsonb NOT NULL,                               -- 完整的事件数据
  event_created_at timestamptz,                            -- Stripe 事件的创建时间
  created_at timestamptz DEFAULT now() NOT NULL            -- 接收事件的时间
);

-- 创建索引
CREATE INDEX idx_stripe_events_event_id ON narration.stripe_events(event_id);
CREATE INDEX idx_stripe_events_created_at ON narration.stripe_events(created_at DESC);
CREATE INDEX idx_stripe_events_event_name ON narration.stripe_events(event_name);
CREATE INDEX idx_stripe_events_event_created_at ON narration.stripe_events(event_created_at) 
  WHERE event_created_at IS NOT NULL;

-- =============================================
-- 1.5 clerk_events 表：Clerk Webhook 事件记录
-- =============================================
CREATE TABLE narration.clerk_events (
  id bigserial PRIMARY KEY,                      -- 自增主键
  event_id text NOT NULL,                        -- 消息ID（MESSAGE ID，从svix-id header获取）
  event_type text NOT NULL,                      -- 事件类型（user.created, session.created等）
  event_data jsonb NOT NULL,                     -- 完整的事件数据
  clerk_user_id text,                            -- 相关的Clerk用户ID（如果有）
  event_timestamp timestamptz,                   -- 事件发生时间（从payload中提取）
  created_at timestamptz DEFAULT now() NOT NULL  -- 我们接收并存储的时间
);

-- 创建索引
CREATE INDEX idx_clerk_events_event_id ON narration.clerk_events(event_id);
CREATE INDEX idx_clerk_events_event_type ON narration.clerk_events(event_type);
CREATE INDEX idx_clerk_events_clerk_user_id ON narration.clerk_events(clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;
CREATE INDEX idx_clerk_events_event_timestamp ON narration.clerk_events(event_timestamp DESC)
  WHERE event_timestamp IS NOT NULL;
CREATE INDEX idx_clerk_events_created_at ON narration.clerk_events(created_at DESC);

-- =============================================
-- 1.6 user_usage_history 表：用户使用记录
-- =============================================
CREATE TABLE narration.user_usage_history (
  id bigserial PRIMARY KEY,                                  -- 使用记录唯一ID
  user_id bigint 
    REFERENCES narration.user_credits(user_id) ON DELETE CASCADE,      -- 注册用户ID
  clerk_user_id text,                                        -- Clerk用户ID
  anon_id text,                                             -- 匿名用户ID
  image_url text NOT NULL,                                  -- 用户上传的图片URL
  user_prompt text,                                         -- 用户输入的prompt
  ai_narration text NOT NULL,                               -- AI生成的图片描述
  request_id text,                                          -- 关联请求ID
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deleted')),                -- 记录状态
  created_at timestamptz DEFAULT now() NOT NULL,            -- 使用时间
  updated_at timestamptz DEFAULT now() NOT NULL             -- 最近更新时间
);

-- 创建索引
CREATE INDEX idx_usage_history_user_id ON narration.user_usage_history(user_id) 
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_usage_history_clerk_user_id ON narration.user_usage_history(clerk_user_id) 
  WHERE clerk_user_id IS NOT NULL;
CREATE INDEX idx_usage_history_anon_id ON narration.user_usage_history(anon_id) 
  WHERE anon_id IS NOT NULL;
CREATE INDEX idx_usage_history_created_at ON narration.user_usage_history(created_at DESC);
CREATE INDEX idx_usage_history_user_time ON narration.user_usage_history(user_id, created_at DESC) 
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_usage_history_request_id ON narration.user_usage_history(request_id) 
  WHERE request_id IS NOT NULL;
CREATE INDEX idx_usage_history_status ON narration.user_usage_history(status);
CREATE INDEX idx_usage_history_user_status ON narration.user_usage_history(clerk_user_id, status) 
  WHERE clerk_user_id IS NOT NULL;

-- 添加约束
ALTER TABLE narration.user_usage_history 
ADD CONSTRAINT usage_history_user_type_check 
CHECK (
  (user_id IS NOT NULL AND clerk_user_id IS NOT NULL AND anon_id IS NULL) OR
  (user_id IS NULL AND clerk_user_id IS NULL AND anon_id IS NOT NULL)
);

ALTER TABLE narration.user_usage_history 
ADD CONSTRAINT usage_history_prompt_length_check 
CHECK (user_prompt IS NULL OR length(user_prompt) <= 2000);

ALTER TABLE narration.user_usage_history 
ADD CONSTRAINT usage_history_required_fields_check 
CHECK (
  image_url IS NOT NULL AND image_url != '' AND
  ai_narration IS NOT NULL AND ai_narration != ''
);

-- =============================================
-- 1.7 anon_usage 表：匿名用户使用记录
-- =============================================
CREATE TABLE narration.anon_usage (
  anon_id text PRIMARY KEY
    CHECK (anon_id ~ '^[A-Za-z0-9_-]{43}$'),               -- 匿名访客 ID
  usage_count integer NOT NULL DEFAULT 0 
    CHECK (usage_count >= 0),                               -- 已消耗的免费次数
  last_used_at timestamptz,                                 -- 最近使用时间
  ip_hash text,                                            -- IP 哈希值
  ip_subnet_hash text,                                     -- IP 段哈希
  user_agent text,                                         -- User-Agent
  fingerprint_source jsonb,                                -- 指纹原始信息
  created_at timestamptz DEFAULT now() NOT NULL,           -- 记录创建时间
  updated_at timestamptz DEFAULT now() NOT NULL            -- 最近更新时间
);

-- 创建索引
CREATE INDEX idx_anon_usage_ip_hash ON narration.anon_usage(ip_hash);
CREATE INDEX idx_anon_usage_ip_subnet_hash ON narration.anon_usage(ip_subnet_hash);
CREATE INDEX idx_anon_usage_last_used_at ON narration.anon_usage(last_used_at DESC);
CREATE INDEX idx_anon_usage_usage_count ON narration.anon_usage(usage_count);

-- =============================================
-- 2. 触发器设置
-- =============================================

-- user_credits 表触发器
CREATE TRIGGER update_user_credits_updated_at 
  BEFORE UPDATE ON narration.user_credits
  FOR EACH ROW 
  EXECUTE FUNCTION narration.update_updated_at_column();

-- credit_logs 表触发器
CREATE TRIGGER update_credit_logs_updated_at 
  BEFORE UPDATE ON narration.credit_logs
  FOR EACH ROW 
  EXECUTE FUNCTION narration.update_updated_at_column();

-- orders 表触发器
CREATE TRIGGER update_orders_updated_at 
  BEFORE UPDATE ON narration.orders
  FOR EACH ROW 
  EXECUTE FUNCTION narration.update_updated_at_column();

-- user_usage_history 表触发器
CREATE TRIGGER update_usage_history_updated_at 
  BEFORE UPDATE ON narration.user_usage_history
  FOR EACH ROW 
  EXECUTE FUNCTION narration.update_updated_at_column();

-- anon_usage 表触发器
CREATE TRIGGER update_anon_usage_updated_at 
  BEFORE UPDATE ON narration.anon_usage
  FOR EACH ROW 
  EXECUTE FUNCTION narration.update_updated_at_column();

-- =============================================
-- 3. RPC 函数
-- =============================================

-- =============================================
-- 3.1 确保用户存在并初始化积分
-- =============================================
CREATE OR REPLACE FUNCTION narration.ensure_user_with_credits(
  p_clerk_user_id text,
  p_email text,
  p_display_name text DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
  v_user_id bigint;
BEGIN
  -- 直接插入到user_credits表，如果已存在则更新
  INSERT INTO narration.user_credits (clerk_user_id, email, display_name, balance)
  VALUES (p_clerk_user_id, p_email, p_display_name, 0)
  ON CONFLICT (clerk_user_id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, narration.user_credits.display_name),
        updated_at = now()
  RETURNING user_id INTO v_user_id;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3.2 消费积分（带事务保证）
-- =============================================
CREATE OR REPLACE FUNCTION narration.consume_credits(
  p_user_id bigint,
  p_credits integer,
  p_ref_id text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_balance integer;
  v_expires_at timestamptz;
  v_log_id bigint;
  v_clerk_user_id text;
  v_new_balance integer;
BEGIN
  -- 设置事务超时
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '10s';

  -- 获取用户当前余额和过期时间（加锁）
  SELECT balance, expires_at, clerk_user_id
  INTO v_balance, v_expires_at, v_clerk_user_id
  FROM narration.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 检查用户是否存在
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- 检查积分是否过期
  IF v_expires_at IS NOT NULL AND v_expires_at < now() THEN
    RAISE EXCEPTION 'Credits expired';
  END IF;

  -- 检查余额是否充足
  IF v_balance < p_credits THEN
    RAISE EXCEPTION 'Insufficient credits: has % need %', v_balance, p_credits;
  END IF;

  -- 计算扣减后的新余额
  v_new_balance := v_balance - p_credits;

  -- 扣减积分，如果余额归零则同时清空过期时间
  IF v_new_balance = 0 THEN
    UPDATE narration.user_credits
    SET balance = v_new_balance,
        expires_at = NULL,
        updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE narration.user_credits
    SET balance = v_new_balance,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- 创建消费日志
  INSERT INTO narration.credit_logs (
    user_id, clerk_user_id, type, status, credits, ref_id
  ) VALUES (
    p_user_id, v_clerk_user_id, 'consume', 'pending', -p_credits, p_ref_id
  ) RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'log_id', v_log_id,
    'remaining_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3.3 退还积分
-- =============================================
CREATE OR REPLACE FUNCTION narration.refund_credits(
  p_log_id bigint,
  p_reason text DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_user_id bigint;
  v_credits integer;
BEGIN
  -- 获取日志信息
  SELECT user_id, ABS(credits)
  INTO v_user_id, v_credits
  FROM narration.credit_logs
  WHERE id = p_log_id 
    AND type = 'consume'
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 退还积分
  UPDATE narration.user_credits
  SET balance = balance + v_credits,
      updated_at = now()
  WHERE user_id = v_user_id;

  -- 更新日志状态
  UPDATE narration.credit_logs
  SET status = 'refunded',
      metadata = COALESCE(metadata, '{}'::jsonb) || 
                 jsonb_build_object('refund_reason', p_reason),
      updated_at = now()
  WHERE id = p_log_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3.4 添加积分（充值或调整）
-- =============================================
CREATE OR REPLACE FUNCTION narration.add_credits(
  p_user_id bigint,
  p_credits integer,
  p_type text,
  p_ref_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_extend_expiry boolean DEFAULT TRUE,
  p_payment_time timestamptz DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_clerk_user_id text;
  v_current_expires_at timestamptz;
  v_existing_log_id bigint;
  v_base_time timestamptz;
BEGIN
  -- 首先检查是否已存在相同的 ref_id（幂等性检查）
  IF p_ref_id IS NOT NULL THEN
    SELECT id INTO v_existing_log_id
    FROM narration.credit_logs
    WHERE type = p_type AND ref_id = p_ref_id
    LIMIT 1;
    
    -- 如果已存在，直接返回成功（幂等性）
    IF FOUND THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- 获取用户信息（加锁）
  SELECT clerk_user_id, expires_at
  INTO v_clerk_user_id, v_current_expires_at
  FROM narration.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 先创建日志记录（防止并发情况下的重复处理）
  BEGIN
    INSERT INTO narration.credit_logs (
      user_id, clerk_user_id, type, status, credits, ref_id, metadata
    ) VALUES (
      p_user_id, v_clerk_user_id, p_type, 'confirmed', p_credits, p_ref_id, p_metadata
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- 如果违反唯一约束，说明已经处理过了（幂等性）
      RETURN TRUE;
  END;

  -- 确定用于计算到期时间的基准时间
  v_base_time := COALESCE(p_payment_time, now());

  -- 更新积分余额
  IF p_extend_expiry AND p_type = 'recharge' THEN
    UPDATE narration.user_credits
    SET balance = balance + p_credits,
        expires_at = GREATEST(
          COALESCE(expires_at, '-infinity'::timestamptz),
          v_base_time + INTERVAL '365 days'
        ),
        updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE narration.user_credits
    SET balance = balance + p_credits,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3.5 处理过期积分
-- =============================================
CREATE OR REPLACE FUNCTION narration.expire_credits() RETURNS void AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT user_id, clerk_user_id, balance
    FROM narration.user_credits
    WHERE expires_at IS NOT NULL 
      AND expires_at < now()
      AND balance > 0
    FOR UPDATE
  LOOP
    -- 清零余额
    UPDATE narration.user_credits
    SET balance = 0,
        expires_at = NULL,
        updated_at = now()
    WHERE user_id = rec.user_id;

    -- 创建过期日志
    INSERT INTO narration.credit_logs (
      user_id, clerk_user_id, type, status, credits, metadata
    ) VALUES (
      rec.user_id, rec.clerk_user_id, 'expire', 'confirmed', -rec.balance,
      jsonb_build_object('expired_at', now())
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3.6 获取用户积分统计
-- =============================================
CREATE OR REPLACE FUNCTION narration.get_user_credit_stats(p_user_id bigint)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'balance', uc.balance,
    'expires_at', uc.expires_at,
    'email', uc.email,
    'display_name', uc.display_name,
    'total_recharged', COALESCE(
      (SELECT SUM(credits) 
       FROM narration.credit_logs 
       WHERE user_id = p_user_id 
         AND type = 'recharge' 
         AND status = 'confirmed'), 0),
    'total_consumed', COALESCE(
      (SELECT SUM(ABS(credits)) 
       FROM narration.credit_logs 
       WHERE user_id = p_user_id 
         AND type = 'consume' 
         AND status = 'confirmed'), 0),
    'last_recharge', (
      SELECT jsonb_build_object(
        'amount', credits,
        'created_at', created_at
      )
      FROM narration.credit_logs
      WHERE user_id = p_user_id 
        AND type = 'recharge' 
        AND status = 'confirmed'
      ORDER BY created_at DESC
      LIMIT 1
    )
  ) INTO v_result
  FROM narration.user_credits uc
  WHERE uc.user_id = p_user_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. 视图
-- =============================================

-- 用户积分概览视图
CREATE OR REPLACE VIEW narration.user_credits_overview AS
SELECT 
  uc.user_id,
  uc.clerk_user_id,
  uc.email,
  uc.display_name,
  uc.balance,
  uc.expires_at,
  uc.updated_at as balance_updated_at,
  uc.created_at,
  uc.deleted_at,
  -- 订单统计
  (SELECT COUNT(*) 
   FROM narration.orders 
   WHERE user_id = uc.user_id AND state = 'paid') as paid_orders_count,
  (SELECT SUM(amount) 
   FROM narration.orders 
   WHERE user_id = uc.user_id AND state = 'paid') as total_paid_amount
FROM narration.user_credits uc;

-- =============================================
-- 5. 权限设置
-- =============================================

-- 授予表的权限给 service_role
GRANT ALL ON ALL TABLES IN SCHEMA narration TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA narration TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA narration TO service_role;

-- 授予RPC函数执行权限
GRANT EXECUTE ON FUNCTION narration.ensure_user_with_credits TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION narration.consume_credits TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION narration.refund_credits TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION narration.add_credits TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION narration.expire_credits TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION narration.get_user_credit_stats TO service_role, anon, authenticated;

-- =============================================
-- 6. 表和字段注释
-- =============================================

-- 表注释
COMMENT ON TABLE narration.user_credits IS '用户信息与积分表（合并后），存储用户基本信息和积分余额';
COMMENT ON TABLE narration.credit_logs IS '积分变动日志，记录所有积分操作';
COMMENT ON TABLE narration.orders IS '订单记录表，存储所有支付订单';
COMMENT ON TABLE narration.stripe_events IS 'Stripe Webhook事件记录表，记录所有收到的事件用于回溯和分析';
COMMENT ON TABLE narration.clerk_events IS 'Clerk Webhook事件记录表，记录所有收到的事件用于回溯和分析';
COMMENT ON TABLE narration.user_usage_history IS '用户使用记录表，记录所有AI图像描述的使用历史';
COMMENT ON TABLE narration.anon_usage IS '匿名用户使用记录，用于限免和风控';

-- 重要字段注释
COMMENT ON COLUMN narration.user_credits.user_id IS '用户唯一ID（自增主键）';
COMMENT ON COLUMN narration.user_credits.clerk_user_id IS 'Clerk用户ID，外部认证标识';
COMMENT ON COLUMN narration.user_credits.email IS '用户邮箱，唯一登录凭据';
COMMENT ON COLUMN narration.user_credits.display_name IS '用户显示名称';
COMMENT ON COLUMN narration.user_credits.balance IS '当前积分余额，不能为负数';
COMMENT ON COLUMN narration.user_credits.expires_at IS '积分到期时间，NULL表示永不过期';
COMMENT ON COLUMN narration.user_credits.deleted_at IS '软删除时间，NULL表示未删除';
COMMENT ON COLUMN narration.user_credits.created_at IS '用户注册时间';
COMMENT ON COLUMN narration.user_credits.updated_at IS '最近更新时间';

COMMENT ON COLUMN narration.credit_logs.type IS '变动类型：recharge充值/consume消费/expire过期';
COMMENT ON COLUMN narration.credit_logs.status IS '状态：pending待确认/confirmed已确认/refunded已退款';
COMMENT ON COLUMN narration.orders.state IS '订单状态：pending待支付/paid已支付/failed失败/disputed有争议';
COMMENT ON COLUMN narration.orders.paid_at IS '支付完成时间，来自 Stripe checkout.session.completed 事件';

COMMENT ON COLUMN narration.user_usage_history.status IS '记录状态：active=正常可见，deleted=逻辑删除';
COMMENT ON COLUMN narration.anon_usage.anon_id IS '匿名访客 ID，要求为 43 位 base64url 字符串';
COMMENT ON COLUMN narration.anon_usage.usage_count IS '已使用的免费次数，用于限制匿名使用';

-- Clerk events 字段注释
COMMENT ON COLUMN narration.clerk_events.event_id IS '消息ID，对应Dashboard中的MESSAGE ID，来自svix-id header';
COMMENT ON COLUMN narration.clerk_events.event_type IS '事件类型，对应Dashboard中的EVENT TYPE';
COMMENT ON COLUMN narration.clerk_events.event_data IS '完整的Clerk事件数据';
COMMENT ON COLUMN narration.clerk_events.clerk_user_id IS '相关的Clerk用户ID，从event_data中提取';
COMMENT ON COLUMN narration.clerk_events.event_timestamp IS '事件发生时间，从Clerk事件的occurred_at字段提取';
COMMENT ON COLUMN narration.clerk_events.created_at IS '我们接收并记录事件的时间';

-- 视图注释
COMMENT ON VIEW narration.user_credits_overview IS '用户积分概览，包含用户信息、余额和订单统计';

-- 函数注释
COMMENT ON FUNCTION narration.ensure_user_with_credits IS '确保用户存在于user_credits表中，简化版单表操作';
COMMENT ON FUNCTION narration.consume_credits IS '扣减用户积分，当余额归零时自动清空过期时间';
COMMENT ON FUNCTION narration.add_credits IS '添加积分，支持传入支付时间确保到期时间计算一致性';
COMMENT ON FUNCTION narration.refund_credits IS '退还积分到用户账户';
COMMENT ON FUNCTION narration.expire_credits IS '处理过期积分，将过期用户的余额清零';
COMMENT ON FUNCTION narration.get_user_credit_stats IS '获取用户积分统计信息，包含基本信息和使用统计';

-- =============================================
-- 7. 设置序列起始值
-- =============================================

-- 设置 user_credits 表主键从 10001 开始
ALTER SEQUENCE narration.user_credits_user_id_seq RESTART WITH 10001;

-- 设置 credit_logs 表主键从 1 开始  
ALTER SEQUENCE narration.credit_logs_id_seq RESTART WITH 1;

-- 设置 orders 表主键从 200001 开始
ALTER SEQUENCE narration.orders_order_id_seq RESTART WITH 200001;

-- 设置 user_usage_history 表主键从 1 开始
ALTER SEQUENCE narration.user_usage_history_id_seq RESTART WITH 1;

-- 设置 stripe_events 表主键从 1 开始
ALTER SEQUENCE narration.stripe_events_id_seq RESTART WITH 1;

-- =============================================
-- 8. 清理异常数据
-- =============================================

-- 清理余额为0但仍有过期时间的记录（如果有的话）
UPDATE narration.user_credits 
SET expires_at = NULL 
WHERE balance = 0 AND expires_at IS NOT NULL;

-- =============================================
-- 迁移完成提示
-- =============================================
-- 迁移成功后，请确保：
-- 1. 配置环境变量（SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY等）
-- 2. 在 Stripe Dashboard 创建对应的 Price ID
-- 3. 配置 Clerk 认证和 Webhook
-- 4. 设置定时任务处理过期积分（如需要）
-- 5. 测试所有用户创建、积分充值和消费功能
