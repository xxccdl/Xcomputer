import { spawn } from 'child_process'
import { logger } from './logger'

/**
 * 使用 Windows SAPI.SpVoice 异步朗读文本（不阻塞主进程）。
 *
 * 通过独立 PowerShell 子进程调用 SAPI COM 对象，`spawn` + `unref()`
 * 确保朗读期间 Electron 主进程事件循环不受影响。
 * 非 Windows 平台 / 朗读失败时静默降级。
 *
 * @param text 要朗读的文本（内部会转义单引号）
 * @param rate 语速 -10 ~ 10，默认 0
 */
export function speak(text: string, rate = 0): void {
  if (process.platform !== 'win32') return
  // PowerShell 单引号字符串中用 '' 表示一个单引号
  const safe = text.replace(/'/g, "''")
  const script = `$v = New-Object -ComObject SAPI.SpVoice; $v.Rate = ${rate}; $v.Speak('${safe}')`

  try {
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: 'ignore',
      windowsHide: true
    })
    child.on('error', (err) => {
      logger.warn('[TTS] speak failed:', err.message)
    })
    // 允许 Electron 进程退出时不等待此子进程
    child.unref()
  } catch (err) {
    logger.warn('[TTS] spawn failed:', err instanceof Error ? err.message : String(err))
  }
}
