import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { aiService } from '../ai/ai-service'
import { sessionsStore } from '../store/sessions'
import { settingsStore } from '../store/settings'
import { paymentService } from '../payment/payment-service'
import { getOrchestrator, addRemoteListener, removeRemoteListener } from '../orchestrator/task-orchestrator'
import { getWidgetWindow, exitWidgetMiniMode } from '../windows/widget-window'
import { exitMainMiniMode } from '../windows/main-window-mini'
import { focusBrowserWindow } from '../utils/window-focus'
import { logger } from '../utils/logger'
import type { StepEvent, Settings, RelayQuota, PaidQuota, ConfirmRequest, AskRequest, Message, TaskStep, Session } from '@shared/types'

/** 简单对话消息（内存中维护，widget 生命周期内有效） */
interface SimpleMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Widget Agent 友好状态（不显示具体工具名） */
export interface FriendlyStatus {
  text: string
  icon?: 'thinking' | 'working' | 'confirm' | 'done' | 'error'
  detail?: string
}

// widget 内存对话历史（隐藏时清空）
let widgetMessages: SimpleMessage[] = []
let chatAbortController: AbortController | null = null

// 当前活跃任务状态（通过 remote listener 追踪，主窗口任务只读视图）
let activeTaskSessionId: string | null = null
let taskRunning = false

// Widget Agent 独立 session（跨 hide/show 持久化，不在 hide 时清空）
let widgetAgentSessionId: string | null = null
let widgetAgentRunning = false
// blur 锁定（有 pending confirm/ask 时禁止 blur 自动隐藏，防止用户错过确认）
let widgetBlurLocked = false

/** 清空 widget 对话状态（窗口隐藏时由 index.ts 调用）。
 *  注意：仅清空简单对话，不清空 agent session（agent 跨 hide/show 持久化）。 */
export function resetWidgetChat(): void {
  widgetMessages = []
  if (chatAbortController) {
    chatAbortController.abort()
    chatAbortController = null
  }
}

/** 查询 widget blur 是否被锁定（有 pending confirm/ask 时禁止自动隐藏） */
export function isWidgetBlurLocked(): boolean {
  return widgetBlurLocked
}

/** 查询 widget agent 是否正在运行（blur 时决定缩为 mini 还是直接隐藏） */
export function isWidgetAgentRunning(): boolean {
  return widgetAgentRunning
}

/** 获取 widget agent 的 session ID（主窗口 blur 过滤用：排除 widget session 后判断主窗口是否有 agent 运行） */
export function getWidgetAgentSessionId(): string | null {
  return widgetAgentSessionId
}

/** 设置 blur 锁定状态 */
function setBlurLock(locked: boolean): void {
  widgetBlurLocked = locked
  logger.info(`[Widget] blur 锁定状态: ${locked}`)
}

/** 确保 widget agent session 存在，不存在则创建。
 *  Agent session 跨 hide/show 持久化，不随窗口隐藏清空。 */
async function ensureWidgetAgentSession(): Promise<string> {
  if (widgetAgentSessionId) {
    // 验证 session 仍存在（防止 session 被用户在主窗口删除）
    const meta = sessionsStore.getMeta(widgetAgentSessionId)
    if (meta) return widgetAgentSessionId
  }
  const session = sessionsStore.create()
  await sessionsStore.rename(session.id, 'XC 桌面组件 · Agent')
  widgetAgentSessionId = session.id
  logger.info(`[Widget] 创建 agent session: ${widgetAgentSessionId}`)
  return widgetAgentSessionId
}

