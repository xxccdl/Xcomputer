import Store from 'electron-store'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { logger } from '../utils/logger'

interface StoreSchema {
  settings: Settings
}

class SettingsStore {
  private store: Store<StoreSchema> | null = null

  init(): void {
    this.store = new Store<StoreSchema>({
      name: 'config',
      defaults: { settings: DEFAULT_SETTINGS }
    })
    logger.info('Settings store initialized at', this.store.path)
  }

  private getStore(): Store<StoreSchema> {
    if (!this.store) {
      this.init()
    }
    return this.store as Store<StoreSchema>
  }

  get(): Settings {
    // 合并默认值：老用户的 config.json 可能缺少新增字段（如 deepseekApiKey），
    // 直接返回存储值会导致后续 undefined.trim() 崩溃。
    // 用展开运算符补齐缺失字段，确保返回完整的 Settings 对象。
    const stored = this.getStore().get('settings')
    return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
  }

  update(partial: Partial<Settings>): Settings {
    const store = this.getStore()
    const current = this.get()
    const next = { ...current, ...partial }
    store.set('settings', next)
    logger.info('Settings updated', Object.keys(partial))
    return next
  }
}

export const settingsStore = new SettingsStore()
