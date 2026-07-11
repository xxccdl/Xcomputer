import { Alert, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import {
  canDrawOverlays, requestOverlayPermission, isIgnoringBatteryOptimizations,
  requestBatteryOptimizationWhitelist, isNativeXphoneaiAvailable
} from './NativeXphoneai'

/** 是否已显示过本次启动的权限引导 */
let hasGuidedThisSession = false

/**
 * 首页自动权限引导
 * 按顺序检查并引导开启：通知、悬浮窗、电池白名单。
 * Android 原生能力不可用时静默跳过。
 */
export async function runPermissionsGuide(): Promise<void> {
  if (Platform.OS !== 'android') return
  if (hasGuidedThisSession) return
  hasGuidedThisSession = true
  if (!isNativeXphoneaiAvailable()) return

  // 1. 通知权限（可直接代码申请）
  try {
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') {
      const { status: newStatus } = await Notifications.requestPermissionsAsync()
      if (newStatus !== 'granted') {
        showGuide(
          '开启通知',
          '任务完成后需要通知权限提醒你。',
          undefined // 通知权限在 Android 13+ 可再次 request，无需跳设置
        )
      }
    }
  } catch { /* ignore */ }

  // 2. 悬浮窗权限
  const overlay = await canDrawOverlays()
  if (!overlay) {
    showGuide(
      '开启悬浮球',
      'AI 执行任务时，悬浮球可在其他应用上方显示当前状态，并支持一键唤起 App。',
      requestOverlayPermission
    )
  }

  // 3. 电池优化白名单
  const batteryIgnored = await isIgnoringBatteryOptimizations()
  if (!batteryIgnored) {
    showGuide(
      '允许后台运行',
      '将 xphoneai 加入电池优化白名单，可防止 AI 任务执行中被系统杀死。',
      requestBatteryOptimizationWhitelist
    )
  }
}

function showGuide(title: string, message: string, action?: () => Promise<unknown>): void {
  Alert.alert(
    title,
    message,
    [
      { text: '稍后再说', style: 'cancel' },
      {
        text: '去开启',
        onPress: () => {
          action?.().catch(() => { /* ignore */ })
        }
      }
    ]
  )
}
