// 积分统一 store
// 集中管理「免费积分（限免配额）」和「付费积分余额」，供 MainPanel / SettingsModal / PurchaseModal 共享。
// 任何组件收到 IPC 推送后调用 setRelayQuota / setPaidQuota，所有订阅者自动同步。
// 取代各组件原本各自维护的本地 state 和重复的 IPC 订阅。

import { create } from 'zustand'
import type { RelayQuota, PaidQuota } from '@shared/types'

interface QuotaState {
  /** 限免模式下的免费积分配额（null 表示未加载或非限免模式） */
  relayQuota: RelayQuota | null
  /** 付费积分余额（null 表示未加载） */
  paidQuota: PaidQuota | null
  setRelayQuota: (q: RelayQuota | null) => void
  setPaidQuota: (q: PaidQuota | null) => void
  /** 同时重置两个积分状态（退出限免模式时调用） */
  reset: () => void
}

export const useQuotaStore = create<QuotaState>((set) => ({
  relayQuota: null,
  paidQuota: null,
  setRelayQuota: (q) => set({ relayQuota: q }),
  setPaidQuota: (q) => set({ paidQuota: q }),
  reset: () => set({ relayQuota: null, paidQuota: null })
}))
