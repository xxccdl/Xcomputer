import { useState, useEffect } from 'react'
import {
  X, Loader2, CheckCircle2, XCircle, KeyRound, Cpu, Power, Brain,
  Smartphone, StopCircle, Sparkles, RefreshCw, Download, Package, Zap,
  Clock, Sliders, Info, Shield, Users
} from 'lucide-react'
import { useSettingsStore } from '../../store/settings.store'
import { useQuotaStore } from '../../store/quota.store'
import { useQuotaSync } from '../../hooks/useQuotaSync'
import type { Settings, ConnectionTestResult } from '@shared/types'
import { SUPPORTED_MODELS } from '@shared/constants'
import type { UpdateStatus, UpdateInfo } from '@shared/update-types'
import { LocalModelCard } from './LocalModelCard'
import { CustomSubagentsPanel } from './CustomSubagentsPanel'

interface RemoteState {
  running: boolean
  pairCode: string | null
  phoneConnected: boolean
  qrUrl: string | null
  qrDataUrl: string | null
}

interface SettingsModalProps {
  onClose: () => void
}

/** 左侧导航分组项 */
type SectionId = 'ai' | 'tool' | 'subagents' | 'general' | 'remote' | 'about'

interface NavItem {
  id: SectionId
  label: string
  icon: typeof KeyRound
}

const NAV_ITEMS: NavItem[] = [
  { id: 'ai', label: 'AI 模型', icon: KeyRound },
  { id: 'tool', label: '工具与执行', icon: Sliders },
  { id: 'subagents', label: '子智能体', icon: Users },
  { id: 'general', label: '通用', icon: Power },
  { id: 'remote', label: '手机远程', icon: Smartphone },
  { id: 'about', label: '关于', icon: Info }
]

