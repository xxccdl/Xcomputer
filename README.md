# Xcomputer

> AI 驱动的 Windows 桌面自动化助手 — 用自然语言控制电脑

[![Version](https://img.shields.io/badge/version-v0.2.72-blue)](https://github.com/xxccdl/Xcomputer/releases)
[![License](https://img.shields.io/badge/license-MIT-green)]()
[![Downloads](https://img.shields.io/github/downloads/xxccdl/Xcomputer/total)](https://github.com/xxccdl/Xcomputer/releases)
[![Stars](https://img.shields.io/github/stars/xxccdl/Xcomputer?style=social)](https://github.com/xxccdl/Xcomputer/stargazers)

**Xcomputer** 是一款基于 Electron 的 AI 桌面自动化助手。它将大语言模型与 Windows 系统操作深度集成，让你用自然语言指挥电脑完成各种任务——就像拥有一个永远在线的 AI 管家。

## 核心特性

### 自然语言操控
- 用中文或英文描述任务，AI 自动解析并执行
- 支持「打开记事本写一段备忘」「整理桌面文件」「定时关机」等指令
- 类似 GitHub Copilot 的 AI 辅助体验，但面向桌面操作

### Windows MCP 集成
- 深度集成 Windows-MCP 技术框架
- 支持 PowerShell、注册表、进程管理、文件系统等系统级操作
- 高危操作自动弹出确认，安全可控

### 智能小组件 & 悬浮球
- 桌面悬浮球，一键唤起 AI 助手
- 小组件模式，边做事边看 AI 执行
- Mini 药丸状态，不遮挡屏幕，悬停即可交互

### 记忆系统 (Xmemory)
- AI 自动记忆你的偏好、习惯和工作流
- 语义搜索 + 知识图谱，跨会话保持上下文
- 越用越懂你

### 技能市场 (XSkillHub)
- 内置技能模板库，一键安装常用操作流程
- 支持 AI 自动生成技能
- 社区分享，持续扩展

### 更多能力
- **定时任务**: cron 表达式，自动化日常操作
- **子代理**: AI 自主拆解复杂任务，并行执行
- **本地模型**: 实验性本地推理，无需网络，隐私无忧
- **DeepSeek 加速**: 内置限免模式，零配置即可使用

## 下载安装

| 平台 | 下载 |
|------|------|
| GitHub Release | [最新版本](https://github.com/xxccdl/Xcomputer/releases/latest) |
| Gitee Release（国内推荐） | [最新版本](https://gitee.com/xxccdl/xcomputer/releases) |

> 支持 Windows 10/11 (x64)，安装包约 476 MB（含 Python 运行时和 MCP 工具链）

## 快速开始

1. 下载并安装 Xcomputer
2. 首次启动会自动初始化 Python 环境和 MCP 工具
3. 在输入框输入自然语言指令，例如：
   - 打开记事本，写上今天待办事项
   - 把桌面上所有截图移到 D 盘 Screenshots 文件夹
   - 每天早上 9 点提醒我喝水
4. AI 自动执行，你可以在小组件中实时查看进度

## AI 能力

| 能力 | 说明 |
|------|------|
| 指令理解 | 自然语言 转为 精确的系统操作序列 |
| 任务规划 | 复杂任务自动拆解为子步骤 |
| 工具调用 | 50+ 内置工具（文件、进程、注册表、浏览器等）|
| 上下文记忆 | 跨会话记忆用户偏好和历史决策 |
| 自主决策 | 子代理模式，AI 自主完成多步任务 |
| 错误恢复 | 执行失败自动重试和修正 |

## 技术栈

- **Electron** — 跨平台桌面应用框架
- **React + TypeScript** — 渲染层
- **Python + uv** — MCP 工具链运行时
- **DeepSeek API** — LLM 推理引擎
- **node-llama-cpp** — 本地模型推理（实验性）
- **SQLite** — 本地数据存储

## 路线图

- [x] 自然语言桌面操控
- [x] Windows MCP 集成
- [x] 小组件 & 悬浮球
- [x] 记忆系统
- [x] 技能市场
- [x] 定时任务
- [x] 子代理
- [ ] 本地模型推理优化
- [ ] 多显示器支持
- [ ] 插件系统

## 赞助

如果 Xcomputer 对你有帮助，欢迎赞助支持项目持续发展：

[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa)](https://github.com/sponsors/xxccdl)

## License

MIT License

---

> Xcomputer 采用 Release 优先的发布模式，源代码将在合适时机开源。