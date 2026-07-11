// 排队管理器
// 当中继服务的并发请求数超过阈值时，新请求进入 FIFO 队列等待。
// 客户端通过 429 + 排队信息感知，并轮询重试或花费积分跳过。
//
// 工作流程：
// 1. 请求到达 -> tryAcquire()
//    - 有空闲槽位 -> 返回 { acquired: true }，请求继续处理
//    - 无空闲槽位 -> 返回 { acquired: false, position, estimatedWaitMs }，请求进入队列
// 2. 请求处理完成 -> release() 释放槽位
// 3. 客户端收到排队信号后轮询 tryAcquire 重试（带 queueId 复用排队位置）
// 4. 用户花费 10 积分跳过 -> skipQueue(machineId) 把请求移到队首，下次轮询时优先放行

/** 最大并发活跃请求数（超过此值后新请求排队） */
const MAX_CONCURRENT = parseInt(process.env.AI_MAX_CONCURRENT || '20', 10);

/** 跳过排队所需积分 */
const SKIP_QUEUE_CREDITS = 10;

/** 排队请求的最大存活时间（毫秒），超时后从队列移除 */
const QUEUE_TTL_MS = 180_000;

/** 单个请求预估处理时间（用于估算等待时长） */
const ESTIMATED_PROCESS_MS = 8_000;

/**
 * 排队条目（记录在队列中等待的请求）
 */
class QueueEntry {
  constructor(machineId) {
    this.queueId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.machineId = machineId || null;
    this.enqueuedAt = Date.now();
    this.priority = false; // 是否已花费积分提升优先级
    this.expiresAt = Date.now() + QUEUE_TTL_MS;
  }
}

class QueueManager {
  constructor() {
    /** 当前正在处理的活跃请求数 */
    this.inflight = 0;
    /** 等待队列（优先项在前，普通项在后；同类按入队时间排序） */
    this.queue = [];
  }

  /**
   * 尝试获取处理槽位。
   * - 若有空闲槽位：inflight++ 并返回 acquired: true
   * - 若无空闲槽位：把请求加入队列（复用已有 queueId 则更新位置），返回排队信息
   * @param {string|null} machineId
   * @param {string|null} existingQueueId - 客户端轮询重试时传入，复用排队位置
   * @param {boolean} priority - 是否为优先请求（已扣 10 积分）
   * @returns {{ acquired: boolean, position?: number, estimatedWaitMs?: number, queueId?: string }}
   */
  tryAcquire(machineId, existingQueueId = null, priority = false) {
    // 优先请求：若已达并发上限但队列为空，允许超出 1 个槽位（优先通行）
    // 这样付费跳过的用户不会被普通排队堵死
    if (priority && this.inflight < MAX_CONCURRENT + 2) {
      this.inflight++;
      // 同时从队列中移除该 machineId 的旧条目（如果有）
      this._removeByMachineId(machineId);
      return { acquired: true };
    }

    // 有空闲槽位：直接放行
    if (this.inflight < MAX_CONCURRENT) {
      this.inflight++;
      // 放行后清理该 machineId 在队列中的旧条目
      this._removeByMachineId(machineId);
      return { acquired: true };
    }

    // 需要排队
    let entry;
    if (existingQueueId) {
      // 轮询重试：复用已有条目
      entry = this.queue.find((q) => q.queueId === existingQueueId);
      if (entry) {
        // 更新优先级（如果这次是 priority）
        if (priority) entry.priority = true;
        // 重新排序：优先项在前
        this._resort();
      } else {
        // 旧条目已过期或被移除，创建新条目
        entry = new QueueEntry(machineId);
        entry.priority = priority;
        this.queue.push(entry);
        this._resort();
      }
    } else {
      entry = new QueueEntry(machineId);
      entry.priority = priority;
      this.queue.push(entry);
      this._resort();
    }

    // 清理过期条目
    this._purgeExpired();

    const position = this._getPosition(entry);
    const estimatedWaitMs = position * ESTIMATED_PROCESS_MS;
    return {
      acquired: false,
      position,
      estimatedWaitMs,
      queueId: entry.queueId
    };
  }

  /**
   * 释放处理槽位（请求完成后调用）。
   * 槽位释放后，下一个轮询的队列项会被 tryAcquire 放行。
   */
  release() {
    if (this.inflight > 0) this.inflight--;
  }

  /**
   * 跳过排队：把指定 machineId 的队列项标记为优先。
   * 下次轮询 tryAcquire 时会优先放行（允许超出并发上限 2 个）。
   * @param {string} machineId
   * @returns {boolean} 是否成功找到并提升
   */
  skipQueue(machineId) {
    const entry = this.queue.find((q) => q.machineId === machineId);
    if (!entry) return false;
    entry.priority = true;
    this._resort();
    return true;
  }

  /**
   * 查询某个 machineId 的排队状态（供客户端轮询）
   */
  getQueueStatus(machineId) {
    this._purgeExpired();
    const entry = this.queue.find((q) => q.machineId === machineId);
    if (!entry) {
      // 不在队列中：可能已被放行或从未排队
      return { inQueue: false, position: 0, estimatedWaitMs: 0 };
    }
    const position = this._getPosition(entry);
    return {
      inQueue: true,
      position,
      estimatedWaitMs: position * ESTIMATED_PROCESS_MS,
      priority: entry.priority,
      queueId: entry.queueId
    };
  }

  /** 从队列中移除指定 machineId 的条目 */
  _removeByMachineId(machineId) {
    if (!machineId) return;
    const idx = this.queue.findIndex((q) => q.machineId === machineId);
    if (idx >= 0) this.queue.splice(idx, 1);
  }

  /** 重新排序：优先项在前，同类按入队时间排序 */
  _resort() {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      return a.enqueuedAt - b.enqueuedAt;
    });
  }

  /** 计算条目在队列中的位置（1-based） */
  _getPosition(entry) {
    return this.queue.indexOf(entry) + 1;
  }

  /** 清理过期条目 */
  _purgeExpired() {
    const now = Date.now();
    const before = this.queue.length;
    this.queue = this.queue.filter((q) => q.expiresAt > now);
    if (this.queue.length < before) {
      // 有条目过期被清理，无需特殊处理（客户端轮询时会发现不在队列）
    }
  }

  /** 获取当前队列状态快照（供调试/监控） */
  getStatus() {
    this._purgeExpired();
    return {
      inflight: this.inflight,
      queueLength: this.queue.length,
      maxConcurrent: MAX_CONCURRENT,
      skipQueueCredits: SKIP_QUEUE_CREDITS
    };
  }
}

const queueManager = new QueueManager();

module.exports = {
  queueManager,
  MAX_CONCURRENT,
  SKIP_QUEUE_CREDITS,
  QUEUE_TTL_MS
};
