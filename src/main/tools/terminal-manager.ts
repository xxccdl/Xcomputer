import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import { logger } from '../utils/logger'

interface TerminalSession {
  id: string
  process: ChildProcessWithoutNullStreams
  shell: string
  cwd: string
  cols: number
  rows: number
  output: string
  createdAt: number
  lastActivity: number
  isRunning: boolean
}

const MAX_OUTPUT_LENGTH = 50000
const MAX_SESSIONS = 8

class TerminalManager {
  private sessions = new Map<string, TerminalSession>()

  /** 创建后台终端 */
  create(opts: {
    shell?: string
    cwd?: string
    cols?: number
    rows?: number
  }): { terminalId: string; shell: string; cwd: string } {
    if (this.sessions.size >= MAX_SESSIONS) {
      // 关闭最老的会话
      const oldest = [...this.sessions.values()].sort(
        (a, b) => a.lastActivity - b.lastActivity
      )[0]
      if (oldest) this.close(oldest.id)
    }

    const id = randomUUID()
    const shell = opts.shell ?? process.env.ComSpec ?? 'cmd.exe'
    const cwd = opts.cwd ?? process.cwd()
    const cols = opts.cols ?? 80
    const rows = opts.rows ?? 24

    const child = spawn(shell, [], {
      cwd,
      env: {
        ...process.env,
        // 让 cmd 输出更可预测
        PROMPT: '$P$G'
      },
      windowsHide: true,
      shell: false
    })

    const session: TerminalSession = {
      id,
      process: child,
      shell,
      cwd,
      cols,
      rows,
      output: '',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isRunning: true
    }

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString('utf8')
      this.appendOutput(session, text)
    })

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString('utf8')
      this.appendOutput(session, text)
    })

    child.on('exit', (code) => {
      session.isRunning = false
      this.appendOutput(session, `\n[进程已退出，退出码 ${code}]`)
      logger.info(`Terminal ${id} exited with code ${code}`)
    })

    child.on('error', (err) => {
      session.isRunning = false
      this.appendOutput(session, `\n[进程错误: ${err.message}]`)
      logger.error(`Terminal ${id} error:`, err.message)
    })

    this.sessions.set(id, session)
    logger.info(`Terminal created: ${id} (shell=${shell}, cwd=${cwd})`)
    return { terminalId: id, shell, cwd }
  }

  private appendOutput(session: TerminalSession, text: string): void {
    session.output += text
    session.lastActivity = Date.now()
    // 截断过长输出，保留尾部
    if (session.output.length > MAX_OUTPUT_LENGTH) {
      session.output =
        '...(早期输出已截断)...\n' +
        session.output.slice(-MAX_OUTPUT_LENGTH + 30)
    }
  }

  /** 发送按键/命令到终端 */
  send(id: string, data: string): { ok: boolean; error?: string } {
    const session = this.sessions.get(id)
    if (!session) return { ok: false, error: '终端不存在' }
    if (!session.isRunning) return { ok: false, error: '终端进程已退出' }
    try {
      session.process.stdin.write(data)
      session.lastActivity = Date.now()
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  }

  /** 发送命令并自动回车（便捷方法） */
  sendCommand(id: string, command: string): { ok: boolean; error?: string } {
    return this.send(id, command + '\r\n')
  }

  /** 发送特殊按键（如 Ctrl+C、Ctrl+Z） */
  sendKey(id: string, key: string): { ok: boolean; error?: string } {
    const keyMap: Record<string, string> = {
      'ctrl+c': '\x03',
      'ctrl+z': '\x1a',
      'ctrl+d': '\x04',
      enter: '\r\n',
      tab: '\t',
      esc: '\x1b',
      backspace: '\x08',
      space: ' '
    }
    const lowered = key.toLowerCase()
    const code = keyMap[lowered]
    if (!code) return { ok: false, error: `未知按键: ${key}` }
    return this.send(id, code)
  }

  /** 获取终端输出 */
  output(id: string, lines?: number): { output: string; isRunning: boolean } | null {
    const session = this.sessions.get(id)
    if (!session) return null
    let output = session.output
    if (lines && lines > 0) {
      const allLines = output.split('\n')
      output = allLines.slice(-lines).join('\n')
    }
    return { output, isRunning: session.isRunning }
  }

  /** 清空终端输出历史 */
  clear(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    session.output = ''
    return true
  }

  /** 调整终端大小（仅记录，cmd 不支持动态调整） */
  resize(id: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    session.cols = cols
    session.rows = rows
    return true
  }

  /** 关闭终端 */
  close(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    try {
      session.process.kill()
    } catch {
      // ignore
    }
    this.sessions.delete(id)
    logger.info(`Terminal closed: ${id}`)
    return true
  }

  /** 列出所有终端 */
  list(): Array<{
    id: string
    shell: string
    cwd: string
    isRunning: boolean
    createdAt: number
    lastActivity: number
    outputLength: number
  }> {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      shell: s.shell,
      cwd: s.cwd,
      isRunning: s.isRunning,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
      outputLength: s.output.length
    }))
  }

  /** 关闭所有终端（应用退出时调用） */
  closeAll(): void {
    for (const id of this.sessions.keys()) {
      this.close(id)
    }
  }
}

export const terminalManager = new TerminalManager()
