/**
 * 生成 NSIS 安装程序现代风格位图资源
 * 浅色现代风格（VS Code / Chrome 风格），与 Windows 系统控件自然融合
 */

const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const OUTPUT_DIR = path.join(__dirname, '..', 'build', 'nsis')

/**
 * 将 RGBA raw buffer 转换为 24-bit BMP buffer（白色背景合成）
 */
function rgbaToBmp(rgba, width, height) {
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    const src = i * 4
    const dst = i * 3
    const a = rgba[src + 3] / 255
    const invA = 1 - a
    rgb[dst] = Math.round(rgba[src] * a + 255 * invA)
    rgb[dst + 1] = Math.round(rgba[src + 1] * a + 255 * invA)
    rgb[dst + 2] = Math.round(rgba[src + 2] * a + 255 * invA)
  }

  const rowSize = Math.floor((width * 3 + 3) / 4) * 4
  const padding = rowSize - width * 3
  const pixelDataSize = rowSize * height
  const fileSize = 14 + 40 + pixelDataSize
  const buf = Buffer.alloc(fileSize)

  buf.write('BM', 0)
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(0, 6)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(0, 30)
  buf.writeUInt32LE(pixelDataSize, 34)
  buf.writeInt32LE(2835, 38)
  buf.writeInt32LE(2835, 42)
  buf.writeUInt32LE(0, 46)
  buf.writeUInt32LE(0, 50)

  let pos = 54
  for (let y = height - 1; y >= 0; y--) {
    const srcRow = y * width * 3
    for (let x = 0; x < width; x++) {
      buf[pos++] = rgb[srcRow + x * 3 + 2]
      buf[pos++] = rgb[srcRow + x * 3 + 1]
      buf[pos++] = rgb[srcRow + x * 3]
    }
    for (let p = 0; p < padding; p++) buf[pos++] = 0
  }
  return buf
}

async function renderBmp(svg, w, h) {
  const { data } = await sharp(Buffer.from(svg))
    .resize(w, h)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return rgbaToBmp(data, w, h)
}

/**
 * 头部图片 (150x57) - 白色背景 + Logo + 产品名 + 底部渐变条
 */
async function generateHeader() {
  const svg = `<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#2f81f7"/>
        <stop offset="100%" stop-color="#a371f7"/>
      </linearGradient>
    </defs>
    <rect width="150" height="57" fill="#ffffff"/>
    <rect x="0" y="55" width="150" height="2" fill="url(#accent)"/>
    <rect x="14" y="14" width="29" height="29" rx="7" fill="#2563eb"/>
    <path d="M21 22 L26 27 L21 32 M29 32 L35 32" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <text x="52" y="37" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700" fill="#1f2937">Xcomputer</text>
  </svg>`
  fs.writeFileSync(path.join(OUTPUT_DIR, 'header.bmp'), await renderBmp(svg, 150, 57))
  console.log('✓ header.bmp')
}

/**
 * 侧边栏 (164x314) - 浅色渐变 + 大Logo + 产品信息
 */
