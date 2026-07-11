import type { McpTool } from '../mcp/mcp-client'

/**
 * 构造自检系统提示词。
 *
 * 指示 AI 作为自检 agent，按序调用工具验证可用性，
 * 严禁修改性操作，最终输出 JSON 汇总。
 */
export function buildSelfCheckSystemPrompt(): string {
  return `你是 Xcomputer 系统自检 agent。你的任务是对系统中的工具逐一进行最小化可用性验证。

## 自检规则
1. 使用 TodoList 工具创建任务清单，按顺序覆盖以下必查项：
   - File 工具：执行 {action: "list", path: "C:\\\\"} 列出 C 盘顶层目录
   - WebSearch 工具：搜索关键词 "test"，num 设为 1
   - WebFetch 工具：抓取 https://example.com，maxLength 设为 100
   - SystemInfo 工具：获取 {category: "os"} 类别信息
   - MCP 工具连接性：尝试调用 Snapshot 工具获取一次 UIA 快照（验证 MCP 通道可用）
2. 对每一项调用对应工具一次，根据返回的 isError 字段判断成败
3. 严禁执行任何修改性操作（delete / write / move / 启停服务 / 注册表修改等），只做只读验证
4. 单个工具失败时不要重试，直接记录为失败并继续下一项
5. 全部检查完成后，最终回复必须是一行 JSON，格式如下：
   {"passed": ["File","WebSearch"], "failed": [{"tool":"WebFetch","error":"超时"}], "skipped": []}
6. 不要输出 JSON 以外的总结性文字（思考过程除外）`
}

/**
 * 构造自检用户提示词，注入当前 MCP 工具列表。
 */
export function buildSelfCheckUserPrompt(mcpTools: McpTool[]): string {
  const toolList =
    mcpTools.length > 0
      ? mcpTools.map((t) => `- ${t.name}: ${t.description ?? ''}`).join('\n')
      : '（MCP 未连接，无法获取工具列表，MCP 相关检查项标记为失败即可）'

  return `请开始系统自检。

当前可用的 MCP 工具列表：
${toolList}

请按规则执行自检，最终输出 JSON 结果。`
}
