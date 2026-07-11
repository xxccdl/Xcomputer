import { create } from 'zustand'

export type McpStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface McpState {
  status: McpStatus
  setStatus: (s: McpStatus) => void
}

export const useMcpStore = create<McpState>((set) => ({
  status: 'disconnected',
  setStatus: (status) => set({ status })
}))

/** 初始化 MCP 状态监听（在 App 根组件调用一次），返回 unsubscribe 函数 */
export async function initMcpStatus(): Promise<() => void> {
  // 查询初始状态
  try {
    const { status } = await window.api.mcp.getStatus()
    useMcpStore.getState().setStatus(status as McpStatus)
  } catch {
    // ignore
  }
  // 监听变更，返回 unsubscribe 函数避免重复注册导致内存泄漏
  return window.api.mcp.onStatusChanged(({ status }) => {
    useMcpStore.getState().setStatus(status as McpStatus)
  })
}
