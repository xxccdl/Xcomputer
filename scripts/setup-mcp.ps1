# Xcomputer — windows-mcp 一键安装脚本
# 使用项目内自带的 Python 3.13 embeddable + uv 创建 .venv 并安装 windows-mcp。
# 用户无需自行安装 Python 或 uv。
# 用法：在项目根目录执行  npm run setup:mcp

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host '========================================' -ForegroundColor Cyan
Write-Host ' Xcomputer — windows-mcp 环境初始化' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host "项目根目录: $projectRoot"
Write-Host ''

# 1. 检查项目内自带的 Python 和 uv
$pyExe = Join-Path $projectRoot 'python\python.exe'
$uvExe = Join-Path $projectRoot 'python\uv.exe'

if (-not (Test-Path $pyExe)) {
    Write-Host "[FAIL] 未找到项目内 Python: $pyExe" -ForegroundColor Red
    Write-Host '       请确认 python/ 目录存在（应包含 python.exe 和 uv.exe）' -ForegroundColor Yellow
    exit 1
}
if (-not (Test-Path $uvExe)) {
    Write-Host "[FAIL] 未找到项目内 uv: $uvExe" -ForegroundColor Red
    Write-Host '       请确认 python/ 目录存在（应包含 python.exe 和 uv.exe）' -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] 项目内 Python: $(& $pyExe --version)" -ForegroundColor Green
Write-Host "[OK] 项目内 uv: $(& $uvExe --version)" -ForegroundColor Green
Write-Host ''

# 2. 创建 .venv（使用项目内 Python）
$venvPath = Join-Path $projectRoot '.venv'
$venvPython = Join-Path $venvPath 'Scripts\python.exe'
if (Test-Path $venvPython) {
    Write-Host "[INFO] .venv 已存在且可用，跳过创建" -ForegroundColor Yellow
} else {
    if (Test-Path $venvPath) {
        Write-Host "[WARN] .venv 目录存在但缺少 python.exe，可能已损坏，重新创建..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $venvPath -ErrorAction SilentlyContinue
    } else {
        Write-Host '[STEP] 创建虚拟环境 .venv ...' -ForegroundColor Cyan
    }
    & $uvExe venv --python $pyExe $venvPath
    if ($LASTEXITCODE -ne 0) { Write-Host '[FAIL] 创建 .venv 失败' -ForegroundColor Red; exit 1 }
    Write-Host '[OK] .venv 创建完成' -ForegroundColor Green
}

# 3. 安装 windows-mcp（中国镜像加速，失败自动降级）
Write-Host '[STEP] 安装 windows-mcp 及全部依赖 ...' -ForegroundColor Cyan
$mirrors = @(
    'https://pypi.tuna.tsinghua.edu.cn/simple',
    'https://mirrors.aliyun.com/pypi/simple'
)
$installOk = $false
foreach ($mirror in $mirrors) {
    Write-Host "  尝试镜像: $mirror" -ForegroundColor Gray
    & $uvExe pip install --python $venvPython windows-mcp -i $mirror
    if ($LASTEXITCODE -eq 0) {
        $installOk = $true
        Write-Host "  [OK] 安装成功（来源：$mirror）" -ForegroundColor Green
        break
    }
    Write-Host "  [WARN] 该镜像安装失败，尝试下一个..." -ForegroundColor Yellow
}
if (-not $installOk) {
    Write-Host '  尝试默认 PyPI...' -ForegroundColor Gray
    & $uvExe pip install --python $venvPython windows-mcp
    if ($LASTEXITCODE -eq 0) {
        $installOk = $true
        Write-Host '  [OK] 安装成功（来源：pypi.org）' -ForegroundColor Green
    }
}
if (-not $installOk) {
    # 回退：从本地冻结依赖安装（离线/网络故障降级方案）
    Write-Host '  所有镜像源均失败，尝试从本地冻结依赖安装...' -ForegroundColor Yellow
    $requirementsFile = Join-Path $projectRoot 'resources\requirements-mcp.txt'
    if (Test-Path $requirementsFile) {
        & $uvExe pip install --python $venvPython -r $requirementsFile
        if ($LASTEXITCODE -eq 0) {
            $installOk = $true
            Write-Host '  [OK] 从本地冻结依赖安装成功' -ForegroundColor Green
        } else {
            Write-Host '  [FAIL] 本地冻结依赖安装也失败' -ForegroundColor Red
        }
    } else {
        Write-Host "  [FAIL] 未找到冻结依赖文件: $requirementsFile" -ForegroundColor Red
    }
}
if (-not $installOk) {
    Write-Host '[FAIL] 所有安装方式均失败，请检查网络后重试' -ForegroundColor Red
    exit 1
}