/** 工具名 → 友好状态映射（不显示具体工具名） */
function getToolFriendlyStatus(toolName?: string): FriendlyStatus {
  if (!toolName) return { text: '正在执行', icon: 'working' }
  const map: Record<string, FriendlyStatus> = {
    File: { text: '正在操作文件', icon: 'working' },
    Terminal: { text: '正在执行命令', icon: 'working' },
    PowerShell: { text: '正在操控你的电脑', icon: 'working' },
    Registry: { text: '正在修改注册表', icon: 'working' },
    Process: { text: '正在管理进程', icon: 'working' },
    TodoList: { text: '正在规划任务', icon: 'working' },
    Memory: { text: '正在更新记忆', icon: 'working' },
    Skill: { text: '正在调用技能', icon: 'working' },
    SystemInfo: { text: '正在查看系统信息', icon: 'working' },
    WebSearch: { text: '正在搜索网络', icon: 'working' },
    WebFetch: { text: '正在获取网页', icon: 'working' },
    WindowManager: { text: '正在操作窗口', icon: 'working' },
    SystemAudio: { text: '正在播放音频', icon: 'working' },
    ServiceManager: { text: '正在管理服务', icon: 'working' },
    NetworkTools: { text: '正在检测网络', icon: 'working' },
    ZipArchive: { text: '正在压缩文件', icon: 'working' },
    BatchFile: { text: '正在执行批处理', icon: 'working' },
    Snippet: { text: '正在运行代码片段', icon: 'working' },
    SystemOptimizer: { text: '正在优化系统', icon: 'working' },
    CodeAnalyzer: { text: '正在分析代码', icon: 'working' },
    PhoneControl: { text: '正在操控手机', icon: 'working' },
    Subagent: { text: '正在调度子代理', icon: 'working' }
  }
  return map[toolName] ?? { text: '正在执行', icon: 'working' }
}

/** 从 step 推导友好状态 */
function getFriendlyStatusFromStep(step: StepEvent): FriendlyStatus | null {
  if (step.type === 'thinking' || step.type === 'deep_thinking') {
    return { text: 'Xcomputer 正在思考', icon: 'thinking' }
  }
  if (step.type === 'tool_call' || step.type === 'tool_result') {
    return getToolFriendlyStatus(step.toolName)
  }
  if (step.type === 'error') {
    return { text: '任务出错', icon: 'error', detail: step.error }
  }
  if (step.type === 'final') {
    return null // final 后清理状态
  }
  return null
}

/** 从持久化的 steps 推导当前友好状态（窗口重开时调用） */
function deriveFriendlyStatus(steps: TaskStep[]): FriendlyStatus | null {
  if (steps.length === 0) return null
  // 从末尾找第一个未完成的 step（running/pending）
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]
    if (s.status === 'running' || s.status === 'pending') {
      // 构造 StepEvent-like 推导友好状态
      return getFriendlyStatusFromStep({
        sessionId: s.sessionId,
        stepId: s.id,
        messageId: s.messageId,
        type: s.type,
        status: s.status,
        content: s.content,
        toolName: s.toolName,
        toolArgs: s.toolArgs,
        toolResult: s.toolResult,
        screenshotPath: s.screenshotPath,
        timestamp: s.startedAt,
        error: s.error
      })
    }
  }
  // 所有 step 都已完成，返回 null（不显示状态）
  return null
}

/** Widget 查询积分返回的聚合结构 */
interface WidgetQuotaPayload {
  relay: RelayQuota | null
  paid: PaidQuota | null
  isRelayMode: boolean
}

/**
 * 推送积分更新到 widget 窗口（由 chat.ipc 在 AI 请求完成后调用）。
 * 仅在 widget 窗口存在时推送，避免无意义 IPC 开销。
 */
export async function pushQuotaToWidget(): Promise<void> {
  const win = getWidgetWindow()
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return

  try {
    const isRelayMode = aiService.isRelayMode()
    // 限免模式才查询 relay 配额；非限免模式 relay 为 null
    const relay = isRelayMode ? await aiService.getRelayQuota() : null
    // 付费积分：优先用缓存（避免频繁网络请求），缓存为空时主动查询
    let paid = paymentService.getCachedPaidQuota()
    if (!paid) {
      paid = await paymentService.getPaidQuota()
    }
    const payload: WidgetQuotaPayload = { relay, paid, isRelayMode }
    win.webContents.send(IPC_CHANNELS.WIDGET_QUOTA_UPDATED, payload)
  } catch (err) {
    logger.warn('[Widget] 推送积分到 widget 失败:', err instanceof Error ? err.message : String(err))
  }
}

