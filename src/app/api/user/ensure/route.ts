import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

// 这个端点用于确保用户在数据库中存在
// 主要用于处理Webhook可能失败的情况
export async function POST(_request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // 检查用户是否已存在
    const { data: existingUser } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_credits')
      .select('user_id')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (existingUser) {
      return NextResponse.json({
        success: true,
        userId: existingUser.user_id,
        message: 'User already exists'
      });
    }

    // 获取Clerk用户信息
    const user = await currentUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Failed to get user information' },
        { status: 500 }
      );
    }

    const email = user.emailAddresses?.[0]?.emailAddress;
    const displayName = user.firstName || user.lastName
      ? [user.firstName, user.lastName].filter(Boolean).join(' ')
      : user.username || null;

    if (!email) {
      return NextResponse.json(
        { error: 'No email address found' },
        { status: 400 }
      );
    }

    // 直接在user_credits表中创建用户（包含积分信息）
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
      if (userError.code === '23505') {
        // 并发创建，用户已存在
        const { data: newUser } = await supabase
          .schema(process.env.SUPABASE_SCHEMA!)
          .from('user_credits')
          .select('user_id')
          .eq('clerk_user_id', clerkUserId)
          .single();
        
        return NextResponse.json({
          success: true,
          userId: newUser?.user_id,
          message: 'User exists (concurrent creation)'
        });
      }
      throw userError;
    }

    console.log(`[USER_ENSURE] Created user ${clerkUserId} with ID ${userData.user_id}`);

    return NextResponse.json({
      success: true,
      userId: userData.user_id,
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('[USER_ENSURE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to ensure user exists' },
      { status: 500 }
    );
  }
}