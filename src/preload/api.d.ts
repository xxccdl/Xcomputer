import type { XcomputerAPI } from '../preload/index'
import type { FloatingBallAPI } from '../preload/floating-ball'
import type { WidgetAPI } from '../preload/widget'

declare global {
  interface Window {
    api: XcomputerAPI
    floatingBallApi?: FloatingBallAPI
    widgetApi?: WidgetAPI
    electron: unknown
  }
}

export {}
