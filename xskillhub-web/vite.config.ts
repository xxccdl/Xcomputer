import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 配置：开发服务器端口 5174，代理 /api 到后端 3210
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3210',
        changeOrigin: true
      }
    }
  }
})
