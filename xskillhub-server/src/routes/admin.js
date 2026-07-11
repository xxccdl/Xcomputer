// 管理员路由
// 提供管理员登录、技能管理（删除/编辑）、管理员信息接口

const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { signToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ============ 工具函数（与 skills.js 一致） ============

function formatSkill(row) {
  if (!row) return null;
  let tags = [];
  try {
    tags = JSON.parse(row.tags || '[]');
  } catch (e) {
    tags = [];
  }
  return {
    ...row,
    tags,
    rating: row.rating_count > 0 ? (row.rating_sum / row.rating_count) : 0
  };
}

// ============ 认证接口 ============

/**
 * POST /api/admin/login
 * 管理员登录
 * body: { username, password }
 * 返回: { token, admin }
 */
router.post('/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    }

    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' });
    }

    // 验证密码
    const valid = bcrypt.compareSync(password, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' });
    }

    // 更新最后登录时间
    const now = new Date().toISOString();
    db.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?').run(now, admin.id);

    // 生成 JWT token
    const token = signToken({ id: admin.id, username: admin.username });

    res.json({
      code: 0,
      message: '登录成功',
      data: {
        token,
        admin: {
          id: admin.id,
          username: admin.username,
          lastLoginAt: now
        }
      }
    });
  } catch (err) {
    console.error('[admin] 登录失败:', err);
    res.status(500).json({ code: 500, message: '登录失败', error: err.message });
  }
});

/**
 * GET /api/admin/info
 * 获取当前登录管理员信息（需登录）
 */
router.get('/admin/info', requireAdmin, (req, res) => {
  try {
    const admin = db.prepare('SELECT id, username, created_at, last_login_at FROM admins WHERE id = ?').get(req.admin.id);
    if (!admin) {
      return res.status(404).json({ code: 404, message: '管理员不存在' });
    }
    res.json({ code: 0, data: admin });
  } catch (err) {
    console.error('[admin] 获取信息失败:', err);
    res.status(500).json({ code: 500, message: '获取管理员信息失败', error: err.message });
  }
});

/**
 * POST /api/admin/change-password
 * 修改密码（需登录）
 * body: { oldPassword, newPassword }
 */
router.post('/admin/change-password', requireAdmin, (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ code: 400, message: '旧密码和新密码不能为空' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ code: 400, message: '新密码长度至少 6 位' });
    }

    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
    if (!admin) {
      return res.status(404).json({ code: 404, message: '管理员不存在' });
    }

    const valid = bcrypt.compareSync(oldPassword, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ code: 401, message: '旧密码错误' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newHash, admin.id);

    res.json({ code: 0, message: '密码修改成功' });
  } catch (err) {
    console.error('[admin] 修改密码失败:', err);
    res.status(500).json({ code: 500, message: '修改密码失败', error: err.message });
  }
});

// ============ 技能管理接口（需管理员权限） ============

/**
 * GET /api/admin/skills
 * 获取全部技能列表（管理员视图，支持搜索和分页）
 */
