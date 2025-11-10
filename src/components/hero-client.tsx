'use client'

import { appConfig } from "@/lib/appConfig"
import { createR2Client } from "@/lib/r2-explorer-sdk"
import { globalLucideIcons as icons } from '@windrun-huaiin/base-ui/components/server'
import { GradientButton } from "@windrun-huaiin/third-ui/fuma/mdx"
import { AdsAlertDialog, AIPromptTextarea, XButton } from "@windrun-huaiin/third-ui/main"
import { useClerk, useUser } from '@clerk/nextjs'
import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
import useSWR, { mutate } from 'swr'
import { CreditPurchaseModal } from "@/components/pricing/PricingDialog"

const fetcher = (url: string) => fetch(url).then((res) => res.json());
const IMAGE_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp';
const ACCEPTED_IMAGE_TYPES = IMAGE_ACCEPT.split(',');
const ACCEPTED_IMAGE_EXTENSIONS = new Set(['jpeg', 'jpg', 'png', 'webp']);

const isAllowedImageFile = (file: File) => {
  const normalizedType = file.type?.split(';')[0]?.toLowerCase();
  if (normalizedType && ACCEPTED_IMAGE_TYPES.includes(normalizedType)) {
    return true;
  }
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension ? ACCEPTED_IMAGE_EXTENSIONS.has(extension) : false;
};

interface HeroClientProps {
  translations: {
    main: {
      eyesOn: string
      title: string
    }
    upload: {
      title: string
      tip: string
      uploading: string
      choose: string
      dragTip: string
      noImageTip: string
      noImageUrls: string[]
      defaultImageUrl: string
    }
    prompt: {
      title: string
      tip: string
      placeholder: string
    }
    button: {
      uploadFirst: string
      generate: string
      anonymousTrial: string
      newUserHintSingle: string
      newUserHintPlural: string
      creditRequired: string
    }
    result: {
      title: string
      copy: string
      copied: string
    }
    ready: {
      title: string
      prefixDesc: string
      desc1: string
      desc2: string
      generating: string
      waiting: string
    }
  }
}

