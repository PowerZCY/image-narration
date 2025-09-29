import { createHmac } from 'crypto';
import { cookies } from 'next/headers';
import { supabase } from './supabase';

const ANON_ID_COOKIE = 'anon_id';
const TRIAL_CREDITS = 1;
const MAX_FREE_USES = 1;

export interface AnonUsageInfo {
  anonId: string;
  remainingFree: number;
  usageCount: number;
}

function getIPSubnet(ip: string): string {
  if (ip.includes(':')) {
    return ip.split(':').slice(0, 4).join(':');
  } else {
    return ip.split('.').slice(0, 3).join('.');
  }
}

export async function generateAnonId(
  trustedIp: string | null,
  userAgent: string | null,
  acceptLanguage: string | null
): Promise<{ anonId: string; ipHash: string; ipSubnetHash: string } | null> {
  const secret = process.env.ANON_ID_SECRET;
  if (!secret) {
    throw new Error('ANON_ID_SECRET is not configured');
  }

  if (!trustedIp) {
    return null;
  }

  const ipHash = createHmac('sha256', secret).update(trustedIp).digest('base64url');
  const ipSubnetHash = createHmac('sha256', secret)
    .update(getIPSubnet(trustedIp))
    .digest('base64url');

  const ua = userAgent || 'unknown';
  const lang = acceptLanguage?.split(',')[0] || 'unknown';
  
  let timezone: string;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = 'UTC';
  }

  const payload = `${ipHash}|${ua}|${lang}|${timezone}`;
  const anonId = createHmac('sha256', secret).update(payload).digest('base64url');

  return { anonId, ipHash, ipSubnetHash };
}

export async function getOrCreateAnonUsage(
  request: Request
): Promise<AnonUsageInfo | null> {
  const cookieStore = await cookies();
  let anonId = cookieStore.get(ANON_ID_COOKIE)?.value;

  if (!anonId) {
    const trustedIp =
      request.headers.get('x-vercel-ip') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') ||
      // 本地开发环境fallback IP
      (process.env.NODE_ENV === 'development' ? '127.0.0.1' : null);

    const userAgent = request.headers.get('user-agent');
    const acceptLanguage = request.headers.get('accept-language');

    const idData = await generateAnonId(trustedIp, userAgent, acceptLanguage);
    
    if (!idData) {
      return null;
    }

    anonId = idData.anonId;

    cookieStore.set(ANON_ID_COOKIE, anonId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    const { error } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('anon_usage').insert({
      anon_id: anonId,
      usage_count: 0,
      ip_hash: idData.ipHash,
      ip_subnet_hash: idData.ipSubnetHash,
      user_agent: userAgent,
      fingerprint_source: {
        ua: userAgent,
        lang: acceptLanguage,
        created_at: new Date().toISOString(),
      },
    });

    if (error && error.code !== '23505') {
      console.error('Failed to create anon usage:', error);
    }

    return {
      anonId,
      remainingFree: MAX_FREE_USES,
      usageCount: 0,
    };
  }

  const { data, error } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .from('anon_usage')
    .select('usage_count')
    .eq('anon_id', anonId)
    .single();

  if (error && error.code === 'PGRST116') {
    const { error: insertError } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('anon_usage').insert({
      anon_id: anonId,
      usage_count: 0,
      user_agent: request.headers.get('user-agent'),
      fingerprint_source: {
        recovered: true,
        created_at: new Date().toISOString(),
      },
    });

    if (insertError && insertError.code !== '23505') {
      console.error('Failed to recreate anon usage:', insertError);
    }

    return {
      anonId,
      remainingFree: MAX_FREE_USES,
      usageCount: 0,
    };
  }

  const usageCount = data?.usage_count || 0;
  
  return {
    anonId,
    remainingFree: Math.max(0, MAX_FREE_USES - usageCount),
    usageCount,
  };
}

export async function consumeAnonCredit(
  anonId: string,
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: usage, error: fetchError } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .from('anon_usage')
    .select('usage_count')
    .eq('anon_id', anonId)
    .single();

  if (fetchError || !usage) {
    return { success: false, error: 'Anonymous usage not found' };
  }

  if (usage.usage_count >= MAX_FREE_USES) {
    return { success: false, error: 'Free trial limit exceeded' };
  }

  const { error: updateError } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .from('anon_usage')
    .update({
      usage_count: usage.usage_count + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('anon_id', anonId);

  if (updateError) {
    return { success: false, error: 'Failed to update usage count' };
  }

  const { error: logError } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .from('credit_logs').insert({
    anon_id: anonId,
    type: 'consume',
    status: 'confirmed',
    credits: -TRIAL_CREDITS,
    ref_id: requestId,
    metadata: {
      trial: true,
      usage_count: usage.usage_count + 1,
    },
  });

  if (logError) {
    console.error('Failed to log anonymous consumption:', logError);
  }

  return { success: true };
}

export async function checkAnonRateLimit(
  anonId: string,
  _ipHash?: string
): Promise<{ allowed: boolean; reason?: string }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { data: recentLogs, error } = await supabase
    .schema(process.env.SUPABASE_SCHEMA!)
    .from('credit_logs')
    .select('created_at')
    .eq('anon_id', anonId)
    .eq('type', 'consume')
    .gte('created_at', oneHourAgo);

  if (error) {
    console.error('Failed to check rate limit:', error);
    return { allowed: true };
  }

  if ((recentLogs?.length || 0) >= 3) {
    return { allowed: false, reason: 'Too many requests. Please try again later.' };
  }

  return { allowed: true };
}