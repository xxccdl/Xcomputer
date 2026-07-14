// 共享常量

export const IPC_CHANNELS = {
  CHAT_SEND: 'chat:send',
  CHAT_STOP: 'chat:stop',
  CHAT_STEP: 'chat:step',
  CHAT_MESSAGE: 'chat:message',
  CHAT_CONFIRM_REQUEST: 'chat:confirmRequest',
  CHAT_CONFIRM_RESPONSE: 'chat:confirmResponse',
  CHAT_ASK_REQUEST: 'chat:askRequest',
  CHAT_ASK_RESPONSE: 'chat:askResponse',
  CHAT_ERROR: 'chat:error',
  CHAT_DONE: 'chat:done',
  CHAT_SET_MODE: 'chat:setMode',
  CHAT_MODE_CHANGED: 'chat:modeChanged',
  CHAT_GET_MODE: 'chat:getMode',
  // 上下文使用情况（主进程 -> 渲染进程）
  CHAT_CONTEXT_USAGE: 'chat:contextUsage',
  // 手动压缩上下文（渲染进程 -> 主进程）
  CHAT_CONTEXT_COMPRESS: 'chat:contextCompress',
  // 上下文压缩完成（主进程 -> 渲染进程，通知前端重载消息）
  CHAT_CONTEXT_COMPRESSED: 'chat:contextCompressed',

  SESSION_LIST: 'session:list',
  SESSION_CREATE: 'session:create',
  SESSION_DELETE: 'session:delete',
  SESSION_RENAME: 'session:rename',
  SESSION_GET_MESSAGES: 'session:getMessages',
  SESSION_GET_STEPS: 'session:getSteps',
  SESSION_GET_TODOS: 'session:getTodos',
  SESSION_GET_SUBAGENTS: 'session:getSubagents',
  SESSION_UPDATED: 'session:updated',
  SESSION_CREATED: 'session:created',
  SESSION_SEARCH: 'session:search',
  SESSION_EXPORT: 'session:export',

  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_TEST_MCP: 'settings:testMcp',
  SETTINGS_TEST_AI: 'settings:testAi',
  SETTINGS_CHANGED: 'settings:changed',

  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
  WINDOW_MAXIMIZED_CHANGED: 'window:maximizedChanged',
  WINDOW_SHOW: 'window:show',
  // 主窗口 mini 模式（agent 执行时缩为右下角状态药丸，跟小组件一样逻辑）
  MAIN_MINI_MODE: 'main:miniMode', // 主进程 → renderer：进入 mini 模式
  MAIN_FULL_MODE: 'main:fullMode', // 主进程 → renderer：恢复全尺寸模式
  MAIN_EXPAND: 'main:expand', // renderer → 主进程：用户点击 mini 药丸请求展开

  MCP_STATUS: 'mcp:status',

  // 悬浮球相关
  FLOATING_BALL_STATE: 'floatingBall:state',
  FLOATING_BALL_TOGGLE: 'floatingBall:toggle',
  FLOATING_BALL_CLICK: 'floatingBall:click',
  FLOATING_BALL_ACTION: 'floatingBall:action',
  FLOATING_BALL_DRAG: 'floatingBall:drag',
  FLOATING_BALL_DRAG_START: 'floatingBall:dragStart',
  FLOATING_BALL_DRAG_END: 'floatingBall:dragEnd',
  FLOATING_BALL_GET_STATE: 'floatingBall:getState',
  FLOATING_BALL_SET_MENU_VISIBLE: 'floatingBall:setMenuVisible',
  FLOATING_BALL_SET_MOUSE_EVENTS: 'floatingBall:setMouseEvents',

  // 定时任务相关
  SCHEDULE_LIST: 'schedule:list',
  SCHEDULE_CREATE: 'schedule:create',
  SCHEDULE_UPDATE: 'schedule:update',
  SCHEDULE_DELETE: 'schedule:delete',
  SCHEDULE_TOGGLE: 'schedule:toggle',
  SCHEDULE_RUN_NOW: 'schedule:runNow',
  SCHEDULE_GET_LOGS: 'schedule:getLogs',
  SCHEDULE_CHANGED: 'schedule:changed',
  SCHEDULE_RUN_LOG: 'schedule:runLog',

  // Xmemory 记忆系统相关
  MEMORY_LIST: 'memory:list',
  MEMORY_LIST_ARCHIVED: 'memory:listArchived',
  MEMORY_GET: 'memory:get',
  MEMORY_ADD: 'memory:add',
  MEMORY_UPDATE: 'memory:update',
  MEMORY_DELETE: 'memory:delete',
  MEMORY_CLEAR: 'memory:clear',
  MEMORY_SEARCH: 'memory:search',
  MEMORY_STATS: 'memory:stats',
  MEMORY_RESTORE: 'memory:restore',
  MEMORY_EXPORT: 'memory:export',
  MEMORY_IMPORT: 'memory:import',
  MEMORY_CLEANUP: 'memory:cleanup',
  MEMORY_CHANGED: 'memory:changed',
  MEMORY_SEMANTIC_SEARCH: 'memory:semanticSearch',
  MEMORY_GRAPH: 'memory:graph',
  MEMORY_VECTOR_STATUS: 'memory:vectorStatus',
  MEMORY_REBUILD_INDEX: 'memory:rebuildIndex',

  // 技能系统相关
  SKILL_LIST: 'skill:list',
  SKILL_GET: 'skill:get',
  SKILL_ADD: 'skill:add',
  SKILL_UPDATE: 'skill:update',
  SKILL_DELETE: 'skill:delete',
  SKILL_CLEAR: 'skill:clear',
  SKILL_SEARCH: 'skill:search',
  SKILL_STATS: 'skill:stats',
  SKILL_UPLOAD: 'skill:upload',
  SKILL_EXPORT: 'skill:export',
  SKILL_IMPORT: 'skill:import',
  SKILL_TOGGLE: 'skill:toggle',
  SKILL_CHANGED: 'skill:changed',

  // 任务模板相关
  TEMPLATE_LIST: 'template:list',
  TEMPLATE_GET: 'template:get',
  TEMPLATE_ADD: 'template:add',
  TEMPLATE_UPDATE: 'template:update',
  TEMPLATE_DELETE: 'template:delete',
  TEMPLATE_CHANGED: 'template:changed',

  // TodoList 待办事项
  CHAT_TODO_UPDATE: 'chat:todoUpdate',

  // 排队状态（限免模式高并发时排队等待）
  CHAT_QUEUE_UPDATE: 'chat:queueUpdate',
  CHAT_QUEUE_SKIP: 'chat:queueSkip',

  // Subagent 子代理
  CHAT_SUBAGENT_UPDATE: 'chat:subagentUpdate',

  // 远程控制（手机远程操控）
  REMOTE_START: 'remote:start',
  REMOTE_STOP: 'remote:stop',
  REMOTE_STATE: 'remote:state',
  REMOTE_COMMAND: 'remote:command',

  // XSkillHub 技能市场
  SKILL_HUB_LIST: 'skillHub:list',
  SKILL_HUB_GET: 'skillHub:get',
  SKILL_HUB_DOWNLOAD: 'skillHub:download',
  SKILL_HUB_UPLOAD: 'skillHub:upload',
  SKILL_HUB_RATE: 'skillHub:rate',
  SKILL_HUB_CATEGORIES: 'skillHub:categories',
  SKILL_HUB_STATS: 'skillHub:stats',
  SKILL_HUB_SEARCH: 'skillHub:search',

  // XSkillHub 管理员
  SKILL_HUB_ADMIN_LOGIN: 'skillHub:adminLogin',
  SKILL_HUB_ADMIN_INFO: 'skillHub:adminInfo',
  SKILL_HUB_ADMIN_LOGOUT: 'skillHub:adminLogout',
  SKILL_HUB_ADMIN_LIST: 'skillHub:adminList',
  SKILL_HUB_ADMIN_DELETE: 'skillHub:adminDelete',
  SKILL_HUB_ADMIN_UPDATE: 'skillHub:adminUpdate',
  SKILL_HUB_ADMIN_STATS: 'skillHub:adminStats',
  SKILL_HUB_ADMIN_CHANGE_PASSWORD: 'skillHub:adminChangePassword',

  // 自动化触发器
  TRIGGER_LIST: 'trigger:list',
  TRIGGER_GET: 'trigger:get',
  TRIGGER_ADD: 'trigger:add',
  TRIGGER_UPDATE: 'trigger:update',
  TRIGGER_DELETE: 'trigger:delete',
  TRIGGER_TOGGLE: 'trigger:toggle',
  TRIGGER_TEST: 'trigger:test',
  TRIGGER_CHANGED: 'trigger:changed',
  TRIGGER_GET_LOGS: 'trigger:getLogs',
  TRIGGER_RUN_LOG: 'trigger:runLog',

  // 快捷指令
  SHORTCUT_LIST: 'shortcut:list',
  SHORTCUT_GET: 'shortcut:get',
  SHORTCUT_ADD: 'shortcut:add',
  SHORTCUT_UPDATE: 'shortcut:update',
  SHORTCUT_DELETE: 'shortcut:delete',
  SHORTCUT_TOGGLE: 'shortcut:toggle',
  SHORTCUT_EXPAND: 'shortcut:expand',
  SHORTCUT_CHANGED: 'shortcut:changed',

  // 文件搜索
  FILE_SEARCH_INDEX: 'fileSearch:index',
  FILE_SEARCH_QUERY: 'fileSearch:query',
  FILE_SEARCH_STATUS: 'fileSearch:status',
  FILE_SEARCH_REBUILD: 'fileSearch:rebuild',
  FILE_SEARCH_STOP: 'fileSearch:stop',

  // 代码片段
  SNIPPET_LIST: 'snippet:list',
  SNIPPET_GET: 'snippet:get',
  SNIPPET_ADD: 'snippet:add',
  SNIPPET_UPDATE: 'snippet:update',
  SNIPPET_DELETE: 'snippet:delete',
  SNIPPET_TOGGLE: 'snippet:toggle',
  SNIPPET_SEARCH: 'snippet:search',
  SNIPPET_CHANGED: 'snippet:changed',

  // 自定义子智能体模板
  CUSTOM_SUBAGENT_LIST: 'customSubagent:list',
  CUSTOM_SUBAGENT_GET: 'customSubagent:get',
  CUSTOM_SUBAGENT_ADD: 'customSubagent:add',
  CUSTOM_SUBAGENT_UPDATE: 'customSubagent:update',
  CUSTOM_SUBAGENT_DELETE: 'customSubagent:delete',
  CUSTOM_SUBAGENT_TOGGLE: 'customSubagent:toggle',
  CUSTOM_SUBAGENT_GENERATE: 'customSubagent:generate',
  CUSTOM_SUBAGENT_CHANGED: 'customSubagent:changed',

  // 首次使用初始化引导
  INIT_CHECK: 'init:check',
  INIT_REBUILD_VENV: 'init:rebuildVenv',
  INIT_SAVE_SETTINGS: 'init:saveSettings',
  INIT_RESET: 'init:reset',
  INIT_SHOW_GUIDE: 'init:showGuide',
  INIT_PROGRESS: 'init:progress',
  INIT_COMPLETE: 'init:complete',

  // 系统自检
  SELF_CHECK_RUN: 'selfCheck:run',
  SELF_CHECK_PROGRESS: 'selfCheck:progress',
  SELF_CHECK_COMPLETE: 'selfCheck:complete',
  SELF_CHECK_CLOSE: 'selfCheck:close',

  // 应用更新
  UPDATE_CHECK: 'update:check', // 手动/自动检查更新
  UPDATE_DOWNLOAD: 'update:download', // 触发下载
  UPDATE_INSTALL: 'update:install', // 触发安装
  UPDATE_STATUS: 'update:status', // 推送状态（检查结果/下载进度）
  APP_VERSION: 'app:version', // 获取当前应用版本号

  // 限免模式积分
  AI_GET_RELAY_QUOTA: 'ai:getRelayQuota', // 查询限免剩余积分
  AI_RELAY_QUOTA_UPDATED: 'ai:relayQuotaUpdated', // 推送积分更新（启动签到/请求后刷新）

  // 付费购买积分
  PAYMENT_GET_PLANS: 'payment:getPlans', // 获取套餐列表
  PAYMENT_CREATE_ORDER: 'payment:createOrder', // 创建订单
  PAYMENT_OPEN_BROWSER: 'payment:openBrowser', // 在浏览器打开支付链接
  PAYMENT_POLL_ORDER: 'payment:pollOrder', // 轮询订单状态
  PAYMENT_CANCEL_POLL: 'payment:cancelPoll', // 取消轮询
  PAYMENT_GET_QUOTA: 'payment:getQuota', // 查询付费积分余额
  PAYMENT_QUOTA_UPDATED: 'payment:quotaUpdated', // 推送付费积分更新

  // XC 桌面组件
  WIDGET_CHAT_SEND: 'widget:chatSend', // 发送对话消息（简单模式，无 agent）
  WIDGET_CHAT_STOP: 'widget:chatStop', // 中断当前对话
  WIDGET_CHAT_DELTA: 'widget:chatDelta', // 流式输出增量推送
  WIDGET_CHAT_DONE: 'widget:chatDone', // 对话完成
  WIDGET_CHAT_ERROR: 'widget:chatError', // 对话出错
  WIDGET_GET_TASK_STATE: 'widget:getTaskState', // 查询当前任务进度
  WIDGET_TASK_STEP: 'widget:taskStep', // 任务步骤更新推送
  WIDGET_TASK_DONE: 'widget:taskDone', // 任务完成推送
  WIDGET_TASK_ERROR: 'widget:taskError', // 任务出错推送
  WIDGET_HIDE: 'widget:hide', // 隐藏 widget 窗口
  WIDGET_STOP_TASK: 'widget:stopTask', // 停止主窗口当前任务
  WIDGET_GET_QUOTA: 'widget:getQuota', // 查询积分（限免 + 付费）
  WIDGET_GET_SETTINGS: 'widget:getSettings', // 查询当前设置
  WIDGET_UPDATE_SETTINGS: 'widget:updateSettings', // 更新设置（部分字段）
  WIDGET_QUOTA_UPDATED: 'widget:quotaUpdated', // 推送积分更新到 widget 窗口
  WIDGET_BUY_CREDITS: 'widget:buyCredits', // 打开主窗口购买积分面板
  WIDGET_OPEN_SETTINGS: 'widget:openSettings', // 打开主窗口完整设置面板

  // Widget Agent 模式（独立 session 的 agent 执行）
  WIDGET_AGENT_SEND: 'widget:agentSend', // 发送 agent 指令（forceTask）
  WIDGET_AGENT_STOP: 'widget:agentStop', // 中断当前 agent 任务
  WIDGET_AGENT_NEW_SESSION: 'widget:agentNewSession', // 新建 agent 会话（清空历史）
  WIDGET_AGENT_GET_STATE: 'widget:agentGetState', // 拉取当前 agent 状态（messages + currentStatus + isRunning）
  WIDGET_AGENT_STEP: 'widget:agentStep', // agent 步骤推送（友好状态）
  WIDGET_AGENT_DONE: 'widget:agentDone', // agent 任务完成
  WIDGET_AGENT_ERROR: 'widget:agentError', // agent 任务出错
  WIDGET_AGENT_MESSAGE: 'widget:agentMessage', // agent 消息推送（用户/助手/系统消息）
  WIDGET_CONFIRM_REQUEST: 'widget:confirmRequest', // 高危确认请求（转发自 CHAT_CONFIRM_REQUEST，source=widget）
  WIDGET_CONFIRM_RESPONSE: 'widget:confirmResponse', // 高危确认响应（widget → 主进程）
  WIDGET_ASK_REQUEST: 'widget:askRequest', // AI 提问请求（source=widget）
  WIDGET_ASK_RESPONSE: 'widget:askResponse', // AI 提问响应（widget → 主进程）
  WIDGET_AGENT_REFRESH: 'widget:agentRefresh', // 窗口重新显示时触发状态刷新
  WIDGET_LIST_SESSIONS: 'widget:listSessions', // 查询所有会话 + 运行状态
  WIDGET_DELETE_SESSION: 'widget:deleteSession', // 删除指定会话
  WIDGET_LOAD_SESSION: 'widget:loadSession', // 加载已有会话到 widget agent
  WIDGET_MINI_MODE: 'widget:miniMode', // 主进程 → renderer：进入 mini 模式（AI 点击时缩为小窗）
  WIDGET_FULL_MODE: 'widget:fullMode', // 主进程 → renderer：恢复全尺寸模式
  WIDGET_EXPAND: 'widget:expand', // renderer → 主进程：用户点击 mini 窗口请求展开

  // 确认/提问已解决广播（主进程 → 所有窗口，用于自动关闭对话框）
  CHAT_CONFIRM_RESOLVED: 'chat:confirmResolved',
  CHAT_ASK_RESOLVED: 'chat:askResolved',

  // 本地模型（实验性）：node-llama-cpp 进程内推理
  LOCAL_MODEL_GET_STATUS: 'localModel:getStatus', // 查询当前状态
  LOCAL_MODEL_DOWNLOAD: 'localModel:download', // 触发基座模型下载
  LOCAL_MODEL_CANCEL_DOWNLOAD: 'localModel:cancelDownload', // 取消下载
  LOCAL_MODEL_LOAD: 'localModel:load', // 加载模型到内存（就绪推理）
  LOCAL_MODEL_TEST: 'localModel:test', // 推理健康检查
  LOCAL_MODEL_DISPOSE: 'localModel:dispose', // 卸载模型释放显存/内存
  LOCAL_MODEL_STATUS: 'localModel:status' // 推送状态变更（主进程 -> 渲染进程）
} as const

