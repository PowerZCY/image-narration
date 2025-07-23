/* eslint-disable react/no-unescaped-entities */
'use client'

import { appConfig } from "@/lib/appConfig"
import { createR2Client } from "@/lib/r2-explorer-sdk"
import { globalLucideIcons as icons } from '@windrun-huaiin/base-ui/components/server'
import { GradientButton } from "@windrun-huaiin/third-ui/fuma/mdx"
import { AdsAlertDialog, XButton } from "@windrun-huaiin/third-ui/main"
import { useTranslations } from 'next-intl'
import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"

export function Hero() {
  const t = useTranslations('hero');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null); // 新增缓存图片URL
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [narration, setNarration] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [translateMenuOpen, setTranslateMenuOpen] = useState(false);
  const [selectedLanguage, _setSelectedLanguage] = useState<'Chinese' | 'Japanese' | 'Spanish'>('Chinese');
  const [_isTranslating, setIsTranslating] = useState(false);
  const translateMenuRef = useRef<HTMLDivElement>(null);
  // 统一错误弹窗管理
  const [errorDialog, setErrorDialog] = useState<{ open: boolean, title: string, description: string }>({ open: false, title: '', description: '' });

  // 缓存R2客户端，避免每次渲染重新创建
  const r2Client = useMemo(() => createR2Client({
    baseUrl: appConfig.r2.baseUrl,
    bucketName: appConfig.r2.bucketName,
    apiToken: appConfig.r2.apiToken
  }), []);

  // 只在selectedImage变化时生成blob URL，避免每次渲染都生成新URL
  useEffect(() => {
    if (selectedImage) {
      const url = URL.createObjectURL(selectedImage);
      setImageUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setImageUrl(null);
    }
  }, [selectedImage]);

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
    setSelectedImage(file);
    setIsUploading(true);
    
    try {
      // 检查是否启用R2 Mock模式
      if (appConfig.r2.enableMock) {
        console.warn('[R2-Mock] Using mock upload, no actual file uploaded');
        await new Promise(resolve => setTimeout(resolve, appConfig.r2.mockTimeout));
        const mockUrl = appConfig.r2.mockImgUrl;
        
        setUploadedImageUrl(mockUrl);
        console.log('Mock upload successful:', mockUrl);
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
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/jpg,image/png,image/webp';
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
      console.log('User prompt:', prompt);
      
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
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (result.text) {
        setNarration(result.text);
        console.log('AI narration generated successfully');
      } else {
        throw new Error('No text content received from AI');
      }
    } catch (error) {
      console.error('Failed to generate narration:', error);
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
        setNarration(result.text);
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

  const handleTranslate = () => translateToLanguage(selectedLanguage);

  const handleClearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedImage(null);
    setUploadedImageUrl('');
  };

  // 获取示例图片urls（如有）
  const noImageUrls = (t.raw('upload.noImageUrls') as string[]) || [];

  return (
    <section className="px-16 mx-16 md:mx-32 space-y-8">
      {/* 错误弹窗 */}
      <AdsAlertDialog
        open={errorDialog.open}
        onOpenChange={open => {
          if (!open) setErrorDialog({ open: false, title: '', description: '' });
        }}
        title={errorDialog.title}
        description={errorDialog.description}
        imgSrc="/ads/Ad-Pollo.webp"
        imgHref="https://pollo.ai/home?ref=mzmzndj&tm_news=news"
      />
      {/* 头部标题区域 */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl md:text-5xl font-bold leading-tight">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            {t('main.eyesOn')}
          </span>
        </h1>
        <span className="text-base md:text-2xl font-bold leading-tight">
            {t('main.title')}
          </span>
      </div>

      {/* 上部分：左右两列布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
        {/* 左列：图片上传区域 - 占3份 */}
        <div className="lg:col-span-3 space-y-3">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold">{t('upload.title')}</h3>
          </div>
          
          <div 
            onClick={handleImageClick}
            onDragOver={e => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={e => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files?.[0];
              if (file) {
                handleImageSelect(file);
              }
            }}
            className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-purple-400 transition-colors min-h-[380px] flex items-center justify-center cursor-pointer relative"
          >
            {/* 格式说明 - 左上角 */}
            <div className="absolute top-3 left-3 text-xs text-muted-foreground text-gray-400">
              {t('upload.tip')}
            </div>
            
            {selectedImage ? (
              <div className="w-full space-y-2">
                <div className="relative w-full max-w-lg mx-auto mt-4">
                  {imageUrl && (
                    <Image
                      src={imageUrl}
                      alt="Selected image"
                      width={500}
                      height={400}
                      className="w-full h-auto max-h-[260px] rounded-lg object-contain"
                    />
                  )}
                  
                  {/* 上传进度覆盖层 */}
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                      <div className="text-white text-center space-y-2">
                        <icons.Loader2 className="h-8 w-8 animate-spin mx-auto" />
                        <p className="text-sm">{t('upload.uploading')}</p>
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
                    <p className="text-sm text-muted-foreground">{selectedImage.name}</p>
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
                    {t('upload.choose')}
                  </div>
                  <p className="text-muted-foreground">{t('upload.dragTip')}</p>
                </div>
              </div>
            )}
          </div>
          
          {/* 示例图片 */}
          <div className="mt-1 space-y-1 text-center">
            <p className="text-sm text-muted-foreground">{t('upload.noImageTip')}</p>
            <div className="flex gap-2 justify-center">
              {noImageUrls.length > 0
                ? noImageUrls.map((url: string, idx: number) => (
                    <div
                      key={idx}
                      className="w-12 h-12 bg-muted rounded cursor-pointer hover:bg-muted/80 transition-colors flex items-center justify-center overflow-hidden"
                    >
                      <Image src={url} alt="Example" width={48} height={48} className="object-cover w-12 h-12" />
                    </div>
                  ))
                : [1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-12 h-12 bg-muted rounded cursor-pointer hover:bg-muted/80 transition-colors flex items-center justify-center"
                    >
                      <icons.ImageUp className="h-12 w-12" />
                    </div>
                  ))}
            </div>
          </div>
        </div>

        {/* 右列：提示词输入区域 - 占2份 */}
        <div className="lg:col-span-2 space-y-3 flex flex-col">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold">{t('prompt.title')}</h3>
              <span className="text-sm text-gray-400">{t('prompt.tip')}</span>
            </div>
          </div>
          
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('prompt.placeholder')}
            className="w-full flex-1 p-4 bg-transparent border-2 border-border rounded-lg resize-none focus:outline-none focus:border-purple-400 hover:border-purple-400 transition-colors text-foreground placeholder-muted-foreground placeholder:text-base min-h-[250px]"
            maxLength={400}
          />
          
          <div className="flex justify-end text-sm text-gray-400">
            <span>{prompt.length}/400</span>
          </div>

          <div className="flex justify-center">
            <GradientButton
              title={
                !uploadedImageUrl ? t('button.uploadFirst') : t('button.generate')
              }
              onClick={uploadedImageUrl ? handleGenerate : undefined}
              disabled={!uploadedImageUrl || isGenerating}
              icon={isGenerating ? <icons.Loader2 className="h-4 w-4 animate-spin mx-auto" /> : <icons.Sparkles className="h-4 w-4 text-white" />}
            />
          </div>
        </div>
      </div>

      {/* 下部分：生成结果显示区域 */}
      <div className="space-y-4">
        {narration ? (
          <div className="border-2 border-border bg-card/30 rounded-lg p-5 space-y-3">
            <div className="flex justify-between items-start border-border border-b-2 pb-2">
              <h4 className="text-lg font-semibold text-foreground">{t('result.title')}</h4>
              <div className="flex gap-1">
                <XButton
                  type="single"
                  minWidth="min-w-[110px]"
                  button={{
                    icon: isCopied ? <icons.CheckCheck className="w-5 h-5 mr-1" /> : <icons.Copy className="w-5 h-5 mr-1" />,
                    text: isCopied ? t('result.copied') : t('result.copy'),
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
          </div>
        ) : (
          <div className="border-2 border-border rounded-lg text-center space-y-3 py-8">
            <div className="mx-auto w-12 h-12 bg-gradient-to-r from-purple-400 to-pink-600 rounded-full flex items-center justify-center">
              <icons.Sparkles className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{t('ready.title')}</h3>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              {(!uploadedImageUrl ? t('ready.prefixDesc') + ' ' : '') + t('ready.desc1')}
              <br />
              {t('ready.desc2')}
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span>
                {uploadedImageUrl
                  ? t('ready.generating')
                  : t('ready.waiting')}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

