import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Zap,
  Plus,
  Trash2,
  Pencil,
  X,
  FolderSearch,
  Clock,
  Power,
  Usb,
  Wifi,
  Check,
  Play,
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Loader2,
  Bell,
  Timer
} from 'lucide-react'
import { clsx } from 'clsx'
import type { AutomationTrigger, TriggerType, TriggerRunLog } from '@shared/types'

interface TriggersModalProps {
  onClose: () => void
}

const TYPE_CONFIG: Record<
  TriggerType,
  { label: string; icon: typeof Clock; desc: string }
> = {
  file_watch: { label: '文件监控', icon: FolderSearch, desc: '监听目录下文件变化时触发' },
  interval: { label: '定时循环', icon: Clock, desc: '按固定间隔重复触发' },
  startup: { label: '开机启动', icon: Power, desc: '应用启动后自动触发' },
  usb: { label: 'USB设备', icon: Usb, desc: 'USB设备接入时触发（轮询检测）' },
  network: { label: '网络变化', icon: Wifi, desc: '网络状态变化时触发（轮询检测）' }
}

const INTERVAL_PRESETS = [
  { label: '30 秒', value: 30 },
  { label: '1 分钟', value: 60 },
  { label: '5 分钟', value: 300 },
  { label: '15 分钟', value: 900 },
  { label: '30 分钟', value: 1800 },
  { label: '1 小时', value: 3600 },
  { label: '3 小时', value: 10800 },
  { label: '6 小时', value: 21600 },
  { label: '12 小时', value: 43200 },
  { label: '24 小时', value: 86400 }
]

interface TriggerForm {
  name: string
  type: TriggerType
  prompt: string
  path: string
  pattern: string
  intervalSec: number
  devicePattern: string
  networkEvent: 'connect' | 'disconnect' | 'both'
  maxRetries: number
  retryDelay: number
  timeoutMs: number
  notify: boolean
}

const DEFAULT_FORM: TriggerForm = {
  name: '',
  type: 'file_watch',
  prompt: '',
  path: '',
  pattern: '*',
  intervalSec: 60,
  devicePattern: '*',
  networkEvent: 'both',
  maxRetries: 0,
  retryDelay: 60000,
  timeoutMs: 300000,
  notify: true
}

/** 将表单状态转换为存储 config */
function formToConfig(
  type: TriggerType,
  form: TriggerForm
): AutomationTrigger['config'] {
  switch (type) {
    case 'file_watch':
      return { path: form.path, pattern: form.pattern || '*' }
    case 'interval':
      return { interval: form.intervalSec * 1000 }
    case 'usb':
      return { devicePattern: form.devicePattern || '*' }
    case 'network':
      return { networkEvent: form.networkEvent }
    default:
      return {}
  }
}

/** 从已存储的 trigger 解析为表单状态 */
function triggerToForm(trigger: AutomationTrigger): TriggerForm {
  return {
    name: trigger.name,
    type: trigger.type,
    prompt: trigger.prompt,
    path: trigger.config.path ?? '',
    pattern: trigger.config.pattern ?? '*',
    intervalSec: trigger.config.interval
      ? Math.round(trigger.config.interval / 1000)
      : 60,
    devicePattern: trigger.config.devicePattern ?? '*',
    networkEvent: trigger.config.networkEvent ?? 'both',
    maxRetries: trigger.maxRetries ?? 0,
    retryDelay: trigger.retryDelay ?? 60000,
    timeoutMs: trigger.timeoutMs ?? 300000,
    notify: trigger.notify ?? true
  }
}

