import { promises as fs } from 'fs'
import { join, dirname, basename, extname, relative } from 'path'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import { execSync, spawn } from 'child_process'
import { BrowserWindow } from 'electron'
import { terminalManager } from './terminal-manager'
import { logger } from '../utils/logger'
import { memoryStore } from '../store/memory'
import { skillsStore } from '../store/skills'
import { snippetStore } from '../store/snippets'
import type { TodoItem } from '@shared/types'

export interface LocalToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

const MAX_READ_SIZE = 200_000 // 200KB
const MAX_LIST_ENTRIES = 500
const MAX_SEARCH_RESULTS = 100

/**
 * 安全校验：Windows 服务名 / 进程名只允许字母、数字、连字符、下划线、空格、点。
 * 拒绝含引号、分号、管道、&、|、$、() 等 shell 元字符的输入，防止命令注入。
 * 安全最佳实践：永远不要将用户/AI 提供的字符串直接拼入 shell 命令。
 * @returns null 表示校验通过；返回字符串表示错误信息
 */
function validateSafeIdentifier(name: string, label = '名称'): string | null {
  if (!name) return `${label}不能为空`
  // 仅允许：字母数字、连字符、下划线、空格、点（Windows 服务名/进程名的合法字符集）
  if (!/^[A-Za-z0-9 _.\-]+$/.test(name)) {
    return `${label} "${name.slice(0, 30)}" 含非法字符，仅允许字母、数字、空格、连字符、下划线和点`
  }
  return null
}

/**
 * 安全校验：主机名/IP 地址。
 * 允许：字母、数字、点、连字符、冒号（IPv6）。拒绝一切 shell 元字符。
 * @returns null 表示校验通过；返回字符串表示错误信息
 */
function validateHostname(host: string): string | null {
  if (!host) return '主机名不能为空'
  // 域名/IPv4/IPv6 合法字符：字母数字、点、连字符、冒号、百分号（zone ID）
  if (!/^[A-Za-z0-9.:\-%]+$/.test(host)) {
    return `主机名 "${host.slice(0, 30)}" 含非法字符`
  }
  return null
}

/** 本地工具名集合 */
export const LOCAL_TOOL_NAMES = [
  'File', 'Terminal', 'TodoList', 'Memory', 'Skill', 'Snippet',
  'SystemInfo', 'WebSearch', 'WebFetch', 'WindowManager',
  'SystemAudio', 'ServiceManager', 'NetworkTools', 'ZipArchive',
  'BatchFile', 'SystemOptimizer', 'CodeAnalyzer', 'PhoneControl'
] as const
export type LocalToolName = (typeof LOCAL_TOOL_NAMES)[number]

export function isLocalTool(name: string): name is LocalToolName {
  return (LOCAL_TOOL_NAMES as readonly string[]).includes(name)
}

/** 执行本地工具 */
export async function executeLocalTool(
  name: LocalToolName,
  args: Record<string, unknown>,
  sessionId?: string,
  subagentId?: string
): Promise<LocalToolResult> {
  try {
    if (name === 'File') return await executeFile(args)
    if (name === 'Terminal') return await executeTerminal(args)
    if (name === 'TodoList') return await executeTodoList(args, sessionId, subagentId)
    if (name === 'Memory') return await executeMemory(args, sessionId)
    if (name === 'Skill') return await executeSkill(args, sessionId)
    if (name === 'Snippet') return await executeSnippet(args)
    if (name === 'SystemInfo') return await executeSystemInfo(args)
    if (name === 'WebSearch') return await executeWebSearch(args)
    if (name === 'WebFetch') return await executeWebFetch(args)
    if (name === 'WindowManager') return await executeWindowManager(args)
    if (name === 'SystemAudio') return await executeSystemAudio(args)
    if (name === 'ServiceManager') return await executeServiceManager(args)
    if (name === 'NetworkTools') return await executeNetworkTools(args)
    if (name === 'ZipArchive') return await executeZipArchive(args)
    if (name === 'BatchFile') return await executeBatchFile(args)
    if (name === 'SystemOptimizer') return await executeSystemOptimizer(args)
    if (name === 'CodeAnalyzer') return await executeCodeAnalyzer(args)
    if (name === 'PhoneControl') return await executePhoneControl(args)
    return { content: [{ type: 'text', text: `未知本地工具: ${name}` }], isError: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`Local tool ${name} failed:`, msg)
    return { content: [{ type: 'text', text: msg }], isError: true }
  }
}

// ============ File 工具 ============

async function executeFile(args: Record<string, unknown>): Promise<LocalToolResult> {
  const action = String(args.action ?? '')
  const path = String(args.path ?? '')

  switch (action) {
    case 'read':
      return await fileRead(path, args)
    case 'write':
      return await fileWrite(path, String(args.content ?? ''), args)
    case 'append':
      return await fileAppend(path, String(args.content ?? ''))
    case 'list':
      return await fileList(path, args)
    case 'stat':
      return await fileStat(path)
    case 'move':
      return await fileMove(path, String(args.destination ?? ''))
    case 'copy':
      return await fileCopy(path, String(args.destination ?? ''))
    case 'delete':
      return await fileDelete(path, args)
    case 'mkdir':
      return await fileMkdir(path, args)
    case 'search':
      return await fileSearch(path, String(args.pattern ?? '*'), args)
    default:
      return {
        content: [{ type: 'text', text: `未知 File action: ${action}` }],
        isError: true
      }
  }
}

async function fileRead(
  path: string,
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const stat = await fs.stat(path)
  if (stat.isDirectory()) {
    return {
      content: [{ type: 'text', text: `错误: ${path} 是目录，请用 list` }],
      isError: true
    }
  }
  if (stat.size > MAX_READ_SIZE) {
    // 大文件只读前 MAX_READ_SIZE 字节
    const handle = await fs.open(path, 'r')
    const buf = Buffer.alloc(MAX_READ_SIZE)
    const { bytesRead } = await handle.read(buf, 0, MAX_READ_SIZE, 0)
    await handle.close()
    return {
      content: [
        {
          type: 'text',
          text: `(文件 ${stat.size} 字节，仅读取前 ${bytesRead} 字节)\n${buf.toString('utf8', 0, bytesRead)}`
        }
      ]
    }
  }
  const encoding = args.encoding === 'buffer' ? null : 'utf8'
  const content = await fs.readFile(path, encoding as BufferEncoding | null)
  return {
    content: [
      {
        type: 'text',
        text: typeof content === 'string' ? content : `(二进制文件，${content.length} 字节)`
      }
    ]
  }
}

async function fileWrite(
  path: string,
  content: string,
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  await fs.mkdir(dirname(path), { recursive: true })
  const flag = args.append ? 'a' : 'w'
  await fs.writeFile(path, content, { flag })
  return {
    content: [{ type: 'text', text: `已写入 ${content.length} 字节到 ${path}` }]
  }
}

async function fileAppend(path: string, content: string): Promise<LocalToolResult> {
  await fs.mkdir(dirname(path), { recursive: true })
  await fs.appendFile(path, content)
  return {
    content: [{ type: 'text', text: `已追加 ${content.length} 字节到 ${path}` }]
  }
}

async function fileList(
  path: string,
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const stat = await fs.stat(path)
  if (!stat.isDirectory()) {
    return {
      content: [{ type: 'text', text: `错误: ${path} 不是目录` }],
      isError: true
    }
  }
  const recursive = args.recursive === true
  const pattern = String(args.pattern ?? '*')
  const entries = await listDir(path, recursive, pattern, 0, MAX_LIST_ENTRIES)
  const lines = entries.map(
    (e) =>
      `${e.type === 'dir' ? 'd' : '-'}\t${e.size}\t${e.mtime}\t${e.name}`
  )
  return {
    content: [
      {
        type: 'text',
        text:
          `目录: ${path}（共 ${entries.length} 项${entries.length >= MAX_LIST_ENTRIES ? '，已截断' : ''}）\n` +
          lines.join('\n')
      }
    ]
  }
}

interface ListEntry {
  name: string
  type: 'file' | 'dir'
  size: number
  mtime: string
}

async function listDir(
  dir: string,
  recursive: boolean,
  pattern: string,
  depth: number,
  maxEntries: number,
  collected: ListEntry[] = []
): Promise<ListEntry[]> {
  if (collected.length >= maxEntries) return collected
  if (depth > 5) return collected // 限制递归深度
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (collected.length >= maxEntries) break
    const fullPath = join(dir, entry.name)
    try {
      const stat = await fs.stat(fullPath)
      const name = recursive ? fullPath : entry.name
      // 简单 glob 匹配
      if (pattern !== '*' && !matchGlob(entry.name, pattern)) continue
      collected.push({
        name,
        type: entry.isDirectory() ? 'dir' : 'file',
        size: stat.size,
        mtime: stat.mtime.toISOString().slice(0, 19).replace('T', ' ')
      })
      if (recursive && entry.isDirectory()) {
        await listDir(fullPath, recursive, pattern, depth + 1, maxEntries, collected)
      }
    } catch {
      // 跳过无权限的项
    }
  }
  return collected
}

function matchGlob(name: string, pattern: string): boolean {
  // 简单的 glob 匹配：* 匹配任意字符，? 匹配单字符，{a,b,c} 匹配枚举
  // 先用占位符提取花括号表达式，避免被后续的字符转义破坏
  const placeholders: string[] = []
  const masked = pattern.replace(/\{([^{}]+)\}/g, (_, content: string) => {
    const options = content.split(',').map((s) => s.trim()).filter(Boolean)
    const group = `(${options.map((o) => o.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`
    placeholders.push(group)
    return `\u0000${placeholders.length - 1}\u0000`
  })
  const regex = masked
    .replace(/[.+^$()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
    .replace(/\u0000(\d+)\u0000/g, (_, idx: string) => placeholders[Number(idx)])
  return new RegExp(`^${regex}$`, 'i').test(name)
}

async function fileStat(path: string): Promise<LocalToolResult> {
  try {
    const stat = await fs.stat(path)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              path,
              type: stat.isDirectory() ? 'directory' : 'file',
              size: stat.size,
              sizeHuman: formatSize(stat.size),
              created: stat.birthtime.toISOString(),
              modified: stat.mtime.toISOString(),
              accessed: stat.atime.toISOString(),
              permissions: stat.mode.toString(8).slice(-3)
            },
            null,
            2
          )
        }
      ]
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `无法获取信息: ${(err as Error).message}` }],
      isError: true
    }
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function fileMove(src: string, dst: string): Promise<LocalToolResult> {
  await fs.mkdir(dirname(dst), { recursive: true })
  await fs.rename(src, dst)
  return {
    content: [{ type: 'text', text: `已移动: ${src} → ${dst}` }]
  }
}

async function fileCopy(src: string, dst: string): Promise<LocalToolResult> {
  await fs.mkdir(dirname(dst), { recursive: true })
  const stat = await fs.stat(src)
  if (stat.isDirectory()) {
    await copyDir(src, dst)
  } else {
    await fs.copyFile(src, dst)
  }
  return {
    content: [{ type: 'text', text: `已复制: ${src} → ${dst}` }]
  }
}

async function copyDir(src: string, dst: string): Promise<void> {
  await fs.mkdir(dst, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const s = join(src, entry.name)
    const d = join(dst, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fs.copyFile(s, d)
  }
}

async function fileDelete(
  path: string,
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const recursive = args.recursive === true
  const stat = await fs.stat(path)
  if (stat.isDirectory()) {
    if (!recursive) {
      return {
        content: [{ type: 'text', text: '删除目录需要 recursive=true' }],
        isError: true
      }
    }
    await fs.rm(path, { recursive: true, force: true })
  } else {
    await fs.unlink(path)
  }
  return {
    content: [{ type: 'text', text: `已删除: ${path}` }]
  }
}

async function fileMkdir(
  path: string,
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const recursive = args.recursive !== false // 默认递归
  if (recursive) await fs.mkdir(path, { recursive: true })
  else await fs.mkdir(path)
  return {
    content: [{ type: 'text', text: `已创建目录: ${path}` }]
  }
}

async function fileSearch(
  dir: string,
  pattern: string,
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const recursive = args.recursive !== false
  const maxDepth = Number(args.maxDepth ?? 6)
  const results: string[] = []
  await searchDir(dir, pattern, recursive, 0, maxDepth, results)
  return {
    content: [
      {
        type: 'text',
        text:
          results.length === 0
            ? `未找到匹配 ${pattern} 的文件`
            : `找到 ${results.length} 个匹配项:\n` + results.join('\n')
      }
    ]
  }
}

async function searchDir(
  dir: string,
  pattern: string,
  recursive: boolean,
  depth: number,
  maxDepth: number,
  results: string[]
): Promise<void> {
  if (depth > maxDepth || results.length >= MAX_SEARCH_RESULTS) return
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (results.length >= MAX_SEARCH_RESULTS) return
    if (matchGlob(entry.name, pattern)) {
      results.push(join(dir, entry.name))
    }
    if (recursive && entry.isDirectory()) {
      await searchDir(join(dir, entry.name), pattern, recursive, depth + 1, maxDepth, results)
    }
  }
}

