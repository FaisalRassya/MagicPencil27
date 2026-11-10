// hookctl.js — manage the in-game interop hook (fmhook.dll): inject, send commands, read log.
// Works on Game Pass (WindowsApps is read-only, so no BepInEx): the DLL is loaded at runtime via LoadLibraryW.
const fs = require('fs'), path = require('path'), os = require('os');
const koffi = require('koffi');
const native = require('./native.js');
const { inject } = require('./hook/inject.js');

const k32 = koffi.load('kernel32.dll'), psapi = koffi.load('psapi.dll');
const OpenProcess = k32.func('void* __stdcall OpenProcess(uint32, int, uint32)');
const CloseHandle = k32.func('int __stdcall CloseHandle(void*)');
const EnumProcessModulesEx = psapi.func('int __stdcall EnumProcessModulesEx(void*, void*, uint32, _Out_ uint32*, uint32)');
const GetModuleFileNameExW = psapi.func('uint32 __stdcall GetModuleFileNameExW(void*, uint64, void*, uint32)');

const SRC_DLL = path.join(__dirname, 'hook', 'fmhook.dll');
const HOOK_NAME = 'fmhook3.dll'; // bump when fmhook.c changes (a loaded DLL cannot be replaced)
const RUN_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'MagicPencil27', 'hook');

function loadedHookPath(pid) {
  const h = OpenProcess(0x0410, 0, pid); if (!h) return null;
  try {
    const mods = Buffer.alloc(8 * 2048), needed = [0];
    if (!EnumProcessModulesEx(h, mods, mods.length, needed, 3)) return null;
    const n = Math.min(needed[0], mods.length) / 8, buf = Buffer.alloc(1040); const found = [];
    for (let i = 0; i < n; i++) {
      const len = GetModuleFileNameExW(h, mods.readBigUInt64LE(i * 8), buf, 520);
      const p = buf.toString('utf16le', 0, len * 2);
      if (/\\fmhook\d*\.dll$/i.test(p)) found.push(p);
    }
    // only the current version (living in RUN_DIR) counts; older test builds elsewhere are ignored
    return found.find(p => p.toLowerCase() === path.join(RUN_DIR, HOOK_NAME).toLowerCase()) || null;
  } finally { CloseHandle(h); }
}

function status() {
  let pid; try { pid = native.findFmPid(); } catch (e) { return { running: false }; }
  if (!pid) return { running: false };
  const p = loadedHookPath(pid);
  return { running: true, pid, loaded: !!p, dir: p ? path.dirname(p) : null };
}

async function ensure() {
  const st = status();
  if (!st.running) throw new Error('FM27 tidak berjalan');
  if (st.loaded) return st;
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const dst = path.join(RUN_DIR, HOOK_NAME);
  const exe = (() => { try { return require('child_process').execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${st.pid}).Path`]).toString().trim(); } catch (e) { return ''; } })();
  const cfgSrc = path.join(__dirname, 'hook', /0.9.2409.0/.test(exe) ? 'hook_gamepass_0.9.2409.cfg' : 'hook_none.cfg');
  try { fs.copyFileSync(cfgSrc, path.join(RUN_DIR, 'hook.cfg')); } catch (e) { try { fs.unlinkSync(path.join(RUN_DIR, 'hook.cfg')); } catch (e2) {} }
  try { fs.copyFileSync(SRC_DLL, dst); } catch (e) { if (!fs.existsSync(dst)) throw e; }
  const r = inject(st.pid, dst);
  if (!r) throw new Error('Gagal memuat fmhook.dll ke FM');
  await new Promise(res => setTimeout(res, 1500));
  const st2 = status();
  if (!st2.loaded) throw new Error('fmhook.dll tidak terdeteksi setelah inject');
  return st2;
}

function logSize(dir) { try { return fs.statSync(path.join(dir, 'fmhook.log')).size; } catch (e) { return 0; } }
function readLogFrom(dir, from) {
  const p = path.join(dir, 'fmhook.log');
  const fd = fs.openSync(p, 'r'); const size = fs.fstatSync(fd).size;
  const b = Buffer.alloc(Math.max(0, size - from)); fs.readSync(fd, b, 0, b.length, from); fs.closeSync(fd);
  return b.toString('latin1');
}

// lines: array of command strings (see fmhook.c). Waits until the game executes them on its main thread.
async function run(lines, timeoutMs = 15000) {
  const st = await ensure();
  const cmd = path.join(st.dir, 'cmd.txt'), done = path.join(st.dir, 'cmd.done');
  if (fs.existsSync(cmd)) throw new Error('Perintah sebelumnya belum dieksekusi (FM sedang sibuk/tertutup dialog?)');
  const from = logSize(st.dir);
  try { fs.unlinkSync(done); } catch (e) {}
  fs.writeFileSync(cmd + '.tmp', lines.join('\n') + '\n'); fs.renameSync(cmd + '.tmp', cmd);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await new Promise(r => setTimeout(r, 100));
    if (fs.existsSync(done) && !fs.existsSync(cmd)) return { ok: true, log: readLogFrom(st.dir, from).split('\n').filter(l => / CMD /.test(l)) };
  }
  try { fs.unlinkSync(cmd); } catch (e) {}
  throw new Error('FM tidak mengeksekusi perintah dalam ' + timeoutMs / 1000 + ' detik');
}

// recent interop traffic (for learning event formats)
function tail(n = 200, filter) {
  const st = status(); if (!st.loaded) return [];
  const p = path.join(st.dir, 'fmhook.log'); const size = logSize(st.dir);
  const txt = readLogFrom(st.dir, Math.max(0, size - 4 * 1024 * 1024));
  let lines = txt.split('\n'); if (filter) lines = lines.filter(l => filter.test(l));
  return lines.slice(-n);
}

module.exports = { status, ensure, run, tail, RUN_DIR };
if (require.main === module) {
  (async () => {
    const [cmd, ...rest] = process.argv.slice(2);
    if (cmd === 'status') console.log(status());
    else if (cmd === 'ensure') console.log(await ensure());
    else if (cmd === 'run') console.log(await run([rest.join(' ')]));
    else if (cmd === 'tail') console.log(tail(+rest[0] || 50, rest[1] ? new RegExp(rest[1]) : null).join('\n'));
  })().catch(e => { console.error('ERR', e.message); process.exit(1); });
}
