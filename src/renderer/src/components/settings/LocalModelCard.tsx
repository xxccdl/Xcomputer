/**
 * 本地模型（实验性）设置卡片
 *
 * 管理进程内 node-llama-cpp 推理的完整生命周期 UI：
 * - 开关：启用/禁用本地模型（优先级最高，覆盖限免/直连）
 * - 下载：首次运行从 ModelScope 下载 Qwen3-4B GGUF 基座（~2.33GB，支持断点续传）
 * - 加载/卸载：将模型加载到显存/内存，或释放资源
 * - 测试：轻量推理验证模型可用
 * - 状态：实时显示 not-downloaded → downloading → downloaded → loading → ready
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Cpu, Download, Loader2, CheckCircle2, XCircle, Power, FlaskConical,
  Play, Square, RefreshCw, HardDrive
} from 'lucide-react'
import type { LocalModelStatus } from '@shared/types'

interface LocalModelCardProps {
  enabled: boolean
  onToggle: (v: boolean) => void
}

const STATE_LABEL: Record<LocalModelStatus['state'], string> = {
  'not-downloaded': '未下载',
  downloading: '下载中',
  downloaded: '已下载',
  loading: '加载中',
  ready: '已就绪',
  error: '错误'
}

const STATE_COLOR: Record<LocalModelStatus['state'], string> = {
  'not-downloaded': 'text-text-muted',
  downloading: 'text-accent',
  downloaded: 'text-blue-400',
  loading: 'text-accent',
  ready: 'text-green-500',
  error: 'text-red-500'
}

export function LocalModelCard({ enabled, onToggle }: LocalModelCardProps): JSX.Element {
  const [status, setStatus] = useState<LocalModelStatus | null>(null)
  const [busy, setBusy] = useState(false)

  // 订阅状态变更 + 获取初始状态
  useEffect(() => {
    void window.api.localModel.getStatus().then(setStatus)
    const unsub = window.api.localModel.onStatus((s) => setStatus(s))
    return unsub
  }, [])

  const handleDownload = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.localModel.download()
    } finally {
      setBusy(false)
    }
  }, [])

  const handleCancelDownload = useCallback(async (): Promise<void> => {
    await window.api.localModel.cancelDownload()
  }, [])

  const handleLoad = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.localModel.load()
    } finally {
      setBusy(false)
    }
  }, [])

  const handleDispose = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.localModel.dispose()
    } finally {
      setBusy(false)
    }
  }, [])

  const handleTest = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.localModel.test()
    } finally {
      setBusy(false)
    }
  }, [])

  const state = status?.state ?? 'not-downloaded'
  const progress = status?.progress ?? 0
  const isDownloading = state === 'downloading'
  const isLoading = state === 'loading'
  const isReady = state === 'ready'
  // 已下载：含 downloaded/ready/loading 状态，以及错误但基座模型文件已存在（加载失败）的情况
  const isDownloaded =
    state === 'downloaded' || isReady || isLoading || (state === 'error' && !!status?.baseModelPath)
  const isError = state === 'error'

  return (
    <div className="rounded-lg border border-border bg-bg-input p-3.5">
      {/* 标题行 + 开关 */}
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1 flex flex-col">
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
            <FlaskConical size={13} className="text-purple-400" />
            本地模型（实验性）
            <span className="rounded bg-purple-500/10 px-1 py-0.5 text-[10px] text-purple-400">BETA</span>
          </div>
          <div className="mt-1 text-xs leading-relaxed text-text-muted">
            在本地运行 Qwen3-4B + litex LoRA，无需网络与 API Key。首次需下载 ~2.33GB 基座模型。启用后覆盖所有限免/直连模式。
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            enabled ? 'bg-accent' : 'bg-bg-hover'
          } cursor-pointer`}
          onClick={() => onToggle(!enabled)}
        >
          <span
            className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform"
            style={{ transform: enabled ? 'translateX(18px)' : 'translateX(4px)' }}
          />
        </button>
      </div>

      {/* 状态指示器 */}
      {enabled && status && (
        <div className="mt-2.5 space-y-2">
          {/* 状态行 */}
          <div className="flex items-center justify-between rounded-md bg-bg-hover/50 px-2.5 py-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              {(isDownloading || isLoading) && <Loader2 size={12} className="animate-spin text-accent" />}
              {isReady && <CheckCircle2 size={12} className="text-green-500" />}
              {isError && <XCircle size={12} className="text-red-500" />}
              {!isDownloading && !isLoading && !isReady && !isError && <Cpu size={12} className="text-text-muted" />}
              <span className="text-text-muted">状态</span>
            </div>
            <span className={`font-medium ${STATE_COLOR[state]}`}>{STATE_LABEL[state]}</span>
          </div>

          {/* 进度条（下载/加载中） */}
          {(isDownloading || isLoading) && (
            <div className="space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-text-muted">{status.message}</div>
            </div>
          )}

          {/* 错误信息 */}
          {isError && status.error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-xs text-red-500">
              {status.error}
            </div>
          )}

          {/* 模型信息（已就绪时） */}
          {isReady && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-bg-hover/50 px-2.5 py-1.5">
                <div className="text-text-muted">基座模型</div>
                <div className="font-medium text-text-primary">Qwen3-4B Q4_K_M</div>
              </div>
              <div className="rounded-md bg-bg-hover/50 px-2.5 py-1.5">
                <div className="text-text-muted">LoRA</div>
                <div className="font-medium text-text-primary">{status.hasLora ? 'litex ✓' : '未加载'}</div>
              </div>
              <div className="rounded-md bg-bg-hover/50 px-2.5 py-1.5">
                <div className="text-text-muted">上下文</div>
                <div className="font-medium text-text-primary">{(status.contextSize / 1024).toFixed(0)}K tokens</div>
              </div>
              <div className="rounded-md bg-bg-hover/50 px-2.5 py-1.5">
                <div className="text-text-muted">GPU</div>
                <div className="font-medium text-text-primary">{status.gpuType ?? '—'}</div>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-2">
            {!isDownloaded && !isDownloading && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDownload()}
                className="btn-primary flex items-center gap-1 px-3 py-1 text-xs disabled:opacity-50"
              >
                <Download size={12} />
                下载基座模型
              </button>
            )}

            {isDownloading && (
              <button
                type="button"
                onClick={() => void handleCancelDownload()}
                className="btn-secondary flex items-center gap-1 px-3 py-1 text-xs"
              >
                <Square size={12} />
                取消下载
              </button>
            )}

            {isDownloaded && !isReady && !isLoading && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleLoad()}
                className="btn-primary flex items-center gap-1 px-3 py-1 text-xs disabled:opacity-50"
              >
                <Power size={12} />
                加载模型
              </button>
            )}

            {isReady && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleTest()}
                  className="btn-secondary flex items-center gap-1 px-3 py-1 text-xs disabled:opacity-50"
                >
                  <Play size={12} />
                  测试推理
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDispose()}
                  className="btn-secondary flex items-center gap-1 px-3 py-1 text-xs disabled:opacity-50"
                >
                  <Power size={12} />
                  卸载
                </button>
              </>
            )}

            {isError && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void (status?.baseModelPath ? handleLoad() : handleDownload())}
                className="btn-secondary flex items-center gap-1 px-3 py-1 text-xs disabled:opacity-50"
              >
                <RefreshCw size={12} />
                重试
              </button>
            )}
          </div>

          {/* 磁盘占用提示 */}
          {isDownloaded && (
            <div className="flex items-center gap-1 text-[11px] text-text-muted">
              <HardDrive size={10} />
              基座模型约 2.33GB，存储于用户数据目录
            </div>
          )}
        </div>
      )}
    </div>
  )
}