// ============ Terminal 工具 ============

async function executeTerminal(args: Record<string, unknown>): Promise<LocalToolResult> {
  const action = String(args.action ?? '')

  switch (action) {
    case 'create':
      return terminalCreate(args)
    case 'send':
      return terminalSend(args)
    case 'sendKey':
      return terminalSendKey(args)
    case 'output':
      return terminalOutput(args)
    case 'clear':
      return terminalClear(args)
    case 'close':
      return terminalClose(args)
    case 'list':
      return terminalList()
    case 'resize':
      return terminalResize(args)
    default:
      return {
        content: [{ type: 'text', text: `未知 Terminal action: ${action}` }],
        isError: true
      }
  }
}

function terminalCreate(args: Record<string, unknown>): LocalToolResult {
  const shell = args.shell ? String(args.shell) : undefined
  const cwd = args.cwd ? String(args.cwd) : undefined
  const cols = args.cols ? Number(args.cols) : undefined
  const rows = args.rows ? Number(args.rows) : undefined
  const result = terminalManager.create({ shell, cwd, cols, rows })
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            terminalId: result.terminalId,
            shell: result.shell,
            cwd: result.cwd,
            hint: '使用 send action 发送命令（自动回车），或 sendKey 发送特殊按键如 ctrl+c'
          },
          null,
          2
        )
      }
    ]
  }
}

function terminalSend(args: Record<string, unknown>): LocalToolResult {
  const id = String(args.terminalId ?? '')
  const data = String(args.data ?? '')
  const addNewline = args.addNewline !== false // 默认自动回车
  const payload = addNewline && !data.endsWith('\n') ? data + '\r\n' : data
  const result = terminalManager.send(id, payload)
  return {
    content: [
      {
        type: 'text',
        text: result.ok
          ? `已发送到终端 ${id}（${data.length} 字符）`
          : `发送失败: ${result.error}`
      }
    ],
    isError: !result.ok
  }
}

function terminalSendKey(args: Record<string, unknown>): LocalToolResult {
  const id = String(args.terminalId ?? '')
  const key = String(args.key ?? '')
  const result = terminalManager.sendKey(id, key)
  return {
    content: [
      {
        type: 'text',
        text: result.ok ? `已发送按键 ${key} 到终端 ${id}` : `发送失败: ${result.error}`
      }
    ],
    isError: !result.ok
  }
}

async function terminalOutput(args: Record<string, unknown>): Promise<LocalToolResult> {
  const id = String(args.terminalId ?? '')
  const lines = args.lines ? Number(args.lines) : undefined
  const waitMs = args.waitMs ? Number(args.waitMs) : 0
  // 真正等待一段时间，让终端有时间产生输出（上限 10s 防止 AI 误用过长等待）
  if (waitMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(waitMs, 10000)))
  }
  const result = terminalManager.output(id, lines)
  if (!result) {
    return {
      content: [{ type: 'text', text: `终端 ${id} 不存在` }],
      isError: true
    }
  }
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            terminalId: id,
            isRunning: result.isRunning,
            output: result.output || '(无输出)'
          },
          null,
          2
        )
      }
    ]
  }
}

function terminalClear(args: Record<string, unknown>): LocalToolResult {
  const id = String(args.terminalId ?? '')
  const ok = terminalManager.clear(id)
  return {
    content: [
      { type: 'text', text: ok ? `已清空终端 ${id} 输出历史` : `终端 ${id} 不存在` }
    ],
    isError: !ok
  }
}

function terminalClose(args: Record<string, unknown>): LocalToolResult {
  const id = String(args.terminalId ?? '')
  const ok = terminalManager.close(id)
  return {
    content: [
      { type: 'text', text: ok ? `已关闭终端 ${id}` : `终端 ${id} 不存在` }
    ],
    isError: !ok
  }
}

function terminalList(): LocalToolResult {
  const list = terminalManager.list()
  return {
    content: [
      {
        type: 'text',
        text:
          list.length === 0
            ? '当前无活跃终端'
            : `活跃终端 (${list.length}):\n` +
              list
                .map(
                  (t) =>
                    `  ${t.id.slice(0, 8)} shell=${t.shell} running=${t.isRunning} output=${t.outputLength}B`
                )
                .join('\n')
      }
    ]
  }
}

function terminalResize(args: Record<string, unknown>): LocalToolResult {
  const id = String(args.terminalId ?? '')
  const cols = Number(args.cols ?? 80)
  const rows = Number(args.rows ?? 24)
  const ok = terminalManager.resize(id, cols, rows)
  return {
    content: [
      { type: 'text', text: ok ? `已调整终端 ${id} 大小为 ${cols}x${rows}` : `终端 ${id} 不存在` }
    ],
    isError: !ok
  }
}

// ============ TodoList 工具 ============

interface TodoItemInternal {
  id: string
  text: string
  status: 'pending' | 'completed'
  createdAt: number
}

interface TodoListState {
  items: TodoItemInternal[]
}

/** 按会话隔离的任务清单 */
const todoLists = new Map<string, TodoListState>()

/** TodoList 变更事件发射器，供 orchestrator 监听 */
export const todoListEvents = new EventEmitter()

/** 子代理 TodoList 变更事件发射器（独立命名空间，不覆盖主代理清单） */
export const subagentTodoEvents = new EventEmitter()

function getTodoList(namespace: string): TodoListState {
  if (!todoLists.has(namespace)) {
    todoLists.set(namespace, { items: [] })
  }
  return todoLists.get(namespace)!
}

/** 获取指定会话的 TodoList 项（供 IPC 查询，切换会话时加载） */
export function getTodoItems(sessionId: string): TodoItem[] {
  if (!todoLists.has(sessionId)) return []
  return todoLists.get(sessionId)!.items.map((i) => ({
    id: i.id,
    text: i.text,
    status: i.status,
    createdAt: i.createdAt
  }))
}

/**
 * 通知 TodoList 变更（推送到前端操作详情）。
 * - 主代理调用时（subagentId 为空）：按 sessionId 推送，前端显示在「任务清单」区
 * - 子代理调用时（subagentId 非空）：用 `subagent:${subagentId}` 作为独立命名空间，
 *   避免覆盖主代理清单；通过 subagentTodoEvents 推送，前端在子代理卡片内渲染
 */
function notifyTodoListChange(sessionId: string, subagentId?: string): void {
  const namespace = subagentId ? `subagent:${subagentId}` : sessionId
  const list = getTodoList(namespace)
  const items: TodoItem[] = list.items.map((i) => ({
    id: i.id,
    text: i.text,
    status: i.status,
    createdAt: i.createdAt
  }))
  if (subagentId) {
    subagentTodoEvents.emit('change', { sessionId, subagentId, items })
  } else {
    todoListEvents.emit('change', { sessionId, items })
  }
}

function formatTodoList(list: TodoListState): string {
  if (list.items.length === 0) return '任务清单为空'
  const completed = list.items.filter((i) => i.status === 'completed').length
  const lines = list.items.map((item, idx) => {
    const marker = item.status === 'completed' ? '[x]' : '[ ]'
    return `${idx + 1}. ${marker} ${item.text}`
  })
  return `任务进度: ${completed}/${list.items.length}\n${lines.join('\n')}`
}

async function executeTodoList(
  args: Record<string, unknown>,
  sessionId?: string,
  subagentId?: string
): Promise<LocalToolResult> {
  const action = String(args.action ?? '')
  const sid = sessionId ?? 'default'
  // 子代理使用独立命名空间，避免覆盖主代理的任务清单
  const namespace = subagentId ? `subagent:${subagentId}` : sid
  const list = getTodoList(namespace)

  switch (action) {
    case 'create': {
      const tasks = Array.isArray(args.tasks) ? args.tasks.map((t) => String(t)) : []
      list.items = tasks.map((text) => ({
        id: randomUUID(),
        text,
        status: 'pending',
        createdAt: Date.now()
      }))
      notifyTodoListChange(sid, subagentId)
      return {
        content: [{ type: 'text', text: `已创建任务清单（${list.items.length} 项）\n${formatTodoList(list)}` }]
      }
    }

    case 'add': {
      const text = String(args.text ?? '')
      if (!text) return { content: [{ type: 'text', text: 'add 操作需要提供 text' }], isError: true }
      const item: TodoItemInternal = {
        id: randomUUID(),
        text,
        status: 'pending',
        createdAt: Date.now()
      }
      list.items.push(item)
      notifyTodoListChange(sid, subagentId)
      return {
        content: [{ type: 'text', text: `已添加任务\n${formatTodoList(list)}` }]
      }
    }

    case 'complete': {
      const id = args.id ? String(args.id) : undefined
      const text = args.text ? String(args.text) : undefined
      let matched = false
      // text 模式：优先精确匹配，找不到再降级为子串匹配（仅匹配第一项，避免误操作）
      if (!id && text) {
        const exact = list.items.find((i) => i.text === text)
        if (exact) {
          exact.status = 'completed'
          matched = true
        } else {
          const fuzzy = list.items.find((i) => i.text.includes(text))
          if (fuzzy) {
            fuzzy.status = 'completed'
            matched = true
          }
        }
      } else {
        for (const item of list.items) {
          if (id && item.id === id) {
            item.status = 'completed'
            matched = true
            break
          }
        }
      }
      if (!matched) return { content: [{ type: 'text', text: '未找到匹配的任务' }], isError: true }
      notifyTodoListChange(sid, subagentId)
      return {
        content: [{ type: 'text', text: `已标记完成\n${formatTodoList(list)}` }]
      }
    }

    case 'uncomplete': {
      const id = args.id ? String(args.id) : undefined
      const text = args.text ? String(args.text) : undefined
      let matched = false
      // text 模式：优先精确匹配，找不到再降级为子串匹配（仅匹配第一项）
      if (!id && text) {
        const exact = list.items.find((i) => i.text === text)
        if (exact) {
          exact.status = 'pending'
          matched = true
        } else {
          const fuzzy = list.items.find((i) => i.text.includes(text))
          if (fuzzy) {
            fuzzy.status = 'pending'
            matched = true
          }
        }
      } else {
        for (const item of list.items) {
          if (id && item.id === id) {
            item.status = 'pending'
            matched = true
            break
          }
        }
      }
      if (!matched) return { content: [{ type: 'text', text: '未找到匹配的任务' }], isError: true }
      notifyTodoListChange(sid, subagentId)
      return {
        content: [{ type: 'text', text: `已取消完成标记\n${formatTodoList(list)}` }]
      }
    }

    case 'list': {
      return {
        content: [{ type: 'text', text: formatTodoList(list) }]
      }
    }

    case 'clear': {
      list.items = []
      notifyTodoListChange(sid, subagentId)
      return {
        content: [{ type: 'text', text: '已清空任务清单' }]
      }
    }

    default:
      return {
        content: [{ type: 'text', text: `未知 TodoList action: ${action}` }],
        isError: true
      }
  }
}

// ============ Memory 工具（AI 主动管理长期记忆） ============

async function executeMemory(
  args: Record<string, unknown>,
  sessionId?: string
): Promise<LocalToolResult> {
  const action = String(args.action ?? '')

  switch (action) {
    case 'save': {
      // AI 主动保存一条记忆
      const type = String(args.type ?? 'fact') as
        | 'profile'
        | 'habit'
        | 'preference'
        | 'fact'
        | 'interaction'
        | 'skill'
      const category = String(args.category ?? 'general')
      const content = String(args.content ?? '')
      const confidence = Number(args.confidence ?? 0.8)
      const tags = Array.isArray(args.tags) ? args.tags.map((t) => String(t)) : []
      if (!content) {
        return { content: [{ type: 'text', text: 'save 操作需要提供 content' }], isError: true }
      }

      // 去重检查：查找已有的相似记忆
      const similar = await memoryStore.findSimilar(content, type, category)
      if (similar) {
        // 已有相似记忆，如果新内容置信度更高或内容更长则更新
        if (confidence > similar.confidence + 0.1 || content.length > similar.content.length + 20) {
          memoryStore.update(similar.id, {
            content: content.length > similar.content.length ? content : similar.content,
            confidence: Math.max(similar.confidence, confidence),
            tags: Array.from(new Set([...similar.tags, ...tags]))
          })
          return {
            content: [
              {
                type: 'text',
                text: `检测到已有相似记忆，已更新: "${similar.content.slice(0, 60)}..."`
              }
            ]
          }
        }
        // 置信度不高，跳过保存
        return {
          content: [
            {
              type: 'text',
              text: `已存在相似记忆，跳过保存: "${similar.content.slice(0, 60)}..."`
            }
          ]
        }
      }

      const item = memoryStore.add({
        type,
        category,
        content,
        confidence: Math.max(0, Math.min(1, confidence)),
        source: 'ai',
        sessionId,
        tags,
        entities: []
      })
      return {
        content: [{ type: 'text', text: `已保存记忆 [${type}/${category}]: ${content.slice(0, 80)}` }]
      }
    }

    case 'search': {
      const keyword = String(args.keyword ?? '')
      const type = args.type ? (String(args.type) as MemoryTypeArg) : undefined
      const results = memoryStore.search({ keyword, type })
      if (results.length === 0) {
        return { content: [{ type: 'text', text: '未找到匹配的记忆' }] }
      }
      const text = results
        .slice(0, 20)
        .map((m, i) => `${i + 1}. [${m.type}/${m.category}] ${m.content}`)
        .join('\n')
      return {
        content: [{ type: 'text', text: `找到 ${results.length} 条记忆：\n${text}` }]
      }
    }

    case 'list': {
      const all = memoryStore.list()
      if (all.length === 0) {
        return { content: [{ type: 'text', text: '记忆库为空' }] }
      }
      const text = all
        .slice(0, 30)
        .map((m, i) => `${i + 1}. [${m.type}/${m.category}] ${m.content}`)
        .join('\n')
      return {
        content: [{ type: 'text', text: `共 ${all.length} 条记忆：\n${text}` }]
      }
    }

    case 'delete': {
      const id = String(args.id ?? '')
      if (!id) return { content: [{ type: 'text', text: 'delete 操作需要提供 id' }], isError: true }
      const ok = memoryStore.delete(id)
      return {
        content: [{ type: 'text', text: ok ? '已删除记忆' : '未找到该记忆' }],
        isError: !ok
      }
    }

    default:
      return {
        content: [{ type: 'text', text: `未知 Memory action: ${action}` }],
        isError: true
      }
  }
}

