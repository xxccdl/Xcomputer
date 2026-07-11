import { Link } from 'react-router-dom'
import { Download, Star, User, Tag } from 'lucide-react'
import type { Skill } from '../types'

// 分类对应的颜色映射，让标签更有辨识度
const CATEGORY_COLORS: Record<string, string> = {
  '自动化': 'bg-accent-blue/15 text-accent-blue border-accent-blue/30',
  'AI 助手': 'bg-accent-purple/15 text-accent-purple border-accent-purple/30',
  '效率工具': 'bg-success/15 text-success border-success/30',
  '开发工具': 'bg-warning/15 text-warning border-warning/30',
  '数据处理': 'bg-danger/15 text-danger border-danger/30',
  '其他': 'bg-text-muted/15 text-text-secondary border-border'
}

// 获取分类对应的样式
function getCategoryClass(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['其他']
}

// 格式化下载量显示
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

interface SkillCardProps {
  skill: Skill
  index?: number
}

// 技能卡片：玻璃拟态 + hover 上浮发光
function SkillCard({ skill, index = 0 }: SkillCardProps) {
  const categoryClass = getCategoryClass(skill.category)

  return (
    <Link
      to={`/skills/${skill.id}`}
      className="glass-card block p-5 animate-fade-in-up"
      style={{ animationDelay: `${Math.min(index, 8) * 0.05}s`, opacity: 0 }}
    >
      {/* 顶部：分类标签 + 版本 */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${categoryClass}`}
        >
          <Tag className="w-3 h-3 mr-1" />
          {skill.category}
        </span>
        <span className="text-xs text-text-muted font-mono">v{skill.version}</span>
      </div>

      {/* 名称 */}
      <h3 className="text-lg font-semibold text-text-primary mb-2 line-clamp-1 group-hover:text-accent-blue transition-colors">
        {skill.name}
      </h3>

      {/* 描述 */}
      <p className="text-sm text-text-secondary mb-4 line-clamp-2 leading-relaxed min-h-[2.5rem]">
        {skill.description}
      </p>

      {/* 标签 */}
      {skill.tags && skill.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {skill.tags.slice(0, 3).map((tag, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 rounded text-xs bg-bg-hover text-text-muted font-mono"
            >
              #{tag}
            </span>
          ))}
          {skill.tags.length > 3 && (
            <span className="px-1.5 py-0.5 rounded text-xs text-text-muted">
              +{skill.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* 底部：作者 + 下载量 + 评分 */}
      <div className="flex items-center justify-between pt-3 border-t border-border-muted text-xs text-text-secondary">
        <span className="flex items-center gap-1 min-w-0">
          <User className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{skill.author}</span>
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />
            {formatCount(skill.download_count)}
          </span>
          <span className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-warning fill-current" />
            {skill.rating > 0 ? skill.rating.toFixed(1) : '-'}
          </span>
        </div>
      </div>

      {/* 文件大小（隐藏的额外信息，仅在卡片底部显示） */}
      {skill.file_size > 0 && (
        <div className="mt-2 text-xs text-text-muted font-mono">
          {skill.file_name} · {formatSize(skill.file_size)}
        </div>
      )}
    </Link>
  )
}

export default SkillCard
