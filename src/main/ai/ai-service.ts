import OpenAI, { APIError } from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { randomUUID } from 'crypto'
import { settingsStore } from '../store/settings'
import { logger } from '../utils/logger'
import { INTENT_PROMPT, SYSTEM_PROMPT_CHAT, SYSTEM_PROMPT_LOCAL, SYSTEM_PROMPT_LOCAL_TASK, SYSTEM_PROMPT_TASK, SYSTEM_PROMPT_CODE, SYSTEM_PROMPT_PLAN, SYSTEM_PROMPT_SPEC, OPENX_COMPRESSION_PROMPT, OPENX_REMINDER_HEADER } from './prompts'
import { DEEPSEEK_MAX_CONTEXT_TOKENS, KIMI_K27_MAX_CONTEXT_TOKENS, XSKILLHUB_RELAY_BASE_URL, XSKILLHUB_RELAY_API_KEY, RELAY_MAX_CONTEXT_TOKENS, RELAY_DAILY_LIMIT, RELAY_MODEL, SKILL_HUB_BASE_URL, PAID_PRO_MODEL, PAID_CREDITS, LOCAL_MODEL_NAME, LOCAL_MODEL_MAX_CONTEXT_TOKENS, OPENX_PROXY_BASE_URL } from '@shared/constants'
import { extractTextFromContent } from '@shared/types'
import type { ConnectionTestResult, MessageContent, RelayQuota, GeneratedSubagentConfig } from '@shared/types'
import type { FunctionSchema } from './function-schemas'
import { memoryStore } from '../store/memory'
import { skillsStore } from '../store/skills'
import { customSubagentsStore } from '../store/custom-subagents'
import { getMachineId } from '../store/machine-id'
import { paymentService } from '../payment/payment-service'
import { OpenXDecoder, decodeOpenXSync } from './openx-decoder'
import { countTokens } from './token-counter'
import { LocalModelClient } from '../local-model/local-model-client'
import { localModelManager } from '../local-model/local-model-manager'

type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

interface ChatMessage {
  role: ChatRole
  content: MessageContent
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  name?: string
}

class AiService {
  private fastClient: OpenAI | null = null
  private proClient: OpenAI | null = null
  /** 本地模型客户端（进程内 node-llama-cpp，OpenAI 兼容适配器） */
  private localClient: LocalModelClient | null = null
  private cachedSettingsKey: string = ''
  /** 付费积分余额缓存（由 payment-service 推送更新，用于判断是否允许 pro 模型） */
  private paidBalanceCache: number = 0

  /** 当前排队 ID（重试时通过 fetch 注入 X-Queue-Id header，复用排队位置） */
  private currentQueueId: string | null = null
  /** 当前请求是否为优先通行（已扣 10 积分跳过排队） */
  private currentQueuePriority: boolean = false

  /**
   * 每个会话最后一次任务执行时的实际上下文统计（按 sessionId 缓存）。
   * 由 executeTask/executeChat 在构建系统提示词后记录，
   * computeContextUsage 读取此缓存以保证统计值稳定（不因后续 query 变化而波动）。
   */
  private contextStatsCache: Map<string, { systemPromptTokens: number; toolsSchemaTokens: number }> = new Map()

  /**
   * 记录某会话的系统提示词和工具 schema token 数。
   * 只增不减：同一会话可能交替走 chat（短提示词、无工具 schema）和 task（长提示词、完整工具 schema）模式，
   * 取最大值避免 chat 模式覆盖 task 模式的大值，导致上下文使用率从高突然降低（如从 10% 退回 1%）。
   */
  setContextStats(sessionId: string, systemPromptTokens: number, toolsSchemaTokens: number): void {
    const existing = this.contextStatsCache.get(sessionId)
    if (existing) {
      this.contextStatsCache.set(sessionId, {
        systemPromptTokens: Math.max(existing.systemPromptTokens, systemPromptTokens),
        toolsSchemaTokens: Math.max(existing.toolsSchemaTokens, toolsSchemaTokens)
      })
    } else {
      this.contextStatsCache.set(sessionId, { systemPromptTokens, toolsSchemaTokens })
    }
  }

  /** 读取某会话的上下文统计缓存（可能为 undefined——任务从未执行过） */
  getContextStats(sessionId: string): { systemPromptTokens: number; toolsSchemaTokens: number } | undefined {
    return this.contextStatsCache.get(sessionId)
  }

  /** 更新付费余额缓存（由 chat.ipc 在请求完成后调用） */
  setPaidBalance(balance: number): void {
    this.paidBalanceCache = balance
  }

