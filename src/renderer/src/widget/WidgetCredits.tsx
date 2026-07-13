import { useState, useEffect, useCallback } from 'react'

/** 限免积分配额 */
interface RelayQuotaInfo {
  used: number
  limit: number
  remaining: number
  date: string
  paid: {
    balance: number
    earliestExpiringAt: string | null
    totalPurchased: number
  } | null
}

/** 付费积分余额 */
interface PaidQuotaInfo {
  balance: number
  totalPurchased: number
  totalConsumed: number
  firstPurchaseAt: string | null
  lastPurchaseAt: string | null
  earliestExpiringAt: string | null
}

/** Widget 查询积分返回的聚合结构 */
interface WidgetQuota {
  relay: RelayQuotaInfo | null
  paid: PaidQuotaInfo | null
  isRelayMode: boolean
}

const ICONS = {
  zap: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  gift: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M19 12v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 010-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 010 5" />
    </svg>
  ),
  refresh: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  ),
  cart: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
    </svg>
  ),
  flash: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  pro: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

export function WidgetCredits(): JSX.Element {
  const [quota, setQuota] = useState<WidgetQuota | null>(null)
  const [loading, setLoading] = useState(false)
  const [modelPref, setModelPref] = useState<'flash' | 'pro'>('flash')
  const [paidBalance, setPaidBalance] = useState(0)

  const refreshQuota = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.widgetApi.getQuota()
      setQuota(data)
      // 付费余额：优先从 relay.paid.balance 取（限免模式一并返回），否则从 paid 取
      const balance = data.relay?.paid?.balance ?? data.paid?.balance ?? 0
      setPaidBalance(balance)
    } catch (err) {
      console.error('[WidgetCredits] 查询积分失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // 加载设置中的模型偏好
  const loadModelPref = useCallback(async () => {
    try {
      const settings = await window.widgetApi.getSettings()
      setModelPref(settings.relayModelPreference)
    } catch (err) {
      console.error('[WidgetCredits] 加载设置失败:', err)
    }
  }, [])

  useEffect(() => {
    void refreshQuota()
    void loadModelPref()

    // 监听积分更新推送
    const unsub = window.widgetApi.onQuotaUpdated((data) => {
      setQuota(data)
      const balance = data.relay?.paid?.balance ?? data.paid?.balance ?? 0
      setPaidBalance(balance)
    })
    return () => {
      unsub()
    }
  }, [refreshQuota, loadModelPref])

  const handleModelPrefChange = async (pref: 'flash' | 'pro'): Promise<void> => {
    setModelPref(pref)
    try {
      await window.widgetApi.updateSettings({ relayModelPreference: pref })
    } catch (err) {
      console.error('[WidgetCredits] 更新模型偏好失败:', err)
      // 失败时回滚
      setModelPref(pref === 'flash' ? 'pro' : 'flash')
    }
  }

  const handleBuyCredits = (): void => {
    window.widgetApi.buyCredits()
  }

  const { relay, paid, isRelayMode } = quota ?? {}

  // 限免积分进度条百分比
  const relayPercent = relay
    ? Math.min(100, Math.round((relay.remaining / Math.max(relay.limit, 1)) * 100))
    : 0

  return (
    <div className="credits-area">
      <div className="credits-header">
        <span className="credits-title">积分管理</span>
        <button
          className={`refresh-btn ${loading ? 'spin' : ''}`}
          onClick={() => void refreshQuota()}
          title="刷新"
        >
          {ICONS.refresh}
        </button>
      </div>

      <div className="credits-list">
        {/* 限免积分卡片 */}
        <div className="credit-card relay-card">
          <div className="credit-card-header">
            <span className="credit-card-icon gift">{ICONS.gift}</span>
            <span className="credit-card-name">限免积分</span>
          </div>
          {isRelayMode && relay ? (
            <>
              <div className="credit-card-value">
                <span className="value-num">{relay.remaining}</span>
                <span className="value-unit">/ {relay.limit} 次</span>
              </div>
              <div className="credit-progress">
                <div className="credit-progress-bar relay" style={{ width: `${relayPercent}%` }} />
              </div>
              <div className="credit-card-footer">
                今日已用 {relay.used} 次 · 每日重置
              </div>
            </>
          ) : (
            <div className="credit-card-empty">
              {isRelayMode ? '加载中...' : '未开启限免模式'}
            </div>
          )}
        </div>

        {/* 付费积分卡片 */}
        <div className="credit-card paid-card">
          <div className="credit-card-header">
            <span className="credit-card-icon zap">{ICONS.zap}</span>
            <span className="credit-card-name">付费积分</span>
          </div>
          <div className="credit-card-value">
            <span className="value-num accent">{paidBalance}</span>
            <span className="value-unit">积分</span>
          </div>
          <div className="credit-card-stats">
            <div className="stat-item">
              <span className="stat-label">累计购买</span>
              <span className="stat-value">{paid?.totalPurchased ?? relay?.paid?.totalPurchased ?? 0}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">已消耗</span>
              <span className="stat-value">{paid?.totalConsumed ?? 0}</span>
            </div>
          </div>
          {paid?.earliestExpiringAt && (
            <div className="credit-card-footer">
              最早过期：{new Date(paid.earliestExpiringAt).toLocaleDateString('zh-CN')}
            </div>
          )}
          <button className="buy-btn" onClick={handleBuyCredits}>
            {ICONS.cart}
            <span>购买积分</span>
          </button>
        </div>

        {/* 模型偏好切换（仅限免模式显示） */}
        {isRelayMode && (
          <div className="model-pref-section">
            <div className="section-label">模型偏好（影响扣费）</div>
            <div className="model-pref-group">
              <button
                className={`model-pref-btn ${modelPref === 'flash' ? 'active' : ''}`}
                onClick={() => void handleModelPrefChange('flash')}
              >
                <span className="model-pref-icon">{ICONS.flash}</span>
                <div className="model-pref-text">
                  <div className="model-pref-name">Flash 快速</div>
                  <div className="model-pref-desc">1 积分/次 · 优先免费额度</div>
                </div>
              </button>
              <button
                className={`model-pref-btn ${modelPref === 'pro' ? 'active' : ''}`}
                onClick={() => void handleModelPrefChange('pro')}
              >
                <span className="model-pref-icon">{ICONS.pro}</span>
                <div className="model-pref-text">
                  <div className="model-pref-name">Pro 专业</div>
                  <div className="model-pref-desc">4 积分/次 · 支持深度思考</div>
                </div>
              </button>
            </div>
            {modelPref === 'pro' && paidBalance < 4 && (
              <div className="model-pref-warn">
                余额不足（需 ≥4 积分），将自动降级为 flash 模型
              </div>
            )}
          </div>
        )}

        {/* 积分说明 */}
        <div className="credits-tip">
          <div className="tip-row">
            <span className="tip-dot relay" />
            <span>限免积分：每日 50 次，0 点重置，无需 API Key</span>
          </div>
          <div className="tip-row">
            <span className="tip-dot paid" />
            <span>付费积分：充值后永久有效（365 天），支持 Pro 模型</span>
          </div>
        </div>
      </div>
    </div>
  )
}
