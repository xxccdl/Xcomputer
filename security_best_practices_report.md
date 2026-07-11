# Xcomputer 安全与 Bug 审查报告

> 审查日期：2026-07-08
> 审查范围：xcomputer v0.1.28 全代码库（Electron + React + TypeScript）
> 审查依据：security-best-practices 技能指南
> 状态：**所有发现均已修复**

## 执行摘要

对 xcomputer 代码库进行了安全最佳实践和全面 bug 审查，覆盖命令注入、CSP/XSS、UI 显示、AI 底层编排、状态管理、资源泄漏等类别。共发现 **10 个问题**（3 CRITICAL + 4 MEDIUM + 3 LOW），全部已修复。

---

## CRITICAL — 命令注入（已修复）

### [C-1] ping 工具 host 参数命令注入
- **文件**: `src/main/tools/local-tools.ts:1751`
- **代码**: `execSync(\`ping -n ${count} ${host}\`)`
- **影响**: `host` 来自 AI 工具参数，未校验。若 host 为 `localhost & del /f /q C:\file`，将执行任意命令。
- **修复**: 添加 `validateHostname()` 校验函数，仅允许字母/数字/点/连字符/冒号/百分号。

### [C-2] 服务管理 name 参数命令注入
- **文件**: `src/main/tools/local-tools.ts:1705-1741`（status/start/stop/restart 共 4 处）
- **代码**: `execSync(\`powershell -Command "Start-Service -Name '${name}'"\`)`
- **影响**: `name` 含单引号即可逃逸（如 `x'; Calc; 'y`），执行任意 PowerShell 命令。
- **修复**: 添加 `validateSafeIdentifier()` 校验函数，仅允许字母/数字/空格/连字符/下划线/点。

### [C-3] 进程终止 name 参数命令注入
- **文件**: `src/main/tools/local-tools.ts:2464`
- **代码**: `execSync(\`powershell -NoProfile -Command "Stop-Process -Name '${name}' -Force"\`)`
- **影响**: 同 C-2，单引号逃逸可执行任意命令。
- **修复**: 复用 `validateSafeIdentifier()` 校验。

---

## CRITICAL — CSP / XSS（已修复）

### [C-4] 生产环境无 Content-Security-Policy
- **文件**: `src/main/window.ts:8-24`
- **问题**: `onHeadersReceived` 仅在 `if (is.dev)` 块中注册，生产环境完全无 CSP。配合 `rehype-raw`（将 AI 输出渲染为原始 HTML），构成 XSS 攻击面：AI 若被 prompt injection 诱导生成 `<img onerror=...>` 等恶意 HTML，可在渲染进程中执行任意 JS。
- **影响**: 攻击者可通过 prompt injection 让 AI 生成恶意 HTML，在渲染进程执行 JS，调用 `window.api.*` 发送消息/修改设置/窃取数据。
- **修复**: 始终注册 `onHeadersReceived`，生产环境使用严格 CSP（`script-src 'self'` 无 `'unsafe-inline'`，`object-src 'none'`，`base-uri 'self'`）。

---

## MEDIUM — 运行时 Bug（已修复）

### [M-1] 上下文压缩按钮失败时永久 loading
- **文件**: `src/renderer/src/components/layout/DetailPanel.tsx:236-248`
- **问题**: `handleCompress` 中，若 `compressContext` 返回 `{success: false}`，只 `console.warn` 不重置 `isCompressing`，按钮永久显示"压缩中..."。
- **修复**: 在 `!res.success` 分支中立即调用 `setCompressing(false)`。

### [M-2] 切换会话后上下文使用率不更新
- **文件**: `src/renderer/src/hooks/useSession.ts:130`
- **问题**: `void window.api.chat.getContextUsage(id).catch(() => null)` 丢弃返回值，`onContextUsage` 事件不触发，切换会话后上下文卡片永远为空。
- **修复**: 用 `await` 获取返回值并通过 `useChatStore.setState({ contextUsage: usage })` 更新 store，加竞态保护。

