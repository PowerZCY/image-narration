import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { validateWebhookSignature } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { addCredits } from '@/lib/credits';
import { pricingTiers } from '@/lib/pricing';
import Stripe from 'stripe';

export const runtime = 'nodejs';


async function logSecurityAlert(alert: Record<string, unknown>) {
  console.error('[SECURITY ALERT]', alert);
  // TODO: 发送到监控系统或Sentry
}

type SanitizedStripeEvent = Record<string, unknown> & {
  data?: {
    object?: (Record<string, unknown> & {
      client_secret?: string;
    }) | null;
  };
};

function jsonSafeReplacer(_: string, value: unknown) {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Buffer) {
    return value.toString('base64');
  }

  return value;
}

function sanitizeStripeEvent(event: Stripe.Event): SanitizedStripeEvent {
  try {
    const jsonString = JSON.stringify(event, jsonSafeReplacer);

    if (!jsonString) {
      throw new Error('Empty JSON string when sanitizing event');
    }

    return JSON.parse(jsonString) as SanitizedStripeEvent;
  } catch (error) {
    console.warn('[WEBHOOK] Failed to fully sanitize event, falling back to summary:', error);
    return {
      id: event.id,
      type: event.type,
      api_version: event.api_version,
      created: event.created,
      livemode: event.livemode,
      object: event.object,
    } satisfies SanitizedStripeEvent;
  }
}

function mergeExtra(
  extra: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
) {
  return {
    ...(extra && typeof extra === 'object' ? extra : {}),
    ...patch,
  };
}