type MemoryTypeArg =
  | 'profile'
  | 'habit'
  | 'preference'
  | 'fact'
  | 'interaction'
  | 'skill'

// 导出供其他模块使用
export { terminalManager }

/**
 * 清理指定会话相关的本地工具状态（在会话删除时调用）。
 * 防止 todoLists 等 Map 随会话累积导致内存泄漏。
 */
export function cleanupSessionLocalState(sessionId: string): void {
  todoLists.delete(sessionId)
  // 清理该会话下所有子代理的 todoList（key 格式为 subagent:${subagentId}）
  // 子代理 id 是 UUID，无法直接按会话过滤，遍历清理所有 subagent: 前缀的条目
  // （子代理随会话删除已被 abort，其 todoList 不再需要）
  for (const key of Array.from(todoLists.keys())) {
    if (key.startsWith('subagent:')) {
      todoLists.delete(key)
    }
  }
}

/** 清理指定子代理的 todoList（子代理结束/取消时调用） */
export function cleanupSubagentTodoList(subagentId: string): void {
  todoLists.delete(`subagent:${subagentId}`)
}

// ============ Skill 技能工具 ============

async function executeSkill(
  args: Record<string, unknown>,
  sessionId?: string
): Promise<LocalToolResult> {
  const action = String(args.action ?? '')

  switch (action) {
    case 'search': {
      const keyword = String(args.keyword ?? '')
      if (!keyword) {
        return {
          content: [{ type: 'text', text: '请提供搜索关键词（keyword 参数）' }],
          isError: true
        }
      }
      const skills = skillsStore.search({ keyword })
      if (skills.length === 0) {
        return {
          content: [{ type: 'text', text: `未找到与 "${keyword}" 相关的技能` }]
        }
      }
      // 标记被使用
      skillsStore.markUsed(skills.map((s) => s.id))
      const lines = skills.map(
        (s, i) =>
          `${i + 1}. **${s.name}**\n   描述: ${s.description}\n   标签: ${s.tags.join(', ') || '无'}\n   内容预览: ${s.content.slice(0, 200)}${s.content.length > 200 ? '...' : ''}`
      )
      return {
        content: [
          { type: 'text', text: `找到 ${skills.length} 个相关技能：\n\n${lines.join('\n\n')}` }
        ]
      }
    }

    case 'list': {
      const skills = skillsStore.listAll()
      if (skills.length === 0) {
        return { content: [{ type: 'text', text: '当前没有任何技能' }] }
      }
      const lines = skills.map(
        (s, i) =>
          `${i + 1}. **${s.name}** ${s.enabled ? '✓' : '✗'}\n   描述: ${s.description}\n   来源: ${s.source} | 使用次数: ${s.useCount}`
      )
      return {
        content: [{ type: 'text', text: `共 ${skills.length} 个技能：\n\n${lines.join('\n\n')}` }]
      }
    }

    case 'get': {
      const name = String(args.name ?? '')
      if (!name) {
        return { content: [{ type: 'text', text: '请提供技能名称（name 参数）' }], isError: true }
      }
      const skill = skillsStore.getByName(name)
      if (!skill) {
        return { content: [{ type: 'text', text: `未找到技能: ${name}` }], isError: true }
      }
      skillsStore.markUsed([skill.id])
      return {
        content: [
          {
            type: 'text',
            text: `# ${skill.name}\n\n**描述**: ${skill.description}\n**标签**: ${skill.tags.join(', ') || '无'}\n**触发词**: ${skill.triggers.join(', ') || '无'}\n\n## 内容\n\n${skill.content}`
          }
        ]
      }
    }

    case 'save': {
      const name = String(args.name ?? '')
      const description = String(args.description ?? '')
      const content = String(args.content ?? '')
      if (!name || !content) {
        return {
          content: [{ type: 'text', text: '保存技能需要 name 和 content 参数' }],
          isError: true
        }
      }
      // 名称精确重复
      if (skillsStore.nameExists(name)) {
        return {
          content: [{ type: 'text', text: `技能名称 "${name}" 已存在，请使用其他名称` }],
          isError: true
        }
      }
      // 内容相似度去重：查找已有的相似技能
      const similar = skillsStore.findSimilar(name, content)
      if (similar) {
        // 已有相似技能，如果新内容更长则更新
        if (content.length > similar.content.length + 50) {
          const updated = skillsStore.update(similar.id, {
            name,
            description: description || similar.description,
            content,
            tags: Array.from(new Set([...similar.tags, ...(Array.isArray(args.tags) ? args.tags.map(String) : [])])),
            triggers: Array.from(new Set([...similar.triggers, ...(Array.isArray(args.triggers) ? args.triggers.map(String) : [])]))
          })
          return {
            content: [
              {
                type: 'text',
                text: `检测到已有相似技能 "${similar.name}"，已更新内容为更完整的版本。`
              }
            ]
          }
        }
        // 新内容不够长，跳过保存
        return {
          content: [
            {
              type: 'text',
              text: `已存在相似技能 "${similar.name}"，跳过保存。如需强制保存请使用不同名称。`
            }
          ]
        }
      }
      const tags = Array.isArray(args.tags) ? args.tags.map(String) : []
      const triggers = Array.isArray(args.triggers) ? args.triggers.map(String) : []
      const skill = skillsStore.generateSkill({
        name,
        description: description || `AI 生成的技能: ${name}`,
        content,
        tags,
        triggers,
        sessionId
      })
      return {
        content: [
          {
            type: 'text',
            text: `技能已保存: **${skill.name}**\n描述: ${skill.description}\n触发词: ${skill.triggers.join(', ') || '无'}\n\n技能将在未来遇到相关任务时自动检索使用。`
          }
        ]
      }
    }

    case 'delete': {
      const name = String(args.name ?? '')
      if (!name) {
        return { content: [{ type: 'text', text: '请提供技能名称（name 参数）' }], isError: true }
      }
      const skill = skillsStore.getByName(name)
      if (!skill) {
        return { content: [{ type: 'text', text: `未找到技能: ${name}` }], isError: true }
      }
      skillsStore.delete(skill.id)
      return { content: [{ type: 'text', text: `技能已删除: ${name}` }] }
    }

    default:
      return {
        content: [{ type: 'text', text: `未知的 Skill action: ${action}` }],
        isError: true
      }
  }
}

// ============ Snippet 代码片段工具 ============

async function executeSnippet(args: Record<string, unknown>): Promise<LocalToolResult> {
  const action = String(args.action ?? '')

  switch (action) {
    case 'search': {
      const keyword = String(args.keyword ?? '')
      // 空关键词返回所有启用的片段
      const snippets = snippetStore.search(keyword)
      if (snippets.length === 0) {
        return {
          content: [{ type: 'text', text: keyword ? `未找到与 "${keyword}" 相关的代码片段` : '当前没有启用的代码片段' }]
        }
      }
      const lines = snippets.map(
        (s, i) =>
          `${i + 1}. **${s.title}** (id: ${s.id}, language: ${s.language})\n   描述: ${s.description || '(无)'}\n   分类: ${s.category || '(无)'}\n   标签: ${s.tags.join(', ') || '无'}\n   内容预览: ${s.content.slice(0, 200)}${s.content.length > 200 ? '...' : ''}`
      )
      return {
        content: [
          { type: 'text', text: `找到 ${snippets.length} 个代码片段：\n\n${lines.join('\n\n')}` }
        ]
      }
    }

    case 'list': {
      const categoryFilter = args.category ? String(args.category) : ''
      let snippets = snippetStore.listEnabled()
      if (categoryFilter) {
        snippets = snippets.filter((s) => s.category === categoryFilter)
      }
      if (snippets.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: categoryFilter
                ? `没有分类为 "${categoryFilter}" 的启用代码片段`
                : '当前没有启用的代码片段'
            }
          ]
        }
      }
      const lines = snippets.map(
        (s, i) =>
          `${i + 1}. **${s.title}** (id: ${s.id})\n   语言: ${s.language} | 分类: ${s.category || '无'} | 使用次数: ${s.useCount}\n   描述: ${s.description || '(无)'}`
      )
      return {
        content: [
          {
            type: 'text',
            text: `共 ${snippets.length} 个启用的代码片段${categoryFilter ? `（分类: ${categoryFilter}）` : ''}：\n\n${lines.join('\n\n')}`
          }
        ]
      }
    }

    case 'get': {
      const id = String(args.id ?? '')
      if (!id) {
        return { content: [{ type: 'text', text: '请提供代码片段 ID（id 参数）' }], isError: true }
      }
      const snippet = snippetStore.get(id)
      if (!snippet) {
        return { content: [{ type: 'text', text: `未找到代码片段: ${id}` }], isError: true }
      }
      if (!snippet.enabled) {
        return { content: [{ type: 'text', text: `代码片段 "${snippet.title}" 已被禁用` }], isError: true }
      }
      // 标记被使用
      snippetStore.incrementUseCount(snippet.id)
      return {
        content: [
          {
            type: 'text',
            text: `# ${snippet.title}\n\n**语言**: ${snippet.language}\n**描述**: ${snippet.description || '(无)'}\n**分类**: ${snippet.category || '无'}\n**标签**: ${snippet.tags.join(', ') || '无'}\n\n## 代码内容\n\n\`\`\`${snippet.language}\n${snippet.content}\n\`\`\``
          }
        ]
      }
    }

    case 'save': {
      const title = String(args.title ?? '')
      const content = String(args.content ?? '')
      const language = String(args.language ?? 'plain')
      const description = String(args.description ?? '')
      const category = String(args.category ?? '')
      const tags = Array.isArray(args.tags) ? args.tags.map((t) => String(t)) : []
      if (!title || !content) {
        return {
          content: [{ type: 'text', text: '保存代码片段需要 title 和 content 参数' }],
          isError: true
        }
      }
      const snippet = snippetStore.create({
        title,
        description,
        language,
        content,
        tags,
        category
      })
      return {
        content: [
          {
            type: 'text',
            text: `代码片段已保存: **${snippet.title}** (id: ${snippet.id})\n语言: ${snippet.language}\n描述: ${snippet.description || '(无)'}\n\n未来可通过 id 检索调用此片段。`
          }
        ]
      }
    }

    case 'delete': {
      const id = String(args.id ?? '')
      if (!id) {
        return { content: [{ type: 'text', text: '请提供代码片段 ID（id 参数）' }], isError: true }
      }
      const snippet = snippetStore.get(id)
      if (!snippet) {
        return { content: [{ type: 'text', text: `未找到代码片段: ${id}` }], isError: true }
      }
      snippetStore.delete(id)
      return { content: [{ type: 'text', text: `代码片段已删除: ${snippet.title}` }] }
    }

    default:
      return {
        content: [{ type: 'text', text: `未知的 Snippet action: ${action}` }],
        isError: true
      }
  }
}

// ============ SystemInfo 工具 ============

