import { ipcMain, dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { IPC_CHANNELS } from '@shared/constants'
import type { Session, TaskStep, Message } from '@shared/types'
import { extractTextFromContent } from '@shared/types'
import { sessionsStore } from '../store/sessions'
import { cleanupSessionLocalState, getTodoItems } from '../tools/local-tools'
import { subagentManager } from '../orchestrator/subagent-manager'
import { logger } from '../utils/logger'

/** 将会话消息 + 步骤格式化为 Markdown 文档 */
function formatSessionAsMarkdown(meta: Session, messages: Message[], steps: TaskStep[]): string {
  const lines: string[] = []
  const dateStr = new Date(meta.createdAt).toLocaleString('zh-CN')

  lines.push(`# ${meta.title}`)
  lines.push('')
  lines.push(`> 导出时间：${new Date().toLocaleString('zh-CN')}`)
  lines.push(`> 创建时间：${dateStr}`)
  lines.push('')

  // 操作步骤概览
  if (steps.length > 0) {
    lines.push('## 操作步骤')
    lines.push('')
    const statusIcon: Record<string, string> = {
      success: '✅',
      running: '🔄',
      error: '❌',
      pending: '⏳',
      skipped: '⏭️'
    }
    const typeLabel: Record<string, string> = {
      thinking: '思考',
      tool_call: '调用工具',
      tool_result: '工具结果',
      error: '错误',
      final: '完成'
    }
    steps.forEach((step, i) => {
      const icon = statusIcon[step.status] ?? '•'
      const label = step.toolName
        ? `${typeLabel[step.type] ?? step.type}: ${step.toolName}`
        : typeLabel[step.type] ?? step.type
      lines.push(`${i + 1}. ${icon} **${label}**`)
      if (step.content) {
        const preview = step.content.slice(0, 200)
        lines.push(`   > ${preview}`)
      }
    })
    lines.push('')
  }

  // 对话内容
  lines.push('## 对话内容')
  lines.push('')
  for (const msg of messages) {
    const role = msg.role === 'user' ? '🧑 用户' : '🤖 AI'
    const time = new Date(msg.createdAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
    lines.push(`### ${role}`)
    lines.push(`*${time}*`)
    lines.push('')
    lines.push(extractTextFromContent(msg.content))
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

export function registerSessionIpc(): void {
  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, (): Session[] => {
    return sessionsStore.list()
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, (): Session => {
    return sessionsStore.create()
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_DELETE, (_e, id: string): void => {
    sessionsStore.delete(id)
    // 清理该会话相关的本地工具状态（如 TodoList）和子代理，避免内存泄漏
    cleanupSessionLocalState(id)
    subagentManager.cleanupSession(id)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_RENAME, async (_e, id: string, title: string): Promise<void> => {
    await sessionsStore.rename(id, title)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_MESSAGES, (_e, id: string) => {
    return sessionsStore.getMessages(id)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_STEPS, (_e, id: string) => {
    return sessionsStore.getSteps(id)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_TODOS, (_e, id: string) => {
    return getTodoItems(id)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_SUBAGENTS, (_e, id: string) => {
    return subagentManager.list(id)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_SEARCH, (_e, query: string, limit?: number) => {
    return sessionsStore.search(query, limit)
  })

  // 导出会话为 Markdown 文件
  ipcMain.handle(
    IPC_CHANNELS.SESSION_EXPORT,
    async (_e, sessionId: string): Promise<{ success: boolean; path?: string; error?: string }> => {
      try {
        const meta = sessionsStore.getMeta(sessionId)
        if (!meta) {
          return { success: false, error: '会话不存在' }
        }

        const messages = await sessionsStore.getMessages(sessionId)
        const steps = await sessionsStore.getSteps(sessionId)
        const markdown = formatSessionAsMarkdown(meta, messages, steps)

        // 安全的文件名
        const safeTitle = meta.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50)
        const defaultName = `${safeTitle}.md`

        const win = BrowserWindow.getFocusedWindow()
        const result = await dialog.showSaveDialog(win!, {
          title: '导出会话为 Markdown',
          defaultPath: defaultName,
          filters: [
            { name: 'Markdown', extensions: ['md'] },
            { name: '所有文件', extensions: ['*'] }
          ]
        })

        if (result.canceled || !result.filePath) {
          return { success: false, error: '用户取消' }
        }

        await fs.writeFile(result.filePath, markdown, 'utf-8')
        logger.info(`[Session] 会话已导出: ${result.filePath}`)
        return { success: true, path: result.filePath }
      } catch (err) {
        logger.error('[Session] 导出会话失败:', err)
        return { success: false, error: String(err) }
      }
    }
  )
}
