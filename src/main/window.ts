import { BrowserWindow, shell, session } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { logger } from './utils/logger'

export function createMainWindow(): BrowserWindow {
  // 始终注册 CSP：开发模式放宽以支持 Vite HMR；生产模式严格限制防止 XSS
  // 安全最佳实践：生产环境必须配置 CSP，特别是当使用 rehype-raw 渲染 AI 输出的原始 HTML 时，
  // 严格的 script-src 'self'（无 'unsafe-inline'）可阻止 AI 输出中的恶意脚本执行
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = is.dev
      ? // 开发模式：允许 Vite HMR 所需的 unsafe-inline/eval 和 localhost 连接
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file: http://localhost:* ws://localhost:*; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*; " +
        "style-src 'self' 'unsafe-inline'; " +
        "connect-src 'self' http://localhost:* ws://localhost:*; " +
        "img-src 'self' data: blob: file: http://localhost:*; " +
        "font-src 'self' data:"
      : // 生产模式：严格限制 — 禁止内联脚本（防止 rehype-raw XSS），仅允许 self
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: file:; " +
        "font-src 'self' data:; " +
        "connect-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'"
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Xcomputer',
    backgroundColor: '#0d1117',
    // Windows 使用完全自定义标题栏；macOS 使用隐藏式原生标题栏
    frame: process.platform !== 'win32',
    titleBarStyle: process.platform === 'win32' ? 'hidden' : 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true, // 后台时降低定时器/动画频率，减少 CPU 占用
      spellcheck: false // 禁用拼写检查（聊天应用不需要，省 CPU）
    }
  })

  window.on('ready-to-show', () => {
    // 支持 --hidden 启动参数（开机自启时静默启动到托盘）
    if (process.argv.includes('--hidden')) {
      logger.info('[Window] --hidden 参数检测到，主窗口启动后隐藏到托盘')
    } else {
      window.show()
      window.focus()
      try {
        window.webContents.focus()
      } catch { /* ignore */ }
    }
  })

  // 窗口每次重新显示后恢复完整键盘焦点
  // 修复：窗口从托盘 hide → show 后，输入框可能获得 :focus 样式却无光标、无法输入
  // 必须先 window.focus() 让 OS 把键盘焦点给窗口，再 webContents.focus() 让渲染进程获得焦点
  window.on('show', () => {
    window.focus()
    setTimeout(() => {
      try {
        window.webContents.focus()
      } catch (err) {
        logger.warn(
          '[Window] show 后 webContents.focus 失败:',
          err instanceof Error ? err.message : String(err)
        )
      }
    }, 50)
  })

  // 捕获渲染进程崩溃/错误，便于排查黑屏
  window.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`Renderer process gone: ${details.reason}`, details)
  })
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logger.error(`Failed to load: ${errorCode} ${errorDescription}`)
  })
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const prefix = `[renderer:${level}] ${sourceId}:${line}`
    if (level === 3) logger.error(prefix, message)
    else if (level === 2) logger.warn(prefix, message)
    else logger.info(prefix, message)
  })

  // 外部链接用系统浏览器打开
  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
