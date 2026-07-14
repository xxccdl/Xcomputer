import { useState, useEffect, useRef } from 'react'
import type { StepEvent } from '@shared/types'

/** 工具名 → mini 模式友好状态文案（与 widget MiniStatusBar 一致） */
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

/** 主窗口 mini 模式状态药丸（agent 执行中缩为右下角，跟小组件一样逻辑） */
export function MainMiniStatusBar(): JSX.Element {
  const [statusText, setStatusText] = useState('Xcomputer 正在工作')
  const [isThinking, setIsThinking] = useState(false)
  const [isRunning, setIsRunning] = useState(true)
  const miniSessionIdRef = useRef<string | null>(null)

  // 监听 agent 步骤更新（仅 source==='main' 的步骤，过滤掉 widget agent）
  useEffect(() => {
    const unsubStep = window.api.chat.onStep((step: StepEvent) => {
      // 仅处理主窗口 agent 的步骤（source==='main'），忽略 widget agent
      if (step.source === 'widget') return
      // 追踪 mini 模式下的活跃 session
      if (!miniSessionIdRef.current) {
        miniSessionIdRef.current = step.sessionId
      } else if (miniSessionIdRef.current !== step.sessionId) {
        // 不同 session 的步骤，跳过（理论上 mini 模式下只有一个 main session）
        return
      }

      if (step.type === 'thinking' || step.type === 'deep_thinking') {
        setStatusText('Xcomputer 正在思考')
        setIsThinking(true)
        setIsRunning(true)
      } else if (step.type === 'final') {
        setStatusText('任务已完成')
        setIsThinking(false)
        setIsRunning(false)
      } else if (step.type === 'tool_call' || step.type === 'tool_result') {
        const friendly = getMiniStatusText(step.toolName)
        setStatusText(friendly)
        setIsThinking(false)
        setIsRunning(true)
      }
    })

    const unsubDone = window.api.chat.onDone(({ sessionId }: { sessionId: string }) => {
      if (miniSessionIdRef.current && miniSessionIdRef.current !== sessionId) return
      setStatusText('任务已完成')
      setIsThinking(false)
      setIsRunning(false)
    })

    const unsubError = window.api.chat.onError(({ sessionId }: { sessionId: string; error: string }) => {
      if (miniSessionIdRef.current && miniSessionIdRef.current !== sessionId) return
      setStatusText('任务出错')
      setIsThinking(false)
      setIsRunning(false)
    })

    return () => {
      unsubStep()
      unsubDone()
      unsubError()
    }
  }, [])

  return (
    <div
      className="main-mini-pill"
      onClick={() => window.api.window.expandMini()}
      title="点击展开"
    >
      <div className="main-mini-content">
        {isRunning ? (
          isThinking ? (
            <span className="main-mini-dots">
              <span className="main-mini-dot" />
              <span className="main-mini-dot" />
              <span className="main-mini-dot" />
            </span>
          ) : (
            <span className="main-mini-ring" />
          )
        ) : (
          <span className="main-mini-done">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
        <span className="main-mini-text">{statusText}</span>
      </div>
      <span className="main-mini-hint">点击展开</span>
    </div>
  )
}
