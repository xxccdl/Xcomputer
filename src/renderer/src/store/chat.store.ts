import { create } from 'zustand'
import type { Message, TaskStep, TodoItem, SubagentInfo, ContextUsage } from '@shared/types'

interface ChatState {
  messages: Message[]
  steps: TaskStep[]
  todoItems: TodoItem[]
  subagents: SubagentInfo[]
  isStreaming: boolean
  /** 当前正在流式输出的会话 ID（用于多会话并发时精确判断是否应清除 isStreaming） */
  streamingSessionId: string | null
  isLoadingSession: boolean
  selectedStepId: string | null
  detailPanelOpen: boolean
  /** 当前会话的上下文 token 使用情况 */
  contextUsage: ContextUsage | null
  /** 是否正在执行上下文压缩（显示按钮 loading） */
  isCompressing: boolean
  /** 当前详情面板绑定的会话 ID（确保切换会话时清理上一会话的 usage） */
  activeSessionId: string | null
  /** 流式过程中正在输出的消息（O(1) 更新，不碰 messages 数组，避免每个 token 全量重建） */
  streamingMessage: Message | null
  /** streamingMessage 对应的 messageId，用于快速判断是否走流式快路径 */
  streamingMessageId: string | null
  /** messageId → steps 数组的索引 Map（消除 render 中 O(n×m) filter，改为 O(1) 查表） */
  stepsByMessageId: Map<string, TaskStep[]>

  setMessages: (m: Message[]) => void
  appendMessage: (m: Message) => void
  upsertMessage: (m: Message) => void
  upsertStep: (s: TaskStep) => void
  setTodoItems: (items: TodoItem[]) => void
  upsertSubagent: (s: SubagentInfo) => void
  clearSubagents: () => void
  clearSteps: () => void
  setStreaming: (b: boolean, sessionId?: string | null) => void
  setLoadingSession: (b: boolean) => void
  selectStep: (id: string | null) => void
  setDetailPanelOpen: (b: boolean) => void
  setContextUsage: (u: ContextUsage | null) => void
  setCompressing: (b: boolean) => void
  setActiveSession: (id: string | null) => void
  /** 根据 steps 数组重建 stepsByMessageId 索引（会话加载后调用） */
  rebuildIndexes: () => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  steps: [],
  todoItems: [],
  subagents: [],
  isStreaming: false,
  streamingSessionId: null,
  isLoadingSession: false,
  selectedStepId: null,
  detailPanelOpen: false,
  contextUsage: null,
  isCompressing: false,
  activeSessionId: null,
  streamingMessage: null,
  streamingMessageId: null,
  stepsByMessageId: new Map(),

  setMessages: (m) =>
    set({
      messages: m,
      streamingMessage: null,
      streamingMessageId: null
    }),
  appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  upsertMessage: (m) =>
    set((s) => {
      // 流式热路径：流式中且为 assistant 消息时，直接更新 streamingMessage（O(1)）
      // 避免每个 token 都 findIndex + slice 重建整个 messages 数组
      if (s.isStreaming && m.role === 'assistant') {
        return { streamingMessage: m, streamingMessageId: m.id }
      }
      // 历史消息：正常 upsert 到 messages（用于初次插入、会话加载等非流式场景）
      const idx = s.messages.findIndex((x) => x.id === m.id)
      const messages =
        idx >= 0
          ? [...s.messages.slice(0, idx), m, ...s.messages.slice(idx + 1)]
          : [...s.messages, m]
      return { messages }
    }),
  upsertStep: (step) =>
    set((s) => {
      const idx = s.steps.findIndex((x) => x.id === step.id)
      const steps = idx >= 0 ? [...s.steps.slice(0, idx), step, ...s.steps.slice(idx + 1)] : [...s.steps, step]
      // 同步更新 stepsByMessageId 索引（O(1) 增量，消除 render 中 filter）
      const stepsByMessageId = new Map(s.stepsByMessageId)
      if (step.messageId) {
        const arr = stepsByMessageId.get(step.messageId) ?? []
        const i = arr.findIndex((x) => x.id === step.id)
        if (i >= 0) arr[i] = step
        else arr.push(step)
        stepsByMessageId.set(step.messageId, arr)
      }
      return { steps, stepsByMessageId }
    }),
  setTodoItems: (items) => set({ todoItems: items }),
  upsertSubagent: (subagent) =>
    set((s) => {
      const idx = s.subagents.findIndex((x) => x.id === subagent.id)
      const subagents =
        idx >= 0
          ? [...s.subagents.slice(0, idx), subagent, ...s.subagents.slice(idx + 1)]
          : [...s.subagents, subagent]
      return { subagents }
    }),
  clearSubagents: () => set({ subagents: [] }),
  clearSteps: () => set({ steps: [], stepsByMessageId: new Map() }),
  setStreaming: (b, sessionId) =>
    set((s) => {
      if (!b) {
        // 流式结束：把 streamingMessage 落盘到 messages 数组
        let messages = s.messages
        if (s.streamingMessage) {
          const sm = s.streamingMessage
          const idx = s.messages.findIndex((x) => x.id === sm.id)
          messages =
            idx >= 0
              ? [...s.messages.slice(0, idx), sm, ...s.messages.slice(idx + 1)]
              : [...s.messages, sm]
        }
        return {
          isStreaming: false,
          streamingSessionId: null,
          streamingMessage: null,
          streamingMessageId: null,
          messages
        }
      }
      return {
        isStreaming: true,
        streamingSessionId: sessionId !== undefined ? sessionId : s.streamingSessionId
      }
    }),
  setLoadingSession: (b) => set({ isLoadingSession: b }),
  selectStep: (id) => set({ selectedStepId: id, detailPanelOpen: id !== null }),
  setDetailPanelOpen: (b) => set({ detailPanelOpen: b }),
  setContextUsage: (u) => set({ contextUsage: u }),
  setCompressing: (b) => set({ isCompressing: b }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  rebuildIndexes: () =>
    set((s) => {
      const stepsByMessageId = new Map<string, TaskStep[]>()
      for (const step of s.steps) {
        if (step.messageId) {
          const arr = stepsByMessageId.get(step.messageId) ?? []
          arr.push(step)
          stepsByMessageId.set(step.messageId, arr)
        }
      }
      return { stepsByMessageId }
    }),
  reset: () =>
    set({
      messages: [],
      steps: [],
      todoItems: [],
      subagents: [],
      isStreaming: false,
      streamingSessionId: null,
      selectedStepId: null,
      detailPanelOpen: false,
      contextUsage: null,
      isCompressing: false,
      activeSessionId: null,
      streamingMessage: null,
      streamingMessageId: null,
      stepsByMessageId: new Map()
    })
}))
