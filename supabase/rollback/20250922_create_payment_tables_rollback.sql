-- =============================================
-- 回滚脚本：删除支付与积分系统相关表
-- 警告：执行此脚本将删除所有数据！
-- =============================================

-- 删除视图
DROP VIEW IF EXISTS user_credits_overview CASCADE;

-- 删除触发器（仅当表存在时）
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_users_updated_at ON public.users';
  END IF;
  IF to_regclass('public.user_credits') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_user_credits_updated_at ON public.user_credits';
  END IF;
  IF to_regclass('public.credit_logs') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_credit_logs_updated_at ON public.credit_logs';
  END IF;
  IF to_regclass('public.orders') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders';
  END IF;
  IF to_regclass('public.anon_usage') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_anon_usage_updated_at ON public.anon_usage';
  END IF;
END;
$$;

-- 删除触发器函数
DROP FUNCTION IF EXISTS update_updated_at_column();

-- 删除表（按依赖关系顺序）
DROP TABLE IF EXISTS anon_usage CASCADE; -- 同时移除 anon_id base64url 格式约束
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS stripe_events CASCADE;
DROP TABLE IF EXISTS credit_logs CASCADE;
DROP TABLE IF EXISTS user_credits CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 注意：uuid-ossp 扩展不删除，因为可能被其他表使用
