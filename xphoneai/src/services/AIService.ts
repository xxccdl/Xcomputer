import { getApiKey, getBaseUrl, getModelConfig, resolveModelName, shouldEnableThinking } from './SecureStorage'
import { ToolRegistry } from './ToolRegistry'
import { HIGH_RISK_ACTIONS, TODO_ACTIONS } from './ToolRegistry'

/** DeepSeek 消息（OpenAI 兼容格式） */
export interface DSMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  reasoning_content?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/** 工具执行步骤（推送到 UI） */
export interface ToolStep {
  action: string
  args: Record<string, unknown>
  result: string
  success: boolean
  /** 工具友好名称 */
  label: string
  /** 参数友好描述 */
  argsLabel: string
}

/** AI 服务回调 */
export interface AIServiceCallbacks {
  /** 工具执行步骤 */
  onStep?: (step: ToolStep) => void
  /** AI 思考中状态文本 */
  onThinking?: (text: string) => void
  /** 流式 token（最终回复的实时增量） */
  onToken?: (delta: string) => void
  /** 流式推理 token（DeepSeek 思考阶段的 reasoning_content 增量） */
  onReasoning?: (delta: string) => void
  /** 工具开始执行（执行前触发，用于 UI 即时反馈） */
  onToolStart?: (label: string, argsLabel: string) => void
  /** AI 规划任务清单 */
  onTodoPlan?: (tasks: string[]) => void
  /** AI 更新任务状态 */
  onTodoUpdate?: (id: number, status: 'in_progress' | 'done') => void
  /** 最终回复完成 */
  onDone?: (text: string) => void
  /** 错误 */
  onError?: (err: string) => void
  /** 高危操作确认，返回 true 表示用户允许 */
  onConfirm?: (action: string, args: Record<string, unknown>) => Promise<boolean>
}

const MODEL = 'deepseek-v4-pro'  // 仅作后备默认值，实际从存储读取
const MAX_LOOPS = 20
/** 上下文压缩阈值（字符数，约 50K tokens） */
const COMPRESS_THRESHOLD = 150000
/** 压缩后保留最近消息条数 */
const KEEP_RECENT = 8
/** 单轮最大输出 tokens */
const MAX_TOKENS = 8192

/** 系统提示词 */
function buildSystemPrompt(deviceInfo: { brand: string; model: string; osVersion: string }): string {
  return `你是 xphoneai，一个手机 AI 操控助手。你可以通过调用工具来操控用户的 Android 手机。

能力：
- 截屏、读取屏幕文字、点击、输入文本、滑动、按键
- 打开/关闭/列出 App、获取当前前台 App
- 获取位置、发送短信、发送通知、设置闹钟、振动
- 读写剪贴板、文件管理、获取电池和设备信息

行为准则：
1. 用中文回复
2. 执行操作前简要说明你要做什么（一句话）
3. 复杂任务（≥3步）执行前先用 plan_tasks 工具规划步骤，每开始一步用 update_task 标记 in_progress，完成后标记 done
4. 高危操作（发短信、关闭App、下载文件）会请求用户确认，被拒绝时停止该操作
5. 根据工具返回结果继续推理，直到完成任务
6. 任务完成后给出简洁总结
7. 截屏工具返回 screenText（屏幕文字）和 image 字段，优先分析 screenText 来理解屏幕内容
8. 若操作失败，说明原因并尝试替代方案或询问用户
9. 不要编造工具不存在的功能，仅使用提供的工具

当前设备：${deviceInfo.brand} ${deviceInfo.model} (Android ${deviceInfo.osVersion})
当前时间：${new Date().toLocaleString('zh-CN')}`
}

