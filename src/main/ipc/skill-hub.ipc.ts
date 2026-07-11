import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync, createReadStream } from 'fs'
import { app } from 'electron'
import * as http from 'http'
import FormData from 'form-data'
import { IPC_CHANNELS, SKILL_HUB_BASE_URL } from '@shared/constants'
import { skillsStore } from '../store/skills'
import { logger } from '../utils/logger'

/** Hub 技能列表条目 */
interface HubSkillListItem {
  id: number
  name: string
  description: string
  author: string
  category: string
  tags: string[]
  version: string
  download_count: number
  rating_sum: number
  rating_count: number
  created_at: string
  updated_at: string
}

/** Hub 技能详情 */
interface HubSkillDetail extends HubSkillListItem {
  content: string
  file_name: string | null
  file_size: number
}

interface HubListResponse {
  code: number
  data: {
    items: HubSkillListItem[]
    pagination: { total: number; page: number; limit: number; totalPages: number }
  }
}

interface HubDetailResponse {
  code: number
  data: HubSkillDetail
}

interface HubCategoriesResponse {
  code: number
  data: { name: string; count: number }[]
}

interface HubStatsResponse {
  code: number
  data: { totalSkills: number; totalDownloads: number; totalUsers: number; totalRatings: number }
}

/** 通知技能变更 */
function notifySkillsChanged(mainWindow: BrowserWindow): void {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.SKILL_CHANGED, { updated: true })
  }
}