/** XSkillHub 服务器地址（直连源站 IP，CDN 不转发 3210 端口） */
export const SKILL_HUB_BASE_URL = 'http://175.27.141.172:3210'

/** 限免模式：AI 中继 Base URL（OpenAI 协议兼容，客户端未填 key 时自动启用） */
export const XSKILLHUB_RELAY_BASE_URL = 'http://175.27.141.172:3210/v1'

/** 限免模式：占位 API Key（后端不校验，仅满足 OpenAI SDK 必填要求） */
export const XSKILLHUB_RELAY_API_KEY = 'xskillhub-relay'

/** 限免模式：每日每 IP 最大调用次数 */
export const RELAY_DAILY_LIMIT = 50

/** 限免模式强制使用的模型（后端中继只接受此模型，客户端必须主动传正确模型） */
export const RELAY_MODEL = 'deepseek-v4-flash'

/** 付费中继支持的 pro 模型（付费用户可选，消耗 4 积分/次） */
export const PAID_PRO_MODEL = 'deepseek-v4-pro'

/** 付费积分扣减规则：flash 1 积分/次，pro 4 积分/次 */
export const PAID_CREDITS = {
  FLASH_COST: 1,
  PRO_COST: 4,
  VALIDITY_DAYS: 365
} as const

/**
 * 本地模型（实验性）：进程内 node-llama-cpp 推理，不依赖网络与外部服务。
 * 首次运行从 ModelScope 下载 Qwen3-4B-Instruct GGUF 基座（约 2.33GB），
 * 叠加内置 litex LoRA（GGUF，随安装包分发）。
 */

