/**
 * LocalModelClient — node-llama-cpp 的 OpenAI 兼容适配器
 *
 * 将进程内 node-llama-cpp 推理封装为与 OpenAI SDK 一致的接口：
 *   client.chat.completions.create({ stream, messages, tools, ... }, { signal })
 *
 * 设计要点：
 * 1. 每次 create() 从 localModelManager 取一个独立 sequence，用完即 dispose
 * 2. 用 LlamaChatSession 的 chatWrapper='auto' 读取 Qwen3 GGUF 内嵌的 Jinja2 模板
 * 3. 全量消息 → setChatHistory(除末尾 user) + prompt(末尾 user) 实现无状态调用
 * 4. 工具调用：模型按 <ToolName>{"key":"value"}</ToolName> 格式输出（标签名=工具名），
 *    ToolCallStreamParser 流式解析后转为 OpenAI tool_calls delta
 * 5. 不支持 reasoning（4B 模型无思考链输出）
 */
import { randomUUID } from 'crypto'
import type { ChatHistoryItem } from 'node-llama-cpp'
import { localModelManager } from './local-model-manager'
import { extractTextFromContent, type MessageContent } from '@shared/types'
import { LOCAL_MODEL_NAME } from '@shared/constants'
import { logger } from '../utils/logger'

/** OpenAI 兼容的流式 chunk（满足 ai-service 读取 choices[0].delta.content / tool_calls） */
interface LocalChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      content?: string
      role?: string
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function: { name?: string; arguments?: string }
      }>
    }
    finish_reason: string | null
  }>
}

/** OpenAI 兼容的非流式响应 */
interface LocalCompletion {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: 'assistant'
      content: string
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }
    finish_reason: string
  }>
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

/** 单个工具的 schema 描述（最小子集，供解析器校验工具名） */
interface ToolLike {
  function: { name: string }
}

/** create() 入参（OpenAI ChatCompletionCreateParams 的子集） */
interface CreateParams {
  messages?: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: MessageContent
    tool_call_id?: string
    tool_calls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>
    name?: string
  }>
  max_tokens?: number
  temperature?: number
  top_p?: number
  stream?: boolean
  /** 工具列表——本地模型不注入 llama 上下文，仅用于解析器校验工具名白名单 */
  tools?: ToolLike[]
  [key: string]: unknown
}

interface RequestOptions {
  signal?: AbortSignal
}

/**
 * 异步队列：生产者 push，消费者 async 迭代。
 */
class StreamQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = []
  private done = false
  private error: unknown = null
  private waiters: Array<(r: IteratorResult<T>) => void> = []

  push(item: T): void {
    if (this.done) return
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter({ value: item, done: false })
    } else {
      this.buffer.push(item)
    }
  }

  close(): void {
    if (this.done) return
    this.done = true
    while (this.waiters.length > 0) {
      this.waiters.shift()!({ value: undefined, done: true })
    }
  }

  fail(err: unknown): void {
    if (this.done) return
    this.error = err
    this.done = true
    while (this.waiters.length > 0) {
      this.waiters.shift()!({ value: undefined, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift()!, done: false })
        }
        if (this.done) {
          if (this.error) return Promise.reject(this.error)
          return Promise.resolve({ value: undefined, done: true })
        }
        return new Promise((resolve) => this.waiters.push(resolve))
      }
    }
  }
}

/** 默认允许的工具名（当未传 tools 参数时的兜底白名单） */
const DEFAULT_ALLOWED_TOOLS = new Set([
  'File', 'Terminal', 'App', 'WebSearch', 'Memory', 'AskUser'
])

/**
 * 工具调用流式解析器：状态机分离文本内容与 <ToolName>JSON</ToolName> 块。
 *
 * 格式约定（与 SYSTEM_PROMPT_LOCAL_TASK 一致）：
 *   <File>{"action":"read","path":"C:\\test.txt"}</File>
 *
 * - 标签名必须在 allowedTools 白名单中，否则视为普通文本（容错）
 * - 处理分块边界：buffer 末尾可能是标签前缀，保留等待下一个 chunk
 * - 解析失败的块降级为普通文本输出，不丢失内容
 */
class ToolCallStreamParser {
  private buffer = ''
  private state: 'text' | 'tag_open' | 'in_tool' = 'text'
  private currentTool = ''
  private currentCloseTag = ''
  private toolIndex = 0
  private allowedTools: Set<string>