export function registerSkillHubIpc(mainWindow: BrowserWindow): void {
  // 获取 Hub 技能列表
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_LIST,
    async (
      _e,
      params: { q?: string; category?: string; sort?: string; page?: number; limit?: number }
    ): Promise<{ items: HubSkillListItem[]; total: number; totalPages: number } | { error: string }> => {
      try {
        const query = new URLSearchParams()
        if (params.q) query.set('q', params.q)
        if (params.category) query.set('category', params.category)
        if (params.sort) query.set('sort', params.sort)
        if (params.page) query.set('page', String(params.page))
        if (params.limit) query.set('limit', String(params.limit))

        const resp = await fetch(`${SKILL_HUB_BASE_URL}/api/skills?${query.toString()}`, {
          signal: AbortSignal.timeout(15000)
        })
        if (!resp.ok) throw new Error(`服务器返回 ${resp.status}`)
        const json = (await resp.json()) as HubListResponse
        return {
          items: json.data.items,
          total: json.data.pagination.total,
          totalPages: json.data.pagination.totalPages
        }
      } catch (err) {
        logger.error('[SkillHub] 获取列表失败:', err)
        return { error: (err as Error).message }
      }
    }
  )

  // 获取 Hub 技能详情
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_GET,
    async (_e, id: number): Promise<HubSkillDetail | { error: string }> => {
      try {
        const resp = await fetch(`${SKILL_HUB_BASE_URL}/api/skills/${id}`, {
          signal: AbortSignal.timeout(15000)
        })
        if (!resp.ok) throw new Error(`服务器返回 ${resp.status}`)
        const json = (await resp.json()) as HubDetailResponse
        return json.data
      } catch (err) {
        logger.error('[SkillHub] 获取详情失败:', err)
        return { error: (err as Error).message }
      }
    }
  )

  // 从 Hub 下载并安装技能
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_DOWNLOAD,
    async (_e, id: number): Promise<{ success: boolean; name?: string; error?: string }> => {
      try {
        // 获取详情
        const detailResp = await fetch(`${SKILL_HUB_BASE_URL}/api/skills/${id}`, {
          signal: AbortSignal.timeout(15000)
        })
        if (!detailResp.ok) throw new Error(`获取详情失败: ${detailResp.status}`)
        const detailJson = (await detailResp.json()) as HubDetailResponse
        const skill = detailJson.data

        // 检查是否已安装（名称重复）
        if (skillsStore.nameExists(skill.name)) {
          return { success: false, error: `技能「${skill.name}」已安装，请勿重复安装` }
        }

        // 如果有文件附件，下载文件
        let filePath: string | undefined
        if (skill.file_name) {
          const downloadResp = await fetch(`${SKILL_HUB_BASE_URL}/api/skills/${id}/download`, {
            signal: AbortSignal.timeout(30000)
          })
          if (downloadResp.ok) {
            const buffer = Buffer.from(await downloadResp.arrayBuffer())
            const skillsDir = join(app.getPath('userData'), 'skill-files')
            if (!existsSync(skillsDir)) await mkdir(skillsDir, { recursive: true })
            // 防止路径穿越：服务器返回的 name / file_name 可能含 ../ 或绝对路径
            const safeName = String(skill.name).replace(/[/\\]/g, '_').replace(/\.\./g, '_')
            const safeFile = String(skill.file_name).replace(/[/\\]/g, '_').replace(/\.\./g, '_')
            const candidatePath = join(skillsDir, `${safeName}_${safeFile}`)
            // 二次校验：最终路径必须仍在 skillsDir 内
            if (!candidatePath.startsWith(skillsDir)) {
              throw new Error('技能文件名非法（路径穿越）')
            }
            filePath = candidatePath
            await writeFile(filePath, buffer)
          }
        }

        // 添加到本地技能存储
        const created = skillsStore.add({
          name: skill.name,
          description: skill.description,
          content: skill.content,
          source: 'hub',
          tags: skill.tags || [],
          triggers: [],
          fileType: skill.file_name
            ? skill.file_name.endsWith('.zip')
              ? 'archive'
              : skill.file_name.endsWith('.json')
                ? 'json'
                : skill.file_name.match(/\.(md|markdown)$/)
                  ? 'markdown'
                  : 'text'
            : 'markdown',
          filePath,
          enabled: true,
          author: skill.author,
          version: skill.version || '1.0.0'
        })

        notifySkillsChanged(mainWindow)
        logger.info(`[SkillHub] 安装技能成功: ${skill.name}`)
        return { success: true, name: created.name }
      } catch (err) {
        logger.error('[SkillHub] 安装技能失败:', err)
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 发布技能到 Hub
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_UPLOAD,
    async (
      _e,
      data: {
        name: string
        description: string
        author: string
        category: string
        tags: string[]
        version: string
        content: string
        filePath?: string
      }
    ): Promise<{ success: boolean; id?: number; error?: string }> => {
      try {
        // 使用 form-data 包构建 multipart 请求（Node.js 原生 FormData 在 Electron 主进程中不稳定）
        const formData = new FormData()
        formData.append('name', data.name)
        formData.append('description', data.description)
        formData.append('author', data.author)
        formData.append('category', data.category)
        formData.append('tags', data.tags.join(','))
        formData.append('version', data.version || '1.0.0')
        formData.append('content', data.content)

        // 如果有文件，使用流式附加（避免大文件读取导致内存占用过高）
        if (data.filePath && existsSync(data.filePath)) {
          const { basename } = await import('path')
          const { stat } = await import('fs/promises')
          const fileStat = await stat(data.filePath)
          // 限制文件大小 10MB
          if (fileStat.size > 10 * 1024 * 1024) {
            return { success: false, error: '文件大小超过限制（最大 10MB）' }
          }
          formData.append('file', createReadStream(data.filePath), {
            filename: basename(data.filePath),
            contentType: 'application/octet-stream'
          })
        }

        // 使用 Node.js http 模块发送请求（避免 fetch + FormData 兼容问题）
        const result = await new Promise<{ success: boolean; id?: number; error?: string }>(
          (resolve) => {
            let settled = false
            const urlObj = new URL(`${SKILL_HUB_BASE_URL}/api/skills`)
            const headers = formData.getHeaders()
            const options: http.RequestOptions = {
              hostname: urlObj.hostname,
              port: urlObj.port ? Number(urlObj.port) : 80,
              path: urlObj.pathname,
              method: 'POST',
              headers,
              // 连接超时（TCP 握手阶段）
              timeout: 10000
            }

            // 整体超时（包含连接 + 数据传输）15 秒
            const timer = setTimeout(() => {
              if (!settled) {
                settled = true
                req.destroy()
                resolve({ success: false, error: '请求超时（15秒），请检查网络或服务器状态' })
              }
            }, 15000)

            const req = http.request(options, (resp) => {
              let body = ''
              resp.on('data', (chunk: Buffer) => {
                body += chunk.toString()
              })
              resp.on('end', () => {
                if (!settled) {
                  settled = true
                  clearTimeout(timer)
                  try {
                    const json = JSON.parse(body)
                    if (json.code === 0 && json.data) {
                      resolve({ success: true, id: json.data.id })
                    } else {
                      resolve({ success: false, error: json.message || '服务器返回错误' })
                    }
                  } catch {
                    resolve({ success: false, error: `服务器返回非 JSON: ${body.slice(0, 200)}` })
                  }
                }
              })
            })

            req.on('error', (err: Error) => {
              if (!settled) {
                settled = true
                clearTimeout(timer)
                // 友好提示常见错误
                let msg = err.message
                if (msg.includes('ECONNREFUSED')) {
                  msg = '无法连接到服务器，请确认 XSkillHub 服务正在运行'
                } else if (msg.includes('ENOTFOUND')) {
                  msg = '无法解析服务器地址，请检查网络'
                } else if (msg.includes('ETIMEDOUT')) {
                  msg = '连接服务器超时，请检查网络或服务器状态'
                }
                resolve({ success: false, error: msg })
              }
            })

            // 连接超时事件
            req.on('timeout', () => {
              if (!settled) {
                settled = true
                clearTimeout(timer)
                req.destroy()
                resolve({ success: false, error: '连接服务器超时（10秒），请检查网络' })
              }
            })

            // 流式写入表单数据
            formData.pipe(req)
          }
        )

        if (result.success) {
          logger.info(`[SkillHub] 发布技能成功: ${data.name}`)
        }
        return result
      } catch (err) {
        logger.error('[SkillHub] 发布技能失败:', err)
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 评分
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_RATE,
    async (_e, id: number, rating: number): Promise<{ success: boolean; error?: string }> => {
      try {
        const resp = await fetch(`${SKILL_HUB_BASE_URL}/api/skills/${id}/rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating }),
          signal: AbortSignal.timeout(10000)
        })
        if (!resp.ok) throw new Error(`服务器返回 ${resp.status}`)
        return { success: true }
      } catch (err) {
        logger.error('[SkillHub] 评分失败:', err)
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 获取分类列表
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_CATEGORIES,
    async (): Promise<{ name: string; count: number }[] | { error: string }> => {
      try {
        const resp = await fetch(`${SKILL_HUB_BASE_URL}/api/categories`, {
          signal: AbortSignal.timeout(10000)
        })
        if (!resp.ok) throw new Error(`服务器返回 ${resp.status}`)
        const json = (await resp.json()) as HubCategoriesResponse
        return json.data
      } catch (err) {
        logger.error('[SkillHub] 获取分类失败:', err)
        return { error: (err as Error).message }
      }
    }
  )

  // 获取统计
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_STATS,
    async (): Promise<{ totalSkills: number; totalDownloads: number; totalUsers: number; totalRatings: number } | { error: string }> => {
      try {
        const resp = await fetch(`${SKILL_HUB_BASE_URL}/api/stats`, {
          signal: AbortSignal.timeout(10000)
        })
        if (!resp.ok) throw new Error(`服务器返回 ${resp.status}`)
        const json = (await resp.json()) as HubStatsResponse
        return json.data
      } catch (err) {
        logger.error('[SkillHub] 获取统计失败:', err)
        return { error: (err as Error).message }
      }
    }
  )

  // ============ 管理员接口 ============

  // 管理员 token（内存存储，应用重启后需重新登录）
  let adminToken: string | null = null

  /** 带认证的请求头 */
  function authHeaders(): Record<string, string> {
    return adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
  }

  // 管理员登录
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_ADMIN_LOGIN,
    async (
      _e,
      credentials: { username: string; password: string }
    ): Promise<{ success: true; username: string } | { error: string }> => {
      try {
        const resp = await fetch(`${SKILL_HUB_BASE_URL}/api/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
          signal: AbortSignal.timeout(15000)
        })
        const json = (await resp.json()) as {
          code: number
          message?: string
          data?: { token: string; admin: { username: string } }
        }
        if (json.code !== 0 || !json.data) {
          return { error: json.message || '登录失败' }
        }
        adminToken = json.data.token
        logger.info('[SkillHub] 管理员登录成功:', json.data.admin.username)
        return { success: true, username: json.data.admin.username }
      } catch (err) {
        logger.error('[SkillHub] 管理员登录失败:', err)
        return { error: (err as Error).message }
      }
    }
  )

  // 获取管理员信息
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_ADMIN_INFO,
    async (): Promise<{ username: string; created_at: string; last_login_at: string | null } | { error: string }> => {
      if (!adminToken) return { error: '未登录' }
      try {
        const resp = await fetch(`${SKILL_HUB_BASE_URL}/api/admin/info`, {
          headers: authHeaders(),
          signal: AbortSignal.timeout(10000)
        })
        if (resp.status === 401) {
          adminToken = null
          return { error: 'token 已过期，请重新登录' }
        }
        const json = (await resp.json()) as {
          code: number
          data: { username: string; created_at: string; last_login_at: string | null }
        }
        return json.data
      } catch (err) {
        logger.error('[SkillHub] 获取管理员信息失败:', err)
        return { error: (err as Error).message }
      }
    }
  )

  // 退出登录
  ipcMain.handle(IPC_CHANNELS.SKILL_HUB_ADMIN_LOGOUT, async (): Promise<{ success: true }> => {
    adminToken = null
    return { success: true }
  })

  // 管理员：获取技能列表
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_ADMIN_LIST,
    async (
      _e,
      params: { q?: string; page?: number; limit?: number }
    ): Promise<{ items: HubSkillListItem[]; total: number; totalPages: number } | { error: string }> => {
      if (!adminToken) return { error: '未登录' }
      try {
        const query = new URLSearchParams()
        if (params.q) query.set('q', params.q)
        if (params.page) query.set('page', String(params.page))
        if (params.limit) query.set('limit', String(params.limit))

        const resp = await fetch(`${SKILL_HUB_BASE_URL}/api/admin/skills?${query.toString()}`, {
          headers: authHeaders(),
          signal: AbortSignal.timeout(15000)
        })
        if (resp.status === 401) {
          adminToken = null
          return { error: 'token 已过期，请重新登录' }
        }
        if (!resp.ok) throw new Error(`服务器返回 ${resp.status}`)
        const json = (await resp.json()) as HubListResponse
        return {
          items: json.data.items,
          total: json.data.pagination.total,
          totalPages: json.data.pagination.totalPages
        }
      } catch (err) {
        logger.error('[SkillHub] 管理员获取列表失败:', err)
        return { error: (err as Error).message }
      }
    }
  )

  // 管理员：删除技能
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_ADMIN_DELETE,
    async (_e, id: string): Promise<{ success: true } | { error: string }> => {
      if (!adminToken) return { error: '未登录' }
      try {
        const resp = await fetch(`${SKILL_HUB_BASE_URL}/api/admin/skills/${id}`, {
          method: 'DELETE',
          headers: authHeaders(),
          signal: AbortSignal.timeout(10000)
        })
        if (resp.status === 401) {
          adminToken = null
          return { error: 'token 已过期，请重新登录' }
        }
        if (!resp.ok) {
          const errJson = (await resp.json()) as { message?: string }
          throw new Error(errJson.message || `服务器返回 ${resp.status}`)
        }
        return { success: true }
      } catch (err) {
        logger.error('[SkillHub] 管理员删除技能失败:', err)
        return { error: (err as Error).message }
      }
    }
  )

  // 管理员：编辑技能
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_ADMIN_UPDATE,
    async (
      _e,
      params: { id: string; data: Record<string, unknown> }
    ): Promise<HubSkillDetail | { error: string }> => {
      if (!adminToken) return { error: '未登录' }
      try {
        const resp = await fetch(`${SKILL_HUB_BASE_URL}/api/admin/skills/${params.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(params.data),
          signal: AbortSignal.timeout(10000)
        })
        if (resp.status === 401) {
          adminToken = null
          return { error: 'token 已过期，请重新登录' }
        }
        if (!resp.ok) {
          const errJson = (await resp.json()) as { message?: string }
          throw new Error(errJson.message || `服务器返回 ${resp.status}`)
        }
        const json = (await resp.json()) as { code: number; data: HubSkillDetail }
        return json.data
      } catch (err) {
        logger.error('[SkillHub] 管理员编辑技能失败:', err)
        return { error: (err as Error).message }
      }
    }
  )

  // 管理员：获取详细统计
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_ADMIN_STATS,
    async (): Promise<Record<string, unknown> | { error: string }> => {
      if (!adminToken) return { error: '未登录' }
      try {
        const resp = await fetch(`${SKILL_HUB_BASE_URL}/api/admin/stats`, {
          headers: authHeaders(),
          signal: AbortSignal.timeout(10000)
        })
        if (resp.status === 401) {
          adminToken = null
          return { error: 'token 已过期，请重新登录' }
        }
        if (!resp.ok) throw new Error(`服务器返回 ${resp.status}`)
        const json = (await resp.json()) as { code: number; data: Record<string, unknown> }
        return json.data
      } catch (err) {
        logger.error('[SkillHub] 管理员获取统计失败:', err)
        return { error: (err as Error).message }
      }
    }
  )

  // 管理员：修改密码
  ipcMain.handle(
    IPC_CHANNELS.SKILL_HUB_ADMIN_CHANGE_PASSWORD,
    async (
      _e,
      params: { oldPassword: string; newPassword: string }
    ): Promise<{ success: true } | { error: string }> => {
      if (!adminToken) return { error: '未登录' }
      try {
        const resp = await fetch(`${SKILL_HUB_BASE_URL}/api/admin/change-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(10000)
        })
        if (resp.status === 401) {
          adminToken = null
          return { error: 'token 已过期，请重新登录' }
        }
        if (!resp.ok) {
          const errJson = (await resp.json()) as { message?: string }
          throw new Error(errJson.message || `服务器返回 ${resp.status}`)
        }
        return { success: true }
      } catch (err) {
        logger.error('[SkillHub] 管理员修改密码失败:', err)
        return { error: (err as Error).message }
      }
    }
  )
}