/** 本地模型在 OpenAI 兼容接口中使用的模型名 */
export const LOCAL_MODEL_NAME = 'qwen3-4b-litex'

/** 实际创建的上下文长度（tokens）。
 *  4K 上下文：Qwen3-4B Q4 量化约需 2.5GB 内存，prefill 速度可控。
 *  16K 会导致 CPU 推理 prefill 极慢（首 token 延迟可达 30s+），降至 4K 后约 3-5s。 */
export const LOCAL_MODEL_MAX_CONTEXT_TOKENS = 4_096

/** 推理批处理大小：prefill 阶段每批处理的 token 数。
 *  默认 512 太小，2048 可显著加速 prefill（首 token 延迟降低 3-5 倍）。 */
export const LOCAL_MODEL_BATCH_SIZE = 2048

/** CPU 推理线程数。0 = 自动使用全部逻辑核心（机器检测到 16 核）。 */
export const LOCAL_MODEL_THREADS = 0

/** 是否启用 Flash Attention。加速 attention 计算、降低内存占用。 */
export const LOCAL_MODEL_FLASH_ATTENTION = true

/** 基座模型 ModelScope 仓库（unsloth 发布的 Qwen3-4B-Instruct-2507 GGUF 量化版） */
export const LOCAL_MODEL_BASE_REPO = 'unsloth/Qwen3-4B-Instruct-2507-GGUF'
/** 基座模型文件名（Q4_K_M 量化：质量/体积平衡最佳） */
export const LOCAL_MODEL_BASE_FILE = 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf'
/** 基座模型字节大小（用于下载进度校验，约 2.33GB） */
export const LOCAL_MODEL_BASE_SIZE = 2_497_281_120
/** 基座模型下载直链（ModelScope resolve 接口，支持 Range 断点续传） */
export const LOCAL_MODEL_DOWNLOAD_URL = `https://www.modelscope.cn/models/${LOCAL_MODEL_BASE_REPO}/resolve/master/${LOCAL_MODEL_BASE_FILE}`

