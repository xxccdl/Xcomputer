import { mcpClient, type McpTool } from '../mcp/mcp-client'

/** OpenAI function calling 格式的工具定义 */
export interface FunctionSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/**
 * Windows-MCP 19 个工具的静态 schema（用于 AI function calling）。
 * 与 CursorTouch/Windows-MCP 工具列表对齐。
 */
export const STATIC_TOOL_SCHEMAS: FunctionSchema[] = [
  {
    type: 'function',
    function: {
      name: 'Click',
      description: '点击屏幕坐标或 UIA 元素。可指定 x/y 坐标或元素 ID。',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X 坐标' },
          y: { type: 'number', description: 'Y 坐标' },
          elementId: { type: 'string', description: 'UIA 元素 ID（来自 Snapshot）' },
          button: { type: 'string', enum: ['left', 'right'], description: '鼠标按键，默认 left' },
          doubleClick: { type: 'boolean', description: '是否双击' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Type',
      description: '在目标元素或当前焦点输入文本。可选先清空原内容。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要输入的文本' },
          elementId: { type: 'string', description: '目标 UIA 元素 ID（可选，不填则输入到当前焦点）' },
          clear: { type: 'boolean', description: '输入前是否清空' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Scroll',
      description: '滚动鼠标滚轮（垂直或水平）。',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
          amount: { type: 'number', description: '滚动量' }
        },
        required: ['direction', 'amount']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Move',
      description: '移动鼠标指针到指定坐标，支持拖拽。',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          drag: { type: 'boolean', description: '是否执行拖拽' }
        },
        required: ['x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Shortcut',
      description: '按下键盘组合键，如 Ctrl+C、Alt+F4、Win+L。',
      parameters: {
        type: 'object',
        properties: {
          keys: { type: 'string', description: '组合键，如 "ctrl+c"、"alt+f4"' }
        },
        required: ['keys']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Wait',
      description: '等待指定毫秒数。',
      parameters: {
        type: 'object',
        properties: { ms: { type: 'number', description: '等待毫秒数' } },
        required: ['ms']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'WaitFor',
      description: '等待某个 UIA 元素出现或条件满足。',
      parameters: {
        type: 'object',
        properties: {
          elementId: { type: 'string' },
          text: { type: 'string', description: '等待出现的文本' },
          timeout: { type: 'number', description: '超时毫秒' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Screenshot',
      description: '截取当前屏幕，返回 base64 PNG 图片。优先使用 Snapshot 获取文本信息，仅在需要视觉确认时使用。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Snapshot',
      description: '获取当前 UIA（UI 自动化）元素树快照，返回文本形式的所有可见窗口/控件信息。推荐优先使用此工具了解屏幕内容，而非 Screenshot。',
      parameters: {
        type: 'object',
        properties: {
          window: { type: 'string', description: '指定窗口标题或进程名（可选）' },
          depth: { type: 'number', description: '元素树深度' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'App',
      description: '应用管理：打开、列出、切换、关闭应用。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['open', 'list', 'focus', 'close'], description: '操作类型' },
          name: { type: 'string', description: '应用名称或路径（open/focus/close 时必填）' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'PowerShell',
      description: '【高危】执行 PowerShell 命令。调用前需用户确认。仅用于系统管理任务。',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string', description: 'PowerShell 命令' } },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'FileSystem',
      description: '文件系统操作：读写、移动、复制、删除文件/目录。删除类操作为高危，需确认。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write', 'list', 'move', 'copy', 'delete', 'mkdir'], description: '操作类型' },
          path: { type: 'string', description: '目标路径' },
          content: { type: 'string', description: '写入内容（write 时）' },
          destination: { type: 'string', description: '目标路径（move/copy 时）' }
        },
        required: ['action', 'path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Registry',
      description: '【高危】Windows 注册表读写。调用前需用户确认。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write', 'delete'], description: '操作类型' },
          key: { type: 'string', description: '注册表键路径' },
          value: { type: 'string', description: '值名' },
          data: { type: 'string', description: '要写入的数据' }
        },
        required: ['action', 'key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Process',
      description: '进程管理：列出、启动、终止进程。终止进程为高危操作，需确认。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'start', 'kill'], description: '操作类型' },
          name: { type: 'string', description: '进程名或 PID' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Clipboard',
      description: '读写系统剪贴板文本。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write'], description: '操作类型' },
          text: { type: 'string', description: '要写入的文本（write 时）' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Notification',
      description: '发送 Windows 系统通知。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          message: { type: 'string' }
        },
        required: ['title', 'message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Scrape',
      description: '抓取指定窗口或网页的文本内容。',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: '窗口标题或 URL' }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'MultiSelect',
      description: '批量选择列表项（支持 Ctrl 多选）。',
      parameters: {
        type: 'object',
        properties: {
          elementIds: { type: 'array', items: { type: 'string' }, description: '元素 ID 列表' },
          ctrl: { type: 'boolean', description: '是否按住 Ctrl' }
        },
        required: ['elementIds']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'MultiEdit',
      description: '批量编辑：在多个元素中输入文本。',
      parameters: {
        type: 'object',
        properties: {
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                elementId: { type: 'string' },
                text: { type: 'string' }
              }
            }
          }
        },
        required: ['edits']
      }
    }
  }
]

/** 从 MCP 动态工具列表生成 function schema（若 MCP 已连接则用动态，否则用静态） */
export function convertMcpToolsToSchemas(tools: McpTool[]): FunctionSchema[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description ?? `${t.name} 工具`,
      parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} }
    }
  }))
}

