import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import {
  Code,
  Plus,
  Trash2,
  Pencil,
  X,
  Search,
  Tag,
  Copy,
  Check,
  FileCode
} from 'lucide-react'
import { clsx } from 'clsx'
import type { CodeSnippet } from '@shared/types'

interface SnippetsModalProps {
  onClose: () => void
}

interface SnippetForm {
  title: string
  description: string
  language: string
  category: string
  content: string
  tagsText: string
}

const DEFAULT_FORM: SnippetForm = {
  title: '',
  description: '',
  language: 'javascript',
  category: '',
  content: '',
  tagsText: ''
}

const LANGUAGE_OPTIONS: string[] = [
  'javascript',
  'typescript',
  'python',
  'java',
  'csharp',
  'cpp',
  'go',
  'rust',
  'html',
  'css',
  'json',
  'bash',
  'powershell',
  'sql',
  'markdown',
  'plaintext'
]

function emptyForm(): SnippetForm {
  return { ...DEFAULT_FORM }
}

function snippetToForm(s: CodeSnippet): SnippetForm {
  return {
    title: s.title,
    description: s.description,
    language: s.language,
    category: s.category,
    content: s.content,
    tagsText: s.tags.join(', ')
  }
}

function formToItem(form: SnippetForm): {
  title: string
  description: string
  language: string
  content: string
  tags?: string[]
  category: string
} {
  const tags = form.tagsText
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    language: form.language,
    content: form.content,
    tags: tags.length > 0 ? tags : undefined,
    category: form.category.trim()
  }
}

/** 渲染带行号的代码内容（只读展示用） */
function renderCodeWithLineNumbers(content: string, language: string): JSX.Element {
  const lines = content.length === 0 ? [''] : content.split('\n')
  return (
    <div className="flex overflow-auto bg-[#0d1117] font-mono text-[12px] leading-[1.55]">
      <div className="select-none border-r border-[#30363d] bg-[#0d1117] px-2 py-2 text-right text-[#6e7681]">
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <pre className="flex-1 overflow-x-auto px-3 py-2 text-[#c9d1d9]">
        <code data-lang={language}>
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre">
              {line || ' '}
            </div>
          ))}
        </code>
      </pre>
    </div>
  )
}

