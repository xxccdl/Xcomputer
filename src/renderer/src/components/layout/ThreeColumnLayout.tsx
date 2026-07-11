import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { MainPanel } from './MainPanel'
import { DetailPanel } from './DetailPanel'
import { ConfirmDialog } from '../chat/ConfirmDialog'
import { AskDialog } from '../chat/AskDialog'
import { CommandPalette } from '../command/CommandPalette'
import { UpdateBanner } from '../update/UpdateBanner'
import { useChatStore } from '../../store/chat.store'

export function ThreeColumnLayout(): JSX.Element {
  const detailPanelOpen = useChatStore((s) => s.detailPanelOpen)

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Windows 自定义标题栏（含图标、功能按钮、窗口控制） */}
      <TitleBar />

      {/* 更新提示横幅（检测到更新/下载中/下载完成时显示） */}
      <UpdateBanner />

      {/* 三栏主体 */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <MainPanel />
        {detailPanelOpen && <DetailPanel />}
      </div>

      <ConfirmDialog />
      <AskDialog />
      {/* 快捷命令面板（Ctrl+Shift+P 唤起） */}
      <CommandPalette />
    </div>
  )
}
