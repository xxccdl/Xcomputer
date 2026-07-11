/**
 * 远程控制客户端
 * Xcomputer 桌面端通过 WebSocket 连接到中继服务器，与手机端配对后转发指令和结果
 */

import WebSocket from 'ws'
import net from 'net'
import { randomUUID } from 'crypto'
import QRCode from 'qrcode'
import { IPC_CHANNELS, REMOTE_ORIGIN_URL } from '@shared/constants'
import { getOrchestrator, addRemoteListener, removeRemoteListener } from '../orchestrator/task-orchestrator'
import { sessionsStore } from '../store/sessions'
import { logger } from '../utils/logger'
import type { BrowserWindow } from 'electron'
import type { ClientRequestArgs } from 'http'

/** 中继服务器 WebSocket URL（直连源站 IP，避免 CDN 不转发 3210 端口） */
const RELAY_WS_URL = REMOTE_ORIGIN_URL.replace('http://', 'ws://').replace('https://', 'wss://') + '/remote-ws'

/** 移动端网页 URL（直连源站 IP） */
const MOBILE_PAGE_URL = REMOTE_ORIGIN_URL + '/mobile'
const XPHONEAI_PAGE_URL = REMOTE_ORIGIN_URL + '/xphoneai'

/**
 * 源站 IP — xxccdl.cn 走 EdgeOne CDN，CDN 仅转发 80/443，
 * WebSocket 的 3210 端口需直连源站。通过 createConnection 绕过 CDN。
 */
const RELAY_ORIGIN_IP = '175.27.141.172'

/** 远程控制状态 */
export interface RemoteControlState {
  running: boolean
  pairCode: string | null
  phoneConnected: boolean
  qrUrl: string | null
  qrDataUrl: string | null
}

/** 手机控制指令结果 */
export interface PhoneCommandResult {
  success: boolean
  data: string
  error: string | null
}

type StateListener = (state: RemoteControlState) => void

/** 待响应的手机控制指令 Promise */
interface PendingPhoneCommand {
  resolve: (result: PhoneCommandResult) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

class RemoteControlManager {
  private ws: WebSocket | null = null
  private pairCode: string | null = null
  private phoneConnected = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null
  private stateListeners = new Set<StateListener>()
  private remoteListener: ((channel: string, data: unknown) => void) | null = null
  /** 远程会话 ID */
  private remoteSessionId: string | null = null
  /** QR 码 data URL 缓存 */
  private qrDataUrl: string | null = null
  /** 待响应的手机控制指令 Map: commandId -> PendingPhoneCommand */
  private pendingPhoneCommands = new Map<string, PendingPhoneCommand>()

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  getState(): RemoteControlState {
    return {
      running: this.ws !== null,
      pairCode: this.pairCode,
      phoneConnected: this.phoneConnected,
      qrUrl: this.pairCode ? `${XPHONEAI_PAGE_URL}?code=${this.pairCode}` : null,
      qrDataUrl: this.qrDataUrl
    }
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  private notifyStateChange(): void {
    const state = this.getState()
    for (const listener of this.stateListeners) {
      listener(state)
    }
    // 也通过 IPC 通知渲染进程
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.REMOTE_STATE, state)
    }
  }

  /** 启动远程控制服务 */
  async start(): Promise<RemoteControlState> {
    if (this.ws) {
      return this.getState()
    }

    return new Promise((resolve, reject) => {
      let settled = false
      let pairTimeout: NodeJS.Timeout | null = null

      const safeResolve = (state: RemoteControlState): void => {
        if (settled) return
        settled = true
        if (pairTimeout) clearTimeout(pairTimeout)
        resolve(state)
      }

      const safeReject = (err: unknown): void => {
        if (settled) return
        settled = true
        if (pairTimeout) clearTimeout(pairTimeout)
        // 关闭未完成的 WebSocket，防止后续事件重复触发
        try { ws.close() } catch { /* 忽略 */ }
        if (this.ws === ws) this.ws = null
        reject(err)
      }

      let ws: WebSocket
      try {
        logger.info(`[RemoteControl] 连接中继服务器: ${RELAY_WS_URL}`)
        ws = new WebSocket(`${RELAY_WS_URL}?role=desktop`, {
          // 直连源站 IP 绕过 CDN（CDN 仅转发 80/443，3210 不通）
          createConnection: (opts: ClientRequestArgs) => {
            const port =
              typeof opts.port === 'string' ? parseInt(opts.port, 10) : opts.port ?? 3210
            return net.connect({ host: RELAY_ORIGIN_IP, port, family: 4 })
          },
          // 握手超时：TCP 连接 + WebSocket 升级总共不超过 8 秒
          handshakeTimeout: 8000
        })

        ws.on('open', () => {
          logger.info('[RemoteControl] WebSocket 已连接')
        })

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString())
            // 首条 registered 消息携带配对码（重连时也需更新为新配对码）
            if (msg.type === 'registered' && msg.code) {
              this.pairCode = msg.code
              const qrUrl = `${XPHONEAI_PAGE_URL}?code=${this.pairCode}`
              QRCode.toDataURL(qrUrl, { width: 240, margin: 1, color: { dark: '#0d1117', light: '#ffffff' } })
                .then((dataUrl) => {
                  this.qrDataUrl = dataUrl
                  this.setupRemoteListener()
                  this.notifyStateChange()
                  safeResolve(this.getState())
                })
                .catch((err) => {
                  logger.error('[RemoteControl] QR 码生成失败:', err)
                  this.setupRemoteListener()
                  this.notifyStateChange()
                  safeResolve(this.getState())
                })
              return
            }
            this.handleMessage(msg)
          } catch (err) {
            logger.error('[RemoteControl] 消息解析失败:', err)
          }
        })

