import { spawnSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, rmSync, renameSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { settingsStore } from '../store/settings'
import { logger } from '../utils/logger'

/**
 * 解析项目内 .venv 的 windows-mcp.exe 路径。
 * 项目自带 Python 3.13 embeddable + uv（位于 python/ 目录），
 * .venv 由 npm run setup:mcp 用项目内 uv 创建，无需用户安装任何 Python 工具链。
 *
 * - 开发模式：项目根目录下的 .venv\Scripts\windows-mcp.exe
 * - 生产模式：resources 目录下的 .venv\Scripts\windows-mcp.exe（需在打包配置中 extraResources）
 *
 * 注意：.venv\pyvenv.cfg 中记录的 home 路径是创建时的绝对路径，打包安装到其他目录后
 * 可能失效。生产模式下启动 MCP 前会自动修正 pyvenv.cfg 的 home 为当前 resources\python。
 */
function resolveBundledMcpPath(): string | null {
  const subPath = join('.venv', 'Scripts', 'windows-mcp.exe')

  // 候选根目录列表
  const candidates: string[] = []

  if (is.dev) {
    // 开发模式：app.getAppPath() 通常指向项目根目录
    candidates.push(app.getAppPath())
    // 兜底：当前工作目录
    candidates.push(process.cwd())
  } else {
    // 生产模式：优先 resources 目录（extraResources 会把 .venv 放到这里）
    candidates.push(process.resourcesPath)
    // 兜底：app.getAppPath() 的上一级（asar 外层）
    candidates.push(join(app.getAppPath(), '..'))
  }

  for (const root of candidates) {
    const full = join(root, subPath)
    if (existsSync(full)) return full
  }

  return null
}

/** 探测 windows-mcp 可执行路径 */
export function resolveMcpCommand(): string {
  // 1. 优先使用项目内 .venv 的 windows-mcp.exe（无需用户下载）
  const bundled = resolveBundledMcpPath()
  if (bundled) return bundled

  // 1.5 .venv 不存在时，给出友好提示
  const subPath = join('.venv', 'Scripts', 'windows-mcp.exe')
  const venvExists = is.dev
    ? existsSync(join(app.getAppPath(), '.venv'))
    : existsSync(join(process.resourcesPath, '.venv'))
  if (!venvExists) {
    if (is.dev) {
      logger.error(
        `未找到 .venv/${subPath}。请先在项目根目录运行 npm run setup:mcp 安装 MCP 环境`
      )
    } else {
      logger.error('安装包可能损坏：未找到 .venv 目录')
    }
  }

  // 2. 用户自定义配置（可能是完整路径或命令名）
  const configured = settingsStore.get().uvxPath
  if (configured && configured.trim()) {
    if (existsSync(configured)) return configured
    // 尝试在 PATH 中查找
    try {
      const result = spawnSync('where', [configured], { shell: true, encoding: 'utf-8' })
      if (result.status === 0 && result.stdout.trim()) {
        return result.stdout.trim().split(/\r?\n/)[0]
      }
    } catch {
      // ignore
    }
    return configured
  }

  // 3. 尝试在 PATH 中查找 windows-mcp（用户全局安装的情况）
  try {
    const result = spawnSync('where', ['windows-mcp'], { shell: true, encoding: 'utf-8' })
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim().split(/\r?\n/)[0]
    }
  } catch {
    // ignore
  }

  // 最终回退（让子进程报错，便于排查）
  return 'windows-mcp'
}

/**
 * 修正 .venv/pyvenv.cfg 的 home 路径。
 * uv venv 创建时会写入创建时 Python 的绝对路径；换电脑或安装到其他目录后该路径失效，
 * 导致 .venv\Scripts\python.exe 无法启动。这里把它改成当前项目/应用内的 python 目录。
 *
 * 开发模式和生产模式都需要修正：
 * - 开发模式：项目根目录下的 python/
 * - 生产模式：resources 目录下的 python/
 */
