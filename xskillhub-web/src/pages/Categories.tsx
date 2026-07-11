import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import { getCategories, getStats } from '../api'
import type { Category, Stats } from '../types'

// 分类对应的渐变色（用于卡片背景装饰）
const CATEGORY_GRADIENTS: Record<string, string> = {
  '自动化': 'from-accent-blue/20 to-accent-blue/5',
  'AI 助手': 'from-accent-purple/20 to-accent-purple/5',
  '效率工具': 'from-success/20 to-success/5',
  '开发工具': 'from-warning/20 to-warning/5',
  '数据处理': 'from-danger/20 to-danger/5',
  '其他': 'from-text-muted/20 to-text-muted/5'
}

function getGradient(category: string): string {
  return CATEGORY_GRADIENTS[category] || CATEGORY_GRADIENTS['其他']
}

// 分类浏览页
function Categories() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [cats, s] = await Promise.all([getCategories(), getStats()])
        if (!cancelled) {
          setCategories(cats)
          setStats(s)
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
  }, [])

  // 点击分类跳转
  const handleCategoryClick = (category: string) => {
    navigate(`/?category=${encodeURIComponent(category)}`)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* 标题 */}
      <div className="mb-8 animate-fade-in-up">
        <h1 className="text-3xl font-bold text-text-primary mb-2 flex items-center gap-2">
          <Layers className="w-7 h-7 text-accent-blue" />
          技能分类
        </h1>
        <p className="text-sm text-text-secondary">按分类浏览所有技能</p>
      </div>

      {/* 统计概览 */}
      {stats && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 animate-fade-in-up">
          <div className="glass-card p-4">
            <div className="text-2xl font-bold gradient-text">{stats.totalSkills}</div>
            <div className="text-xs text-text-muted mt-1">技能总数</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-2xl font-bold gradient-text">{stats.totalDownloads}</div>
            <div className="text-xs text-text-muted mt-1">累计下载</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-2xl font-bold gradient-text">{stats.totalUsers}</div>
            <div className="text-xs text-text-muted mt-1">活跃作者</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-2xl font-bold gradient-text">{stats.totalRatings}</div>
            <div className="text-xs text-text-muted mt-1">评分总数</div>
          </div>
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-accent-blue animate-spin mb-3" />
          <p className="text-sm text-text-secondary">加载分类列表...</p>
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
      {!loading && !error && categories.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-bg-panel border border-border flex items-center justify-center mb-4">
            <Layers className="w-8 h-8 text-text-muted" />
          </div>
          <p className="text-base font-medium text-text-primary mb-1">暂无分类</p>
          <p className="text-sm text-text-secondary">上传第一个技能来创建分类</p>
        </div>
      )}

      {/* 分类网格 */}
      {!loading && !error && categories.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map((cat, i) => (
            <button
              key={cat.category}
              onClick={() => handleCategoryClick(cat.category)}
              className="glass-card relative overflow-hidden p-6 text-left animate-fade-in-up group"
              style={{ animationDelay: `${Math.min(i, 8) * 0.05}s`, opacity: 0 }}
            >
              {/* 背景渐变装饰 */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${getGradient(
                  cat.category
                )} opacity-50 group-hover:opacity-100 transition-opacity`}
              />
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-bg-panel/80 backdrop-blur border border-border flex items-center justify-center">
                    <Layers className="w-6 h-6 text-accent-blue" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-text-muted group-hover:text-accent-blue group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="text-xl font-semibold text-text-primary mb-1">{cat.category}</h3>
                <p className="text-sm text-text-secondary">
                  {cat.count} 个技能
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default Categories
