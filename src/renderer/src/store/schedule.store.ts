import { create } from 'zustand'
import type { ScheduledTask, ScheduleRunLog } from '@shared/types'

interface ScheduleState {
  tasks: ScheduledTask[]
  logs: ScheduleRunLog[]
  loading: boolean

  setTasks: (tasks: ScheduledTask[]) => void
  setLogs: (logs: ScheduleRunLog[]) => void
  addLog: (log: ScheduleRunLog) => void
  setLoading: (b: boolean) => void
  upsertTask: (task: ScheduledTask) => void
  removeTask: (id: string) => void
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  tasks: [],
  logs: [],
  loading: false,

  setTasks: (tasks) => set({ tasks }),
  setLogs: (logs) => set({ logs }),
  addLog: (log) => set((s) => ({ logs: [log, ...s.logs].slice(0, 200) })),
  setLoading: (b) => set({ loading: b }),
  upsertTask: (task) =>
    set((s) => {
      const idx = s.tasks.findIndex((t) => t.id === task.id)
      const tasks =
        idx >= 0
          ? [...s.tasks.slice(0, idx), task, ...s.tasks.slice(idx + 1)]
          : [...s.tasks, task]
      return { tasks }
    }),
  removeTask: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
}))