export function TriggersModal({ onClose }: TriggersModalProps): JSX.Element {
  const [triggers, setTriggers] = useState<AutomationTrigger[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TriggerForm>({ ...DEFAULT_FORM })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    id: string
    ok: boolean
    error?: string
  } | null>(null)
  /** 每个触发器的执行日志（最近 20 条），key = triggerId */
  const [logsByTrigger, setLogsByTrigger] = useState<Record<string, TriggerRunLog[]>>(
    {}
  )
  /** 当前展开日志的触发器 ID */
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = await window.api.trigger.list()
      setTriggers(list)
      // 拉取全部日志并按 triggerId 分组
      const allLogs = await window.api.trigger.getLogs(100)
      const grouped: Record<string, TriggerRunLog[]> = {}
      for (const log of allLogs) {
        if (!grouped[log.triggerId]) grouped[log.triggerId] = []
        if (grouped[log.triggerId].length < 20) grouped[log.triggerId].push(log)
      }
      setLogsByTrigger(grouped)
    } catch (err) {
      console.error('[TriggersModal] refresh failed:', err)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 监听触发器变更
  useEffect(() => {
    const unsub = window.api.trigger.onChanged(() => {
      void refresh()
    })
    return unsub
  }, [refresh])

  // 监听实时执行日志推送
  useEffect(() => {
    const unsub = window.api.trigger.onRunLog((log) => {
      setLogsByTrigger((prev) => {
        const existing = prev[log.triggerId] ?? []
        // 按 startedAt 匹配同一次执行（running → done/error 更新），否则前置插入
        const idx = existing.findIndex((l) => l.startedAt === log.startedAt)
        let next: TriggerRunLog[]
        if (idx >= 0) {
          next = [...existing]
          next[idx] = log
        } else {
          next = [log, ...existing]
        }
        if (next.length > 20) next.length = 20
        return { ...prev, [log.triggerId]: next }
      })
    })
    return unsub
  }, [])

  const resetForm = (): void => {
    setForm({ ...DEFAULT_FORM })
    setEditingId(null)
    setShowForm(false)
    setShowAdvanced(false)
  }

  // 验证当前表单是否可提交
  const validationError = useMemo((): string | null => {
    if (!form.name.trim()) return '请填写触发器名称'
    if (!form.prompt.trim()) return '请填写 AI 指令'
    switch (form.type) {
      case 'file_watch':
        if (!form.path.trim()) return '请填写监听目录路径'
        return null
      case 'interval':
        if (!form.intervalSec || form.intervalSec < 1) return '间隔不能小于 1 秒'
        return null
      default:
        return null
    }
  }, [form])

  const handleSubmit = async (): Promise<void> => {
    if (validationError) return
    const config = formToConfig(form.type, form)
    const payload = {
      name: form.name.trim(),
      type: form.type,
      config,
      prompt: form.prompt.trim(),
      maxRetries: form.maxRetries,
      retryDelay: form.retryDelay,
      timeoutMs: form.timeoutMs,
      notify: form.notify
    }
    if (editingId) {
      const updated = await window.api.trigger.update(editingId, payload)
      if (updated) {
        setTriggers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      }
    } else {
      const created = await window.api.trigger.add(payload)
      setTriggers((prev) => [...prev, created])
    }
    resetForm()
  }

  const handleEdit = (trigger: AutomationTrigger): void => {
    setEditingId(trigger.id)
    const nextForm = triggerToForm(trigger)
    setForm(nextForm)
    // 编辑时若存在非默认高级配置则自动展开高级选项
    setShowAdvanced(
      nextForm.maxRetries > 0 ||
        nextForm.timeoutMs !== 300000 ||
        nextForm.retryDelay !== 60000 ||
        !nextForm.notify
    )
    setShowForm(true)
  }

  const handleDelete = async (id: string): Promise<void> => {
    await window.api.trigger.delete(id)
    setTriggers((prev) => prev.filter((t) => t.id !== id))
  }

  const handleToggle = async (
    id: string,
    enabled: boolean
  ): Promise<void> => {
    const updated = await window.api.trigger.toggle(id, enabled)
    if (updated) {
      setTriggers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    }
  }

  const handleTest = async (id: string): Promise<void> => {
    setTestingId(id)
    setTestResult(null)
    try {
      const result = await window.api.trigger.test(id)
      setTestResult({ id, ...result })
    } catch (err) {
      setTestResult({
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setTestingId(null)
    }
  }

  const handleTypeChange = (type: TriggerType): void => {
    setForm({ ...form, type })
  }

  const formatTime = (ts?: number): string => {
    if (!ts) return '-'
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  /** 友好显示触发器配置 */
  const formatConfig = (trigger: AutomationTrigger): string => {
    switch (trigger.type) {
      case 'file_watch': {
        const path = trigger.config.path ?? '?'
        const pattern = trigger.config.pattern ?? '*'
        return `${path} (${pattern})`
      }
      case 'interval': {
        const ms = trigger.config.interval ?? 0
        if (ms >= 86400000) return `每 ${ms / 86400000} 天`
        if (ms >= 3600000) return `每 ${ms / 3600000} 小时`
        if (ms >= 60000) return `每 ${ms / 60000} 分钟`
        return `每 ${ms / 1000} 秒`
      }
      case 'startup':
        return '应用启动后'
      case 'usb':
        return 'USB 设备变化'
      case 'network':
        return '网络状态变化'
      default:
        return '-'
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="modal-shell animate-spring-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="modal-icon-badge bg-gradient-to-br from-violet-500 to-fuchsia-500">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">自动化触发器</h2>
              <p className="text-[10px] text-text-muted">文件 / 定时 / 开机 / USB / 网络 事件自动执行</p>
            </div>
            <span className="ml-1 rounded-full border border-border bg-bg-hover px-2 py-0 text-[10px] text-text-muted">
              {triggers.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-primary flex items-center gap-1 px-2.5 py-1 text-xs"
              onClick={() => {
                if (showForm) resetForm()
                else setShowForm(true)
              }}
            >
              {showForm ? <X size={13} /> : <Plus size={13} />}
              {showForm ? '取消' : '新建'}
            </button>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 新建/编辑表单 */}
          {showForm && (
            <div className="border-b border-border bg-bg-hover/30 p-4 animate-expand-down">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-text-secondary">
                    触发器名称
                  </label>
                  <input
                    className="input"
                    placeholder="如：监控下载文件夹"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-secondary">
                    AI 指令
                  </label>
                  <textarea
                    className="input min-h-[60px] resize-y"
                    placeholder="如：列出新增的文件并分类整理"
                    value={form.prompt}
                    onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                  />
                </div>

                {/* 触发类型选择 */}
                <div>
                  <label className="mb-1 block text-xs text-text-secondary">
                    触发类型
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {(Object.keys(TYPE_CONFIG) as TriggerType[]).map((t) => {
                      const cfg = TYPE_CONFIG[t]
                      const Icon = cfg.icon
                      return (
                        <button
                          key={t}
                          className={clsx(
                            'chip flex flex-col items-center gap-1 px-1 py-2',
                            form.type === t ? 'chip-active' : 'chip-idle'
                          )}
                          onClick={() => handleTypeChange(t)}
                          title={cfg.desc}
                        >
                          <Icon size={15} />
                          <span className="text-[10px] font-medium">{cfg.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-text-muted">
                    {TYPE_CONFIG[form.type].desc}
                  </p>
                </div>

                {/* 配置参数：根据类型显示不同的输入 */}
                <div className="rounded-lg border border-border bg-bg-base/50 p-3">
                  <label className="mb-2 block text-xs font-medium text-text-secondary">
                    触发条件配置
                  </label>

                  {/* file_watch: 目录路径 + 文件匹配模式 */}
                  {form.type === 'file_watch' && (
                    <div className="space-y-2">
                      <div>
                        <label className="mb-1 block text-[10px] text-text-muted">
                          监听目录路径
                        </label>
                        <input
                          className="input text-xs"
                          placeholder="如：C:\Users\Downloads"
                          value={form.path}
                          onChange={(e) => setForm({ ...form, path: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-text-muted">
                          文件匹配模式（可选，如 *.log）
                        </label>
                        <input
                          className="input text-xs"
                          placeholder="*"
                          value={form.pattern}
                          onChange={(e) =>
                            setForm({ ...form, pattern: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  )}

                  {/* interval: 预设按钮 + 自定义输入（秒） */}
                  {form.type === 'interval' && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {INTERVAL_PRESETS.map((p) => (
                          <button
                            key={p.value}
                            className={clsx(
                              'chip',
                              form.intervalSec === p.value ? 'chip-active' : 'chip-idle'
                            )}
                            onClick={() =>
                              setForm({ ...form, intervalSec: p.value })
                            }
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <span>或自定义：</span>
                        <input
                          type="number"
                          className="input w-24 text-xs"
                          placeholder="秒数"
                          min={1}
                          value={form.intervalSec}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              intervalSec: parseInt(e.target.value, 10) || 0
                            })
                          }
                        />
                        <span>秒</span>
                      </div>
                    </div>
                  )}

                  {/* usb: 设备名称匹配模式 */}
                  {form.type === 'usb' && (
                    <div className="space-y-1.5">
                      <label className="block text-[10px] text-text-muted">
                        设备名称匹配模式（可选，如 *Kingston*，留空匹配全部）
                      </label>
                      <input
                        className="input text-xs"
                        placeholder="*"
                        value={form.devicePattern}
                        onChange={(e) =>
                          setForm({ ...form, devicePattern: e.target.value })
                        }
                      />
                      <p className="text-[10px] text-text-muted">
                        每 10 秒轮询一次 USB 设备列表，检测到新设备接入时触发
                      </p>
                    </div>
                  )}

                  {/* network: 触发事件选择 */}
                  {form.type === 'network' && (
                    <div className="space-y-1.5">
                      <label className="block text-[10px] text-text-muted">
                        触发事件
                      </label>
                      <div className="flex gap-1.5">
                        {(
                          [
                            { label: '任意变化', value: 'both' },
                            { label: '连接网络', value: 'connect' },
                            { label: '断开网络', value: 'disconnect' }
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.value}
                            className={clsx(
                              'chip',
                              form.networkEvent === opt.value ? 'chip-active' : 'chip-idle'
                            )}
                            onClick={() =>
                              setForm({ ...form, networkEvent: opt.value })
                            }
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-text-muted">
                        每 10 秒轮询一次网卡地址，对比变化时触发
                      </p>
                    </div>
                  )}

                  {/* startup: 无需额外配置 */}
                  {form.type === 'startup' && (
                    <p className="text-[11px] text-text-muted">应用启动后自动触发</p>
                  )}
                </div>

                {/* 高级选项（折叠） */}
                <div className="rounded-lg border border-border bg-bg-base/50">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-text-secondary"
                    onClick={() => setShowAdvanced((v) => !v)}
                  >
                    <span className="flex items-center gap-1.5">
                      <Timer size={12} />
                      高级选项（超时 / 重试 / 通知）
                    </span>
                    <ChevronDown
                      size={13}
                      className={clsx(
                        'transition-transform',
                        showAdvanced && 'rotate-180'
                      )}
                    />
                  </button>
                  {showAdvanced && (
                    <div className="space-y-3 border-t border-border px-3 py-3 animate-expand-down">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="mb-1 block text-[10px] text-text-muted">
                            超时（秒，0=不限）
                          </label>
                          <input
                            type="number"
                            className="input text-xs"
                            min={0}
                            value={Math.round(form.timeoutMs / 1000)}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                timeoutMs: (parseInt(e.target.value, 10) || 0) * 1000
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-text-muted">
                            最大重试次数
                          </label>
                          <input
                            type="number"
                            className="input text-xs"
                            min={0}
                            value={form.maxRetries}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                maxRetries: parseInt(e.target.value, 10) || 0
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-text-muted">
                            重试间隔（秒）
                          </label>
                          <input
                            type="number"
                            className="input text-xs"
                            min={1}
                            value={Math.round(form.retryDelay / 1000)}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                retryDelay:
                                  (parseInt(e.target.value, 10) || 1) * 1000
                              })
                            }
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-text-secondary">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-accent"
                          checked={form.notify}
                          onChange={(e) =>
                            setForm({ ...form, notify: e.target.checked })
                          }
                        />
                        <Bell size={12} />
                        执行时显示系统通知
                      </label>
                    </div>
                  )}
                </div>

                {/* 验证错误提示 */}
                {validationError && (
                  <div className="flex items-center gap-1.5 rounded-md bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger">
                    <AlertCircle size={12} />
                    {validationError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button className="btn-ghost" onClick={resetForm}>
                    取消
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => void handleSubmit()}
                    disabled={!!validationError}
                  >
                    {editingId ? '保存' : '创建'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 触发器列表 */}
          <div className="p-3">
            {triggers.length === 0 && !showForm && (
              <div className="flex flex-col items-center py-14 text-center animate-fade-in">
                <Zap size={32} className="animate-float mb-3 text-text-muted opacity-40" />
                <p className="text-sm text-text-muted">暂无自动化触发器</p>
                <p className="mt-1 text-xs text-text-muted">
                  点击右上角"新建"创建第一个触发器
                </p>
              </div>
            )}

            {triggers.map((trigger) => {
              const cfg = TYPE_CONFIG[trigger.type]
              const Icon = cfg.icon
              const isTesting = testingId === trigger.id
              const result = testResult?.id === trigger.id ? testResult : null
              return (
                <div
                  key={trigger.id}
                  className={clsx(
                    'card-hover stagger-up mb-2 rounded-lg border p-3',
                    trigger.enabled
                      ? 'border-border bg-bg-hover/40'
                      : 'border-border bg-bg/50 opacity-60'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon size={13} className="text-accent" />
                        <span className="text-sm font-medium text-text-primary">
                          {trigger.name}
                        </span>
                        <span className="rounded border border-border px-1.5 py-0 text-[9px] text-text-muted">
                          {cfg.label}
                        </span>
                        {!trigger.enabled && (
                          <span className="rounded bg-bg-input px-1.5 py-0 text-[9px] text-text-muted">
                            已禁用
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                        {trigger.prompt}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-text-muted">
                        <span>配置：{formatConfig(trigger)}</span>
                        <span>·</span>
                        <span>上次触发：{formatTime(trigger.lastTriggeredAt)}</span>
                        <span>·</span>
                        <span>已触发 {trigger.triggerCount} 次</span>
                      </div>
                      {result && (
                        <div
                          className={clsx(
                            'mt-1.5 flex items-center gap-1 rounded px-2 py-1 text-[10px]',
                            result.ok
                              ? 'bg-success/10 text-success'
                              : 'bg-danger/10 text-danger'
                          )}
                        >
                          {result.ok ? (
                            <>
                              <Check size={11} />
                              触发成功
                            </>
                          ) : (
                            <>
                              <AlertCircle size={11} />
                              {result.error ?? '触发失败'}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        className="btn-press rounded p-1 text-text-muted hover:bg-bg-input hover:text-accent"
                        title="测试触发"
                        onClick={() => void handleTest(trigger.id)}
                        disabled={isTesting}
                      >
                        <Play size={13} className={isTesting ? 'animate-pulse' : ''} />
                      </button>
                      <button
                        className="btn-press rounded p-1 text-text-muted hover:bg-bg-input hover:text-accent"
                        title="编辑"
                        onClick={() => handleEdit(trigger)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className={clsx(
                          'btn-press rounded p-1 hover:bg-bg-input',
                          trigger.enabled
                            ? 'text-success'
                            : 'text-text-muted hover:text-warning'
                        )}
                        title={trigger.enabled ? '禁用' : '启用'}
                        onClick={() => void handleToggle(trigger.id, !trigger.enabled)}
                      >
                        <Power size={13} />
                      </button>
                      <button
                        className="btn-press rounded p-1 text-text-muted hover:bg-bg-input hover:text-danger"
                        title="删除"
                        onClick={() => void handleDelete(trigger.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* 执行日志折叠区 */}
                  {(() => {
                    const logs = logsByTrigger[trigger.id] ?? []
                    const expanded = expandedLogId === trigger.id
                    return (
                      <div className="mt-1.5">
                        <button
                          type="button"
                          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary"
                          onClick={() =>
                            setExpandedLogId(expanded ? null : trigger.id)
                          }
                        >
                          <ChevronDown
                            size={11}
                            className={clsx(
                              'transition-transform',
                              expanded && 'rotate-180'
                            )}
                          />
                          执行日志（{logs.length}）
                        </button>
                        {expanded && (
                          <div className="mt-1 space-y-1 animate-expand-down">
                            {logs.length === 0 && (
                              <p className="px-2 py-1 text-[10px] text-text-muted">
                                暂无执行记录
                              </p>
                            )}
                            {logs.map((log, i) => {
                              const dur =
                                log.finishedAt && log.startedAt
                                  ? Math.round(
                                      (log.finishedAt - log.startedAt) / 1000
                                    )
                                  : null
                              return (
                                <div
                                  key={`${log.startedAt}-${i}`}
                                  className="flex items-center gap-1.5 rounded bg-bg-base/60 px-2 py-1 text-[10px]"
                                >
                                  {log.status === 'running' && (
                                    <Loader2
                                      size={10}
                                      className="animate-spin text-accent"
                                    />
                                  )}
                                  {log.status === 'done' && (
                                    <CheckCircle2 size={10} className="text-success" />
                                  )}
                                  {log.status === 'error' && (
                                    <XCircle size={10} className="text-danger" />
                                  )}
                                  <span className="text-text-muted">
                                    {formatTime(log.startedAt)}
                                  </span>
                                  {dur !== null && (
                                    <span className="text-text-muted">
                                      · {dur}s
                                    </span>
                                  )}
                                  {log.error && (
                                    <span className="line-clamp-1 text-danger">
                                      · {log.error}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
