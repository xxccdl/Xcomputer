import * as Location from 'expo-location'
import * as Camera from 'expo-camera'
import * as Notifications from 'expo-notifications'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import * as Battery from 'expo-battery'
import * as Device from 'expo-device'
import * as FileSystem from 'expo-file-system'
import { Platform, Linking, AppState, Vibration } from 'react-native'
import { NativeAccessibility, isAccessibilityAvailable } from './NativeAccessibility'

export class CommandExecutor {
  /** 执行手机操作，成功返回结果字符串，失败抛出错误 */
  async execute(action: string, args: any): Promise<string> {
    return this.dispatch(action, args)
  }

  /** 检查无障碍服务是否可用 */
  private async ensureAccessibility(): Promise<void> {
    if (!isAccessibilityAvailable()) {
      throw new Error('无障碍服务仅支持Android平台')
    }
    const enabled = await NativeAccessibility!.isAccessibilityEnabled()
    if (!enabled) {
      throw new Error('无障碍服务未开启，请在手机设置→无障碍中开启xphoneai服务')
    }
  }

  private async dispatch(action: string, args: any): Promise<string> {
    switch (action) {
      // === UI自动化（通过AccessibilityService实现） ===
      case 'screenshot':
        return await this.takeScreenshot()
      case 'get_screen_text':
        return await this.getScreenText()
      case 'get_ui_tree':
        return await this.getUiTree()
      case 'tap':
        return await this.tap(args.x, args.y)
      case 'input_text':
        return await this.inputText(args.text, args.x, args.y)
      case 'swipe':
        return await this.swipe(args.startX, args.startY, args.endX, args.endY, args.duration)
      case 'press_key':
        return await this.pressKey(args.key)
      case 'open_app':
        return await this.openApp(args.package || args.text)
      case 'list_apps':
        return await this.listApps()
      case 'current_app':
        return await this.getCurrentApp()
      case 'close_app':
        return await this.closeApp(args.package)

      // === 硬件能力 ===
      case 'get_location':
        return await this.getLocation()
      case 'take_photo':
        return JSON.stringify({ note: '拍照功能需要打开相机界面，暂不支持后台拍照' })
      case 'start_recording':
        return JSON.stringify({ note: '录音功能暂未实现' })
      case 'stop_recording':
        return JSON.stringify({ note: '录音功能暂未实现' })
      case 'send_sms':
        return await this.sendSMS(args.number, args.message)
      case 'send_notification':
        return await this.sendNotification(args.title, args.message)
      case 'set_alarm':
        return JSON.stringify({ note: `闹钟设置: ${args.time} ${args.title || ''}` })
      case 'vibrate':
        Vibration.vibrate(args.pattern ? args.pattern.split(',').map(Number) : 500)
        return '振动完成'

      // === 剪贴板 ===
      case 'read_clipboard':
        return await Clipboard.getStringAsync()
      case 'write_clipboard':
        await Clipboard.setStringAsync(args.text || '')
        return '剪贴板已更新'

      // === 文件管理 ===
      case 'list_files':
        return await this.listFiles(args.path)
      case 'download_file':
        return await this.downloadFile(args.url, args.filename)

      // === 系统信息 ===
      case 'get_battery':
        const level = await Battery.getBatteryLevelAsync()
        const state = await Battery.getBatteryStateAsync()
        return JSON.stringify({ level: Math.round(level * 100), state: ['未知', '未充电', '充电中', '已充满'][state] })
      case 'get_device_info':
        return JSON.stringify({
          model: Device.modelName,
          brand: Device.brand,
          osName: Device.osName,
          osVersion: Device.osVersion,
          platform: Platform.OS
        })

      default:
        throw new Error(`未知操作: ${action}`)
    }
  }

  /** 截屏：优先用无障碍服务截取真实屏幕，返回图片+文字描述 */
  private async takeScreenshot(): Promise<string> {
    // 尝试用无障碍服务截屏
    if (isAccessibilityAvailable()) {
      const enabled = await NativeAccessibility!.isAccessibilityEnabled()
      if (enabled) {
        let base64: string | null = null
        let screenshotError: string | null = null
        try {
          base64 = await NativeAccessibility!.takeScreenshot()
        } catch (e) {
          screenshotError = String(e)
        }
        if (base64) {
          // 同时获取屏幕文字，供纯文本模型使用
          let screenText = ''
          try {
            screenText = await NativeAccessibility!.getScreenText()
          } catch { /* ignore */ }
          return JSON.stringify({
            type: 'screenshot',
            image: `data:image/jpeg;base64,${base64}`,
            imageLength: base64.length,
            screenText: screenText || null,
            note: '包含真实屏幕截图(base64 JPEG)和屏幕文字内容。纯文本模型可读 screenText 字段。'
          })
        }
        // 截屏失败：返回明确的错误信息，让AI能告知用户
        const desc = await this.getScreenshotDescription()
        return JSON.stringify({
          type: 'screenshot_failed',
          error: screenshotError || 'takeScreenshot返回空数据',
          description: desc,
          hint: '截屏失败。可能原因：1)无障碍服务配置缺少canTakeScreenshots=true（需重新安装App）；2)Android版本低于11(API 30)不支持无障碍截屏；3)需在无障碍设置中重新关闭再开启xphoneai服务以使新配置生效。'
        })
      }
    }
    // 无障碍服务不可用时，返回设备状态文字描述
    return await this.getScreenshotDescription()
  }

