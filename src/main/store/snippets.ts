import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { CodeSnippet } from '@shared/types'
import { logger } from '../utils/logger'

interface StoreSchema {
  snippets: CodeSnippet[]
}

class SnippetStore {
  private store: Store<StoreSchema> | null = null

  init(): void {
    this.store = new Store<StoreSchema>({
      name: 'snippets',
      defaults: { snippets: [] }
    })
    logger.info(
      `[SnippetStore] initialized at ${this.store.path}, snippets=${this.store.get('snippets').length}`
    )
  }

  private getStore(): Store<StoreSchema> {
    if (!this.store) this.init()
    return this.store as Store<StoreSchema>
  }

  list(): CodeSnippet[] {
    return this.getStore().get('snippets')
  }

  listEnabled(): CodeSnippet[] {
    return this.list().filter((s) => s.enabled)
  }

  get(id: string): CodeSnippet | undefined {
    return this.list().find((s) => s.id === id)
  }

  create(item: {
    title: string
    description: string
    language: string
    content: string
    tags?: string[]
    category: string
  }): CodeSnippet {
    const snippet: CodeSnippet = {
      id: randomUUID(),
      title: item.title,
      description: item.description,
      language: item.language,
      content: item.content,
      tags: item.tags || [],
      category: item.category,
      useCount: 0,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    const store = this.getStore()
    store.set('snippets', [...store.get('snippets'), snippet])
    logger.info(`[SnippetStore] created snippet ${snippet.id} (${snippet.title})`)
    return snippet
  }

  update(id: string, patch: Partial<Omit<CodeSnippet, 'id' | 'createdAt'>>): CodeSnippet | null {
    const store = this.getStore()
    const snippets = store.get('snippets')
    const idx = snippets.findIndex((s) => s.id === id)
    if (idx === -1) return null
    snippets[idx] = { ...snippets[idx], ...patch, updatedAt: Date.now() }
    store.set('snippets', snippets)
    return snippets[idx]
  }

  delete(id: string): boolean {
    const store = this.getStore()
    const snippets = store.get('snippets')
    const filtered = snippets.filter((s) => s.id !== id)
    if (filtered.length === snippets.length) return false
    store.set('snippets', filtered)
    return true
  }

  setEnabled(id: string, enabled: boolean): CodeSnippet | null {
    return this.update(id, { enabled })
  }

  incrementUseCount(id: string): void {
    const snippet = this.get(id)
    if (!snippet) return
    this.update(id, { useCount: snippet.useCount + 1 })
  }

  search(keyword: string): CodeSnippet[] {
    const kw = keyword.toLowerCase().trim()
    if (!kw) return this.listEnabled()
    return this.listEnabled().filter((s) => {
      return (
        s.title.toLowerCase().includes(kw) ||
        s.description.toLowerCase().includes(kw) ||
        s.content.toLowerCase().includes(kw) ||
        s.language.toLowerCase().includes(kw) ||
        s.category.toLowerCase().includes(kw) ||
        s.tags.some((t) => t.toLowerCase().includes(kw))
      )
    })
  }
}

export const snippetStore = new SnippetStore()
