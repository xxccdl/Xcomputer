// 技能（Skill）相关 REST API 路由
// 提供技能的增删查改、文件上传、下载、评分、分类和统计接口

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { db, transaction } = require('../database');

const router = express.Router();

// ============ 文件上传配置 ============
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// 启动时确保 uploads 目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// multer 存储配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // 使用 时间戳 + 随机串 + 原始扩展名 避免文件名冲突
    const ext = path.extname(file.originalname);
    const safeName = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
    cb(null, safeName);
  }
});

// 文件大小限制 10MB，仅允许常见文件类型
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    // 允许的文件类型：脚本、压缩包、文档等
    const allowedExtensions = [
      '.js', '.ts', '.py', '.json', '.txt', '.md',
      '.zip', '.tar', '.gz', '.7z',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx'
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${ext}`), false);
    }
  }
});

// ============ 工具函数 ============

/**
 * 将数据库行转换为 API 响应对象（解析 tags JSON）
 */
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

// ============ 路由定义 ============

/**
 * GET /api/skills
 * 获取技能列表，支持搜索、分类过滤、排序和分页
 * 查询参数：
 *   - q: 搜索关键词（匹配 name / description / tags）
 *   - category: 分类过滤
 *   - sort: 排序方式（downloads | rating | newest）
 *   - page: 页码（默认 1）
 *   - limit: 每页数量（默认 12）
 */
router.get('/skills', (req, res) => {
  try {
    const { q, category, sort = 'newest' } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const offset = (page - 1) * limit;

    // 构造 WHERE 条件
    const conditions = [];
    const params = {};

    if (q) {
      conditions.push('(name LIKE @q OR description LIKE @q OR tags LIKE @q OR author LIKE @q)');
      params.q = `%${q}%`;
    }
    if (category) {
      conditions.push('category = @category');
      params.category = category;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 构造排序
    let orderClause = 'ORDER BY created_at DESC';
    if (sort === 'downloads') {
      orderClause = 'ORDER BY download_count DESC, created_at DESC';
    } else if (sort === 'rating') {
      // 评分排序：优先按平均评分（rating_sum/rating_count）降序
      orderClause = 'ORDER BY (CASE WHEN rating_count > 0 THEN rating_sum * 1.0 / rating_count ELSE 0 END) DESC, rating_count DESC, created_at DESC';
    }

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM skills ${whereClause}`;
    const countResult = db.prepare(countSql).get(params);
    const total = countResult.total;

    // 查询分页数据
    const listSql = `SELECT * FROM skills ${whereClause} ${orderClause} LIMIT @limit OFFSET @offset`;
    const rows = db.prepare(listSql).all({ ...params, limit, offset });

    const items = rows.map(formatSkill);

    res.json({
      code: 0,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (err) {
    console.error('[skills] 获取列表失败:', err);
    res.status(500).json({ code: 500, message: '获取技能列表失败', error: err.message });
  }
});

/**
 * GET /api/skills/:id
 * 获取技能详情
 */
router.get('/skills/:id', (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ code: 404, message: '技能不存在' });
    }
    res.json({ code: 0, data: formatSkill(row) });
  } catch (err) {
    console.error('[skills] 获取详情失败:', err);
    res.status(500).json({ code: 500, message: '获取技能详情失败', error: err.message });
  }
});

/**
 * POST /api/skills
 * 上传新技能（multipart/form-data）
 * 字段：name, description, author, category, tags, version, content, file
 */
router.post('/skills', upload.single('file'), (req, res) => {
  try {
    const { name, description, author, category, version, content } = req.body;
    const tags = req.body.tags || '[]';

    // 参数校验
    if (!name || !description || !author || !category) {
      // 清理已上传的文件（若校验失败）
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(400).json({
        code: 400,
        message: '缺少必填字段: name, description, author, category'
      });
    }

    // 解析 tags，支持 JSON 字符串或逗号分隔
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

    const id = uuidv4();
    const now = new Date().toISOString();

    // 文件信息
    const filePath = req.file ? req.file.path : null;
    const fileName = req.file ? req.file.originalname : null;
    const fileSize = req.file ? req.file.size : 0;

    const stmt = db.prepare(`
      INSERT INTO skills (
        id, name, description, author, category, tags, version,
        content, file_path, file_name, file_size,
        download_count, rating_sum, rating_count,
        created_at, updated_at
      ) VALUES (
        @id, @name, @description, @author, @category, @tags, @version,
        @content, @file_path, @file_name, @file_size,
        0, 0, 0,
        @created_at, @updated_at
      )
    `);

    stmt.run({
      id,
      name,
      description,
      author,
      category,
      tags: JSON.stringify(tagsArray),
      version: version || '1.0.0',
      content: content || '',
      file_path: filePath,
      file_name: fileName,
      file_size: fileSize,
      created_at: now,
      updated_at: now
    });

    const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
    res.status(201).json({ code: 0, message: '技能创建成功', data: formatSkill(row) });
  } catch (err) {
    console.error('[skills] 创建失败:', err);
    // 清理已上传的文件
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ code: 500, message: '创建技能失败', error: err.message });
  }
});

