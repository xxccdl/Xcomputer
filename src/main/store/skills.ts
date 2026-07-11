import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { basename, extname, join } from 'path'
import { app } from 'electron'
import AdmZip from 'adm-zip'
import type { Skill, SkillStats, SkillSource, SkillFileType } from '@shared/types'
import { logger } from '../utils/logger'

interface SkillStoreSchema {
  skills: Skill[]
}

/** 技能条数上限 */
const MAX_SKILLS = 200
/** 注入到上下文的最大技能条数 */
const MAX_INJECT_SKILLS = 5

/**
 * 内置技能种子定义。
 * 文件位于 resources/builtin-skills/<file>（开发环境从项目根目录读取，打包后从 process.resourcesPath/builtin-skills 读取）。
 * 内置技能 source 固定为 'builtin'，用户只能只读查看，不能编辑/删除/禁用。
 */
interface BuiltinSkillSeed {
  /** 文件名（位于 builtin-skills 目录下） */
  file: string
  /** 技能名称（唯一，用作去重键） */
  name: string
  /** 简短描述 */
  description: string
  /** 标签 */
  tags: string[]
  /** 触发关键词 */
  triggers: string[]
}

const BUILTIN_SKILL_SEEDS: BuiltinSkillSeed[] = [
  {
    file: 'website-builder.md',
    name: '网站搭建',
    description: '全栈网站开发技能：Vite + React + Node.js + Express，覆盖项目初始化、脚手架、路由、状态管理、API、部署。',
    tags: ['网站', '前端', '后端', 'Vite', 'React', 'Express'],
    triggers: ['网站', '搭建网站', '建站', '前端项目', '全栈', 'Express', 'Vite']
  },
  {
    file: 'frontend-aesthetics.md',
    name: '前端美学设计',
    description: '创作有辨识度、生产级的前端界面，避免通用 AI 风格。涵盖排版、配色、动效、空间构图与背景细节。',
    tags: ['设计', '美学', '前端', 'UI', '动效', '排版'],
    triggers: ['美学', '设计', '界面设计', '动效', '排版', '配色', '前端美学']
  },
  {
    file: 'premium-ui-design.md',
    name: '高端界面设计',
    description: '打造克制、精致、当下的界面：强构图、留白、稀疏文案、克制动效。适用于落地页与产品 UI。',
    tags: ['设计', '高端', '落地页', '产品UI', '动效', '构图'],
    triggers: ['高端', '落地页', 'landing page', '产品UI', '界面设计', 'premium']
  },
  {
    file: 'brainstorming.md',
    name: '需求头脑风暴',
    description: '从理解项目上下文开始，逐个提问澄清需求，提出 2-3 个方案并给出推荐，最终产出设计文档。',
    tags: ['需求', '设计', '头脑风暴', '方案', 'spec'],
    triggers: ['需求', '头脑风暴', 'brainstorm', '设计文档', '方案设计', 'spec']
  },
  {
    file: 'writing-plans.md',
    name: '实施计划编写',
    description: '编写详尽的实施计划：文件结构、 bite-sized 任务、TDD、频繁提交。假设工程师对代码库零上下文。',
    tags: ['计划', '实施', 'TDD', '任务分解', 'plan'],
    triggers: ['实施计划', '计划', 'writing plan', '任务分解', 'TDD', 'plan']
  },
  {
    file: 'nextjs-performance.md',
    name: 'Next.js 性能优化',
    description: 'React/Next.js 性能规则集：消除瀑布流、bundle 体积、服务端性能、重渲染优化、渲染性能等。',
    tags: ['Next.js', 'React', '性能', '优化', 'bundle', '渲染'],
    triggers: ['Next.js', '性能优化', 'React性能', 'bundle', '重渲染', 'performance']
  },
  {
    file: 'react-native-performance.md',
    name: 'React Native 性能优化',
    description: 'React Native/Expo 性能规则集：列表性能、动画、导航、UI 模式、状态管理、渲染、monorepo、配置。',
    tags: ['React Native', 'Expo', '性能', '列表', '动画', '导航'],
    triggers: ['React Native', 'Expo', 'RN性能', '列表性能', '动画', 'navigation']
  }
]