function ensureVenvHome(mcpExePath: string): void {
  try {
    const venvRoot = dirname(dirname(mcpExePath)) // .../.venv/Scripts/windows-mcp.exe -> .../.venv
    const pyvenvCfg = join(venvRoot, 'pyvenv.cfg')
    if (!existsSync(pyvenvCfg)) return

    // 计算当前 python/ 目录
    const candidates: string[] = []
    if (is.dev) {
      // 开发模式：项目根目录下的 python/
      candidates.push(join(app.getAppPath(), 'python'))
      candidates.push(join(process.cwd(), 'python'))
    } else {
      // 生产模式：resources 目录下的 python/
      candidates.push(join(process.resourcesPath, 'python'))
      candidates.push(join(app.getAppPath(), '..', 'python'))
    }
    const bundledPython = candidates.find((p) => existsSync(join(p, 'python.exe')))
    if (!bundledPython) {
      logger.warn('未找到 python/ 目录，跳过 pyvenv.cfg 修正')
      return
    }

    const normalizedHome = bundledPython.replace(/\\/g, '/')
    const lines = readFileSync(pyvenvCfg, 'utf-8').split(/\r?\n/)
    let changed = false
    const patched = lines.map((line) => {
      if (line.startsWith('home =') || line.startsWith('home=')) {
        const current = line.replace(/^home\s*=\s*/, '').trim()
        if (current !== normalizedHome) {
          changed = true
          return `home = ${normalizedHome}`
        }
      }
      return line
    })

    if (changed) {
      writeFileSync(pyvenvCfg, patched.join('\n'), 'utf-8')
      logger.info(`已修正 pyvenv.cfg home: ${normalizedHome}`)
    }
  } catch (err) {
    logger.error('修正 pyvenv.cfg 失败:', err)
  }
}

/**
 * 生成 .venv/Scripts/python313._pth 文件，隔离系统 Python。
 *
 * 问题：项目使用嵌入式 Python 3.13，.venv 由 uv 基于 base python 创建。
 * uv venv 会复制 base python 的 python.exe 到 .venv/Scripts/，但不会复制 ._pth 文件。
 * 当系统存在 anaconda 或其他 Python 时，嵌入式 python.exe 在无 ._pth 时会搜索系统路径，
 * 导致 import 冲突或加载到错误的标准库。
 *
 * 解决：在 .venv/Scripts/ 下生成 python313._pth，强制 Python 只使用其中列出的路径：
 * - base python 的 stdlib（python313.zip + 根目录）
 * - base python 的 Lib 目录
 * - .venv 的 site-packages
 * - import site（启用 site 机制，让 site-packages 生效）
 *
 * @param venvRoot .venv 根目录路径
 */
function ensurePthFile(venvRoot: string): void {
  try {
    const scriptsDir = join(venvRoot, 'Scripts')
    const pthPath = join(scriptsDir, 'python313._pth')

    // 从 pyvenv.cfg 读取 base python home
    const pyvenvCfg = join(venvRoot, 'pyvenv.cfg')
    if (!existsSync(pyvenvCfg)) {
      logger.warn('未找到 pyvenv.cfg，跳过 ._pth 生成')
      return
    }

    const cfgContent = readFileSync(pyvenvCfg, 'utf-8')
    const homeMatch = cfgContent.match(/^home\s*=\s*(.+)$/m)
    if (!homeMatch) {
      logger.warn('pyvenv.cfg 中未找到 home，跳过 ._pth 生成')
      return
    }
    const home = homeMatch[1].trim().replace(/\\/g, '/')
    const venvRootNorm = venvRoot.replace(/\\/g, '/')

    // 构建 ._pth 内容（路径用正斜杠，Python 兼容 Windows）
    // - base python 的 python313.zip：标准库源码
    // - base python 根目录：DLL 和 .pyd 扩展模块（fallback）
    // - .venv/Scripts：虚拟环境复制的 .pyd 扩展模块
    // - .venv/Lib/site-packages：第三方包
    // - import site：启用 site 机制，让 site-packages 生效
    const content = [
      `${home}/python313.zip`,
      `${home}`,
      `${venvRootNorm}/Scripts`,
      `${venvRootNorm}/Lib/site-packages`,
      '',
      '# Uncomment to run site.main() automatically',
      'import site'
    ].join('\n')

    // 内容未变化时跳过写入（避免每次启动都写文件）
    if (existsSync(pthPath)) {
      const existing = readFileSync(pthPath, 'utf-8')
      if (existing === content) {
        return
      }
    }

    writeFileSync(pthPath, content, 'utf-8')
    logger.info(`已生成 ${pthPath}`)
  } catch (err) {
    logger.error('生成 python313._pth 失败:', err)
  }
}

