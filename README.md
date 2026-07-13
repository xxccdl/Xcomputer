# Xcomputer

[English](./README.en.md) | 简体中文

> 一句话让 AI 操控你的电脑

Xcomputer 是一款 AI 桌面自动化助手。通过自然语言指令，让 AI 帮你完成电脑上的各种操作——打开应用、处理文件、自动化工作流，让日常任务更高效。

## ✨ 核心功能

- **自然语言操控** — 用一句话描述你要做的事，AI 自动执行
- **桌面悬浮球** — 随时呼出，快捷指令一键触发
- **会话管理** — 多会话并行，支持搜索、导出、上下文压缩
- **定时任务** — 创建定时/周期任务，自动执行重复工作
- **记忆系统（Xmemory）** — 持久化记忆，记住你的偏好和历史
- **MCP 工具集成** — 基于 Model Context Protocol，自带 Python 环境运行 MCP 服务
- **本地大模型** — 内置 node-llama-cpp，支持本地 LLM 推理（CPU/CUDA）
- **内置技能** — 头脑风暴、前端美学、UI 设计、网站构建等开箱即用技能
- **自检面板** — 程序健康状态与运行日志一目了然
- **系统托盘** — 后台常驻，最小化到托盘不打扰

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 31 + electron-vite 2 |
| 前端 | React 18 + TypeScript 5.5 + TailwindCSS 3.4 |
| 状态 | Zustand 4 |
| AI | DeepSeek API + node-llama-cpp（本地推理） |
| 工具 | Model Context Protocol (MCP) SDK |
| 图像 | sharp |
| 安装 | electron-builder + NSIS |

## 📦 项目结构

```
Xcomputer/
├── src/
│   ├── main/              # Electron 主进程（窗口、托盘、IPC）
│   ├── preload/           # 预加载脚本
│   ├── renderer/          # 渲染进程
│   │   ├── src/           # 主界面（聊天、会话、设置）
│   │   ├── floating-ball/ # 桌面悬浮球
│   │   └── self-check/    # 自检面板
│   └── shared/            # 主进程与渲染进程共享常量
├── resources/
│   ├── builtin-skills/    # 内置技能定义
│   ├── local-models/      # 本地模型（按需下载，不提交）
│   └── deepseek-tokenizer/# DeepSeek 分词器
├── python/                # 自带 Python + uv（供 MCP 工具使用）
├── build/                 # 构建资源（图标、NSIS 脚本、补丁）
├── scripts/               # 辅助脚本
├── website/               # 官网与下载门户
├── xphoneai/              # Android 配套应用
├── xskillhub-server/      # 技能市场服务端
└── xskillhub-web/         # 技能市场前端
```

## 🚀 快速开始

### 环境要求

- Node.js ≥ 18
- npm
- Windows 10/11（当前主要支持平台）

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env`，填入你的 DeepSeek API Key：

```bash
cp .env.example .env
```

```env
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_FAST_MODEL=deepseek-v4-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
```

### 开发运行

```bash
npm run dev
```

### 构建安装包

```bash
npm run dist
```

构建产物输出到 `dist-release-v5/`，生成 NSIS 安装程序。

> **注意**：构建脚本会自动执行 `build/patch-nsis.js`，修补 electron-builder 的 7z 压缩配置（禁用 BCJ2 过滤器和 solid 压缩），以确保 NSIS 安装程序能正确解压所有文件。

## 📥 下载安装

访问官网  [xxccdl.cn](https://xxccdl.cn)  下载最新版安装包，（或直接从 [GitHub Releases](https://github.com/xxccdl/Xcomputer/releases)  ）下载。
> **注意**:`https://xxccdl.cn`可能有时下载过慢或版本号**过久**，使用`http://xxccdl.cn`或`GitHub Releases`或`gitee.com/xxccdl/Xcomputer`仓库代替

## 🔧 MCP 工具配置

Xcomputer 内置 Python 环境和 uv 包管理器，无需额外安装 Python 即可运行 MCP 服务。

1. 在应用设置中配置 MCP 服务
2. 或运行 `npm run setup:mcp` 初始化 MCP 环境

## 🧠 本地模型

Xcomputer 支持本地大语言模型推理（基于 node-llama-cpp）：

- **CPU 推理** — 开箱即用，无需额外配置
- **CUDA 加速** — 支持 NVIDIA GPU 加速
- 模型文件放在 `resources/local-models/`（.gguf 格式，需自行从gitee下载，不提交到仓库，download-url:[Gitee模力方舟](https://ai.gitee.com/xxccdl/litex)）

## 📱 配套项目

| 项目 | 说明 |
|------|------|
| [xphoneai](./xphoneai) | Android 配套应用 |
| [xskillhub-server](./xskillhub-server) | 技能市场服务端 |
| [xskillhub-web](./xskillhub-web) | 技能市场前端 |
| [website](./website) | 官网与下载门户 |

## 📄 许可证

[MIT License](./LICENSE)

## 👤 作者

**xxccdl** — [官网 xxccdl.cn](http://xxccdl.cn)
