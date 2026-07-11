// 付费购买积分 IPC handler
// 注册套餐查询、订单创建、轮询、余额查询等 IPC 通道

import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { paymentService } from '../payment/payment-service'
import { logger } from '../utils/logger'

export function registerPaymentIpc(mainWindow: BrowserWindow): void {
  // 获取套餐列表
  ipcMain.handle(IPC_CHANNELS.PAYMENT_GET_PLANS, async () => {
    return await paymentService.getPlans()
  })

  // 创建订单
  ipcMain.handle(IPC_CHANNELS.PAYMENT_CREATE_ORDER, async (_e, planId: string) => {
    return await paymentService.createOrder(planId)
  })

  // 在浏览器中打开支付链接
  ipcMain.handle(IPC_CHANNELS.PAYMENT_OPEN_BROWSER, async (_e, payUrl: string) => {
    await paymentService.openPayUrlInBrowser(payUrl)
    return { success: true }
  })

  // 轮询订单状态（长任务，返回 'paid' | 'closed' | 'timeout' | 'cancelled'）
  ipcMain.handle(IPC_CHANNELS.PAYMENT_POLL_ORDER, async (_e, orderNo: string) => {
    const result = await paymentService.pollOrderStatus(orderNo, mainWindow)
    logger.info(`[payment.ipc] 订单 ${orderNo} 轮询结果: ${result}`)
    return result
  })

  // 取消轮询
  ipcMain.handle(IPC_CHANNELS.PAYMENT_CANCEL_POLL, async () => {
    paymentService.cancelPoll()
    return { success: true }
  })

  // 查询付费积分余额
  ipcMain.handle(IPC_CHANNELS.PAYMENT_GET_QUOTA, async () => {
    return await paymentService.getPaidQuota()
  })

  logger.info('[payment.ipc] 已注册付费积分 IPC handlers')
}
