import { useState, useMemo } from 'react'
import {
  X,
  Plus,
  Trash2,
  Play,
  Clock,
  Calendar,
  Repeat,
  CalendarDays,
  Power,
  CheckCircle2,
  XCircle,
  Loader2,
  Edit2,
  AlertCircle,
  Timer,
  ChevronDown
} from 'lucide-react'
import { useSchedule } from '../../hooks/useSchedule'
import { clsx } from 'clsx'
import type { ScheduledTask, ScheduleType } from '@shared/types'

interface ScheduleModalProps {
  onClose: () => void
}

const TYPE_CONFIG: Record<
  ScheduleType,
  { label: string; icon: typeof Clock; desc: string }
> = {
  once: { label: '单次', icon: Calendar, desc: '在指定时间执行一次' },
  interval: { label: '间隔', icon: Repeat, desc: '每隔一段时间重复执行' },
  daily: { label: '每日', icon: Clock, desc: '每天固定时间执行' },
  weekly: { label: '每周', icon: CalendarDays, desc: '每周指定星期几执行' },
  cron: { label: 'Cron', icon: Timer, desc: '使用cron表达式（如 0 9 * * 1-5）' }
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const INTERVAL_PRESETS = [
  { label: '1 分钟', value: 60000 },
  { label: '5 分钟', value: 300000 },
  { label: '15 分钟', value: 900000 },
  { label: '30 分钟', value: 1800000 },
  { label: '1 小时', value: 3600000 },
  { label: '3 小时', value: 10800000 },
  { label: '6 小时', value: 21600000 },
  { label: '12 小时', value: 43200000 },
  { label: '24 小时', value: 86400000 }
]

const CRON_PRESETS = [
  { label: '工作日9点', value: '0 9 * * 1-5' },
  { label: '每30分钟', value: '*/30 * * * *' },
  { label: '每周日凌晨', value: '0 0 * * 0' },
  { label: '每月1号凌晨', value: '0 0 1 * *' },
  { label: '工作日9点和18点', value: '0 9,18 * * 1-5' }
]

/** 将表单状态转换为 schedule 字符串 */
function formToSchedule(type: ScheduleType, form: ScheduleForm): string {
  switch (type) {
    case 'once':
      return `${form.onceDate}T${form.onceTime}`
    case 'interval':
      return String(form.intervalMs)
    case 'daily':
      return `${String(form.dailyHour).padStart(2, '0')}:${String(form.dailyMinute).padStart(2, '0')}`
    case 'weekly':
      return `${String(form.weeklyHour).padStart(2, '0')}:${String(form.weeklyMinute).padStart(2, '0')}|${form.weeklyDay}`
    case 'cron':
      return form.cronExpr
    default:
      return ''
  }
}

/** 从 schedule 字符串解析为表单状态 */
function scheduleToForm(type: ScheduleType, schedule: string): ScheduleForm {
  const today = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const defaultDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const defaultTime = `${pad(today.getHours())}:${pad(today.getMinutes())}`

  const form: ScheduleForm = {
    onceDate: defaultDate,
    onceTime: defaultTime,
    intervalMs: 3600000,
    dailyHour: 9,
    dailyMinute: 0,
    weeklyHour: 9,
    weeklyMinute: 0,
    weeklyDay: 1,
    cronExpr: '0 9 * * 1-5',
    maxRetries: 0,
    retryDelay: 60000,
    timeoutMs: 300000
  }

  if (!schedule) return form

  try {
    switch (type) {
      case 'once': {
        // "2026-06-20T15:30"
        const [date, time] = schedule.split('T')
        if (date) form.onceDate = date
        if (time) form.onceTime = time
        break
      }
      case 'interval': {
        const ms = parseInt(schedule, 10)
        if (Number.isFinite(ms) && ms > 0) form.intervalMs = ms
        break
      }
      case 'daily': {
        const m = /^(\d{1,2}):(\d{2})$/.exec(schedule)
        if (m) {
          form.dailyHour = parseInt(m[1], 10)
          form.dailyMinute = parseInt(m[2], 10)
        }
        break
      }
      case 'weekly': {
        const m = /^(\d{1,2}):(\d{2})\|([0-6])$/.exec(schedule)
        if (m) {
          form.weeklyHour = parseInt(m[1], 10)
          form.weeklyMinute = parseInt(m[2], 10)
          form.weeklyDay = parseInt(m[3], 10)
        }
        break
      }
      case 'cron': {
        form.cronExpr = schedule
        break
      }
    }
  } catch {
    // 解析失败用默认值
  }
  return form
}

interface ScheduleForm {
  onceDate: string
  onceTime: string
  intervalMs: number
  dailyHour: number
  dailyMinute: number
  weeklyHour: number
  weeklyMinute: number
  weeklyDay: number
  cronExpr: string
  maxRetries: number
  retryDelay: number
  timeoutMs: number
}

export function ScheduleModal({ onClose }: ScheduleModalProps): JSX.Element {
  const { tasks, logs, createTask, deleteTask, toggleTask, runNow, updateTask } = useSchedule()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    prompt: '',
    type: 'once' as ScheduleType,
    schedule: ''
  })
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(() =>
    scheduleToForm('once', '')
  )
  const [showAdvanced, setShowAdvanced] = useState(false)

  const resetForm = (): void => {
    setForm({ name: '', prompt: '', type: 'once', schedule: '' })
    setScheduleForm(scheduleToForm('once', ''))
    setEditingId(null)
    setShowForm(false)
  }

  // 验证当前表单是否可提交
  const validationError = useMemo((): string | null => {
    if (!form.name.trim()) return '请填写任务名称'
    if (!form.prompt.trim()) return '请填写执行指令'
    switch (form.type) {
      case 'once': {
        if (!scheduleForm.onceDate || !scheduleForm.onceTime) return '请选择执行时间'
        const ts = Date.parse(`${scheduleForm.onceDate}T${scheduleForm.onceTime}`)
        if (Number.isNaN(ts)) return '时间格式无效'
        if (ts < Date.now()) return '执行时间已过去，请选择未来时间'
        return null
      }
      case 'interval':
        if (!scheduleForm.intervalMs || scheduleForm.intervalMs < 1000) return '间隔不能小于 1 秒'
        return null
      case 'daily':
      case 'weekly':
        return null
      case 'cron': {
        if (!scheduleForm.cronExpr.trim()) return '请输入cron表达式'
        const parts = scheduleForm.cronExpr.trim().split(/\s+/)
        if (parts.length !== 5) return 'cron表达式需要5段（分 时 日 月 周）'
        return null
      }
      default:
        return null
    }
  }, [form, scheduleForm])

  const handleSubmit = async (): Promise<void> => {
    if (validationError) return
    const scheduleStr = formToSchedule(form.type, scheduleForm)
    const advancedOpts = {
      maxRetries: scheduleForm.maxRetries,
      retryDelay: scheduleForm.retryDelay,
      timeoutMs: scheduleForm.timeoutMs
    }
    if (editingId) {
      await updateTask(editingId, {
        name: form.name.trim(),
        prompt: form.prompt.trim(),
        type: form.type,
        schedule: scheduleStr,
        ...advancedOpts
      })
    } else {
      await createTask({
        name: form.name.trim(),
        prompt: form.prompt.trim(),
        type: form.type,
        schedule: scheduleStr,
        enabled: true,
        ...advancedOpts
      })
    }
    resetForm()
  }

  const handleEdit = (task: ScheduledTask): void => {
    setEditingId(task.id)
    setForm({
      name: task.name,
      prompt: task.prompt,
      type: task.type,
      schedule: task.schedule
    })
    setScheduleForm({
      ...scheduleToForm(task.type, task.schedule),
      maxRetries: task.maxRetries ?? 0,
      retryDelay: task.retryDelay ?? 60000,
      timeoutMs: task.timeoutMs ?? 300000
    })
    setShowForm(true)
  }

  const handleTypeChange = (type: ScheduleType): void => {
    setForm({ ...form, type })
    // 切换类型时重置该类型对应的表单字段为默认值（保留高级选项）
    setScheduleForm({
      ...scheduleToForm(type, ''),
      maxRetries: scheduleForm.maxRetries,
      retryDelay: scheduleForm.retryDelay,
      timeoutMs: scheduleForm.timeoutMs
    })
  }

  const formatTime = (ts?: number): string => {
    if (!ts) return '-'
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  /** 友好显示 schedule 配置 */
  const formatSchedule = (task: ScheduledTask): string => {
    switch (task.type) {
      case 'once':
        return task.schedule.replace('T', ' ')
      case 'interval': {
        const ms = parseInt(task.schedule, 10)
        if (ms >= 86400000) return `每 ${ms / 86400000} 天`
        if (ms >= 3600000) return `每 ${ms / 3600000} 小时`
        if (ms >= 60000) return `每 ${ms / 60000} 分钟`
        return `每 ${ms / 1000} 秒`
      }
      case 'daily':
        return `每天 ${task.schedule}`
      case 'weekly': {
        const m = /^(\d{1,2}):(\d{2})\|([0-6])$/.exec(task.schedule)
        if (m) return `每${WEEKDAYS[parseInt(m[3], 10)]} ${m[1]}:${m[2]}`
        return task.schedule
      }
      case 'cron':
        return `Cron: ${task.schedule}`
      default:
        return task.schedule
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
            <div className="modal-icon-badge bg-gradient-to-br from-sky-500 to-blue-500">
              <Clock size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">定时任务</h2>
              <p className="text-[10px] text-text-muted">单次 / 间隔 / 每日 / 每周 / Cron 定时执行</p>
            </div>
            <span className="ml-1 rounded-full border border-border bg-bg-hover px-2 py-0 text-[10px] text-text-muted">
              {tasks.length}
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
                  <label className="mb-1 block text-xs text-text-secondary">任务名称</label>
                  <input
                    className="input"
                    placeholder="如：每日清理临时文件"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-secondary">执行指令</label>
                  <textarea
                    className="input min-h-[60px] resize-y"
                    placeholder="如：清理 C 盘临时文件夹中的所有文件"
                    value={form.prompt}
                    onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                  />
                </div>

                {/* 触发类型选择 */}
                <div>
                  <label className="mb-1 block text-xs text-text-secondary">触发类型</label>
                  <div className="grid grid-cols-5 gap-2">
                    {(Object.keys(TYPE_CONFIG) as ScheduleType[]).map((t) => {
                      const cfg = TYPE_CONFIG[t]
                      const Icon = cfg.icon
                      return (
                        <button
                          key={t}
                          className={clsx(
                            'chip flex flex-col items-center gap-1 px-2 py-2',
                            form.type === t ? 'chip-active' : 'chip-idle'
                          )}
                          onClick={() => handleTypeChange(t)}
                          title={cfg.desc}
                        >
                          <Icon size={15} />
                          <span className="text-[11px] font-medium">{cfg.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-text-muted">
                    {TYPE_CONFIG[form.type].desc}
                  </p>
                </div>

                {/* 时间配置：根据类型显示不同的选择器 */}
                <div className="rounded-lg border border-border bg-bg-base/50 p-3">
                  <label className="mb-2 block text-xs font-medium text-text-secondary">
                    时间配置
                  </label>

                  {/* 单次：日期 + 时间选择器 */}
                  {form.type === 'once' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        className="input flex-1 text-xs"
                        value={scheduleForm.onceDate}
                        onChange={(e) =>
                          setScheduleForm({ ...scheduleForm, onceDate: e.target.value })
                        }
                      />
                      <input
                        type="time"
                        className="input w-32 text-xs"
                        value={scheduleForm.onceTime}
                        onChange={(e) =>
                          setScheduleForm({ ...scheduleForm, onceTime: e.target.value })
                        }
                      />
                    </div>
                  )}

                  {/* 间隔：预设按钮 + 自定义输入 */}
                  {form.type === 'interval' && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {INTERVAL_PRESETS.map((p) => (
                          <button
                            key={p.value}
                            className={clsx(
                              'chip',
                              scheduleForm.intervalMs === p.value ? 'chip-active' : 'chip-idle'
                            )}
                            onClick={() =>
                              setScheduleForm({ ...scheduleForm, intervalMs: p.value })
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
                          placeholder="毫秒数"
                          min={1000}
                          value={scheduleForm.intervalMs}
                          onChange={(e) =>
                            setScheduleForm({
                              ...scheduleForm,
                              intervalMs: parseInt(e.target.value, 10) || 0
                            })
                          }
                        />
                        <span>ms</span>
                      </div>
                    </div>
                  )}

                  {/* 每日：小时 + 分钟选择器 */}
                  {form.type === 'daily' && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-text-muted">每天</span>
                      <select
                        className="input w-20 text-xs"
                        value={scheduleForm.dailyHour}
                        onChange={(e) =>
                          setScheduleForm({
                            ...scheduleForm,
                            dailyHour: parseInt(e.target.value, 10)
                          })
                        }
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {String(i).padStart(2, '0')} 时
                          </option>
                        ))}
                      </select>
                      <select
                        className="input w-20 text-xs"
                        value={scheduleForm.dailyMinute}
                        onChange={(e) =>
                          setScheduleForm({
                            ...scheduleForm,
                            dailyMinute: parseInt(e.target.value, 10)
                          })
                        }
                      >
                        {[0, 15, 30, 45].map((m) => (
                          <option key={m} value={m}>
                            {String(m).padStart(2, '0')} 分
                          </option>
                        ))}
                      </select>
                      <span className="text-text-muted">执行</span>
                    </div>
                  )}

                  {/* 每周：星期 + 时间选择器 */}
                  {form.type === 'weekly' && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {WEEKDAYS.map((day, idx) => (
                          <button
                            key={idx}
                            className={clsx(
                              'chip',
                              scheduleForm.weeklyDay === idx ? 'chip-active' : 'chip-idle'
                            )}
                            onClick={() =>
                              setScheduleForm({ ...scheduleForm, weeklyDay: idx })
                            }
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-text-muted">时间</span>
                        <select
                          className="input w-20 text-xs"
                          value={scheduleForm.weeklyHour}
                          onChange={(e) =>
                            setScheduleForm({
                              ...scheduleForm,
                              weeklyHour: parseInt(e.target.value, 10)
                            })
                          }
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>
                              {String(i).padStart(2, '0')} 时
                            </option>
                          ))}
                        </select>
                        <select
                          className="input w-20 text-xs"
                          value={scheduleForm.weeklyMinute}
                          onChange={(e) =>
                            setScheduleForm({
                              ...scheduleForm,
                              weeklyMinute: parseInt(e.target.value, 10)
                            })
                          }
                        >
                          {[0, 15, 30, 45].map((m) => (
                            <option key={m} value={m}>
                              {String(m).padStart(2, '0')} 分
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Cron：表达式输入 + 预设示例 */}
                  {form.type === 'cron' && (
                    <div className="space-y-2">
                      <input
                        className="input text-xs font-mono"
                        placeholder="如：0 9 * * 1-5"
                        value={scheduleForm.cronExpr}
                        onChange={(e) =>
                          setScheduleForm({ ...scheduleForm, cronExpr: e.target.value })
                        }
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {CRON_PRESETS.map((p) => (
                          <button
                            key={p.value}
                            className={clsx(
                              'chip',
                              scheduleForm.cronExpr === p.value ? 'chip-active' : 'chip-idle'
                            )}
                            onClick={() =>
                              setScheduleForm({ ...scheduleForm, cronExpr: p.value })
                            }
                            title={p.value}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-text-muted">
                        格式：分 时 日 月 周（标准5段式cron表达式）
                      </p>
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

                {/* 高级选项 */}
                <div className="rounded-lg border border-border bg-bg-base/50">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-text-secondary"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    <span>高级选项</span>
                    <ChevronDown
                      size={14}
                      className={clsx(
                        'text-text-muted transition-transform',
                        showAdvanced && 'rotate-180'
                      )}
                    />
                  </button>
                  {showAdvanced && (
                    <div className="space-y-2 border-t border-border px-3 py-2.5 animate-expand-down">
                      <div className="flex items-center gap-2 text-xs">
                        <label className="w-28 shrink-0 text-text-muted">最大重试次数</label>
                        <input
                          type="number"
                          className="input w-24 text-xs"
                          min={0}
                          value={scheduleForm.maxRetries}
                          onChange={(e) =>
                            setScheduleForm({
                              ...scheduleForm,
                              maxRetries: parseInt(e.target.value, 10) || 0
                            })
                          }
                        />
                        <span className="text-text-muted">0=不重试</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <label className="w-28 shrink-0 text-text-muted">重试间隔(ms)</label>
                        <input
                          type="number"
                          className="input w-24 text-xs"
                          min={0}
                          value={scheduleForm.retryDelay}
                          onChange={(e) =>
                            setScheduleForm({
                              ...scheduleForm,
                              retryDelay: parseInt(e.target.value, 10) || 0
                            })
                          }
                        />
                        <span className="text-text-muted">默认 60000(1分钟)</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <label className="w-28 shrink-0 text-text-muted">任务超时(ms)</label>
                        <input
                          type="number"
                          className="input w-24 text-xs"
                          min={0}
                          value={scheduleForm.timeoutMs}
                          onChange={(e) =>
                            setScheduleForm({
                              ...scheduleForm,
                              timeoutMs: parseInt(e.target.value, 10) || 0
                            })
                          }
                        />
                        <span className="text-text-muted">0=不超时，默认 300000(5分钟)</span>
                      </div>
                    </div>
                  )}
                </div>

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

          {/* 任务列表 */}
          <div className="p-3">
            {tasks.length === 0 && !showForm && (
              <div className="flex flex-col items-center py-14 text-center animate-fade-in">
                <Clock size={32} className="animate-float mb-3 text-text-muted opacity-40" />
                <p className="text-sm text-text-muted">暂无定时任务</p>
                <p className="mt-1 text-xs text-text-muted">点击右上角"新建"创建第一个定时任务</p>
              </div>
            )}

            {tasks.map((task) => {
              const cfg = TYPE_CONFIG[task.type]
              const Icon = cfg.icon
              return (
                <div
                  key={task.id}
                  className={clsx(
                    'card-hover stagger-up mb-2 rounded-lg border p-3',
                    task.enabled
                      ? 'border-border bg-bg-hover/40'
                      : 'border-border bg-bg/50 opacity-60'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon size={13} className="text-accent" />
                        <span className="text-sm font-medium text-text-primary">{task.name}</span>
                        <span className="rounded border border-border px-1.5 py-0 text-[9px] text-text-muted">
                          {cfg.label}
                        </span>
                        {task.lastRunStatus === 'done' && (
                          <CheckCircle2 size={12} className="text-success" />
                        )}
                        {task.lastRunStatus === 'error' && (
                          <XCircle size={12} className="text-danger" />
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{task.prompt}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-text-muted">
                        <span>配置：{formatSchedule(task)}</span>
                        <span>·</span>
                        <span>下次：{formatTime(task.nextRunAt)}</span>
                        <span>·</span>
                        <span>上次：{formatTime(task.lastRunAt)}</span>
                        <span>·</span>
                        <span>已执行 {task.runCount} 次</span>
                      </div>
                      {task.lastRunError && (
                        <div className="mt-1.5 flex items-start gap-1 rounded bg-danger/10 px-2 py-1 text-[10px] text-danger">
                          <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                          <span className="break-all">{task.lastRunError}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        className="btn-press rounded p-1 text-text-muted hover:bg-bg-input hover:text-success"
                        title="立即执行"
                        onClick={() => void runNow(task.id)}
                      >
                        <Play size={13} />
                      </button>
                      <button
                        className="btn-press rounded p-1 text-text-muted hover:bg-bg-input hover:text-accent"
                        title="编辑"
                        onClick={() => handleEdit(task)}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className={clsx(
                          'btn-press rounded p-1 hover:bg-bg-input',
                          task.enabled
                            ? 'text-success'
                            : 'text-text-muted hover:text-warning'
                        )}
                        title={task.enabled ? '禁用' : '启用'}
                        onClick={() => void toggleTask(task.id, !task.enabled)}
                      >
                        <Power size={13} />
                      </button>
                      <button
                        className="btn-press rounded p-1 text-text-muted hover:bg-bg-input hover:text-danger"
                        title="删除"
                        onClick={() => void deleteTask(task.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* 执行日志 */}
            {logs.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  <Loader2 size={12} />
                  执行日志
                </div>
                <div className="space-y-1">
                  {logs.slice(0, 20).map((log, i) => (
                    <div
                      key={`${log.taskId}-${log.startedAt}-${i}`}
                      className={clsx(
                        'flex items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-bg-hover/40 animate-fade-in',
                        log.status === 'error' && 'bg-danger/5'
                      )}
                    >
                      {log.status === 'done' ? (
                        <CheckCircle2 size={11} className="text-success" />
                      ) : log.status === 'error' ? (
                        <XCircle size={11} className="text-danger" />
                      ) : log.status === 'running' ? (
                        <Loader2 size={11} className="animate-spin text-accent" />
                      ) : (
                        <Clock size={11} className="text-text-muted" />
                      )}
                      <span className="flex-1 truncate text-text-secondary">{log.taskName}</span>
                      <span className="text-text-muted">{formatTime(log.startedAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
