import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ThreeColumnLayout } from './components/layout/ThreeColumnLayout'
import { InitGuide } from './components/init/InitGuide'
import { MainMiniStatusBar } from './components/MainMiniStatusBar'
import { useSettingsStore } from './store/settings.store'
import { useSession } from './hooks/useSession'
import { initMcpStatus } from './store/mcp.store'
import type { Settings } from '@shared/types'

type InitScenario = 'first-install' | 'venv-broken' | 'none'

interface InitState {
  scenario: InitScenario
  needInit: boolean
  settings: Settings
}

export default function App(): JSX.Element {
  const setSettings = useSettingsStore((s) => s.setSettings)
  const { createSession } = useSession()
  const [apiMissing, setApiMissing] = useState(false)
  // null = 检查中
  const [initState, setInitState] = useState<InitState | null>(null)
  // 主窗口 mini 模式（agent 执行中 blur 时缩为右下角状态药丸）
  const [isMainMini, setIsMainMini] = useState(false)

  /** 重新检查初始化场景并更新状态（用于首次加载和手动触发向导） */
  const refreshInitState = async (): Promise<void> => {
    const result = await window.api.init.check()
    setInitState({
      scenario: result.scenario,
      needInit: result.needInit,
      settings: result.settings
    })
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as Window & { api?: unknown }).api) {
      console.error('[App] window.api is not available; preload may have failed.')
      setApiMissing(true)
      return
    }

    // 检查初始化场景（与 settings 加载并行）
    void refreshInitState()

    void window.api.settings.get().then(setSettings)
    const unsub = window.api.settings.onChanged(setSettings)
    // initMcpStatus 返回 unsubscribe 函数，避免 StrictMode 下重复注册导致监听器泄漏
    let unsubMcp: (() => void) | undefined
    void initMcpStatus().then((unsub) => {
      unsubMcp = unsub
    })

    // 监听悬浮球触发的快捷操作
    const unsubFloatingBall = window.api.floatingBall.onAction((action) => {
      if (action === 'newSession') {
        void createSession()
      }
    })

    // 监听手动触发的显示向导事件（来自设置面板的"启动向导"按钮）
    const unsubShowGuide = window.api.init.onShowGuide(() => {
      void refreshInitState()
    })

    // 监听主窗口 mini/full 模式切换（agent 执行中 blur 时触发）
    const unsubMini = window.api.window.onMiniMode(() => {
      setIsMainMini(true)
    })
    const unsubFull = window.api.window.onFullMode(() => {
      setIsMainMini(false)
    })

    return () => {
      unsub()
      unsubFloatingBall()
      unsubMcp?.()
      unsubShowGuide()
      unsubMini()
      unsubFull()
    }
  }, [setSettings, createSession])

  if (apiMissing) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0d1117] text-[#c9d1d9]">
        <div className="max-w-md rounded-lg border border-[#30363d] bg-[#161b22] p-6 shadow-lg">
          <h2 className="mb-2 text-lg font-semibold text-[#f85149]">preload 加载失败</h2>
          <p className="text-sm text-[#8b949e]">
            未能注入 window.api，请打开 DevTools (Ctrl+Shift+I) 查看 Console 错误。
          </p>
        </div>
      </div>
    )
  }

  // 初始化检查中
  if (initState === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-base">
        <Loader2 size={28} className="animate-spin text-accent" />
      </div>
    )
  }

  // 首次安装或环境损坏时显示初始化引导
  if (initState.needInit && initState.scenario !== 'none') {
    return (
      <InitGuide
        scenario={initState.scenario}
        initialSettings={initState.settings}
        onComplete={() => setInitState({ ...initState, needInit: false, scenario: 'none' })}
      />
    )
  }

  // 主窗口 mini 模式：ThreeColumnLayout 保持挂载（CSS 隐藏，保留事件监听器），
  // 叠加 mini 状态药丸。跟小组件 mini 模式一样的做法——不卸载完整 UI，
  // 避免 mini → full 切换时 confirm/ask 请求事件丢失。
  return (
    <div className={`main-app-root ${isMainMini ? 'main-mini-active' : ''}`}>
      <div className={`main-full-ui ${isMainMini ? 'main-full-hidden' : ''}`}>
        <ThreeColumnLayout />
      </div>
      {isMainMini && (
        <div className="main-mini-container">
          <MainMiniStatusBar />
        </div>
      )}
    </div>
  )
}