/** 构建 MCP 子进程环境变量 */
export function buildMcpEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONUTF8: '1',
    // 禁止添加用户 site-packages，防止系统 Python 包污染嵌入式 Python
    PYTHONNOUSERSITE: '1'
  }
  // 清除 PYTHONPATH，防止系统 Python 路径污染嵌入式 Python
  delete env.PYTHONPATH
  return env
}

/** 构建 MCP 启动命令（直接运行项目内预装的 windows-mcp，无需用户下载） */
export function buildMcpCommand(): { command: string; args: string[] } {
  const command = resolveMcpCommand()
  logger.info(`MCP command resolved: ${command}`)

  // 修正 .venv/pyvenv.cfg 的 home 路径，确保换电脑或安装到其他目录后 .venv 仍能工作
  if (existsSync(command)) {
    ensureVenvHome(command)
    // 生成 ._pth 文件隔离系统 Python（防止 anaconda 等污染）
    const venvRoot = dirname(dirname(command))
    ensurePthFile(venvRoot)
  }

  // windows-mcp 基于 cyclopts CLI，必须指定 serve 子命令启动 MCP server
  return { command, args: ['serve'] }
}

/**
 * 获取项目内 python/ 目录路径
 */
function getBundledPythonDir(): string | null {
  const candidates: string[] = []
  if (is.dev) {
    candidates.push(join(app.getAppPath(), 'python'))
    candidates.push(join(process.cwd(), 'python'))
  } else {
    candidates.push(join(process.resourcesPath, 'python'))
    candidates.push(join(app.getAppPath(), '..', 'python'))
  }
  for (const p of candidates) {
    if (existsSync(join(p, 'python.exe')) && existsSync(join(p, 'uv.exe'))) {
      return p
    }
  }
  return null
}

/**
 * 获取 .venv 根目录路径
 */
function getVenvRoot(): string | null {
  const subPath = join('.venv')
  const candidates: string[] = []
  if (is.dev) {
    candidates.push(join(app.getAppPath(), subPath))
    candidates.push(join(process.cwd(), subPath))
  } else {
    candidates.push(join(process.resourcesPath, subPath))
    candidates.push(join(app.getAppPath(), '..', subPath))
  }
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  // 即使不存在也返回第一个候选，用于创建
  if (is.dev) return join(app.getAppPath(), subPath)
  return join(process.resourcesPath, subPath)
}

/**
 * 获取打包内置的 requirements-mcp.txt 路径（冻结依赖，离线降级用）。
 * 开发模式：resources/requirements-mcp.txt
 * 生产模式：resources/requirements-mcp.txt（electron-builder extraResources 复制）
 */
