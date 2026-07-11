import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { app } from 'electron'
import { buildMcpCommand, buildMcpEnv, rebuildVenv, isVenvHealthy } from './mcp-config'
import { logger } from '../utils/logger'
import { settingsStore } from '../store/settings'

/** 获取用户配置的工具调用超时（毫秒），默认 60 秒 */
function getToolTimeoutMs(): number {
  const sec = settingsStore.get().toolCallTimeoutSec ?? 60
  // 限制在 5-600 秒之间，防止误设导致永远不超时
  const clamped = Math.max(5, Math.min(600, sec))
  return clamped * 1000
}

/**
 * 带超时的 Promise 包装。
 *
 * 原来用 Promise.race + setTimeout 的写法，超时定时器在成功路径上不会被清理，
 * 导致：(1) 定时器残留保持事件循环存活；(2) 定时器触发后产生 unhandledRejection。
 * 此包装在 promise settle（成功或失败）后立即 clearTimeout，彻底消除泄漏。
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    promise.then(
      (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpToolResult {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  >
  isError?: boolean
}

export type McpStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

type StatusListener = (status: McpStatus, detail?: string) => void

class McpClient {
  private client: Client | null = null
  private transport: StdioClientTransport | null = null
  private starting: Promise<void> | null = null
  private restartCount = 0
  private maxRestarts = 3
  private status: McpStatus = 'disconnected'
  private statusListeners = new Set<StatusListener>()

  get connected(): boolean {
    return this.client !== null && this.status === 'connected'
  }

  getStatus(): McpStatus {
    return this.status
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private setStatus(status: McpStatus, detail?: string): void {
    if (this.status === status && !detail) return
    this.status = status
    for (const listener of this.statusListeners) {
      try {
        listener(status, detail)
      } catch {
        // ignore listener errors
      }
    }
  }

  /** 启动 MCP 子进程并建立连接（懒加载，首次调用较慢） */
  async start(): Promise<void> {
    if (this.client && this.status === 'connected') return
    if (this.starting) return this.starting

    this.setStatus('connecting')
    this.starting = this._start()
    try {
      await this.starting
      this.setStatus('connected')
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      this.starting = null
    }
  }

  private async _start(): Promise<void> {
    // 首次启动前检查 .venv 健康性，不健康则自动重建
    if (this.restartCount === 0 && !isVenvHealthy()) {
      logger.warn('.venv 不可用，尝试自动重建...')
      const rebuilt = rebuildVenv((msg) => {
        this.setStatus('connecting', msg)
      })
      if (!rebuilt) {
        throw new Error(
          'MCP 环境自动重建失败。请手动运行 npm run setup:mcp'
        )
      }
      logger.info('.venv 自动重建成功，继续启动 MCP')
    }

    const { command, args } = buildMcpCommand()
    const env = buildMcpEnv()
    logger.info(`Starting MCP server: ${command} ${args.join(' ')}`)

    this.transport = new StdioClientTransport({ command, args, env: env as Record<string, string> })
    this.client = new Client(
      { name: 'xcomputer', version: app.getVersion() },
      { capabilities: {} }
    )

    // 子进程意外退出时自动重启
    this.transport.onerror = (err) => {
      logger.error('MCP transport error:', err)
      this.setStatus('error', String(err))
    }

    // 首次启动超时 180s（uvx 需拉取 Python 依赖），后续使用用户配置值
    const isFirstStart = this.restartCount === 0
    const timeout = isFirstStart ? 180000 : getToolTimeoutMs()

    try {
      await withTimeout(
        this.client.connect(this.transport),
        timeout,
        `MCP 连接超时（${timeout / 1000}s）`
      )
      logger.info('MCP server connected')
      this.restartCount = 0
    } catch (err) {
      // 连接失败时清理已创建的 transport/client，避免资源泄漏
      await this.cleanupResources()

      const errMsg = err instanceof Error ? err.message : String(err)

      // 如果是 connection closed 且尚未重建过，尝试自动重建 .venv 并重试一次
      if (
        (errMsg.includes('connection closed') || errMsg.includes('Connection closed')) &&
        this.restartCount === 0
      ) {
        logger.warn('MCP 连接失败，尝试自动重建 .venv 并重试...')
        const rebuilt = rebuildVenv((msg) => {
          this.setStatus('connecting', msg)
        })
        if (rebuilt) {
          this.restartCount++ // 防止无限重试
          return this._start() // 重试一次
        }
        throw new Error(
          'MCP 连接失败：connection closed\n' +
          '已尝试自动重建 .venv 但失败。请手动运行 npm run setup:mcp'
        )
      }

      throw err
    }
  }

  /** 关闭并清空 transport/client（不触发状态变更） */
  private async cleanupResources(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close()
      } catch (err) {
        logger.error('Error closing MCP transport during cleanup:', err)
      }
    }
    this.client = null
    this.transport = null
  }

  /** 列出可用工具 */
  async listTools(): Promise<McpTool[]> {
    await this.start()
    if (!this.client) throw new Error('MCP 未连接')
    const timeout = getToolTimeoutMs()
    const result = await withTimeout(
      this.client.listTools(),
      timeout,
      `MCP 列出工具超时（${timeout / 1000}s）`
    )
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown> | undefined
    }))
  }

  /** 调用工具（带超时，防止某些 UI 操作 hang 住导致步骤一直转圈） */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    await this.start()
    if (!this.client) throw new Error('MCP 未连接')
    logger.info(`Calling MCP tool: ${name}`, args)
    const timeout = getToolTimeoutMs()
    const result = await withTimeout(
      this.client.callTool({ name, arguments: args }),
      timeout,
      `MCP 工具 ${name} 调用超时（${timeout / 1000}s）`
    )
    return result as unknown as McpToolResult
  }

  /** 停止子进程 */
  async stop(): Promise<void> {
    await this.cleanupResources()
    this.setStatus('disconnected')
    logger.info('MCP server stopped')
  }

  /** 测试连接（用于设置面板） */
  async testConnection(): Promise<{ ok: boolean; message: string; tools?: string[] }> {
    try {
      const tools = await this.listTools()
      return {
        ok: true,
        message: `连接成功，共 ${tools.length} 个工具`,
        tools: tools.map((t) => t.name)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, message: msg }
    }
  }
}

export const mcpClient = new McpClient()
