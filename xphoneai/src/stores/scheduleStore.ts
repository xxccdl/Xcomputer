import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SCHEDULE_KEY = 'xphoneai_schedules'

/** 定时任务 */
export interface ScheduleTask {
  id: string
  /** 任务名称 */
  name: string
  /** AI 指令 */
  command: string
  /** 触发类型：once（单次）| interval（间隔）| daily（每日定点） */
  type: 'once' | 'interval' | 'daily'
  /** 间隔分钟数（type=interval） */
  intervalMin?: number
  /** 每日触发时间 HH:MM（type=daily） */
  dailyTime?: string
  /** 单次触发时间戳（type=once） */
  onceTime?: number
  /** 下次执行时间戳 */
  nextRun: number
  /** 是否启用 */
  enabled: boolean
  /** 上次执行时间戳 */
  lastRun?: number
  /** 重试次数 */
  retries: number
}

interface ScheduleState {
  tasks: ScheduleTask[]
  init: () => void
  addTask: (task: Omit<ScheduleTask, 'id' | 'nextRun' | 'enabled' | 'retries'>) => void
  removeTask: (id: string) => void
  toggleTask: (id: string) => void
  markRun: (id: string) => void
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** 计算下次执行时间 */
function calcNextRun(type: ScheduleTask['type'], opts: { intervalMin?: number; dailyTime?: string; onceTime?: number }): number {
  const now = Date.now()
  if (type === 'once') return opts.onceTime || now
  if (type === 'interval') {
    return now + (opts.intervalMin || 60) * 60 * 1000
  }
  if (type === 'daily') {
    const [h, m] = (opts.dailyTime || '09:00').split(':').map(Number)
    const next = new Date()
    next.setHours(h || 9, m || 0, 0, 0)
    if (next.getTime() <= now) next.setDate(next.getDate() + 1)
    return next.getTime()
  }
  return now
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  tasks: [],

  init: () => {
    AsyncStorage.getItem(SCHEDULE_KEY).then((raw) => {
      if (raw) {
        try {
          set({ tasks: JSON.parse(raw) })
        } catch { /* ignore */ }
      }
    }).catch(() => {})
  },

  addTask: (task) => {
    const nextRun = calcNextRun(task.type, task)
    const newTask: ScheduleTask = {
      ...task,
      id: genId(),
      nextRun,
      enabled: true,
      retries: 0
    }
    const tasks = [...get().tasks, newTask]
    set({ tasks })
    persist(tasks)
  },

  removeTask: (id) => {
    const tasks = get().tasks.filter((t) => t.id !== id)
    set({ tasks })
    persist(tasks)
  },

  toggleTask: (id) => {
    const tasks = get().tasks.map((t) => t.id === id ? { ...t, enabled: !t.enabled } : t)
    set({ tasks })
    persist(tasks)
  },

  markRun: (id) => {
    const tasks = get().tasks.map((t) => {
      if (t.id !== id) return t
      const nextRun = calcNextRun(t.type, t)
      return { ...t, lastRun: Date.now(), nextRun, retries: 0 }
    })
    set({ tasks })
    persist(tasks)
  }
}))

function persist(tasks: ScheduleTask[]): void {
  AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(tasks)).catch(() => {})
}

/** 获取当前到期的任务 */
export function getDueTasks(tasks: ScheduleTask[]): ScheduleTask[] {
  const now = Date.now()
  return tasks.filter((t) => t.enabled && t.nextRun <= now)
}
