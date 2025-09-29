import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getTierByPriceId, formatPrice } from '@/lib/pricing';

export async function GET(request: NextRequest) {
  try {
    // 检查用户认证
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 获取分页参数
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    // 查询用户订单总数
    const { count: totalCount, error: countError } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('clerk_user_id', clerkUserId)
      .eq('state', 'paid');

    if (countError) {
      console.error('Error counting orders:', countError);
      return NextResponse.json(
        { error: 'Failed to count orders' },
        { status: 500 }
      );
    }

    // 查询用户订单数据
    const { data: orders, error: ordersError } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('orders')
      .select('order_id, price_id, price_tier, credits, amount, currency, created_at')
      .eq('clerk_user_id', clerkUserId)
      .eq('state', 'paid')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
      return NextResponse.json(
        { error: 'Failed to fetch orders' },
        { status: 500 }
      );
    }

    // 格式化订单数据
    const formattedOrders = orders.map((order) => {
      // 尝试从price_tier获取商品名称，如果没有则通过price_id查找
      let productName = order.price_tier;
      if (!productName && order.price_id) {
        const tier = getTierByPriceId(order.price_id);
        productName = tier?.tier || 'Unknown';
      }

      return {
        orderId: order.order_id,
        productName: productName || 'Unknown',
        purchaseDate: order.created_at,
        amount: formatPrice(order.amount, order.currency),
        credits: order.credits,
      };
    });

    return NextResponse.json({
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit),
        hasMore: page * limit < (totalCount || 0),
      },
    });

  } catch (error) {
    console.error('Orders API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}