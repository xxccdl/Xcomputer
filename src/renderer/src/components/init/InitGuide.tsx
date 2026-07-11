import React, { useState, useEffect, useRef } from 'react'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sparkles,
  Terminal,
  ArrowRight,
  KeyRound,
  Server,
  Zap,
  Bot,
  Check
} from 'lucide-react'
import type { Settings } from '@shared/types'
import { SUPPORTED_MODELS } from '@shared/constants'

type InitScenario = 'first-install' | 'venv-broken'
type Step = 'welcome' | 'model' | 'env' | 'done'

interface InitGuideProps {
  /** 初始化场景 */
  scenario: InitScenario
  /** 初始设置（用于预填充） */
  initialSettings: Settings
  /** 初始化完成（成功或跳过）后回调，关闭引导界面 */
  onComplete: () => void
}

/**
 * 首次安装初始化引导向导。
 *
 * first-install 流程：欢迎 → 配置 AI 模型 → 初始化环境 → 完成
 * venv-broken 流程：直接显示环境修复界面
 */
export function InitGuide({ scenario, initialSettings, onComplete }: InitGuideProps): JSX.Element {
  const startStep: Step = scenario === 'venv-broken' ? 'env' : 'welcome'
  const [step, setStep] = useState<Step>(startStep)
  const [form, setForm] = useState<Settings>(initialSettings)
  const [saving, setSaving] = useState(false)

  // 环境重建状态
  const [envState, setEnvState] = useState<'idle' | 'rebuilding' | 'success' | 'error'>('idle')
  const [progressMessages, setProgressMessages] = useState<string[]>([])
  const [envError, setEnvError] = useState<string | null>(null)
  const [autoCloseCountdown, setAutoCloseCountdown] = useState<number>(3)
  const scrollRef = useRef<HTMLDivElement>(null)
  const successHandledRef = useRef(false)

  // 监听重建进度
  useEffect(() => {
    const unsub = window.api.init.onProgress(({ message }) => {
      setProgressMessages((prev) => [...prev, message])
    })
    return unsub
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [progressMessages])

  // 进入环境步骤且未开始时自动启动重建
  useEffect(() => {
    if (step === 'env' && envState === 'idle') {
      void startRebuild()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, scenario])

  // 保存模型设置
  const saveModelSettings = async (): Promise<void> => {
    try {
      setSaving(true)
      await window.api.init.saveSettings({
        deepseekApiKey: form.deepseekApiKey,
        deepseekBaseURL: form.deepseekBaseURL,
        kimiApiKey: form.kimiApiKey,
        kimiBaseURL: form.kimiBaseURL,
        fastModel: form.fastModel,
        proModel: form.proModel,
        relayMode: form.relayMode
      })
      setStep('env')
    } catch (err) {
      console.error('[InitGuide] 保存设置失败:', err)
    } finally {
      setSaving(false)
    }
  }

  // 启动环境重建
  const startRebuild = async (): Promise<void> => {
    setEnvState('rebuilding')
    setProgressMessages([])
    setEnvError(null)
    try {
      const result = await window.api.init.rebuildVenv()
      if (result.success) {
        await window.api.init.complete()
        setEnvState('success')
      } else {
        setEnvError(result.error ?? '重建失败')
        setEnvState('error')
      }
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : '重建失败')
      setEnvState('error')
    }
  }

  // 成功后自动关闭倒计时
  useEffect(() => {
    if (step !== 'done' || successHandledRef.current) return
    successHandledRef.current = true
    const timer = setInterval(() => {
      setAutoCloseCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onComplete()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [step, onComplete])

  // 环境成功后自动进入完成页
  useEffect(() => {
    if (envState === 'success' && step === 'env') {
      const timer = setTimeout(() => setStep('done'), 800)
      return () => clearTimeout(timer)
    }
  }, [envState, step])

  const handleRetry = (): void => {
    void startRebuild()
  }

  const handleSkip = async (): Promise<void> => {
    await window.api.init.complete()
    onComplete()
  }

  const isKimiPro = form.proModel === 'kimi-k2.7-code-highspeed'
  // 限免模式（开关开启 或 未填 DeepSeek key）下允许不填 key
  const isRelayActive = form.relayMode || !form.deepseekApiKey.trim()
  const isModelValid = isRelayActive || (
    form.deepseekApiKey.trim().length > 0 &&
    form.deepseekBaseURL.trim().length > 0 &&
    (!isKimiPro || form.kimiApiKey.trim().length > 0)
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-bg-panel shadow-2xl animate-spring-scale max-h-[90vh]">
        {/* 头部 */}
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Sparkles size={18} className="text-accent" />
          <h2 className="text-base font-semibold text-text-primary">欢迎使用 Xcomputer</h2>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 'welcome' && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                首次安装需要完成两步简单配置，即可开始使用 AI 控制你的电脑。
              </p>
              <div className="grid gap-3">
                <div className="flex items-start gap-3 rounded-lg border border-border bg-bg-input p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10">
                    <KeyRound size={15} className="text-accent" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-text-primary">1. 配置 AI 模型</div>
                    <div className="text-xs text-text-muted">设置 API Key 和模型，支持 DeepSeek 与 Kimi</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border bg-bg-input p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10">
                    <Terminal size={15} className="text-accent" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-text-primary">2. 初始化运行环境</div>
                    <div className="text-xs text-text-muted">自动下载并配置 MCP 所需的 Python 环境</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'model' && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                请配置 AI 服务。可开启限免模式免填 API Key，或自行填写 DeepSeek/Kimi 密钥。
              </p>

              {/* 限免模式开关 */}
              <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
                      <Sparkles size={13} />
                      限免模式（推荐新手）
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-text-muted">
                      通过 xskillhub 中继免费使用 DeepSeek，免填 API Key（每日 50 次、仅 flash 模型、支持工具调用）
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.relayMode}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      form.relayMode ? 'bg-accent' : 'bg-bg-hover'
                    }`}
                    onClick={() => setForm({ ...form, relayMode: !form.relayMode })}
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform"
                      style={{
                        transform: form.relayMode ? 'translateX(18px)' : 'translateX(4px)'
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* DeepSeek 配置 */}
              <div className="rounded-lg border border-border bg-bg-input p-3">
                <div className="mb-2 text-xs font-medium text-text-primary">DeepSeek</div>
                <div className="space-y-3">
                  <Field label="API Key" icon={<KeyRound size={13} />}>
                    <input
                      type="password"
                      className="input font-mono"
                      value={form.deepseekApiKey}
                      placeholder="sk-xxxx"
                      onChange={(e) => setForm({ ...form, deepseekApiKey: e.target.value })}
                    />
                  </Field>

                  <Field label="Base URL" icon={<Server size={13} />}>
                    <input
                      className="input font-mono"
                      value={form.deepseekBaseURL}
                      placeholder="https://api.deepseek.com/v1"
                      onChange={(e) => setForm({ ...form, deepseekBaseURL: e.target.value })}
                    />
                  </Field>
                </div>
              </div>

              {/* Kimi 配置 */}
              <div className="rounded-lg border border-border bg-bg-input p-3">
                <div className="mb-2 text-xs font-medium text-text-primary">Kimi (Moonshot)</div>
                <div className="space-y-3">
                  <Field label="API Key" icon={<KeyRound size={13} />}>
                    <input
                      type="password"
                      className="input font-mono"
                      value={form.kimiApiKey}
                      placeholder="从 Kimi 开放平台获取"
                      onChange={(e) => setForm({ ...form, kimiApiKey: e.target.value })}
                    />
                  </Field>

                  <Field label="Base URL" icon={<Server size={13} />}>
                    <input
                      className="input font-mono"
                      value={form.kimiBaseURL}
                      placeholder="https://api.moonshot.cn/v1"
                      onChange={(e) => setForm({ ...form, kimiBaseURL: e.target.value })}
                    />
                  </Field>
                </div>
              </div>

              {/* 模型选择 */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="快速模型" icon={<Zap size={13} />}>
                  <select
                    className="input font-mono text-xs"
                    value={form.fastModel}
                    onChange={(e) => setForm({ ...form, fastModel: e.target.value })}
                  >
                    {SUPPORTED_MODELS.FAST.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field label="专业模型" icon={<Bot size={13} />}>
                  <select
                    className="input font-mono text-xs"
                    value={form.proModel}
                    onChange={(e) => setForm({ ...form, proModel: e.target.value })}
                  >
                    {SUPPORTED_MODELS.PRO.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {isRelayActive ? (
                <p className="text-xs text-accent inline-flex items-center gap-1">
                  <Check size={14} />
                  限免模式已启用，无需填写 API Key 即可使用 AI 功能
                </p>
              ) : !isModelValid && (
                <p className="text-xs text-text-muted">
                  请至少填写当前使用模型的 API Key（DeepSeek 必填，选择 Kimi 时还需填写 Kimi Key），或开启限免模式
                </p>
              )}
            </div>
          )}

          {(step === 'env' || step === 'done') && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                {scenario === 'venv-broken'
                  ? '检测到 MCP 运行环境损坏，正在自动修复...'
                  : envState === 'success'
                    ? '环境初始化完成！'
                    : '正在初始化 MCP 运行环境，首次配置约需 1-2 分钟，请耐心等待...'}
              </p>

              <div
                ref={scrollRef}
                className="h-48 overflow-y-auto rounded-md border border-border bg-bg-input p-3 font-mono text-xs"
              >
                {progressMessages.length === 0 && envState === 'rebuilding' && (
                  <p className="text-text-muted">等待开始...</p>
                )}
                {progressMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`mb-1 ${
                      i === progressMessages.length - 1 && envState === 'rebuilding'
                        ? 'text-accent'
                        : 'text-text-muted'
                    }`}
                  >
                    <span className="text-text-muted">[{String(i + 1).padStart(2, '0')}]</span> {msg}
                  </div>
                ))}
                {envState === 'success' && (
                  <div className="mt-2 flex items-center gap-1 text-green-400">
                    <CheckCircle2 size={12} /> 初始化成功
                  </div>
                )}
                {envState === 'error' && (
                  <div className="mt-2 flex items-center gap-1 text-danger">
                    <XCircle size={12} /> {envError ?? '未知错误'}
                  </div>
                )}
              </div>

              {envState === 'error' && envError && (
                <p className="text-xs text-danger">{envError}</p>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          {step === 'welcome' && (
            <>
              <span className="text-xs text-text-muted">共 2 步配置</span>
              <button
                className="btn-primary flex items-center gap-1.5"
                onClick={() => setStep('model')}
              >
                开始配置 <ArrowRight size={13} />
              </button>
            </>
          )}

          {step === 'model' && (
            <>
              <button
                className="text-xs text-text-muted transition-colors hover:text-text-primary"
                onClick={() => void handleSkip()}
              >
                跳过引导
              </button>
              <button
                className="btn-primary flex items-center gap-1.5"
                onClick={() => void saveModelSettings()}
                disabled={!isModelValid || saving}
              >
                {saving ? (
                  <><Loader2 size={13} className="animate-spin" /> 保存中...</>
                ) : (
                  <>下一步 <ArrowRight size={13} /></>
                )}
              </button>
            </>
          )}

          {step === 'env' && (
            <>
              {envState === 'error' ? (
                <button
                  className="text-xs text-text-muted transition-colors hover:text-text-primary"
                  onClick={() => void handleSkip()}
                >
                  跳过初始化
                </button>
              ) : (
                <span className="flex items-center gap-1 text-xs text-text-muted">
                  <Terminal size={11} /> 配置 Python 环境
                </span>
              )}

              {envState === 'error' ? (
                <button
                  className="btn-primary flex items-center gap-1.5"
                  onClick={handleRetry}
                >
                  <RefreshCw size={13} /> 重试
                </button>
              ) : envState === 'rebuilding' ? (
                <Loader2 size={16} className="animate-spin text-accent" />
              ) : envState === 'success' ? (
                <button className="btn-primary" onClick={() => setStep('done')}>
                  立即进入
                </button>
              ) : null}
            </>
          )}

          {step === 'done' && (
            <>
              <span className="text-xs text-text-muted">{autoCloseCountdown}s 后自动进入</span>
              <button className="btn-primary" onClick={onComplete}>
                立即进入
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  icon,
  children
}: {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-xs text-text-secondary">
        {icon}
        {label}
      </label>
      {children}
    </div>
  )
}