/**
 * GET /api/skills/:id/download
 * 下载技能文件，同时增加 download_count
 */
router.get('/skills/:id/download', (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ code: 404, message: '技能不存在' });
    }
    if (!row.file_path) {
      return res.status(404).json({ code: 404, message: '该技能未上传文件' });
    }
    if (!fs.existsSync(row.file_path)) {
      return res.status(404).json({ code: 404, message: '文件不存在或已被删除' });
    }

    // 增加下载计数
    db.prepare('UPDATE skills SET download_count = download_count + 1, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);

    // 触发文件下载
    const downloadName = row.file_name || path.basename(row.file_path);
    res.download(row.file_path, downloadName, (err) => {
      if (err) {
        console.error('[skills] 下载文件失败:', err);
      }
    });
  } catch (err) {
    console.error('[skills] 下载失败:', err);
    res.status(500).json({ code: 500, message: '下载失败', error: err.message });
  }
});

/**
 * POST /api/skills/:id/rate
 * 为技能评分
 * body: { rating: 1-5 }
 */
router.post('/skills/:id/rate', (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;

    // 校验评分值
    const ratingNum = parseInt(rating, 10);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ code: 400, message: '评分必须在 1-5 之间' });
    }

    // 检查技能是否存在
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
    if (!skill) {
      return res.status(404).json({ code: 404, message: '技能不存在' });
    }

    const now = new Date().toISOString();
    const ratingId = uuidv4();

    // 使用事务：插入评分记录 + 更新技能评分汇总
    const rate = transaction(() => {
      db.prepare(`
        INSERT INTO ratings (id, skill_id, rating, created_at)
        VALUES (@id, @skill_id, @rating, @created_at)
      `).run({ id: ratingId, skill_id: id, rating: ratingNum, created_at: now });

      db.prepare(`
        UPDATE skills
        SET rating_sum = rating_sum + @rating,
            rating_count = rating_count + 1,
            updated_at = @updated_at
        WHERE id = @id
      `).run({ rating: ratingNum, updated_at: now, id });
    });

    rate();

    const updated = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
    res.json({ code: 0, message: '评分成功', data: formatSkill(updated) });
  } catch (err) {
    console.error('[skills] 评分失败:', err);
    res.status(500).json({ code: 500, message: '评分失败', error: err.message });
  }
});

/**
 * GET /api/categories
 * 获取所有分类及其技能数量
 */
router.get('/categories', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM skills
      GROUP BY category
      ORDER BY count DESC
    `).all();

    res.json({ code: 0, data: rows });
  } catch (err) {
    console.error('[skills] 获取分类失败:', err);
    res.status(500).json({ code: 500, message: '获取分类失败', error: err.message });
  }
});

/**
 * GET /api/stats
 * 获取平台统计信息：总技能数、总下载量、总用户数（按作者去重）
 */
router.get('/stats', (req, res) => {
  try {
    const skillCount = db.prepare('SELECT COUNT(*) as count FROM skills').get().count;
    const totalDownloads = db.prepare('SELECT COALESCE(SUM(download_count), 0) as total FROM skills').get().total;
    const totalUsers = db.prepare('SELECT COUNT(DISTINCT author) as count FROM skills').get().count;
    const totalRatings = db.prepare('SELECT COUNT(*) as count FROM ratings').get().count;

    res.json({
      code: 0,
      data: {
        totalSkills: skillCount,
        totalDownloads,
        totalUsers,
        totalRatings
      }
    });
  } catch (err) {
    console.error('[skills] 获取统计失败:', err);
    res.status(500).json({ code: 500, message: '获取统计信息失败', error: err.message });
  }
});

module.exports = router;
