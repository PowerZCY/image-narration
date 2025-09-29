import { supabase, type Database } from './supabase';

type UsageHistoryInsert = Database['public']['Tables']['user_usage_history']['Insert'];
type UsageHistoryRow = Database['public']['Tables']['user_usage_history']['Row'];

export interface SaveUsageParams {
  userId?: number;
  clerkUserId?: string;
  anonId?: string;
  imageUrl: string;
  userPrompt?: string;
  aiNarration: string;
  requestId?: string;
}

export interface GetUsageHistoryParams {
  clerkUserId: string;
  limit?: number;
  offset?: number;
}

export interface UsageHistoryResponse {
  success: boolean;
  data?: UsageHistoryRow[];
  total?: number;
  error?: string;
}

export interface DeleteUsageParams {
  recordId: number;
  clerkUserId: string;
}

export interface DeleteUsageResponse {
  success: boolean;
  error?: string;
}

/**
 * 保存用户使用记录到数据库
 */
export async function saveUsageHistory(params: SaveUsageParams): Promise<{ success: boolean; error?: string; id?: number }> {
  try {
    const {
      userId,
      clerkUserId,
      anonId,
      imageUrl,
      userPrompt,
      aiNarration,
      requestId
    } = params;

    // 验证必需参数
    if (!imageUrl || !aiNarration) {
      return { success: false, error: 'imageUrl and aiNarration are required' };
    }

    // 验证用户身份：要么是注册用户，要么是匿名用户
    const isRegisteredUser = userId && clerkUserId;
    const isAnonymousUser = anonId && !userId && !clerkUserId;

    if (!isRegisteredUser && !isAnonymousUser) {
      return { success: false, error: 'Invalid user identity: must be either registered or anonymous user' };
    }

    // 限制 prompt 长度
    if (userPrompt && userPrompt.length > 2000) {
      return { success: false, error: 'User prompt is too long (max 2000 characters)' };
    }

    const insertData: UsageHistoryInsert = {
      user_id: userId || null,
      clerk_user_id: clerkUserId || null,
      anon_id: anonId || null,
      image_url: imageUrl,
      user_prompt: userPrompt || null,
      ai_narration: aiNarration,
      request_id: requestId || null,
    };

    const { data, error } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_usage_history')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      console.error('[UsageHistory] Failed to save usage history:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (error) {
    console.error('[UsageHistory] Exception in saveUsageHistory:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

/**
 * 获取注册用户的使用记录
 * 只有登录用户可以查看自己的记录
 */
export async function getUserUsageHistory(params: GetUsageHistoryParams): Promise<UsageHistoryResponse> {
  try {
    const { clerkUserId, limit = 20, offset = 0 } = params;

    if (!clerkUserId) {
      return { success: false, error: 'clerkUserId is required' };
    }

    // 构建查询，只查询注册用户的活跃记录
    let query = supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_usage_history')
      .select('*')
      .eq('clerk_user_id', clerkUserId)
      .eq('status', 'active') // 只查询未删除的记录
      .is('anon_id', null) // 确保只查询注册用户的记录
      .order('created_at', { ascending: false });

    // 添加分页
    if (limit > 0) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[UsageHistory] Failed to get usage history:', error);
      return { success: false, error: error.message };
    }

    // 获取总数用于分页，只计算活跃记录
    const { count } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_usage_history')
      .select('*', { count: 'exact', head: true })
      .eq('clerk_user_id', clerkUserId)
      .eq('status', 'active') // 只计算未删除的记录
      .is('anon_id', null);

    return {
      success: true,
      data: data || [],
      total: count || 0
    };
  } catch (error) {
    console.error('[UsageHistory] Exception in getUserUsageHistory:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

/**
 * 根据 request_id 检查是否已存在记录（防重复）
 */
export async function checkUsageHistoryExists(requestId: string): Promise<{ exists: boolean; id?: number }> {
  try {
    if (!requestId) {
      return { exists: false };
    }

    const { data, error } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_usage_history')
      .select('id')
      .eq('request_id', requestId)
      .maybeSingle();

    if (error) {
      console.error('[UsageHistory] Failed to check usage history existence:', error);
      return { exists: false };
    }

    return {
      exists: !!data,
      id: data?.id
    };
  } catch (error) {
    console.error('[UsageHistory] Exception in checkUsageHistoryExists:', error);
    return { exists: false };
  }
}

/**
 * 逻辑删除用户使用记录
 * 只有记录所有者才能删除自己的记录
 */
export async function deleteUsageHistory(params: DeleteUsageParams): Promise<DeleteUsageResponse> {
  try {
    const { recordId, clerkUserId } = params;

    // 验证参数
    if (!recordId || recordId <= 0) {
      return { success: false, error: 'Invalid record ID' };
    }

    if (!clerkUserId) {
      return { success: false, error: 'User ID is required' };
    }

    console.log('[UsageHistory] Attempting to delete usage history record:', {
      recordId,
      clerkUserId
    });

    // 首先验证记录存在且属于当前用户且状态为活跃
    const { data: existingRecord, error: checkError } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_usage_history')
      .select('id, clerk_user_id, status')
      .eq('id', recordId)
      .eq('clerk_user_id', clerkUserId)
      .eq('status', 'active')
      .maybeSingle();

    if (checkError) {
      console.error('[UsageHistory] Failed to check record ownership:', checkError);
      return { success: false, error: 'Failed to verify record ownership' };
    }

    if (!existingRecord) {
      return { success: false, error: 'Record not found or permission denied' };
    }

    // 执行逻辑删除：更新状态为 'deleted'
    const { error: updateError } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_usage_history')
      .update({ 
        status: 'deleted',
        updated_at: new Date().toISOString()
      })
      .eq('id', recordId)
      .eq('clerk_user_id', clerkUserId); // 双重验证，确保安全

    if (updateError) {
      console.error('[UsageHistory] Failed to delete usage history record:', updateError);
      return { success: false, error: updateError.message };
    }

    console.log('[UsageHistory] Successfully deleted usage history record:', recordId);
    return { success: true };

  } catch (error) {
    console.error('[UsageHistory] Exception in deleteUsageHistory:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}