import type { XcomputerAPI } from '../preload/index'
import type { FloatingBallAPI } from '../preload/floating-ball'

declare global {
  interface Window {
    api: XcomputerAPI
    floatingBallApi?: FloatingBallAPI
    electron: unknown
  }
}

export {}