export function HeroClient({ translations: t }: HeroClientProps) {
  const { openSignUp } = useClerk();
  const { user, isLoaded } = useUser();

  // 获取用户积分信息
  const { data: creditsData } = useSWR(
    user ? '/api/user/credits' : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  // 获取用户付费状态
  const { data: paidOrdersData } = useSWR(
    user ? '/api/user/has-paid-orders' : null,
    fetcher,
    { revalidateOnFocus: true }
  );
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isWordLimit, setIsWordLimit] = useState(false)
  const [narration, setNarration] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [translateMenuOpen, setTranslateMenuOpen] = useState(false);
  const [selectedLanguage, _setSelectedLanguage] = useState<'Chinese' | 'Japanese' | 'Spanish'>('Chinese');
  const [_isTranslating, setIsTranslating] = useState(false);
  const translateMenuRef = useRef<HTMLDivElement>(null);

  // 响应式高度：根据屏幕尺寸动态调整 prompt 输入框高度
  const [promptHeight, setPromptHeight] = useState({ min: 305, max: 364 });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 640) {
        // 极小屏幕
        setPromptHeight({ min: 150, max: 200 });
      } else if (width < 768) {
        // 中等屏幕
        setPromptHeight({ min: 200, max: 250 });
      } else {
        // 桌面端
        setPromptHeight({ min: 305, max: 364 });
      }
    };

    handleResize(); // 初始化
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 统一错误弹窗管理
  const [errorDialog, setErrorDialog] = useState<{ open: boolean, title: string, description: string }>({ open: false, title: '', description: '' });
  // 积分购买对话框管理
  const [creditModal, setCreditModal] = useState<{ open: boolean, balance: number }>({ open: false, balance: 0 });
  const [translatedText, setTranslatedText] = useState('');
  const [isCopiedTranslation, setIsCopiedTranslation] = useState(false);
  // 缓存R2客户端，避免每次渲染重新创建
  const r2Client = useMemo(() => createR2Client({
    baseUrl: appConfig.r2.baseUrl,
    bucketName: appConfig.r2.bucketName,
    apiToken: appConfig.r2.apiToken
  }), []);

  // 点击外部关闭翻译菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (translateMenuRef.current && !translateMenuRef.current.contains(event.target as Node)) {
        setTranslateMenuOpen(false);
      }
    };

    if (translateMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [translateMenuOpen]);

  const handleImageSelect = async (file: File) => {
    if (!isAllowedImageFile(file)) {
      setErrorDialog({
        open: true,
        title: 'Unsupported file type',
        description: 'Please upload a JPG, PNG, or WEBP image.',
      });
      return;
    }
    if (file.size > appConfig.r2.uploadImageMaxSizeMB * 1024 * 1024) {
      setErrorDialog({
        open: true,
        title: 'Image too large',
        description: `Please select an image file less than ${appConfig.r2.uploadImageMaxSizeMB}MB.`
      });
      return;
    }
    setSelectedImage(file);
    const blobUrl = URL.createObjectURL(file);
    setPreviewImageUrl(blobUrl); // 立即本地预览
    setIsUploading(true);
    try {
      // 检查是否启用R2 Mock模式
      if (appConfig.r2.enableMock) {
        console.warn('[R2-Mock] Using mock upload, no actual file uploaded');
        await new Promise(resolve => setTimeout(resolve, appConfig.r2.mockTimeout));
        const mockUrl = appConfig.r2.mockImgUrl;
        setUploadedImageUrl(mockUrl);
        return;
      }
      // 生成唯一文件名
      const timestamp = Date.now();
      const extension = file.name.split('.').pop() || 'webp';
      const filename = `${timestamp}_${Math.random().toString(36).substring(2)}.${extension}`;
      // 上传图片到R2
      const uploadResult = await r2Client.upload(filename, file, file.type);
      if (uploadResult.success && uploadResult.share_urls?.public?.view) {
        setUploadedImageUrl(uploadResult.share_urls.public.view);
        console.log('Image uploaded successfully:', uploadResult.share_urls.public.view);
      } else {
        throw new Error('Upload failed: No public URL received');
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
      setErrorDialog({
        open: true,
        title: 'Upload Failed',
        description: `Failed to upload image: ${error instanceof Error ? error.message : 'Please try again.'}`
      });
      setSelectedImage(null);
      setPreviewImageUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = IMAGE_ACCEPT;
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleImageSelect(file);
      }
    };
    input.click();
  };

  const handleGenerate = async () => {
    if (!uploadedImageUrl) {
      setErrorDialog({
        open: true,
        title: 'No Image Uploaded',
        description: 'Please upload an image first!'
      });
      return;
    }
    
    setIsGenerating(true);
    
    try {
      console.log('Generating narration for image:', uploadedImageUrl);
      
      // 调用AI生成接口
      const response = await fetch('/api/ai-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt || '',
          imageUrl: uploadedImageUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // 检查是否需要登录
        if (errorData.requiresAuth) {
          if (typeof openSignUp === 'function') {
            openSignUp();
          } else {
            // 备用方案：显示错误信息提示用户手动登录
            setErrorDialog({
              open: true,
              title: 'Login Required',
              description: 'Please login to continue using the service.'
            });
          }
          return;
        }
        
        // 检查是否需要充值
        if (errorData.requiresPayment) {
          setCreditModal({
            open: true,
            balance: errorData.balance || 0
          });
          return;
        }

        if (errorData.error === 'AI model request timeout') {
          setErrorDialog({
            open: true,
            title: 'Request Timed Out',
            description: 'The AI took too long to respond. Your credits have been refunded automatically. Please try again in a few minutes.',
          });
          return;
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (result.text) {
        setTranslatedText('');
        setNarration(result.text);
        console.log('AI narration generated successfully');
        // 生成成功后立即刷新余额显示
        mutate('/api/user/credits');
      } else {
        throw new Error('No text content received from AI');
      }
    } catch (error) {
      console.error('Failed to generate narration:', error);
      if (error instanceof Error && error.message === 'AI model request timeout') {
        setErrorDialog({
          open: true,
          title: 'Request Timed Out',
          description: 'The AI took too long to respond. Your credits have been refunded automatically. Please try again in a few minutes.',
        });
        return;
      }
      setErrorDialog({
        open: true,
        title: 'Generation Failed',
        description: `Failed to generate narration: ${error instanceof Error ? error.message : 'Please try again.'}`
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(narration);
      setIsCopied(true);
      // 2秒后恢复原图标
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setErrorDialog({
        open: true,
        title: 'Copy Failed',
        description: 'Failed to copy text. Please try again.'
      });
    }
  };

  const translateToLanguage = async (language: 'Chinese' | 'Japanese' | 'Spanish') => {
    if (!narration.trim()) {
      setErrorDialog({
        open: true,
        title: 'Ooops!',
        description: 'No text to translate'
      });
      return;
    }
    setIsTranslating(true);
    try {
      const response = await fetch('/api/ai-generate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: narration, language: language }),
      });

      if (!response.ok) {
        throw new Error(`Translation failed: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.text) {
        setTranslatedText(result.text); // 只更新翻译结果
        console.log(`Text translated to ${language} successfully`);
      } else {
        throw new Error('No translated content received from AI');
      }
    } catch (error) {
      console.error('Failed to translate text:', error);
      setErrorDialog({
        open: true,
        title: 'Translation Failed',
        description: `Failed to translate text: ${error instanceof Error ? error.message : 'Please try again.'}`
      });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopyTranslation = async () => {
    try {
      await navigator.clipboard.writeText(translatedText);
      setIsCopiedTranslation(true);
      setTimeout(() => {
        setIsCopiedTranslation(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy translation: ', err);
      setErrorDialog({
        open: true,
        title: 'Copy Failed',
        description: 'Failed to copy translation. Please try again.'
      });
    }
  };

  const handleTranslate = () => translateToLanguage(selectedLanguage);

  const handleClearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedImage(null);
    setPreviewImageUrl(null);
    setUploadedImageUrl('');
  };

  // 获取示例图片urls（如有）
  const noImageUrls = t.upload.noImageUrls || [];
  const fallbackImg = t.upload.defaultImageUrl;

  // 处理示例图片点击
  const handleExampleImageSelect = (url: string) => {
    setSelectedImage(null);
    setPreviewImageUrl(url);
    setUploadedImageUrl(url);
    setIsUploading(false);
  };

  // 处理单词限制变化
  const handleWordLimitChange = (isLimit: boolean) => {
    setIsWordLimit(isLimit)
  }

  // 动态提示逻辑
  const getCreditHintText = () => {
    // Clerk 数据未加载完成，隐藏提示避免闪烁
    if (!isLoaded) {
      return null;
    }

    // 未登录用户
    if (!user) {
      return t.button.anonymousTrial;
    }

    // 已登录用户，但 SWR 数据还在加载中，隐藏提示避免闪烁
    if (!creditsData || !paidOrdersData) {
      return null;
    }

    // 已登录用户，所有数据已加载完成
    const balance = creditsData.balance || 0;
    const hasPaidOrders = paidOrdersData.hasPaidOrders || false;

    // 新用户判断：无付费记录 且 余额≤2
    const isNewUser = !hasPaidOrders && balance > 0 && balance <= 2;

    if (isNewUser) {
      // 新用户显示剩余免费次数
      if (balance === 1) {
        return t.button.newUserHintSingle;
      }
      // 使用 # 作为占位符，避免 next-intl 的格式化检查
      return t.button.newUserHintPlural.replace('#', String(balance));
    }

    // 其他情况显示标准提示
    return t.button.creditRequired;
  };

  return (
    <section className="px-4 mx-4 sm:px-8 sm:mx-8 md:px-12 md:mx-12 lg:px-16 lg:mx-16 xl:mx-32 space-y-6 sm:space-y-8">
      {/* 错误弹窗 */}
      <AdsAlertDialog
        open={errorDialog.open}
        onOpenChange={open => {
          if (!open) setErrorDialog({ open: false, title: '', description: '' });
        }}
        title={errorDialog.title}
        description={errorDialog.description}
        imgSrc="https://r2.d8ger.com/Ad-Pollo.webp"
        imgHref="https://pollo.ai/home?ref=mzmzndj&tm_news=news"
      />
      
      {/* 积分购买对话框 */}
      <CreditPurchaseModal
        open={creditModal.open}
        onOpenChange={open => {
          if (!open) setCreditModal({ open: false, balance: 0 });
        }}
        currentBalance={creditModal.balance}
      />
      {/* 头部标题区域 */}
      <div className="text-center space-y-2 sm:space-y-3">
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            {t.main.eyesOn}
          </span>
        </h1>
        <span className="text-base sm:text-base md:text-xl lg:text-2xl leading-tight text-gray-400">
            {t.main.title}
          </span>
      </div>

      {/* 上部分：左右两列布局 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 items-stretch">
        {/* 左列：图片上传区域 - 占3份 */}
        <div className="md:col-span-1 lg:col-span-3 space-y-3">
          {/* 图片上传区域 - 与AIPromptTextarea保持一致的布局结构 */}
          <div className="space-y-2">
            {/* 第一行：标题区域 + 上传框 */}
            <div className="border-2 border-dashed border-border rounded-lg bg-transparent hover:border-purple-500 transition-colors">
              {/* 标题和描述区域 */}
              <div className="p-4 pb-2">
                <div className="space-y-1">
                  <span className="text-xl font-semibold text-foreground">{t.upload.title}</span>
                  <span className="text-xs text-gray-400 ml-2">{t.upload.tip} {appConfig.r2.uploadImageMaxSizeMB}MB)</span>
                </div>
              </div>
              
              {/* 分割线 */}
              <hr className="border-t-1 border-border" />
              
              {/* 上传内容区域 */}
              <div className="p-1">
                <div 
                  onClick={handleImageClick}
                  onDragOver={e => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const files = Array.from(e.dataTransfer.files ?? []);
                    const validFile = files.find(isAllowedImageFile);
                    if (!validFile) {
                      if (files.length > 0) {
                        setErrorDialog({
                          open: true,
                          title: 'Unsupported file type',
                          description: 'Please upload a JPG, PNG, or WEBP image.',
                        });
                      }
                      return;
                    }
                    handleImageSelect(validFile);
                  }}
                  className="min-h-[200px] sm:min-h-[250px] md:min-h-[310px] flex items-center justify-center cursor-pointer relative"
                >
                  {previewImageUrl ? (
                    <div className="w-full space-y-2">
                      <div className="relative w-full max-w-lg mx-auto">
                        <Image
                          src={previewImageUrl}
                          alt="Selected image"
                          width={500}
                          height={400}
                          className="w-full h-auto max-h-[260px] rounded-lg object-contain"
                        />
                        {/* 上传进度覆盖层 */}
                        {isUploading && (
                          <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                            <div className="text-white text-center space-y-2">
                              <icons.Loader2 className="h-8 w-8 animate-spin mx-auto" />
                              <p className="text-sm">{t.upload.uploading}</p>
                            </div>
                          </div>
                        )}
                        {/* 清空图片按钮 */}
                        {!isUploading && (
                          <button
                            onClick={handleClearImage}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-background border-2 border-border text-foreground hover:bg-destructive hover:text-destructive-foreground rounded-full flex items-center justify-center transition-colors shadow-lg"
                            title="Remove image"
                          >
                            <icons.X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          {/* 文件名只在本地上传时显示 */}
                          {selectedImage && <p className="text-sm text-muted-foreground">{selectedImage.name}</p>}
                          {uploadedImageUrl && (
                            <icons.Check className="h-4 w-4"/>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <icons.ImageUp className="h-12 w-12 mx-auto text-gray-400" />
                      <div className="space-y-3">
                        <div className="inline-flex items-center px-6 py-2 bg-gradient-to-r from-purple-400 to-pink-600 text-white font-medium rounded-full hover:from-purple-500 hover:to-pink-700 transition-all">
                          {t.upload.choose}
                        </div>
                        <p className="text-muted-foreground">{t.upload.dragTip}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* 第二行：示例图片文本（对应AIPromptTextarea的单词计数位置） */}
            <div className="flex justify-center">
              <p className="text-sm text-muted-foreground">{t.upload.noImageTip}</p>
            </div>
            
            {/* 第三行：示例图片区域 */}
            <div className="flex gap-2 justify-center">
              {noImageUrls.length > 0
                ? noImageUrls.map((url: string, idx: number) => (
                    <div
                      key={idx}
                      className="w-14 h-14 sm:w-12 sm:h-12 bg-muted rounded cursor-pointer hover:bg-muted/80 transition-colors flex items-center justify-center overflow-hidden"
                      onClick={() => handleExampleImageSelect(url)}
                    >
                      <Image
                        src={url}
                        alt="Example"
                        width={56}
                        height={56}
                        className="object-cover w-14 h-14 sm:w-12 sm:h-12"
                        onError={e => { (e.currentTarget as HTMLImageElement).src = fallbackImg; }}
                      />
                    </div>
                  ))
                : [1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-14 h-14 sm:w-12 sm:h-12 bg-muted rounded cursor-pointer hover:bg-muted/80 transition-colors flex items-center justify-center"
                    >
                      <icons.ImageUp className="h-14 w-14 sm:h-12 sm:w-12" />
                    </div>
                  ))}
            </div>
          </div>
        </div>

        {/* 右列：标题+提示词输入区域+单词统计+生成按钮 - 占2份 */}
        <div className="md:col-span-1 lg:col-span-2 space-y-3 flex flex-col justify-end">
          {/* 标题+提示词输入区域+单词统计 */}
          <AIPromptTextarea
            title={t.prompt.title}
            description={t.prompt.tip}
            embed={true}
            value={prompt}
            onChange={setPrompt}
            placeholder={t.prompt.placeholder}
            maxWords={400}
            minHeight={promptHeight.min}
            maxHeight={promptHeight.max}
            autoScroll={true}
            isWordLimit={isWordLimit}
            onWordLimitChange={handleWordLimitChange}
            extraScrollSpace={100}
          />
          
          <div className="flex flex-col items-stretch sm:items-center gap-2">
            <GradientButton
              title={
                !uploadedImageUrl ? t.button.uploadFirst : t.button.generate
              }
              onClick={uploadedImageUrl ? handleGenerate : undefined}
              disabled={!uploadedImageUrl || isGenerating}
              icon={isGenerating ? <icons.Loader2 className="h-4 w-4 animate-spin mx-auto" /> : <icons.Sparkles className="h-4 w-4 text-white" />}
            />
            {/* 动态提示：数据加载完成后显示,避免闪烁 */}
            {!isGenerating && getCreditHintText() && (
              <div className="text-sm text-gray-500 flex items-center justify-center">
                <span>{getCreditHintText()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 下部分：生成结果显示区域 */}
      <div className="space-y-4">
        {narration ? (
          <div className="border-2 border-border bg-card/30 rounded-lg p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-border border-b-2 pb-2 gap-2">
              <h4 className="text-lg font-semibold text-foreground">{t.result.title}</h4>
              <div className="flex flex-wrap gap-2 sm:gap-1 w-full sm:w-auto">
                <XButton
                  type="single"
                  minWidth="min-w-[110px]"
                  button={{
                    icon: isCopied ? <icons.CheckCheck className="w-5 h-5 mr-1" /> : <icons.Copy className="w-5 h-5 mr-1" />,
                    text: isCopied ? t.result.copied : t.result.copy,
                    onClick: handleCopy
                  }}
                />
                {/* Translate button with dropdown */}
                <XButton
                    type="split"
                    mainButton={{
                      icon: <icons.Languages className="w-5 h-5 mr-1" />,
                      text: "Translate",
                      onClick: handleTranslate,
                    }}
                    menuItems={[
                      {
                        icon: <icons.Languages className="w-5 h-5 mr-1" />,
                        text: "Chinese",
                        onClick: () => translateToLanguage('Chinese'),
                        tag: { text: "Hot", color: "#f59e0b" }
                      },
                      {
                        icon: <icons.Languages className="w-5 h-5 mr-1" />,
                        text: "Spanish",
                        onClick: () => translateToLanguage('Spanish'),
                        tag: { text: "New", color: "#10b981" }
                      },
                      {
                        icon: <icons.Languages className="w-5 h-5 mr-1" />,
                        text: "Japanese",
                        onClick: () => translateToLanguage('Japanese'),
                        tag: { text: "Beta" }
                      },
                    ]}
                  />
              </div>
            </div>
            <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{narration}</p>
            {/* 翻译结果区域 */}
            {translatedText && (
              <div className="mt-6">
                <hr className="my-2 border-t-2 border-border" />
                <div className="flex justify-start sm:justify-end items-center mb-2">
                  <XButton
                    type="single"
                    minWidth="min-w-[110px]"
                    button={{
                      icon: isCopiedTranslation ? <icons.CheckCheck className="w-5 h-5 mr-1" /> : <icons.Copy className="w-5 h-5 mr-1" />,
                      text: isCopiedTranslation ? t.result.copied : t.result.copy,
                      onClick: handleCopyTranslation
                    }}
                  />
                </div>
                <div className="text-foreground/80 leading-relaxed whitespace-pre-wrap">{translatedText}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="border-2 border-border rounded-lg text-center space-y-3 py-8">
            <div className="mx-auto w-12 h-12 bg-gradient-to-r from-purple-400 to-pink-600 rounded-full flex items-center justify-center">
              <icons.Sparkles className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{t.ready.title}</h3>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              {(!uploadedImageUrl ? t.ready.prefixDesc + ' ' : '') + t.ready.desc1}
              <br />
              {t.ready.desc2}
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span>
                {uploadedImageUrl
                  ? t.ready.generating
                  : t.ready.waiting}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