/** 工具友好名称映射 */
const TOOL_LABELS: Record<string, string> = {
  screenshot: '截屏',
  get_screen_text: '读取屏幕文字',
  get_ui_tree: '识别UI元素',
  tap: '点击屏幕',
  input_text: '输入文本',
  swipe: '滑动',
  press_key: '按键',
  open_app: '打开应用',
  list_apps: '列出应用',
  current_app: '当前应用',
  close_app: '关闭应用',
  get_location: '获取位置',
  send_sms: '发送短信',
  send_notification: '发送通知',
  set_alarm: '设置闹钟',
  vibrate: '振动',
  read_clipboard: '读取剪贴板',
  write_clipboard: '写入剪贴板',
  list_files: '列出文件',
  download_file: '下载文件',
  get_battery: '电池信息',
  get_device_info: '设备信息'
}

/** 生成工具参数友好描述 */
function describeArgs(action: string, args: Record<string, unknown>): string {
  try {
    switch (action) {
      case 'tap':
        return `坐标 (${args.x}, ${args.y})`
      case 'input_text':
        return `「${String(args.text).slice(0, 30)}」`
      case 'swipe':
        return `(${args.startX},${args.startY}) → (${args.endX},${args.endY})`
      case 'press_key':
        return String(args.key)
      case 'open_app':
      case 'close_app':
        return String(args.package)
      case 'send_sms':
        return `${args.number}: ${String(args.message).slice(0, 20)}`
      case 'send_notification':
        return String(args.title || args.message)
      case 'set_alarm':
        return String(args.time)
      case 'write_clipboard':
        return `「${String(args.text).slice(0, 30)}」`
      case 'download_file':
        return String(args.filename || args.url)
      case 'vibrate':
        return args.pattern ? String(args.pattern) : '默认'
      default:
        return Object.entries(args).map(([k, v]) => `${k}=${v}`).join(', ').slice(0, 50)
    }
  } catch {
    return ''
  }
}

/** 流式调用结果 */
interface StreamResult {
  content: string
  reasoning: string
  tool_calls?: DSMessage['tool_calls']
  finish_reason: string
}

/**
 * AI 服务：直连 DeepSeek API，流式输出 + ReAct 工具循环 + 上下文自动压缩
 */
export class AIService {
  private toolRegistry: ToolRegistry
  private deviceInfo: { brand: string; model: string; osVersion: string }
  /** 中止当前请求 */
  private abortXhr: XMLHttpRequest | null = null

  constructor(toolRegistry: ToolRegistry, deviceInfo: { brand: string; model: string; osVersion: string }) {
    this.toolRegistry = toolRegistry
    this.deviceInfo = deviceInfo
  }

  /** 中止当前进行中的请求 */
  abort(): void {
    if (this.abortXhr) {
      try { this.abortXhr.abort() } catch { /* ignore */ }
      this.abortXhr = null
    }
  }