/** litex LoRA 适配器文件名（GGUF 格式，随安装包 resources/local-models/ 分发） */
export const LOCAL_MODEL_LORA_FILE = 'litex-lora.gguf'
/** LoRA 缩放系数。1.0 = 默认强度（alpha/rank 由 GGUF 元数据自动应用，无需手动指定） */
export const LOCAL_MODEL_LORA_SCALE = 1.0

/** OpenX 内核加速：积分消耗倍率（3 倍） */
export const OPENX_MULTIPLIER = 3

/** OpenX 云端代理 Base URL（限免模式 + OpenX 加速时使用，云端自动压缩/还原，兼容 OpenAI SDK） */
export const OPENX_PROXY_BASE_URL = 'https://backend.appmiaoda.com/projects/supabase334201161320022016/functions/v1/openx-proxy'

/** OpenX 预设模板字典（807 个高频代码模板，按类别组织，{0}/{1} 为参数占位符） */
// 完整字典定义在 openx-templates.ts，此处 re-export 供其他模块引用
// 解码器注册全部模板；提示词仅注入 OPENX_CORE_TEMPLATES 核心子集以控制 token 开销
export {
  OPENX_PRESET_TEMPLATES,
  OPENX_TEMPLATE_COUNT,
  OPENX_CORE_TEMPLATES,
  OPENX_CORE_COUNT
} from './openx-templates'

