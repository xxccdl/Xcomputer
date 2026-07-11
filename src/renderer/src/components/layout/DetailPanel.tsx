import { useState, useEffect } from 'react'
import { X, Clock, ChevronRight, ChevronDown, CheckSquare, Square, ListChecks, Users, Info, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useChatStore } from '../../store/chat.store'
import { StepDetail } from '../detail/StepDetail'
import { TimelineView } from '../detail/TimelineView'
import type { SubagentInfo, SubagentStatus, TodoItem, ContextUsage } from '@shared/types'
import { useSessionStore } from '../../store/session.store'

/** 子代理状态对应的显示文本和颜色 */
const SUBAGENT_STATUS_CONFIG: Record<
  SubagentStatus,
  { label: string; color: string; dot: string }
> = {
  pending: { label: '等待中', color: 'text-text-muted', dot: 'bg-gray-400' },
  running: { label: '运行中', color: 'text-blue-400', dot: 'bg-blue-400 animate-pulse' },
  completed: { label: '已完成', color: 'text-green-400', dot: 'bg-green-400' },
  failed: { label: '失败', color: 'text-red-400', dot: 'bg-red-400' },
  cancelled: { label: '已取消', color: 'text-text-muted', dot: 'bg-gray-500' }
}

/** 计算待办进度 */
function calcProgress(items: TodoItem[]): { completed: number; total: number; percent: number } {
  const completed = items.filter((i) => i.status === 'completed').length
  const total = items.length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  return { completed, total, percent }
}

