import { useEffect, useState, useRef, useCallback } from 'react'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import {
  Plus,
  MessageSquare,
  Trash2,
  Pencil,
  Check,
  X,
  Zap,
  ChevronDown,
  ChevronRight,
  Search,
  Loader2,
  Download,
  Lock,
  Smartphone
} from 'lucide-react'
import { useSession } from '../../hooks/useSession'
import { useSettingsStore } from '../../store/settings.store'
import { useMcpStore, type McpStatus } from '../../store/mcp.store'
import { useSessionStore } from '../../store/session.store'
import { clsx } from 'clsx'

/** 搜索结果条目 */
interface SessionSearchResult {
  sessionId: string
  sessionTitle: string
  matchedMessage: string
  messageRole: string
  createdAt: number
}

function groupByDate(sessions: { id: string; title: string; updatedAt: number }[]): {
  label: string
  items: { id: string; title: string; updatedAt: number }[]
}[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const weekAgo = today - 7 * 86400000

  const groups: Record<string, typeof sessions> = { 今天: [], 昨天: [], 本周: [], 更早: [] }
  for (const s of sessions) {
    if (s.updatedAt >= today) groups['今天'].push(s)
    else if (s.updatedAt >= yesterday) groups['昨天'].push(s)
    else if (s.updatedAt >= weekAgo) groups['本周'].push(s)
    else groups['更早'].push(s)
  }
  return Object.entries(groups)
    .filter(([, v]) => v.length > 0)
    .map(([label, items]) => ({ label, items }))
}

const MCP_STATUS_CONFIG: Record<
  McpStatus,
  { color: string; label: string; pulse: boolean }
> = {
  connected: { color: 'bg-emerald-500', label: 'MCP 已连接', pulse: false },
  connecting: { color: 'bg-amber-400', label: 'MCP 连接中', pulse: true },
  disconnected: { color: 'bg-zinc-500', label: 'MCP 未连接', pulse: false },
  error: { color: 'bg-rose-500', label: 'MCP 连接错误', pulse: false }
}

const COLLAPSE_KEY = 'xcomputer-sidebar-collapsed'

/** 将预览文本中的关键词高亮（大小写不敏感） */
function highlightKeyword(text: string, query: string): JSX.Element[] {
  if (!query) return [<span key={0}>{text}</span>]
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const parts: JSX.Element[] = []
  let cursor = 0
  let idx = lowerText.indexOf(lowerQuery, cursor)
  let key = 0
  while (idx >= 0) {
    if (idx > cursor) {
      parts.push(<span key={key++}>{text.slice(cursor, idx)}</span>)
    }
    parts.push(
      <mark key={key++} className="rounded bg-accent/30 px-0.5 text-text-primary">
        {text.slice(idx, idx + query.length)}
      </mark>
    )
    cursor = idx + query.length
    idx = lowerText.indexOf(lowerQuery, cursor)
  }
  if (cursor < text.length) {
    parts.push(<span key={key++}>{text.slice(cursor)}</span>)
  }
  return parts
}

/** 格式化时间戳为简短日期 */
function formatTime(ts: number): string {
  const now = new Date()
  const date = new Date(ts)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  if (date.getTime() >= today) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (date.getTime() >= yesterday) {
    return '昨天'
  } else {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }
}

