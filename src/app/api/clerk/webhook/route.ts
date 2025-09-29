import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { WebhookEvent } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

interface WebhookResult {
  success: boolean;
  message?: string;
  error?: string;
  userId?: number;
  idempotent?: boolean;
  concurrent?: boolean;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUserCreated(data: any): Promise<WebhookResult> {
  const clerkUserId = data.id;
  const email = data.email_addresses?.[0]?.email_address;
  const displayName = data.first_name || data.last_name
    ? [data.first_name, data.last_name].filter(Boolean).join(' ')
    : data.username || null;

  console.log(`[CLERK_WEBHOOK] Processing user.created for ${clerkUserId}`);
  
  if (!email) {
    console.warn(`[CLERK_WEBHOOK] User ${clerkUserId} created without email`);
    return { success: false, error: 'No email found' };
  }

  try {
    // 直接在user_credits表中创建用户记录（包含积分信息）
    const { data: userData, error: userError } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_credits')
      .insert({
        clerk_user_id: clerkUserId,
        email,
        display_name: displayName,
        balance: 0,
      })
      .select('user_id')
      .single();

    if (userError) {
      // 如果是重复键错误，说明用户已存在
      if (userError.code === '23505') {
        console.log(`[CLERK_WEBHOOK] User ${clerkUserId} already exists`);
        return { success: true, message: 'User already exists', idempotent: true };
      }
      throw userError;
    }

    console.log(`[CLERK_WEBHOOK] Successfully created user ${clerkUserId} with ID ${userData.user_id}`);
    return { success: true, userId: userData.user_id };
  } catch (error) {
    console.error('[CLERK_WEBHOOK] Failed to create user:', error);
    return { success: false, error: 'Failed to create user' };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUserUpdated(data: any): Promise<WebhookResult> {
  const clerkUserId = data.id;
  const email = data.email_addresses?.[0]?.email_address;
  const displayName = data.first_name || data.last_name
    ? [data.first_name, data.last_name].filter(Boolean).join(' ')
    : data.username || null;

  console.log(`[CLERK_WEBHOOK] Processing user.updated for ${clerkUserId}`);
  
  if (!email) {
    console.warn(`[CLERK_WEBHOOK] User ${clerkUserId} updated without email`);
    return { success: false, error: 'No email found' };
  }

  try {
    // 更新user_credits表中的用户信息
    const { error } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_credits')
      .update({
        email,
        display_name: displayName,
      })
      .eq('clerk_user_id', clerkUserId);

    if (error) {
      // 如果用户不存在，创建新用户
      if (error.code === 'PGRST116') {
        console.log(`[CLERK_WEBHOOK] User ${clerkUserId} not found, creating new user`);
        return await handleUserCreated(data);
      }
      throw error;
    }

    console.log(`[CLERK_WEBHOOK] Successfully updated user ${clerkUserId}`);
    return { success: true };
  } catch (error) {
    console.error('[CLERK WEBHOOK] Failed to update user:', error);
    return { success: false, error: 'Failed to update user' };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUserDeleted(data: any): Promise<WebhookResult> {
  const clerkUserId = data.id;
  
  console.log(`[CLERK_WEBHOOK] Processing user.deleted for ${clerkUserId}`);
  
  try {
    // 软删除用户：只设置deleted_at时间戳，保留原始数据
    const { data: deletedUser, error } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_credits')
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq('clerk_user_id', clerkUserId)
      .select('user_id')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.warn(`[CLERK_WEBHOOK] User ${clerkUserId} not found for deletion`);
        return { success: true, message: 'User not found', idempotent: true };
      }
      throw error;
    }

    console.log(`[CLERK_WEBHOOK] Successfully soft-deleted user ${clerkUserId} (ID: ${deletedUser?.user_id})`);
    return { success: true, message: 'User soft-deleted successfully' };
    
  } catch (error) {
    console.error('[CLERK_WEBHOOK] Failed to delete user:', error);
    return { success: false, error: 'Failed to delete user' };
  }
}

export async function POST(req: NextRequest) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('[CLERK_WEBHOOK] Missing CLERK_WEBHOOK_SECRET environment variable');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  try {
    // 获取headers
    const headerPayload = await headers();
    const svix_id = headerPayload.get("svix-id");
    const svix_timestamp = headerPayload.get("svix-timestamp");
    const svix_signature = headerPayload.get("svix-signature");

    // 验证必需的headers
    if (!svix_id || !svix_timestamp || !svix_signature) {
      return NextResponse.json(
        { error: 'Missing required headers' },
        { status: 400 }
      );
    }

    // 获取请求body
    const payload = await req.json();
    const body = JSON.stringify(payload);

    // 创建Svix实例并验证签名
    const wh = new Webhook(WEBHOOK_SECRET);
    let evt: WebhookEvent;

    try {
      evt = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      }) as WebhookEvent;
    } catch (err) {
      console.error('[CLERK_WEBHOOK] Signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // 处理不同类型的事件
    const { type, data } = evt;
    console.log(`[CLERK_WEBHOOK] Received event type: ${type}`);

    // 保存事件到数据库用于审计和回溯
    try {
      // 保存事件记录
      /* eslint-disable @typescript-eslint/no-explicit-any */
      await supabase.schema(process.env.SUPABASE_SCHEMA!).from('clerk_events').insert({
        event_id: svix_id,                           // MESSAGE ID (Dashboard中显示的)
        event_type: type,                            // EVENT TYPE
        event_data: evt,                             // 完整事件数据
        clerk_user_id: data?.id || null,             // 用户ID（如果有）
        // 使用evt.timestamp作为事件发生时间
        event_timestamp: (evt as any).timestamp
          ? new Date((evt as any).timestamp * 1000).toISOString()  // Unix timestamp转ISO
          : null
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */
      
      console.log(`[CLERK_WEBHOOK] Event ${type} saved to database`);
    } catch (error) {
      // 记录失败不应阻断webhook处理
      console.error('[CLERK_WEBHOOK] Failed to save event to database:', error);
    }

    let result;
    switch (type) {
      case 'user.created':
        result = await handleUserCreated(data);
        break;
      
      case 'user.updated':
        result = await handleUserUpdated(data);
        break;
      
      case 'user.deleted':
        result = await handleUserDeleted(data);
        break;
      
      default:
        console.log(`[CLERK_WEBHOOK] Unhandled event type: ${type}`);
        return NextResponse.json({ success: true });
    }

    if (!result.success) {
      console.error(`[CLERK_WEBHOOK] Failed to handle ${type}:`, result.error);
      // 返回500让Clerk重试
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[CLERK_WEBHOOK] Error processing webhook:`, error);
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}