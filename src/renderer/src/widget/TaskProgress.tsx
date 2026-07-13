import { useState, useEffect, useCallback } from 'react'

interface TaskStep {
  id: string
  sessionId: string
  type: string
  status: string
  content: string
  toolName?: string
  toolArgs?: unknown
  toolResult?: unknown
  startedAt?: number
  finishedAt?: number
  error?: string
}

interface TaskState {
  sessionId: string | null
  steps: TaskStep[]
  isRunning: boolean
}

const ICONS = {
  check: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  ),
  spinner: (
    <svg className="spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  ),
  dot: (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <circle cx="12" cy="12" r="6" />
    </svg>
  ),
  alert: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  empty: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 9h6v6H9z" />
    </svg>
  )
}

export function TaskProgress(): JSX.Element {
  const [taskState, setTaskState] = useState<TaskState>({
    sessionId: null,
    steps: [],
    isRunning: false
  })

  const refreshState = useCallback(async () => {
    try {
      const state = await window.widgetApi.getTaskState()
      setTaskState(state)
    } catch (err) {
      console.error('[TaskProgress] 获取任务状态失败:', err)
    }
  }, [])

  useEffect(() => {
    void refreshState()

    const unsubStep = window.widgetApi.onTaskStep(() => {
      void refreshState()
    })
    const unsubDone = window.widgetApi.onTaskDone(() => {
      void refreshState()
    })
    const unsubError = window.widgetApi.onTaskError(() => {
      void refreshState()
    })

    const interval = setInterval(() => {
      void refreshState()
    }, 2000)

    return () => {
      unsubStep()
      unsubDone()
      unsubError()
      clearInterval(interval)
    }
  }, [refreshState])

  const handleStopTask = async () => {
    try {
      await window.widgetApi.stopTask()
    } catch (err) {
      console.error('[TaskProgress] 停止任务失败:', err)
    }
  }

  const { steps, isRunning, sessionId } = taskState

  const getStepName = (step: TaskStep): string => {
    if (step.toolName) return step.toolName
    const typeMap: Record<string, string> = {
      thinking: '思考',
      tool_call: '调用工具',
      tool_result: '工具结果',
      final: '最终回复',
      error: '错误',
      message: '消息'
    }
    return typeMap[step.type] || step.type
  }

  const getStepIcon = (step: TaskStep): JSX.Element => {
    if (step.status === 'done' || step.status === 'completed') return ICONS.check
    if (step.status === 'running') return ICONS.spinner
    if (step.status === 'error') return ICONS.alert
    return ICONS.dot
  }

  const getStepIconClass = (step: TaskStep): string => {
    if (step.status === 'done' || step.status === 'completed') return 'done'
    if (step.status === 'running') return 'running'
    if (step.status === 'error') return 'error'
    return 'pending'
  }

  const getStepDetail = (step: TaskStep): string => {
    if (step.error) return step.error.slice(0, 80)
    if (step.content) return step.content.slice(0, 80)
    if (step.toolArgs && typeof step.toolArgs === 'string') {
      return step.toolArgs.slice(0, 80)
    }
    return ''
  }

  return (
    <div className="task-area">
      <div className="task-header">
        <span className="task-title">
          {sessionId ? '当前任务' : '无运行中任务'}
        </span>
        <span className={`task-status-badge ${isRunning ? 'running' : steps.length > 0 ? 'done' : 'idle'}`}>
          {isRunning ? '运行中' : steps.length > 0 ? '已完成' : '空闲'}
        </span>
      </div>

      {steps.length === 0 ? (
        <div className="empty-state">
          <div className="icon">{ICONS.empty}</div>
          <div className="title">暂无任务进度</div>
          <div className="hint">在主窗口中发送任务指令后，可在此查看实时进度</div>
        </div>
      ) : (
        <>
          <div className="task-list">
            {steps.map((step) => (
              <div key={step.id} className="task-step">
                <div className={`step-icon ${getStepIconClass(step)}`}>
                  {getStepIcon(step)}
                </div>
                <div className="step-content">
                  <div className="step-name">{getStepName(step)}</div>
                  {getStepDetail(step) && (
                    <div className="step-detail">{getStepDetail(step)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isRunning && (
            <button className="stop-task-btn" onClick={handleStopTask}>
              停止任务
            </button>
          )}
        </>
      )}
    </div>
  )
}
