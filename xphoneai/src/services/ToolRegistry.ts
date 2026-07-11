import type { CommandExecutor } from './CommandExecutor'

/** DeepSeek function-calling 工具定义（OpenAI 兼容格式） */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** 需要用户确认的高危操作 */
export const HIGH_RISK_ACTIONS = new Set(['send_sms', 'close_app', 'download_file'])

/** AI 内部任务跟踪工具（不经过 CommandExecutor，在 AIService 中拦截） */
export const TODO_ACTIONS = new Set(['plan_tasks', 'update_task'])

/**
 * 工具注册表：将 CommandExecutor 的 action 包装为 DeepSeek function-calling 工具
 */
export class ToolRegistry {
  constructor(private executor: CommandExecutor) {}

  /** 返回所有工具定义（传给 DeepSeek 的 tools 参数） */
  getToolDefinitions(): ToolDefinition[] {
    return TOOLS
  }

  /** 判断是否高危操作 */
  isHighRisk(action: string): boolean {
    return HIGH_RISK_ACTIONS.has(action)
  }

  /** 执行工具，返回结果字符串 */
  async execute(action: string, args: Record<string, unknown>): Promise<string> {
    return this.executor.execute(action, args)
  }
}

const TOOLS: ToolDefinition[] = [
  // === UI 自动化 ===
  {
    type: 'function',
    function: {
      name: 'screenshot',
      description: '截取当前手机屏幕，返回屏幕截图（base64）和屏幕文字内容。用于查看手机当前显示的画面。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_screen_text',
      description: '获取当前屏幕上的所有文字内容（通过无障碍服务）。比截图更轻量，适合只需要读取文字的场景。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_ui_tree',
      description: '获取当前屏幕的UI元素树（JSON数组），每个元素包含 type/text/desc/clickable/bounds/center 坐标。适合需要精确点击坐标的场景，如"点击登录按钮"。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tap',
      description: '点击屏幕指定坐标。',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: '点击的 X 坐标' },
          y: { type: 'number', description: '点击的 Y 坐标' }
        },
        required: ['x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'input_text',
      description: '在指定位置或当前焦点输入文本。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要输入的文本' },
          x: { type: 'number', description: '输入位置的 X 坐标（可选，不填则在当前焦点输入）' },
          y: { type: 'number', description: '输入位置的 Y 坐标（可选）' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'swipe',
      description: '在屏幕上滑动（用于滚动、翻页等）。',
      parameters: {
        type: 'object',
        properties: {
          startX: { type: 'number', description: '起点 X' },
          startY: { type: 'number', description: '起点 Y' },
          endX: { type: 'number', description: '终点 X' },
          endY: { type: 'number', description: '终点 Y' },
          duration: { type: 'number', description: '滑动时长(毫秒)，默认 300' }
        },
        required: ['startX', 'startY', 'endX', 'endY']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'press_key',
      description: '按下系统按键。支持: home, back, recents, power, volume_up, volume_down, enter, delete。',
      parameters: {
        type: 'object',
        properties: { key: { type: 'string', description: '按键名称' } },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_app',
      description: '通过包名打开指定 App，将其切换到前台。',
      parameters: {
        type: 'object',
        properties: {
          package: { type: 'string', description: 'App 包名，如 com.tencent.mm（微信）。可用 list_apps 查询已安装 App' }
        },
        required: ['package']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_apps',
      description: '列出手机上已安装的 App，返回包名和名称列表。用于查找目标 App 的 package。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'current_app',
      description: '获取当前处于前台的 App 包名。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'close_app',
      description: '关闭指定 App（通过按 Home 键回到桌面）。高危操作，需用户确认。',
      parameters: {
        type: 'object',
        properties: { package: { type: 'string', description: '要关闭的 App 包名' } },
        required: ['package']
      }
    }
  },
  // === 硬件能力 ===
  {
    type: 'function',
    function: {
      name: 'get_location',
      description: '获取当前 GPS 位置（经纬度）。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_sms',
      description: '打开短信 App 并预填收件人和内容（需用户手动发送）。高危操作，需用户确认。',
      parameters: {
        type: 'object',
        properties: {
          number: { type: 'string', description: '收件人手机号' },
          message: { type: 'string', description: '短信内容' }
        },
        required: ['number', 'message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_notification',
      description: '发送一条本地通知到手机。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '通知标题' },
          message: { type: 'string', description: '通知内容' }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_alarm',
      description: '设置闹钟提醒。',
      parameters: {
        type: 'object',
        properties: {
          time: { type: 'string', description: '闹钟时间，如 08:30' },
          title: { type: 'string', description: '闹钟标题' }
        },
        required: ['time']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vibrate',
      description: '让手机振动。',
      parameters: {
        type: 'object',
        properties: { pattern: { type: 'string', description: '振动模式（逗号分隔的毫秒数），如 500 或 0,500,200,500' } },
        required: []
      }
    }
  },
  // === 剪贴板 ===
  {
    type: 'function',
    function: {
      name: 'read_clipboard',
      description: '读取剪贴板内容。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_clipboard',
      description: '写入内容到剪贴板。',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', description: '要写入的文本' } },
        required: ['text']
      }
    }
  },
  // === 文件管理 ===
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出指定目录下的文件。',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '相对路径（基于 App 文档目录）' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'download_file',
      description: '下载文件到 App 文档目录。高危操作，需用户确认。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '下载链接' },
          filename: { type: 'string', description: '保存的文件名' }
        },
        required: ['url']
      }
    }
  },
  // === 系统信息 ===
  {
    type: 'function',
    function: {
      name: 'get_battery',
      description: '获取电池电量和充电状态。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_device_info',
      description: '获取设备信息（型号、品牌、系统版本）。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  // === AI 任务进度跟踪（内部工具，不操控手机） ===
  {
    type: 'function',
    function: {
      name: 'plan_tasks',
      description: '规划任务清单。复杂任务（≥3步）执行前先调用此工具列出所有步骤，让用户看到进度。会替换之前的清单。',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: { type: 'string' },
            description: '任务步骤列表，如 ["打开微信","找到张三的聊天","发送消息：晚上一起吃饭"]'
          }
        },
        required: ['tasks']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: '更新某个任务步骤的状态。开始执行某步时标记为 in_progress，完成后标记为 done。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'number', description: '任务步骤的 id（plan_tasks 返回的 id）' },
          status: { type: 'string', enum: ['in_progress', 'done'], description: '新状态' }
        },
        required: ['id', 'status']
      }
    }
  }
]
