import { useEffect, useState, useCallback, useRef } from 'react'
import {
  X,
  Plus,
  Trash2,
  Search,
  BookOpen,
  Upload,
  Edit2,
  Check,
  Download,
  FileText,
  Archive,
  Code,
  FileJson,
  Zap,
  Power,
  Eye,
  EyeOff,
  Store,
  Star,
  Globe,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  Tag,
  User,
  TrendingUp,
  Clock,
  AlertCircle,
  Shield,
  LogOut,
  Lock,
  KeyRound,
  Save
} from 'lucide-react'
import { clsx } from 'clsx'
import ReactMarkdown from 'react-markdown'
import type {
  Skill,
  SkillSource,
  SkillFileType,
  SkillStats,
  HubSkillListItem,
  HubSkillDetail
} from '@shared/types'

interface SkillsModalProps {
  onClose: () => void
}

type TabKey = 'local' | 'hub' | 'publish' | 'admin'

const SOURCE_CONFIG: Record<SkillSource, { label: string; color: string; bg: string }> = {
  manual: { label: '手动上传', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  ai: { label: 'AI 生成', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  imported: { label: '导入', color: 'text-green-400', bg: 'bg-green-500/10' },
  hub: { label: '市场安装', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  builtin: { label: '内置', color: 'text-amber-400', bg: 'bg-amber-500/10' }
}

const FILE_TYPE_ICON: Record<SkillFileType, typeof FileText> = {
  markdown: FileText,
  text: FileText,
  json: FileJson,
  archive: Archive
}

const TAB_CONFIG: Record<TabKey, { label: string; icon: typeof BookOpen }> = {
  local: { label: '我的技能', icon: BookOpen },
  hub: { label: '技能市场', icon: Store },
  publish: { label: '发布技能', icon: Upload },
  admin: { label: '管理', icon: Shield }
}

const HUB_CATEGORIES_DEFAULT = [
  '通用',
  '自动化',
  '文件处理',
  '系统操作',
  '网络请求',
  '数据分析',
  '开发工具',
  '其他'
]

export function SkillsModal({ onClose }: SkillsModalProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabKey>('local')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-[900px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-border bg-bg-panel shadow-2xl animate-spring-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 shadow-md">
              <BookOpen size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">技能系统</h2>
              <p className="text-[10px] text-text-muted">
                管理本地技能 · 浏览 XSkillHub 市场 · 发布技能分享
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* 标签栏 */}
        <div className="flex items-center gap-1 border-b border-border bg-bg-base/50 px-3 py-1.5">
          {(Object.keys(TAB_CONFIG) as TabKey[]).map((key) => {
            const cfg = TAB_CONFIG[key]
            const Icon = cfg.icon
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTab === key
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                )}
              >
                <Icon size={12} />
                {cfg.label}
              </button>
            )
          })}
        </div>

        {/* 标签内容 */}
        {activeTab === 'local' && <LocalSkillsTab />}
        {activeTab === 'hub' && <HubTab />}
        {activeTab === 'publish' && <PublishTab />}
        {activeTab === 'admin' && <AdminTab />}
      </div>
    </div>
  )
}

