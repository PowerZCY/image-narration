import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json(
        { 
          loggedIn: false,
          balance: 0,
          error: 'Not authenticated' 
        },
        { status: 401 }
      );
    }

    // 直接从user_credits表查询用户信息
    const { data: userCredits } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_credits')
      .select('user_id, email, display_name, balance, expires_at')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (!userCredits) {
      // 用户不存在，返回默认值
      // 用户应该通过Clerk webhook或middleware创建
      console.warn(`[USER_CREDITS] User ${clerkUserId} not found in database`);
      return NextResponse.json({
        loggedIn: true,
        clerkUserId,
        balance: 0,
        expiresAt: null,
        error: 'User not found in database'
      });
    }

    return NextResponse.json({
      loggedIn: true,
      userId: userCredits.user_id,
      clerkUserId,
      balance: userCredits.balance || 0,
      expiresAt: userCredits.expires_at,
      email: userCredits.email,
      displayName: userCredits.display_name,
    });
  } catch (error) {
    console.error('Error fetching user credits:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}