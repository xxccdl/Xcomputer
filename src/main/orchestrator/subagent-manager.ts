import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { aiService } from '../ai/ai-service'
import { getToolSchemas } from '../ai/function-schemas'
import { executeToolCall, isHighRisk, toolResultToText } from '../mcp/tool-router'
import { subagentTodoEvents, cleanupSubagentTodoList } from '../tools/local-tools'
import { logger } from '../utils/logger'
import { MAX_SNAPSHOT_TOKENS } from '@shared/constants'
import { settingsStore } from '../store/settings'
import { customSubagentsStore } from '../store/custom-subagents'
import type {
  SubagentInfo,
  SubagentMode,
  SubagentStatus,
  SubagentUpdateEvent,
  TodoItem,
  CustomSubagent
} from '@shared/types'

/** 子代理默认最大循环次数（AI帮选模式下使用，远小于主代理的 1000） */
const SUBAGENT_DEFAULT_MAX_ROUNDS = 50
/** 子代理绝对硬上限（即使用户设置更高也限制在此值，防止单个子代理消耗过多资源） */
const SUBAGENT_HARD_CAP = 200

/** 子代理禁止使用的工具：
 * - Subagent：避免递归创建子代理导致资源失控
 * - AskUser：子代理不应阻塞等待用户输入（尤其是后台子代理）
 */
const SUBAGENT_FORBIDDEN_TOOLS = ['Subagent', 'AskUser']

interface SubagentRuntime {
  info: SubagentInfo
  aborted: boolean
  /** foreground 模式下的 Promise resolver，子代理完成时调用 */
  resolve?: (result: string) => void
  /** foreground 模式下的 Promise rejecter，子代理失败时调用 */
  reject?: (err: Error) => void
  /** 自定义子智能体模板（通过 Subagent 工具 templateName 参数指定） */
  template?: CustomSubagent
}

/** 子代理状态变更事件发射器，供 task-orchestrator 监听并推送到前端 */
export const subagentEvents = new EventEmitter()

/**
 * 子代理管理器：负责子代理的生命周期管理与独立 ReAct 循环运行。
 *
 * 子代理是主代理（TaskOrchestrator）派生的轻量级代理，拥有独立的消息历史和工具循环。
 * - foreground 模式：主代理等待子代理完成并获取结果，适合串行依赖的子任务
 * - background 模式：主代理立即继续执行，子代理在后台运行，完成后通过事件通知
 *
 * 子代理不能创建子代理（避免递归），也不能调用 AskUser（避免阻塞）。
 * 子代理执行高危操作时自动拒绝（避免阻塞主对话流的确认机制）。
 */
class SubagentManager {
  private runtimes = new Map<string, SubagentRuntime>()

