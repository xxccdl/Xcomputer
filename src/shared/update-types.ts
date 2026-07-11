// 应用更新相关类型定义 — 主进程 / preload / 渲染进程共用

/** 远程 manifest 中的桌面端信息（映射 manifest.json 的 desktop 字段） */
export interface UpdateInfo {
  /** 最新版本号 */
  version: string
  /** 下载完整 URL（已拼好的绝对路径） */
  url: string
  /** 安装包文件名 */
  filename: string
  /** 文件字节数 */
  sizeBytes: number
  /** 可读大小（如 "156.3 MB"） */
  size: string
  /** 更新日期（YYYY-MM-DD） */
  updatedAt: string
}

/** 检查更新结果 */
export interface UpdateCheckResult {
  /** 是否有新版本 */
  hasUpdate: boolean
  /** 当前应用版本号 */
  currentVersion: string
  /** 远端最新版本号 */
  latestVersion?: string
  /** 更新信息（hasUpdate 为 true 时存在） */
  updateInfo?: UpdateInfo
  /** 错误信息（检查失败时存在） */
  error?: string
}

/** 更新状态类型 */
export type UpdateStatusType =
  | 'idle' // 空闲
  | 'checking' // 检查中
  | 'available' // 发现新版本
  | 'downloading' // 下载中
  | 'downloaded' // 下载完成
  | 'error' // 错误

/** 更新状态（通过 UPDATE_STATUS 通道推送到前端） */
export interface UpdateStatus {
  type: UpdateStatusType
  /** 下载进度 0-100 */
  progress?: number
  /** 附加消息 */
  message?: string
  /** 更新信息 */
  updateInfo?: UpdateInfo
  /** 下载完成的本地文件路径 */
  downloadedPath?: string
  /** 已下载字节数（downloading 状态时） */
  downloadedBytes?: number
  /** 总字节数（downloading 状态时） */
  totalBytes?: number
  /** 下载速度 字节/秒（downloading 状态时） */
  downloadSpeed?: number
}
