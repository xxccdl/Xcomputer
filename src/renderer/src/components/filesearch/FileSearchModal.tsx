import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search,
  File,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  Code,
  Folder,
  RefreshCw,
  X,
  ChevronRight,
  Loader2
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'
import type { FileSearchResult, FileIndexStatus } from '@shared/types'

interface FileSearchModalProps {
  onClose: () => void
}

// ============ 扩展名分类 ============

const IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.svg',
  '.webp'
])
const CODE_EXTS = new Set([
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.go',
  '.rs',
  '.html',
  '.css',
  '.json',
  '.xml'
])
const DOC_EXTS = new Set([
  '.txt',
  '.md',
  '.doc',
  '.docx',
  '.pdf',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx'
])
const VIDEO_EXTS = new Set(['.mp4', '.avi', '.mkv', '.mov', '.wmv'])
const MUSIC_EXTS = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg'])
const ARCHIVE_EXTS = new Set(['.zip', '.rar', '.7z', '.tar', '.gz'])

interface IconConfig {
  icon: LucideIcon
  color: string
}

/** 根据扩展名和是否目录获取图标配置 */
function getIconConfig(ext: string, isDir: boolean): IconConfig {
  if (isDir) return { icon: Folder, color: 'text-text-secondary' }
  if (IMAGE_EXTS.has(ext)) return { icon: ImageIcon, color: 'text-emerald-500' }
  if (CODE_EXTS.has(ext)) return { icon: Code, color: 'text-blue-400' }
  if (DOC_EXTS.has(ext)) return { icon: FileText, color: 'text-amber-400' }
  if (VIDEO_EXTS.has(ext)) return { icon: Film, color: 'text-purple-400' }
  if (MUSIC_EXTS.has(ext)) return { icon: Music, color: 'text-pink-400' }
  if (ARCHIVE_EXTS.has(ext)) return { icon: Archive, color: 'text-orange-400' }
  return { icon: File, color: 'text-text-muted' }
}

// ============ 扩展名过滤选项 ============

interface FilterOption {
  label: string
  exts: string[]
}

const FILTER_OPTIONS: FilterOption[] = [
  { label: '全部', exts: [] },
  { label: '图片', exts: [...IMAGE_EXTS] },
  { label: '文档', exts: [...DOC_EXTS] },
  { label: '代码', exts: [...CODE_EXTS] },
  { label: '视频', exts: [...VIDEO_EXTS] },
  { label: '音乐', exts: [...MUSIC_EXTS] },
  { label: '压缩包', exts: [...ARCHIVE_EXTS] }
]

// ============ 格式化辅助函数 ============

function formatSize(bytes: number): string {
  if (bytes <= 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatTime(ts: number): string {
  if (ts <= 0) return '-'
  const now = Date.now()
  const diffMs = now - ts
  const diffMin = Math.floor(diffMs / (1000 * 60))
  const diffHour = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay === 1) return '昨天'
  if (diffDay < 7) return `${diffDay} 天前`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} 周前`
  return new Date(ts).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric'
  })
}

/** 高亮匹配的关键词部分 */
function highlightMatch(text: string, keyword: string): JSX.Element {
  if (!keyword) return <>{text}</>
  const kw = keyword.toLowerCase()
  const lower = text.toLowerCase()
  const idx = lower.indexOf(kw)
  if (idx === -1) return <>{text}</>
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + keyword.length)
  const after = text.slice(idx + keyword.length)
  return (
    <>
      {before}
      <span className="bg-accent/25 font-semibold text-accent">{match}</span>
      {after}
    </>
  )
}

/** 在文件资源管理器中打开（通过 file:// 协议，由主进程 shell.openExternal 处理） */
function openInExplorer(path: string): void {
  try {
    const normalized = path.replace(/\\/g, '/')
    const url = `file:///${normalized}`
    window.open(url, '_blank')
  } catch (err) {
    console.error('[FileSearchModal] open failed:', err)
  }
}

