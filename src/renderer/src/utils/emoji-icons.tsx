/**
 * 手绘风格 SVG 图标 — 替代所有 emoji
 *
 * 用法：
 *   1. 在 JSX 中直接使用图标组件：  <EmojiWarning size={16} />
 *   2. 在文本中替换 emoji：        replaceEmojiWithSvg("⚠️ 警告")
 *                                  返回带 <svg> 标签的 HTML 字符串
 */

import React from 'react'

// ============================================================
// 手绘 SVG 图标组件
// ============================================================

interface EmojiIconProps {
  size?: number
  className?: string
}

// --- 状态类 ---

export function IconCheck({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1" />
      <path d="M7 13l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCross({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1" />
      <path d="M8 8l8 8M8 16l8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconWarning({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3L2 21h20L12 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 10v4M12 17v0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconErrorCircle({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1" />
      <path d="M12 8v4M12 16v0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconSuccess({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1" />
      <path d="M7 12.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconPending({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconSkipped({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1" />
      <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// --- 对象/动作类 ---

export function IconSearch({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconKey({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="8" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 12h8M18 12v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconGlobe({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="12" cy="12" rx="4" ry="10" stroke="currentColor" strokeWidth="1" />
      <path d="M2 12h20" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

export function IconBot({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="6" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <path d="M9 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="3" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 5v3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function IconPhone({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="5" y="2" width="14" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 18h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconRefresh({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M21 12a9 9 0 0 0-9-9 9 9 0 0 0-9 9 9 9 0 0 0 9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconSettings({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconClipboard({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="3" width="16" height="19" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 3h6a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconDocument({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconRuler({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="18" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 6h2M9 6h2M13 6h2M17 6h2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M12 9v12M12 15l-3 3M12 15l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconStop({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function IconClock({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconUser({ size = 16, className }: EmojiIconProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ============================================================
// Emoji → SVG 字符串映射（用于文本替换）
// ============================================================

const EMOJI_SVG_MAP: Record<string, string> = {
  '⚠️': '<svg class="emoji-icon emoji-warning" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><path d="M12 3L2 21h20L12 3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 10v4M12 17v0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  '⚠': '<svg class="emoji-icon emoji-warning" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><path d="M12 3L2 21h20L12 3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 10v4M12 17v0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  '❌': '<svg class="emoji-icon emoji-error" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 1"/><path d="M8 8l8 8M8 16l8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  '✅': '<svg class="emoji-icon emoji-success" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 1"/><path d="M7 13l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '✓': '<svg class="emoji-icon emoji-check" width="15" height="15" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '✗': '<svg class="emoji-icon emoji-cross" width="15" height="15" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><path d="M6 6l12 12M6 18L18 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  '✕': '<svg class="emoji-icon emoji-cross" width="15" height="15" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><path d="M6 6l12 12M6 18L18 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  '⊘': '<svg class="emoji-icon emoji-skipped" width="15" height="15" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 1"/><path d="M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  '🔑': '<svg class="emoji-icon emoji-key" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><circle cx="8" cy="12" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M13 12h8M18 12v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  '📏': '<svg class="emoji-icon emoji-ruler" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><rect x="3" y="3" width="18" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M5 6h2M9 6h2M13 6h2M17 6h2" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><path d="M12 9v12M12 15l-3 3M12 15l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  '🌐': '<svg class="emoji-icon emoji-globe" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="4" ry="10" stroke="currentColor" stroke-width="1"/><path d="M2 12h20" stroke="currentColor" stroke-width="1"/></svg>',
  '🤖': '<svg class="emoji-icon emoji-bot" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><rect x="4" y="6" width="16" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><path d="M9 17h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="3" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M12 5v3" stroke="currentColor" stroke-width="1.5"/></svg>',
  '🔄': '<svg class="emoji-icon emoji-refresh" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><path d="M21 12a9 9 0 0 0-9-9 9 9 0 0 0-9 9 9 9 0 0 0 9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M21 3v6h-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '⚙️': '<svg class="emoji-icon emoji-settings" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  '📋': '<svg class="emoji-icon emoji-clipboard" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><rect x="4" y="3" width="16" height="19" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M9 3h6a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.5"/><path d="M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  '📄': '<svg class="emoji-icon emoji-document" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 2v6h6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  '📱': '<svg class="emoji-icon emoji-phone" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><rect x="5" y="2" width="14" height="20" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M8 18h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  '⏹': '<svg class="emoji-icon emoji-stop" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.5"/></svg>',
  '⏰': '<svg class="emoji-icon emoji-clock" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  '🧑': '<svg class="emoji-icon emoji-user" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  '⏳': '<svg class="emoji-icon emoji-pending" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 1"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  '⏭️': '<svg class="emoji-icon emoji-skip" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><path d="M5 4l10 8-10 8V4zM19 5v14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '🔍': '<svg class="emoji-icon emoji-search" width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-3px;display:inline"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
}

/**
 * 替换文本中的 emoji 为手绘 SVG 图标（HTML 字符串）
 * 用于 Markdown 渲染前的预处理
 *
 * 安全说明：先转义 HTML 特殊字符（防止 AI 输出中的恶意 HTML 被 rehype-raw 渲染导致 XSS），
 * 再注入受信任的 SVG 字符串。SVG 来自固定映射表 EMOJI_SVG_MAP，不含用户输入，安全。
 */
export function replaceEmojiWithSvg(text: string): string {
  // 先转义 HTML 特殊字符，防止 AI 输出中的 <script>、<img onerror> 等被 rehype-raw 渲染
  let result = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  // 再将 emoji 替换为受信任的 SVG HTML（在转义之后注入，不受转义影响）
  for (const [emoji, svg] of Object.entries(EMOJI_SVG_MAP)) {
    result = result.split(emoji).join(svg)
  }
  return result
}

/**
 * 检测文本中是否包含特定类型的 emoji（用于 ChatMessage 样式判断）
 * 在 emoji 已被替换为 SVG 后，改用 CSS class 检测
 */
export function hasEmojiType(text: string, type: 'warning' | 'error' | 'success' | 'key' | 'ruler' | 'globe' | 'bot'): boolean {
  return text.includes(`emoji-${type}`)
}