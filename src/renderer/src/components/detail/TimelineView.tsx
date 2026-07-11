import { clsx } from 'clsx'
import type { TaskStep } from '@shared/types'
import { CheckCircle2, XCircle, Loader2, Circle, Brain } from 'lucide-react'

export function TimelineView({
  steps,
  selectedId,
  onSelect
}: {
  steps: TaskStep[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}): JSX.Element {
  return (
    <div className="space-y-1">
      {steps.map((s, i) => {
        const time = new Date(s.startedAt).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
        const isDeepThinking = s.type === 'deep_thinking'
        return (
          <button
            key={s.id}
            className={clsx(
              'flex w-full items-start gap-2 rounded px-2 py-1 text-left text-xs transition-all animate-fade-in-up',
              selectedId === s.id
                ? 'bg-bg-hover text-text-primary'
                : 'text-text-secondary hover:bg-bg-hover',
              isDeepThinking && 'border-l-2 border-purple-400/50'
            )}
            onClick={() => onSelect(selectedId === s.id ? null : s.id)}
          >
            <span className="mt-0.5 shrink-0">
              {isDeepThinking && s.status === 'running' && (
                <Loader2 size={11} className="animate-spin text-purple-400" />
              )}
              {isDeepThinking && s.status === 'success' && (
                <Brain size={11} className="text-purple-400" />
              )}
              {!isDeepThinking && s.status === 'running' && (
                <Loader2 size={11} className="animate-spin text-accent" />
              )}
              {!isDeepThinking && s.status === 'success' && (
                <CheckCircle2 size={11} className="text-success" />
              )}
              {s.status === 'error' && <XCircle size={11} className="text-danger" />}
              {!isDeepThinking && (s.status === 'pending' || s.status === 'skipped') && (
                <Circle size={11} className="text-text-muted" />
              )}
            </span>
            <span className="shrink-0 font-mono text-text-muted">{time}</span>
            <span className="flex-1 truncate">
              {isDeepThinking ? (
                <span className="font-mono text-purple-400">深度思考</span>
              ) : s.toolName ? (
                <span className="font-mono text-accent">{s.toolName}</span>
              ) : (
                s.content || s.type
              )}
            </span>
            <span className="shrink-0 text-text-muted">#{i + 1}</span>
          </button>
        )
      })}
    </div>
  )
}
