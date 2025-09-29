import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { getUserIdByClerkId } from '@/lib/credits';
import { getTierByPriceId } from '@/lib/pricing';

export const runtime = 'nodejs';

// 订单创建重试函数
async function createOrderWithRetry(orderData: Record<string, unknown>, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await supabase.schema(process.env.SUPABASE_SCHEMA!).from('orders').insert(orderData);
    
    if (!error) {
      console.log(`Order created successfully on attempt ${attempt}`);
      return { success: true };
    }
    
    console.error(`Order creation attempt ${attempt} failed:`, error);
    
    // 如果不是最后一次尝试，等待1秒后重试
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.error(`Order creation failed after ${maxRetries} attempts`);
  return { success: false };
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Please sign in to continue' },
        { status: 401 }
      );
    }

    const user = await currentUser();
    // 多层次获取email策略
    const userEmail =
      user?.primaryEmailAddress?.emailAddress ||  // 优先使用主email
      user?.emailAddresses?.find(e => e.verification?.status === 'verified')?.emailAddress || // 其次使用已验证的email
      user?.emailAddresses?.[0]?.emailAddress ||  // 再次使用第一个email
      user?.externalAccounts?.find(acc => acc.emailAddress)?.emailAddress || // 最后尝试外部账户email
      null;
    const _displayName = user?.firstName 
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : user?.username || null;

    const { priceId } = await request.json();

    if (!priceId) {
      console.error('Missing priceId in checkout request');
      return NextResponse.json(
        { error: 'System busy. Please try again later.' },
        { status: 500 }
      );
    }

    const tier = getTierByPriceId(priceId);
    if (!tier) {
      console.error('Invalid priceId received:', priceId);
      return NextResponse.json(
        { error: 'System busy. Please try again later.' },
        { status: 500 }
      );
    }

    if (!userEmail) {
      console.error('Checkout requested without an email address for user', clerkUserId);
      return NextResponse.json(
        { error: 'Please add an email address to your account before purchasing.' },
        { status: 400 }
      );
    }

    // 获取用户ID（用户应该已经通过webhook或middleware创建）
    const userId = await getUserIdByClerkId(clerkUserId);
    
    if (!userId) {
      // 如果用户不存在，返回错误
      console.error(`[CHECKOUT] User ${clerkUserId} not found in database`);
      return NextResponse.json(
        { error: 'User not found. Please refresh and try again.' },
        { status: 403 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: userEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/pricing`,
      metadata: {
        userId: userId.toString(),
        clerkUserId,
        credits: tier.credits.toString(),
        tier: tier.tier,
        priceId: priceId,
      },
    });

    const orderData = {
      session_id: session.id,
      user_id: userId,
      clerk_user_id: clerkUserId,
      user_email: userEmail,
      price_id: priceId,
      price_tier: tier.tier,
      credits: tier.credits,
      amount: tier.amount,
      currency: tier.currency,
      state: 'pending',
      extra: {
        price_snapshot: tier,
        session_created_at: new Date().toISOString(),
        stripe_price_id: priceId,
      },
    };

    const orderResult = await createOrderWithRetry(orderData);
    if (!orderResult.success) {
      console.error('Failed to create order after retries');
      return NextResponse.json(
        { error: 'System busy. Please try again later.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'System busy. Please try again later.' },
      { status: 500 }
    );
  }
}
