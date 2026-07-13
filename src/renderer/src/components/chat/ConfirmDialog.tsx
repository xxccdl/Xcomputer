import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import type { ConfirmRequest } from '@shared/types'
import { focusChatInput } from './ChatInput'

export function ConfirmDialog(): JSX.Element | null {
  const [queue, setQueue] = useState<ConfirmRequest[]>([])

  useEffect(() => {
    const unsub = window.api.chat.onConfirmRequest((req) => {
      // 过滤 widget 来源的请求（由小组件 ConfirmBanner 自身处理，主窗口不显示）
      if (req.source === 'widget') return
      setQueue((prev) => [...prev, req])
    })
    // 监听确认已解决广播：widget 响应或超时后自动移除队列中的该请求
    const unsubResolved = window.api.chat.onConfirmResolved(({ requestId }) => {
      setQueue((prev) => prev.filter((r) => r.requestId !== requestId))
    })
    return () => {
      unsub()
      unsubResolved()
    }
  }, [])

  const current = queue[0] ?? null

  const handleRespond = useCallback(
    async (allowed: boolean): Promise<void> => {
      if (!current) return
      await window.api.chat.respondConfirm(current.requestId, allowed)
      setQueue((prev) => prev.slice(1))
      // 如果队列已空（没有更多确认框），恢复焦点到输入框
      if (queue.length <= 1) {
        setTimeout(() => focusChatInput(), 100)
      }
    },
    [current, queue.length]
  )

  // Escape 键拒绝当前确认请求
  useEffect(() => {
    if (!current) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        void handleRespond(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [current, handleRespond])

  if (!current) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 animate-fade-in">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-warning/40 bg-bg-panel shadow-2xl animate-scale-in">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <AlertTriangle size={18} className="text-warning" />
          <h3 className="text-sm font-semibold text-text-primary">高危操作确认</h3>
          {queue.length > 1 && (
            <span className="ml-auto text-xs text-text-muted">还有 {queue.length - 1} 个待确认</span>
          )}
        </div>
        <div className="p-4">
          <p className="mb-3 text-sm text-text-secondary">{current.reason}</p>
          <div className="rounded-md border border-border bg-bg-input p-3">
            <div className="mb-2 text-xs text-text-muted">工具</div>
            <div className="mb-3 font-mono text-sm text-accent">{current.toolName}</div>
            <div className="mb-2 text-xs text-text-muted">参数</div>
            <pre className="overflow-x-auto font-mono text-xs text-text-secondary">
              {JSON.stringify(current.toolArgs, null, 2)}
            </pre>
          </div>
          <p className="mt-3 text-xs text-warning">
            请仔细核对参数，确认无误后再允许执行。
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            className="btn-ghost border border-border"
            onClick={() => void handleRespond(false)}
          >
            <X size={14} />
            拒绝
          </button>
          <button
            className="btn bg-warning text-black hover:bg-warning/80"
            onClick={() => void handleRespond(true)}
          >
            <Check size={14} />
            允许执行
          </button>
        </div>
      </div>
    </div>
  )
}