/**
 * 本地工具 schema（File + Terminal），始终注入，与 MCP 工具合并
 */
export const LOCAL_TOOL_SCHEMAS: FunctionSchema[] = [
  {
    type: 'function',
    function: {
      name: 'File',
      description:
        '本地文件操作工具（直接由 Xcomputer 执行，不依赖 MCP）。支持读写、列表、移动、复制、删除、创建目录、搜索文件等。比 FileSystem 更强大可靠。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['read', 'write', 'append', 'list', 'stat', 'move', 'copy', 'delete', 'mkdir', 'search'],
            description: '操作类型'
          },
          path: { type: 'string', description: '目标路径（read/write/list/stat/move源/copy源/delete/mkdir/search目录）' },
          content: { type: 'string', description: '写入/追加内容（write/append 时）' },
          destination: { type: 'string', description: '目标路径（move/copy 时）' },
          recursive: { type: 'boolean', description: '是否递归（list/delete/search 时）' },
          pattern: { type: 'string', description: '通配符模式（list/search 时），如 *.txt' },
          encoding: { type: 'string', description: '读取编码，默认 utf8，二进制用 buffer' },
          maxDepth: { type: 'number', description: '搜索最大深度（search 时），默认 6' }
        },
        required: ['action', 'path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Terminal',
      description:
        '后台终端管理工具。AI 可创建多个后台终端（cmd/powershell/bash），发送命令和按键，读取输出。适合运行命令行程序、编译、git 操作、长时间运行的服务等。终端在后台持续运行，AI 可随时查询输出。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'send', 'sendKey', 'output', 'clear', 'close', 'list', 'resize'],
            description: '操作类型'
          },
          terminalId: { type: 'string', description: '终端 ID（send/sendKey/output/clear/close/resize 时必填）' },
          data: { type: 'string', description: '要发送的数据/命令（send 时，默认自动回车）' },
          key: {
            type: 'string',
            description: '特殊按键（sendKey 时）：ctrl+c, ctrl+z, ctrl+d, enter, tab, esc, backspace, space'
          },
          shell: { type: 'string', description: 'shell 程序（create 时），默认 cmd.exe，可选 powershell.exe、bash 等' },
          cwd: { type: 'string', description: '工作目录（create 时），默认当前目录' },
          cols: { type: 'number', description: '终端列数（create/resize 时），默认 80' },
          rows: { type: 'number', description: '终端行数（create/resize 时），默认 24' },
          lines: { type: 'number', description: '获取最后 N 行输出（output 时），不填返回全部' },
          addNewline: { type: 'boolean', description: 'send 时是否自动添加回车，默认 true' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'TodoList',
      description:
        '任务清单管理工具。AI 在需要跟踪多步骤任务进度时使用。支持创建清单、添加子任务、标记完成/未完成、查看进度、清空清单。调用后工具会返回当前完整清单状态。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'add', 'complete', 'uncomplete', 'list', 'clear'],
            description: '操作类型'
          },
          tasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'create 时的初始任务文本列表'
          },
          text: {
            type: 'string',
            description: 'add/complete/uncomplete 时的任务文本（complete/uncomplete 支持模糊匹配）'
          },
          id: {
            type: 'string',
            description: 'complete/uncomplete 时的任务 ID（精确匹配，优先于 text）'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Memory',
      description:
        '长期记忆管理工具（Xmemory）。AI 可主动保存值得记住的用户信息，或检索历史记忆。当用户明确表达偏好、纠正你的错误、或提供重要个人信息时，应主动调用 save 保存。检索用户相关信息时用 search。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['save', 'search', 'list', 'delete'],
            description: '操作类型'
          },
          type: {
            type: 'string',
            enum: ['profile', 'habit', 'preference', 'fact', 'interaction', 'skill'],
            description: 'save 时的记忆类型：profile=用户画像, habit=操作习惯, preference=偏好, fact=事实, interaction=交互历史, skill=技能'
          },
          category: {
            type: 'string',
            description: 'save 时的细分类别，如 "tech_stack"、"workflow"、"env"'
          },
          content: {
            type: 'string',
            description: 'save 时的记忆内容（自然语言描述）'
          },
          confidence: {
            type: 'number',
            description: 'save 时的置信度 0-1，默认 0.8'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'save 时的标签列表'
          },
          keyword: {
            type: 'string',
            description: 'search 时的搜索关键词'
          },
          id: {
            type: 'string',
            description: 'delete 时的记忆 ID'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'AskUser',
      description:
        '向用户提问的工具。当任务执行中遇到歧义、需要用户做选择、或缺少必要信息时，调用此工具向用户提问。工具会暂停任务执行，等待用户回答后继续。支持开放式提问（不提供 options）和选择题（提供 options）两种模式。注意：不要滥用此工具，仅在确实需要用户输入才能继续时使用。',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: '要向用户提出的问题，应清晰明确地说明需要用户提供什么信息'
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: '可选的选项列表。提供时用户可从中选择，适合需要用户做决策的场景；不提供时为开放式输入'
          },
          placeholder: {
            type: 'string',
            description: '输入框占位提示文本（开放式提问时），帮助用户理解期望的输入格式'
          }
        },
        required: ['question']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Skill',
      description:
        '技能管理工具。系统会在 prompt 中列出相关技能的名称和描述，但完整内容需要调用 get 获取。遇到相关任务时先查看 prompt 中的技能列表，然后调用 get 获取完整操作步骤。任务完成后可将成功经验用 save 保存为技能供未来复用。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['search', 'save', 'list', 'get', 'delete'],
            description: '操作类型。get 用于获取技能完整内容，save 用于保存新技能'
          },
          keyword: {
            type: 'string',
            description: 'search 时的搜索关键词'
          },
          name: {
            type: 'string',
            description: 'save 时的技能名称（唯一），或 get/delete 时的技能名称'
          },
          description: {
            type: 'string',
            description: 'save 时的技能描述（简短说明用途）'
          },
          content: {
            type: 'string',
            description: 'save 时的技能内容（markdown 格式，包含操作步骤、注意事项等）'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'save 时的标签列表'
          },
          triggers: {
            type: 'array',
            items: { type: 'string' },
            description: 'save 时的触发关键词列表（用户提到这些词时优先使用此技能）'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Subagent',
      description:
        '子代理管理工具。AI 可以创建独立的子代理来并行或串行执行子任务，每个子代理拥有独立的 ReAct 循环和工具集。' +
        'foreground 模式：主代理等待子代理完成并获取结果（适合有依赖关系的串行子任务）。' +
        'background 模式：主代理立即继续执行，子代理在后台运行，完成后通过事件通知（适合并行独立子任务）。' +
        '子代理不能创建子代理、不能向用户提问、高危操作会被自动拒绝。' +
        '用户可在设置中预设自定义子智能体模板（如"代码审查员"、"翻译助手"），通过 templateName 参数引用，子代理将使用该模板的角色设定与系统提示词。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'list', 'get', 'wait', 'cancel'],
            description:
              '操作类型。create=创建子代理，list=列出当前会话的子代理，get=获取子代理状态，wait=等待后台子代理完成，cancel=取消子代理'
          },
          task: {
            type: 'string',
            description: 'create 时的任务描述（清晰明确的子任务说明）'
          },
          mode: {
            type: 'string',
            enum: ['foreground', 'background'],
            description: 'create 时的运行模式：foreground=等待结果（默认），background=后台运行'
          },
          templateName: {
            type: 'string',
            description: 'create 时可选：使用自定义子智能体模板名称（用户在设置中创建）。传入后子代理将使用该模板的角色设定与系统提示词。不传则使用默认子代理行为。'
          },
          id: {
            type: 'string',
            description: 'get/wait/cancel 时的子代理 ID'
          },
          maxRounds: {
            type: 'number',
            description: 'create 时的最大循环次数。用户可在设置中配置上限：若为"AI帮选"则由你根据任务复杂度决定（简单任务 10-20，复杂任务 30-50+，默认 50）；若用户指定了固定上限则不能超过该值。未传时使用默认值。'
          },
          timeoutMs: {
            type: 'number',
            description: 'wait 时的超时毫秒数（默认 60000，即 60 秒）'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'Snippet',
      description:
        '代码片段管理工具。用户已收藏的可复用代码片段库。AI 在需要查找用户已有的代码示例、复用模式、或保存当前会话产生的有价值的代码时使用。' +
        'search 用于按关键词检索片段（返回预览），get 用于按 ID 获取完整代码内容（同时会增加使用计数）。' +
        '当用户要求"查找我之前的代码"、"看看有没有相关片段"时优先使用 search；' +
        '当本会话产生了值得收藏的代码（如成功解决问题的脚本）时可用 save 保存供未来复用。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['search', 'list', 'get', 'save', 'delete'],
            description: '操作类型。search=按关键词搜索，list=列出所有启用的片段，get=按 ID 获取完整内容，save=保存新片段，delete=按 ID 删除片段'
          },
          keyword: {
            type: 'string',
            description: 'search 时的搜索关键词（匹配标题、描述、内容、语言、标签、分类）。为空时返回所有启用的片段'
          },
          id: {
            type: 'string',
            description: 'get/delete 时的代码片段 ID'
          },
          title: {
            type: 'string',
            description: 'save 时的片段标题（必填，简短明了）'
          },
          description: {
            type: 'string',
            description: 'save 时的片段描述（简短说明用途）'
          },
          language: {
            type: 'string',
            description: 'save 时的编程语言（如 javascript、typescript、python、bash、powershell 等，默认 plain）'
          },
          content: {
            type: 'string',
            description: 'save 时的代码内容（必填，完整代码文本）'
          },
          category: {
            type: 'string',
            description: 'save 时的分类（如 工具、算法、配置、示例 等）'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'save 时的标签列表（用于检索）'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'SystemInfo',
      description:
        '获取系统信息工具。支持查询操作系统版本、CPU 信息、内存使用、磁盘空间、系统运行时间、网络配置等。无需参数即可获取全部概览，也可指定 category 获取特定类别。',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['os', 'cpu', 'memory', 'disk', 'network', 'all'],
            description: '信息类别：os=操作系统, cpu=处理器, memory=内存, disk=磁盘, network=网络, all=全部（默认）'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'WebSearch',
      description:
        '互联网搜索工具。通过搜索引擎搜索关键词，返回搜索结果列表（标题、摘要、链接）。用于获取实时信息、查找文档、了解最新动态。每次最多返回 10 条结果。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          num: { type: 'number', description: '返回结果数量（默认 5，最大 10）' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'WebFetch',
      description:
        '网页内容抓取工具。获取指定 URL 的网页内容，自动提取正文文本（去除导航、广告等噪声）。支持指定最大长度防止输出过长。适合阅读文章、文档、API 响应等。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要抓取的网页 URL' },
          maxLength: { type: 'number', description: '最大返回字符数（默认 5000）' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'WindowManager',
      description:
        '高级窗口管理工具。支持列出所有窗口、聚焦/最小化/最大化/还原/关闭窗口、移动和调整窗口大小。比 MCP 的 App 工具提供更精细的窗口控制。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'focus', 'minimize', 'maximize', 'restore', 'close', 'move', 'resize', 'getposition'],
            description: '操作类型'
          },
          title: {
            type: 'string',
            description: '窗口标题（支持模糊匹配），list 时可不填'
          },
          x: { type: 'number', description: 'X 坐标（move/resize 时）' },
          y: { type: 'number', description: 'Y 坐标（move/resize 时）' },
          width: { type: 'number', description: '宽度（resize 时）' },
          height: { type: 'number', description: '高度（resize 时）' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'SystemAudio',
      description:
        '系统音频控制工具。获取/设置系统主音量、静音/取消静音。适合"调大音量"、"静音"、"音量调到50%"等场景。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'set', 'mute', 'unmute'],
            description: '操作类型：get=获取当前音量, set=设置音量, mute=静音, unmute=取消静音'
          },
          volume: {
            type: 'number',
            description: '音量值 0-100（set 时必填）'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ServiceManager',
      description:
        'Windows 服务管理工具。列出系统服务、启动/停止/重启服务。启动和停止服务为高危操作，需用户确认。适合管理系统服务如打印服务、蓝牙服务等。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'start', 'stop', 'restart', 'status'],
            description: '操作类型'
          },
          name: {
            type: 'string',
            description: '服务名称（start/stop/restart/status 时必填），如 Spooler、BITS'
          },
          status: {
            type: 'string',
            enum: ['running', 'stopped', 'all'],
            description: 'list 时过滤状态：running=仅运行中, stopped=仅已停止, all=全部（默认）'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'NetworkTools',
      description:
        '网络诊断工具。支持 Ping 测试连通性、获取本机 IP 地址（内网/外网）、检测端口是否开放。适合网络问题排查。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['ping', 'ip', 'portcheck'],
            description: '操作类型：ping=Ping 测试, ip=获取本机IP, portcheck=端口检测'
          },
          host: { type: 'string', description: '目标主机（ping/portcheck 时）' },
          port: { type: 'number', description: '目标端口（portcheck 时）' },
          count: { type: 'number', description: 'Ping 次数（默认 4）' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ZipArchive',
      description:
        'ZIP 压缩/解压工具。支持将文件或目录压缩为 ZIP 文件，以及解压 ZIP 文件到指定目录。适合文件打包、解包场景。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['compress', 'extract'],
            description: '操作类型：compress=压缩, extract=解压'
          },
          source: { type: 'string', description: '源路径（compress 时为文件/目录，extract 时为 ZIP 文件）' },
          destination: { type: 'string', description: '目标路径（compress 时为 ZIP 文件路径，extract 时为解压目录）' }
        },
        required: ['action', 'source', 'destination']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'BatchFile',
      description:
        '批量文件处理工具。支持批量重命名（前缀/后缀/序号/查找替换）、图片压缩（调整质量和尺寸）、图片格式转换、批量移动/复制文件。适合处理大量文件的场景。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['rename', 'compressImage', 'convertImage', 'batchMove'],
            description: '操作类型'
          },
          dir: { type: 'string', description: '目标目录路径' },
          pattern: { type: 'string', description: '文件匹配模式，如 *.jpg、*.{png,jpg}' },
          mode: {
            type: 'string',
            enum: ['prefix', 'suffix', 'sequence', 'replace'],
            description: '重命名模式（rename 时）：prefix=加前缀, suffix=加后缀, sequence=序号, replace=查找替换'
          },
          prefix: { type: 'string', description: '前缀文本（rename prefix模式时）' },
          suffix: { type: 'string', description: '后缀文本（rename suffix模式时）' },
          startNum: { type: 'number', description: '起始序号（rename sequence模式时），默认1' },
          find: { type: 'string', description: '查找文本（rename replace模式时）' },
          replace: { type: 'string', description: '替换文本（rename replace模式时）' },
          quality: { type: 'number', description: '压缩质量1-100（compressImage时），默认80' },
          maxWidth: { type: 'number', description: '最大宽度（compressImage时），等比缩放' },
          maxHeight: { type: 'number', description: '最大高度（compressImage时），等比缩放' },
          outputDir: { type: 'string', description: '输出目录（compressImage/convertImage时），默认原目录' },
          toFormat: {
            type: 'string',
            enum: ['jpg', 'png', 'webp', 'bmp'],
            description: '目标格式（convertImage时）'
          },
          destination: { type: 'string', description: '目标路径（batchMove时）' },
          copy: { type: 'boolean', description: '是否复制而非移动（batchMove时），默认false' }
        },
        required: ['action', 'dir']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'SystemOptimizer',
      description:
        '系统优化工具。支持分析系统状态（磁盘/内存/进程/启动项）、清理临时文件和缓存、查看Top进程、终止进程、管理开机启动项、一键优化。清理和终止进程为高危操作，需用户确认。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['analyze', 'clean', 'top_processes', 'kill_process', 'startup_list', 'disable_startup', 'optimize'],
            description: '操作类型'
          },
          target: {
            type: 'string',
            enum: ['temp', 'prefetch', 'recycle', 'all'],
            description: '清理目标（clean 时）：temp=临时文件, prefetch=预读取, recycle=回收站, all=全部'
          },
          name: { type: 'string', description: '进程名（kill_process 时）或启动项名（disable_startup 时）' },
          pid: { type: 'number', description: '进程 ID（kill_process 时，优先于 name）' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'CodeAnalyzer',
      description:
        '代码分析与审计工具（类似 Codex）。支持项目结构分析（目录树+技术栈识别）、依赖分析、代码质量审计（TODO/console.log/硬编码密钥/空catch）、安全扫描（eval/innerHTML/XSS/命令注入）、代码统计（语言分布/行数）、Git状态分析。用户说"分析项目"、"审计代码"、"代码质量"时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['project_structure', 'deps', 'audit', 'security_scan', 'stats', 'git_status'],
            description: '操作类型'
          },
          path: { type: 'string', description: '项目根目录路径，默认当前工作目录' },
          maxDepth: { type: 'number', description: '目录树最大深度（project_structure 时），默认3' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'PhoneControl',
      description:
        '手机控制工具。通过WebSocket向已配对的xphoneai App发送控制指令，实现截屏、点击、输入、滑动、App管理、硬件能力（GPS/摄像头/短信/通知）、文件管理等功能。需先在手机端安装xphoneai App并配对。用户说"操控手机"、"截屏手机"、"打开手机App"时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'screenshot', 'get_screen_text', 'tap', 'input_text', 'swipe', 'press_key',
              'open_app', 'list_apps', 'current_app', 'close_app',
              'get_location', 'take_photo', 'start_recording', 'stop_recording',
              'send_sms', 'send_notification', 'set_alarm', 'vibrate',
              'read_clipboard', 'write_clipboard',
              'list_files', 'download_file',
              'get_battery', 'get_device_info'
            ],
            description: '操作类型'
          },
          x: { type: 'number', description: 'X坐标（tap/input_text时，input_text不填则在当前焦点输入）' },
          y: { type: 'number', description: 'Y坐标（tap/input_text时，input_text不填则在当前焦点输入）' },
          text: { type: 'string', description: '输入文本（input_text/write_clipboard时）或App名称（open_app时）' },
          startX: { type: 'number', description: '滑动起点X（swipe时）' },
          startY: { type: 'number', description: '滑动起点Y（swipe时）' },
          endX: { type: 'number', description: '滑动终点X（swipe时）' },
          endY: { type: 'number', description: '滑动终点Y（swipe时）' },
          duration: { type: 'number', description: '滑动持续时间ms（swipe时）或录音时长ms（start_recording时）' },
          key: { type: 'string', enum: ['home', 'back', 'recents', 'volume_up', 'volume_down'], description: '按键（press_key时）' },
          package: { type: 'string', description: 'App包名（open_app/close_app时），如com.tencent.mm' },
          camera: { type: 'string', enum: ['front', 'back'], description: '摄像头（take_photo时），默认back' },
          quality: { type: 'number', description: '图片质量1-100（take_photo时），默认80' },
          number: { type: 'string', description: '手机号（send_sms时）' },
          message: { type: 'string', description: '短信内容（send_sms时）或通知内容（send_notification时）' },
          title: { type: 'string', description: '通知标题（send_notification时）或闹钟标签（set_alarm时）' },
          time: { type: 'string', description: '闹钟时间（set_alarm时），格式HH:mm' },
          pattern: { type: 'string', description: '振动模式（vibrate时），如"100,50,100"' },
          path: { type: 'string', description: '文件路径（list_files时），如DCIM/Downloads/Documents' },
          url: { type: 'string', description: '下载URL（download_file时）' },
          filename: { type: 'string', description: '保存文件名（download_file时）' }
        },
        required: ['action']
      }
    }
  }
]