  /**
   * 花费 10 积分跳过排队（由前端 IPC 调用）。
   * 调用后端 /api/ai/queue/skip 扣费并标记优先，成功后设置 currentQueuePriority，
   * 下次重试请求会通过 X-Queue-Priority header 优先放行。
   */
  async skipQueue(): Promise<{ success: boolean; balance?: number; message: string }> {
    if (!this.isRelayMode()) {
      return { success: false, message: '非限免模式无需排队' }
    }
    try {
      const resp = await fetch(`${XSKILLHUB_RELAY_BASE_URL}/../api/ai/queue/skip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Machine-Id': getMachineId()
        },
        body: JSON.stringify({})
      })
      const data = await resp.json() as { code: number; message?: string; data?: { balance: number; success: boolean } }
      if (resp.ok && data.code === 0) {
        this.currentQueuePriority = true
        if (typeof data.data?.balance === 'number') {
          this.paidBalanceCache = data.data.balance
        }
        return { success: true, balance: data.data?.balance, message: data.data?.success ? '已跳过排队' : (data.message ?? '已标记优先') }
      }
      return { success: false, message: data.message ?? `跳过排队失败（${resp.status}）` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[AiService] skipQueue failed:', msg)
      return { success: false, message: `跳过排队失败：${msg}` }
    }
  }

  /** 清除排队状态（请求成功或彻底失败后调用） */
  private clearQueueState(): void {
    this.currentQueueId = null
    this.currentQueuePriority = false
  }

  /**
   * 捕获 OpenAI SDK 的排队信号（429 + type=queue_pending）。
   * @returns 排队信息（position、estimatedWaitMs、queueId），非排队错误返回 null
   */
  private extractQueueInfo(err: unknown): { position: number; estimatedWaitMs: number; queueId: string } | null {
    if (!(err instanceof APIError)) return null
    if (err.status !== 429) return null
    const errObj = err.error as { type?: string; code?: string; queue?: { position: number; estimatedWaitMs: number; queueId: string } } | undefined
    if (errObj?.type !== 'queue_pending' && errObj?.code !== 'queue_pending') return null
    if (!errObj?.queue) return null
    return errObj.queue
  }

  /**
   * 排队重试包装器：捕获排队信号后通知 UI，按指数退避自动重试。
   * @param fn 实际发起 AI 请求的函数
   * @param onQueueUpdate 排队状态回调（通知前端显示排队 UI）
   * @param signal 中断信号
   */
  private async withQueueRetry<T>(
    fn: () => Promise<T>,
    onQueueUpdate?: (info: { position: number; estimatedWaitMs: number; queueId: string; skipAvailable: boolean }) => void,
    signal?: AbortSignal
  ): Promise<T> {
    const MAX_RETRIES = 30  // 最多重试 30 次（约 3 分钟）
    const BASE_DELAY = 2000 // 基础等待 2 秒
    let lastErr: unknown = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw lastErr ?? new Error('请求已中断')

      try {
        const result = await fn()
        // 请求成功，清除排队状态
        this.clearQueueState()
        return result
      } catch (err) {
        // 用户中断：直接抛出
        if (signal?.aborted) throw err

        const queueInfo = this.extractQueueInfo(err)
        if (!queueInfo) {
          // 非排队错误：清除状态后抛出
          this.clearQueueState()
          throw err
        }

        // 排队中：设置 queueId 供重试复用，通知 UI
        this.currentQueueId = queueInfo.queueId
        lastErr = err
        onQueueUpdate?.({
          position: queueInfo.position,
          estimatedWaitMs: queueInfo.estimatedWaitMs,
          queueId: queueInfo.queueId,
          skipAvailable: true
        })

        // 指数退避：2s, 3s, 4s, 5s, ...（上限 8s）
        const delay = Math.min(BASE_DELAY + attempt * 1000, 8000)
        logger.info(`[AiService] 排队中（第 ${queueInfo.position} 位），${delay}ms 后重试（attempt ${attempt + 1}/${MAX_RETRIES}）`)

        // 可中断的延迟
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delay)
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timer)
              reject(new Error('请求已中断'))
            }, { once: true })
          }
        })
      }
    }

    // 重试耗尽：清除状态后抛出最后一个错误
    this.clearQueueState()
    throw lastErr ?? new Error('排队超时，请稍后重试')
  }

  /** 获取付费余额（同步，避免阻塞请求构建） */
  getPaidBalance(): number {
    // 优先用缓存，缓存为 0 时从 paymentService 同步读取
    if (this.paidBalanceCache > 0) return this.paidBalanceCache
    const cached = paymentService.getCachedPaidQuota()
    const balance = cached?.balance ?? 0
    this.paidBalanceCache = balance
    return balance
  }

  /** 判断模型是否为 Kimi K2.7 Code 系列（高速版） */
  private isKimiK27Code(model: string): boolean {
    return model === 'kimi-k2.7-code-highspeed'
  }

  /** 判断模型是否为 DeepSeek 系列 */
  private isDeepSeek(model: string): boolean {
    return model.startsWith('deepseek-')
  }

  /**
   * 限免模式：用户开启限免开关 或 未填写 DeepSeek API Key 时自动启用。
   * 通过 xskillhub 后端中继调用 DeepSeek，无需用户自己的 key。
   * @returns true 表示当前处于限免模式
   */
  isRelayMode(): boolean {
    // 本地模型优先级最高：开启后不走中继，所有 relay 相关逻辑（排队/OpenX/额度）全部跳过
    if (this.isLocalModelActive()) return false
    const s = settingsStore.get()
    const localKey = (s.deepseekApiKey ?? '').trim() || (s.apiKey ?? '').trim()
    return s.relayMode || !localKey
  }

  /** OpenX 本地解码模式是否生效（仅限免模式 + 开关开启 + 无代理 Token）
   *  走 xskillhub 中继，消耗 3 倍积分 */
  private get isOpenXActive(): boolean {
    return this.isRelayMode() && settingsStore.get().openXEnabled && !this.isOpenXProxyActive
  }

  /** OpenX 云端代理是否生效（开关开启 + 已配置 Token，不限模式，不扣积分）。
   *  代理模式下云端自动压缩/还原，客户端无需注入提示词或解码器。 */
  private get isOpenXProxyActive(): boolean {
    return settingsStore.get().openXEnabled && (settingsStore.get().openXToken ?? '').trim().length > 0
  }

  /** 本地模型是否激活（实验性功能，优先级最高：开启后覆盖 relay/direct 所有模式） */
  isLocalModelActive(): boolean {
    return settingsStore.get().localModel?.enabled === true
  }

  /** 根据模型获取对应的 API Key 和 Base URL（本地模型走进程内推理，不使用此配置） */
  private getProviderConfig(model: string): { apiKey: string; baseURL: string } {
    const s = settingsStore.get()
    // 本地模型走进程内 node-llama-cpp，getClients 会直接返回 LocalModelClient，此处仅占位
    if (this.isLocalModelActive()) {
      return { apiKey: 'local-model', baseURL: 'local' }
    }
    // OpenX 云端代理：不限模式，已配置 Token 时优先走代理（不扣积分，自动压缩/还原）
    if (this.isOpenXProxyActive) {
      return { apiKey: s.openXToken.trim(), baseURL: OPENX_PROXY_BASE_URL }
    }
    if (this.isKimiK27Code(model)) {
      return {
        apiKey: (s.kimiApiKey ?? '').trim() || (s.apiKey ?? '').trim(),
        baseURL: (s.kimiBaseURL ?? '').trim() || (s.baseURL ?? '').trim() || 'https://api.moonshot.cn/v1'
      }
    }
    // DeepSeek 分支：限免模式（开关开启 或 未填 key）走中继
    if (this.isRelayMode()) {
      return { apiKey: XSKILLHUB_RELAY_API_KEY, baseURL: XSKILLHUB_RELAY_BASE_URL }
    }
    const localKey = (s.deepseekApiKey ?? '').trim() || (s.apiKey ?? '').trim()
    return {
      apiKey: localKey,
      baseURL: (s.deepseekBaseURL ?? '').trim() || (s.baseURL ?? '').trim() || 'https://api.deepseek.com/v1'
    }
  }

  private getClients(): { fast: OpenAI; pro: OpenAI } {
    // 本地模型优先级最高：返回进程内 LocalModelClient（OpenAI 兼容适配器）
    // fast/pro 共用同一实例——node-llama-cpp 单模型无 fast/pro 之分
    if (this.isLocalModelActive()) {
      if (!this.localClient) {
        this.localClient = new LocalModelClient()
        logger.info('[AiService] 本地模型客户端已初始化（node-llama-cpp 进程内推理）')
      }
      const c = this.localClient as unknown as OpenAI
      return { fast: c, pro: c }
    }

    const s = settingsStore.get()
    const relay = this.isRelayMode()
    const openXProxy = this.isOpenXProxyActive
    // OpenX 代理模式下 getProviderConfig 会自动路由到 OX 代理 URL；
    // 模型名和参数逻辑仍按限免模式走（限免积分/排队/温度等）
    const usePro = relay && s.relayModelPreference === 'pro' && this.getPaidBalance() >= PAID_CREDITS.PRO_COST
    const fastModelKey = relay ? RELAY_MODEL : s.fastModel
    const proModelKey = relay ? (usePro ? PAID_PRO_MODEL : RELAY_MODEL) : s.proModel
    const fastConfig = this.getProviderConfig(fastModelKey)
    // 限免模式下，proClient 与 fastConfig 共用中继 baseURL
    const proConfig = relay ? fastConfig : this.getProviderConfig(proModelKey)
    const key = `${fastConfig.apiKey}|${fastConfig.baseURL}|${proConfig.apiKey}|${proConfig.baseURL}|${proModelKey}|${usePro ? 'pro' : 'flash'}|${this.getPaidBalance()}|${s.openXEnabled ? 'openx' : 'no-openx'}|${this.isOpenXProxyActive ? 'proxy' : 'local'}`

    if (key !== this.cachedSettingsKey || !this.fastClient || !this.proClient) {
      // 限免模式：注入 X-Machine-Id header 供后端扣减付费积分
      // 本地 OX 解码模式时注入 X-OpenX（代理模式无需此 header，云端自动处理）
      // 排队重试时注入 X-Queue-Id（复用排队位置）和 X-Queue-Priority（已扣积分优先放行）
      const openXProxyActive = this.isOpenXProxyActive
      const relayFetch = relay
        ? (url: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
            const headers = new Headers(init.headers)
            // OpenX 代理模式不走 xskillhub 中继，不需要 X-Machine-Id / 排队 header
            if (!openXProxyActive) {
              headers.set('X-Machine-Id', getMachineId())
              if (s.openXEnabled) {
                headers.set('X-OpenX', '1')
              }
              if (this.currentQueueId) {
                headers.set('X-Queue-Id', this.currentQueueId)
              }
              if (this.currentQueuePriority) {
                headers.set('X-Queue-Priority', '1')
              }
            }
            return fetch(url, { ...init, headers })
          }
        : undefined

      this.fastClient = new OpenAI({
        apiKey: fastConfig.apiKey,
        baseURL: fastConfig.baseURL,
        dangerouslyAllowBrowser: false,
        fetch: relayFetch as unknown as typeof fetch
      })
      this.proClient = new OpenAI({
        apiKey: proConfig.apiKey,
        baseURL: proConfig.baseURL,
        dangerouslyAllowBrowser: false,
        fetch: relayFetch as unknown as typeof fetch
      })
      this.cachedSettingsKey = key
      logger.info('AI clients initialized', {
        relayMode: relay,
        fastModel: fastModelKey,
        fastBaseURL: fastConfig.baseURL,
        proModel: proModelKey,
        proBaseURL: proConfig.baseURL,
        usePaidPro: usePro,
        paidBalance: this.getPaidBalance()
      })
    }
    return { fast: this.fastClient, pro: this.proClient }
  }

  /** 限免模式下 proClient 实际使用的模型（付费用户可切 pro） */
  private get effectiveProModel(): string {
    if (this.isLocalModelActive()) return LOCAL_MODEL_NAME
    if (!this.isRelayMode()) return this.proModel
    const s = settingsStore.get()
    if (s.relayModelPreference === 'pro' && this.getPaidBalance() >= PAID_CREDITS.PRO_COST) {
      return PAID_PRO_MODEL
    }
    return RELAY_MODEL
  }

  /** 快速模型：限免模式强制返回 flash，忽略用户设置；本地模型返回 LOCAL_MODEL_NAME */
  get fastModel(): string {
    if (this.isLocalModelActive()) return LOCAL_MODEL_NAME
    return this.isRelayMode() ? RELAY_MODEL : settingsStore.get().fastModel
  }

  /** 专业模型：限免模式下付费用户可用 pro，否则强制 flash；本地模型返回 LOCAL_MODEL_NAME */
  get proModel(): string {
    if (this.isLocalModelActive()) return LOCAL_MODEL_NAME
    if (!this.isRelayMode()) return settingsStore.get().proModel
    const s = settingsStore.get()
    if (s.relayModelPreference === 'pro' && this.getPaidBalance() >= PAID_CREDITS.PRO_COST) {
      return PAID_PRO_MODEL
    }
    return RELAY_MODEL
  }

  /** 深度思考：本地模型不支持思考；限免 flash 强制关闭；付费 pro 模型允许开启 */
  get deepThinkingEnabled(): boolean {
    if (this.isLocalModelActive()) return false
    if (!this.isRelayMode()) return settingsStore.get().deepThinking
    // 限免模式：仅当使用付费 pro 模型时才允许思考
    return this.effectiveProModel === PAID_PRO_MODEL && settingsStore.get().deepThinking
  }

  get thinkingEffort(): 'high' | 'max' {
    return settingsStore.get().thinkingEffort
  }

  /**
   * 获取模型支持的最大上下文 token 数。
   * - 限免模式：500K（强制 flash + 成本控制）
   * - Kimi K2.7 Code 系列：256K
   * - DeepSeek 系列：1M
   */
  getModelMaxContextTokens(model: string): number {
    // 本地模型：固定上下文长度（16K，受 Q4 量化 + 显存限制）
    if (this.isLocalModelActive()) {
      return LOCAL_MODEL_MAX_CONTEXT_TOKENS
    }
    // 限免模式统一使用较小的上下文上限
    if (this.isRelayMode()) {
      return RELAY_MAX_CONTEXT_TOKENS
    }
    if (this.isKimiK27Code(model)) {
      return KIMI_K27_MAX_CONTEXT_TOKENS
    }
    return DEEPSEEK_MAX_CONTEXT_TOKENS
  }

  /**
   * 验证当前配置的 API Key 是否已填写。
   * - 限免模式（未填 DeepSeek key）：DeepSeek 不加入 missing，允许通过中继使用
   * - 正常模式：fast 模型需 DeepSeek key；pro 模型若选 Kimi 需 Kimi key
   * @returns 缺失的提供商名称列表（空数组表示全部就绪）
   */
  validateApiKeys(): string[] {
    // 本地模型：无需任何 API Key
    if (this.isLocalModelActive()) return []
    const s = settingsStore.get()
    const missing: string[] = []

    // fast 模型固定使用 DeepSeek 配置
    const deepseekKey = (s.deepseekApiKey ?? '').trim() || (s.apiKey ?? '').trim()
    if (!deepseekKey) {
      // 未填 DeepSeek key：限免模式可用，不阻塞
      // （仅在 Kimi pro 模型也缺失时才提示 Kimi）
    }

    // pro 模型若选了 Kimi，需额外检查 Kimi key（限免模式不支持 Kimi）
    if (this.isKimiK27Code(s.proModel)) {
      const kimiKey = (s.kimiApiKey ?? '').trim() || (s.apiKey ?? '').trim()
      if (!kimiKey) {
        missing.push('Kimi')
      }
    }

    return missing
  }

  /** 意图分类：返回 chat 或 task */
  async classifyIntent(text: string): Promise<{ type: 'chat' | 'task'; confidence: number }> {
    const { fast } = this.getClients()
    try {
      const resp = await fast.chat.completions.create({
        model: this.fastModel,
        messages: [
          { role: 'system', content: INTENT_PROMPT },
          { role: 'user', content: text }
        ],
        temperature: 0,
        max_tokens: 100
      })
      const content = resp.choices[0]?.message?.content?.trim() ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0]) as { type: 'chat' | 'task'; confidence: number }
        return { type: parsed.type === 'task' ? 'task' : 'chat', confidence: parsed.confidence ?? 0.5 }
      }
    } catch (err) {
      logger.error('Intent classification failed:', err)
    }
    // 失败时默认按 task 处理（更安全，会走工具流程）
    return { type: 'task', confidence: 0.3 }
  }

  /** 构建带记忆和技能的系统提示：基础 prompt + 用户记忆 + 相关技能 */
  private async buildSystemPrompt(
    basePrompt: string,
    userQuery: string
  ): Promise<{ prompt: string; memoryIds: string[]; skillIds: string[] }> {
    const memoryIds: string[] = []
    const skillIds: string[] = []

    // 本地模型：不注入记忆/技能/OpenX（4K 上下文预算紧张）
    // - 纯对话模式（basePrompt === SYSTEM_PROMPT_CHAT）→ SYSTEM_PROMPT_LOCAL
    // - 任务模式（basePrompt 为 TASK/CODE/PLAN/SPEC）→ SYSTEM_PROMPT_LOCAL_TASK（含 6 工具 + <tool_call> 格式）
    if (this.isLocalModelActive()) {
      const isChatMode = basePrompt === SYSTEM_PROMPT_CHAT
      return { prompt: isChatMode ? SYSTEM_PROMPT_LOCAL : SYSTEM_PROMPT_LOCAL_TASK, memoryIds, skillIds }
    }

    const memories = await memoryStore.retrieveForContext(userQuery)
    const skills = skillsStore.retrieveForContext(userQuery)
    // OpenX 代理模式：云端自动压缩，无需注入提示词；仅本地 OX 方案时注入
    const openXActive = this.isOpenXActive && !this.isOpenXProxyActive
    let prompt = openXActive ? OPENX_REMINDER_HEADER + '\n\n' + basePrompt : basePrompt

    if (memories.length > 0) {
      prompt += '\n\n' + memoryStore.formatForInjection(memories)
      memoryIds.push(...memories.map((m) => m.id))
    }

    if (skills.length > 0) {
      prompt += '\n\n' + skillsStore.formatForInjection(skills)
      skillIds.push(...skills.map((s) => s.id))
    }

    // 自定义子智能体模板列表注入（让 AI 知道有哪些可用模板，可通过 Subagent 工具 templateName 调用）
    const customSubagents = customSubagentsStore.retrieveForContext(userQuery)
    if (customSubagents.length > 0) {
      prompt += '\n\n' + customSubagentsStore.formatForInjection(customSubagents)
    }

    if (openXActive) {
      prompt += '\n\n' + OPENX_COMPRESSION_PROMPT
    }

    return { prompt, memoryIds, skillIds }
  }

  /** 普通对话（无工具） */
  async chat(
    messages: ChatMessage[],
    onDelta?: (text: string) => void,
    signal?: AbortSignal,
    onQueueUpdate?: (info: { position: number; estimatedWaitMs: number; queueId: string; skipAvailable: boolean }) => void,
    sessionId?: string
  ): Promise<string> {
    const { fast } = this.getClients()
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    const { prompt: systemPrompt, memoryIds, skillIds } = await this.buildSystemPrompt(
      SYSTEM_PROMPT_CHAT,
      lastUserMsg ? extractTextFromContent(lastUserMsg.content) : ''
    )

    // 记录本次对话实际的系统提示词 token 数（chat 模式无工具 schema）
    // 后台计算，不阻塞 AI 请求
    if (sessionId) {
      void countTokens(systemPrompt).then((spTokens) => {
        this.setContextStats(sessionId, spTokens, 0)
      })
    }
    // 对话结束后统一标记一次访问（而非每次 API 调用都标记）
    if (memoryIds.length > 0) memoryStore.markAccessed(memoryIds)
    if (skillIds.length > 0) skillsStore.markUsed(skillIds)
    const createParams: Record<string, unknown> = {
      model: this.fastModel,
      messages: [{ role: 'system', content: systemPrompt }, ...messages] as ChatCompletionMessageParam[],
      stream: true
    }
    // Kimi K2.7 Code 系列 temperature 不可修改，跳过传入
    if (!this.isKimiK27Code(this.fastModel)) {
      createParams.temperature = 0.7
    }

    // 限免模式：用 withQueueRetry 包装整个流式创建+迭代，自动处理排队重试
    // OpenX 代理模式无排队机制，跳过 queueRetry
    const useQueueRetry = this.isRelayMode() && !this.isOpenXProxyActive
    // OpenX 代理模式：云端已还原，无需本地解码；仅本地 OX 方案时创建解码器
    const useOpenX = this.isOpenXActive && !this.isOpenXProxyActive
    const decoder = useOpenX ? new OpenXDecoder() : null

    const runStream = async (): Promise<string> => {
      const stream = await fast.chat.completions.create(
        createParams as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
        { signal }
      )
      let full = ''
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? ''
          if (delta) {
            if (decoder) {
              const decoded = decoder.push(delta)
              if (decoded) {
                full += decoded
                onDelta?.(decoded)
              }
            } else {
              full += delta
              onDelta?.(delta)
            }
          }
        }
        // OpenX 流结束：flush 残留缓冲
        if (decoder) {
          const flushed = decoder.flush()
          if (flushed) {
            full += flushed
            onDelta?.(flushed)
          }
          // 记录压缩指标（rawChars=AI压缩输出, decodedChars=还原后, savedChars=节省量）
          const m = decoder.getMetrics()
          if (m.savedChars > 0) {
            logger.info(
              `[AiService] OpenX 压缩生效：AI输出 ${m.rawChars} 字符 → 还原 ${m.decodedChars} 字符，节省 ${m.savedChars} 字符（压缩比 ${(m.ratio * 100).toFixed(1)}%）`
            )
          }
        }
      } catch (err) {
        // 用户中断时 OpenAI SDK 抛出 abort 错误，返回已接收的部分内容
        if (signal?.aborted) {
          logger.info('[AiService] chat 已被用户中断，返回部分内容')
          return full
        }
        throw err
      }
      return full
    }

    if (!useQueueRetry) {
      return runStream()
    }
    // 重试时需要重置 decoder（避免上次残留 buffer 污染）
    return this.withQueueRetry(async () => {
      // 每次重试前重置解码器（上一次失败不会产生 chunk，但保险起见）
      if (decoder) decoder.reset()
      return runStream()
    }, onQueueUpdate, signal)
  }

  /** 任务对话（带工具，返回工具调用或最终文本） */
  async chatWithTools(
    messages: ChatMessage[],
    tools: FunctionSchema[],
    options?: {
      onDelta?: (text: string) => void
      onReasoning?: (text: string) => void
      /** 流式中首次检测到工具名时立即触发（参数还在生成中） */
      onToolCallStart?: (toolName: string, index: number) => void
      signal?: AbortSignal
      /** 使用的系统提示词，默认为任务模式 */
      systemPrompt?: 'task' | 'code' | 'plan' | 'spec'
      /** 排队状态回调（限免模式下排队时通知前端显示 UI） */
      onQueueUpdate?: (info: { position: number; estimatedWaitMs: number; queueId: string; skipAvailable: boolean }) => void
      /** 会话 ID（用于记录上下文统计缓存，使 computeContextUsage 读到稳定的值） */
      sessionId?: string
    }
  ): Promise<{
    content: string
    reasoning?: string
    toolCalls?: ChatMessage['tool_calls']
  }> {
    const { pro } = this.getClients()
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    const promptMap = {
      task: SYSTEM_PROMPT_TASK,
      code: SYSTEM_PROMPT_CODE,
      plan: SYSTEM_PROMPT_PLAN,
      spec: SYSTEM_PROMPT_SPEC
    }
    const basePrompt = promptMap[options?.systemPrompt ?? 'task']
    const { prompt: systemPrompt, memoryIds, skillIds } = await this.buildSystemPrompt(
      basePrompt,
      lastUserMsg ? extractTextFromContent(lastUserMsg.content) : ''
    )

    // 记录本次任务实际的系统提示词和工具 schema token 数（供 computeContextUsage 读取）
    // 后台计算，不阻塞 AI 请求
    // 本地模型：工具 schema 不注入 llama 上下文（由系统提示词文字描述），故 schema token 记为 0
    if (options?.sessionId) {
      const isLocalForStats = this.isLocalModelActive()
      void Promise.all([
        countTokens(systemPrompt),
        isLocalForStats ? Promise.resolve(0) : countTokens(JSON.stringify(tools))
      ]).then(([spTokens, tsTokens]) => {
        this.setContextStats(options.sessionId!, spTokens, tsTokens)
      })
    }
    const hasAssistantReply = messages.some((m) => m.role === 'assistant')
    if (!hasAssistantReply) {
      if (memoryIds.length > 0) memoryStore.markAccessed(memoryIds)
      if (skillIds.length > 0) skillsStore.markUsed(skillIds)
    }

    const useThinking = this.deepThinkingEnabled
    const proModel = this.effectiveProModel
    const isKimi = this.isKimiK27Code(proModel)
    const isRelay = this.isRelayMode()
    const isPaidPro = isRelay && proModel === PAID_PRO_MODEL
    const isLocal = this.isLocalModelActive()

    const createParams: Record<string, unknown> = {
      model: proModel,
      messages: [{ role: 'system', content: systemPrompt }, ...messages] as ChatCompletionMessageParam[],
      stream: true,
      stream_options: { include_usage: false }
    }

    if (!isLocal) {
      createParams.tools = tools as unknown as OpenAI.Chat.Completions.ChatCompletionTool[]
    } else {
      // 本地模型：不注入 OpenAI 格式 tools schema（节省上下文，工具由系统提示词描述），
      // 但仍传递工具名列表给 LocalModelClient 用于 <ToolName> 标签解析的白名单校验
      createParams.tools = tools.map((t) => ({ function: { name: t.function.name } }))
    }

    if (this.isLocalModelActive()) {
      createParams.temperature = 0.7
    } else if (isPaidPro) {
      // 付费 pro 模式：支持 thinking（与正常 DeepSeek pro 一致）
      if (useThinking) {
        createParams.reasoning_effort = this.thinkingEffort
        createParams.thinking = { type: 'enabled' }
      } else {
        createParams.thinking = { type: 'disabled' }
        createParams.temperature = 0.2
      }
    } else if (isRelay) {
      // 限免 flash 模式：不支持 thinking 参数，仅传 temperature
      createParams.temperature = 0.3
    } else if (isKimi) {
      // Kimi K2.7 Code：无需（也不应）传入 thinking/temperature 参数
      // 模型始终输出 reasoning_content
    } else if (useThinking) {
      // DeepSeek 扩展参数：开启思考模式 + 控制思考强度
      createParams.reasoning_effort = this.thinkingEffort
      createParams.thinking = { type: 'enabled' }
    } else {
      // deepseek-v4-pro 默认是思考模式，必须显式关闭
      createParams.thinking = { type: 'disabled' }
      createParams.temperature = 0.2
    }

    const useOpenX = this.isOpenXActive && !this.isOpenXProxyActive
    const decoder = useOpenX ? new OpenXDecoder() : null

    // 流式创建+迭代提取为内部函数，支持排队重试
    const runStream = async (): Promise<{ content: string; reasoning: string; toolCallMap: Map<number, { id: string; name: string; args: string }> }> => {
      const stream = await pro.chat.completions.create(
        createParams as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
        { signal: options?.signal }
      )
      let content = ''
      let reasoning = ''
      const toolCallMap = new Map<number, { id: string; name: string; args: string }>()
      try {
        for await (const chunk of stream) {
          const choice = chunk.choices[0]
          if (!choice) continue
          const delta = choice.delta as {
            content?: string | null
            reasoning_content?: string | null
            tool_calls?: Array<{
              index: number
              id?: string
              function?: { name?: string; arguments?: string }
            }>
          }
          // 思考模式：捕获 reasoning_content（不解码，保持原始思考链）
          if (delta?.reasoning_content) {
            reasoning += delta.reasoning_content
            options?.onReasoning?.(delta.reasoning_content)
          }
          if (delta?.content) {
            if (decoder) {
              // OpenX 解码：仅解码 content，避免破坏 tool_calls 的 JSON
              const decoded = decoder.push(delta.content)
              if (decoded) {
                content += decoded
                options?.onDelta?.(decoded)
              }
            } else {
              content += delta.content
              options?.onDelta?.(delta.content)
            }
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index
              if (!toolCallMap.has(idx)) {
                toolCallMap.set(idx, { id: tc.id ?? '', name: '', args: '' })
              }
              const entry = toolCallMap.get(idx)!
              if (tc.id) entry.id = tc.id
              if (tc.function?.name) {
                // 首次获取到工具名时立即触发回调（参数可能还在流式生成中）
                if (!entry.name) {
                  options?.onToolCallStart?.(tc.function.name, idx)
                }
                entry.name += tc.function.name
              }
              if (tc.function?.arguments) entry.args += tc.function.arguments
            }
          }
        }
        // OpenX 流结束：flush 残留缓冲
        if (decoder) {
          const flushed = decoder.flush()
          if (flushed) {
            content += flushed
            options?.onDelta?.(flushed)
          }
          // 记录压缩指标（content 部分的压缩统计，不含 tool_calls arguments）
          const m = decoder.getMetrics()
          if (m.savedChars > 0) {
            logger.info(
              `[AiService] OpenX 压缩生效(chatWithTools)：AI输出 ${m.rawChars} 字符 → 还原 ${m.decodedChars} 字符，节省 ${m.savedChars} 字符（压缩比 ${(m.ratio * 100).toFixed(1)}%）`
            )
          }
        }
      } catch (err) {
        if (options?.signal?.aborted) {
          logger.info('[AiService] chatWithTools 已被用户中断，返回部分内容')
        } else {
          throw err
        }
      }
      return { content, reasoning, toolCallMap }
    }

    // 限免模式：用 withQueueRetry 包装，自动处理排队重试
    // OpenX 代理模式无排队机制，直接执行
    const useQueueRetryTools = isRelay && !this.isOpenXProxyActive
    const { content, reasoning, toolCallMap } = useQueueRetryTools
      ? await this.withQueueRetry(async () => {
          if (decoder) decoder.reset()
          return runStream()
        }, options?.onQueueUpdate, options?.signal)
      : await runStream()

    const toolCalls =
      toolCallMap.size > 0
        ? Array.from(toolCallMap.entries())
            .sort(([a], [b]) => a - b) // 按 index 排序，确保数组索引与流式 index 一致
            .map(([, tc]) => {
              // OpenX 启用时解码 arguments（AI 可能用 OX{} 压缩了 JSON 参数）
              // 解码后校验 JSON 合法性：若解码破坏了 JSON 结构则回退原始 args，避免工具调用失败
              let args = tc.args
              if (useOpenX && tc.args) {
                const decoded = decodeOpenXSync(tc.args)
                try {
                  JSON.parse(decoded)
                  args = decoded
                } catch {
                  // 解码后 JSON 非法（AI 误用 OX{} 或参数含 | 未转义），回退原始未解码参数
                  logger.warn(
                    `[AiService] OpenX 解码后工具参数 JSON 校验失败，回退原始 args：${tc.name}`
                  )
                  // 原始 args 仍需校验：若 AI 原始输出就非法，保持原样交给上层处理
                  args = tc.args
                }
              }
              return {
                id: tc.id || `call_${randomUUID()}`,
                type: 'function' as const,
                function: {
                  name: tc.name,
                  arguments: args
                }
              }
            })
        : undefined

    return { content, reasoning: reasoning || undefined, toolCalls }
  }

  /** 测试连接 */
  async testConnection(): Promise<ConnectionTestResult> {
    // 本地模型：调用 localModelManager 推理测试
    if (this.isLocalModelActive()) {
      const result = await localModelManager.test()
      return {
        ok: result.ok,
        message: result.ok ? `本地模型${result.output ? '：' + result.output.slice(0, 40) : '推理正常'}` : result.message
      }
    }
    // 限免模式：测试中继可达性
    if (this.isRelayMode()) {
      try {
        const { fast } = this.getClients()
        const resp = await fast.chat.completions.create({
          model: this.fastModel,
          messages: [{ role: 'user', content: '回复"连接成功"四个字' }],
          max_tokens: 20
        })
        const text = resp.choices[0]?.message?.content ?? ''
        return {
          ok: true,
          message: `限免模式连接成功（每日 ${RELAY_DAILY_LIMIT} 次，仅 flash 模型）：${text.slice(0, 20)}`
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, message: `限免模式连接失败：${msg}` }
      }
    }

    // 正常模式：先检查 API Key 是否已填写
    const missing = this.validateApiKeys()
    if (missing.length > 0) {
      return { ok: false, message: `未配置 ${missing.join('、')} 的 API Key` }
    }
    try {
      const { fast } = this.getClients()
      const resp = await fast.chat.completions.create({
        model: this.fastModel,
        messages: [{ role: 'user', content: '回复"连接成功"四个字' }],
        max_tokens: 20
      })
      const text = resp.choices[0]?.message?.content ?? ''
      return { ok: true, message: `连接成功：${text.slice(0, 30)}` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, message: msg }
    }
  }

  /**
   * 查询限免模式剩余积分（每日每 IP 上限 RELAY_DAILY_LIMIT，每日首次查询自动重置/补充到上限）
   * 后端按日期重置 used=0，即"每日登录自动加 50 积分，上限 50"。
   * 同时返回付费积分余额（paid 字段，基于 X-Machine-Id 标识用户）。
   * @returns { used, limit, remaining, date, paid } 或 null（查询失败/非限免模式）
   */
  async getRelayQuota(): Promise<RelayQuota | null> {
    if (!this.isRelayMode()) return null
    try {
      // quota 接口在 /api/ai/quota（base 是 SKILL_HUB_BASE_URL，非 /v1）
      const url = `${SKILL_HUB_BASE_URL}/api/ai/quota`
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      try {
        // 注入 X-Machine-Id header，后端据此返回该机器的付费积分余额
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: { 'X-Machine-Id': getMachineId() }
        })
        if (!resp.ok) {
          logger.warn(`[AiService] 查询限免积分失败: HTTP ${resp.status}`)
          return null
        }
        const json = await resp.json()
        if (json?.code !== 0 || !json?.data) {
          logger.warn('[AiService] 限免积分响应格式异常:', JSON.stringify(json).slice(0, 200))
          return null
        }
        // 解析付费积分（后端可能不返回 paid 字段，做兼容处理）
        const paidRaw = json.data.paid
        const paid = paidRaw
          ? {
              balance: Number(paidRaw.balance) || 0,
              earliestExpiringAt: paidRaw.earliestExpiringAt ?? null,
              totalPurchased: Number(paidRaw.totalPurchased) || 0
            }
          : null
        // 同步更新付费余额缓存
        if (paid) {
          this.paidBalanceCache = paid.balance
          paymentService.setCachedPaidQuota({
            balance: paid.balance,
            totalPurchased: paid.totalPurchased,
            totalConsumed: Number(paidRaw?.totalConsumed) || 0,
            firstPurchaseAt: paidRaw?.firstPurchaseAt ?? null,
            lastPurchaseAt: paidRaw?.lastPurchaseAt ?? null,
            earliestExpiringAt: paid.earliestExpiringAt
          })
        }
        return {
          used: Number(json.data.used) || 0,
          limit: Number(json.data.limit) || RELAY_DAILY_LIMIT,
          remaining: Number(json.data.remaining) || 0,
          date: String(json.data.date || ''),
          paid
        }
      } finally {
        clearTimeout(timer)
      }
    } catch (err) {
      logger.warn('[AiService] 查询限免积分异常:', err instanceof Error ? err.message : String(err))
      return null
    }
  }

  /**
   * 压缩历史上下文（自动压缩用，简洁版，500 字以内）
   * @param messages 待压缩的历史消息（不包含系统提示）
   * @returns 一段中文摘要，概括这些消息中的关键信息与执行结果
   */
  async compressHistory(messages: ChatMessage[]): Promise<string> {
    const { fast } = this.getClients()
    const isLocal = this.isLocalModelActive()
    const prompt = `请对以下 AI 与用户的对话/工具执行历史进行高度概括，保留关键事实、执行结果和当前状态。用于后续对话的上下文记忆，控制在 500 字以内，使用中文。`
    // 本地模型截断到 500 字符/条 + max_tokens=400，云端截断到 2000 字符/条 + max_tokens=800
    const maxCharsPerMsg = isLocal ? 500 : 2000
    const maxTokens = isLocal ? 400 : 800
    const historyText = messages
      .map((m) => {
        const prefix = m.role === 'user' ? '用户' : m.role === 'assistant' ? 'AI' : '工具结果'
        const text = extractTextFromContent(m.content)
        return `[${prefix}] ${text.length > maxCharsPerMsg ? text.slice(0, maxCharsPerMsg) + '...' : text}`
      })
      .join('\n\n')

    try {
      const resp = await fast.chat.completions.create({
        model: this.fastModel,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: historyText }
        ],
        temperature: 0.2,
        max_tokens: maxTokens
      })
      const summary = resp.choices[0]?.message?.content?.trim() ?? '（历史上下文已压缩）'
      logger.info(`[AiService] 上下文已压缩：${messages.length} 条消息 -> ${summary.length} 字符${isLocal ? '（本地模型精简模式）' : ''}`)
      return summary
    } catch (err) {
      logger.error('[AiService] 上下文压缩失败:', err)
      // 压缩失败时返回简单摘要，避免中断任务
      return `（此前共 ${messages.length} 条交互记录，已做压缩保留）`
    }
  }

  /**
   * 手动触发的详细上下文总结（用户点击"压缩"按钮时使用）
   * 要求：总结到位、详细，保留关键决策、文件路径、代码位置、待办事项、未解决问题等，便于 AI 后续继续工作。
   * 输出控制在 2000 字左右，使用结构化 Markdown。
   *
   * 本地模型（4K 上下文）特殊处理：使用精简 prompt + 截断历史文本 + 小 max_tokens，
   * 避免长 prompt + 大量历史导致上下文溢出。
   */
  async compressHistoryDetailed(messages: ChatMessage[]): Promise<string> {
    const { fast } = this.getClients()
    const isLocal = this.isLocalModelActive()

    // 本地模型：精简 prompt（~150 token），截断每条消息到 500 字符，max_tokens=600
    // 云端模型：完整 prompt（~800 token），截断每条消息到 6000 字符，max_tokens=2500
    const prompt = isLocal
      ? `请详细总结以下对话历史，保留关键事实、文件路径、执行结果和待办事项。用中文 Markdown 输出，控制在 500 字以内。`
      : `你是一个严谨的上下文压缩助手。请对下方 AI 与用户的对话/工具执行历史做**尽可能详细、到位**的总结，用作后续对话的长期上下文记忆。

输出必须使用中文，结构化 Markdown，包含以下小节（若某节无内容可省略）：
## 1. 任务目标
用户最初的需求、要解决的核心问题。

## 2. 关键决策与结论
已经达成的重要决定、技术选型、方案确认、用户明确表态的事项（必须原原本本保留用户的意图，不得曲解）。

## 3. 已完成的工作
按阶段列出已完成的事情，包括：
- 新建/修改了哪些文件（给出文件路径）
- 修复了哪些 Bug，根因是什么
- 添加了哪些功能
- 关键实现思路

## 4. 当前代码/项目状态
- 相关的文件、模块、函数及作用
- 重要的数据结构、状态字段
- 已通过/失败的测试情况

## 5. 待办事项与未解决问题
尚未完成的任务、已知问题、遗留 Bug、后续待优化点。

## 6. 关键上下文（不可遗漏）
- 关键的文件路径、ID、配置项、环境信息
- 用户反复强调的偏好、约束
- 关键错误日志/异常堆栈摘要
- 涉及到的外部资源/API/凭据引用方式

要求：
- 总结必须具体、可执行，避免空泛（例如"修复了若干问题"是不合格的，要写清楚修了什么、怎么修的）。
- 代码片段、命令、路径、变量名等原样保留，不要意译。
- 总长度控制在 1500~2500 字，宁详勿略。`

    const maxCharsPerMsg = isLocal ? 500 : 6000
    const maxTokens = isLocal ? 600 : 2500
    const historyText = messages
      .map((m) => {
        const prefix = m.role === 'user' ? '用户' : m.role === 'assistant' ? 'AI' : '工具结果'
        const text = extractTextFromContent(m.content)
        return `[${prefix}] ${text.length > maxCharsPerMsg ? text.slice(0, maxCharsPerMsg) + `...(已截断，原长 ${text.length})` : text}`
      })
      .join('\n\n')

    try {
      const resp = await fast.chat.completions.create({
        model: this.fastModel,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: historyText }
        ],
        temperature: 0.2,
        max_tokens: maxTokens
      })
      const summary = resp.choices[0]?.message?.content?.trim() ?? '（历史上下文已详细总结）'
      logger.info(`[AiService] 上下文详细总结完成：${messages.length} 条消息 -> ${summary.length} 字符${isLocal ? '（本地模型精简模式）' : ''}`)
      return summary
    } catch (err) {
      logger.error('[AiService] 上下文详细总结失败:', err)
      return `（手动压缩失败：${err instanceof Error ? err.message : String(err)}。此前共 ${messages.length} 条交互记录，请重试。）`
    }
  }

  /**
   * AI 辅助生成自定义子智能体配置。
   * 用户用自然语言描述需求，AI 生成 {name, description, systemPrompt, triggers, tags} 供用户审核保存。
   * 复用用户的 AI 配置（DeepSeek/Kimi/中继/本地模型），不注入工具。
   * 生成结果不自动保存——交由前端审核后调用 store.add()。
   */
  async generateCustomSubagentConfig(description: string): Promise<GeneratedSubagentConfig | { error: string }> {
    const { fast } = this.getClients()
    const isLocal = this.isLocalModelActive()

    const systemPromptContent = isLocal
      ? `你是子智能体配置生成器。根据用户描述，生成一个自定义子智能体的配置，输出纯 JSON（不要 markdown 代码块）。
JSON 格式：
{"name":"简短中文名","description":"一句话描述","systemPrompt":"角色设定，300字以内","triggers":["触发词1","触发词2"],"tags":["标签1"]}
要求：name 2-8字，systemPrompt 描述专长、行为约束、输出格式。`
      : `你是子智能体配置生成器。根据用户的需求描述，生成一个自定义子智能体（Custom Subagent）的完整配置。

输出**纯 JSON**（不要 markdown 代码块、不要额外解释），格式如下：
{
  "name": "简短中文名称（2-8字，如"代码审查员"）",
  "description": "一句话描述该子智能体的用途（20-50字）",
  "systemPrompt": "角色设定：定义该子智能体的专长、行为约束、输出格式、注意事项。控制在 800 字以内，使用中文。",
  "triggers": ["触发关键词1", "触发关键词2", "..."],
  "tags": ["标签1", "标签2"]
}

要求：
- name 必须简洁有辨识度，能体现子智能体的核心职能
- systemPrompt 要具体、可执行：说明该子智能体擅长什么、应该如何工作、输出什么格式、有哪些约束
- triggers 是 AI 在对话中检测到这些词时优先使用该模板的关键词（5-10个）
- tags 用于分类检索（3-5个）
- 所有字段用中文`

    try {
      const resp = await fast.chat.completions.create({
        model: this.fastModel,
        messages: [
          { role: 'system', content: systemPromptContent },
          { role: 'user', content: description }
        ],
        temperature: 0.4,
        max_tokens: isLocal ? 800 : 2000
      })
      const content = resp.choices[0]?.message?.content?.trim() ?? ''
      // 提取 JSON（兼容被 markdown 代码块包裹的情况）
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return { error: 'AI 返回内容无法解析为 JSON，请重试或手动填写' }
      }
      const parsed = JSON.parse(jsonMatch[0]) as Partial<GeneratedSubagentConfig>

      // 字段校验与默认值
      if (!parsed.name || typeof parsed.name !== 'string') {
        return { error: 'AI 生成的配置缺少 name 字段，请重试或手动填写' }
      }
      if (!parsed.systemPrompt || typeof parsed.systemPrompt !== 'string') {
        return { error: 'AI 生成的配置缺少 systemPrompt 字段，请重试或手动填写' }
      }

      const config: GeneratedSubagentConfig = {
        name: String(parsed.name).slice(0, 30),
        description: String(parsed.description ?? `自定义子智能体: ${parsed.name}`).slice(0, 200),
        systemPrompt: String(parsed.systemPrompt).slice(0, isLocal ? 600 : 2000),
        triggers: Array.isArray(parsed.triggers)
          ? parsed.triggers.filter((t): t is string => typeof t === 'string').slice(0, 15)
          : [],
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.filter((t): t is string => typeof t === 'string').slice(0, 10)
          : [],
        defaultMode: 'foreground',
        defaultMaxRounds: 0
      }
      logger.info(`[AiService] 子智能体配置生成成功: ${config.name} (${config.systemPrompt.length} 字)`)
      return config
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[AiService] 子智能体配置生成失败:', msg)
      return { error: `AI 生成失败: ${msg}` }
    }
  }
}

export const aiService = new AiService()
