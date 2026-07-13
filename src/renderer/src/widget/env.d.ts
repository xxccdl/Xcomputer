// Widget 渲染进程的 Window 类型声明（与 src/preload/widget.ts 的 widgetApi 接口保持一致）
// 不从 preload 导入是因为 tsconfig.web.json 不包含 src/preload/**/*

interface TaskStepInfo {
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
  steps: TaskStepInfo[]
  isRunning: boolean
}

interface WidgetAPI {
  /** 发送对话消息（简单模式，无 agent） */
  chatSend(text: string): Promise<void>
  /** 中断当前对话 */
  chatStop(): Promise<void>
  /** 隐藏 widget 窗口 */
  hide(): void
  /** 查询当前任务进度 */
  getTaskState(): Promise<TaskState>
  /** 停止主窗口当前任务 */
  stopTask(): Promise<void>
  /** 监听流式输出增量 */
  onChatDelta(cb: (delta: string) => void): () => void
  /** 监听对话完成 */
  onChatDone(cb: (response: string) => void): () => void
  /** 监听对话错误 */
  onChatError(cb: (error: string) => void): () => void
  /** 监听任务步骤更新 */
  onTaskStep(cb: (step: TaskStepInfo) => void): () => void
  /** 监听任务完成 */
  onTaskDone(cb: (payload: { sessionId: string }) => void): () => void
  /** 监听任务出错 */
  onTaskError(cb: (payload: { sessionId: string; error: string }) => void): () => void
}

declare global {
  interface Window {
    widgetApi: WidgetAPI
  }
}

export {}