/** 代码模式禁止的 UI 自动化工具 */
const CODE_MODE_BLOCKED_TOOLS = new Set([
  'Click', 'Type', 'Scroll', 'Move', 'Shortcut', 'Wait', 'WaitFor',
  'Screenshot', 'Snapshot', 'App', 'Scrape', 'MultiSelect', 'MultiEdit',
  'Clipboard', 'Notification', 'FileSystem',
  'WindowManager', 'SystemAudio' // UI 控制类工具，编程模式不需要
])

/** 获取工具 schema：MCP 动态 schema + 本地工具 schema */
export async function getToolSchemas(): Promise<FunctionSchema[]> {
  const tools = await mcpClient.listTools()
  const mcpSchemas =
    tools.length === 0 ? STATIC_TOOL_SCHEMAS : convertMcpToolsToSchemas(tools)
  return [...mcpSchemas, ...LOCAL_TOOL_SCHEMAS]
}

/** 获取代码模式专用工具 schema：仅保留文件/终端/记忆/技能/待办/子代理等编程相关工具，过滤 UI 自动化工具 */
export async function getCodeToolSchemas(): Promise<FunctionSchema[]> {
  const allTools = await getToolSchemas()
  return allTools.filter((t) => !CODE_MODE_BLOCKED_TOOLS.has(t.function.name))
}

