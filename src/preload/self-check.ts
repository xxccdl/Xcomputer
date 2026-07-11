import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { SelfCheckProgressPayload, SelfCheckResultPayload } from '@shared/types'

// 内联 IPC 通道名（避免与主 preload 共享 chunk 导致 sandbox 加载失败）
const IPC = {
  SELF_CHECK_PROGRESS: 'selfCheck:progress',
  SELF_CHECK_COMPLETE: 'selfCheck:complete',
  SELF_CHECK_CLOSE: 'selfCheck:close'
} as const

type Listener<T> = (payload: T) => void
type Unsubscribe = () => void

const selfCheckApi = {
  /** 监听自检进度更新 */
  onProgress(cb: Listener<SelfCheckProgressPayload>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, payload: SelfCheckProgressPayload): void => cb(payload)
    ipcRenderer.on(IPC.SELF_CHECK_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.SELF_CHECK_PROGRESS, handler)
  },
  /** 监听自检完成 */
  onComplete(cb: Listener<SelfCheckResultPayload>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, payload: SelfCheckResultPayload): void => cb(payload)
    ipcRenderer.on(IPC.SELF_CHECK_COMPLETE, handler)
    return () => ipcRenderer.removeListener(IPC.SELF_CHECK_COMPLETE, handler)
  },
  /** 关闭（隐藏）自检弹窗 */
  close(): void {
    ipcRenderer.send(IPC.SELF_CHECK_CLOSE)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('selfCheckApi', selfCheckApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.selfCheckApi = selfCheckApi
}

export type SelfCheckAPI = typeof selfCheckApi