/** 中文停用词表 */
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '这', '那', '它', '他', '她', '们', '把', '被', '让', '使', '给', '对', '为',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in',
  'on', 'at', 'for', 'with', 'and', 'or', 'not', 'no', 'yes', 'do', 'does', 'did'
])

/** 简单分词：英文按空格/标点，中文按 2-gram */
function tokenize(text: string): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  const tokens: string[] = []
  const englishMatches = lower.match(/[a-z][a-z0-9_]{1,}/g) ?? []
  for (const t of englishMatches) {
    if (!STOP_WORDS.has(t) && t.length >= 2) tokens.push(t)
  }
  const chineseChars = lower.match(/[\u4e00-\u9fa5]+/g) ?? []
  for (const seg of chineseChars) {
    for (let i = 0; i < seg.length - 1; i++) {
      const gram = seg.substring(i, i + 2)
      if (!STOP_WORDS.has(gram)) tokens.push(gram)
    }
  }
  return tokens
}

/** Jaccard 相似度 */
function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a))
  const tokensB = new Set(tokenize(b))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let intersection = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++
  }
  const union = tokensA.size + tokensB.size - intersection
  return union > 0 ? intersection / union : 0
}

class SkillsStore {
  private store: Store<SkillStoreSchema> | null = null

  init(): void {
    this.store = new Store<SkillStoreSchema>({
      name: 'skills',
      defaults: { skills: [] }
    })
    logger.info(`[Skills] 技能存储已初始化，当前 ${this.list().length} 条技能`)
  }

  private getStore(): Store<SkillStoreSchema> {
    if (!this.store) this.init()
    return this.store as Store<SkillStoreSchema>
  }

  /** 判断技能是否为内置（只读，不可编辑/删除/禁用） */
  isBuiltin(id: string): boolean {
    const skill = this.get(id)
    return !!skill && skill.source === 'builtin'
  }

  /**
   * 确保内置技能已注入存储（应用启动时调用）。
   * - 按名称去重：已存在的内置技能不重复添加
   * - 内容会根据最新 md 文件更新（保持内置技能始终是最新版本）
   * - 内置技能强制 enabled=true、source='builtin'
   * 读取失败（文件不存在）时跳过该技能并记录警告，不抛错。
   */
  async ensureBuiltinSkills(): Promise<void> {
    const store = this.getStore()
    const skills = store.get('skills')
    const existingByName = new Map(skills.map((s) => [s.name, s]))
    let added = 0
    let updated = 0

    // 解析 builtin-skills 目录：开发环境用项目根目录，打包后用 process.resourcesPath
    const dir = app.isPackaged
      ? join(process.resourcesPath, 'builtin-skills')
      : join(app.getAppPath(), 'resources', 'builtin-skills')

    for (const seed of BUILTIN_SKILL_SEEDS) {
      const filePath = join(dir, seed.file)
      if (!existsSync(filePath)) {
        logger.warn(`[Skills] 内置技能文件不存在，跳过: ${filePath}`)
        continue
      }
      let content: string
      try {
        content = await readFile(filePath, 'utf-8')
      } catch (err) {
        logger.warn(`[Skills] 读取内置技能文件失败 ${seed.file}:`, err instanceof Error ? err.message : String(err))
        continue
      }
      if (!content.trim()) continue

      const existing = existingByName.get(seed.name)
      const now = Date.now()
      if (existing) {
        // 已存在：仅当 source 已是 builtin 时更新内容（避免覆盖用户同名技能）
        if (existing.source === 'builtin') {
          const changed =
            existing.content !== content ||
            existing.description !== seed.description ||
            JSON.stringify(existing.tags) !== JSON.stringify(seed.tags) ||
            JSON.stringify(existing.triggers) !== JSON.stringify(seed.triggers)
          if (changed) {
            const idx = skills.findIndex((s) => s.id === existing.id)
            skills[idx] = {
              ...existing,
              content,
              description: seed.description,
              tags: seed.tags,
              triggers: seed.triggers,
              enabled: true, // 内置技能强制启用
              updatedAt: now
            }
            updated++
          }
        }
        // source 非 builtin 的同名技能：保留用户数据，不覆盖
      } else {
        const skill: Skill = {
          id: randomUUID(),
          name: seed.name,
          description: seed.description,
          content,
          source: 'builtin',
          fileType: 'markdown',
          tags: seed.tags,
          triggers: seed.triggers,
          enabled: true,
          createdAt: now,
          updatedAt: now,
          lastUsedAt: now,
          useCount: 0
        }
        skills.push(skill)
        existingByName.set(seed.name, skill)
        added++
      }
    }

    if (added > 0 || updated > 0) {
      store.set('skills', skills)
      logger.info(`[Skills] 内置技能注入完成：新增 ${added} 条，更新 ${updated} 条`)
    }
  }

