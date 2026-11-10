// Build "MagicPencil27.exe" into ./dist  (run: node.exe build.js)
const path = require('path');

(async () => {
  const mod = await import('@electron/packager');
  const packager = mod.packager || mod.default;
  const out = await packager({
    dir: __dirname,
    name: 'MagicPencil27',
    executableName: 'MagicPencil27',
    platform: 'win32',
    arch: 'x64',
    out: path.join(__dirname, 'dist'),
    icon: path.join(__dirname, 'icon.ico'),
    overwrite: true,
    appVersion: require('./package.json').version,
    asar: false,
    prune: true,
    ignore: [
      /^\/node_modules\/frida($|\/)/,          // old injected backend, not used by the app
      /^\/(probe|test_|peek|off\d|fg_out|build|research|docs|dist)/, // research/test scripts
      /\.log$/,
      /^\/hook\/(test|live)($|\/)/,
      /^\/hook\/.*\.(c|pdb|lib)$/,
      /^\/icon\.png$/,
    ],
    win32metadata: {
      ProductName: 'MagicPencil27',
      FileDescription: 'MagicPencil27',
      CompanyName: 'MagicPencil27 contributors',
      OriginalFilename: 'MagicPencil27.exe',
    },
  });
  // keep only English + Indonesian Chromium locales (saves ~45 MB)
  const fs = require('fs');
  for (const dir of out) {
    const loc = path.join(dir, 'locales');
    for (const f of fs.readdirSync(loc)) if (!/^(en-US|id)\.pak$/.test(f)) fs.rmSync(path.join(loc, f));
  }
  console.log('Built:', out.join(', '));
})().catch((e) => { console.error('BUILD FAILED:', e); process.exit(1); });