### [M-3] 上下文压缩 splitIdx 边界：全 assistant 消息时仅压缩 1 条
- **文件**: `src/main/orchestrator/task-orchestrator.ts:1332-1337`
- **问题**: while 循环向前找 user 消息对齐边界，若区间全是 assistant 则 splitIdx 归零后被设为 1，仅压缩 1 条消息（无意义操作）。
- **修复**: 若 splitIdx <2，直接返回 `{success: false, error: '可压缩的历史消息过少'}`。

### [M-4] 切换会话后滚动位置不重置
- **文件**: `src/renderer/src/components/layout/MainPanel.tsx:150`
- **问题**: `userScrolledUpRef` 在会话切换时不重置。用户在会话 A 上滚后切换到 B，B 不会自动滚动到底部显示最新消息。
- **修复**: 新增 `useEffect` 监听 `currentSessionId` 变化，重置 `userScrolledUpRef` 并滚动到底部。

---

## LOW — UI 显示 Bug（已修复）

### [L-1] 截图 file:// URL 在 Windows 上格式错误
- **文件**: `src/renderer/src/components/detail/StepDetail.tsx:109`
- **代码**: `src={`file://${step.screenshotPath}`}`
- **问题**: Windows 路径 `C:\Users\...\screenshot.png` 生成的 URL 为 `file://C:\Users\...`（少一个斜杠 + 反斜杠），浏览器无法加载，步骤详情中的截图不显示。
- **修复**: `file:///${path.replace(/\\/g, '/').replace(/^\/+/, '')}`，正确生成 `file:///C:/Users/.../screenshot.png`。

### [L-2] 技能详情 Markdown 无排版样式
- **文件**: `src/renderer/src/components/skills/SkillsModal.tsx:630, 1213`
- **问题**: 使用了 `prose prose-invert prose-sm` 类，但 `@tailwindcss/typography` 插件未安装（`tailwind.config.js` 中 `plugins: []`），类名无任何 CSS 效果。技能内容（含标题、列表、代码块）渲染为无样式的纯文本：标题与正文同号、列表无缩进、代码块无背景。
- **修复**: 在 `globals.css` 的 `@layer components` 中添加完整的 `.prose` 排版样式（h1-h4、p、ul/ol、code/pre、table、blockquote、a、hr 等），匹配应用暗色主题。

### [L-3] 内置技能注入路径解析
- **文件**: `src/main/store/skills.ts:ensureBuiltinSkills()`
- **问题**: 开发环境使用 `join(app.getAppPath(), 'resources', 'builtin-skills')`，打包环境使用 `join(process.resourcesPath, 'builtin-skills')`。已验证两条路径均正确（开发环境 app.getAppPath() 返回项目根目录；打包环境 extraResources 配置正确）。
- **状态**: 无需修复，已确认正确。

---

## 已确认安全的项

| 检查项 | 状态 |
|--------|------|
| BrowserWindow sandbox/contextIsolation/nodeIntegration | ✓ 全部正确 |
| `dangerouslySetInnerHTML` | ✓ 无使用 |
| `eval()` / `new Function()` | ✓ 无使用 |
| React key 使用 | ✓ 使用 `s.id` 而非索引 |
| setInterval/addEventListener 清理 | ✓ 全部有 cleanup |
| AbortController 中断处理 | ✓ 流式/子代理均正确处理 |
| 会话存储写锁 | ✓ per-session Promise 链串行化 |
| `executeToolCall` 异常处理 | ✓ 内部 try/catch 转为错误结果 |
| MCP 连接/调用超时 | ✓ 均有 timeout |
| 子代理 wait/cancel/cleanup | ✓ 正确清理监听器和定时器 |
| `withQueueRetry` 中断/退避 | ✓ 正确检查 signal + 指数退避 |
| volume/pid/statusFilter 参数 | ✓ 已钳制/转数字/固定值 |
| z-index 层级 | ✓ modal(50) < dialog(60) < cmd(70) < init(100) |
