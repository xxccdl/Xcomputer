/**
 * 本地模型管理器（实验性）
 *
 * 基于 node-llama-cpp 在 Electron 主进程内运行 Qwen3-4B-Instruct + litex LoRA，
 * 无需外部推理服务或网络连接（仅首次运行需从 ModelScope 下载基座模型）。
 *
 * 生命周期：
 *   getLlama() → loadModel() → createContext({lora}) → [ready]
 *                                          ↑
 *                       LocalModelClient 从 context 取 sequence 做推理
 *
 * 状态机：
 *   not-downloaded → downloading → downloaded → loading → ready
 *                       ↓(取消)        ↓(失败)              ↓(dispose)
 *                  not-downloaded     error            downloaded
 */
import { app } from 'electron'
import { join } from 'path'
import { createWriteStream, existsSync, statSync } from 'fs'
import { mkdir, rename, unlink } from 'fs/promises'
import type {
  Llama,
  LlamaModel,
  LlamaContext,
  LlamaContextSequence
} from 'node-llama-cpp'
import { logger } from '../utils/logger'
import {
  LOCAL_MODEL_BASE_FILE,
  LOCAL_MODEL_BASE_SIZE,
  LOCAL_MODEL_DOWNLOAD_URL,
  LOCAL_MODEL_LORA_FILE,
  LOCAL_MODEL_LORA_SCALE,
  LOCAL_MODEL_MAX_CONTEXT_TOKENS,
  LOCAL_MODEL_BATCH_SIZE,
  LOCAL_MODEL_THREADS,
  LOCAL_MODEL_FLASH_ATTENTION
} from '@shared/constants'
import type { LocalModelState, LocalModelStatus } from '@shared/types'

type StatusListener = (status: LocalModelStatus) => void

class LocalModelManager {
  private llama: Llama | null = null
  private model: LlamaModel | null = null
  private context: LlamaContext | null = null

  private state: LocalModelState = 'not-downloaded'
  private progress = 0
  private message = '基座模型尚未下载'
  private error: string | null = null
  private gpuType: string | null = null

  private listeners = new Set<StatusListener>()
  private downloadAbort: AbortController | null = null
  /** 加载锁：防止 ensureReady 重入 */
  private loadingPromise: Promise<void> | null = null

  // ─── 路径 ───────────────────────────────────────────────

  /** 基座模型下载目录：userData/local-models/ */
  get modelsDir(): string {
    return join(app.getPath('userData'), 'local-models')
  }

  /** 基座模型本地完整路径 */
  get baseModelPath(): string {
    return join(this.modelsDir, LOCAL_MODEL_BASE_FILE)
  }

  /**
   * litex LoRA GGUF 路径：随安装包分发。
   * 开发环境：{appPath}/resources/local-models/litex-lora.gguf
   * 生产环境：{resourcesPath}/local-models/litex-lora.gguf
   *   （electron-builder extraResources 把 resources/local-models 复制到
   *    安装目录 resources/local-models，process.resourcesPath 即指向该 resources 目录）
   */
  get loraPath(): string {
    if (app.isPackaged) {
      return join(process.resourcesPath, 'local-models', LOCAL_MODEL_LORA_FILE)
    }
    return join(app.getAppPath(), 'resources', 'local-models', LOCAL_MODEL_LORA_FILE)
  }

  /** LoRA GGUF 是否存在（存在时才会在 createContext 时应用） */
  get hasLora(): boolean {
    return existsSync(this.loraPath)
  }

  // ─── 状态查询 ───────────────────────────────────────────

  getStatus(): LocalModelStatus {
    const baseExists = existsSync(this.baseModelPath)
    let state = this.state
    // 磁盘状态校正：内存状态可能滞后于实际文件
    if ((state === 'not-downloaded' || state === 'error') && baseExists && this.context) {
      state = 'ready'
    } else if ((state === 'not-downloaded' || state === 'error') && baseExists) {
      state = 'downloaded'
    } else if (state === 'ready' && !this.context) {
      state = baseExists ? 'downloaded' : 'not-downloaded'
    }
    return {
      state,
      progress: this.progress,
      message: this.message,
      baseModelPath: baseExists ? this.baseModelPath : null,
      loraPath: this.hasLora ? this.loraPath : null,
      gpuType: this.gpuType,
      contextSize: LOCAL_MODEL_MAX_CONTEXT_TOKENS,
      hasLora: this.hasLora,
      error: state === 'error' ? this.error : null
    }
  }