export function SettingsModal({ onClose }: SettingsModalProps): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const setSettings = useSettingsStore((s) => s.setSettings)
  const [form, setForm] = useState<Settings>(settings)
  const [activeSection, setActiveSection] = useState<SectionId>('ai')
  const [testingAi, setTestingAi] = useState(false)
  const [testingMcp, setTestingMcp] = useState(false)
  const [aiResult, setAiResult] = useState<ConnectionTestResult | null>(null)
  const [mcpResult, setMcpResult] = useState<ConnectionTestResult | null>(null)

  const [saveError, setSaveError] = useState<string | null>(null)
  const [remoteState, setRemoteState] = useState<RemoteState>({
    running: false, pairCode: null, phoneConnected: false, qrUrl: null, qrDataUrl: null
  })
  const [remoteStarting, setRemoteStarting] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [launchingGuide, setLaunchingGuide] = useState(false)
  // 更新检查状态
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ type: 'idle' })
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const [currentVersion, setCurrentVersion] = useState<string>('')

  // 限免模式：从共享 store 读取积分，与 MainPanel/PurchaseModal 实时同步
  const isRelayActive = form.relayMode || !form.deepseekApiKey.trim()
  useQuotaSync(isRelayActive)
  const relayQuota = useQuotaStore((s) => s.relayQuota)
  const paidQuota = useQuotaStore((s) => s.paidQuota)
  // 付费积分字段：优先用 paidQuota（支付后实时更新、字段更完整），回退到 relayQuota.paid（限免接口摘要）
  const paidBalance = paidQuota?.balance ?? relayQuota?.paid?.balance ?? 0
  const paidTotalPurchased = paidQuota?.totalPurchased ?? relayQuota?.paid?.totalPurchased ?? 0
  const paidEarliestExpiring = paidQuota?.earliestExpiringAt ?? relayQuota?.paid?.earliestExpiringAt ?? null

  // 订阅更新状态推送 + 获取当前版本号
  useEffect(() => {
    const unsub = window.api.update.onStatus((status) => {
      setUpdateStatus(status)
      if (status.type === 'downloading') {
        setDownloadingUpdate(true)
      } else if (status.type === 'downloaded' || status.type === 'error') {
        setDownloadingUpdate(false)
      }
    })
    // 轻量级获取版本号（不触发检查更新，避免覆盖 onStatus 推送的状态）
    void window.api.app.getVersion().then((v) => setCurrentVersion(v))
    return unsub
  }, [])

  // 手动检查更新
  const handleCheckUpdate = async (): Promise<void> => {
    setCheckingUpdate(true)
    try {
      const result = await window.api.update.check()
      setCurrentVersion(result.currentVersion)
      if (result.error) {
        setUpdateStatus({ type: 'error', message: result.error })
      } else if (result.hasUpdate && result.updateInfo) {
        setUpdateStatus({ type: 'available', updateInfo: result.updateInfo })
      } else {
        setUpdateStatus({ type: 'idle', message: '已是最新版本' })
      }
    } catch (err) {
      setUpdateStatus({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setCheckingUpdate(false)
    }
  }

  // 下载更新
  const handleDownloadUpdate = async (info: UpdateInfo): Promise<void> => {
    setDownloadingUpdate(true)
    try {
      const result = await window.api.update.download(info)
      if (!result.success) {
        setUpdateStatus({ type: 'error', message: result.error ?? '下载失败' })
      }
      // 成功时 onStatus 会推送 'downloaded' 状态
    } catch (err) {
      setUpdateStatus({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      setDownloadingUpdate(false)
    }
  }

  // 安装更新
  const handleInstallUpdate = async (filePath: string): Promise<void> => {
    await window.api.update.install(filePath)
    // 安装程序启动后当前应用会退出
  }

  useEffect(() => {
    let cancelled = false
    void window.api.settings.get().then((s) => {
      if (cancelled) return
      setForm(s)
      setSettings(s)
    })
    return () => {
      cancelled = true
    }
  }, [setSettings])

  const handleSave = async (): Promise<void> => {
    try {
      setSaveError(null)
      const next = await window.api.settings.update(form)
      setSettings(next)
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存设置失败')
    }
  }

  const testAi = async (): Promise<void> => {
    setTestingAi(true)
    setAiResult(null)
    try {
      await window.api.settings.update(form)
      const r = await window.api.settings.testAiConnection()
      setAiResult(r)
    } catch (err) {
      setAiResult({ ok: false, message: err instanceof Error ? err.message : '测试失败' })
    } finally {
      setTestingAi(false)
    }
  }

  const testMcp = async (): Promise<void> => {
    setTestingMcp(true)
    setMcpResult(null)
    try {
      await window.api.settings.update(form)
      const r = await window.api.settings.testMcpConnection()
      setMcpResult(r)
    } catch (err) {
      setMcpResult({ ok: false, message: err instanceof Error ? err.message : '测试失败' })
    } finally {
      setTestingMcp(false)
    }
  }

  // Escape 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 远程控制状态监听
  useEffect(() => {
    // 打开时立即查询当前状态（避免重开窗口时显示为已停止）
    void window.api.remote.getState().then((state) => {
      setRemoteState(state)
    })
    const unsub = window.api.remote.onStateChange((state) => {
      setRemoteState(state)
    })
    return unsub
  }, [])

  const startRemote = async (): Promise<void> => {
    setRemoteStarting(true)
    setRemoteError(null)
    try {
      const state = await window.api.remote.start()
      setRemoteState(state)
    } catch (err) {
      setRemoteError(err instanceof Error ? err.message : '启动失败')
    } finally {
      setRemoteStarting(false)
    }
  }

  const stopRemote = async (): Promise<void> => {
    setRemoteError(null)
    try {
      const state = await window.api.remote.stop()
      setRemoteState(state)
    } catch (err) {
      setRemoteError(err instanceof Error ? err.message : '停止失败')
    }
  }

  // 手动重新启动初始化向导
  const launchGuide = async (): Promise<void> => {
    setLaunchingGuide(true)
    try {
      // 先重置初始化状态，再通知显示向导；App.tsx 监听到事件后会重新检查并弹出向导
      await window.api.init.reset()
      await window.api.init.showGuide()
      onClose()
    } catch {
      // 即使失败也解除 loading（不阻塞用户）
      setLaunchingGuide(false)
    }
  }

  // 检测表单是否有未保存更改
  const hasUnsavedChanges = JSON.stringify(form) !== JSON.stringify(settings)

  const handleBackdropClick = (): void => {
    // 有未保存更改时不直接关闭，避免误丢失
    if (!hasUnsavedChanges) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-bg-panel shadow-2xl animate-spring-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">设置</h2>
          </div>
          <button className="rounded-md p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* 主体：左侧导航 + 右侧内容 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧导航 */}
          <nav className="w-44 shrink-0 border-r border-border bg-bg/40 p-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = activeSection === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-accent/10 text-accent'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  }`}
                >
                  <Icon size={14} />
                  {item.label}
                </button>
              )
            })}
          </nav>

          {/* 右侧内容区 */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* ========== AI 模型 ========== */}
            {activeSection === 'ai' && (
              <div className="space-y-4">
                <SectionHeader
                  icon={KeyRound}
                  title="AI 模型配置"
                  desc="配置 AI 服务商、API Key、模型偏好与限免模式"
                />

                {/* 本地模型（实验性）— 优先级最高 */}
                <LocalModelCard
                  enabled={form.localModel.enabled}
                  onToggle={(v) => setForm({ ...form, localModel: { ...form.localModel, enabled: v } })}
                />

                {/* 限免模式 */}
                <Card>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 flex flex-col">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                        <Sparkles size={13} className="text-accent" />
                        限免模式
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-text-muted">
                        通过 xskillhub 中继免费使用 DeepSeek（每日 50 次、仅 flash 模型、最大上下文 500k，支持工具调用）。未填 API Key 时自动开启。
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={form.relayMode}
                      onChange={(v) => setForm({ ...form, relayMode: v })}
                    />
                  </div>
                  {/* 实时限免状态提示 */}
                  {(form.relayMode || !form.deepseekApiKey.trim()) && (
                    <div className="mt-2 rounded-md border border-accent/30 bg-accent/5 px-2.5 py-1.5 text-xs text-accent">
                      {form.deepseekApiKey.trim()
                        ? '已开启限免模式，将使用中继通道（不消耗你的 API 额度）'
                        : '未填写 API Key，自动启用限免模式。填写后可关闭开关使用自己的额度'}
                    </div>
                  )}
                  {/* 限免积分显示 */}
                  {relayQuota && (
                    <div className="mt-2 flex items-center justify-between rounded-md bg-bg-hover/50 px-2.5 py-1.5 text-xs">
                      <span className="text-text-muted">今日剩余积分</span>
                      <span className={relayQuota.remaining > 10 ? 'font-medium text-text-primary' : 'font-medium text-red-500'}>
                        {relayQuota.remaining} / {relayQuota.limit} 次
                      </span>
                    </div>
                  )}
                </Card>

                {/* 付费积分区块（仅限免模式显示） */}
                {isRelayActive && (
                  <Card>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                        <Zap size={13} className="text-accent" />
                        付费积分
                      </div>
                      <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('xcomputer:open-modal', { detail: 'purchase' }))}
                        className="btn-primary px-3 py-1 text-xs"
                      >
                        购买积分
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-bg-hover/50 px-2.5 py-1.5">
                        <div className="text-text-muted">当前余额</div>
                        <div className="font-semibold text-accent">{paidBalance} 积分</div>
                      </div>
                      <div className="rounded-md bg-bg-hover/50 px-2.5 py-1.5">
                        <div className="text-text-muted">累计购买</div>
                        <div className="font-semibold">{paidTotalPurchased} 积分</div>
                      </div>
                    </div>
                    {paidEarliestExpiring && (
                      <div className="mt-2 text-[10px] text-text-muted">
                        最早过期：{new Date(paidEarliestExpiring).toLocaleDateString('zh-CN')}
                      </div>
                    )}
                    {/* 模型偏好切换 */}
                    <div className="mt-3 border-t border-border pt-3">
                      <div className="mb-2 text-xs text-text-secondary">模型偏好（影响扣费）</div>
                      <div className="flex gap-2">
                        {(['flash', 'pro'] as const).map((pref) => (
                          <button
                            key={pref}
                            type="button"
                            onClick={() => setForm({ ...form, relayModelPreference: pref })}
                            className={`flex-1 rounded-md border px-3 py-2 text-xs transition-colors ${
                              form.relayModelPreference === pref
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-border text-text-secondary hover:bg-bg-hover'
                            }`}
                          >
                            <div className="font-semibold">{pref === 'flash' ? 'Flash 快速' : 'Pro 专业'}</div>
                            <div className="mt-0.5 text-[10px] opacity-70">
                              {pref === 'flash' ? '1 积分/次 · 优先免费额度' : '4 积分/次 · 支持深度思考'}
                            </div>
                          </button>
                        ))}
                      </div>
                      {form.relayModelPreference === 'pro' && paidBalance < 4 && (
                        <div className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-600">
                          ⚠️ 余额不足（需 ≥4 积分），将自动降级为 flash 模型
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* DeepSeek 配置 */}
                <Card>
                  <div className="mb-3 text-xs font-medium text-text-primary">DeepSeek</div>
                  <div className="space-y-3">
                    <Field label="API Key">
                      <input
                        type="password"
                        className="input font-mono"
                        value={form.deepseekApiKey}
                        placeholder="sk-xxxx"
                        onChange={(e) => setForm({ ...form, deepseekApiKey: e.target.value })}
                      />
                    </Field>
                    <Field label="Base URL">
                      <input
                        className="input font-mono"
                        value={form.deepseekBaseURL}
                        placeholder="https://api.deepseek.com/v1"
                        onChange={(e) => setForm({ ...form, deepseekBaseURL: e.target.value })}
                      />
                    </Field>
                  </div>
                </Card>

                {/* Kimi 配置 */}
                <Card>
                  <div className="mb-3 text-xs font-medium text-text-primary">Kimi (Moonshot)</div>
                  <div className="space-y-3">
                    <Field label="API Key">
                      <input
                        type="password"
                        className="input font-mono"
                        value={form.kimiApiKey}
                        placeholder="从 Kimi 开放平台获取"
                        onChange={(e) => setForm({ ...form, kimiApiKey: e.target.value })}
                      />
                    </Field>
                    <Field label="Base URL">
                      <input
                        className="input font-mono"
                        value={form.kimiBaseURL}
                        placeholder="https://api.moonshot.cn/v1"
                        onChange={(e) => setForm({ ...form, kimiBaseURL: e.target.value })}
                      />
                    </Field>
                  </div>
                </Card>

                {/* 模型选择 */}
                {isRelayActive ? (
                  <div className="rounded-md border border-border bg-bg-hover/30 px-3 py-2 text-xs text-text-muted">
                    限免模式下模型由系统控制：Flash 固定使用免费额度，Pro 需付费积分（在上方"模型偏好"切换）。
                    填写 API Key 后可自定义模型。
                  </div>
                ) : (
                  <Card>
                    <div className="mb-3 text-xs font-medium text-text-primary">模型选择</div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="快速模型 (Flash)">
                        <select
                          className="input font-mono"
                          value={form.fastModel}
                          onChange={(e) => setForm({ ...form, fastModel: e.target.value })}
                        >
                          {SUPPORTED_MODELS.FAST.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="专业模型 (Pro)">
                        <select
                          className="input font-mono"
                          value={form.proModel}
                          onChange={(e) => setForm({ ...form, proModel: e.target.value })}
                        >
                          {SUPPORTED_MODELS.PRO.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                      快速模型固定使用 DeepSeek 配置；专业模型根据选择自动使用 DeepSeek 或 Kimi 配置。
                    </p>
                  </Card>
                )}

                <TestButton
                  testing={testingAi}
                  result={aiResult}
                  onClick={() => void testAi()}
                  label="测试 AI 连接"
                />
              </div>
            )}

            {/* ========== 工具与执行 ========== */}
            {activeSection === 'tool' && (
              <div className="space-y-4">
                <SectionHeader
                  icon={Sliders}
                  title="工具与执行"
                  desc="MCP 配置、工具调用超时、OpenX 加速等执行行为"
                />

                {/* 工具调用超时 */}
                <Card>
                  <div className="flex items-start gap-2.5">
                    <Clock size={16} className="mt-0.5 text-accent" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-primary">工具调用超时</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={5}
                            max={600}
                            className="input w-20 py-1 text-center font-mono text-xs"
                            value={form.toolCallTimeoutSec}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10)
                              setForm({ ...form, toolCallTimeoutSec: isNaN(v) ? 60 : Math.max(5, Math.min(600, v)) })
                            }}
                          />
                          <span className="text-xs text-text-muted">秒</span>
                        </div>
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-text-muted">
                        单次工具调用（MCP 桌面操作、AI 请求、本地工具等）的最长等待时间。超时后该步骤自动失败，避免界面无限转圈。
                        范围 5–600 秒，默认 60 秒。
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[30, 60, 120, 300].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setForm({ ...form, toolCallTimeoutSec: sec })}
                            className={`rounded-md px-2 py-1 text-[11px] font-mono transition-colors ${
                              form.toolCallTimeoutSec === sec
                                ? 'bg-accent text-white'
                                : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                            }`}
                          >
                            {sec}s
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* 子代理最大轮数 */}
                <Card>
                  <div className="flex items-start gap-2.5">
                    <Users size={16} className="mt-0.5 text-accent" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-primary">子代理最大轮数</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={200}
                            className="input w-20 py-1 text-center font-mono text-xs"
                            value={form.subagentMaxRounds}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10)
                              setForm({ ...form, subagentMaxRounds: isNaN(v) ? 0 : Math.max(0, Math.min(200, v)) })
                            }}
                          />
                          <span className="text-xs text-text-muted">轮</span>
                        </div>
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-text-muted">
                        单个子代理的最大循环次数。设为 0 表示「AI帮选」——由 AI 根据任务复杂度自行决定（默认 50，简单任务 10-20，复杂任务 30-50+）。
                        设置具体数值后，AI 传入的轮数不能超过该上限。范围 0–200。
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          key="auto"
                          type="button"
                          onClick={() => setForm({ ...form, subagentMaxRounds: 0 })}
                          className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                            form.subagentMaxRounds === 0
                              ? 'bg-accent text-white'
                              : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          AI帮选
                        </button>
                        {[10, 20, 30, 50].map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setForm({ ...form, subagentMaxRounds: r })}
                            className={`rounded-md px-2 py-1 text-[11px] font-mono transition-colors ${
                              form.subagentMaxRounds === r
                                ? 'bg-accent text-white'
                                : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* OpenX 内核加速 */}
                <Card>
                  <div className="flex items-start gap-2.5">
                    <Zap size={16} className="mt-0.5 text-accent" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-primary">
                          OpenX 内核加速
                          <span className="ml-1.5 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">实验性</span>
                        </span>
                        <ToggleSwitch
                          checked={form.openXEnabled}
                          onChange={(v) => setForm({ ...form, openXEnabled: v })}
                        />
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-text-muted">
                        AI 用压缩标记输出代码以加速响应。填入 Token 走云端代理（不扣积分，不限模式），留空则限免模式下用本地 OX 解码（3 倍积分）。
                      </div>
                      {form.openXEnabled && (
                        <>
                          {isRelayActive && !(form.openXToken ?? '').trim() && (
                            <div className="mt-1.5 text-xs text-amber-500">
                              ⚡ 本地 OX 模式：flash 3 积分/次，pro 12 积分/次
                            </div>
                          )}
                          {(form.openXToken ?? '').trim() && (
                            <div className="mt-1.5 text-xs text-green-500">
                              ✅ 云端代理模式：不扣积分，不限模式
                            </div>
                          )}
                          <div className="mt-2">
                            <input
                              type="password"
                              className="input font-mono text-xs"
                              value={form.openXToken ?? ''}
                              placeholder="OpenX API Token（留空则限免模式用本地 OX 解码）"
                              onChange={(e) => setForm({ ...form, openXToken: e.target.value })}
                            />
                            <div className="mt-1 text-[11px] text-text-muted">
                              填入 Token 后走云端 OpenX 代理（自动压缩/还原，不扣积分）。
                              <a
                                href="https://app-cxqmurmax9fk.appmiaoda.com/docs"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 text-accent hover:underline"
                              >
                                查看文档 →
                              </a>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </Card>

                {/* 深度思考 */}
                <Card>
                  <div className={`flex items-start gap-2.5 ${isRelayActive ? 'opacity-50' : ''}`}>
                    <Brain size={16} className="mt-0.5 text-accent" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-primary">深度思考</span>
                        <ToggleSwitch
                          checked={form.deepThinking && !isRelayActive}
                          disabled={isRelayActive}
                          onChange={(v) => { if (!isRelayActive) setForm({ ...form, deepThinking: v }) }}
                        />
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-text-muted">
                        {isRelayActive
                          ? '限免模式（flash 模型）不支持深度思考'
                          : '任务执行时使用思考模式，更精准但更慢'}
                      </div>
                    </div>
                  </div>
                  {form.deepThinking && !isRelayActive && (
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                      <div className="flex flex-col">
                        <span className="text-sm text-text-primary">思考强度</span>
                        <span className="text-xs text-text-muted">
                          high = 平衡模式，max = 深度推理（适合复杂任务）
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {(['high', 'max'] as const).map((effort) => (
                          <button
                            key={effort}
                            type="button"
                            className={`rounded-md px-3 py-1 text-xs font-mono transition-colors ${
                              form.thinkingEffort === effort
                                ? 'bg-accent text-white'
                                : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                            }`}
                            onClick={() => setForm({ ...form, thinkingEffort: effort })}
                          >
                            {effort}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {/* MCP 配置 */}
                <Card>
                  <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-text-primary">
                    <Cpu size={13} />
                    Windows-MCP 配置
                  </div>
                  <div className="space-y-3">
                    <Field label="uvx 路径">
                      <input
                        className="input font-mono"
                        value={form.uvxPath}
                        placeholder="uvx"
                        onChange={(e) => setForm({ ...form, uvxPath: e.target.value })}
                      />
                    </Field>
                    <Field label="PyPI 镜像 (中国)">
                      <input
                        className="input font-mono"
                        value={form.pypiMirror}
                        onChange={(e) => setForm({ ...form, pypiMirror: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="mt-3">
                    <TestButton
                      testing={testingMcp}
                      result={mcpResult}
                      onClick={() => void testMcp()}
                      label="测试 MCP 连接"
                    />
                  </div>
                </Card>
              </div>
            )}

            {/* ========== 子智能体 ========== */}
            {activeSection === 'subagents' && <CustomSubagentsPanel />}

            {/* ========== 通用 ========== */}
            {activeSection === 'general' && (
              <div className="space-y-4">
                <SectionHeader
                  icon={Power}
                  title="通用"
                  desc="开机启动、自检、初始化等基础行为"
                />

                <Card>
                  <ToggleRow
                    icon={Power}
                    iconColor="text-accent"
                    title="开机自启动"
                    desc="开机后自动启动到系统托盘"
                    checked={form.autoStart}
                    onChange={(v) => setForm({ ...form, autoStart: v })}
                  />
                </Card>

                <Card>
                  <ToggleRow
                    icon={Shield}
                    iconColor="text-accent"
                    title="开机自检"
                    desc="启动时自动检查运行环境（MCP、Python 等），异常时弹窗提示"
                    checked={form.selfCheckEnabled}
                    onChange={(v) => setForm({ ...form, selfCheckEnabled: v })}
                  />
                </Card>

                <Card>
                  <ToggleRow
                    icon={RefreshCw}
                    iconColor="text-accent"
                    title="启动时自动检查更新"
                    desc="应用启动 10 秒后自动检查是否有新版本"
                    checked={form.updateCheckEnabled}
                    onChange={(v) => setForm({ ...form, updateCheckEnabled: v })}
                  />
                </Card>

                <Card>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Sparkles size={16} className="text-accent" />
                      <div className="flex flex-col">
                        <span className="text-sm text-text-primary">重新启动初始化向导</span>
                        <span className="text-xs text-text-muted">
                          重新配置模型与环境（首次安装引导）
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost flex items-center gap-1.5 border border-border"
                      disabled={launchingGuide}
                      onClick={() => void launchGuide()}
                    >
                      {launchingGuide ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      启动向导
                    </button>
                  </div>
                </Card>
              </div>
            )}

            {/* ========== 手机远程 ========== */}
            {activeSection === 'remote' && (
              <div className="space-y-4">
                <SectionHeader
                  icon={Smartphone}
                  title="手机远程控制"
                  desc="用手机远程操控 Xcomputer，需要手机端安装 xphoneai"
                />

                <Card>
                  {!remoteState.running ? (
                    <div className="flex flex-col items-center gap-3 py-2">
                      <p className="text-center text-sm text-text-muted">
                        启动服务后，用手机扫描二维码即可远程操控 Xcomputer
                      </p>
                      <button
                        className="btn-primary flex items-center gap-1.5"
                        onClick={() => void startRemote()}
                        disabled={remoteStarting}
                      >
                        {remoteStarting ? (
                          <><Loader2 size={14} className="animate-spin" /> 连接中...</>
                        ) : (
                          <><Smartphone size={14} /> 启动手机控制服务</>
                        )}
                      </button>
                      {remoteError && (
                        <span className="text-xs text-danger">{remoteError}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      {/* 网站地址提示 */}
                      <div className="w-full rounded-lg bg-accent/10 px-3 py-2.5 text-center">
                        <p className="text-xs text-text-muted">请用手机浏览器访问以下网站</p>
                        <p className="mt-1 text-sm font-semibold text-accent">
                          http://175.27.141.172:3210/mobile
                        </p>
                        <p className="mt-0.5 text-xs text-text-muted">
                          配对码：<span className="font-mono font-bold text-text-primary tracking-widest">{remoteState.pairCode}</span>
                        </p>
                      </div>
                      {/* QR 码 */}
                      {remoteState.qrDataUrl && !remoteState.phoneConnected && (
                        <div className="flex flex-col items-center gap-2">
                          <img src={remoteState.qrDataUrl} alt="QR Code" className="rounded-lg" style={{ width: 180, height: 180 }} />
                          <p className="text-xs text-text-muted">或扫描二维码自动填入配对码</p>
                        </div>
                      )}
                      {/* 已配对状态 */}
                      {remoteState.phoneConnected && (
                        <div className="flex flex-col items-center gap-2 py-4">
                          <div className="flex items-center gap-2 text-success">
                            <CheckCircle2 size={20} />
                            <span className="text-sm font-medium">手机已连接</span>
                          </div>
                        </div>
                      )}
                      {/* 等待二维码生成 */}
                      {!remoteState.phoneConnected && !remoteState.qrDataUrl && (
                        <div className="flex items-center gap-2 py-4">
                          <Loader2 size={16} className="animate-spin text-accent" />
                          <span className="text-sm text-text-muted">正在生成二维码...</span>
                        </div>
                      )}
                      <button
                        className="btn-ghost flex items-center gap-1.5 text-danger"
                        onClick={() => void stopRemote()}
                      >
                        <StopCircle size={14} />
                        停止服务
                      </button>
                      {remoteError && (
                        <span className="text-xs text-danger">{remoteError}</span>
                      )}
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* ========== 关于 ========== */}
            {activeSection === 'about' && (
              <div className="space-y-4">
                <SectionHeader
                  icon={Info}
                  title="关于"
                  desc="版本信息、检查更新与发布说明"
                />

                {/* 当前版本 + 检查更新按钮 */}
                <Card>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 flex flex-col">
                      <span className="text-sm text-text-primary">
                        Xcomputer {currentVersion && <span className="text-text-muted">v{currentVersion}</span>}
                      </span>
                      <span className="text-xs text-text-muted">
                        {updateStatus.type === 'idle' && updateStatus.message
                          ? updateStatus.message
                          : updateStatus.type === 'checking'
                            ? '正在检查更新...'
                            : updateStatus.type === 'error'
                              ? `检查失败：${updateStatus.message}`
                              : '检查是否有新版本'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost shrink-0 border border-border"
                      disabled={checkingUpdate || downloadingUpdate}
                      onClick={() => void handleCheckUpdate()}
                    >
                      {checkingUpdate ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      检查更新
                    </button>
                  </div>
                </Card>

                {/* 发现新版本 — 下载并安装 */}
                {updateStatus.type === 'available' && updateStatus.updateInfo && (
                  <Card>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1 flex flex-col">
                        <span className="text-sm text-text-primary">
                          发现新版本 <span className="font-semibold text-accent">v{updateStatus.updateInfo.version}</span>
                        </span>
                        <span className="text-xs text-text-muted">
                          大小 {updateStatus.updateInfo.size} · 发布于 {updateStatus.updateInfo.updatedAt}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-primary shrink-0"
                        disabled={downloadingUpdate}
                        onClick={() => void handleDownloadUpdate(updateStatus.updateInfo!)}
                      >
                        {downloadingUpdate ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                        下载并安装
                      </button>
                    </div>
                  </Card>
                )}

                {/* 下载进度 */}
                {updateStatus.type === 'downloading' && (
                  <Card>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-text-secondary">下载中...</span>
                      <span className="font-mono text-text-muted">
                        {updateStatus.progress ?? 0}% {updateStatus.message && `· ${updateStatus.message}`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-200"
                        style={{ width: `${updateStatus.progress ?? 0}%` }}
                      />
                    </div>
                  </Card>
                )}

                {/* 下载完成 — 立即安装 */}
                {updateStatus.type === 'downloaded' && updateStatus.downloadedPath && (
                  <Card>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1 flex flex-col">
                        <span className="text-sm text-success flex items-center gap-1.5">
                          <CheckCircle2 size={14} />
                          下载完成
                        </span>
                        <span className="text-xs text-text-muted">点击安装后应用将退出并启动安装程序</span>
                      </div>
                      <button
                        type="button"
                        className="btn-primary shrink-0"
                        onClick={() => void handleInstallUpdate(updateStatus.downloadedPath!)}
                      >
                        <Package size={14} />
                        立即安装
                      </button>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {saveError && (
            <span className="mr-auto text-xs text-danger">{saveError}</span>
          )}
          <button className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={() => void handleSave()}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

/** 分区头部标题 */
function SectionHeader({ icon: Icon, title, desc }: { icon: typeof KeyRound; title: string; desc: string }): JSX.Element {
  return (
    <div className="flex items-start gap-2.5 border-b border-border-muted pb-3">
      <Icon size={16} className="mt-0.5 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="mt-0.5 text-xs text-text-muted">{desc}</div>
      </div>
    </div>
  )
}

/** 卡片容器 */
function Card({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-bg-input p-3.5">
      {children}
    </div>
  )
}

/** 标准化 Toggle 开关 */
function ToggleSwitch({
  checked,
  disabled,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-bg-hover'
      } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      onClick={() => { if (!disabled) onChange(!checked) }}
    >
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform"
        style={{
          transform: checked ? 'translateX(18px)' : 'translateX(4px)'
        }}
      />
    </button>
  )
}

/** 带图标的 Toggle 行 */
function ToggleRow({
  icon: Icon,
  iconColor,
  title,
  desc,
  checked,
  onChange
}: {
  icon: typeof KeyRound
  iconColor: string
  title: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Icon size={16} className={iconColor} />
        <div className="flex flex-col">
          <span className="text-sm text-text-primary">{title}</span>
          <span className="text-xs text-text-muted">{desc}</span>
        </div>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <label className="mb-1 block text-xs text-text-secondary">{label}</label>
      {children}
    </div>
  )
}

function TestButton({
  testing,
  result,
  onClick,
  label
}: {
  testing: boolean
  result: ConnectionTestResult | null
  onClick: () => void
  label: string
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <button className="btn-ghost border border-border" onClick={onClick} disabled={testing}>
        {testing ? <Loader2 size={14} className="animate-spin" /> : null}
        {label}
      </button>
      {result && (
        <span className="flex items-center gap-1 text-xs">
          {result.ok ? (
            <>
              <CheckCircle2 size={13} className="text-success" />
              <span className="text-success">{result.message}</span>
            </>
          ) : (
            <>
              <XCircle size={13} className="text-danger" />
              <span className="text-danger">{result.message}</span>
            </>
          )}
        </span>
      )}
    </div>
  )
}
