import { BrowserWindow } from 'electron'
import { aiService } from '../ai/ai-service'
import { getToolSchemas } from '../ai/function-schemas'
import { executeToolCall, toolResultToText } from '../mcp/tool-router'
import { mcpClient, type McpTool } from '../mcp/mcp-client'
import { isVenvHealthy } from '../mcp/mcp-config'
import { settingsStore } from '../store/settings'
import { sessionsStore } from '../store/sessions'
import { logger } from '../utils/logger'
import { speak } from '../utils/tts'
import { createSelfCheckWindow, getSelfCheckWindow } from '../windows/self-check-window'
import { IPC_CHANNELS, SELF_CHECK_MAX_LOOPS } from '@shared/constants'
import type { SelfCheckItem, SelfCheckProgressPayload, SelfCheckResultPayload } from '@shared/types'
import { buildSelfCheckSystemPrompt, buildSelfCheckUserPrompt } from './self-check-prompt'

/** AI 对话消息（与 ai-service 内部 ChatMessage 结构兼容） */
interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

class SelfCheckRunner {
  private running = false

  get isRunning(): boolean {
    return this.running
  }

  /**
   * 冷启动入口：判断是否需要自检并执行。
   * @param opts.coldStart 是否为冷启动（拿到单实例锁的首次启动）
   */
  async run(opts: { coldStart: boolean }): Promise<void> {
    if (this.running) return
    const settings = settingsStore.get()
    if (!settings.selfCheckEnabled) {
      logger.info('[SelfCheck] selfCheckEnabled=false，跳过自检')
      return
    }
    if (!settings.initialized) {
      // 首次安装未完成向导，本次跳过；init.ipc 完成后会再调 run
      logger.info('[SelfCheck] initialized=false，跳过本次自检，等待向导完成')
      return
    }
    if (!opts.coldStart) return
    await this.execute()
  }

  /** 真正执行自检（由 run 或 init.ipc 调用） */
  private async execute(): Promise<void> {
    this.running = true
    const items: SelfCheckItem[] = []
    try {
      // 1. TTS 朗读
      speak('自检开始，请稍后')

      // 2. 创建弹窗
      const win = createSelfCheckWindow()
      await this.waitForWindowLoad(win)

      // 3. 程序化预检阶段
      this.pushProgress(win, { phase: 'pre-check', message: '检查 MCP 虚拟环境...' })
      const venvOk = isVenvHealthy()
      items.push({
        name: 'venv 健康',
        status: venvOk ? 'pass' : 'fail',
        detail: venvOk ? 'OK' : '.venv 不可用'
      })

      this.pushProgress(win, { phase: 'pre-check', message: '连接 MCP 服务器...' })
      let mcpTools: McpTool[] = []
      try {
        const testResult = await mcpClient.testConnection()
        items.push({
          name: 'MCP 连接',
          status: testResult.ok ? 'pass' : 'fail',
          detail: testResult.message.slice(0, 80)
        })
        if (testResult.ok) {
          mcpTools = await mcpClient.listTools()
          items.push({
            name: 'MCP 工具列表',
            status: 'pass',
            detail: `${mcpTools.length} 个工具`
          })
        }
      } catch (e) {
        items.push({
          name: 'MCP 连接',
          status: 'fail',
          detail: String(e).slice(0, 80)
        })
      }

      // 4. API key 检查 → 决定是否进入 AI 阶段
      // 自检场景宽松：只要配置了任一提供商的 API Key 就执行 AI 自检
      const s = settingsStore.get()
      const deepseekKey = (s.deepseekApiKey ?? '').trim() || (s.apiKey ?? '').trim()
      const kimiKey = (s.kimiApiKey ?? '').trim()
      const hasAnyKey = deepseekKey.length > 0 || kimiKey.length > 0
      if (!hasAnyKey) {
        items.push({
          name: 'AI 自检',
          status: 'skip',
          detail: '未配置任何 API Key'
        })
        this.finish(win, { items, aiSkipped: true })
        return
      }

      // 5. AI 自检阶段
      this.pushProgress(win, {
        phase: 'ai-check',
        message: '启动 AI agent 执行工具调用验证...'
      })
      const aiItems = await this.runAiSelfCheck(mcpTools, win)
      items.push(...aiItems)

      this.finish(win, { items, aiSkipped: false })
    } catch (err) {
      logger.error('[SelfCheck] 执行异常:', err)
      items.push({
        name: '自检流程',
        status: 'fail',
        detail: String(err).slice(0, 80)
      })
      const win = getSelfCheckWindow()
      if (win) this.finish(win, { items, aiSkipped: false, error: String(err) })
    } finally {
      this.running = false
    }
  }

