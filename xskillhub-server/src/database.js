// 数据库初始化与连接管理
// 使用 Node.js 内置的 node:sqlite 模块（Node 22+ 可用）
// API 与 better-sqlite3 高度一致：prepare/all/get/run/exec 均支持

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');

// 数据库文件存放路径
const DB_PATH = path.join(__dirname, '..', 'data', 'xskillhub.db');

// 确保数据目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接（同步）
const db = new DatabaseSync(DB_PATH);
// 开启 WAL 模式以提升并发读性能
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/**
 * 事务包装函数
 * 模拟 better-sqlite3 的 db.transaction() API
 * @param {Function} fn - 事务体函数
 * @returns {Function} 可调用的事务函数
 */
function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

/**
 * 初始化数据库表结构
 */
function initDatabase() {
  // skills 表：技能主表
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      author TEXT NOT NULL,
      category TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      version TEXT NOT NULL DEFAULT '1.0.0',
      content TEXT,
      file_path TEXT,
      file_name TEXT,
      file_size INTEGER DEFAULT 0,
      download_count INTEGER DEFAULT 0,
      rating_sum INTEGER DEFAULT 0,
      rating_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // ratings 表：评分记录
  db.exec(`
    CREATE TABLE IF NOT EXISTS ratings (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      created_at TEXT NOT NULL,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );
  `);

  // admins 表：管理员账户
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );
  `);

  // ai_quota 表：限免模式每日调用额度（按 IP 计数）
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_quota (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      used_count INTEGER DEFAULT 0,
      daily_limit INTEGER DEFAULT 50,
      date TEXT NOT NULL,
      last_used_at TEXT,
      UNIQUE(ip, date)
    );
  `);

  // paid_quota 表：付费积分余额（按机器码聚合，用于快速查询）
  db.exec(`
    CREATE TABLE IF NOT EXISTS paid_quota (
      machine_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      total_purchased INTEGER NOT NULL DEFAULT 0,
      total_consumed INTEGER NOT NULL DEFAULT 0,
      first_purchase_at TEXT,
      last_purchase_at TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  // credit_batches 表：积分批次（支持 1 年有效期 + FIFO 消耗）
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      credits_original INTEGER NOT NULL,
      credits_remaining INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // orders 表：支付订单
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      credits INTEGER NOT NULL,
      amount_fen INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      pay_url TEXT,
      transaction_id TEXT,
      paid_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      notify_payload TEXT
    );
  `);

  // 创建索引以加速查询
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
    CREATE INDEX IF NOT EXISTS idx_skills_created_at ON skills(created_at);
    CREATE INDEX IF NOT EXISTS idx_skills_download_count ON skills(download_count);
    CREATE INDEX IF NOT EXISTS idx_ratings_skill_id ON ratings(skill_id);
    CREATE INDEX IF NOT EXISTS idx_ai_quota_lookup ON ai_quota(ip, date);
    CREATE INDEX IF NOT EXISTS idx_credit_batches_consume ON credit_batches(machine_id, expires_at, credits_remaining);
    CREATE INDEX IF NOT EXISTS idx_orders_machine ON orders(machine_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, expires_at);
  `);

  // 插入默认管理员账户（仅在 admins 表为空时）
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get();
  if (adminCount.count === 0) {
    seedAdmin();
  }

  // 插入示例数据（仅在 skills 表为空时）
  const count = db.prepare('SELECT COUNT(*) as count FROM skills').get();
  if (count.count === 0) {
    seedDatabase();
  }

  console.log('[database] 数据库初始化完成');
}

/**
 * 插入默认管理员账户
 * 默认账户：admin / gy09ss13（建议登录后修改密码）
 */
function seedAdmin() {
  const id = require('uuid').v4();
  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync('gy09ss13', 10);

  db.prepare(`
    INSERT INTO admins (id, username, password_hash, created_at)
    VALUES (@id, @username, @password_hash, @created_at)
  `).run({
    id,
    username: 'admin',
    password_hash: passwordHash,
    created_at: now
  });

  console.log('[database] 已创建默认管理员账户: admin / gy09ss13');
}

/**
 * 插入示例技能数据
 */
function seedDatabase() {
  const now = new Date().toISOString();
  const skills = [
    {
      id: 'skill-001',
      name: '网页截图专家',
      description: '一键截取网页全页截图，支持长截图、区域截图和定时截图，输出高清 PNG 或 PDF。',
      author: 'XSkillHub 官方',
      category: '自动化',
      tags: ['截图', '网页', '自动化', 'PNG', 'PDF'],
      version: '1.2.0',
      content: '// 网页截图专家\n// 使用 Puppeteer 实现网页全页截图\nconst puppeteer = require("puppeteer");\n\nasync function screenshot(url, outputPath) {\n  const browser = await puppeteer.launch();\n  const page = await browser.newPage();\n  await page.goto(url, { waitUntil: "networkidle2" });\n  await page.screenshot({ path: outputPath, fullPage: true });\n  await browser.close();\n}\n\nmodule.exports = { screenshot };',
      file_path: null,
      file_name: null,
      file_size: 0,
      download_count: 1280,
      rating_sum: 47,
      rating_count: 10
    },
    {
      id: 'skill-002',
      name: '文件整理助手',
      description: '按文件类型自动整理桌面文件，支持自定义规则、定时任务和撤销操作，让桌面永远保持整洁。',
      author: '效率工坊',
      category: '文件',
      tags: ['文件', '整理', '桌面', '自动化'],
      version: '2.0.1',
      content: '// 文件整理助手\n// 按扩展名自动归类文件到不同文件夹\nconst fs = require("fs");\nconst path = require("path");\n\nfunction organize(dir) {\n  const files = fs.readdirSync(dir);\n  const rules = {\n    图片: [".png", ".jpg", ".jpeg", ".gif"],\n    文档: [".doc", ".docx", ".pdf", ".txt"],\n    视频: [".mp4", ".avi", ".mov"]\n  };\n  files.forEach(file => {\n    const ext = path.extname(file).toLowerCase();\n    for (const [folder, exts] of Object.entries(rules)) {\n      if (exts.includes(ext)) {\n        const target = path.join(dir, folder);\n        if (!fs.existsSync(target)) fs.mkdirSync(target);\n        fs.renameSync(path.join(dir, file), path.join(target, file));\n      }\n    }\n  });\n}\n\nmodule.exports = { organize };',
      file_path: null,
      file_name: null,
      file_size: 0,
      download_count: 856,
      rating_sum: 38,
      rating_count: 9
    },
    {
      id: 'skill-003',
      name: 'Excel数据处理',
      description: '批量处理 Excel 数据，支持合并多个工作簿、数据清洗、公式计算和图表生成。',
      author: '数据分析师',
      category: '办公',
      tags: ['Excel', '数据处理', '办公', '批量'],
      version: '1.5.3',
      content: '// Excel 数据处理\n// 使用 exceljs 批量处理 Excel 文件\nconst ExcelJS = require("exceljs");\n\nasync function mergeWorkbooks(files, outputPath) {\n  const wb = new ExcelJS.Workbook();\n  for (const file of files) {\n    const src = new ExcelJS.Workbook();\n    await src.xlsx.readFile(file);\n    src.eachSheet(sheet => {\n      const newSheet = wb.addWorksheet(sheet.name);\n      sheet.eachRow(row => newSheet.addRow(row.values));\n    });\n  }\n  await wb.xlsx.writeFile(outputPath);\n}\n\nmodule.exports = { mergeWorkbooks };',
      file_path: null,
      file_name: null,
      file_size: 0,
      download_count: 2103,
      rating_sum: 56,
      rating_count: 12
    },
    {
      id: 'skill-004',
      name: '系统清理工具',
      description: '深度清理系统垃圾文件，包括临时文件、缓存、日志和回收站，释放磁盘空间。',
      author: '系统优化大师',
      category: '系统',
      tags: ['系统', '清理', '优化', '磁盘'],
      version: '3.1.0',
      content: '// 系统清理工具\n// 扫描并清理系统临时文件\nconst fs = require("fs");\nconst path = require("path");\nconst os = require("os");\n\nfunction cleanTemp() {\n  const tempDir = os.tmpdir();\n  let cleaned = 0;\n  const files = fs.readdirSync(tempDir);\n  files.forEach(file => {\n    try {\n      fs.unlinkSync(path.join(tempDir, file));\n      cleaned++;\n    } catch (e) {\n      // 跳过被占用的文件\n    }\n  });\n  return cleaned;\n}\n\nmodule.exports = { cleanTemp };',
      file_path: null,
      file_name: null,
      file_size: 0,
      download_count: 3450,
      rating_sum: 89,
      rating_count: 18
    },
    {
      id: 'skill-005',
      name: '邮件自动发送',
      description: '批量发送邮件，支持模板、附件、变量替换和定时发送，适用于通知和营销场景。',
      author: '通讯专家',
      category: '通讯',
      tags: ['邮件', '批量', '通知', '模板'],
      version: '1.0.5',
      content: '// 邮件自动发送\n// 使用 nodemailer 批量发送邮件\nconst nodemailer = require("nodemailer");\n\nasync function sendBatch(config, recipients, template) {\n  const transporter = nodemailer.createTransport(config);\n  for (const to of recipients) {\n    const html = template.replace(/\\{\\{name\\}\\}/g, to.name);\n    await transporter.sendMail({\n      from: config.auth.user,\n      to: to.email,\n      subject: "通知邮件",\n      html\n    });\n  }\n}\n\nmodule.exports = { sendBatch };',
      file_path: null,
      file_name: null,
      file_size: 0,
      download_count: 678,
      rating_sum: 25,
      rating_count: 7
    }
  ];

  const insertStmt = db.prepare(`
    INSERT INTO skills (
      id, name, description, author, category, tags, version,
      content, file_path, file_name, file_size,
      download_count, rating_sum, rating_count,
      created_at, updated_at
    ) VALUES (
      @id, @name, @description, @author, @category, @tags, @version,
      @content, @file_path, @file_name, @file_size,
      @download_count, @rating_sum, @rating_count,
      @created_at, @updated_at
    )
  `);

  // 使用事务批量插入
  const insertMany = transaction((items) => {
    for (const item of items) {
      insertStmt.run({
        ...item,
        tags: JSON.stringify(item.tags),
        created_at: now,
        updated_at: now
      });
    }
  });

  insertMany(skills);
  console.log(`[database] 已插入 ${skills.length} 条示例技能数据`);
}

module.exports = {
  db,
  transaction,
  initDatabase
};
