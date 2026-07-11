// 支付路由
// 提供套餐查询、订单创建、虎皮椒回调、余额查询等接口
// 付费积分按机器码绑定，支持 flash（1 积分/次）和 pro（4 积分/次）两种模型

const express = require('express');
const crypto = require('crypto');
const { db, transaction } = require('../database');
const xhpay = require('../xhpay');

const router = express.Router();

// ============ 套餐定义（硬编码，确保金额不被客户端篡改） ============
// 定价基准: ¥1.5 = 20 积分；flash 扣 1 积分/次，pro 扣 4 积分/次
// 所有套餐毛利率 > 80%（DeepSeek flash 成本 ≈ ¥0.005/次，pro ≈ ¥0.04/次）

const PLANS = [
  {
    id: 'trial',
    name: '体验包',
    priceFen: 300,
    credits: 30,
    bonus: 0,
    badge: '入门',
    popular: false
  },
  {
    id: 'standard',
    name: '标准包',
    priceFen: 1500,
    credits: 200,
    bonus: 20,
    badge: '推荐',
    popular: true
  },
  {
    id: 'pro',
    name: '畅享包',
    priceFen: 3000,
    credits: 480,
    bonus: 80,
    badge: '超值',
    popular: false
  },
  {
    id: 'mega',
    name: '巨惠包',
    priceFen: 6000,
    credits: 1000,
    bonus: 240,
    badge: '热门',
    popular: false
  },
  {
    id: 'ultimate',
    name: '至尊包',
    priceFen: 15000,
    credits: 2800,
    bonus: 800,
    badge: '豪礼',
    popular: false
  }
];

// 积分有效期（天）
const CREDITS_VALIDITY_DAYS = 365;
// 订单超时时间（分钟）
const ORDER_TIMEOUT_MINUTES = 30;
// 回调地址基础 URL（从环境变量读取，默认为源站 IP）
const NOTIFY_URL_BASE = process.env.XHPAY_NOTIFY_URL_BASE || 'http://175.27.141.172:3210';
// 支付完成后的跳转地址
const RETURN_URL_BASE = process.env.XHPAY_RETURN_URL_BASE || 'https://xxccdl.cn';

// ============ 工具函数 ============

/**
 * 校验机器码格式（UUID v4）
 */
function isValidMachineId(machineId) {
  if (!machineId || typeof machineId !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(machineId);
}

/**
 * 生成订单号: XC + yyyyMMddHHmmss + 6位随机数字
 */
function generateOrderNo() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts =
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());
  const rand = Math.floor(100000 + Math.random() * 900000).toString();
  return `XC${ts}${rand}`;
}

/**
 * 查询付费积分余额
 * @param {string} machineId
 * @returns {{balance: number, totalPurchased: number, totalConsumed: number, firstPurchaseAt: string|null, lastPurchaseAt: string|null, earliestExpiringAt: string|null}}
 */
function getPaidQuota(machineId) {
  const row = db.prepare('SELECT * FROM paid_quota WHERE machine_id = ?').get(machineId);
  if (!row) {
    return {
      balance: 0,
      totalPurchased: 0,
      totalConsumed: 0,
      firstPurchaseAt: null,
      lastPurchaseAt: null,
      earliestExpiringAt: null
    };
  }
  // 查询最早未过期的批次（用于 UI 提醒过期时间）
  const batch = db
    .prepare(
      `SELECT expires_at FROM credit_batches
       WHERE machine_id = ? AND credits_remaining > 0 AND expires_at > datetime('now')
       ORDER BY expires_at ASC LIMIT 1`
    )
    .get(machineId);
  return {
    balance: row.balance,
    totalPurchased: row.total_purchased,
    totalConsumed: row.total_consumed,
    firstPurchaseAt: row.first_purchase_at,
    lastPurchaseAt: row.last_purchase_at,
    earliestExpiringAt: batch ? batch.expires_at : null
  };
}

/**
 * 扣减付费积分（FIFO 按过期时间升序消耗，事务化）
 * @param {string} machineId
 * @param {number} credits - 本次扣减的积分数（1 或 4）
 * @param {string} model - 'flash' 或 'pro'
 * @returns {boolean} 是否扣减成功
 */
