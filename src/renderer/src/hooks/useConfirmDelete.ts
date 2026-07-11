import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * 确认删除状态管理 hook。
 *
 * 解决问题：多个模态框/侧边栏中 "点击一次变红 → 再次点击确认删除" 的模式，
 * 原来用 setTimeout 在 3 秒后自动取消确认状态，但定时器未在组件卸载时清理，
 * 可能导致卸载后状态更新和定时器泄漏。
 *
 * 此 hook 统一管理 confirmDeleteId 状态和定时器生命周期，
 * 组件卸载时自动 clearTimeout，确保无泄漏。
 */
export function useConfirmDelete(timeoutMs = 3000): {
  confirmDeleteId: string | null
  /** 设置确认状态并启动自动取消定时器 */
  requestConfirm: (id: string) => void
  /** 立即取消确认状态并清除定时器 */
  resetConfirm: () => void
} {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetConfirm = useCallback((): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setConfirmDeleteId(null)
  }, [])

  const requestConfirm = useCallback(
    (id: string): void => {
      // 清除上一次的定时器（快速切换不同项目时避免残留定时器互相干扰）
      if (timerRef.current) clearTimeout(timerRef.current)
      setConfirmDeleteId(id)
      timerRef.current = setTimeout(() => {
        setConfirmDeleteId(null)
        timerRef.current = null
      }, timeoutMs)
    },
    [timeoutMs]
  )

  // 组件卸载时清除定时器，防止泄漏
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { confirmDeleteId, requestConfirm, resetConfirm }
}
