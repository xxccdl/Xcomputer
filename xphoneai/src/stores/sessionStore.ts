import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'
import * as Device from 'expo-device'
import { CommandExecutor } from '@/services/CommandExecutor'
import { ToolRegistry } from '@/services/ToolRegistry'
import { AIService, type DSMessage, type ToolStep } from '@/services/AIService'
import { getApiKey, setApiKey as saveApiKey, deleteApiKey } from '@/services/SecureStorage'
import { useTodoStore } from '@/stores/todoStore'
import { useRecordStore, type ScreenshotRecord } from '@/stores/recordStore'
import {
  startFloatingService as nativeStartFloating,
  updateFloatingState,
  sendTaskDoneNotification,
  canDrawOverlays
} from '@/services/NativeXphoneai'

const STORAGE_KEY = 'xphoneai_sessions_v2'

/** 消息段落（文本 / 工具步骤交替） */
export interface MessageSegment {
  type: 'text' | 'steps'
  content?: string
  steps?: ToolStep[]
}

/** UI 展示消息 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'steps'
  content: string
  steps?: ToolStep[]
  segments?: MessageSegment[]
  error?: boolean
  timestamp: number
  /** 操作录屏截图（文件路径） */
  screenshots?: ScreenshotRecord[]
}

/** 会话 */
export interface Session {
  id: string
  title: string
  messages: ChatMessage[]
  history: DSMessage[]
  createdAt: number
  updatedAt: number
}

interface SessionState {
  sessions: Record<string, Session>
  sessionOrder: string[]
  currentSessionId: string | null
  loading: boolean
  thinking: string | null
  /** AI 推理过程文本（DeepSeek reasoning_content 流式增量） */
  reasoning: string | null
  apiKey: string | null
  aiService: AIService | null
  /** 流式生成中，当前 assistant 消息 id */
  streamingId: string | null

  init: () => void
  createSession: () => string
  switchSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  sendMessage: (text: string) => Promise<void>
  stopGeneration: () => void
  clearAllSessions: () => Promise<void>
  loadApiKey: () => Promise<void>
  saveKey: (key: string) => Promise<void>
  clearKey: () => Promise<void>
}

let executor: CommandExecutor | null = null
let toolRegistry: ToolRegistry | null = null

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 高危操作确认弹窗 */
function confirmDialog(action: string, args: Record<string, unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    const argsStr = Object.entries(args)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
    Alert.alert(
      '确认操作',
      `AI 请求执行高危操作：\n\n${action}\n${argsStr}\n\n是否允许？`,
      [
        { text: '拒绝', style: 'cancel', onPress: () => resolve(false) },
        { text: '允许', style: 'destructive', onPress: () => resolve(true) }
      ]
    )
  })
}