  /** 获取所有启用的技能 */
  list(): Skill[] {
    return this.getStore().get('skills')
  }

  /** 获取所有技能（含禁用） */
  listAll(): Skill[] {
    return this.getStore().get('skills')
  }

  /** 按 ID 获取 */
  get(id: string): Skill | undefined {
    return this.getStore().get('skills').find((s) => s.id === id)
  }

  /** 按名称获取 */
  getByName(name: string): Skill | undefined {
    return this.getStore().get('skills').find((s) => s.name === name)
  }

  /**
   * 查找与给定内容相似的技能（用于去重）
   * 匹配条件：名称 Jaccard 相似度 >= 0.6 或 内容 Jaccard 相似度 >= 0.5
   * @returns 相似的技能，或 undefined
   */
  findSimilar(
    name: string,
    content: string,
    nameThreshold = 0.6,
    contentThreshold = 0.5
  ): Skill | undefined {
    const skills = this.listAll()
    return skills.find((s) => {
      // 名称高度相似
      if (jaccardSimilarity(s.name, name) >= nameThreshold) return true
      // 内容高度相似
      if (jaccardSimilarity(s.content, content) >= contentThreshold) return true
      return false
    })
  }

  /** 添加技能 */
  add(data: Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt' | 'useCount'>): Skill {
    const store = this.getStore()
    const skills = store.get('skills')
    const now = Date.now()
    const skill: Skill = {
      ...data,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      useCount: 0
    }
    skills.push(skill)
    store.set('skills', skills)
    logger.info(`[Skills] 新增技能 [${skill.name}]: ${skill.description.slice(0, 50)}`)
    return skill
  }

  /** 更新技能（内置技能禁止更新） */
  update(id: string, patch: Partial<Omit<Skill, 'id' | 'createdAt'>>): Skill | null {
    const store = this.getStore()
    const skills = store.get('skills')
    const idx = skills.findIndex((s) => s.id === id)
    if (idx < 0) return null
    if (skills[idx].source === 'builtin') {
      logger.warn(`[Skills] 拒绝更新内置技能: ${skills[idx].name}`)
      return null
    }
    skills[idx] = { ...skills[idx], ...patch, id, updatedAt: Date.now() }
    store.set('skills', skills)
    return skills[idx]
  }

  /** 删除技能（内置技能禁止删除） */
  delete(id: string): boolean {
    const store = this.getStore()
    const skills = store.get('skills')
    const idx = skills.findIndex((s) => s.id === id)
    if (idx < 0) return false
    if (skills[idx].source === 'builtin') {
      logger.warn(`[Skills] 拒绝删除内置技能: ${skills[idx].name}`)
      return false
    }
    skills.splice(idx, 1)
    store.set('skills', skills)
    logger.info(`[Skills] 删除技能: ${id}`)
    return true
  }

