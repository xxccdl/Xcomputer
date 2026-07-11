import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { aiService } from '../ai/ai-service'
import { getToolSchemas, getCodeToolSchemas, getPlanToolSchemas, getLocalToolSchemas, type FunctionSchema } from '../ai/function-schemas'
import { countTokens, countTokensBatch } from '../ai/token-counter'
import { SYSTEM_PROMPT_TASK, SYSTEM_PROMPT_CODE, SYSTEM_PROMPT_PLAN, SYSTEM_PROMPT_SPEC, SYSTEM_PROMPT_CHAT, SYSTEM_PROMPT_LOCAL_TASK, OPENX_COMPRESSION_PROMPT, OPENX_REMINDER_HEADER } from '../ai/prompts'
import { memoryStore } from '../store/memory'
import { skillsStore } from '../store/skills'
import { settingsStore } from '../store/settings'
import { memoryExtractor } from '../ai/memory-extractor'
import { executeToolCall, isHighRisk, toolResultToText } from '../mcp/tool-router'
import { todoListEvents } from '../tools/local-tools'
import { subagentManager, subagentEvents } from './subagent-manager'
import { sessionsStore } from '../store/sessions'
import { logger } from '../utils/logger'
import { focusBrowserWindow } from '../utils/window-focus'
import { notifyTaskComplete, notifyTaskError, notifyTaskAborted, showNotification } from '../utils/notifier'
import { floatingBallState } from '../utils/floating-ball-state'
import {
  IPC_CHANNELS,
  MAX_AGENT_LOOPS,
  MAX_SNAPSHOT_TOKENS,
  CONTEXT_COMPRESSION_THRESHOLD,
  CONTEXT_COMPRESSION_KEEP_MESSAGES,
  CHARS_PER_TOKEN_ESTIMATE
} from '@shared/constants'
import type { Message, MessageContent, StepEvent, ConfirmRequest, AskRequest, SubagentMode, ChatMode, ContextUsage } from '@shared/types'
import { extractTextFromContent } from '@shared/types'

/** 从多模态内容中计算文本长度（用于 token 估算） */
function extractTextLength(content: MessageContent): number {
  if (typeof content === 'string') return content.length
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .reduce((sum, part) => sum + part.text.length, 0)
}

interface OrchestratorMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: MessageContent
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  /** DeepSeek 思考模式：工具调用轮次的 reasoning_content 必须回传给 API */
  reasoning_content?: string
}

/** 当前运行中的任务（用于中断） */
const runningTasks = new Map<string, { aborted: boolean; abortController: AbortController }>()

/** 等待用户确认的请求（含超时定时器引用，便于 resolve 时清理） */
const pendingConfirms = new Map<string, { resolver: (allowed: boolean) => void; timer: NodeJS.Timeout }>()

/** 等待用户回答的提问请求（含超时定时器引用，便于 resolve 时清理） */
const pendingAsks = new Map<string, { resolver: (answer: string, skipped: boolean) => void; timer: NodeJS.Timeout }>()

/** 远程事件监听器（手机远程控制） */
type RemoteEventListener = (channel: string, data: unknown) => void
const remoteListeners = new Set<RemoteEventListener>()

export class TaskOrchestrator {
  /** 每个会话当前的工作模式（默认 task = 自动执行） */
  private sessionMode = new Map<string, ChatMode>()

  constructor(private mainWindow: BrowserWindow) {
    // 监听 TodoList 变更，推送到前端操作详情面板
    todoListEvents.on('change', (payload: { sessionId: string; items: unknown[] }) => {
      this.safeSend(IPC_CHANNELS.CHAT_TODO_UPDATE, payload)
    })

    // 监听子代理状态变更，推送到前端操作详情面板
    subagentEvents.on('update', (payload: { sessionId: string; subagent: unknown }) => {
      this.safeSend(IPC_CHANNELS.CHAT_SUBAGENT_UPDATE, payload)
    })
  }

  /** 获取会话当前模式（未设置时默认 task 自动执行） */
  getMode(sessionId: string): ChatMode {
    return this.sessionMode.get(sessionId) ?? 'task'
  }

  /** 设置会话工作模式，并通知前端更新 UI */
  setMode(sessionId: string, mode: ChatMode): void {
    this.sessionMode.set(sessionId, mode)
    this.safeSend(IPC_CHANNELS.CHAT_MODE_CHANGED, { sessionId, mode })
    logger.info(`[Orchestrator] 会话 ${sessionId} 模式切换为 ${mode}`)
  }

