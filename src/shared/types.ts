// 共享类型定义 — 主进程 / preload / 渲染进程共用

/** 对话模式 */
export type ChatMode = 'auto' | 'chat' | 'task' | 'code' | 'plan' | 'spec'

export interface Settings {
  apiKey: string
  baseURL: string
  fastModel: string
  proModel: string
  uvxPath: string
  pypiMirror: string
  autoStart: boolean
  deepThinking: boolean
  thinkingEffort: 'high' | 'max'
  /** 是否已完成首次使用初始化（重建 .venv 等） */
  initialized: boolean
  /** DeepSeek 专用配置（与 Kimi 配置分离） */
  deepseekApiKey: string
  deepseekBaseURL: string
  /** Kimi 专用配置（与 DeepSeek 配置分离） */
  kimiApiKey: string
  kimiBaseURL: string
  /** 是否启用冷启动系统自检 */
  selfCheckEnabled: boolean
  /** 是否启用启动时自动检查更新 */
  updateCheckEnabled: boolean
  /** 是否启用限免模式（通过 xskillhub 中继免费使用 DeepSeek，未填 key 时自动开启） */
  relayMode: boolean
  /** 限免/中继模式下的模型偏好：flash 免费每日 50 次；pro 需付费积分（4 积分/次） */
  relayModelPreference: 'flash' | 'pro'
  /** 是否启用 OpenX 内核加速（实验性，3 倍积分消耗，仅限免模式生效） */
  openXEnabled: boolean
  /** OpenX 云端代理 API Token（从 OpenX 控制台获取，空则回退本地 OX 解码方案） */
  openXToken: string
  /** 本地模型（实验性）：启用后在本地运行 AI 推理（qwen3-4b 基座 + litex LoRA），不依赖网络。
   *  采用进程内 node-llama-cpp 推理，无需外部服务端点。 */
  localModel: {
    enabled: boolean
    /** LoRA 缩放系数（litex 适配强度，0~2，默认 1.0）。仅当 LoRA GGUF 存在时生效 */
    loraScale: number
  }
  /** 工具调用超时（秒），默认 60 秒。MCP/本地工具/AI 请求等均受此限制 */
  toolCallTimeoutSec: number
  /** 子代理最大循环轮数。0 = AI帮选（由 AI 根据任务复杂度自行决定，默认 50）；>0 = 用户指定上限，AI 传入值不能超过该值 */
  subagentMaxRounds: number
  /** 向量语义搜索配置（记忆系统）：API embedding 优先 + 本地 TF-IDF 回退 */
  embedding: {
    /** embedding 模型名（空字符串 = 仅用本地 TF-IDF）。如 "text-embedding-3-small" */
    model: string
    /** embedding API Base URL（空 = 复用主 baseURL） */
    baseURL: string
    /** embedding API Key（空 = 复用主 apiKey） */
    apiKey: string
  }
}

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export type MessageRole = 'user' | 'assistant' | 'system'

/** 多模态消息内容块（文本 / 图片 / 视频） */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }
  | { type: 'video_url'; video_url: { url: string } }

/** 消息内容：纯文本或多模态内容块数组 */
export type MessageContent = string | ContentPart[]

export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: MessageContent
  createdAt: number
  /** 关联的任务步骤 ID 列表（仅 assistant 消息） */
  stepIds?: string[]
}

/** 上下文使用情况（对应右侧详情面板的"上下文"进度条） */
export interface ContextUsage {
  sessionId: string
  /** 估算的总占用 tokens */
  totalTokens: number
  /** 模型上下文窗口上限 */
  maxTokens: number
  /** 整体使用率 0~1 */
  percent: number
  /** 各分类占用 tokens：技能（系统提示+工具 schema 等固定开销）、文件（工具返回）、其他（对话文本+基础系统提示） */
  breakdown: {
    skills: number
    files: number
    other: number
  }
  updatedAt: number
}

