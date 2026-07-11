import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import SkillDetail from './pages/SkillDetail'
import Upload from './pages/Upload'
import Categories from './pages/Categories'
import Login from './pages/Login'
import Admin from './pages/Admin'

// 应用根组件：定义路由表
// / → 首页（技能列表）
// /skills/:id → 技能详情
// /upload → 上传技能
// /categories → 分类浏览
// /login → 管理员登录
// /admin → 管理员控制台
function App() {
  return (
    <div className="min-h-screen bg-bg text-text-primary font-sans">
      <Navbar />
      <main className="pt-16">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/skills/:id" element={<SkillDetail />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
