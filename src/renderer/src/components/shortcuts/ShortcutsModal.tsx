import { useState, useEffect, useCallback } from 'react'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import {
  Zap,
  Plus,
  Trash2,
  Pencil,
  X,
  Terminal,
  Tag,
  Check
} from 'lucide-react'
import { clsx } from 'clsx'
import type { QuickCommand } from '@shared/types'

interface ShortcutsModalProps {
  onClose: () => void
}

interface ShortcutForm {
  keyword: string
  name: string
  description: string
  category: string
  prompt: string
  stepsText: string
}

const DEFAULT_FORM: ShortcutForm = {
  keyword: '',
  name: '',
  description: '',
  category: '',
  prompt: '',
  stepsText: ''
}

function emptyForm(): ShortcutForm {
  return { ...DEFAULT_FORM }
}

function shortcutToForm(s: QuickCommand): ShortcutForm {
  return {
    keyword: s.keyword,
    name: s.name,
    description: s.description,
    category: s.category,
    prompt: s.prompt,
    stepsText: s.steps && s.steps.length > 0 ? s.steps.join('\n') : ''
  }
}

function formToItem(form: ShortcutForm): {
  keyword: string
  name: string
  description: string
  prompt: string
  steps?: string[]
  category: string
} {
  const trimmedSteps = form.stepsText
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return {
    keyword: form.keyword.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    prompt: form.prompt,
    steps: trimmedSteps.length > 0 ? trimmedSteps : undefined,
    category: form.category.trim()
  }
}