/** 从消息内容中提取纯文本（用于搜索、复制、Markdown 渲染等） */
export function extractTextFromContent(content: MessageContent): string {
  if (typeof content === 'string') return content
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

export type StepType = 'thinking' | 'deep_thinking' | 'tool_call' | 'tool_result' | 'error' | 'final'
export type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

export interface TaskStep {
  id: string
  sessionId: string
  messageId: string
  type: StepType
  status: StepStatus
  content: string
  toolName?: string
  toolArgs?: unknown
  toolResult?: unknown
  screenshotPath?: string
  startedAt: number
  finishedAt?: number
  error?: string
}

/** 主进程 → 渲染进程的流式事件 */
export interface StepEvent {
  sessionId: string
  stepId: string
  messageId: string
  type: StepType
  status: StepStatus
  content: string
  toolName?: string
  toolArgs?: unknown
  toolResult?: unknown
  screenshotPath?: string
  timestamp: number
  error?: string
  /** 事件来源：用于 widget 路由（main=主窗口，widget=小组件 agent） */
  source?: 'main' | 'widget'
}

/** 高危工具确认请求 */
export interface ConfirmRequest {
  requestId: string
  sessionId: string
  toolName: string
  toolArgs: unknown
  reason: string
  /** 请求来源：widget 来源由小组件自身确认，主窗口 ConfirmDialog 过滤掉 */
  source?: 'main' | 'widget'
}

export interface ConfirmResponse {
  requestId: string
  allowed: boolean
}

/** AI 向用户提问的请求 */
export interface AskRequest {
  requestId: string
  sessionId: string
  question: string
  /** 可选的选项列表（提供时前端显示为选择题，否则为开放式输入） */
  options?: string[]
  /** 可选的默认值/占位提示 */
  placeholder?: string
  /** 请求来源：widget 来源由小组件自身回答 */
  source?: 'main' | 'widget'
}

export interface AskResponse {
  requestId: string
  /** 用户的回答文本；空字符串表示用户跳过了问题 */
  answer: string
  /** 用户是否跳过了问题 */
  skipped: boolean
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
  tools?: string[]
}

/** 本地模型运行状态（实验性） */
export type LocalModelState =
  | 'not-downloaded' // 基座模型未下载
  | 'downloading'    // 下载中
  | 'downloaded'     // 已下载，未加载
  | 'loading'        // 模型加载中
  | 'ready'          // 已就绪，可推理
  | 'error'          // 出错

export interface LocalModelStatus {
  state: LocalModelState
  /** 0~1，下载/加载进度 */
  progress: number
  /** 人类可读的状态描述 */
  message: string
  /** 基座模型本地路径（已下载时非空） */
  baseModelPath: string | null
  /** LoRA 适配器路径（存在时非空） */
  loraPath: string | null
  /** GPU 后端类型（已加载时非空，如 'cuda' / 'false' = CPU） */
  gpuType: string | null
  /** 上下文长度（tokens） */
  contextSize: number
  /** 是否已加载 litex LoRA */
  hasLora: boolean
  /** 错误信息（state === 'error' 时非空） */
  error: string | null
}

/** 悬浮球显示的 AI 工作状态 */
export type FloatingBallState = 'idle' | 'thinking' | 'working' | 'success' | 'error'

/** 悬浮球状态广播载荷 */
export interface FloatingBallStatusPayload {
  state: FloatingBallState
  /** 当前任务简短描述（如"正在打开记事本"） */
  detail?: string
  /** 关联的会话 ID */
  sessionId?: string
  /** 状态变更时间戳 */
  timestamp: number
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseURL: 'https://api.deepseek.com/v1',
  fastModel: 'deepseek-v4-flash',
  proModel: 'deepseek-v4-pro',
  uvxPath: 'uvx',
  pypiMirror: 'https://pypi.tuna.tsinghua.edu.cn/simple',
  autoStart: false,
  deepThinking: false,
  thinkingEffort: 'high',
  initialized: false,
  deepseekApiKey: '',
  deepseekBaseURL: 'https://api.deepseek.com/v1',
  kimiApiKey: '',
  kimiBaseURL: 'https://api.moonshot.cn/v1',
  selfCheckEnabled: true,
  updateCheckEnabled: true,
  relayMode: false,
  relayModelPreference: 'flash',
  openXEnabled: false,
  openXToken: '',
  localModel: {
    enabled: false,
    loraScale: 1.0
  },
  toolCallTimeoutSec: 60,
  subagentMaxRounds: 0,
  embedding: {
    model: '',
    baseURL: '',
    apiKey: ''
  }
}

/** 定时任务触发类型 */
export type ScheduleType = 'once' | 'interval' | 'daily' | 'weekly' | 'cron'

/** 定时任务状态 */
export type ScheduleStatus = 'active' | 'paused' | 'running' | 'done' | 'error'

/** 定时任务定义 */
export interface ScheduledTask {
  id: string
  /** 任务名称（用户可读） */
  name: string
  /** 要执行的指令内容 */
  prompt: string
  /** 触发类型 */
  type: ScheduleType
  /** 触发时间/配置：
   *  - once: ISO 字符串（如 "2026-06-20T15:30:00"）
   *  - interval: 间隔毫秒数（如 60000 = 1 分钟）
   *  - daily: "HH:mm"（如 "09:30"）
   *  - weekly: "HH:mm|dayOfWeek"（dayOfWeek: 0-6，0=周日）
   *  - cron: 标准5段式 cron 表达式（如 "0 9 * * 1-5" = 工作日9点）
   */
  schedule: string
  /** 是否启用 */
  enabled: boolean
  /** 创建时间 */
  createdAt: number
  /** 上次执行时间 */
  lastRunAt?: number
  /** 上次执行结果 */
  lastRunStatus?: ScheduleStatus
  /** 上次执行错误信息 */
  lastRunError?: string
  /** 下次执行时间（运行时计算） */
  nextRunAt?: number
  /** 执行次数 */
  runCount: number
  /** 最大重试次数（0=不重试，默认0） */
  maxRetries?: number
  /** 重试间隔毫秒（默认60000=1分钟） */
  retryDelay?: number
  /** 当前重试次数 */
  retryCount?: number
  /** 任务超时毫秒（0=不超时，默认300000=5分钟） */
  timeoutMs?: number
  /** 是否显示系统通知（默认 true，设为 false 则执行时不弹通知） */
  notify?: boolean
}

/** 定时任务执行历史记录 */
export interface ScheduleRunLog {
  taskId: string
  taskName: string
  prompt: string
  startedAt: number
  finishedAt?: number
  status: ScheduleStatus
  error?: string
  /** 关联的会话 ID（执行时创建的会话） */
  sessionId?: string
}

// ============ Xmemory 记忆系统 ============

/** 记忆类型 */
export type MemoryType =
  | 'profile' // 用户画像（职业、技术栈、语言等）
  | 'habit' // 操作习惯（常用应用、工作流）
  | 'preference' // 偏好设置（UI、代码风格、回复风格）
  | 'fact' // 事实知识（项目、环境、团队信息）
  | 'interaction' // 历史交互（重要决策、反馈、修正）
  | 'skill' // 技能记忆（用户教过的操作方式）

/** 记忆来源 */
export type MemorySource = 'auto' | 'manual' | 'ai'

/** 单条记忆条目 */
export interface MemoryItem {
  id: string
  /** 记忆类型 */
  type: MemoryType
  /** 细分类别，如 "tech_stack"、"workflow"、"env" */
  category: string
  /** 记忆内容（自然语言描述） */
  content: string
  /** 置信度 0-1，越高越可信 */
  confidence: number
  /** 来源：自动提取 / 手动添加 / AI 主动保存 */
  source: MemorySource
  /** 来源会话 ID */
  sessionId?: string
  /** 创建时间 */
  createdAt: number
  /** 最后更新时间 */
  updatedAt: number
  /** 最后访问时间（用于衰减和排序） */
  lastAccessedAt: number
  /** 访问次数（被注入到上下文的次数） */
  accessCount: number
  /** 标签（用于检索） */
  tags: string[]
  /** 是否已归档（低置信度或过时记忆会被归档） */
  archived: boolean
  /** 知识图谱：从内容中提取的实体列表（已规范化为小写）。缺失时图谱层会本地回退提取 */
  entities?: string[]
  /** 向量版本号：0/缺失 = 未向量化；>0 = 已向量化（与当前 EMBEDDING_VERSION 比较判断是否需重算） */
  embeddingVersion?: number
}

/** 记忆统计信息 */
export interface MemoryStats {
  total: number
  byType: Record<MemoryType, number>
  bySource: Record<MemorySource, number>
  avgConfidence: number
  lastUpdated: number
}

/** 语义搜索结果项 */
export interface SemanticSearchResult {
  memory: MemoryItem
  /** 综合相似度分数 0-1 */
  score: number
  /** 命中来源：vector / graph / keyword / heuristic */
  matchedBy: ('vector' | 'graph' | 'keyword' | 'heuristic')[]
}

/** 知识图谱可视化节点 */
export interface GraphNode {
  entity: string
  memoryCount: number
  /** 关联的记忆 ID 列表 */
  memoryIds: string[]
}

/** 知识图谱可视化边（实体共现） */
export interface GraphEdge {
  source: string
  target: string
  /** 共现次数（同一条记忆中同时出现这两个实体） */
  weight: number
}

/** 知识图谱可视化数据 */
export interface MemoryGraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  totalEntities: number
}

