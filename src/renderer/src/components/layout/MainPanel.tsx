import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Sparkles,
  User,
  Square,
  Command,
  Monitor,
  FolderOpen,
  Terminal,
  CalendarClock,
  Cpu,
  ArrowRight,
  AlertTriangle,
  Settings,
  Zap,
  Plus,
  Users,
  Loader2,
  ClipboardList,
  FileText
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useChatStore } from '../../store/chat.store'
import { useSessionStore } from '../../store/session.store'
import { useSettingsStore } from '../../store/settings.store'
import { useQuotaStore } from '../../store/quota.store'
import { useSession } from '../../hooks/useSession'
import { useSend, useChatEvents } from '../../hooks/useChat'
import { useQuotaSync } from '../../hooks/useQuotaSync'
import { ChatInput } from '../chat/ChatInput'
import { ChatMessage } from '../chat/ChatMessage'
import { TaskStepList } from '../task/TaskStepList'
import type { LocalModelStatus, ChatMode } from '@shared/types'

const CAPABILITY_CARDS = [
  {
    icon: Command,
    title: '应用控制',
    desc: '打开、关闭、操作各类 Windows 应用'
  },
  {
    icon: FolderOpen,
    title: '文件管理',
    desc: '读取、写入、移动、搜索、整理文件'
  },
  {
    icon: Monitor,
    title: '屏幕交互',
    desc: '截图、查看 UI、自动点击和操作'
  },
  {
    icon: Terminal,
    title: '后台终端',
    desc: '执行命令、管理进程、批量操作'
  },
  {
    icon: CalendarClock,
    title: '定时任务',
    desc: '按单次/间隔/每日/每周自动执行'
  },
  {
    icon: Cpu,
    title: '系统管理',
    desc: '进程、注册表、系统设置控制'
  }
]

const EXAMPLE_PROMPTS = [
  '打开记事本并写一首诗',
  '截取当前屏幕并保存到桌面',
  '整理桌面文件到对应文件夹'
]

/** 虚拟化启用阈值：超过此条数时启用虚拟滚动，避免长会话 DOM 爆炸 */
const VIRTUALIZATION_THRESHOLD = 80