function consumePaidQuota(machineId, credits, model) {
  if (!isValidMachineId(machineId)) return false;

  const consumeTx = transaction(() => {
    // 查询可用批次（按过期时间升序，FIFO 消耗）
    const batches = db
      .prepare(
        `SELECT id, credits_remaining FROM credit_batches
         WHERE machine_id = ? AND credits_remaining > 0 AND expires_at > datetime('now')
         ORDER BY expires_at ASC`
      )
      .all(machineId);

    // 计算总可用积分
    const totalAvailable = batches.reduce((s, b) => s + b.credits_remaining, 0);
    if (totalAvailable < credits) {
      throw new Error(`付费积分不足（需要 ${credits}，可用 ${totalAvailable}）`);
    }

    // 逐批扣减
    let need = credits;
    for (const b of batches) {
      if (need <= 0) break;
      const deduct = Math.min(need, b.credits_remaining);
      const result = db
        .prepare(
          `UPDATE credit_batches SET credits_remaining = credits_remaining - ?
           WHERE id = ? AND credits_remaining >= ?`
        )
        .run(deduct, b.id, deduct);
      if (result.changes !== 1) {
        throw new Error(`批次 ${b.id} 扣减失败（并发冲突）`);
      }
      need -= deduct;
    }

    // 更新聚合余额表
    db.prepare(
      `UPDATE paid_quota SET balance = balance - ?, total_consumed = total_consumed + ?, updated_at = ?
       WHERE machine_id = ?`
    ).run(credits, credits, new Date().toISOString(), machineId);
  });

  try {
    consumeTx();
    return true;
  } catch (err) {
    console.error('[payment] consumePaidQuota 失败:', err.message);
    return false;
  }
}

/**
 * 清理过期批次和超时订单（定时任务调用）
 */
function cleanupExpired() {
  const now = new Date().toISOString();
  try {
    // 关闭超时未支付的订单
    const closed = db
      .prepare(`UPDATE orders SET status = 'closed', updated_at = ? WHERE status = 'pending' AND expires_at < ?`)
      .run(now, now);
    if (closed.changes > 0) {
      console.log(`[payment] 已关闭 ${closed.changes} 个超时订单`);
    }
  } catch (err) {
    console.error('[payment] cleanupExpired 失败:', err.message);
  }
}

// ============ 路由 ============

/**
 * GET /api/payment/plans
 * 返回套餐列表（公开接口）
 */
router.get('/api/payment/plans', (req, res) => {
  const plans = PLANS.map((p) => ({
    id: p.id,
    name: p.name,
    priceFen: p.priceFen,
    priceYuan: (p.priceFen / 100).toFixed(2),
    credits: p.credits,
    bonus: p.bonus,
    bonusPercent: p.bonus > 0 ? Math.round((p.bonus / (p.credits - p.bonus)) * 100) : 0,
    flashEquivalent: p.credits,      // flash 1 积分/次
    proEquivalent: Math.floor(p.credits / 4),  // pro 4 积分/次
    badge: p.badge,
    popular: p.popular
  }));
  res.json({ code: 0, data: { plans, validityDays: CREDITS_VALIDITY_DAYS } });
});

/**
 * POST /api/payment/orders
 * 创建订单（body: { machineId, planId }）
 */
