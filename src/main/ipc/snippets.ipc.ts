import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { snippetStore } from '../store/snippets'
import type { CodeSnippet } from '@shared/types'

export function registerSnippetIpc(mainWindow: BrowserWindow): void {
  const notifyChanged = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.SNIPPET_CHANGED, { updated: true })
    }
  }

  ipcMain.handle(IPC_CHANNELS.SNIPPET_LIST, (): CodeSnippet[] => {
    return snippetStore.list()
  })

  ipcMain.handle(
    IPC_CHANNELS.SNIPPET_GET,
    (_e, id: string): CodeSnippet | undefined => {
      return snippetStore.get(id)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SNIPPET_ADD,
    (
      _e,
      item: {
        title: string
        description: string
        language: string
        content: string
        tags?: string[]
        category: string
      }
    ): CodeSnippet => {
      const snippet = snippetStore.create(item)
      notifyChanged()
      return snippet
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SNIPPET_UPDATE,
    (
      _e,
      id: string,
      patch: Partial<Omit<CodeSnippet, 'id' | 'createdAt'>>
    ): CodeSnippet | null => {
      const updated = snippetStore.update(id, patch)
      notifyChanged()
      return updated
    }
  )

  ipcMain.handle(IPC_CHANNELS.SNIPPET_DELETE, (_e, id: string): boolean => {
    const deleted = snippetStore.delete(id)
    notifyChanged()
    return deleted
  })

  ipcMain.handle(
    IPC_CHANNELS.SNIPPET_TOGGLE,
    (_e, id: string, enabled: boolean): CodeSnippet | null => {
      const updated = snippetStore.setEnabled(id, enabled)
      notifyChanged()
      return updated
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SNIPPET_SEARCH,
    (_e, keyword: string): CodeSnippet[] => {
      return snippetStore.search(keyword)
    }
  )
}