/** 向量索引状态 */
export interface VectorIndexStatus {
  totalMemories: number
  vectorized: number
  pending: number
  embeddingVersion: number
  /** 当前使用的向量模式：api / tfidf / none */
  mode: 'api' | 'tfidf' | 'none'
  lastUpdated: number
}

// ============ 技能系统 ============

/** 技能来源 */
export type SkillSource = 'manual' | 'ai' | 'imported' | 'hub' | 'builtin'

/** 技能文件类型 */
export type SkillFileType = 'markdown' | 'text' | 'json' | 'archive'

/**
 * 技能条目：可被 AI 检索和使用的知识/操作指南
 * 支持 .md / .txt / .json / .zip 等文件上传，也支持 AI 主动生成
 */
export interface Skill {
  id: string
  /** 技能名称（唯一） */
  name: string
  /** 技能描述（简短说明用途） */
  description: string
  /** 技能内容（markdown 格式的完整内容） */
  content: string
  /** 来源：手动上传 / AI 生成 / 导入 */
  source: SkillSource
  /** 文件类型 */
  fileType: SkillFileType
  /** 标签（用于检索） */
  tags: string[]
  /** 触发关键词（AI 检测到这些词时优先使用此技能） */
  triggers: string[]
  /** 启用状态 */
  enabled: boolean
  /** 来源会话 ID（AI 生成时记录） */
  sessionId?: string
  /** 原始文件名（上传时） */
  originalFileName?: string
  /** 作者（Hub 安装时记录） */
  author?: string
  /** 版本号（Hub 安装时记录） */
  version?: string
  /** 文件路径（Hub 安装带附件时记录） */
  filePath?: string
  /** 创建时间 */
  createdAt: number
  /** 最后更新时间 */
  updatedAt: number
  /** 最后使用时间 */
  lastUsedAt: number
  /** 使用次数 */
  useCount: number
}