async function generateSidebar() {
  // 固定位置装饰圆点（可重现）
  const dots = [
    [20, 40, 1.5, '#2f81f7', 0.2], [140, 60, 2, '#a371f7', 0.15],
    [30, 100, 1, '#3fb950', 0.2], [130, 120, 1.5, '#58a6ff', 0.18],
    [15, 160, 2, '#2f81f7', 0.12], [150, 180, 1, '#a371f7', 0.22],
    [25, 220, 1.5, '#2f81f7', 0.15], [145, 240, 1, '#3fb950', 0.18],
    [40, 280, 2, '#a371f7', 0.12], [120, 290, 1.5, '#2f81f7', 0.2],
    [55, 30, 1, '#58a6ff', 0.18], [100, 50, 1.5, '#2f81f7', 0.15],
    [70, 200, 1, '#a371f7', 0.2], [90, 260, 2, '#3fb950', 0.12],
    [10, 260, 1.5, '#2f81f7', 0.18],
  ].map(([cx, cy, r, fill, o]) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${o}"/>`
  ).join('')

  const svg = `<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f8faff"/>
        <stop offset="50%" stop-color="#f0f0ff"/>
        <stop offset="100%" stop-color="#faf5ff"/>
      </linearGradient>
      <linearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#2563eb"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
      <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#2563eb"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
    </defs>
    <rect width="164" height="314" fill="url(#bg)"/>
    ${dots}
    <rect x="163" y="0" width="1" height="314" fill="#e5e7eb"/>
    <rect x="0" y="0" width="164" height="3" fill="url(#bar)"/>
    <rect x="0" y="311" width="164" height="3" fill="url(#bar)"/>
    <!-- Logo 阴影（用偏移矩形模拟） -->
    <rect x="49" y="76" width="70" height="70" rx="16" fill="#2563eb" opacity="0.15"/>
    <rect x="47" y="72" width="70" height="70" rx="16" fill="url(#logo)"/>
    <path d="M65 92 L80 107 L65 122 M86 122 L102 122" stroke="white" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <text x="82" y="178" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="800" fill="#111827">Xcomputer</text>
    <line x1="57" y1="194" x2="107" y2="194" stroke="url(#bar)" stroke-width="2" stroke-linecap="round"/>
    <text x="82" y="216" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#6b7280">AI 桌面自动化助手</text>
    <text x="28" y="244" font-family="Segoe UI, Arial, sans-serif" font-size="9.5" fill="#6b7280">✦ 自然语言控制电脑</text>
    <text x="28" y="260" font-family="Segoe UI, Arial, sans-serif" font-size="9.5" fill="#6b7280">✦ 50+ MCP 工具支持</text>
    <text x="28" y="276" font-family="Segoe UI, Arial, sans-serif" font-size="9.5" fill="#6b7280">✦ 开箱即用，免费下载</text>
    <text x="82" y="300" text-anchor="middle" font-family="Consolas, monospace" font-size="9" fill="#9ca3af">xxccdl.cn</text>
  </svg>`
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sidebar.bmp'), await renderBmp(svg, 164, 314))
  console.log('✓ sidebar.bmp')
}

/**
 * 卸载侧边栏 (164x314) - 浅色红色调
 */
async function generateUninstallSidebar() {
  const svg = `<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fff8f8"/>
        <stop offset="100%" stop-color="#fdf2f8"/>
      </linearGradient>
      <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ef4444"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
    </defs>
    <rect width="164" height="314" fill="url(#bg)"/>
    <rect x="163" y="0" width="1" height="314" fill="#e5e7eb"/>
    <rect x="0" y="0" width="164" height="3" fill="url(#bar)"/>
    <rect x="0" y="311" width="164" height="3" fill="url(#bar)"/>
    <!-- 垃圾桶图标 -->
    <rect x="62" y="90" width="40" height="44" rx="8" fill="#ef4444" opacity="0.15"/>
    <rect x="60" y="88" width="40" height="44" rx="8" fill="#ef4444"/>
    <path d="M70 100 L70 124 M78 100 L78 124 M86 100 L86 124 M66 96 L94 96 M72 96 L72 90 L88 90 L88 96" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    <text x="82" y="172" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700" fill="#111827">卸载 Xcomputer</text>
    <line x1="52" y1="188" x2="112" y2="188" stroke="url(#bar)" stroke-width="2" stroke-linecap="round"/>
    <text x="82" y="210" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#9ca3af">感谢您的使用</text>
    <text x="82" y="300" text-anchor="middle" font-family="Consolas, monospace" font-size="9" fill="#9ca3af">xxccdl.cn</text>
  </svg>`
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sidebar-uninstall.bmp'), await renderBmp(svg, 164, 314))
  console.log('✓ sidebar-uninstall.bmp')
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  await generateHeader()
  await generateSidebar()
  await generateUninstallSidebar()
  console.log('\n完成！')
}

main().catch(console.error)