function getBundledRequirementsPath(): string | null {
  const fileName = 'requirements-mcp.txt'
  const candidates: string[] = []
  if (is.dev) {
    candidates.push(join(app.getAppPath(), 'resources', fileName))
    candidates.push(join(process.cwd(), 'resources', fileName))
  } else {
    candidates.push(join(process.resourcesPath, fileName))
    candidates.push(join(process.resourcesPath, 'resources', fileName))
  }
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

/**
 * 自动重建 .venv（换电脑或环境损坏时调用）。
 * 使用项目内 python + uv 重新创建虚拟环境并安装 windows-mcp。
 * @param onProgress 进度回调（可选），用于向前端推送实时状态
 * @returns 成功返回 true，失败返回 false
 */
export function rebuildVenv(onProgress?: (message: string) => void): boolean {
  const notify = (msg: string): void => {
    logger.info(msg)
    onProgress?.(msg)
  }

  notify('[00] 开始重建 MCP 虚拟环境...')

  // 失效健康检查缓存（venv 即将变更，旧结果不再有效）
  invalidateVenvHealthCache()

  // 0. 尝试终止可能锁定 .venv 文件的残留 MCP 进程
  //    （旧的 windows-mcp 进程可能未完全退出，占用 .venv/Scripts/ 中的文件句柄）
  notify('[00] 正在清理可能残留的 MCP 进程...')
  try {
    // 只终止 windows-mcp.exe 进程（这是 MCP server 进程，杀它是安全的）
    spawnSync('taskkill', ['/F', '/IM', 'windows-mcp.exe'], {
      encoding: 'utf-8',
      timeout: 5000
    })
    // 通过 wmic 终止路径包含 .venv 的 python.exe 进程（避免误杀用户其他 Python 程序）
    const venvRootPath = getVenvRoot()
    if (venvRootPath) {
      const escapedPath = venvRootPath.replace(/\\/g, '\\\\')
      spawnSync('wmic', [
        'process', 'where',
        `name='python.exe' and CommandLine like '%${escapedPath}%'`,
        'delete'
      ], { encoding: 'utf-8', timeout: 5000 })
    }
  } catch {
    // 进程终止失败不阻塞流程（可能无匹配进程或权限不足）
  }
  // 等待约 1.5 秒让被终止的进程完全释放文件句柄
  try {
    spawnSync('ping', ['-n', '2', '127.0.0.1'], { timeout: 2000, encoding: 'utf-8' })
  } catch {
    // ignore
  }

  const pythonDir = getBundledPythonDir()
  if (!pythonDir) {
    notify('重建失败：未找到项目内 python/ 目录（需要 python.exe 和 uv.exe）')
    return false
  }

  const pyExe = join(pythonDir, 'python.exe')
  const uvExe = join(pythonDir, 'uv.exe')
  const venvRoot = getVenvRoot()
  if (!venvRoot) {
    notify('重建失败：无法确定 .venv 目标路径')
    return false
  }

  // 1. 删除旧的 .venv（如果存在）
  //    策略：先尝试直接 rmSync 递归删除；如果失败（文件被锁定），
  //    尝试重命名为 .venv.old（重命名在 Windows 上即使文件被占用也常能成功），
  //    然后后台异步删除；最后使用 uv venv --clear 让 uv 自己清理残留目录。
  if (existsSync(venvRoot)) {
    notify('[01] 正在删除旧的虚拟环境...')
    let deleted = false
    try {
      rmSync(venvRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 })
      deleted = !existsSync(venvRoot)
    } catch (err) {
      notify('[02] 直接删除失败，尝试重命名后清理...')
    }
    if (!deleted) {
      try {
        const backupPath = `${venvRoot}.old.${Date.now()}`
        renameSync(venvRoot, backupPath)
        // 异步后台删除重命名后的旧目录，不阻塞当前流程
        setTimeout(() => {
          try {
            rmSync(backupPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 })
            logger.info(`[MCP] 已清理旧虚拟环境备份: ${backupPath}`)
          } catch (err) {
            logger.warn(`[MCP] 清理旧虚拟环境备份失败（下次启动时重试）: ${err instanceof Error ? err.message : String(err)}`)
          }
        }, 3000)
        deleted = true
        notify('[03] 旧环境已移至备份，将在后台清理')
      } catch (renameErr) {
        notify('[03] 删除旧 .venv 失败，将使用 --clear 模式覆盖创建...')
      }
    }
  }

  // 2. 创建新的 .venv
  //    使用 --clear 标志让 uv 在目录已存在时自动清空重建；
  //    设置 UV_VENV_CLEAR=1 作为环境变量双重保险。
  notify('[04] 正在创建新的 Python 虚拟环境...')
  const venvEnv = {
    ...process.env,
    UV_VENV_CLEAR: '1',
    UV_NO_CACHE: '1'
  }
  const venvArgs = ['venv', '--python', pyExe]
  if (existsSync(venvRoot)) {
    venvArgs.push('--clear')
  }
  venvArgs.push(venvRoot)
  const venvResult = spawnSync(uvExe, venvArgs, {
    encoding: 'utf-8',
    timeout: 120000,
    env: venvEnv
  })
  if (venvResult.status !== 0) {
    const detail = (venvResult.stderr || venvResult.stdout || '未知错误').trim()
    notify(`[05] 创建虚拟环境失败：${detail}`)
    return false
  }
  notify('[05] 虚拟环境创建成功')

  // 3. 安装 windows-mcp 及所有依赖
  //    策略：先从清华镜像安装 windows-mcp（自动拉取全部依赖），
  //    若失败则用默认 PyPI 重试；再用 pip check 验证依赖一致性，
  //    最后导入关键模块确保运行时可用。
  notify('[06] 正在安装 windows-mcp 及全部依赖（约需 1-2 分钟，请耐心等待）...')
  const venvPython = join(venvRoot, 'Scripts', 'python.exe')

  // 镜像列表：清华镜像 → 阿里镜像 → 默认 PyPI（逐个降级）
  const MIRRORS = [
    'https://pypi.tuna.tsinghua.edu.cn/simple',
    'https://mirrors.aliyun.com/pypi/simple',
    ''  // 默认 PyPI
  ]

  let installOk = false
  for (let i = 0; i < MIRRORS.length && !installOk; i++) {
    const mirror = MIRRORS[i]
    const mirrorName = mirror ? new URL(mirror).hostname : 'pypi.org'
    if (i > 0) {
      notify(`[06] 镜像 ${MIRRORS[i - 1] ? new URL(MIRRORS[i - 1]).hostname : 'pypi.org'} 安装失败，切换到 ${mirrorName}...`)
    }
    const pipArgs = ['pip', 'install', '--python', venvPython, 'windows-mcp']
    if (mirror) {
      pipArgs.push('-i', mirror)
    }
    const installResult = spawnSync(uvExe, pipArgs, {
      encoding: 'utf-8',
      timeout: 300000,
      env: { ...process.env, UV_NO_CACHE: '1' }
    })
    if (installResult.status === 0) {
      installOk = true
      notify(`[07] windows-mcp 安装成功（来源：${mirrorName}）`)
    } else {
      const detail = (installResult.stderr || installResult.stdout || '未知错误').trim()
      notify(`[07] 安装失败（${mirrorName}）：${detail}`)
    }
  }

  if (!installOk) {
    notify('[07] 所有镜像源均安装失败，尝试从本地冻结依赖安装...')
    // 回退：从打包内置的 requirements-mcp.txt 安装（离线降级方案）
    const requirementsPath = getBundledRequirementsPath()
    if (requirementsPath && existsSync(requirementsPath)) {
      const fallbackResult = spawnSync(
        uvExe,
        ['pip', 'install', '--python', venvPython, '-r', requirementsPath],
        { encoding: 'utf-8', timeout: 300000, env: { ...process.env, UV_NO_CACHE: '1' } }
      )
      if (fallbackResult.status === 0) {
        installOk = true
        notify('[07] 从本地冻结依赖安装成功')
      } else {
        const detail = (fallbackResult.stderr || fallbackResult.stdout || '未知错误').trim()
        notify(`[07] 本地冻结依赖安装也失败：${detail}`)
      }
    } else {
      notify('[07] 未找到本地冻结依赖文件，无法回退')
    }
  }

  if (!installOk) {
    return false
  }

  // 4. pip check — 验证依赖一致性（检测缺失/冲突的依赖）
  notify('[08] 正在验证依赖一致性...')
  const checkResult = spawnSync(
    uvExe,
    ['pip', 'check', '--python', venvPython],
    { encoding: 'utf-8', timeout: 30000 }
  )
  if (checkResult.status !== 0) {
    const detail = (checkResult.stderr || checkResult.stdout || '').trim()
    notify(`[08] 依赖一致性检查发现问题：${detail}`)
    // 不 return false — pip check 报告的冲突不一定影响运行，继续做导入验证
  } else {
    notify('[08] 依赖一致性检查通过')
  }

  // 5. 导入验证 — 确保关键模块可加载（防止部分依赖静默缺失）
  notify('[09] 正在验证关键依赖模块可导入...')
  const CRITICAL_MODULES = [
    'win32com',      // pywin32 — Windows COM 自动化
    'psutil',        // 进程/系统信息
    'fastmcp',       // MCP server 框架
    'mcp',           // MCP 协议
    'dxcam',         // 屏幕截图
    'pyperclip',     // 剪贴板
    'pydantic',      // 数据校验
    'httpx',         // HTTP 客户端
    'cyclopts',      // CLI 框架
    'win32api',      // pywin32 — Windows API
    'win32con',      // pywin32 — Windows 常量
    'shutil',        // 标准库（验证 python 本身可用）
    'json',          // 标准库
  ]
  const importScript = CRITICAL_MODULES.map(m => `try:\n    import ${m}\n    print("OK:${m}")\nexcept Exception as e:\n    print("FAIL:${m}:"+str(e))`).join('\n')
  const importResult = spawnSync(
    venvPython,
    ['-c', importScript],
    { encoding: 'utf-8', timeout: 30000 }
  )
  const importOutput = (importResult.stdout || '').trim()
  const failedModules: string[] = []
  for (const line of importOutput.split('\n')) {
    if (line.startsWith('FAIL:')) {
      const parts = line.substring(5).split(':')
      failedModules.push(parts[0])
      notify(`[09] 模块导入失败：${parts[0]} — ${parts.slice(1).join(':')}`)
    }
  }
  if (failedModules.length > 0) {
    notify(`[09] ${failedModules.length} 个关键模块导入失败，尝试重装依赖...`)
    // 重装：强制重新安装 windows-mcp 及依赖
    const reinstallResult = spawnSync(
      uvExe,
      ['pip', 'install', '--python', venvPython, '--force-reinstall', 'windows-mcp', '-i', MIRRORS[0]],
      { encoding: 'utf-8', timeout: 300000, env: { ...process.env, UV_NO_CACHE: '1' } }
    )
    if (reinstallResult.status === 0) {
      notify('[09] 强制重装完成，重新验证...')
      const reimportResult = spawnSync(venvPython, ['-c', importScript], { encoding: 'utf-8', timeout: 30000 })
      const reimportOutput = (reimportResult.stdout || '').trim()
      const stillFailed: string[] = []
      for (const line of reimportOutput.split('\n')) {
        if (line.startsWith('FAIL:')) {
          stillFailed.push(line.substring(5).split(':')[0])
        }
      }
      if (stillFailed.length > 0) {
        notify(`[09] 重装后仍有 ${stillFailed.length} 个模块导入失败：${stillFailed.join(', ')}`)
        return false
      }
      notify('[09] 重装后所有关键模块导入成功')
    } else {
      notify('[09] 强制重装失败')
      return false
    }
  } else {
    notify(`[09] 全部 ${CRITICAL_MODULES.length} 个关键模块导入验证通过`)
  }

  // 6. 验证 windows-mcp.exe 存在
  const mcpExe = join(venvRoot, 'Scripts', 'windows-mcp.exe')
  if (!existsSync(mcpExe)) {
    notify('[10] 重建后仍未找到 windows-mcp.exe，安装可能不完整')
    return false
  }
  notify('[10] windows-mcp.exe 验证通过')

  // 7. 修正 pyvenv.cfg
  notify('[11] 正在修正虚拟环境配置...')
  ensureVenvHome(mcpExe)

  // 8. 生成 ._pth 文件隔离系统 Python
  notify('[12] 正在生成 Python 路径隔离配置...')
  ensurePthFile(venvRoot)

  notify('[13] MCP 虚拟环境重建成功！')
  return true
}

