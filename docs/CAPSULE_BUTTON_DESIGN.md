# 胶囊按钮组 (Capsule Button Group) 设计文档

## 🎨 设计理念

胶囊按钮组是一个现代化的UI组件，旨在提供优雅、一致的用户交互体验。它融合了视觉美学和功能性，适用于各种操作场景。

## 📐 设计规范

### 视觉设计

#### 基础形状
- **胶囊形状**: 使用 `rounded-full` 实现完整的胶囊圆角
- **统一高度**: 所有按钮保持一致的垂直尺寸 (`py-2`)
- **流畅边界**: 左右组件无缝连接，形成完整胶囊

#### 颜色系统
```css
/* 亮色主题 */
背景色: bg-neutral-100
文字色: text-neutral-700
悬浮色: hover:bg-neutral-200
边框色: border-neutral-200

/* 暗色主题 */
背景色: dark:bg-neutral-800
文字色: dark:text-white
悬浮色: dark:hover:bg-neutral-700
边框色: dark:border-neutral-700
```

#### 状态设计
- **正常状态**: 清晰可见，交互友好
- **悬浮状态**: 背景色加深，提供视觉反馈
- **加载状态**: 旋转图标 + 置灰效果 + 描述文字
- **禁用状态**: 60% 透明度 + 禁止鼠标事件

### 交互设计

#### 单按钮交互
1. 点击触发主要操作
2. 加载期间显示加载状态
3. 操作完成后恢复正常状态

#### 分离式按钮交互
1. **左侧主按钮**: 执行默认/最常用操作
2. **右侧下拉**: 展开更多选项菜单
3. **菜单项**: 独立的操作选项，支持标签装饰

## 🔧 技术实现

### 组件架构

```typescript
// 基础配置接口
interface BaseButtonConfig {
  icon: ReactNode          // 按钮图标
  text: string            // 按钮文字
  onClick: () => void | Promise<void>  // 点击处理
  disabled?: boolean      // 禁用状态
}

// 菜单项配置
interface MenuItemConfig extends BaseButtonConfig {
  tag?: {
    text: string         // 标签文字
    color?: string       // 标签颜色
  }
}
```

### 自动化功能

#### 加载状态管理
- 自动检测 async 函数
- 自动切换加载图标和文字
- 自动禁用按钮防止重复点击
- 异常处理和状态恢复

#### 菜单管理
- 自动点击外部关闭
- 自动选项状态同步
- 自动z-index层级管理

## 📱 响应式设计

### 尺寸适配
- **最小宽度**: 可配置防止文字变化导致抖动
- **菜单宽度**: 根据内容自适应或固定宽度
- **间距系统**: 统一的 padding 和 margin 规范

### 主题适配
- 完全支持亮色/暗色主题
- 自动跟随系统主题切换
- 保持在任何主题下的可读性

## 🎯 使用场景

### 1. 内容操作
```typescript
// 复制文本
<CapsuleButton
  type="single"
  button={{
    icon: isCopied ? CapsuleIcons.checkCheck : CapsuleIcons.copy,
    text: isCopied ? "Copied!" : "Copy",
    onClick: handleCopy
  }}
  loadingText="Copying..."
  minWidth="min-w-[110px]"
/>
```

### 2. 多选项操作
```typescript
// 翻译功能
<CapsuleButton
  type="split"
  mainButton={{
    icon: CapsuleIcons.globe,
    text: "Translate",
    onClick: handleTranslate
  }}
  menuItems={[
    {
      icon: CapsuleIcons.globe,
      text: "Chinese",
      onClick: () => translateTo('Chinese'),
      tag: { text: "Hot", color: "#f59e0b" }
    }
  ]}
/>
```

### 3. 下载/导出
```typescript
// 文件下载
<CapsuleButton
  type="split"
  mainButton={{
    icon: CapsuleIcons.download,
    text: "Download JPG",
    onClick: downloadJPG
  }}
  menuItems={[
    { icon: CapsuleIcons.download, text: "Download PNG", onClick: downloadPNG },
    { icon: CapsuleIcons.download, text: "Download WEBP", onClick: downloadWEBP }
  ]}
/>
```

## 🎨 设计原则

### 1. 一致性原则
- 所有胶囊按钮使用相同的视觉语言
- 统一的尺寸、间距、颜色规范
- 一致的交互行为和反馈

### 2. 功能性原则
- 左侧主操作，右侧扩展选项
- 清晰的视觉层级和操作优先级
- 自动化的状态管理减少开发成本

### 3. 可用性原则
- 足够的点击目标尺寸
- 清晰的视觉反馈
- 支持键盘导航和屏幕阅读器

### 4. 美观性原则
- 现代化的胶囊外观
- 流畅的过渡动画
- 精致的细节处理

## 🔧 自定义配置

### 样式自定义
```typescript
<CapsuleButton
  className="custom-styles"      // 额外样式类
  minWidth="min-w-[120px]"      // 最小宽度
  menuWidth="w-52"              // 菜单宽度
/>
```

### 图标库
```typescript
// 预定义图标
export const CapsuleIcons = {
  copy: <icons.Copy className="w-5 h-5 mr-1" />,
  globe: <icons.Globe className="w-5 h-5 mr-1" />,
  download: <icons.Download className="w-5 h-5 mr-1" />,
  // ...更多图标
}
```

## 🚀 最佳实践

### 1. 文字长度
- 保持按钮文字简洁明了
- 使用最小宽度防止布局抖动
- 考虑多语言环境下的文字长度变化

### 2. 图标选择
- 使用语义明确的图标
- 保持图标风格一致
- 适当的图标尺寸 (w-5 h-5)

### 3. 菜单设计
- 合理的选项数量 (建议不超过8个)
- 逻辑分组和分隔线
- 适当使用标签突出重要选项

### 4. 加载状态
- 提供有意义的加载文字
- 合理的操作超时时间
- 错误状态的用户友好提示

## 📊 性能考虑

### 组件优化
- 使用 React.memo 避免不必要的重渲染
- 合理的状态提升和下沉
- 事件处理函数的 useCallback 优化

### 样式优化
- 使用 Tailwind 的 JIT 模式
- 避免运行时样式计算
- 合理的 CSS 类名复用

## 🎯 设计提示词

### 为AI生成设计稿
```
设计一个现代化的胶囊按钮组组件，具有以下特征：

视觉特征：
- 完整的胶囊形状，圆润的边角
- 左右两部分：主操作按钮 + 下拉菜单按钮
- 统一的背景色和悬浮效果
- 支持亮色和暗色主题

交互特征：
- 点击主按钮执行默认操作
- 点击右侧下拉箭头展开菜单
- 加载时显示旋转图标和置灰效果
- 菜单项支持标签装饰（如"Beta"、"New"等）

设计风格：
- 现代简约，符合Material Design或Apple Design规范
- 细腻的阴影和过渡动画
- 高对比度，确保可访问性
- 与Tailwind CSS的设计语言保持一致
```

这个设计文档为胶囊按钮组提供了完整的设计指导，从视觉规范到技术实现，从使用场景到最佳实践，帮助设计师和开发者创建一致、优雅的用户界面。 