export function ShortcutsModal({ onClose }: ShortcutsModalProps): JSX.Element {
  const [shortcuts, setShortcuts] = useState<QuickCommand[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ShortcutForm>(emptyForm())
  const { confirmDeleteId, requestConfirm, resetConfirm } = useConfirmDelete()
  const [error, setError] = useState<string | null>(null)

  const loadShortcuts = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.shortcut.list()
      setShortcuts(list)
    } catch (err) {
      console.error('[ShortcutsModal] load failed:', err)
    }
  }, [])

  useEffect(() => {
    void loadShortcuts()
    const unsub = window.api.shortcut.onChanged(() => {
      void loadShortcuts()
    })
    return unsub
  }, [loadShortcuts])

  const sorted = shortcuts.slice().sort((a, b) => b.updatedAt - a.updatedAt)

  const handleAdd = async (): Promise<void> => {
    if (!form.keyword.trim() || !form.name.trim() || !form.prompt.trim()) {
      setError('快捷词、名称、指令内容为必填项')
      return
    }
    // 检查 keyword 唯一性
    const dup = shortcuts.find(
      (s) => s.keyword.toLowerCase() === form.keyword.trim().toLowerCase()
    )
    if (dup) {
      setError(`快捷词 "${form.keyword.trim()}" 已存在`)
      return
    }
    try {
      await window.api.shortcut.add(formToItem(form))
      setForm(emptyForm())
      setShowForm(false)
      setError(null)
      await loadShortcuts()
    } catch (err) {
      console.error('[ShortcutsModal] add failed:', err)
      setError(`添加失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleStartEdit = (s: QuickCommand): void => {
    setEditingId(s.id)
    setShowForm(false)
    setForm(shortcutToForm(s))
    setError(null)
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (!editingId) return
    if (!form.keyword.trim() || !form.name.trim() || !form.prompt.trim()) {
      setError('快捷词、名称、指令内容为必填项')
      return
    }
    // 检查 keyword 唯一性（排除自身）
    const dup = shortcuts.find(
      (s) =>
        s.id !== editingId &&
        s.keyword.toLowerCase() === form.keyword.trim().toLowerCase()
    )
    if (dup) {
      setError(`快捷词 "${form.keyword.trim()}" 已存在`)
      return
    }
    try {
      const item = formToItem(form)
      const result = await window.api.shortcut.update(editingId, item)
      if (!result) {
        setError('保存失败：未找到该快捷指令')
        return
      }
      setEditingId(null)
      setForm(emptyForm())
      setError(null)
      await loadShortcuts()
    } catch (err) {
      console.error('[ShortcutsModal] save edit failed:', err)
      setError(`保存失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await window.api.shortcut.delete(id)
      if (editingId === id) {
        setEditingId(null)
        setForm(emptyForm())
      }
      resetConfirm()
      await loadShortcuts()
    } catch (err) {
      console.error('[ShortcutsModal] delete failed:', err)
      setError(`删除失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleToggle = async (s: QuickCommand): Promise<void> => {
    try {
      await window.api.shortcut.toggle(s.id, !s.enabled)
      await loadShortcuts()
    } catch (err) {
      console.error('[ShortcutsModal] toggle failed:', err)
    }
  }

  const handleCancelForm = (): void => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm())
    setError(null)
  }

  const isEditing = editingId !== null
  const showFormPanel = showForm || isEditing

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
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-yellow-500 to-amber-500 shadow-md">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">快捷指令</h2>
              <p className="text-[10px] text-text-muted">
                输入 /keyword 快速展开常用指令或多步工作流
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
        <div className="flex items-center justify-between border-b border-border bg-bg-base/50 px-5 py-2.5">
          <span className="text-[10px] text-text-muted">
            共 {shortcuts.length} 个快捷指令 · 已启用{' '}
            {shortcuts.filter((s) => s.enabled).length} 个
          </span>
          <button
            onClick={() => {
              setShowForm(!showForm)
              setEditingId(null)
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
            新建快捷指令
          </button>
        </div>

        {/* 主体 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧列表 */}
          <div className={clsx('flex flex-col overflow-hidden', showFormPanel ? 'w-[45%] border-r border-border' : 'w-full')}>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {sorted.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-text-muted">
                  <Zap size={40} className="animate-float mb-3 opacity-30" />
                  <p className="text-xs">
                    {shortcuts.length === 0
                      ? '还没有快捷指令。点击"新建快捷指令"开始。'
                      : '没有匹配的快捷指令'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {sorted.map((s) => (
                    <div
                      key={s.id}
                      className={clsx(
                        'card-hover stagger-up group rounded-lg border p-2.5 transition-colors',
                        editingId === s.id
                          ? 'border-accent/50 bg-accent/5'
                          : 'border-border bg-bg-base/50 hover:border-border/80 hover:bg-bg-base'
                      )}
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        <code className="flex-shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent">
                          /{s.keyword}
                        </code>
                        <span className="flex-1 truncate text-xs font-medium text-text-primary">
                          {s.name}
                        </span>
                        {s.category && (
                          <span className="flex-shrink-0 flex items-center gap-0.5 rounded bg-bg-hover px-1 py-0 text-[9px] text-text-secondary">
                            <Tag size={8} />
                            {s.category}
                          </span>
                        )}
                      </div>
                      <p className="mb-1.5 text-[11px] leading-relaxed text-text-secondary line-clamp-2">
                        {s.description || s.prompt.slice(0, 80)}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[9px] text-text-muted">
                          <span className="flex items-center gap-0.5">
                            <Terminal size={8} />
                            {s.steps && s.steps.length > 0
                              ? `${s.steps.length} 步`
                              : '单步'}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Zap size={8} />
                            使用 {s.useCount} 次
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* 启用开关 */}
                          <button
                            onClick={() => void handleToggle(s)}
                            className={clsx(
                              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                              s.enabled ? 'bg-accent' : 'bg-bg-hover'
                            )}
                            title={s.enabled ? '点击禁用' : '点击启用'}
                          >
                            <span
                              className={clsx(
                                'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform',
                                s.enabled ? 'translate-x-[18px]' : 'translate-x-1'
                              )}
                            />
                          </button>
                          <button
                            onClick={() => handleStartEdit(s)}
                            className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                            title="编辑"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => {
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

          {/* 右侧表单 */}
          {showFormPanel && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-xs font-medium text-text-primary">
                  {isEditing ? '编辑快捷指令' : '新建快捷指令'}
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
                        快捷词 *
                      </label>
                      <div className="flex items-center rounded-md border border-border bg-bg-base px-2">
                        <span className="text-xs text-accent">/</span>
                        <input
                          type="text"
                          value={form.keyword}
                          onChange={(e) =>
                            setForm({ ...form, keyword: e.target.value.replace(/\s/g, '') })
                          }
                          placeholder="clean"
                          className="w-full bg-transparent px-1 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                        分类
                      </label>
                      <input
                        type="text"
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        placeholder="系统/开发/办公..."
                        className="w-full rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                      名称 *
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="清理系统垃圾"
                      className="w-full rounded-md border border-border bg-bg-base px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
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
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                      指令内容 (Prompt) *
                    </label>
                    <textarea
                      value={form.prompt}
                      onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                      placeholder="展开后的完整指令（单步时使用）..."
                      rows={6}
                      className="w-full resize-none rounded-md border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                      多步骤工作流（可选）
                    </label>
                    <p className="mb-1.5 text-[10px] text-text-muted">
                      每行一个指令，留空则使用上方的单步指令。多步时输入 /keyword 会展开为第一步。
                    </p>
                    <textarea
                      value={form.stepsText}
                      onChange={(e) => setForm({ ...form, stepsText: e.target.value })}
                      placeholder={'第一步指令...\n第二步指令...\n第三步指令...'}
                      rows={5}
                      className="w-full resize-none rounded-md border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