  constructor(
    allowedTools: Set<string>,
    private readonly onContent: (text: string) => void,
    private readonly onToolCall: (name: string, args: string, index: number, id: string) => void
  ) {
    this.allowedTools = allowedTools.size > 0 ? allowedTools : DEFAULT_ALLOWED_TOOLS
  }

  push(text: string): void {
    this.buffer += text
    this.process()
  }

  private process(): void {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.state === 'text') {
        // 查找下一个 '<' 开始的位置
        const ltIdx = this.buffer.indexOf('<')
        if (ltIdx === -1) {
          // 无 '<'，输出除最后 0 字符外的所有内容（标签必须以 < 开头，无需保留）
          this.safeOutputText(this.buffer)
          this.buffer = ''
          return
        }
        // 输出 '<' 之前的文本
        if (ltIdx > 0) {
          this.safeOutputText(this.buffer.slice(0, ltIdx))
        }
        // 检查 '<' 后是否是合法的工具名开头（大写字母）
        const afterLt = this.buffer.slice(ltIdx + 1)
        const match = afterLt.match(/^([A-Z][a-zA-Z0-9]*)/)
        if (!match) {
          // 不是合法标签开头（可能是 </闭合标签 或其他 <xx 内容），输出 '<' 并跳过
          this.safeOutputText('<')
          this.buffer = afterLt
          continue
        }
        const possibleName = match[1]
        // 在 possibleName 之后需要找到 '>' 才是开标签
        const afterName = afterLt.slice(possibleName.length)
        const gtIdx = afterName.indexOf('>')
        if (gtIdx === -1) {
          // '>' 尚未到达，保留 '<' 之后的内容等待更多 chunk
          // 但先输出 '<' 之前已确认的内容（已在上面输出 ltIdx 部分），
          // 现在保留从 '<' 开始的部分
          this.buffer = this.buffer.slice(ltIdx)
          return
        }
        // 有完整开标签：检查工具名是否在白名单中
        if (!this.allowedTools.has(possibleName)) {
          // 不在白名单：当作普通文本，输出 '<' 并继续
          this.safeOutputText('<')
          this.buffer = afterLt
          continue
        }
        // 合法开标签：进入工具内容状态
        this.currentTool = possibleName
        this.currentCloseTag = `</${possibleName}>`
        this.buffer = afterName.slice(gtIdx + 1)
        this.state = 'in_tool'
        continue
      }

      if (this.state === 'in_tool') {
        // 查找闭合标签
        const closeIdx = this.buffer.indexOf(this.currentCloseTag)
        if (closeIdx === -1) {
          // 闭合标签未到，需要等待。保留最后 (closeTag.length - 1) 个字符，
          // 防止闭合标签被分割在两个 chunk 之间（如第一个 chunk 以 '</Fil' 结尾，第二个以 'e>' 开头）
          const keepLen = this.currentCloseTag.length - 1
          if (this.buffer.length > keepLen) {
            // 前面确定是参数内容的部分可以先累积（但工具调用参数是最后一次性发出的，所以只保留在 buffer 中）
            // 这里不输出任何内容，等找到完整闭合标签后一次性处理
          }
          // 保留全部 buffer（因为我们需要找到完整的闭合标签，无法确定哪部分是确定的参数内容）
          return
        }
        // 提取参数 JSON 体
        const body = this.buffer.slice(0, closeIdx).trim()
        this.buffer = this.buffer.slice(closeIdx + this.currentCloseTag.length)
        this.emitToolCall(body)
        this.state = 'text'
        this.currentTool = ''
        this.currentCloseTag = ''
      }
    }
  }

  private safeOutputText(text: string): void {
    if (text) this.onContent(text)
  }

  private emitToolCall(body: string): void {
    if (!body) {
      // 空参数：用空对象
      const id = `call_${randomUUID()}`
      this.onToolCall(this.currentTool, '{}', this.toolIndex, id)
      this.toolIndex++
      return
    }
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>
      const argsStr = typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
      const id = `call_${randomUUID()}`
      this.onToolCall(this.currentTool, argsStr, this.toolIndex, id)
      this.toolIndex++
    } catch {
      // JSON 解析失败：降级为普通文本输出
      this.onContent(`<${this.currentTool}>${body}${this.currentCloseTag}`)
    }
  }

  /** 流结束：冲洗残留 buffer */
  flush(): void {
    if (this.state === 'in_tool') {
      // 未闭合的工具块：降级为文本输出
      this.onContent(`<${this.currentTool}>${this.buffer}`)
      this.buffer = ''
      this.state = 'text'
      this.currentTool = ''
      this.currentCloseTag = ''
    } else if (this.buffer) {
      this.onContent(this.buffer)
      this.buffer = ''
    }
  }
}

