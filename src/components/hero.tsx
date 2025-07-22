/* eslint-disable react/no-unescaped-entities */
'use client'

import Image from "next/image"
import { useState, useMemo } from "react"
import { useTranslations } from 'next-intl'
import { globalLucideIcons as icons} from '@windrun-huaiin/base-ui/components/server'
import { GradientButton } from "@windrun-huaiin/third-ui/fuma/mdx"
import { createR2Client } from "@/lib/r2-explorer-sdk"
import { appConfig } from "@/lib/appConfig"

export function Hero() {
  const t = useTranslations('hero');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [narration, setNarration] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // 缓存R2客户端，避免每次渲染重新创建
  const r2Client = useMemo(() => createR2Client({
    baseUrl: appConfig.r2.baseUrl,
    bucketName: appConfig.r2.bucketName,
    apiToken: appConfig.r2.apiToken
  }), []);

  const handleImageSelect = async (file: File) => {
    setSelectedImage(file);
    setIsUploading(true);
    
    try {
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
      // 可以添加错误提示给用户
      alert('Failed to upload image. Please try again.');
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
      // TODO: 实现AI生成逻辑
      // 这里会使用 uploadedImageUrl 和 prompt 调用AI接口
      console.log('Generating narration for image:', uploadedImageUrl);
      console.log('User prompt:', prompt);
      
      // 模拟API调用
      setTimeout(() => {
        setNarration(`AI Generated narration for the uploaded image: ${uploadedImageUrl.split('/').pop()}. User prompt: "${prompt || 'None'}". This is a placeholder text that will be replaced with actual AI-generated content.`);
        setIsGenerating(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to generate narration:', error);
      alert('Failed to generate narration. Please try again.');
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(narration);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleTranslate = () => {
    // TODO: 实现翻译逻辑
    console.log('Translate functionality to be implemented');
  };

  const handleClearImage = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡
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
          <div className="space-y-1 text-center">
            <p className="text-sm text-muted-foreground">No image? Try one of these</p>
            <div className="flex gap-2 justify-center">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-12 h-12 bg-muted rounded cursor-pointer hover:bg-muted/80 transition-colors flex items-center justify-center"
                >
                  <icons.ImageUp className="h-6 w-6 text-muted-foreground" />
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
            className="w-full flex-1 p-4 bg-transparent border-2 border-border rounded-lg resize-none focus:outline-none focus:border-purple-400 hover:border-purple-400 transition-colors text-foreground placeholder-muted-foreground min-h-[250px]"
            maxLength={400}
          />
          
          <div className="flex justify-end text-sm text-gray-400">
            <span>{prompt.length}/400</span>
          </div>

          <div className="flex justify-center">
            <div 
              className={!uploadedImageUrl ? "opacity-50 pointer-events-none" : ""}
              onClick={uploadedImageUrl ? handleGenerate : undefined}
            >
              <GradientButton
                title={
                  !uploadedImageUrl 
                    ? "📸 Upload image first" 
                    : isGenerating 
                      ? "⭐ Generating..." 
                      : "⭐ Generate Narration"
                }
                href="#"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 下部分：生成结果显示区域 */}
      <div className="space-y-4">
        {narration ? (
          <div className="border-2 border-border bg-card/30 rounded-lg p-5 space-y-3">
            <div className="flex justify-between items-start">
              <h4 className="text-lg font-semibold text-foreground">Generated Narration</h4>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="p-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                  title="Copy text"
                >
                  <icons.Copy className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  onClick={handleTranslate}
                  className="p-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                  title="Translate text"
                >
                  <icons.Globe className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>
            <p className="text-foreground/90 leading-relaxed">{narration}</p>
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