/**
 * Plan/Spec 模式允许的工具白名单（只读 + 计划跟踪 + 提问）。
 * 子代理（Subagent）可执行修改性操作，违反只读原则，故排除。
 * 具体可执行的 action 由系统提示词进一步约束（如 File 仅 read/list/stat/search）。
 */
const PLAN_MODE_ALLOWED_TOOLS = new Set([
  'File',
  'Terminal',
  'TodoList',
  'Memory',
  'Skill',
  'Snippet',
  'SystemInfo',
  'WebSearch',
  'WebFetch',
  'Snapshot',
  'Screenshot',
  'CodeAnalyzer',
  'AskUser'
])

/** 获取 Plan/Spec 模式专用工具 schema：仅保留只读分析、计划跟踪与提问类工具。
 *  File / Terminal 在 schema 层面进一步收窄为只读 action，确保即便模型忽略提示词也无法修改系统。 */
export async function getPlanToolSchemas(): Promise<FunctionSchema[]> {
  const allTools = await getToolSchemas()
  return allTools
    .filter((t) => PLAN_MODE_ALLOWED_TOOLS.has(t.function.name))
    .map((t) => {
      if (t.function.name !== 'File' && t.function.name !== 'Terminal') return t
      const params = t.function.parameters as Record<string, unknown>
      const props = { ...(params.properties as Record<string, unknown>) }
      const actionProp = { ...(props.action as Record<string, unknown>) }
      // File 仅保留只读 action；Terminal 仅保留查看 action
      actionProp.enum =
        t.function.name === 'File'
          ? ['read', 'list', 'stat', 'search']
          : ['output', 'list']
      props.action = actionProp
      return { ...t, function: { ...t.function, parameters: { ...params, properties: props } } }
    })
}