export function MainPanel(): JSX.Element {
  useChatEvents()
  const { currentSessionId, createSession, selectSession } = useSession()
  const messages = useChatStore((s) => s.messages)
  const streamingMessage = useChatStore((s) => s.streamingMessage)
  const stepsByMessageId = useChatStore((s) => s.stepsByMessageId)
  const steps = useChatStore((s) => s.steps)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const send = useSend()
  const scrollRef = useRef<HTMLDivElement>(null)
  // 防止示例按钮重复点击导致创建多个会话
  const creatingRef = useRef(false)
  // 记录用户是否手动向上滚动（流式更新时不强制拉回底部）
  const userScrolledUpRef = useRef(false)

  // 订阅设置变化：用于判断是否处于限免模式
  const relayMode = useSettingsStore((s) => s.settings.relayMode)
  const deepseekApiKey = useSettingsStore((s) => s.settings.deepseekApiKey)
  const openXEnabled = useSettingsStore((s) => s.settings.openXEnabled)
  const openXToken = useSettingsStore((s) => s.settings.openXToken)
  const localModelEnabled = useSettingsStore((s) => s.settings.localModel?.enabled ?? false)
  // 本地模型开启后优先级最高：覆盖限免模式，隐藏 relay 相关徽标/横幅
  const isRelayActive = !localModelEnabled && (relayMode || !deepseekApiKey.trim())

  // 本地模型运行状态（开启后订阅，用于显示"运行中"徽标与下载/加载进度）
  const [localModelStatus, setLocalModelStatus] = useState<LocalModelStatus | null>(null)
  useEffect(() => {
    if (!localModelEnabled) {
      setLocalModelStatus(null)
      return
    }
    void window.api.localModel.getStatus().then(setLocalModelStatus)
    const unsub = window.api.localModel.onStatus(setLocalModelStatus)
    return unsub
  }, [localModelEnabled])

  // 当前会话工作模式（plan/spec/task），用于显示模式横幅
  const [currentMode, setCurrentMode] = useState<ChatMode>('task')
  useEffect(() => {
    if (!currentSessionId) {
      setCurrentMode('task')
      return
    }
    void window.api.chat.getMode(currentSessionId).then(setCurrentMode).catch(() => setCurrentMode('task'))
    const unsub = window.api.chat.onModeChanged((payload) => {
      if (payload.sessionId === currentSessionId) {
        setCurrentMode(payload.mode)
      }
    })
    return unsub
  }, [currentSessionId])

  // 积分统一管理：免费 + 付费共享同一 store，与 SettingsModal/PurchaseModal 实时同步
  useQuotaSync(isRelayActive)
  const relayQuota = useQuotaStore((s) => s.relayQuota)
  const paidQuota = useQuotaStore((s) => s.paidQuota)
  const setPaidQuota = useQuotaStore((s) => s.setPaidQuota)

  // 排队状态（限免模式高并发时后端返回 429 + queue_pending，自动重试期间显示横幅）
  const [queueInfo, setQueueInfo] = useState<{ position: number; estimatedWaitMs: number; queueId: string; skipAvailable: boolean } | null>(null)
  const [skipping, setSkipping] = useState(false)

  useEffect(() => {
    const unsub = window.api.chat.onQueueUpdate((info) => {
      // 仅当属于当前会话时显示
      if (info.sessionId !== currentSessionId) return
      setQueueInfo({
        position: info.position,
        estimatedWaitMs: info.estimatedWaitMs,
        queueId: info.queueId,
        skipAvailable: info.skipAvailable
      })
    })
    return unsub
  }, [currentSessionId])

  // 切换会话或停止流式时清除排队提示
  useEffect(() => {
    if (!isStreaming) setQueueInfo(null)
  }, [isStreaming, currentSessionId])

  // 跳过排队：花费 10 积分
  const handleSkipQueue = async (): Promise<void> => {
    setSkipping(true)
    try {
      const result = await window.api.chat.skipQueue()
      if (result.success) {
        // 更新付费积分余额
        if (typeof result.balance === 'number') {
          setPaidQuota(paidQuota ? { ...paidQuota, balance: result.balance } : null)
        }
        setQueueInfo(null)
      }
      // 失败时不隐藏横幅，让用户看到错误（可通过 toast 或提示）
    } finally {
      setSkipping(false)
    }
  }

  // 监听远程指令：手机发送指令时，切换到对应会话
  useEffect(() => {
    const unsub = window.api.remote.onCommand((payload) => {
      // 切换到远程指令对应的会话
      void selectSession(payload.sessionId)
    })
    return unsub
  }, [selectSession])

  // 检测用户滚动位置：仅在接近底部时自动滚动
  const handleScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledUpRef.current = distanceFromBottom > 120
  }

  // 切换会话时重置滚动状态，避免上一个会话的"用户已上滚"标记
  // 阻止新会话自动滚动到底部显示最新消息
  useEffect(() => {
    userScrolledUpRef.current = false
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'auto' })
  }, [currentSessionId])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // 流式更新时使用瞬时滚动避免抖动；用户主动上滚时不自动拉回
    if (!userScrolledUpRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: isStreaming ? 'auto' : 'smooth' })
    }
  }, [messages, streamingMessage, steps, isStreaming])

  // 性能优化：用 Set 缓存已关联到消息的 stepId，避免嵌套循环 O(n×m)
  const associatedStepIds = useMemo(() => {
    const set = new Set<string>()
    for (const m of messages) {
      if (m.stepIds) for (const id of m.stepIds) set.add(id)
    }
    return set
  }, [messages])

  // 流式过程中尚未关联到任何消息的步骤
  const orphanSteps = useMemo(
    () => steps.filter((s) => !associatedStepIds.has(s.id)),
    [steps, associatedStepIds]
  )

  // 渲染列表：流式时附加 streamingMessage（O(1) 更新，不碰 messages 数组）
  const renderMessages = useMemo(
    () => (streamingMessage ? [...messages, streamingMessage] : messages),
    [messages, streamingMessage]
  )

  // 阈值门控虚拟化：>80 条消息时启用虚拟滚动，避免长会话 DOM 爆炸
  const shouldVirtualize = renderMessages.length > VIRTUALIZATION_THRESHOLD
  const rowVirtualizer = useVirtualizer({
    count: renderMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 5,
    enabled: shouldVirtualize,
    getItemKey: (index) => renderMessages[index].id
  })

  const handleStop = async (): Promise<void> => {
    if (currentSessionId) await window.api.chat.stop(currentSessionId)
  }

  const quotaExhausted = relayQuota !== null && relayQuota.remaining <= 0
  const hasPaidCredits = (paidQuota?.balance ?? 0) > 0
  // 本地模型未就绪时（下载中/加载中/出错/未下载）禁用输入
  const localModelNotReady =
    localModelEnabled &&
    localModelStatus !== null &&
    localModelStatus.state !== 'ready'
  // 限免耗尽且无付费积分时才禁用输入；有付费积分时允许继续（后端会扣付费额度）
  const inputDisabled =
    isStreaming || localModelNotReady || (quotaExhausted && !hasPaidCredits)

  const openSettings = (): void => {
    window.dispatchEvent(new CustomEvent('xcomputer:open-modal', { detail: 'settings' }))
  }

  const openPurchase = (): void => {
    window.dispatchEvent(new CustomEvent('xcomputer:open-modal', { detail: 'purchase' }))
  }

  const handleExampleClick = async (text: string): Promise<void> => {
    if (quotaExhausted) {
      openSettings()
      return
    }
    if (creatingRef.current) return
    let sessionId = currentSessionId
    if (!sessionId) {
      creatingRef.current = true
      try {
        await createSession()
        sessionId = useSessionStore.getState().currentSessionId
      } finally {
        creatingRef.current = false
      }
    }
    if (sessionId) {
      await send(text)
    }
  }

  // 监听自定义子智能体「立即使用」：发送引导消息到当前会话
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent).detail as { name: string }
      if (!detail?.name) return
      const text = `请使用"${detail.name}"子智能体完成以下任务：`
      void (async () => {
        if (quotaExhausted) {
          openSettings()
          return
        }
        if (creatingRef.current) return
        let sessionId = currentSessionId
        if (!sessionId) {
          creatingRef.current = true
          try {
            await createSession()
            sessionId = useSessionStore.getState().currentSessionId
          } finally {
            creatingRef.current = false
          }
        }
        if (sessionId) {
          await send(text)
        }
      })()
    }
    window.addEventListener('xcomputer:use-custom-subagent', handler)
    return () => window.removeEventListener('xcomputer:use-custom-subagent', handler)
  }, [currentSessionId, quotaExhausted, send, createSession])

  return (
    <main className="relative flex flex-1 flex-col bg-bg">
      {/* 右上角徽标：本地模型 / 积分（本地模型开启时优先显示） */}
      {localModelEnabled && localModelStatus ? (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
          <div
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-sm backdrop-blur ${
              localModelStatus.state === 'ready'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                : localModelStatus.state === 'error'
                  ? 'border-red-500/40 bg-red-500/10 text-red-500'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-500'
            }`}
            title={localModelStatus.message || localModelStatus.state}
          >
            <Cpu size={12} className="shrink-0" />
            <span className="font-medium">
              {localModelStatus.state === 'ready'
                ? '本地模型'
                : localModelStatus.state === 'downloading' || localModelStatus.state === 'loading'
                  ? `${Math.round(localModelStatus.progress * 100)}%`
                  : localModelStatus.state === 'error'
                    ? '本地模型错误'
                    : '本地模型'}
            </span>
          </div>
        </div>
      ) : relayQuota && !localModelEnabled ? (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
          {/* 付费积分部分（仅有余额时显示，点击 + 可购买更多） */}
          {paidQuota && paidQuota.balance > 0 && (
            <>
              <div
                className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs shadow-sm backdrop-blur"
                title={`付费积分余额：${paidQuota.balance}（累计购买 ${paidQuota.totalPurchased}）`}
              >
                <Zap size={12} className="shrink-0 text-accent" />
                <span className="font-medium text-accent">{paidQuota.balance}</span>
                <button
                  onClick={openPurchase}
                  title="购买积分"
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent/20 text-accent transition-colors hover:bg-accent/40"
                >
                  <Plus size={10} />
                </button>
              </div>
              {/* 分隔符：付费 + 免费 */}
              <span className="text-[10px] font-semibold text-text-muted">+</span>
            </>
          )}
          {/* 免费额度部分（限免模式始终显示） */}
          <div
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-sm backdrop-blur ${
              relayQuota.remaining > 10
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-red-500/40 bg-red-500/10 text-red-500'
            }`}
            title={`今日限免额度：已用 ${relayQuota.used} / ${relayQuota.limit} 次`}
          >
            <Sparkles size={12} className="shrink-0" />
            <span className="font-medium">
              {relayQuota.remaining} / {relayQuota.limit}
            </span>
          </div>
          {/* OpenX 内核加速指示器 */}
          {openXEnabled && (
            <div
              className="flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-xs shadow-sm backdrop-blur"
              title={openXToken ? 'OpenX 云端代理已启用（不扣积分）' : 'OpenX 本地解码已启用（限免模式，3 倍积分）'}
            >
              <Zap size={11} className="shrink-0 text-purple-500" />
              <span className="font-medium text-purple-500">OX</span>
            </div>
          )}
        </div>
      ) : null}
      {/* 消息流 */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        {/* Plan/Spec 模式横幅 */}
        {(currentMode === 'plan' || currentMode === 'spec') && currentSessionId && (
          <div className="sticky top-0 z-10 border-b border-purple-500/30 bg-purple-500/10 animate-slide-down">
            <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
              {currentMode === 'plan' ? (
                <ClipboardList size={16} className="shrink-0 text-purple-400" />
              ) : (
                <FileText size={16} className="shrink-0 text-purple-400" />
              )}
              <div className="flex-1 text-xs leading-relaxed text-purple-200">
                <span className="font-semibold text-purple-300">
                  {currentMode === 'plan' ? '计划模式' : '规格模式'}
                </span>
                <span className="text-purple-200/80">
                  {currentMode === 'plan'
                    ? ' · AI 只分析与规划，不执行修改。计划完成后回复「确认」开始执行'
                    : ' · AI 先写规格文档供审核。审核通过后回复「确认」开始实现'}
                </span>
              </div>
            </div>
          </div>
        )}
        {/* 本地模型状态横幅（开启但未就绪时提示下载/加载进度或错误） */}
        {localModelEnabled && localModelStatus && currentSessionId &&
          (localModelStatus.state === 'downloading' ||
            localModelStatus.state === 'loading' ||
            localModelStatus.state === 'error' ||
            localModelStatus.state === 'not-downloaded') && (
          <div className="sticky top-0 z-10 border-b border-amber-500/30 bg-amber-500/10 animate-slide-down">
            <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
              {localModelStatus.state === 'error' ? (
                <AlertTriangle size={16} className="shrink-0 text-amber-400" />
              ) : (
                <Loader2 size={16} className="shrink-0 animate-spin text-amber-400" />
              )}
              <div className="flex-1 text-xs leading-relaxed text-amber-200">
                <span className="font-semibold text-amber-300">
                  {localModelStatus.state === 'downloading'
                    ? '正在下载本地模型'
                    : localModelStatus.state === 'loading'
                      ? '正在加载本地模型'
                      : localModelStatus.state === 'error'
                        ? '本地模型加载失败'
                        : '本地模型未下载'}
                </span>
                <span className="text-amber-200/80">
                  {localModelStatus.state === 'downloading' || localModelStatus.state === 'loading'
                    ? ` · ${Math.round(localModelStatus.progress * 100)}% · ${localModelStatus.message || ''}`
                    : localModelStatus.error
                      ? ` · ${localModelStatus.error}`
                      : ''}
                </span>
              </div>
              <button
                onClick={openSettings}
                className="flex shrink-0 items-center gap-1 rounded-md bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/30"
              >
                <Settings size={12} />
                去设置
              </button>
            </div>
          </div>
        )}
        {/* 排队提示横幅（限免模式高并发时） */}
        {queueInfo && (
          <div className="sticky top-0 z-10 border-b border-blue-500/30 bg-blue-500/10 animate-slide-down">
            <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
              <Loader2 size={16} className="shrink-0 animate-spin text-blue-400" />
              <div className="flex-1 text-xs leading-relaxed text-blue-200">
                <span className="font-semibold text-blue-300">服务器繁忙，已进入排队</span>
                <span className="text-blue-200/80">
                  {' '}· 第 {queueInfo.position} 位，预计等待 {Math.ceil(queueInfo.estimatedWaitMs / 1000)} 秒
                </span>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-blue-300/70">
                  <Users size={9} />
                  系统正在自动重试，无需操作。急用可花费 10 积分跳过排队
                </div>
              </div>
              {queueInfo.skipAvailable && (
                <button
                  onClick={() => void handleSkipQueue()}
                  disabled={skipping}
                  className="flex shrink-0 items-center gap-1 rounded-md bg-blue-500/20 px-2.5 py-1 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/30 disabled:opacity-50"
                >
                  {skipping ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Zap size={12} />
                  )}
                  跳过排队
                </button>
              )}
            </div>
          </div>
        )}
        {/* 积分耗尽横幅（限免模式且剩余次数为 0 时显示） */}
        {quotaExhausted && currentSessionId && (
          <div className="sticky top-0 z-10 border-b border-amber-500/30 bg-amber-500/10 animate-slide-down">
            <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
              <AlertTriangle size={16} className="shrink-0 text-amber-400" />
              <div className="flex-1 text-xs leading-relaxed text-amber-200">
                <span className="font-semibold text-amber-300">今日限免额度已用完</span>
                <span className="text-amber-200/80"> · 明天 0 点自动重置，或立即购买积分继续使用</span>
              </div>
              <button
                onClick={openPurchase}
                className="flex shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent/90"
              >
                <Zap size={12} />
                购买积分
              </button>
              <button
                onClick={openSettings}
                className="flex shrink-0 items-center gap-1 rounded-md bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/30"
              >
                <Settings size={12} />
                去设置
              </button>
            </div>
          </div>
        )}
        {!currentSessionId ? (
          <div className="flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
            {/* 顶部品牌 */}
            <div className="mb-4 flex h-16 w-16 animate-fade-in-down items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 shadow-lg shadow-accent/10 ring-1 ring-accent/20 animate-glow-pulse">
              <Sparkles size={30} className="text-accent" />
            </div>
            <h2 className="mb-2 animate-fade-in-up bg-gradient-to-r from-text-primary via-accent to-text-secondary bg-clip-text text-2xl font-bold text-transparent animate-gradient-flow" style={{ animationDelay: '0.1s', animationFillMode: 'backwards' }}>
              Xcomputer
            </h2>
            <p className="mb-1 animate-fade-in-up text-sm text-text-secondary" style={{ animationDelay: '0.2s', animationFillMode: 'backwards' }}>
              一句话，让 AI 操控你的电脑
            </p>
            <p className="max-w-md animate-fade-in-up text-xs leading-5 text-text-muted" style={{ animationDelay: '0.3s', animationFillMode: 'backwards' }}>
              支持打开应用、文件操作、系统管理、办公自动化、定时任务等场景。
              <br />
              所有高风险操作均会请求你的确认。
            </p>

            {/* 快捷示例 */}
            <div className="mt-8 grid w-full max-w-xl animate-fade-in-up grid-cols-1 gap-2 text-left sm:grid-cols-3" style={{ animationDelay: '0.4s', animationFillMode: 'backwards' }}>
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="group flex flex-col items-start rounded-lg border border-border bg-bg-panel/50 px-3 py-2.5 text-left text-sm text-text-secondary transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:bg-bg-panel hover:text-text-primary hover:shadow-md"
                  onClick={() => void handleExampleClick(ex)}
                >
                  <span className="mb-1 flex items-center text-xs text-text-muted group-hover:text-accent">
                    <User size={10} className="mr-1" />
                    示例
                  </span>
                  <span className="line-clamp-2 text-xs leading-4">{ex}</span>
                  <ArrowRight
                    size={12}
                    className="mt-2 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                  />
                </button>
              ))}
            </div>

            {/* 能力卡片 */}
            <div className="mt-10 w-full max-w-3xl animate-fade-in-up" style={{ animationDelay: '0.5s', animationFillMode: 'backwards' }}>
              <div className="mb-3 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                <Sparkles size={12} />
                AI 能帮你做什么
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CAPABILITY_CARDS.map((card, idx) => {
                  const Icon = card.icon
                  return (
                    <div
                      key={card.title}
                      className="group animate-fade-in-up rounded-lg border border-border bg-bg-panel/30 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-bg-panel/70 hover:shadow-md"
                      style={{ animationDelay: `${0.6 + idx * 0.08}s`, animationFillMode: 'backwards' }}
                    >
                      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/10 transition-all group-hover:scale-105 group-hover:bg-accent/15">
                        <Icon size={16} />
                      </div>
                      <div className="text-xs font-medium text-text-primary">{card.title}</div>
                      <div className="mt-0.5 text-[11px] leading-4 text-text-muted">{card.desc}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <p className="mt-10 animate-fade-in text-xs text-text-muted" style={{ animationDelay: '1.2s', animationFillMode: 'backwards' }}>
              点击上方示例或左侧"新建会话"开始 · 按 <kbd className="rounded border border-border bg-bg-input px-1.5 py-0.5 text-[10px]">Ctrl+Shift+P</kbd> 打开命令面板
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.length === 0 && !isStreaming && !streamingMessage && (
              <div className="flex min-h-[60vh] animate-blur-in flex-col items-center justify-center py-8 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/10 animate-glow-pulse animate-float">
                  <Sparkles size={22} />
                </div>
                <h3 className="mb-1 text-base font-medium text-text-primary">新的对话</h3>
                <p className="mb-6 max-w-sm text-xs leading-5 text-text-muted">
                  在下方输入框发送第一条消息，AI 将自动分析意图并执行操作。
                </p>
                <div className="grid w-full max-w-md grid-cols-1 gap-2 text-left">
                  {EXAMPLE_PROMPTS.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      className="group stagger-item flex items-center justify-between rounded-lg border border-border bg-bg-panel/40 px-3 py-2 text-sm text-text-secondary transition-all hover:border-accent/50 hover:bg-bg-panel hover:text-text-primary hover:translate-x-1"
                      onClick={() => void handleExampleClick(ex)}
                    >
                      <span className="flex items-center gap-2">
                        <User size={12} className="opacity-40 group-hover:opacity-70" />
                        {ex}
                      </span>
                      <ArrowRight
                        size={12}
                        className="opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {shouldVirtualize ? (
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: 'relative',
                  width: '100%'
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const m = renderMessages[virtualRow.index]
                  return (
                    <div
                      key={m.id}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`
                      }}
                    >
                      {m.role === 'assistant' && m.stepIds && m.stepIds.length > 0 && (
                        <TaskStepList
                          steps={stepsByMessageId.get(m.id) ?? []}
                          messageId={m.id}
                        />
                      )}
                      <ChatMessage message={m} />
                    </div>
                  )
                })}
              </div>
            ) : (
              renderMessages.map((m) => (
                <div key={m.id}>
                  {/* assistant 消息：先展示操作步骤，再展示结果文本 */}
                  {m.role === 'assistant' && m.stepIds && m.stepIds.length > 0 && (
                    <TaskStepList
                      steps={stepsByMessageId.get(m.id) ?? []}
                      messageId={m.id}
                    />
                  )}
                  <ChatMessage message={m} />
                </div>
              ))
            )}
            {/* 流式过程中：显示尚未关联到任何消息的步骤 */}
            {isStreaming && orphanSteps.length > 0 && (
              <TaskStepList steps={orphanSteps} messageId="streaming" />
            )}
            {isStreaming && steps.length === 0 && !streamingMessage && (
              <div className="flex animate-fade-in items-center gap-2 py-2 text-sm text-text-muted">
                <span className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
                </span>
                AI 思考中...
              </div>
            )}
          </div>
        )}
      </div>

      {/* 输入区 */}
      {currentSessionId && (
        <div className="border-t border-border bg-bg-panel/50 px-4 py-3 backdrop-blur shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-3xl">
            <ChatInput onSend={(t) => void send(t)} disabled={inputDisabled} />
            {isStreaming && (
              <button
                className="mt-2 flex animate-fade-in items-center gap-1.5 text-xs text-danger transition-opacity hover:opacity-80"
                onClick={() => void handleStop()}
              >
                <span className="flex h-3 w-3 items-center justify-center">
                  <Square size={10} className="fill-current animate-pulse" />
                </span>
                停止生成
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
