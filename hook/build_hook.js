// Build hook/fmhook.dll from source with zig (C compiler) + MinHook.
//   ZIG=path\to\zig.exe  MINHOOK=path\to\minhook-master  node hook/build_hook.js
// zig: https://ziglang.org/download/   MinHook: https://github.com/TsudaKageyu/minhook
const { execFileSync } = require('child_process');
const path = require('path');
const zig = process.env.ZIG || 'zig';
const mh = process.env.MINHOOK;
if (!mh) { console.error('Set MINHOOK to the MinHook source folder (contains include/ and src/).'); process.exit(1); }
const out = path.join(__dirname, 'fmhook.dll');
execFileSync(zig, ['cc', '-target', 'x86_64-windows-gnu', '-shared', '-O2', '-o', out, path.join(__dirname, 'fmhook.c'),
  ...['hook.c', 'buffer.c', 'trampoline.c', 'hde/hde64.c'].map(f => path.join(mh, 'src', f)), '-I' + path.join(mh, 'include')], { stdio: 'inherit' });
console.log('Built', out);
