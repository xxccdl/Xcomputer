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
  PlansResponse,
  PaidQuota,
  OrderInfo,
  ContextUsage,
  LocalModelStatus,
  CustomSubagent,
  GeneratedSubagentConfig
} from '@shared/types'
import type { UpdateCheckResult, UpdateInfo, UpdateStatus } from '@shared/update-types'

type Listener<T> = (payload: T) => void
type Unsubscribe = () => void

interface XcomputerAPI {
  platform: NodeJS.Platform
  window: {
    minimize(): Promise<void>
    maximize(): Promise<void>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    onMaximizedChanged(cb: Listener<boolean>): Unsubscribe
  }
  chat: {
    send(sessionId: string, text: string): Promise<void>
    stop(sessionId: string): Promise<void>
    onStep(cb: Listener<StepEvent>): Unsubscribe
    onMessage(cb: Listener<Message>): Unsubscribe
    onConfirmRequest(cb: Listener<ConfirmRequest>): Unsubscribe
    respondConfirm(requestId: string, allowed: boolean): Promise<void>
    /** 监听确认已解决广播（widget 响应后主窗口 ConfirmDialog 自动移除该请求） */
    onConfirmResolved(cb: Listener<{ requestId: string; allowed: boolean }>): Unsubscribe
    onAskRequest(cb: Listener<AskRequest>): Unsubscribe
    respondAsk(requestId: string, answer: string, skipped: boolean): Promise<void>
    /** 监听提问已解决广播 */
    onAskResolved(cb: Listener<{ requestId: string; answer: string; skipped: boolean }>): Unsubscribe
    onError(cb: Listener<{ sessionId: string; error: string }>): Unsubscribe
    onDone(cb: Listener<{ sessionId: string }>): Unsubscribe
    onTodoUpdate(cb: Listener<TodoListState>): Unsubscribe
    onSubagentUpdate(cb: Listener<SubagentUpdateEvent>): Unsubscribe
    setMode(sessionId: string, mode: ChatMode): Promise<{ success: boolean; mode: ChatMode }>
    getMode(sessionId: string): Promise<ChatMode>
    onModeChanged(cb: Listener<{ sessionId: string; mode: ChatMode }>): Unsubscribe
    /** 查询限免剩余积分 */
    getRelayQuota(): Promise<{ used: number; limit: number; remaining: number; date: string; paid: { balance: number; earliestExpiringAt: string; totalPurchased: number } | null } | null>
    /** 订阅限免积分更新 */
    onRelayQuotaUpdated(cb: Listener<{ used: number; limit: number; remaining: number; date: string; paid: { balance: number; earliestExpiringAt: string; totalPurchased: number } | null }>): Unsubscribe
    /** 花费 10 积分跳过排队（限免模式高并发时） */
    skipQueue(): Promise<{ success: boolean; balance?: number; message: string }>
    /** 订阅排队状态更新（排队位置、预计等待时间、是否可跳过） */
    onQueueUpdate(cb: Listener<{ sessionId: string; position: number; estimatedWaitMs: number; queueId: string; skipAvailable: boolean }>): Unsubscribe
    /** 查询当前会话的上下文 token 使用情况 */
    getContextUsage(sessionId: string): Promise<ContextUsage | null>
    /** 手动触发上下文压缩：AI 详细总结老消息并替换，完成后广播 onContextCompressed */
    compressContext(sessionId: string): Promise<{ success: boolean; summaryId?: string; error?: string; newMessageCount?: number; compressedCount?: number }>
    /** 订阅上下文使用率更新（对话结束/压缩完成/主动查询时推送） */
    onContextUsage(cb: Listener<ContextUsage>): Unsubscribe
    /** 订阅上下文压缩完成事件（前端需重载消息列表） */
    onContextCompressed(cb: Listener<{ sessionId: string; summaryId: string; messageCount: number; compressedCount: number }>): Unsubscribe
  }
  payment: {
    /** 获取套餐列表 */
    getPlans(): Promise<PlansResponse | null>
    /** 创建订单 */
    createOrder(planId: string): Promise<OrderInfo | null>
    /** 在浏览器中打开支付链接 */
    openInBrowser(payUrl: string): Promise<{ success: boolean }>
    /** 轮询订单状态（返回 'paid' | 'closed' | 'timeout' | 'cancelled'） */
    pollOrderStatus(orderNo: string): Promise<'paid' | 'closed' | 'timeout' | 'cancelled'>
    /** 取消正在进行的轮询 */
    cancelPoll(): Promise<{ success: boolean }>
    /** 查询付费积分余额 */
    getQuota(): Promise<PaidQuota | null>
    /** 订阅付费积分更新 */
    onQuotaUpdated(cb: Listener<PaidQuota>): Unsubscribe
  }
  // ============ 本地模型（实验性） ============
  localModel: {
    /** 查询当前模型状态 */
    getStatus(): Promise<LocalModelStatus>
    /** 触发基座模型下载（进度通过 onStatus 推送） */
    download(): Promise<{ success: boolean; error?: string; status: LocalModelStatus }>
    /** 取消下载 */
    cancelDownload(): Promise<{ success: boolean }>
    /** 加载模型到内存（就绪推理） */
    load(): Promise<{ success: boolean; error?: string; status: LocalModelStatus }>
    /** 推理健康检查 */
    test(): Promise<{ ok: boolean; message: string; output?: string }>
    /** 卸载模型，释放显存/内存 */
    dispose(): Promise<{ success: boolean; error?: string; status: LocalModelStatus }>
    /** 订阅状态变更 */
    onStatus(cb: Listener<LocalModelStatus>): Unsubscribe
  }
  session: {
    list(): Promise<Session[]>
    create(): Promise<Session>
    delete(id: string): Promise<void>
    rename(id: string, title: string): Promise<void>
    getMessages(id: string): Promise<Message[]>
    getSteps(id: string): Promise<TaskStep[]>
    getTodos(id: string): Promise<TodoItem[]>
    getSubagents(id: string): Promise<SubagentInfo[]>
    search(query: string, limit?: number): Promise<Array<{
      sessionId: string
      sessionTitle: string
      matchedMessage: string
      messageRole: string
      createdAt: number
    }>>
    exportMarkdown(id: string): Promise<{ success: boolean; path?: string; error?: string }>
    onUpdated(cb: (payload: { id: string; title: string }) => void): Unsubscribe
    onCreated(cb: Listener<Session>): Unsubscribe
  }
  settings: {
    get(): Promise<Settings>
    update(partial: Partial<Settings>): Promise<Settings>
    onChanged(cb: Listener<Settings>): Unsubscribe
    testMcpConnection(): Promise<ConnectionTestResult>
    testAiConnection(): Promise<ConnectionTestResult>
  }
  mcp: {
    getStatus(): Promise<{ status: string }>
    onStatusChanged(cb: Listener<{ status: string }>): Unsubscribe
  }
  floatingBall: {
    toggle(): Promise<{ visible: boolean }>
    onAction(cb: Listener<string>): Unsubscribe
  }
  schedule: {
    list(): Promise<ScheduledTask[]>
    create(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'runCount'>): Promise<ScheduledTask>
    update(id: string, patch: Partial<ScheduledTask>): Promise<ScheduledTask | null>
    delete(id: string): Promise<void>
    toggle(id: string, enabled: boolean): Promise<ScheduledTask | null>
    runNow(id: string): Promise<{ ok: boolean; error?: string }>
    getLogs(limit?: number): Promise<ScheduleRunLog[]>
    onChanged(cb: Listener<{ tasks: ScheduledTask[] }>): Unsubscribe
    onRunLog(cb: Listener<ScheduleRunLog>): Unsubscribe
  }
  memory: {
    list(): Promise<MemoryItem[]>
    listArchived(): Promise<MemoryItem[]>
    get(id: string): Promise<MemoryItem | undefined>
    add(item: {
      type: MemoryType
      category: string
      content: string
      confidence?: number
      tags?: string[]
    }): Promise<MemoryItem>
    update(
      id: string,
      patch: Partial<Omit<MemoryItem, 'id' | 'createdAt'>>
    ): Promise<MemoryItem | null>
    delete(id: string): Promise<boolean>
    clear(): Promise<void>
    search(query: {
      keyword?: string
      type?: MemoryType
      source?: MemorySource
      tag?: string
    }): Promise<MemoryItem[]>
    stats(): Promise<MemoryStats>
    restore(id: string): Promise<boolean>
    exportAll(): Promise<{ memories: MemoryItem[]; exportedAt: number; version: string }>
    importAll(
      data: { memories: MemoryItem[] },
      merge?: boolean
    ): Promise<{ added: number; skipped: number }>
    cleanup(): Promise<{ archived: number }>
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe
  }