router.get('/admin/skills', requireAdmin, (req, res) => {
  try {
    const { q } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = {};

    if (q) {
      conditions.push('(name LIKE @q OR description LIKE @q OR author LIKE @q)');
      params.q = `%${q}%`;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const total = db.prepare(`SELECT COUNT(*) as total FROM skills ${whereClause}`).get(params).total;
    const rows = db.prepare(`SELECT * FROM skills ${whereClause} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit, offset });

    res.json({
      code: 0,
      data: {
        items: rows.map(formatSkill),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (err) {
    console.error('[admin] 获取技能列表失败:', err);
    res.status(500).json({ code: 500, message: '获取技能列表失败', error: err.message });
  }
});

/**
 * DELETE /api/admin/skills/:id
 * 删除技能（同时删除关联的评分记录和上传的文件）
 */
router.delete('/admin/skills/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);

    if (!skill) {
      return res.status(404).json({ code: 404, message: '技能不存在' });
    }

    // 删除关联文件
    if (skill.file_path && fs.existsSync(skill.file_path)) {
      try {
        fs.unlinkSync(skill.file_path);
      } catch (e) {
        console.warn('[admin] 删除文件失败:', e.message);
      }
    }

    // 删除数据库记录（ratings 表有 ON DELETE CASCADE，会自动删除关联评分）
    db.prepare('DELETE FROM skills WHERE id = ?').run(id);

    res.json({ code: 0, message: '技能已删除' });
  } catch (err) {
    console.error('[admin] 删除技能失败:', err);
    res.status(500).json({ code: 500, message: '删除技能失败', error: err.message });
  }
});

/**
 * PUT /api/admin/skills/:id
 * 编辑技能信息
 * body: { name?, description?, category?, tags?, version?, content? }
 */
router.put('/admin/skills/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);

    if (!skill) {
      return res.status(404).json({ code: 404, message: '技能不存在' });
    }

    const { name, description, category, tags, version, content } = req.body;
    const updates = [];
    const params = { id };

    if (name !== undefined) { updates.push('name = @name'); params.name = name; }
    if (description !== undefined) { updates.push('description = @description'); params.description = description; }
    if (category !== undefined) { updates.push('category = @category'); params.category = category; }
    if (tags !== undefined) {
      let tagsArray = [];
      try {
        if (typeof tags === 'string' && tags.trim().startsWith('[')) {
          tagsArray = JSON.parse(tags);
        } else if (typeof tags === 'string') {
          tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
        } else if (Array.isArray(tags)) {
          tagsArray = tags;
        }
      } catch (e) {
        tagsArray = [];
      }
      updates.push('tags = @tags'); params.tags = JSON.stringify(tagsArray);
    }
    if (version !== undefined) { updates.push('version = @version'); params.version = version; }
    if (content !== undefined) { updates.push('content = @content'); params.content = content; }

    if (updates.length === 0) {
      return res.status(400).json({ code: 400, message: '没有需要更新的字段' });
    }

    updates.push('updated_at = @updated_at');
    params.updated_at = new Date().toISOString();

    db.prepare(`UPDATE skills SET ${updates.join(', ')} WHERE id = @id`).run(params);

    const updated = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
    res.json({ code: 0, message: '技能已更新', data: formatSkill(updated) });
  } catch (err) {
    console.error('[admin] 编辑技能失败:', err);
    res.status(500).json({ code: 500, message: '编辑技能失败', error: err.message });
  }
});

/**
 * GET /api/admin/stats
 * 管理员统计信息（包含详细数据）
 */
router.get('/admin/stats', requireAdmin, (req, res) => {
  try {
    const totalSkills = db.prepare('SELECT COUNT(*) as count FROM skills').get().count;
    const totalDownloads = db.prepare('SELECT COALESCE(SUM(download_count), 0) as total FROM skills').get().total;
    const totalUsers = db.prepare('SELECT COUNT(DISTINCT author) as count FROM skills').get().count;
    const totalRatings = db.prepare('SELECT COUNT(*) as count FROM ratings').get().count;

    // 最近 7 天每天的上传量
    const recentSkills = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM skills
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all();

    // 下载量前 5 的技能
    const topDownloads = db.prepare(`
      SELECT id, name, download_count
      FROM skills
      ORDER BY download_count DESC
      LIMIT 5
    `).all();

    // 评分最高的前 5 个技能
    const topRated = db.prepare(`
      SELECT id, name, rating_sum, rating_count,
        CASE WHEN rating_count > 0 THEN rating_sum * 1.0 / rating_count ELSE 0 END as avg_rating
      FROM skills
      ORDER BY avg_rating DESC, rating_count DESC
      LIMIT 5
    `).all();

    res.json({
      code: 0,
      data: {
        totalSkills,
        totalDownloads,
        totalUsers,
        totalRatings,
        recentSkills,
        topDownloads,
        topRated
      }
    });
  } catch (err) {
    console.error('[admin] 获取统计失败:', err);
    res.status(500).json({ code: 500, message: '获取统计失败', error: err.message });
  }
});

module.exports = router;
