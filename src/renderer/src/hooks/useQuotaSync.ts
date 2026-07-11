// 积分同步 hook
// 统一处理免费积分和付费积分的 IPC 订阅 + 初始查询，写入 quota.store 供所有组件共享。
// 多个组件（MainPanel / SettingsModal / PurchaseModal）调用本 hook 是安全的：
// IPC 订阅幂等（同一通道多次 onRelayQuotaUpdated 只会触发 store 更新，不会重复渲染），
// 初始查询也只更新 store，重复调用无副作用。

import { useEffect } from 'react'
import { useQuotaStore } from '../store/quota.store'

/**
 * 订阅积分更新（免费 + 付费）。
 * @param active 是否激活订阅。非限免模式下传 false，会清除 store 中的积分状态。
 */
export function useQuotaSync(active: boolean): void {
  const setRelayQuota = useQuotaStore((s) => s.setRelayQuota)
  const setPaidQuota = useQuotaStore((s) => s.setPaidQuota)
  const reset = useQuotaStore((s) => s.reset)

  useEffect(() => {
    if (!active) {
      // 退出限免模式时清除历史残留，避免徽标错配
      reset()
      return
    }

    // 初始查询：免费积分 + 付费积分并行拉取
    void window.api.chat.getRelayQuota().then((q) => { if (q) setRelayQuota(q) })
    void window.api.payment.getQuota().then((q) => { if (q) setPaidQuota(q) })

    // 订阅 IPC 推送：启动签到 / AI 请求完成 / 支付成功 都会触发
    const unsubRelay = window.api.chat.onRelayQuotaUpdated((q) => setRelayQuota(q))
    const unsubPaid = window.api.payment.onQuotaUpdated((q) => setPaidQuota(q))

    return () => {
      unsubRelay()
      unsubPaid()
    }
  }, [active, setRelayQuota, setPaidQuota, reset])
}
