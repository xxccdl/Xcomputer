import { useEffect, useRef, useState } from 'react'

/**
 * 节流值 hook：将高频更新的值节流到指定间隔（默认 80ms ≈ 12fps）。
 * 用于流式 Markdown 渲染，避免每个 token 都触发完整的 rehype/remark 解析。
 *
 * 采用 leading + trailing 节流策略：
 * - 首次更新立即执行（leading）
 * - 后续高频更新在间隔内被合并，最后一次更新保证执行（trailing）
 */
export function useThrottledValue<T>(value: T, intervalMs = 80): T {
  const [throttled, setThrottled] = useState(value)
  const lastRun = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const now = Date.now()
    const elapsed = now - lastRun.current
    if (elapsed >= intervalMs) {
      // leading：间隔已过，立即更新
      lastRun.current = now
      setThrottled(value)
    } else {
      // trailing：间隔内，安排最后一次更新确保不被丢弃
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        lastRun.current = Date.now()
        setThrottled(value)
      }, intervalMs - elapsed)
    }
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value, intervalMs])

  return throttled
}
