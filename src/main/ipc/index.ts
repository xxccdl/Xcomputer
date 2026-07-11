import { BrowserWindow } from 'electron'
import { registerSettingsIpc } from './settings.ipc'
import { registerSessionIpc } from './session.ipc'
import { registerChatIpc } from './chat.ipc'
import { registerWindowIpc } from './window.ipc'
import { registerMcpStatusIpc } from './mcp-status.ipc'
import { registerFloatingBallIpc } from './floating-ball.ipc'
import { registerScheduleIpc } from './schedule.ipc'
import { registerMemoryIpc } from './memory.ipc'
import { registerSkillsIpc } from './skills.ipc'
import { registerSkillHubIpc } from './skill-hub.ipc'
import { registerTemplateIpc } from './templates.ipc'
import { registerRemoteIpc } from './remote.ipc'
import { registerTriggerIpc } from './triggers.ipc'
import { registerShortcutIpc } from './shortcuts.ipc'
import { registerFileSearchIpc } from './file-search.ipc'
import { registerSnippetIpc } from './snippets.ipc'
import { registerInitIpc } from './init.ipc'
import { registerSelfCheckIpc } from './self-check.ipc'
import { registerUpdateIpc } from './update.ipc'
import { registerPaymentIpc } from './payment.ipc'
import { registerLocalModelIpc } from './local-model.ipc'
import { registerCustomSubagentsIpc } from './custom-subagents.ipc'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerSettingsIpc(mainWindow)
  registerSessionIpc()
  registerChatIpc(mainWindow)
  registerWindowIpc(mainWindow)
  registerMcpStatusIpc(mainWindow)
  registerFloatingBallIpc(mainWindow)
  registerScheduleIpc(mainWindow)
  registerMemoryIpc(mainWindow)
  registerSkillsIpc(mainWindow)
  registerSkillHubIpc(mainWindow)
  registerTemplateIpc()
  registerRemoteIpc(mainWindow)
  registerTriggerIpc(mainWindow)
  registerShortcutIpc(mainWindow)
  registerFileSearchIpc()
  registerSnippetIpc(mainWindow)
  registerInitIpc(mainWindow)
  registerSelfCheckIpc(mainWindow)
  registerUpdateIpc(mainWindow)
  registerPaymentIpc(mainWindow)
  registerLocalModelIpc(mainWindow)
  registerCustomSubagentsIpc(mainWindow)
}
