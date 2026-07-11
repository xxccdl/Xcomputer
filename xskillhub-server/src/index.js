// XSkillHub 后端服务入口
// 技能市场平台 - 为 Xcomputer 应用提供技能分享、下载和发布能力

// 加载 .env 环境变量（必须在其他模块 require 之前，确保 process.env 已填充）
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { initDatabase } = require('./database');
const skillsRouter = require('./routes/skills');
const healthRouter = require('./routes/health');
const adminRouter = require('./routes/admin');
const aiRouter = require('./routes/ai');
const paymentRouter = require('./routes/payment');
const { startRelayServer, serveMobilePage, serveXPhoneAIPage } = require('./remote-relay');

const app = express();
const PORT = process.env.PORT || 3210;

// 记录服务启动时间（用于健康检查）
app.set('startedAt', Date.now());

// ============ 中间件 ============

// CORS 跨域支持
app.use(cors());

// JSON body 解析（限制 1MB 防止过大请求）
// 注意：/v1/ 路径（AI 中继）跳过此限制，由 ai 路由内部用 2mb 限制单独处理
app.use((req, res, next) => {
  if (req.path.startsWith('/v1/')) {
    return next();
  }
  express.json({ limit: '1mb' })(req, res, next);
});

// URL-encoded body 解析
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 静态文件服务：访问 /uploads 下的上传文件
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// 静态文件服务：访问 /downloads 下的下载文件（如 APK 安装包）
const downloadsDir = path.join(__dirname, '..', 'public', 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}
app.use('/downloads', express.static(downloadsDir));

// 请求日志中间件
app.use((req, res, next) => {
  const time = new Date().toISOString();
  console.log(`[${time}] ${req.method} ${req.url}`);
  next();
});

// ============ 路由挂载 ============

app.use('/api', healthRouter);
app.use('/api', skillsRouter);
app.use('/api', adminRouter);
// AI 中继路由（含 /v1/chat/completions 和 /api/ai/quota，路由内部自行挂载路径）
app.use(aiRouter);
// 支付路由（含 /api/payment/plans、/orders、/notify、/quota、/return）
app.use(paymentRouter);

// 根路径：返回服务信息
app.get('/', (req, res) => {
  res.json({
    name: 'XSkillHub Server',
    version: '1.0.0',
    description: '技能市场平台后端服务',
    docs: '/api/health',
    endpoints: {
      health: 'GET /api/health',
      listSkills: 'GET /api/skills',
      getSkill: 'GET /api/skills/:id',
      createSkill: 'POST /api/skills',
      downloadSkill: 'GET /api/skills/:id/download',
      rateSkill: 'POST /api/skills/:id/rate',
      categories: 'GET /api/categories',
      stats: 'GET /api/stats'
    }
  });
});

// 移动端远程控制页面
app.get('/mobile', serveMobilePage);

// xphoneai App 下载/配对页面
app.get('/xphoneai', serveXPhoneAIPage);

// ============ 错误处理 ============

// 404 处理
app.use((req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在' });
});

// 全局错误处理
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);

  // multer 文件大小错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      code: 413,
      message: '文件大小超过限制（最大 10MB）'
    });
  }

  // multer 文件类型错误
  if (err.message && err.message.startsWith('不支持的文件类型')) {
    return res.status(400).json({
      code: 400,
      message: err.message
    });
  }

  res.status(500).json({
    code: 500,
    message: err.message || '服务器内部错误'
  });
});

// ============ 启动服务 ============

// 初始化数据库
initDatabase();

// 创建 HTTP 服务器（Express + WebSocket 共享同一端口）
const server = http.createServer(app);

// 启动 WebSocket 中继服务器（远程控制功能）
startRelayServer(server);

// 启动 HTTP 服务
server.listen(PORT, () => {
  console.log('========================================');
  console.log(`  XSkillHub Server 已启动`);
  console.log(`  地址: http://localhost:${PORT}`);
  console.log(`  健康检查: http://localhost:${PORT}/api/health`);
  console.log(`  远程控制: http://localhost:${PORT}/mobile`);
  console.log(`  xphoneai: http://localhost:${PORT}/xphoneai`);
  console.log(`  启动时间: ${new Date().toISOString()}`);
  console.log('========================================');
});

// 优雅退出：关闭数据库连接
process.on('SIGINT', () => {
  console.log('\n[xskillhub] 收到退出信号，正在关闭服务...');
  const { db } = require('./database');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[xskillhub] 收到终止信号，正在关闭服务...');
  const { db } = require('./database');
  db.close();
  process.exit(0);
});
