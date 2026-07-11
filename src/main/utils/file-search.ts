import { promises as fs, existsSync } from 'fs'
import type { Dirent } from 'fs'
import { join, basename, extname } from 'path'
import { homedir } from 'os'
import Store from 'electron-store'
import { logger } from './logger'
import type { FileSearchResult, FileIndexStatus } from '@shared/types'

interface IndexEntry {
  path: string
  name: string
  ext: string
  size: number
  mtime: number
  isDir: boolean
}

interface StoreSchema {
  index: IndexEntry[]
  lastIndexedAt: number
  indexedPaths: string[]
}

const MAX_INDEX_ENTRIES = 200000
const MAX_SEARCH_RESULTS = 200
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

/** 跳过这些目录以避免扫描过多无关文件 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'AppData',
  '.cache',
  '__pycache__',
  'dist',
  'build',
  '.venv',
  'venv',
  'target',
  'bin',
  'obj',
  '.next',
  '.nuxt',
  'coverage',
  '.idea',
  '.vscode'
])

class FileSearchEngine {
  private index: IndexEntry[] = []
  private indexing = false
  private abortFlag = false
  private store: Store<StoreSchema> | null = null

  /** 初始化：从 electron-store 加载缓存索引，必要时延迟重建 */
  init(): void {
    try {
      this.store = new Store<StoreSchema>({
        name: 'file-index',
        defaults: { index: [], lastIndexedAt: 0, indexedPaths: [] }
      })
      this.index = this.store.get('index') ?? []
      logger.info(`[FileSearch] loaded index: ${this.index.length} entries`)
    } catch (err) {
      logger.error('[FileSearch] failed to load index, starting empty:', err)
      this.index = []
    }

    // 如果索引为空或超过 7 天，延迟自动重建（不阻塞启动）
    const lastIndexedAt = this.store?.get('lastIndexedAt') ?? 0
    if (this.index.length === 0 || Date.now() - lastIndexedAt > SEVEN_DAYS) {
      setTimeout(() => {
        void this.rebuild()
      }, 10000)
    }
  }

  /** 获取当前索引状态 */
  getStatus(): FileIndexStatus {
    return {
      indexing: this.indexing,
      totalFiles: this.index.length,
      lastIndexedAt: this.store?.get('lastIndexedAt'),
      indexedPaths: this.store?.get('indexedPaths') ?? []
    }
  }

  /** 重建索引：异步扫描常用目录，支持取消 */
  async rebuild(customPaths?: string[]): Promise<void> {
    if (this.indexing) return
    this.indexing = true
    this.abortFlag = false

    const defaultPaths = this.getDefaultIndexPaths()
    const paths = customPaths && customPaths.length > 0 ? customPaths : defaultPaths

    logger.info(`[FileSearch] rebuilding index for paths: ${paths.join(', ')}`)

    const newIndex: IndexEntry[] = []
    for (const basePath of paths) {
      if (this.abortFlag) break
      await this.scanDir(basePath, newIndex, 0, 8)
    }

    if (!this.abortFlag) {
      this.index = newIndex
      if (this.store) {
        this.store.set('index', newIndex)
        this.store.set('lastIndexedAt', Date.now())
        this.store.set('indexedPaths', paths)
      }
      logger.info(`[FileSearch] index rebuilt: ${newIndex.length} entries`)
    } else {
      logger.info('[FileSearch] index rebuild aborted')
    }

    this.indexing = false
    this.abortFlag = false
  }

  /** 取消正在进行的索引构建 */
  stop(): void {
    this.abortFlag = true
  }

  /** 获取默认索引目录（用户常用目录 + 项目目录） */
  private getDefaultIndexPaths(): string[] {
    const home = homedir()
    const paths = [
      join(home, 'Desktop'),
      join(home, 'Documents'),
      join(home, 'Downloads'),
      join(home, 'Pictures'),
      join(home, 'Music'),
      join(home, 'Videos'),
      'D:\\code',
      'D:\\Projects'
    ]
    return paths.filter((p) => {
      try {
        return existsSync(p)
      } catch {
        return false
      }
    })
  }

  /** 递归扫描目录，收集文件/目录索引条目 */
  private async scanDir(
    dir: string,
    results: IndexEntry[],
    depth: number,
    maxDepth: number
  ): Promise<void> {
    if (this.abortFlag || results.length >= MAX_INDEX_ENTRIES || depth > maxDepth) return

    const dirName = basename(dir)
    if (SKIP_DIRS.has(dirName)) return

    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (this.abortFlag || results.length >= MAX_INDEX_ENTRIES) return

      const fullPath = join(dir, entry.name)
      try {
        if (entry.isDirectory()) {
          results.push({
            path: fullPath,
            name: entry.name,
            ext: '',
            size: 0,
            mtime: 0,
            isDir: true
          })
          await this.scanDir(fullPath, results, depth + 1, maxDepth)
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath)
          results.push({
            path: fullPath,
            name: entry.name,
            ext: extname(entry.name).toLowerCase(),
            size: stat.size,
            mtime: stat.mtime.getTime(),
            isDir: false
          })
        }
      } catch {
        // 跳过无权限或无法访问的文件
      }
    }
  }

  /**
   * 搜索索引：支持不区分大小写的子串匹配 + 通配符匹配（* 和 ?）
   * 按相关度排序：文件名完全匹配 > 前缀匹配 > 包含匹配 > 路径包含
   * @param keyword 搜索关键词（支持通配符 * 和 ?）
   * @param options.maxResults 最大返回条数
   * @param options.extFilter 扩展名过滤，支持逗号分隔（如 ".jpg,.png"）
   */
  search(
    keyword: string,
    options?: { maxResults?: number; extFilter?: string }
  ): FileSearchResult[] {
    if (!keyword || keyword.trim().length === 0) return []

    const kw = keyword.toLowerCase().trim()
    const maxResults = Math.min(
      options?.maxResults ?? MAX_SEARCH_RESULTS,
      MAX_SEARCH_RESULTS
    )

    // 解析扩展名过滤（支持逗号分隔的多扩展名）
    const extFilterRaw = options?.extFilter?.toLowerCase().trim()
    const extList = extFilterRaw
      ? extFilterRaw
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean)
      : []

    // 检测通配符模式并编译为正则
    const hasWildcard = kw.includes('*') || kw.includes('?')
    let wildcardRegex: RegExp | null = null
    if (hasWildcard) {
      try {
        const pattern = kw
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')
        wildcardRegex = new RegExp(`^${pattern}$`, 'i')
      } catch {
        wildcardRegex = null
      }
    }

    const scored: Array<{ entry: IndexEntry; score: number }> = []
    const now = Date.now()

    for (const entry of this.index) {
      // 扩展名过滤
      if (extList.length > 0 && !extList.includes(entry.ext)) continue

      const nameLower = entry.name.toLowerCase()
      const pathLower = entry.path.toLowerCase()

      let score = 0
      if (hasWildcard && wildcardRegex) {
        // 通配符匹配
        if (wildcardRegex.test(entry.name)) {
          score = 70
        } else if (wildcardRegex.test(entry.path)) {
          score = 35
        } else {
          continue
        }
      } else if (nameLower === kw) {
        score = 100 // 完全匹配
      } else if (nameLower.startsWith(kw)) {
        score = 80 // 前缀匹配
      } else if (nameLower.includes(kw)) {
        score = 60 // 文件名包含
      } else if (pathLower.includes(kw)) {
        score = 30 // 路径包含
      } else {
        continue
      }

      // 文件优先于目录
      if (!entry.isDir) score += 5
      // 最近修改的加分
      if (entry.mtime > 0) {
        const daysSince = (now - entry.mtime) / (24 * 60 * 60 * 1000)
        if (daysSince < 7) score += 10
        else if (daysSince < 30) score += 5
      }

      scored.push({ entry, score })
    }

    // 按相关度降序排序
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, maxResults).map((s) => s.entry)
  }
}

export const fileSearchEngine = new FileSearchEngine()