/** 技能统计信息 */
export interface SkillStats {
  total: number
  enabled: number
  bySource: Record<SkillSource, number>
  byFileType: Record<SkillFileType, number>
  totalUseCount: number
  lastUpdated: number
}

// ============ XSkillHub 技能市场 ============

/** Hub 技能列表条目 */
export interface HubSkillListItem {
  id: number
  name: string
  description: string
  author: string
  category: string
  tags: string[]
  version: string
  download_count: number
  rating_sum: number
  rating_count: number
  created_at: string
  updated_at: string
}

/** Hub 技能详情 */
export interface HubSkillDetail extends HubSkillListItem {
  content: string
  file_name: string | null
  file_size: number
}

// ============ 任务模板 ============

/**
 * 任务模板：用户收藏的常用指令，可快速复用
 */
export interface TaskTemplate {
  id: string
  /** 模板名称 */
  name: string
  /** 模板描述（简短说明用途） */
  description: string
  /** 模板指令内容（用户发送给 AI 的完整指令） */
  prompt: string
  /** 分类标签（可选） */
  category: string
  /** 使用次数 */
  useCount: number
  createdAt: number
  updatedAt: number
}

// ============ TodoList 待办事项 ============

/** TodoList 条目 */
export interface TodoItem {
  id: string
  text: string
  status: 'pending' | 'completed'
  createdAt: number
}

