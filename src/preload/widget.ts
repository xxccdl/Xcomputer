import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// 内联 IPC 通道名（避免与主 preload 共享 chunk 导致 sandbox 加载失败）
const IPC = {
  WIDGET_CHAT_SEND: 'widget:chatSend',
  WIDGET_CHAT_STOP: 'widget:chatStop',
  WIDGET_CHAT_DELTA: 'widget:chatDelta',
  WIDGET_CHAT_DONE: 'widget:chatDone',
  WIDGET_CHAT_ERROR: 'widget:chatError',
  WIDGET_GET_TASK_STATE: 'widget:getTaskState',
  WIDGET_TASK_STEP: 'widget:taskStep',
  WIDGET_TASK_DONE: 'widget:taskDone',
  WIDGET_TASK_ERROR: 'widget:taskError',
  WIDGET_HIDE: 'widget:hide',
  WIDGET_STOP_TASK: 'widget:stopTask',
  WIDGET_GET_QUOTA: 'widget:getQuota',
  WIDGET_GET_SETTINGS: 'widget:getSettings',
  WIDGET_UPDATE_SETTINGS: 'widget:updateSettings',
  WIDGET_QUOTA_UPDATED: 'widget:quotaUpdated',
  WIDGET_BUY_CREDITS: 'widget:buyCredits',
  WIDGET_OPEN_SETTINGS: 'widget:openSettings',
  // Widget Agent 模式
  WIDGET_AGENT_SEND: 'widget:agentSend',
  WIDGET_AGENT_STOP: 'widget:agentStop',
  WIDGET_AGENT_NEW_SESSION: 'widget:agentNewSession',
  WIDGET_AGENT_GET_STATE: 'widget:agentGetState',
  WIDGET_AGENT_STEP: 'widget:agentStep',
  WIDGET_AGENT_DONE: 'widget:agentDone',
  WIDGET_AGENT_ERROR: 'widget:agentError',
  WIDGET_AGENT_MESSAGE: 'widget:agentMessage',
  WIDGET_CONFIRM_REQUEST: 'widget:confirmRequest',
  WIDGET_CONFIRM_RESPONSE: 'widget:confirmResponse',
  WIDGET_ASK_REQUEST: 'widget:askRequest',
  WIDGET_ASK_RESPONSE: 'widget:askResponse',
  WIDGET_AGENT_REFRESH: 'widget:agentRefresh',
  // 会话列表管理
  WIDGET_LIST_SESSIONS: 'widget:listSessions',
  WIDGET_DELETE_SESSION: 'widget:deleteSession',
  WIDGET_LOAD_SESSION: 'widget:loadSession',
  // Mini 模式（AI 点击操作时缩为小窗）
  WIDGET_MINI_MODE: 'widget:miniMode',
  WIDGET_FULL_MODE: 'widget:fullMode',
  WIDGET_EXPAND: 'widget:expand',
  WIDGET_SET_MOUSE_EVENTS: 'widget:setMouseEvents',
  // 确认/提问已解决广播（与主窗口共享通道名）
  CHAT_CONFIRM_RESOLVED: 'chat:confirmResolved',
  CHAT_ASK_RESOLVED: 'chat:askResolved'
} as const

type Listener<T> = (payload: T) => void
type Unsubscribe = () => void

interface TaskStepInfo {
  id: string
  sessionId: string
  type: string
  status: string
  content?: string
  toolName?: string
  toolArgs?: string
  toolResult?: string
  startedAt?: number
  finishedAt?: number
  error?: string
}

interface TaskState {
  sessionId: string | null
  steps: TaskStepInfo[]
  isRunning: boolean
}

/** 限免积分配额（内联类型，避免引入 shared chunk） */
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

/** Widget 查询积分返回的聚合结构 */
interface WidgetQuota {
  /** 限免模式积分（非限免模式为 null） */
  relay: RelayQuotaInfo | null
  /** 付费积分余额（查询失败为 null） */
  paid: PaidQuotaInfo | null
  /** 是否处于限免模式 */
  isRelayMode: boolean
}

/** Widget 查询/更新设置所需的最小子集（避免引入完整 Settings 类型） */
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

/** Agent 步骤事件（内联类型，避免引入 shared chunk） */
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

/** Agent 消息（内联类型） */
interface AgentMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string | unknown[]
  createdAt: number
}

/** 高危确认请求（内联类型） */
interface WidgetConfirmRequest {
  requestId: string
  sessionId: string
  toolName: string
  toolArgs: unknown
  reason: string
  source?: 'main' | 'widget'
}

/** AI 提问请求（内联类型） */
interface WidgetAskRequest {
  requestId: string
  sessionId: string
  question: string
  options?: string[]
  placeholder?: string
  source?: 'main' | 'widget'
}

/** Agent 友好状态（与主进程 FriendlyStatus 一致） */
interface FriendlyStatus {
  text: string
  icon?: 'thinking' | 'working' | 'confirm' | 'done' | 'error'
  detail?: string
}

/** Agent 状态（agentGetState 返回） */
interface AgentState {
  sessionId: string | null
  messages: AgentMessage[]
  currentStatus: FriendlyStatus | null
  isRunning: boolean
}