/** 行号 textarea 编辑器：行号与文本对齐 */
function CodeEditor(props: {
  value: string
  onChange: (v: string) => void
  language: string
}): JSX.Element {
  const { value, onChange, language } = props
  const lines = value.length === 0 ? [''] : value.split('\n')
  return (
    <div className="relative flex flex-1 overflow-hidden rounded-md border border-border bg-[#0d1117]">
      <div className="select-none overflow-hidden border-r border-[#30363d] bg-[#0d1117] px-2 py-2 text-right font-mono text-[12px] leading-[1.55] text-[#6e7681]">
        {lines.map((_, i) => (
          <div key={i} className="whitespace-pre">
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        data-lang={language}
        placeholder={`// ${language} 代码...`}
        className="flex-1 resize-none overflow-auto bg-[#0d1117] px-3 py-2 font-mono text-[12px] leading-[1.55] text-[#c9d1d9] placeholder:text-[#6e7681] focus:outline-none"
        rows={14}
      />
    </div>
  )
}

export function SnippetsModal({ onClose }: SnippetsModalProps): JSX.Element {
  const [snippets, setSnippets] = useState<CodeSnippet[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SnippetForm>(emptyForm())
  const { confirmDeleteId, requestConfirm, resetConfirm } = useConfirmDelete()
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSnippets = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.snippet.list()
      setSnippets(list)
    } catch (err) {
      console.error('[SnippetsModal] load failed:', err)
    }
  }, [])

  useEffect(() => {
    void loadSnippets()
    const unsub = window.api.snippet.onChanged(() => {
      void loadSnippets()
    })
    return unsub
  }, [loadSnippets])

  // 组件卸载时清理 copy 定时器，防止泄漏
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const sorted = useMemo(
    () => snippets.slice().sort((a, b) => b.updatedAt - a.updatedAt),
    [snippets]
  )

  const filtered = useMemo(() => {
    if (!searchKeyword.trim()) return sorted
    const kw = searchKeyword.toLowerCase()
    return sorted.filter((s) => {
      const haystack =
        `${s.title} ${s.description} ${s.content} ${s.language} ${s.category} ${s.tags.join(' ')}`.toLowerCase()
      return haystack.includes(kw)
    })
  }, [sorted, searchKeyword])

  const selected = selectedId ? snippets.find((s) => s.id === selectedId) : null

  const isEditing = editingId !== null
  const showFormPanel = showForm || isEditing

  const handleAdd = async (): Promise<void> => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('标题和代码内容为必填项')
      return
    }
    try {
      await window.api.snippet.add(formToItem(form))
      setForm(emptyForm())
      setShowForm(false)
      setError(null)
      await loadSnippets()
    } catch (err) {
      console.error('[SnippetsModal] add failed:', err)
      setError(`添加失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleStartEdit = (s: CodeSnippet): void => {
    setEditingId(s.id)
    setSelectedId(null)
    setShowForm(false)
    setForm(snippetToForm(s))
    setError(null)
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (!editingId) return
    if (!form.title.trim() || !form.content.trim()) {
      setError('标题和代码内容为必填项')
      return
    }
    try {
      const result = await window.api.snippet.update(editingId, formToItem(form))
      if (!result) {
        setError('保存失败：未找到该代码片段')
        return
      }
      setEditingId(null)
      setForm(emptyForm())
      setError(null)
      await loadSnippets()
    } catch (err) {
      console.error('[SnippetsModal] save edit failed:', err)
      setError(`保存失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await window.api.snippet.delete(id)
      if (editingId === id) {
        setEditingId(null)
        setForm(emptyForm())
      }
      if (selectedId === id) setSelectedId(null)
      resetConfirm()
      await loadSnippets()
    } catch (err) {
      console.error('[SnippetsModal] delete failed:', err)
      setError(`删除失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleToggle = async (s: CodeSnippet): Promise<void> => {
    try {
      await window.api.snippet.toggle(s.id, !s.enabled)
      await loadSnippets()
    } catch (err) {
      console.error('[SnippetsModal] toggle failed:', err)
    }
  }

  const handleCancelForm = (): void => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm())
    setError(null)
  }

  const handleCopy = async (s: CodeSnippet): Promise<void> => {
    try {
      await navigator.clipboard.writeText(s.content)
      setCopiedId(s.id)
      // 增加使用次数
      await window.api.snippet.update(s.id, { useCount: s.useCount + 1 })
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => {
        setCopiedId((prev) => (prev === s.id ? null : prev))
        copyTimerRef.current = null
      }, 1500)
    } catch (err) {
      console.error('[SnippetsModal] copy failed:', err)
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
        className="flex h-[85vh] w-[1100px] max-w-[95vw] animate-scale-in flex-col overflow-hidden rounded-xl border border-border bg-bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 shadow-md">
              <Code size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">代码片段</h2>
              <p className="text-[10px] text-text-muted">
                保存常用代码片段，AI 可通过 Snippet 工具检索使用
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
              placeholder="搜索标题、描述、内容、语言、标签..."
              className="w-full rounded-md border border-border bg-bg-base py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <span className="text-[10px] text-text-muted">
            共 {snippets.length} 个 · 已启用 {snippets.filter((s) => s.enabled).length} 个
          </span>
          <button
            onClick={() => {
              setShowForm(!showForm)
              setEditingId(null)
              setSelectedId(null)
              setForm(emptyForm())
              setError(null)
            }}
            className={clsx(
              'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              showForm
                ? 'bg-bg-hover text-text-secondary'
                : 'bg-accent/15 text-accent hover:bg-accent/25'
            )}
          >
            <Plus size={12} />
            新建片段
          </button>
        </div>

        {/* 主体 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧列表 */}
          <div
            className={clsx(
              'flex flex-col overflow-hidden',
              showFormPanel ? 'w-[38%] border-r border-border' : 'w-full'
            )}
          >
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {filtered.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-text-muted">
                  <Code size={40} className="mb-3 opacity-30" />
                  <p className="text-xs">
                    {snippets.length === 0
                      ? '还没有代码片段。点击"新建片段"开始。'
                      : '没有匹配的代码片段'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedId(s.id)
                        setEditingId(null)
                        setShowForm(false)
                        setError(null)
                      }}
                      className={clsx(
                        'group cursor-pointer rounded-lg border p-2.5 transition-colors',
                        selectedId === s.id || editingId === s.id
                          ? 'border-accent/50 bg-accent/5'
                          : 'border-border bg-bg-base/50 hover:border-border/80 hover:bg-bg-base'
                      )}
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="flex-1 truncate text-xs font-medium text-text-primary">
                          {s.title}
                        </span>
                        <code className="flex-shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent">
                          {s.language}
                        </code>
                      </div>
                      <p className="mb-1.5 text-[11px] leading-relaxed text-text-secondary line-clamp-2">
                        {s.description || s.content.slice(0, 80)}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-1 text-[9px] text-text-muted">
                          {s.category && (
                            <span className="flex items-center gap-0.5 rounded bg-bg-hover px-1 py-0">
                              <Tag size={8} />
                              {s.category}
                            </span>
                          )}
                          <span className="flex items-center gap-0.5">
                            <FileCode size={8} />
                            使用 {s.useCount} 次
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* 启用开关 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleToggle(s)
                            }}
                            className={clsx(
                              'relative h-4 w-7 rounded-full transition-colors',
                              s.enabled ? 'bg-accent' : 'bg-bg-hover'
                            )}
                            title={s.enabled ? '点击禁用' : '点击启用'}
                          >
                            <span
                              className={clsx(
                                'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform',
                                s.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                              )}
                            />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartEdit(s)
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                            title="编辑"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirmDeleteId === s.id) {
                                void handleDelete(s.id)
                              } else {
                                requestConfirm(s.id)
                              }
                            }}
                            className={clsx(
                              'flex h-6 w-6 items-center justify-center rounded transition-colors',
                              confirmDeleteId === s.id
                                ? 'bg-danger text-white'
                                : 'text-text-muted hover:bg-danger/10 hover:text-danger'
                            )}
                            title={confirmDeleteId === s.id ? '再次点击确认删除' : '删除'}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 右侧面板 */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {showFormPanel ? (
              /* 新建/编辑表单 */
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <span className="text-xs font-medium text-text-primary">
                    {isEditing ? '编辑代码片段' : '新建代码片段'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleCancelForm}
                      className="rounded-md px-3 py-1 text-xs text-text-muted hover:text-text-primary"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => void (isEditing ? handleSaveEdit() : handleAdd())}
                      className="flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
                    >
                      <Check size={12} />
                      保存
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {error && (
                    <div className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
                      {error}
                    </div>
                  )}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                          标题 *
                        </label>
                        <input
                          type="text"
                          value={form.title}
                          onChange={(e) => setForm({ ...form, title: e.target.value })}
                          placeholder="文件上传工具函数"
                          className="w-full rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                        />
                      </div>
                      <div className="w-40">
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                          语言
                        </label>
                        <select
                          value={form.language}
                          onChange={(e) => setForm({ ...form, language: e.target.value })}
                          className="w-full rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                        >
                          {LANGUAGE_OPTIONS.map((lang) => (
                            <option key={lang} value={lang}>
                              {lang}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                          描述
                        </label>
                        <input
                          type="text"
                          value={form.description}
                          onChange={(e) => setForm({ ...form, description: e.target.value })}
                          placeholder="简短说明用途（可选）"
                          className="w-full rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                          分类
                        </label>
                        <input
                          type="text"
                          value={form.category}
                          onChange={(e) => setForm({ ...form, category: e.target.value })}
                          placeholder="前端/后端/工具..."
                          className="w-full rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                        标签（逗号分隔）
                      </label>
                      <input
                        type="text"
                        value={form.tagsText}
                        onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
                        placeholder="上传, 文件, async"
                        className="w-full rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-1 flex-col">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                        代码内容 *
                      </label>
                      <CodeEditor
                        value={form.content}
                        onChange={(v) => setForm({ ...form, content: v })}
                        language={form.language}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : selected ? (
              /* 详情视图 */
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-text-primary">
                      {selected.title}
                    </h3>
                    <code className="flex-shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent">
                      {selected.language}
                    </code>
                    {selected.category && (
                      <span className="flex-shrink-0 flex items-center gap-0.5 rounded bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-secondary">
                        <Tag size={9} />
                        {selected.category}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      onClick={() => void handleCopy(selected)}
                      className={clsx(
                        'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors',
                        copiedId === selected.id
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                      )}
                      title="复制代码到剪贴板"
                    >
                      {copiedId === selected.id ? <Check size={11} /> : <Copy size={11} />}
                      {copiedId === selected.id ? '已复制' : '复制'}
                    </button>
                    <button
                      onClick={() => handleStartEdit(selected)}
                      className="flex items-center gap-1 rounded-md bg-bg-hover px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
                    >
                      <Pencil size={11} />
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
                      title={confirmDeleteId === selected.id ? '再次点击确认删除' : '删除'}
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
                  {selected.tags.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      {selected.tags.map((t) => (
                        <span
                          key={t}
                          className="flex items-center gap-0.5 rounded bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-secondary"
                        >
                          <Tag size={8} />
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    <FileCode size={10} />
                    代码内容
                  </div>
                  <div className="overflow-hidden rounded-lg border border-[#30363d]">
                    {renderCodeWithLineNumbers(selected.content, selected.language)}
                  </div>
                  <div className="mt-3 flex items-center gap-3 border-t border-border pt-2 text-[10px] text-text-muted">
                    <span className="flex items-center gap-0.5">
                      <FileCode size={9} />
                      使用 {selected.useCount} 次
                    </span>
                    <span className="flex items-center gap-0.5">
                      创建于 {formatTime(selected.createdAt)}
                    </span>
                    <span className="flex items-center gap-0.5">
                      更新于 {formatTime(selected.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* 空状态 */
              <div className="flex flex-1 flex-col items-center justify-center text-text-muted">
                <Code size={48} className="mb-3 opacity-30" />
                <p className="text-xs">
                  {snippets.length === 0
                    ? '还没有代码片段，点击"新建片段"开始'
                    : '从左侧选择一个片段查看详情'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
