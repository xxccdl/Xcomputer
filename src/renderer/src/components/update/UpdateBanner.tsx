import { useState, useEffect, useCallback, useRef } from 'react'
import { Download, ArrowDownCircle, X, RefreshCw } from 'lucide-react'
import type { UpdateStatus, UpdateInfo } from '@shared/update-types'

/**
 * 顶部更新提示横幅
 * - 检测到新版本：提示有更新 + 一键下载
 * - 下载中：圆环进度 + 已下载/总大小 + 实时速度
 * - 下载完成：提示立即重启安装
 * 可手动关闭；新状态到来时自动重新出现。
 */
export function UpdateBanner(): JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>({ type: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null)

  // 使用平滑速度显示（避免数字抖动）
  const smoothSpeedRef = useRef(0)
  const [displaySpeed, setDisplaySpeed] = useState(0)

  useEffect(() => {
    const unsub = window.api.update.onStatus((s) => {
      setStatus(s)
      setErrorMsg(null)

      if (s.type === 'available') {
        setDismissed(false)
        setDownloadedPath(null)
      } else if (s.type === 'downloading') {
        setDismissed(false)
        // 平滑速度：EMA 平滑
        if (typeof s.downloadSpeed === 'number') {
          smoothSpeedRef.current = smoothSpeedRef.current * 0.6 + s.downloadSpeed * 0.4
          setDisplaySpeed(smoothSpeedRef.current)
        }
      } else if (s.type === 'downloaded') {
        setDismissed(false)
        setDisplaySpeed(0)
        smoothSpeedRef.current = 0
        if (s.downloadedPath) setDownloadedPath(s.downloadedPath)
      } else if (s.type === 'error') {
        setDisplaySpeed(0)
        smoothSpeedRef.current = 0
        setErrorMsg(s.message ?? '未知错误')
      }
    })
    return unsub
  }, [])

  const handleDownload = useCallback((info: UpdateInfo): void => {
    setErrorMsg(null)
    setDownloadedPath(null)
    smoothSpeedRef.current = 0
    setDisplaySpeed(0)
    void window.api.update.download(info).then((result) => {
      if (!result.success) {
        setErrorMsg(result.error ?? '下载失败')
      }
    })
  }, [])

  const handleInstall = useCallback((filePath: string): void => {
    void window.api.update.install(filePath)
  }, [])

  const handleDismiss = useCallback((): void => {
    setDismissed(true)
  }, [])

  const shouldShow = !dismissed && (
    status.type === 'available' ||
    status.type === 'downloading' ||
    status.type === 'downloaded' ||
    (status.type === 'error' && errorMsg !== null && status.updateInfo)
  )

  if (!shouldShow) return null

  const MB = 1024 * 1024
  const info = status.updateInfo
  const progress = status.type === 'downloading' ? (status.progress ?? 0) : status.type === 'downloaded' ? 100 : 0
  const dBytes = status.downloadedBytes ?? 0
  const tBytes = status.totalBytes ?? info?.sizeBytes ?? 0
  const downloadedMB = (dBytes / MB).toFixed(2)
  const totalMB = tBytes > 0 ? (tBytes / MB).toFixed(2) : '0.00'
  const speedMB = displaySpeed > 0 ? (displaySpeed / MB).toFixed(2) : '0.00'

  // 圆环周长
  const circumference = 2 * Math.PI * 15

  return (
    <div className="relative z-40 border-b border-border bg-bg-panel/95 backdrop-blur-sm animate-slide-down">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5">
        {/* 左侧图标 / 进度环 */}
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
          {status.type === 'downloading' ? (
            <div className="relative flex h-10 w-10 items-center justify-center">
              <svg className="absolute inset-0 h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-border" />
                <circle
                  cx="18" cy="18" r="15" fill="none"
                  stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round"
                  className="text-accent transition-[stroke-dasharray] duration-200"
                  strokeDasharray={`${(progress / 100) * circumference} ${circumference}`}
                />
              </svg>
              <Download size={13} className="text-accent" />
            </div>
          ) : status.type === 'downloaded' ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15 text-green-500">
              <ArrowDownCircle size={22} />
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
              {status.type === 'error' ? <RefreshCw size={20} /> : <Download size={20} />}
            </div>
          )}
        </div>

        {/* 文字内容 */}
        <div className="min-w-0 flex-1">
          {status.type === 'available' && info && (
            <>
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <span>发现新版本</span>
                <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent">
                  v{info.version}
                </span>
              </div>
              <div className="text-xs text-text-muted">
                大小 {info.size} · 发布于 {info.updatedAt}
              </div>
            </>
          )}

          {status.type === 'downloading' && (
            <>
              <div className="text-sm font-medium text-text-primary">
                最新版本下载中... ({progress}%)
              </div>
              <div className="text-xs text-text-muted">
                {downloadedMB} MB / {totalMB} MB
                {Number(speedMB) > 0.1 && <span className="ml-2 text-accent">({speedMB} MB/s)</span>}
              </div>
            </>
          )}

          {status.type === 'downloaded' && (
            <>
              <div className="text-sm font-medium text-green-500">
                更新已下载完成
              </div>
              <div className="text-xs text-text-muted">
                点击"立即重启"安装新版本，安装过程会自动关闭当前程序
              </div>
            </>
          )}

          {status.type === 'error' && info && (
            <>
              <div className="text-sm font-medium text-danger">更新失败</div>
              <div className="text-xs text-text-muted">{errorMsg}</div>
            </>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex shrink-0 items-center gap-2">
          {status.type === 'available' && info && (
            <button
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
              onClick={() => handleDownload(info)}
            >
              <Download size={13} />
              立即下载
            </button>
          )}

          {status.type === 'downloaded' && downloadedPath && (
            <button
              className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600"
              onClick={() => handleInstall(downloadedPath)}
            >
              <ArrowDownCircle size={13} />
              立即重启安装
            </button>
          )}

          {status.type === 'error' && info && (
            <button
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
              onClick={() => handleDownload(info)}
            >
              <RefreshCw size={13} />
              重试
            </button>
          )}

          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
            onClick={handleDismiss}
            title="关闭提示"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
