import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Shield, LogOut, Search, Trash2, Edit3, Download, Star,
  TrendingUp, Package, Users, BarChart3, X, Save, AlertTriangle,
  Eye, EyeOff, KeyRound
} from 'lucide-react'
import {
  getAdminToken, adminLogout, getAdminInfo, adminGetSkills,
  adminDeleteSkill, adminUpdateSkill, getAdminStats, changeAdminPassword
} from '../api'
import type { AdminInfo, AdminStats, Skill, SkillListResponse } from '../types'

// 管理员控制台：技能管理 + 统计概览
function Admin() {
  const navigate = useNavigate()

  // 未登录则跳转登录页
  const token = getAdminToken()
  if (!token) {
    navigate('/login', { replace: true })
  }

  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [skillsData, setSkillsData] = useState<SkillListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')

  // 编辑/删除弹窗状态
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [deletingSkill, setDeletingSkill] = useState<Skill | null>(null)
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  // 加载数据
  const loadData = useCallback(async (targetPage = page, q = keyword) => {
    setLoading(true)
    setError('')
    try {
      const [info, statsData, skills] = await Promise.all([
        getAdminInfo(),
        getAdminStats(),
        adminGetSkills({ q: q || undefined, page: targetPage, limit: 10 })
      ])
      setAdminInfo(info)
      setStats(statsData)
      setSkillsData(skills)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败'
      // token 失效则跳转登录
      if (msg.includes('token') || msg.includes('未登录') || msg.includes('401')) {
        adminLogout()
        navigate('/login', { replace: true })
        return
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [page, keyword, navigate])

  useEffect(() => {
    loadData(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 搜索
  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    setPage(1)
    loadData(1, keyword)
  }

  // 翻页
  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    loadData(newPage, keyword)
  }

  // 退出登录
  const handleLogout = () => {
    adminLogout()
    navigate('/', { replace: true })
  }

  // 删除确认
  const handleDelete = async () => {
    if (!deletingSkill) return
    try {
      await adminDeleteSkill(deletingSkill.id)
      setDeletingSkill(null)
      loadData(page, keyword)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-bg">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-brand rounded-xl blur-md opacity-50" />
              <div className="relative w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold">管理控制台</h1>
              <p className="text-xs text-text-secondary">
                {adminInfo ? `欢迎，${adminInfo.username}` : '加载中...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              <KeyRound className="w-4 h-4" />
              <span className="hidden sm:inline">修改密码</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 mb-6 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard icon={Package} label="技能总数" value={stats.totalSkills} color="blue" />
            <StatCard icon={Download} label="总下载量" value={stats.totalDownloads} color="green" />
            <StatCard icon={Users} label="作者数" value={stats.totalUsers} color="purple" />
            <StatCard icon={Star} label="评分数" value={stats.totalRatings} color="orange" />
          </div>
        )}

        {/* Top 榜单 */}
        {stats && (stats.topDownloads.length > 0 || stats.topRated.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            {stats.topDownloads.length > 0 && (
              <div className="card-base p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-semibold">下载量 Top 5</h3>
                </div>
                <div className="space-y-2">
                  {stats.topDownloads.map((item, idx) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 truncate">
                        <span className="text-text-muted w-4">{idx + 1}</span>
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span className="text-text-secondary shrink-0 ml-2">{item.download_count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {stats.topRated.length > 0 && (
              <div className="card-base p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-4 h-4 text-orange-400" />
                  <h3 className="text-sm font-semibold">评分 Top 5</h3>
                </div>
                <div className="space-y-2">
                  {stats.topRated.map((item, idx) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 truncate">
                        <span className="text-text-muted w-4">{idx + 1}</span>
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span className="text-text-secondary shrink-0 ml-2">
                        {item.avg_rating.toFixed(1)} ({item.rating_count})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 技能管理表格 */}
        <div className="card-base overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-sm font-semibold">技能管理</h2>
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索技能..."
                className="input-base w-48 sm:w-64 pl-9 pr-3 py-1.5 text-sm"
              />
            </form>
          </div>

          {/* 表格 */}
          {loading ? (
            <div className="p-12 text-center text-text-muted text-sm">加载中...</div>
          ) : skillsData && skillsData.items.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-bg-hover/50">
                    <tr className="text-left text-text-secondary">
                      <th className="px-4 py-3 font-medium">名称</th>
                      <th className="px-4 py-3 font-medium">作者</th>
                      <th className="px-4 py-3 font-medium">分类</th>
                      <th className="px-4 py-3 font-medium text-center">下载</th>
                      <th className="px-4 py-3 font-medium text-center">评分</th>
                      <th className="px-4 py-3 font-medium">创建时间</th>
                      <th className="px-4 py-3 font-medium text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {skillsData.items.map((skill) => (
                      <tr key={skill.id} className="hover:bg-bg-hover/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium truncate max-w-[200px]">{skill.name}</div>
                          <div className="text-xs text-text-muted truncate max-w-[200px]">{skill.description}</div>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{skill.author}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs bg-bg-hover">{skill.category}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-text-secondary">{skill.download_count}</td>
                        <td className="px-4 py-3 text-center text-text-secondary">
                          {skill.rating_count > 0 ? skill.rating.toFixed(1) : '-'}
                        </td>
                        <td className="px-4 py-3 text-text-secondary text-xs">
                          {new Date(skill.created_at).toLocaleDateString('zh-CN')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setEditingSkill(skill)}
                              className="p-1.5 rounded text-text-secondary hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                              title="编辑"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingSkill(skill)}
                              className="p-1.5 rounded text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 分页 */}
              {skillsData.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-border">
                  <span className="text-xs text-text-muted">
                    共 {skillsData.pagination.total} 条，第 {page}/{skillsData.pagination.totalPages} 页
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page <= 1}
                      className="px-3 py-1.5 rounded text-sm border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-bg-hover transition-colors"
                    >
                      上一页
                    </button>
                    <button
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page >= skillsData.pagination.totalPages}
                      className="px-3 py-1.5 rounded text-sm border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-bg-hover transition-colors"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-12 text-center text-text-muted text-sm">暂无技能数据</div>
          )}
        </div>
      </div>

      {/* 编辑弹窗 */}
      {editingSkill && (
        <EditSkillModal
          skill={editingSkill}
          onClose={() => setEditingSkill(null)}
          onSuccess={() => {
            setEditingSkill(null)
            loadData(page, keyword)
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      {deletingSkill && (
        <DeleteConfirmModal
          skill={deletingSkill}
          onClose={() => setDeletingSkill(null)}
          onConfirm={handleDelete}
        />
      )}

      {/* 修改密码弹窗 */}
      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  )
}

// ============ 统计卡片子组件 ============
function StatCard({
  icon: Icon, label, value, color
}: {
  icon: typeof Package
  label: string
  value: number
  color: 'blue' | 'green' | 'purple' | 'orange'
}) {
  const colorMap = {
    blue: 'text-blue-400 bg-blue-500/10',
    green: 'text-green-400 bg-green-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    orange: 'text-orange-400 bg-orange-500/10'
  }
  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-secondary mb-1">{label}</p>
          <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

// ============ 编辑技能弹窗 ============
function EditSkillModal({
  skill, onClose, onSuccess
}: {
  skill: Skill
  onClose: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState(skill.name)
  const [description, setDescription] = useState(skill.description)
  const [category, setCategory] = useState(skill.category)
  const [tags, setTags] = useState(skill.tags.join(', '))
  const [version, setVersion] = useState(skill.version)
  const [content, setContent] = useState(skill.content)
  const [showContent, setShowContent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await adminUpdateSkill(skill.id, {
        name, description, category, tags, version, content
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card-base w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-bg-panel">
          <h3 className="font-semibold flex items-center gap-2">
            <Edit3 className="w-4 h-4" />
            编辑技能
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">名称</label>
              <input
                type="text" value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-base w-full px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">分类</label>
              <input
                type="text" value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input-base w-full px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input-base w-full px-3 py-2 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">标签（逗号分隔）</label>
              <input
                type="text" value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="input-base w-full px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">版本</label>
              <input
                type="text" value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="input-base w-full px-3 py-2"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-text-secondary">技能内容</label>
              <button
                onClick={() => setShowContent(!showContent)}
                className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1"
              >
                {showContent ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showContent ? '隐藏' : '展开'}
              </button>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={showContent ? 10 : 3}
              className="input-base w-full px-3 py-2 font-mono text-xs resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border sticky bottom-0 bg-bg-panel">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm border border-border hover:bg-bg-hover">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============ 删除确认弹窗 ============
function DeleteConfirmModal({
  skill, onClose, onConfirm
}: {
  skill: Skill
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card-base w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="font-semibold">确认删除</h3>
        </div>
        <p className="text-sm text-text-secondary mb-1">确定要删除以下技能吗？</p>
        <p className="text-sm font-medium mb-2">「{skill.name}」</p>
        <p className="text-xs text-text-muted mb-6">
          此操作不可撤销，关联的评分记录和上传文件将一并删除。
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm border border-border hover:bg-bg-hover">
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-md text-sm bg-red-500 hover:bg-red-600 text-white flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}

// ============ 修改密码弹窗 ============
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    setError('')
    if (!oldPwd || !newPwd || !confirmPwd) {
      setError('请填写所有字段')
      return
    }
    if (newPwd.length < 6) {
      setError('新密码长度至少 6 位')
      return
    }
    if (newPwd !== confirmPwd) {
      setError('两次输入的新密码不一致')
      return
    }

    setSaving(true)
    try {
      await changeAdminPassword(oldPwd, newPwd)
      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card-base w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            修改密码
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover">
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="py-4 text-center text-green-400 text-sm">密码修改成功！</div>
        ) : (
          <div className="space-y-3">
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
            <div>
              <label className="block text-sm text-text-secondary mb-1">旧密码</label>
              <input
                type="password" value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                className="input-base w-full px-3 py-2"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">新密码</label>
              <input
                type="password" value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="input-base w-full px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">确认新密码</label>
              <input
                type="password" value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className="input-base w-full px-3 py-2"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 rounded-md text-sm border border-border hover:bg-bg-hover">
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
              >
                {saving ? '保存中...' : '确认修改'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Admin
