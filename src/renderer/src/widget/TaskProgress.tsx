import { useState, useEffect, useCallback } from 'react'
import { Check, Loader2, Circle, AlertCircle, Square } from 'lucide-react'

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

export function TaskProgress(): JSX.Element {
  const [taskState, setTaskState] = useState<TaskState>({
    sessionId: null,
    steps: [],
    isRunning: false
  })

  // 拉取初始状态
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

    // 监听实时任务事件
    const unsubStep = window.widgetApi.onTaskStep(() => {
      void refreshState()
    })
    const unsubDone = window.widgetApi.onTaskDone(() => {
      void refreshState()
    })
    const unsubError = window.widgetApi.onTaskError(() => {
      void refreshState()
    })

    // 定期刷新（任务进行中时每 2 秒拉取一次最新步骤）
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

  // 获取步骤显示名
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

  // 获取步骤状态图标
  const getStepIcon = (step: TaskStep): JSX.Element => {
    if (step.status === 'done' || step.status === 'completed') {
      return <Check size={11} />
    }
    if (step.status === 'running' || step.status === 'pending') {
      if (step.status === 'running') {
        return <Loader2 size={11} className="spin" />
      }
      return <Circle size={8} />
    }
    if (step.status === 'error') {
      return <AlertCircle size={11} />
    }
    return <Circle size={8} />
  }

  const getStepIconClass = (step: TaskStep): string => {
    if (step.status === 'done' || step.status === 'completed') return 'done'
    if (step.status === 'running') return 'running'
    if (step.status === 'error') return 'error'
    return 'pending'
  }

  // 截断内容
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
          <div className="icon">
            <Square size={18} style={{ color: 'rgba(255,255,255,0.3)' }} />
          </div>
          <div className="title">暂无任务进度</div>
          <div className="hint">在主窗口中发送任务指令后，<br />可在此查看实时进度</div>
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
