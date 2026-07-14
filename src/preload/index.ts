import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import type {
  Settings,
  Session,
  Message,
  TaskStep,
  StepEvent,
  ConfirmRequest,
  AskRequest,
  ChatMode,
  ConnectionTestResult,
  ScheduledTask,
  ScheduleRunLog,
  MemoryItem,
  MemoryType,
  MemorySource,
  MemoryStats,
  SemanticSearchResult,
  MemoryGraphData,
  VectorIndexStatus,
  Skill,
  SkillSource,
  SkillFileType,
  SkillStats,
  HubSkillListItem,
  HubSkillDetail,
  TaskTemplate,
  TodoListState,
  TodoItem,
  SubagentUpdateEvent,
  SubagentInfo,
  AutomationTrigger,
  TriggerType,
  TriggerRunLog,
  QuickCommand,
  FileSearchResult,
  FileIndexStatus,
  CodeSnippet,
  CustomSubagent,
  GeneratedSubagentConfig,
  PlansResponse,
  PaidQuota,
  OrderInfo,
  ContextUsage,
  LocalModelStatus
} from '@shared/types'
import type { UpdateCheckResult, UpdateInfo, UpdateStatus } from '@shared/update-types'

type Listener<T> = (payload: T) => void
type Unsubscribe = () => void

