import { useEffect, useState, useCallback } from 'react'
import { Minus, Square, X, Copy, Settings, PanelRightClose, PanelRightOpen, Clock, Brain, BookOpen, Bookmark, Zap, Terminal, Search, Code } from 'lucide-react'
import { useChatStore } from '../../store/chat.store'
import { SettingsModal } from '../settings/SettingsModal'
import { ScheduleModal } from '../schedule/ScheduleModal'
import { MemoryModal } from '../memory/MemoryModal'
import { SkillsModal } from '../skills/SkillsModal'
import { TemplatesModal } from '../templates/TemplatesModal'
import { TriggersModal } from '../triggers/TriggersModal'
import { ShortcutsModal } from '../shortcuts/ShortcutsModal'
import { FileSearchModal } from '../filesearch/FileSearchModal'
import { SnippetsModal } from '../snippets/SnippetsModal'
import { PurchaseModal } from '../payment/PurchaseModal'
import { focusChatInput } from '../chat/ChatInput'

export function TitleBar(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [triggersOpen, setTriggersOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [fileSearchOpen, setFileSearchOpen] = useState(false)
  const [snippetsOpen, setSnippetsOpen] = useState(false)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const detailPanelOpen = useChatStore((s) => s.detailPanelOpen)
  const setDetailPanelOpen = useChatStore((s) => s.setDetailPanelOpen)

  useEffect(() => {
    let mounted = true
    window.api.window.isMaximized().then((v) => {
      if (mounted) setIsMaximized(v)
    })
    const unsub = window.api.window.onMaximizedChanged((v) => {
      if (mounted) setIsMaximized(v)
    })
    return () => {
      mounted = false
      unsub()
    }
  }, [])

  // 监听命令面板的打开模态框事件
  useEffect(() => {
    const handler = (e: Event): void => {
      const modal = (e as CustomEvent<string>).detail
      switch (modal) {
        case 'settings':
          setSettingsOpen(true)
          break
        case 'schedule':
          setScheduleOpen(true)
          break
        case 'memory':
          setMemoryOpen(true)
          break
        case 'skills':
          setSkillsOpen(true)
          break
        case 'templates':
          setTemplatesOpen(true)
          break
        case 'triggers':
          setTriggersOpen(true)
          break
        case 'shortcuts':
          setShortcutsOpen(true)
          break
        case 'fileSearch':
          setFileSearchOpen(true)
          break
        case 'snippets':
          setSnippetsOpen(true)
          break
        case 'purchase':
          setPurchaseOpen(true)
          break
      }
    }
    window.addEventListener('xcomputer:open-modal', handler)
    return () => window.removeEventListener('xcomputer:open-modal', handler)
  }, [])

  const isWindows = window.api.platform === 'win32'

  /** 关闭模态框后延迟恢复焦点到聊天输入框 */
  const closeAndRefocus = useCallback((setter: (v: boolean) => void) => {
    return (): void => {
      setter(false)
      setTimeout(() => focusChatInput(), 100)
    }
  }, [])

  return (
    <>
      <header
        className="flex h-10 select-none items-center justify-between border-b border-border bg-bg-panel/80 backdrop-blur"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* macOS 留出左侧空间给红绿灯 */}
        {!isWindows && <div className="w-16" />}

        {/* 左侧拖拽区：图标 + 标题 */}
        <div className="flex flex-1 items-center gap-2 px-3">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-accent to-accent-hover shadow-sm animate-float">
            <span className="font-mono text-[10px] font-bold text-white">X</span>
          </div>
          <span className="font-mono text-xs font-semibold tracking-tight text-gradient">
            Xcomputer
          </span>
          <span className="rounded-full border border-border bg-bg-hover px-1.5 py-0 text-[9px] font-medium text-text-muted">
            AI 桌面助手
          </span>
        </div>

        {/* 右侧：功能按钮 + 窗口控制按钮（均不可拖拽） */}
        <div
          className="flex items-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            className="flex h-10 w-9 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            onClick={() => setDetailPanelOpen(!detailPanelOpen)}
            title={detailPanelOpen ? '隐藏详情面板' : '显示详情面板'}
          >
            {detailPanelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
          <button
            className="flex h-10 w-9 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            onClick={() => setFileSearchOpen(true)}
            title="文件搜索"
          >
            <Search size={15} />
          </button>
          <button
            className="flex h-10 w-9 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            onClick={() => setSnippetsOpen(true)}
            title="代码片段"
          >
            <Code size={15} />
          </button>
          <button
            className="flex h-10 w-9 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            onClick={() => setShortcutsOpen(true)}
            title="快捷指令"
          >
            <Terminal size={15} />
          </button>
          <button
            className="flex h-10 w-9 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            onClick={() => setTriggersOpen(true)}
            title="自动化触发器"
          >
            <Zap size={15} />
          </button>
          <button
            className="flex h-10 w-9 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            onClick={() => setMemoryOpen(true)}
            title="Xmemory 记忆系统"
          >
            <Brain size={15} />
          </button>
          <button
            className="flex h-10 w-9 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            onClick={() => setSkillsOpen(true)}
            title="技能系统"
          >
            <BookOpen size={15} />
          </button>
          <button
            className="flex h-10 w-9 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            onClick={() => setTemplatesOpen(true)}
            title="任务模板"
          >
            <Bookmark size={15} />
          </button>
          <button
            className="flex h-10 w-9 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            onClick={() => setScheduleOpen(true)}
            title="定时任务"
          >
            <Clock size={15} />
          </button>
          <button
            className="flex h-10 w-9 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            onClick={() => setSettingsOpen(true)}
            title="设置"
          >
            <Settings size={15} />
          </button>
          {isWindows && (
            <>
              <div className="mx-1 h-4 w-px bg-border" />
              <button
                className="flex h-10 w-11 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                onClick={() => window.api.window.minimize()}
                title="最小化"
              >
                <Minus size={14} />
              </button>
              <button
                className="flex h-10 w-11 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                onClick={() => window.api.window.maximize()}
                title={isMaximized ? '还原' : '最大化'}
              >
                {isMaximized ? <Copy size={12} /> : <Square size={12} />}
              </button>
              <button
                className="flex h-10 w-11 items-center justify-center text-text-muted transition-colors hover:bg-danger hover:text-white"
                onClick={() => window.api.window.close()}
                title="关闭"
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </header>
      {settingsOpen && <SettingsModal onClose={closeAndRefocus(setSettingsOpen)} />}
      {scheduleOpen && <ScheduleModal onClose={closeAndRefocus(setScheduleOpen)} />}
      {memoryOpen && <MemoryModal onClose={closeAndRefocus(setMemoryOpen)} />}
      {skillsOpen && <SkillsModal onClose={closeAndRefocus(setSkillsOpen)} />}
      {templatesOpen && <TemplatesModal onClose={closeAndRefocus(setTemplatesOpen)} />}
      {triggersOpen && <TriggersModal onClose={closeAndRefocus(setTriggersOpen)} />}
      {shortcutsOpen && <ShortcutsModal onClose={closeAndRefocus(setShortcutsOpen)} />}
      {fileSearchOpen && <FileSearchModal onClose={closeAndRefocus(setFileSearchOpen)} />}
      {snippetsOpen && <SnippetsModal onClose={closeAndRefocus(setSnippetsOpen)} />}
      {purchaseOpen && <PurchaseModal onClose={closeAndRefocus(setPurchaseOpen)} />}
    </>
  )
}
