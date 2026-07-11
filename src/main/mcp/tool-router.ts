import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import { mcpClient, type McpToolResult } from './mcp-client'
import { executeLocalTool, isLocalTool, type LocalToolResult } from '../tools/local-tools'
import { logger } from '../utils/logger'
import {
  HIGH_RISK_TOOLS,
  HIGH_RISK_FS_KEYWORDS,
  HIGH_RISK_LOCAL_ACTIONS,
  HIGH_RISK_SERVICE_ACTIONS,
  HIGH_RISK_OPTIMIZER_ACTIONS,
  HIGH_RISK_PHONE_ACTIONS
} from '@shared/constants'

export interface RoutedToolCall {
  toolName: string
  args: Record<string, unknown>
  result: McpToolResult
  durationMs: number
  screenshotPath?: string
  error?: string
}

/** 判断工具调用是否高危（需用户确认） */
export function isHighRisk(toolName: string, args: Record<string, unknown>): boolean {
  if (HIGH_RISK_TOOLS.includes(toolName as (typeof HIGH_RISK_TOOLS)[number])) {
    return true
  }
  // FileSystem 的删除类操作
  if (toolName === 'FileSystem') {
    const argsStr = JSON.stringify(args).toLowerCase()
    return HIGH_RISK_FS_KEYWORDS.some((kw) => argsStr.includes(kw))
  }
  // 本地 File 工具的删除操作
  if (toolName === 'File') {
    const action = String(args.action ?? '').toLowerCase()
    return HIGH_RISK_LOCAL_ACTIONS.includes(action as (typeof HIGH_RISK_LOCAL_ACTIONS)[number])
  }
  // ServiceManager 的启停操作
  if (toolName === 'ServiceManager') {
    const action = String(args.action ?? '').toLowerCase()
    return HIGH_RISK_SERVICE_ACTIONS.includes(
      action as (typeof HIGH_RISK_SERVICE_ACTIONS)[number]
    )
  }
  // SystemOptimizer 的清理/终止/禁用操作
  if (toolName === 'SystemOptimizer') {
    const action = String(args.action ?? '').toLowerCase()
    return HIGH_RISK_OPTIMIZER_ACTIONS.includes(
      action as (typeof HIGH_RISK_OPTIMIZER_ACTIONS)[number]
    )
  }
  // PhoneControl 的高危操作（发送短信/关闭App/下载文件）
  if (toolName === 'PhoneControl') {
    const action = String(args.action ?? '').toLowerCase()
    return HIGH_RISK_PHONE_ACTIONS.includes(
      action as (typeof HIGH_RISK_PHONE_ACTIONS)[number]
    )
  }
  return false
}

/** 将 MCP 图片结果转存为临时文件，返回路径 */
async function saveImageToFile(base64Data: string, mimeType: string): Promise<string> {
  const tempDir = join(app.getPath('userData'), 'temp')
  await fs.mkdir(tempDir, { recursive: true })
  const ext = mimeType === 'image/png' ? '.png' : mimeType === 'image/jpeg' ? '.jpg' : '.bin'
  const filename = `screenshot-${randomUUID()}${ext}`
  const filepath = join(tempDir, filename)
  await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'))
  return filepath
}

/** 将本地工具结果转为 MCP 兼容格式 */
function localResultToMcp(result: LocalToolResult): McpToolResult {
  return { content: result.content, isError: result.isError }
}

/** 执行工具调用并处理结果（图片转存等） */
export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  sessionId?: string,
  subagentId?: string
): Promise<RoutedToolCall> {
  const start = Date.now()
  try {
    let result: McpToolResult

    // 本地工具直接执行
    if (isLocalTool(toolName)) {
      logger.info(`Calling local tool: ${toolName}`, args)
      const localResult = await executeLocalTool(toolName, args, sessionId, subagentId)
      result = localResultToMcp(localResult)
    } else {
      // MCP 工具
      result = await mcpClient.callTool(toolName, args)
    }

    const durationMs = Date.now() - start

    let screenshotPath: string | undefined
    // 处理图片内容
    for (const item of result.content) {
      if (item.type === 'image') {
        screenshotPath = await saveImageToFile(item.data, item.mimeType)
      }
    }

    return { toolName, args, result, durationMs, screenshotPath }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error(`Tool call failed: ${toolName}`, error)
    return {
      toolName,
      args,
      result: { content: [{ type: 'text', text: error }], isError: true },
      durationMs: Date.now() - start,
      error
    }
  }
}

/** 将工具结果转为给 AI 的文本（图片转为占位说明） */
export function toolResultToText(result: McpToolResult): string {
  const parts: string[] = []
  for (const item of result.content) {
    if (item.type === 'text') {
      parts.push(item.text)
    } else if (item.type === 'image') {
      parts.push('[截图已保存，请基于 Snapshot 文本信息继续操作]')
    }
  }
  return parts.join('\n') || '(空结果)'
}
