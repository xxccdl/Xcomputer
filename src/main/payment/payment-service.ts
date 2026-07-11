// 付费积分服务
// 与后端 xskillhub-server 的 /api/payment/* 接口交互
// 负责套餐查询、订单创建、订单轮询、余额查询、打开支付页

import { shell, BrowserWindow } from 'electron'
import { IPC_CHANNELS, SKILL_HUB_BASE_URL } from '@shared/constants'
import type { PlansResponse, PaidQuota, OrderInfo, OrderStatus } from '@shared/types'
import { getMachineId } from '../store/machine-id'
import { logger } from '../utils/logger'

/** 单次请求超时（毫秒） */
const REQUEST_TIMEOUT_MS = 8000
/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 3000
/** 轮询最大时长（毫秒，覆盖 30min 订单超时 + 5min 回调延迟） */
const POLL_MAX_DURATION_MS = 35 * 60 * 1000

/** 当前轮询的 AbortController（用于取消） */
let currentPollController: AbortController | null = null

/** 缓存的付费余额（避免频繁请求） */
let cachedPaidQuota: PaidQuota | null = null

/**
 * 发起带超时的 fetch 请求
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 获取套餐列表
 */
async function getPlans(): Promise<PlansResponse | null> {
  try {
    const resp = await fetchWithTimeout(`${SKILL_HUB_BASE_URL}/api/payment/plans`)
    if (!resp.ok) {
      logger.warn(`[payment] getPlans 失败: HTTP ${resp.status}`)
      return null
    }
    const data = (await resp.json()) as { code: number; data: PlansResponse }
    if (data.code !== 0) return null
    return data.data
  } catch (err) {
    logger.warn('[payment] getPlans 错误:', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * 创建订单
 */
async function createOrder(planId: string): Promise<OrderInfo | null> {
  const machineId = getMachineId()
  try {
    const resp = await fetchWithTimeout(`${SKILL_HUB_BASE_URL}/api/payment/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId, planId })
    })
    if (!resp.ok) {
      logger.warn(`[payment] createOrder 失败: HTTP ${resp.status}`)
      return null
    }
    const data = (await resp.json()) as { code: number; data: OrderInfo; message?: string }
    if (data.code !== 0) {
      logger.warn('[payment] createOrder 业务错误:', data.message)
      return null
    }
    return data.data
  } catch (err) {
    logger.warn('[payment] createOrder 错误:', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * 查询订单状态
 */
async function queryOrder(orderNo: string): Promise<OrderStatus | null> {
  const machineId = getMachineId()
  try {
    const resp = await fetchWithTimeout(
      `${SKILL_HUB_BASE_URL}/api/payment/orders/${encodeURIComponent(orderNo)}?machineId=${encodeURIComponent(machineId)}`
    )
    if (!resp.ok) {
      logger.warn(`[payment] queryOrder 失败: HTTP ${resp.status}`)
      return null
    }
    const data = (await resp.json()) as { code: number; data: OrderStatus; message?: string }
    if (data.code !== 0) {
      logger.warn('[payment] queryOrder 业务错误:', data.message)
      return null
    }
    return data.data
  } catch (err) {
    logger.warn('[payment] queryOrder 错误:', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * 查询付费积分余额
 */
async function getPaidQuota(): Promise<PaidQuota | null> {
  const machineId = getMachineId()
  try {
    const resp = await fetchWithTimeout(
      `${SKILL_HUB_BASE_URL}/api/payment/quota/${encodeURIComponent(machineId)}`
    )
    if (!resp.ok) {
      logger.warn(`[payment] getPaidQuota 失败: HTTP ${resp.status}`)
      return null
    }
    const data = (await resp.json()) as { code: number; data: PaidQuota }
    if (data.code !== 0) return null
    cachedPaidQuota = data.data
    return data.data
  } catch (err) {
    logger.warn('[payment] getPaidQuota 错误:', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * 在系统默认浏览器中打开支付链接
 */
async function openPayUrlInBrowser(payUrl: string): Promise<void> {
  try {
    await shell.openExternal(payUrl)
    logger.info('[payment] 已在浏览器打开支付链接')
  } catch (err) {
    logger.error('[payment] 打开浏览器失败:', err instanceof Error ? err.message : String(err))
  }
}

/**
 * 轮询订单状态，直到 paid 或 closed 或超时
 * @param orderNo 订单号
 * @param mainWindow 主窗口（用于推送 quota 更新）
 * @returns 'paid' | 'closed' | 'timeout' | 'cancelled'
 */
async function pollOrderStatus(
  orderNo: string,
  mainWindow: BrowserWindow
): Promise<'paid' | 'closed' | 'timeout' | 'cancelled'> {
  // 取消已有的轮询
  if (currentPollController) {
    currentPollController.abort()
  }

  currentPollController = new AbortController()
  const { signal } = currentPollController

  const startTime = Date.now()

  return new Promise((resolve) => {
    const poll = async (): Promise<void> => {
      if (signal.aborted) {
        resolve('cancelled')
        return
      }

      // 超时检查
      if (Date.now() - startTime > POLL_MAX_DURATION_MS) {
        resolve('timeout')
        return
      }

      const status = await queryOrder(orderNo)
      if (!status) {
        // 查询失败，等下次重试
        setTimeout(poll, POLL_INTERVAL_MS)
        return
      }

      if (status.status === 'paid') {
        // 支付成功，刷新余额并推送
        const quota = await getPaidQuota()
        if (quota && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.PAYMENT_QUOTA_UPDATED, quota)
        }
        // 同时触发限免积分推送：relayQuota.paid 字段也需更新，
        // 否则 SettingsModal 等订阅 AI_RELAY_QUOTA_UPDATED 的组件不会刷新付费余额。
        // 通过全局回调调用 chat.ipc 中的 pushRelayQuotaUpdate，避免循环依赖。
        const pushRelay = (globalThis as any).__pushRelayQuotaUpdate as
          | (() => Promise<void>) | undefined
        if (pushRelay) {
          void pushRelay().catch(() => { /* 已在 pushRelayQuotaUpdate 内部记录日志 */ })
        }
        resolve('paid')
        return
      }

      if (status.status === 'closed') {
        resolve('closed')
        return
      }

      // pending，继续轮询
      setTimeout(poll, POLL_INTERVAL_MS)
    }

    void poll()
  })
}

/**
 * 取消当前轮询
 */
function cancelPoll(): void {
  if (currentPollController) {
    currentPollController.abort()
    currentPollController = null
    logger.info('[payment] 已取消订单轮询')
  }
}

/**
 * 主动推送付费积分更新（用于启动签到、AI 请求后刷新）
 */
async function pushQuotaUpdate(mainWindow: BrowserWindow): Promise<void> {
  const quota = await getPaidQuota()
  if (quota && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.PAYMENT_QUOTA_UPDATED, quota)
  }
}

/**
 * 获取缓存的付费余额（同步，避免阻塞渲染进程）
 */
function getCachedPaidQuota(): PaidQuota | null {
  return cachedPaidQuota
}

/**
 * 设置缓存的付费余额（外部模块 ai-service 同步使用）
 */
function setCachedPaidQuota(quota: PaidQuota | null): void {
  cachedPaidQuota = quota
}

export const paymentService = {
  getPlans,
  createOrder,
  queryOrder,
  getPaidQuota,
  openPayUrlInBrowser,
  pollOrderStatus,
  cancelPoll,
  pushQuotaUpdate,
  getCachedPaidQuota,
  setCachedPaidQuota
}