const api = {
  platform: process.platform,
  window: {
    minimize(): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE)
    },
    maximize(): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE)
    },
    close(): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE)
    },
    isMaximized(): Promise<boolean> {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED)
    },
    onMaximizedChanged(cb: Listener<boolean>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: boolean): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, handler)
    },
    /** 主窗口进入 mini 模式（agent 执行中 blur 时触发） */
    onMiniMode(cb: () => void): Unsubscribe {
      const handler = (): void => cb()
      ipcRenderer.on(IPC_CHANNELS.MAIN_MINI_MODE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MAIN_MINI_MODE, handler)
    },
    /** 主窗口恢复全尺寸模式 */
    onFullMode(cb: () => void): Unsubscribe {
      const handler = (): void => cb()
      ipcRenderer.on(IPC_CHANNELS.MAIN_FULL_MODE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MAIN_FULL_MODE, handler)
    },
    /** 用户点击 mini 药丸请求展开主窗口 */
    expandMini(): void {
      ipcRenderer.send(IPC_CHANNELS.MAIN_EXPAND)
    }
  },
  chat: {
    send(sessionId: string, text: string): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, sessionId, text)
    },
    stop(sessionId: string): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_STOP, sessionId)
    },
    onStep(cb: Listener<StepEvent>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: StepEvent): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_STEP, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STEP, handler)
    },
    onMessage(cb: Listener<Message>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: Message): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_MESSAGE, handler)
    },
    onConfirmRequest(cb: Listener<ConfirmRequest>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: ConfirmRequest): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_CONFIRM_REQUEST, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_CONFIRM_REQUEST, handler)
    },
    respondConfirm(requestId: string, allowed: boolean): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_CONFIRM_RESPONSE, requestId, allowed)
    },
    /** 监听确认已解决广播（widget 响应后主窗口 ConfirmDialog 自动移除该请求） */
    onConfirmResolved(
      cb: Listener<{ requestId: string; allowed: boolean }>
    ): Unsubscribe {
      const handler = (
        _e: IpcRendererEvent,
        payload: { requestId: string; allowed: boolean }
      ): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_CONFIRM_RESOLVED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_CONFIRM_RESOLVED, handler)
    },
    onAskRequest(cb: Listener<AskRequest>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: AskRequest): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_ASK_REQUEST, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_ASK_REQUEST, handler)
    },
    respondAsk(requestId: string, answer: string, skipped: boolean): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_ASK_RESPONSE, requestId, answer, skipped)
    },
    /** 监听提问已解决广播 */
    onAskResolved(
      cb: Listener<{ requestId: string; answer: string; skipped: boolean }>
    ): Unsubscribe {
      const handler = (
        _e: IpcRendererEvent,
        payload: { requestId: string; answer: string; skipped: boolean }
      ): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_ASK_RESOLVED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_ASK_RESOLVED, handler)
    },
    onError(cb: Listener<{ sessionId: string; error: string }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { sessionId: string; error: string }): void =>
        cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_ERROR, handler)
    },
    onDone(cb: Listener<{ sessionId: string }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { sessionId: string }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_DONE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_DONE, handler)
    },
    onTodoUpdate(cb: Listener<TodoListState>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: TodoListState): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_TODO_UPDATE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_TODO_UPDATE, handler)
    },
    onSubagentUpdate(cb: Listener<SubagentUpdateEvent>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: SubagentUpdateEvent): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_SUBAGENT_UPDATE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_SUBAGENT_UPDATE, handler)
    },
    setMode(sessionId: string, mode: ChatMode): Promise<{ success: boolean; mode: ChatMode }> {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_SET_MODE, sessionId, mode)
    },
    getMode(sessionId: string): Promise<ChatMode> {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_GET_MODE, sessionId)
    },
    onModeChanged(cb: Listener<{ sessionId: string; mode: ChatMode }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { sessionId: string; mode: ChatMode }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_MODE_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_MODE_CHANGED, handler)
    },
    // 限免模式积分
    getRelayQuota(): Promise<{ used: number; limit: number; remaining: number; date: string } | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.AI_GET_RELAY_QUOTA)
    },
    onRelayQuotaUpdated(cb: Listener<{ used: number; limit: number; remaining: number; date: string }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { used: number; limit: number; remaining: number; date: string }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.AI_RELAY_QUOTA_UPDATED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_RELAY_QUOTA_UPDATED, handler)
    },
    /** 花费 10 积分跳过排队（限免模式高并发时） */
    skipQueue(): Promise<{ success: boolean; balance?: number; message: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_QUEUE_SKIP)
    },
    /** 订阅排队状态更新（排队位置、预计等待时间、是否可跳过） */
    onQueueUpdate(cb: Listener<{ sessionId: string; position: number; estimatedWaitMs: number; queueId: string; skipAvailable: boolean }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { sessionId: string; position: number; estimatedWaitMs: number; queueId: string; skipAvailable: boolean }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_QUEUE_UPDATE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_QUEUE_UPDATE, handler)
    },
    /** 查询当前会话的上下文 token 使用情况（优先读取持久化值，无则实时计算） */
    getContextUsage(sessionId: string): Promise<ContextUsage | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_CONTEXT_USAGE, sessionId)
    },
    /** 手动触发上下文压缩：AI 详细总结老消息并替换，完成后会广播 CHAT_CONTEXT_COMPRESSED 事件 */
    compressContext(sessionId: string): Promise<{ success: boolean; summaryId?: string; error?: string; newMessageCount?: number; compressedCount?: number }> {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_CONTEXT_COMPRESS, sessionId)
    },
    /** 订阅上下文使用率更新（对话结束/压缩完成/主动查询时推送） */
    onContextUsage(cb: Listener<ContextUsage>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: ContextUsage): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_CONTEXT_USAGE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_CONTEXT_USAGE, handler)
    },
    /** 订阅上下文压缩完成事件（前端需重载消息列表） */
    onContextCompressed(cb: Listener<{ sessionId: string; summaryId: string; messageCount: number; compressedCount: number }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { sessionId: string; summaryId: string; messageCount: number; compressedCount: number }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CHAT_CONTEXT_COMPRESSED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_CONTEXT_COMPRESSED, handler)
    }
  },
  payment: {
    /** 获取套餐列表 */
    getPlans(): Promise<PlansResponse | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.PAYMENT_GET_PLANS)
    },
    /** 创建订单 */
    createOrder(planId: string): Promise<OrderInfo | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.PAYMENT_CREATE_ORDER, planId)
    },
    /** 在浏览器中打开支付链接 */
    openInBrowser(payUrl: string): Promise<{ success: boolean }> {
      return ipcRenderer.invoke(IPC_CHANNELS.PAYMENT_OPEN_BROWSER, payUrl)
    },
    /** 轮询订单状态（返回 'paid' | 'closed' | 'timeout' | 'cancelled'） */
    pollOrderStatus(orderNo: string): Promise<'paid' | 'closed' | 'timeout' | 'cancelled'> {
      return ipcRenderer.invoke(IPC_CHANNELS.PAYMENT_POLL_ORDER, orderNo)
    },
    /** 取消正在进行的轮询 */
    cancelPoll(): Promise<{ success: boolean }> {
      return ipcRenderer.invoke(IPC_CHANNELS.PAYMENT_CANCEL_POLL)
    },
    /** 查询付费积分余额 */
    getQuota(): Promise<PaidQuota | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.PAYMENT_GET_QUOTA)
    },
    /** 订阅付费积分更新 */
    onQuotaUpdated(cb: Listener<PaidQuota>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: PaidQuota): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.PAYMENT_QUOTA_UPDATED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PAYMENT_QUOTA_UPDATED, handler)
    }
  },

  // ============ 本地模型（实验性） ============
  localModel: {
    /** 查询当前模型状态 */
    getStatus(): Promise<LocalModelStatus> {
      return ipcRenderer.invoke(IPC_CHANNELS.LOCAL_MODEL_GET_STATUS)
    },
    /** 触发基座模型下载（进度通过 onStatus 推送） */
    download(): Promise<{ success: boolean; error?: string; status: LocalModelStatus }> {
      return ipcRenderer.invoke(IPC_CHANNELS.LOCAL_MODEL_DOWNLOAD)
    },
    /** 取消下载 */
    cancelDownload(): Promise<{ success: boolean }> {
      return ipcRenderer.invoke(IPC_CHANNELS.LOCAL_MODEL_CANCEL_DOWNLOAD)
    },
    /** 加载模型到内存（就绪推理） */
    load(): Promise<{ success: boolean; error?: string; status: LocalModelStatus }> {
      return ipcRenderer.invoke(IPC_CHANNELS.LOCAL_MODEL_LOAD)
    },
    /** 推理健康检查 */
    test(): Promise<{ ok: boolean; message: string; output?: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.LOCAL_MODEL_TEST)
    },
    /** 卸载模型，释放显存/内存 */
    dispose(): Promise<{ success: boolean; error?: string; status: LocalModelStatus }> {
      return ipcRenderer.invoke(IPC_CHANNELS.LOCAL_MODEL_DISPOSE)
    },
    /** 订阅状态变更 */
    onStatus(cb: Listener<LocalModelStatus>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: LocalModelStatus): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.LOCAL_MODEL_STATUS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.LOCAL_MODEL_STATUS, handler)
    }
  },

  session: {
    list(): Promise<Session[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_LIST)
    },
    create(): Promise<Session> {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_CREATE)
    },
    delete(id: string): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELETE, id)
    },
    rename(id: string, title: string): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_RENAME, id, title)
    },
    getMessages(id: string): Promise<Message[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_MESSAGES, id)
    },
    getSteps(id: string): Promise<TaskStep[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_STEPS, id)
    },
    getTodos(id: string): Promise<TodoItem[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_TODOS, id)
    },
    getSubagents(id: string): Promise<SubagentInfo[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_SUBAGENTS, id)
    },
    search(query: string, limit?: number): Promise<Array<{
      sessionId: string
      sessionTitle: string
      matchedMessage: string
      messageRole: string
      createdAt: number
    }>> {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_SEARCH, query, limit)
    },
    exportMarkdown(id: string): Promise<{ success: boolean; path?: string; error?: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_EXPORT, id)
    },
    onUpdated(cb: (payload: { id: string; title: string }) => void): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { id: string; title: string }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.SESSION_UPDATED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_UPDATED, handler)
    },
    onCreated(cb: Listener<Session>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: Session): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.SESSION_CREATED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_CREATED, handler)
    }
  },
  settings: {
    get(): Promise<Settings> {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET)
    },
    update(partial: Partial<Settings>): Promise<Settings> {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, partial)
    },
    onChanged(cb: Listener<Settings>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: Settings): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_CHANGED, handler)
    },
    testMcpConnection(): Promise<ConnectionTestResult> {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_TEST_MCP)
    },
    testAiConnection(): Promise<ConnectionTestResult> {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_TEST_AI)
    }
  },
  mcp: {
    getStatus(): Promise<{ status: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.MCP_STATUS)
    },
    onStatusChanged(cb: Listener<{ status: string }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { status: string }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.MCP_STATUS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MCP_STATUS, handler)
    }
  },
  floatingBall: {
    /** 切换悬浮球显示/隐藏 */
    toggle(): Promise<{ visible: boolean }> {
      return ipcRenderer.invoke(IPC_CHANNELS.FLOATING_BALL_TOGGLE)
    },
    /** 监听悬浮球触发的快捷操作 */
    onAction(cb: Listener<string>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, action: string): void => cb(action)
      ipcRenderer.on(IPC_CHANNELS.FLOATING_BALL_ACTION, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.FLOATING_BALL_ACTION, handler)
    }
  },
  widget: {
    /** 监听 widget 请求打开购买积分面板 */
    onBuyCredits(cb: () => void): Unsubscribe {
      const handler = (): void => cb()
      ipcRenderer.on(IPC_CHANNELS.WIDGET_BUY_CREDITS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WIDGET_BUY_CREDITS, handler)
    },
    /** 监听 widget 请求打开完整设置面板 */
    onOpenSettings(cb: () => void): Unsubscribe {
      const handler = (): void => cb()
      ipcRenderer.on(IPC_CHANNELS.WIDGET_OPEN_SETTINGS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WIDGET_OPEN_SETTINGS, handler)
    }
  },
  schedule: {
    list(): Promise<ScheduledTask[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.SCHEDULE_LIST)
    },
    create(
      task: Omit<ScheduledTask, 'id' | 'createdAt' | 'runCount'>
    ): Promise<ScheduledTask> {
      return ipcRenderer.invoke(IPC_CHANNELS.SCHEDULE_CREATE, task)
    },
    update(
      id: string,
      patch: Partial<ScheduledTask>
    ): Promise<ScheduledTask | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.SCHEDULE_UPDATE, id, patch)
    },
    delete(id: string): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.SCHEDULE_DELETE, id)
    },
    toggle(id: string, enabled: boolean): Promise<ScheduledTask | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.SCHEDULE_TOGGLE, id, enabled)
    },
    runNow(id: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SCHEDULE_RUN_NOW, id)
    },
    getLogs(limit = 50): Promise<ScheduleRunLog[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.SCHEDULE_GET_LOGS, limit)
    },
    onChanged(cb: Listener<{ tasks: ScheduledTask[] }>): Unsubscribe {
      const handler = (
        _e: IpcRendererEvent,
        payload: { tasks: ScheduledTask[] }
      ): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.SCHEDULE_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SCHEDULE_CHANGED, handler)
    },
    onRunLog(cb: Listener<ScheduleRunLog>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: ScheduleRunLog): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.SCHEDULE_RUN_LOG, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SCHEDULE_RUN_LOG, handler)
    }
  },
  memory: {
    list(): Promise<MemoryItem[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_LIST)
    },
    listArchived(): Promise<MemoryItem[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_LIST_ARCHIVED)
    },
    get(id: string): Promise<MemoryItem | undefined> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET, id)
    },
    add(item: {
      type: MemoryType
      category: string
      content: string
      confidence?: number
      tags?: string[]
    }): Promise<MemoryItem> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_ADD, item)
    },
    update(
      id: string,
      patch: Partial<Omit<MemoryItem, 'id' | 'createdAt'>>
    ): Promise<MemoryItem | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_UPDATE, id, patch)
    },
    delete(id: string): Promise<boolean> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DELETE, id)
    },
    clear(): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CLEAR)
    },
    search(query: {
      keyword?: string
      type?: MemoryType
      source?: MemorySource
      tag?: string
    }): Promise<MemoryItem[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_SEARCH, query)
    },
    stats(): Promise<MemoryStats> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_STATS)
    },
    restore(id: string): Promise<boolean> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_RESTORE, id)
    },
    exportAll(): Promise<{ memories: MemoryItem[]; exportedAt: number; version: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_EXPORT)
    },
    importAll(
      data: { memories: MemoryItem[] },
      merge?: boolean
    ): Promise<{ added: number; skipped: number }> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_IMPORT, data, merge)
    },
    cleanup(): Promise<{ archived: number }> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CLEANUP)
    },
    semanticSearch(query: string, limit?: number): Promise<SemanticSearchResult[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_SEMANTIC_SEARCH, query, limit)
    },
    getGraph(): Promise<MemoryGraphData> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GRAPH)
    },
    getVectorStatus(): Promise<VectorIndexStatus> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_VECTOR_STATUS)
    },
    rebuildIndex(): Promise<{ success: boolean }> {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_REBUILD_INDEX)
    },
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe {
      const handler = (
        _e: IpcRendererEvent,
        payload: { updated: boolean }
      ): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.MEMORY_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MEMORY_CHANGED, handler)
    }
  },

  // ============ 技能系统 ============
  skills: {
    list(): Promise<Skill[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_LIST)
    },
    get(id: string): Promise<Skill | undefined> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET, id)
    },
    add(item: {
      name: string
      description: string
      content: string
      tags?: string[]
      triggers?: string[]
    }): Promise<Skill | { error: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_ADD, item)
    },
    update(
      id: string,
      patch: Partial<Omit<Skill, 'id' | 'createdAt'>>
    ): Promise<Skill | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_UPDATE, id, patch)
    },
    delete(id: string): Promise<boolean> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_DELETE, id)
    },
    clear(): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_CLEAR)
    },
    search(query: {
      keyword?: string
      source?: SkillSource
      tag?: string
    }): Promise<Skill[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_SEARCH, query)
    },
    stats(): Promise<SkillStats> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_STATS)
    },
    toggle(id: string, enabled?: boolean): Promise<Skill | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_TOGGLE, id, enabled)
    },
    upload(options?: {
      name?: string
      description?: string
      tags?: string[]
    }): Promise<Skill | { error: string } | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_UPLOAD, options)
    },
    exportAll(): Promise<{ skills: Skill[]; exportedAt: number; version: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_EXPORT)
    },
    importAll(
      data: { skills: Skill[] },
      merge?: boolean
    ): Promise<{ added: number; skipped: number }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_IMPORT, data, merge)
    },
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe {
      const handler = (
        _e: IpcRendererEvent,
        payload: { updated: boolean }
      ): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.SKILL_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SKILL_CHANGED, handler)
    }
  },

  // ============ 自定义子智能体模板 ============
  customSubagents: {
    list(): Promise<CustomSubagent[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_SUBAGENT_LIST)
    },
    get(id: string): Promise<CustomSubagent | undefined> {
      return ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_SUBAGENT_GET, id)
    },
    add(item: Omit<CustomSubagent, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt' | 'useCount'>): Promise<CustomSubagent | { error: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_SUBAGENT_ADD, item)
    },
    update(id: string, patch: Partial<Omit<CustomSubagent, 'id' | 'createdAt'>>): Promise<CustomSubagent | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_SUBAGENT_UPDATE, id, patch)
    },
    delete(id: string): Promise<boolean> {
      return ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_SUBAGENT_DELETE, id)
    },
    toggle(id: string, enabled?: boolean): Promise<CustomSubagent | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_SUBAGENT_TOGGLE, id, enabled)
    },
    generate(description: string): Promise<GeneratedSubagentConfig | { error: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_SUBAGENT_GENERATE, description)
    },
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe {
      const handler = (
        _e: IpcRendererEvent,
        payload: { updated: boolean }
      ): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.CUSTOM_SUBAGENT_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CUSTOM_SUBAGENT_CHANGED, handler)
    }
  },

  // ============ XSkillHub 技能市场 ============
  skillHub: {
    /** 获取 Hub 技能列表 */
    list(params?: {
      q?: string
      category?: string
      sort?: string
      page?: number
      limit?: number
    }): Promise<
      | { items: HubSkillListItem[]; total: number; totalPages: number }
      | { error: string }
    > {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_LIST, params ?? {})
    },
    /** 获取 Hub 技能详情 */
    get(id: number): Promise<HubSkillDetail | { error: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_GET, id)
    },
    /** 下载并安装 Hub 技能到本地 */
    download(
      id: number
    ): Promise<{ success: boolean; name?: string; error?: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_DOWNLOAD, id)
    },
    /** 发布技能到 Hub */
    upload(data: {
      name: string
      description: string
      author: string
      category: string
      tags: string[]
      version: string
      content: string
      filePath?: string
    }): Promise<{ success: boolean; id?: number; error?: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_UPLOAD, data)
    },
    /** 评分 */
    rate(id: number, rating: number): Promise<{ success: boolean; error?: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_RATE, id, rating)
    },
    /** 获取分类列表 */
    categories(): Promise<{ name: string; count: number }[] | { error: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_CATEGORIES)
    },
    /** 获取统计信息 */
    stats(): Promise<
      | {
          totalSkills: number
          totalDownloads: number
          totalUsers: number
          totalRatings: number
        }
      | { error: string }
    > {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_STATS)
    },

    // ============ 管理员接口 ============

    /** 管理员登录 */
    adminLogin(
      username: string,
      password: string
    ): Promise<{ success: true; username: string } | { error: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_ADMIN_LOGIN, { username, password })
    },
    /** 获取管理员信息 */
    adminInfo(): Promise<
      | { username: string; created_at: string; last_login_at: string | null }
      | { error: string }
    > {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_ADMIN_INFO)
    },
    /** 退出登录 */
    adminLogout(): Promise<{ success: true }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_ADMIN_LOGOUT)
    },
    /** 管理员：获取技能列表 */
    adminList(params?: {
      q?: string
      page?: number
      limit?: number
    }): Promise<
      | { items: HubSkillListItem[]; total: number; totalPages: number }
      | { error: string }
    > {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_ADMIN_LIST, params ?? {})
    },
    /** 管理员：删除技能 */
    adminDelete(id: string): Promise<{ success: true } | { error: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_ADMIN_DELETE, id)
    },
    /** 管理员：编辑技能 */
    adminUpdate(
      id: string,
      data: Record<string, unknown>
    ): Promise<HubSkillDetail | { error: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_ADMIN_UPDATE, { id, data })
    },
    /** 管理员：获取详细统计 */
    adminStats(): Promise<Record<string, unknown> | { error: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_ADMIN_STATS)
    },
    /** 管理员：修改密码 */
    adminChangePassword(
      oldPassword: string,
      newPassword: string
    ): Promise<{ success: true } | { error: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_HUB_ADMIN_CHANGE_PASSWORD, {
        oldPassword,
        newPassword
      })
    }
  },

  // ============ 任务模板 ============
  template: {
    list(): Promise<TaskTemplate[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_LIST)
    },
    get(id: string): Promise<TaskTemplate | undefined> {
      return ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_GET, id)
    },
    add(item: {
      name: string
      description: string
      prompt: string
      category: string
    }): Promise<TaskTemplate> {
      return ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_ADD, item)
    },
    update(
      id: string,
      patch: Partial<Omit<TaskTemplate, 'id' | 'createdAt'>>
    ): Promise<TaskTemplate | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_UPDATE, id, patch)
    },
    delete(id: string): Promise<boolean> {
      return ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_DELETE, id)
    },
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe {
      const handler = (
        _e: IpcRendererEvent,
        payload: { updated: boolean }
      ): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.TEMPLATE_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TEMPLATE_CHANGED, handler)
    }
  },

  // ============ 远程控制（手机远程操控） ============
  remote: {
    start(): Promise<{ running: boolean; pairCode: string | null; phoneConnected: boolean; qrUrl: string | null; qrDataUrl: string | null }> {
      return ipcRenderer.invoke(IPC_CHANNELS.REMOTE_START)
    },
    stop(): Promise<{ running: boolean; pairCode: string | null; phoneConnected: boolean; qrUrl: string | null; qrDataUrl: string | null }> {
      return ipcRenderer.invoke(IPC_CHANNELS.REMOTE_STOP)
    },
    getState(): Promise<{ running: boolean; pairCode: string | null; phoneConnected: boolean; qrUrl: string | null; qrDataUrl: string | null }> {
      return ipcRenderer.invoke(IPC_CHANNELS.REMOTE_STATE)
    },
    onStateChange(cb: Listener<{ running: boolean; pairCode: string | null; phoneConnected: boolean; qrUrl: string | null; qrDataUrl: string | null }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { running: boolean; pairCode: string | null; phoneConnected: boolean; qrUrl: string | null; qrDataUrl: string | null }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.REMOTE_STATE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.REMOTE_STATE, handler)
    },
    onCommand(cb: Listener<{ sessionId: string; text: string }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { sessionId: string; text: string }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.REMOTE_COMMAND, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.REMOTE_COMMAND, handler)
    }
  },

  // ============ 自动化触发器 ============
  trigger: {
    list(): Promise<AutomationTrigger[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_LIST)
    },
    get(id: string): Promise<AutomationTrigger | undefined> {
      return ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_GET, id)
    },
    add(item: {
      name: string
      type: TriggerType
      config: AutomationTrigger['config']
      prompt: string
      maxRetries?: number
      retryDelay?: number
      timeoutMs?: number
      notify?: boolean
    }): Promise<AutomationTrigger> {
      return ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_ADD, item)
    },
    update(id: string, patch: Partial<Omit<AutomationTrigger, 'id' | 'createdAt'>>): Promise<AutomationTrigger | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_UPDATE, id, patch)
    },
    delete(id: string): Promise<boolean> {
      return ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_DELETE, id)
    },
    toggle(id: string, enabled: boolean): Promise<AutomationTrigger | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_TOGGLE, id, enabled)
    },
    test(id: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_TEST, id)
    },
    getLogs(limit?: number): Promise<TriggerRunLog[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_GET_LOGS, limit)
    },
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { updated: boolean }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.TRIGGER_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TRIGGER_CHANGED, handler)
    },
    onRunLog(cb: Listener<TriggerRunLog>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: TriggerRunLog): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.TRIGGER_RUN_LOG, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TRIGGER_RUN_LOG, handler)
    }
  },

  // ============ 快捷指令 ============
  shortcut: {
    list(): Promise<QuickCommand[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHORTCUT_LIST)
    },
    get(id: string): Promise<QuickCommand | undefined> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHORTCUT_GET, id)
    },
    add(item: {
      keyword: string
      name: string
      description: string
      prompt: string
      steps?: string[]
      category: string
    }): Promise<QuickCommand> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHORTCUT_ADD, item)
    },
    update(id: string, patch: Partial<Omit<QuickCommand, 'id' | 'createdAt'>>): Promise<QuickCommand | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHORTCUT_UPDATE, id, patch)
    },
    delete(id: string): Promise<boolean> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHORTCUT_DELETE, id)
    },
    toggle(id: string, enabled: boolean): Promise<QuickCommand | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHORTCUT_TOGGLE, id, enabled)
    },
    expand(keyword: string): Promise<QuickCommand | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHORTCUT_EXPAND, keyword)
    },
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { updated: boolean }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.SHORTCUT_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SHORTCUT_CHANGED, handler)
    }
  },

  // ============ 文件搜索 ============
  fileSearch: {
    query(keyword: string, options?: { maxResults?: number; extFilter?: string }): Promise<FileSearchResult[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.FILE_SEARCH_QUERY, keyword, options)
    },
    rebuild(paths?: string[]): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.FILE_SEARCH_REBUILD, paths)
    },
    stop(): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.FILE_SEARCH_STOP)
    },
    getStatus(): Promise<FileIndexStatus> {
      return ipcRenderer.invoke(IPC_CHANNELS.FILE_SEARCH_STATUS)
    }
  },

  // ============ 代码片段 ============
  snippet: {
    list(): Promise<CodeSnippet[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.SNIPPET_LIST)
    },
    get(id: string): Promise<CodeSnippet | undefined> {
      return ipcRenderer.invoke(IPC_CHANNELS.SNIPPET_GET, id)
    },
    add(item: {
      title: string
      description: string
      language: string
      content: string
      tags?: string[]
      category: string
    }): Promise<CodeSnippet> {
      return ipcRenderer.invoke(IPC_CHANNELS.SNIPPET_ADD, item)
    },
    update(id: string, patch: Partial<Omit<CodeSnippet, 'id' | 'createdAt'>>): Promise<CodeSnippet | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.SNIPPET_UPDATE, id, patch)
    },
    delete(id: string): Promise<boolean> {
      return ipcRenderer.invoke(IPC_CHANNELS.SNIPPET_DELETE, id)
    },
    toggle(id: string, enabled: boolean): Promise<CodeSnippet | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.SNIPPET_TOGGLE, id, enabled)
    },
    search(keyword: string): Promise<CodeSnippet[]> {
      return ipcRenderer.invoke(IPC_CHANNELS.SNIPPET_SEARCH, keyword)
    },
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { updated: boolean }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.SNIPPET_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SNIPPET_CHANGED, handler)
    }
  },

  // ============ 首次使用初始化引导 ============
  init: {
    /** 检查初始化场景（first-install / venv-broken / none） */
    check(): Promise<{
      scenario: 'first-install' | 'venv-broken' | 'none'
      needInit: boolean
      reason: string
      settings: Settings
    }> {
      return ipcRenderer.invoke(IPC_CHANNELS.INIT_CHECK)
    },
    /** 重建 .venv（首次使用或环境损坏时调用） */
    rebuildVenv(): Promise<{ success: boolean; error?: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.INIT_REBUILD_VENV)
    },
    /** 在向导中保存设置 */
    saveSettings(partial: Partial<Settings>): Promise<{ success: boolean; settings: Settings }> {
      return ipcRenderer.invoke(IPC_CHANNELS.INIT_SAVE_SETTINGS, partial)
    },
    /** 标记初始化完成 */
    complete(): Promise<{ success: boolean }> {
      return ipcRenderer.invoke(IPC_CHANNELS.INIT_COMPLETE)
    },
    /** 重置初始化状态（手动重新打开向导时调用） */
    reset(): Promise<{ success: boolean }> {
      return ipcRenderer.invoke(IPC_CHANNELS.INIT_RESET)
    },
    /** 通知主进程向渲染进程广播显示向导事件 */
    showGuide(): Promise<{ success: boolean }> {
      return ipcRenderer.invoke(IPC_CHANNELS.INIT_SHOW_GUIDE)
    },
    /** 监听重建进度消息 */
    onProgress(cb: Listener<{ message: string }>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: { message: string }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.INIT_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INIT_PROGRESS, handler)
    },
    /** 监听主进程发出的显示向导事件（手动触发时） */
    onShowGuide(cb: Listener<void>): Unsubscribe {
      const handler = (_e: IpcRendererEvent): void => cb(undefined)
      ipcRenderer.on(IPC_CHANNELS.INIT_SHOW_GUIDE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INIT_SHOW_GUIDE, handler)
    }
  },

  /** 应用更新相关 API */
  update: {
    /** 检查更新（手动触发） */
    check(): Promise<UpdateCheckResult> {
      return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK)
    },
    /** 下载更新 */
    download(updateInfo: UpdateInfo): Promise<{ success: boolean; filePath?: string; error?: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD, updateInfo)
    },
    /** 安装更新（启动 NSIS 安装程序并退出当前应用） */
    install(filePath: string): Promise<{ success: boolean }> {
      return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL, filePath)
    },
    /** 监听更新状态推送（检查结果/下载进度） */
    onStatus(cb: Listener<UpdateStatus>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, payload: UpdateStatus): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, handler)
    }
  },

  /** 应用基础信息 */
  app: {
    /** 获取当前应用版本号 */
    getVersion(): Promise<string> {
      return ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}

export type XcomputerAPI = typeof api
