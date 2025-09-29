import { supabase } from './supabase';

export interface UserCreditInfo {
  userId: number;
  clerkUserId: string;
  balance: number;
  expiresAt: string | null;
  email: string;
  displayName: string | null;
}

export interface ConsumeResult {
  success: boolean;
  logId?: number;
  remainingBalance?: number;
  error?: string;
}

// 获取用户ID（不创建）
// 如果用户不存在返回null，存在则返回用户ID
export async function getUserIdByClerkId(clerkUserId: string): Promise<number | null> {
  const { data: existingUser, error } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .from('user_credits')
    .select('user_id')
    .eq('clerk_user_id', clerkUserId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // 用户不存在
    }
    throw new Error(`Failed to get user: ${error.message}`);
  }

  return existingUser.user_id;
}

export async function getUserCredits(userId: number): Promise<UserCreditInfo | null> {
  const { data, error } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .from('user_credits')
    .select('user_id, clerk_user_id, email, display_name, balance, expires_at')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get user credits: ${error.message}`);
  }

  return {
    userId: data.user_id,
    clerkUserId: data.clerk_user_id,
    balance: data.balance || 0,
    expiresAt: data.expires_at,
    email: data.email,
    displayName: data.display_name,
  };
}

export async function consumeCredits(
  userId: number,
  credits: number,
  refId?: string
): Promise<ConsumeResult> {
  if (credits <= 0) {
    return { success: false, error: 'Invalid credits amount' };
  }

  const { data, error } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .rpc('consume_credits', {
      p_user_id: userId,
      p_credits: credits,
      p_ref_id: refId || null,
    });

  if (error) {
    if (error.message.includes('Insufficient credits') || error.message.includes('Credits expired')) {
      return { success: false, error: error.message };
    }
    throw new Error(`Failed to consume credits: ${error.message}`);
  }

  const { data: creditsData } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .single();

  return {
    success: true,
    logId: data.log_id,
    remainingBalance: creditsData?.balance || 0,
  };
}

export async function refundCredits(logId: number, reason?: string): Promise<boolean> {
  const { data: log, error: logError } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .from('credit_logs')
    .select('*')
    .eq('id', logId)
    .eq('type', 'consume')
    .eq('status', 'pending')
    .single();

  if (logError || !log) {
    return false;
  }

  const { error } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .rpc('refund_credits', {
      p_log_id: logId,
      p_reason: reason || 'AI service error',
    });

  return !error;
}

export async function confirmConsumption(logId: number): Promise<boolean> {
  const { error } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .from('credit_logs')
    .update({
      status: 'confirmed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', logId)
    .eq('status', 'pending');

  return !error;
}

export async function addCredits(
  userId: number,
  credits: number,
  type: 'recharge',
  refId?: string,
  metadata?: Record<string, unknown>,
  paymentTime?: string
): Promise<boolean> {
  const { error } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .rpc('add_credits', {
      p_user_id: userId,
      p_credits: credits,
      p_type: type,
      p_ref_id: refId || null,
      p_metadata: metadata || null,
      p_payment_time: paymentTime || null,
    });

  return !error;
}

export async function checkCreditExpiration(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .from('user_credits')
    .select('expires_at')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return true;
  }

  if (!data.expires_at) {
    return false;
  }

  return new Date(data.expires_at) < new Date();
}