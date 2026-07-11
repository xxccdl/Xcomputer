// 管理员认证中间件
// 验证请求头中的 JWT token，通过后将管理员信息挂到 req.admin

const jwt = require('jsonwebtoken');

// JWT 密钥（优先使用环境变量，否则使用默认值）
const JWT_SECRET = process.env.JWT_SECRET || 'xskillhub-secret-key-2024-change-in-production';

// JWT 过期时间
const JWT_EXPIRES_IN = '24h';

/**
 * 生成管理员 JWT token
 * @param {Object} admin - 管理员信息 { id, username }
 * @returns {string} JWT token
 */
function signToken(admin) {
  return jwt.sign(
    { id: admin.id, username: admin.username, role: 'admin' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * 验证 JWT token 并提取管理员信息
 * @param {string} token
 * @returns {Object|null} 管理员信息或 null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Express 中间件：要求管理员登录
 * 从 Authorization: Bearer <token> 头部提取并验证 token
 */
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录或 token 缺失' });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ code: 401, message: 'token 无效或已过期' });
  }

  req.admin = payload;
  next();
}

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  signToken,
  verifyToken,
  requireAdmin
};