/** 限免模式：最大上下文 tokens（flash 模型 + 成本控制，远小于直连的 1M） */
export const RELAY_MAX_CONTEXT_TOKENS = 500_000

/** 应用更新 manifest URL（website 部署在 xxccdl.cn，CDN 加速）。
 *  必须使用 HTTPS 防止中间人攻击篡改更新清单。 */
export const UPDATE_MANIFEST_URL = 'https://xxccdl.cn/download/manifest.json'

/** 远程控制源站 IP（CDN 不转发 3210 端口，WebSocket 与二维码需直连源站） */
export const REMOTE_ORIGIN_URL = 'http://175.27.141.172:3210'

/** 支持的模型 */
export const SUPPORTED_MODELS = {
  FAST: ['deepseek-v4-flash'],
  PRO: ['deepseek-v4-pro', 'kimi-k2.7-code-highspeed']
} as const

/** Kimi K2.7 Code 系列最大上下文长度（256K tokens） */
export const KIMI_K27_MAX_CONTEXT_TOKENS = 256_000

export const MCP_SERVER_COMMAND_DEFAULT = 'uvx'
export const MCP_SERVER_PACKAGE = 'windows-mcp'

/** 高危工具名 — 调用前需用户确认 */
export const HIGH_RISK_TOOLS = ['PowerShell', 'Registry', 'Process'] as const

