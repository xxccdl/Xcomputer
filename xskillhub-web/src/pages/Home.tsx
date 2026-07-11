import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, Package, AlertCircle, Loader2 } from 'lucide-react'
import { getSkills, getStats } from '../api'
import type { Skill, SkillQueryParams, Stats } from '../types'
import SkillCard from '../components/SkillCard'

// 排序选项
const SORT_OPTIONS = [
  { value: 'newest', label: '最新' },
  { value: 'downloads', label: '最热' },
  { value: 'rating', label: '评分最高' }
] as const

// 首页：Hero + 搜索筛选 + 技能卡片网格 + 分页
function Home() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [skills, setSkills] = useState<Skill[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // 从 URL 读取查询参数
  const q = searchParams.get('q') || ''
  const category = searchParams.get('category') || ''
  const sort = (searchParams.get('sort') as SkillQueryParams['sort']) || 'newest'
  const page = parseInt(searchParams.get('page') || '1', 10)

  // 本地搜索框值（输入中尚未提交）
  const [searchInput, setSearchInput] = useState(q)
  const [localCategory, setLocalCategory] = useState(category)

  // 同步 URL 参数到本地状态
  useEffect(() => {
    setSearchInput(q)
    setLocalCategory(category)
  }, [q, category])

  // 加载技能列表
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const params: SkillQueryParams = { q, category, sort, page, limit: 12 }
        const data = await getSkills(params)
        if (!cancelled) {
          setSkills(data.items)
          setTotalPages(data.pagination.totalPages)
          setTotal(data.pagination.total)
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [q, category, sort, page])

  // 加载统计
  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => {
        // 统计加载失败不阻塞主流程
      })
  }, [])

  // 更新 URL 参数
  const updateParams = (updates: Record<string, string | number>) => {
    const next = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([k, v]) => {
      if (v === '' || v === 0) next.delete(k)
      else next.set(k, String(v))
    })
    setSearchParams(next)
  }

  // 搜索提交
  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    updateParams({ q: searchInput.trim(), page: 1 })
  }

  // 切换分类
  const handleCategoryChange = (value: string) => {
    setLocalCategory(value)
    updateParams({ category: value, page: 1 })
  }

  // 切换排序
  const handleSortChange = (value: string) => {
    updateParams({ sort: value, page: 1 })
  }

  // 翻页
  const handlePageChange = (newPage: number) => {
    updateParams({ page: newPage })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      {/* ============ Hero 区域 ============ */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute inset-0 bg-glow" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-bg-panel/60 backdrop-blur text-xs text-text-secondary mb-6">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Xcomputer 技能生态
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-4">
              <span className="gradient-text">XSkillHub</span>
            </h1>
            <p className="text-lg sm:text-xl text-text-secondary mb-8 max-w-2xl mx-auto">
              Xcomputer 技能市场 · 发现、分享和下载优质技能
            </p>

            {/* 统计数据 */}
            {stats && (
              <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12">
                <div className="animate-scale-in">
                  <div className="text-3xl font-bold gradient-text">{stats.totalSkills}</div>
                  <div className="text-sm text-text-muted mt-1">技能总数</div>
                </div>
                <div className="w-px h-12 bg-border" />
                <div className="animate-scale-in" style={{ animationDelay: '0.1s' }}>
                  <div className="text-3xl font-bold gradient-text">{stats.totalDownloads}</div>
                  <div className="text-sm text-text-muted mt-1">累计下载</div>
                </div>
                <div className="w-px h-12 bg-border" />
                <div className="animate-scale-in" style={{ animationDelay: '0.2s' }}>
                  <div className="text-3xl font-bold gradient-text">{stats.totalUsers}</div>
                  <div className="text-sm text-text-muted mt-1">活跃作者</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ============ 搜索 + 筛选 ============ */}
      <section className="sticky top-16 z-30 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* 搜索框 */}
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="搜索技能名称、描述、标签..."
                  className="input-base w-full pl-10 pr-4 py-2.5 text-sm"
                />
              </div>
            </form>

            {/* 分类筛选 */}
            <div className="relative">
              <select
                value={localCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="input-base appearance-none pl-10 pr-8 py-2.5 text-sm cursor-pointer w-full sm:w-44"
              >
                <option value="">全部分类</option>
                <option value="自动化">自动化</option>
                <option value="AI 助手">AI 助手</option>
                <option value="效率工具">效率工具</option>
                <option value="开发工具">开发工具</option>
                <option value="数据处理">数据处理</option>
                <option value="其他">其他</option>
              </select>
              <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            </div>

            {/* 排序 */}
            <div className="flex gap-1 p-1 rounded-lg bg-bg-input border border-border">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSortChange(opt.value)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    sort === opt.value
                      ? 'bg-gradient-brand text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ 技能列表 ============ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* 结果统计 */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-text-secondary">
            {loading ? '加载中...' : `共 ${total} 个技能`}
          </p>
        </div>

        {/* 加载状态 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-accent-blue animate-spin mb-3" />
            <p className="text-sm text-text-secondary">正在加载技能列表...</p>
          </div>
        )}

        {/* 错误状态 */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-12 h-12 rounded-full bg-danger/15 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6 text-danger" />
            </div>
            <p className="text-sm text-danger mb-1">加载失败</p>
            <p className="text-xs text-text-muted">{error}</p>
          </div>
        )}

        {/* 空状态 */}
        {!loading && !error && skills.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-bg-panel border border-border flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-text-muted" />
            </div>
            <p className="text-base font-medium text-text-primary mb-1">暂无技能</p>
            <p className="text-sm text-text-secondary">尝试调整搜索条件，或上传第一个技能</p>
          </div>
        )}

        {/* 卡片网格 */}
        {!loading && !error && skills.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {skills.map((skill, i) => (
              <SkillCard key={skill.id} skill={skill} index={i} />
            ))}
          </div>
        )}

        {/* 分页 */}
        {!loading && !error && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-12">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-2 rounded-md text-sm border border-border text-text-secondary hover:text-text-primary hover:border-accent-blue/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              上一页
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => Math.abs(p - page) <= 2 || p === 1 || p === totalPages)
                .map((p, idx, arr) => (
                  <span key={p} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="px-2 text-text-muted">...</span>
                    )}
                    <button
                      onClick={() => handlePageChange(p)}
                      className={`w-9 h-9 rounded-md text-sm font-medium transition-colors ${
                        p === page
                          ? 'bg-gradient-brand text-white'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                      }`}
                    >
                      {p}
                    </button>
                  </span>
                ))}
            </div>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-2 rounded-md text-sm border border-border text-text-secondary hover:text-text-primary hover:border-accent-blue/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              下一页
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

export default Home
