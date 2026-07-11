import OpenAI from 'openai'
import { settingsStore } from '../store/settings'
import { memoryStore } from '../store/memory'
import { logger } from '../utils/logger'
import type { MemoryItem, MemoryType } from '@shared/types'

interface ExtractedMemory {
  type: MemoryType
  category: string
  content: string
  confidence: number
  tags: string[]
  entities?: string[]
}

const EXTRACT_PROMPT = `你是一个记忆提取器。分析用户与 AI 的对话，提取值得长期记住的用户信息。

只提取有长期价值的信息，忽略一次性的任务细节。提取类型：

- profile：用户画像（职业、技术栈、操作系统、语言偏好、姓名等）
- habit：操作习惯（常用应用、工作流模式、常用路径、操作顺序偏好）
- preference：偏好设置（UI 偏好、代码风格、回复风格、工具选择）
- fact：事实知识（项目名称、团队、环境配置、账号、设备信息）
- interaction：历史交互（重要决策、用户反馈、纠正、偏好确认）
- skill：技能记忆（用户教过的特定操作方式、自定义流程）

提取规则：
1. 只提取明确或强暗示的信息，不要猜测
2. 每条记忆应该是原子化的、可独立理解的事实
3. confidence：0-1，1 表示用户明确声明，0.5 表示从行为推断
4. 如果没有值得提取的信息，返回空数组

只返回 JSON，格式：
{
  "memories": [
    {
      "type": "profile",
      "category": "tech_stack",
      "content": "用户是前端开发者，使用 React 和 TypeScript",
      "confidence": 0.9,
      "tags": ["react", "typescript", "frontend"],
      "entities": ["react", "typescript", "前端"]
    }
  ]
}

entities 字段说明：从 content 中提取的关键实体（人名、技术名、工具名、项目名、应用名等），小写，去重。用于知识图谱关联检索。`

class MemoryExtractor {
  private getClient(): OpenAI {
    const s = settingsStore.get()
    return new OpenAI({ apiKey: s.apiKey, baseURL: s.baseURL, dangerouslyAllowBrowser: false })
  }

  /**
   * 从对话中提取记忆
   * @param messages 对话消息（user + assistant）
   * @param sessionId 会话 ID
   */
  async extractFromConversation(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    sessionId: string
  ): Promise<MemoryItem[]> {
    if (messages.length === 0) return []

    try {
      const client = this.getClient()
      const s = settingsStore.get()

      // 只取最近若干条消息，避免 token 过多
      const recent = messages.slice(-20)
      const dialogText = recent
        .map((m) => `[${m.role === 'user' ? '用户' : 'AI'}] ${m.content.slice(0, 1500)}`)
        .join('\n\n')

      const resp = await client.chat.completions.create({
        model: s.fastModel,
        messages: [
          { role: 'system', content: EXTRACT_PROMPT },
          { role: 'user', content: dialogText }
        ],
        temperature: 0.1,
        max_tokens: 1000
      })

      const content = resp.choices[0]?.message?.content?.trim() ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) return []

      const parsed = JSON.parse(match[0]) as { memories?: ExtractedMemory[] }
      if (!parsed.memories || !Array.isArray(parsed.memories) || parsed.memories.length === 0) {
        return []
      }

      // 去重 + 合并：使用 memoryStore.findSimilar 检查语义重复
      const added: MemoryItem[] = []
      for (const m of parsed.memories) {
        if (!m.content || m.content.length < 3) continue
        // 语义去重：同类型且向量/Jaccard 相似度超过阈值视为重复
        const similar = await memoryStore.findSimilar(m.content, m.type, m.category || 'general')
        if (similar) {
          // 合并相似记忆：保留置信度更高、内容更完整、分类更具体的版本
          const shouldUpgrade =
            m.confidence > similar.confidence + 0.05 ||
            m.content.length > similar.content.length + 5
          memoryStore.update(similar.id, {
            content:
              shouldUpgrade && m.content.length > similar.content.length
                ? m.content
                : similar.content,
            confidence: Math.max(similar.confidence, m.confidence),
            tags: Array.from(new Set([...similar.tags, ...m.tags])),
            category:
              m.category &&
              m.category !== 'general' &&
              (similar.category === 'general' || m.category.length > similar.category.length)
                ? m.category
                : similar.category,
            entities: Array.from(
              new Set([...(similar.entities ?? []), ...(m.entities ?? [])])
            )
          })
          continue
        }
        const created = memoryStore.add({
          type: m.type,
          category: m.category || 'general',
          content: m.content,
          confidence: Math.max(0, Math.min(1, m.confidence ?? 0.5)),
          source: 'auto',
          sessionId,
          tags: m.tags ?? [],
          entities: m.entities ?? []
        })
        added.push(created)
      }

      if (added.length > 0) {
        logger.info(`[Xmemory] 从会话 ${sessionId} 提取了 ${added.length} 条新记忆`)
      }
      return added
    } catch (err) {
      logger.error('[Xmemory] 记忆提取失败:', err)
      return []
    }
  }
}

export const memoryExtractor = new MemoryExtractor()