/** OpenAI 消息 → node-llama-cpp ChatHistoryItem */
function toChatHistory(
  messages: CreateParams['messages']
): { history: ChatHistoryItem[]; lastUserText: string } {
  if (!messages || messages.length === 0) {
    return { history: [], lastUserText: '' }
  }

  const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === 'user')
  const splitIdx = lastUserIdx >= 0 ? messages.length - 1 - lastUserIdx : -1

  const history: ChatHistoryItem[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const text = extractTextFromContent(m.content)
    if (i === splitIdx) continue

    if (m.role === 'system') {
      if (text) history.push({ type: 'system', text })
    } else if (m.role === 'user') {
      history.push({ type: 'user', text })
    } else if (m.role === 'assistant') {
      let responseText = text
      if (m.tool_calls && m.tool_calls.length > 0) {
        const tcText = m.tool_calls
          .map((tc) => {
            try {
              const args = JSON.parse(tc.function.arguments || '{}')
              return `<${tc.function.name}>${JSON.stringify(args)}</${tc.function.name}>`
            } catch {
              return `<${tc.function.name}>${tc.function.arguments}</${tc.function.name}>`
            }
          })
          .join('\n')
        responseText = responseText ? `${responseText}\n${tcText}` : tcText
      }
      history.push({ type: 'model', response: [responseText] })
    } else if (m.role === 'tool') {
      history.push({ type: 'user', text: `<tool_result>${text}</tool_result>` })
    }
  }

  const lastUserText = splitIdx >= 0 ? extractTextFromContent(messages[splitIdx].content) : ''
  return { history, lastUserText }
}

/**
 * 本地模型客户端：伪装成 OpenAI SDK client。
 */
export class LocalModelClient {
  readonly chat: {
    completions: {
      create: (
        params: CreateParams,
        options?: RequestOptions
      ) => Promise<AsyncIterable<LocalChunk> | LocalCompletion>
    }
  }

  constructor() {
    this.chat = {
      completions: {
        create: (params, options) => this._create(params, options)
      }
    }
  }

  private async _create(
    params: CreateParams,
    options?: RequestOptions
  ): Promise<AsyncIterable<LocalChunk> | LocalCompletion> {
    if (params.stream !== true) {
      return this._createSync(params, options)
    }
    return this._createStream(params, options)
  }

  /** 从 tools 参数提取允许的工具名集合 */
  private getAllowedTools(params: CreateParams): Set<string> {
    if (params.tools && params.tools.length > 0) {
      return new Set(params.tools.map((t) => t.function.name))
    }
    return new Set(DEFAULT_ALLOWED_TOOLS)
  }

