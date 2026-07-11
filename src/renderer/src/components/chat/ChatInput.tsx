import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Send, Zap, Bot, ClipboardList, FileText } from 'lucide-react'
import { clsx } from 'clsx'
import type { QuickCommand, ChatMode } from '@shared/types'
import { useSessionStore } from '../../store/session.store'

interface ChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
}

/** 模式选项配置 */
const MODE_OPTIONS: Array<{ mode: ChatMode; label: string; icon: typeof Bot; hint: string }> = [
  { mode: 'task', label: '自动', icon: Bot, hint: 'AI 自主执行任务' },
  { mode: 'plan', label: '计划', icon: ClipboardList, hint: 'AI 只做分析与规划，确认后执行' },
  { mode: 'spec', label: '规格', icon: FileText, hint: 'AI 先写规格文档，审核后实现' }
]

/** 全局事件：请求聚焦聊天输入框 */
const FOCUS_CHAT_INPUT_EVENT = 'xcomputer:focus-chat-input'

export function focusChatInput(): void {
  window.dispatchEvent(new CustomEvent(FOCUS_CHAT_INPUT_EVENT))
}

export function ChatInput({ onSend, disabled }: ChatInputProps): JSX.Element {
  const [text, setText] = useState('')
  const [shortcuts, setShortcuts] = useState<QuickCommand[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [mode, setMode] = useState<ChatMode>('task')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const currentSessionId = useSessionStore((s) => s.currentSessionId)

  /** 安全聚焦 textarea 并将光标移到末尾 */
  const focusTextarea = useCallback((): void => {
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el && !el.isContentEditable && document.activeElement !== el) {
        el.focus()
        const len = el.value.length
        try {
          el.setSelectionRange(len, len)
        } catch {
          // ignore
        }
      }
    })
  }, [])

  // 加载快捷指令列表
  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const list = await window.api.shortcut.list()
        setShortcuts(list.filter((s) => s.enabled))
      } catch (err) {
        console.error('[ChatInput] load shortcuts failed:', err)
      }
    })()
    const unsub = window.api.shortcut.onChanged(() => {
      void (async (): Promise<void> => {
        try {
          const list = await window.api.shortcut.list()
          setShortcuts(list.filter((s) => s.enabled))
        } catch {
          // ignore
        }
      })()
    })
    return unsub
  }, [])

  // 订阅模式变更（来自按钮点击或 /plan /spec /auto 指令），同步当前会话模式
  useEffect(() => {
    const unsub = window.api.chat.onModeChanged((payload) => {
      if (payload.sessionId === useSessionStore.getState().currentSessionId) {
        setMode(payload.mode)
      }
    })
    return unsub
  }, [])

  // 切换会话时从主进程查询该会话当前模式（模式按会话隔离，存储于主进程内存）
  useEffect(() => {
    if (!currentSessionId) {
      setMode('task')
      return
    }
    void window.api.chat
      .getMode(currentSessionId)
      .then((m) => setMode(m))
      .catch(() => setMode('task'))
  }, [currentSessionId])

  // 切换工作模式
  const handleSetMode = useCallback(
    (targetMode: ChatMode): void => {
      const sid = useSessionStore.getState().currentSessionId
      if (!sid) return
      setMode(targetMode)
      void window.api.chat.setMode(sid, targetMode).catch((err) => {
        console.error('[ChatInput] setMode failed:', err)
      })
    },
    []
  )

  // 自适应高度
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  // 场景1：组件挂载后自动聚焦（新建会话首次显示）
  useEffect(() => {
    const timer = setTimeout(() => focusTextarea(), 100)
    return () => clearTimeout(timer)
  }, [])

  // 场景1.5：切换会话时（currentSessionId 变化）重新聚焦
  useEffect(() => {
    if (currentSessionId) {
      const timer = setTimeout(() => focusTextarea(), 150)
      return () => clearTimeout(timer)
    }
  }, [currentSessionId, focusTextarea])

  // 场景2：流式结束（disabled 从 true 变 false）时重新聚焦
  const disabledRef = useRef(disabled)
  useEffect(() => {
    if (disabledRef.current && !disabled) {
      focusTextarea()
    }
    disabledRef.current = disabled
  }, [disabled, focusTextarea])

  // 场景3：监听全局"聚焦输入框"事件（模态框/命令面板关闭时派发）
  useEffect(() => {
    const handler = (): void => {
      if (!disabled) focusTextarea()
    }
    window.addEventListener(FOCUS_CHAT_INPUT_EVENT, handler)
    return () => window.removeEventListener(FOCUS_CHAT_INPUT_EVENT, handler)
  }, [disabled, focusTextarea])

  // 场景4：窗口从后台恢复时聚焦
  useEffect(() => {
    const handler = (): void => {
      if (!disabled) focusTextarea()
    }
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [disabled, focusTextarea])

  // 解析当前输入是否为快捷指令触发（以 / 开头，无空格）
  const shortcutQuery = useMemo((): string | null => {
    if (!text.startsWith('/')) return null
    // 仅当 / 后没有空格时才触发建议
    const rest = text.slice(1)
    if (rest.includes(' ')) return null
    return rest
  }, [text])

  // 匹配的快捷指令建议
  const suggestions = useMemo((): QuickCommand[] => {
    if (shortcutQuery === null) return []
    const q = shortcutQuery.toLowerCase()
    if (q === '') return shortcuts.slice(0, 8)
    return shortcuts
      .filter((s) => s.keyword.toLowerCase().startsWith(q))
      .slice(0, 8)
  }, [shortcutQuery, shortcuts])

  // 建议列表打开时，重置选中索引
  useEffect(() => {
    setSelectedIdx(0)
  }, [shortcutQuery])

  const showSuggestions = suggestions.length > 0

  // 展开快捷指令：返回展开后的文本
  const expandShortcut = useCallback((s: QuickCommand): string => {
    if (s.steps && s.steps.length > 0) {
      return s.steps[0]
    }
    return s.prompt
  }, [])

  // 选择某个建议项
  const selectSuggestion = useCallback(
    (s: QuickCommand): void => {
      const expanded = expandShortcut(s)
      setText(expanded)
      // 通知主进程增加使用次数
      void window.api.shortcut.expand(s.keyword).catch(() => {
        // ignore
      })
      focusTextarea()
    },
    [expandShortcut, focusTextarea]
  )

  const handleSend = (): void => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    // 发送后立即重置高度，避免空内容时残留高度
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) el.style.height = 'auto'
    })
    // 发送后重新聚焦，方便连续输入
    focusTextarea()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // 快捷指令建议列表打开时的键盘处理
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((prev) => (prev + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const selected = suggestions[selectedIdx]
        if (selected) {
          selectSuggestion(selected)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setText('')
        return
      }
    } else {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
      if (e.key === 'Escape' && text) {
        setText('')
      }
    }
  }

  return (
    <div className="relative flex flex-col">
      {/* 快捷指令建议列表 */}
      {showSuggestions && (
        <div className="absolute bottom-full left-0 right-0 mb-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-bg-panel shadow-lg">
          <div className="border-b border-border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
            <Zap size={10} className="mr-1 inline" />
            快捷指令（↑↓ 选择，Tab/Enter 确认，Esc 取消）
          </div>
          {suggestions.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => selectSuggestion(s)}
              onMouseEnter={() => setSelectedIdx(idx)}
              className={clsx(
                'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors',
                idx === selectedIdx
                  ? 'bg-accent/10'
                  : 'hover:bg-bg-hover'
              )}
            >
              <code className="mt-0.5 flex-shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-mono text-accent">
                /{s.keyword}
              </code>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-text-primary">
                    {s.name}
                  </span>
                  {s.steps && s.steps.length > 0 && (
                    <span className="flex-shrink-0 rounded bg-bg-hover px-1 text-[9px] text-text-secondary">
                      {s.steps.length} 步
                    </span>
                  )}
                </div>
                {s.description && (
                  <p className="truncate text-[10px] text-text-muted">
                    {s.description}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      {/* 工作模式切换栏 */}
      <div className="mb-1.5 flex items-center gap-1">
        {MODE_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const active = mode === opt.mode
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => handleSetMode(opt.mode)}
              title={opt.hint}
              className={clsx(
                'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
              )}
            >
              <Icon size={12} />
              {opt.label}
            </button>
          )
        })}
        <span className="ml-1 truncate text-[10px] text-text-muted">
          {mode === 'plan'
            ? '计划模式：AI 只规划不执行，回复「确认」后执行'
            : mode === 'spec'
              ? '规格模式：AI 先写规格文档，审核后实现'
              : ''}
        </span>
      </div>
      <div
        className={clsx(
          'flex items-end gap-2 rounded-xl border bg-bg-input px-3 py-2 shadow-sm transition-all animate-fade-in-up',
          disabled
            ? 'border-border opacity-60'
            : 'border-border focus-within:border-accent focus-within:shadow-md focus-within:ring-1 focus-within:ring-accent/30'
        )}
        onClick={() => focusTextarea()}
      >
        <textarea
          ref={textareaRef}
          className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
          placeholder="输入指令，例如：打开记事本写一首诗... (Enter 发送 / Shift+Enter 换行 / 输入 / 触发快捷指令 / /plan /spec 切换模式)"
          aria-label="消息输入框"
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className={clsx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200',
            text.trim() && !disabled
              ? 'bg-gradient-to-br from-accent to-accent-hover text-white shadow-sm hover:shadow-md hover:scale-110 active:scale-90'
              : 'bg-bg-hover text-text-muted'
          )}
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          aria-label="发送消息"
        >
          <Send size={14} className={text.trim() && !disabled ? 'transition-transform' : ''} />
        </button>
      </div>
    </div>
  )
}
