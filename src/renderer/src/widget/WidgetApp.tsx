import { useState } from 'react'
import { WidgetChat } from './WidgetChat'
import { WidgetAgent } from './WidgetAgent'
import { TaskProgress } from './TaskProgress'
import { WidgetCredits } from './WidgetCredits'
import { WidgetSettings } from './WidgetSettings'

type Tab = 'chat' | 'agent' | 'task' | 'credits' | 'settings'

const ICONS = {
  chat: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  agent: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  task: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  credits: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  settings: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

const TABS: Array<{ key: Tab; label: string; icon: JSX.Element }> = [
  { key: 'chat', label: '对话', icon: ICONS.chat },
  { key: 'agent', label: '智能', icon: ICONS.agent },
  { key: 'task', label: '任务', icon: ICONS.task },
  { key: 'credits', label: '积分', icon: ICONS.credits },
  { key: 'settings', label: '设置', icon: ICONS.settings }
]

export function WidgetApp(): JSX.Element {
  const [tab, setTab] = useState<Tab>('chat')

  const handleEnterSession = async (sessionId: string): Promise<void> => {
    try {
      await window.widgetApi.loadSession(sessionId)
    } catch (err) {
      console.error('[WidgetApp] 加载会话失败:', err)
    }
    setTab('agent')
  }

  return (
    <div className="glass-container">
      <div className="widget-header">
        <div className="tab-group">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab-btn ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
              title={t.label}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <button
          className="close-btn"
          onClick={() => window.widgetApi.hide()}
          title="关闭"
        >
          {ICONS.close}
        </button>
      </div>

      {tab === 'chat' && <WidgetChat />}
      {tab === 'agent' && <WidgetAgent />}
      {tab === 'task' && <TaskProgress onEnterSession={handleEnterSession} />}
      {tab === 'credits' && <WidgetCredits />}
      {tab === 'settings' && <WidgetSettings />}
    </div>
  )
}
