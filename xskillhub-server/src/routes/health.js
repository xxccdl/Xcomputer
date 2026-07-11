// 健康检查路由
// 提供服务存活探针，便于运维监控

const express = require('express');
const os = require('os');

const router = express.Router();

/**
 * GET /api/health
 * 健康检查接口，返回服务状态、运行时间和系统信息
 */
router.get('/health', (req, res) => {
  const startedAt = req.app.get('startedAt');
  const uptime = startedAt ? (Date.now() - startedAt) / 1000 : 0;

  res.json({
    code: 0,
    data: {
      status: 'ok',
      service: 'xskillhub-server',
      version: '1.0.0',
      uptime: Math.floor(uptime),
      timestamp: new Date().toISOString(),
      hostname: os.hostname(),
      platform: process.platform,
      nodeVersion: process.version
    }
  });
});

module.exports = router;