/** TodoList 状态（推送到前端用于操作详情显示） */
export interface TodoListState {
  sessionId: string
  items: TodoItem[]
}

// ============ Subagent 子代理 ============

/** 子代理运行模式 */
export type SubagentMode = 'foreground' | 'background'

/** 子代理状态 */
export type SubagentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** 子代理信息 */
export interface SubagentInfo {
  id: string
  parentSessionId: string
  task: string
  mode: SubagentMode
  status: SubagentStatus
  result: string | null
  error: string | null
  createdAt: number
  finishedAt: number | null
  rounds: number
  maxRounds: number
  /** 子代理独立的任务清单（子代理调用 TodoList 工具时更新，独立于主代理清单） */
  todoItems: TodoItem[]
}

/** 子代理状态更新事件（推送到前端） */
export interface SubagentUpdateEvent {
  sessionId: string
  subagent: SubagentInfo
}

// ============ 自定义子智能体模板 ============

/**
 * 自定义子智能体模板：用户预设的角色/行为定义，供 AI 在创建子代理时通过
 * Subagent 工具的 templateName 参数引用，或由用户在面板中「立即使用」触发。
 * 与 SubagentInfo（运行时实例）不同，这是一个持久化的定义模板。
 */
export interface CustomSubagent {
  id: string
  /** 模板名称（唯一，如"代码审查员"、"翻译助手"） */
  name: string
  /** 简短描述（展示与检索用） */
  description: string
  /** 系统提示词/角色设定（定义子智能体的专长、行为约束、输出格式） */
  systemPrompt: string
  /** 默认运行模式 */
  defaultMode: SubagentMode
  /** 默认最大轮数（0 = 继承用户全局设置 subagentMaxRounds） */
  defaultMaxRounds: number
  /** 触发关键词（AI 检测到这些词时优先使用此模板） */
  triggers: string[]
  /** 标签 */
  tags: string[]
  /** 来源：手动创建 / AI 生成 */
  source: 'manual' | 'ai'
  /** 启用状态 */
  enabled: boolean
  /** 来源会话 ID（AI 生成时记录） */
  sessionId?: string
  /** 使用次数 */
  useCount: number
  createdAt: number
  updatedAt: number
  lastUsedAt: number
}

/** AI 辅助生成子智能体配置的结果（不自动保存，交用户审核） */
export interface GeneratedSubagentConfig {
  name: string
  description: string
  systemPrompt: string
  triggers: string[]
  tags: string[]
  defaultMode: SubagentMode
  defaultMaxRounds: number
}

// ============ 自动化触发器 ============

/** 触发器类型 */
export type TriggerType = 'file_watch' | 'usb' | 'network' | 'startup' | 'interval'

/** 自动化触发器 */
export interface AutomationTrigger {
  id: string
  name: string
  type: TriggerType
  /** 触发条件配置 */
  config: {
    /** file_watch: 监听的目录路径 */
    path?: string
    /** interval: 间隔毫秒数 */
    interval?: number
    /** file_watch: 文件匹配模式（如 *.log） */
    pattern?: string
    /** usb: 设备名称匹配模式（如 *Kingston*），默认 * */
    devicePattern?: string
    /** network: 触发事件，默认 'both' */
    networkEvent?: 'connect' | 'disconnect' | 'both'
  }
  /** 触发后执行的 AI 指令 */
  prompt: string
  enabled: boolean
  createdAt: number
  lastTriggeredAt?: number
  triggerCount: number
  /** 最大重试次数（0=不重试，默认0） */
  maxRetries?: number
  /** 重试间隔毫秒（默认60000=1分钟） */
  retryDelay?: number
  /** 当前重试次数 */
  retryCount?: number
  /** 任务超时毫秒（0=不超时，默认300000=5分钟） */
  timeoutMs?: number
  /** 是否显示系统通知（默认 true，设为 false 则触发执行时不弹通知） */
  notify?: boolean
}

