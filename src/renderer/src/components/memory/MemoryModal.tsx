import { useEffect, useState, useCallback, useRef } from 'react'
import {
  X,
  Plus,
  Trash2,
  Search,
  Brain,
  User,
  Settings as SettingsIcon,
  Lightbulb,
  MessageSquare,
  Zap,
  Edit2,
  Check,
  Database,
  Download,
  Upload,
  Archive,
  RotateCcw,
  Clock
} from 'lucide-react'
import { clsx } from 'clsx'
import type { MemoryItem, MemoryType, MemoryStats } from '@shared/types'

interface MemoryModalProps {
  onClose: () => void
}

const TYPE_CONFIG: Record<
  MemoryType,
  { label: string; icon: typeof User; color: string; bg: string }
> = {
  profile: { label: '用户画像', icon: User, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  habit: { label: '操作习惯', icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  preference: {
    label: '偏好设置',
    icon: SettingsIcon,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10'
  },
  fact: { label: '事实知识', icon: Database, color: 'text-green-400', bg: 'bg-green-500/10' },
  interaction: {
    label: '交互历史',
    icon: MessageSquare,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10'
  },
  skill: { label: '技能记忆', icon: Lightbulb, color: 'text-cyan-400', bg: 'bg-cyan-500/10' }
}

const SOURCE_LABEL: Record<string, string> = {
  auto: '自动提取',
  manual: '手动添加',
  ai: 'AI 保存'
}

type TabView = 'active' | 'archived'

interface EditState {
  content: string
  type: MemoryType
  category: string
  tags: string
  confidence: number
}

export function MemoryModal({ onClose }: MemoryModalProps): JSX.Element {
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [archivedMemories, setArchivedMemories] = useState<MemoryItem[]>([])
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterType, setFilterType] = useState<MemoryType | 'all'>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({
    content: '',
    type: 'fact',
    category: '',
    tags: '',
    confidence: 0.8
  })
  const [newMemory, setNewMemory] = useState({
    type: 'fact' as MemoryType,
    category: '',
    content: '',
    tags: '',
    confidence: 0.8
  })
  const [activeTab, setActiveTab] = useState<TabView>('active')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadMemories = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.memory.list()
      setMemories(list)
      const archived = await window.api.memory.listArchived()
      setArchivedMemories(archived)
      const s = await window.api.memory.stats()
      setStats(s)
    } catch (err) {
      console.error('[MemoryModal] loadMemories failed:', err)
    }
  }, [])

  useEffect(() => {
    loadMemories()
    const unsub = window.api.memory.onChanged(() => {
      loadMemories()
    })
    return unsub
  }, [loadMemories])

  const displayList = activeTab === 'active' ? memories : archivedMemories

  const filtered = displayList.filter((m) => {
    if (filterType !== 'all' && m.type !== filterType) return false
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase()
      const haystack = `${m.content} ${m.category} ${m.tags.join(' ')}`.toLowerCase()
      if (!haystack.includes(kw)) return false
    }
    return true
  })

  const handleAdd = async (): Promise<void> => {
    if (!newMemory.content.trim()) return
    try {
      await window.api.memory.add({
        type: newMemory.type,
        category: newMemory.category || 'general',
        content: newMemory.content,
        confidence: newMemory.confidence,
        tags: newMemory.tags
          ? newMemory.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : []
      })
      setNewMemory({ type: 'fact', category: '', content: '', tags: '', confidence: 0.8 })
      setShowAddForm(false)
      await loadMemories()
    } catch (err) {
      console.error('[MemoryModal] add failed:', err)
      alert(`添加记忆失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await window.api.memory.delete(id)
      await loadMemories()
    } catch (err) {
      console.error('[MemoryModal] delete failed:', err)
      alert(`删除记忆失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleClearAll = async (): Promise<void> => {
    if (!confirm('确定要清空所有记忆吗？此操作不可撤销。')) return
    try {
      await window.api.memory.clear()
      await loadMemories()
    } catch (err) {
      console.error('[MemoryModal] clearAll failed:', err)
      alert(`清空记忆失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleStartEdit = (m: MemoryItem): void => {
    setEditingId(m.id)
    setEditState({
      content: m.content,
      type: m.type,
      category: m.category,
      tags: m.tags.join(', '),
      confidence: m.confidence
    })
  }

  const handleSaveEdit = async (id: string): Promise<void> => {
    try {
      await window.api.memory.update(id, {
        content: editState.content,
        type: editState.type,
        category: editState.category || 'general',
        tags: editState.tags
          ? editState.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        confidence: Math.max(0, Math.min(1, editState.confidence))
      })
      setEditingId(null)
      await loadMemories()
    } catch (err) {
      console.error('[MemoryModal] save edit failed:', err)
      alert(`保存失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleRestore = async (id: string): Promise<void> => {
    try {
      await window.api.memory.restore(id)
      await loadMemories()
    } catch (err) {
      console.error('[MemoryModal] restore failed:', err)
      alert(`恢复失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleExport = async (): Promise<void> => {
    try {
      const data = await window.api.memory.exportAll()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `xmemory-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[MemoryModal] export failed:', err)
      alert(`导出失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleImportClick = (): void => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      // 校验导入数据结构：必须是包含 memories 数组的对象，或直接是数组
      const memories = Array.isArray(data) ? data : data?.memories
      if (!Array.isArray(memories)) {
        alert('文件格式不正确：缺少 memories 数组')
        return
      }
      const result = await window.api.memory.importAll(data, true)
      alert(`导入完成：新增 ${result.added} 条，跳过 ${result.skipped} 条`)
      await loadMemories()
    } catch (err) {
      console.error('[MemoryModal] import failed:', err)
      alert(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCleanup = async (): Promise<void> => {
    try {
      const result = await window.api.memory.cleanup()
      if (result.archived > 0) {
        alert(`已清理 ${result.archived} 条过时记忆`)
        await loadMemories()
      } else {
        alert('没有需要清理的过时记忆')
      }
    } catch (err) {
      console.error('[MemoryModal] cleanup failed:', err)
      alert(`清理失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const formatTime = (ts: number): string => {
    const date = new Date(ts)
    const now = Date.now()
    const diffDays = Math.floor((now - ts) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays} 天前`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-[900px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-border bg-bg-panel shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-md">
              <Brain size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Xmemory 记忆系统</h2>
              <p className="text-[10px] text-text-muted">AI 越用越懂你的秘密</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* 统计栏 */}
        {stats && (
          <div className="flex items-center gap-3 border-b border-border bg-bg-base/50 px-5 py-2.5 animate-fade-in-down">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">总记忆</span>
              <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                {stats.total}
              </span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">平均置信度</span>
              <span className="text-xs font-medium text-text-secondary">
                {(stats.avgConfidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-2">
              {(Object.keys(stats.byType) as MemoryType[]).map((type) => {
                const cfg = TYPE_CONFIG[type]
                const count = stats.byType[type]
                if (count === 0) return null
                return (
                  <div key={type} className="flex items-center gap-1">
                    <cfg.icon size={11} className={cfg.color} />
                    <span className="text-[10px] text-text-muted">{count}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex-1" />
            <button
              onClick={handleExport}
              title="导出记忆"
              className="flex items-center gap-1 rounded-md bg-bg-hover px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover/80 hover:text-text-primary"
            >
              <Download size={12} />
              导出
            </button>
            <button
              onClick={handleImportClick}
              title="导入记忆"
              className="flex items-center gap-1 rounded-md bg-bg-hover px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover/80 hover:text-text-primary"
            >
              <Upload size={12} />
              导入
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              onClick={handleCleanup}
              title="清理过时记忆"
              className="flex items-center gap-1 rounded-md bg-bg-hover px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover/80 hover:text-text-primary"
            >
              <Clock size={12} />
              清理
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1 rounded-md bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
            >
              <Plus size={12} />
              添加
            </button>
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1 rounded-md bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
            >
              <Trash2 size={12} />
              清空
            </button>
          </div>
        )}

        {/* Tab 切换 */}
        <div className="flex items-center gap-1 border-b border-border px-5 py-1.5">
          <button
            onClick={() => setActiveTab('active')}
            className={clsx(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
              activeTab === 'active'
                ? 'bg-accent/15 text-accent'
                : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
            )}
          >
            <Database size={12} />
            活跃记忆
            <span className="text-[10px] opacity-70">({memories.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={clsx(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
              activeTab === 'archived'
                ? 'bg-amber-500/15 text-amber-400'
                : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
            )}
          >
            <Archive size={12} />
            已归档
            <span className="text-[10px] opacity-70">({archivedMemories.length})</span>
          </button>
        </div>

        {/* 搜索栏 */}
        <div className="flex items-center gap-2 border-b border-border px-5 py-2.5">
          <div className="relative flex-1">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索记忆内容、标签..."
              className="w-full rounded-md border border-border bg-bg-base py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilterType('all')}
              className={clsx(
                'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                filterType === 'all'
                  ? 'bg-accent text-white'
                  : 'bg-bg-hover text-text-muted hover:text-text-primary'
              )}
            >
              全部
            </button>
            {(Object.keys(TYPE_CONFIG) as MemoryType[]).map((type) => {
              const cfg = TYPE_CONFIG[type]
              const Icon = cfg.icon
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  title={cfg.label}
                  className={clsx(
                    'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                    filterType === type
                      ? `${cfg.bg} ${cfg.color}`
                      : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                  )}
                >
                  <Icon size={13} />
                </button>
              )
            })}
          </div>
        </div>

        {/* 添加表单 */}
        {showAddForm && (
          <div className="border-b border-border bg-bg-base/50 px-5 py-3 animate-expand-down">
            <div className="mb-2 flex items-center gap-2">
              <select
                value={newMemory.type}
                onChange={(e) =>
                  setNewMemory({ ...newMemory, type: e.target.value as MemoryType })
                }
                className="rounded-md border border-border bg-bg-panel px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
              >
                {(Object.keys(TYPE_CONFIG) as MemoryType[]).map((type) => (
                  <option key={type} value={type}>
                    {TYPE_CONFIG[type].label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newMemory.category}
                onChange={(e) => setNewMemory({ ...newMemory, category: e.target.value })}
                placeholder="类别（如 tech_stack、workflow）"
                className="w-48 rounded-md border border-border bg-bg-panel px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                value={newMemory.tags}
                onChange={(e) => setNewMemory({ ...newMemory, tags: e.target.value })}
                placeholder="标签（逗号分隔）"
                className="w-40 rounded-md border border-border bg-bg-panel px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-text-muted">置信度</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={newMemory.confidence}
                  onChange={(e) =>
                    setNewMemory({ ...newMemory, confidence: Number(e.target.value) })
                  }
                  className="w-14 rounded-md border border-border bg-bg-panel px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                />
              </div>
            </div>
            <textarea
              value={newMemory.content}
              onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
              placeholder="记忆内容..."
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-bg-panel px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-md px-3 py-1 text-xs text-text-muted hover:text-text-primary"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={!newMemory.content.trim()}
                className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                保存
              </button>
            </div>
          </div>
        )}

        {/* 记忆列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-text-muted animate-fade-in">
              {activeTab === 'archived' ? (
                <Archive size={48} className="mb-3 opacity-30" />
              ) : (
                <Brain size={48} className="mb-3 opacity-30" />
              )}
              <p className="text-sm">
                {displayList.length === 0
                  ? activeTab === 'archived'
                    ? '没有已归档的记忆'
                    : '还没有记忆。和 AI 对话后，它会自动学习你的偏好。'
                  : '没有匹配的记忆'}
              </p>
              {displayList.length === 0 && activeTab === 'active' && (
                <p className="mt-1 text-xs">你也可以点击"添加"来告诉 AI 关于你的信息。</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((m) => {
                const cfg = TYPE_CONFIG[m.type]
                const Icon = cfg.icon
                const isEditing = editingId === m.id
                return (
                  <div
                    key={m.id}
                    className="group rounded-lg border border-border bg-bg-base/50 p-3 transition-colors hover:border-border/80 hover:bg-bg-base animate-fade-in-up"
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={clsx(
                          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md',
                          cfg.bg
                        )}
                      >
                        <Icon size={14} className={cfg.color} />
                      </div>
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          /* 完整字段编辑模式 */
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <select
                                value={editState.type}
                                onChange={(e) =>
                                  setEditState({ ...editState, type: e.target.value as MemoryType })
                                }
                                className="rounded border border-border bg-bg-panel px-2 py-0.5 text-[10px] text-text-primary focus:border-accent focus:outline-none"
                              >
                                {(Object.keys(TYPE_CONFIG) as MemoryType[]).map((type) => (
                                  <option key={type} value={type}>
                                    {TYPE_CONFIG[type].label}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={editState.category}
                                onChange={(e) =>
                                  setEditState({ ...editState, category: e.target.value })
                                }
                                placeholder="类别"
                                className="w-32 rounded border border-border bg-bg-panel px-2 py-0.5 text-[10px] text-text-primary focus:border-accent focus:outline-none"
                              />
                              <input
                                type="number"
                                min="0"
                                max="1"
                                step="0.1"
                                value={editState.confidence}
                                onChange={(e) =>
                                  setEditState({
                                    ...editState,
                                    confidence: Number(e.target.value)
                                  })
                                }
                                className="w-16 rounded border border-border bg-bg-panel px-2 py-0.5 text-[10px] text-text-primary focus:border-accent focus:outline-none"
                              />
                            </div>
                            <textarea
                              value={editState.content}
                              onChange={(e) =>
                                setEditState({ ...editState, content: e.target.value })
                              }
                              rows={2}
                              className="w-full resize-none rounded border border-accent bg-bg-panel px-2 py-1 text-xs text-text-primary focus:outline-none"
                            />
                            <input
                              type="text"
                              value={editState.tags}
                              onChange={(e) =>
                                setEditState({ ...editState, tags: e.target.value })
                              }
                              placeholder="标签（逗号分隔）"
                              className="w-full rounded border border-border bg-bg-panel px-2 py-0.5 text-[10px] text-text-primary focus:border-accent focus:outline-none"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-[10px] font-medium text-text-muted">
                                {cfg.label}
                              </span>
                              <span className="rounded bg-bg-hover px-1.5 py-0 text-[9px] text-text-muted">
                                {m.category}
                              </span>
                              <span className="text-[9px] text-text-muted">
                                {SOURCE_LABEL[m.source] ?? m.source}
                              </span>
                              <span className="text-[9px] text-text-muted">
                                置信度 {(m.confidence * 100).toFixed(0)}%
                              </span>
                              <span className="text-[9px] text-text-muted">
                                访问 {m.accessCount} 次
                              </span>
                              <span className="text-[9px] text-text-muted">
                                {formatTime(m.updatedAt)}
                              </span>
                              {m.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {m.tags.slice(0, 3).map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded bg-accent/10 px-1 py-0 text-[9px] text-accent"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <p className="text-xs leading-relaxed text-text-primary">{m.content}</p>
                          </>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {isEditing ? (
                          <button
                            onClick={() => handleSaveEdit(m.id)}
                            className="flex h-6 w-6 items-center justify-center rounded bg-green-500/15 text-green-400 hover:bg-green-500/25"
                          >
                            <Check size={12} />
                          </button>
                        ) : (
                          <>
                            {activeTab === 'archived' ? (
                              <button
                                onClick={() => handleRestore(m.id)}
                                title="恢复记忆"
                                className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-green-500/15 hover:text-green-400"
                              >
                                <RotateCcw size={11} />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleStartEdit(m)}
                                className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-text-primary"
                              >
                                <Edit2 size={11} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(m.id)}
                              className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-danger/15 hover:text-danger"
                            >
                              <Trash2 size={11} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 底部说明 */}
        <div className="border-t border-border bg-bg-base/50 px-5 py-2">
          <p className="text-[10px] text-text-muted">
            AI 会在每次对话后自动提取值得记住的信息，并在下次对话时自动注入相关记忆。
            系统会自动遗忘过时的交互记忆（90天未访问）和低置信度记忆（180天未访问）。
          </p>
        </div>
      </div>
    </div>
  )
}
