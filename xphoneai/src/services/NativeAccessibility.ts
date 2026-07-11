import { NativeModules, Platform } from 'react-native'

const { XphoneaiAccessibility } = NativeModules

export interface InstalledApp {
  package: string
  name: string
  isSystem: boolean
}

export interface AccessibilityInterface {
  isAccessibilityEnabled(): Promise<boolean>
  openAccessibilitySettings(): Promise<boolean>
  performTap(x: number, y: number): Promise<boolean>
  performSwipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number
  ): Promise<boolean>
  takeScreenshot(): Promise<string>
  getScreenText(): Promise<string>
  inputText(x: number, y: number, text: string): Promise<boolean>
  inputTextFocused(text: string): Promise<boolean>
  pressKey(key: string): Promise<boolean>
  getCurrentApp(): Promise<string>
  getScreenSize(): Promise<{ width: number; height: number }>
  launchApp(packageName: string): Promise<boolean>
  listInstalledApps(): Promise<InstalledApp[]>
  getNodeInfoAt(x: number, y: number): Promise<string>
  getUiTree(): Promise<string>
}

/** 无障碍服务是否可用（仅 Android） */
export const isAccessibilityAvailable = (): boolean => {
  return Platform.OS === 'android' && !!XphoneaiAccessibility
}

/** 获取无障碍服务模块 */
export const NativeAccessibility: AccessibilityInterface | null =
  XphoneaiAccessibility || null