# 4. 验证依赖一致性
Write-Host '[STEP] 验证依赖一致性 (pip check) ...' -ForegroundColor Cyan
& $uvExe pip check --python $venvPython
if ($LASTEXITCODE -ne 0) {
    Write-Host '[WARN] pip check 发现问题（不一定是致命错误）' -ForegroundColor Yellow
} else {
    Write-Host '[OK] 依赖一致性检查通过' -ForegroundColor Green
}

# 5. 验证关键模块可导入
Write-Host '[STEP] 验证关键依赖模块可导入 ...' -ForegroundColor Cyan
$modules = @('win32com','psutil','fastmcp','mcp','dxcam','pyperclip','pydantic','httpx','cyclopts','win32api','win32con')
$importScript = $modules | ForEach-Object { "try:`n    import $_`n    print('OK:$_')`nexcept Exception as e:`n    print('FAIL:$_:'+str(e))" }
$importScript = $importScript -join "`n"
$importResult = & $venvPython -c $importScript 2>&1
$failed = @()
foreach ($line in $importResult -split "`n") {
    if ($line -match '^FAIL:(\w+):(.*)') {
        $failed += $Matches[1]
        Write-Host "  [FAIL] $($Matches[1]): $($Matches[2])" -ForegroundColor Red
    }
}
if ($failed.Count -gt 0) {
    Write-Host "[WARN] $($failed.Count) 个模块导入失败，尝试强制重装..." -ForegroundColor Yellow
    & $uvExe pip install --python $venvPython --force-reinstall windows-mcp -i $mirrors[0]
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[FAIL] 强制重装失败' -ForegroundColor Red
        exit 1
    }
    # 重新验证
    $reimportResult = & $venvPython -c $importScript 2>&1
    $stillFailed = @()
    foreach ($line in $reimportResult -split "`n") {
        if ($line -match '^FAIL:(\w+)') { $stillFailed += $Matches[1] }
    }
    if ($stillFailed.Count -gt 0) {
        Write-Host "[FAIL] 重装后仍有 $($stillFailed.Count) 个模块导入失败: $($stillFailed -join ', ')" -ForegroundColor Red
        exit 1
    }
    Write-Host '[OK] 重装后所有模块导入成功' -ForegroundColor Green
} else {
    Write-Host "[OK] 全部 $($modules.Count) 个关键模块导入验证通过" -ForegroundColor Green
}

# 6. 验证 windows-mcp.exe
$mcpExe = Join-Path $venvPath 'Scripts\windows-mcp.exe'
if (Test-Path $mcpExe) {
    Write-Host ''
    Write-Host '========================================' -ForegroundColor Green
    Write-Host ' 安装成功！' -ForegroundColor Green
    Write-Host '========================================' -ForegroundColor Green
    Write-Host "windows-mcp 路径: $mcpExe" -ForegroundColor Green
    Write-Host '现在可以运行 npm run dev 启动 Xcomputer' -ForegroundColor Cyan
} else {
    Write-Host '[FAIL] 未找到 windows-mcp.exe，安装可能未成功' -ForegroundColor Red
    exit 1
}