/** 格式化 tokens 数字（添加千分位，或转成 k 单位） */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n)}`
}

type ContextCategory = 'skills' | 'files' | 'other'

interface ContextUsageCardProps {
  usage: ContextUsage | null
  isCompressing: boolean
  onCompress: () => void
  sessionId: string | null
  compressError: string | null
}

function ContextUsageCard({ usage, isCompressing, onCompress, sessionId, compressError }: ContextUsageCardProps): JSX.Element {
  const [activeCategory, setActiveCategory] = useState<ContextCategory>('skills')
  const [showTip, setShowTip] = useState(false)

  // 计算各段宽度百分比（占 maxTokens，不是占已用）
  const skillsPct = usage ? Math.min(100, (usage.breakdown.skills / usage.maxTokens) * 100) : 0
  const filesPct = usage ? Math.min(100 - skillsPct, (usage.breakdown.files / usage.maxTokens) * 100) : 0
  const otherPct = usage ? Math.min(100 - skillsPct - filesPct, (usage.breakdown.other / usage.maxTokens) * 100) : 0
  const usedPct = usage ? Math.round(usage.percent * 100) : 0

  const categories: Array<{
    key: ContextCategory
    label: string
    color: string
    swatch: string
    tokens: number
    desc: string
  }> = [
    {
      key: 'skills',
      label: '技能',
      color: 'text-[#3b82f6]',
      swatch: 'bg-[#3b82f6]',
      tokens: usage?.breakdown.skills ?? 0,
      desc: '系统提示、工具定义、已加载的技能与记忆等固定开销'
    },
    {
      key: 'files',
      label: '文件',
      color: 'text-[#93c5fd]',
      swatch: 'bg-[#93c5fd]',
      tokens: usage?.breakdown.files ?? 0,
      desc: '工具返回的文件内容、搜索结果、命令输出等'
    },
    {
      key: 'other',
      label: '其他',
      color: 'text-text-muted',
      swatch: 'bg-[#d1d5db]',
      tokens: usage?.breakdown.other ?? 0,
      desc: '用户提问、AI 回复等纯对话文本'
    }
  ]

  const activeItem = categories.find((c) => c.key === activeCategory)!

  return (
    <div className="border-b border-border bg-bg-base/40 px-4 py-3 select-none">
      {/* 标题行 */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-text-primary">上下文</span>
          <div className="relative">
            <button
              className="flex h-4 w-4 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-secondary"
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              onClick={() => setShowTip((v) => !v)}
              title="关于上下文使用率"
            >
              <Info size={12} />
            </button>
            {showTip && (
              <div className="absolute left-1/2 top-5 z-30 w-60 -translate-x-1/2 rounded-md border border-border bg-bg-panel p-2.5 text-[11px] leading-relaxed text-text-secondary shadow-lg animate-fade-in">
                AI 与你对话时需要把历史消息、技能说明、文件内容等全部放进上下文。当上下文接近上限（约 90%），建议点击右侧"压缩"按钮让 AI 生成一份详细摘要，以释放空间继续对话。
              </div>
            )}
          </div>
        </div>
        <button
          className={clsx(
            'flex items-center gap-1 rounded-xl bg-white/10 px-5 py-1.5 text-sm font-medium text-text-primary transition-all hover:bg-white/15 active:scale-[0.97]',
            'disabled:cursor-not-allowed disabled:opacity-60'
          )}
          onClick={onCompress}
          disabled={isCompressing || !sessionId}
          title={!sessionId ? '请先选择会话' : '让 AI 把老消息总结为详细摘要以释放上下文空间'}
        >
          {isCompressing ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              压缩中...
            </>
          ) : (
            '压缩'
          )}
        </button>
      </div>

      {/* 进度条 + 百分比 */}
      <div className="mb-2 flex items-center gap-3">
        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
          {usage && usedPct > 0 && (
            <>
              <div
                className="absolute left-0 top-0 h-full bg-[#3b82f6] transition-all duration-500"
                style={{ width: `${skillsPct}%` }}
              />
              {filesPct > 0 && (
                <div
                  className="absolute top-0 h-full bg-[#93c5fd] transition-all duration-500"
                  style={{ left: `${skillsPct}%`, width: `${filesPct}%` }}
                />
              )}
              {otherPct > 0 && (
                <div
                  className="absolute top-0 h-full bg-[#d1d5db] transition-all duration-500"
                  style={{ left: `${skillsPct + filesPct}%`, width: `${otherPct}%` }}
                />
              )}
            </>
          )}
        </div>
        <span
          className={clsx(
            'min-w-[3.5rem] text-right text-lg font-semibold tabular-nums',
            usage && usedPct >= 85
              ? 'text-red-500'
              : usage && usedPct >= 60
                ? 'text-amber-500'
                : 'text-[#3b82f6]'
          )}
        >
          {usedPct}%
        </span>
      </div>

      {/* 分类标签 */}
      <div className="flex items-center gap-4">
        {categories.map((cat) => {
          const active = activeCategory === cat.key
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={clsx(
                'group relative flex items-center gap-1.5 py-1 text-sm transition-colors',
                active ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
              )}
              title={cat.desc}
            >
              <span className={clsx('h-3.5 w-3.5 rounded-[3px] transition-transform', cat.swatch, active && 'scale-110')} />
              <span className={clsx('font-medium', active && 'text-text-primary')}>{cat.label}</span>
              {active && (
                <span className="absolute -bottom-1 left-0 right-0 h-[2px] rounded-full bg-text-primary animate-fade-in" />
              )}
            </button>
          )
        })}
      </div>

      {/* 当前分类详情 */}
      {usage && (
        <div className="mt-2 rounded-md bg-bg-hover/50 px-2.5 py-1.5 text-[11px] leading-snug text-text-muted animate-fade-in">
          <span className={clsx('font-medium', activeItem.color)}>{activeItem.label}</span>
          <span className="mx-1 text-text-muted/60">·</span>
          <span className="tabular-nums text-text-secondary">{formatTokens(activeItem.tokens)} tokens</span>
          <span className="mx-1 text-text-muted/60">·</span>
          <span>{activeItem.desc}</span>
        </div>
      )}

      {/* token 总数提示 */}
      {usage && (
        <div className="mt-1 flex items-center justify-between text-[10px] text-text-muted/70 tabular-nums">
          <span>已用 {formatTokens(usage.totalTokens)} / 上限 {formatTokens(usage.maxTokens)} tokens</span>
          {usedPct >= 85 && (
            <span className="text-red-500">空间紧张，建议压缩</span>
          )}
        </div>
      )}

      {/* 压缩错误提示 */}
      {compressError && (
        <div className="mt-1.5 rounded-md bg-red-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-red-400 animate-fade-in">
          {compressError}
        </div>
      )}
    </div>
  )
}

export function DetailPanel(): JSX.Element {
  const steps = useChatStore((s) => s.steps)
  const todoItems = useChatStore((s) => s.todoItems)
  const subagents = useChatStore((s) => s.subagents)
  const isLoadingSession = useChatStore((s) => s.isLoadingSession)
  const selectedStepId = useChatStore((s) => s.selectedStepId)
  const selectStep = useChatStore((s) => s.selectStep)
  const setDetailPanelOpen = useChatStore((s) => s.setDetailPanelOpen)
  const contextUsage = useChatStore((s) => s.contextUsage)
  const isCompressing = useChatStore((s) => s.isCompressing)
  const setCompressing = useChatStore((s) => s.setCompressing)
  const currentSessionId = useSessionStore((s) => s.currentSessionId)
  const [compressError, setCompressError] = useState<string | null>(null)

  // 上下文压缩
  const handleCompress = async (): Promise<void> => {
    if (!currentSessionId || isCompressing) return
    setCompressing(true)
    setCompressError(null)
    try {
      const res = await window.api.chat.compressContext(currentSessionId)
      if (!res.success) {
        // 压缩失败（消息太少 / AI 总结失败等）：立即重置 loading 状态
        // （成功时由 onContextCompressed 事件回调重置）
        setCompressing(false)
        if (res.error) {
          setCompressError(res.error)
          console.warn('[DetailPanel] 压缩失败:', res.error)
        }
      }
    } catch (err) {
      console.error('[DetailPanel] 压缩异常:', err)
      setCompressing(false)
      setCompressError(err instanceof Error ? err.message : String(err))
    }
  }

  const selected = steps.find((s) => s.id === selectedStepId) ?? null
  const todoProgress = calcProgress(todoItems)
  const activeSubagents = subagents.filter(
    (s) => s.status === 'running' || s.status === 'pending'
  ).length

  return (
    <aside className="flex w-96 flex-col border-l border-border bg-bg-panel animate-slide-in-right">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium text-text-secondary">操作详情</span>
        <button
          className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
          onClick={() => setDetailPanelOpen(false)}
        >
          <X size={14} />
        </button>
      </div>

      {/* 上下文使用情况卡片（常驻显示在顶部） */}
      <ContextUsageCard
        usage={contextUsage}
        isCompressing={isCompressing}
        onCompress={() => void handleCompress()}
        sessionId={currentSessionId}
        compressError={compressError}
      />

      {isLoadingSession ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-xs text-text-muted">
          <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          加载中...
        </div>
      ) : steps.length === 0 && todoItems.length === 0 && subagents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-xs text-text-muted animate-fade-in">
          <Clock size={24} className="mb-2 opacity-40" />
          暂无操作记录
          <br />
          执行任务后此处显示步骤详情
        </div>
      ) : (
        // 单一滚动容器：所有区块顺序排列，整体可滚动，避免多个 max-h 区块互相挤压
        <div className="flex-1 overflow-y-auto">
          {/* TodoList 待办事项（主代理） */}
          {todoItems.length > 0 && (
            <div className="border-b border-border bg-bg-base/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ListChecks size={13} className="text-accent" />
                  <span className="text-xs font-medium text-text-secondary">任务清单</span>
                </div>
                <span className="text-[10px] text-text-muted">
                  {todoProgress.completed}/{todoProgress.total} · {todoProgress.percent}%
                </span>
              </div>
              {/* 进度条 */}
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-bg-hover">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-green-500 transition-all duration-500 progress-stripe"
                  style={{ width: `${todoProgress.percent}%` }}
                />
              </div>
              {/* 待办列表（无固定 max-h，自适应高度） */}
              <div className="space-y-1 pr-1">
                {todoItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className={clsx(
                      'flex items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-all animate-fade-in-up',
                      item.status === 'completed'
                        ? 'bg-green-500/5 text-text-muted line-through'
                        : 'text-text-primary hover:bg-bg-hover/50'
                    )}
                  >
                    {item.status === 'completed' ? (
                      <CheckSquare size={13} className="mt-0.5 flex-shrink-0 text-green-400" />
                    ) : (
                      <Square size={13} className="mt-0.5 flex-shrink-0 text-text-muted" />
                    )}
                    <span className="flex-shrink-0 text-[10px] text-text-muted">{idx + 1}.</span>
                    <span className="flex-1 leading-relaxed">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 子代理状态 */}
          {subagents.length > 0 && (
            <div className="border-b border-border bg-bg-base/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Users size={13} className="text-purple-400" />
                  <span className="text-xs font-medium text-text-secondary">子代理</span>
                </div>
                <span className="text-[10px] text-text-muted">
                  {subagents.length} 个{activeSubagents > 0 ? ` · ${activeSubagents} 运行中` : ''}
                </span>
              </div>
              <div className="space-y-2 pr-1">
                {subagents.map((sa) => (
                  <SubagentCard key={sa.id} subagent={sa} />
                ))}
              </div>
            </div>
          )}

          {/* 时间线 */}
          {steps.length > 0 && (
            <div className="border-b border-border p-3">
              <div className="mb-2 text-xs font-medium text-text-secondary">时间线</div>
              <TimelineView
                steps={steps}
                selectedId={selectedStepId}
                onSelect={selectStep}
              />
            </div>
          )}

          {/* 选中步骤详情 */}
          {selected && (
            <div className="border-t border-border">
              <StepDetail step={selected} />
            </div>
          )}

          {/* 未选中步骤时的占位提示（仅在有步骤但未选中时显示） */}
          {steps.length > 0 && !selected && (
            <div className="flex items-center justify-center px-6 py-8 text-center text-xs text-text-muted">
              <ChevronRight size={16} className="mr-1 opacity-40" />
              点击上方时间线查看步骤详情
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

/** 子代理卡片：显示状态、任务、轮次、结果，以及独立的任务清单。
 *  完成后（completed/failed/cancelled）延迟 1s 自动折叠，点击头部可重新展开。 */
function SubagentCard({ subagent: sa }: { subagent: SubagentInfo }): JSX.Element {
  const cfg = SUBAGENT_STATUS_CONFIG[sa.status]
  const todoProgress = calcProgress(sa.todoItems)
  const isFinished =
    sa.status === 'completed' || sa.status === 'failed' || sa.status === 'cancelled'
  const [collapsed, setCollapsed] = useState(false)

  // 完成后延迟 1s 自动折叠（让用户先看到完成状态再收起，避免突兀）
  useEffect(() => {
    if (!isFinished) {
      // 运行中/等待中：确保展开
      setCollapsed(false)
      return
    }
    const timer = setTimeout(() => setCollapsed(true), 1000)
    return (): void => clearTimeout(timer)
  }, [isFinished, sa.id])

  return (
    <div className="rounded-md border border-border/50 bg-bg-base/50 px-2 py-1.5 text-xs animate-fade-in-up">
      {/* 头部：完成后可点击折叠/展开 */}
      <div
        className={`flex items-center justify-between gap-2 ${isFinished ? 'cursor-pointer select-none' : ''}`}
        onClick={isFinished ? () => setCollapsed((v) => !v) : undefined}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={clsx('h-1.5 w-1.5 flex-shrink-0 rounded-full transition-colors', cfg.dot, sa.status === 'running' && 'animate-pulse-ring')} />
          <span className={clsx('flex-shrink-0 font-mono text-[10px]', cfg.color)}>
            {sa.id.slice(0, 8)}
          </span>
          <span className="flex-shrink-0 rounded bg-bg-hover px-1 py-0.5 text-[9px] text-text-muted">
            {sa.mode === 'background' ? '后台' : '前台'}
          </span>
          {/* 折叠时在头部显示任务摘要，避免完全看不到内容 */}
          {collapsed && (
            <span className="ml-1 truncate text-[10px] text-text-muted">{sa.task}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className={clsx('flex-shrink-0 text-[10px]', cfg.color)}>{cfg.label}</span>
          {isFinished &&
            (collapsed ? (
              <ChevronRight size={11} className="text-text-muted transition-transform" />
            ) : (
              <ChevronDown size={11} className="text-text-muted transition-transform" />
            ))}
        </div>
      </div>
      {/* 详情区：折叠时收起，带高度+透明度过渡动画 */}
      <div
        className={clsx(
          'overflow-hidden transition-all duration-300 ease-out',
          collapsed ? 'max-h-0 opacity-0 pt-0' : 'max-h-[600px] opacity-100 pt-1'
        )}
      >
        <div className="line-clamp-2 text-[11px] leading-relaxed text-text-primary">
          {sa.task}
        </div>

        {/* 子代理独立的任务清单 */}
        {sa.todoItems.length > 0 && (
          <div className="mt-1.5 rounded bg-bg/40 p-1.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1 text-[9px] text-text-muted">
                <ListChecks size={9} />
                子任务
              </span>
              <span className="text-[9px] text-text-muted">
                {todoProgress.completed}/{todoProgress.total}
              </span>
            </div>
            {/* 迷你进度条 */}
            <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-bg-hover">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
                style={{ width: `${todoProgress.percent}%` }}
              />
            </div>
            {/* todo 项 */}
            <div className="space-y-0.5">
              {sa.todoItems.map((item) => (
                <div
                  key={item.id}
                  className={clsx(
                    'flex items-start gap-1 text-[10px] leading-relaxed',
                    item.status === 'completed' ? 'text-text-muted line-through' : 'text-text-secondary'
                  )}
                >
                  {item.status === 'completed' ? (
                    <CheckSquare size={9} className="mt-0.5 flex-shrink-0 text-green-400" />
                  ) : (
                    <Square size={9} className="mt-0.5 flex-shrink-0 text-text-muted" />
                  )}
                  <span className="flex-1">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-1 flex items-center justify-between text-[9px] text-text-muted">
          <span>
            轮次 {sa.rounds}/{sa.maxRounds}
          </span>
          {sa.result && (
            <span className="text-green-400/70">
              {sa.result.slice(0, 40)}
              {sa.result.length > 40 ? '...' : ''}
            </span>
          )}
          {sa.error && (
            <span className="text-red-400/70">
              {sa.error.slice(0, 40)}
              {sa.error.length > 40 ? '...' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
