import { useEffect, useState, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  Zap,
  Power,
  Sparkles,
  Loader2,
  Users,
  Save,
  X,
  Check,
  AlertCircle
} from 'lucide-react'
import { clsx } from 'clsx'
import type { CustomSubagent, SubagentMode, GeneratedSubagentConfig } from '@shared/types'

/** 编辑表单的数据结构（新建/编辑共用） */
interface FormData {
  id?: string
  name: string
  description: string
  systemPrompt: string
  triggers: string
  tags: string
  defaultMode: SubagentMode
  defaultMaxRounds: number
}

const EMPTY_FORM: FormData = {
  name: '',
  description: '',
  systemPrompt: '',
  triggers: '',
  tags: '',
  defaultMode: 'foreground',
  defaultMaxRounds: 0
}

export function CustomSubagentsPanel(): JSX.Element {
  const [items, setItems] = useState<CustomSubagent[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<FormData | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genInput, setGenInput] = useState('')
  const [showGenBox, setShowGenBox] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [useHint, setUseHint] = useState<string | null>(null)

  /** 加载列表 */
  const reload = useCallback(async (): Promise<void> => {
    const list = await window.api.customSubagents.list()
    setItems(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
    const unsub = window.api.customSubagents.onChanged(() => void reload())
    return unsub
  }, [reload])

  /** 开始新建 */
  const handleNew = (): void => {
    setError(null)
    setEditing({ ...EMPTY_FORM })
  }

  /** 开始编辑 */
  const handleEdit = (item: CustomSubagent): void => {
    setError(null)
    setEditing({
      id: item.id,
      name: item.name,
      description: item.description,
      systemPrompt: item.systemPrompt,
      triggers: item.triggers.join(', '),
      tags: item.tags.join(', '),
      defaultMode: item.defaultMode,
      defaultMaxRounds: item.defaultMaxRounds
    })
  }

  /** 保存（新建或更新） */
  const handleSave = async (): Promise<void> => {
    if (!editing) return
    if (!editing.name.trim()) {
      setError('请填写子智能体名称')
      return
    }
    if (!editing.systemPrompt.trim()) {
      setError('请填写角色设定（系统提示词）')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const parseList = (s: string): string[] =>
        s.split(',').map((t) => t.trim()).filter(Boolean)

      const payload = {
        name: editing.name.trim(),
        description: editing.description.trim() || `自定义子智能体: ${editing.name.trim()}`,
        systemPrompt: editing.systemPrompt.trim(),
        triggers: parseList(editing.triggers),
        tags: parseList(editing.tags),
        defaultMode: editing.defaultMode,
        defaultMaxRounds: editing.defaultMaxRounds,
        source: 'manual' as const,
        enabled: true
      }

      if (editing.id) {
        // 更新（不覆盖 source）
        const result = await window.api.customSubagents.update(editing.id, {
          name: payload.name,
          description: payload.description,
          systemPrompt: payload.systemPrompt,
          triggers: payload.triggers,
          tags: payload.tags,
          defaultMode: payload.defaultMode,
          defaultMaxRounds: payload.defaultMaxRounds
        })
        if (!result) {
          setError('更新失败：名称可能冲突')
          setSaving(false)
          return
        }
      } else {
        const result = await window.api.customSubagents.add(payload)
        if ('error' in result) {
          setError(result.error)
          setSaving(false)
          return
        }
      }
      setEditing(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  /** 删除 */
  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm('确定删除这个子智能体吗？')) return
    await window.api.customSubagents.delete(id)
    await reload()
  }

  /** 启用/禁用 */
  const handleToggle = async (id: string, enabled: boolean): Promise<void> => {
    await window.api.customSubagents.toggle(id, enabled)
    await reload()
  }

  /** AI 生成配置 */
  const handleGenerate = async (): Promise<void> => {
    if (!genInput.trim()) {
      setError('请描述你想要的子智能体')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const result = await window.api.customSubagents.generate(genInput.trim())
      if ('error' in result) {
        setError(result.error)
      } else {
        // 用生成结果填充编辑表单
        const config = result as GeneratedSubagentConfig
        setEditing({
          ...EMPTY_FORM,
          name: config.name,
          description: config.description,
          systemPrompt: config.systemPrompt,
          triggers: config.triggers.join(', '),
          tags: config.tags.join(', '),
          defaultMode: config.defaultMode,
          defaultMaxRounds: config.defaultMaxRounds
        })
        setShowGenBox(false)
        setGenInput('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 生成失败')
    } finally {
      setGenerating(false)
    }
  }

  /** 立即使用：发送引导消息到当前会话 */
  const handleUse = (item: CustomSubagent): void => {
    window.dispatchEvent(
      new CustomEvent('xcomputer:use-custom-subagent', {
        detail: { name: item.name }
      })
    )
    setUseHint(`已发送"${item.name}"到当前会话`)
    setTimeout(() => setUseHint(null), 2500)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Users}
        title="自定义子智能体"
        desc="创建专属子智能体模板，AI 会在相关任务中自动调用，或点击「立即使用」手动触发"
      />

      {/* 操作栏 */}
      <div className="flex items-center gap-2">
        <button className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs" onClick={handleNew}>
          <Plus size={13} />
          新建
        </button>
        <button
          className="btn-ghost flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs"
          onClick={() => { setShowGenBox((v) => !v); setError(null) }}
        >
          <Sparkles size={13} className="text-accent" />
          AI 生成
        </button>
        {useHint && (
          <span className="ml-auto text-xs text-accent animate-fade-in">{useHint}</span>
        )}
      </div>

      {/* AI 生成输入框 */}
      {showGenBox && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 animate-fade-in">
          <label className="mb-1.5 block text-xs text-text-secondary">描述你想要的子智能体</label>
          <textarea
            className="input min-h-[60px] resize-y text-xs"
            placeholder="例如：一个专门审查代码安全漏洞的子智能体，能识别 SQL 注入、XSS、敏感信息泄露等问题，并给出修复建议"
            value={genInput}
            onChange={(e) => setGenInput(e.target.value)}
            disabled={generating}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              className="btn-ghost px-2.5 py-1 text-xs"
              onClick={() => { setShowGenBox(false); setGenInput('') }}
              disabled={generating}
            >
              取消
            </button>
            <button
              className="btn-primary flex items-center gap-1.5 px-3 py-1 text-xs"
              onClick={() => void handleGenerate()}
              disabled={generating}
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {generating ? '生成中...' : '生成配置'}
            </button>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400 animate-fade-in">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {/* 编辑表单 */}
      {editing && (
        <EditForm
          data={editing}
          onChange={setEditing}
          onSave={() => void handleSave()}
          onCancel={() => { setEditing(null); setError(null) }}
          saving={saving}
        />
      )}

      {/* 列表 */}
      {items.length === 0 && !editing ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Users size={32} className="text-text-muted/40" />
          <p className="text-sm text-text-muted">还没有自定义子智能体</p>
          <p className="text-xs text-text-muted/70">点击「新建」手动创建，或「AI 生成」用自然语言描述自动生成</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <SubagentCard
              key={item.id}
              item={item}
              onToggle={(v) => void handleToggle(item.id, v)}
              onEdit={() => handleEdit(item)}
              onDelete={() => void handleDelete(item.id)}
              onUse={() => handleUse(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 单个子智能体卡片 */
function SubagentCard({
  item,
  onToggle,
  onEdit,
  onDelete,
  onUse
}: {
  item: CustomSubagent
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
  onUse: () => void
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-bg-input p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-text-primary">{item.name}</span>
            <span
              className={clsx(
                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                item.source === 'ai'
                  ? 'bg-purple-500/10 text-purple-400'
                  : 'bg-blue-500/10 text-blue-400'
              )}
            >
              {item.source === 'ai' ? 'AI生成' : '手动'}
            </span>
            {!item.enabled && (
              <span className="rounded bg-gray-500/10 px-1.5 py-0.5 text-[10px] text-text-muted">已禁用</span>
            )}
            {item.useCount > 0 && (
              <span className="text-[10px] text-text-muted">使用 {item.useCount} 次</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-text-muted line-clamp-1">{item.description}</p>
          {item.triggers.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.triggers.slice(0, 5).map((t) => (
                <span key={t} className="rounded bg-bg-hover px-1.5 py-0 text-[10px] text-text-muted">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <ToggleSwitch checked={item.enabled} onChange={onToggle} />
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-border-muted pt-2">
        <button
          className="btn-ghost flex items-center gap-1 px-2 py-1 text-[11px] text-accent"
          onClick={onUse}
          title="在当前会话中使用此子智能体"
        >
          <Zap size={11} />
          立即使用
        </button>
        <button
          className="btn-ghost flex items-center gap-1 px-2 py-1 text-[11px]"
          onClick={onEdit}
        >
          <Edit2 size={11} />
          编辑
        </button>
        <button
          className="btn-ghost flex items-center gap-1 px-2 py-1 text-[11px] text-danger"
          onClick={onDelete}
        >
          <Trash2 size={11} />
          删除
        </button>
      </div>
    </div>
  )
}

/** 编辑表单 */
function EditForm({
  data,
  onChange,
  onSave,
  onCancel,
  saving
}: {
  data: FormData
  onChange: (data: FormData) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}): JSX.Element {
  return (
    <div className="rounded-lg border border-accent/30 bg-bg-input p-3.5 space-y-3 animate-fade-in">
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <Save size={13} className="text-accent" />
        {data.id ? '编辑子智能体' : '新建子智能体'}
      </div>

      <div>
        <label className="mb-1 block text-xs text-text-secondary">名称 *</label>
        <input
          className="input text-xs"
          placeholder="如：代码审查员"
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          maxLength={30}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-text-secondary">描述</label>
        <input
          className="input text-xs"
          placeholder="一句话说明用途"
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          maxLength={200}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-text-secondary">
          角色设定（系统提示词）* <span className="text-text-muted">({data.systemPrompt.length} 字)</span>
        </label>
        <textarea
          className="input min-h-[100px] resize-y text-xs leading-relaxed"
          placeholder="定义该子智能体的专长、行为约束、输出格式、注意事项..."
          value={data.systemPrompt}
          onChange={(e) => onChange({ ...data, systemPrompt: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-text-secondary">触发词（逗号分隔）</label>
          <input
            className="input text-xs"
            placeholder="审查, review, 安全"
            value={data.triggers}
            onChange={(e) => onChange({ ...data, triggers: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-secondary">标签（逗号分隔）</label>
          <input
            className="input text-xs"
            placeholder="代码, 安全"
            value={data.tags}
            onChange={(e) => onChange({ ...data, tags: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-text-secondary">默认运行模式</label>
          <div className="flex gap-1.5">
            {(['foreground', 'background'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ ...data, defaultMode: m })}
                className={clsx(
                  'flex-1 rounded-md px-2 py-1 text-[11px] transition-colors',
                  data.defaultMode === m
                    ? 'bg-accent text-white'
                    : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                )}
              >
                {m === 'foreground' ? '前台（等待）' : '后台（并行）'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-secondary">默认最大轮数</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={200}
              className="input w-20 py-1 text-center font-mono text-xs"
              value={data.defaultMaxRounds}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                onChange({ ...data, defaultMaxRounds: isNaN(v) ? 0 : Math.max(0, Math.min(200, v)) })
              }}
            />
            <span className="text-[10px] text-text-muted">0 = 继承全局设置</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border-muted pt-2">
        <button className="btn-ghost flex items-center gap-1 px-3 py-1 text-xs" onClick={onCancel} disabled={saving}>
          <X size={12} />
          取消
        </button>
        <button className="btn-primary flex items-center gap-1 px-3 py-1 text-xs" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          保存
        </button>
      </div>
    </div>
  )
}

/** 分区头部标题（与 SettingsModal 一致） */
function SectionHeader({ icon: Icon, title, desc }: { icon: typeof Power; title: string; desc: string }): JSX.Element {
  return (
    <div className="flex items-start gap-2.5 border-b border-border-muted pb-3">
      <Icon size={16} className="mt-0.5 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="mt-0.5 text-xs text-text-muted">{desc}</div>
      </div>
    </div>
  )
}

/** Toggle 开关（与 SettingsModal 一致） */
function ToggleSwitch({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-bg-hover'
      )}
      onClick={() => onChange(!checked)}
    >
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(4px)' }}
      />
    </button>
  )
}
