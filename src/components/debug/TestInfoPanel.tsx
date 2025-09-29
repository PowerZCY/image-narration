'use client';

import { useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, User, CreditCard, Clock, Receipt, Globe, ChevronLeft, ChevronRight } from 'lucide-react';

interface UserCredits {
  balance: number;
  expiresAt: string | null;
  userId?: string;
  clerkUserId?: string;
  email?: string;
  displayName?: string;
}

interface AnonymousUsage {
  anonId: string | null;
  remainingQuota: number;
  usageCount: number;
}

interface Order {
  session_id: string;
  price_id: string;
  credits: number;
  amount: number;
  currency: string;
  created_at: string;
  state: string;
}

interface TestInfoData {
  userCredits: UserCredits | null;
  anonymousUsage: AnonymousUsage | null;
  lastOrder: Order | null;
  error?: string;
}

export function TestInfoPanel() {
  const { user, isLoaded } = useUser();
  const [data, setData] = useState<TestInfoData>({
    userCredits: null,
    anonymousUsage: null,
    lastOrder: null
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const fetchTestData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        // 获取用户积分信息
        fetch('/api/user/credits').then(res => res.ok ? res.json() : null),
        // 获取匿名用户使用信息
        fetch('/api/anonymous-usage').then(res => res.ok ? res.json() : null),
        // 获取最近一笔订单
        fetch('/api/user/last-order').then(res => res.ok ? res.json() : null)
      ]);

      setData({
        userCredits: results[0].status === 'fulfilled' ? results[0].value : null,
        anonymousUsage: results[1].status === 'fulfilled' ? results[1].value : null,
        lastOrder: results[2].status === 'fulfilled' ? results[2].value : null,
        error: results.some(r => r.status === 'rejected') ? '部分数据加载失败' : undefined
      });
    } catch {
      setData({
        userCredits: null,
        anonymousUsage: null,
        lastOrder: null,
        error: '数据加载失败'
      });
    }
    setLoading(false);
    setLastUpdateTime(new Date().toLocaleTimeString('zh-CN'));
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      fetchTestData();
    }
  }, [isLoaded]);

  // 仅在非生产环境且启用了测试面板时显示
  const showPanel = process.env.NODE_ENV !== 'production' && 
    (process.env.NEXT_PUBLIC_TEST_INFO_PANEL_ENABLED === 'true' || process.env.NODE_ENV === 'development');

  if (!showPanel || !isMounted) return null;

  return (
    <div className="fixed top-20 left-4 z-50">
      {/* 测试面板内容 */}
      <div className={`transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-96 opacity-100'}`}>
        {!isCollapsed && (
          <Card className="max-h-[80vh] overflow-y-auto bg-background/95 backdrop-blur shadow-lg border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                🧪 测试信息面板
                <Badge variant="secondary" className="text-xs">DEV</Badge>
              </CardTitle>
              <button
                onClick={fetchTestData}
                disabled={loading}
                className="p-1 hover:bg-muted rounded"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </CardHeader>
      
      <CardContent className="space-y-4 text-sm">
        {/* 用户信息 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <User className="w-4 h-4" />
            用户信息
          </div>
          <div className="pl-6 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">登录状态:</span>
              <Badge variant={user ? "default" : "secondary"}>
                {user ? "已登录" : "未登录"}
              </Badge>
            </div>
            {user && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Clerk ID:</span>
                  <code className="text-xs bg-muted px-1 rounded break-all">
                    {user.id}
                  </code>
                </div>
                {data.userCredits?.userId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">内部 User ID:</span>
                    <code className="text-xs bg-muted px-1 rounded break-all">
                      {data.userCredits.userId}
                    </code>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">邮箱:</span>
                  <span>{user.primaryEmailAddress?.emailAddress}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <Separator />

        {/* 匿名用户信息 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <Globe className="w-4 h-4" />
            匿名用户信息
          </div>
          <div className="pl-6 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">匿名ID:</span>
              <code className="text-xs bg-muted px-1 rounded break-all">
                {data.anonymousUsage?.anonId || '未生成'}
              </code>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">使用次数:</span>
              <span>{data.anonymousUsage?.usageCount ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">剩余额度:</span>
              <Badge variant={
                (data.anonymousUsage?.remainingQuota ?? 0) > 0 ? "default" : "destructive"
              }>
                {data.anonymousUsage?.remainingQuota ?? 0}
              </Badge>
            </div>
          </div>
        </div>

        <Separator />

        {/* 积分信息 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <CreditCard className="w-4 h-4" />
            积分信息
          </div>
          <div className="pl-6 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">当前余额:</span>
              <Badge variant={
                (data.userCredits?.balance ?? 0) > 0 ? "default" : "secondary"
              }>
                {data.userCredits?.balance ?? 0} 积分
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">过期时间:</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {data.userCredits?.expiresAt ? 
                  new Date(data.userCredits.expiresAt).toLocaleDateString('zh-CN') :
                  '无期限'}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* 最近订单信息 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <Receipt className="w-4 h-4" />
            最近订单
          </div>
          <div className="pl-6 space-y-1 text-xs">
            {data.lastOrder ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">购买积分:</span>
                  <span>{data.lastOrder.credits} 积分</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">支付金额:</span>
                  <span>${data.lastOrder.amount} {data.lastOrder.currency.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">状态:</span>
                  <Badge variant="default">{data.lastOrder.state}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">创建时间:</span>
                  <span>{new Date(data.lastOrder.created_at).toLocaleDateString('zh-CN')}</span>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">暂无订单记录</div>
            )}
          </div>
        </div>

        {data.error && (
          <>
            <Separator />
            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
              ⚠️ {data.error}
            </div>
          </>
        )}

        <Separator />
        
        <div className="text-xs text-muted-foreground text-center">
          更新时间: {lastUpdateTime || '加载中...'}
        </div>

        {/* 收起按钮 */}
        <div className="flex justify-center mt-3">
          <button
            onClick={() => setIsCollapsed(true)}
            className="bg-muted/50 hover:bg-muted border rounded-full p-1.5 transition-all duration-200 group"
            title="收起测试面板"
          >
            <ChevronLeft className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" />
          </button>
        </div>
      </CardContent>
          </Card>
        )}
      </div>

      {/* 展开按钮 - 只在收起时显示 */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          className="bg-background/95 backdrop-blur border rounded-lg p-2 hover:bg-muted transition-all duration-200 shadow-lg group"
          title="展开测试面板"
        >
          <div className="flex items-center gap-1">
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            <span className="text-xs font-medium hidden group-hover:inline">🧪</span>
          </div>
        </button>
      )}
    </div>
  );
}