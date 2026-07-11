import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Download,
  Star,
  User,
  Tag,
  Calendar,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import { getSkill, downloadSkill, rateSkill } from '../api'
import type { Skill } from '../types'

// 格式化下载量
function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (!bytes) return '-'
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

// 格式化日期
function formatDate(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

// 技能详情页
function SkillDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [skill, setSkill] = useState<Skill | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [ratingHover, setRatingHover] = useState(0)
  const [ratingStatus, setRatingStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  // 加载技能详情
  useEffect(() => {
    if (!id) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getSkill(id)
        if (!cancelled) setSkill(data)
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
  }, [id])

  // 触发下载
  const handleDownload = () => {
    if (!skill) return
    setDownloading(true)
    downloadSkill(skill.id)
    // 下载是浏览器跳转，延迟恢复按钮状态
    setTimeout(() => setDownloading(false), 1500)
  }

  // 评分
  const handleRate = async (rating: number) => {
    if (!skill || ratingStatus === 'submitting') return
    setRatingStatus('submitting')
    try {
      const updated = await rateSkill(skill.id, rating)
      setSkill(updated)
      setRatingStatus('success')
      setTimeout(() => setRatingStatus('idle'), 2000)
    } catch (e) {
      setRatingStatus('error')
      setTimeout(() => setRatingStatus('idle'), 2000)
    }
  }

  // 加载中
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <Loader2 className="w-8 h-8 text-accent-blue animate-spin mb-3" />
        <p className="text-sm text-text-secondary">加载技能详情...</p>
      </div>
    )
  }

  // 错误
  if (error || !skill) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-12 h-12 rounded-full bg-danger/15 flex items-center justify-center mb-3">
            <AlertCircle className="w-6 h-6 text-danger" />
          </div>
          <p className="text-sm text-danger mb-1">加载失败</p>
          <p className="text-xs text-text-muted mb-4">{error || '技能不存在'}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-md text-sm border border-border text-text-secondary hover:text-text-primary hover:border-accent-blue/50 transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  const currentRating = skill.rating_count > 0 ? skill.rating : 0

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      {/* 返回按钮 */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回
      </button>

      {/* ============ 头部信息 ============ */}
      <div className="glass-card p-6 sm:p-8 mb-6 animate-fade-in-up">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="flex-1 min-w-0">
            {/* 分类 + 版本 */}
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-accent-blue/15 text-accent-blue border-accent-blue/30">
                <Tag className="w-3 h-3 mr-1" />
                {skill.category}
              </span>
              <span className="text-xs text-text-muted font-mono">v{skill.version}</span>
            </div>
            {/* 名称 */}
            <h1 className="text-3xl sm:text-4xl font-bold text-text-primary mb-3">{skill.name}</h1>
            {/* 描述 */}
            <p className="text-base text-text-secondary leading-relaxed">{skill.description}</p>
          </div>
        </div>

        {/* 元信息 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-border-muted">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-text-muted shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-text-muted">作者</div>
              <div className="text-sm text-text-primary truncate">{skill.author}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-text-muted shrink-0" />
            <div>
              <div className="text-xs text-text-muted">下载量</div>
              <div className="text-sm text-text-primary">{formatCount(skill.download_count)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-text-muted shrink-0" />
            <div>
              <div className="text-xs text-text-muted">评分</div>
              <div className="text-sm text-text-primary">
                {currentRating > 0 ? `${currentRating.toFixed(1)} (${skill.rating_count})` : '暂无'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-text-muted shrink-0" />
            <div>
              <div className="text-xs text-text-muted">发布于</div>
              <div className="text-sm text-text-primary">{formatDate(skill.created_at)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ 操作区：下载 + 评分 ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* 下载按钮 */}
        <div className="glass-card p-6 lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent-blue" />
            文件信息
          </h2>
          {skill.file_name ? (
            <>
              <div className="flex items-center justify-between p-4 rounded-lg bg-bg-input border border-border mb-4">
                <div className="min-w-0">
                  <div className="text-sm text-text-primary font-mono truncate">{skill.file_name}</div>
                  <div className="text-xs text-text-muted mt-1">{formatSize(skill.file_size)}</div>
                </div>
                <FileText className="w-5 h-5 text-text-muted shrink-0" />
              </div>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="btn-gradient w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {downloading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    正在下载...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    下载技能
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="p-4 rounded-lg bg-bg-input border border-border text-center">
              <p className="text-sm text-text-muted">该技能未上传文件，可查看下方内容预览</p>
            </div>
          )}
        </div>

        {/* 评分组件 */}
        <div className="glass-card p-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-lg font-semibold text-text-primary mb-4">为它评分</h2>
          <div className="flex items-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleRate(star)}
                onMouseEnter={() => setRatingHover(star)}
                onMouseLeave={() => setRatingHover(0)}
                className="p-1 transition-transform hover:scale-110"
                disabled={ratingStatus === 'submitting'}
              >
                <Star
                  className={`w-7 h-7 transition-colors ${
                    (ratingHover || currentRating) >= star
                      ? 'text-warning fill-current'
                      : 'text-text-muted'
                  }`}
                />
              </button>
            ))}
          </div>
          <div className="text-xs text-text-secondary">
            {ratingStatus === 'submitting' && '提交中...'}
            {ratingStatus === 'success' && (
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="w-3.5 h-3.5" />
                评分成功，感谢你的反馈！
              </span>
            )}
            {ratingStatus === 'error' && <span className="text-danger">评分失败，请稍后重试</span>}
            {ratingStatus === 'idle' &&
              (currentRating > 0
                ? `当前 ${currentRating.toFixed(1)} 分 / ${skill.rating_count} 人评分`
                : '点击星星给出你的评分')}
          </div>
        </div>
      </div>

      {/* ============ 标签 ============ */}
      {skill.tags && skill.tags.length > 0 && (
        <div className="glass-card p-6 mb-6 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <h2 className="text-lg font-semibold text-text-primary mb-4">标签</h2>
          <div className="flex flex-wrap gap-2">
            {skill.tags.map((tag, i) => (
              <Link
                key={i}
                to={`/?q=${encodeURIComponent(tag)}`}
                className="px-3 py-1 rounded-md text-sm bg-bg-hover text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 transition-colors font-mono"
              >
                #{tag}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ============ 内容预览 ============ */}
      {skill.content && (
        <div className="glass-card p-6 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h2 className="text-lg font-semibold text-text-primary mb-4">内容预览</h2>
          <pre className="p-4 rounded-lg bg-bg-input border border-border overflow-x-auto text-sm font-mono text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
            {skill.content}
          </pre>
        </div>
      )}
    </div>
  )
}

export default SkillDetail
