'use client';

import React from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { format } from 'date-fns';
import { AlertCircle, ShoppingBag, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface OrderItem {
  orderId: number;
  productName: string;
  purchaseDate: string;
  amount: string;
  credits: number;
}

interface OrdersResponse {
  orders: OrderItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

interface OrdersListProps {
  locale: string;
}

export function OrdersList({ locale: _locale }: OrdersListProps) {
  const { isSignedIn } = useAuth();
  const t = useTranslations('orders');
  const [currentPage, setCurrentPage] = React.useState(1);
  
  const { data: ordersData, error, isLoading } = useSWR<OrdersResponse>(
    isSignedIn ? `/api/user/orders?page=${currentPage}&limit=10` : null,
    fetcher
  );

  // 格式化购买时间 - 显示具体时间并按浏览器时区展示
  const formatPurchaseDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'MMM dd, yyyy HH:mm');
  };

  // 获取套餐样式 - 简化版本
  const getPlanStyle = (productName: string) => {
    switch (productName.toLowerCase()) {
      case 'starter':
        return {
          borderColor: 'border-purple-200',
          bgColor: 'bg-purple-50',
          textColor: 'text-purple-700',
          name: 'Starter'
        };
      case 'pro':
        return {
          borderColor: 'border-purple-300',
          bgColor: 'bg-purple-100',
          textColor: 'text-purple-800',
          name: 'Pro'
        };
      case 'elite':
        return {
          borderColor: 'border-orange-300',
          bgColor: 'bg-orange-100',
          textColor: 'text-orange-800',
          name: 'Elite'
        };
      default:
        return {
          borderColor: 'border-gray-200',
          bgColor: 'bg-gray-50',
          textColor: 'text-gray-700',
          name: productName
        };
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-500 rounded-full animate-spin"></div>
          <span className="text-gray-600">{t('loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Unable to load orders</h3>
          <p className="text-gray-500">{t('loadError')}</p>
        </div>
      </div>
    );
  }

  if (!ordersData || !ordersData.orders || ordersData.orders.length === 0) {
    return (
      <div className="text-center py-16">
        <ShoppingBag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">{t('noOrders')}</h3>
        <p className="text-gray-500 max-w-md mx-auto">{t('noOrdersDescription')}</p>
      </div>
    );
  }

  const { orders, pagination } = ordersData;

  return (
    <div className="space-y-6">
      {/* 所有订单在一个卡片中 */}
      <Card>
        <CardContent className="p-0">
          {orders.map((order, index) => {
            const style = getPlanStyle(order.productName);
            
            return (
              <div key={order.orderId}>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    {/* 左侧内容 */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {order.credits} credits
                        </h3>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${style.borderColor} ${style.bgColor} ${style.textColor}`}>
                          {style.name}
                        </span>
                      </div>
                      
                      <div className="text-gray-500 text-sm">
                        {formatPurchaseDate(order.purchaseDate)} 
                      </div>
                    </div>

                    {/* 右侧价格 */}
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">
                        {order.amount}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* 分隔线 - 最后一个订单不显示 */}
                {index < orders.length - 1 && (
                  <div className="border-b border-gray-200"></div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 分页控制 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-8 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            Showing <span className="font-medium text-gray-900">{((currentPage - 1) * pagination.limit) + 1}-{Math.min(currentPage * pagination.limit, pagination.total)}</span> of <span className="font-medium text-gray-900">{pagination.total}</span> orders
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            
            <div className="flex items-center px-3 py-1">
              <span className="text-sm font-medium text-gray-900">{currentPage}</span>
              <span className="text-sm text-gray-400 mx-1">of</span>
              <span className="text-sm font-medium text-gray-900">{pagination.totalPages}</span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1))}
              disabled={currentPage === pagination.totalPages}
              className="flex items-center gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}