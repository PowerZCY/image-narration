import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateAnonUsage } from '@/lib/anonymous';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const anonUsage = await getOrCreateAnonUsage(request);

    if (!anonUsage) {
      return NextResponse.json(
        { 
          error: 'Unable to establish anonymous session. Please enable cookies or sign in.',
          requiresAuth: true
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      anonId: anonUsage.anonId,
      remainingQuota: anonUsage.remainingFree,
      usageCount: anonUsage.usageCount,
      maxFree: 1,
    });
  } catch (error) {
    console.error('Error getting anonymous usage:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}