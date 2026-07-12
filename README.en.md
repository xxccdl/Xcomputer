# Xcomputer

> Let AI control your computer with a single sentence

English | [简体中文](./README.md)

Xcomputer is an AI desktop automation assistant. Through natural language instructions, let AI handle various operations on your computer — launch apps, manage files, automate workflows, and make your daily tasks more efficient.

## ✨ Core Features

- **Natural Language Control** — Describe what you want in one sentence, AI executes it automatically
- **Desktop Floating Ball** — Summon anytime, trigger quick commands with one click
- **Session Management** — Parallel sessions with search, export, and context compression
- **Scheduled Tasks** — Create scheduled/recurring tasks to automate repetitive work
- **Memory System (Xmemory)** — Persistent memory that remembers your preferences and history
- **MCP Tool Integration** — Based on Model Context Protocol, ships with a Python environment to run MCP services
- **Local LLM** — Built-in node-llama-cpp supporting local inference (CPU/CUDA)
- **Built-in Skills** — Brainstorming, frontend aesthetics, UI design, website building, and more out of the box
- **Self-Check Panel** — Health status and runtime logs at a glance
- **System Tray** — Runs in the background, minimize to tray without distraction

## 🛠️ Tech Stack

| Layer | Technology |
|------|------|
| Framework | Electron 31 + electron-vite 2 |
| Frontend | React 18 + TypeScript 5.5 + TailwindCSS 3.4 |
| State | Zustand 4 |
| AI | DeepSeek API + node-llama-cpp (local inference) |
| Tools | Model Context Protocol (MCP) SDK |
| Image | sharp |
| Installer | electron-builder + NSIS |

## 📦 Project Structure

```
Xcomputer/
├── src/
│   ├── main/              # Electron main process (window, tray, IPC)
│   ├── preload/           # Preload scripts
│   ├── renderer/          # Renderer process
│   │   ├── src/           # Main UI (chat, sessions, settings)
│   │   ├── floating-ball/ # Desktop floating ball
│   │   └── self-check/    # Self-check panel
│   └── shared/            # Shared constants between main and renderer
├── resources/
│   ├── builtin-skills/    # Built-in skill definitions
│   ├── local-models/      # Local models (downloaded on demand, not committed)
│   └── deepseek-tokenizer/# DeepSeek tokenizer
├── python/                # Bundled Python + uv (for MCP tools)
├── build/                 # Build assets (icons, NSIS scripts, patches)
├── scripts/               # Helper scripts
├── website/               # Official website & download portal
├── xphoneai/              # Android companion app
├── xskillhub-server/      # Skill marketplace server
└── xskillhub-web/         # Skill marketplace frontend
```

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 18
- npm
- Windows 10/11 (currently the primary supported platform)

### Install Dependencies

```bash
npm install
```

### Configure Environment

Copy `.env.example` to `.env` and fill in your DeepSeek API Key:

```bash
cp .env.example .env
```

```env
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_FAST_MODEL=deepseek-v4-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
```

### Development

```bash
npm run dev
```

### Build Installer

```bash
npm run dist
```

Build artifacts are output to `dist-release-v5/`, producing an NSIS installer.

> **Note**: The build script automatically runs `build/patch-nsis.js`, which patches electron-builder's 7z compression config (disables the BCJ2 filter and solid compression) to ensure the NSIS installer correctly extracts all files.

## 📥 Download

Visit the official website [xxccdl.cn](https://xxccdl.cn) to download the latest installer, or grab it directly from [GitHub Releases](https://github.com/xxccdl/Xcomputer/releases).

> **Tip**: If https://xxccdl.cn is slow, try http://xxccdl.cn or use GitHub Releases instead.

## 🔧 MCP Tool Configuration

Xcomputer bundles a Python environment and the uv package manager — no need to install Python separately to run MCP services.

1. Configure MCP services in the app settings
2. Or run `npm run setup:mcp` to initialize the MCP environment

## 🧠 Local Models

Xcomputer supports local LLM inference (based on node-llama-cpp):

- **CPU Inference** — Works out of the box, no extra configuration
- **CUDA Acceleration** — Supports NVIDIA GPU acceleration
- Place model files in `resources/local-models/` (.gguf format, download from Gitee separately, not committed to the repo — download URL: [Gitee Model Ark](https://ai.gitee.com/xxccdl/litex))

## 📱 Companion Projects

| Project | Description |
|------|------|
| [xphoneai](./xphoneai) | Android companion app |
| [xskillhub-server](./xskillhub-server) | Skill marketplace server |
| [xskillhub-web](./xskillhub-web) | Skill marketplace frontend |
| [website](./website) | Official website & download portal |

## 📄 License

[MIT License](./LICENSE)

## 👤 Author

**xxccdl** — [Website xxccdl.cn](http://xxccdl.cn)