export function registerWidgetIpc(mainWindow: BrowserWindow): void {

  /** 安全发送 IPC 到 widget 窗口 */
  function sendToWidget(channel: string, ...args: unknown[]): void {
    const win = getWidgetWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }

  // 注册 remote listener：转发任务事件到 widget 窗口
  // 按 sessionId 路由：widget agent session 走 WIDGET_AGENT_*，主窗口 session 走 WIDGET_TASK_*
  const taskEventListener = (channel: string, data: unknown): void => {
    try {
      if (channel === IPC_CHANNELS.CHAT_STEP) {
        const step = data as StepEvent
        if (!step?.sessionId) return
        // 区分来源：widget agent session 走 WIDGET_AGENT_*，其他走 WIDGET_TASK_*
        if (step.sessionId === widgetAgentSessionId) {
          // 注意：不基于 step.status 更新 widgetAgentRunning
          // 因为单个 step 的 success/error 仅表示该步骤完成，agent 整体可能仍在运行
          // widgetAgentRunning 仅在 CHAT_DONE/CHAT_ERROR 时设为 false，在 WIDGET_AGENT_SEND 时设为 true
          sendToWidget(IPC_CHANNELS.WIDGET_AGENT_STEP, step)
        } else {
          activeTaskSessionId = step.sessionId
          taskRunning = true
          sendToWidget(IPC_CHANNELS.WIDGET_TASK_STEP, data)
        }
      } else if (channel === IPC_CHANNELS.CHAT_MESSAGE) {
        const msg = data as Message
        // widget agent session 的消息转发到 WIDGET_AGENT_MESSAGE
        if (msg?.sessionId === widgetAgentSessionId) {
          sendToWidget(IPC_CHANNELS.WIDGET_AGENT_MESSAGE, msg)
        }
      } else if (channel === IPC_CHANNELS.CHAT_DONE) {
        const payload = data as { sessionId: string }
        if (payload?.sessionId === widgetAgentSessionId) {
          widgetAgentRunning = false
          sendToWidget(IPC_CHANNELS.WIDGET_AGENT_DONE, payload)
        } else {
          taskRunning = false
          sendToWidget(IPC_CHANNELS.WIDGET_TASK_DONE, data)
        }
      } else if (channel === IPC_CHANNELS.CHAT_ERROR) {
        const payload = data as { sessionId: string }
        if (payload?.sessionId === widgetAgentSessionId) {
          widgetAgentRunning = false
          sendToWidget(IPC_CHANNELS.WIDGET_AGENT_ERROR, payload)
        } else {
          taskRunning = false
          sendToWidget(IPC_CHANNELS.WIDGET_TASK_ERROR, data)
        }
      } else if (channel === IPC_CHANNELS.CHAT_CONFIRM_REQUEST) {
        const req = data as ConfirmRequest
        // source==='widget' 的确认请求转发到 widget，主窗口 ConfirmDialog 会过滤掉
        if (req?.source === 'widget') {
          setBlurLock(true) // 锁定 blur，防止窗口自动隐藏
          // 确保窗口可见且展开（agent 可能在 widget 隐藏/mini 时请求确认）
          const win = getWidgetWindow()
          if (win && !win.isDestroyed() && !win.isVisible()) {
            win.show()
          }
          exitWidgetMiniMode() // 若 widget 处于 mini 模式，展开为全尺寸以显示确认横幅
          sendToWidget(IPC_CHANNELS.WIDGET_CONFIRM_REQUEST, req)
        } else if (req?.source === 'main') {
          // 主窗口 agent 的确认请求：若主窗口处于 mini 模式，展开以显示 ConfirmDialog
          exitMainMiniMode()
        }
      } else if (channel === IPC_CHANNELS.CHAT_ASK_REQUEST) {
        const req = data as AskRequest
        if (req?.source === 'widget') {
          setBlurLock(true)
          // 确保窗口可见且展开（agent 可能在 widget 隐藏/mini 时提问）
          const win = getWidgetWindow()
          if (win && !win.isDestroyed() && !win.isVisible()) {
            win.show()
          }
          exitWidgetMiniMode() // 若 widget 处于 mini 模式，展开为全尺寸以显示提问
          sendToWidget(IPC_CHANNELS.WIDGET_ASK_REQUEST, req)
        } else if (req?.source === 'main') {
          // 主窗口 agent 的提问请求：若主窗口处于 mini 模式，展开以显示 AskDialog
          exitMainMiniMode()
        }
      } else if (
        channel === IPC_CHANNELS.CHAT_CONFIRM_RESOLVED ||
        channel === IPC_CHANNELS.CHAT_ASK_RESOLVED
      ) {
        // 解除 blur 锁定
        setBlurLock(false)
        // 同时转发到 widget，让 ConfirmBanner 自动关闭
        sendToWidget(channel, data)
      }
    } catch (err) {
      logger.error('[Widget IPC] task event listener error:', err)
    }
  }
  addRemoteListener(taskEventListener)

  // --- 对话相关 ---

  ipcMain.handle(IPC_CHANNELS.WIDGET_CHAT_SEND, async (_e, text: string) => {
    if (!text?.trim()) return
    // 如果上一次对话还在进行，先中断
    if (chatAbortController) {
      chatAbortController.abort()
    }

    widgetMessages.push({ role: 'user', content: text })
    chatAbortController = new AbortController()

    try {
      // 构造 aiService.chat 需要的消息格式
      const chatMessages = widgetMessages.map((m) => ({
        role: m.role,
        content: m.content
      }))

      const response = await aiService.chat(
        chatMessages,
        (delta) => {
          sendToWidget(IPC_CHANNELS.WIDGET_CHAT_DELTA, delta)
        },
        chatAbortController.signal
      )

      widgetMessages.push({ role: 'assistant', content: response })
      sendToWidget(IPC_CHANNELS.WIDGET_CHAT_DONE, response)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      // 用户中断时不报错，静默处理
      if (chatAbortController?.signal.aborted) {
        // 保留已接收的部分作为 assistant 回复
        logger.info('[Widget] 对话被用户中断')
      } else {
        sendToWidget(IPC_CHANNELS.WIDGET_CHAT_ERROR, errorMsg)
      }
    } finally {
      chatAbortController = null
    }
  })

  ipcMain.handle(IPC_CHANNELS.WIDGET_CHAT_STOP, async () => {
    if (chatAbortController) {
      chatAbortController.abort()
    }
  })

  // --- 任务进度相关 ---

  ipcMain.handle(IPC_CHANNELS.WIDGET_GET_TASK_STATE, async () => {
    if (!activeTaskSessionId) {
      return { sessionId: null, steps: [], isRunning: false }
    }
    try {
      const steps = await sessionsStore.getSteps(activeTaskSessionId)
      return {
        sessionId: activeTaskSessionId,
        steps,
        isRunning: taskRunning
      }
    } catch (err) {
      logger.error('[Widget] getTaskState 失败:', err)
      return { sessionId: activeTaskSessionId, steps: [], isRunning: taskRunning }
    }
  })

  ipcMain.handle(IPC_CHANNELS.WIDGET_STOP_TASK, async () => {
    if (activeTaskSessionId) {
      const orchestrator = getOrchestrator()
      if (orchestrator) {
        orchestrator.abort(activeTaskSessionId)
        logger.info(`[Widget] 已停止任务: ${activeTaskSessionId}`)
      }
    }
  })

  // --- Widget Agent 模式（独立 session 的 agent 执行） ---

  // 发送 agent 指令（强制 task 模式，跳过意图分类）
  ipcMain.handle(IPC_CHANNELS.WIDGET_AGENT_SEND, async (_e, text: string) => {
    if (!text?.trim()) return
    const sessionId = await ensureWidgetAgentSession()
    const orchestrator = getOrchestrator()
    if (!orchestrator) throw new Error('Orchestrator 未初始化')
    // 异步执行，不阻塞 IPC 返回（事件流通过 WIDGET_AGENT_* 推送）
    // 立即标记 agent 为运行中，确保 blur 时能正确进入 mini 模式（而非直接隐藏）
    widgetAgentRunning = true
    void orchestrator
      .handleUserMessage(sessionId, text, { forceTask: true, source: 'widget' })
      .catch((err) => {
        // orchestrator 启动失败时清理状态，防止 widgetAgentRunning 永远为 true
        // 导致 widget 永远进入 mini 模式而无法正常隐藏
        logger.error('[Widget] agent 启动失败:', err)
        widgetAgentRunning = false
        sendToWidget(IPC_CHANNELS.WIDGET_AGENT_ERROR, {
          sessionId,
          error: err instanceof Error ? err.message : String(err)
        })
      })
  })

  // 中断当前 agent 任务
  ipcMain.handle(IPC_CHANNELS.WIDGET_AGENT_STOP, async () => {
    if (widgetAgentSessionId) {
      getOrchestrator()?.abort(widgetAgentSessionId)
      widgetAgentRunning = false
      logger.info(`[Widget] 已停止 agent 任务: ${widgetAgentSessionId}`)
    }
  })

  // 新建 agent 会话（清空历史）
  ipcMain.handle(IPC_CHANNELS.WIDGET_AGENT_NEW_SESSION, async () => {
    // 如有正在运行的任务，先中断
    if (widgetAgentSessionId) {
      getOrchestrator()?.abort(widgetAgentSessionId)
    }
    widgetAgentSessionId = null
    widgetAgentRunning = false
    const sessionId = await ensureWidgetAgentSession()
    return sessionId
  })

  // 拉取 agent 状态（窗口重开时调用，恢复任务历史和当前状态）
  ipcMain.handle(IPC_CHANNELS.WIDGET_AGENT_GET_STATE, async () => {
    if (!widgetAgentSessionId) {
      return { sessionId: null, messages: [], currentStatus: null, isRunning: false }
    }
    try {
      const messages = await sessionsStore.getMessages(widgetAgentSessionId)
      const steps = await sessionsStore.getSteps(widgetAgentSessionId)
      const currentStatus = deriveFriendlyStatus(steps)
      return {
        sessionId: widgetAgentSessionId,
        messages,
        currentStatus,
        isRunning: widgetAgentRunning
      }
    } catch (err) {
      logger.error('[Widget] agentGetState 失败:', err)
      return { sessionId: widgetAgentSessionId, messages: [], currentStatus: null, isRunning: widgetAgentRunning }
    }
  })

  // --- 会话列表管理 ---

  // 查询所有会话 + 运行状态
  ipcMain.handle(IPC_CHANNELS.WIDGET_LIST_SESSIONS, async (): Promise<{
    sessions: Session[]
    widgetAgentSessionId: string | null
    runningSessionIds: string[]
  }> => {
    const sessions = sessionsStore.list()
    const runningSessionIds = getOrchestrator()?.getRunningSessionIds() ?? []
    return { sessions, widgetAgentSessionId, runningSessionIds }
  })

  // 删除指定会话
  ipcMain.handle(IPC_CHANNELS.WIDGET_DELETE_SESSION, async (_e, sessionId: string): Promise<void> => {
    // 如删除的是当前 widget agent 会话，先中断并清空
    if (widgetAgentSessionId === sessionId) {
      if (widgetAgentRunning) {
        getOrchestrator()?.abort(sessionId)
      }
      widgetAgentSessionId = null
      widgetAgentRunning = false
    }
    // 如删除的是主窗口活跃任务会话，也中断
    if (activeTaskSessionId === sessionId) {
      getOrchestrator()?.abort(sessionId)
      activeTaskSessionId = null
      taskRunning = false
    }
    sessionsStore.delete(sessionId)
    // 清理该会话相关的本地工具状态和子代理（与 session.ipc.ts SESSION_DELETE 一致）
    const { cleanupSessionLocalState } = await import('../tools/local-tools')
    const { subagentManager } = await import('../orchestrator/subagent-manager')
    cleanupSessionLocalState(sessionId)
    subagentManager.cleanupSession(sessionId)
    logger.info(`[Widget] 已删除会话: ${sessionId}`)
  })

  // 加载已有会话到 widget agent（切换当前 agent 会话）
  ipcMain.handle(IPC_CHANNELS.WIDGET_LOAD_SESSION, async (_e, sessionId: string): Promise<string> => {
    const meta = sessionsStore.getMeta(sessionId)
    if (!meta) throw new Error('会话不存在')
    // 切换到不同会话时，如当前 widget agent 任务正在运行，先中断
    if (widgetAgentSessionId && widgetAgentSessionId !== sessionId && widgetAgentRunning) {
      getOrchestrator()?.abort(widgetAgentSessionId)
    }
    widgetAgentSessionId = sessionId
    const runningIds = getOrchestrator()?.getRunningSessionIds() ?? []
    widgetAgentRunning = runningIds.includes(sessionId)
    // 通知 renderer 刷新 agent 状态（若 WidgetAgent 已挂载则触发 loadAgentState）
    sendToWidget(IPC_CHANNELS.WIDGET_AGENT_REFRESH)
    logger.info(`[Widget] 加载会话到 agent: ${sessionId}`)
    return sessionId
  })

  // Widget 高危确认响应
  ipcMain.handle(
    IPC_CHANNELS.WIDGET_CONFIRM_RESPONSE,
    (_e, requestId: string, allowed: boolean) => {
      getOrchestrator()?.resolveConfirm(requestId, allowed)
    }
  )

  // Widget AI 提问响应
  ipcMain.handle(
    IPC_CHANNELS.WIDGET_ASK_RESPONSE,
    (_e, requestId: string, answer: string, skipped: boolean) => {
      getOrchestrator()?.resolveAsk(requestId, answer, skipped)
    }
  )

  // --- 窗口控制 ---

  ipcMain.on(IPC_CHANNELS.WIDGET_HIDE, () => {
    const win = getWidgetWindow()
    if (win && !win.isDestroyed() && win.isVisible()) {
      win.hide()
    }
  })

  // 用户点击 mini 窗口 → 展开为全尺寸
  ipcMain.on(IPC_CHANNELS.WIDGET_EXPAND, () => {
    exitWidgetMiniMode()
  })

  // --- 积分查询 ---

  ipcMain.handle(IPC_CHANNELS.WIDGET_GET_QUOTA, async (): Promise<WidgetQuotaPayload> => {
    const isRelayMode = aiService.isRelayMode()
    const relay = isRelayMode ? await aiService.getRelayQuota() : null
    // 付费积分优先用缓存，缓存为空时主动查询
    let paid = paymentService.getCachedPaidQuota()
    if (!paid) {
      paid = await paymentService.getPaidQuota()
    }
    return { relay, paid, isRelayMode }
  })

  // --- 设置查询/更新 ---

  ipcMain.handle(IPC_CHANNELS.WIDGET_GET_SETTINGS, (): Settings => {
    return settingsStore.get()
  })

  ipcMain.handle(
    IPC_CHANNELS.WIDGET_UPDATE_SETTINGS,
    (_e, partial: Partial<Settings>): Settings => {
      const next = settingsStore.update(partial)
      // 通知主窗口设置已变更（主窗口的 SettingsModal 会刷新表单）
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, next)
      }
      return next
    }
  )

  // --- 打开主窗口面板 ---

  // 购买积分：显示主窗口并通知其打开购买面板
  ipcMain.on(IPC_CHANNELS.WIDGET_BUY_CREDITS, () => {
    focusBrowserWindow(mainWindow)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.WIDGET_BUY_CREDITS)
    }
    logger.info('[Widget] 已请求主窗口打开购买积分面板')
  })

  // 完整设置：显示主窗口并通知其打开设置面板
  ipcMain.on(IPC_CHANNELS.WIDGET_OPEN_SETTINGS, () => {
    focusBrowserWindow(mainWindow)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.WIDGET_OPEN_SETTINGS)
    }
    logger.info('[Widget] 已请求主窗口打开设置面板')
  })

  // 应用退出时清理 remote listener
  mainWindow.on('closed', () => {
    removeRemoteListener(taskEventListener)
  })
}
