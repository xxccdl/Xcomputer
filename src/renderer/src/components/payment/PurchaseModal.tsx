// 付费购买积分弹窗
// 展示套餐列表，调用虎皮椒支付（微信）完成购买，轮询订单状态并刷新余额
// 余额数据通过 useQuotaStore 共享给 MainPanel / SettingsModal，支付后实时同步

import { useState, useEffect, useRef } from 'react'
import { Zap, X, Check, Loader2, AlertCircle, ShoppingCart, Clock, ShieldCheck } from 'lucide-react'
import { usePaymentStore } from '../../store/payment.store'
import { useQuotaStore } from '../../store/quota.store'
import { useQuotaSync } from '../../hooks/useQuotaSync'
import type { PaymentPlan, OrderInfo } from '@shared/types'

interface PurchaseModalProps {
  onClose: () => void
}

type PayState =
  | { kind: 'idle' }
  | { kind: 'creating'; planId: string }
  | { kind: 'waiting'; order: OrderInfo }
  | { kind: 'success'; order: OrderInfo }
  | { kind: 'closed'; order: OrderInfo }
  | { kind: 'timeout'; order: OrderInfo }
  | { kind: 'error'; message: string }

export function PurchaseModal({ onClose }: PurchaseModalProps): JSX.Element {
  // 套餐列表仍由 payment store 管理（plans/validityDays/plansLoaded）
  const plans = usePaymentStore((s) => s.plans)
  const validityDays = usePaymentStore((s) => s.validityDays)
  const plansLoaded = usePaymentStore((s) => s.plansLoaded)
  const setPlans = usePaymentStore((s) => s.setPlans)
  const setPlansLoaded = usePaymentStore((s) => s.setPlansLoaded)

  // 付费余额统一由 quota store 管理，与 MainPanel / SettingsModal 实时同步
  // 始终激活订阅：购买弹窗可能在非限免场景下打开，付费余额仍需查询
  useQuotaSync(true)
  const quota = useQuotaStore((s) => s.paidQuota)

  const [payState, setPayState] = useState<PayState>({ kind: 'idle' })
  const [plansError, setPlansError] = useState<string | null>(null)
  const unmountedRef = useRef(false)

  // 加载套餐列表
  useEffect(() => {
    if (plansLoaded) return
    void (async () => {
      const resp = await window.api.payment.getPlans()
      if (resp) {
        setPlans(resp.plans, resp.validityDays)
        setPlansLoaded(true)
      } else {
        setPlansError('套餐加载失败，请检查网络后重试')
      }
    })()
  }, [plansLoaded, setPlans, setPlansLoaded])

  // 付费余额订阅已由 useQuotaSync 统一处理（无需重复订阅 IPC）

  // 组件卸载时取消轮询，防止泄漏
  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      void window.api.payment.cancelPoll()
    }
  }, [])

  // Escape 关闭（creating 状态禁止；waiting 状态先取消轮询再关闭）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && payState.kind !== 'creating') {
        void handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payState.kind])

  const handlePurchase = async (plan: PaymentPlan): Promise<void> => {
    if (payState.kind === 'creating' || payState.kind === 'waiting') return
    setPayState({ kind: 'creating', planId: plan.id })
    try {
      const order = await window.api.payment.createOrder(plan.id)
      if (!order) {
        setPayState({ kind: 'error', message: '订单创建失败，请稍后重试' })
        return
      }
      // 在系统浏览器打开支付页
      await window.api.payment.openInBrowser(order.payUrl)
      setPayState({ kind: 'waiting', order })
      // 轮询订单状态（主进程每 3s 查询，最长 35min）
      const result = await window.api.payment.pollOrderStatus(order.orderNo)
      if (unmountedRef.current) return
      if (result === 'paid') {
        setPayState({ kind: 'success', order })
      } else if (result === 'closed') {
        setPayState({ kind: 'closed', order })
      } else if (result === 'timeout') {
        setPayState({ kind: 'timeout', order })
      }
      // cancelled：用户取消轮询，静默回到 idle
      if (result === 'cancelled') {
        setPayState({ kind: 'idle' })
      }
    } catch (err) {
      setPayState({
        kind: 'error',
        message: err instanceof Error ? err.message : '支付流程异常'
      })
    }
  }

  const handleReset = (): void => {
    setPayState({ kind: 'idle' })
  }

  const handleCancel = async (): Promise<void> => {
    // 取消轮询（主进程会中止轮询循环），回到 idle 状态
    await window.api.payment.cancelPoll()
    setPayState({ kind: 'idle' })
  }

  const balance = quota?.balance ?? 0
  const earliestExpiring = quota?.earliestExpiringAt
  // creating 状态禁止所有操作（订单正在创建中）；waiting 状态允许取消和关闭
  const isBusy = payState.kind === 'creating'
  const isWaiting = payState.kind === 'waiting'

  // waiting 状态关闭弹窗时需同时取消轮询
  const handleClose = async (): Promise<void> => {
    if (isWaiting) {
      await window.api.payment.cancelPoll()
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={isBusy ? undefined : () => void handleClose()}
    >
      <div
        className="flex h-[85vh] w-[1000px] max-w-[95vw] animate-scale-in flex-col overflow-hidden rounded-xl border border-border bg-bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-yellow-500 to-amber-500 shadow-md">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">购买积分</h2>
              <p className="text-[10px] text-text-muted">支持微信支付 · 积分有效期 {validityDays} 天</p>
            </div>
          </div>
          <button
            onClick={() => void handleClose()}
            disabled={isBusy}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            title={isWaiting ? '取消支付并关闭' : '关闭'}
          >
            <X size={16} />
          </button>
        </div>

        {/* 主体 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 当前余额条 */}
          <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-bg-input px-4 py-3">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-accent" />
              <span className="text-xs text-text-secondary">当前付费积分</span>
              <span className="text-base font-bold text-accent">{balance}</span>
            </div>
            {earliestExpiring && (
              <div className="flex items-center gap-1 text-[10px] text-text-muted">
                <Clock size={10} />
                <span>最早过期：{new Date(earliestExpiring).toLocaleDateString('zh-CN')}</span>
              </div>
            )}
          </div>

          {/* 套餐加载中 */}
          {!plansLoaded && !plansError && (
            <div className="flex items-center justify-center py-12 text-text-muted">
              <Loader2 size={20} className="mr-2 animate-spin" />
              <span className="text-xs">正在加载套餐...</span>
            </div>
          )}

          {/* 套餐加载错误 */}
          {plansError && (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle size={28} className="mb-2 text-danger" />
              <p className="mb-3 text-xs text-danger">{plansError}</p>
              <button
                onClick={() => {
                  setPlansError(null)
                  setPlansLoaded(false)
                }}
                className="btn-ghost border border-border px-3 py-1 text-xs"
              >
                重试
              </button>
            </div>
          )}

          {/* 套餐网格 */}
          {plansLoaded && plans.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const isCurrent =
                  (payState.kind === 'creating' && payState.planId === plan.id) ||
                  (payState.kind === 'waiting' && payState.order.planName === plan.name)
                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-lg border p-4 transition-all ${
                      plan.popular
                        ? 'border-accent bg-accent/5 shadow-md'
                        : 'border-border bg-bg-input hover:border-accent/40'
                    } ${isCurrent ? 'ring-2 ring-accent' : ''}`}
                  >
                    {/* 热门徽章 */}
                    {plan.popular && (
                      <div className="absolute -top-2 right-3 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                        热门
                      </div>
                    )}
                    {/* 自定义徽章 */}
                    {plan.badge && !plan.popular && (
                      <div className="absolute -top-2 right-3 rounded-full bg-yellow-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                        {plan.badge}
                      </div>
                    )}

                    <div className="mb-2 flex items-baseline justify-between">
                      <h3 className="text-sm font-semibold text-text-primary">{plan.name}</h3>
                    </div>

                    <div className="mb-3 flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-accent">¥{plan.priceYuan}</span>
                    </div>

                    <div className="mb-3 space-y-1 text-xs text-text-secondary">
                      <div className="flex items-center gap-1.5">
                        <Check size={11} className="text-success" />
                        <span>{plan.credits} 积分基础</span>
                      </div>
                      {plan.bonus > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Check size={11} className="text-success" />
                          <span>赠 {plan.bonus} 积分（{plan.bonusPercent}%）</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Check size={11} className="text-success" />
                        <span>≈ {plan.flashEquivalent} 次 flash 调用</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check size={11} className="text-success" />
                        <span>≈ {plan.proEquivalent} 次 pro 调用</span>
                      </div>
                    </div>

                    <button
                      onClick={() => void handlePurchase(plan)}
                      disabled={isBusy}
                      className={`mt-auto w-full rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        plan.popular
                          ? 'bg-accent text-white hover:bg-accent/90'
                          : 'btn-ghost border border-border hover:border-accent/40'
                      }`}
                    >
                      {isCurrent && payState.kind === 'creating' ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <Loader2 size={12} className="animate-spin" /> 创建订单中
                        </span>
                      ) : isCurrent && payState.kind === 'waiting' ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <Loader2 size={12} className="animate-spin" /> 等待支付
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1.5">
                          <ShoppingCart size={12} /> 立即购买
                        </span>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* 计费规则说明 */}
          <div className="mt-5 rounded-lg border border-border bg-bg-base/50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
              <ShieldCheck size={12} className="text-success" />
              <span>计费与安全说明</span>
            </div>
            <ul className="space-y-1 text-[11px] text-text-muted">
              <li>• flash 模型扣 1 积分/次（限免模式下优先消耗每日 50 次免费额度）</li>
              <li>• pro 模型扣 4 积分/次（支持深度思考，仅付费积分可用）</li>
              <li>• 积分有效期 {validityDays} 天，按批次 FIFO 消耗（最早过期的先扣）</li>
              <li>• 积分与本机机器码绑定，重装系统会导致余额丢失，请谨慎操作</li>
              <li>• 支付由虎皮椒担保，订单超时 30 分钟自动关闭</li>
            </ul>
          </div>
        </div>

        {/* 底部状态栏（支付流程中/成功/失败时显示） */}
        {payState.kind !== 'idle' && (
          <div className="border-t border-border bg-bg-base/50 px-5 py-3">
            {payState.kind === 'error' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-danger">
                  <AlertCircle size={14} />
                  <span>{payState.message}</span>
                </div>
                <button onClick={handleReset} className="btn-ghost border border-border px-3 py-1 text-xs">
                  重试
                </button>
              </div>
            )}
            {payState.kind === 'waiting' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Loader2 size={14} className="animate-spin text-accent" />
                  <span>
                    等待支付完成... 订单号 <span className="font-mono">{payState.order.orderNo}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void handleCancel()}
                    className="btn-ghost border border-border px-3 py-1 text-xs text-text-muted hover:text-danger"
                  >
                    取消支付
                  </button>
                  <button
                    onClick={() => void window.api.payment.openInBrowser(payState.order.payUrl)}
                    className="btn-ghost border border-border px-3 py-1 text-xs"
                  >
                    重新打开支付页
                  </button>
                </div>
              </div>
            )}
            {payState.kind === 'success' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-success">
                  <Check size={14} />
                  <span>支付成功！{payState.order.credits} 积分已到账</span>
                </div>
                <button onClick={handleReset} className="btn-primary px-3 py-1 text-xs">
                  继续购买
                </button>
              </div>
            )}
            {payState.kind === 'closed' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <AlertCircle size={14} />
                  <span>订单已关闭（超时未支付）</span>
                </div>
                <button onClick={handleReset} className="btn-ghost border border-border px-3 py-1 text-xs">
                  重新选择
                </button>
              </div>
            )}
            {payState.kind === 'timeout' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <AlertCircle size={14} />
                  <span>轮询超时，如已支付请联系客服</span>
                </div>
                <button onClick={handleReset} className="btn-ghost border border-border px-3 py-1 text-xs">
                  返回
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
