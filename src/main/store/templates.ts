import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { TaskTemplate } from '@shared/types'
import { logger } from '../utils/logger'

interface TemplateStoreSchema {
  templates: TaskTemplate[]
}

class TemplatesStore {
  private store: Store<TemplateStoreSchema> | null = null

  init(): void {
    this.store = new Store<TemplateStoreSchema>({
      name: 'templates',
      defaults: { templates: [] }
    })
    logger.info(`[Templates] 模板存储已初始化，当前 ${this.list().length} 条模板`)
  }

  private getStore(): Store<TemplateStoreSchema> {
    if (!this.store) this.init()
    return this.store as Store<TemplateStoreSchema>
  }

  /** 获取所有模板（按 updatedAt 降序） */
  list(): TaskTemplate[] {
    return this.getStore()
      .get('templates')
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** 按 ID 获取 */
  get(id: string): TaskTemplate | undefined {
    return this.list().find((t) => t.id === id)
  }

  /** 添加模板 */
  add(name: string, description: string, prompt: string, category: string): TaskTemplate {
    const store = this.getStore()
    const templates = store.get('templates')
    const now = Date.now()
    const template: TaskTemplate = {
      id: randomUUID(),
      name,
      description,
      prompt,
      category: category || '',
      useCount: 0,
      createdAt: now,
      updatedAt: now
    }
    templates.push(template)
    store.set('templates', templates)
    logger.info(`[Templates] 新增模板 [${template.name}]: ${template.description.slice(0, 50)}`)
    return template
  }

  /** 更新模板 */
  update(id: string, patch: Partial<Omit<TaskTemplate, 'id' | 'createdAt'>>): TaskTemplate | null {
    const store = this.getStore()
    const templates = store.get('templates')
    const idx = templates.findIndex((t) => t.id === id)
    if (idx < 0) return null
    templates[idx] = { ...templates[idx], ...patch, id, updatedAt: Date.now() }
    store.set('templates', templates)
    return templates[idx]
  }

  /** 删除模板 */
  delete(id: string): boolean {
    const store = this.getStore()
    const templates = store.get('templates')
    const idx = templates.findIndex((t) => t.id === id)
    if (idx < 0) return false
    templates.splice(idx, 1)
    store.set('templates', templates)
    logger.info(`[Templates] 删除模板: ${id}`)
    return true
  }

  /** 增加使用次数 */
  incrementUse(id: string): TaskTemplate | null {
    const store = this.getStore()
    const templates = store.get('templates').slice()
    const idx = templates.findIndex((t) => t.id === id)
    if (idx < 0) return null
    templates[idx] = {
      ...templates[idx],
      useCount: templates[idx].useCount + 1,
      updatedAt: Date.now()
    }
    store.set('templates', templates)
    return templates[idx]
  }

  /** 获取所有分类（去重） */
  listCategories(): string[] {
    const templates = this.getStore().get('templates')
    const categories = new Set<string>()
    for (const t of templates) {
      if (t.category) categories.add(t.category)
    }
    return Array.from(categories).sort()
  }
}

export const templatesStore = new TemplatesStore()
