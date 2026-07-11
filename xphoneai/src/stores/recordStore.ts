import { create } from 'zustand'
import * as FileSystem from 'expo-file-system'

/** 截图记录 */
export interface ScreenshotRecord {
  /** 文件路径（cache 目录） */
  path: string
  /** 对应的工具步骤标签 */
  label: string
  /** 时间戳 */
  timestamp: number
}

interface RecordState {
  /** 是否正在录屏 */
  isRecording: boolean
  /** 截图列表 */
  screenshots: ScreenshotRecord[]
  /** 开始录屏 */
  start: () => void
  /** 停止录屏，返回截图列表 */
  stop: () => ScreenshotRecord[]
  /** 添加截图 */
  addScreenshot: (base64: string, label: string) => Promise<void>
  /** 清空 */
  clear: () => Promise<void>
}

const CACHE_DIR = `${FileSystem.cacheDirectory}recordings/`

export const useRecordStore = create<RecordState>((set, get) => ({
  isRecording: false,
  screenshots: [],

  start: () => {
    set({ isRecording: true, screenshots: [] })
  },

  stop: () => {
    const shots = get().screenshots
    set({ isRecording: false })
    return shots
  },

  addScreenshot: async (base64, label) => {
    if (!get().isRecording) return
    // 限制最多 15 张
    if (get().screenshots.length >= 15) return
    try {
      // 确保目录存在
      const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true })
      }
      const filename = `shot_${Date.now()}_${get().screenshots.length}.jpg`
      const path = `${CACHE_DIR}${filename}`
      // base64 可能带 data:image/jpeg;base64, 前缀，去掉
      const pure = base64.replace(/^data:image\/\w+;base64,/, '')
      await FileSystem.writeAsStringAsync(path, pure, { encoding: FileSystem.EncodingType.Base64 })
      set((s) => ({
        screenshots: [...s.screenshots, { path, label, timestamp: Date.now() }]
      }))
    } catch (e) {
      console.warn('[Record] 保存截图失败:', e)
    }
  },

  clear: async () => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR)
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true })
      }
    } catch { /* ignore */ }
    set({ screenshots: [], isRecording: false })
  }
}))
