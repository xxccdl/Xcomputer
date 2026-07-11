// AI 中继路由
// 提供 OpenAI 协议兼容的 /v1/chat/completions 端点，转发请求到 DeepSeek
// 用于 xcomputer 客户端的"限免模式"：用户未填 API Key 时通过本服务中继调用

const express = require('express');
const { db } = require('../database');
const { consumePaidQuota, getPaidQuota, isValidMachineId } = require('./payment');
const { queueManager, MAX_CONCURRENT, SKIP_QUEUE_CREDITS } = require('./queue-manager');

const router = express.Router();

// ============ 配置 ============

// DeepSeek API Key（部署时通过环境变量注入）
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

// 限免额度配置
const DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT || '50', 10);

// 限免模式默认模型（老客户端不带 model 字段时使用）
const RELAY_MODEL = 'deepseek-v4-flash';

// 付费中继支持的模型白名单（不再强制 flash，付费用户可选 pro）
const FLASH_MODELS = ['deepseek-v4-flash'];
const PRO_MODELS = ['deepseek-v4-pro'];
const ALLOWED_MODELS = [...FLASH_MODELS, ...PRO_MODELS];

// 积分扣减规则：flash 1 积分/次，pro 4 积分/次
const FLASH_CREDIT = 1;
const PRO_CREDIT = 4;

// 超长保护：messages 总字符数超过此值拒绝（约 500k tokens）
const MAX_MESSAGES_CHARS = 2_000_000;

// ============ 工具函数 ============

/**
 * 获取客户端真实 IP（考虑反向代理场景）
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * 识别模型层级（flash / pro / null）
 * flash: 限免或付费，1 积分/次
 * pro: 仅付费，4 积分/次
 */
function getModelTier(model) {
  if (FLASH_MODELS.includes(model)) return 'flash';
  if (PRO_MODELS.includes(model)) return 'pro';
  return null;
}

/**
 * 从请求头读取机器码（付费积分归属标识）
 * 老客户端不带此 header，返回 null（走纯 IP 限免）
 */
function getMachineId(req) {
  const mid = req.headers['x-machine-id'];
  if (typeof mid === 'string' && isValidMachineId(mid)) return mid;
  return null;
}

/**
 * 从请求头读取 OpenX 内核加速标志
 * 启用时单次调用消耗 3 倍积分
 */
function getOpenXFlag(req) {
  return req.headers['x-openx'] === '1';
}

/**
 * 获取今日日期字符串 'YYYY-MM-DD'（本地时区，避免 UTC 跨日问题）
 */
function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 查询/创建当日额度记录，返回 { used, limit, remaining }
 */
function getQuota(ip) {
  const date = getToday();
  let row = db.prepare(
    'SELECT * FROM ai_quota WHERE ip = ? AND date = ?'
  ).get(ip, date);

  if (!row) {
    // 首次使用，创建记录
    db.prepare(
      'INSERT INTO ai_quota (ip, used_count, daily_limit, date, last_used_at) VALUES (?, 0, ?, ?, NULL)'
    ).run(ip, DAILY_LIMIT, date);
    row = { used_count: 0, daily_limit: DAILY_LIMIT };
  }

  return {
    used: row.used_count,
    limit: row.daily_limit,
    remaining: Math.max(0, row.daily_limit - row.used_count)
  };
}

/**
 * 增加一次用量计数
 */