/** 当前会话消息（用于 UI） */
export function useCurrentMessages(): ChatMessage[] {
  return useSessionStore((s) => {
    const session = s.currentSessionId ? s.sessions[s.currentSessionId] : null
    return session?.messages ?? []
  })
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: {},
  sessionOrder: [],
  currentSessionId: null,
  loading: false,
  thinking: null,
  reasoning: null,
  apiKey: null,
  aiService: null,
  streamingId: null,

  init: () => {
    if (!executor) executor = new CommandExecutor()
    if (!toolRegistry) toolRegistry = new ToolRegistry(executor)
    const deviceInfo = {
      brand: Device.brand || 'Unknown',
      model: Device.modelName || 'Unknown',
      osVersion: Device.osVersion || 'Unknown'
    }
    let ai = get().aiService
    if (!ai) {
      ai = new AIService(toolRegistry, deviceInfo)
      set({ aiService: ai })
    }
    loadPersisted(set)
    get().loadApiKey()
  },

  createSession: () => {
    const id = genId()
    const now = Date.now()
    const session: Session = {
      id,
      title: '新会话',
      messages: [],
      history: [],
      createdAt: now,
      updatedAt: now
    }
    set((s) => ({
      sessions: { ...s.sessions, [id]: session },
      sessionOrder: [id, ...s.sessionOrder],
      currentSessionId: id
    }))
    persist(get)
    return id
  },

  switchSession: (id) => {
    if (get().sessions[id]) {
      set({ currentSessionId: id })
    }
  },

  deleteSession: (id) => {
    set((s) => {
      const sessions = { ...s.sessions }
      delete sessions[id]
      const sessionOrder = s.sessionOrder.filter((sid) => sid !== id)
      let currentSessionId = s.currentSessionId
      if (currentSessionId === id) {
        currentSessionId = sessionOrder[0] ?? null
      }
      return { sessions, sessionOrder, currentSessionId }
    })
    persist(get)
  },

  renameSession: (id, title) => {
    set((s) => {
      const session = s.sessions[id]
      if (!session) return s
      return {
        sessions: { ...s.sessions, [id]: { ...session, title, updatedAt: Date.now() } }
      }
    })
    persist(get)
  },

  sendMessage: async (text) => {
    const { aiService, currentSessionId, loading, streamingId } = get()
    if (!aiService) return
    if (!text.trim()) return
    // 异常状态保护：如果 loading 为 true 但无 streamingId，可能是之前任务卡住
    if (loading && !streamingId) {
      console.warn('[Session] 检测到异常 loading 状态，强制重置')
      set({ loading: false, thinking: null, reasoning: null })
    }
    if (loading) return

    // 确保有会话
    let sessionId = currentSessionId
    if (!sessionId || !get().sessions[sessionId]) {
      sessionId = get().createSession()
    }

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    }
    const assistantId = genId()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    }

    // 首条消息生成标题
    const session = get().sessions[sessionId]
    const isFirst = session.messages.length === 0
    const newTitle = isFirst ? text.slice(0, 20) : session.title

    set((s) => {
      const sess = s.sessions[sessionId!]
      if (!sess) return s
      return {
        sessions: {
          ...s.sessions,
          [sessionId!]: {
            ...sess,
            title: newTitle,
            messages: [...sess.messages, userMsg, assistantMsg],
            updatedAt: Date.now()
          }
        },
        loading: true,
        thinking: '正在思考...',
        streamingId: assistantId
      }
    })

    // 尝试启动悬浮球 + 前台服务
    canDrawOverlays().then((allowed) => {
      if (allowed) nativeStartFloating().catch(() => { /* ignore */ })
    })

    const history = session.history

    const updateAssistant = (patch: Partial<ChatMessage>) => {
      set((s) => {
        const sess = s.sessions[sessionId!]
        if (!sess) return s
        return {
          sessions: {
            ...s.sessions,
            [sessionId!]: {
              ...sess,
              messages: sess.messages.map((m) =>
                m.id === assistantId ? { ...m, ...patch } : m
              ),
              updatedAt: Date.now()
            }
          }
        }
      })
    }

    const result = await aiService.chat(history, text, {
      onThinking: (t) => {
        set({ thinking: t, reasoning: null })
        updateFloatingState('thinking', t).catch(() => { /* ignore */ })
      },
      onReasoning: (delta) => {
        // 流式追加推理文本，封顶 1000 字符避免无限增长导致卡顿
        set((s) => {
          const combined = (s.reasoning || '') + delta
          return { reasoning: combined.length > 1000 ? combined.slice(-1000) : combined }
        })
      },
      onToolStart: (label, argsLabel) => {
        const tip = argsLabel ? `正在执行: ${label} ${argsLabel}` : `正在执行: ${label}`
        set({ thinking: tip, reasoning: null })
        updateFloatingState('tool', label).catch(() => { /* ignore */ })
      },
      onTodoPlan: (tasks) => {
        useTodoStore.getState().planTasks(tasks)
      },
      onTodoUpdate: (id, status) => {
        useTodoStore.getState().updateTask(id, status)
      },
      onToken: (delta) => {
        // 流式追加 content
        set((s) => {
          const sess = s.sessions[sessionId!]
          if (!sess) return s
          return {
            sessions: {
              ...s.sessions,
              [sessionId!]: {
                ...sess,
                messages: sess.messages.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + delta }
                    : m
                )
              }
            },
            thinking: null,
            reasoning: null
          }
        })
      },
      onStep: (step) => {
        updateFloatingState('tool', step.label).catch(() => { /* ignore */ })
        set((s) => {
          const sess = s.sessions[sessionId!]
          if (!sess) return s
          const newMessages = sess.messages.map((m) => {
            if (m.id !== assistantId) return m
            const segments = [...(m.segments || [])]
            // 如果当前有 content，保存为 text 段落并清空（工具调用前的 AI 文本）
            if (m.content) {
              segments.push({ type: 'text', content: m.content })
            }
            // 追加 step 到 steps 段落
            const lastSeg = segments[segments.length - 1]
            if (lastSeg && lastSeg.type === 'steps') {
              segments[segments.length - 1] = {
                ...lastSeg,
                steps: [...(lastSeg.steps || []), step]
              }
            } else {
              segments.push({ type: 'steps', steps: [step] })
            }
            return { ...m, content: '', segments }
          })
          return {
            sessions: {
              ...s.sessions,
              [sessionId!]: { ...sess, messages: newMessages }
            },
            thinking: `✓ ${step.label}完成`,
            reasoning: null
          }
        })
        // 录屏：异步截屏不阻塞 AI 循环
        if (useRecordStore.getState().isRecording && toolRegistry) {
          toolRegistry.execute('screenshot', {}).then((result) => {
            try {
              const parsed = JSON.parse(result)
              if (parsed.image) {
                useRecordStore.getState().addScreenshot(parsed.image, step.label)
              }
            } catch { /* ignore */ }
          }).catch(() => {})
        }
      },
      onDone: () => {
        updateFloatingState('done', '完成').catch(() => { /* ignore */ })
        sendTaskDoneNotification('xphoneai 任务完成', text.slice(0, 30)).catch(() => { /* ignore */ })
        // 如果录屏中，把截图存到消息
        const shots = useRecordStore.getState().stop()
        if (shots.length > 0) {
          updateAssistant({ screenshots: shots })
        }
        set({ thinking: null, reasoning: null, loading: false, streamingId: null })
        // 延迟清空 todo，让用户看到完成状态
        setTimeout(() => useTodoStore.getState().clear(), 3000)
      },
      onError: (err) => {
        updateFloatingState('done', '失败').catch(() => { /* ignore */ })
        updateAssistant({ content: err, error: true })
        sendTaskDoneNotification('xphoneai 任务失败', err.slice(0, 60)).catch(() => { /* ignore */ })
        set({ thinking: null, reasoning: null, loading: false, streamingId: null })
        setTimeout(() => useTodoStore.getState().clear(), 3000)
      },
      onConfirm: confirmDialog
    })

    // 更新 history
    if (result.reply) {
      const newHistory: DSMessage[] = [
        ...history,
        { role: 'user', content: text },
        ...result.messages
      ]
      set((s) => {
        const sess = s.sessions[sessionId!]
        if (!sess) return s
        return {
          sessions: {
            ...s.sessions,
            [sessionId!]: { ...sess, history: newHistory, updatedAt: Date.now() }
          }
        }
      })
      persist(get)
    } else {
      set({ loading: false, streamingId: null })
    }
  },

  stopGeneration: () => {
    const { aiService } = get()
    aiService?.abort()
    set({ loading: false, thinking: null, reasoning: null, streamingId: null })
  },

  clearAllSessions: async () => {
    set({ sessions: {}, sessionOrder: [], currentSessionId: null, thinking: null, reasoning: null, loading: false })
    try {
      await AsyncStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
  },

  loadApiKey: async () => {
    const key = await getApiKey()
    set({ apiKey: key })
  },

  saveKey: async (key) => {
    await saveApiKey(key)
    set({ apiKey: key })
  },

  clearKey: async () => {
    await deleteApiKey()
    set({ apiKey: null })
  }
}))