router.post('/api/payment/orders', express.json({ limit: '256kb' }), async (req, res) => {
  const { machineId, planId } = req.body || {};

  // 1. 校验机器码
  if (!isValidMachineId(machineId)) {
    return res.status(400).json({ code: 400, message: 'machineId 格式非法（需要 UUID v4）' });
  }

  // 2. 校验套餐
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) {
    return res.status(400).json({ code: 400, message: `套餐 ${planId} 不存在` });
  }

  // 3. 生成订单号和过期时间
  const orderNo = generateOrderNo();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ORDER_TIMEOUT_MINUTES * 60 * 1000).toISOString();

  // 4. 调用虎皮椒创建订单
  const notifyUrl = `${NOTIFY_URL_BASE}/api/payment/notify`;
  const returnUrl = `${RETURN_URL_BASE}/api/payment/return?order=${orderNo}`;
  const payResult = await xhpay.createOrder({
    tradeNo: orderNo,
    totalFee: (plan.priceFen / 100).toFixed(2),
    title: `Xcomputer 积分套餐 - ${plan.name}`,
    notifyUrl,
    returnUrl
  });

  if (!payResult.ok || !payResult.payUrl) {
    console.error('[payment] 虎皮椒创建订单失败:', payResult.errmsg);
    return res.status(502).json({ code: 502, message: `支付服务暂不可用: ${payResult.errmsg || '未知错误'}` });
  }

  // 5. 写入订单表
  try {
    db.prepare(
      `INSERT INTO orders (id, machine_id, plan_id, plan_name, credits, amount_fen, status, pay_url, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
    ).run(
      orderNo,
      machineId,
      plan.id,
      plan.name,
      plan.credits,
      plan.priceFen,
      payResult.payUrl,
      expiresAt,
      now.toISOString(),
      now.toISOString()
    );
  } catch (err) {
    console.error('[payment] 写入订单失败:', err.message);
    return res.status(500).json({ code: 500, message: '订单创建失败' });
  }

  console.log(`[payment] 订单创建成功: ${orderNo} (${plan.name} ¥${(plan.priceFen / 100).toFixed(2)})`);

  res.json({
    code: 0,
    data: {
      orderNo,
      payUrl: payResult.payUrl,
      amountFen: plan.priceFen,
      credits: plan.credits,
      planName: plan.name,
      expiresAt
    }
  });
});

/**
 * GET /api/payment/orders/:id?machineId=xxx
 * 查询订单状态（校验 machineId 归属）
 */
router.get('/api/payment/orders/:id', (req, res) => {
  const { id } = req.params;
  const { machineId } = req.query;

  if (!isValidMachineId(machineId)) {
    return res.status(400).json({ code: 400, message: 'machineId 参数非法' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND machine_id = ?').get(id, machineId);
  if (!order) {
    return res.status(404).json({ code: 404, message: '订单不存在或无权访问' });
  }

  res.json({
    code: 0,
    data: {
      orderNo: order.id,
      status: order.status,
      payUrl: order.pay_url,
      credits: order.credits,
      amountFen: order.amount_fen,
      planName: order.plan_name,
      paidAt: order.paid_at,
      transactionId: order.transaction_id,
      expiresAt: order.expires_at
    }
  });
});

/**
 * POST /api/payment/notify
 * 虎皮椒异步回调（form-data）
 * 验签 → 幂等 → 金额校验 → 事务发放积分
 * 必须返回字符串 'success' 或 'fail'（非 JSON）
 */
router.post('/api/payment/notify', express.urlencoded({ extended: true, limit: '1mb' }), (req, res) => {
  const body = req.body || {};

  // 虎皮椒回调字段名兼容：trade_order_id（新版/当前文档）与 out_trade_no（旧版）
  // 同时打印 body keys 便于排查字段名差异
  console.log('[payment] 收到回调, body keys =', Object.keys(body).join(','));

  // 1. 验签
  if (!xhpay.verifyNotify(body, xhpay.XHPAY_APPID ? process.env.XHPAY_APPSECRET : '')) {
    console.error('[payment] 回调验签失败:', body.trade_order_id || body.out_trade_no);
    return res.type('text/plain').send('fail');
  }

  const orderNo = body.trade_order_id || body.out_trade_no;
  const tradeNo = body.transaction_id || body.open_order_id || body.trade_no || '';
  const totalFeeYuan = parseFloat(body.total_fee || '0');
  const totalFeeFen = Math.round(totalFeeYuan * 100);

  // 2. 查订单
  if (!orderNo || typeof orderNo !== 'string') {
    console.error('[payment] 回调缺少订单号字段, body =', JSON.stringify(body).slice(0, 500));
    return res.type('text/plain').send('fail');
  }
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderNo);
  if (!order) {
    console.error('[payment] 回调订单不存在:', orderNo);
    return res.type('text/plain').send('fail');
  }

  // 3. 幂等：已支付直接返回 success
  if (order.status === 'paid') {
    console.log(`[payment] 订单 ${orderNo} 已支付，回调幂等返回 success`);
    return res.type('text/plain').send('success');
  }

  // 4. 金额校验
  if (totalFeeFen !== order.amount_fen) {
    console.error(`[payment] 金额不匹配: 回调 ${totalFeeFen} 分 vs 订单 ${order.amount_fen} 分（订单 ${orderNo}）`);
    return res.type('text/plain').send('fail');
  }

  // 5. 事务：更新订单 + 发放积分
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CREDITS_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const grantTx = transaction(() => {
    // 用 WHERE status='pending' 防并发重复发放
    const result = db
      .prepare(
        `UPDATE orders SET status = 'paid', transaction_id = ?, paid_at = ?, notify_payload = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`
      )
      .run(tradeNo, now, JSON.stringify(body).slice(0, 4096), now, orderNo);

    if (result.changes !== 1) {
      throw new Error(`订单 ${orderNo} 状态更新失败（可能已被其他回调处理）`);
    }

    // 插入积分批次
    db.prepare(
      `INSERT INTO credit_batches (machine_id, order_id, credits_original, credits_remaining, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(order.machine_id, orderNo, order.credits, order.credits, expiresAt, now);

    // UPSERT 余额表
    const existing = db.prepare('SELECT machine_id FROM paid_quota WHERE machine_id = ?').get(order.machine_id);
    if (existing) {
      db.prepare(
        `UPDATE paid_quota SET balance = balance + ?, total_purchased = total_purchased + ?, last_purchase_at = ?, updated_at = ?
         WHERE machine_id = ?`
      ).run(order.credits, order.credits, now, now, order.machine_id);
    } else {
      db.prepare(
        `INSERT INTO paid_quota (machine_id, balance, total_purchased, total_consumed, first_purchase_at, last_purchase_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?, ?)`
      ).run(order.machine_id, order.credits, order.credits, now, now, now);
    }
  });

  try {
    grantTx();
    console.log(`[payment] 订单 ${orderNo} 支付成功，发放 ${order.credits} 积分给 ${order.machine_id}`);
    return res.type('text/plain').send('success');
  } catch (err) {
    console.error(`[payment] 发放积分失败 (${orderNo}):`, err.message);
    // 发放失败返回 fail，虎皮椒会重试
    return res.type('text/plain').send('fail');
  }
});

