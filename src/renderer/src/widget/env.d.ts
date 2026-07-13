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

/** 限免积分配额 */
interface RelayQuotaInfo {
  used: number
  limit: number
  remaining: number
  date: string
  paid: {
    balance: number
    earliestExpiringAt: string | null
    totalPurchased: number
  } | null
}

/** 付费积分余额 */
interface PaidQuotaInfo {
  balance: number
  totalPurchased: number
  totalConsumed: number
  firstPurchaseAt: string | null
  lastPurchaseAt: string | null
  earliestExpiringAt: string | null
}

interface WidgetQuota {
  relay: RelayQuotaInfo | null
  paid: PaidQuotaInfo | null
  isRelayMode: boolean
}

/** Widget 设置（最小子集） */
interface WidgetSettings {
  relayMode: boolean
  relayModelPreference: 'flash' | 'pro'
  openXEnabled: boolean
  openXToken: string
  deepThinking: boolean
  thinkingEffort: 'high' | 'max'
  deepseekApiKey: string
  [key: string]: unknown
}

/** Agent 步骤事件 */
interface AgentStepEvent {
  sessionId: string
  stepId: string
  messageId: string
  type: 'thinking' | 'deep_thinking' | 'tool_call' | 'tool_result' | 'error' | 'final'
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped'
  content: string
  toolName?: string
  toolArgs?: unknown
  toolResult?: unknown
  timestamp: number
  error?: string
  source?: 'main' | 'widget'
}

/** Agent 消息 */
interface AgentMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string | unknown[]
  createdAt: number
}

/** 高危确认请求 */
interface WidgetConfirmRequest {
  requestId: string
  sessionId: string
  toolName: string
  toolArgs: unknown
  reason: string
  source?: 'main' | 'widget'
}

/** AI 提问请求 */
interface WidgetAskRequest {
  requestId: string
  sessionId: string
  question: string
  options?: string[]
  placeholder?: string
  source?: 'main' | 'widget'
}

/** Agent 友好状态 */
interface FriendlyStatus {
  text: string
  icon?: 'thinking' | 'working' | 'confirm' | 'done' | 'error'
  detail?: string
}

/** Agent 状态 */
interface AgentState {
  sessionId: string | null
  messages: AgentMessage[]
  currentStatus: FriendlyStatus | null
  isRunning: boolean
}

/** 会话元信息 */
interface WidgetSessionInfo {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

/** 会话列表查询结果 */
interface WidgetSessionListResult {
  sessions: WidgetSessionInfo[]
  widgetAgentSessionId: string | null
  runningSessionIds: string[]
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

  // ============ 积分管理 ============
  /** 查询积分（限免 + 付费聚合） */
  getQuota(): Promise<WidgetQuota>
  /** 查询当前设置 */
  getSettings(): Promise<WidgetSettings>
  /** 更新设置（部分字段，合并写入） */
  updateSettings(partial: Partial<WidgetSettings>): Promise<WidgetSettings>
  /** 打开主窗口购买积分面板 */
  buyCredits(): void
  /** 打开主窗口完整设置面板 */
  openMainSettings(): void
  /** 监听积分更新推送 */
  onQuotaUpdated(cb: (payload: WidgetQuota) => void): () => void

  // ============ Agent 模式 ============
  /** 发送 agent 指令（自动执行工具调用，强制 task 模式） */
  agentSend(text: string): Promise<void>
  /** 中断当前 agent 任务 */
  agentStop(): Promise<void>
  /** 新建 agent 会话（清空历史） */
  agentNewSession(): Promise<string>
  /** 拉取 agent 状态（窗口重开时恢复） */
  agentGetState(): Promise<AgentState>
  /** 查询所有会话列表 + 运行状态 */
  listSessions(): Promise<WidgetSessionListResult>
  /** 删除指定会话 */
  deleteSession(sessionId: string): Promise<void>
  /** 加载已有会话到 widget agent */
  loadSession(sessionId: string): Promise<string>
  /** 响应高危确认 */
  respondConfirm(requestId: string, allowed: boolean): Promise<void>
  /** 响应 AI 提问 */
  respondAsk(requestId: string, answer: string, skipped: boolean): Promise<void>
  /** 监听 agent 步骤更新 */
  onAgentStep(cb: (step: AgentStepEvent) => void): () => void
  /** 监听 agent 消息 */
  onAgentMessage(cb: (msg: AgentMessage) => void): () => void
  /** 监听 agent 任务完成 */
  onAgentDone(cb: (payload: { sessionId: string }) => void): () => void
  /** 监听 agent 任务出错 */
  onAgentError(cb: (payload: { sessionId: string; error: string }) => void): () => void
  /** 监听高危确认请求 */
  onConfirmRequest(cb: (req: WidgetConfirmRequest) => void): () => void
  /** 监听 AI 提问请求 */
  onAskRequest(cb: (req: WidgetAskRequest) => void): () => void
  /** 监听确认已解决（自动关闭 ConfirmBanner） */
  onConfirmResolved(cb: (payload: { requestId: string; allowed: boolean }) => void): () => void
  /** 监听提问已解决 */
  onAskResolved(cb: (payload: { requestId: string; answer: string; skipped: boolean }) => void): () => void
  /** 监听窗口重新显示（触发状态刷新） */
  onAgentRefresh(cb: () => void): () => void

  // ============ Mini 模式 ============
  /** 监听进入 mini 模式（AI 点击操作时窗口缩为小窗） */
  onMiniMode(cb: () => void): () => void
  /** 监听恢复全尺寸模式 */
  onFullMode(cb: () => void): () => void
  /** 用户点击 mini 窗口 → 请求展开为全尺寸 */
  expandWidget(): void
}

declare global {
  interface Window {
    widgetApi: WidgetAPI
  }
}

export {}
