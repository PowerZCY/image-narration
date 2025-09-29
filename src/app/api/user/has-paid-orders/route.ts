import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 使用视图查询用户的付费订单数量
    const { data, error } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_credits_overview')
      .select('paid_orders_count')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 是 "not found" 错误，对于新用户是正常的
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Database query failed' },
        { status: 500 }
      );
    }

    // 如果用户不存在或没有付费记录，返回 false
    const hasPaidOrders = data?.paid_orders_count ? data.paid_orders_count > 0 : false;

    return NextResponse.json({ 
      hasPaidOrders 
    });
  } catch (error) {
    console.error('Has paid orders error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}