/** 持久化（截断超大 tool 结果避免 AsyncStorage 写入卡死） */
async function persist(get: () => SessionState): Promise<void> {
  try {
    const { sessions, sessionOrder, currentSessionId } = get()
    // 深拷贝并截断 history 中的大字符串（如 base64 截图）
    const slimSessions: Record<string, Session> = {}
    for (const [id, sess] of Object.entries(sessions)) {
      slimSessions[id] = {
        ...sess,
        history: sess.history.map((m) => {
          if (m.content && m.content.length > 2000) {
            return { ...m, content: m.content.slice(0, 2000) + '...(已截断)' }
          }
          return m
        })
      }
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions: slimSessions, sessionOrder, currentSessionId }))
  } catch (e) {
    console.warn('[Session] 持久化失败:', e)
  }
}

/** 加载持久化数据 */
async function loadPersisted(set: (partial: Partial<SessionState>) => void): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // 迁移旧版单会话数据
      const oldRaw = await AsyncStorage.getItem('xphoneai_session_v1')
      if (oldRaw) {
        const old = JSON.parse(oldRaw)
        if (Array.isArray(old.messages) && old.messages.length > 0) {
          const id = genId()
          const now = Date.now()
          const session: Session = {
            id,
            title: '导入的会话',
            messages: old.messages,
            history: Array.isArray(old.history) ? old.history : [],
            createdAt: now,
            updatedAt: now
          }
          set({ sessions: { [id]: session }, sessionOrder: [id], currentSessionId: id })
        }
      }
      return
    }
    const data = JSON.parse(raw)
    if (data.sessions) set({ sessions: data.sessions })
    if (Array.isArray(data.sessionOrder)) set({ sessionOrder: data.sessionOrder })
    if (data.currentSessionId) set({ currentSessionId: data.currentSessionId })
  } catch (e) {
    console.warn('[Session] 加载失败:', e)
  }
}
