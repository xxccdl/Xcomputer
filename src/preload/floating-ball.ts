import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { FloatingBallStatusPayload } from '@shared/types'

// 内联 IPC 通道名（避免与主 preload 共享 chunk 导致 sandbox 加载失败）
const IPC = {
  FLOATING_BALL_STATE: 'floatingBall:state',
  FLOATING_BALL_TOGGLE: 'floatingBall:toggle',
  FLOATING_BALL_CLICK: 'floatingBall:click',
  FLOATING_BALL_ACTION: 'floatingBall:action',
  FLOATING_BALL_DRAG: 'floatingBall:drag',
  FLOATING_BALL_DRAG_START: 'floatingBall:dragStart',
  FLOATING_BALL_DRAG_END: 'floatingBall:dragEnd',
  FLOATING_BALL_GET_STATE: 'floatingBall:getState',
  FLOATING_BALL_SET_MENU_VISIBLE: 'floatingBall:setMenuVisible',
  FLOATING_BALL_SET_MOUSE_EVENTS: 'floatingBall:setMouseEvents'
} as const

type Listener<T> = (payload: T) => void
type Unsubscribe = () => void

const floatingBallApi = {
  /** 查询当前状态 */
  getState(): Promise<FloatingBallStatusPayload> {
    return ipcRenderer.invoke(IPC.FLOATING_BALL_GET_STATE)
  },
  /** 监听状态变更 */
  onStateChange(cb: Listener<FloatingBallStatusPayload>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, payload: FloatingBallStatusPayload): void => cb(payload)
    ipcRenderer.on(IPC.FLOATING_BALL_STATE, handler)
    return () => ipcRenderer.removeListener(IPC.FLOATING_BALL_STATE, handler)
  },
  /** 通知主进程：悬浮球被点击 */
  click(): void {
    ipcRenderer.send(IPC.FLOATING_BALL_CLICK)
  },
  /** 通知主进程：用户触发了快捷操作 */
  action(action: 'showMain' | 'hideMain' | 'newSession' | 'stopTask'): void {
    ipcRenderer.send(IPC.FLOATING_BALL_ACTION, action)
  },
  /** 拖拽移动窗口（传递鼠标偏移量）—— 旧接口，保留兼容 */
  drag(deltaX: number, deltaY: number): void {
    ipcRenderer.send(IPC.FLOATING_BALL_DRAG, deltaX, deltaY)
  },
  /** 通知主进程开始拖拽（主进程自行用 screen.getCursorScreenPoint 获取鼠标位置） */
  dragStart(): void {
    ipcRenderer.send(IPC.FLOATING_BALL_DRAG_START)
  },
  /** 通知主进程结束拖拽（清除轮询） */
  dragEnd(): void {
    ipcRenderer.send(IPC.FLOATING_BALL_DRAG_END)
  },
  /** 通知主进程菜单展开/收起，以便动态调整窗口大小 */
  setMenuVisible(visible: boolean): void {
    ipcRenderer.send(IPC.FLOATING_BALL_SET_MENU_VISIBLE, visible)
  },
  /** 通知主进程是否启用鼠标事件（透明区域点击穿透） */
  setMouseEventsEnabled(enabled: boolean): void {
    ipcRenderer.send(IPC.FLOATING_BALL_SET_MOUSE_EVENTS, enabled)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('floatingBallApi', floatingBallApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.floatingBallApi = floatingBallApi
}

export type FloatingBallAPI = typeof floatingBallApi