async function executeSystemInfo(args: Record<string, unknown>): Promise<LocalToolResult> {
  const category = String(args.category ?? 'all')

  try {
    const parts: string[] = []

    if (category === 'os' || category === 'all') {
      const osInfo = execSync(
        'powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture,LastBootUpTime | ConvertTo-Json"',
        { encoding: 'utf-8', timeout: 15000 }
      ).trim()
      const os = JSON.parse(osInfo)
      const uptime = os.LastBootUpTime
        ? `${Math.round((Date.now() - new Date(os.LastBootUpTime).getTime()) / 3600000)} 小时`
        : '未知'
      parts.push(
        `## 操作系统\n- 系统: ${os.Caption}\n- 版本: ${os.Version} (Build ${os.BuildNumber})\n- 架构: ${os.OSArchitecture}\n- 运行时间: ${uptime}`
      )
    }

    if (category === 'cpu' || category === 'all') {
      const cpuInfo = execSync(
        'powershell -Command "Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed | ConvertTo-Json"',
        { encoding: 'utf-8', timeout: 15000 }
      ).trim()
      const cpu = JSON.parse(cpuInfo)
      parts.push(
        `## CPU\n- 型号: ${cpu.Name}\n- 核心数: ${cpu.NumberOfCores} 物理核 / ${cpu.NumberOfLogicalProcessors} 逻辑核\n- 最大频率: ${cpu.MaxClockSpeed} MHz`
      )
    }

    if (category === 'memory' || category === 'all') {
      const memInfo = execSync(
        'powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json"',
        { encoding: 'utf-8', timeout: 15000 }
      ).trim()
      const mem = JSON.parse(memInfo)
      const totalGB = (mem.TotalVisibleMemorySize / 1024 / 1024).toFixed(1)
      const freeGB = (mem.FreePhysicalMemory / 1024 / 1024).toFixed(1)
      const usedGB = (parseFloat(totalGB) - parseFloat(freeGB)).toFixed(1)
      parts.push(
        `## 内存\n- 总计: ${totalGB} GB\n- 已用: ${usedGB} GB (${((parseFloat(usedGB) / parseFloat(totalGB)) * 100).toFixed(0)}%)\n- 可用: ${freeGB} GB`
      )
    }

    if (category === 'disk' || category === 'all') {
      const diskInfo = execSync(
        'powershell -Command "Get-CimInstance Win32_LogicalDisk -Filter \'DriveType=3\' | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json"',
        { encoding: 'utf-8', timeout: 15000 }
      ).trim()
      const disks = JSON.parse(diskInfo)
      const diskArr = Array.isArray(disks) ? disks : [disks]
      const diskLines = diskArr.map((d: { DeviceID: string; Size: number; FreeSpace: number }) => {
        const total = (d.Size / 1024 / 1024 / 1024).toFixed(1)
        const free = (d.FreeSpace / 1024 / 1024 / 1024).toFixed(1)
        const used = (parseFloat(total) - parseFloat(free)).toFixed(1)
        return `- ${d.DeviceID} 总计 ${total} GB, 已用 ${used} GB, 可用 ${free} GB`
      })
      parts.push(`## 磁盘\n${diskLines.join('\n')}`)
    }

    if (category === 'network' || category === 'all') {
      const netInfo = execSync(
        'powershell -Command "Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway} | Select-Object InterfaceAlias,IPv4Address | ConvertTo-Json"',
        { encoding: 'utf-8', timeout: 15000 }
      ).trim()
      try {
        const net = JSON.parse(netInfo)
        const netArr = Array.isArray(net) ? net : [net]
        const netLines = netArr.map((n: { InterfaceAlias: string; IPv4Address: { IPAddress: string } }) =>
          `- ${n.InterfaceAlias}: ${n.IPv4Address?.IPAddress ?? 'N/A'}`
        )
        parts.push(`## 网络\n${netLines.join('\n')}`)
      } catch {
        parts.push('## 网络\n- 无法获取网络信息')
      }
    }

    return { content: [{ type: 'text', text: parts.join('\n\n') }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `获取系统信息失败: ${(err as Error).message}` }],
      isError: true
    }
  }
}

// ============ WebSearch 工具 ============

async function executeWebSearch(args: Record<string, unknown>): Promise<LocalToolResult> {
  const query = String(args.query ?? '')
  const num = Math.min(Number(args.num ?? 5), 10)

  if (!query) {
    return { content: [{ type: 'text', text: '请提供搜索关键词（query 参数）' }], isError: true }
  }

  try {
    // 使用 Bing 搜索（无需 API Key）
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${num}`
    const https = await import('https')
    const html = await new Promise<string>((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        timeout: 15000
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          // 跟随重定向
          const redirectUrl = res.headers.location
          if (redirectUrl) {
            https.get(redirectUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            }, (res2) => {
              let data = ''
              res2.on('data', (chunk) => { data += chunk })
              res2.on('end', () => resolve(data))
            }).on('error', reject)
          } else {
            reject(new Error('重定向但无 location'))
          }
          return
        }
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve(data))
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('搜索请求超时')) })
    })

    // 解析 Bing 搜索结果
    const results: Array<{ title: string; snippet: string; url: string }> = []
    const liRegex = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/g
    let match: RegExpExecArray | null
    while ((match = liRegex.exec(html)) !== null && results.length < num) {
      const block = match[1]
      const titleMatch = block.match(/<h2[^>]*><a[^>]*>([\s\S]*?)<\/a><\/h2>/)
      const urlMatch = block.match(/<h2[^>]*><a[^>]*href="([^"]*)"/)
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/)
      if (titleMatch) {
        results.push({
          title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
          url: urlMatch ? urlMatch[1] : '',
          snippet: snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : ''
        })
      }
    }

    if (results.length === 0) {
      return { content: [{ type: 'text', text: `未找到与 "${query}" 相关的搜索结果` }] }
    }

    const text = results
      .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   链接: ${r.url}`)
      .join('\n\n')
    return { content: [{ type: 'text', text: `搜索 "${query}" 的结果（${results.length} 条）：\n\n${text}` }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `搜索失败: ${(err as Error).message}` }],
      isError: true
    }
  }
}

// ============ WebFetch 工具 ============

async function executeWebFetch(args: Record<string, unknown>): Promise<LocalToolResult> {
  const url = String(args.url ?? '')
  const maxLength = Number(args.maxLength ?? 5000)

  if (!url) {
    return { content: [{ type: 'text', text: '请提供 URL' }], isError: true }
  }

  try {
    const protocol = url.startsWith('https') ? await import('https') : await import('http')
    const html = await new Promise<string>((resolve, reject) => {
      const req = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        timeout: 15000
      }, (res) => {
        if (res.statusCode && (res.statusCode === 301 || res.statusCode === 302)) {
          const redirectUrl = res.headers.location
          if (redirectUrl) {
            protocol.get(redirectUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0' }
            }, (res2) => {
              let data = ''
              res2.on('data', (chunk) => { data += chunk })
              res2.on('end', () => resolve(data))
            }).on('error', reject)
          } else {
            reject(new Error('重定向但无 location'))
          }
          return
        }
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve(data))
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
    })

    // 提取正文文本
    let text = html
      // 移除 script 和 style
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      // 保留换行
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      // 移除所有标签
      .replace(/<[^>]+>/g, '')
      // 解码 HTML 实体
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // 清理多余空白
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (text.length > maxLength) {
      text = text.slice(0, maxLength) + '\n...(内容已截断)'
    }

    return { content: [{ type: 'text', text: `网页内容 (${url}):\n\n${text}` }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `抓取网页失败: ${(err as Error).message}` }],
      isError: true
    }
  }
}

// ============ WindowManager 工具 ============

async function executeWindowManager(args: Record<string, unknown>): Promise<LocalToolResult> {
  const action = String(args.action ?? '')
  const title = String(args.title ?? '')

  try {
    switch (action) {
      case 'list': {
        const windows = BrowserWindow.getAllWindows()
        const visible = windows.filter((w) => w.isVisible())
        const lines = visible.map((w, i) => {
          const bounds = w.getBounds()
          return `${i + 1}. "${w.getTitle()}" (${bounds.width}x${bounds.height} @ ${bounds.x},${bounds.y})`
        })
        return {
          content: [{ type: 'text', text: visible.length === 0 ? '无可见窗口' : `可见窗口 (${visible.length}):\n${lines.join('\n')}` }]
        }
      }

      case 'focus':
      case 'minimize':
      case 'maximize':
      case 'restore':
      case 'close': {
        if (!title) return { content: [{ type: 'text', text: '需要提供 title 参数' }], isError: true }
        const windows = BrowserWindow.getAllWindows().filter((w) =>
          w.isVisible() && w.getTitle().toLowerCase().includes(title.toLowerCase())
        )
        if (windows.length === 0) {
          return { content: [{ type: 'text', text: `未找到标题包含 "${title}" 的窗口` }], isError: true }
        }
        for (const win of windows) {
          if (action === 'focus') { win.focus(); win.show() }
          else if (action === 'minimize') win.minimize()
          else if (action === 'maximize') win.maximize()
          else if (action === 'restore') win.restore()
          else if (action === 'close') win.close()
        }
        return { content: [{ type: 'text', text: `已对 ${windows.length} 个窗口执行 ${action}` }] }
      }

      case 'move': {
        if (!title) return { content: [{ type: 'text', text: '需要提供 title 参数' }], isError: true }
        const x = Number(args.x ?? 0)
        const y = Number(args.y ?? 0)
        const windows = BrowserWindow.getAllWindows().filter((w) =>
          w.isVisible() && w.getTitle().toLowerCase().includes(title.toLowerCase())
        )
        if (windows.length === 0) {
          return { content: [{ type: 'text', text: `未找到标题包含 "${title}" 的窗口` }], isError: true }
        }
        for (const win of windows) {
          const bounds = win.getBounds()
          win.setBounds({ ...bounds, x, y })
        }
        return { content: [{ type: 'text', text: `已移动窗口到 (${x}, ${y})` }] }
      }

      case 'resize': {
        if (!title) return { content: [{ type: 'text', text: '需要提供 title 参数' }], isError: true }
        const width = Number(args.width ?? 800)
        const height = Number(args.height ?? 600)
        const windows = BrowserWindow.getAllWindows().filter((w) =>
          w.isVisible() && w.getTitle().toLowerCase().includes(title.toLowerCase())
        )
        if (windows.length === 0) {
          return { content: [{ type: 'text', text: `未找到标题包含 "${title}" 的窗口` }], isError: true }
        }
        for (const win of windows) {
          const bounds = win.getBounds()
          win.setBounds({ ...bounds, width, height })
        }
        return { content: [{ type: 'text', text: `已调整窗口大小为 ${width}x${height}` }] }
      }

      case 'getposition': {
        if (!title) return { content: [{ type: 'text', text: '需要提供 title 参数' }], isError: true }
        const windows = BrowserWindow.getAllWindows().filter((w) =>
          w.isVisible() && w.getTitle().toLowerCase().includes(title.toLowerCase())
        )
        if (windows.length === 0) {
          return { content: [{ type: 'text', text: `未找到标题包含 "${title}" 的窗口` }], isError: true }
        }
        const bounds = windows[0].getBounds()
        return {
          content: [{ type: 'text', text: `窗口 "${windows[0].getTitle()}" 位置: x=${bounds.x}, y=${bounds.y}, 宽=${bounds.width}, 高=${bounds.height}` }]
        }
      }

      default:
        return { content: [{ type: 'text', text: `未知 WindowManager action: ${action}` }], isError: true }
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `窗口操作失败: ${(err as Error).message}` }], isError: true }
  }
}

// ============ SystemAudio 工具 ============

async function executeSystemAudio(args: Record<string, unknown>): Promise<LocalToolResult> {
  const action = String(args.action ?? '')

  try {
    switch (action) {
      case 'get': {
        const output = execSync(
          'powershell -Command "Get-CimInstance -Namespace root/cimv2 -ClassName Win32_SoundDevice | Select-Object Name,Status | ConvertTo-Json"',
          { encoding: 'utf-8', timeout: 10000 }
        ).trim()
        // 使用 PowerShell 获取音量（通过 nircmd 或系统 API）
        const volOutput = execSync(
          'powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys(\'{Volume_Mute}\'); $obj.SendKeys(\'{Volume_Mute}\'); Write-Output \'toggled\'"',
          { encoding: 'utf-8', timeout: 10000 }
        ).trim()
        return {
          content: [{ type: 'text', text: `音频设备信息:\n${output}\n\n注意: 精确音量值需要额外工具支持。当前已尝试获取音量状态。` }]
        }
      }

      case 'set': {
        const volume = Math.max(0, Math.min(100, Number(args.volume ?? 50)))
        // 通过 PowerShell 调用系统 API 设置音量
        const psScript = `
          Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class Audio { [DllImport("user32.dll")] public static extern IntPtr SendMessageW(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam); }'
          $vol = ${volume}
          # 使用 nircmd 或键盘快捷键模拟音量调整
          $o = New-Object -ComObject WScript.Shell
          # 计算需要按多少次音量增/减键（每次约 2%）
          $current = 50
          $diff = $vol - $current
          if ($diff -gt 0) { for ($i=0; $i -lt [Math]::Round($diff/2); $i++) { $o.SendKeys("{Volume_Up}") } }
          elseif ($diff -lt 0) { for ($i=0; $i -lt [Math]::Round([Math]::Abs($diff)/2); $i++) { $o.SendKeys("{Volume_Down}") } }
          Write-Output "Volume set to approximately $vol%"
        `
        const result = execSync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, {
          encoding: 'utf-8',
          timeout: 15000
        }).trim()
        return { content: [{ type: 'text', text: result || `已设置音量到约 ${volume}%` }] }
      }

      case 'mute': {
        execSync(
          'powershell -Command "$o = New-Object -ComObject WScript.Shell; $o.SendKeys(\'{Volume_Mute}\')"',
          { encoding: 'utf-8', timeout: 10000 }
        )
        return { content: [{ type: 'text', text: '已静音' }] }
      }

      case 'unmute': {
        // 再按一次取消静音（如果当前是静音状态）
        execSync(
          'powershell -Command "$o = New-Object -ComObject WScript.Shell; $o.SendKeys(\'{Volume_Mute}\')"',
          { encoding: 'utf-8', timeout: 10000 }
        )
        return { content: [{ type: 'text', text: '已取消静音' }] }
      }

      default:
        return { content: [{ type: 'text', text: `未知 SystemAudio action: ${action}` }], isError: true }
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `音频操作失败: ${(err as Error).message}` }], isError: true }
  }
}

