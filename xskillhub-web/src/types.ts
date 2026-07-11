// 技能市场相关的 TypeScript 类型定义

// 技能对象
export interface Skill {
  id: string
  name: string
  description: string
  author: string
  category: string
  tags: string[]
  version: string
  content: string
  file_path: string | null
  file_name: string | null
  file_size: number
  download_count: number
  rating_sum: number
  rating_count: number
  rating: number
  created_at: string
  updated_at: string
}

// 分页信息
export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

// 技能列表响应
export interface SkillListResponse {
  items: Skill[]
  pagination: Pagination
}

// 分类对象
export interface Category {
  category: string
  count: number
}

// 平台统计
export interface Stats {
  totalSkills: number
  totalDownloads: number
  totalUsers: number
  totalRatings: number
}

// 统一 API 响应包装
export interface ApiResponse<T> {
  code: number
  message?: string
  data: T
}

// 获取技能列表的查询参数
export interface SkillQueryParams {
  q?: string
  category?: string
  sort?: 'newest' | 'downloads' | 'rating'
  page?: number
  limit?: number
}

// 上传技能的表单数据字段
export interface UploadSkillFields {
  name: string
  description: string
  author: string
  category: string
  tags: string
  version: string
  content: string
}

// ============ 管理员相关类型 ============

// 管理员登录响应
export interface AdminLoginResult {
  token: string
  admin: {
    id: string
    username: string
    lastLoginAt: string
  }
}

// 管理员信息
export interface AdminInfo {
  id: string
  username: string
  created_at: string
  last_login_at: string | null
}

// 管理员统计信息
export interface AdminStats {
  totalSkills: number
  totalDownloads: number
  totalUsers: number
  totalRatings: number
  recentSkills: { date: string; count: number }[]
  topDownloads: { id: string; name: string; download_count: number }[]
  topRated: {
    id: string
    name: string
    rating_sum: number
    rating_count: number
    avg_rating: number
  }[]
}
