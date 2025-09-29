-- =============================================
-- 移除 email 字段的唯一性约束
-- 创建日期: 2025-09-29
-- 说明: 用户唯一性应该由 clerk_user_id 保证，不是 email
-- =============================================

-- 移除 email 字段的 UNIQUE 约束
ALTER TABLE narration.user_credits DROP CONSTRAINT user_credits_email_key;

-- 移除相关的索引（如果存在独立的唯一索引）
DROP INDEX IF EXISTS narration.idx_user_credits_email;

-- 重新创建普通索引（用于查询性能）
CREATE INDEX idx_user_credits_email ON narration.user_credits(email);

-- 更新表注释
COMMENT ON COLUMN narration.user_credits.email IS '用户邮箱，由 Clerk 保证唯一性';