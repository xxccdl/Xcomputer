import { useEffect, useCallback } from 'react'
import { useScheduleStore } from '../store/schedule.store'
import type { ScheduledTask } from '@shared/types'

export function useSchedule(): {
  tasks: ScheduledTask[]
  logs: ReturnType<typeof useScheduleStore.getState>['logs']
  loading: boolean
  refresh: () => Promise<void>
  refreshLogs: () => Promise<void>
  createTask: (task: Omit<ScheduledTask, 'id' | 'createdAt' | 'runCount'>) => Promise<void>
  updateTask: (id: string, patch: Partial<ScheduledTask>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  toggleTask: (id: string, enabled: boolean) => Promise<void>
  runNow: (id: string) => Promise<void>
} {
  const tasks = useScheduleStore((s) => s.tasks)
  const logs = useScheduleStore((s) => s.logs)
  const loading = useScheduleStore((s) => s.loading)
  const setTasks = useScheduleStore((s) => s.setTasks)
  const setLogs = useScheduleStore((s) => s.setLogs)
  const addLog = useScheduleStore((s) => s.addLog)
  const setLoading = useScheduleStore((s) => s.setLoading)
  const upsertTask = useScheduleStore((s) => s.upsertTask)
  const removeTask = useScheduleStore((s) => s.removeTask)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.schedule.list()
      setTasks(list)
    } catch (err) {
      console.error('[useSchedule] refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }, [setTasks, setLoading])

  const refreshLogs = useCallback(async () => {
    try {
      const list = await window.api.schedule.getLogs(100)
      setLogs(list)
    } catch (err) {
      console.error('[useSchedule] refreshLogs failed:', err)
    }
  }, [setLogs])

  useEffect(() => {
    void refresh()
    void refreshLogs()
  }, [refresh, refreshLogs])

  // 监听任务列表变更
  useEffect(() => {
    const unsub = window.api.schedule.onChanged((payload) => {
      setTasks(payload.tasks)
    })
    return unsub
  }, [setTasks])

  // 监听执行日志
  useEffect(() => {
    const unsub = window.api.schedule.onRunLog((log) => {
      addLog(log)
    })
    return unsub
  }, [addLog])

  const createTask = useCallback(
    async (task: Omit<ScheduledTask, 'id' | 'createdAt' | 'runCount'>) => {
      const created = await window.api.schedule.create(task)
      upsertTask(created)
    },
    [upsertTask]
  )

  const updateTask = useCallback(
    async (id: string, patch: Partial<ScheduledTask>) => {
      const updated = await window.api.schedule.update(id, patch)
      if (updated) upsertTask(updated)
    },
    [upsertTask]
  )

  const deleteTask = useCallback(
    async (id: string) => {
      await window.api.schedule.delete(id)
      removeTask(id)
    },
    [removeTask]
  )

  const toggleTask = useCallback(
    async (id: string, enabled: boolean) => {
      const updated = await window.api.schedule.toggle(id, enabled)
      if (updated) upsertTask(updated)
    },
    [upsertTask]
  )

  const runNow = useCallback(async (id: string) => {
    await window.api.schedule.runNow(id)
  }, [])

  return {
    tasks,
    logs,
    loading,
    refresh,
    refreshLogs,
    createTask,
    updateTask,
    deleteTask,
    toggleTask,
    runNow
  }
}
