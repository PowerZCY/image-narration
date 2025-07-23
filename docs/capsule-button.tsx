'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { globalLucideIcons as icons } from '@windrun-huaiin/base-ui/components/server'

// 基础按钮配置
interface BaseButtonConfig {
  icon: ReactNode
  text: string
  onClick: () => void | Promise<void>
  disabled?: boolean
}

// 菜单项配置
interface MenuItemConfig extends BaseButtonConfig {
  tag?: {
    text: string
    color?: string
  }
}

// 单按钮配置
interface SingleButtonProps {
  type: 'single'
  button: BaseButtonConfig
  loadingText?: string
  minWidth?: string
  className?: string
}

// 分离式按钮配置
interface SplitButtonProps {
  type: 'split'
  mainButton: BaseButtonConfig
  menuItems: MenuItemConfig[]
  loadingText?: string
  menuWidth?: string
  className?: string
}

type CapsuleButtonProps = SingleButtonProps | SplitButtonProps

export function CapsuleButton(props: CapsuleButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    if (props.type === 'split') {
      const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          setMenuOpen(false)
        }
      }

      if (menuOpen) {
        document.addEventListener('mousedown', handleClickOutside)
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [menuOpen, props.type])

  // 处理按钮点击
  const handleButtonClick = async (onClick: () => void | Promise<void>) => {
    if (isLoading) return

    setIsLoading(true)
    try {
      await onClick()
    } catch (error) {
      console.error('Button click error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 基础样式类
  const baseButtonClass = "flex items-center justify-center px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-white text-sm font-semibold transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700"
  const disabledClass = "opacity-60 cursor-not-allowed"

  if (props.type === 'single') {
    const { button, loadingText = 'Loading...', minWidth = 'min-w-[110px]', className = '' } = props
    const isDisabled = button.disabled || isLoading

    return (
      <button
        onClick={() => handleButtonClick(button.onClick)}
        disabled={isDisabled}
        className={`${minWidth} ${baseButtonClass} rounded-full ${isDisabled ? disabledClass : ''} ${className}`}
        title={button.text}
      >
        {isLoading ? (
          <>
            <icons.Loader2 className="w-5 h-5 mr-1 animate-spin" />
            <span>{loadingText}</span>
          </>
        ) : (
          <>
            {button.icon}
            <span>{button.text}</span>
          </>
        )}
      </button>
    )
  }

  // Split button
  const { mainButton, menuItems, loadingText = 'Loading...', menuWidth = 'w-40', className = '' } = props
  const isMainDisabled = mainButton.disabled || isLoading

  return (
    <div className={`relative flex bg-neutral-100 dark:bg-neutral-800 rounded-full ${className}`}>
      {/* 左侧主按钮 */}
      <button
        onClick={() => handleButtonClick(mainButton.onClick)}
        disabled={isMainDisabled}
        className={`flex-1 ${baseButtonClass} rounded-l-full ${isMainDisabled ? disabledClass : ''}`}
        onMouseDown={e => { if (e.button === 2) e.preventDefault() }}
      >
        {isLoading ? (
          <>
            <icons.Loader2 className="w-5 h-5 mr-1 animate-spin" />
            <span>{loadingText}</span>
          </>
        ) : (
          <>
            {mainButton.icon}
            <span>{mainButton.text}</span>
          </>
        )}
      </button>

      {/* 右侧下拉按钮 */}
      <span
        className="flex items-center justify-center w-10 py-2 cursor-pointer transition hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-r-full"
        onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
        tabIndex={0}
      >
        <icons.ChevronDown className="w-6 h-6" />
      </span>

      {/* 下拉菜单 */}
      {menuOpen && (
        <div
          ref={menuRef}
          className={`absolute right-0 top-full ${menuWidth} bg-white dark:bg-neutral-800 text-neutral-800 dark:text-white text-sm rounded-xl shadow-lg z-50 border border-neutral-200 dark:border-neutral-700 overflow-hidden animate-fade-in`}
        >
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                handleButtonClick(item.onClick)
                setMenuOpen(false)
              }}
              disabled={item.disabled}
              className={`flex items-center w-full px-4 py-3 transition hover:bg-neutral-200 dark:hover:bg-neutral-600 text-left relative ${item.disabled ? disabledClass : ''}`}
            >
              <span className="flex items-center">
                {item.icon}
                <span>{item.text}</span>
              </span>
              {item.tag && (
                <span
                  className="absolute right-3 top-1 text-[10px] font-semibold"
                  style={{ color: item.tag.color || '#a855f7', pointerEvents: 'none' }}
                >
                  {item.tag.text}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// 便捷的图标配置
export const CapsuleIcons = {
  copy: <icons.Copy className="w-5 h-5 mr-1" />,
  checkCheck: <icons.CheckCheck className="w-5 h-5 mr-1" />,
  globe: <icons.Globe className="w-5 h-5 mr-1" />,
  loader: <icons.Loader2 className="w-5 h-5 mr-1 animate-spin" />,
  download: <icons.Download className="w-5 h-5 mr-1" />,
  upload: <icons.ImageUp className="w-5 h-5 mr-1" />,
  share: <icons.Share className="w-5 h-5 mr-1" />,
  edit: <icons.Pencil className="w-5 h-5 mr-1" />,
} 