async function reconstructOrderFromSession(session: Stripe.Checkout.Session, eventCreated: number): Promise<boolean> {
  console.log('[ORDER RECONSTRUCTION] Attempting to reconstruct order for session:', session.id);
  
  // 1. 从session.metadata中获取用户和价格信息
  const userId = session.metadata?.userId;
  const clerkUserId = session.metadata?.clerkUserId;
  const credits = session.metadata?.credits;
  const tier = session.metadata?.tier;
  const priceId = session.metadata?.priceId;
  
  if (!userId || !clerkUserId || !credits || !tier) {
    console.error('[ORDER RECONSTRUCTION] Missing required metadata:', { 
      sessionId: session.id,
      hasUserId: !!userId,
      hasClerkUserId: !!clerkUserId,
      hasCredits: !!credits,
      hasTier: !!tier 
    });
    throw new Error(`Missing required metadata in session ${session.id}`);
  }
  
  // 2. 从session中获取支付信息
  const amount = (session.amount_total || 0) / 100;
  const currency = session.currency || 'usd';
  // Webhook场景特殊：优先使用Stripe传来的email
  // 如果没有email，使用特殊标记表明这是webhook重建的订单
  const userEmail = session.customer_email || `webhook-reconstructed-${clerkUserId}@system`;
  
  if (!session.customer_email) {
    console.warn('[ORDER RECONSTRUCTION] No customer_email in session, using system placeholder:', session.id);
  }
  
  // 3. 如果没有priceId，尝试从credits反推
  let finalPriceId = priceId;
  if (!finalPriceId) {
    const tierMatch = pricingTiers.find(t => t.credits.toString() === credits);
    finalPriceId = tierMatch?.priceId || 'unknown';
  }
  
  // 4. 创建订单记录
  const orderData = {
    session_id: session.id,
    user_id: parseInt(userId),
    clerk_user_id: clerkUserId,
    user_email: userEmail,
    price_id: finalPriceId,
    price_tier: tier,
    credits: parseInt(credits),
    amount,
    currency,
    state: 'pending',
    extra: {
      reconstructed: true,
      reconstruction_reason: 'missing_order_record',
      reconstruction_time: new Date().toISOString(),
      original_session_data: {
        id: session.id,
        payment_status: session.payment_status,
        mode: session.mode,
        customer_email: session.customer_email,
        metadata: session.metadata,
      },
      event_created_time: new Date(eventCreated * 1000).toISOString(),
    },
  };
  
  const { error } = await supabase.schema(process.env.SUPABASE_SCHEMA!).from('orders').insert(orderData);
  
  if (error) {
    // 检查是否是UNIQUE约束违反（说明订单已存在）
    if (error.code === '23505' && error.message?.includes('session_id')) {
      console.log('[ORDER RECONSTRUCTION] Order already exists for session (concurrent creation):', session.id);
      return true; // 订单已存在，视为成功
    }
    
    // 其他错误才抛出
    console.error('[ORDER RECONSTRUCTION] Failed to insert order:', error);
    throw new Error(`Failed to insert reconstructed order: ${error.message}`);
  }
  
  console.log('[ORDER RECONSTRUCTION] Order reconstructed successfully:', {
    sessionId: session.id,
    userId,
    clerkUserId,
    amount,
    credits,
  });
  
  return true;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventCreated: number) {
  console.log('[CHECKOUT] Processing checkout.session.completed for:', session.id);
  
  // 1. 尝试查找现有订单
  const { data: initialOrder, error: fetchError } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .from('orders')
    .select('*')
    .eq('session_id', session.id)
    .single();
  
  let order = initialOrder;

  // 2. 如果订单不存在，尝试重建
  if (fetchError || !order) {
    console.log('[CHECKOUT] Order not found, attempting reconstruction for session:', session.id);
    
    try {
      const reconstructed = await reconstructOrderFromSession(session, eventCreated);
      
      if (reconstructed) {
        // 重新查询重建的订单
        const { data: reconstructedOrder, error: refetchError } = await supabase
          .schema(process.env.SUPABASE_SCHEMA!)
          .from('orders')
          .select('*')
          .eq('session_id', session.id)
          .single();
          
        if (refetchError || !reconstructedOrder) {
          console.error('[CHECKOUT] Failed to fetch reconstructed order:', refetchError);
          return { success: false, error: 'Order reconstruction failed' };
        }
        
        order = reconstructedOrder;
        console.log('[CHECKOUT] Using reconstructed order for session:', session.id);
      }
    } catch (error) {
      console.error('[CHECKOUT] Failed to reconstruct order:', error);
      return { success: false, error: 'Order reconstruction failed' };
    }
  }

  // 3. 检查订单是否已支付（幂等性检查）
  if (order.state === 'paid') {
    console.log('[CHECKOUT] Order already paid, skipping (idempotent):', session.id);
    return { success: true, message: 'Already processed', idempotent: true };
  }
  
  // 4. 检查订单状态是否为pending
  if (order.state !== 'pending') {
    console.warn('[CHECKOUT] Order in unexpected state:', { 
      sessionId: session.id, 
      state: order.state 
    });
    return { success: false, error: `Order in unexpected state: ${order.state}` };
  }

  // 1. 验证支付状态
  if (session.payment_status !== 'paid') {
    await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('orders')
      .update({
        state: 'failed',
        extra: mergeExtra(order.extra, {
          reason: 'payment_not_completed',
          payment_status: session.payment_status,
        }),
      })
      .eq('session_id', session.id);

    return { success: false, error: 'Payment not completed' };
  }

  // 2. 验证金额是否匹配（关键安全步骤）
  const expectedAmountCents = Math.round(order.amount * 100);
  if (session.amount_total !== expectedAmountCents) {
    await logSecurityAlert({
      type: 'amount_mismatch',
      orderId: order.session_id,
      sessionId: session.id,
      expected: order.amount,
      received: (session.amount_total || 0) / 100,
      currency: session.currency,
    });

    await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('orders')
      .update({
        state: 'disputed',
        extra: mergeExtra(order.extra, {
          amount_mismatch: true,
          expected_amount: order.amount,
          received_amount: (session.amount_total || 0) / 100,
          payment_status: session.payment_status,
        }),
      })
      .eq('session_id', session.id);

    return { success: false, error: 'Amount mismatch detected' };
  }

  // 3. 验证货币是否匹配
  if (session.currency !== order.currency.toLowerCase()) {
    await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('orders')
      .update({
        state: 'disputed',
        extra: mergeExtra(order.extra, {
          currency_mismatch: true,
          expected_currency: order.currency,
          received_currency: session.currency,
        }),
      })
      .eq('session_id', session.id);

    return { success: false, error: 'Currency mismatch' };
  }

  // 5. 开始处理支付：使用条件更新保证幂等性
  const paymentTime = new Date(eventCreated * 1000).toISOString();
  
  try {
    // 使用条件更新：只有pending状态才能转为paid
    const { data: updatedOrder, error: updateError } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('orders')
      .update({
        state: 'paid',
        paid_at: paymentTime,
        extra: mergeExtra(order.extra, {
          payment_intent: session.payment_intent,
          customer_email: session.customer_email,
          payment_method_types: session.payment_method_types,
        }),
      })
      .eq('session_id', session.id)
      .eq('state', 'pending')  // 关键：条件更新，保证幂等性
      .select()
      .single();

    // 如果更新失败或没有更新任何记录
    if (updateError || !updatedOrder) {
      // 再次检查订单状态，可能是并发更新
      const { data: currentOrder } = await supabase
        .from('orders')
        .select('state')
        .eq('session_id', session.id)
        .single();
      
      if (currentOrder?.state === 'paid') {
        console.log('[CHECKOUT] Order already paid by concurrent request:', session.id);
        return { success: true, message: 'Already processed', concurrent: true };
      }
      
      throw new Error(`Failed to update order: ${updateError?.message || 'No rows updated'}`);
    }
    
    console.log('[CHECKOUT] Order marked as paid:', session.id);

    // 6. 发放积分（credit_logs的唯一索引提供第二层保护）
    const success = await addCredits(
      order.user_id,
      order.credits,
      'recharge',
      session.id,  // 使用session.id作为ref_id，利用唯一索引防止重复
      {
        stripe_session_id: session.id,
        payment_intent: session.payment_intent,
        tier: order.price_tier,
        amount: order.amount,
        currency: order.currency,
      },
      paymentTime
    );

    if (!success) {
      // 积分添加失败可能是因为ref_id冲突（已经添加过）
      console.warn('[CHECKOUT] Credits may have been already added:', session.id);
      // 不抛出错误，因为这可能是幂等操作
      return { success: true, message: 'Credits already added', idempotent: true };
    }

    console.log('[CHECKOUT] Successfully processed payment:', {
      sessionId: session.id,
      userId: order.user_id,
      credits: order.credits,
      amount: order.amount
    });

    return { success: true };
  } catch (error) {
    console.error('[CHECKOUT] Transaction failed:', error);
    
    // 不要轻易将订单标记为failed，因为可能是暂时性错误
    // 只记录错误信息，让Stripe重试
    await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('orders')
      .update({
        extra: mergeExtra(order.extra, {
          last_error: error instanceof Error ? error.message : 'Unknown error',
          last_error_at: new Date().toISOString(),
          retry_count: (order.extra?.retry_count || 0) + 1,
        }),
      })
      .eq('session_id', session.id)
      .eq('state', 'pending'); // 只更新pending状态的订单

    return { success: false, error: 'Failed to process payment' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const sig = (await headers()).get('stripe-signature');

    if (!sig) {
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      );
    }

    let event: Stripe.Event;
    
    try {
      event = validateWebhookSignature(body, sig);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }


    // 记录所有收到的事件（不做去重，记录所有事件用于回溯）
    // 过滤敏感信息后存储
    try {
      // 深拷贝事件数据并移除敏感信息
      const sanitizedEventData = sanitizeStripeEvent(event);
      
      // 如果是 PaymentIntent 相关事件，移除 client_secret
      if (sanitizedEventData.data?.object?.client_secret) {
        delete sanitizedEventData.data.object.client_secret;
      }
      
      const { error: insertError } = await supabase.schema(process.env.SUPABASE_SCHEMA!).from('stripe_events').insert({
        event_id: event.id,
        event_name: event.type,
        event_data: sanitizedEventData,
        event_created_at: new Date(event.created * 1000).toISOString(),
      });

      if (insertError) {
        throw insertError;
      }
      console.log('[WEBHOOK] Event recorded (sanitized):', event.id, event.type);
    } catch (error) {
      // 记录失败不影响事件处理，仅打印警告
      console.warn('[WEBHOOK] Failed to record event:', error);
    }

    // 处理不同类型的事件
    // 注：幂等性由业务表的唯一约束和状态机保证
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const result = await handleCheckoutCompleted(session, event.created);
        
        if (!result.success) {
          console.error('[WEBHOOK] Failed to handle checkout:', result.error);
          // 返回500让Stripe重试
          return NextResponse.json(
            { error: result.error },
            { status: 500 }
          );
        }
        
        if (result.idempotent || result.concurrent) {
          console.log('[WEBHOOK] Checkout handled (idempotent/concurrent):', session.id);
        } else {
          console.log('[WEBHOOK] Checkout successfully processed:', session.id);
        }
        break;
      }

      case 'payment_intent.requires_action': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('Payment requires action:', paymentIntent.id);
        // 事件已记录在 stripe_events 表中，无需额外处理
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('Payment failed:', paymentIntent.id);
        // 事件已记录在 stripe_events 表中，无需额外处理
        // 不更新orders表，保持pending状态让用户可以重试
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        console.error('Dispute created:', dispute.id);
        await logSecurityAlert({
          type: 'dispute_created',
          disputeId: dispute.id,
          amount: dispute.amount / 100,
          currency: dispute.currency,
          reason: dispute.reason,
        });
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
