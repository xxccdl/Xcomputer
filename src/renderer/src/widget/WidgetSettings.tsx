import { useState, useEffect, useCallback } from 'react'

/** Widget 设置子集（与 preload/widget.ts 中的 WidgetSettings 一致） */
interface WidgetSettingsData {
  relayMode: boolean
  relayModelPreference: 'flash' | 'pro'
  openXEnabled: boolean
  openXToken: string
  deepThinking: boolean
  thinkingEffort: 'high' | 'max'
  deepseekApiKey: string
  [key: string]: unknown
}

const ICONS = {
  zap: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  brain: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 01-4.96.44 2.5 2.5 0 01-2.96-3.08 3 3 0 01-.34-5.58 2.5 2.5 0 011.32-4.24 2.5 2.5 0 014.44-1.04z" />
      <path d="M14.5 2A2.5 2.5 0 0012 4.5v15a2.5 2.5 0 004.96.44 2.5 2.5 0 002.96-3.08 3 3 0 00.34-5.58 2.5 2.5 0 00-1.32-4.24 2.5 2.5 0 00-4.44-1.04z" />
    </svg>
  ),
  key: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  ),
  external: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <path d="M15 3h6v6M10 14L21 3" />
    </svg>
  )
}

export function WidgetSettings(): JSX.Element {
  const [settings, setSettings] = useState<WidgetSettingsData | null>(null)
  const [saving, setSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    try {
      const data = await window.widgetApi.getSettings()
      setSettings(data)
    } catch (err) {
      console.error('[WidgetSettings] 加载设置失败:', err)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  /** 更新单个设置字段 */
  const updateField = async <K extends keyof WidgetSettingsData>(
    key: K,
    value: WidgetSettingsData[K]
  ): Promise<void> => {
    if (!settings) return
    // 乐观更新：先改本地状态，再异步写入
    setSettings({ ...settings, [key]: value })
    setSaving(true)
    try {
      const next = await window.widgetApi.updateSettings({ [key]: value } as Partial<WidgetSettingsData>)
      setSettings(next)
    } catch (err) {
      console.error('[WidgetSettings] 更新设置失败:', err)
      // 失败时回滚
      setSettings(settings)
    } finally {
      setSaving(false)
    }
  }

  const handleOpenMainSettings = (): void => {
    window.widgetApi.openMainSettings()
  }

  if (!settings) {
    return (
      <div className="settings-area">
        <div className="empty-state">
          <div className="title">加载设置中...</div>
        </div>
      </div>
    )
  }

  // 限免模式是否实际生效（开关开启 或 未填 API Key）
  const isRelayActive = settings.relayMode || !settings.deepseekApiKey.trim()
  // OpenX 是否走云端代理（有 Token）
  const isOpenXProxy = settings.openXEnabled && (settings.openXToken ?? '').trim().length > 0

  return (
    <div className="settings-area">
      <div className="settings-list">
        {/* 限免模式 */}
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-name">
              <span className="setting-icon">{ICONS.zap}</span>
              限免模式
            </div>
            <div className="setting-desc">
              {isRelayActive
                ? '通过中继免费使用 DeepSeek（每日 50 次）'
                : '开启后免 API Key 使用 AI'}
            </div>
          </div>
          <button
            className={`toggle-switch ${settings.relayMode ? 'on' : ''}`}
            onClick={() => void updateField('relayMode', !settings.relayMode)}
            role="switch"
            aria-checked={settings.relayMode}
          >
            <span className="toggle-knob" />
          </button>
        </div>

        {/* OpenX 内核加速 */}
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-name">
              <span className="setting-icon">{ICONS.zap}</span>
              OpenX 加速
              <span className="badge-exp">实验</span>
            </div>
            <div className="setting-desc">
              {settings.openXEnabled
                ? isOpenXProxy
                  ? '云端代理模式 · 不扣积分'
                  : '本地解码模式 · 3 倍积分消耗'
                : '压缩代码输出以加速响应'}
            </div>
          </div>
          <button
            className={`toggle-switch ${settings.openXEnabled ? 'on' : ''}`}
            onClick={() => void updateField('openXEnabled', !settings.openXEnabled)}
            role="switch"
            aria-checked={settings.openXEnabled}
          >
            <span className="toggle-knob" />
          </button>
        </div>

        {/* OpenX Token（仅 OpenX 开启时显示） */}
        {settings.openXEnabled && (
          <div className="setting-row column">
            <div className="setting-info">
              <div className="setting-name">
                <span className="setting-icon">{ICONS.key}</span>
                OpenX Token
              </div>
              <div className="setting-desc">
                填入 Token 走云端代理（不扣积分），留空用本地解码
              </div>
            </div>
            <input
              type="password"
              className="setting-input"
              value={settings.openXToken ?? ''}
              placeholder="OpenX API Token（可选）"
              onChange={(e) => {
                // 仅更新本地状态，失焦时才写入
                setSettings({ ...settings, openXToken: e.target.value })
              }}
              onBlur={(e) => void updateField('openXToken', e.target.value)}
            />
          </div>
        )}

        {/* 深度思考 */}
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-name">
              <span className="setting-icon">{ICONS.brain}</span>
              深度思考
            </div>
            <div className="setting-desc">
              {settings.deepThinking
                ? `已开启 · ${settings.thinkingEffort === 'max' ? '最大强度' : '高强度'}`
                : '开启后 AI 会更深入地分析问题'}
            </div>
          </div>
          <button
            className={`toggle-switch ${settings.deepThinking ? 'on' : ''}`}
            onClick={() => void updateField('deepThinking', !settings.deepThinking)}
            role="switch"
            aria-checked={settings.deepThinking}
          >
            <span className="toggle-knob" />
          </button>
        </div>

        {/* 思考强度（深度思考开启时显示） */}
        {settings.deepThinking && (
          <div className="setting-row column">
            <div className="setting-info">
              <div className="setting-name">思考强度</div>
            </div>
            <div className="seg-group">
              <button
                className={`seg-btn ${settings.thinkingEffort === 'high' ? 'active' : ''}`}
                onClick={() => void updateField('thinkingEffort', 'high')}
              >
                高强度
              </button>
              <button
                className={`seg-btn ${settings.thinkingEffort === 'max' ? 'active' : ''}`}
                onClick={() => void updateField('thinkingEffort', 'max')}
              >
                最大强度
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 保存状态提示 */}
      {saving && (
        <div className="saving-hint">
          <span className="saving-dot" />
          正在保存...
        </div>
      )}

      {/* 打开完整设置 */}
      <button className="open-main-settings-btn" onClick={handleOpenMainSettings}>
        {ICONS.external}
        <span>打开完整设置</span>
      </button>
    </div>
  )
}