/**
 * .venv 健康检查时快速验证的第三方关键模块。
 * 仅选取 MCP 运行最核心、且最常因安装不完整而缺失的依赖，
 * 避免在每次启动时导入全部依赖拖慢启动速度。
 * （rebuildVenv 中的 CRITICAL_MODULES 是更完整的 13 项验证集，这里取其子集）
 */
const VENV_HEALTH_CHECK_MODULES = [
  'win32com',   // pywin32 — Windows COM 自动化（最常出问题的包，依赖 post-install）
  'psutil',     // 进程/系统信息
  'fastmcp',    // MCP server 框架
  'mcp',        // MCP 协议
  'dxcam',      // 屏幕截图（C 扩展，常因缺少 VC 运行时而加载失败）
  'pyperclip',  // 剪贴板
]

/**
 * .venv 健康检查结果缓存。
 * 启动时 isVenvHealthy 会被多处调用（INIT_CHECK、mcp-client._start、self-check），
 * 每次调用都要 spawn python 子进程（约 1-2 秒）。
 * 用短 TTL 缓存避免同一启动周期内重复 spawn，同时 rebuildVenv 会主动失效缓存。
 */
let venvHealthCache: { healthy: boolean; timestamp: number } | null = null
const VENV_HEALTH_CACHE_TTL = 30_000 // 30 秒内复用结果

