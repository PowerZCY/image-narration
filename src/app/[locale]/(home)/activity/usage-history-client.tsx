'use client'

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogHeader } from '@/components/ui/dialog';
import { 
  AlertTriangle,
  Image as ImageIcon,
  Eye,
  MessageSquare,
  Stars,
  Check,
  Copy,
  Trash2
} from 'lucide-react';

interface UsageHistoryItem {
  id: number;
  image_url: string;
  user_prompt: string | null;
  ai_narration: string;
  request_id: string | null;
  created_at: string;
}

interface UsageHistoryResponse {
  success: boolean;
  data: UsageHistoryItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  error?: string;
}

interface UsageHistoryClientProps {
  clerkUserId: string;
  translations: {
    loading: string;
    error: string;
    noData: string;
    noDataDescription: string;
    loadMore: string;
    copy: string;
    copied: string;
    prompt: string;
    narration: string;
    createdAt: string;
    showMore: string;
    showLess: string;
    noPrompt: string;
    delete: string;
    deleteConfirm: string;
    deleting: string;
    deleteSuccess: string;
    deleteError: string;
    cancel: string;
    retry: string;
  };
}

export function UsageHistoryClient({ clerkUserId, translations: t }: UsageHistoryClientProps) {
  const [items, setItems] = useState<UsageHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [copiedItems, setCopiedItems] = useState<Set<number>>(new Set());
  const [expandedNarrations, setExpandedNarrations] = useState<Set<number>>(new Set());
  const [deletingItems, setDeletingItems] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [previewItem, setPreviewItem] = useState<UsageHistoryItem | null>(null);

  const LIMIT = 10;

  // 加载使用记录
  const fetchUsageHistory = async (offset = 0, append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      const response = await fetch(
        `/api/user/usage-history?limit=${LIMIT}&offset=${offset}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const result: UsageHistoryResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load usage history');
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to load usage history');
      }

      if (append) {
        setItems(prev => [...prev, ...result.data]);
      } else {
        setItems(result.data);
      }

      setHasMore(result.pagination.hasMore);
    } catch (err) {
      console.error('Failed to fetch usage history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load usage history');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // 初始加载
  useEffect(() => {
    fetchUsageHistory();
  }, [clerkUserId]);

  // 加载更多
  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    fetchUsageHistory(items.length, true);
  };

  // 复制文本
  const handleCopy = async (text: string, itemId: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItems(prev => new Set(prev).add(itemId));
      setTimeout(() => {
        setCopiedItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(itemId);
          return newSet;
        });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // 切换展开/收起
  const toggleExpanded = (itemId: number) => {
    setExpandedNarrations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // 打开删除确认对话框
  const openDeleteDialog = (itemId: number) => {
    setItemToDelete(itemId);
    setDeleteDialogOpen(true);
  };

  // 关闭删除确认对话框
  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  // 执行删除操作
  const handleDelete = async () => {
    if (!itemToDelete) return;

    try {
      setDeletingItems(prev => new Set(prev).add(itemToDelete));
      closeDeleteDialog();

      const response = await fetch('/api/user/usage-history', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          record_id: itemToDelete
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete record');
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete record');
      }

      // 从列表中移除已删除的项目
      setItems(prev => prev.filter(item => item.id !== itemToDelete));
      
      console.log('[UsageHistory] Successfully deleted record:', itemToDelete);
      
    } catch (err) {
      console.error('[UsageHistory] Failed to delete record:', err);
      // 这里可以添加 toast 通知或其他错误提示
      alert(t.deleteError + ': ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setDeletingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemToDelete);
        return newSet;
      });
    }
  };

  // 格式化时间
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 判断文本是否需要展开
  const needsExpansion = (text: string) => text.length > 300;

  // 截断文本
  const truncateText = (text: string, maxLength = 300) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // 加载状态
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100 mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">{t.loading}</p>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-red-600 dark:text-red-400 mb-4">{t.error}: {error}</p>
        <Button onClick={() => fetchUsageHistory()} variant="outline">
          {t.retry}
        </Button>
      </div>
    );
  }

  // 空状态
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] py-16 -mt-12">
        <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
          <ImageIcon className="h-12 w-12 text-gray-400" />
        </div>
        <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {t.noData}
        </h3>
        <p className="text-lg text-gray-500 dark:text-gray-400">
          {t.noDataDescription}
        </p>
      </div>
    );
  }

  // 主要内容
  return (
    <div className="space-y-6">
      {items.map((item) => {
        const isExpanded = expandedNarrations.has(item.id);
        const isCopied = copiedItems.has(item.id);

        const isDeleting = deletingItems.has(item.id);

        return (
          <Card key={item.id} className="overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(item.created_at)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openDeleteDialog(item.id)}
                  disabled={isDeleting}
                  className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  {isDeleting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                {/* 左侧：紧凑图片 */}
                <div className="flex-shrink-0 md:self-start">
                  <button
                    type="button"
                    onClick={() => setPreviewItem(item)}
                    className="relative group w-32 h-32 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-pointer transition-transform hover:scale-105"
                    aria-label="View image"
                  >
                    <Image
                      src={item.image_url}
                      alt="Generated image"
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      <Eye className="h-5 w-5 text-gray-300" />
                    </div>
                  </button>
                </div>

                {/* 右侧：内容区域 */}
                <div className="flex-1 min-w-0">
                  {/* 用户 Prompt */}
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 flex items-center">
                      <MessageSquare className="h-4 w-4 mr-2 text-primary" />
                      <span className="text-primary">{t.prompt}</span>
                    </h4>
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                      {item.user_prompt ? (
                        <p className="text-gray-700 dark:text-gray-300 text-base break-words">
                          {item.user_prompt}
                        </p>
                      ) : (
                        <p className="text-gray-500 dark:text-gray-400 text-base italic">
                          {t.noPrompt}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* AI 生成的描述 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center">
                        <Stars className="h-4 w-4 mr-2 text-accent-foreground" />
                        <span className="text-accent-foreground">{t.narration}</span>
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(item.ai_narration, item.id)}
                        className="text-xs"
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            {t.copied}
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 mr-1" />
                            {t.copy}
                          </>
                        )}
                      </Button>
                    </div>
                    
                    <div className="bg-accent/50 border border-accent rounded-lg p-4">
                      <div className="text-gray-700 dark:text-gray-300 text-base leading-relaxed">
                        {needsExpansion(item.ai_narration) ? (
                          <>
                            <p className="whitespace-pre-wrap text-pretty break-words">
                              {isExpanded ? item.ai_narration : truncateText(item.ai_narration)}
                            </p>
                            <div className="flex justify-end mt-2">
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => toggleExpanded(item.id)}
                                className="p-0 h-auto text-xs"
                              >
                                {isExpanded ? t.showLess : t.showMore}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <p className="whitespace-pre-wrap text-pretty break-words">{item.ai_narration}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* 加载更多按钮 */}
      {hasMore && (
        <div className="flex justify-center pt-6">
          <Button
            onClick={handleLoadMore}
            disabled={loadingMore}
            variant="outline"
            className="min-w-32"
          >
            {loadingMore ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                {t.loading}
              </>
            ) : (
              t.loadMore
            )}
          </Button>
        </div>
      )}

      <Dialog open={!!previewItem} onOpenChange={(open) => {
        if (!open) {
          setPreviewItem(null);
        }
      }}>
        <DialogContent className="sm:max-w-4xl p-0 bg-transparent border-none shadow-none">
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
          {previewItem && (
            <button
              type="button"
              onClick={() => setPreviewItem(null)}
              className="focus:outline-none w-full h-full"
            >
              <div className="relative w-full h-[90vh]">
                <Image
                  src={previewItem.image_url}
                  alt="Generated image preview"
                  fill
                  className="object-contain"
                />
              </div>
            </button>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm !bg-white dark:!bg-gray-900 border-2 border-gray-200 dark:border-gray-700 shadow-xl rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              {t.delete}
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t.deleteConfirm}
            </p>
          </div>
          
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="outline"
              size="sm"
              onClick={closeDeleteDialog}
              className="min-w-20"
            >
              {t.cancel}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              className="min-w-20 bg-red-600 hover:bg-red-700"
            >
              {t.delete}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
