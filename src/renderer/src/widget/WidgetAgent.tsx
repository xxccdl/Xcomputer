import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Agent 友好状态（不显示具体工具名） */
interface FriendlyStatus {
  text: string
  icon?: 'thinking' | 'working' | 'confirm' | 'done' | 'error'
  detail?: string
}

/** Agent 消息（与主进程 Message 对应） */
interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string | unknown[]
  createdAt: number
}

/** Agent 步骤事件（与 preload 内联类型一致） */
interface AgentStepEvent {
  sessionId: string
  stepId: string
  messageId: string
  type: 'thinking' | 'deep_thinking' | 'tool_call' | 'tool_result' | 'error' | 'final'
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped'
  content: string
  toolName?: string
  toolArgs?: unknown
  toolResult?: unknown
  timestamp: number
  error?: string
}

/** 高危确认请求 */
interface WidgetConfirmRequest {
  requestId: string
  sessionId: string
  toolName: string
  toolArgs: unknown
  reason: string
}

/** Agent 状态（agentGetState 返回） */
interface AgentState {
  sessionId: string | null
  messages: AgentMessage[]
  currentStatus: FriendlyStatus | null
  isRunning: boolean
}

const ICONS = {
  send: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9L22 2z" />
    </svg>
  ),
  stop: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  ),
  sparkle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2z" />
    </svg>
  ),
  plus: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/** 工具名 → 友好状态映射（不显示具体工具名） */
function getToolFriendlyStatus(toolName?: string): FriendlyStatus {
  if (!toolName) return { text: '正在执行', icon: 'working' }
  const map: Record<string, FriendlyStatus> = {
    File: { text: '正在操作文件', icon: 'working' },
    Terminal: { text: '正在执行命令', icon: 'working' },
    PowerShell: { text: '正在操控你的电脑', icon: 'working' },
    Registry: { text: '正在修改注册表', icon: 'working' },
    Process: { text: '正在管理进程', icon: 'working' },
    TodoList: { text: '正在规划任务', icon: 'working' },
    Memory: { text: '正在更新记忆', icon: 'working' },
    Skill: { text: '正在调用技能', icon: 'working' },
    SystemInfo: { text: '正在查看系统信息', icon: 'working' },
    WebSearch: { text: '正在搜索网络', icon: 'working' },
    WebFetch: { text: '正在获取网页', icon: 'working' },
    WindowManager: { text: '正在操作窗口', icon: 'working' },
    SystemAudio: { text: '正在播放音频', icon: 'working' },
    ServiceManager: { text: '正在管理服务', icon: 'working' },
    NetworkTools: { text: '正在检测网络', icon: 'working' },
    ZipArchive: { text: '正在压缩文件', icon: 'working' },
    BatchFile: { text: '正在执行批处理', icon: 'working' },
    Snippet: { text: '正在运行代码片段', icon: 'working' },
    SystemOptimizer: { text: '正在优化系统', icon: 'working' },
    CodeAnalyzer: { text: '正在分析代码', icon: 'working' },
    PhoneControl: { text: '正在操控手机', icon: 'working' },
    Subagent: { text: '正在调度子代理', icon: 'working' }
  }
  return map[toolName] ?? { text: '正在执行', icon: 'working' }
}

/** 从 step 推导友好状态 */
function getFriendlyStatusFromStep(step: AgentStepEvent): FriendlyStatus | null {
  if (step.type === 'thinking' || step.type === 'deep_thinking') {
    return { text: 'Xcomputer 正在思考', icon: 'thinking' }
  }
  if (step.type === 'tool_call' || step.type === 'tool_result') {
    return getToolFriendlyStatus(step.toolName)
  }
  if (step.type === 'error') {
    return { text: '任务出错', icon: 'error', detail: step.error }
  }
  if (step.type === 'final') {
    return null // final 后清理状态
  }
  return null
}

/** 从消息内容中提取纯文本（content 可能是字符串或多模态数组） */
function extractText(content: string | unknown[]): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: 'text'; text: string } => typeof p === 'object' && p !== null && (p as { type: string }).type === 'text')
      .map((p) => p.text)
      .join('\n')
  }
  return String(content)
}