// ============ ServiceManager 工具 ============

async function executeServiceManager(args: Record<string, unknown>): Promise<LocalToolResult> {
  const action = String(args.action ?? '')
  const name = String(args.name ?? '')
  const statusFilter = String(args.status ?? 'all')

  try {
    switch (action) {
      case 'list': {
        const filter = statusFilter === 'running' ? 'Where-Object {$_.Status -eq "Running"}' :
                       statusFilter === 'stopped' ? 'Where-Object {$_.Status -eq "Stopped"}' : ''
        const output = execSync(
          `powershell -Command "Get-Service ${filter} | Select-Object Name,DisplayName,Status | Sort-Object Status,Name | ConvertTo-Json -Depth 1"`,
          { encoding: 'utf-8', timeout: 30000 }
        ).trim()
        const services = JSON.parse(output)
        const arr = Array.isArray(services) ? services : [services]
        const lines = arr.slice(0, 50).map((s: { Name: string; DisplayName: string; Status: string }) =>
          `- ${s.Status === 'Running' ? '✓' : '✗'} ${s.Name} (${s.DisplayName || 'N/A'})`
        )
        return {
          content: [{ type: 'text', text: `服务列表 (${arr.length} 个，显示前 50):\n${lines.join('\n')}` }]
        }
      }

      case 'status': {
        if (!name) return { content: [{ type: 'text', text: '需要提供服务名称' }], isError: true }
        // 安全校验：拒绝含 shell 元字符的服务名，防止命令注入
        const nameErr = validateSafeIdentifier(name, '服务名')
        if (nameErr) return { content: [{ type: 'text', text: nameErr }], isError: true }
        const output = execSync(
          `powershell -Command "Get-Service -Name '${name}' | Select-Object Name,DisplayName,Status,StartType | ConvertTo-Json"`,
          { encoding: 'utf-8', timeout: 10000 }
        ).trim()
        const svc = JSON.parse(output)
        return {
          content: [{ type: 'text', text: `服务: ${svc.Name}\n显示名: ${svc.DisplayName}\n状态: ${svc.Status}\n启动类型: ${svc.StartType}` }]
        }
      }

      case 'start': {
        if (!name) return { content: [{ type: 'text', text: '需要提供服务名称' }], isError: true }
        const nameErr = validateSafeIdentifier(name, '服务名')
        if (nameErr) return { content: [{ type: 'text', text: nameErr }], isError: true }
        execSync(`powershell -Command "Start-Service -Name '${name}'"`, { encoding: 'utf-8', timeout: 30000 })
        return { content: [{ type: 'text', text: `已启动服务: ${name}` }] }
      }

      case 'stop': {
        if (!name) return { content: [{ type: 'text', text: '需要提供服务名称' }], isError: true }
        const nameErr = validateSafeIdentifier(name, '服务名')
        if (nameErr) return { content: [{ type: 'text', text: nameErr }], isError: true }
        execSync(`powershell -Command "Stop-Service -Name '${name}' -Force"`, { encoding: 'utf-8', timeout: 30000 })
        return { content: [{ type: 'text', text: `已停止服务: ${name}` }] }
      }

      case 'restart': {
        if (!name) return { content: [{ type: 'text', text: '需要提供服务名称' }], isError: true }
        const nameErr = validateSafeIdentifier(name, '服务名')
        if (nameErr) return { content: [{ type: 'text', text: nameErr }], isError: true }
        execSync(`powershell -Command "Restart-Service -Name '${name}' -Force"`, { encoding: 'utf-8', timeout: 30000 })
        return { content: [{ type: 'text', text: `已重启服务: ${name}` }] }
      }

      default:
        return { content: [{ type: 'text', text: `未知 ServiceManager action: ${action}` }], isError: true }
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `服务操作失败: ${(err as Error).message}` }], isError: true }
  }
}

// ============ NetworkTools 工具 ============

async function executeNetworkTools(args: Record<string, unknown>): Promise<LocalToolResult> {
  const action = String(args.action ?? '')

  try {
    switch (action) {
      case 'ping': {
        const host = String(args.host ?? '')
        const count = Math.min(Number(args.count ?? 4), 10)
        if (!host) return { content: [{ type: 'text', text: '需要提供 host 参数' }], isError: true }
        // 安全校验：拒绝含 shell 元字符的主机名，防止命令注入
        const hostErr = validateHostname(host)
        if (hostErr) {
          return { content: [{ type: 'text', text: hostErr }], isError: true }
        }
        const output = execSync(
          `ping -n ${count} ${host}`,
          { encoding: 'utf-8', timeout: 30000 }
        )
        return { content: [{ type: 'text', text: output.trim() }] }
      }

      case 'ip': {
        // 获取内网 IP
        const localIp = execSync(
          'powershell -Command "(Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway}).IPv4Address.IPAddress"',
          { encoding: 'utf-8', timeout: 10000 }
        ).trim()
        // 获取外网 IP
        let publicIp = '获取失败'
        try {
          publicIp = execSync(
            'powershell -Command "(Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content"',
            { encoding: 'utf-8', timeout: 10000 }
          ).trim()
        } catch {
          // ignore
        }
        return {
          content: [{ type: 'text', text: `内网 IP: ${localIp || '未找到'}\n外网 IP: ${publicIp}` }]
        }
      }

      case 'portcheck': {
        const host = String(args.host ?? '')
        const port = Number(args.port ?? 0)
        if (!host || !port) return { content: [{ type: 'text', text: '需要提供 host 和 port 参数' }], isError: true }
        const output = execSync(
          `powershell -Command "Test-NetConnection -ComputerName '${host}' -Port ${port} -WarningAction SilentlyContinue | Select-Object TcpTestSucceeded,RemoteAddress,RemotePort | ConvertTo-Json"`,
          { encoding: 'utf-8', timeout: 15000 }
        ).trim()
        const result = JSON.parse(output)
        const ok = result.TcpTestSucceeded === true
        return {
          content: [{ type: 'text', text: `端口检测: ${host}:${port} ${ok ? '✓ 开放' : '✗ 关闭/不可达'}` }]
        }
      }

      default:
        return { content: [{ type: 'text', text: `未知 NetworkTools action: ${action}` }], isError: true }
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `网络操作失败: ${(err as Error).message}` }], isError: true }
  }
}

// ============ ZipArchive 工具 ============

async function executeZipArchive(args: Record<string, unknown>): Promise<LocalToolResult> {
  const action = String(args.action ?? '')
  const source = String(args.source ?? '')
  const destination = String(args.destination ?? '')

  if (!source || !destination) {
    return { content: [{ type: 'text', text: '需要提供 source 和 destination 参数' }], isError: true }
  }

  try {
    switch (action) {
      case 'compress': {
        // 使用 PowerShell 的 Compress-Archive
        const srcStat = await fs.stat(source)
        const srcPath = srcStat.isDirectory() ? `${source}\\*` : source
        execSync(
          `powershell -Command "Compress-Archive -Path '${srcPath}' -DestinationPath '${destination}' -Force"`,
          { encoding: 'utf-8', timeout: 120000 }
        )
        const zipStat = await fs.stat(destination)
        return {
          content: [{ type: 'text', text: `已压缩: ${source} → ${destination} (${formatSize(zipStat.size)})` }]
        }
      }

      case 'extract': {
        execSync(
          `powershell -Command "Expand-Archive -Path '${source}' -DestinationPath '${destination}' -Force"`,
          { encoding: 'utf-8', timeout: 120000 }
        )
        return {
          content: [{ type: 'text', text: `已解压: ${source} → ${destination}` }]
        }
      }

      default:
        return { content: [{ type: 'text', text: `未知 ZipArchive action: ${action}` }], isError: true }
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `压缩/解压失败: ${(err as Error).message}` }], isError: true }
  }
}

// ============ BatchFile 工具 ============

async function executeBatchFile(args: Record<string, unknown>): Promise<LocalToolResult> {
  const action = String(args.action ?? '')

  switch (action) {
    case 'rename':
      return await batchRename(args)
    case 'compressImage':
      return await batchCompressImage(args)
    case 'convertImage':
      return await batchConvertImage(args)
    case 'batchMove':
      return await batchMove(args)
    default:
      return { content: [{ type: 'text', text: `未知 BatchFile action: ${action}` }], isError: true }
  }
}

/** 批量重命名：支持 prefix/suffix/sequence/replace 四种模式 */
async function batchRename(args: Record<string, unknown>): Promise<LocalToolResult> {
  const dir = String(args.dir ?? '')
  const pattern = String(args.pattern ?? '*')
  const mode = String(args.mode ?? 'sequence')

  if (!dir) return { content: [{ type: 'text', text: '缺少 dir 参数' }], isError: true }

  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (err) {
    return { content: [{ type: 'text', text: `读取目录失败: ${(err as Error).message}` }], isError: true }
  }

  const files = entries.filter((e) => e.isFile() && matchGlob(e.name, pattern))
  if (files.length === 0) {
    return { content: [{ type: 'text', text: '未找到匹配文件' }] }
  }

  const results: string[] = []
  let startNum = Number(args.startNum ?? 1)
  const prefix = String(args.prefix ?? '')
  const suffix = String(args.suffix ?? '')
  const find = String(args.find ?? '')
  const replace = String(args.replace ?? '')

  for (const file of files) {
    const ext = extname(file.name)
    const nameWithoutExt = basename(file.name, ext)
    let newName = file.name

    switch (mode) {
      case 'prefix':
        newName = `${prefix}${file.name}`
        break
      case 'suffix':
        newName = `${nameWithoutExt}${suffix}${ext}`
        break
      case 'sequence':
        newName = `${prefix || 'file'}_${String(startNum).padStart(3, '0')}${ext}`
        startNum++
        break
      case 'replace':
        newName = nameWithoutExt.split(find).join(replace) + ext
        break
      default:
        results.push(`✗ ${file.name}: 未知模式 ${mode}`)
        continue
    }

    if (newName !== file.name) {
      const oldPath = join(dir, file.name)
      const newPath = join(dir, newName)
      try {
        await fs.rename(oldPath, newPath)
        results.push(`${file.name} → ${newName}`)
      } catch (err) {
        results.push(`✗ ${file.name}: ${(err as Error).message}`)
      }
    }
  }

  return {
    content: [{ type: 'text', text: `批量重命名完成（${results.length}/${files.length}）:\n${results.join('\n')}` }]
  }
}

/** 批量图片压缩：使用 PowerShell + System.Drawing 调整质量和尺寸 */
async function batchCompressImage(args: Record<string, unknown>): Promise<LocalToolResult> {
  const dir = String(args.dir ?? '')
  const pattern = String(args.pattern ?? '*.{jpg,jpeg,png}')
  const quality = Math.min(100, Math.max(1, Number(args.quality ?? 80)))
  const outputDir = String(args.outputDir ?? dir)
  const maxWidth = args.maxWidth ? Number(args.maxWidth) : 0
  const maxHeight = args.maxHeight ? Number(args.maxHeight) : 0

  if (!dir) return { content: [{ type: 'text', text: '缺少 dir 参数' }], isError: true }

  // 通过读取目录获取匹配文件列表，传递给 PowerShell 处理
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (err) {
    return { content: [{ type: 'text', text: `读取目录失败: ${(err as Error).message}` }], isError: true }
  }

  const files = entries.filter((e) => e.isFile() && matchGlob(e.name, pattern))
  if (files.length === 0) {
    return { content: [{ type: 'text', text: '未找到匹配的图片文件' }] }
  }

  // 确保输出目录存在
  try {
    await fs.mkdir(outputDir, { recursive: true })
  } catch (err) {
    return { content: [{ type: 'text', text: `创建输出目录失败: ${(err as Error).message}` }], isError: true }
  }

  // 构建文件列表 JSON，避免在 PowerShell 中拼接字符串引发引号问题
  const fileList = JSON.stringify(files.map((f) => f.name))
  const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dir = '${dir.replace(/'/g, "''")}'