  /** 清空所有技能（仅清空非内置技能，内置技能受保护） */
  clear(): void {
    const store = this.getStore()
    const skills = store.get('skills')
    const kept = skills.filter((s) => s.source === 'builtin')
    store.set('skills', kept)
    logger.info(`[Skills] 已清空用户技能，保留 ${kept.length} 条内置技能`)
  }

  /** 启用/禁用技能（内置技能禁止禁用） */
  toggle(id: string, enabled?: boolean): Skill | null {
    const skill = this.get(id)
    if (!skill) return null
    if (skill.source === 'builtin' && enabled === false) {
      logger.warn(`[Skills] 拒绝禁用内置技能: ${skill.name}`)
      return null
    }
    return this.update(id, { enabled: enabled ?? !skill.enabled })
  }

  /** 搜索技能 */
  search(query: { keyword?: string; source?: SkillSource; tag?: string }): Skill[] {
    let skills = this.listAll()
    if (query.source) skills = skills.filter((s) => s.source === query.source)
    if (query.tag) skills = skills.filter((s) => s.tags.includes(query.tag!))
    if (query.keyword) {
      const kw = query.keyword.toLowerCase()
      skills = skills.filter((s) => {
        const haystack = `${s.name} ${s.description} ${s.content} ${s.tags.join(' ')} ${s.triggers.join(' ')}`.toLowerCase()
        return haystack.includes(kw)
      })
    }
    return skills
  }

  /** 统计信息 */
  stats(): SkillStats {
    const skills = this.listAll()
    const bySource: Record<SkillSource, number> = { manual: 0, ai: 0, imported: 0, hub: 0, builtin: 0 }
    const byFileType: Record<SkillFileType, number> = {
      markdown: 0,
      text: 0,
      json: 0,
      archive: 0
    }
    for (const s of skills) {
      bySource[s.source]++
      byFileType[s.fileType]++
    }
    return {
      total: skills.length,
      enabled: skills.filter((s) => s.enabled).length,
      bySource,
      byFileType,
      totalUseCount: skills.reduce((sum, s) => sum + s.useCount, 0),
      lastUpdated: Date.now()
    }
  }

  /**
   * 检索与当前查询最相关的技能
   * 评分：trigger 匹配 + 内容 token 匹配 + 使用频率 + 时间衰减
   */
  retrieveForContext(userQuery: string, limit = MAX_INJECT_SKILLS): Skill[] {
    const all = this.list().filter((s) => s.enabled)
    if (all.length === 0) return []

    const now = Date.now()
    const queryTokens = new Set(tokenize(userQuery))
    const queryLower = userQuery.toLowerCase()

    const scored = all.map((s) => {
      let score = 0

      // trigger 关键词精确匹配（权重最高）
      for (const trigger of s.triggers) {
        if (queryLower.includes(trigger.toLowerCase())) {
          score += 0.5
        }
      }

      // token 匹配
      if (queryTokens.size > 0) {
        const contentTokens = new Set(tokenize(`${s.name} ${s.description} ${s.content}`))
        let matches = 0
        for (const qt of queryTokens) {
          if (contentTokens.has(qt)) matches++
        }
        score += Math.min((matches / Math.max(queryTokens.size, 1)) * 0.4, 0.4)
      }

      // 使用频率加权
      score += Math.min(s.useCount * 0.01, 0.1)

      // 时间衰减：60 天内不衰减
      const daysSinceUse = (now - s.lastUsedAt) / (1000 * 60 * 60 * 24)
      if (daysSinceUse > 60) {
        score *= Math.max(0.3, 1 - (daysSinceUse - 60) / 365)
      }

      return { skill: s, score }
    })

    scored.sort((a, b) => b.score - a.score)
    // 只返回有相关性的技能（score > 0.1）
    return scored
      .filter((s) => s.score > 0.1)
      .slice(0, limit)
      .map((s) => s.skill)
  }

