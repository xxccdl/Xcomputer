const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svg = fs.readFileSync(path.join(__dirname, '..', 'assets', 'icon.svg'));

// Android mipmap sizes
const sizes = [
  { name: 'mdpi', size: 48 },
  { name: 'hdpi', size: 72 },
  { name: 'xhdpi', size: 96 },
  { name: 'xxhdpi', size: 144 },
  { name: 'xxxhdpi', size: 192 },
];

// Adaptive icon foreground sizes (108dp at each density)
const foregroundSizes = [
  { name: 'mdpi', size: 108 },
  { name: 'hdpi', size: 162 },
  { name: 'xhdpi', size: 216 },
  { name: 'xxhdpi', size: 324 },
  { name: 'xxxhdpi', size: 432 },
];

const outputDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

async function generate() {
  // Generate launcher icons (adaptive icon - full icon)
  for (const { name, size } of sizes) {
    const mipmapDir = path.join(outputDir, `mipmap-${name}`);
    fs.mkdirSync(mipmapDir, { recursive: true });

    // ic_launcher (full icon)
    await sharp(svg).resize(size, size).png().toFile(path.join(mipmapDir, 'ic_launcher.png'));

    // ic_launcher_round (full icon)
    await sharp(svg).resize(size, size).png().toFile(path.join(mipmapDir, 'ic_launcher_round.png'));
  }

  // Generate foreground PNGs for adaptive icon
  for (const { name, size } of foregroundSizes) {
    const mipmapDir = path.join(outputDir, `mipmap-${name}`);
    fs.mkdirSync(mipmapDir, { recursive: true });

    // ic_launcher_foreground (used by adaptive-icon XML)
    await sharp(svg).resize(size, size).png().toFile(path.join(mipmapDir, 'ic_launcher_foreground.png'));
  }

  console.log('All icons generated successfully.');
}

generate().catch(console.error);
