import { app, shell } from 'electron'
import { createWriteStream } from 'fs'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { UPDATE_MANIFEST_URL } from '@shared/constants'
import type { UpdateCheckResult, UpdateInfo } from '@shared/update-types'
import { logger } from './logger'

/** manifest.json 的结构 */
interface Manifest {
  desktop: {
    version: string
    updatedAt: string
    sizeBytes: number
    filename: string
    url: string // 相对路径，如 /download/Xcomputer-0.1.2-setup.exe
    size: string
  }
}

/**
 * 应用更新检查器
 * - checkForUpdates: 从 manifest.json 获取最新版本，与 app.getVersion() 对比
 * - downloadUpdate: 流式下载 setup.exe 到临时目录，报告进度
 * - installUpdate: 启动 NSIS 安装程序并退出当前应用
 */
export class UpdateChecker {
  private checking = false
  private downloading = false

  get isChecking(): boolean {
    return this.checking
  }

  get isDownloading(): boolean {
    return this.downloading
  }

  /** 检查更新：fetch manifest.json，对比版本号 */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (this.checking) {
      logger.warn('[UpdateChecker] 检查进行中，跳过重复请求')
      return { hasUpdate: false, currentVersion: app.getVersion() }
    }
    this.checking = true
    const currentVersion = app.getVersion()
    try {
      logger.info(`[UpdateChecker] 开始检查更新，当前版本 ${currentVersion}`)
      const resp = await fetch(UPDATE_MANIFEST_URL, {
        signal: AbortSignal.timeout(15000)
      })
      if (!resp.ok) {
        throw new Error(`服务器返回 ${resp.status}`)
      }
      const manifest = (await resp.json()) as Manifest
      const desktop = manifest.desktop
      if (!desktop || !desktop.version) {
        throw new Error('manifest 缺少 desktop.version 字段')
      }

      // 把相对 URL 拼成绝对 URL
      const baseUrl = new URL(UPDATE_MANIFEST_URL)
      const absoluteUrl = new URL(desktop.url, baseUrl.origin).toString()

      const updateInfo: UpdateInfo = {
        version: desktop.version,
        url: absoluteUrl,
        filename: desktop.filename,
        sizeBytes: desktop.sizeBytes,
        size: desktop.size,
        updatedAt: desktop.updatedAt
      }

      const hasUpdate = this.compareVersions(desktop.version, currentVersion) > 0
      logger.info(
        `[UpdateChecker] 检查完成：远端 ${desktop.version} vs 本地 ${currentVersion}，${
          hasUpdate ? '有更新' : '已是最新'
        }`
      )

      return {
        hasUpdate,
        currentVersion,
        latestVersion: desktop.version,
        updateInfo: hasUpdate ? updateInfo : undefined
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[UpdateChecker] 检查更新失败:', msg)
      return {
        hasUpdate: false,
        currentVersion,
        error: msg
      }
    } finally {
      this.checking = false
    }
  }

