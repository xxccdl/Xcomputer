import { useEffect, useState, useCallback, useRef } from 'react'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import {
  X,
  Plus,
  Trash2,
  Search,
  Bookmark,
  Upload,
  Edit2,
  Check,
  Send,
  FileText,
  Tag,
  Clock
} from 'lucide-react'
import { clsx } from 'clsx'
import type { TaskTemplate } from '@shared/types'
import { useSend } from '../../hooks/useChat'
import { useSession } from '../../hooks/useSession'
import { useSessionStore } from '../../store/session.store'

interface TemplatesModalProps {
  onClose: () => void
}

export function TemplatesModal({ onClose }: TemplatesModalProps): JSX.Element {
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { confirmDeleteId, requestConfirm, resetConfirm } = useConfirmDelete()
  const [editState, setEditState] = useState({
    name: '',
    description: '',
    category: '',
    prompt: ''
  })
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    category: '',
    prompt: ''
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const send = useSend()
  const { currentSessionId, createSession } = useSession()

  const loadTemplates = useCallback(async (): Promise<void> => {
    const list = await window.api.template.list()
    setTemplates(list)
  }, [])

  useEffect(() => {
    void loadTemplates()
    const unsub = window.api.template.onChanged(() => {
      void loadTemplates()
    })
    return unsub
  }, [loadTemplates])

  // 按 updatedAt 降序（store.list 已排序，这里再做一次保证）
  const sorted = templates.slice().sort((a, b) => b.updatedAt - a.updatedAt)

  const filtered = sorted.filter((t) => {
    if (!searchKeyword) return true
    const kw = searchKeyword.toLowerCase()
    const haystack = `${t.name} ${t.description} ${t.category} ${t.prompt}`.toLowerCase()
    return haystack.includes(kw)
  })

  const selected = selectedId ? templates.find((t) => t.id === selectedId) : null

  const handleAdd = async (): Promise<void> => {
    if (!newTemplate.name.trim() || !newTemplate.prompt.trim()) return
    try {
      await window.api.template.add({
        name: newTemplate.name.trim(),
        description: newTemplate.description.trim(),
        prompt: newTemplate.prompt,
        category: newTemplate.category.trim()
      })
      setNewTemplate({ name: '', description: '', category: '', prompt: '' })
      setShowAddForm(false)
      await loadTemplates()
    } catch (err) {
      console.error('[TemplatesModal] add failed:', err)
      alert(`添加模板失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleStartEdit = (t: TaskTemplate): void => {
    setEditingId(t.id)
    setSelectedId(null)
    setShowAddForm(false)
    setEditState({
      name: t.name,
      description: t.description,
      category: t.category,
      prompt: t.prompt
    })
  }

  const handleSaveEdit = async (id: string): Promise<void> => {
    try {
      const result = await window.api.template.update(id, {
        name: editState.name.trim(),
        description: editState.description.trim(),
        category: editState.category.trim(),
        prompt: editState.prompt
      })
      if (!result) {
        alert('保存失败')
        return
      }
      setEditingId(null)
      await loadTemplates()
    } catch (err) {
      console.error('[TemplatesModal] save edit failed:', err)
      alert(`保存失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await window.api.template.delete(id)
      if (selectedId === id) setSelectedId(null)
      resetConfirm()
      await loadTemplates()
    } catch (err) {
      console.error('[TemplatesModal] delete failed:', err)
      alert(`删除失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const fileName = file.name.replace(/\.[^.]+$/, '')
      if (showAddForm) {
        setNewTemplate((prev) => ({
          ...prev,
          name: prev.name || fileName,
          prompt: text
        }))
      } else if (editingId) {
        setEditState((prev) => ({
          ...prev,
          name: prev.name || fileName,
          prompt: text
        }))
      } else {
        // 没有在编辑/新建时，直接进入新建并填充
        setShowAddForm(true)
        setNewTemplate({
          name: fileName,
          description: '',
          category: '',
          prompt: text
        })
      }
    } catch (err) {
      console.error('[TemplatesModal] upload file failed:', err)
      alert(`读取文件失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /** 使用模板：将 prompt 发送给 AI */
  const handleUseTemplate = async (t: TaskTemplate): Promise<void> => {
    if (!t.prompt.trim()) return
    try {
      // 增加使用次数
      await window.api.template.update(t.id, { useCount: t.useCount + 1 })
      // 确保有会话
      let sessionId = currentSessionId
      if (!sessionId) {
        await createSession()
        sessionId = useSessionStore.getState().currentSessionId
      }
      if (sessionId) {
        await send(t.prompt)
      }
      onClose()
    } catch (err) {
      console.error('[TemplatesModal] use template failed:', err)
      alert(`使用模板失败：${err instanceof Error ? err.message : String(err)}`)
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
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-[1000px] max-w-[95vw] animate-spring-scale flex-col overflow-hidden rounded-xl border border-border bg-bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-md">
              <Bookmark size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">任务模板</h2>
              <p className="text-[10px] text-text-muted">收藏常用指令，一键复用</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* 工具栏 */}
        <div className="flex items-center gap-2 border-b border-border bg-bg-base/50 px-5 py-2.5">
          <div className="relative flex-1">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索模板名称、描述、分类..."
              className="w-full rounded-md border border-border bg-bg-base py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-md bg-bg-hover px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover/80 hover:text-text-primary"
            title="从 .md/.txt 文件导入模板内容"
          >
            <Upload size={12} />
            导入文件
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt"
            onChange={handleUploadFile}
            className="hidden"
          />
          <button
            onClick={() => {
              setShowAddForm(!showAddForm)
              setEditingId(null)
              setSelectedId(null)
            }}
            className={clsx(
              'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              showAddForm
                ? 'bg-accent/15 text-accent'
                : 'bg-accent/15 text-accent hover:bg-accent/25'
            )}
          >
            <Plus size={12} />
            新建模板
          </button>
        </div>

        {/* 主体：左右分栏 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧列表 */}
          <div className="flex w-[42%] flex-col border-r border-border">
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {filtered.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-text-muted">
                  <Bookmark size={40} className="animate-float mb-3 opacity-30" />
                  <p className="text-xs">
                    {templates.length === 0
                      ? '还没有模板。点击"新建模板"或"导入文件"开始。'
                      : '没有匹配的模板'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedId(t.id)
                        setEditingId(null)
                        setShowAddForm(false)
                      }}
                      className={clsx(
                        'card-hover stagger-up group cursor-pointer rounded-lg border p-2.5 transition-colors',
                        selectedId === t.id
                          ? 'border-accent/50 bg-accent/5'
                          : 'border-border bg-bg-base/50 hover:border-border/80 hover:bg-bg-base'
                      )}
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="flex-1 truncate text-xs font-medium text-text-primary">
                          {t.name}
                        </span>
                        {t.category && (
                          <span className="flex-shrink-0 rounded bg-accent/10 px-1 py-0 text-[9px] text-accent">
                            {t.category}
                          </span>
                        )}
                      </div>
                      <p className="mb-1 text-[11px] leading-relaxed text-text-secondary line-clamp-2">
                        {t.description || t.prompt.slice(0, 80)}
                      </p>
                      <div className="flex items-center gap-2 text-[9px] text-text-muted">
                        <span className="flex items-center gap-0.5">
                          <Send size={8} />
                          使用 {t.useCount} 次
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Clock size={8} />
                          {formatTime(t.updatedAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* 底部统计 */}
            <div className="border-t border-border bg-bg-base/50 px-3 py-1.5">
              <span className="text-[10px] text-text-muted">
                共 {templates.length} 个模板
              </span>
            </div>
          </div>

          {/* 右侧详情/编辑/新建 */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {showAddForm ? (
              /* 新建表单 */
              <div className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-text-primary">新建模板</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setShowAddForm(false)
                        setNewTemplate({ name: '', description: '', category: '', prompt: '' })
                      }}
                      className="rounded-md px-3 py-1 text-xs text-text-muted hover:text-text-primary"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleAdd}
                      disabled={!newTemplate.name.trim() || !newTemplate.prompt.trim()}
                      className="flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
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
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                      placeholder="模板名称"
                      className="w-40 rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newTemplate.category}
                      onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                      placeholder="分类（可选）"
                      className="flex-1 rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    value={newTemplate.description}
                    onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                    placeholder="简短描述（可选）"
                    className="w-full rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                  <textarea
                    value={newTemplate.prompt}
                    onChange={(e) => setNewTemplate({ ...newTemplate, prompt: e.target.value })}
                    placeholder="模板指令内容（发送给 AI 的完整指令）..."
                    rows={16}
                    className="w-full resize-none rounded-md border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
            ) : editingId ? (
              /* 编辑表单 */
              <div className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-text-primary">编辑模板</span>
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
                      placeholder="模板名称"
                      className="w-40 rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      value={editState.category}
                      onChange={(e) => setEditState({ ...editState, category: e.target.value })}
                      placeholder="分类（可选）"
                      className="flex-1 rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    value={editState.description}
                    onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                    placeholder="简短描述（可选）"
                    className="w-full rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                  />
                  <textarea
                    value={editState.prompt}
                    onChange={(e) => setEditState({ ...editState, prompt: e.target.value })}
                    rows={16}
                    className="w-full resize-none rounded-md border border-accent bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:outline-none"
                  />
                </div>
              </div>
            ) : selected ? (
              /* 详情视图 */
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-text-primary">
                      {selected.name}
                    </h3>
                    {selected.category && (
                      <span className="flex-shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                        <Tag size={8} className="mr-0.5 inline" />
                        {selected.category}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleStartEdit(selected)}
                      className="flex items-center gap-1 rounded-md bg-bg-hover px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
                    >
                      <Edit2 size={11} />
                      编辑
                    </button>
                    <button
                      onClick={() => {
                        if (confirmDeleteId === selected.id) {
                          void handleDelete(selected.id)
                        } else {
                          requestConfirm(selected.id)
                        }
                      }}
                      className={clsx(
                        'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors',
                        confirmDeleteId === selected.id
                          ? 'bg-danger text-white'
                          : 'bg-danger/10 text-danger hover:bg-danger/20'
                      )}
                      title={confirmDeleteId === selected.id ? '再次点击确认删除' : '删除模板'}
                    >
                      <Trash2 size={11} />
                      {confirmDeleteId === selected.id ? '确认删除' : '删除'}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {selected.description && (
                    <p className="mb-3 text-xs leading-relaxed text-text-secondary">
                      {selected.description}
                    </p>
                  )}
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    <FileText size={10} />
                    指令内容
                  </div>
                  <pre className="mb-4 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-bg-base/50 p-3 text-xs leading-relaxed text-text-primary">
                    {selected.prompt}
                  </pre>
                  <div className="flex items-center gap-3 border-t border-border pt-2 text-[10px] text-text-muted">
                    <span className="flex items-center gap-0.5">
                      <Send size={9} />
                      使用 {selected.useCount} 次
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Clock size={9} />
                      创建于 {formatTime(selected.createdAt)}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Clock size={9} />
                      更新于 {formatTime(selected.updatedAt)}
                    </span>
                  </div>
                </div>
                {/* 底部操作栏 */}
                <div className="border-t border-border bg-bg-base/50 px-4 py-2.5">
                  <button
                    onClick={() => void handleUseTemplate(selected)}
                    disabled={!selected.prompt.trim()}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-2 text-xs font-medium text-white shadow-sm transition-all hover:shadow-md disabled:opacity-40"
                  >
                    <Send size={12} />
                    使用此模板
                  </button>
                </div>
              </div>
            ) : (
              /* 空状态 */
              <div className="flex flex-1 flex-col items-center justify-center text-text-muted">
                <Bookmark size={48} className="animate-float mb-3 opacity-30" />
                <p className="text-xs">
                  {templates.length === 0
                    ? '还没有模板，点击"新建模板"开始'
                    : '从左侧选择一个模板查看详情'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