/**
 * 本地模型（Qwen3-4B Q4量化，4K上下文）专用精简工具集。
 *
 * 设计约束：6 个核心工具 + 超紧凑描述，schema 总 token 控制在 ~1200 以内，
 * 配合 SYSTEM_PROMPT_LOCAL_TASK（~500 token）留出足够对话+生成空间。
 *
 * 注意：本地模型不通过 OpenAI tools 参数注入 schema（节省上下文），
 * 而是由 SYSTEM_PROMPT_LOCAL_TASK 用自然语言描述工具用法。
 * 此 schema 仍需返回，用于：
 * 1. orchestrator agent 循环按 schema.name 匹配并执行工具
 * 2. chatWithTools 记录上下文统计（本地模型记录为 0，不占用 llama 上下文）
 * 3. 高危确认（isHighRisk）按工具名+参数判断
 *
 * 6 个工具：File / Terminal / App / WebSearch / Memory / AskUser
 * 涵盖「看文件、跑命令、开应用、搜网页、记信息、问用户」最小可用闭环。
 */
export async function getLocalToolSchemas(): Promise<FunctionSchema[]> {
  // 从全量 schema 中提取这 6 个工具，收窄 action 以匹配 prompt 描述，保持参数定义一致
  const allTools = await getToolSchemas()
  const localAllowed = new Set(['File', 'Terminal', 'App', 'WebSearch', 'Memory', 'AskUser'])
  const picked = allTools.filter((t) => localAllowed.has(t.function.name))

  // File / Terminal 收窄 action 到 prompt 中描述的子集
  return picked.map((t) => {
    if (t.function.name === 'File') {
      const params = t.function.parameters as Record<string, unknown>
      const props = { ...(params.properties as Record<string, unknown>) }
      const actionProp = { ...(props.action as Record<string, unknown>) }
      actionProp.enum = ['read', 'list', 'search', 'write', 'mkdir']
      props.action = actionProp
      return { ...t, function: { ...t.function, parameters: { ...params, properties: props } } }
    }
    if (t.function.name === 'Terminal') {
      const params = t.function.parameters as Record<string, unknown>
      const props = { ...(params.properties as Record<string, unknown>) }
      const actionProp = { ...(props.action as Record<string, unknown>) }
      actionProp.enum = ['create', 'send', 'output', 'close']
      props.action = actionProp
      return { ...t, function: { ...t.function, parameters: { ...params, properties: props } } }
    }
    if (t.function.name === 'App') {
      const params = t.function.parameters as Record<string, unknown>
      const props = { ...(params.properties as Record<string, unknown>) }
      const actionProp = { ...(props.action as Record<string, unknown>) }
      actionProp.enum = ['open', 'close', 'list']
      props.action = actionProp
      return { ...t, function: { ...t.function, parameters: { ...params, properties: props } } }
    }
    return t
  })
}