  /** 订阅状态变更（返回取消订阅函数） */
  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setStatus(state: LocalModelState, opts?: Partial<Pick<LocalModelStatus, 'progress' | 'message' | 'error'>>): void {
    this.state = state
    if (opts?.progress !== undefined) this.progress = opts.progress
    if (opts?.message !== undefined) this.message = opts.message
    if (opts?.error !== undefined) this.error = opts.error
    const status = this.getStatus()
    for (const l of this.listeners) {
      try { l(status) } catch { /* 监听器异常不影响主流程 */ }
    }
  }

  // ─── 下载 ───────────────────────────────────────────────

  /**
   * 从 ModelScope 下载基座模型（支持断点续传）。
   * 下载完成后不会自动加载——由调用方决定何时 loadModel。
   */
  async downloadBaseModel(): Promise<void> {
    if (this.state === 'downloading') {
      throw new Error('下载已在进行中')
    }
    if (this.state === 'loading' || this.state === 'ready') {
      throw new Error('模型已加载，请先卸载后再重新下载')
    }

    await mkdir(this.modelsDir, { recursive: true })
    this.downloadAbort = new AbortController()

    // 断点续传：检测已下载的字节数
    const tmpPath = this.baseModelPath + '.part'
    let resumeFrom = 0
    if (existsSync(tmpPath)) {
      resumeFrom = statSync(tmpPath).size
    }
    // 已完整下载（可能是上次成功但状态未刷新）
    if (existsSync(this.baseModelPath) && statSync(this.baseModelPath).size === LOCAL_MODEL_BASE_SIZE) {
      this.setStatus('downloaded', { progress: 1, message: '基座模型已就绪' })
      return
    }

    this.setStatus('downloading', {
      progress: resumeFrom / LOCAL_MODEL_BASE_SIZE,
      message: resumeFrom > 0 ? `断点续传（已下载 ${Math.round(resumeFrom / 1024 / 1024)}MB）` : '正在连接 ModelScope…'
    })
    logger.info(`[LocalModel] 开始下载基座模型，resumeFrom=${resumeFrom}`)

    try {
      const headers: Record<string, string> = {}
      if (resumeFrom > 0) headers['Range'] = `bytes=${resumeFrom}-`

      const resp = await fetch(LOCAL_MODEL_DOWNLOAD_URL, {
        signal: this.downloadAbort.signal,
        headers
      })

      if (!resp.ok && resp.status !== 206) {
        // Range 不支持时从头开始
        if (resp.status === 200 && resumeFrom > 0) {
          resumeFrom = 0
        } else {
          throw new Error(`ModelScope 返回 ${resp.status} ${resp.statusText}`)
        }
      }

      const supportsRange = resp.status === 206
      const totalBytes = supportsRange
        ? LOCAL_MODEL_BASE_SIZE
        : parseInt(resp.headers.get('content-length') || String(LOCAL_MODEL_BASE_SIZE), 10)
      const writeStream = createWriteStream(tmpPath, { flags: supportsRange ? 'a' : 'w' })

      // 尽早挂载 'error' 监听器：writeStream 在写入阶段出错（磁盘满/权限不足）
      // 时会 emit 'error'，若无监听器则触发 uncaughtException 导致主进程崩溃
      let streamError: Error | null = null
      const streamErrorPromise = new Promise<never>((_, reject) => {
        writeStream.on('error', (err) => {
          streamError = err
          reject(err)
        })
      })

      const body = resp.body
      if (!body) throw new Error('下载响应体为空')

      // ReadableStream → Node stream 管道
      const reader = body.getReader()
      let received = resumeFrom
      let lastReport = 0

      // 手动写入以支持进度上报与中断
      const writeChunk = async ({ done, value }: ReadableStreamReadResult<Uint8Array>): Promise<void> => {
        if (done) return
        if (this.downloadAbort?.signal.aborted) {
          throw new DOMException('下载已取消', 'AbortError')
        }
        // 与 stream error 竞争：任一出错都立即终止
        await Promise.race([
          new Promise<void>((resolve) => {
            if (writeStream.write(Buffer.from(value))) {
              resolve()
            } else {
              writeStream.once('drain', resolve)
            }
          }),
          streamErrorPromise
        ])
        received += value.length
        // 每 2MB 上报一次进度，避免 IPC 风暴
        if (received - lastReport >= 2 * 1024 * 1024 || received === totalBytes) {
          lastReport = received
          const pct = Math.min(received / totalBytes, 1)
          this.setStatus('downloading', {
            progress: pct,
            message: `下载中 ${Math.round(received / 1024 / 1024)}/${Math.round(totalBytes / 1024 / 1024)}MB（${Math.round(pct * 100)}%）`
          })
        }
        return reader.read().then(writeChunk)
      }

      await Promise.race([reader.read().then(writeChunk), streamErrorPromise])
      if (streamError) throw streamError
      await new Promise<void>((resolve) => {
        writeStream.end(() => resolve())
      })

      // 校验完整性
      const finalSize = statSync(tmpPath).size
      if (finalSize !== LOCAL_MODEL_BASE_SIZE) {
        logger.warn(`[LocalModel] 下载大小不匹配: ${finalSize} / ${LOCAL_MODEL_BASE_SIZE}`)
        // 大小不符但不报错——可能 ModelScope 文件有更新，继续尝试加载
      }

      await rename(tmpPath, this.baseModelPath)
      this.downloadAbort = null
      this.setStatus('downloaded', { progress: 1, message: '基座模型下载完成，可加载推理' })
      logger.info('[LocalModel] 基座模型下载完成')
    } catch (err) {
      this.downloadAbort = null
      if (err instanceof Error && err.name === 'AbortError') {
        this.setStatus('not-downloaded', { message: '下载已取消' })
        logger.info('[LocalModel] 下载已取消')
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      this.setStatus('error', { error: `下载失败：${msg}`, message: `下载失败：${msg}` })
      logger.error('[LocalModel] 下载失败', err)
      throw err
    }
  }

  /** 取消正在进行的下载 */
  cancelDownload(): void {
    if (this.downloadAbort) {
      this.downloadAbort.abort()
    }
  }

  // ─── 加载 ───────────────────────────────────────────────

  /**
   * 确保模型已加载到内存（幂等，支持并发调用合并）。
   * 流程：getLlama → loadModel → createContext（应用 LoRA）。
   */
  async ensureReady(): Promise<void> {
    if (this.state === 'ready' && this.context) return
    if (this.loadingPromise) return this.loadingPromise

    this.loadingPromise = this._load()
    try {
      await this.loadingPromise
    } finally {
      this.loadingPromise = null
    }
  }

  private async _load(): Promise<void> {
    if (!existsSync(this.baseModelPath)) {
      this.setStatus('not-downloaded', { message: '基座模型尚未下载，请先下载' })
      throw new Error('基座模型尚未下载')
    }

    this.setStatus('loading', { progress: 0, message: '正在初始化推理引擎…' })
    logger.info('[LocalModel] 开始加载模型')

    try {
      // 1. 初始化 llama.cpp（自动检测 GPU/CPU 后端）
      if (!this.llama) {
        // node-llama-cpp 是 ESM 包，electron-vite 主进程为 CJS，
        // 必须用动态 import() 加载，静态 require() 会报 ERR_REQUIRE_ESM
        const { getLlama } = await import('node-llama-cpp')
        // maxThreads=0：不限制线程数，让 llama.cpp 自动使用全部 CPU 核心
        this.llama = await getLlama({ maxThreads: LOCAL_MODEL_THREADS })
        // 推测 GPU 类型用于状态展示
        try {
          const gpu = (this.llama as unknown as { gpu?: string }).gpu
          this.gpuType = gpu ?? 'auto'
        } catch {
          this.gpuType = 'auto'
        }
        this.setStatus('loading', { progress: 0.2, message: `推理引擎就绪（${this.gpuType}）` })
      }

      // 2. 加载基座模型权重
      this.setStatus('loading', { progress: 0.3, message: '正在加载基座模型权重…' })
      if (!this.model) {
        this.model = await this.llama.loadModel({
          modelPath: this.baseModelPath,
          // gpuLayers='auto'：自动检测 VRAM 并尽量将层卸载到 GPU
          gpuLayers: 'auto',
          // useMmap：内存映射文件加载，减少首次加载延迟
          useMmap: true
        })
      }
      this.setStatus('loading', { progress: 0.6, message: '基座模型加载完成' })

      // 3. 创建上下文（应用 LoRA）
      const useLora = this.hasLora
      this.setStatus('loading', {
        progress: 0.7,
        message: useLora ? '正在应用 litex LoRA 适配器…' : '正在创建推理上下文…'
      })

      // 释放旧上下文
      if (this.context) {
        try { await this.context.dispose() } catch { /* ignore */ }
        this.context = null
      }

      this.context = await this.model.createContext({
        contextSize: LOCAL_MODEL_MAX_CONTEXT_TOKENS,
        // Flash Attention：加速 attention 计算、降低 KV cache 内存占用
        flashAttention: LOCAL_MODEL_FLASH_ATTENTION,
        // batchSize：prefill 阶段每批处理的 token 数，2048 远快于默认 512
        batchSize: LOCAL_MODEL_BATCH_SIZE,
        // threads=0：使用全部 CPU 核心（机器 16 逻辑核心）
        threads: LOCAL_MODEL_THREADS,
        lora: useLora
          ? {
              adapters: [{ filePath: this.loraPath, scale: LOCAL_MODEL_LORA_SCALE }],
              onLoadProgress: (p: number) => {
                this.setStatus('loading', {
                  progress: 0.7 + p * 0.25,
                  message: `LoRA 加载 ${Math.round(p * 100)}%`
                })
              }
            }
          : undefined
      })

      this.setStatus('ready', {
        progress: 1,
        message: useLora ? '模型已就绪（Qwen3-4B + litex LoRA）' : '模型已就绪（Qwen3-4B 基座）'
      })
      logger.info('[LocalModel] 模型加载完成，LoRA=' + useLora)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.setStatus('error', { error: msg, message: `加载失败：${msg}` })
      logger.error('[LocalModel] 模型加载失败', err)
      throw err
    }
  }

  /**
   * 获取一个推理序列（由 LocalModelClient 调用）。
   * 每次请求取一个独立 sequence，用完由调用方 dispose。
   */
  async getSequence(): Promise<LlamaContextSequence> {
    await this.ensureReady()
    if (!this.context) throw new Error('推理上下文未初始化')
    return this.context.getSequence()
  }

  /** 当前 Llama 实例（供 Client 读取 tokenizer/chatWrapper 元信息） */
  getLlamaInstance(): Llama | null {
    return this.llama
  }

  // ─── 推理健康检查 ───────────────────────────────────────

  /**
   * 轻量推理测试：生成一句话验证模型可用。
   * 返回生成内容（用于 UI 展示）。
   */
  async test(): Promise<{ ok: boolean; message: string; output?: string }> {
    try {
      await this.ensureReady()
      if (!this.context) throw new Error('上下文未初始化')

      const { LlamaCompletion } = await import('node-llama-cpp')
      const sequence = this.context.getSequence()
      const completion = new LlamaCompletion({ contextSequence: sequence })
      try {
        const resp = await completion.generateCompletion(
          '请用中文回复"模型运行正常"五个字。',
          { maxTokens: 32, temperature: 0.1 }
        )
        return { ok: true, message: '本地模型推理正常', output: resp }
      } finally {
        sequence.dispose()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, message: `推理测试失败：${msg}` }
    }
  }

  // ─── 卸载 ───────────────────────────────────────────────

  /** 卸载模型，释放显存/内存（保留已下载的基座文件） */
  async dispose(): Promise<void> {
    logger.info('[LocalModel] 卸载模型')
    this.loadingPromise = null
    if (this.context) {
      try { await this.context.dispose() } catch { /* ignore */ }
      this.context = null
    }
    if (this.model) {
      try { await this.model.dispose() } catch { /* ignore */ }
      this.model = null
    }
    // llama 实例可复用，不释放；仅在进程退出时由系统回收
    const baseExists = existsSync(this.baseModelPath)
    this.gpuType = null
    this.setStatus(baseExists ? 'downloaded' : 'not-downloaded', {
      progress: 0,
      message: baseExists ? '模型已卸载，可重新加载' : '基座模型尚未下载'
    })
  }

  /** 删除已下载的基座模型文件（需先 dispose） */
  async removeBaseModel(): Promise<void> {
    if (this.context || this.model) {
      await this.dispose()
    }
    if (existsSync(this.baseModelPath)) {
      await unlink(this.baseModelPath)
    }
    if (existsSync(this.baseModelPath + '.part')) {
      await unlink(this.baseModelPath + '.part')
    }
    this.setStatus('not-downloaded', { progress: 0, message: '基座模型已删除' })
    logger.info('[LocalModel] 基座模型文件已删除')
  }
}

/** 单例 */
export const localModelManager = new LocalModelManager()
