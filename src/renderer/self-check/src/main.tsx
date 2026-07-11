import React from 'react'
import ReactDOM from 'react-dom/client'
import { SelfCheckPanel } from './SelfCheckPanel'
import './styles.css'

window.onerror = (message, source, lineno, colno, error) => {
  console.error('[self-check] window.onerror:', message, source, lineno, colno, error)
}

window.onunhandledrejection = (event) => {
  console.error('[self-check] unhandledrejection:', event.reason)
}

const rootEl = document.getElementById('root') as HTMLElement
if (!rootEl) {
  throw new Error('Root element #root not found')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <SelfCheckPanel />
  </React.StrictMode>
)