  /** 非流式：生成完整响应后一次性返回 */
  private async _createSync(params: CreateParams, options?: RequestOptions): Promise<LocalCompletion> {
    let sequence: { dispose: () => void } | null = null
    try {
      sequence = await localModelManager.getSequence()
      const { LlamaChatSession } = await import('node-llama-cpp')
      const session = new LlamaChatSession({
        contextSequence: sequence as never,
        chatWrapper: 'auto'
      })
      const { history, lastUserText } = toChatHistory(params.messages)
      session.setChatHistory(history)
      const promptText = lastUserText || '请回复。'

      logger.debug(`[LocalModelClient] 非流式推理，history=${history.length} 条`)
      const response = await session.prompt(promptText, {
        signal: options?.signal,
        stopOnAbortSignal: true,
        maxTokens: params.max_tokens ?? 1024,
        temperature: params.temperature ?? 0.7,
        topP: params.top_p
      })

      const allowedTools = this.getAllowedTools(params)
      const { content, toolCalls } = extractToolCallsFromText(response, allowedTools)

      return {
        id: `localcmpl-${randomUUID()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: LOCAL_MODEL_NAME,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content,
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
          },
          finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop'
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      }
    } catch (err) {
      logger.error('[LocalModelClient] 非流式推理失败', err)
      throw err
    } finally {
      sequence?.dispose()
    }
  }

  /** 流式：onTextChunk → ToolCallStreamParser → StreamQueue → async iterable */
  private async _createStream(params: CreateParams, options?: RequestOptions): Promise<AsyncIterable<LocalChunk>> {
    const queue = new StreamQueue<LocalChunk>()
    const completionId = `localcmpl-${randomUUID()}`
    const created = Math.floor(Date.now() / 1000)
    const allowedTools = this.getAllowedTools(params)

    const makeContentChunk = (content: string, finishReason: string | null = null): LocalChunk => ({
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model: LOCAL_MODEL_NAME,
      choices: [{
        index: 0,
        delta: content ? { content } : {},
        finish_reason: finishReason
      }]
    })

    const makeToolCallChunk = (
      name: string,
      args: string,
      index: number,
      id: string
    ): LocalChunk => ({
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model: LOCAL_MODEL_NAME,
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index,
            id,
            type: 'function',
            function: { name, arguments: args }
          }]
        },
        finish_reason: null
      }]
    })

    // 首个 chunk 携带 role
    queue.push({
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model: LOCAL_MODEL_NAME,
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
    })

    let hasToolCall = false
    const parser = new ToolCallStreamParser(
      allowedTools,
      (text) => {
        if (text) queue.push(makeContentChunk(text))
      },
      (name, args, index, id) => {
        hasToolCall = true
        queue.push(makeToolCallChunk(name, args, index, id))
      }
    )

    ;(async () => {
      let sequence: { dispose: () => void } | null = null
      try {
        sequence = await localModelManager.getSequence()
        const { LlamaChatSession } = await import('node-llama-cpp')
        const session = new LlamaChatSession({
          contextSequence: sequence as never,
          chatWrapper: 'auto'
        })

        const { history, lastUserText } = toChatHistory(params.messages)
        session.setChatHistory(history)

        const promptText = lastUserText || '请回复。'

        logger.debug(`[LocalModelClient] 流式推理，history=${history.length} 条，tools=${allowedTools.size}`)

        await session.prompt(promptText, {
          onTextChunk: (text: string) => {
            if (text) parser.push(text)
          },
          signal: options?.signal,
          stopOnAbortSignal: true,
          maxTokens: params.max_tokens ?? 2048,
          temperature: params.temperature ?? 0.7,
          topP: params.top_p
        })

        parser.flush()
        queue.push(makeContentChunk('', hasToolCall ? 'tool_calls' : 'stop'))
        queue.close()
      } catch (err) {
        logger.error('[LocalModelClient] 流式推理失败', err)
        try { parser.flush() } catch { /* ignore */ }
        queue.push(makeContentChunk('', 'stop'))
        queue.fail(err)
      } finally {
        sequence?.dispose()
      }
    })()

    return queue
  }
}

/**
 * 从完整文本中提取 <ToolName>JSON</ToolName> 块，返回纯文本 + OpenAI tool_calls。
 * 用于非流式响应（_createSync）。
 */
function extractToolCallsFromText(
  text: string,
  allowedTools: Set<string>
): {
  content: string
  toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
} {
  const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = []
  let content = ''
  let remaining = text

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ltIdx = remaining.indexOf('<')
    if (ltIdx === -1) {
      content += remaining
      break
    }
    content += remaining.slice(0, ltIdx)
    const afterLt = remaining.slice(ltIdx + 1)
    const match = afterLt.match(/^([A-Z][a-zA-Z0-9]*)/)
    if (!match) {
      content += '<'
      remaining = afterLt
      continue
    }
    const name = match[1]
    const afterName = afterLt.slice(name.length)
    if (afterName[0] !== '>') {
      content += '<'
      remaining = afterLt
      continue
    }
    if (!allowedTools.has(name)) {
      content += '<'
      remaining = afterLt
      continue
    }
    const closeTag = `</${name}>`
    const afterGt = afterName.slice(1)
    const closeIdx = afterGt.indexOf(closeTag)
    if (closeIdx === -1) {
      content += `<${name}>`
      remaining = afterGt
      continue
    }
    const body = afterGt.slice(0, closeIdx).trim()
    remaining = afterGt.slice(closeIdx + closeTag.length)
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>
      const argsStr = typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
      toolCalls.push({
        id: `call_${randomUUID()}`,
        type: 'function',
        function: { name, arguments: argsStr }
      })
    } catch {
      content += `<${name}>${body}${closeTag}`
    }
  }

  return { content: content.trim(), toolCalls }
}