/** 高危 FileSystem 操作关键词（出现在 args 中触发确认） */
export const HIGH_RISK_FS_KEYWORDS = ['delete', 'remove', 'rmdir', 'unlink'] as const

/** 本地 File 工具的高危 action */
export const HIGH_RISK_LOCAL_ACTIONS = ['delete'] as const

/** 本地工具名（不依赖 MCP，直接由 Xcomputer 执行） */
export const LOCAL_TOOL_NAMES = [
  'File',
  'Terminal',
  'TodoList',
  'Memory',
  'Skill',
  'SystemInfo',
  'WebSearch',
  'WebFetch',
  'WindowManager',
  'SystemAudio',
  'ServiceManager',
  'NetworkTools',
  'ZipArchive',
  'BatchFile',
  'Snippet',
  'SystemOptimizer',
  'CodeAnalyzer',
  'PhoneControl'
] as const

/** ServiceManager 的高危 action（启停系统服务需用户确认） */
export const HIGH_RISK_SERVICE_ACTIONS = ['start', 'stop', 'restart', 'disable'] as const

/** SystemOptimizer 的高危 action（清理/终止进程需用户确认） */
export const HIGH_RISK_OPTIMIZER_ACTIONS = ['clean', 'kill_process', 'disable_startup', 'optimize'] as const

/** PhoneControl 的高危 action（发送短信/关闭App/下载文件需用户确认） */
export const HIGH_RISK_PHONE_ACTIONS = ['send_sms', 'close_app', 'download_file'] as const

export const MAX_AGENT_LOOPS = 1000
export const MAX_SNAPSHOT_TOKENS = 4000

/** DeepSeek 最大上下文长度（1M tokens） */
export const DEEPSEEK_MAX_CONTEXT_TOKENS = 1_000_000
/** 触发上下文压缩的阈值（90%） */
export const CONTEXT_COMPRESSION_THRESHOLD = 0.9
/** 上下文压缩后保留的最近消息条数 */
export const CONTEXT_COMPRESSION_KEEP_MESSAGES = 8
/** 粗略估算：1 token ≈ 3 个字符（中文环境下偏低估算，保守触发压缩） */
export const CHARS_PER_TOKEN_ESTIMATE = 3

/** 系统自检 AI agent 最大循环轮数 */
export const SELF_CHECK_MAX_LOOPS = 12
