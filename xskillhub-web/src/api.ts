import axios, { AxiosProgressEvent } from 'axios'
import type {
  ApiResponse,
  Category,
  Skill,
  SkillListResponse,
  SkillQueryParams,
  Stats,
  AdminLoginResult,
  AdminInfo,
  AdminStats
} from './types'

// Axios 实例：基础路径 /api，超时 30s
const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 响应拦截器：统一解包 { code, data } 结构
http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown>
    // 后端统一返回 { code, data } 结构，code === 0 表示成功
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject(new Error(body.message || `请求失败，code=${body.code}`))
    }
    return response
  },
  (error) => {
    // 网络或 HTTP 错误
    const message = error?.response?.data?.message || error.message || '网络异常'
    return Promise.reject(new Error(message))
  }
)

// ============ API 调用方法 ============

/**
 * 获取技能列表
 * @param params 查询参数（搜索、分类、排序、分页）
 */
export async function getSkills(params: SkillQueryParams = {}): Promise<SkillListResponse> {
  const res = await http.get<ApiResponse<SkillListResponse>>('/skills', { params })
  return res.data.data
}

/**
 * 获取技能详情
 * @param id 技能 ID
 */
export async function getSkill(id: string): Promise<Skill> {
  const res = await http.get<ApiResponse<Skill>>(`/skills/${id}`)
  return res.data.data
}

/**
 * 上传新技能
 * @param formData 包含字段和文件的 FormData
 * @param onProgress 上传进度回调
 */
export async function uploadSkill(
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<Skill> {
  const res = await http.post<ApiResponse<Skill>>('/skills', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e: AxiosProgressEvent) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total))
      }
    }
  })
  return res.data.data
}

/**
 * 下载技能文件：直接触发浏览器下载
 * @param id 技能 ID
 */
export function downloadSkill(id: string): void {
  // 使用浏览器原生跳转触发文件下载
  window.open(`/api/skills/${id}/download`, '_blank')
}

/**
 * 为技能评分
 * @param id 技能 ID
 * @param rating 评分 1-5
 */
export async function rateSkill(id: string, rating: number): Promise<Skill> {
  const res = await http.post<ApiResponse<Skill>>(`/skills/${id}/rate`, { rating })
  return res.data.data
}

/**
 * 获取所有分类及其技能数量
 */
export async function getCategories(): Promise<Category[]> {
  const res = await http.get<ApiResponse<Category[]>>('/categories')
  return res.data.data
}

/**
 * 获取平台统计信息
 */
export async function getStats(): Promise<Stats> {
  const res = await http.get<ApiResponse<Stats>>('/stats')
  return res.data.data
}

// ============ 管理员 API ============

// token 存储键
const ADMIN_TOKEN_KEY = 'xskillhub_admin_token'

/** 获取本地存储的管理员 token */
export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY)
}

/** 保存管理员 token */
export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token)
}

/** 清除管理员 token（退出登录） */
export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
}

/** 带管理员 token 的请求配置 */
function withAuth() {
  const token = getAdminToken()
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {}
}

/**
 * 管理员登录
 */
export async function adminLogin(username: string, password: string): Promise<AdminLoginResult> {
  const res = await http.post<ApiResponse<AdminLoginResult>>('/admin/login', { username, password })
  const data = res.data.data
  setAdminToken(data.token)
  return data
}

/** 退出登录 */
export function adminLogout(): void {
  clearAdminToken()
}

/**
 * 获取当前管理员信息
 */
export async function getAdminInfo(): Promise<AdminInfo> {
  const res = await http.get<ApiResponse<AdminInfo>>('/admin/info', withAuth())
  return res.data.data
}

/**
 * 修改管理员密码
 */
export async function changeAdminPassword(oldPassword: string, newPassword: string): Promise<void> {
  await http.post('/admin/change-password', { oldPassword, newPassword }, withAuth())
}

/**
 * 管理员：获取技能列表
 */
export async function adminGetSkills(
  params: { q?: string; page?: number; limit?: number } = {}
): Promise<SkillListResponse> {
  const res = await http.get<ApiResponse<SkillListResponse>>('/admin/skills', { params, ...withAuth() })
  return res.data.data
}

/**
 * 管理员：删除技能
 */
export async function adminDeleteSkill(id: string): Promise<void> {
  await http.delete(`/admin/skills/${id}`, withAuth())
}

/**
 * 管理员：编辑技能
 */
export async function adminUpdateSkill(
  id: string,
  data: Partial<{
    name: string
    description: string
    category: string
    tags: string | string[]
    version: string
    content: string
  }>
): Promise<Skill> {
  const res = await http.put<ApiResponse<Skill>>(`/admin/skills/${id}`, data, withAuth())
  return res.data.data
}

/**
 * 管理员：获取详细统计
 */
export async function getAdminStats(): Promise<AdminStats> {
  const res = await http.get<ApiResponse<AdminStats>>('/admin/stats', withAuth())
  return res.data.data
}
