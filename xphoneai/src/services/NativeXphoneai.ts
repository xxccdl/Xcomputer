import { NativeModules, Platform } from 'react-native'

interface XphoneaiNativeModule {
  /** 是否有悬浮窗权限 */
  canDrawOverlays: () => Promise<boolean>
  /** 跳转悬浮窗权限设置 */
  requestOverlayPermission: () => Promise<boolean>
  /** 启动悬浮球 + 前台服务 */
  startFloatingService: () => Promise<boolean>
  /** 停止悬浮球 + 前台服务 */
  stopFloatingService: () => Promise<boolean>
  /** 悬浮球是否运行中 */
  isFloatingServiceRunning: () => Promise<boolean>
  /** 更新悬浮球状态 */
  updateFloatingState: (state: string, text?: string) => Promise<boolean>
  /** 发送任务完成通知 */
  sendTaskDoneNotification: (title: string, message: string) => Promise<boolean>
  /** 是否忽略电池优化 */
  isIgnoringBatteryOptimizations: () => Promise<boolean>
  /** 跳转电池优化白名单设置 */
  requestBatteryOptimizationWhitelist: () => Promise<boolean>
  /** 开始语音识别，返回识别文本 */
  startSpeechRecognition: () => Promise<string>
  /** 取消语音识别 */
  cancelSpeechRecognition: () => Promise<boolean>
}

const module: XphoneaiNativeModule | null =
  Platform.OS === 'android' ? NativeModules.XphoneaiNative : null

/** Android 原生能力封装（悬浮球、前台服务、通知、电池白名单） */
export const NativeXphoneai = module

/** 是否支持原生扩展 */
export function isNativeXphoneaiAvailable(): boolean {
  return module !== null
}

/** 检查是否有悬浮窗权限 */
export async function canDrawOverlays(): Promise<boolean> {
  if (!module) return false
  return module.canDrawOverlays()
}

/** 跳转悬浮窗权限设置 */
export async function requestOverlayPermission(): Promise<boolean> {
  if (!module) return false
  return module.requestOverlayPermission()
}

/** 启动悬浮球 + 前台服务 */
export async function startFloatingService(): Promise<boolean> {
  if (!module) return false
  return module.startFloatingService()
}

/** 停止悬浮球 + 前台服务 */
export async function stopFloatingService(): Promise<boolean> {
  if (!module) return false
  return module.stopFloatingService()
}

/** 悬浮球是否运行中 */
export async function isFloatingServiceRunning(): Promise<boolean> {
  if (!module) return false
  return module.isFloatingServiceRunning()
}

/** 更新悬浮球状态：thinking | tool | done | idle */
export async function updateFloatingState(state: string, text?: string): Promise<boolean> {
  if (!module) return false
  return module.updateFloatingState(state, text)
}

/** 发送任务完成通知 */
export async function sendTaskDoneNotification(title: string, message: string): Promise<boolean> {
  if (!module) return false
  return module.sendTaskDoneNotification(title, message)
}

/** 是否已忽略电池优化 */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!module) return false
  return module.isIgnoringBatteryOptimizations()
}

/** 跳转电池优化白名单设置 */
export async function requestBatteryOptimizationWhitelist(): Promise<boolean> {
  if (!module) return false
  return module.requestBatteryOptimizationWhitelist()
}

/** 开始语音识别，返回识别文本 */
export async function startSpeechRecognition(): Promise<string> {
  if (!module) throw new Error('原生模块不可用')
  return module.startSpeechRecognition()
}

/** 取消语音识别 */
export async function cancelSpeechRecognition(): Promise<boolean> {
  if (!module) return false
  return module.cancelSpeechRecognition()
}
