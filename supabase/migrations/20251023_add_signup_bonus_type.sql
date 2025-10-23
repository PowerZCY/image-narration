-- =============================================
-- 数据库架构修改
-- 创建日期: 2025-10-23
-- 说明:
--   1. 为注册赠送功能添加新的积分类型 signup_bonus
--   2. 修改 user_usage_history 表外键约束为 ON DELETE SET NULL
-- =============================================

-- =============================================
-- Part 1: 添加 signup_bonus 积分类型
-- =============================================

-- 修改 credit_logs 表的 type 约束,添加 signup_bonus
ALTER TABLE narration.credit_logs
DROP CONSTRAINT IF EXISTS credit_logs_type_check;

ALTER TABLE narration.credit_logs
ADD CONSTRAINT credit_logs_type_check
CHECK (type IN ('recharge', 'consume', 'expire', 'signup_bonus'));

-- 更新字段注释
COMMENT ON COLUMN narration.credit_logs.type IS '变动类型：recharge充值/consume消费/expire过期/signup_bonus注册赠送';

-- =============================================
-- Part 2: 修改 user_usage_history 表的外键约束
-- =============================================

-- 删除旧的外键约束
ALTER TABLE narration.user_usage_history
DROP CONSTRAINT IF EXISTS user_usage_history_user_id_fkey;

-- 添加新的外键约束（ON DELETE SET NULL）
ALTER TABLE narration.user_usage_history
ADD CONSTRAINT user_usage_history_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES narration.user_credits(user_id)
  ON DELETE SET NULL;

-- 删除旧的用户类型检查约束
ALTER TABLE narration.user_usage_history
DROP CONSTRAINT IF EXISTS usage_history_user_type_check;

-- 添加新的用户类型检查约束（支持已删除用户的历史记录）
ALTER TABLE narration.user_usage_history
ADD CONSTRAINT usage_history_user_type_check
CHECK (
  -- 情况1：正常的注册用户记录
  (user_id IS NOT NULL AND clerk_user_id IS NOT NULL AND anon_id IS NULL) OR
  -- 情况2：已删除用户的历史记录（user_id 被设为 NULL，但保留 clerk_user_id 用于追溯）
  (user_id IS NULL AND clerk_user_id IS NOT NULL AND anon_id IS NULL) OR
  -- 情况3：匿名用户记录
  (user_id IS NULL AND clerk_user_id IS NULL AND anon_id IS NOT NULL)
);

-- 更新字段注释
COMMENT ON COLUMN narration.user_usage_history.user_id IS
  '注册用户ID，物理删除用户后会变为 NULL（但保留 clerk_user_id 用于追溯）';

COMMENT ON COLUMN narration.user_usage_history.clerk_user_id IS
  'Clerk用户ID，即使 user_id 被设为 NULL 也会保留，用于审计和追溯';

-- =============================================
-- 修改说明
-- =============================================
--
-- 修改前：
--   - 外键约束：ON DELETE CASCADE（用户删除时，使用历史记录会被删除）
--   - CHECK 约束：要求注册用户的 user_id 和 clerk_user_id 必须都不为 NULL
--
-- 修改后：
--   - 外键约束：ON DELETE SET NULL（用户删除时，user_id 变为 NULL，但记录保留）
--   - CHECK 约束：允许 user_id = NULL 且 clerk_user_id 有值（已删除用户的历史记录）
--
-- 业务影响：
--   - 软删除（UPDATE deleted_at）：不受影响，记录完全保留
--   - 物理删除（DELETE）：使用历史记录会保留，user_id 变为 NULL，clerk_user_id 保留
--   - 查询建议：通过 clerk_user_id 而不是 user_id 查询已删除用户的历史记录
--
-- 示例查询：
--   -- 查询某用户的所有历史记录（包括已删除用户）
--   SELECT * FROM narration.user_usage_history
--   WHERE clerk_user_id = 'user_2xxx'
--   ORDER BY created_at DESC;
--
--   -- 查询已删除用户的孤儿记录
--   SELECT * FROM narration.user_usage_history
--   WHERE user_id IS NULL AND clerk_user_id IS NOT NULL;
