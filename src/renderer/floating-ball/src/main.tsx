import React from 'react'
import ReactDOM from 'react-dom/client'
import { FloatingBall } from './FloatingBall'
import './styles.css'

window.onerror = (message, source, lineno, colno, error) => {
  console.error('[floating-ball] window.onerror:', message, source, lineno, colno, error)
}

window.onunhandledrejection = (event) => {
  console.error('[floating-ball] unhandledrejection:', event.reason)
}

const rootEl = document.getElementById('root') as HTMLElement
if (!rootEl) {
  throw new Error('Root element #root not found')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <FloatingBall />
  </React.StrictMode>
)
