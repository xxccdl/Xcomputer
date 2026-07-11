import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { QuickCommand } from '@shared/types'
import { logger } from '../utils/logger'

interface StoreSchema {
  shortcuts: QuickCommand[]
}

class ShortcutStore {
  private store: Store<StoreSchema> | null = null

  init(): void {
    this.store = new Store<StoreSchema>({
      name: 'shortcuts',
      defaults: { shortcuts: [] }
    })
    logger.info(
      `[ShortcutStore] initialized at ${this.store.path}, shortcuts=${this.store.get('shortcuts').length}`
    )
  }

  private getStore(): Store<StoreSchema> {
    if (!this.store) this.init()
    return this.store as Store<StoreSchema>
  }

  list(): QuickCommand[] {
    return this.getStore().get('shortcuts')
  }

  listEnabled(): QuickCommand[] {
    return this.list().filter((s) => s.enabled)
  }

  get(id: string): QuickCommand | undefined {
    return this.list().find((s) => s.id === id)
  }

  findByKeyword(keyword: string): QuickCommand | undefined {
    return this.listEnabled().find(
      (s) => s.keyword.toLowerCase() === keyword.toLowerCase()
    )
  }

  create(item: {
    keyword: string
    name: string
    description: string
    prompt: string
    steps?: string[]
    category: string
  }): QuickCommand {
    const shortcut: QuickCommand = {
      id: randomUUID(),
      keyword: item.keyword,
      name: item.name,
      description: item.description,
      prompt: item.prompt,
      steps: item.steps,
      category: item.category,
      useCount: 0,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    const store = this.getStore()
    store.set('shortcuts', [...store.get('shortcuts'), shortcut])
    logger.info(`[ShortcutStore] created shortcut ${shortcut.id} (${shortcut.keyword})`)
    return shortcut
  }

  update(
    id: string,
    patch: Partial<Omit<QuickCommand, 'id' | 'createdAt'>>
  ): QuickCommand | null {
    const store = this.getStore()
    const shortcuts = store.get('shortcuts').slice()
    const idx = shortcuts.findIndex((s) => s.id === id)
    if (idx === -1) return null
    const updated = { ...shortcuts[idx], ...patch, updatedAt: Date.now() }
    shortcuts[idx] = updated
    store.set('shortcuts', shortcuts)
    return updated
  }

  delete(id: string): boolean {
    const store = this.getStore()
    const shortcuts = store.get('shortcuts')
    const filtered = shortcuts.filter((s) => s.id !== id)
    if (filtered.length === shortcuts.length) return false
    store.set('shortcuts', filtered)
    return true
  }

  setEnabled(id: string, enabled: boolean): QuickCommand | null {
    return this.update(id, { enabled })
  }

  incrementUseCount(id: string): void {
    const shortcut = this.get(id)
    if (!shortcut) return
    this.update(id, { useCount: shortcut.useCount + 1 })
  }

  expand(keyword: string): QuickCommand | null {
    const shortcut = this.findByKeyword(keyword)
    if (shortcut) {
      this.incrementUseCount(shortcut.id)
    }
    return shortcut || null
  }
}

export const shortcutStore = new ShortcutStore()