  /** 获取屏幕文字（通过无障碍服务） */
  private async getScreenText(): Promise<string> {
    if (isAccessibilityAvailable()) {
      const enabled = await NativeAccessibility!.isAccessibilityEnabled()
      if (enabled) {
        try {
          const text = await NativeAccessibility!.getScreenText()
          return JSON.stringify({
            type: 'screen_text',
            text,
            source: 'accessibility_service',
            note: '通过无障碍服务获取的真实屏幕文字内容'
          })
        } catch (e) {
          return JSON.stringify({
            type: 'screen_text',
            error: String(e),
            note: '获取屏幕文字失败'
          })
        }
      }
    }
    // 回退：返回设备状态
    return await this.getScreenshotDescription()
  }

  /** 获取 UI 元素树（JSON），供 AI 识别屏幕元素坐标 */
  private async getUiTree(): Promise<string> {
    if (isAccessibilityAvailable()) {
      const enabled = await NativeAccessibility!.isAccessibilityEnabled()
      if (enabled) {
        try {
          const tree = await NativeAccessibility!.getUiTree()
          return tree
        } catch (e) {
          return JSON.stringify({ error: String(e), note: '获取UI元素树失败' })
        }
      }
    }
    return JSON.stringify({ error: '无障碍服务未开启', note: '请先开启无障碍服务' })
  }

  /** 点击 */
  private async tap(x: number, y: number): Promise<string> {
    await this.ensureAccessibility()
    // 点击前获取节点信息，用于反馈
    let nodeInfo: string | null = null
    try {
      nodeInfo = await NativeAccessibility!.getNodeInfoAt(x, y)
    } catch { /* ignore */ }
    const result = await NativeAccessibility!.performTap(x, y)
    return JSON.stringify({
      action: 'tap', x, y, success: result,
      target: nodeInfo || '未知'
    })
  }

  /** 输入文本（x,y 可选，不填则在当前焦点输入） */
  private async inputText(text: string, x?: number, y?: number): Promise<string> {
    await this.ensureAccessibility()
    let result: boolean
    if (x != null && y != null) {
      result = await NativeAccessibility!.inputText(x, y, text)
    } else {
      result = await NativeAccessibility!.inputTextFocused(text)
    }
    return JSON.stringify({
      action: 'input_text', x: x ?? null, y: y ?? null, text, success: result
    })
  }

  /** 滑动 */
  private async swipe(
    startX: number, startY: number, endX: number, endY: number, duration: number
  ): Promise<string> {
    await this.ensureAccessibility()
    const result = await NativeAccessibility!.performSwipe(
      startX, startY, endX, endY, duration || 300
    )
    return JSON.stringify({
      action: 'swipe', startX, startY, endX, endY,
      duration: duration || 300, success: result
    })
  }

  /** 按键 */
  private async pressKey(key: string): Promise<string> {
    if (isAccessibilityAvailable()) {
      const enabled = await NativeAccessibility!.isAccessibilityEnabled()
      if (enabled) {
        const result = await NativeAccessibility!.pressKey(key)
        return JSON.stringify({ action: 'press_key', key, success: result })
      }
    }
    return JSON.stringify({ note: `按键 ${key} — 需要无障碍服务` })
  }

  /** 获取当前前台App */
  private async getCurrentApp(): Promise<string> {
    if (isAccessibilityAvailable()) {
      const enabled = await NativeAccessibility!.isAccessibilityEnabled()
      if (enabled) {
        try {
          const pkg = await NativeAccessibility!.getCurrentApp()
          return JSON.stringify({ app: pkg, source: 'accessibility' })
        } catch { /* fall through */ }
      }
    }
    return JSON.stringify({ app: 'unknown', note: '需要无障碍服务' })
  }

  /** 关闭App（通过按Home键） */
  private async closeApp(pkg: string): Promise<string> {
    if (isAccessibilityAvailable()) {
      const enabled = await NativeAccessibility!.isAccessibilityEnabled()
      if (enabled) {
        await NativeAccessibility!.pressKey('home')
        return JSON.stringify({ action: 'close_app', package: pkg, success: true, note: '已按Home键回到桌面' })
      }
    }
    return JSON.stringify({ note: `关闭App ${pkg} — 需要无障碍服务` })
  }