$outputDir = '${outputDir.replace(/'/g, "''")}'
$quality = ${quality}
$maxWidth = ${maxWidth}
$maxHeight = ${maxHeight}
$fileNames = ${fileList} | ConvertFrom-Json
$count = 0
$errors = @()
foreach ($fileName in $fileNames) {
  try {
    $srcPath = Join-Path $dir $fileName
    $img = [System.Drawing.Image]::FromFile($srcPath)
    $width = $img.Width
    $height = $img.Height
    if ($maxWidth -gt 0 -and $width -gt $maxWidth) {
      $ratio = $maxWidth / $width
      $width = $maxWidth
      $height = [int]($height * $ratio)
    }
    if ($maxHeight -gt 0 -and $height -gt $maxHeight) {
      $ratio = $maxHeight / $height
      $height = $maxHeight
      $width = [int]($width * $ratio)
    }
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($img, 0, 0, $width, $height)
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParam = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
    $encoderParams.Param[0] = $encoderParam
    $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($fileName)
    $outPath = Join-Path $outputDir ($baseName + '.jpg')
    $bmp.Save($outPath, $jpegCodec, $encoderParams)
    $graphics.Dispose()
    $bmp.Dispose()
    $img.Dispose()
    $count++
  } catch {
    $errors += "$fileName: $_"
  }
}
Write-Output "DONE: $count files compressed"
if ($errors.Count -gt 0) {
  Write-Output "ERRORS:"
  $errors | ForEach-Object { Write-Output "  $_" }
}
`

  try {
    const result = execSync(
      `powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 120000 }
    )
    return { content: [{ type: 'text', text: result.trim() || `图片压缩完成（共 ${files.length} 个文件）` }] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `图片压缩失败: ${msg}` }], isError: true }
  }
}

/** 图片格式转换：使用 PowerShell + System.Drawing */
async function batchConvertImage(args: Record<string, unknown>): Promise<LocalToolResult> {
  const dir = String(args.dir ?? '')
  const pattern = String(args.pattern ?? '*.{jpg,jpeg,png,bmp}')
  const toFormat = String(args.toFormat ?? '').toLowerCase()
  const outputDir = String(args.outputDir ?? dir)

  if (!dir) return { content: [{ type: 'text', text: '缺少 dir 参数' }], isError: true }
  if (!['jpg', 'png', 'webp', 'bmp'].includes(toFormat)) {
    return { content: [{ type: 'text', text: `不支持的目标格式: ${toFormat}（支持 jpg/png/webp/bmp）` }], isError: true }
  }

  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (err) {
    return { content: [{ type: 'text', text: `读取目录失败: ${(err as Error).message}` }], isError: true }
  }

  const files = entries.filter(
    (e) => e.isFile() && matchGlob(e.name, pattern) && e.name.toLowerCase().endsWith(`.${toFormat}`) === false
  )
  if (files.length === 0) {
    return { content: [{ type: 'text', text: '未找到需要转换的图片文件' }] }
  }

  try {
    await fs.mkdir(outputDir, { recursive: true })
  } catch (err) {
    return { content: [{ type: 'text', text: `创建输出目录失败: ${(err as Error).message}` }], isError: true }
  }

  const fileList = JSON.stringify(files.map((f) => f.name))
  // 根据目标格式选择 MIME（用于查找 codec）
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    png: 'image/png',
    bmp: 'image/bmp',
    webp: 'image/webp'
  }
  const mimeType = mimeMap[toFormat] ?? 'image/jpeg'
  // 根据目标格式选择 ImageFormat 枚举名（用于无 codec 时的兜底，仅对 jpg/png/bmp 有效）
  const imageFormatName =
    toFormat === 'jpg' ? 'Jpeg' : toFormat === 'png' ? 'Png' : toFormat === 'bmp' ? 'Bmp' : ''

  const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dir = '${dir.replace(/'/g, "''")}'
$outputDir = '${outputDir.replace(/'/g, "''")}'
$toFormat = '${toFormat}'
$mimeType = '${mimeType}'
$imageFormatName = '${imageFormatName}'
$fileNames = ${fileList} | ConvertFrom-Json
$count = 0
$errors = @()
foreach ($fileName in $fileNames) {
  try {
    $srcPath = Join-Path $dir $fileName
    $img = [System.Drawing.Image]::FromFile($srcPath)
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($fileName)
    $outPath = Join-Path $outputDir ($baseName + '.' + $toFormat)
    if ($toFormat -eq 'jpg') {
      $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
      $encoderParam = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]85)
      $encoderParams.Param[0] = $encoderParam
      $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq $mimeType }
      $img.Save($outPath, $codec, $encoderParams)
    } else {
      $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq $mimeType }
      if ($codec) {
        $img.Save($outPath, $codec, $null)
      } elseif ($imageFormatName -ne '') {
        # jpg/png/bmp 无 codec 时使用 ImageFormat 兜底
        $bmp = New-Object System.Drawing.Bitmap($img)
        $format = [System.Drawing.Imaging.ImageFormat]::$imageFormatName
        $bmp.Save($outPath, $format)
        $bmp.Dispose()
      } else {
        # WebP 等系统不原生支持的格式：无 codec 时无法编码
        throw "No encoder available for format '$toFormat' (codec not installed on this system)"
      }
    }
    $img.Dispose()
    $count++
  } catch {
    $errors += "$fileName: $_"
  }
}
Write-Output "DONE: $count files converted to $toFormat"
if ($errors.Count -gt 0) {
  Write-Output "ERRORS:"
  $errors | ForEach-Object { Write-Output "  $_" }
}
`

  try {
    const result = execSync(
      `powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 120000 }
    )
    return { content: [{ type: 'text', text: result.trim() || `图片格式转换完成（共 ${files.length} 个文件）` }] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `图片格式转换失败: ${msg}` }], isError: true }
  }
}

/** 批量移动/复制文件 */
async function batchMove(args: Record<string, unknown>): Promise<LocalToolResult> {
  const dir = String(args.dir ?? '')
  const pattern = String(args.pattern ?? '*')
  const destination = String(args.destination ?? '')
  const copy = args.copy === true

  if (!dir) return { content: [{ type: 'text', text: '缺少 dir 参数' }], isError: true }
  if (!destination) return { content: [{ type: 'text', text: '缺少 destination 参数' }], isError: true }

  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (err) {
    return { content: [{ type: 'text', text: `读取目录失败: ${(err as Error).message}` }], isError: true }
  }

  const files = entries.filter((e) => e.isFile() && matchGlob(e.name, pattern))
  if (files.length === 0) {
    return { content: [{ type: 'text', text: '未找到匹配文件' }] }
  }

  try {
    await fs.mkdir(destination, { recursive: true })
  } catch (err) {
    return { content: [{ type: 'text', text: `创建目标目录失败: ${(err as Error).message}` }], isError: true }
  }

  const results: string[] = []
  let successCount = 0
  for (const file of files) {
    const srcPath = join(dir, file.name)
    const dstPath = join(destination, file.name)
    try {
      if (copy) {
        await fs.copyFile(srcPath, dstPath)
        results.push(`✓ 复制 ${file.name}`)
      } else {
        await fs.rename(srcPath, dstPath)
        results.push(`✓ 移动 ${file.name}`)
      }
      successCount++
    } catch (err) {
      results.push(`✗ ${file.name}: ${(err as Error).message}`)
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: `${copy ? '批量复制' : '批量移动'}完成（${successCount}/${files.length}）:\n${results.join('\n')}`
      }
    ]
  }
}

// ============ SystemOptimizer 工具（系统优化） ============

async function executeSystemOptimizer(
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const action = String(args.action ?? '')

  switch (action) {
    case 'analyze':
      return await optimizerAnalyze(args)
    case 'clean':
      return await optimizerClean(args)
    case 'top_processes':
      return await optimizerTopProcesses()
    case 'kill_process':
      return await optimizerKillProcess(args)
    case 'startup_list':
      return await optimizerStartupList()
    case 'disable_startup':
      return await optimizerDisableStartup(args)
    case 'optimize':
      return await optimizerOneClick()
    default:
      return {
        content: [{ type: 'text', text: `未知 SystemOptimizer action: ${action}` }],
        isError: true
      }
  }
}

/** 分析系统状态：磁盘空间、临时文件大小、内存占用、启动项数量 */
async function optimizerAnalyze(
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const parts: string[] = ['=== 系统状态分析 ===\n']

  // 1. 磁盘空间
  parts.push('【磁盘空间】')
  try {
    const diskInfo = execSync(
      'powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{N=\'Used(GB)\';E={[math]::Round($_.Used/1GB,1)}},@{N=\'Free(GB)\';E={[math]::Round($_.Free/1GB,1)}} | ConvertTo-Json"',
      { encoding: 'utf-8', timeout: 15000 }
    ).trim()
    const drives = JSON.parse(diskInfo)
    const driveList = Array.isArray(drives) ? drives : [drives]
    for (const d of driveList) {
      const total = (d['Used(GB)'] ?? 0) + (d['Free(GB)'] ?? 0)
      const usedPct = total > 0 ? Math.round((d['Used(GB)'] / total) * 100) : 0
      parts.push(`  ${d.Name}: 已用 ${d['Used(GB)']}GB / 可用 ${d['Free(GB)']}GB (${usedPct}%)`)
    }
  } catch {
    parts.push('  (获取磁盘信息失败)')
  }

  // 2. 临时文件大小
  parts.push('\n【临时文件】')
  const tempTargets: Array<{ name: string; path: string }> = []
  const targetArg = String(args.target ?? 'all')
  const tempDir = process.env.TEMP ?? ''
  const winTemp = process.env.WINDIR ? join(process.env.WINDIR, 'Temp') : ''
  const prefetch = process.env.WINDIR ? join(process.env.WINDIR, 'Prefetch') : ''

  if (targetArg === 'all' || targetArg === 'temp') tempTargets.push({ name: '用户临时', path: tempDir })
  if (targetArg === 'all' || targetArg === 'temp') tempTargets.push({ name: '系统临时', path: winTemp })
  if (targetArg === 'all' || targetArg === 'prefetch') tempTargets.push({ name: '预读取', path: prefetch })
  if (targetArg === 'all' || targetArg === 'recycle') {
    try {
      const recycleSize = execSync(
        'powershell -NoProfile -Command "$shell=New-Object -ComObject Shell.Application; $rb=$shell.Namespace(10); $items=$rb.Items(); $size=0; foreach($i in $items){$size+=$i.Size}; [math]::Round($size/1MB,1)"',
        { encoding: 'utf-8', timeout: 30000 }
      ).trim()
      parts.push(`  回收站: ${recycleSize} MB`)
    } catch {
      parts.push('  回收站: (无法获取)')
    }
  }

  for (const t of tempTargets) {
    if (!t.path) continue
    try {
      const size = await getDirSize(t.path)
      parts.push(`  ${t.name} (${t.path}): ${formatSize(size)}`)
    } catch {
      parts.push(`  ${t.name}: (无法访问)`)
    }
  }

  // 3. 内存占用 Top 进程
  parts.push('\n【内存占用 Top 10 进程】')
  try {
    const procInfo = execSync(
      'powershell -NoProfile -Command "Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10 Name,@{N=\'Mem(MB)\';E={[math]::Round($_.WorkingSet/1MB,1)}},Id | ConvertTo-Json"',
      { encoding: 'utf-8', timeout: 15000 }
    ).trim()
    const procs = JSON.parse(procInfo)
    const procList = Array.isArray(procs) ? procs : [procs]
    for (const p of procList) {
      parts.push(`  ${p.Name} (PID:${p.Id}): ${p['Mem(MB)']} MB`)
    }
  } catch {
    parts.push('  (获取进程信息失败)')
  }

  // 4. 启动项数量
  parts.push('\n【开机启动项】')
  try {
    const startupCount = execSync(
      'powershell -NoProfile -Command "@(Get-CimInstance Win32_StartupCommand).Count"',
      { encoding: 'utf-8', timeout: 15000 }
    ).trim()
    parts.push(`  共 ${startupCount} 个启动项（使用 startup_list 查看详情）`)
  } catch {
    parts.push('  (获取启动项失败)')
  }

  return { content: [{ type: 'text', text: parts.join('\n') }] }
}

/** 递归计算目录大小 */
async function getDirSize(dir: string): Promise<number> {
  let total = 0
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      try {
        if (entry.isDirectory()) {
          total += await getDirSize(fullPath)
        } else {
          const stat = await fs.stat(fullPath)
          total += stat.size
        }
      } catch {
        // 跳过无权限项
      }
    }
  } catch {
    // 目录不可访问
  }
  return total
}

