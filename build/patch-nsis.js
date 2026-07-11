const fs = require('fs');
const path = require('path');

function patchFile(relativePath, patchFn, label) {
  const targetPath = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(targetPath)) {
    console.error(`✗ ${label} not found at: ${targetPath}`);
    return false;
  }
  let content = fs.readFileSync(targetPath, 'utf8');
  const result = patchFn(content);
  if (result === true) {
    console.log(`✓ ${label} already patched`);
  } else if (result) {
    fs.writeFileSync(targetPath, result, 'utf8');
    console.log(`✓ Patched ${label}`);
  } else {
    console.warn(`⚠ Could not patch ${label} - pattern not found (may already be patched or version changed)`);
    return false;
  }
  return true;
}

patchFile(
  'node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js',
  (content) => {
    if (content.includes('solid: false')) return true;
    const oldStr = `const archiveOptions = {
            withoutDir: true,
            compression: packager.compression,
            excluded:`;
    const newStr = `const archiveOptions = {
            withoutDir: true,
            compression: packager.compression,
            solid: false,
            excluded:`;
    if (content.includes(oldStr)) {
      return content.replace(oldStr, newStr);
    }
    return false;
  },
  'NsisTarget.js (solid: false)'
);

patchFile(
  'node_modules/app-builder-lib/out/targets/archive.js',
  (content) => {
    if (content.includes('// PATCHED: BCJ2 disabled for Nsis7z compatibility')) return true;
    const oldStr = `if (process.env.ELECTRON_BUILDER_7Z_FILTER) {
            args.push(\`-mf=\${process.env.ELECTRON_BUILDER_7Z_FILTER}\`);
        }`;
    const newStr = `// PATCHED: BCJ2 disabled for Nsis7z compatibility (Nsis7z plugin doesn't support BCJ2 filter)
        args.push("-mf=off");
        if (process.env.ELECTRON_BUILDER_7Z_FILTER) {
            args.push(\`-mf=\${process.env.ELECTRON_BUILDER_7Z_FILTER}\`);
        }`;
    if (content.includes(oldStr)) {
      return content.replace(oldStr, newStr);
    }
    return false;
  },
  'archive.js (disable BCJ2 filter)'
);

console.log('✓ NSIS archive patches applied successfully');