  skills: {
    list(): Promise<Skill[]>
    get(id: string): Promise<Skill | undefined>
    add(item: {
      name: string
      description: string
      content: string
      tags?: string[]
      triggers?: string[]
    }): Promise<Skill | { error: string }>
    update(
      id: string,
      patch: Partial<Omit<Skill, 'id' | 'createdAt'>>
    ): Promise<Skill | null>
    delete(id: string): Promise<boolean>
    clear(): Promise<void>
    search(query: {
      keyword?: string
      source?: SkillSource
      tag?: string
    }): Promise<Skill[]>
    stats(): Promise<SkillStats>
    toggle(id: string, enabled?: boolean): Promise<Skill | null>
    upload(options?: {
      name?: string
      description?: string
      tags?: string[]
    }): Promise<Skill | { error: string } | null>
    exportAll(): Promise<{ skills: Skill[]; exportedAt: number; version: string }>
    importAll(
      data: { skills: Skill[] },
      merge?: boolean
    ): Promise<{ added: number; skipped: number }>
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe
  }

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
    >
    /** 获取 Hub 技能详情 */
    get(id: number): Promise<HubSkillDetail | { error: string }>
    /** 下载并安装 Hub 技能到本地 */
    download(
      id: number
    ): Promise<{ success: boolean; name?: string; error?: string }>
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
    }): Promise<{ success: boolean; id?: number; error?: string }>
    /** 评分 */
    rate(id: number, rating: number): Promise<{ success: boolean; error?: string }>
    /** 获取分类列表 */
    categories(): Promise<{ name: string; count: number }[] | { error: string }>
    /** 获取统计信息 */
    stats(): Promise<
      | {
          totalSkills: number
          totalDownloads: number
          totalUsers: number
          totalRatings: number
        }
      | { error: string }
    >
    /** 管理员登录 */
    adminLogin(
      username: string,
      password: string
    ): Promise<{ success: true; username: string } | { error: string }>
    /** 获取管理员信息 */
    adminInfo(): Promise<
      | { username: string; created_at: string; last_login_at: string | null }
      | { error: string }
    >
    /** 退出登录 */
    adminLogout(): Promise<{ success: true }>
    /** 管理员：获取技能列表 */
    adminList(params?: {
      q?: string
      page?: number
      limit?: number
    }): Promise<
      | { items: HubSkillListItem[]; total: number; totalPages: number }
      | { error: string }
    >
    /** 管理员：删除技能 */
    adminDelete(id: string): Promise<{ success: true } | { error: string }>
    /** 管理员：编辑技能 */
    adminUpdate(
      id: string,
      data: Record<string, unknown>
    ): Promise<HubSkillDetail | { error: string }>
    /** 管理员：获取详细统计 */
    adminStats(): Promise<Record<string, unknown> | { error: string }>
    /** 管理员：修改密码 */
    adminChangePassword(
      oldPassword: string,
      newPassword: string
    ): Promise<{ success: true } | { error: string }>
  }

  template: {
    list(): Promise<TaskTemplate[]>
    get(id: string): Promise<TaskTemplate | undefined>
    add(item: {
      name: string
      description: string
      prompt: string
      category: string
    }): Promise<TaskTemplate>
    update(
      id: string,
      patch: Partial<Omit<TaskTemplate, 'id' | 'createdAt'>>
    ): Promise<TaskTemplate | null>
    delete(id: string): Promise<boolean>
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe
  }

  remote: {
    start(): Promise<{ running: boolean; pairCode: string | null; phoneConnected: boolean; qrUrl: string | null; qrDataUrl: string | null }>
    stop(): Promise<{ running: boolean; pairCode: string | null; phoneConnected: boolean; qrUrl: string | null; qrDataUrl: string | null }>
    getState(): Promise<{ running: boolean; pairCode: string | null; phoneConnected: boolean; qrUrl: string | null; qrDataUrl: string | null }>
    onStateChange(cb: Listener<{ running: boolean; pairCode: string | null; phoneConnected: boolean; qrUrl: string | null; qrDataUrl: string | null }>): Unsubscribe
    onCommand(cb: Listener<{ sessionId: string; text: string }>): Unsubscribe
  }

  trigger: {
    list(): Promise<AutomationTrigger[]>
    get(id: string): Promise<AutomationTrigger | undefined>
    add(item: {
      name: string
      type: TriggerType
      config: AutomationTrigger['config']
      prompt: string
      maxRetries?: number
      retryDelay?: number
      timeoutMs?: number
      notify?: boolean
    }): Promise<AutomationTrigger>
    update(id: string, patch: Partial<Omit<AutomationTrigger, 'id' | 'createdAt'>>): Promise<AutomationTrigger | null>
    delete(id: string): Promise<boolean>
    toggle(id: string, enabled: boolean): Promise<AutomationTrigger | null>
    test(id: string): Promise<{ ok: boolean; error?: string }>
    getLogs(limit?: number): Promise<TriggerRunLog[]>
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe
    onRunLog(cb: Listener<TriggerRunLog>): Unsubscribe
  }

  shortcut: {
    list(): Promise<QuickCommand[]>
    get(id: string): Promise<QuickCommand | undefined>
    add(item: {
      keyword: string
      name: string
      description: string
      prompt: string
      steps?: string[]
      category: string
    }): Promise<QuickCommand>
    update(id: string, patch: Partial<Omit<QuickCommand, 'id' | 'createdAt'>>): Promise<QuickCommand | null>
    delete(id: string): Promise<boolean>
    toggle(id: string, enabled: boolean): Promise<QuickCommand | null>
    expand(keyword: string): Promise<QuickCommand | null>
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe
  }

  fileSearch: {
    query(keyword: string, options?: { maxResults?: number; extFilter?: string }): Promise<FileSearchResult[]>
    rebuild(paths?: string[]): Promise<void>
    stop(): Promise<void>
    getStatus(): Promise<FileIndexStatus>
  }

  snippet: {
    list(): Promise<CodeSnippet[]>
    get(id: string): Promise<CodeSnippet | undefined>
    add(item: {
      title: string
      description: string
      language: string
      content: string
      tags?: string[]
      category: string
    }): Promise<CodeSnippet>
    update(id: string, patch: Partial<Omit<CodeSnippet, 'id' | 'createdAt'>>): Promise<CodeSnippet | null>
    delete(id: string): Promise<boolean>
    toggle(id: string, enabled?: boolean): Promise<CodeSnippet | null>
    search(keyword: string): Promise<CodeSnippet[]>
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe
  }

  customSubagents: {
    list(): Promise<CustomSubagent[]>
    get(id: string): Promise<CustomSubagent | undefined>
    add(item: Omit<CustomSubagent, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt' | 'useCount'>): Promise<CustomSubagent | { error: string }>
    update(id: string, patch: Partial<Omit<CustomSubagent, 'id' | 'createdAt'>>): Promise<CustomSubagent | null>
    delete(id: string): Promise<boolean>
    toggle(id: string, enabled?: boolean): Promise<CustomSubagent | null>
    generate(description: string): Promise<GeneratedSubagentConfig | { error: string }>
    onChanged(cb: Listener<{ updated: boolean }>): Unsubscribe
  }

  init: {
    /** 检查初始化场景（first-install / venv-broken / none） */
    check(): Promise<{
      scenario: 'first-install' | 'venv-broken' | 'none'
      needInit: boolean
      reason: string
      settings: Settings
    }>
    /** 重建 .venv（首次使用或环境损坏时调用） */
    rebuildVenv(): Promise<{ success: boolean; error?: string }>
    /** 在向导中保存设置 */
    saveSettings(partial: Partial<Settings>): Promise<{ success: boolean; settings: Settings }>
    /** 标记初始化完成 */
    complete(): Promise<{ success: boolean }>
    /** 重置初始化状态（手动重新打开向导时调用） */
    reset(): Promise<{ success: boolean }>
    /** 通知主进程向渲染进程广播显示向导事件 */
    showGuide(): Promise<{ success: boolean }>
    /** 监听重建进度消息 */
    onProgress(cb: Listener<{ message: string }>): Unsubscribe
    /** 监听主进程发出的显示向导事件（手动触发时） */
    onShowGuide(cb: Listener<void>): Unsubscribe
  }

  /** 应用更新相关 API */
  update: {
    /** 检查更新（手动触发） */
    check(): Promise<UpdateCheckResult>
    /** 下载更新 */
    download(updateInfo: UpdateInfo): Promise<{ success: boolean; filePath?: string; error?: string }>
    /** 安装更新（启动 NSIS 安装程序并退出当前应用） */
    install(filePath: string): Promise<{ success: boolean }>
    /** 监听更新状态推送（检查结果/下载进度） */
    onStatus(cb: Listener<UpdateStatus>): Unsubscribe
  }

  /** 应用基础信息 */
  app: {
    /** 获取当前应用版本号 */
    getVersion(): Promise<string>
  }

  /** Widget 窗口请求（主窗口监听 widget 发来的打开购买/设置面板请求） */
  widget: {
    /** 监听 widget 请求打开购买积分面板 */
    onBuyCredits(cb: () => void): Unsubscribe
    /** 监听 widget 请求打开完整设置面板 */
    onOpenSettings(cb: () => void): Unsubscribe
  }
}

declare global {
  interface Window {
    api: XcomputerAPI
  }
}

export {}