/** 清理临时文件/缓存 */
async function optimizerClean(
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const target = String(args.target ?? 'temp')
  const results: string[] = []
  let totalFreed = 0

  const cleanDir = async (name: string, dir: string): Promise<void> => {
    if (!dir) return
    try {
      const sizeBefore = await getDirSize(dir)
      const entries = await fs.readdir(dir, { withFileTypes: true })
      let deleted = 0
      let failed = 0
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        try {
          if (entry.isDirectory()) {
            await fs.rm(fullPath, { recursive: true, force: true })
          } else {
            await fs.unlink(fullPath)
          }
          deleted++
        } catch {
          failed++
        }
      }
      totalFreed += sizeBefore
      results.push(`✓ ${name}: 清理 ${deleted} 项${failed > 0 ? `，${failed} 项跳过` : ''}，释放 ${formatSize(sizeBefore)}`)
    } catch (err) {
      results.push(`✗ ${name}: 无法清理 (${(err as Error).message})`)
    }
  }

  if (target === 'temp' || target === 'all') {
    await cleanDir('用户临时文件', process.env.TEMP ?? '')
    await cleanDir('系统临时文件', process.env.WINDIR ? join(process.env.WINDIR, 'Temp') : '')
  }
  if (target === 'prefetch' || target === 'all') {
    await cleanDir('预读取文件', process.env.WINDIR ? join(process.env.WINDIR, 'Prefetch') : '')
  }
  if (target === 'recycle' || target === 'all') {
    try {
      execSync(
        'powershell -NoProfile -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"',
        { encoding: 'utf-8', timeout: 30000 }
      )
      results.push('✓ 回收站: 已清空')
    } catch {
      results.push('✗ 回收站: 清空失败')
    }
  }

  results.push(`\n总计释放: ${formatSize(totalFreed)}`)
  return {
    content: [{ type: 'text', text: `系统清理完成:\n${results.join('\n')}` }]
  }
}

/** 获取 Top N 进程（按内存/CPU） */
async function optimizerTopProcesses(): Promise<LocalToolResult> {
  try {
    const info = execSync(
      'powershell -NoProfile -Command "Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 20 Name,@{N=\'Mem(MB)\';E={[math]::Round($_.WorkingSet/1MB,1)}},@{N=\'CPU(s)\';E={[math]::Round($_.CPU,1)}},Id | ConvertTo-Json"',
      { encoding: 'utf-8', timeout: 15000 }
    ).trim()
    const procs = JSON.parse(info)
    const procList = Array.isArray(procs) ? procs : [procs]
    const lines = procList.map(
      (p: { Name: string; Id: number; 'Mem(MB)': number; 'CPU(s)': number }) =>
        `${p.Name.padEnd(30)} PID:${String(p.Id).padEnd(8)} 内存:${String(p['Mem(MB)']).padStart(8)}MB  CPU:${p['CPU(s)']}s`
    )
    return {
      content: [
        { type: 'text', text: `Top ${procList.length} 进程（按内存排序）:\n${lines.join('\n')}` }
      ]
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `获取进程失败: ${(err as Error).message}` }],
      isError: true
    }
  }
}

/** 终止进程 */
async function optimizerKillProcess(
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const name = String(args.name ?? '')
  const pid = Number(args.pid ?? 0)

  if (!name && !pid) {
    return { content: [{ type: 'text', text: '需要 name 或 pid 参数' }], isError: true }
  }

  try {
    if (pid > 0) {
      execSync(`powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force"`, {
        encoding: 'utf-8',
        timeout: 10000
      })
      return { content: [{ type: 'text', text: `已终止进程 PID:${pid}` }] }
    }
    // 安全校验：拒绝含 shell 元字符的进程名，防止命令注入
    const nameErr = validateSafeIdentifier(name, '进程名')
    if (nameErr) return { content: [{ type: 'text', text: nameErr }], isError: true }
    execSync(`powershell -NoProfile -Command "Stop-Process -Name '${name}' -Force -ErrorAction SilentlyContinue"`, {
      encoding: 'utf-8',
      timeout: 10000
    })
    return { content: [{ type: 'text', text: `已终止进程: ${name}` }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `终止进程失败: ${(err as Error).message}` }],
      isError: true
    }
  }
}

/** 列出开机启动项 */
async function optimizerStartupList(): Promise<LocalToolResult> {
  try {
    const info = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location | ConvertTo-Json"',
      { encoding: 'utf-8', timeout: 15000 }
    ).trim()
    if (!info) {
      return { content: [{ type: 'text', text: '未找到开机启动项' }] }
    }
    const items = JSON.parse(info)
    const list = Array.isArray(items) ? items : [items]
    const lines = list.map(
      (s: { Name: string; Command: string; Location: string }, i: number) =>
        `${i + 1}. ${s.Name}\n   命令: ${s.Command ?? '(空)'}\n   位置: ${s.Location ?? '(空)'}`
    )
    return {
      content: [{ type: 'text', text: `开机启动项（共 ${list.length} 个）:\n\n${lines.join('\n')}` }]
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `获取启动项失败: ${(err as Error).message}` }],
      isError: true
    }
  }
}

/** 禁用开机启动项（注册表方式） */
async function optimizerDisableStartup(
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const name = String(args.name ?? '')
  if (!name) {
    return { content: [{ type: 'text', text: '需要 name 参数' }], isError: true }
  }

  // 尝试从注册表 Run 键删除
  const regPaths = [
    'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
  ]

  for (const reg of regPaths) {
    try {
      const check = execSync(
        `powershell -NoProfile -Command "Get-ItemProperty -Path '${reg}' -Name '${name}' -ErrorAction SilentlyContinue"`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim()
      if (check) {
        execSync(
          `powershell -NoProfile -Command "Remove-ItemProperty -Path '${reg}' -Name '${name}' -ErrorAction SilentlyContinue"`,
          { encoding: 'utf-8', timeout: 10000 }
        )
        return { content: [{ type: 'text', text: `已禁用启动项: ${name}（从 ${reg}）` }] }
      }
    } catch {
      // 继续尝试下一个注册表路径
    }
  }

  return {
    content: [{ type: 'text', text: `未找到启动项: ${name}（可能来自启动文件夹，需手动删除）` }],
    isError: true
  }
}

/** 一键优化：清理临时文件 + 清空回收站 */
async function optimizerOneClick(): Promise<LocalToolResult> {
  const results: string[] = []

  // 清理临时文件
  const cleanResult = await optimizerClean({ target: 'all' })
  results.push(cleanResult.content[0].text)

  // 清理 DNS 缓存
  try {
    execSync('ipconfig /flushdns', { encoding: 'utf-8', timeout: 10000 })
    results.push('\n✓ DNS 缓存已刷新')
  } catch {
    results.push('\n✗ DNS 缓存刷新失败')
  }

  // 内存优化提示
  results.push('\n【优化建议】')
  try {
    const memInfo = execSync(
      'powershell -NoProfile -Command "$os=Get-CimInstance Win32_OperatingSystem; [math]::Round(($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/1MB,1)"',
      { encoding: 'utf-8', timeout: 10000 }
    ).trim()
    results.push(`当前内存使用: ${memInfo} GB`)
    results.push('建议关闭不常用的高内存进程（使用 top_processes 查看）')
  } catch {
    // 忽略
  }

  return {
    content: [{ type: 'text', text: `一键优化完成:\n${results.join('\n')}` }]
  }
}

// ============ CodeAnalyzer 工具（代码审计/项目分析，类似 Codex） ============

async function executeCodeAnalyzer(
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const action = String(args.action ?? '')

  switch (action) {
    case 'project_structure':
      return await codeAnalyzeStructure(args)
    case 'deps':
      return await codeAnalyzeDeps(args)
    case 'audit':
      return await codeAudit(args)
    case 'security_scan':
      return await codeSecurityScan(args)
    case 'stats':
      return await codeStats(args)
    case 'git_status':
      return await codeGitStatus(args)
    default:
      return {
        content: [{ type: 'text', text: `未知 CodeAnalyzer action: ${action}` }],
        isError: true
      }
  }
}

/** 分析项目结构：目录树 + 技术栈识别 */
async function codeAnalyzeStructure(
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const root = String(args.path ?? process.cwd())
  const maxDepth = Number(args.maxDepth ?? 3)

  try {
    const stat = await fs.stat(root)
    if (!stat.isDirectory()) {
      return { content: [{ type: 'text', text: `${root} 不是目录` }], isError: true }
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `路径不存在: ${(err as Error).message}` }], isError: true }
  }

  // 生成目录树
  const tree = await buildProjectTree(root, maxDepth)

  // 识别技术栈
  const techStack = await detectTechStack(root)

  const parts: string[] = [
    `=== 项目结构分析 ===`,
    `路径: ${root}\n`,
    '【技术栈】',
    techStack.length > 0 ? techStack.map((t) => `  - ${t}`).join('\n') : '  (未识别)',
    '\n【目录树】',
    tree
  ]

  return { content: [{ type: 'text', text: parts.join('\n') }] }
}

/** 构建项目目录树（跳过 node_modules/.git/dist 等） */
async function buildProjectTree(root: string, maxDepth: number): Promise<string> {
  const ignoreDirs = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
    '__pycache__', '.venv', 'venv', '.idea', '.vscode',
    'out', '.cache', 'coverage', '.tscache'
  ])
  const lines: string[] = []
  const maxEntries = 200

  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth || lines.length > maxEntries) return
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    // 排序：目录在前，文件在后
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    const filtered = entries.filter((e) => !ignoreDirs.has(e.name) && !e.name.startsWith('.'))
    for (let i = 0; i < filtered.length; i++) {
      if (lines.length > maxEntries) {
        lines.push(`${prefix}... (截断，超过 ${maxEntries} 项)`)
        return
      }
      const entry = filtered[i]
      const isLast = i === filtered.length - 1
      const connector = isLast ? '└── ' : '├── '
      const suffix = entry.isDirectory() ? '/' : ''
      lines.push(`${prefix}${connector}${entry.name}${suffix}`)
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), prefix + (isLast ? '    ' : '│   '), depth + 1)
      }
    }
  }

  lines.push('.')
  await walk(root, '', 1)
  return lines.join('\n')
}