        ws.on('close', () => {
          logger.info('[RemoteControl] WebSocket 已关闭')
          // 不调用 cleanup()（会清除 pairCode 导致 scheduleReconnect 直接返回，永远不重连）。
          // 仅清理 ws 引用、listener 和 pending 命令，保留 pairCode 以便重连。
          this.ws = null
          if (this.remoteListener) {
            removeRemoteListener(this.remoteListener)
            this.remoteListener = null
          }
          this.phoneConnected = false
          this.remoteSessionId = null
          // 拒绝所有待响应的手机指令（连接已断开，无法收到响应）
          for (const [, pending] of this.pendingPhoneCommands) {
            clearTimeout(pending.timer)
            pending.reject(new Error('远程控制连接已断开'))
          }
          this.pendingPhoneCommands.clear()
          this.notifyStateChange()
          this.scheduleReconnect()
        })

        ws.on('error', (err) => {
          logger.error('[RemoteControl] WebSocket 错误:', err)
          safeReject(err)
        })

        this.ws = ws

        // 总超时：10 秒未收到配对码则失败
        pairTimeout = setTimeout(() => {
          if (!this.pairCode) {
            safeReject(new Error('连接超时，未收到配对码（请检查服务器是否运行、3210 端口是否开放）'))
          }
        }, 10000)
      } catch (err) {
        if (pairTimeout) clearTimeout(pairTimeout)
        reject(err)
      }
    })
  }

  /** 停止远程控制服务 */
  stop(): void {
    this.cleanup()
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // 忽略
      }
      this.ws = null
    }
    if (this.remoteListener) {
      removeRemoteListener(this.remoteListener)
      this.remoteListener = null
    }
    this.pairCode = null
    this.phoneConnected = false
    this.remoteSessionId = null
    this.qrDataUrl = null
    // 拒绝所有待响应的手机指令
    for (const [, pending] of this.pendingPhoneCommands) {
      clearTimeout(pending.timer)
      pending.reject(new Error('远程控制服务已停止'))
    }
    this.pendingPhoneCommands.clear()
    this.notifyStateChange()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.pairCode) return
    // 如果是用户主动停止，不重连
    if (!this.pairCode) return

    logger.info('[RemoteControl] 5 秒后尝试重连...')
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (!this.pairCode) return // 已停止
      try {
        await this.start()
      } catch (err) {
        logger.error('[RemoteControl] 重连失败:', err)
        this.scheduleReconnect()
      }
    }, 5000)
  }

  /** 设置远程事件监听器，将 orchestrator 事件转发到手机 */
  private setupRemoteListener(): void {
    if (this.remoteListener) return

    this.remoteListener = (channel: string, data: unknown): void => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      if (!this.remoteSessionId) return

      // 只转发当前远程会话的事件
      const payload = data as { sessionId?: string }
      if (payload?.sessionId !== this.remoteSessionId) return

      // 映射 IPC 通道到远程消息类型
      const msgType = this.mapChannelToRemoteType(channel)
      if (msgType) {
        this.send({ type: msgType, payload: this.sanitizeForRemote(data) })
      }
    }

    addRemoteListener(this.remoteListener)
  }

  /** 映射 IPC 通道到远程消息类型 */
  private mapChannelToRemoteType(channel: string): string | null {
    switch (channel) {
      case IPC_CHANNELS.CHAT_MESSAGE:
        return 'chat_message'
      case IPC_CHANNELS.CHAT_STEP:
        return 'chat_step'
      case IPC_CHANNELS.CHAT_DONE:
        return 'chat_done'
      case IPC_CHANNELS.CHAT_ERROR:
        return 'chat_error'
      case IPC_CHANNELS.CHAT_CONFIRM_REQUEST:
        return 'confirm_request'
      case IPC_CHANNELS.CHAT_ASK_REQUEST:
        return 'ask_request'
      default:
        return null
    }
  }

  /** 清理数据中的文件路径等不适合远程传输的内容 */
  private sanitizeForRemote(data: unknown): unknown {
    try {
      const json = JSON.stringify(data)
      // 限制大小（避免大截图等导致 WebSocket 消息过大）
      if (json.length > 50000) {
        return { ...((data as Record<string, unknown>) ?? {}), _truncated: true }
      }
      return JSON.parse(json)
    } catch {
      return { error: 'serialization failed' }
    }
  }

  /** 处理来自手机的消息 */
  private async handleMessage(msg: { type: string; text?: string; requestId?: string; allowed?: boolean; answer?: string; skipped?: boolean; commandId?: string; success?: boolean; data?: string; error?: string }): Promise<void> {
    switch (msg.type) {
      case 'paired':
        logger.info('[RemoteControl] 手机端已配对')
        this.phoneConnected = true
        this.notifyStateChange()
        break

      case 'phone_disconnected':
        logger.info('[RemoteControl] 手机端已断开')
        this.phoneConnected = false
        this.remoteSessionId = null
        this.notifyStateChange()
        break

      case 'command':
        if (msg.text) {
          await this.handleRemoteCommand(msg.text)
        }
        break

      case 'confirm_response':
        if (msg.requestId) {
          getOrchestrator()?.resolveConfirm(msg.requestId, msg.allowed ?? false)
        }
        break

      case 'ask_response':
        if (msg.requestId) {
          getOrchestrator()?.resolveAsk(msg.requestId, msg.answer ?? '', msg.skipped ?? false)
        }
        break

      case 'phone_command_response':
        this.handlePhoneCommandResponse(msg)
        break
    }
  }

  /** 处理手机返回的命令执行响应 */
  private handlePhoneCommandResponse(msg: { commandId?: string; success?: boolean; data?: string; error?: string }): void {
    if (!msg.commandId) return
    const pending = this.pendingPhoneCommands.get(msg.commandId)
    if (!pending) {
      logger.warn(`[RemoteControl] 收到未知的 phone_command_response: ${msg.commandId}`)
      return
    }
    clearTimeout(pending.timer)
    this.pendingPhoneCommands.delete(msg.commandId)
    pending.resolve({
      success: msg.success ?? false,
      data: msg.data ?? '',
      error: msg.error ?? null
    })
  }

  /** 发送手机控制指令并等待响应（AI 通过 PhoneControl 工具调用） */
  async sendPhoneCommand(
    action: string,
    args: Record<string, unknown> = {},
    timeoutMs = 30000
  ): Promise<PhoneCommandResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { success: false, data: '', error: '远程控制服务未启动' }
    }
    if (!this.phoneConnected) {
      return { success: false, data: '', error: '手机未连接，请先在手机端配对' }
    }

    const commandId = randomUUID()
    logger.info(`[RemoteControl] 发送手机指令: ${action} (id=${commandId})`)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPhoneCommands.delete(commandId)
        logger.warn(`[RemoteControl] 手机指令超时: ${action} (id=${commandId})`)
        resolve({ success: false, data: '', error: `手机指令超时 (${timeoutMs}ms): ${action}` })
      }, timeoutMs)

      this.pendingPhoneCommands.set(commandId, { resolve, reject, timer })

      this.send({
        type: 'phone_command',
        commandId,
        action,
        args
      })
    })
  }

  /** 检查手机是否已连接 */
  isPhoneConnected(): boolean {
    return this.phoneConnected
  }

  /** 处理来自手机的指令 */
  private async handleRemoteCommand(text: string): Promise<void> {
    const orchestrator = getOrchestrator()
    if (!orchestrator) {
      this.send({ type: 'chat_error', payload: { error: 'AI 服务未初始化' } })
      return
    }

    try {
      // 创建或复用远程会话
      if (!this.remoteSessionId) {
        // sessionsStore.create() 是同步方法，无需 await
        const session = sessionsStore.create()
        this.remoteSessionId = session.id
        await sessionsStore.rename(session.id, `📱 ${text.slice(0, 20)}`)
        // 通知前端新增会话（让侧栏立即显示，否则用户切走后无法切回远程会话）
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send(IPC_CHANNELS.SESSION_CREATED, {
            ...session,
            title: `📱 ${text.slice(0, 20)}`
          })
        }
      }

      // 通知主窗口切换到该会话
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(IPC_CHANNELS.REMOTE_COMMAND, {
          sessionId: this.remoteSessionId,
          text
        })
      }

      // 等待前端完成 selectSession（setCurrent 同步执行，但 IPC 事件传递需要时间）
      // 避免 handleUserMessage 产生的 CHAT_MESSAGE 事件先于 selectSession 到达前端被丢弃
      await new Promise((resolve) => setTimeout(resolve, 50))

      // 执行 AI 任务
      await orchestrator.handleUserMessage(this.remoteSessionId, text)
    } catch (err) {
      logger.error('[RemoteControl] 执行远程指令失败:', err)
      this.send({ type: 'chat_error', payload: { error: String(err) } })
    }
  }

  /** 发送消息到中继服务器 */
  private send(msg: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }
}

export const remoteControl = new RemoteControlManager()

/** 获取远程控制管理器实例 */
export function getRemoteControl(): RemoteControlManager {
  return remoteControl
}

/** 检查手机是否已连接 */
export function isPhoneConnected(): boolean {
  return remoteControl.isPhoneConnected()
}