  /** 标记技能被使用 */
  markUsed(ids: string[]): void {
    if (ids.length === 0) return
    const store = this.getStore()
    const skills = store.get('skills')
    const now = Date.now()
    for (const s of skills) {
      if (ids.includes(s.id)) {
        s.useCount++
        s.lastUsedAt = now
      }
    }
    store.set('skills', skills)
  }

  /**
   * 格式化为可注入 system prompt 的文本（仅技能列表：名称+描述+触发词）
   * AI 需要调用 Skill 工具的 get action 才能获取技能的完整内容
   */
  formatForInjection(skills: Skill[]): string {
    if (skills.length === 0) return ''
    const lines: string[] = [
      '# 可用技能（Skills）',
      '以下是与你当前任务相关的技能。如需查看技能的完整操作步骤，请调用 Skill 工具：',
      '{ "action": "get", "name": "技能名称" }'
    ]
    for (const s of skills) {
      const triggers =
        s.triggers.length > 0 ? ` | 触发词: ${s.triggers.slice(0, 5).join(', ')}` : ''
      lines.push(`- **${s.name}**: ${s.description}${triggers}`)
    }
    return lines.join('\n')
  }

  /** 导出所有技能 */
  exportAll(): { skills: Skill[]; exportedAt: number; version: string } {
    return {
      skills: this.getStore().get('skills'),
      exportedAt: Date.now(),
      version: '1.0'
    }
  }

  /** 导入技能（合并模式） */
  importAll(data: { skills: Skill[] }, merge = true): { added: number; skipped: number } {
    if (!data.skills || !Array.isArray(data.skills)) {
      return { added: 0, skipped: 0 }
    }
    const store = this.getStore()
    const existing = store.get('skills')
    const existingIds = new Set(existing.map((s) => s.id))
    const existingNames = new Set(existing.map((s) => s.name))
    let added = 0
    let skipped = 0
    for (const s of data.skills) {
      if (!s.name || !s.content) {
        skipped++
        continue
      }
      // 合并模式下跳过已存在的 ID 或同名技能
      if (merge && (existingIds.has(s.id) || existingNames.has(s.name))) {
        skipped++
        continue
      }
      // 拒绝导入 source 为 builtin 的技能（内置技能由应用管理，不可被导入覆盖）
      if (s.source === 'builtin') {
        skipped++
        continue
      }
      const skill: Skill = {
        id: s.id || randomUUID(),
        name: s.name,
        description: s.description || '',
        content: s.content,
        source: s.source ?? 'imported',
        fileType: s.fileType ?? 'markdown',
        tags: Array.isArray(s.tags) ? s.tags : [],
        triggers: Array.isArray(s.triggers) ? s.triggers : [],
        enabled: s.enabled ?? true,
        sessionId: s.sessionId,
        originalFileName: s.originalFileName,
        createdAt: s.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        lastUsedAt: s.lastUsedAt ?? Date.now(),
        useCount: s.useCount ?? 0
      }
      existing.push(skill)
      existingIds.add(skill.id)
      existingNames.add(skill.name)
      added++
    }
    store.set('skills', existing)
    logger.info(`[Skills] 导入完成：新增 ${added} 条，跳过 ${skipped} 条`)
    return { added, skipped }
  }

