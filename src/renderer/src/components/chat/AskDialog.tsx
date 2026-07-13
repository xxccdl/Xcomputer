import { useState, useEffect, useRef } from 'react'
import { MessageCircleQuestion, Send, SkipForward, Check } from 'lucide-react'
import type { AskRequest } from '@shared/types'
import { focusChatInput } from './ChatInput'

/**
 * AI 向用户提问的对话框。
 * 当 AI 调用 AskUser 工具时，通过 IPC 推送 AskRequest 到前端，
 * 此组件显示问题并等待用户回答。
 */
export function AskDialog(): JSX.Element | null {
  const [request, setRequest] = useState<AskRequest | null>(null)
  const [answer, setAnswer] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const unsub = window.api.chat.onAskRequest((req) => {
      // 过滤 widget 来源的请求（由小组件自身处理，主窗口不显示）
      if (req.source === 'widget') return
      setRequest(req)
      setAnswer('')
    })
    // 监听提问已解决广播：widget 响应或超时后自动关闭主窗口的 AskDialog
    const unsubResolved = window.api.chat.onAskResolved(({ requestId }) => {
      setRequest((prev) => (prev?.requestId === requestId ? null : prev))
    })
    return () => {
      unsub()
      unsubResolved()
    }
  }, [])

  // 自动聚焦输入框
  useEffect(() => {
    if (request && !request.options && inputRef.current) {
      inputRef.current.focus()
    }
  }, [request])

  if (!request) return null

  const handleRespond = async (userAnswer: string, skipped: boolean): Promise<void> => {
    await window.api.chat.respondAsk(request.requestId, userAnswer, skipped)
    setRequest(null)
    setAnswer('')
    // 关闭后恢复焦点到聊天输入框
    setTimeout(() => focusChatInput(), 100)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    // Ctrl+Enter 提交，Escape 跳过
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      if (answer.trim()) {
        void handleRespond(answer.trim(), false)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      void handleRespond('', true)
    }
  }

  const hasOptions = request.options && request.options.length > 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-accent/30 bg-bg-panel shadow-2xl animate-scale-in">
        {/* 头部 */}
        <div className="flex items-center gap-2.5 border-b border-border bg-accent/5 px-5 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15">
            <MessageCircleQuestion size={16} className="text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">AI 有个问题想问你</h3>
            <p className="text-[10px] text-text-muted">回答后 AI 会继续执行任务</p>
          </div>
        </div>

        {/* 问题内容 */}
        <div className="px-5 py-4">
          <p className="mb-4 text-sm leading-relaxed text-text-primary">{request.question}</p>

          {hasOptions ? (
            /* 选择题模式 */
            <div className="space-y-2">
              {request.options!.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => void handleRespond(option, false)}
                  className="group flex w-full items-center gap-2.5 rounded-lg border border-border bg-bg-base/50 px-3 py-2.5 text-left text-sm text-text-primary transition-all hover:border-accent hover:bg-accent/5"
                >
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-medium text-text-muted">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="flex-1">{option}</span>
                  <Check size={14} className="text-accent opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          ) : (
            /* 开放式输入模式 */
            <div>
              <textarea
                ref={inputRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={request.placeholder ?? '在此输入你的回答...'}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <p className="mt-1.5 text-[10px] text-text-muted">
                Ctrl+Enter 提交 · Esc 跳过
              </p>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-between gap-2 border-t border-border px-5 py-3">
          <button
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            onClick={() => void handleRespond('', true)}
          >
            <SkipForward size={12} />
            跳过
          </button>
          {!hasOptions && (
            <button
              className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
              disabled={!answer.trim()}
              onClick={() => void handleRespond(answer.trim(), false)}
            >
              <Send size={12} />
              提交回答
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