export function Sidebar(): JSX.Element {
  const { sessions, currentSessionId, createSession, selectSession, deleteSession, renameSession } =
    useSession()
  const settings = useSettingsStore((s) => s.settings)
  const mcpStatus = useMcpStore((s) => s.status)
  const lockedSessionIds = useSessionStore((s) => s.lockedSessionIds)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const { confirmDeleteId, requestConfirm, resetConfirm } = useConfirmDelete()
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY)
      return new Set(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      return new Set<string>()
    }
  })

  // 搜索相关状态
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SessionSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // 远程控制状态
  const [remoteState, setRemoteState] = useState<{
    running: boolean
    pairCode: string | null
    phoneConnected: boolean
  }>({ running: false, pairCode: null, phoneConnected: false })
  const [remoteStarting, setRemoteStarting] = useState(false)
  const [remotePanelOpen, setRemotePanelOpen] = useState(false)

  useEffect(() => {
    void window.api.remote.getState().then((s) => {
      setRemoteState({ running: s.running, pairCode: s.pairCode, phoneConnected: s.phoneConnected })
    })
    const unsub = window.api.remote.onStateChange((s) => {
      setRemoteState({ running: s.running, pairCode: s.pairCode, phoneConnected: s.phoneConnected })
    })
    return unsub
  }, [])

  const toggleRemote = async (): Promise<void> => {
    if (remoteState.running) {
      await window.api.remote.stop()
    } else {
      setRemoteStarting(true)
      try {
        await window.api.remote.start()
      } catch {
        // 忽略错误，状态会通过 onStateChange 更新
      } finally {
        setRemoteStarting(false)
      }
    }
  }
  // 竞态保护：记录最新搜索请求 ID，避免旧请求覆盖新请求的结果
  const searchRequestIdRef = useRef(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // debounce 触发搜索
  const triggerSearch = useCallback((query: string) => {
    const trimmed = query.trim()
    if (!trimmed) {
      // 空查询：清空搜索结果，恢复会话列表
      setSearchResults([])
      setHasSearched(false)
      setSearching(false)
      return
    }
    const requestId = ++searchRequestIdRef.current
    setSearching(true)
    setHasSearched(true)
    window.api.session
      .search(trimmed)
      .then((results) => {
        // 竞态保护：丢弃过期的搜索结果
        if (requestId !== searchRequestIdRef.current) return
        setSearchResults(results)
      })
      .catch((err) => {
        console.error('[Sidebar] 搜索会话失败:', err)
        if (requestId === searchRequestIdRef.current) {
          setSearchResults([])
        }
      })
      .finally(() => {
        if (requestId === searchRequestIdRef.current) {
          setSearching(false)
        }
      })
  }, [])

  // 输入变化时 debounce 300ms
  const handleSearchInput = (value: string): void => {
    setSearchQuery(value)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      triggerSearch(value)
    }, 300)
  }

  // 清空搜索框
  const handleClearSearch = (): void => {
    setSearchQuery('')
    setSearchResults([])
    setHasSearched(false)
    setSearching(false)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
  }

  // 点击搜索结果跳转到对应会话
  const handleSearchResultClick = (sessionId: string): void => {
    void selectSession(sessionId)
    handleClearSearch()
  }

  // 组件卸载时清理 debounce 定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(collapsed)))
  }, [collapsed])

  const toggleGroup = (label: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const groups = groupByDate(sessions)
  const configured = Boolean(settings.apiKey)
  const mcpCfg = MCP_STATUS_CONFIG[mcpStatus]

  const startEdit = (id: string, title: string): void => {
    setEditingId(id)
    setEditValue(title)
  }
  const commitEdit = async (): Promise<void> => {
    if (editingId && editValue.trim()) {
      try {
        await renameSession(editingId, editValue.trim())
      } catch (err) {
        console.error('[Sidebar] 重命名会话失败:', err)
      }
    }
    setEditingId(null)
  }

  const handleExport = async (sessionId: string, title: string): Promise<void> => {
    setExportingId(sessionId)
    try {
      const result = await window.api.session.exportMarkdown(sessionId)
      if (result.success) {
        console.log('[Sidebar] 会话已导出:', result.path)
      }
    } catch (err) {
      console.error('[Sidebar] 导出会话失败:', err)
    } finally {
      setExportingId(null)
    }
  }

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-bg-panel">
      {/* 顶部品牌区 + 新建按钮 */}
      <div className="px-3 pt-3">
        <button
          className="group flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-gradient-to-r from-accent/10 to-transparent px-3 py-2.5 text-sm font-medium text-text-primary transition-all hover:border-accent hover:from-accent/20"
          onClick={() => void createSession()}
        >
          <Plus size={16} className="text-accent transition-transform group-hover:rotate-90" />
          新建会话
        </button>
      </div>

      {/* 搜索框 */}
      <div className="px-3 pt-2">
        <div className="relative flex items-center">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 text-text-muted"
          />
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-bg-input py-1.5 pl-8 pr-7 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent"
            placeholder="搜索会话内容…"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleClearSearch()
            }}
          />
          {searching ? (
            <Loader2
              size={14}
              className="absolute right-2.5 animate-spin text-text-muted"
            />
          ) : searchQuery ? (
            <button
              className="absolute right-2 rounded p-0.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"
              onClick={handleClearSearch}
              title="清空搜索"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
      </div>

      {/* 会话列表 / 搜索结果 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 pt-2">
        {hasSearched ? (
          // 搜索结果视图
          searching && searchResults.length === 0 ? (
            <div className="px-2 py-8 text-center text-xs text-text-muted">
              正在搜索…
            </div>
          ) : searchResults.length === 0 ? (
            <div className="px-2 py-8 text-center text-xs text-text-muted">
              未找到匹配的会话
            </div>
          ) : (
            <>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                搜索结果
                <span className="ml-1.5 rounded bg-bg-input px-1 py-0 text-[9px] tabular-nums text-text-muted">
                  {searchResults.length}
                </span>
              </div>
              {searchResults.map((result) => (
                <button
                  key={`${result.sessionId}-${result.createdAt}`}
                  className="group flex w-full animate-fade-in flex-col gap-1 rounded-lg px-2.5 py-2 text-left text-sm transition-all hover:bg-bg-hover/60"
                  onClick={() => handleSearchResultClick(result.sessionId)}
                  title={result.sessionTitle}
                >
                  <div className="flex items-center gap-1.5">
                    <MessageSquare size={12} className="shrink-0 opacity-50" />
                    <span className="flex-1 truncate text-text-primary">
                      {result.sessionTitle}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-text-muted">
                      {formatTime(result.createdAt)}
                    </span>
                  </div>
                  <div className="line-clamp-2 break-words text-xs leading-relaxed text-text-secondary">
                    {highlightKeyword(result.matchedMessage, searchQuery.trim())}
                  </div>
                </button>
              ))}
            </>
          )
        ) : (
          <>
            {groups.length === 0 && (
              <div className="animate-fade-in px-2 py-8 text-center text-xs text-text-muted">
                暂无会话
                <br />
                点击上方按钮开始
              </div>
            )}
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.label)
              return (
                <div key={group.label} className="mb-3">
                  <button
                    className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-secondary"
                    onClick={() => toggleGroup(group.label)}
                  >
                    <span>
                      {group.label}
                      <span className="ml-1.5 rounded bg-bg-input px-1 py-0 text-[9px] tabular-nums text-text-muted">
                        {group.items.length}
                      </span>
                    </span>
                    {isCollapsed ? (
                      <ChevronRight size={12} className="transition-transform" />
                    ) : (
                      <ChevronDown size={12} className="transition-transform" />
                    )}
                  </button>
                  <div className={clsx('grid transition-all duration-300 ease-out', isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100')}>
                    <div className="overflow-hidden">
                      {group.items.map((s) => (
                  <div
                    key={s.id}
                    className={clsx(
                      'group relative flex stagger-item items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-all',
                      currentSessionId === s.id
                        ? 'bg-bg-hover text-text-primary shadow-sm'
                        : 'text-text-secondary hover:bg-bg-hover/60 hover:text-text-primary'
                    )}
                  >
                    {currentSessionId === s.id && (
                      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
                    )}
                    {lockedSessionIds.has(s.id) ? (
                      <Lock size={14} className="shrink-0 text-amber-400" />
                    ) : (
                      <MessageSquare size={14} className="shrink-0 opacity-50" />
                    )}
                    {editingId === s.id ? (
                      <input
                        className="flex-1 rounded border border-accent bg-bg-input px-1 py-0.5 text-sm outline-none"
                        value={editValue}
                        autoFocus
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitEdit()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                    ) : (
                      <button
                        className="flex-1 truncate text-left"
                        onClick={() => void selectSession(s.id)}
                        title={s.title}
                      >
                        {s.title}
                      </button>
                    )}
                    {editingId === s.id ? (
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          className="rounded p-0.5 text-success hover:bg-bg-input"
                          onClick={() => void commitEdit()}
                        >
                          <Check size={13} />
                        </button>
                        <button
                          className="rounded p-0.5 text-text-muted hover:bg-bg-input"
                          onClick={() => setEditingId(null)}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          className="rounded p-0.5 text-text-muted hover:bg-bg-input hover:text-text-primary"
                          onClick={() => startEdit(s.id, s.title)}
                          title="重命名会话"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="rounded p-0.5 text-text-muted hover:bg-bg-input hover:text-accent disabled:opacity-40"
                          onClick={() => void handleExport(s.id, s.title)}
                          disabled={exportingId === s.id}
                          title="导出为 Markdown"
                        >
                          {exportingId === s.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Download size={13} />
                          )}
                        </button>
                        <button
                          className="rounded p-0.5 text-text-muted hover:bg-bg-input hover:text-danger"
                      onClick={() => {
                        // 二次确认：首次点击变红确认，再次点击才删除
                        if (confirmDeleteId === s.id) {
                          void deleteSession(s.id)
                          resetConfirm()
                        } else {
                          requestConfirm(s.id)
                        }
                      }}
                      title={confirmDeleteId === s.id ? '再次点击确认删除' : '删除会话'}
                    >
                      <Trash2
                        size={13}
                        className={confirmDeleteId === s.id ? 'text-danger' : ''}
                      />
                    </button>
                  </div>
                )}
              </div>
                      ))}
                    </div>
                  </div>
            </div>
          )
        })}
          </>
        )}
      </div>

      {/* 底部状态栏：远程控制 + AI + MCP */}
      <div className="border-t border-border px-3 py-2.5 space-y-2">
        {/* 远程控制快捷按钮 */}
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-bg-panel"
          onClick={() => setRemotePanelOpen((v) => !v)}
        >
          <Smartphone
            size={13}
            className={remoteState.running ? 'text-accent' : 'text-text-muted'}
          />
          <span className={remoteState.running ? 'text-text-secondary' : 'text-text-muted'}>
            手机远程
          </span>
          {remoteState.running && (
            <span className="flex items-center gap-1 ml-auto">
              {remoteState.phoneConnected ? (
                <span className="flex items-center gap-1 text-emerald-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  已连接
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  等待配对
                </span>
              )}
            </span>
          )}
        </button>

        {/* 远程控制展开面板 */}
        {remotePanelOpen && (
          <div className="rounded-lg border border-border bg-bg-panel p-3 space-y-2.5 animate-spring-up">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">手机远程控制</span>
              <button
                className="text-text-muted hover:text-text-primary"
                onClick={() => setRemotePanelOpen(false)}
              >
                <X size={12} />
              </button>
            </div>

            {!remoteState.running ? (
              <button
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                onClick={() => void toggleRemote()}
                disabled={remoteStarting}
              >
                {remoteStarting ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    启动中...
                  </>
                ) : (
                  <>
                    <Smartphone size={12} />
                    启动服务
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-2">
                {/* 配对码 */}
                <div className="rounded-md bg-bg-tertiary px-3 py-2 text-center">
                  <div className="text-[10px] text-text-muted">配对码</div>
                  <div className="font-mono text-lg font-bold tracking-[0.3em] text-accent">
                    {remoteState.pairCode}
                  </div>
                </div>
                {/* 手机连接状态 */}
                {remoteState.phoneConnected ? (
                  <div className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    手机已连接 — AI可操控手机
                  </div>
                ) : (
                  <div className="text-center text-[10px] text-text-muted">
                    手机访问：175.27.141.172:3210/xphoneai
                  </div>
                )}
                {/* 停止按钮 */}
                <button
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-danger hover:text-danger"
                  onClick={() => void toggleRemote()}
                >
                  停止服务
                </button>
              </div>
            )}
          </div>
        )}

        {/* AI + MCP 指示灯 */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5" title={configured ? 'AI 已配置' : 'AI 未配置'}>
            <Zap
              size={12}
              className={configured ? 'text-accent' : 'text-text-muted'}
            />
            <span className={configured ? 'text-text-secondary' : 'text-text-muted'}>
              {configured ? settings.fastModel : '未配置'}
            </span>
          </div>
          <div className="flex items-center gap-1.5" title={mcpCfg.label}>
            <span className="relative flex h-2 w-2">
              {mcpCfg.pulse && (
                <span
                  className={clsx(
                    'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                    mcpCfg.color
                  )}
                />
              )}
              <span className={clsx('relative inline-flex h-2 w-2 rounded-full', mcpCfg.color)} />
            </span>
            <span className="text-text-muted">{mcpCfg.label}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