  /** 发送用户消息，执行 ReAct 循环直到 AI 给出最终回复 */
  async chat(
    history: DSMessage[],
    userInput: string,
    callbacks: AIServiceCallbacks
  ): Promise<{ messages: DSMessage[]; reply: string }> {
    console.log('[AIService] chat 开始, history长度:', history.length, '输入:', userInput.slice(0, 50))
    const apiKey = await getApiKey()
    if (!apiKey) {
      const msg = '未配置 DeepSeek API Key，请在设置中填写'
      callbacks.onError?.(msg)
      return { messages: history, reply: '' }
    }
    const baseUrl = await getBaseUrl()
    console.log('[AIService] apiKey 已获取, baseUrl:', baseUrl)

    // 预处理历史消息：截断大内容（如旧截图 base64），避免请求体过大导致 API 挂起
    const sanitizedHistory = history.map((m) => {
      if (m.content && m.content.length > 8000) {
        // 尝试移除截图 base64
        let content = m.content
        if (content.includes('"image":"data:image')) {
          try {
            const parsed = JSON.parse(content)
            if (parsed.image) {
              parsed.image = `[截图已省略]`
              content = JSON.stringify(parsed)
            }
          } catch { /* ignore */ }
        }
        if (content.length > 8000) {
          content = content.slice(0, 8000) + '...(已截断)'
        }
        return { ...m, content }
      }
      return m
    })

    const messages: DSMessage[] = [
      { role: 'system', content: buildSystemPrompt(this.deviceInfo) },
      ...sanitizedHistory,
      { role: 'user', content: userInput }
    ]

    const tools = this.toolRegistry.getToolDefinitions()
    const newMessages: DSMessage[] = [...messages]
    let finalReply = ''

    // 全局超时保护：3 分钟无完成则强制中止（兜底，防止任何未知卡住点）
    let globalTimedOut = false
    const globalTimer = setTimeout(() => {
      globalTimedOut = true
      this.abort()
      console.error('[AIService] 全局超时(3分钟)，强制中止')
      callbacks.onError?.('任务超时(3分钟无响应)，已自动停止')
    }, 180000)

    for (let loop = 0; loop < MAX_LOOPS; loop++) {
      if (globalTimedOut) break
      await this.maybeCompress(newMessages, apiKey, baseUrl)
      if (globalTimedOut) break

      const apiStart = Date.now()
      callbacks.onThinking?.(loop === 0 ? '正在思考...' : `第${loop + 1}轮: 继续推理...`)
      console.log(`[AIService] 第${loop + 1}轮开始, newMessages长度: ${newMessages.length}`)

      let lastArgsUpdate = 0
      let result: StreamResult
      try {
        result = await this.callDeepSeekStream(
          newMessages, tools, apiKey, baseUrl,
          callbacks.onToken, callbacks.onReasoning,
          (name, argsDelta) => {
            // AI 正在生成工具调用参数，实时更新 UI 避免卡住
            const label = TOOL_LABELS[name] || name
            if (!argsDelta) {
              // 工具名开始生成，立即更新
              callbacks.onThinking?.(`正在准备调用: ${label}`)
            } else {
              // 参数生成中，节流 200ms 避免过于频繁
              const now = Date.now()
              if (now - lastArgsUpdate < 200) return
              lastArgsUpdate = now
              const preview = argsDelta.slice(-30)
              callbacks.onThinking?.(`生成参数: ${label} ${preview}`)
            }
          },
          callbacks.onThinking
        )
      } catch (err) {
        clearTimeout(globalTimer)
        if (err instanceof Error && err.message === 'aborted') {
          callbacks.onError?.('已停止')
          return { messages: history, reply: '' }
        }
        const errMsg = err instanceof Error ? err.message : String(err)
        callbacks.onError?.(`AI 调用失败: ${errMsg}`)
        return { messages: history, reply: '' }
      }

      const apiElapsed = ((Date.now() - apiStart) / 1000).toFixed(1)
      console.log(`[AIService] 第${loop + 1}轮 API 耗时 ${apiElapsed}s, tool_calls=${result.tool_calls?.length || 0}`)

      const assistantMsg: DSMessage = {
        role: 'assistant',
        content: result.content || '',
        reasoning_content: result.reasoning || undefined,
        tool_calls: result.tool_calls
      }
      newMessages.push(assistantMsg)

      // 无 tool_calls → 最终回复（已流式推送，这里收尾）
      if (!result.tool_calls || result.tool_calls.length === 0) {
        clearTimeout(globalTimer)
        finalReply = result.content || ''
        callbacks.onDone?.(finalReply)
        const added = newMessages.slice(messages.length)
        return { messages: this.stripSystem(added), reply: finalReply }
      }

      // 有 tool_calls → 逐个执行
      for (let call of result.tool_calls) {
        const action = call.function.name
        let args: Record<string, unknown> = {}
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
        } catch {
          args = {}
        }

        const label = TOOL_LABELS[action] || (action === 'plan_tasks' ? '规划任务' : action === 'update_task' ? '更新任务' : action)
        const argsLabel = describeArgs(action, args)

        // 工具执行前即时反馈，让出 UI 线程确保 "正在执行" 状态先渲染
        callbacks.onToolStart?.(label, argsLabel)
        await new Promise<void>((resolve) => setTimeout(resolve, 0))

        const toolStart = Date.now()
        console.log(`[AIService] 执行工具: ${action}`, args)

        let resultStr: string
        let success = true
        try {
          if (TODO_ACTIONS.has(action)) {
            // AI 内部任务跟踪工具，不走 CommandExecutor
            resultStr = await this.executeTodoAction(action, args, callbacks)
          } else if (HIGH_RISK_ACTIONS.has(action)) {
            const allowed = callbacks.onConfirm ? await callbacks.onConfirm(action, args) : true
            if (!allowed) {
              resultStr = '用户拒绝了此操作'
            } else {
              resultStr = await this.executeWithTimeout(action, args)
            }
          } else {
            resultStr = await this.executeWithTimeout(action, args)
          }
        } catch (err) {
          success = false
          resultStr = err instanceof Error ? err.message : String(err)
        }

        const toolElapsed = ((Date.now() - toolStart) / 1000).toFixed(1)
        console.log(`[AIService] 工具 ${action} 完成, 耗时 ${toolElapsed}s, 结果长度 ${resultStr.length}`)

        // todo 工具不推送到 steps（避免污染工具列表）
        if (!TODO_ACTIONS.has(action)) {
          const uiResult = resultStr.length > 500
            ? resultStr.slice(0, 500) + `...(${resultStr.length}字符)`
            : resultStr
          callbacks.onStep?.({ action, args, result: uiResult, success, label, argsLabel })
        }

        // AI 对话历史：截断大结果（特别是截图 base64），避免请求体过大导致 API 挂起
        let msgContent = resultStr
        if (action === 'screenshot' && msgContent.length > 2000) {
          try {
            const parsed = JSON.parse(msgContent)
            if (parsed.image) {
              parsed.image = `[截图已省略，长度${parsed.imageLength || 0}字符，AI可参考screenText字段]`
              msgContent = JSON.stringify(parsed)
            }
          } catch { /* ignore */ }
        }
        // get_ui_tree 结果也可能很大，截断
        if (action === 'get_ui_tree' && msgContent.length > 6000) {
          msgContent = msgContent.slice(0, 6000) + '...(UI元素树已截断)'
        }
        // 通用截断：超过 8000 字符的结果截断
        if (msgContent.length > 8000) {
          msgContent = msgContent.slice(0, 8000) + `...(已截断，共${msgContent.length}字符)`
        }
        newMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: msgContent
        })
        // 工具执行完成，立即提示用户（消除 onStep 到下一轮 onThinking 之间的空窗期）
        callbacks.onThinking?.(`✓ ${label}完成，等待 AI 分析...`)
      }
      // 继续下一轮
    }

    clearTimeout(globalTimer)
    if (globalTimedOut) {
      return { messages: this.stripSystem(newMessages.slice(messages.length)), reply: '' }
    }
    callbacks.onError?.(`已达到最大工具调用轮数(${MAX_LOOPS})，任务中止`)
    const added = newMessages.slice(messages.length)
    return { messages: this.stripSystem(added), reply: '' }
  }

  /** 带超时保护执行工具，防止原生调用挂起导致死锁 */
  private async executeWithTimeout(action: string, args: Record<string, unknown>): Promise<string> {
    const timeoutMs = action === 'screenshot' ? 15000 : 10000
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`工具执行超时(${timeoutMs / 1000}s)`)), timeoutMs)
    })
    try {
      return await Promise.race([
        this.toolRegistry.execute(action, args),
        timeoutPromise
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /** 执行 AI 内部任务跟踪工具（不操控手机） */
  private async executeTodoAction(
    action: string,
    args: Record<string, unknown>,
    callbacks: AIServiceCallbacks
  ): Promise<string> {
    if (action === 'plan_tasks') {
      const tasks = Array.isArray(args.tasks) ? args.tasks.map(String) : []
      callbacks.onTodoPlan?.(tasks)
      return `已规划 ${tasks.length} 个任务步骤`
    }
    if (action === 'update_task') {
      const id = Number(args.id)
      const status = String(args.status) as 'in_progress' | 'done'
      callbacks.onTodoUpdate?.(id, status)
      return `任务 ${id} 已更新为 ${status}`
    }
    return '未知任务操作'
  }

  /** 流式调用 DeepSeek /chat/completions（XHR + SSE 解析，RN 兼容） */
  private async callDeepSeekStream(
    messages: DSMessage[],
    tools: unknown[],
    apiKey: string,
    baseUrl: string,
    onToken?: (delta: string) => void,
    onReasoning?: (delta: string) => void,
    onToolCall?: (name: string, argsDelta: string) => void,
    onThinking?: (text: string) => void
  ): Promise<StreamResult> {
    const modelConfig = await getModelConfig()
    const modelName = resolveModelName(modelConfig)
    const enableThinking = shouldEnableThinking(modelConfig)

    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
    const body: Record<string, unknown> = {
      model: modelName,
      messages,
      max_tokens: MAX_TOKENS,
      stream: true,
      thinking: { type: enableThinking ? 'enabled' : 'disabled' }
    }
    if (tools.length > 0) body.tools = tools

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      this.abortXhr = xhr
      xhr.open('POST', url)
      xhr.setRequestHeader('Content-Type', 'application/json')
      xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`)
      xhr.setRequestHeader('Accept', 'text/event-stream')

      let lastIndex = 0
      let buffer = ''
      let content = ''
      let reasoning = ''
      let finishReason = ''
      const toolCalls: NonNullable<DSMessage['tool_calls']> = []

      // 空闲超时：45 秒无新数据自动中断（防止 API 挂起导致死锁）
      let idleTimer: ReturnType<typeof setTimeout> | null = null
      const IDLE_TIMEOUT = 45000
      const resetIdleTimer = (): void => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          try { xhr.abort() } catch { /* ignore */ }
          cleanup()
          reject(new Error('AI 响应超时(45秒无数据)'))
        }, IDLE_TIMEOUT)
      }
      resetIdleTimer()

      // 心跳：每 3 秒更新 thinking，确保用户看到"仍在等待"提示（收到首字节后停止）
      let heartbeatStart = Date.now()
      let firstByteReceived = false
      const heartbeat = setInterval(() => {
        if (firstByteReceived) return
        const elapsed = Math.floor((Date.now() - heartbeatStart) / 1000)
        onThinking?.(`AI 思考中... 已等待 ${elapsed}s`)
      }, 3000)

      // 节流：批量累积 token，每 100ms 刷新一次，避免 RN 桥被洪水般重渲染堵塞
      let tokenBuffer = ''
      let reasoningBuffer = ''
      let flushTimer: ReturnType<typeof setInterval> | null = null
      const flush = (): void => {
        if (tokenBuffer) {
          onToken?.(tokenBuffer)
          tokenBuffer = ''
        }
        if (reasoningBuffer) {
          onReasoning?.(reasoningBuffer)
          reasoningBuffer = ''
        }
      }
      if (onToken || onReasoning) {
        flushTimer = setInterval(flush, 100)
      }

      const parseEvent = (ev: string): void => {
        const line = ev.trim()
        if (!line.startsWith('data:')) return
        const data = line.slice(5).trim()
        if (data === '[DONE]') return
        try {
          const json = JSON.parse(data)
          const choice = json.choices?.[0]
          if (!choice) return
          const delta = choice.delta
          if (delta?.content) {
            content += delta.content
            tokenBuffer += delta.content
          }
          if (delta?.reasoning_content) {
            reasoning += delta.reasoning_content
            reasoningBuffer += delta.reasoning_content
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } }
              }
              if (tc.id) toolCalls[idx].id = tc.id
              if (tc.function?.name) {
                toolCalls[idx].function.name += tc.function.name
                // 工具名生成中，实时通知 UI
                onToolCall?.(toolCalls[idx].function.name, '')
              }
              if (tc.function?.arguments) {
                toolCalls[idx].function.arguments += tc.function.arguments
                // 工具参数生成中，实时通知 UI
                onToolCall?.(toolCalls[idx].function.name, tc.function.arguments)
              }
            }
          }
          if (choice.finish_reason) finishReason = choice.finish_reason
        } catch { /* 忽略解析错误 */ }
      }

      xhr.onprogress = () => {
        // 收到数据，重置空闲超时和心跳计时
        if (!firstByteReceived) {
          firstByteReceived = true
          console.log('[AIService] 收到首字节响应')
        }
        resetIdleTimer()
        heartbeatStart = Date.now()
        const chunk = xhr.responseText.substring(lastIndex)
        lastIndex = xhr.responseText.length
        buffer += chunk
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const ev of events) parseEvent(ev)
      }

      const cleanup = (): void => {
        if (idleTimer) {
          clearTimeout(idleTimer)
          idleTimer = null
        }
        clearInterval(heartbeat)
        if (flushTimer) {
          clearInterval(flushTimer)
          flushTimer = null
        }
        flush()
      }

      xhr.onload = () => {
        this.abortXhr = null
        // 处理剩余 buffer
        if (buffer.trim()) parseEvent(buffer)
        cleanup()
        if (xhr.status >= 200 && xhr.status < 300) {
          const validTools = toolCalls.filter((t) => t.id && t.function?.name)
          if (finishReason === 'tool_calls' && validTools.length === 0) {
            reject(new Error('模型返回 tool_calls 但无有效工具调用'))
            return
          }
          resolve({
            content,
            reasoning,
            tool_calls: validTools.length > 0 ? validTools : undefined,
            finish_reason: finishReason
          })
        } else {
          let detail = xhr.responseText
          try {
            const j = JSON.parse(xhr.responseText)
            detail = j?.error?.message || detail
          } catch { /* ignore */ }
          reject(new Error(`HTTP ${xhr.status}: ${detail}`))
        }
      }

      xhr.onerror = () => {
        this.abortXhr = null
        cleanup()
        reject(new Error('网络错误，请检查网络连接'))
      }

      xhr.onabort = () => {
        this.abortXhr = null
        cleanup()
        reject(new Error('aborted'))
      }

      xhr.send(JSON.stringify(body))
    })
  }

  /** 上下文自动压缩：直接截断保留最近消息（不调用 API，避免挂起） */
  private async maybeCompress(messages: DSMessage[], apiKey: string, baseUrl: string): Promise<void> {
    if (messages.length <= KEEP_RECENT + 2) return
    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0)
    if (totalChars < COMPRESS_THRESHOLD) return

    const systemMsg = messages[0]
    // 找到最后一个带 tool_calls 的 assistant，保留它及之后的所有消息（保证配对）
    let lastToolCallIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].tool_calls && messages[i].tool_calls!.length > 0) {
        lastToolCallIdx = i
        break
      }
    }

    // 保留最近 2 个完整循环或至少 KEEP_RECENT 条
    const minKeepIdx = Math.max(1, messages.length - KEEP_RECENT)
    const splitIdx = lastToolCallIdx > 0 ? Math.min(lastToolCallIdx, minKeepIdx) : minKeepIdx

    const toCompress = messages.slice(1, splitIdx)
    const recent = messages.slice(splitIdx)
    if (toCompress.length === 0) return

    // 生成简单摘要（不调用 API，直接截取关键信息）
    const summary = toCompress
      .map((m) => {
        if (m.role === 'tool') return `[工具结果] ${m.content?.slice(0, 100) || ''}`
        if (m.role === 'assistant' && m.tool_calls) return `[AI调用工具] ${m.tool_calls.map((t) => t.function.name).join(', ')}`
        if (m.role === 'assistant') return `[AI回复] ${m.content?.slice(0, 100) || ''}`
        return `[${m.role}] ${m.content?.slice(0, 100) || ''}`
      })
      .join(' | ')

    // 直接替换：保留 system + 摘要 + 最近消息
    messages.length = 0
    messages.push(
      systemMsg,
      { role: 'system', content: `【历史摘要】${summary.slice(0, 2000)}` },
      ...recent
    )
    console.log(`[AIService] 上下文压缩: ${toCompress.length} 条消息 → 摘要 ${summary.length} 字符`)
  }

  private stripSystem(msgs: DSMessage[]): DSMessage[] {
    return msgs.filter((m) => m.role !== 'system')
  }
}
