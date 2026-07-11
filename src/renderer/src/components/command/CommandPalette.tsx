import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, CornerDownLeft, ArrowUp, ArrowDown, Plus, Settings, Brain, Sparkles, Clock, Bookmark, PanelRight, Square, FileText, Zap, Terminal, Code } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useSession } from '../../hooks/useSession'
import { useSend } from '../../hooks/useChat'
import { useChatStore } from '../../store/chat.store'
import { useSessionStore } from '../../store/session.store'
import type { TaskTemplate } from '@shared/types'
import { focusChatInput } from '../chat/ChatInput'

/** 命令项类型 */
interface CommandItem {
  id: string
  title: string
  subtitle?: string
  icon: LucideIcon
  category: string
  action: () => void | Promise<void>
}

/** 打开模态框的自定义事件 */
function openModal(name: 'settings' | 'schedule' | 'memory' | 'skills' | 'templates' | 'triggers' | 'shortcuts' | 'fileSearch' | 'snippets'): void {
  window.dispatchEvent(new CustomEvent('xcomputer:open-modal', { detail: name }))
}

export function CommandPalette(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [searchResults, setSearchResults] = useState<Array<{
    sessionId: string
    sessionTitle: string
    matchedMessage: string
    messageRole: string
    createdAt: number
  }>>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { createSession, selectSession } = useSession()
  const send = useSend()
  const isStreaming = useChatStore((s) => s.isStreaming)
  const currentSessionId = useSessionStore((s) => s.currentSessionId)
  const setDetailPanelOpen = useChatStore((s) => s.setDetailPanelOpen)

  // 全局快捷键 Ctrl+Shift+P / Cmd+Shift+P
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 打开时聚焦输入框并加载模板
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
      void window.api.template.list().then(setTemplates).catch(() => {})
    } else {
      setSearchResults([])
      setSearching(false)
    }
  }, [open])

  // 命令面板关闭时，恢复焦点到聊天输入框
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      setTimeout(() => focusChatInput(), 50)
    }
    wasOpenRef.current = open
  }, [open])

  // 搜索会话（debounce 200ms）
  useEffect(() => {
    if (!open || !query.trim()) {
      setSearchResults([])
      setSearching(false)
      return
    }
    // 以 > 开头表示搜索会话
    if (query.startsWith('> ')) {
      const searchTerm = query.slice(2).trim()
      if (!searchTerm) {
        setSearchResults([])
        setSearching(false)
        return
      }
      setSearching(true)
      const timer = setTimeout(() => {
        void window.api.session
          .search(searchTerm, 20)
          .then((results) => {
            setSearchResults(results)
            setSearching(false)
            setSelectedIndex(0)
          })
          .catch(() => setSearching(false))
      }, 200)
      return () => clearTimeout(timer)
    }
    setSearchResults([])
    setSearching(false)
  }, [query, open])

  // 构建命令列表
  const commands = useCallback((): CommandItem[] => {
    const builtins: CommandItem[] = [
      {
        id: 'new-session',
        title: '新建会话',
        subtitle: '创建一个新的对话',
        icon: Plus,
        category: '操作',
        action: async () => {
          await createSession()
        }
      },
      {
        id: 'open-templates',
        title: '任务模板',
        subtitle: '管理收藏的任务模板',
        icon: Bookmark,
        category: '管理',
        action: () => openModal('templates')
      },
      {
        id: 'open-memory',
        title: '记忆管理',
        subtitle: '查看和管理 AI 记忆',
        icon: Brain,
        category: '管理',
        action: () => openModal('memory')
      },
      {
        id: 'open-skills',
        title: '技能管理',
        subtitle: '查看和管理技能',
        icon: Sparkles,
        category: '管理',
        action: () => openModal('skills')
      },
      {
        id: 'open-schedule',
        title: '定时任务',
        subtitle: '管理定时执行的任务',
        icon: Clock,
        category: '管理',
        action: () => openModal('schedule')
      },
      {
        id: 'open-shortcuts',
        title: '快捷指令',
        subtitle: '管理快捷指令和工作流',
        icon: Terminal,
        category: '管理',
        action: () => openModal('shortcuts')
      },
      {
        id: 'open-file-search',
        title: '文件搜索',
        subtitle: '全局文件搜索（类似 Everything）',
        icon: Search,
        category: '管理',
        action: () => openModal('fileSearch')
      },
      {
        id: 'open-snippets',
        title: '代码片段',
        subtitle: '管理代码片段，AI 可搜索调用',
        icon: Code,
        category: '管理',
        action: () => openModal('snippets')
      },
      {
        id: 'open-triggers',
        title: '自动化触发器',
        subtitle: '文件监控、开机启动等事件触发',
        icon: Zap,
        category: '管理',
        action: () => openModal('triggers')
      },
      {
        id: 'open-settings',
        title: '设置',
        subtitle: 'API Key、MCP 连接等配置',
        icon: Settings,
        category: '管理',
        action: () => openModal('settings')
      },
      {
        id: 'toggle-detail',
        title: '切换详情面板',
        subtitle: '显示/隐藏操作详情',
        icon: PanelRight,
        category: '视图',
        action: () => setDetailPanelOpen(!useChatStore.getState().detailPanelOpen)
      }
    ]

    // 流式中可以停止
    if (isStreaming && currentSessionId) {
      builtins.push({
        id: 'stop-task',
        title: '停止当前任务',
        subtitle: '中断正在执行的 AI 任务',
        icon: Square,
        category: '操作',
        action: async () => {
          await window.api.chat.stop(currentSessionId)
        }
      })
    }

    // 添加模板命令
    const templateCommands: CommandItem[] = templates.map((t) => ({
      id: `template-${t.id}`,
      title: t.name,
      subtitle: t.description || t.prompt.slice(0, 60),
      icon: FileText,
      category: '模板',
      action: async () => {
        // 使用模板：确保有会话，然后发送 prompt
        let sid = currentSessionId
        if (!sid) {
          await createSession()
          sid = useSessionStore.getState().currentSessionId
        }
        if (sid) await send(t.prompt)
        await window.api.template.update(t.id, {}).catch(() => {})
      }
    }))

    return [...builtins, ...templateCommands]
  }, [createSession, currentSessionId, isStreaming, send, setDetailPanelOpen, templates])

  // 过滤命令
  const filteredCommands = useCallback((): CommandItem[] => {
    if (!query.trim() || query.startsWith('> ')) return commands()
    const q = query.toLowerCase()
    return commands().filter(
      (c) => c.title.toLowerCase().includes(q) || c.subtitle?.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
    )
  }, [query, commands])

  // 当前可见列表（命令 + 搜索结果）
  const visibleItems = query.startsWith('> ') ? searchResults : filteredCommands()
  const isSearchMode = query.startsWith('> ')

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, visibleItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void executeSelected()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const executeSelected = async (): Promise<void> => {
    if (isSearchMode && searchResults[selectedIndex]) {
      const result = searchResults[selectedIndex]
      await selectSession(result.sessionId)
      setOpen(false)
    } else if (!isSearchMode) {
      const items = filteredCommands()
      const item = items[selectedIndex]
      if (item) {
        await item.action()
        setOpen(false)
      }
    }
  }

  // 滚动到选中项
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] bg-black/50 animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-bg-panel shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索输入 */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search size={16} className="text-text-muted" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
            placeholder="输入命令名称，或输入 > 搜索会话内容..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
          />
          {searching && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
          )}
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">ESC</kbd>
        </div>

        {/* 结果列表 */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {visibleItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              {isSearchMode ? (searching ? '搜索中...' : '未找到匹配的会话') : '无匹配命令'}
            </div>
          ) : isSearchMode ? (
            // 会话搜索结果
            searchResults.map((result, idx) => (
              <button
                key={`${result.sessionId}-${result.createdAt}`}
                className={`flex w-full flex-col items-start gap-1 px-4 py-2.5 text-left transition-colors ${
                  idx === selectedIndex ? 'bg-accent/10' : 'hover:bg-bg-hover'
                }`}
                onClick={() => {
                  void selectSession(result.sessionId).then(() => setOpen(false))
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="flex w-full items-center gap-2">
                  <FileText size={14} className="shrink-0 text-text-muted" />
                  <span className="truncate text-sm font-medium text-text-primary">
                    {result.sessionTitle}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-text-muted">
                    {new Date(result.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="line-clamp-1 pl-6 text-xs text-text-secondary">
                  {result.matchedMessage}
                </p>
              </button>
            ))
          ) : (
            // 命令列表（按 category 分组）
            Object.entries(
              filteredCommands().reduce<Record<string, CommandItem[]>>((acc, cmd) => {
                if (!acc[cmd.category]) acc[cmd.category] = []
                acc[cmd.category].push(cmd)
                return acc
              }, {})
            ).map(([category, items]) => (
              <div key={category}>
                <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {category}
                </div>
                {items.map((cmd) => {
                  const idx = filteredCommands().findIndex((c) => c.id === cmd.id)
                  const Icon = cmd.icon
                  return (
                    <button
                      key={cmd.id}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        idx === selectedIndex ? 'bg-accent/10' : 'hover:bg-bg-hover'
                      }`}
                      onClick={() => {
                        void cmd.action()
                        setOpen(false)
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <Icon size={16} className="shrink-0 text-accent" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm text-text-primary">{cmd.title}</span>
                        {cmd.subtitle && (
                          <span className="truncate text-xs text-text-muted">{cmd.subtitle}</span>
                        )}
                      </div>
                      {idx === selectedIndex && (
                        <CornerDownLeft size={14} className="shrink-0 text-text-muted" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-text-muted">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ArrowUp size={10} />
              <ArrowDown size={10} />
              导航
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft size={10} />
              执行
            </span>
          </div>
          <span>输入 &gt; 搜索会话内容</span>
        </div>
      </div>
    </div>
  )
}