/** 识别技术栈 */
async function detectTechStack(root: string): Promise<string[]> {
  const stack: string[] = []

  // 检查 package.json
  try {
    const pkg = JSON.parse(await fs.readFile(join(root, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (deps.electron) stack.push('Electron')
    if (deps.react) stack.push('React')
    if (deps.vue) stack.push('Vue')
    if (deps.next) stack.push('Next.js')
    if (deps.vite) stack.push('Vite')
    if (deps.typescript) stack.push('TypeScript')
    if (deps.express) stack.push('Express')
    if (deps.koa) stack.push('Koa')
    if (deps['@modelcontextprotocol/sdk']) stack.push('MCP (Model Context Protocol)')
    if (deps.tailwindcss) stack.push('Tailwind CSS')
    if (pkg.type === 'module') stack.push('ESM')
    stack.push(`Node.js 项目 (${pkg.name ?? 'unnamed'}@${pkg.version ?? '0.0.0'})`)
  } catch {
    // 不是 Node 项目
  }

  // 检查 Python
  try {
    await fs.access(join(root, 'requirements.txt'))
    stack.push('Python (requirements.txt)')
  } catch {
    // 忽略
  }
  try {
    await fs.access(join(root, 'pyproject.toml'))
    stack.push('Python (pyproject.toml)')
  } catch {
    // 忽略
  }

  // 检查 Rust
  try {
    await fs.access(join(root, 'Cargo.toml'))
    stack.push('Rust (Cargo)')
  } catch {
    // 忽略
  }

  // 检查 Go
  try {
    await fs.access(join(root, 'go.mod'))
    stack.push('Go')
  } catch {
    // 忽略
  }

  return stack
}

/** 分析依赖 */
async function codeAnalyzeDeps(
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const root = String(args.path ?? process.cwd())

  try {
    const pkg = JSON.parse(await fs.readFile(join(root, 'package.json'), 'utf-8'))
    const deps = pkg.dependencies ?? {}
    const devDeps = pkg.devDependencies ?? {}

    const parts: string[] = [
      '=== 依赖分析 ===',
      `项目: ${pkg.name ?? 'unnamed'}@${pkg.version ?? '0.0.0'}\n`,
      `生产依赖 (${Object.keys(deps).length}):`,
      ...Object.entries(deps).map(([k, v]) => `  ${k}: ${v}`),
      `\n开发依赖 (${Object.keys(devDeps).length}):`,
      ...Object.entries(devDeps).map(([k, v]) => `  ${k}: ${v}`)
    ]

    // 检查是否有 lock 文件
    try {
      await fs.access(join(root, 'package-lock.json'))
      parts.push('\n锁文件: package-lock.json ✓')
    } catch {
      try {
        await fs.access(join(root, 'yarn.lock'))
        parts.push('\n锁文件: yarn.lock ✓')
      } catch {
        try {
          await fs.access(join(root, 'pnpm-lock.yaml'))
          parts.push('\n锁文件: pnpm-lock.yaml ✓')
        } catch {
          parts.push('\n⚠ 未找到锁文件，建议使用 npm install 生成')
        }
      }
    }

    return { content: [{ type: 'text', text: parts.join('\n') }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `依赖分析失败（需 package.json）: ${(err as Error).message}` }],
      isError: true
    }
  }
}

/** 代码质量审计：扫描常见问题 */
async function codeAudit(
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const root = String(args.path ?? process.cwd())
  const issues: string[] = []

  // 1. 检查 TODO/FIXME/HACK 标记
  const todoResults = await scanCodePatterns(root, [
    /\bTODO\b/gi,
    /\bFIXME\b/gi,
    /\bHACK\b/gi,
    /\bXXX\b/gi
  ])
  if (todoResults.length > 0) {
    issues.push(`\n【待办标记 ${todoResults.length} 处】`)
    issues.push(...todoResults.slice(0, 20).map((r) => `  ${r}`))
    if (todoResults.length > 20) issues.push(`  ... 还有 ${todoResults.length - 20} 处`)
  }

  // 2. 检查 console.log 残留
  const consoleResults = await scanCodePatterns(root, [/console\.log\(/g])
  if (consoleResults.length > 0) {
    issues.push(`\n【console.log 残留 ${consoleResults.length} 处】`)
    issues.push(...consoleResults.slice(0, 15).map((r) => `  ${r}`))
    if (consoleResults.length > 15) issues.push(`  ... 还有 ${consoleResults.length - 15} 处`)
  }

  // 3. 检查硬编码密钥/密码
  const secretResults = await scanCodePatterns(root, [
    /(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi
  ])
  if (secretResults.length > 0) {
    issues.push(`\n【⚠ 疑似硬编码密钥 ${secretResults.length} 处】`)
    issues.push(...secretResults.slice(0, 10).map((r) => `  ${r}`))
  }

  // 4. 检查空 catch 块
  const catchResults = await scanCodePatterns(root, [/catch\s*\([^)]*\)\s*\{\s*\}/g])
  if (catchResults.length > 0) {
    issues.push(`\n【空 catch 块 ${catchResults.length} 处】`)
    issues.push(...catchResults.slice(0, 10).map((r) => `  ${r}`))
  }

  if (issues.length === 0) {
    return { content: [{ type: 'text', text: '代码审计完成：未发现常见问题 ✓' }] }
  }

  return {
    content: [
      { type: 'text', text: `=== 代码质量审计 ===\n路径: ${root}${issues.join('\n')}` }
    ]
  }
}

/** 安全扫描 */
async function codeSecurityScan(
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const root = String(args.path ?? process.cwd())
  const issues: string[] = []

  // 1. 检查 eval 使用
  const evalResults = await scanCodePatterns(root, [/\beval\s*\(/g])
  if (evalResults.length > 0) {
    issues.push(`\n【⚠ eval() 使用 ${evalResults.length} 处 — 可能导致代码注入】`)
    issues.push(...evalResults.slice(0, 10).map((r) => `  ${r}`))
  }

  // 2. 检查 innerHTML 赋值（XSS 风险）
  const innerHtmlResults = await scanCodePatterns(root, [/\.innerHTML\s*=/g])
  if (innerHtmlResults.length > 0) {
    issues.push(`\n【⚠ innerHTML 赋值 ${innerHtmlResults.length} 处 — XSS 风险】`)
    issues.push(...innerHtmlResults.slice(0, 10).map((r) => `  ${r}`))
  }

  // 3. 检查硬编码密钥
  const secretResults = await scanCodePatterns(root, [
    /(?:password|passwd|secret|api[_-]?key|token|private[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/gi
  ])
  if (secretResults.length > 0) {
    issues.push(`\n【⚠ 硬编码敏感信息 ${secretResults.length} 处】`)
    issues.push(...secretResults.slice(0, 10).map((r) => `  ${r}`))
  }

  // 4. 检查不安全的 http:// URL
  const httpResults = await scanCodePatterns(root, [/http:\/\/(?!localhost|127\.0\.0\.1)/g])
  if (httpResults.length > 0) {
    issues.push(`\n【不安全的 HTTP URL ${httpResults.length} 处】`)
    issues.push(...httpResults.slice(0, 10).map((r) => `  ${r}`))
  }

  // 5. 检查 exec/execSync 直接拼接命令（命令注入风险）
  const execResults = await scanCodePatterns(root, [
    /exec(?:Sync)?\s*\(\s*[^'"`]*\$\{/g,
    /spawn(?:Sync)?\s*\(\s*[^'"`]*\$\{/g
  ])
  if (execResults.length > 0) {
    issues.push(`\n【⚠ 命令拼接 ${execResults.length} 处 — 命令注入风险】`)
    issues.push(...execResults.slice(0, 10).map((r) => `  ${r}`))
  }

  if (issues.length === 0) {
    return { content: [{ type: 'text', text: '安全扫描完成：未发现安全问题 ✓' }] }
  }

  return {
    content: [
      { type: 'text', text: `=== 安全扫描报告 ===\n路径: ${root}${issues.join('\n')}` }
    ]
  }
}

/** 扫描代码中的模式 */
async function scanCodePatterns(
  root: string,
  patterns: RegExp[]
): Promise<string[]> {
  const results: string[] = []
  const codeExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.vue', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.cs'
  ])
  const ignoreDirs = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
    '__pycache__', '.venv', 'venv', 'out', '.cache', 'coverage'
  ])
  const maxFiles = 500
  let fileCount = 0

  async function scan(dir: string): Promise<void> {
    if (fileCount > maxFiles) return
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (fileCount > maxFiles) return
      if (ignoreDirs.has(entry.name)) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await scan(fullPath)
      } else if (codeExtensions.has(extname(entry.name))) {
        fileCount++
        try {
          const content = await fs.readFile(fullPath, 'utf-8')
          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            for (const pattern of patterns) {
              if (pattern.test(lines[i])) {
                const rel = relative(root, fullPath)
                results.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 100)}`)
                break
              }
            }
          }
        } catch {
          // 跳过无法读取的文件
        }
      }
    }
  }

  await scan(root)
  return results
}

/** 代码统计：文件数、代码行数、语言分布 */
async function codeStats(
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const root = String(args.path ?? process.cwd())
  const langMap = new Map<string, { files: number; lines: number }>()
  const ignoreDirs = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
    '__pycache__', '.venv', 'venv', 'out', '.cache', 'coverage'
  ])
  const extLang: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript React', '.js': 'JavaScript',
    '.jsx': 'JavaScript React', '.vue': 'Vue', '.py': 'Python',
    '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.c': 'C', '.cpp': 'C++',
    '.cs': 'C#', '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS',
    '.json': 'JSON', '.md': 'Markdown', '.yml': 'YAML', '.yaml': 'YAML',
    '.sh': 'Shell', '.bat': 'Batch', '.ps1': 'PowerShell'
  }

  let totalFiles = 0
  let totalLines = 0
  const maxFiles = 1000

  async function count(dir: string): Promise<void> {
    if (totalFiles > maxFiles) return
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (totalFiles > maxFiles) return
      if (ignoreDirs.has(entry.name)) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await count(fullPath)
      } else {
        const ext = extname(entry.name)
        const lang = extLang[ext]
        if (!lang) continue
        totalFiles++
        try {
          const content = await fs.readFile(fullPath, 'utf-8')
          const lineCount = content.split('\n').length
          totalLines += lineCount
          const stat = langMap.get(lang) ?? { files: 0, lines: 0 }
          stat.files++
          stat.lines += lineCount
          langMap.set(lang, stat)
        } catch {
          // 跳过
        }
      }
    }
  }

  await count(root)

  const sorted = [...langMap.entries()].sort((a, b) => b[1].lines - a[1].lines)
  const lines = sorted.map(
    ([lang, stat]) =>
      `  ${lang.padEnd(20)} ${String(stat.files).padStart(5)} 文件  ${String(stat.lines).padStart(8)} 行`
  )

  return {
    content: [
      {
        type: 'text',
        text: `=== 代码统计 ===\n路径: ${root}\n总文件: ${totalFiles}  总行数: ${totalLines}\n\n按语言分布:\n${lines.join('\n')}`
      }
    ]
  }
}

/** Git 状态分析 */
async function codeGitStatus(
  args: Record<string, unknown>
): Promise<LocalToolResult> {
  const root = String(args.path ?? process.cwd())

  try {
    // 检查是否是 git 仓库
    await fs.access(join(root, '.git'))
  } catch {
    return { content: [{ type: 'text', text: '当前目录不是 Git 仓库' }], isError: true }
  }

  const parts: string[] = ['=== Git 状态 ===\n']

  // 当前分支
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      cwd: root,
      timeout: 5000
    }).trim()
    parts.push(`当前分支: ${branch}`)
  } catch {
    parts.push('当前分支: (获取失败)')
  }

  // 状态摘要
  try {
    const status = execSync('git status --short', {
      encoding: 'utf-8',
      cwd: root,
      timeout: 5000
    }).trim()
    if (!status) {
      parts.push('工作区: 干净 ✓')
    } else {
      const lines = status.split('\n')
      const modified = lines.filter((l) => l.startsWith(' M') || l.startsWith('M '))
      const added = lines.filter((l) => l.startsWith('A ') || l.startsWith('??'))
      const deleted = lines.filter((l) => l.startsWith(' D') || l.startsWith('D '))
      parts.push(`工作区: ${lines.length} 个变更 (修改:${modified.length} 新增:${added.length} 删除:${deleted.length})`)
      parts.push('\n变更列表:')
      parts.push(...lines.slice(0, 30).map((l) => `  ${l}`))
      if (lines.length > 30) parts.push(`  ... 还有 ${lines.length - 30} 项`)
    }
  } catch {
    parts.push('工作区: (获取失败)')
  }

  // 最近提交
  try {
    const log = execSync('git log --oneline -5', {
      encoding: 'utf-8',
      cwd: root,
      timeout: 5000
    }).trim()
    parts.push('\n最近提交:')
    parts.push(...log.split('\n').map((l) => `  ${l}`))
  } catch {
    // 忽略
  }

  return { content: [{ type: 'text', text: parts.join('\n') }] }
}

// ============ PhoneControl 工具（手机控制） ============

async function executePhoneControl(args: Record<string, unknown>): Promise<LocalToolResult> {
  const { getRemoteControl } = await import('../remote/remote-client')
  const remote = getRemoteControl()

  const action = String(args.action ?? '')
  if (!action) {
    return { content: [{ type: 'text', text: '缺少 action 参数' }], isError: true }
  }

  // 构建发送给手机的参数（去掉 action 本身）
  const phoneArgs: Record<string, unknown> = { ...args }
  delete phoneArgs.action

  // 截屏操作需要更长超时
  const timeoutMs = action === 'screenshot' || action === 'take_photo' ? 60000 : 30000

  const result = await remote.sendPhoneCommand(action, phoneArgs, timeoutMs)

  if (!result.success) {
    return {
      content: [{ type: 'text', text: `手机操作失败 (${action}): ${result.error}` }],
      isError: true
    }
  }

  // 截屏/拍照返回的是 base64 图片数据，需要特殊处理
  if ((action === 'screenshot' || action === 'take_photo') && result.data) {
    // 尝试解析手机端返回的 JSON（包含 image + screenText）
    try {
      const parsed = JSON.parse(result.data)
      const parts: string[] = []

      // 如果有 screenText，优先返回给纯文本模型
      if (parsed.screenText) {
        parts.push(`【屏幕文字内容】\n${parsed.screenText}`)
      }

      // 如果有 description（回退方案）
      if (parsed.description && !parsed.screenText) {
        parts.push(`【屏幕状态描述】\n${typeof parsed.description === 'string' ? parsed.description : JSON.stringify(parsed.description)}`)
      }

      // 如果有 error（截屏失败）
      if (parsed.error || parsed.type === 'screenshot_failed') {
        parts.push(`【截屏失败】${parsed.error || '未知错误'}`)
        if (parsed.hint) parts.push(`提示：${parsed.hint}`)
      }

      // 如果有图片且截屏成功，注明图片大小
      if (parsed.image && parsed.type === 'screenshot') {
        const imgSizeKB = Math.round((parsed.imageLength || parsed.image.length || 0) * 0.75 / 1024)
        parts.push(`【截图】已获取 ${imgSizeKB}KB JPEG 图片（视觉模型可直接查看，纯文本模型请参考上方屏幕文字内容）`)
      }

      if (parts.length > 0) {
        return { content: [{ type: 'text', text: parts.join('\n\n') }] }
      }
    } catch {
      // JSON 解析失败，回退到原始处理
    }

    return {
      content: [
        { type: 'text', text: `${action} 完成，图片数据已返回（${Math.round(result.data.length * 0.75 / 1024)}KB）` }
      ]
    }
  }

  return {
    content: [{ type: 'text', text: result.data || `${action} 执行成功` }]
  }
}