// ============ 本地技能标签 ============
function LocalSkillsTab(): JSX.Element {
  const [skills, setSkills] = useState<Skill[]>([])
  const [stats, setStats] = useState<SkillStats | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterSource, setFilterSource] = useState<SkillSource | 'all'>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [editState, setEditState] = useState({
    name: '',
    description: '',
    content: '',
    tags: '',
    triggers: ''
  })
  const [newSkill, setNewSkill] = useState({
    name: '',
    description: '',
    content: '',
    tags: '',
    triggers: ''
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadSkills = useCallback(async (): Promise<void> => {
    const list = await window.api.skills.list()
    setSkills(list)
    const s = await window.api.skills.stats()
    setStats(s)
  }, [])

  useEffect(() => {
    loadSkills()
    const unsub = window.api.skills.onChanged(() => {
      loadSkills()
    })
    return unsub
  }, [loadSkills])

  const filtered = skills.filter((s) => {
    if (filterSource !== 'all' && s.source !== filterSource) return false
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase()
      const haystack = `${s.name} ${s.description} ${s.tags.join(' ')} ${s.triggers.join(' ')}`.toLowerCase()
      if (!haystack.includes(kw)) return false
    }
    return true
  })

  const viewingSkill = viewingId ? skills.find((s) => s.id === viewingId) : null

  const handleAdd = async (): Promise<void> => {
    if (!newSkill.name.trim() || !newSkill.content.trim()) return
    try {
      const result = await window.api.skills.add({
        name: newSkill.name.trim(),
        description: newSkill.description.trim(),
        content: newSkill.content,
        tags: newSkill.tags
          ? newSkill.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        triggers: newSkill.triggers
          ? newSkill.triggers.split(',').map((t) => t.trim()).filter(Boolean)
          : []
      })
      if ('error' in result) {
        alert(result.error)
        return
      }
      setNewSkill({ name: '', description: '', content: '', tags: '', triggers: '' })
      setShowAddForm(false)
      await loadSkills()
    } catch (err) {
      console.error('[SkillsModal] add failed:', err)
      alert(`添加技能失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleUpload = async (): Promise<void> => {
    try {
      const result = await window.api.skills.upload()
      if (result && 'error' in result) {
        alert(result.error)
        return
      }
      if (result) {
        await loadSkills()
      }
    } catch (err) {
      console.error('[SkillsModal] upload failed:', err)
      alert(`上传失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await window.api.skills.delete(id)
      if (viewingId === id) setViewingId(null)
      await loadSkills()
    } catch (err) {
      console.error('[SkillsModal] delete failed:', err)
      alert(`删除失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleClearAll = async (): Promise<void> => {
    if (!confirm('确定要清空所有技能吗？此操作不可撤销。')) return
    try {
      await window.api.skills.clear()
      await loadSkills()
    } catch (err) {
      console.error('[SkillsModal] clearAll failed:', err)
      alert(`清空失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleStartEdit = (s: Skill): void => {
    setEditingId(s.id)
    setViewingId(null)
    setEditState({
      name: s.name,
      description: s.description,
      content: s.content,
      tags: s.tags.join(', '),
      triggers: s.triggers.join(', ')
    })
  }

  const handleSaveEdit = async (id: string): Promise<void> => {
    try {
      const result = await window.api.skills.update(id, {
        name: editState.name.trim(),
        description: editState.description.trim(),
        content: editState.content,
        tags: editState.tags
          ? editState.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        triggers: editState.triggers
          ? editState.triggers.split(',').map((t) => t.trim()).filter(Boolean)
          : []
      })
      if (!result) {
        alert('保存失败：技能名称可能已存在')
        return
      }
      setEditingId(null)
      await loadSkills()
    } catch (err) {
      console.error('[SkillsModal] save edit failed:', err)
      alert(`保存失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleToggle = async (id: string, enabled: boolean): Promise<void> => {
    try {
      await window.api.skills.toggle(id, !enabled)
      await loadSkills()
    } catch (err) {
      console.error('[SkillsModal] toggle failed:', err)
    }
  }

  const handleExport = async (): Promise<void> => {
    try {
      const data = await window.api.skills.exportAll()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `xskills-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[SkillsModal] export failed:', err)
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
      const result = await window.api.skills.importAll(data, true)
      alert(`导入完成：新增 ${result.added} 条，跳过 ${result.skipped} 条`)
      await loadSkills()
    } catch (err) {
      console.error('[SkillsModal] import failed:', err)
      alert(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
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
    <>
      {/* 统计栏 */}
      {stats && (
        <div className="flex items-center gap-3 border-b border-border bg-bg-base/50 px-5 py-2.5 animate-fade-in-down">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">总技能</span>
            <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
              {stats.total}
            </span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">已启用</span>
            <span className="text-xs font-medium text-green-400">{stats.enabled}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">总使用次数</span>
            <span className="text-xs font-medium text-text-secondary">{stats.totalUseCount}</span>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleUpload}
            className="flex items-center gap-1 rounded-md bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
          >
            <Upload size={12} />
            上传文件
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 rounded-md bg-bg-hover px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover/80 hover:text-text-primary"
          >
            <Plus size={12} />
            手动添加
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1 rounded-md bg-bg-hover px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover/80 hover:text-text-primary"
          >
            <Download size={12} />
            导出
          </button>
          <button
            onClick={handleImportClick}
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
            onClick={handleClearAll}
            className="flex items-center gap-1 rounded-md bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
          >
            <Trash2 size={12} />
            清空
          </button>
        </div>
      )}

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
            placeholder="搜索技能名称、描述、标签..."
            className="w-full rounded-md border border-border bg-bg-base py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterSource('all')}
            className={clsx(
              'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              filterSource === 'all'
                ? 'bg-accent text-white'
                : 'bg-bg-hover text-text-muted hover:text-text-primary'
            )}
          >
            全部
          </button>
          {(Object.keys(SOURCE_CONFIG) as SkillSource[]).map((source) => {
            const cfg = SOURCE_CONFIG[source]
            return (
              <button
                key={source}
                onClick={() => setFilterSource(source)}
                className={clsx(
                  'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  filterSource === source
                    ? `${cfg.bg} ${cfg.color}`
                    : 'bg-bg-hover text-text-muted hover:text-text-primary'
                )}
              >
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 添加表单 */}
      {showAddForm && (
        <div className="border-b border-border bg-bg-base/50 px-5 py-3 animate-expand-down">
          <div className="mb-2 flex items-center gap-2">
            <input
              type="text"
              value={newSkill.name}
              onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
              placeholder="技能名称（唯一）"
              className="w-48 rounded-md border border-border bg-bg-panel px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <input
              type="text"
              value={newSkill.description}
              onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
              placeholder="简短描述"
              className="flex-1 rounded-md border border-border bg-bg-panel px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <div className="mb-2 flex items-center gap-2">
            <input
              type="text"
              value={newSkill.tags}
              onChange={(e) => setNewSkill({ ...newSkill, tags: e.target.value })}
              placeholder="标签（逗号分隔）"
              className="w-40 rounded-md border border-border bg-bg-panel px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <input
              type="text"
              value={newSkill.triggers}
              onChange={(e) => setNewSkill({ ...newSkill, triggers: e.target.value })}
              placeholder="触发词（逗号分隔，用户提到这些词时优先使用）"
              className="flex-1 rounded-md border border-border bg-bg-panel px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <textarea
            value={newSkill.content}
            onChange={(e) => setNewSkill({ ...newSkill, content: e.target.value })}
            placeholder="技能内容（支持 Markdown 格式）..."
            rows={4}
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
              disabled={!newSkill.name.trim() || !newSkill.content.trim()}
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* 技能列表 / 详情视图 */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {viewingSkill ? (
          /* 详情视图 */
          <div className="animate-fade-in">
            <div className="mb-3 flex items-center justify-between">
              <button
                onClick={() => setViewingId(null)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
              >
                <X size={12} />
                返回列表
              </button>
              <div className="flex items-center gap-1">
                {viewingSkill.source === 'builtin' ? (
                  <span
                    title="内置技能只读，不可修改"
                    className="flex items-center gap-1 rounded-md bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400"
                  >
                    <Lock size={11} />
                    内置只读
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => handleStartEdit(viewingSkill)}
                      className="flex items-center gap-1 rounded-md bg-bg-hover px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
                    >
                      <Edit2 size={11} />
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(viewingSkill.id)}
                      className="flex items-center gap-1 rounded-md bg-danger/10 px-2.5 py-1 text-xs text-danger hover:bg-danger/20"
                    >
                      <Trash2 size={11} />
                      删除
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-base/50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-base font-semibold text-text-primary">{viewingSkill.name}</h3>
                <span
                  className={clsx(
                    'rounded px-1.5 py-0.5 text-[10px] font-medium',
                    SOURCE_CONFIG[viewingSkill.source].bg,
                    SOURCE_CONFIG[viewingSkill.source].color
                  )}
                >
                  {SOURCE_CONFIG[viewingSkill.source].label}
                </span>
                {viewingSkill.enabled ? (
                  <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400">
                    已启用
                  </span>
                ) : (
                  <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-muted">
                    已禁用
                  </span>
                )}
              </div>
              <p className="mb-3 text-sm text-text-secondary">{viewingSkill.description}</p>
              {viewingSkill.tags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {viewingSkill.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              {viewingSkill.triggers.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  <span className="text-[10px] text-text-muted">触发词:</span>
                  {viewingSkill.triggers.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="border-t border-border pt-3">
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{viewingSkill.content}</ReactMarkdown>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-border pt-2 text-[10px] text-text-muted">
                <span>使用 {viewingSkill.useCount} 次</span>
                <span>创建于 {formatTime(viewingSkill.createdAt)}</span>
                <span>更新于 {formatTime(viewingSkill.updatedAt)}</span>
              </div>
            </div>
          </div>
        ) : editingId ? (
          /* 编辑视图 */
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-text-muted">编辑技能</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded-md px-3 py-1 text-xs text-text-muted hover:text-text-primary"
                >
                  取消
                </button>
                <button
                  onClick={() => handleSaveEdit(editingId)}
                  className="flex items-center gap-1 rounded-md bg-green-500/15 px-3 py-1 text-xs text-green-400 hover:bg-green-500/25"
                >
                  <Check size={12} />
                  保存
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editState.name}
                  onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                  placeholder="技能名称"
                  className="w-48 rounded-md border border-border bg-bg-panel px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                />
                <input
                  type="text"
                  value={editState.description}
                  onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                  placeholder="描述"
                  className="flex-1 rounded-md border border-border bg-bg-panel px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editState.tags}
                  onChange={(e) => setEditState({ ...editState, tags: e.target.value })}
                  placeholder="标签（逗号分隔）"
                  className="w-40 rounded-md border border-border bg-bg-panel px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                />
                <input
                  type="text"
                  value={editState.triggers}
                  onChange={(e) => setEditState({ ...editState, triggers: e.target.value })}
                  placeholder="触发词（逗号分隔）"
                  className="flex-1 rounded-md border border-border bg-bg-panel px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                />
              </div>
              <textarea
                value={editState.content}
                onChange={(e) => setEditState({ ...editState, content: e.target.value })}
                rows={12}
                className="w-full resize-none rounded-md border border-accent bg-bg-panel px-2 py-1.5 text-xs text-text-primary focus:outline-none"
              />
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-text-muted animate-fade-in">
            <BookOpen size={48} className="mb-3 opacity-30" />
            <p className="text-sm">
              {skills.length === 0
                ? '还没有技能。上传 .md/.txt/.json/.zip 文件，或手动添加技能。'
                : '没有匹配的技能'}
            </p>
            {skills.length === 0 && (
              <p className="mt-1 text-xs">AI 也会在任务完成后主动生成技能。</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              const srcCfg = SOURCE_CONFIG[s.source]
              const FileIcon = FILE_TYPE_ICON[s.fileType] ?? FileText
              return (
                <div
                  key={s.id}
                  className={clsx(
                    'group stagger-item rounded-lg border border-border bg-bg-base/50 p-3 transition-all hover:border-border/80 hover:bg-bg-base hover:-translate-y-0.5 hover:shadow-lg',
                    !s.enabled && 'opacity-50'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={clsx(
                        'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md',
                        srcCfg.bg
                      )}
                    >
                      <FileIcon size={14} className={srcCfg.color} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs font-medium text-text-primary">{s.name}</span>
                        <span
                          className={clsx(
                            'rounded px-1 py-0 text-[9px]',
                            srcCfg.bg,
                            srcCfg.color
                          )}
                        >
                          {srcCfg.label}
                        </span>
                        {s.originalFileName && (
                          <span className="text-[9px] text-text-muted">
                            <Code size={9} className="inline" /> {s.originalFileName}
                          </span>
                        )}
                        <span className="text-[9px] text-text-muted">
                          使用 {s.useCount} 次
                        </span>
                        <span className="text-[9px] text-text-muted">
                          {formatTime(s.updatedAt)}
                        </span>
                      </div>
                      <p className="mb-1 text-xs leading-relaxed text-text-secondary line-clamp-2">
                        {s.description}
                      </p>
                      {s.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {s.tags.slice(0, 5).map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-accent/10 px-1 py-0 text-[9px] text-accent"
                            >
                              #{tag}
                            </span>
                          ))}
                          {s.triggers.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="rounded bg-amber-500/10 px-1 py-0 text-[9px] text-amber-400"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => setViewingId(s.id)}
                        title="查看详情"
                        className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-text-primary"
                      >
                        <Eye size={11} />
                      </button>
                      {s.source === 'builtin' ? (
                        <span
                          title="内置技能只读，不可修改"
                          className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[9px] text-amber-400/80"
                        >
                          <Lock size={10} />
                          只读
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleToggle(s.id, s.enabled)}
                            title={s.enabled ? '禁用' : '启用'}
                            className={clsx(
                              'flex h-6 w-6 items-center justify-center rounded',
                              s.enabled
                                ? 'text-green-400 hover:bg-green-500/15'
                                : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                            )}
                          >
                            {s.enabled ? <Power size={11} /> : <EyeOff size={11} />}
                          </button>
                          <button
                            onClick={() => handleStartEdit(s)}
                            className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-text-primary"
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
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
          支持 .md / .txt / .json / .zip 文件上传。AI 会在任务执行中自动检索相关技能辅助操作，
          也可在任务完成后主动将成功经验保存为技能。技能通过触发词和内容相关性自动匹配。
        </p>
      </div>
    </>
  )
}

// ============ XSkillHub 技能市场标签 ============
function HubTab(): JSX.Element {
  const [items, setItems] = useState<HubSkillListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('')
  const [sort, setSort] = useState<'newest' | 'popular' | 'rating'>('newest')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([])
  const [hubStats, setHubStats] = useState<{
    totalSkills: number
    totalDownloads: number
    totalUsers: number
    totalRatings: number
  } | null>(null)
  const [viewingId, setViewingId] = useState<number | null>(null)
  const [viewingDetail, setViewingDetail] = useState<HubSkillDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [installing, setInstalling] = useState<number | null>(null)
  const [installedIds, setInstalledIds] = useState<Set<number>>(new Set())
  const [ratingValue, setRatingValue] = useState(0)
  const [submittingRating, setSubmittingRating] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadList = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.skillHub.list({
        q: search || undefined,
        category: category || undefined,
        sort,
        page,
        limit: 20
      })
      if ('error' in result) {
        setError(result.error)
        setItems([])
      } else {
        setItems(result.items)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [search, category, sort, page])

  const loadCategories = useCallback(async (): Promise<void> => {
    const result = await window.api.skillHub.categories()
    if (!('error' in result)) {
      setCategories(result)
    }
  }, [])

  const loadStats = useCallback(async (): Promise<void> => {
    const result = await window.api.skillHub.stats()
    if (!('error' in result)) {
      setHubStats(result)
    }
  }, [])

  useEffect(() => {
    loadCategories()
    loadStats()
  }, [loadCategories, loadStats])

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setPage(1)
      loadList()
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [search, category, sort, page, loadList])

  const handleViewDetail = async (id: number): Promise<void> => {
    setViewingId(id)
    setViewingDetail(null)
    setDetailLoading(true)
    setRatingValue(0)
    try {
      const result = await window.api.skillHub.get(id)
      if ('error' in result) {
        alert(result.error)
        setViewingId(null)
      } else {
        setViewingDetail(result)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const handleInstall = async (id: number): Promise<void> => {
    setInstalling(id)
    try {
      const result = await window.api.skillHub.download(id)
      if (result.success) {
        setInstalledIds((prev) => new Set(prev).add(id))
        alert(`技能「${result.name}」安装成功！`)
      } else {
        alert(`安装失败：${result.error}`)
      }
    } finally {
      setInstalling(null)
    }
  }

  const handleRate = async (): Promise<void> => {
    if (!viewingId || ratingValue < 1 || ratingValue > 5) return
    setSubmittingRating(true)
    try {
      const result = await window.api.skillHub.rate(viewingId, ratingValue)
      if (result.success) {
        alert('评分成功！')
        // 重新加载详情
        await handleViewDetail(viewingId)
      } else {
        alert(`评分失败：${result.error}`)
      }
    } finally {
      setSubmittingRating(false)
    }
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const now = Date.now()
    const diffDays = Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays} 天前`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const getRating = (item: HubSkillListItem): number => {
    return item.rating_count > 0 ? item.rating_sum / item.rating_count : 0
  }

  return (
    <>
      {/* 统计栏 */}
      {hubStats && (
        <div className="flex items-center gap-4 border-b border-border bg-gradient-to-r from-cyan-500/5 to-blue-500/5 px-5 py-2.5">
          <div className="flex items-center gap-1.5">
            <Package size={12} className="text-cyan-400" />
            <span className="text-xs text-text-muted">技能总数</span>
            <span className="text-xs font-semibold text-cyan-400">{hubStats.totalSkills}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <Download size={12} className="text-blue-400" />
            <span className="text-xs text-text-muted">总下载</span>
            <span className="text-xs font-semibold text-blue-400">{hubStats.totalDownloads}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <User size={12} className="text-purple-400" />
            <span className="text-xs text-text-muted">贡献者</span>
            <span className="text-xs font-semibold text-purple-400">{hubStats.totalUsers}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <Star size={12} className="text-amber-400" />
            <span className="text-xs text-text-muted">总评分</span>
            <span className="text-xs font-semibold text-amber-400">{hubStats.totalRatings}</span>
          </div>
          <div className="flex-1" />
          <a
            href="http://175.27.141.172:3210"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-md bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
          >
            <Globe size={12} />
            访问网站
          </a>
        </div>
      )}

      {/* 搜索 + 筛选栏 */}
      <div className="flex items-center gap-2 border-b border-border px-5 py-2.5">
        <div className="relative flex-1">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 XSkillHub 技能..."
            className="w-full rounded-md border border-border bg-bg-base py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        {/* 分类筛选 */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
        >
          <option key="all" value="">全部分类</option>
          {(categories.length > 0 ? categories : HUB_CATEGORIES_DEFAULT.map((name) => ({ name, count: 0 }))).map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}{c.count > 0 ? ` (${c.count})` : ''}
            </option>
          ))}
        </select>
        {/* 排序 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSort('newest')}
            className={clsx(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              sort === 'newest'
                ? 'bg-accent text-white'
                : 'bg-bg-hover text-text-muted hover:text-text-primary'
            )}
          >
            <Clock size={11} />
            最新
          </button>
          <button
            onClick={() => setSort('popular')}
            className={clsx(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              sort === 'popular'
                ? 'bg-accent text-white'
                : 'bg-bg-hover text-text-muted hover:text-text-primary'
            )}
          >
            <Download size={11} />
            热门
          </button>
          <button
            onClick={() => setSort('rating')}
            className={clsx(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              sort === 'rating'
                ? 'bg-accent text-white'
                : 'bg-bg-hover text-text-muted hover:text-text-primary'
            )}
          >
            <Star size={11} />
            评分
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {viewingId !== null ? (
          /* 详情视图 */
          <div className="animate-fade-in">
            <div className="mb-3 flex items-center justify-between">
              <button
                onClick={() => {
                  setViewingId(null)
                  setViewingDetail(null)
                }}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
              >
                <ChevronLeft size={12} />
                返回列表
              </button>
            </div>

            {detailLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 size={24} className="animate-spin text-accent" />
              </div>
            ) : viewingDetail ? (
              <div className="rounded-lg border border-border bg-bg-base/50 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="mb-1 text-base font-semibold text-text-primary">
                      {viewingDetail.name}
                    </h3>
                    <p className="text-sm text-text-secondary">{viewingDetail.description}</p>
                  </div>
                  <button
                    onClick={() => handleInstall(viewingDetail.id)}
                    disabled={installing === viewingDetail.id || installedIds.has(viewingDetail.id)}
                    className={clsx(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      installedIds.has(viewingDetail.id)
                        ? 'bg-green-500/15 text-green-400'
                        : 'bg-accent text-white hover:bg-accent-hover',
                      (installing === viewingDetail.id || installedIds.has(viewingDetail.id)) && 'opacity-70'
                    )}
                  >
                    {installing === viewingDetail.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : installedIds.has(viewingDetail.id) ? (
                      <Check size={12} />
                    ) : (
                      <Download size={12} />
                    )}
                    {installedIds.has(viewingDetail.id) ? '已安装' : '安装'}
                  </button>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
                  <span className="flex items-center gap-1">
                    <User size={11} />
                    {viewingDetail.author}
                  </span>
                  <span className="flex items-center gap-1">
                    <Tag size={11} />
                    {viewingDetail.category}
                  </span>
                  <span className="flex items-center gap-1">
                    <Package size={11} />
                    v{viewingDetail.version}
                  </span>
                  <span className="flex items-center gap-1">
                    <Download size={11} />
                    {viewingDetail.download_count} 次下载
                  </span>
                  <span className="flex items-center gap-1">
                    <Star size={11} className="text-amber-400" />
                    {getRating(viewingDetail).toFixed(1)} ({viewingDetail.rating_count})
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {formatDate(viewingDetail.created_at)}
                  </span>
                </div>

                {viewingDetail.tags.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {viewingDetail.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {viewingDetail.file_name && (
                  <div className="mb-3 rounded-md border border-border bg-bg-base/50 px-3 py-2 text-xs">
                    <span className="flex items-center gap-1.5 text-text-secondary">
                      <Archive size={12} className="text-cyan-400" />
                      附件: {viewingDetail.file_name}
                      <span className="text-text-muted">
                        ({(viewingDetail.file_size / 1024).toFixed(1)} KB)
                      </span>
                    </span>
                  </div>
                )}

                <div className="border-t border-border pt-3">
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{viewingDetail.content}</ReactMarkdown>
                  </div>
                </div>

                {/* 评分区 */}
                <div className="mt-4 border-t border-border pt-3">
                  <div className="mb-2 text-xs font-medium text-text-primary">为这个技能评分</div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setRatingValue(star)}
                          className="p-0.5"
                        >
                          <Star
                            size={18}
                            className={clsx(
                              'transition-colors',
                              star <= ratingValue
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-text-muted hover:text-amber-400'
                            )}
                          />
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={handleRate}
                      disabled={ratingValue < 1 || submittingRating}
                      className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                    >
                      {submittingRating ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        '提交评分'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-text-muted">加载失败</div>
            )}
          </div>
        ) : loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : error ? (
          <div className="flex h-40 flex-col items-center justify-center text-danger animate-fade-in">
            <AlertCircle size={36} className="mb-2 opacity-70" />
            <p className="text-sm">无法连接到 XSkillHub</p>
            <p className="mt-1 text-xs text-text-muted">{error}</p>
            <p className="mt-2 text-xs text-text-muted">
              请确保 xskillhub-server 已启动（端口 3210）
            </p>
            <button
              onClick={loadList}
              className="mt-3 rounded-md bg-bg-hover px-3 py-1 text-xs text-text-primary hover:bg-bg-hover/80"
            >
              重试
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center text-text-muted animate-fade-in">
            <Store size={36} className="mb-2 opacity-30" />
            <p className="text-sm">没有找到技能</p>
            <p className="mt-1 text-xs">试试调整搜索条件或分类筛选</p>
          </div>
        ) : (
          <>
            <div className="mb-2 text-[11px] text-text-muted">
              共 {total} 个技能 · 第 {page}/{totalPages} 页
            </div>
            <div className="space-y-2">
              {items.map((item) => {
                const rating = getRating(item)
                const isInstalled = installedIds.has(item.id)
                return (
                  <div
                    key={item.id}
                    className="group stagger-item rounded-lg border border-border bg-bg-base/50 p-3 transition-all hover:border-cyan-500/40 hover:bg-bg-base hover:shadow-lg hover:shadow-cyan-500/5 hover:-translate-y-0.5"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-cyan-500/10">
                        <Package size={14} className="text-cyan-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-medium text-text-primary">{item.name}</span>
                          <span className="rounded bg-cyan-500/10 px-1 py-0 text-[9px] text-cyan-400">
                            {item.category}
                          </span>
                          <span className="text-[9px] text-text-muted">v{item.version}</span>
                          <span className="flex items-center gap-0.5 text-[9px] text-amber-400">
                            <Star size={9} className="fill-amber-400" />
                            {rating.toFixed(1)}
                          </span>
                          <span className="text-[9px] text-text-muted">
                            {item.download_count} 下载
                          </span>
                          <span className="text-[9px] text-text-muted">
                            {formatDate(item.created_at)}
                          </span>
                        </div>
                        <p className="mb-1 text-xs leading-relaxed text-text-secondary line-clamp-2">
                          {item.description}
                        </p>
                        <div className="flex items-center gap-2 text-[9px] text-text-muted">
                          <span className="flex items-center gap-0.5">
                            <User size={9} />
                            {item.author}
                          </span>
                          {item.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded bg-accent/10 px-1 text-accent">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => handleViewDetail(item.id)}
                          title="查看详情"
                          className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-text-primary"
                        >
                          <Eye size={11} />
                        </button>
                        <button
                          onClick={() => handleInstall(item.id)}
                          disabled={installing === item.id || isInstalled}
                          title={isInstalled ? '已安装' : '安装'}
                          className={clsx(
                            'flex h-6 w-6 items-center justify-center rounded',
                            isInstalled
                              ? 'text-green-400'
                              : 'text-accent hover:bg-accent/15'
                          )}
                        >
                          {installing === item.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : isInstalled ? (
                            <Check size={11} />
                          ) : (
                            <Download size={11} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-text-secondary">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部说明 */}
      <div className="border-t border-border bg-bg-base/50 px-5 py-2">
        <p className="text-[10px] text-text-muted">
          XSkillHub 是 Xcomputer 的技能分享市场。在这里可以浏览、搜索、安装社区共享的技能，
          也可以将自己的技能发布到市场供其他用户使用。
        </p>
      </div>
    </>
  )
}

// ============ 发布技能标签 ============
function PublishTab(): JSX.Element {
  const [form, setForm] = useState({
    name: '',
    description: '',
    author: '',
    category: '通用',
    tags: '',
    version: '1.0.0',
    content: ''
  })
  const [filePath, setFilePath] = useState<string | undefined>(undefined)
  const [fileName, setFileName] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<
    { success: boolean; id?: number; error?: string } | null
  >(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    // Electron 的 File 对象包含非标准 path 属性
    setFilePath((file as File & { path: string }).path)
    setFileName(file.name)

    // 只对文本类文件读取内容，二进制文件（zip/exe/png 等）跳过以避免卡死
    const textExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx',
      '.py', '.sh', '.bat', '.ps1', '.yaml', '.yml', '.xml', '.html', '.css',
      '.sql', '.toml', '.ini', '.conf', '.csv', '.log']
    const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
    if (textExtensions.includes(ext)) {
      const reader = new FileReader()
      reader.onload = (): void => {
        const text = typeof reader.result === 'string' ? reader.result : ''
        setForm((prev) => ({
          ...prev,
          name: prev.name || file.name.replace(/\.[^.]+$/, ''),
          content: text
        }))
      }
      // 限制读取大小（1MB）
      if (file.size > 1024 * 1024) {
        setForm((prev) => ({
          ...prev,
          name: prev.name || file.name.replace(/\.[^.]+$/, ''),
          content: `[文件过大，已跳过内容读取，请手动填写描述]`
        }))
      } else {
        reader.readAsText(file)
      }
    } else {
      // 二进制文件：仅设置名称，不读取内容
      setForm((prev) => ({
        ...prev,
        name: prev.name || file.name.replace(/\.[^.]+$/, '')
      }))
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePublish = async (): Promise<void> => {
    if (!form.name.trim() || !form.description.trim() || !form.content.trim()) {
      alert('请填写技能名称、描述和内容')
      return
    }
    setPublishing(true)
    setPublishResult(null)
    try {
      const result = await window.api.skillHub.upload({
        name: form.name.trim(),
        description: form.description.trim(),
        author: form.author.trim() || '匿名用户',
        category: form.category,
        tags: form.tags
          ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        version: form.version.trim() || '1.0.0',
        content: form.content,
        filePath
      })
      setPublishResult(result)
      if (result.success) {
        // 清空表单
        setForm({
          name: '',
          description: '',
          author: '',
          category: '通用',
          tags: '',
          version: '1.0.0',
          content: ''
        })
        setFilePath(undefined)
        setFileName(null)
      }
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
            <Upload size={16} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">发布技能到 XSkillHub</h3>
            <p className="text-[10px] text-text-muted">
              将你的技能分享给全球 Xcomputer 用户
            </p>
          </div>
        </div>

        {publishResult && (
          <div
            className={clsx(
              'mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-xs animate-fade-in',
              publishResult.success
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : 'border-danger/30 bg-danger/10 text-danger'
            )}
          >
            {publishResult.success ? (
              <>
                <Check size={14} className="mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium">发布成功！</div>
                  <div className="mt-0.5 text-[10px] opacity-80">
                    技能 ID: {publishResult.id}。其他用户现在可以在 XSkillHub 中搜索并安装你的技能。
                  </div>
                </div>
              </>
            ) : (
              <>
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium">发布失败</div>
                  <div className="mt-0.5 text-[10px] opacity-80">{publishResult.error}</div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="space-y-3">
          {/* 名称 + 作者 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">
                技能名称 <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：截图自动化"
                className="w-full rounded-md border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">
                作者
              </label>
              <input
                type="text"
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
                placeholder="匿名用户"
                className="w-full rounded-md border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* 描述 */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-secondary">
              简短描述 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="一句话描述技能功能"
              className="w-full rounded-md border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>

          {/* 分类 + 版本 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">
                分类
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-md border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
              >
                {HUB_CATEGORIES_DEFAULT.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">
                版本号
              </label>
              <input
                type="text"
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="1.0.0"
                className="w-full rounded-md border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* 标签 */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-secondary">
              标签（逗号分隔）
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="如：截图,自动化,工具"
              className="w-full rounded-md border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>

          {/* 文件附件 */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-secondary">
              附件文件（可选，支持 .md/.txt/.json/.zip）
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-md border border-dashed border-border bg-bg-base px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <Upload size={12} />
                选择文件
              </button>
              {fileName && (
                <span className="flex items-center gap-1 text-xs text-text-secondary">
                  <FileText size={11} className="text-cyan-400" />
                  {fileName}
                  <button
                    onClick={() => {
                      setFileName(null)
                      setFilePath(undefined)
                    }}
                    className="ml-1 text-text-muted hover:text-danger"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.json,.zip"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            <p className="mt-1 text-[10px] text-text-muted">
              选择文件后会自动填充名称和内容（文本类文件）
            </p>
          </div>

          {/* 内容 */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-secondary">
              技能内容 <span className="text-danger">*</span>
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="支持 Markdown 格式。详细描述技能的功能、使用方法、触发条件等..."
              rows={10}
              className="w-full resize-none rounded-md border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>

          {/* 提交按钮 */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setForm({
                  name: '',
                  description: '',
                  author: '',
                  category: '通用',
                  tags: '',
                  version: '1.0.0',
                  content: ''
                })
                setFilePath(undefined)
                setFileName(null)
                setPublishResult(null)
              }}
              className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
            >
              清空
            </button>
            <button
              onClick={handlePublish}
              disabled={
                publishing ||
                !form.name.trim() ||
                !form.description.trim() ||
                !form.content.trim()
              }
              className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {publishing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Upload size={12} />
              )}
              {publishing ? '发布中...' : '发布到 XSkillHub'}
            </button>
          </div>
        </div>

        {/* 提示信息 */}
        <div className="mt-4 rounded-md border border-border bg-bg-base/50 px-3 py-2">
          <p className="text-[10px] leading-relaxed text-text-muted">
            <TrendingUp size={10} className="mr-1 inline text-accent" />
            发布提示：优质的技能会被更多用户下载和使用，获得更高的评分。请确保技能内容清晰、可复用。
            发布后可在「技能市场」标签页查看。如需修改，请访问 XSkillHub 网站。
          </p>
        </div>
      </div>
    </div>
  )
}

// ============ 管理员标签 ============
function AdminTab(): JSX.Element {
  const [loggedIn, setLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [logining, setLogining] = useState(false)
  const [loginError, setLoginError] = useState('')

  // 管理员数据
  const [adminUsername, setAdminUsername] = useState('')
  const [skills, setSkills] = useState<HubSkillListItem[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 弹窗
  const [editingSkill, setEditingSkill] = useState<HubSkillListItem | null>(null)
  const [deletingSkill, setDeletingSkill] = useState<HubSkillListItem | null>(null)
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  // 启动时检查登录状态
  useEffect(() => {
    checkLoginStatus()
  }, [])

  async function checkLoginStatus(): Promise<void> {
    const result = await window.api.skillHub.adminInfo()
    if ('username' in result) {
      setAdminUsername(result.username)
      setLoggedIn(true)
      loadSkills(1)
    }
  }

  async function handleLogin(): Promise<void> {
    if (!username.trim() || !password) {
      setLoginError('请输入用户名和密码')
      return
    }
    setLogining(true)
    setLoginError('')
    const result = await window.api.skillHub.adminLogin(username.trim(), password)
    if ('success' in result) {
      setAdminUsername(result.username)
      setLoggedIn(true)
      setPassword('')
      loadSkills(1)
    } else {
      setLoginError(result.error)
    }
    setLogining(false)
  }

  async function handleLogout(): Promise<void> {
    await window.api.skillHub.adminLogout()
    setLoggedIn(false)
    setAdminUsername('')
    setSkills([])
  }

  async function loadSkills(targetPage: number, q?: string): Promise<void> {
    setLoading(true)
    setError('')
    const result = await window.api.skillHub.adminList({
      q: q ?? keyword,
      page: targetPage,
      limit: 10
    })
    if ('items' in result) {
      setSkills(result.items)
      setTotal(result.total)
      setTotalPages(result.totalPages)
      setPage(targetPage)
    } else {
      setError(result.error)
      if (result.error.includes('未登录') || result.error.includes('过期')) {
        setLoggedIn(false)
      }
    }
    setLoading(false)
  }

  async function handleDelete(): Promise<void> {
    if (!deletingSkill) return
    const result = await window.api.skillHub.adminDelete(String(deletingSkill.id))
    if ('success' in result) {
      setDeletingSkill(null)
      loadSkills(page, keyword)
    } else {
      setError(result.error)
    }
  }

  // 未登录：显示登录表单
  if (!loggedIn) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-sm">
          <div className="mb-6 flex flex-col items-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
              <Shield size={24} className="text-white" />
            </div>
            <h3 className="text-sm font-semibold">管理员登录</h3>
            <p className="mt-1 text-[10px] text-text-muted">登录后管理 XSkillHub 技能市场</p>
          </div>

          {loginError && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle size={12} className="shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-text-secondary">用户名</label>
              <div className="relative">
                <User size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="请输入用户名"
                  className="w-full rounded-md border border-border bg-bg-base py-2 pl-8 pr-3 text-xs text-text-primary outline-none focus:border-accent"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">密码</label>
              <div className="relative">
                <Lock size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="请输入密码"
                  className="w-full rounded-md border border-border bg-bg-base py-2 pl-8 pr-3 text-xs text-text-primary outline-none focus:border-accent"
                />
              </div>
            </div>
            <button
              onClick={handleLogin}
              disabled={logining}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {logining ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
              {logining ? '登录中...' : '登录'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 已登录：显示管理面板
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-purple-400" />
          <span className="text-xs font-medium">管理员：{adminUsername}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowPasswordModal(true)}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <KeyRound size={10} />
            修改密码
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-red-400 transition-colors hover:bg-red-500/10"
          >
            <LogOut size={10} />
            退出
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle size={12} className="shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto">
            <X size={12} />
          </button>
        </div>
      )}

      {/* 搜索栏 */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadSkills(1, keyword)}
            placeholder="搜索技能..."
            className="w-full rounded-md border border-border bg-bg-base py-1.5 pl-8 pr-3 text-xs outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={() => loadSkills(1, keyword)}
          className="rounded-md bg-bg-hover px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          搜索
        </button>
      </div>

      {/* 技能列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
            <Loader2 size={16} className="mr-2 animate-spin" />
            加载中...
          </div>
        ) : skills.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
            暂无技能数据
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-panel">
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-4 py-2 font-medium">名称</th>
                <th className="px-4 py-2 font-medium">作者</th>
                <th className="px-4 py-2 font-medium">分类</th>
                <th className="px-4 py-2 text-center font-medium">下载</th>
                <th className="px-4 py-2 text-center font-medium">评分</th>
                <th className="px-4 py-2 text-center font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((skill) => (
                <tr key={skill.id} className="border-b border-border/50 hover:bg-bg-hover/30">
                  <td className="px-4 py-2">
                    <div className="font-medium text-text-primary">{skill.name}</div>
                    <div className="mt-0.5 truncate text-[10px] text-text-muted max-w-[200px]">
                      {skill.description}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-text-secondary">{skill.author}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px]">{skill.category}</span>
                  </td>
                  <td className="px-4 py-2 text-center text-text-secondary">{skill.download_count}</td>
                  <td className="px-4 py-2 text-center text-text-secondary">
                    {skill.rating_count > 0
                      ? (skill.rating_sum / skill.rating_count).toFixed(1)
                      : '-'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setEditingSkill(skill)}
                        className="rounded p-1 text-text-muted transition-colors hover:bg-blue-500/10 hover:text-blue-400"
                        title="编辑"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => setDeletingSkill(skill)}
                        className="rounded p-1 text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <span className="text-[10px] text-text-muted">
            共 {total} 条，第 {page}/{totalPages} 页
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => loadSkills(page - 1)}
              disabled={page <= 1}
              className="rounded border border-border px-2 py-1 text-[10px] disabled:opacity-40 hover:bg-bg-hover"
            >
              上一页
            </button>
            <button
              onClick={() => loadSkills(page + 1)}
              disabled={page >= totalPages}
              className="rounded border border-border px-2 py-1 text-[10px] disabled:opacity-40 hover:bg-bg-hover"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {editingSkill && (
        <AdminEditModal
          skill={editingSkill}
          onClose={() => setEditingSkill(null)}
          onSuccess={() => {
            setEditingSkill(null)
            loadSkills(page, keyword)
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      {deletingSkill && (
        <AdminDeleteModal
          skill={deletingSkill}
          onClose={() => setDeletingSkill(null)}
          onConfirm={handleDelete}
        />
      )}

      {/* 修改密码弹窗 */}
      {showPasswordModal && (
        <AdminPasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  )
}

// ============ 管理员编辑弹窗 ============
function AdminEditModal({
  skill,
  onClose,
  onSuccess
}: {
  skill: HubSkillListItem
  onClose: () => void
  onSuccess: () => void
}): JSX.Element {
  const [name, setName] = useState(skill.name)
  const [description, setDescription] = useState(skill.description)
  const [category, setCategory] = useState(skill.category)
  const [tags, setTags] = useState(skill.tags.join(', '))
  const [version, setVersion] = useState(skill.version)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(): Promise<void> {
    setSaving(true)
    setError('')
    const result = await window.api.skillHub.adminUpdate(String(skill.id), {
      name,
      description,
      category,
      tags,
      version
    })
    if ('error' in result) {
      setError(result.error)
    } else {
      onSuccess()
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Edit2 size={14} />
            编辑技能
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={14} />
          </button>
        </div>

        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertCircle size={12} />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-text-secondary">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-bg-base px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-bg-base px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-text-secondary">分类</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-border bg-bg-base px-3 py-1.5 text-xs outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">版本</label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full rounded-md border border-border bg-bg-base px-3 py-1.5 text-xs outline-none focus:border-accent"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">标签（逗号分隔）</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded-md border border-border bg-bg-base px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-bg-hover"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ============ 管理员删除确认弹窗 ============
function AdminDeleteModal({
  skill,
  onClose,
  onConfirm
}: {
  skill: HubSkillListItem
  onClose: () => void
  onConfirm: () => void
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10">
            <AlertCircle size={16} className="text-red-400" />
          </div>
          <h3 className="text-sm font-semibold">确认删除</h3>
        </div>
        <p className="mb-1 text-xs text-text-secondary">确定要删除以下技能吗？</p>
        <p className="mb-2 text-xs font-medium">「{skill.name}」</p>
        <p className="mb-4 text-[10px] text-text-muted">
          此操作不可撤销，关联的评分记录和上传文件将一并删除。
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-bg-hover"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-xs text-white hover:bg-red-600"
          >
            <Trash2 size={12} />
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}

// ============ 管理员修改密码弹窗 ============
function AdminPasswordModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(): Promise<void> {
    setError('')
    if (!oldPwd || !newPwd || !confirmPwd) {
      setError('请填写所有字段')
      return
    }
    if (newPwd.length < 6) {
      setError('新密码长度至少 6 位')
      return
    }
    if (newPwd !== confirmPwd) {
      setError('两次输入的新密码不一致')
      return
    }
    setSaving(true)
    const result = await window.api.skillHub.adminChangePassword(oldPwd, newPwd)
    if ('success' in result) {
      setSuccess(true)
      setTimeout(onClose, 1500)
    } else {
      setError(result.error)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound size={14} />
            修改密码
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={14} />
          </button>
        </div>

        {success ? (
          <div className="py-4 text-center text-xs text-green-400">密码修改成功！</div>
        ) : (
          <div className="space-y-3">
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <AlertCircle size={12} />
                <span>{error}</span>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-text-secondary">旧密码</label>
              <input
                type="password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                className="w-full rounded-md border border-border bg-bg-base px-3 py-1.5 text-xs outline-none focus:border-accent"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">新密码</label>
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="w-full rounded-md border border-border bg-bg-base px-3 py-1.5 text-xs outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">确认新密码</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className="w-full rounded-md border border-border bg-bg-base px-3 py-1.5 text-xs outline-none focus:border-accent"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-bg-hover"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="rounded-md bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                {saving ? '保存中...' : '确认修改'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
