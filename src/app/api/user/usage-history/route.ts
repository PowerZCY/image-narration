import { auth } from '@clerk/nextjs/server';
import { getUserUsageHistory, deleteUsageHistory } from '@/lib/usage-history';

// GET: 获取用户使用记录
export async function GET(req: Request) {
  try {
    // 检查用户认证状态
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return Response.json(
        { error: 'Unauthorized: Please login to view usage history' },
        { status: 401 }
      );
    }

    // 获取查询参数
    const url = new URL(req.url);
    const limitStr = url.searchParams.get('limit');
    const offsetStr = url.searchParams.get('offset');

    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr), 1), 100) : 20; // 限制1-100，默认20
    const offset = offsetStr ? Math.max(parseInt(offsetStr), 0) : 0; // 最小0，默认0

    console.log('[UsageHistory] Getting usage history for user:', {
      clerkUserId,
      limit,
      offset
    });

    // 查询用户使用记录
    const result = await getUserUsageHistory({
      clerkUserId,
      limit,
      offset
    });

    if (!result.success) {
      return Response.json(
        { error: result.error || 'Failed to get usage history' },
        { status: 500 }
      );
    }

    // 返回结果
    return Response.json({
      success: true,
      data: result.data || [],
      pagination: {
        limit,
        offset,
        total: result.total || 0,
        hasMore: (result.total || 0) > offset + limit
      }
    });

  } catch (error) {
    console.error('[UsageHistory] Error in GET /api/user/usage-history:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: 逻辑删除用户使用记录
export async function DELETE(req: Request) {
  try {
    // 检查用户认证状态
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return Response.json(
        { error: 'Unauthorized: Please login to delete usage history' },
        { status: 401 }
      );
    }

    // 解析请求体获取记录ID
    let requestBody;
    try {
      requestBody = await req.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { record_id } = requestBody;

    // 验证记录ID
    if (!record_id || typeof record_id !== 'number' || record_id <= 0) {
      return Response.json(
        { error: 'Invalid or missing record_id' },
        { status: 400 }
      );
    }

    console.log('[UsageHistory] Deleting usage history record:', {
      recordId: record_id,
      clerkUserId
    });

    // 执行逻辑删除
    const result = await deleteUsageHistory({
      recordId: record_id,
      clerkUserId
    });

    if (!result.success) {
      // 根据错误类型返回不同的状态码
      const status = result.error?.includes('not found') || result.error?.includes('permission denied') ? 404 : 500;
      return Response.json(
        { error: result.error || 'Failed to delete usage history record' },
        { status }
      );
    }

    // 返回成功结果
    return Response.json({
      success: true,
      message: 'Usage history record deleted successfully'
    });

  } catch (error) {
    console.error('[UsageHistory] Error in DELETE /api/user/usage-history:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}