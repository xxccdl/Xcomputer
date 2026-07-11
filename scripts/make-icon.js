const sharp = require('sharp')
const { imagesToIco } = require('png-to-ico')
const fs = require('fs')
const path = require('path')

async function build() {
  const svg = path.join(__dirname, '..', 'build', 'icon.svg')
  const outDir = path.join(__dirname, '..', 'build')

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const buffers = []
  for (const s of sizes) {
    const buf = await sharp(svg).resize(s, s).png().toBuffer()
    buffers.push(buf)
    fs.writeFileSync(path.join(outDir, 'icon_' + s + '.png'), buf)
    console.log('  ' + s + 'x' + s + ' OK')
  }

  const ico = await imagesToIco(buffers)
  fs.writeFileSync(path.join(outDir, 'icon.ico'), ico)
  console.log('ICO OK: ' + ico.length + ' bytes')
}

build().catch(e => {
  console.error(e)
  process.exit(1)
})
