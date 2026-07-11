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

  setMessages: (m) => set({ messages: m }),
  appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  upsertMessage: (m) =>
    set((s) => {
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
      return { steps }
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
  clearSteps: () => set({ steps: [] }),
  setStreaming: (b, sessionId) =>
    set((s) => ({
      isStreaming: b,
      streamingSessionId: b ? (sessionId !== undefined ? sessionId : s.streamingSessionId) : null
    })),
  setLoadingSession: (b) => set({ isLoadingSession: b }),
  selectStep: (id) => set({ selectedStepId: id, detailPanelOpen: id !== null }),
  setDetailPanelOpen: (b) => set({ detailPanelOpen: b }),
  setContextUsage: (u) => set({ contextUsage: u }),
  setCompressing: (b) => set({ isCompressing: b }),
  setActiveSession: (id) => set({ activeSessionId: id }),
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
      activeSessionId: null
    })
}))