/**
 * GET /api/payment/return
 * 支付完成后的浏览器跳转页（简单 HTML，告知用户返回 Xcomputer）
 */
router.get('/api/payment/return', (req, res) => {
  const order = req.query.order || '';
  res.type('text/html').send(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>支付完成 - Xcomputer</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { text-align: center; padding: 48px 32px; background: #141414; border: 1px solid #2a2a2a; border-radius: 16px; max-width: 420px; }
          .icon { width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 50%; background: rgba(34, 197, 94, 0.15); display: flex; align-items: center; justify-content: center; font-size: 32px; }
          h1 { font-size: 22px; margin: 0 0 12px; font-weight: 600; }
          p { color: #a3a3a3; font-size: 14px; line-height: 1.6; margin: 0 0 8px; }
          .order { font-family: monospace; font-size: 12px; color: #525252; margin-top: 16px; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✓</div>
          <h1>支付完成</h1>
          <p>请返回 Xcomputer 应用查看积分到账情况</p>
          <p>如未自动到账，请稍候片刻，系统会自动刷新</p>
          <div class="order">订单号: ${order}</div>
        </div>
      </body>
    </html>
  `);
});

/**
 * GET /api/payment/quota/:machineId
 * 查询付费积分余额
 */
router.get('/api/payment/quota/:machineId', (req, res) => {
  const { machineId } = req.params;
  if (!isValidMachineId(machineId)) {
    return res.status(400).json({ code: 400, message: 'machineId 格式非法' });
  }
  const quota = getPaidQuota(machineId);
  res.json({ code: 0, data: quota });
});

// ============ 定时清理任务 ============

let cleanupTimer = null;
function startCleanupSchedule() {
  // 每 6 小时执行一次
  cleanupTimer = setInterval(() => {
    cleanupExpired();
  }, 6 * 60 * 60 * 1000);
  // 启动时立即执行一次
  cleanupExpired();
}

startCleanupSchedule();

module.exports = router;
module.exports.consumePaidQuota = consumePaidQuota;
module.exports.getPaidQuota = getPaidQuota;
module.exports.isValidMachineId = isValidMachineId;
