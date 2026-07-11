import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Search, Upload, Home, Layers, Sparkles, Shield } from 'lucide-react'
import { getAdminToken, adminLogout } from '../api'

// 固定顶部导航栏：Logo + 搜索框 + 导航链接
function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [keyword, setKeyword] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(!!getAdminToken())

  // 搜索：回车跳转到 /?q=xxx
  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = keyword.trim()
    navigate(q ? `/?q=${encodeURIComponent(q)}` : '/')
  }

  // 判断当前链接是否激活
  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  const handleAdminClick = () => {
    if (isLoggedIn) {
      navigate('/admin')
    } else {
      navigate('/login')
    }
  }

  const handleLogout = () => {
    adminLogout()
    setIsLoggedIn(false)
    navigate('/')
  }

  const navItems = [
    { to: '/', label: '首页', icon: Home },
    { to: '/categories', label: '分类', icon: Layers },
    { to: '/upload', label: '上传', icon: Upload }
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-bg-panel/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0 group">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-brand rounded-lg blur-md opacity-50 group-hover:opacity-80 transition-opacity" />
            <div className="relative w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
          </div>
          <span className="text-lg font-bold tracking-tight">
            <span className="gradient-text">XSkillHub</span>
          </span>
        </Link>

        {/* 搜索框 */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索技能、作者、标签..."
              className="input-base w-full pl-10 pr-4 py-2 text-sm"
            />
          </div>
        </form>

        {/* 导航链接 */}
        <nav className="flex items-center gap-1 shrink-0">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive(to)
                  ? 'text-text-primary bg-bg-hover'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}

          {/* 管理员入口 */}
          {isLoggedIn ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleAdminClick}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/admin') || isActive('/login')
                    ? 'text-text-primary bg-bg-hover'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">管理</span>
              </button>
              <button
                onClick={handleLogout}
                className="px-2 py-2 rounded-md text-sm text-text-muted hover:text-red-400 transition-colors"
                title="退出登录"
              >
                退出
              </button>
            </div>
          ) : (
            <button
              onClick={handleAdminClick}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">管理</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}

export default Navbar
