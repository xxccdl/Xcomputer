import { useState, useEffect, useCallback } from 'react'

interface WidgetSessionInfo {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

interface SessionListState {
  sessions: WidgetSessionInfo[]
  widgetAgentSessionId: string | null
  runningSessionIds: string[]
}

interface TaskProgressProps {
  onEnterSession: (sessionId: string) => void
}

const ICONS = {
  trash: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  ),
  empty: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 9h6v6H9z" />
    </svg>
  ),
  enter: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function formatTime(ts: number): string {
  const now = new Date()
  const date = new Date(ts)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (date.getTime() >= today) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = today - 86400000
  if (date.getTime() >= yesterday) return '昨天'
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function TaskProgress({ onEnterSession }: TaskProgressProps): JSX.Element {
  const [state, setState] = useState<SessionListState>({
    sessions: [],
    widgetAgentSessionId: null,
    runningSessionIds: []
  })
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await window.widgetApi.listSessions()
      setState(result)
    } catch (err) {
      console.error('[TaskProgress] 获取会话列表失败:', err)
    }
  }, [])

  useEffect(() => {
    void refresh()

    const unsubTaskStep = window.widgetApi.onTaskStep(() => void refresh())
    const unsubTaskDone = window.widgetApi.onTaskDone(() => void refresh())
    const unsubTaskError = window.widgetApi.onTaskError(() => void refresh())
    const unsubAgentStep = window.widgetApi.onAgentStep(() => void refresh())
    const unsubAgentDone = window.widgetApi.onAgentDone(() => void refresh())
    const unsubAgentError = window.widgetApi.onAgentError(() => void refresh())

    const interval = setInterval(() => void refresh(), 3000)

    return () => {
      unsubTaskStep()
      unsubTaskDone()
      unsubTaskError()
      unsubAgentStep()
      unsubAgentDone()
      unsubAgentError()
      clearInterval(interval)
    }
  }, [refresh])

  const handleDelete = async (sessionId: string): Promise<void> => {
    try {
      await window.widgetApi.deleteSession(sessionId)
    } catch (err) {
      console.error('[TaskProgress] 删除会话失败:', err)
    }
    setConfirmingId(null)
    void refresh()
  }

  const { sessions, widgetAgentSessionId, runningSessionIds } = state

  return (
    <div className="task-area">
      <div className="task-header">
        <span className="task-title">会话列表</span>
        <span className="task-count-badge">{sessions.length}</span>
      </div>

      {sessions.length === 0 ? (
        <div className="empty-state">
          <div className="icon">{ICONS.empty}</div>
          <div className="title">暂无会话</div>
          <div className="hint">在「智能」标签中发送指令即可创建会话</div>
        </div>
      ) : (
        <div className="session-list">
          {sessions.map((s) => {
            const isRunning = runningSessionIds.includes(s.id)
            const isCurrent = s.id === widgetAgentSessionId
            const isConfirming = confirmingId === s.id
            return (
              <div
                key={s.id}
                className={`session-item ${isRunning ? 'running' : ''} ${isCurrent ? 'current' : ''}`}
                onClick={() => !isConfirming && onEnterSession(s.id)}
              >
                {isConfirming ? (
                  <div className="session-confirm">
                    <span>确认删除？</span>
                    <button className="confirm-del" onClick={(e) => { e.stopPropagation(); void handleDelete(s.id) }}>
                      删除
                    </button>
                    <button className="confirm-cancel" onClick={(e) => { e.stopPropagation(); setConfirmingId(null) }}>
                      取消
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="session-info">
                      <div className="session-title-row">
                        {isRunning && <span className="session-running-dot" />}
                        <span className="session-title">{s.title || '新会话'}</span>
                        {isCurrent && <span className="session-current-badge">当前</span>}
                      </div>
                      <div className="session-meta">
                        <span>{formatTime(s.updatedAt)}</span>
                        <span className="session-status">{isRunning ? '运行中' : '已完成'}</span>
                      </div>
                    </div>
                    <button
                      className="session-delete-btn"
                      onClick={(e) => { e.stopPropagation(); setConfirmingId(s.id) }}
                      title="删除"
                    >
                      {ICONS.trash}
                    </button>
                    <span className="session-enter-icon">{ICONS.enter}</span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
