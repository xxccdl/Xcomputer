import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

const INSTALLED_KEY = 'xphoneai_installed_skills'
const SKILL_HUB_URL = 'http://xxccdl.cn:3210'

/** 技能定义 */
export interface Skill {
  id: string
  name: string
  desc: string
  icon: string
  /** 发送给 AI 的完整 prompt */
  prompt: string
  author?: string
  /** 步骤数（展示用） */
  steps?: number
}

/** 内置推荐技能 */
const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'bi_morning',
    name: '早安播报',
    desc: '播报今天天气、日程、电量，开启新一天',
    icon: 'sunrise',
    prompt: '请帮我做一个早安播报：1. 截屏看看当前屏幕 2. 打开天气应用查看今天天气并读给我听 3. 查看电池电量 4. 用一句话总结今天该注意什么',
    author: 'xphoneai',
    steps: 4
  },
  {
    id: 'bi_goodnight',
    name: '晚安模式',
    desc: '开启勿扰、调暗屏幕、设明日闹钟',
    icon: 'moon',
    prompt: '请帮我开启晚安模式：1. 打开勿扰模式 2. 把屏幕亮度调到最低 3. 设置明天早上7点的闹钟 4. 发送一条通知提醒我该睡觉了',
    author: 'xphoneai',
    steps: 4
  },
  {
    id: 'bi_clean',
    name: '深度清理',
    desc: '清理后台应用、清空剪贴板、释放内存',
    icon: 'zap',
    prompt: '请帮我做深度清理：1. 列出当前运行的应用 2. 逐个关闭非必要的后台应用 3. 清空剪贴板 4. 查看清理后的电池和内存状态',
    author: 'xphoneai',
    steps: 4
  },
  {
    id: 'bi_screenshot_ocr',
    name: '屏幕识文字',
    desc: '截屏并提取屏幕上所有文字',
    icon: 'file-text',
    prompt: '请帮我识别屏幕上的文字：1. 截取当前屏幕 2. 提取屏幕上所有文字内容 3. 把文字整理成可读格式展示给我',
    author: 'xphoneai',
    steps: 3
  },
  {
    id: 'bi_share_location',
    name: '位置共享',
    desc: '获取当前位置并复制到剪贴板',
    icon: 'map-pin',
    prompt: '请帮我获取位置并共享：1. 获取当前GPS位置 2. 把位置坐标复制到剪贴板 3. 发送通知告诉我位置已复制',
    author: 'xphoneai',
    steps: 3
  },
  {
    id: 'bi_meeting_mode',
    name: '会议模式',
    desc: '静音、振动、关闭通知打扰',
    icon: 'bell-off',
    prompt: '请帮我开启会议模式：1. 把手机调到静音 2. 开启振动模式 3. 发送一条通知说明已进入会议模式',
    author: 'xphoneai',
    steps: 3
  }
]

interface SkillState {
  /** 在线技能列表（从服务器获取） */
  onlineSkills: Skill[]
  /** 已安装技能 */
  installed: Skill[]
  /** 加载中 */
  loading: boolean
  /** 初始化 */
  init: () => void
  /** 拉取在线技能 */
  fetchOnline: () => Promise<void>
  /** 安装技能 */
  install: (skill: Skill) => void
  /** 卸载技能 */
  uninstall: (id: string) => void
  /** 是否已安装 */
  isInstalled: (id: string) => boolean
}

export const useSkillStore = create<SkillState>((set, get) => ({
  onlineSkills: [],
  installed: [],
  loading: false,

  init: () => {
    AsyncStorage.getItem(INSTALLED_KEY).then((raw) => {
      if (raw) {
        try {
          set({ installed: JSON.parse(raw) })
        } catch { /* ignore */ }
      }
    }).catch(() => {})
    get().fetchOnline()
  },

  fetchOnline: async () => {
    set({ loading: true })
    try {
      const res = await fetchWithTimeout(`${SKILL_HUB_URL}/api/skills`, 5000)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          set({ onlineSkills: data, loading: false })
          return
        }
      }
    } catch { /* 服务器不可用，fallback 内置 */ }
    // fallback：用内置技能作为在线列表
    set({ onlineSkills: BUILTIN_SKILLS, loading: false })
  },

  install: (skill) => {
    const installed = get().installed
    if (installed.some((s) => s.id === skill.id)) return
    const next = [...installed, skill]
    set({ installed: next })
    AsyncStorage.setItem(INSTALLED_KEY, JSON.stringify(next)).catch(() => {})
  },

  uninstall: (id) => {
    const next = get().installed.filter((s) => s.id !== id)
    set({ installed: next })
    AsyncStorage.setItem(INSTALLED_KEY, JSON.stringify(next)).catch(() => {})
  },

  isInstalled: (id) => get().installed.some((s) => s.id === id)
}))

/** 带超时的 fetch */
function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    fetch(url).then(resolve).catch(reject).finally(() => clearTimeout(timer))
  })
}

/** 获取所有可用技能（在线 + 内置，去重） */
export function getAllSkills(): Skill[] {
  const state = useSkillStore.getState()
  const map = new Map<string, Skill>()
  BUILTIN_SKILLS.forEach((s) => map.set(s.id, s))
  state.onlineSkills.forEach((s) => map.set(s.id, s))
  return Array.from(map.values())
}
