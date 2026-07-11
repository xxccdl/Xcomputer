// 机器码生成与持久化
// 用于付费积分归属标识，UUID v4 格式，存储在 userData/machine-id.json
// 单例，首次调用惰性生成，永不重置

import { app } from 'electron'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../utils/logger'

interface MachineIdFile {
  machineId: string
  createdAt: string
}

let cachedMachineId: string | null = null

/** 获取 userData 目录下 machine-id.json 的路径 */
function getMachineIdPath(): string {
  return path.join(app.getPath('userData'), 'machine-id.json')
}

/**
 * 获取机器码（惰性生成，持久化）
 * 首次调用时生成 UUID v4 并写入文件，后续直接读取
 * 永不重置（除非用户手动删除文件或重装系统）
 */
export function getMachineId(): string {
  if (cachedMachineId) return cachedMachineId

  const filePath = getMachineIdPath()
  try {
    // 尝试读取已有文件
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content) as MachineIdFile
      if (data.machineId && typeof data.machineId === 'string') {
        cachedMachineId = data.machineId
        return cachedMachineId
      }
    }
  } catch (err) {
    logger.warn('[machine-id] 读取机器码文件失败，将重新生成:', err instanceof Error ? err.message : String(err))
  }

  // 生成新机器码
  const newMachineId = randomUUID()
  const fileContent: MachineIdFile = {
    machineId: newMachineId,
    createdAt: new Date().toISOString()
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2), { encoding: 'utf-8' })
    logger.info(`[machine-id] 已生成新机器码: ${newMachineId}`)
  } catch (err) {
    logger.error('[machine-id] 写入机器码文件失败:', err instanceof Error ? err.message : String(err))
  }

  cachedMachineId = newMachineId
  return cachedMachineId
}