/** 使 .venv 健康检查缓存失效（rebuildVenv 前后调用） */
function invalidateVenvHealthCache(): void {
  venvHealthCache = null
}

/**
 * 检查 .venv 是否健康可用。
 *
 * 不仅验证 python.exe 存在和能运行，还验证关键依赖模块可导入。
 * 当检测到部分依赖缺失时返回 false，触发上层自动重建 .venv，
 * 避免出现"python 能跑但 MCP 启动后报 ModuleNotFoundError"的问题。
 *
 * 性能优化：用单个子进程同时完成 version 检查 + 模块导入验证（原来需要 2 个子进程），
 * 并用 30 秒 TTL 缓存避免启动时多处调用重复 spawn。
 *
 * 调用方：mcp-client（首次启动）、init.ipc（启动检查）、self-check-runner（自检）
 */
export function isVenvHealthy(): boolean {
  // 1. 命中缓存直接返回（启动时 INIT_CHECK 和 mcp-client._start 往往在数秒内相继调用）
  if (venvHealthCache && Date.now() - venvHealthCache.timestamp < VENV_HEALTH_CACHE_TTL) {
    return venvHealthCache.healthy
  }

  const venvRoot = getVenvRoot()
  if (!venvRoot || !existsSync(venvRoot)) {
    venvHealthCache = { healthy: false, timestamp: Date.now() }
    return false
  }

  const venvPython = join(venvRoot, 'Scripts', 'python.exe')
  if (!existsSync(venvPython)) {
    venvHealthCache = { healthy: false, timestamp: Date.now() }
    return false
  }

  // 检查 ._pth 文件是否存在（嵌入式 Python 隔离系统 Python 的关键）
  const pthFile = join(venvRoot, 'Scripts', 'python313._pth')
  if (!existsSync(pthFile)) {
    venvHealthCache = { healthy: false, timestamp: Date.now() }
    return false
  }

  try {
    // 2. 单个子进程同时完成 version 检查 + 模块导入验证
    //    脚本先 print("PYOK:"+sys.version) 验证解释器本身可用，
    //    再逐个 try/import 关键模块。若进程异常退出或无 PYOK 输出，判定 python 本身损坏。
    const importScript = [
      'import sys',
      'print("PYOK:"+sys.version)',
      ...VENV_HEALTH_CHECK_MODULES.map(
        (m) => `try:\n    import ${m}\n    print("OK:${m}")\nexcept Exception as e:\n    print("FAIL:${m}:"+str(e))`
      )
    ].join('\n')
    const result = spawnSync(venvPython, ['-c', importScript], {
      encoding: 'utf-8',
      timeout: 30000
    })

    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || '').trim()
      logger.warn(`[isVenvHealthy] python 子进程异常退出，判定 .venv 不健康：${detail}`)
      venvHealthCache = { healthy: false, timestamp: Date.now() }
      return false
    }

    const output = (result.stdout || '').trim()
    // 验证 python 本身可用（PYOK 标记）
    if (!output.includes('PYOK:')) {
      logger.warn('[isVenvHealthy] 未检测到 PYOK 标记，python 可能已损坏')
      venvHealthCache = { healthy: false, timestamp: Date.now() }
      return false
    }
    // 检查关键模块导入结果
    for (const line of output.split('\n')) {
      if (line.startsWith('FAIL:')) {
        const mod = line.substring(5).split(':')[0]
        logger.warn(
          `[isVenvHealthy] 模块 ${mod} 导入失败，判定 .venv 不健康，将触发重建`
        )
        venvHealthCache = { healthy: false, timestamp: Date.now() }
        return false
      }
    }
    venvHealthCache = { healthy: true, timestamp: Date.now() }
    return true
  } catch (err) {
    logger.error('[isVenvHealthy] 健康检查异常:', err)
    venvHealthCache = { healthy: false, timestamp: Date.now() }
    return false
  }
}