  /**
   * 下载更新：流式下载 setup.exe 到临时目录
   * @param updateInfo 更新信息（含下载 URL）
   * @param onProgress 进度回调（progress 0-100, downloadedBytes, totalBytes）
   * @returns 下载完成的本地文件路径
   */
  async downloadUpdate(
    updateInfo: UpdateInfo,
    onProgress?: (progress: number, downloadedBytes: number, totalBytes: number) => void
  ): Promise<string> {
    if (this.downloading) {
      throw new Error('下载进行中，请勿重复触发')
    }
    this.downloading = true
    const savePath = join(tmpdir(), updateInfo.filename)
    // 使用 .part 临时文件下载，完成后 rename，避免半成品被误认/锁定
    const tempPath = savePath + '.part'
    logger.info(`[UpdateChecker] 开始下载更新：${updateInfo.url} -> ${savePath}`)

    let fileStream: ReturnType<typeof createWriteStream> | null = null
    try {
      // 下载前清理可能残留的旧文件（半成品/杀软锁定/上次失败）
      await fs.unlink(tempPath).catch(() => {})
      await fs.unlink(savePath).catch(() => {})

      const resp = await fetch(updateInfo.url, {
        signal: AbortSignal.timeout(300000) // 5 分钟超时（大文件）
      })
      if (!resp.ok) {
        throw new Error(`下载失败，服务器返回 ${resp.status}`)
      }

      const totalBytes = Number(resp.headers.get('content-length') ?? updateInfo.sizeBytes)
      const reader = resp.body?.getReader()
      if (!reader) {
        throw new Error('响应无可读流')
      }

      // 使用 wx 标志（排他写入），若文件已存在直接报错（上面的 unlink 已清理）
      fileStream = createWriteStream(tempPath, { flags: 'wx' })

      // 监听 stream error，避免 uncaughtException 崩溃主进程
      const streamError = new Promise<never>((_, reject) => {
        fileStream!.on('error', (err) => reject(err))
      })

      let downloadedBytes = 0
      const MB = 1024 * 1024

      // eslint-disable-next-line no-constant-condition
      while (true) {
        // 同时等待 reader 和 stream error，任一出错都立即终止
        const readPromise = reader.read()
        const result = await Promise.race([readPromise, streamError])
        const { done, value } = result as ReadableStreamReadResult<Uint8Array>
        if (done) break

        // 处理背压：write 返回 false 时等待 drain 事件
        if (!fileStream.write(Buffer.from(value))) {
          await Promise.race([
            new Promise<void>((resolve) => fileStream!.once('drain', resolve)),
            streamError
          ])
        }
        downloadedBytes += value.byteLength
        if (onProgress && totalBytes > 0) {
          const progress = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
          onProgress(progress, downloadedBytes, totalBytes)
        }
      }

      await new Promise<void>((resolve, reject) => {
        fileStream!.end((err: Error | null | undefined) => (err ? reject(err) : resolve()))
      })

      // 下载完成：.part 重命名为正式文件名
      await fs.rename(tempPath, savePath)

      logger.info(
        `[UpdateChecker] 下载完成：${(downloadedBytes / MB).toFixed(1)} MB -> ${savePath}`
      )
      return savePath
    } catch (err) {
      // 关闭可能还打开着的文件流
      if (fileStream && !fileStream.destroyed) {
        fileStream.destroy()
      }
      // 下载失败时清理半成品文件
      try {
        await fs.unlink(tempPath)
      } catch {
        // 忽略清理错误
      }
      throw err
    } finally {
      this.downloading = false
    }
  }

  /** 安装更新：启动 NSIS 安装程序并退出当前应用 */
  async installUpdate(filePath: string): Promise<void> {
    logger.info(`[UpdateChecker] 启动安装程序：${filePath}`)
    // shell.openPath 返回 Promise<string>：空串表示成功，非空串为错误信息
    const errMsg = await shell.openPath(filePath)
    if (errMsg) {
      // 启动失败时不退出应用，让用户看到错误并保留当前会话
      logger.error(`[UpdateChecker] 启动安装程序失败: ${errMsg}`)
      throw new Error(`无法启动安装程序: ${errMsg}`)
    }
    // 启动成功后延迟 500ms 退出，确保安装程序窗口已就绪
    setTimeout(() => {
      app.quit()
    }, 500)
  }

  /**
   * 语义版本比较
   * @returns 正数 a>b，负数 a<b，0 相等
   */
  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map((n) => parseInt(n, 10) || 0)
    const partsB = b.split('.').map((n) => parseInt(n, 10) || 0)
    const len = Math.max(partsA.length, partsB.length)
    for (let i = 0; i < len; i++) {
      const va = partsA[i] ?? 0
      const vb = partsB[i] ?? 0
      if (va !== vb) return va - vb
    }
    return 0
  }
}

/** 单例（主进程内共享，IPC handler 与自动检查共用） */
export const updateChecker = new UpdateChecker()
