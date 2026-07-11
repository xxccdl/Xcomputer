// 付费积分套餐 store
// 仅管理套餐列表（plans/validityDays/plansLoaded）。
// 付费积分余额已迁移至 quota.store.ts，供 MainPanel / SettingsModal / PurchaseModal 共享。

import { create } from 'zustand'
import type { PaymentPlan } from '@shared/types'

interface PaymentState {
  /** 套餐列表 */
  plans: PaymentPlan[]
  /** 套餐有效期天数 */
  validityDays: number
  /** 是否已加载过套餐（避免重复请求） */
  plansLoaded: boolean
  setPlans: (plans: PaymentPlan[], validityDays: number) => void
  setPlansLoaded: (b: boolean) => void
}

export const usePaymentStore = create<PaymentState>((set) => ({
  plans: [],
  validityDays: 365,
  plansLoaded: false,
  setPlans: (plans, validityDays) => set({ plans, validityDays }),
  setPlansLoaded: (b) => set({ plansLoaded: b })
}))
