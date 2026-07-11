import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

const TEMPLATES_KEY = 'xphoneai_templates'
const HISTORY_KEY = 'xphoneai_cmd_history'
const ONBOARDING_KEY = 'xphoneai_onboarded'

/** 快捷指令模板 */
export interface QuickTemplate {
  id: string
  /** 显示名称 */
  name: string
  /** 图标名（Feather） */
  icon: string
  /** 实际发送给 AI 的指令 */
  command: string
  /** 是否内置（不可删除） */
  builtin: boolean
}

/** 指令历史记录 */
export interface HistoryItem {
  id: string
  command: string
  timestamp: number
  /** 是否收藏 */
  starred: boolean
}

/** 内置快捷模板 */
const BUILTIN_TEMPLATES: QuickTemplate[] = [
  { id: 'bi_screenshot', name: '截屏看看', icon: 'camera', command: '截屏看看我的手机屏幕', builtin: true },
  { id: 'bi_weather', name: '今日天气', icon: 'sun', command: '打开天气应用查看今天天气', builtin: true },
  { id: 'bi_clean', name: '清理后台', icon: 'zap', command: '清理后台运行的应用，释放内存', builtin: true },
  { id: 'bi_wechat', name: '打开微信', icon: 'message-circle', command: '打开微信', builtin: true },
  { id: 'bi_brightness', name: '调亮屏幕', icon: 'sunrise', command: '把屏幕亮度调高一点', builtin: true },
  { id: 'bi_goodnight', name: '晚安模式', icon: 'moon', command: '打开勿扰模式，把屏幕调暗，设置明天7点的闹钟', builtin: true }
]

interface QuickState {
  templates: QuickTemplate[]
  history: HistoryItem[]
  onboarded: boolean

  init: () => void
  addTemplate: (name: string, icon: string, command: string) => void
  removeTemplate: (id: string) => void
  recordCommand: (command: string) => void
  clearHistory: () => void
  toggleStar: (id: string) => void
  setOnboarded: () => void
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export const useQuickStore = create<QuickState>((set, get) => ({
  templates: BUILTIN_TEMPLATES,
  history: [],
  onboarded: false,

  init: () => {
    AsyncStorage.getItem(TEMPLATES_KEY).then((raw) => {
      if (raw) {
        try {
          const custom: QuickTemplate[] = JSON.parse(raw)
          set({ templates: [...BUILTIN_TEMPLATES, ...custom] })
        } catch { /* ignore */ }
      }
    }).catch(() => {})
    AsyncStorage.getItem(HISTORY_KEY).then((raw) => {
      if (raw) {
        try {
          set({ history: JSON.parse(raw) })
        } catch { /* ignore */ }
      }
    }).catch(() => {})
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => {
      set({ onboarded: v === '1' })
    }).catch(() => {})
  },

  addTemplate: (name, icon, command) => {
    const tpl: QuickTemplate = { id: genId(), name, icon, command, builtin: false }
    const templates = [...get().templates, tpl]
    set({ templates })
    persistCustomTemplates(templates)
  },

  removeTemplate: (id) => {
    const templates = get().templates.filter((t) => t.id !== id || t.builtin)
    set({ templates })
    persistCustomTemplates(templates)
  },

  recordCommand: (command) => {
    const trimmed = command.trim()
    if (!trimmed) return
    // 同指令去重，更新时间戳到最前
    const filtered = get().history.filter((h) => h.command !== trimmed)
    const item: HistoryItem = { id: genId(), command: trimmed, timestamp: Date.now(), starred: false }
    const history = [item, ...filtered].slice(0, 50) // 最多 50 条
    set({ history })
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history)).catch(() => {})
  },

  clearHistory: () => {
    set({ history: [] })
    AsyncStorage.removeItem(HISTORY_KEY).catch(() => {})
  },

  toggleStar: (id) => {
    const history = get().history.map((h) => h.id === id ? { ...h, starred: !h.starred } : h)
    set({ history })
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history)).catch(() => {})
  },

  setOnboarded: () => {
    set({ onboarded: true })
    AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {})
  }
}))

function persistCustomTemplates(all: QuickTemplate[]): void {
  const custom = all.filter((t) => !t.builtin)
  AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(custom)).catch(() => {})
}