  /**
   * 从文件上传技能
   * 支持 .md / .txt / .json / .zip
   */
  async uploadFromFile(filePath: string, options?: { name?: string; description?: string; tags?: string[] }): Promise<Skill> {
    if (!existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`)
    }

    const ext = extname(filePath).toLowerCase()
    const fileName = basename(filePath)
    const fileStat = await stat(filePath)

    // 限制文件大小 10MB
    if (fileStat.size > 10 * 1024 * 1024) {
      throw new Error('文件大小超过 10MB 限制')
    }

    let content = ''
    let fileType: SkillFileType = 'markdown'
    let description = options?.description ?? ''

    switch (ext) {
      case '.md':
      case '.markdown': {
        content = await readFile(filePath, 'utf-8')
        fileType = 'markdown'
        // 从 markdown 提取标题作为描述
        if (!description) {
          const titleMatch = content.match(/^#\s+(.+)$/m)
          description = titleMatch ? titleMatch[1] : fileName
        }
        break
      }
      case '.txt': {
        content = await readFile(filePath, 'utf-8')
        fileType = 'text'
        if (!description) description = fileName
        break
      }
      case '.json': {
        const raw = await readFile(filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        // 支持 { name, description, content, tags, triggers } 格式
        if (parsed && typeof parsed === 'object' && parsed.content) {
          content = String(parsed.content)
          if (!description && parsed.description) description = String(parsed.description)
          if (!options?.name && parsed.name) options = { ...options, name: String(parsed.name) }
          if (parsed.tags) options = { ...options, tags: Array.isArray(parsed.tags) ? parsed.tags : [] }
        } else {
          content = raw
        }
        fileType = 'json'
        if (!description) description = fileName
        break
      }
      case '.zip': {
        // zip 文件：解压并合并所有文本文件内容
        const zip = new AdmZip(filePath)
        const entries = zip.getEntries()
        const parts: string[] = []
        for (const entry of entries) {
          if (entry.isDirectory) continue
          const entryName = entry.entryName.toLowerCase()
          // 只处理文本文件
          if (/\.(md|markdown|txt|json|js|ts|py|html|css|xml|yaml|yml)$/.test(entryName)) {
            const text = entry.getData().toString('utf-8')
            parts.push(`### ${entry.entryName}\n\n${text}`)
          }
        }
        content = parts.join('\n\n---\n\n')
        fileType = 'archive'
        if (!description) description = `从 ${fileName} 解压的 ${entries.length} 个文件`
        break
      }
      default: {
        // 尝试作为文本读取
        content = await readFile(filePath, 'utf-8')
        fileType = 'text'
        if (!description) description = fileName
      }
    }

    // 从内容中自动提取触发关键词
    const triggers = this.extractTriggers(content, options?.name ?? fileName)

    const skill = this.add({
      name: options?.name || fileName.replace(/\.[^.]+$/, ''),
      description,
      content,
      source: 'manual',
      fileType,
      tags: options?.tags ?? [],
      triggers,
      enabled: true,
      originalFileName: fileName
    })

    logger.info(`[Skills] 从文件上传技能: ${fileName} (${fileStat.size} bytes)`)
    return skill
  }

  /** 从内容中自动提取触发关键词 */
  private extractTriggers(content: string, name: string): string[] {
    const triggers = new Set<string>()
    // 技能名称作为触发词
    if (name.length > 1) triggers.add(name)
    // markdown 标题作为触发词
    const headings = content.match(/^#{1,3}\s+(.+)$/gm) ?? []
    for (const h of headings) {
      const title = h.replace(/^#{1,3}\s+/, '').trim()
      if (title.length > 1 && title.length < 30) triggers.add(title)
    }
    // 代码块语言标识
    const langs = content.match(/```(\w+)/g) ?? []
    for (const l of langs) {
      triggers.add(l.replace('```', ''))
    }
    return Array.from(triggers).slice(0, 20)
  }

  /** AI 主动生成技能 */
  generateSkill(params: {
    name: string
    description: string
    content: string
    tags?: string[]
    triggers?: string[]
    sessionId?: string
  }): Skill {
    const skill = this.add({
      name: params.name,
      description: params.description,
      content: params.content,
      source: 'ai',
      fileType: 'markdown',
      tags: params.tags ?? [],
      triggers: params.triggers ?? this.extractTriggers(params.content, params.name),
      enabled: true,
      sessionId: params.sessionId
    })
    logger.info(`[Skills] AI 生成技能 [${skill.name}]: ${skill.description.slice(0, 50)}`)
    return skill
  }

  /** 检查技能名称是否已存在 */
  nameExists(name: string, excludeId?: string): boolean {
    return this.getStore()
      .get('skills')
      .some((s) => s.name === name && s.id !== excludeId)
  }
}

export const skillsStore = new SkillsStore()
