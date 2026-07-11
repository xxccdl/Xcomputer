# Release Notes — v0.2.54

## 🎉 开源首发

Xcomputer 正式开源至 GitHub！AI 桌面自动化助手，一句话让 AI 操控你的电脑。

---

## 🐛 Bug 修复

### 修复安装包缺失主程序 (Xcomputer.exe) 问题

**问题**：用户安装后找不到主程序 `Xcomputer.exe` 及多个 DLL 文件，安装以退出码 2 失败。

**根因**：electron-builder 打包时使用 7z 的 **BCJ2 可执行文件压缩过滤器**提高压缩率，但 NSIS 内置的 Nsis7z 解压插件**不支持 BCJ2 解码**，导致所有经过 BCJ2 压缩的 EXE/DLL 文件静默解压失败。同时 7z 默认的 **solid 压缩模式**在 8000+ 文件的大规模场景下也会导致解压不可靠。

**修复**：
- 新增 [`build/patch-nsis.js`](build/patch-nsis.js) 自动补丁脚本
- 禁用 7z BCJ2 过滤器（`-mf=off`），改用纯 LZMA2 压缩
- 禁用 solid 压缩（`solid: false`），每个文件独立压缩
- 构建脚本自动执行补丁：`npm run dist`

**验证**：静默安装测试通过，8212 个文件完整解压，Xcomputer.exe (172.7 MB) 正确安装。

---

## ⚡ 优化

### 减小安装包体积

移除不需要的 CPU 架构变体和 GPU 后端，减小安装包体积：

| 移除的组件 | 原始大小 | 说明 |
|-----------|---------|------|
| `@node-llama-cpp/win-arm64` | 20.5 MB | ARM64 二进制，x64 系统不需要 |
| `@node-llama-cpp/win-x64-cuda-ext` | 360 MB | CUDA fallback 库（单个 ggml-cuda.dll 达 360MB） |
| `@node-llama-cpp/win-x64-vulkan` | 91.5 MB | Vulkan GPU 后端（保留 CUDA 后端即可） |

通过 `package.json` 的 `files` 排除规则实现，不影响 CPU 推理和 CUDA 加速功能。

---

## 📦 安装包信息

| 项目 | 值 |
|------|-----|
| 文件名 | `Xcomputer-0.2.54-setup.exe` |
| 大小 | ~514 MB |
| 压缩格式 | 7z (LZMA2, 非 solid, 无 BCJ2) |
| 安装程序 | NSIS（支持自定义安装路径） |
| 平台 | Windows x64 |

---

## 🔗 链接

- **下载**：[GitHub Releases](https://github.com/xxccdl/Xcomputer/releases)
- **源码**：https://github.com/xxccdl/Xcomputer
- **官网**：http://xxccdl.cn

---

## 💻 完整变更

```diff
- 修复：NSIS 安装包缺失主程序 Xcomputer.exe（BCJ2 过滤器不兼容）
- 优化：移除 ARM64 / CUDA-ext / Vulkan 变体，减小安装包体积
- 新增：build/patch-nsis.js 自动补丁脚本
- 文档：添加 README.md
- 配置：完善 .gitignore
```