export function FileSearchModal({ onClose }: FileSearchModalProps): JSX.Element {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<FileSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filterIndex, setFilterIndex] = useState(0)
  const [status, setStatus] = useState<FileIndexStatus | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 加载索引状态
  const loadStatus = useCallback(async (): Promise<void> => {
    try {
      const s = await window.api.fileSearch.getStatus()
      setStatus(s)
    } catch (err) {
      console.error('[FileSearchModal] load status failed:', err)
    }
  }, [])

  // 自动聚焦输入框
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
    void loadStatus()
  }, [loadStatus])

  // 轮询索引状态（索引中时每秒更新）
  useEffect(() => {
    if (!status?.indexing && !rebuilding) return
    const timer = setInterval(() => {
      void loadStatus()
    }, 1000)
    return () => clearInterval(timer)
  }, [status?.indexing, rebuilding, loadStatus])

  // 防抖搜索（300ms）
  useEffect(() => {
    const kw = keyword.trim()
    if (!kw) {
      setResults([])
      setSearching(false)
      setSelectedIndex(0)
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      const exts = FILTER_OPTIONS[filterIndex].exts
      const extFilter = exts.length > 0 ? exts.join(',') : undefined
      void window.api.fileSearch
        .query(kw, { maxResults: 200, extFilter })
        .then((res) => {
          setResults(res)
          setSearching(false)
          setSelectedIndex(0)
        })
        .catch((err) => {
          console.error('[FileSearchModal] query failed:', err)
          setResults([])
          setSearching(false)
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [keyword, filterIndex])

  // 滚动到选中项
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // 打开选中项
  const openSelected = useCallback((): void => {
    const item = results[selectedIndex]
    if (item) openInExplorer(item.path)
  }, [results, selectedIndex])

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      openSelected()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // 重建索引
  const handleRebuild = async (): Promise<void> => {
    if (rebuilding) return
    setRebuilding(true)
    try {
      await window.api.fileSearch.rebuild()
    } catch (err) {
      console.error('[FileSearchModal] rebuild failed:', err)
    } finally {
      setRebuilding(false)
      await loadStatus()
    }
  }

  // 停止索引
  const handleStop = async (): Promise<void> => {
    try {
      await window.api.fileSearch.stop()
      await loadStatus()
    } catch (err) {
      console.error('[FileSearchModal] stop failed:', err)
    }
  }

  const isIndexing = status?.indexing ?? false

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[12vh] backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="flex h-[72vh] w-[760px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-border bg-bg-panel shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Search size={15} className="text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">全局文件搜索</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            title="关闭 (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {/* 搜索框 + 过滤器 */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              ref={inputRef}
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入文件名搜索，支持通配符 * 和 ? ..."
              className="w-full rounded-md border border-border bg-bg py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            {searching && (
              <Loader2
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-text-muted"
              />
            )}
          </div>
          <select
            value={filterIndex}
            onChange={(e) => setFilterIndex(Number(e.target.value))}
            className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-text-secondary focus:border-accent focus:outline-none"
            title="按类型过滤"
          >
            {FILTER_OPTIONS.map((opt, idx) => (
              <option key={opt.label} value={idx}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 搜索结果 */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {keyword.trim() === '' ? (
            <div className="flex h-full flex-col items-center justify-center text-text-muted animate-fade-in">
              <Search size={42} className="mb-3 opacity-25" />
              <p className="text-sm">输入关键词开始搜索</p>
              <p className="mt-1 text-xs">
                已索引 {status?.totalFiles ?? 0} 个文件
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-text-muted animate-fade-in">
              <File size={42} className="mb-3 opacity-25" />
              <p className="text-sm">
                {searching ? '搜索中...' : '未找到匹配的文件'}
              </p>
            </div>
          ) : (
            results.map((item, idx) => {
              const cfg = getIconConfig(item.ext, item.isDir)
              const Icon = cfg.icon
              const dirPath = item.path.includes('\\')
                ? item.path.slice(0, item.path.lastIndexOf('\\'))
                : item.path.slice(0, item.path.lastIndexOf('/'))
              return (
                <button
                  key={`${item.path}-${idx}`}
                  className={clsx(
                    'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
                    idx === selectedIndex
                      ? 'bg-accent/10'
                      : 'hover:bg-bg-hover'
                  )}
                  onClick={() => setSelectedIndex(idx)}
                  onDoubleClick={() => openInExplorer(item.path)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <Icon size={16} className={clsx('shrink-0', cfg.color)} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-text-primary">
                      {highlightMatch(item.name, keyword.trim())}
                    </span>
                    <span className="truncate text-[11px] text-text-muted">
                      {dirPath}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-[10px] text-text-muted">
                    {!item.isDir && (
                      <span className="tabular-nums">{formatSize(item.size)}</span>
                    )}
                    <span className="tabular-nums">
                      {formatTime(item.mtime)}
                    </span>
                  </div>
                  {idx === selectedIndex && (
                    <ChevronRight size={14} className="shrink-0 text-text-muted" />
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between border-t border-border bg-bg/50 px-4 py-2">
          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border px-1 py-0">↑</kbd>
              <kbd className="rounded border border-border px-1 py-0">↓</kbd>
              导航
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border px-1 py-0">Enter</kbd>
              打开
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border px-1 py-0">Esc</kbd>
              关闭
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isIndexing ? (
              <>
                <Loader2 size={12} className="animate-spin text-accent" />
                <span className="text-[10px] text-accent">索引中...</span>
                <button
                  onClick={() => void handleStop()}
                  className="flex items-center gap-1 rounded-md bg-bg-hover px-2 py-1 text-[10px] font-medium text-text-secondary transition-colors hover:text-text-primary"
                >
                  停止
                </button>
              </>
            ) : (
              <>
                <span className="text-[10px] text-text-muted">
                  已索引 {status?.totalFiles ?? 0} 个文件
                  {status?.lastIndexedAt
                    ? ` · ${formatTime(status.lastIndexedAt)}`
                    : ''}
                </span>
                <button
                  onClick={() => void handleRebuild()}
                  disabled={rebuilding}
                  className="flex items-center gap-1 rounded-md bg-bg-hover px-2 py-1 text-[10px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
                  title="重建索引"
                >
                  <RefreshCw
                    size={11}
                    className={clsx(rebuilding && 'animate-spin')}
                  />
                  重建索引
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
