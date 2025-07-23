/* eslint-disable react/no-unescaped-entities */
'use client'

import Image from "next/image"
import { useState, useMemo, useEffect, useRef } from "react"
// import { useTranslations } from 'next-intl'
import { globalLucideIcons as icons} from '@windrun-huaiin/base-ui/components/server'
import { GradientButton } from "@windrun-huaiin/third-ui/fuma/mdx"
import { createR2Client } from "@/lib/r2-explorer-sdk"
import { appConfig } from "@/lib/appConfig"

export function Hero() {
  // const t = useTranslations('hero');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [narration, setNarration] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [translateMenuOpen, setTranslateMenuOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'Chinese' | 'Japanese' | 'Spanish'>('Chinese');
  const [isTranslating, setIsTranslating] = useState(false);
  const translateMenuRef = useRef<HTMLDivElement>(null);

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
      alert(`Failed to upload image: ${error instanceof Error ? error.message : 'Please try again.'}`);
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
      alert('Please upload an image first!');
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
      alert(`Failed to generate narration: ${error instanceof Error ? error.message : 'Please try again.'}`);
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
      alert('Failed to copy text. Please try again.');
    }
  };

  const translateToLanguage = async (language: 'Chinese' | 'Japanese' | 'Spanish') => {
    if (!narration.trim()) {
      alert('No text to translate');
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
      alert(`Failed to translate text: ${error instanceof Error ? error.message : 'Please try again.'}`);
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

  return (
    <section className="px-16 mx-16 md:mx-32 space-y-8">
      {/* 头部标题区域 */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl md:text-5xl font-bold leading-tight">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Image Narration
          </span>
        </h1>
        <span className="text-base md:text-2xl font-bold leading-tight">
            Transform your images into compelling stories with AI-powered
          </span>
      </div>

      {/* 上部分：左右两列布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 左列：图片上传区域 - 占3份 */}
        <div className="lg:col-span-3 space-y-3">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold">Upload Your Image</h3>
          </div>
          
          <div 
            onClick={handleImageClick}
            className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-purple-400 transition-colors min-h-[350px] flex items-center justify-center cursor-pointer relative"
          >
            {/* 格式说明 - 左上角 */}
            <div className="absolute top-3 left-3 text-xs text-muted-foreground text-gray-400">
              Support JPG, PNG, WEBP formats (max 10MB)
            </div>
            
            {selectedImage ? (
              <div className="w-full space-y-2">
                <div className="relative w-full max-w-lg mx-auto mt-4">
                  <Image
                    src={URL.createObjectURL(selectedImage)}
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
                        <p className="text-sm">Uploading...</p>
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
                    Choose Image
                  </div>
                  <p className="text-muted-foreground">or drag and drop here</p>
                </div>
              </div>
            )}
          </div>
          
          {/* 示例图片 */}
          <div className="mt-1 space-y-1 text-center">
            <p className="text-sm text-muted-foreground">No image? Try one of these</p>
            <div className="flex gap-2 justify-center">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-14 h-14 bg-muted rounded cursor-pointer hover:bg-muted/80 transition-colors flex items-center justify-center"
                >
                  <icons.ImageUp className="h-12 w-12 text-muted-foreground" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右列：提示词输入区域 - 占2份 */}
        <div className="lg:col-span-2 space-y-3 flex flex-col">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold">Prompt</h3>
              <span className="text-sm text-gray-400">(optional, Direct AI to specific aspects)</span>
            </div>
          </div>
          
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the mood or story of the image..."
            className="w-full flex-1 p-4 bg-transparent border-2 border-border rounded-lg resize-none focus:outline-none focus:border-purple-400 hover:border-purple-400 transition-colors text-foreground placeholder-muted-foreground placeholder:text-base min-h-[250px]"
            maxLength={400}
          />
          
          <div className="flex justify-end text-sm text-gray-400">
            <span>{prompt.length}/400</span>
          </div>

          <div className="flex justify-center">
            <GradientButton
              title={
                !uploadedImageUrl ? "Upload image first" : "Generate Narration"
              }
              onClick={uploadedImageUrl ? handleGenerate : undefined}
              disabled={!uploadedImageUrl || isGenerating}
              icon={isGenerating ? <icons.Loader2 className="h-4 w-4 animate-spin mx-auto" /> : <icons.Sparkles className="h-4 w-4 text-white" />}
              loadingText="Generate Narration"
            />
          </div>
        </div>
      </div>

      {/* 下部分：生成结果显示区域 */}
      <div className="space-y-4">
        {narration ? (
          <div className="border-2 border-border bg-card/30 rounded-lg p-5 space-y-3">
            <div className="flex justify-between items-start border-border border-b-2 pb-2">
              <h4 className="text-lg font-semibold text-foreground">Generated Narration</h4>
              <div className="flex gap-1">
                <button
                  onClick={handleCopy}
                  className="min-w-[110px] flex items-center justify-center px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-white text-sm font-semibold transition-colors rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  title={isCopied ? "Copied!" : "Copy"}
                >
                  {isCopied ? (
                    <>
                      <icons.CheckCheck className="w-5 h-5 mr-1" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <icons.Copy className="w-5 h-5 mr-1" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                {/* Translate button with dropdown */}
                <div className="relative flex bg-neutral-100 dark:bg-neutral-800 rounded-full">
                  {/* Left area: main operation */}
                  <button
                    className={`flex-1 flex items-center px-4 py-2 text-neutral-700 dark:text-white text-sm font-semibold transition focus:outline-none rounded-l-full hover:bg-neutral-200 dark:hover:bg-neutral-700 ${isTranslating ? 'opacity-60 cursor-not-allowed' : ''}`}
                    disabled={isTranslating}
                    onClick={handleTranslate}
                    onMouseDown={e => { if (e.button === 2) e.preventDefault(); }}
                  >
                    {isTranslating ? (
                      <icons.Loader2 className="w-5 h-5 mr-1 animate-spin" />
                    ) : (
                      <icons.Globe className="w-5 h-5 mr-1" />
                    )}
                    Translate
                  </button>
                  {/* Right area: dropdown */}
                  <span
                    className="flex items-center justify-center w-10 py-2 cursor-pointer transition hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-r-full"
                    onClick={e => { e.stopPropagation(); setTranslateMenuOpen(v => !v); }}
                    tabIndex={0}
                  >
                    <icons.ChevronDown className="w-6 h-6" />
                  </span>
                  {/* Dropdown menu */}
                  {translateMenuOpen && (
                    <div
                      ref={translateMenuRef}
                      className="absolute right-0 top-full w-40 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-white text-sm rounded-xl shadow-lg z-50 border border-neutral-200 dark:border-neutral-700 overflow-hidden animate-fade-in"
                    >
                      <button 
                        onClick={() => { setSelectedLanguage('Chinese'); translateToLanguage('Chinese'); setTranslateMenuOpen(false); }} 
                        className="flex items-center w-full px-4 py-3 transition hover:bg-neutral-200 dark:hover:bg-neutral-600 text-left relative"
                      >
                        <span className="flex items-center">
                          <icons.Globe className="w-5 h-5 mr-1" />
                          Chinese
                        </span>
                        <span
                          className="absolute right-3 top-1 text-[10px] font-semibold"
                          style={{ color: '#a855f7', pointerEvents: 'none' }}
                        >
                          Hot
                        </span>
                      </button>
                      <button 
                        onClick={() => { setSelectedLanguage('Japanese'); translateToLanguage('Japanese'); setTranslateMenuOpen(false); }} 
                        className="flex items-center w-full px-4 py-3 transition hover:bg-neutral-200 dark:hover:bg-neutral-600 text-left relative"
                      >
                        <span className="flex items-center">
                          <icons.Globe className="w-5 h-5 mr-1" />
                          Japanese
                        </span>
                        <span
                          className="absolute right-3 top-1 text-[10px] font-semibold"
                          style={{ color: '#a855f7', pointerEvents: 'none' }}
                        >
                          New
                        </span>
                      </button>
                      <button 
                        onClick={() => { setSelectedLanguage('Spanish'); translateToLanguage('Spanish'); setTranslateMenuOpen(false); }} 
                        className="flex items-center w-full px-4 py-3 transition hover:bg-neutral-200 dark:hover:bg-neutral-600 text-left relative"
                      >
                        <span className="flex items-center">
                          <icons.Globe className="w-5 h-5 mr-1" />
                          Spanish
                        </span>
                        <span
                          className="absolute right-3 top-1 text-[10px] font-semibold"
                          style={{ color: '#a855f7', pointerEvents: 'none' }}
                        >
                          Beta
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{narration}</p>
          </div>
        ) : (
          <div className="border-2 border-border rounded-lg text-center space-y-3 py-8">
            <div className="mx-auto w-12 h-12 bg-gradient-to-r from-purple-400 to-pink-600 rounded-full flex items-center justify-center">
              <icons.Sparkles className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Ready to Create Magic</h3>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              Select an image and click "Generate Narration" to transform<br />
              it into a compelling story with AI-powered creativity
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span>Waiting for your image...</span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

