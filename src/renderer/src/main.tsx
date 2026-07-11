import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// 捕获启动阶段的错误，避免直接黑屏
window.onerror = (message, source, lineno, colno, error) => {
  console.error('[main.tsx] window.onerror:', message, source, lineno, colno, error)
  const root = document.getElementById('root')
  if (root && root.childElementCount === 0) {
    root.innerHTML = `<div style="color:#c9d1d9;padding:24px;font-family:sans-serif">
      <h2 style="color:#f85149">启动错误</h2>
      <pre style="background:#161b22;padding:16px;border-radius:8px;overflow:auto">${String(
        message
      )}\n${source ?? ''}:${lineno ?? 0}:${colno ?? 0}</pre>
      <p>请打开 DevTools (Ctrl+Shift+I) 查看 Console 详情。</p>
    </div>`
  }
}

window.onunhandledrejection = (event) => {
  console.error('[main.tsx] unhandledrejection:', event.reason)
}

const rootEl = document.getElementById('root') as HTMLElement
if (!rootEl) {
  throw new Error('Root element #root not found')
}

// 移除开机动画：确保至少显示 3.5 秒后淡出
const splashEl = document.getElementById('splash')
const MIN_SPLASH_MS = 3500
const startTime = performance.now()

function removeSplash(): void {
  if (!splashEl) return
  const elapsed = performance.now() - startTime
  const delay = Math.max(0, MIN_SPLASH_MS - elapsed)

  setTimeout(() => {
    splashEl.classList.add('fade-out')
    splashEl.addEventListener('transitionend', () => {
      splashEl.remove()
    }, { once: true })
    // 兜底：0.5秒后强制移除（防止 transitionend 不触发）
    setTimeout(() => {
      if (splashEl.parentNode) splashEl.remove()
    }, 500)
  }, delay)
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// React 渲染完成后移除开机动画
removeSplash()
