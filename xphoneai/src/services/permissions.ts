import { Linking, Alert } from 'react-native'
import * as Location from 'expo-location'
import * as Notifications from 'expo-notifications'

export interface PermissionStatus {
  name: string
  granted: boolean
  status: string
}

/** 请求所有运行时权限 */
export async function requestAllPermissions(): Promise<PermissionStatus[]> {
  const results: PermissionStatus[] = []

  // 1. 位置权限
  try {
    const { status } = await Location.requestForegroundPermissionsAsync()
    results.push({ name: '位置', granted: status === 'granted', status })
  } catch (e) {
    results.push({ name: '位置', granted: false, status: 'error' })
  }

  // 2. 相机权限（expo-camera SDK 51 改用 hook，此处降级；实际打开相机时再请求）
  results.push({ name: '相机', granted: true, status: 'deferred' })

  // 3. 通知权限（Android 13+ 需要）
  try {
    const { status } = await Notifications.requestPermissionsAsync()
    results.push({ name: '通知', granted: status === 'granted', status })
  } catch (e) {
    results.push({ name: '通知', granted: false, status: 'error' })
  }

  // 4. 剪贴板权限（expo-clipboard 新版无需显式请求）
  results.push({ name: '剪贴板', granted: true, status: 'granted' })

  return results
}

/** 检查哪些权限未授予，提示用户去设置开启 */
export async function checkAndPromptMissingPermissions(): Promise<void> {
  const results = await requestAllPermissions()
  const missing = results.filter((r) => !r.granted)

  if (missing.length > 0) {
    const missingNames = missing.map((m) => m.name).join('、')
    Alert.alert(
      '权限不足',
      `以下权限未授予，部分功能可能无法使用：\n${missingNames}\n\n建议前往设置开启以获得完整体验。`,
      [
        { text: '稍后', style: 'cancel' },
        { text: '去设置', onPress: () => Linking.openSettings() }
      ]
    )
  }
}