  /** 获取屏幕状态的文字描述（回退方案） */
  private async getScreenshotDescription(): Promise<string> {
    const appState = AppState.currentState
    const level = await Battery.getBatteryLevelAsync()
    const batteryState = await Battery.getBatteryStateAsync()
    const batteryPercent = Math.round(level * 100)
    const batteryStr = ['未知', '未充电', '充电中', '已充满'][batteryState]

    let clipboardContent = ''
    try {
      const hasString = await Clipboard.hasStringAsync()
      if (hasString) {
        clipboardContent = await Clipboard.getStringAsync()
        if (clipboardContent.length > 200) {
          clipboardContent = clipboardContent.substring(0, 200) + '...'
        }
      }
    } catch { /* ignore */ }

    const a11yAvailable = isAccessibilityAvailable()
    let a11yEnabled = false
    if (a11yAvailable) {
      try { a11yEnabled = await NativeAccessibility!.isAccessibilityEnabled() } catch { /* ignore */ }
    }

    const description = [
      `【手机屏幕状态描述】`,
      `时间: ${new Date().toLocaleString('zh-CN')}`,
      `设备: ${Device.brand || 'Unknown'} ${Device.modelName || ''} (Android ${Device.osVersion || '?'})`,
      `App状态: ${appState}（active=前台运行中, background=后台, inactive=切换中）`,
      `电量: ${batteryPercent}% (${batteryStr})`,
      clipboardContent ? `剪贴板内容: "${clipboardContent}"` : `剪贴板: 空`,
      `无障碍服务: ${a11yEnabled ? '已开启' : '未开启'}`,
      ``,
      a11yEnabled
        ? `无障碍服务已开启，可使用 screenshot/tap/input_text/swipe/press_key/get_screen_text 等操作。`
        : `提示: 开启无障碍服务后，AI可截取真实屏幕、点击、输入文本、滑动等。请在手机设置→无障碍中开启xphoneai服务。`
    ].join('\n')

    return JSON.stringify({
      type: 'screen_description',
      description,
      appState,
      battery: { level: batteryPercent, state: batteryStr },
      clipboard: clipboardContent || null,
      accessibilityEnabled: a11yEnabled,
      note: '纯文字描述（无障碍服务未开启时的回退方案）。开启无障碍服务后可获取真实截图。'
    })
  }

  /** 打开App（通过包名） */
  private async openApp(pkg: string): Promise<string> {
    if (!pkg) throw new Error('缺少package参数')
    if (!isAccessibilityAvailable()) {
      throw new Error('无障碍服务仅支持Android平台')
    }
    try {
      // launchApp 会在 startActivity 之前 resolve，避免后台 JS 暂停导致超时
      await NativeAccessibility!.launchApp(pkg)
      return JSON.stringify({
        action: 'open_app', package: pkg, success: true,
        note: `已发送启动指令，${pkg} 应已切换到前台`
      })
    } catch (e) {
      throw new Error(`无法打开App: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 列出已安装的App */
  private async listApps(): Promise<string> {
    if (!isAccessibilityAvailable()) {
      return JSON.stringify({ note: '仅支持Android平台' })
    }
    try {
      const apps = await NativeAccessibility!.listInstalledApps()
      return JSON.stringify({
        count: apps.length,
        apps: apps.map(a => ({ package: a.package, name: a.name })),
        note: '返回已安装的App列表，package字段可用于open_app操作'
      })
    } catch (e) {
      return JSON.stringify({ error: String(e), note: '获取App列表失败' })
    }
  }

  private async getLocation(): Promise<string> {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') throw new Error('位置权限被拒绝')
    const location = await Location.getCurrentPositionAsync({})
    return JSON.stringify({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      timestamp: location.timestamp
    })
  }

  private async sendSMS(number: string, message: string): Promise<string> {
    if (!number || !message) throw new Error('缺少number或message参数')
    const url = `sms:${number}?body=${encodeURIComponent(message)}`
    await Linking.openURL(url)
    return `已打开短信App: ${number}`
  }

  private async sendNotification(title: string, message: string): Promise<string> {
    const { status } = await Notifications.requestPermissionsAsync()
    if (status !== 'granted') throw new Error('通知权限被拒绝')
    await Notifications.scheduleNotificationAsync({
      content: { title: title || 'xphoneai', body: message || '' },
      trigger: null
    })
    return '通知已发送'
  }

  private async listFiles(path: string): Promise<string> {
    const dirPath = `${FileSystem.documentDirectory}${path || ''}/`
    try {
      const items = await FileSystem.readDirectoryAsync(dirPath)
      return JSON.stringify({ path: dirPath, files: items })
    } catch {
      return JSON.stringify({ path: dirPath, files: [], note: '目录不存在或无权限' })
    }
  }

  private async downloadFile(url: string, filename: string): Promise<string> {
    if (!url) throw new Error('缺少url参数')
    const savePath = `${FileSystem.documentDirectory}${filename || 'download'}`
    const result = await FileSystem.downloadAsync(url, savePath)
    return JSON.stringify({ path: result.uri, size: result.headers?.['Content-Length'] || 0 })
  }
}