/** 触发器执行历史记录 */
export interface TriggerRunLog {
  triggerId: string
  triggerName: string
  prompt: string
  startedAt: number
  finishedAt?: number
  status: ScheduleStatus
  error?: string
  /** 关联的会话 ID（执行时创建的会话） */
  sessionId?: string
}

// ============ 快捷指令 ============

/** 快捷指令（含多步骤工作流） */
export interface QuickCommand {
  id: string
  /** 快捷词（不含/，如 "clean"） */
  keyword: string
  /** 显示名称 */
  name: string
  /** 描述 */
  description: string
  /** 展开后的完整指令（单步时使用） */
  prompt: string
  /** 多步骤工作流（多步时使用，每步是一个指令） */
  steps?: string[]
  /** 分类标签 */
  category: string
  /** 使用次数 */
  useCount: number
  enabled: boolean
  createdAt: number
  updatedAt: number
}

// ============ 文件搜索 ============

/** 文件搜索结果项 */
export interface FileSearchResult {
  path: string
  name: string
  ext: string
  size: number
  mtime: number
  isDir: boolean
}

/** 文件索引状态 */
export interface FileIndexStatus {
  indexing: boolean
  totalFiles: number
  lastIndexedAt?: number
  indexedPaths: string[]
}

// ============ 代码片段 ============

/** 代码片段 */
export interface CodeSnippet {
  id: string
  title: string
  description: string
  language: string
  content: string
  tags: string[]
  category: string
  useCount: number
  enabled: boolean
  createdAt: number
  updatedAt: number
}

// ============ 系统自检 ============

/** 自检单项结果 */
export interface SelfCheckItem {
  name: string
  status: 'pass' | 'fail' | 'skip'
  detail: string
}

/** 自检进度推送载荷（主进程 → 自检弹窗） */
export interface SelfCheckProgressPayload {
  phase: 'pre-check' | 'ai-check'
  message: string
  timestamp: number
}

/** 自检完成载荷 */
export interface SelfCheckResultPayload {
  items: SelfCheckItem[]
  aiSkipped: boolean
  error?: string
  timestamp: number
}

// ============ 付费购买积分 ============

/** 付费积分套餐 */
export interface PaymentPlan {
  id: string
  name: string
  priceFen: number
  priceYuan: string
  credits: number
  bonus: number
  bonusPercent: number
  flashEquivalent: number
  proEquivalent: number
  badge?: string
  popular?: boolean
}

/** 套餐列表响应 */
export interface PlansResponse {
  plans: PaymentPlan[]
  validityDays: number
}

/** 付费积分余额 */
export interface PaidQuota {
  balance: number
  totalPurchased: number
  totalConsumed: number
  firstPurchaseAt: string | null
  lastPurchaseAt: string | null
  earliestExpiringAt: string | null
}

/** 限免模式下的免费积分配额（由 /api/ai/quota 返回） */
export interface RelayQuota {
  used: number
  limit: number
  remaining: number
  date: string
  /** 付费积分摘要（与 PaidQuota 字段子集一致，便于在限免面板中一并展示） */
  paid: {
    balance: number
    earliestExpiringAt: string | null
    totalPurchased: number
  } | null
}

/** 订单信息 */
export interface OrderInfo {
  orderNo: string
  payUrl: string
  amountFen: number
  credits: number
  planName: string
  expiresAt: string
}

/** 订单状态 */
export interface OrderStatus {
  orderNo: string
  status: 'pending' | 'paid' | 'closed'
  payUrl: string
  credits: number
  amountFen: number
  planName: string
  paidAt: string | null
  transactionId: string | null
  expiresAt: string
}