export function WidgetAgent(): JSX.Element {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [currentStatus, setCurrentStatus] = useState<FriendlyStatus | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [confirmBanner, setConfirmBanner] = useState<WidgetConfirmRequest | null>(null)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, currentStatus, confirmBanner, scrollToBottom])

  // 1. 初始加载：拉取现有 agent 状态（恢复任务历史和未完成任务）
  useEffect(() => {
    void loadAgentState()
  }, [])

  async function loadAgentState(): Promise<void> {
    try {
      const state = (await window.widgetApi.agentGetState()) as AgentState
      if (state.sessionId) {
        setMessages(state.messages)
        setCurrentStatus(state.currentStatus)
        setIsRunning(state.isRunning)
      }
    } catch (err) {
      console.error('[WidgetAgent] loadAgentState failed:', err)
    }
  }

  // 2. 监听 agent 事件
  useEffect(() => {
    const unsubStep = window.widgetApi.onAgentStep((step: AgentStepEvent) => {
      // thinking/final 重置状态；tool_call/tool_result 覆盖（工具调用只显示 1 行）
      if (step.type === 'thinking' || step.type === 'deep_thinking') {
        setCurrentStatus({ text: 'Xcomputer 正在思考', icon: 'thinking' })
      } else if (step.type === 'final') {
        setCurrentStatus(null) // 任务完成，清理状态
      } else {
        const friendly = getFriendlyStatusFromStep(step)
        if (friendly) setCurrentStatus(friendly)
      }
      setIsRunning(step.status === 'running' || step.status === 'pending')
    })

    const unsubMsg = window.widgetApi.onAgentMessage((msg: AgentMessage) => {
      setMessages((prev) => [...prev, msg])
    })

    const unsubDone = window.widgetApi.onAgentDone(() => {
      setIsRunning(false)
      setCurrentStatus(null)
    })

    const unsubError = window.widgetApi.onAgentError(({ error }: { sessionId: string; error: string }) => {
      setIsRunning(false)
      setCurrentStatus({ text: '任务出错', icon: 'error', detail: error })
    })

    const unsubConfirm = window.widgetApi.onConfirmRequest((req: WidgetConfirmRequest) => {
      setConfirmBanner(req)
    })

    // 监听确认已解决（超时或 widget 响应后自动关闭 banner）
    const unsubResolved = window.widgetApi.onConfirmResolved(
      ({ requestId }: { requestId: string; allowed: boolean }) => {
        setConfirmBanner((prev) => (prev?.requestId === requestId ? null : prev))
      }
    )

    // 窗口重新显示时刷新状态（恢复任务历史和未完成任务）
    const unsubRefresh = window.widgetApi.onAgentRefresh(() => {
      void loadAgentState()
    })

    return () => {
      unsubStep()
      unsubMsg()
      unsubDone()
      unsubError()
      unsubConfirm()
      unsubResolved()
      unsubRefresh()
    }
  }, [])

  // 3. 发送指令
  const handleSend = async (): Promise<void> => {
    const text = input.trim()
    if (!text || isRunning) return

    setInput('')
    setCurrentStatus({ text: 'Xcomputer 正在思考', icon: 'thinking' })
    setIsRunning(true)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      await window.widgetApi.agentSend(text)
    } catch (err) {
      setIsRunning(false)
      setCurrentStatus({ text: '发送失败', icon: 'error' })
      console.error('[WidgetAgent] send failed:', err)
    }
  }

  // 4. 高危确认响应
  const handleConfirm = async (allowed: boolean): Promise<void> => {
    if (!confirmBanner) return
    await window.widgetApi.respondConfirm(confirmBanner.requestId, allowed)
    setConfirmBanner(null)
  }

  // 5. 新建会话
  const handleNewSession = async (): Promise<void> => {
    await window.widgetApi.agentNewSession()
    setMessages([])
    setCurrentStatus(null)
    setIsRunning(false)
    setConfirmBanner(null)
  }

  const handleStop = (): void => {
    void window.widgetApi.agentStop()
    setIsRunning(false)
    setCurrentStatus(null)
  }

  const adjustTextareaHeight = (): void => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 80) + 'px'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="agent-area">
      <div className="agent-header">
        <span className="agent-title">智能助手</span>
        <button className="new-session-btn" onClick={() => void handleNewSession()} title="新对话">
          {ICONS.plus}
        </button>
      </div>

      <div className="messages-scroll" ref={scrollRef}>
        {messages.length === 0 && !isRunning && !currentStatus ? (
          <div className="empty-state">
            <div className="icon">{ICONS.sparkle}</div>
            <div className="title">XC 智能助手</div>
            <div className="hint">告诉我你想做什么，我会自动操控你的电脑完成</div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.role}`}>
                {msg.role === 'assistant' || msg.role === 'system' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{extractText(msg.content)}</ReactMarkdown>
                ) : (
                  extractText(msg.content)
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* 当前状态条（1 行，工具调用只显示 1 行，一波工具调用后清理） */}
      {currentStatus && (
        <div className={`status-bar ${currentStatus.icon ?? 'working'}`}>
          {currentStatus.icon === 'thinking' && (
            <span className="thinking-dots">
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
            </span>
          )}
          <span className="status-text">{currentStatus.text}</span>
        </div>
      )}

      {/* 高危确认 banner（遇到高危操作时在小组件确认） */}
      {confirmBanner && (
        <div className="confirm-banner">
          <div className="confirm-icon-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="confirm-content">
            <div className="confirm-title">遇到高危操作</div>
            <div className="confirm-desc">{getToolFriendlyStatus(confirmBanner.toolName).text}</div>
          </div>
          <div className="confirm-actions">
            <button className="confirm-deny" onClick={() => void handleConfirm(false)}>
              拒绝
            </button>
            <button className="confirm-allow" onClick={() => void handleConfirm(true)}>
              允许
            </button>
          </div>
        </div>
      )}

      <div className="input-bar">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              adjustTextareaHeight()
            }}
            onKeyDown={handleKeyDown}
            placeholder="描述你想让 Xcomputer 做什么..."
            rows={1}
            disabled={isRunning}
            autoFocus
          />
        </div>
        {isRunning ? (
          <button className="send-btn stop" onClick={handleStop} title="停止">
            {ICONS.stop}
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={() => void handleSend()}
            disabled={!input.trim()}
            title="发送"
          >
            {ICONS.send}
          </button>
        )}
      </div>
    </div>
  )
}