/** 会话元信息（内联类型） */
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

const widgetApi = {
  /** 发送对话消息（简单模式，无 agent） */
  chatSend(text: string): Promise<void> {
    return ipcRenderer.invoke(IPC.WIDGET_CHAT_SEND, text)
  },
  /** 中断当前对话 */
  chatStop(): Promise<void> {
    return ipcRenderer.invoke(IPC.WIDGET_CHAT_STOP)
  },
  /** 隐藏 widget 窗口 */
  hide(): void {
    ipcRenderer.send(IPC.WIDGET_HIDE)
  },
  /** 查询当前任务进度 */
  getTaskState(): Promise<TaskState> {
    return ipcRenderer.invoke(IPC.WIDGET_GET_TASK_STATE)
  },
  /** 停止主窗口当前任务 */
  stopTask(): Promise<void> {
    return ipcRenderer.invoke(IPC.WIDGET_STOP_TASK)
  },
  /** 监听流式输出增量 */
  onChatDelta(cb: Listener<string>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, delta: string): void => cb(delta)
    ipcRenderer.on(IPC.WIDGET_CHAT_DELTA, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_CHAT_DELTA, handler)
  },
  /** 监听对话完成 */
  onChatDone(cb: Listener<string>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, response: string): void => cb(response)
    ipcRenderer.on(IPC.WIDGET_CHAT_DONE, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_CHAT_DONE, handler)
  },
  /** 监听对话错误 */
  onChatError(cb: Listener<string>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, error: string): void => cb(error)
    ipcRenderer.on(IPC.WIDGET_CHAT_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_CHAT_ERROR, handler)
  },
  /** 监听任务步骤更新 */
  onTaskStep(cb: Listener<TaskStepInfo>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, step: TaskStepInfo): void => cb(step)
    ipcRenderer.on(IPC.WIDGET_TASK_STEP, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_TASK_STEP, handler)
  },
  /** 监听任务完成 */
  onTaskDone(cb: Listener<{ sessionId: string }>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, payload: { sessionId: string }): void => cb(payload)
    ipcRenderer.on(IPC.WIDGET_TASK_DONE, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_TASK_DONE, handler)
  },
  /** 监听任务出错 */
  onTaskError(cb: Listener<{ sessionId: string; error: string }>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, payload: { sessionId: string; error: string }): void => cb(payload)
    ipcRenderer.on(IPC.WIDGET_TASK_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_TASK_ERROR, handler)
  },
  /** 查询积分（限免 + 付费聚合） */
  getQuota(): Promise<WidgetQuota> {
    return ipcRenderer.invoke(IPC.WIDGET_GET_QUOTA)
  },
  /** 查询当前设置 */
  getSettings(): Promise<WidgetSettings> {
    return ipcRenderer.invoke(IPC.WIDGET_GET_SETTINGS)
  },
  /** 更新设置（部分字段，合并写入） */
  updateSettings(partial: Partial<WidgetSettings>): Promise<WidgetSettings> {
    return ipcRenderer.invoke(IPC.WIDGET_UPDATE_SETTINGS, partial)
  },
  /** 打开主窗口购买积分面板 */
  buyCredits(): void {
    ipcRenderer.send(IPC.WIDGET_BUY_CREDITS)
  },
  /** 打开主窗口完整设置面板 */
  openMainSettings(): void {
    ipcRenderer.send(IPC.WIDGET_OPEN_SETTINGS)
  },
  /** 监听积分更新推送（AI 请求完成后自动刷新） */
  onQuotaUpdated(cb: Listener<WidgetQuota>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, payload: WidgetQuota): void => cb(payload)
    ipcRenderer.on(IPC.WIDGET_QUOTA_UPDATED, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_QUOTA_UPDATED, handler)
  },

  // ============ Agent 模式 ============

  /** 发送 agent 指令（自动执行工具调用，强制 task 模式） */
  agentSend(text: string): Promise<void> {
    return ipcRenderer.invoke(IPC.WIDGET_AGENT_SEND, text)
  },
  /** 中断当前 agent 任务 */
  agentStop(): Promise<void> {
    return ipcRenderer.invoke(IPC.WIDGET_AGENT_STOP)
  },
  /** 新建 agent 会话（清空历史） */
  agentNewSession(): Promise<string> {
    return ipcRenderer.invoke(IPC.WIDGET_AGENT_NEW_SESSION)
  },
  /** 拉取 agent 状态（窗口重开时调用，恢复任务历史和当前状态） */
  agentGetState(): Promise<AgentState> {
    return ipcRenderer.invoke(IPC.WIDGET_AGENT_GET_STATE)
  },
  /** 查询所有会话列表 + 运行状态 */
  listSessions(): Promise<WidgetSessionListResult> {
    return ipcRenderer.invoke(IPC.WIDGET_LIST_SESSIONS)
  },
  /** 删除指定会话 */
  deleteSession(sessionId: string): Promise<void> {
    return ipcRenderer.invoke(IPC.WIDGET_DELETE_SESSION, sessionId)
  },
  /** 加载已有会话到 widget agent（切换当前 agent 会话） */
  loadSession(sessionId: string): Promise<string> {
    return ipcRenderer.invoke(IPC.WIDGET_LOAD_SESSION, sessionId)
  },
  /** 响应高危确认 */
  respondConfirm(requestId: string, allowed: boolean): Promise<void> {
    return ipcRenderer.invoke(IPC.WIDGET_CONFIRM_RESPONSE, requestId, allowed)
  },
  /** 响应 AI 提问 */
  respondAsk(requestId: string, answer: string, skipped: boolean): Promise<void> {
    return ipcRenderer.invoke(IPC.WIDGET_ASK_RESPONSE, requestId, answer, skipped)
  },
  /** 监听 agent 步骤更新（友好状态推送） */
  onAgentStep(cb: Listener<AgentStepEvent>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, step: AgentStepEvent): void => cb(step)
    ipcRenderer.on(IPC.WIDGET_AGENT_STEP, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_AGENT_STEP, handler)
  },
  /** 监听 agent 消息（用户/助手/系统消息） */
  onAgentMessage(cb: Listener<AgentMessage>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, msg: AgentMessage): void => cb(msg)
    ipcRenderer.on(IPC.WIDGET_AGENT_MESSAGE, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_AGENT_MESSAGE, handler)
  },
  /** 监听 agent 任务完成 */
  onAgentDone(cb: Listener<{ sessionId: string }>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, payload: { sessionId: string }): void => cb(payload)
    ipcRenderer.on(IPC.WIDGET_AGENT_DONE, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_AGENT_DONE, handler)
  },
  /** 监听 agent 任务出错 */
  onAgentError(cb: Listener<{ sessionId: string; error: string }>): Unsubscribe {
    const handler = (
      _e: IpcRendererEvent,
      payload: { sessionId: string; error: string }
    ): void => cb(payload)
    ipcRenderer.on(IPC.WIDGET_AGENT_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_AGENT_ERROR, handler)
  },
  /** 监听高危确认请求（显示 ConfirmBanner） */
  onConfirmRequest(cb: Listener<WidgetConfirmRequest>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, req: WidgetConfirmRequest): void => cb(req)
    ipcRenderer.on(IPC.WIDGET_CONFIRM_REQUEST, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_CONFIRM_REQUEST, handler)
  },
  /** 监听 AI 提问请求 */
  onAskRequest(cb: Listener<WidgetAskRequest>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, req: WidgetAskRequest): void => cb(req)
    ipcRenderer.on(IPC.WIDGET_ASK_REQUEST, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_ASK_REQUEST, handler)
  },
  /** 监听确认/提问已解决（自动关闭 ConfirmBanner） */
  onConfirmResolved(cb: Listener<{ requestId: string; allowed: boolean }>): Unsubscribe {
    const handler = (
      _e: IpcRendererEvent,
      payload: { requestId: string; allowed: boolean }
    ): void => cb(payload)
    ipcRenderer.on(IPC.CHAT_CONFIRM_RESOLVED, handler)
    return () => ipcRenderer.removeListener(IPC.CHAT_CONFIRM_RESOLVED, handler)
  },
  onAskResolved(
    cb: Listener<{ requestId: string; answer: string; skipped: boolean }>
  ): Unsubscribe {
    const handler = (
      _e: IpcRendererEvent,
      payload: { requestId: string; answer: string; skipped: boolean }
    ): void => cb(payload)
    ipcRenderer.on(IPC.CHAT_ASK_RESOLVED, handler)
    return () => ipcRenderer.removeListener(IPC.CHAT_ASK_RESOLVED, handler)
  },
  /** 监听窗口重新显示（触发状态刷新） */
  onAgentRefresh(cb: () => void): Unsubscribe {
    const handler = (): void => cb()
    ipcRenderer.on(IPC.WIDGET_AGENT_REFRESH, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_AGENT_REFRESH, handler)
  },

  // ============ Mini 模式 ============

  /** 监听进入 mini 模式（AI 点击操作时窗口缩为小窗） */
  onMiniMode(cb: () => void): Unsubscribe {
    const handler = (): void => cb()
    ipcRenderer.on(IPC.WIDGET_MINI_MODE, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_MINI_MODE, handler)
  },
  /** 监听恢复全尺寸模式 */
  onFullMode(cb: () => void): Unsubscribe {
    const handler = (): void => cb()
    ipcRenderer.on(IPC.WIDGET_FULL_MODE, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_FULL_MODE, handler)
  },
  /** 用户点击 mini 窗口 → 请求展开为全尺寸 */
  expandWidget(): void {
    ipcRenderer.send(IPC.WIDGET_EXPAND)
  },
  /** 通知主进程是否启用鼠标事件（mini 模式：透明区域点击穿透，悬停时恢复可点击） */
  setMouseEventsEnabled(enabled: boolean): void {
    ipcRenderer.send(IPC.WIDGET_SET_MOUSE_EVENTS, enabled)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('widgetApi', widgetApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.widgetApi = widgetApi
}

export type WidgetAPI = typeof widgetApi