function incrementUsage(ip) {
  const date = getToday();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE ai_quota SET used_count = used_count + 1, last_used_at = ?
     WHERE ip = ? AND date = ?`
  ).run(now, ip, date);
}

/**
 * 估算 messages 总字符数（粗略，用于超长保护）
 */
function estimateMessagesChars(messages) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part === 'string') total += part.length;
        else if (part && typeof part.text === 'string') total += part.text.length;
      }
    }
    // tool_calls 等结构也计入
    if (msg.tool_calls) {
      try { total += JSON.stringify(msg.tool_calls).length; } catch { /* ignore */ }
    }
  }
  return total;
}

/**
 * 发送 OpenAI 格式的错误响应（让客户端 SDK 能正确解析）
 */
function sendOpenAIError(res, status, message, type = 'api_error') {
  return res.status(status).json({
    error: { message, type }
  });
}

// ============ 限流中间件 ============

/**
 * 额度校验中间件
 * - flash 模型：优先扣免费 50 次/天（按 IP），超额扣 1 付费积分/次（按 machineId）
 * - pro 模型：必须扣 4 付费积分/次（无免费额度）
 * - 老客户端（无 X-Machine-Id）：仅支持 flash，走纯 IP 限免
 */
function checkQuota(req, res, next) {
  const ip = getClientIp(req);
  const machineId = getMachineId(req);
  const model = req.body?.model || RELAY_MODEL;
  const tier = getModelTier(model);
  const openX = getOpenXFlag(req);
  const multiplier = openX ? 3 : 1;

  // 不支持的模型
  if (!tier) {
    return sendOpenAIError(
      res,
      400,
      `不支持的模型: ${model}（限免/付费中继仅支持 deepseek-v4-flash 或 deepseek-v4-pro）`,
      'invalid_request_error'
    );
  }

  // flash 分支：优先扣免费额度，超额扣付费积分
  if (tier === 'flash') {
    // OpenX 开启时跳过免费额度，直接扣 3 倍付费积分
    if (!openX) {
      const quota = getQuota(ip);
      if (quota.remaining > 0) {
        req.clientIp = ip;
        req.quota = quota;
        req.quotaSource = 'free';
        req.credits = 0;
        req.machineId = machineId;
        return next();
      }
    }
    // 扣付费积分（OpenX 时 3 倍）
    const credits = FLASH_CREDIT * multiplier;
    if (machineId) {
      const paidQuota = getPaidQuota(machineId);
      if (paidQuota.balance >= credits) {
        req.clientIp = ip;
        req.quota = getQuota(ip);
        req.quotaSource = 'paid';
        req.credits = credits;
        req.machineId = machineId;
        return next();
      }
    }
    return sendOpenAIError(
      res,
      openX ? 402 : 429,
      openX
        ? `OpenX 内核加速需消耗付费积分（${credits} 积分/次），当前余额不足，请购买积分`
        : `今日限免额度已用完且无付费积分，请购买积分或在设置中填写自己的 API Key 解除限制。`,
      openX ? 'payment_required' : 'quota_exceeded'
    );
  }

  // pro 分支：必须扣付费积分（无免费额度），OpenX 时 3 倍
  if (tier === 'pro') {
    const credits = PRO_CREDIT * multiplier;
    if (!machineId) {
      return sendOpenAIError(
        res,
        402,
        `pro 模型需消耗付费积分（${credits} 积分/次${openX ? '，OpenX 已启用' : ''}），请购买积分后使用`,
        'payment_required'
      );
    }
    const paidQuota = getPaidQuota(machineId);
    if (paidQuota.balance < credits) {
      return sendOpenAIError(
        res,
        402,
        `付费积分不足（需要 ${credits}，当前 ${paidQuota.balance}），请购买积分`,
        'payment_required'
      );
    }
    req.clientIp = ip;
    req.quota = { used: 0, limit: 0, remaining: 0 };
    req.quotaSource = 'paid';
    req.credits = credits;
    req.machineId = machineId;
    return next();
  }
}

// ============ 路由：OpenAI 兼容的中继端点 ============

/**
 * POST /v1/chat/completions
 * OpenAI 协议兼容端点，转发请求到 DeepSeek（限免模式）
 *
 * 关键行为：
 * - 强制 model = deepseek-v4-flash（忽略客户端传入的 model）
 * - 按 IP 限流（每日 DAILY_LIMIT 次）
 * - 流式（stream:true）逐 chunk 透传 SSE
 * - 非流式直接返回 JSON
 * - 超长请求拒绝（防止滥用）
 */
router.post('/v1/chat/completions', express.json({ limit: '2mb' }), checkQuota, async (req, res) => {
  // 0. 检查后端是否配置了 DeepSeek Key
  if (!DEEPSEEK_API_KEY) {
    console.error('[ai] 后端未配置 DEEPSEEK_API_KEY 环境变量');
    return sendOpenAIError(res, 503, '限免服务暂未配置，请联系管理员', 'service_unavailable');
  }

  const body = req.body || {};

  // 1. 校验 messages
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return sendOpenAIError(res, 400, 'messages 字段必须是非空数组', 'invalid_request_error');
  }

  // 2. 超长保护
  const chars = estimateMessagesChars(body.messages);
  if (chars > MAX_MESSAGES_CHARS) {
    return sendOpenAIError(
      res,
      413,
      `请求内容过长（约 ${Math.round(chars / 1000)}k 字符），限免模式最大上下文 500k tokens。请开启新会话或填写自己的 API Key。`,
      'request_too_large'
    );
  }

  // 3. 校验模型白名单（不再强制 flash，付费用户可传 pro）
  if (!ALLOWED_MODELS.includes(body.model)) {
    return sendOpenAIError(
      res,
      400,
      `不支持的模型: ${body.model}（限免/付费中继仅支持 deepseek-v4-flash 或 deepseek-v4-pro）`,
      'invalid_request_error'
    );
  }

  // 3.5 排队控制：当并发请求数超过 MAX_CONCURRENT 时让新请求排队
  // 客户端轮询重试时通过 X-Queue-Id header 复用排队位置
  // 已花费积分跳过排队的请求通过 X-Queue-Priority: 1 优先放行
  const existingQueueId = req.headers['x-queue-id'] || null;
  const isPriority = req.headers['x-queue-priority'] === '1';
  const slot = queueManager.tryAcquire(req.machineId, existingQueueId, isPriority);
  if (!slot.acquired) {
    // 排队中：返回 429 + 排队信息，客户端应显示排队 UI 并轮询重试
    return res.status(429).json({
      error: {
        message: `服务器繁忙，已进入排队（第 ${slot.position} 位，预计等待 ${Math.ceil(slot.estimatedWaitMs / 1000)} 秒）。可花费 ${SKIP_QUEUE_CREDITS} 积分跳过排队。`,
        type: 'queue_pending',
        code: 'queue_pending',
        queue: {
          position: slot.position,
          estimatedWaitMs: slot.estimatedWaitMs,
          queueId: slot.queueId,
          skipQueueCredits: SKIP_QUEUE_CREDITS,
          maxConcurrent: MAX_CONCURRENT
        }
      }
    });
  }

  // 4. 构造转发请求体（保留客户端传入的 model，checkQuota 已校验过）
  const upstreamBody = {
    ...body,
    stream: body.stream !== false  // 默认流式
  };

  // 4.1 注册释放槽位：无论请求成功/失败/中断，连接关闭时都释放排队槽位
  //     避免因异常导致 inflight 永不归零、队列卡死
  let slotReleased = false;
  const releaseSlot = () => {
    if (slotReleased) return;
    slotReleased = true;
    queueManager.release();
  };
  res.on('close', releaseSlot);

  // 4. 转发到 DeepSeek
  let upstreamResp;
  try {
    upstreamResp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(upstreamBody)
    });
  } catch (err) {
    console.error('[ai] 调用 DeepSeek 失败:', err.message);
    return sendOpenAIError(res, 502, `上游服务连接失败: ${err.message}`, 'upstream_error');
  }

  // 5. 上游返回错误：透传错误响应（保持状态码和 body，让 SDK 能解析）
  if (!upstreamResp.ok) {
    const errText = await upstreamResp.text();
    console.error(`[ai] DeepSeek 返回错误 ${upstreamResp.status}:`, errText.slice(0, 500));
    res.status(upstreamResp.status);
    try {
      res.json(JSON.parse(errText));
    } catch {
      res.type('text/plain').send(errText);
    }
    return;
  }

  // 6. 流式响应：逐 chunk 透传 SSE
  if (upstreamBody.stream) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');  // 禁用 nginx 缓冲，确保实时推送

    let charged = false;
    const safeCharge = () => {
      if (charged) return;
      charged = true;
      try {
        if (req.quotaSource === 'free') {
          // 免费额度：按 IP 计数
          incrementUsage(req.clientIp);
        } else if (req.quotaSource === 'paid' && req.machineId) {
          // 付费积分：按 machineId 扣减（flash 1 积分，pro 4 积分）
          const ok = consumePaidQuota(req.machineId, req.credits, req.body?.model || RELAY_MODEL);
          if (!ok) {
            console.error(`[ai] 付费积分扣减失败: machineId=${req.machineId} credits=${req.credits}`);
          }
        }
      } catch (e) {
        console.error('[ai] 扣减额度失败:', e.message);
      }
    };

    // 收到首个 chunk 即计入用量（避免空响应也计数）
    let firstChunk = true;

    try {
      const reader = upstreamResp.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);

        if (firstChunk) {
          firstChunk = false;
          safeCharge();
        }
      }

      res.end();
    } catch (err) {
      console.error('[ai] 流式透传失败:', err.message);
      try {
        res.write(`data: {"error":{"message":"流式传输中断","type":"stream_error"}}\n\n`);
        res.end();
      } catch {
        // 连接已断开，忽略
      }
      return;
    }

    // 兜底：若已收到 chunk 但 safeCharge 未触发（理论上不会发生）
    if (!firstChunk) safeCharge();
    return;
  }

  // 7. 非流式响应：直接返回 JSON
  const jsonText = await upstreamResp.text();
  try {
    const jsonObj = JSON.parse(jsonText);
    // 按 quotaSource 扣减额度
    try {
      if (req.quotaSource === 'free') {
        incrementUsage(req.clientIp);
      } else if (req.quotaSource === 'paid' && req.machineId) {
        const ok = consumePaidQuota(req.machineId, req.credits, req.body?.model || RELAY_MODEL);
        if (!ok) console.error(`[ai] 付费积分扣减失败: machineId=${req.machineId} credits=${req.credits}`);
      }
    } catch (e) { console.error('[ai] 扣减额度失败:', e.message); }
    res.json(jsonObj);
  } catch {
    // JSON 解析失败，原样返回
    res.type('text/plain').status(502).send(jsonText);
  }
});

// ============ 路由：额度查询 ============

/**
 * GET /api/ai/quota
 * 查询当前 IP 的限免额度使用情况 + 机器码绑定的付费积分余额
 * 响应：{ code: 0, data: { used, limit, remaining, date, paid: { balance, earliestExpiringAt, totalPurchased } | null } }
 * 老客户端只读 used/limit/remaining，新字段 paid 不影响
 */
router.get('/api/ai/quota', (req, res) => {
  try {
    const ip = getClientIp(req);
    const quota = getQuota(ip);
    const machineId = getMachineId(req);
    const paid = machineId ? getPaidQuota(machineId) : null;
    res.json({
      code: 0,
      data: {
        ...quota,
        date: getToday(),
        paid: paid && paid.balance > 0
          ? {
              balance: paid.balance,
              earliestExpiringAt: paid.earliestExpiringAt,
              totalPurchased: paid.totalPurchased
            }
          : null
      }
    });
  } catch (err) {
    console.error('[ai] 查询额度失败:', err.message);
    res.status(500).json({ code: 500, message: '查询额度失败' });
  }
});

// ============ 路由：排队状态与跳过 ============

/**
 * GET /api/ai/queue/status
 * 查询当前机器码的排队状态（客户端轮询用）
 * 响应：{ code: 0, data: { inQueue, position, estimatedWaitMs, priority, skipQueueCredits } }
 */
router.get('/api/ai/queue/status', (req, res) => {
  try {
    const machineId = getMachineId(req);
    const status = machineId
      ? queueManager.getQueueStatus(machineId)
      : { inQueue: false, position: 0, estimatedWaitMs: 0 };
    res.json({
      code: 0,
      data: {
        ...status,
        skipQueueCredits: SKIP_QUEUE_CREDITS,
        maxConcurrent: MAX_CONCURRENT
      }
    });
  } catch (err) {
    console.error('[ai] 查询排队状态失败:', err.message);
    res.status(500).json({ code: 500, message: '查询排队状态失败' });
  }
});

/**
 * POST /api/ai/queue/skip
 * 花费 10 积分跳过排队，把当前 machineId 的队列项标记为优先。
 * 下次轮询重试 /v1/chat/completions（带 X-Queue-Priority: 1）时优先放行。
 *
 * 请求体：{ machineId }（也可通过 X-Machine-Id header 传递）
 * 响应：{ code: 0, data: { success, balance, message } }
 *       code: 402 余额不足
 *       code: 404 不在队列中（可能已被放行）
 */
router.post('/api/ai/queue/skip', express.json(), (req, res) => {
  try {
    const machineId = getMachineId(req) || (req.body && req.body.machineId);
    if (!machineId || !isValidMachineId(machineId)) {
      return res.status(400).json({ code: 400, message: '缺少有效的 machineId' });
    }

    // 1. 检查是否在队列中
    const status = queueManager.getQueueStatus(machineId);
    if (!status.inQueue) {
      return res.status(404).json({
        code: 404,
        message: '当前不在排队中（可能已被放行，请直接重试请求）'
      });
    }

    // 2. 已经是优先项则不重复扣费
    if (status.priority) {
      return res.json({
        code: 0,
        data: {
          success: true,
          message: '已购买优先通行，请重试请求',
          balance: getPaidQuota(machineId).balance
        }
      });
    }

    // 3. 扣减 10 积分
    const paidQuota = getPaidQuota(machineId);
    if (paidQuota.balance < SKIP_QUEUE_CREDITS) {
      return res.status(402).json({
        code: 402,
        message: `积分不足，跳过排队需要 ${SKIP_QUEUE_CREDITS} 积分（当前余额 ${paidQuota.balance}）`,
        data: { balance: paidQuota.balance, required: SKIP_QUEUE_CREDITS }
      });
    }

    const ok = consumePaidQuota(machineId, SKIP_QUEUE_CREDITS, 'queue-skip');
    if (!ok) {
      return res.status(500).json({ code: 500, message: '积分扣减失败' });
    }

    // 4. 标记为优先项
    queueManager.skipQueue(machineId);

    const newBalance = getPaidQuota(machineId).balance;
    console.log(`[ai] 用户 ${machineId} 花费 ${SKIP_QUEUE_CREDITS} 积分跳过排队，剩余 ${newBalance}`);
    res.json({
      code: 0,
      data: {
        success: true,
        message: `已花费 ${SKIP_QUEUE_CREDITS} 积分跳过排队，请重试请求`,
        balance: newBalance
      }
    });
  } catch (err) {
    console.error('[ai] 跳过排队失败:', err.message);
    res.status(500).json({ code: 500, message: '跳过排队失败' });
  }
});

module.exports = router;