  /** AI agent 循环：构造 prompt、调用 chatWithTools、执行工具、推送进度 */
  private async runAiSelfCheck(
    mcpTools: McpTool[],
    win: BrowserWindow
  ): Promise<SelfCheckItem[]> {
    // 创建隐藏会话（不污染主聊天，标题加前缀便于追溯）
    const session = sessionsStore.create()
    await sessionsStore.rename(session.id, '[系统自检]')

    const tools = await getToolSchemas()
    const messages: AiMessage[] = [
      { role: 'system', content: buildSelfCheckSystemPrompt() },
      { role: 'user', content: buildSelfCheckUserPrompt(mcpTools) }
    ]
    const aiItems: SelfCheckItem[] = []

    for (let loop = 0; loop < SELF_CHECK_MAX_LOOPS; loop++) {
      this.pushProgress(win, {
        phase: 'ai-check',
        message: `第 ${loop + 1} 轮 AI 思考...`
      })

      const result = await aiService.chatWithTools(messages, tools, {
        systemPrompt: 'task',
        onToolCallStart: (toolName) => {
          this.pushProgress(win, {
            phase: 'ai-check',
            message: `调用工具: ${toolName}`
          })
        }
      })

      messages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls
      })

      // 无工具调用 → AI 给出最终结果
      if (!result.toolCalls || result.toolCalls.length === 0) {
        this.parseAiResult(result.content, aiItems)
        break
      }

      // 执行每个工具调用
      for (const tc of result.toolCalls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments || '{}')
        } catch {
          /* ignore parse error */
        }

        const toolResult = await executeToolCall(tc.function.name, args, session.id)
        const text = toolResultToText(toolResult.result)
        const isFail = !!toolResult.error || !!toolResult.result.isError
        aiItems.push({
          name: tc.function.name,
          status: isFail ? 'fail' : 'pass',
          detail: (toolResult.error ?? text).slice(0, 80)
        })
        this.pushProgress(win, {
          phase: 'ai-check',
          message: `${tc.function.name}: ${isFail ? '失败' : '通过'}`
        })
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: text.slice(0, 2000)
        })
      }
    }

    return aiItems
  }

  /** 解析 AI 最终输出的 JSON 汇总（失败则忽略，aiItems 已含每工具结果） */
  private parseAiResult(content: string, aiItems: SelfCheckItem[]): void {
    try {
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) return
      const parsed = JSON.parse(match[0]) as {
        passed?: string[]
        failed?: Array<{ tool: string; error: string }>
        skipped?: string[]
      }
      // 如果 AI 汇总中标记了失败项，覆盖 aiItems 中对应项的 detail
      if (parsed.failed && parsed.failed.length > 0) {
        for (const f of parsed.failed) {
          const existing = aiItems.find((i) => i.name === f.tool)
          if (existing && existing.status === 'pass') {
            existing.status = 'fail'
            existing.detail = f.error.slice(0, 80)
          }
        }
      }
    } catch {
      /* JSON 解析失败，忽略，使用 aiItems 明细 */
    }
  }

  /** 等待窗口完成加载 */
  private waitForWindowLoad(win: BrowserWindow): Promise<void> {
    return new Promise((resolve) => {
      if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', () => resolve())
      } else {
        resolve()
      }
    })
  }

  /** 推送进度到自检弹窗 */
  private pushProgress(
    win: BrowserWindow,
    payload: Omit<SelfCheckProgressPayload, 'timestamp'>
  ): void {
    if (win.isDestroyed()) return
    win.webContents.send(IPC_CHANNELS.SELF_CHECK_PROGRESS, {
      ...payload,
      timestamp: Date.now()
    })
  }

  /** 完成自检，推送结果并延时隐藏弹窗 */
  private finish(
    win: BrowserWindow,
    payload: Omit<SelfCheckResultPayload, 'timestamp'>
  ): void {
    const full: SelfCheckResultPayload = { ...payload, timestamp: Date.now() }
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.SELF_CHECK_COMPLETE, full)
    }
    const passCount = payload.items.filter((i) => i.status === 'pass').length
    const failCount = payload.items.filter((i) => i.status === 'fail').length
    logger.info(
      `[SelfCheck] 完成: 通过 ${passCount} / 失败 ${failCount} / 共 ${payload.items.length} 项` +
        (payload.aiSkipped ? '（AI 自检跳过）' : '')
    )
    // 8 秒后自动隐藏弹窗（保留窗口实例以便重开）
    setTimeout(() => {
      const w = getSelfCheckWindow()
      if (w && !w.isDestroyed()) w.hide()
    }, 8000)
  }
}

export const selfCheckRunner = new SelfCheckRunner()
