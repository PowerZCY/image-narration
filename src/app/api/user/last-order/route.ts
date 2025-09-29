import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

export async function GET(_request: NextRequest) {
  try {
    console.log('[DEBUG] SUPABASE_SCHEMA:', process.env.SUPABASE_SCHEMA);
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 获取最近一笔已支付订单
    const { data: order, error } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('orders')
      .select('session_id, price_id, credits, amount, currency, created_at, state')
      .eq('clerk_user_id', userId)
      .eq('state', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return NextResponse.json(null);
      }
      throw error;
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('Error fetching last order:', error);
    return NextResponse.json(
      { error: '获取订单信息失败' }, 
      { status: 500 }
    );
  }
}