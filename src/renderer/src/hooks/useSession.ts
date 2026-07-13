import { useEffect, useCallback, useRef } from 'react'
import { useSessionStore } from '../store/session.store'
import { useChatStore } from '../store/chat.store'
import type { Session } from '@shared/types'

export function useSession(): {
  sessions: Session[]
  currentSessionId: string | null
  loading: boolean
  createSession: () => Promise<void>
  selectSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  refresh: () => Promise<void>
} {
  const sessions = useSessionStore((s) => s.sessions)
  const currentSessionId = useSessionStore((s) => s.currentSessionId)
  const loading = useSessionStore((s) => s.loading)
  const setSessions = useSessionStore((s) => s.setSessions)
  const setCurrent = useSessionStore((s) => s.setCurrent)
  const addSession = useSessionStore((s) => s.addSession)
  const removeSession = useSessionStore((s) => s.removeSession)
  const updateSession = useSessionStore((s) => s.updateSession)
  const setLoading = useSessionStore((s) => s.setLoading)

  const reset = useChatStore((s) => s.reset)
  const setMessages = useChatStore((s) => s.setMessages)

  // 竞态保护：记录最新的会话切换请求 ID，避免旧请求覆盖新请求的结果
  const selectRequestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.session.list()
      setSessions(list)
    } catch (err) {
      console.error('[useSession] refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }, [setSessions, setLoading])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 监听会话标题更新（首条消息后自动重命名）
  useEffect(() => {
    const unsub = window.api.session.onUpdated((payload) => {
      updateSession(payload.id, { title: payload.title })
    })
    return unsub
  }, [updateSession])

  // 监听后台新建会话（触发器/定时任务/手机远控创建的会话需即时显示在侧栏）
  useEffect(() => {
    const unsub = window.api.session.onCreated((session) => {
      // 避免重复添加（前端已通过 createSession 添加过的情况）
      const exists = useSessionStore.getState().sessions.some((s) => s.id === session.id)
      if (!exists) {
        addSession(session)
      }
    })
    return unsub
  }, [addSession])

  const createSession = useCallback(async () => {
    // 如果当前会话正在执行任务（AI 流式输出中），提示用户
    const isStreaming = useChatStore.getState().isStreaming
    if (isStreaming && currentSessionId) {
      const confirmed = window.confirm(
        'AI 正在当前会话执行任务。\n如果切换页面，将不能再次进入该任务会话，直到 AI 完成该任务。\n\n确定要新建会话吗？'
      )
      if (!confirmed) return
      // 锁定原会话，AI 任务完成前不能切回
      useSessionStore.getState().lockSession(currentSessionId)
    }

    const s = await window.api.session.create()
    // 先清空聊天状态，再切换会话，避免出现「新会话 ID + 旧消息」的中间状态。
    // React 18 自动批处理确保 reset + addSession + setCurrent 合并为单次渲染，
    // 消除了虚拟滚动/副作用在不一致数据上的重复计算，解决新建会话无响应问题。
    reset()
    addSession(s)
    setCurrent(s.id)
  }, [addSession, setCurrent, reset, currentSessionId])

  const selectSession = useCallback(
    async (id: string) => {
      // 如果已经是当前会话，不重复加载
      if (currentSessionId === id) return

      // 检查目标会话是否被锁定（AI 正在执行任务，用户已切换走）
      const { lockedSessionIds, lockSession } = useSessionStore.getState()
      if (lockedSessionIds.has(id)) {
        window.alert('该会话的 AI 任务正在执行中，请等待任务完成后再进入。')
        return
      }

      // 如果当前会话正在执行任务（AI 流式输出中），提示用户切换后将无法返回该任务会话
      const isStreaming = useChatStore.getState().isStreaming
      if (isStreaming && currentSessionId) {
        const confirmed = window.confirm(
          'AI 正在当前会话执行任务。\n如果切换页面，将不能再次进入该任务会话，直到 AI 完成该任务。\n\n确定要切换吗？'
        )
        if (!confirmed) return
        // 锁定原会话，AI 任务完成前不能切回
        lockSession(currentSessionId)
      }

      // 生成唯一请求 ID，用于竞态保护
      const requestId = ++selectRequestIdRef.current
      // 先清空聊天状态，再切换会话，避免出现「新会话 ID + 旧消息」的中间状态，
      // 防止虚拟滚动/副作用在不一致数据上重复计算导致界面无响应
      reset()
      setCurrent(id)
      useChatStore.setState({ isLoadingSession: true })

      try {
        const [messages, steps, todos, subagents] = await Promise.all([
          window.api.session.getMessages(id),
          window.api.session.getSteps(id),
          window.api.session.getTodos(id),
          window.api.session.getSubagents(id)
        ])

        // 竞态保护：如果用户在加载期间又切换了其他会话，丢弃本次结果
        if (requestId !== selectRequestIdRef.current) return

        setMessages(messages)
        useChatStore.setState({ steps, todoItems: todos, subagents, isLoadingSession: false })
        // 批量加载 steps 后重建 stepsByMessageId 索引（绕过了 upsertStep 的增量维护）
        useChatStore.getState().rebuildIndexes()

        // 加载完会话后主动拉取上下文使用率，填充右侧详情面板
        // 注意：getContextUsage 返回 Promise（非 IPC 推送），必须用返回值更新 store
        try {
          const usage = await window.api.chat.getContextUsage(id)
          // 竞态保护：确保用户没有在等待期间又切换了会话
          if (requestId === selectRequestIdRef.current && usage) {
            useChatStore.setState({ contextUsage: usage })
          }
        } catch {
          // 拉取失败不影响正常使用，静默忽略
        }
      } catch (err) {
        console.error('[useSession] selectSession load failed:', id, err)
        // 即使失败也设置空数组，避免卡在空白状态
        if (requestId === selectRequestIdRef.current) {
          setMessages([])
          useChatStore.setState({ steps: [], stepsByMessageId: new Map(), todoItems: [], subagents: [], isLoadingSession: false, contextUsage: null })
        }
      }
    },
    [setCurrent, reset, setMessages, currentSessionId]
  )

  const deleteSession = useCallback(
    async (id: string) => {
      await window.api.session.delete(id)
      removeSession(id)
    },
    [removeSession]
  )

  const renameSession = useCallback(
    async (id: string, title: string) => {
      await window.api.session.rename(id, title)
      updateSession(id, { title })
    },
    [updateSession]
  )

  return {
    sessions,
    currentSessionId,
    loading,
    createSession,
    selectSession,
    deleteSession,
    renameSession,
    refresh
  }
}
