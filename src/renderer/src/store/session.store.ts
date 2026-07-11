import { create } from 'zustand'
import type { Session } from '@shared/types'

interface SessionState {
  sessions: Session[]
  currentSessionId: string | null
  loading: boolean
  /** 被锁定的会话 ID（AI 正在执行任务，用户已切换走，任务完成前不能切回） */
  lockedSessionIds: Set<string>

  setSessions: (s: Session[]) => void
  setCurrent: (id: string | null) => void
  addSession: (s: Session) => void
  removeSession: (id: string) => void
  updateSession: (id: string, patch: Partial<Session>) => void
  setLoading: (b: boolean) => void
  lockSession: (id: string) => void
  unlockSession: (id: string) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSessionId: null,
  loading: false,
  lockedSessionIds: new Set<string>(),

  setSessions: (s) => set({ sessions: s }),
  setCurrent: (id) => set({ currentSessionId: id }),
  addSession: (s) => set((state) => ({ sessions: [s, ...state.sessions] })),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      currentSessionId: state.currentSessionId === id ? null : state.currentSessionId
    })),
  updateSession: (id, patch) =>
    set((state) => {
      // upsert 语义：若会话不存在则前置插入（兜底，正常流程应通过 addSession 添加）
      const exists = state.sessions.some((s) => s.id === id)
      if (!exists && patch.title) {
        return {
          sessions: [
            {
              id,
              title: patch.title,
              createdAt: patch.createdAt ?? Date.now(),
              updatedAt: patch.updatedAt ?? Date.now(),
              ...patch
            } as Session,
            ...state.sessions
          ]
        }
      }
      return {
        sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s))
      }
    }),
  setLoading: (b) => set({ loading: b }),
  lockSession: (id) =>
    set((state) => {
      if (state.lockedSessionIds.has(id)) return state
      const next = new Set(state.lockedSessionIds)
      next.add(id)
      return { lockedSessionIds: next }
    }),
  unlockSession: (id) =>
    set((state) => {
      if (!state.lockedSessionIds.has(id)) return state
      const next = new Set(state.lockedSessionIds)
      next.delete(id)
      return { lockedSessionIds: next }
    })
}))
