// 虎皮椒支付工具模块
// 提供签名生成、验签、订单创建、订单查询等纯函数
// 文档: https://www.xunhupay.com/doc/api/pay.html
// 签名规则: 参数字典序排序 → key1=value1&key2=value2 → 末尾拼 APPSECRET → MD5 小写
// 空值不参与签名；验签时剔除 hash 字段

const crypto = require('crypto');

// ============ 配置（从环境变量读取，APPSECRET 仅后端持有，绝不下发客户端） ============

const XHPAY_APPID = process.env.XHPAY_APPID || '';
const XHPAY_APPSECRET = process.env.XHPAY_APPSECRET || '';
const XHPAY_GATEWAY = process.env.XHPAY_GATEWAY || 'https://api.xunhupay.com/payment/do.html';
const XHPAY_QUERY_URL = process.env.XHPAY_QUERY_URL || 'https://api.xunhupay.com/payment/query.html';

// ============ 签名核心 ============

/**
 * 生成虎皮椒签名
 * @param {Object} params - 待签名参数对象
 * @param {string} appSecret - 应用密钥（APPSECRET）
 * @returns {string} MD5 小写签名
 */
function sign(params, appSecret) {
  // 1. 过滤空值和 hash 字段
  const filtered = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue;
    if (k === 'hash') continue;
    filtered[k] = String(v);
  }

  // 2. 按 key 字典序排序
  const sortedKeys = Object.keys(filtered).sort();

  // 3. 拼接 key1=value1&key2=value2
  const stringA = sortedKeys.map((k) => `${k}=${filtered[k]}`).join('&');

  // 4. 末尾拼 APPSECRET（无连接符）
  const stringSignTemp = stringA + appSecret;

  // 5. MD5 小写
  return crypto.createHash('md5').update(stringSignTemp, 'utf8').digest('hex');
}

/**
 * 验证虎皮椒回调签名（防时序攻击）
 * @param {Object} params - 回调收到的全部参数（含 hash）
 * @param {string} appSecret - 应用密钥
 * @returns {boolean} 签名是否合法
 */
function verifyNotify(params, appSecret) {
  const receivedHash = params.hash;
  if (!receivedHash || typeof receivedHash !== 'string') return false;

  const expectedHash = sign(params, appSecret);

  // 用 timingSafeEqual 防时序攻击
  const a = Buffer.from(receivedHash, 'utf8');
  const b = Buffer.from(expectedHash, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ============ 订单创建 ============

/**
 * 生成随机字符串（nonce_str），用于防缓存和安全
 * @returns {string} 32 位随机字符串
 */
function generateNonceStr() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 创建虎皮椒支付订单，返回支付 URL
 * 文档: https://www.xunhupay.com/doc/api/pay.html
 * 传参方式: POST JSON
 * 必填参数: version, appid, trade_order_id, total_fee, title, time, notify_url, nonce_str, hash
 * @param {Object} opts
 * @param {string} opts.tradeNo - 商户订单号（trade_order_id）
 * @param {string} opts.totalFee - 金额（元，字符串，如 "15.00"）
 * @param {string} opts.title - 商品标题
 * @param {string} opts.notifyUrl - 异步回调地址
 * @param {string} [opts.returnUrl] - 同步跳转地址（可选）
 * @returns {Promise<{ok: boolean, payUrl?: string, errmsg?: string}>}
 */
async function createOrder(opts) {
  const params = {
    version: '1.1',
    appid: XHPAY_APPID,
    trade_order_id: opts.tradeNo,
    total_fee: opts.totalFee,
    title: opts.title,
    time: Math.floor(Date.now() / 1000).toString(),
    notify_url: opts.notifyUrl,
    nonce_str: generateNonceStr()
  };
  if (opts.returnUrl) params.return_url = opts.returnUrl;

  params.hash = sign(params, XHPAY_APPSECRET);

  try {
    const resp = await fetch(XHPAY_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000)
    });
    const data = await resp.json();

    // 虎皮椒返回: { openid, url, url_qrcode, errcode, errmsg, hash }
    if (data.errcode === 0 && (data.url || data.url_qrcode)) {
      // 手机端用 url，PC 端用 url_qrcode；优先 url（手机 H5 支付）
      return { ok: true, payUrl: data.url || data.url_qrcode };
    }
    console.error('[xhpay] createOrder failed:', data.errmsg, data);
    return { ok: false, errmsg: data.errmsg || '虎皮椒返回错误' };
  } catch (err) {
    console.error('[xhpay] createOrder error:', err.message);
    return { ok: false, errmsg: err.message };
  }
}

// ============ 订单查询 ============

/**
 * 查询虎皮椒订单状态
 * @param {string} tradeNo - 商户订单号
 * @returns {Promise<{ok: boolean, status?: string, transactionId?: string, errmsg?: string}>}
 * status: 'OD'(支付成功) / 'WP'(待支付) / 'CD'(已取消)
 */
async function queryOrder(tradeNo) {
  const params = {
    version: '1.1',
    appid: XHPAY_APPID,
    trade_order_id: tradeNo,
    time: Math.floor(Date.now() / 1000).toString(),
    nonce_str: generateNonceStr()
  };
  params.hash = sign(params, XHPAY_APPSECRET);

  try {
    const resp = await fetch(XHPAY_QUERY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000)
    });
    const data = await resp.json();

    // 虎皮椒返回: { errcode, data: { status, open_order_id, ... }, errmsg, hash }
    if (data.errcode === 0 && data.data) {
      return {
        ok: true,
        status: data.data.status,  // 'OD' / 'WP' / 'CD'
        transactionId: data.data.open_order_id || data.data.transaction_id
      };
    }
    return { ok: false, errmsg: data.errmsg || '查询失败' };
  } catch (err) {
    console.error('[xhpay] queryOrder error:', err.message);
    return { ok: false, errmsg: err.message };
  }
}

module.exports = {
  XHPAY_APPID,
  sign,
  verifyNotify,
  createOrder,
  queryOrder
};
