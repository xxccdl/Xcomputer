---
name: "website-builder"
description: "网站搭建技能，全栈前端+Node后端开发。包含项目初始化、脚手架生成、UI组件开发、路由配置、状态管理、API接口开发。当用户需要搭建网站、创建新项目、开发页面时使用此技能。"
---

# 网站搭建技能

全栈网站开发技能，覆盖从项目初始化到部署上线的完整流程。技术栈：**Vite + React + Node.js + Express**。

## 项目初始化

### 脚手架创建

```bash
# 前端项目
npm create vite@latest . -- --template react-ts

# 安装依赖
npm install react-router-dom zustand tailwindcss @tailwindcss/vite
npm install -D @types/react @types/react-dom

# 后端项目（在 server/ 目录）
mkdir server && cd server
npm init -y
npm install express cors ws
npm install -D typescript @types/node @types/express @types/cors tsx
```

### 目录结构

```
project/
├── src/                    # 前端源码
│   ├── components/         # 公共组件
│   ├── pages/              # 页面组件
│   ├── hooks/              # 自定义 Hooks
│   ├── store/              # 状态管理
│   ├── services/           # API 请求
│   ├── types/              # TypeScript 类型
│   ├── utils/              # 工具函数
│   ├── App.tsx             # 根组件
│   ├── main.tsx            # 入口文件
│   └── index.css           # 全局样式
├── server/                 # Node 后端
│   ├── src/
│   │   ├── routes/         # 路由
│   │   ├── controllers/    # 控制器
│   │   ├── models/         # 数据模型
│   │   ├── middleware/     # 中间件
│   │   ├── services/       # 业务逻辑
│   │   └── index.ts        # 入口
│   ├── tsconfig.json
│   └── package.json
├── public/                 # 静态资源
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## 前端开发

### 路由配置（react-router-dom v7）

```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import About from './pages/About'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

### 状态管理（Zustand）

```tsx
// src/store/counter.ts
import { create } from 'zustand'

interface CounterState {
  count: number
  increment: () => void
  decrement: () => void
  reset: () => void
}

export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  decrement: () => set((s) => ({ count: s.count - 1 })),
  reset: () => set({ count: 0 }),
}))
```

### 异步请求 + 状态管理（推荐模式）

```tsx
// src/store/users.ts
import { create } from 'zustand'

interface User {
  id: string
  name: string
  email: string
}

interface UserState {
  users: User[]
  loading: boolean
  error: string | null
  fetchUsers: () => Promise<void>
}

export const useUserStore = create<UserState>((set) => ({
  users: [],
  loading: false,
  error: null,
  fetchUsers: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch('/api/users')
      const users = await res.json()
      set({ users, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },
}))
```

### 组件开发规范

```tsx
// src/components/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors'
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
    ghost: 'text-gray-600 hover:bg-gray-100',
  }
  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  }

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}
```

### 自定义 Hook

```tsx
// src/hooks/useDebounce.ts
import { useState, useEffect } from 'react'

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
```

### API 请求封装

```tsx
// src/services/api.ts
const BASE_URL = '/api'

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) throw new Error(`API Error: ${res.status}`)
  return res.json()
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, data: unknown) => request<T>(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(endpoint: string, data: unknown) => request<T>(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
}
```

## 后端开发

### Express 基础框架

```ts
// server/src/index.ts
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(cors())
app.use(express.json())

// RESTful 路由
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

// WebSocket 连接
wss.on('connection', (ws) => {
  console.log('Client connected')
  ws.on('message', (data) => {
    ws.send(`Echo: ${data}`)
  })
  ws.on('close', () => console.log('Client disconnected'))
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
```

### 路由模块化

```ts
// server/src/routes/users.ts
import { Router } from 'express'

const router = Router()

// GET /api/users
router.get('/', async (req, res) => {
  // 查询用户列表
  res.json({ users: [] })
})

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params
  // 查询单个用户
  res.json({ id, name: 'User' })
})

// POST /api/users
router.post('/', async (req, res) => {
  const body = req.body
  // 创建用户
  res.status(201).json({ id: Date.now().toString(), ...body })
})

export default router

// 在主入口注册：
// app.use('/api/users', userRoutes)
```

## 构建与部署

### Vite 配置

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
```

### 生产构建

```bash
# 前端构建
npm run build

# 后端启动
cd server && npx tsx src/index.ts

# 或使用 PM2 部署
npm install -g pm2
pm2 start server/src/index.ts --interpreter tsx
```

## 错误处理规范

### 前端错误边界

```tsx
// src/components/ErrorBoundary.tsx
import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8">
          <h2 className="text-lg font-semibold">出错了</h2>
          <p className="mt-2 text-sm text-gray-500">{this.state.error?.message}</p>
          <button
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

### 后端全局错误处理

```ts
// server/src/middleware/errorHandler.ts
import type { Request, Response, NextFunction } from 'express'

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[Error]', err)
  res.status(500).json({
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  })
}
```

## 常用项目模板

### 拖拽排序页面

```tsx
import { useState } from 'react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableItem({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="rounded-lg border bg-white p-4 shadow-sm"
    >
      {id}
    </div>
  )
}

export default function SortableList() {
  const [items, setItems] = useState(['Item A', 'Item B', 'Item C'])
  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={(e) => {
      const { active, over } = e
      if (over && active.id !== over.id) {
        setItems((prev) => {
          const oldIdx = prev.indexOf(active.id as string)
          const newIdx = prev.indexOf(over.id as string)
          const next = [...prev]
          next.splice(oldIdx, 1)
          next.splice(newIdx, 0, active.id as string)
          return next
        })
      }
    }}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">{items.map((id) => <SortableItem key={id} id={id} />)}</div>
      </SortableContext>
    </DndContext>
  )
}
```

### 无限滚动列表

```tsx
import { useEffect, useState, useRef, useCallback } from 'react'

export function useInfiniteScroll(fetchMore: () => Promise<void>, hasMore: boolean) {
  const observer = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (observer.current) observer.current.disconnect()
    if (!node) return
    observer.current = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore) void fetchMore()
    })
    observer.current.observe(node)
  }, [fetchMore, hasMore])

  return sentinelRef
}
```