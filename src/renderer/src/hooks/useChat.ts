import { useEffect } from 'react'
import { useChatStore } from '../store/chat.store'
import { useSessionStore } from '../store/session.store'

/** 订阅主进程推送的流式事件，分发到 store（按当前会话过滤，避免切换会话后收到旧任务事件） */
export function useChatEvents(): void {
  const upsertStep = useChatStore((s) => s.upsertStep)
  const upsertMessage = useChatStore((s) => s.upsertMessage)
  const setStreaming = useChatStore((s) => s.setStreaming)
  const setTodoItems = useChatStore((s) => s.setTodoItems)
  const upsertSubagent = useChatStore((s) => s.upsertSubagent)
  const setContextUsage = useChatStore((s) => s.setContextUsage)
  const setCompressing = useChatStore((s) => s.setCompressing)
  const setMessages = useChatStore((s) => s.setMessages)

  useEffect(() => {
    const unsubStep = window.api.chat.onStep((e) => {
      const currentSessionId = useSessionStore.getState().currentSessionId
      if (e.sessionId !== currentSessionId) return
      upsertStep({
        id: e.stepId,
        sessionId: e.sessionId,
        messageId: e.messageId,
        type: e.type,
        status: e.status,
        content: e.content,
        toolName: e.toolName,
        toolArgs: e.toolArgs,
        toolResult: e.toolResult,
        screenshotPath: e.screenshotPath,
        startedAt: e.timestamp,
        finishedAt: e.type === 'tool_result' || e.type === 'error' || e.type === 'final' ? e.timestamp : undefined,
        error: e.error
      })
    })

    const unsubMsg = window.api.chat.onMessage((m) => {
      const currentSessionId = useSessionStore.getState().currentSessionId
      if (m.sessionId !== currentSessionId) return
      upsertMessage(m)
    })

    const unsubErr = window.api.chat.onError((p) => {
      useSessionStore.getState().unlockSession(p.sessionId)
      const { streamingSessionId } = useChatStore.getState()
      if (p.sessionId === streamingSessionId) {
        setStreaming(false)
      }
      const currentSessionId = useSessionStore.getState().currentSessionId
      if (p.sessionId !== currentSessionId) return
      console.error('[chat error]', p.error)
    })

    const unsubDone = window.api.chat.onDone((p) => {
      useSessionStore.getState().unlockSession(p.sessionId)
      const { streamingSessionId } = useChatStore.getState()
      if (p.sessionId === streamingSessionId) {
        setStreaming(false)
      }
    })

    const unsubTodo = window.api.chat.onTodoUpdate((p) => {
      const currentSessionId = useSessionStore.getState().currentSessionId
      if (p.sessionId !== currentSessionId) return
      setTodoItems(p.items)
    })

    const unsubSubagent = window.api.chat.onSubagentUpdate((p) => {
      const currentSessionId = useSessionStore.getState().currentSessionId
      if (p.sessionId !== currentSessionId) return
      upsertSubagent(p.subagent)
    })

    // 上下文使用率更新
    const unsubUsage = window.api.chat.onContextUsage((u) => {
      const currentSessionId = useSessionStore.getState().currentSessionId
      if (u.sessionId !== currentSessionId) return
      setContextUsage(u)
    })

    // 上下文压缩完成：前端需要重新拉取消息列表（因为老消息已被替换为摘要）
    const unsubCompressed = window.api.chat.onContextCompressed(async (p) => {
      setCompressing(false)
      const currentSessionId = useSessionStore.getState().currentSessionId
      if (p.sessionId !== currentSessionId) return
      try {
        const [messages, steps, todos, subagents] = await Promise.all([
          window.api.session.getMessages(p.sessionId),
          window.api.session.getSteps(p.sessionId),
          window.api.session.getTodos(p.sessionId),
          window.api.session.getSubagents(p.sessionId)
        ])
        setMessages(messages)
        useChatStore.setState({ steps, todoItems: todos, subagents })
        // 批量重载 steps 后重建 stepsByMessageId 索引
        useChatStore.getState().rebuildIndexes()
      } catch (err) {
        console.error('[useChat] 压缩后重载消息失败:', err)
      }
    })

    return () => {
      unsubStep()
      unsubMsg()
      unsubErr()
      unsubDone()
      unsubTodo()
      unsubSubagent()
      unsubUsage()
      unsubCompressed()
    }
  }, [upsertStep, upsertMessage, setStreaming, setTodoItems, upsertSubagent, setContextUsage, setCompressing, setMessages])
}

/** 发送消息 */
export function useSend(): (text: string) => Promise<void> {
  const setStreaming = useChatStore((s) => s.setStreaming)

  return async (text: string) => {
    // 用 getState() 实时读取，避免闭包捕获旧值导致无会话时点击示例不发送
    const sessionId = useSessionStore.getState().currentSessionId
    if (!sessionId || !text.trim()) return
    setStreaming(true, sessionId)
    // 清空当前显示的步骤（历史步骤已持久化，切换会话时会重新加载）
    useChatStore.getState().clearSteps()
    // 用户消息由主进程保存后通过 CHAT_MESSAGE 事件推送到前端，避免前后端各插入一次导致重复
    await window.api.chat.send(sessionId, text)
  }
}