  /**
   * 创建并启动子代理
   * @param params.task 子代理要执行的任务描述
   * @param params.mode 运行模式：foreground 等待结果 / background 立即返回
   * @param params.parentSessionId 父会话 ID（用于事件推送和工具调用上下文）
   * @param params.maxRounds 最大循环次数（默认 50，上限 50）
   * @param params.templateName 可选：自定义子智能体模板名称（用户在设置中创建）
   * @returns foreground 模式返回 { id, result }；background 模式返回 { id }
   */
  async create(params: {
    task: string
    mode?: SubagentMode
    parentSessionId: string
    maxRounds?: number
    templateName?: string
  }): Promise<{ id: string; result?: string }> {
    const id = randomUUID()
    // 读取用户配置的子代理最大轮数：0 = AI帮选（AI 自行决定），>0 = 用户指定上限
    const userMaxRounds = settingsStore.get().subagentMaxRounds ?? 0

    // 加载自定义子智能体模板（若指定 templateName）
    let template: CustomSubagent | undefined
    if (params.templateName) {
      template = customSubagentsStore.getByName(params.templateName)
      if (!template) {
        logger.warn(`[Subagent ${id}] 未找到模板 "${params.templateName}"，回退默认子代理行为`)
      } else if (!template.enabled) {
        logger.warn(`[Subagent ${id}] 模板 "${params.templateName}" 已禁用，回退默认子代理行为`)
        template = undefined
      }
    }

    // 计算最大轮数：显式传入 > 模板默认 > 用户全局配置
    const effectiveMaxRoundsHint = params.maxRounds ?? template?.defaultMaxRounds
    const maxRounds = userMaxRounds > 0
      ? Math.min(effectiveMaxRoundsHint ?? userMaxRounds, userMaxRounds, SUBAGENT_HARD_CAP)
      : Math.min(effectiveMaxRoundsHint ?? SUBAGENT_DEFAULT_MAX_ROUNDS, SUBAGENT_HARD_CAP)

    // 运行模式：显式传入优先，否则用模板默认，最后回退 foreground
    const mode = params.mode ?? template?.defaultMode ?? 'foreground'

    const info: SubagentInfo = {
      id,
      parentSessionId: params.parentSessionId,
      task: params.task,
      mode,
      status: 'pending',
      result: null,
      error: null,
      createdAt: Date.now(),
      finishedAt: null,
      rounds: 0,
      maxRounds,
      todoItems: []
    }
    const runtime: SubagentRuntime = { info, aborted: false, template }
    this.runtimes.set(id, runtime)
    logger.info(
      `[Subagent ${id}] 创建子代理 (mode=${mode}, maxRounds=${maxRounds}${template ? `, template=${template.name}` : ''}): ${params.task.slice(0, 80)}`
    )
    this.emitUpdate(info)

    if (mode === 'foreground') {
      // 前台模式：返回 Promise，等待子代理完成后 resolve 结果
      return new Promise<{ id: string; result?: string }>((resolve, reject) => {
        runtime.resolve = (result) => resolve({ id, result })
        runtime.reject = (err) => reject(err)
        // 异步启动 ReAct 循环（不阻塞事件循环）
        void this.runSubagent(runtime).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err)
          logger.error(`[Subagent ${id}] 运行异常:`, msg)
          this.markFailed(id, msg)
          reject(err instanceof Error ? err : new Error(msg))
        })
      })
    }

    // 后台模式：立即返回 ID，异步运行
    void this.runSubagent(runtime).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[Subagent ${id}] 运行异常:`, msg)
      this.markFailed(id, msg)
    })
    return Promise.resolve({ id })
  }

  /**
   * 子代理独立的 ReAct 循环（与主代理的 handleTask 类似但更轻量）
   * - 使用独立的消息历史
   * - 复用 AIService.chatWithTools 和 MCP 工具
   * - 不向主对话流推送 thinking/tool_call 步骤（避免污染主时间线）
   * - 高危操作自动拒绝（子代理无法触发主对话的确认机制）
   */
  private async runSubagent(runtime: SubagentRuntime): Promise<void> {
    const { info } = runtime
    this.setStatus(info.id, 'running')

    // 获取工具列表，过滤掉子代理禁用的工具
    const allTools = await getToolSchemas()
    const tools = allTools.filter(
      (t) => !SUBAGENT_FORBIDDEN_TOOLS.includes(t.function.name)
    )

    // 子代理的独立消息历史
    interface SubagentMessage {
      role: 'system' | 'user' | 'assistant' | 'tool'
      content: string
      tool_call_id?: string
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }

    const messages: SubagentMessage[] = [
      {
        role: 'user',
        content: this.buildSubagentPrompt(runtime)
      }
    ]

    let finalResult = ''

    try {
      while (runtime.info.rounds < info.maxRounds) {
        if (runtime.aborted) {
          this.markCancelled(info.id)
          return
        }

        runtime.info.rounds++
        this.emitUpdate(runtime.info)

        const result = await aiService.chatWithTools(messages, tools, {
          // 子代理的 thinking delta 不推送到前端，避免污染主对话流
          onDelta: () => {}
        })

        // 将 assistant 回复加入历史
        const assistantMsg: SubagentMessage = {
          role: 'assistant',
          content: result.content || ''
        }
        if (result.toolCalls && result.toolCalls.length > 0) {
          assistantMsg.tool_calls = result.toolCalls
        }
        messages.push(assistantMsg)

        // 无工具调用 → 任务完成
        if (!result.toolCalls || result.toolCalls.length === 0) {
          finalResult = result.content
          break
        }

        // 执行每个工具调用
        for (const tc of result.toolCalls) {
          if (runtime.aborted) break

          let toolArgs: Record<string, unknown> = {}
          try {
            toolArgs = JSON.parse(tc.function.arguments || '{}')
          } catch {
            toolArgs = { _raw: tc.function.arguments }
          }

          // 子代理执行高危操作时自动拒绝（避免阻塞主对话的确认机制）
          if (isHighRisk(tc.function.name, toolArgs)) {
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content:
                `子代理无权执行高危操作（${tc.function.name}），已自动拒绝。` +
                `请改用其他非高危方式完成任务，或在结果中说明无法完成的原因。`
            })
            continue
          }

          try {
            const toolResult = await executeToolCall(
              tc.function.name,
              toolArgs,
              info.parentSessionId,
              info.id
            )
            const resultText = this.truncate(
              toolResultToText(toolResult.result),
              MAX_SNAPSHOT_TOKENS * 4
            )
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: resultText
            })
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: `工具执行失败: ${errMsg}`
            })
          }
        }
      }

      if (runtime.aborted) {
        this.markCancelled(info.id)
        return
      }

      // 达到最大轮次仍未完成
      if (runtime.info.rounds >= info.maxRounds && !finalResult) {
        finalResult =
          `子代理已达最大循环次数（${info.maxRounds}），自动停止。` +
          `已执行 ${runtime.info.rounds} 轮，消息历史 ${messages.length} 条。`
        logger.warn(`[Subagent ${info.id}] 达到最大循环次数 ${info.maxRounds}`)
      }

      this.markCompleted(info.id, finalResult || '任务完成（无输出）')
      runtime.resolve?.(finalResult || '任务完成（无输出）')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      this.markFailed(info.id, errorMsg)
      runtime.reject?.(err instanceof Error ? err : new Error(errorMsg))
    } finally {
      // 若子代理因会话清理被中止，延迟删除 runtime（确保最终状态事件已发射）
      if (runtime.aborted) {
        setTimeout(() => {
          this.runtimes.delete(info.id)
          logger.info(`[Subagent ${info.id}] 会话清理后延迟删除 runtime`)
        }, 5000)
      }
    }
  }

  /** 截断过长文本 */
  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text
    return text.slice(0, maxLen) + '\n...(已截断)'
  }

  /**
   * 构建子代理的首条提示词。
   * - 有模板：使用模板的角色设定（systemPrompt）作为主体，附加任务
   * - 无模板：使用默认子代理提示词
   * - 本地模型：截断 systemPrompt 至 600 字以内，防止 4K 上下文溢出
   */
  private buildSubagentPrompt(runtime: SubagentRuntime): string {
    const { info, template } = runtime
    const notes =
      `## 注意事项\n` +
      `- 你不能创建子代理，也不能向用户提问\n` +
      `- 高危操作（PowerShell/Registry/Process kill/File delete）会被自动拒绝，请改用其他方式\n` +
      `- 请高效使用工具，避免不必要的循环`

    if (template) {
      // 自定义模板：注入角色设定
      let systemPrompt = template.systemPrompt
      // 本地模型截断保护（4K 上下文）
      if (aiService.isLocalModelActive() && systemPrompt.length > 600) {
        systemPrompt = systemPrompt.slice(0, 600) + '\n...(已截断)'
        logger.warn(`[Subagent ${info.id}] 本地模型模式，模板 systemPrompt 已截断至 600 字`)
      }
      return (
        `你是一个子代理（${template.name}）。\n\n` +
        `## 角色设定\n${systemPrompt}\n\n` +
        `${notes}\n\n` +
        `## 任务\n${info.task}`
      )
    }

    // 默认子代理提示词
    return (
      `你是一个子代理（Subagent），负责独立完成以下任务。请使用可用的工具执行任务，` +
      `并在完成后用简洁的中文总结执行过程和结果。\n\n` +
      `${notes}\n\n` +
      `## 任务\n${info.task}`
    )
  }

  /** 获取子代理信息 */
  getStatus(id: string): SubagentInfo | undefined {
    return this.runtimes.get(id)?.info
  }

  /** 获取子代理结果（若已完成） */
  getResult(id: string): string | null {
    const rt = this.runtimes.get(id)
    return rt?.info.result ?? null
  }

  /** 列出子代理（可按父会话过滤） */
  list(parentSessionId?: string): SubagentInfo[] {
    const all = Array.from(this.runtimes.values()).map((r) => ({ ...r.info }))
    if (parentSessionId) {
      return all.filter((i) => i.parentSessionId === parentSessionId)
    }
    return all
  }

  /**
   * 等待子代理完成（用于 background 模式后续等待）
   * @param id 子代理 ID
   * @param timeoutMs 超时毫秒，默认 60 秒
   * @returns 子代理结果；超时或子代理不存在/已失败返回 null
   */
  async wait(id: string, timeoutMs = 60000): Promise<string | null> {
    const rt = this.runtimes.get(id)
    if (!rt) return null
    const status = rt.info.status
    if (status === 'completed') return rt.info.result
    if (status === 'failed' || status === 'cancelled') return null

    return new Promise<string | null>((resolve) => {
      const cleanup = (): void => {
        subagentEvents.removeListener('update', handler)
        clearTimeout(timeout)
      }
      const timeout = setTimeout(() => {
        cleanup()
        resolve(null)
      }, timeoutMs)

      const handler = (evt: SubagentUpdateEvent): void => {
        if (evt.subagent.id !== id) return
        const s = evt.subagent.status
        if (s === 'completed' || s === 'failed' || s === 'cancelled') {
          cleanup()
          resolve(s === 'completed' ? evt.subagent.result : null)
        }
      }
      subagentEvents.on('update', handler)
    })
  }

  /** 取消子代理（运行中或待运行时可取消） */
  cancel(id: string): boolean {
    const rt = this.runtimes.get(id)
    if (!rt) return false
    const status = rt.info.status
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      return false
    }
    rt.aborted = true
    logger.info(`[Subagent ${id}] 收到取消请求`)
    return true
  }

  /** 清理指定父会话的所有子代理（会话删除时调用，防止内存泄漏） */
  cleanupSession(parentSessionId: string): void {
    for (const [id, rt] of this.runtimes) {
      if (rt.info.parentSessionId === parentSessionId) {
        if (rt.info.status === 'running' || rt.info.status === 'pending') {
          // 运行中的子代理标记 aborted，等其自行结束后再清理
          // 避免 markCancelled 找不到 runtime 导致状态更新丢失
          rt.aborted = true
          logger.info(`[Subagent ${id}] 会话清理：标记中止，等待自行结束`)
        } else {
          // 已结束的子代理直接清理
          this.runtimes.delete(id)
        }
      }
    }
  }

  private setStatus(id: string, status: SubagentStatus): void {
    const rt = this.runtimes.get(id)
    if (!rt) return
    rt.info.status = status
    this.emitUpdate(rt.info)
  }

  private markCompleted(id: string, result: string): void {
    const rt = this.runtimes.get(id)
    if (!rt) return
    rt.info.status = 'completed'
    rt.info.result = result
    rt.info.finishedAt = Date.now()
    logger.info(`[Subagent ${id}] 任务完成 (${rt.info.rounds} 轮): ${result.slice(0, 80)}`)
    this.emitUpdate(rt.info)
    // 标记模板被使用（使用计数 +1）
    if (rt.template) {
      try {
        customSubagentsStore.markUsed([rt.template.id])
      } catch (err) {
        logger.warn(`[Subagent ${id}] 标记模板使用计数失败:`, err instanceof Error ? err.message : String(err))
      }
    }
    // 延迟清理子代理 todoList（确保前端已收到最终状态推送）
    setTimeout(() => this.cleanupTodoList(id), 10000)
  }

  private markFailed(id: string, error: string): void {
    const rt = this.runtimes.get(id)
    if (!rt) return
    rt.info.status = 'failed'
    rt.info.error = error
    rt.info.finishedAt = Date.now()
    logger.error(`[Subagent ${id}] 任务失败: ${error}`)
    this.emitUpdate(rt.info)
    setTimeout(() => this.cleanupTodoList(id), 10000)
  }

  private markCancelled(id: string): void {
    const rt = this.runtimes.get(id)
    if (!rt) return
    rt.info.status = 'cancelled'
    rt.info.finishedAt = Date.now()
    logger.info(`[Subagent ${id}] 任务已取消`)
    this.emitUpdate(rt.info)
    setTimeout(() => this.cleanupTodoList(id), 10000)
  }

  /** 发射状态更新事件（供 orchestrator 监听推送到前端） */
  private emitUpdate(info: SubagentInfo): void {
    const evt: SubagentUpdateEvent = {
      sessionId: info.parentSessionId,
      subagent: { ...info, todoItems: [...info.todoItems] }
    }
    subagentEvents.emit('update', evt)
  }

  /**
   * 监听子代理 TodoList 变更（独立命名空间，不覆盖主代理清单）。
   * 子代理调用 TodoList 工具时，local-tools 通过 subagentTodoEvents 推送变更，
   * 此处更新对应子代理的 info.todoItems 并 emitUpdate 通知前端。
   * 在模块加载时注册一次（全局监听，按 subagentId 路由到对应 runtime）。
   */
  setupTodoListener(): void {
    subagentTodoEvents.on('change', (payload: { sessionId: string; subagentId: string; items: TodoItem[] }) => {
      const rt = this.runtimes.get(payload.subagentId)
      if (!rt) return
      rt.info.todoItems = payload.items
      this.emitUpdate(rt.info)
    })
  }

  /** 子代理结束时清理其独立的 todoList（防止内存泄漏） */
  private cleanupTodoList(id: string): void {
    cleanupSubagentTodoList(id)
  }
}

export const subagentManager = new SubagentManager()
// 模块加载时注册子代理 TodoList 变更监听（全局一次，按 subagentId 路由）
subagentManager.setupTodoListener()