  /**
   * 安全地向渲染进程发送消息：检查窗口是否已销毁。
   * 防止任务执行过程中窗口被关闭导致 webContents.send 抛错。
   * 同时转发到远程监听器（手机远程控制）。
   */
  private safeSend(channel: string, data: unknown): void {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data)
      }
    } catch (err) {
      logger.error(`[Orchestrator] safeSend(${channel}) failed:`, err)
    }
    for (const listener of remoteListeners) {
      try {
        listener(channel, data)
      } catch (err) {
        logger.error('[Orchestrator] remote listener error:', err)
      }
    }
  }

  private formatFriendlyError(raw: string): string {
    const lower = raw.toLowerCase()
    if (lower.includes('429') || lower.includes('quota') || lower.includes('额度') || lower.includes('限免')) {
      if (lower.includes('额度') || lower.includes('用完') || lower.includes('limit')) {
        return `⚠️ **今日限免额度已用完**\n\n今日 50 次免费额度已全部使用，请明天再来，或在「设置 → AI 模型配置」中填写自己的 DeepSeek API Key 以解除限制。`
      }
      return `⚠️ **请求过于频繁**，请稍后再试。`
    }
    if (lower.includes('401') || lower.includes('invalid api key') || lower.includes('authentication') || lower.includes('unauthorized')) {
      return `🔑 **API Key 无效或未填写**\n\n请前往「设置 → AI 模型配置」检查你的 API Key 是否正确。`
    }
    if (lower.includes('413') || lower.includes('too long') || lower.includes('context length') || lower.includes('maximum context')) {
      return `📏 **对话内容过长**\n\n当前对话已超出模型上下文限制，请开启新会话重试。`
    }
    if (lower.includes('timeout') || lower.includes('abort') || lower.includes('socket') || lower.includes('network') || lower.includes('fetch failed') || lower.includes('econnrefused')) {
      return `🌐 **网络连接失败**\n\n无法连接到 AI 服务，请检查网络连接后重试。\n\n错误详情：${raw.slice(0, 200)}`
    }
    if (lower.includes('模型') || lower.includes('model')) {
      return `🤖 **AI 服务错误**\n\n${raw}\n\n请检查设置中的模型配置是否正确。`
    }
    return `❌ **发生错误**\n\n${raw}`
  }

  /** 中断指定会话的任务 */
  abort(sessionId: string): void {
    const task = runningTasks.get(sessionId)
    if (task) {
      task.aborted = true
      // 中止正在进行的 API 流式调用，避免中断后继续消耗 token
      try {
        task.abortController.abort()
      } catch {
        // controller 可能已 abort，忽略
      }
    }
  }

  /** 用户确认响应 */
  resolveConfirm(requestId: string, allowed: boolean): void {
    const entry = pendingConfirms.get(requestId)
    if (entry) {
      clearTimeout(entry.timer)
      entry.resolver(allowed)
      pendingConfirms.delete(requestId)
    }
  }

  /** 用户回答提问 */
  resolveAsk(requestId: string, answer: string, skipped: boolean): void {
    const entry = pendingAsks.get(requestId)
    if (entry) {
      clearTimeout(entry.timer)
      entry.resolver(answer, skipped)
      pendingAsks.delete(requestId)
    }
  }

  /** 主入口：处理用户消息 */
  async handleUserMessage(sessionId: string, text: string): Promise<void> {
    // 如果该会话已有任务在运行，先中断它，避免并发覆盖导致旧任务无法被 abort
    const existingTask = runningTasks.get(sessionId)
    if (existingTask && !existingTask.aborted) {
      existingTask.aborted = true
      try {
        existingTask.abortController.abort()
      } catch {
        // 忽略
      }
      logger.info(`[Orchestrator] 中断会话 ${sessionId} 的旧任务，启动新任务`)
    }

    const abortController = new AbortController()
    const task = { aborted: false, abortController }
    runningTasks.set(sessionId, task)

    // 悬浮球：开始思考
    floatingBallState.setState('thinking', '正在理解你的请求', sessionId)

    try {
      // 保存用户消息
      const userMessage: Message = {
        id: randomUUID(),
        sessionId,
        role: 'user',
        content: text,
        createdAt: Date.now()
      }
      await sessionsStore.appendMessage(sessionId, userMessage)
      this.safeSend(IPC_CHANNELS.CHAT_MESSAGE, userMessage)

      // 模式切换指令检测：/plan /spec /auto（不发送给 AI，直接返回提示）
      const modeCommand = this.parseModeCommand(text)
      if (modeCommand) {
        this.setMode(sessionId, modeCommand)
        const modeLabel =
          modeCommand === 'plan' ? '计划模式' : modeCommand === 'spec' ? '规格模式' : '自动模式'
        const modeHint =
          modeCommand === 'plan'
            ? 'AI 将只做分析与规划，不执行任何修改操作。\n\n💡 使用建议：\n• 描述你要完成的任务，AI 会拆解为可执行步骤\n• 可用 TodoList 跟踪计划进度\n• 计划完成后回复「确认」切换到自动执行\n• 如需调整计划，直接告诉 AI 修改意见'
            : modeCommand === 'spec'
              ? 'AI 将先撰写规格说明文档供你审核。\n\n💡 使用建议：\n• 描述你要实现的功能，AI 会生成完整技术规格\n• 规格包含需求、方案、实现步骤、验收标准\n• 审核通过后回复「确认」开始按规格实现\n• 如需调整规格，直接告诉 AI 修改意见'
              : 'AI 将自主执行任务。'
        const modeMessage: Message = {
          id: randomUUID(),
          sessionId,
          role: 'assistant',
          content: `🔄 已切换到${modeLabel}\n\n${modeHint}`,
          createdAt: Date.now()
        }
        await sessionsStore.appendMessage(sessionId, modeMessage)
        this.safeSend(IPC_CHANNELS.CHAT_MESSAGE, modeMessage)
        floatingBallState.setState('idle', modeLabel, sessionId)
        return
      }

      // API Key 未填写时优雅提示，而不是让请求发出后收到晦涩的 API 错误
      const missingProviders = aiService.validateApiKeys()
      if (missingProviders.length > 0) {
        const providerList = missingProviders.join('、')
        const hintMessage: Message = {
          id: randomUUID(),
          sessionId,
          role: 'assistant',
          content:
            `⚠️ 尚未配置 ${providerList} 的 API Key，无法调用 AI。\n\n` +
            `请点击右上角 ⚙️ 设置按钮，在「AI 模型配置」中填写 ${providerList} 的 API Key 和 Base URL 后重试。`,
          createdAt: Date.now()
        }
        await sessionsStore.appendMessage(sessionId, hintMessage)
        this.safeSend(IPC_CHANNELS.CHAT_MESSAGE, hintMessage)
        floatingBallState.setState('idle', '未配置 API Key', sessionId)
        return
      }

      const currentMode = this.getMode(sessionId)
      let executeInstruction: string | undefined

      // 计划/规格模式下，用户回复确认关键词 → 切换回自动模式并执行
      if ((currentMode === 'plan' || currentMode === 'spec') && this.isConfirmKeyword(text)) {
        this.setMode(sessionId, 'task')
        executeInstruction = [
          '用户已确认上述计划/规格，请立即开始执行。',
          '',
          '执行要求：',
          '1. 严格按照计划/规格中列出的步骤顺序执行',
          '2. 如果已创建 TodoList，按 TodoList 项逐一完成并勾选已完成项',
          '3. 每完成一步，简要说明执行结果',
          '4. 如遇不可预见的问题（权限不足、文件不存在等），暂停并说明原因',
          '5. 全部完成后，总结实际执行的步骤与结果'
        ].join('\n')
        logger.info(`[Orchestrator] 用户确认计划/规格，会话 ${sessionId} 切换回 task 模式开始执行`)
      }

      // 意图分类
      // - 本地模型（4B Q4量化，4K上下文）现已支持 Agent 模式（<tool_call> 标签解析），
      //   走正常路由：plan/spec 强制 task、关键词强制 task；无关键词时默认 chat（跳过 AI
      //   意图分类，4B 模型 JSON 输出不可靠且增加一次推理延迟）
      let intentType: 'chat' | 'task'
      const isLocalModel = aiService.isLocalModelActive()
      if (currentMode === 'plan' || currentMode === 'spec') {
        intentType = 'task'
        logger.info(`Intent: task (forced by mode=${currentMode})`)
      } else if (this.detectTaskKeyword(text)) {
        intentType = 'task'
        logger.info('Intent: task (forced by keyword)')
      } else if (isLocalModel) {
        // 本地模型无关键词时默认对话，避免 4B 模型意图分类的不可靠 JSON
        intentType = 'chat'
        logger.info('Intent: chat (local model, no task keyword)')
      } else {
        const intent = await aiService.classifyIntent(text)
        intentType = intent.type
        logger.info(`Intent: ${intent.type} (confidence: ${intent.confidence})`)
      }

      if (intentType === 'chat') {
        await this.handleChat(sessionId, text, task)
      } else {
        await this.handleTask(sessionId, text, task, executeInstruction)
      }

      // 任务被用户中断时不发送完成通知（handleTask 已处理）
      if (task.aborted) {
        // 悬浮球回到 idle（handleTask 已设置，这里确保）
        floatingBallState.setState('idle', '已中断', sessionId)
      } else {
        // 任务完成通知 + 悬浮球显示成功
        floatingBallState.setState('success', '任务完成', sessionId)
        const sessionMeta = sessionsStore.getMeta(sessionId)
        // 会话标题已包含任务描述（首条消息前30字符），无需再传 text 避免重复
        notifyTaskComplete(sessionMeta?.title ?? 'Xcomputer', '')
      }
    } catch (err) {
      const rawErrorMsg = err instanceof Error ? err.message : String(err)
      logger.error('Orchestrator error:', rawErrorMsg)

      const friendlyMessage = this.formatFriendlyError(rawErrorMsg)

      const errorMessageId = randomUUID()
      const errorMessage: Message = {
        id: errorMessageId,
        sessionId,
        role: 'system',
        content: friendlyMessage,
        createdAt: Date.now()
      }
      await sessionsStore.appendMessage(sessionId, errorMessage).catch(() => {})
      this.safeSend(IPC_CHANNELS.CHAT_MESSAGE, errorMessage)

      this.safeSend(IPC_CHANNELS.CHAT_ERROR, {
        sessionId,
        error: rawErrorMsg
      })
      floatingBallState.setState('error', friendlyMessage.slice(0, 60), sessionId)
      const sessionMeta = sessionsStore.getMeta(sessionId)
      notifyTaskError(sessionMeta?.title ?? 'Xcomputer', friendlyMessage)
    } finally {
      runningTasks.delete(sessionId)
      this.safeSend(IPC_CHANNELS.CHAT_DONE, { sessionId })
      // 对话结束后推送一次最新的上下文使用率，便于右侧详情面板刷新
      void this.broadcastContextUsage(sessionId)
    }
  }

  /** 通过关键词判断是否为电脑操作任务 */
  private detectTaskKeyword(text: string): boolean {
    const lowered = text.toLowerCase()
    const taskKeywords = [
      '打开', '点击', '双击', '截图', '截屏', '查看', '看看', '关闭', '输入', '搜索',
      '启动', '运行', '刷新', '回车', 'enter', 'delete', '删除', '复制', '粘贴', '剪切',
      '移动', '新建', '创建', '重命名', '下载', '上传', '访问', '播放', '暂停', '最大化',
      '最小化', '关闭窗口', '切换', '任务栏', '桌面', '窗口', '浏览器', '记事本', 'edge',
      'chrome', 'word', 'excel', 'powerpoint', 'ppt', '文件', '文件夹', '系统', '屏幕',
      '电脑', '此电脑', '控制面板', '设置'
    ]
    return taskKeywords.some((kw) => lowered.includes(kw.toLowerCase()))
  }

  /** 解析模式切换指令（/plan /spec /auto），返回对应模式或 null */
  private parseModeCommand(text: string): ChatMode | null {
    const cmd = text.trim().toLowerCase()
    if (cmd === '/plan') return 'plan'
    if (cmd === '/spec') return 'spec'
    if (cmd === '/auto') return 'task'
    return null
  }

  /** 判断用户输入是否为「确认执行」关键词（用于计划/规格模式确认） */
  private isConfirmKeyword(text: string): boolean {
    const t = text.trim().toLowerCase()
    if (!t) return false
    const confirmKeywords = ['确认', '执行', '开始', '开始执行', '确认执行', 'go', 'yes', 'ok', '继续']
    return confirmKeywords.some((kw) => t === kw || t === `${kw}。` || t === `${kw}!`)
  }

  /** 纯对话分支 */
  private async handleChat(
    sessionId: string,
    text: string,
    task: { aborted: boolean; abortController: AbortController }
  ): Promise<void> {
    const assistantMessageId = randomUUID()
    let fullContent = ''

    // 加载历史消息，构建上下文（保留多轮对话记忆）
    const history = await sessionsStore.getMessages(sessionId)
    const contextMessages: OrchestratorMessage[] = history
      .filter((m) => m.id !== assistantMessageId && m.role !== 'system')
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }))

    // 推送空的 assistant 消息作为流式占位（前端 upsert 按 id 更新）
    const placeholder: Message = {
      id: assistantMessageId,
      sessionId,
      role: 'assistant',
      content: '',
      createdAt: Date.now()
    }
    this.safeSend(IPC_CHANNELS.CHAT_MESSAGE, placeholder)

    // 节流：避免每个 delta 都推送 IPC
    let lastSend = 0
    const flush = (force = false): void => {
      const now = Date.now()
      if (force || now - lastSend > 30) {
        lastSend = now
        this.safeSend(IPC_CHANNELS.CHAT_MESSAGE, {
          ...placeholder,
          content: fullContent
        })
      }
    }

    // 上下文压缩（长对话时防止超出 token 上限）
    const compressedMessages = await this.compressContextIfNeeded(
      contextMessages,
      aiService.getModelMaxContextTokens(aiService.fastModel)
    )

    const reply = await aiService.chat(compressedMessages, (delta) => {
      if (task.aborted) return
      fullContent += delta
      flush()
    }, task.abortController.signal, (info) => {
      this.safeSend(IPC_CHANNELS.CHAT_QUEUE_UPDATE, {
        sessionId,
        position: info.position,
        estimatedWaitMs: info.estimatedWaitMs,
        queueId: info.queueId,
        skipAvailable: info.skipAvailable
      })
    }, sessionId)
    flush(true)

    // 中断时也要持久化已生成的部分内容，避免前端显示了但后端没存
    if (task.aborted) {
      const partialContent = fullContent || reply || '（已中断）'
      const abortedMessage: Message = {
        id: assistantMessageId,
        sessionId,
        role: 'assistant',
        content: partialContent,
        createdAt: Date.now()
      }
      await sessionsStore.appendMessage(sessionId, abortedMessage)
      this.safeSend(IPC_CHANNELS.CHAT_MESSAGE, abortedMessage)
      // 中断时也提取记忆（用户可能在闲聊中透露了偏好）
      if (partialContent && partialContent !== '（已中断）') {
        this.extractMemoriesAsync(sessionId, text, partialContent).catch((err) =>
          logger.error('[Orchestrator] chat 中断记忆提取失败:', err)
        )
      }
      return
    }

    // 保存 assistant 消息
    const assistantMessage: Message = {
      id: assistantMessageId,
      sessionId,
      role: 'assistant',
      content: reply,
      createdAt: Date.now()
    }
    await sessionsStore.appendMessage(sessionId, assistantMessage)
    this.safeSend(IPC_CHANNELS.CHAT_MESSAGE, assistantMessage)

    // chat 分支也提取记忆（闲聊中的偏好、习惯、事实等同样有价值）
    if (reply) {
      this.extractMemoriesAsync(sessionId, text, reply).catch((err) =>
        logger.error('[Orchestrator] chat 记忆提取失败:', err)
      )
    }
  }

  /** 任务分支（Agent 循环） */
  private async handleTask(
    sessionId: string,
    text: string,
    task: { aborted: boolean; abortController: AbortController },
    executeInstruction?: string
  ): Promise<void> {
    const assistantMessageId = randomUUID()
    const stepIds: string[] = []

    // 根据当前模式选择工具集与系统提示词
    const mode = this.getMode(sessionId)
    const isLocalModelTask = aiService.isLocalModelActive()
    let tools: FunctionSchema[]
    let systemPrompt: 'task' | 'code' | 'plan' | 'spec'
    if (isLocalModelTask) {
      // 本地模型：统一使用精简工具集（6 工具）+ task 提示词
      // buildSystemPrompt 会将 task 映射为 SYSTEM_PROMPT_LOCAL_TASK（含 <tool_call> 格式说明）
      // plan/spec/code 模式的长提示词对 4B 模型过载，统一降级为本地 task 提示词
      tools = await getLocalToolSchemas()
      systemPrompt = 'task'
    } else if (mode === 'plan') {
      tools = await getPlanToolSchemas()
      systemPrompt = 'plan'
    } else if (mode === 'spec') {
      tools = await getPlanToolSchemas()
      systemPrompt = 'spec'
    } else if (mode === 'code') {
      tools = await getCodeToolSchemas()
      systemPrompt = 'code'
    } else {
      tools = await getToolSchemas()
      systemPrompt = 'task'
    }
    logger.info(`Loaded ${tools.length} tool schemas (mode=${mode}, local=${isLocalModelTask})`)

    // 加载历史消息，构建上下文（保留多轮对话记忆）
    const history = await sessionsStore.getMessages(sessionId)
    const messages: OrchestratorMessage[] = history
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content
      }))
    // 追加当前用户消息（handleUserMessage 已保存到 store，所以 history 已包含）
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: text })
    }
    // 计划/规格确认后追加执行指令，引导 AI 立即按计划/规格开始执行
    if (executeInstruction) {
      messages.push({ role: 'user', content: executeInstruction })
    }

    let loopCount = 0
    let finalContent = ''
    let stoppedReason: 'completed' | 'aborted' | 'maxLoops' | null = null

    while (loopCount < MAX_AGENT_LOOPS) {
      if (task.aborted) {
        stoppedReason = 'aborted'
        break
      }

      loopCount++

      // 悬浮球：思考中
      floatingBallState.setState('thinking', `第 ${loopCount} 轮思考`, sessionId)

      // 深度思考步骤（独立 stepId）
      const deepThinkingStepId = randomUUID()
      let deepThinkingContent = ''

      // 本轮思考用固定 stepId，累积 content（避免每个 delta 一个碎片步骤）
      const thinkingStepId = randomUUID()
      let thinkingContent = ''

      // 预推送的工具步骤：流式中检测到工具名时立即推送，key 为 tool_call index
      // 流式完成后按数组索引复用对应 stepId，避免重复推送
      const preemptiveStepIds = new Map<number, string>()

      // 上下文压缩（Agent 循环中消息可能快速增长）
      // 压缩结果回写 messages，避免每轮重复压缩
      const compressedMessages = await this.compressContextIfNeeded(
        messages,
        aiService.getModelMaxContextTokens(aiService.proModel)
      )
      if (compressedMessages !== messages) {
        messages.length = 0
        messages.push(...compressedMessages)
      }

      // 调用 AI 模型（深度思考模式下使用 reasoner 模型）
      const result = await aiService.chatWithTools(compressedMessages, tools, {
        onReasoning: (delta) => {
          if (!delta.trim()) return
          deepThinkingContent += delta
          this.sendStep(sessionId, assistantMessageId, {
            type: 'deep_thinking',
            status: 'running',
            content: deepThinkingContent,
            stepId: deepThinkingStepId
          })
        },
        onDelta: (delta) => {
          if (!delta.trim()) return
          thinkingContent += delta
          this.sendStep(sessionId, assistantMessageId, {
            type: 'thinking',
            status: 'running',
            content: thinkingContent,
            stepId: thinkingStepId
          })
        },
        // 流式中首次检测到工具名时立即推送 "running" 步骤（参数还在生成中）
        onToolCallStart: (toolName, index) => {
          const stepId = randomUUID()
          preemptiveStepIds.set(index, stepId)
          stepIds.push(stepId)
          floatingBallState.setState('working', `调用 ${toolName}`, sessionId)
          this.sendStep(sessionId, assistantMessageId, {
            type: 'tool_call',
            status: 'running',
            content: `调用 ${toolName}`,
            toolName,
            toolArgs: { _pending: '参数生成中...' },
            stepId
          })
        },
        signal: task.abortController.signal,
        systemPrompt,
        sessionId,
        onQueueUpdate: (info) => {
          this.safeSend(IPC_CHANNELS.CHAT_QUEUE_UPDATE, {
            sessionId,
            position: info.position,
            estimatedWaitMs: info.estimatedWaitMs,
            queueId: info.queueId,
            skipAvailable: info.skipAvailable
          })
        }
      })

      // 深度思考结束，标记为完成
      if (deepThinkingContent) {
        this.sendStep(sessionId, assistantMessageId, {
          type: 'deep_thinking',
          status: 'success',
          content: deepThinkingContent,
          stepId: deepThinkingStepId
        })
      }

      // 思考结束，标记为完成，避免一直转圈
      if (thinkingContent) {
        this.sendStep(sessionId, assistantMessageId, {
          type: 'thinking',
          status: 'success',
          content: thinkingContent,
          stepId: thinkingStepId
        })
      }

      // 用户中断了流式输出
      if (task.aborted) {
        stoppedReason = 'aborted'
        break
      }

      // 将 assistant 回复加入历史
      const assistantMsg: OrchestratorMessage = {
        role: 'assistant',
        content: result.content || ''
      }
      if (result.toolCalls && result.toolCalls.length > 0) {
        assistantMsg.tool_calls = result.toolCalls
        // DeepSeek 思考模式：有工具调用时必须回传 reasoning_content，否则 API 返回 400
        if (result.reasoning) {
          assistantMsg.reasoning_content = result.reasoning
        }
      }
      messages.push(assistantMsg)

      // 无工具调用 → 最终回复，任务完成
      if (!result.toolCalls || result.toolCalls.length === 0) {
        finalContent = result.content
        stoppedReason = 'completed'
        break
      }

      // 处理每个工具调用
      for (let i = 0; i < result.toolCalls.length; i++) {
        const tc = result.toolCalls[i]
        if (task.aborted) {
          stoppedReason = 'aborted'
          break
        }

        // 复用预推送的 stepId（流式中已创建），避免重复推送
        const stepId = preemptiveStepIds.get(i) ?? randomUUID()
        if (!preemptiveStepIds.has(i)) {
          stepIds.push(stepId)
        }

        let toolArgs: Record<string, unknown> = {}
        try {
          toolArgs = JSON.parse(tc.function.arguments || '{}')
        } catch {
          toolArgs = { _raw: tc.function.arguments }
        }

        // 悬浮球：执行工具中
        floatingBallState.setState('working', `调用 ${tc.function.name}`, sessionId)

        // 推送 tool_call 步骤（若已预推送则更新参数，否则新建）
        this.sendStep(sessionId, assistantMessageId, {
          type: 'tool_call',
          status: 'running',
          content: `调用 ${tc.function.name}`,
          toolName: tc.function.name,
          toolArgs,
          stepId
        })

        // 高危确认
        if (isHighRisk(tc.function.name, toolArgs)) {
          const allowed = await this.requestConfirm(sessionId, tc.function.name, toolArgs)
          if (!allowed) {
            this.sendStep(sessionId, assistantMessageId, {
              type: 'error',
              status: 'error',
              content: `用户拒绝了 ${tc.function.name} 调用`,
              toolName: tc.function.name,
              toolArgs,
              error: '用户拒绝执行',
              stepId
            })
            // 将拒绝结果反馈给 AI
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: '用户拒绝执行此操作。请改用其他方式或告知用户无法完成。'
            })
            continue
          }
        }

        // AskUser 工具：向用户提问并等待回答（不走 executeToolCall）
        if (tc.function.name === 'AskUser') {
          const question = String(toolArgs.question ?? '')
          const options = Array.isArray(toolArgs.options)
            ? toolArgs.options.map((o) => String(o))
            : undefined
          const placeholder = toolArgs.placeholder ? String(toolArgs.placeholder) : undefined

          const askResult = await this.requestAsk(sessionId, question, options, placeholder)

          this.sendStep(sessionId, assistantMessageId, {
            type: 'tool_result',
            status: 'success',
            content: askResult.skipped
              ? '用户跳过了问题'
              : `用户回答: ${askResult.answer.slice(0, 200)}`,
            toolName: tc.function.name,
            toolArgs,
            toolResult: { question, answer: askResult.answer, skipped: askResult.skipped },
            stepId
          })

          // 将用户回答作为工具结果反馈给 AI
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: askResult.skipped
              ? '用户跳过了此问题，未提供回答。请根据已有信息继续，或用合理的默认值。'
              : `用户回答: ${askResult.answer}`
          })
          continue
        }

        // Subagent 工具：创建/管理子代理（不走 executeToolCall，直接调用 subagentManager）
        if (tc.function.name === 'Subagent') {
          await this.handleSubagentTool(
            sessionId,
            assistantMessageId,
            stepId,
            toolArgs,
            tc.id,
            messages
          )
          continue
        }

        // 执行工具
        const toolResult = await executeToolCall(tc.function.name, toolArgs, sessionId)
        const resultText = this.truncate(toolResultToText(toolResult.result), MAX_SNAPSHOT_TOKENS * 4)

        this.sendStep(sessionId, assistantMessageId, {
          type: 'tool_result',
          status: toolResult.error ? 'error' : 'success',
          content: toolResult.error ?? `${tc.function.name} 完成`,
          toolName: tc.function.name,
          toolArgs,
          toolResult: toolResult.result,
          screenshotPath: toolResult.screenshotPath,
          error: toolResult.error,
          stepId
        })

        // 将工具结果加入历史
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: resultText
        })
      }

      // for 循环里被中断后退出 while
      if (stoppedReason === 'aborted') break
    }

    if (!stoppedReason && loopCount >= MAX_AGENT_LOOPS) {
      stoppedReason = 'maxLoops'
      finalContent = `任务执行已达最大循环次数（${MAX_AGENT_LOOPS}），自动停止。`
    }

    // 中断时给出最终说明
    if (stoppedReason === 'aborted') {
      finalContent = finalContent || '任务已中断。'
      // 通知：任务已中断（悬浮球状态由 handleUserMessage 统一处理）
      const sessionMeta = sessionsStore.getMeta(sessionId)
      notifyTaskAborted(sessionMeta?.title ?? 'Xcomputer')
    }

    // 保存 assistant 消息（含步骤关联）
    const assistantMessage: Message = {
      id: assistantMessageId,
      sessionId,
      role: 'assistant',
      content: finalContent || '任务完成',
      createdAt: Date.now(),
      stepIds
    }
    await sessionsStore.appendMessage(sessionId, assistantMessage)
    this.safeSend(IPC_CHANNELS.CHAT_MESSAGE, assistantMessage)

    // 结束步骤：根据停止原因显示不同状态
    this.sendStep(sessionId, assistantMessageId, {
      type: 'final',
      status: stoppedReason === 'aborted' ? 'error' : 'success',
      content:
        stoppedReason === 'aborted'
          ? '已中断'
          : stoppedReason === 'maxLoops'
            ? `已达最大循环次数（${MAX_AGENT_LOOPS}）`
            : finalContent || '任务完成'
    })

    // 任务完成后异步提取记忆（不阻塞用户，失败不影响主流程）
    // 覆盖所有结束场景：completed/aborted/maxLoops，只要有内容就提取
    if (finalContent && finalContent !== '（已中断）') {
      this.extractMemoriesAsync(sessionId, text, finalContent).catch((err) =>
        logger.error('[Orchestrator] 记忆提取失败:', err)
      )
    }
  }

  /** 异步从本次对话中提取记忆 */
  private async extractMemoriesAsync(
    sessionId: string,
    userText: string,
    assistantText: string
  ): Promise<void> {
    try {
      await memoryExtractor.extractFromConversation(
        [
          { role: 'user', content: userText },
          { role: 'assistant', content: assistantText }
        ],
        sessionId
      )
      // 通知前端记忆已更新
      this.safeSend(IPC_CHANNELS.MEMORY_CHANGED, { updated: true })
    } catch (err) {
      logger.error('[Orchestrator] extractMemoriesAsync error:', err)
    }
  }

  /** 请求用户确认高危操作 */
  private requestConfirm(
    sessionId: string,
    toolName: string,
    toolArgs: Record<string, unknown>
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const requestId = randomUUID()
      // 60 秒超时自动拒绝
      const timer = setTimeout(() => {
        if (pendingConfirms.has(requestId)) {
          pendingConfirms.delete(requestId)
          resolve(false)
        }
      }, 60000)
      pendingConfirms.set(requestId, { resolver: resolve, timer })

      const req: ConfirmRequest = {
        requestId,
        sessionId,
        toolName,
        toolArgs,
        reason: `${toolName} 属于高危操作，需要您确认`
      }
      this.safeSend(IPC_CHANNELS.CHAT_CONFIRM_REQUEST, req)

      // 发送 Windows 系统通知提醒用户有高危操作需要确认
      const argsPreview = this.formatToolArgsPreview(toolName, toolArgs)
      showNotification(
        '⚠️ 需要确认高危操作',
        `工具: ${toolName}\n参数: ${argsPreview}\n\n请在弹出的对话框中进行操作（60 秒内未响应将自动拒绝）。`,
        () => {
          // 点击通知时聚焦主窗口，让用户看到确认对话框
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            focusBrowserWindow(this.mainWindow)
          }
        }
      )

      // 超时定时器已在创建时设置（pendingConfirms 中存储 timer 引用）
    })
  }

  /** 格式化工具参数预览（截断过长内容） */
  private formatToolArgsPreview(toolName: string, args: Record<string, unknown>): string {
    try {
      const json = JSON.stringify(args, null, 2)
      if (json.length > 300) {
        return `\`\`\`json\n${json.slice(0, 300)}\n...(已截断)\n\`\`\``
      }
      return `\`\`\`json\n${json}\n\`\`\``
    } catch {
      return String(args)
    }
  }

  /** 向用户提问并等待回答 */
  private requestAsk(
    sessionId: string,
    question: string,
    options?: string[],
    placeholder?: string
  ): Promise<{ answer: string; skipped: boolean }> {
    return new Promise<{ answer: string; skipped: boolean }>((resolve) => {
      const requestId = randomUUID()
      // 5 分钟超时自动跳过
      const timer = setTimeout(() => {
        if (pendingAsks.has(requestId)) {
          pendingAsks.delete(requestId)
          resolve({ answer: '', skipped: true })
        }
      }, 300000)
      pendingAsks.set(requestId, { resolver: (answer, skipped) => resolve({ answer, skipped }), timer })

      const req: AskRequest = {
        requestId,
        sessionId,
        question,
        options,
        placeholder
      }
      this.safeSend(IPC_CHANNELS.CHAT_ASK_REQUEST, req)

      // 超时定时器已在创建时设置（pendingAsks 中存储 timer 引用）
    })
  }

  /**
   * 处理 Subagent 工具调用：create/list/get/wait/cancel
   * 子代理拥有独立的 ReAct 循环，不通过 executeToolCall 执行。
   */
  private async handleSubagentTool(
    sessionId: string,
    assistantMessageId: string,
    stepId: string,
    toolArgs: Record<string, unknown>,
    toolCallId: string,
    messages: OrchestratorMessage[]
  ): Promise<void> {
    const action = String(toolArgs.action ?? '')

    switch (action) {
      case 'create': {
        const task = String(toolArgs.task ?? '')
        const mode = (toolArgs.mode === 'background' ? 'background' : 'foreground') as SubagentMode
        const maxRounds = toolArgs.maxRounds ? Number(toolArgs.maxRounds) : undefined
        const templateName = toolArgs.templateName ? String(toolArgs.templateName) : undefined

        if (!task) {
          this.sendStep(sessionId, assistantMessageId, {
            type: 'tool_result',
            status: 'error',
            content: 'create 操作需要提供 task 参数',
            toolName: 'Subagent',
            toolArgs,
            error: '缺少 task 参数',
            stepId
          })
          messages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            content: '错误: create 操作需要提供 task 参数'
          })
          return
        }

        this.sendStep(sessionId, assistantMessageId, {
          type: 'tool_call',
          status: 'running',
          content: templateName ? `创建子代理 (${mode}·模板:${templateName})` : `创建子代理 (${mode})`,
          toolName: 'Subagent',
          toolArgs,
          stepId
        })

        try {
          const { id, result } = await subagentManager.create({
            task,
            mode,
            parentSessionId: sessionId,
            maxRounds,
            templateName
          })

          const resultSummary = result
            ? `子代理 ${id.slice(0, 8)} 已完成（${mode}模式${templateName ? `·${templateName}` : ''}）\n结果: ${result.slice(0, 500)}${result.length > 500 ? '...' : ''}`
            : `子代理 ${id.slice(0, 8)} 已创建（${mode}模式${templateName ? `·${templateName}` : ''}，后台运行中）`

          this.sendStep(sessionId, assistantMessageId, {
            type: 'tool_result',
            status: 'success',
            content: resultSummary,
            toolName: 'Subagent',
            toolArgs,
            toolResult: { id, mode, templateName: templateName ?? null, result: result ?? null },
            stepId
          })

          messages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            content: result
              ? `子代理 ${id} 已完成（${mode}模式${templateName ? `·模板:${templateName}` : ''}）。结果:\n${result}`
              : `子代理 ${id} 已创建（${mode}模式${templateName ? `·模板:${templateName}` : ''}），正在后台运行。可使用 get 查询状态，wait 等待完成，cancel 取消。`
          })
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          this.sendStep(sessionId, assistantMessageId, {
            type: 'tool_result',
            status: 'error',
            content: `子代理执行失败: ${errorMsg}`,
            toolName: 'Subagent',
            toolArgs,
            error: errorMsg,
            stepId
          })
          messages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            content: `子代理执行失败: ${errorMsg}`
          })
        }
        return
      }

      case 'list': {
        const list = subagentManager.list(sessionId)
        const text =
          list.length === 0
            ? '当前会话无子代理'
            : `当前会话子代理 (${list.length}):\n` +
              list
                .map(
                  (s) =>
                    `  ${s.id.slice(0, 8)} [${s.status}] (${s.mode}) ` +
                    `轮次 ${s.rounds}/${s.maxRounds} | ${s.task.slice(0, 60)}`
                )
                .join('\n')

        this.sendStep(sessionId, assistantMessageId, {
          type: 'tool_result',
          status: 'success',
          content: text,
          toolName: 'Subagent',
          toolArgs,
          toolResult: { subagents: list },
          stepId
        })
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: text })
        return
      }

      case 'get': {
        const id = String(toolArgs.id ?? '')
        if (!id) {
          this.sendStep(sessionId, assistantMessageId, {
            type: 'tool_result',
            status: 'error',
            content: 'get 操作需要提供 id 参数',
            toolName: 'Subagent',
            toolArgs,
            error: '缺少 id 参数',
            stepId
          })
          messages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            content: '错误: get 操作需要提供 id 参数'
          })
          return
        }

        const info = subagentManager.getStatus(id)
        if (!info) {
          this.sendStep(sessionId, assistantMessageId, {
            type: 'tool_result',
            status: 'error',
            content: `未找到子代理: ${id}`,
            toolName: 'Subagent',
            toolArgs,
            error: '子代理不存在',
            stepId
          })
          messages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            content: `未找到子代理: ${id}`
          })
          return
        }

        const text =
          `子代理 ${info.id.slice(0, 8)}\n` +
          `状态: ${info.status} | 模式: ${info.mode}\n` +
          `轮次: ${info.rounds}/${info.maxRounds}\n` +
          `任务: ${info.task}\n` +
          (info.result ? `结果: ${info.result.slice(0, 500)}` : '') +
          (info.error ? `错误: ${info.error}` : '')

        this.sendStep(sessionId, assistantMessageId, {
          type: 'tool_result',
          status: 'success',
          content: text,
          toolName: 'Subagent',
          toolArgs,
          toolResult: { subagent: info },
          stepId
        })
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: text })
        return
      }

      case 'wait': {
        const id = String(toolArgs.id ?? '')
        const timeoutMs = toolArgs.timeoutMs ? Number(toolArgs.timeoutMs) : 60000

        if (!id) {
          this.sendStep(sessionId, assistantMessageId, {
            type: 'tool_result',
            status: 'error',
            content: 'wait 操作需要提供 id 参数',
            toolName: 'Subagent',
            toolArgs,
            error: '缺少 id 参数',
            stepId
          })
          messages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            content: '错误: wait 操作需要提供 id 参数'
          })
          return
        }

        this.sendStep(sessionId, assistantMessageId, {
          type: 'tool_call',
          status: 'running',
          content: `等待子代理 ${id.slice(0, 8)} 完成...`,
          toolName: 'Subagent',
          toolArgs,
          stepId
        })

        const result = await subagentManager.wait(id, timeoutMs)
        const text =
          result === null
            ? `等待超时或子代理已失败/取消 (id=${id.slice(0, 8)})`
            : `子代理 ${id.slice(0, 8)} 已完成\n结果: ${result.slice(0, 500)}${result.length > 500 ? '...' : ''}`

        this.sendStep(sessionId, assistantMessageId, {
          type: 'tool_result',
          status: result ? 'success' : 'error',
          content: text,
          toolName: 'Subagent',
          toolArgs,
          toolResult: { id, result },
          stepId
        })
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: text })
        return
      }

      case 'cancel': {
        const id = String(toolArgs.id ?? '')
        if (!id) {
          this.sendStep(sessionId, assistantMessageId, {
            type: 'tool_result',
            status: 'error',
            content: 'cancel 操作需要提供 id 参数',
            toolName: 'Subagent',
            toolArgs,
            error: '缺少 id 参数',
            stepId
          })
          messages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            content: '错误: cancel 操作需要提供 id 参数'
          })
          return
        }

        const ok = subagentManager.cancel(id)
        const text = ok
          ? `已发送取消请求给子代理 ${id.slice(0, 8)}`
          : `取消失败：子代理不存在或已完成`

        this.sendStep(sessionId, assistantMessageId, {
          type: 'tool_result',
          status: ok ? 'success' : 'error',
          content: text,
          toolName: 'Subagent',
          toolArgs,
          toolResult: { id, cancelled: ok },
          stepId
        })
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: text })
        return
      }

      default: {
        const text = `未知的 Subagent action: ${action}`
        this.sendStep(sessionId, assistantMessageId, {
          type: 'tool_result',
          status: 'error',
          content: text,
          toolName: 'Subagent',
          toolArgs,
          error: text,
          stepId
        })
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: text })
      }
    }
  }

  /** 发送步骤事件 */
  private sendStep(
    sessionId: string,
    messageId: string,
    data: Partial<StepEvent> & { type: StepEvent['type']; status: StepEvent['status']; content: string }
  ): void {
    const event: StepEvent = {
      sessionId,
      stepId: data.stepId ?? randomUUID(),
      messageId,
      type: data.type,
      status: data.status,
      content: data.content,
      toolName: data.toolName,
      toolArgs: data.toolArgs,
      toolResult: data.toolResult,
      screenshotPath: data.screenshotPath,
      timestamp: Date.now(),
      error: data.error
    }
    this.safeSend(IPC_CHANNELS.CHAT_STEP, event)

    // 持久化步骤（异步，不阻塞主流程，但记录错误避免静默丢失）
    void sessionsStore.upsertStep(sessionId, {
      id: event.stepId,
      sessionId,
      messageId,
      type: event.type,
      status: event.status,
      content: event.content,
      toolName: event.toolName,
      toolArgs: event.toolArgs,
      toolResult: event.toolResult,
      screenshotPath: event.screenshotPath,
      startedAt: event.timestamp,
      finishedAt:
        event.type === 'tool_result' || event.type === 'error' || event.type === 'final'
          ? event.timestamp
          : undefined,
      error: event.error
    }).catch((err) => {
      logger.error(`[Orchestrator] upsertStep 持久化失败 (stepId=${event.stepId}):`, err)
    })
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text
    return text.slice(0, maxLen) + '\n...(已截断)'
  }

  /**
   * 估算某会话当前的上下文 token 使用情况（技能 / 文件 / 其他）。
   * 估算口径：
   *  - skills: 系统提示词（base prompt + 技能/记忆注入 + OpenX 指令）+ 工具 schema
   *  - files:  工具返回结果（从 TaskStep 的 tool_result 中提取，非持久化 Message）
   *  - other:  纯对话文本（user/assistant 消息）
   *
   * 使用 DeepSeek 官方 tokenizer（BPE）精确计数，失败时回退到 chars/3 估算。
   *
   * 注意：持久化的 Message 只含 user/assistant 的文本，不含 role:'tool' 消息和 tool_calls。
   * 工具结果存储在 TaskStep 中，需从 getSteps() 获取后单独统计。
   */
  async computeContextUsage(sessionId: string): Promise<ContextUsage> {
    const messages = await sessionsStore.getMessages(sessionId)
    const steps = await sessionsStore.getSteps(sessionId)
    // 上限基于实际使用模型：限免模式 500k，API Key 模式 1M（flash 与 pro 同上限）
    const maxTokens = aiService.getModelMaxContextTokens(aiService.proModel)

    // ===== 收集所有需要计数的文本 =====
    // 1. 纯对话文本（user/assistant 消息，每条独立计数后求和）
    const convTexts: string[] = []
    for (const m of messages) {
      convTexts.push(extractTextFromContent(m.content))
    }

    // 2. 工具返回结果（从 TaskStep 的 tool_result 提取）
    const toolResultTexts: string[] = []
    for (const step of steps) {
      if (step.type === 'tool_result' && step.toolResult) {
        try {
          const resultText = toolResultToText(step.toolResult as { content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> })
          toolResultTexts.push(resultText)
        } catch {
          // 兜底：JSON 序列化（非标准 McpToolResult 结构）
          toolResultTexts.push(JSON.stringify(step.toolResult))
        }
      }
    }

    // 3+4. 系统提示词 + 工具 schema 的 token 数
    // 优先使用任务执行时记录的缓存值（稳定——不因后续 query 变化而波动）
    const cachedStats = aiService.getContextStats(sessionId)
    let skillsTokens: number
    const isLocalModelCtx = aiService.isLocalModelActive()
    if (cachedStats) {
      skillsTokens = cachedStats.systemPromptTokens + cachedStats.toolsSchemaTokens
    } else if (isLocalModelCtx) {
      // 本地模型未执行过任务时回退估算：用 Agent 模式提示词（task 比 chat 长，取大值更安全）
      const spTokens = await countTokens(SYSTEM_PROMPT_LOCAL_TASK)
      skillsTokens = spTokens
    } else {
      // 回退：任务未执行过时，用动态检索估算（仅首次统计，后续以缓存值为准）
      const basePrompt = [
        SYSTEM_PROMPT_TASK, SYSTEM_PROMPT_CODE, SYSTEM_PROMPT_PLAN,
        SYSTEM_PROMPT_SPEC, SYSTEM_PROMPT_CHAT
      ].reduce((longest, cur) => (cur.length > longest.length ? cur : longest))
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
      const queryText = lastUserMsg ? extractTextFromContent(lastUserMsg.content) : ''
      const injectionParts: string[] = []
      const memories = await memoryStore.retrieveForContext(queryText)
      if (memories.length > 0) injectionParts.push(memoryStore.formatForInjection(memories))
      const skills = skillsStore.retrieveForContext(queryText)
      if (skills.length > 0) injectionParts.push(skillsStore.formatForInjection(skills))
      const openXActive = settingsStore.get().openXEnabled
      if (openXActive) injectionParts.push(OPENX_REMINDER_HEADER, OPENX_COMPRESSION_PROMPT)
      const systemPromptText = basePrompt + '\n\n' + injectionParts.join('\n\n')
      const toolsSchema = await getToolSchemas()
      const toolsSchemaText = JSON.stringify(toolsSchema)
      const [spTokens, tsTokens] = await Promise.all([
        countTokens(systemPromptText),
        countTokens(toolsSchemaText)
      ])
      skillsTokens = spTokens + tsTokens
    }

    // ===== 批量精确计数（DeepSeek 官方 BPE tokenizer）=====
    // 仅计数对话文本和工具结果（skills 已由缓存或上述计算得出）
    const allTexts = [...convTexts, ...toolResultTexts]
    const allCounts = await countTokensBatch(allTexts)
    const convCount = convTexts.length
    const toolResultCount = toolResultTexts.length
    // other = 对话文本 tokens 之和
    const otherTokens = allCounts.slice(0, convCount).reduce((s, n) => s + n, 0)
    // files = 工具结果 tokens 之和
    const filesTokens = allCounts.slice(convCount, convCount + toolResultCount).reduce((s, n) => s + n, 0)

    const totalTokens = skillsTokens + filesTokens + otherTokens
    const percent = Math.min(1, totalTokens / maxTokens)

    return {
      sessionId,
      totalTokens,
      maxTokens,
      percent,
      breakdown: {
        skills: skillsTokens,
        files: filesTokens,
        other: otherTokens
      },
      updatedAt: Date.now()
    }
  }

  /** 向渲染进程推送当前会话的上下文使用情况（同时持久化到 session 文件） */
  async broadcastContextUsage(sessionId: string): Promise<void> {
    try {
      const usage = await this.computeContextUsage(sessionId)
      this.safeSend(IPC_CHANNELS.CHAT_CONTEXT_USAGE, usage)
      // 持久化到 session 文件，切换会话后可直接读取
      void sessionsStore.saveContextUsage(sessionId, usage)
    } catch (err) {
      logger.warn('[Orchestrator] broadcastContextUsage 失败:', err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * 手动触发上下文压缩：保留最近 KEEP 条消息，把更早的消息用 AI 做详细总结，
   * 持久化替换为一条摘要 assistant 消息。完成后推送更新后的 usage 和消息同步事件。
   */
  async manualCompressContext(sessionId: string): Promise<{ success: boolean; summaryId?: string; error?: string; newMessageCount?: number; compressedCount?: number }> {
    try {
      const messages = await sessionsStore.getMessages(sessionId)
      const keepCount = CONTEXT_COMPRESSION_KEEP_MESSAGES
      if (messages.length <= keepCount + 1) {
        return { success: false, error: `当前仅 ${messages.length} 条消息，对话较短无需压缩` }
      }

      let splitIdx = messages.length - keepCount
      // 对齐到 user 消息边界，让 recent 段以 user 开头更友好
      while (splitIdx > 0 && messages[splitIdx].role !== 'user') {
        splitIdx--
      }
      // 若回退到 <2，说明 [0, splitIdx) 区间几乎没有可压缩的消息（全是 assistant），
      // 直接返回无需压缩，避免仅压缩 1 条消息的无意义操作
      if (splitIdx < 2) {
        return { success: false, error: '可压缩的历史消息过少，无需压缩' }
      }

      const older = messages.slice(0, splitIdx)
      const recent = messages.slice(splitIdx)

      logger.info(`[ContextCompress] 手动压缩：${older.length} 条 -> 详细摘要，保留最近 ${recent.length} 条`)

      const chatMessages = older.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: typeof m.content === 'string' ? m.content : extractTextFromContent(m.content)
      }))

      const summary = await aiService.compressHistoryDetailed(chatMessages)

      const summaryId = randomUUID()
      const summaryMessage: Message = {
        id: summaryId,
        sessionId,
        role: 'assistant',
        content: `【上下文压缩·详细摘要】\n\n${summary}\n\n> （已自动压缩此前 ${older.length} 条消息为上述详细摘要，后续对话可直接基于摘要延续，无需再读长历史）`,
        createdAt: Date.now()
      }

      const newMessages = await sessionsStore.replaceMessagesRange(sessionId, splitIdx, summaryMessage)

      this.safeSend(IPC_CHANNELS.CHAT_CONTEXT_COMPRESSED, {
        sessionId,
        summaryId,
        messageCount: newMessages.length,
        compressedCount: older.length
      })

      await this.broadcastContextUsage(sessionId)

      return { success: true, summaryId, newMessageCount: newMessages.length, compressedCount: older.length }
    } catch (err) {
      logger.error('[ContextCompress] 手动压缩失败:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 上下文压缩：当 token 数超过模型上下文上限的 90% 时，
   * 用轻量模型总结较早的消息，仅保留最近 N 条完整消息。
   *
   * 采用两级判断优化性能：
   *  1. 快速粗筛：用 chars/3 估算，若远低于阈值则直接放行（避免 tokenizer 调用）
   *  2. 精确复核：粗筛接近或超过阈值时，用 DeepSeek 官方 tokenizer 精确计数
   */
  private async compressContextIfNeeded(
    messages: OrchestratorMessage[],
    maxContextTokens: number
  ): Promise<OrchestratorMessage[]> {
    const threshold = Math.floor(maxContextTokens * CONTEXT_COMPRESSION_THRESHOLD)

    // 第一级：chars/3 粗筛（保守高估，宁可误触发精确复核）
    const totalChars = messages.reduce((sum, m) => sum + extractTextLength(m.content), 0)
    const roughEstimate = Math.ceil(totalChars / CHARS_PER_TOKEN_ESTIMATE)
    // 粗筛远低于阈值（留 20% 安全裕度）→ 直接放行，无需精确计数
    if (roughEstimate < threshold * 0.8) {
      return messages
    }

    // 第二级：DeepSeek 官方 tokenizer 精确计数
    const texts = messages.map((m) => extractTextFromContent(m.content))
    const counts = await countTokensBatch(texts)
    const estimatedTokens = counts.reduce((s, n) => s + n, 0)

    if (estimatedTokens <= threshold) {
      return messages
    }

    // 保留最近的 N 条消息不变
    const keepCount = CONTEXT_COMPRESSION_KEEP_MESSAGES
    if (messages.length <= keepCount + 1) {
      return messages
    }

    // 找到安全的截断点：recentMessages 的第一条不能是 tool 消息，
    // 也不能让 tool 消息对应的 assistant(tool_calls) 落在 olderMessages 中
    // 否则 OpenAI API 会报 "tool message must follow a tool call"
    let splitIdx = messages.length - keepCount
    // 回退，把 tool 消息及其对应的 assistant 一起保留（添加下界检查防止越界崩溃）
    while (splitIdx >= 0 && splitIdx < messages.length && messages[splitIdx].role === 'tool') {
      splitIdx--
    }
    // 安全兜底：若 splitIdx 退到负数，从 0 开始
    if (splitIdx < 0) splitIdx = 0
    // 同时确保 splitIdx 处不是 assistant(tool_calls)，否则其 tool 结果会被截断到 olderMessages
    // 向前调整：如果 splitIdx 处是带 tool_calls 的 assistant，需要把后续的 tool 消息也保留
    while (
      splitIdx > 0 &&
      messages[splitIdx - 1].role === 'assistant' &&
      messages[splitIdx - 1].tool_calls &&
      messages[splitIdx - 1].tool_calls!.length > 0
    ) {
      splitIdx--
    }

    const olderMessages = messages.slice(0, splitIdx)
    const recentMessages = messages.slice(splitIdx)

    logger.info(
      `[ContextCompress] 估算 ${estimatedTokens} tokens，超过阈值 ${threshold}，压缩前 ${olderMessages.length} 条，保留最近 ${recentMessages.length} 条`
    )

    const summary = await aiService.compressHistory(olderMessages)

    const compressed: OrchestratorMessage[] = [
      {
        role: 'assistant',
        content: `【历史摘要】${summary}`
      },
      ...recentMessages
    ]

    logger.info(
      `[ContextCompress] 完成：${messages.length} 条 -> ${compressed.length} 条（含摘要）`
    )
    return compressed
  }
}

/** 全局 orchestrator 实例（按窗口） */
let orchestrator: TaskOrchestrator | null = null

export function initOrchestrator(mainWindow: BrowserWindow): TaskOrchestrator {
  orchestrator = new TaskOrchestrator(mainWindow)
  return orchestrator
}

export function getOrchestrator(): TaskOrchestrator | null {
  return orchestrator
}

/** 注册远程事件监听器（手机远程控制） */
export function addRemoteListener(listener: RemoteEventListener): void {
  remoteListeners.add(listener)
}

/** 注销远程事件监听器 */
export function removeRemoteListener(listener: RemoteEventListener): void {
  remoteListeners.delete(listener)
}
