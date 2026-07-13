import { useState, useEffect, useRef } from 'react'
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

/** Mini 模式下显示的状态药丸（监听 agent 步骤，显示当前友好状态） */
function MiniStatusBar(): JSX.Element {
  const [statusText, setStatusText] = useState('Xcomputer 正在工作')
  const [isThinking, setIsThinking] = useState(false)
  const loadedRef = useRef(false)

  // 初始加载：拉取当前 agent 状态
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void (async () => {
      try {
        const state = await window.widgetApi.agentGetState()
        if (state.currentStatus) {
          setStatusText(state.currentStatus.text)
          setIsThinking(state.currentStatus.icon === 'thinking')
        } else if (state.isRunning) {
          setStatusText('Xcomputer 正在工作')
        }
      } catch {
        // 静默
      }
    })()
  }, [])

  // 监听 agent 步骤更新（实时刷新状态文案）
  useEffect(() => {
    const unsubStep = window.widgetApi.onAgentStep((step: AgentStepEvent) => {
      if (step.type === 'thinking' || step.type === 'deep_thinking') {
        setStatusText('Xcomputer 正在思考')
        setIsThinking(true)
      } else if (step.type === 'final') {
        setStatusText('任务已完成')
        setIsThinking(false)
      } else if (step.type === 'tool_call' || step.type === 'tool_result') {
        const friendly = getMiniStatusText(step.toolName)
        setStatusText(friendly)
        setIsThinking(false)
      }
    })

    const unsubDone = window.widgetApi.onAgentDone(() => {
      setStatusText('任务已完成')
      setIsThinking(false)
    })

    const unsubError = window.widgetApi.onAgentError(() => {
      setStatusText('任务出错')
      setIsThinking(false)
    })

    return () => {
      unsubStep()
      unsubDone()
      unsubError()
    }
  }, [])

  return (
    <div
      className="mini-status-pill"
      onClick={() => window.widgetApi.expandWidget()}
      title="点击展开"
    >
      <div className="mini-status-content">
        {isThinking ? (
          <span className="mini-thinking-dots">
            <span className="mini-dot" />
            <span className="mini-dot" />
            <span className="mini-dot" />
          </span>
        ) : (
          <span className="mini-working-ring" />
        )}
        <span className="mini-status-text">{statusText}</span>
      </div>
      <span className="mini-expand-hint">点击展开</span>
    </div>
  )
}

/** 工具名 → mini 模式友好状态文案 */
function getMiniStatusText(toolName?: string): string {
  if (!toolName) return '正在执行'
  const map: Record<string, string> = {
    File: '正在操作文件',
    Terminal: '正在执行命令',
    PowerShell: '正在操控电脑',
    Registry: '正在修改注册表',
    Process: '正在管理进程',
    TodoList: '正在规划任务',
    Memory: '正在更新记忆',
    Skill: '正在调用技能',
    SystemInfo: '查看系统信息',
    WebSearch: '正在搜索网络',
    WebFetch: '正在获取网页',
    WindowManager: '正在操作窗口',
    SystemAudio: '正在播放音频',
    ServiceManager: '正在管理服务',
    NetworkTools: '正在检测网络',
    ZipArchive: '正在压缩文件',
    BatchFile: '正在执行批处理',
    Snippet: '正在运行代码',
    SystemOptimizer: '正在优化系统',
    CodeAnalyzer: '正在分析代码',
    PhoneControl: '正在操控手机',
    Subagent: '正在调度子代理'
  }
  return map[toolName] ?? '正在执行'
}

export function WidgetApp(): JSX.Element {
  const [tab, setTab] = useState<Tab>('chat')
  const [isMini, setIsMini] = useState(false)

  // 监听 mini/full 模式切换
  useEffect(() => {
    const unsubMini = window.widgetApi.onMiniMode(() => {
      setIsMini(true)
    })
    const unsubFull = window.widgetApi.onFullMode(() => {
      setIsMini(false)
    })
    return () => {
      unsubMini()
      unsubFull()
    }
  }, [])

  const handleEnterSession = async (sessionId: string): Promise<void> => {
    try {
      await window.widgetApi.loadSession(sessionId)
    } catch (err) {
      console.error('[WidgetApp] 加载会话失败:', err)
    }
    setTab('agent')
  }

  // 始终渲染完整 UI（保持 WidgetAgent 等组件的事件监听器存活），
  // mini 模式下通过 CSS 隐藏完整 UI 并叠加 mini 状态药丸。
  // 这避免了 mini → full 切换时 WIDGET_CONFIRM_REQUEST 事件丢失的问题。
  return (
    <div className={`glass-container ${isMini ? 'mini-mode' : ''}`}>
      {/* 完整 UI（mini 模式下 CSS 隐藏，但组件保持挂载） */}
      <div className={`full-ui ${isMini ? 'hidden' : ''}`}>
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

      {/* Mini 状态药丸（仅 mini 模式可见） */}
      {isMini && <MiniStatusBar />}
    </div>
  )
}
