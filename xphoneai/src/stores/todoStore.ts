import { create } from 'zustand'

/** 单个任务项 */
export interface TodoItem {
  id: number
  text: string
  /** pending | in_progress | done */
  status: 'pending' | 'in_progress' | 'done'
}

interface TodoState {
  /** 当前任务列表（每次 AI 新对话清空） */
  items: TodoItem[]
  /** 是否可见（有任务时显示） */
  visible: boolean
  /** 创建任务清单（替换） */
  planTasks: (texts: string[]) => void
  /** 更新任务状态 */
  updateTask: (id: number, status: TodoItem['status']) => void
  /** 清空 */
  clear: () => void
}

let nextId = 1

export const useTodoStore = create<TodoState>((set) => ({
  items: [],
  visible: false,

  planTasks: (texts) => {
    const items = texts.map((text) => ({
      id: nextId++,
      text,
      status: 'pending' as const
    }))
    set({ items, visible: items.length > 0 })
  },

  updateTask: (id, status) => {
    set((s) => ({
      items: s.items.map((t) => t.id === id ? { ...t, status } : t)
    }))
  },

  clear: () => set({ items: [], visible: false })
}))
