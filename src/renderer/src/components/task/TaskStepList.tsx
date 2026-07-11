import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import {
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Wrench
} from 'lucide-react'
import type { TaskStep, StepStatus } from '@shared/types'
import { useChatStore } from '../../store/chat.store'

function StatusIcon({ status }: { status: StepStatus }): JSX.Element {
  switch (status) {
    case 'running':
      return <Loader2 size={14} className="animate-spin text-accent" />
    case 'success':
      return <CheckCircle2 size={14} className="text-success" />
    case 'error':
      return <XCircle size={14} className="text-danger" />
    case 'skipped':
      return <Circle size={14} className="text-text-muted" />
    default:
      return <Circle size={14} className="text-text-muted" />
  }
}

/** 工具执行计时器：实时显示工具执行时长，格式 XmYs */
function ToolTimer({
  startedAt,
  finishedAt,
  toolName
}: {
  startedAt: number
  finishedAt?: number
  toolName: string
}): JSX.Element {
  const calcElapsed = (): number => {
    const end = finishedAt ?? Date.now()
    return Math.max(0, Math.floor((end - startedAt) / 1000))
  }
  const [elapsed, setElapsed] = useState<number>(calcElapsed)

  useEffect(() => {
    // 已完成的工具不再更新计时器
    if (finishedAt !== undefined) {
      setElapsed(calcElapsed())
      return
    }
    // 立即校正一次，避免初始显示 0m0s 的偏差
    setElapsed(calcElapsed())
    const timer = setInterval(() => {
      setElapsed(calcElapsed())
    }, 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, finishedAt])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60

  return (
    <div className="flex items-center gap-1.5 text-xs text-text-muted">
      <Loader2 size={11} className="animate-spin text-accent" />
      <span className="font-mono">
        using {toolName} tool...{minutes}m{seconds}s
      </span>
    </div>
  )
}

function StepCard({ step }: { step: TaskStep }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const selectStep = useChatStore((s) => s.selectStep)
  const selectedStepId = useChatStore((s) => s.selectedStepId)

  const isTool = step.type === 'tool_call' || step.type === 'tool_result'
  const isDeepThinking = step.type === 'deep_thinking'
  const isSelected = selectedStepId === step.id
  // 所有工具在执行中（running）都预显示加载动画 + 实时计时器
  const isRunningTool =
    isTool && step.status === 'running' && !!step.toolName && !!step.startedAt

  return (
    <div
      className={clsx(
        'animate-spring-up rounded-md border bg-bg-panel transition-colors',
        isSelected ? 'border-accent' : 'border-border hover:border-border-muted',
        isDeepThinking && 'border-l-2 border-l-purple-400/50'
      )}
    >
      <div
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
        onClick={() => selectStep(isSelected ? null : step.id)}
      >
        <StatusIcon status={step.status} />
        <span className="flex-1 truncate text-xs text-text-primary">
          {isDeepThinking ? (
            <span className="font-mono text-purple-400">深度思考</span>
          ) : isTool && step.toolName ? (
            <span className="font-mono text-accent">{step.toolName}</span>
          ) : (
            step.content || step.type
          )}
        </span>
        {(isTool || isDeepThinking) && (
          <button
            className="rounded p-0.5 text-text-muted hover:bg-bg-hover"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
          >
            <ChevronRight
              size={12}
              className={clsx('transition-transform', expanded && 'rotate-90')}
            />
          </button>
        )}
      </div>
      {/* 工具执行中：预显示加载动画 + 实时计时器 */}
      {isRunningTool && (
        <div className="animate-fade-in px-3 pb-2 pt-0.5">
          <ToolTimer
            startedAt={step.startedAt}
            finishedAt={step.finishedAt}
            toolName={step.toolName!}
          />
        </div>
      )}
      {expanded && (isTool || isDeepThinking) && (
        <div className="animate-expand-down border-t border-border-muted px-3 py-2 font-mono text-xs">
          {step.toolArgs != null && (
            <div className="mb-2">
              <div className="mb-1 text-text-muted">参数:</div>
              <pre className="overflow-x-auto rounded bg-bg-input p-2 text-text-secondary">
                {JSON.stringify(step.toolArgs, null, 2)}
              </pre>
            </div>
          )}
          {step.toolResult != null && (
            <div>
              <div className="mb-1 text-text-muted">结果:</div>
              <pre className="overflow-x-auto rounded bg-bg-input p-2 text-text-secondary max-h-40">
                {typeof step.toolResult === 'string'
                  ? step.toolResult
                  : JSON.stringify(step.toolResult, null, 2)}
              </pre>
            </div>
          )}
          {step.error && (
            <div className="animate-shake text-danger">{step.error}</div>
          )}
        </div>
      )}
    </div>
  )
}

interface TaskStepListProps {
  steps: TaskStep[]
  messageId: string
}

export function TaskStepList({ steps }: TaskStepListProps): JSX.Element {
  // 操作步骤列表只显示工具调用/结果和深度思考，不显示普通 thinking 内容
  const visibleSteps = steps.filter((s) => s.type !== 'thinking')
  if (visibleSteps.length === 0) return <></>
  return (
    <div className="mb-4 ml-10 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <Wrench size={11} />
        <span>{visibleSteps.length} 个操作步骤</span>
      </div>
      {visibleSteps.map((s) => (
        <StepCard key={s.id} step={s} />
      ))}
    </div>
  )
}
