// Heap scanner: find all occurrences of given 8-byte values (e.g. vtables) in committed private RW memory.
const koffi = require(require('path').join(__dirname, '..', 'node_modules/koffi'));
const native = require(require('path').join(__dirname, '..', 'native.js'));
const k32 = koffi.load('kernel32.dll');
const OpenProcess = k32.func('void* __stdcall OpenProcess(uint32, int, uint32)');
const CloseHandle = k32.func('int __stdcall CloseHandle(void*)');
const VirtualQueryEx = k32.func('size_t __stdcall VirtualQueryEx(void*, uint64, _Out_ uint8_t*, size_t)');
const RPM = k32.func('int __stdcall ReadProcessMemory(void*, uint64, _Out_ uint8_t*, size_t, _Out_ size_t*)');
function regions(h) {
  const out = []; let a = 0n; const mbi = Buffer.alloc(48);
  while (a < 0x7fffffff0000n) {
    if (!VirtualQueryEx(h, a, mbi, 48)) break;
    const base = mbi.readBigUInt64LE(0), size = mbi.readBigUInt64LE(24), state = mbi.readUInt32LE(32), prot = mbi.readUInt32LE(36), type = mbi.readUInt32LE(40);
    if (state === 0x1000 && type === 0x20000 && (prot === 0x04 || prot === 0x40)) out.push([base, size]);
    a = base + size;
  }
  return out;
}
module.exports = function scan(values, opts) {
  opts = opts || {};
  const pid = native.findFmPid();
  const h = OpenProcess(0x0410, 0, pid);
  const want = new Map(values.map(([n, v]) => [BigInt(v), n]));
  const hits = {}; for (const [n] of values) hits[n] = [];
  const regs = regions(h);
  let total = 0n;
  const CH = 0x400000, buf = Buffer.alloc(CH), got = [0];
  for (const [base, size] of regs) {
    for (let off = 0n; off < size; off += BigInt(CH)) {
      const len = Number(size - off < BigInt(CH) ? size - off : BigInt(CH));
      if (!RPM(h, base + off, buf, len, got)) continue;
      total += BigInt(len);
      for (let i = 0; i + 8 <= len; i += 8) {
        const lo = buf.readUInt32LE(i);
        if (!opts.loSet.has(lo)) continue;
        const v = buf.readBigUInt64LE(i);
        if (want.has(v)) { const arr = hits[want.get(v)]; if (arr.length < (opts.max || 100000)) arr.push(base + off + BigInt(i)); }
      }
    }
  }
  CloseHandle(h);
  return { regions: regs.length, scannedMB: Number(total / 1048576n), hits };
};
if (require.main === module) {
  const t = new native.Target(native.findFmPid()); const m = t.module('game_plugin.dll'); t.close();
  const vals = process.argv.slice(2).map(a => { const [n, r] = a.split('='); return [n, m.base + BigInt(r)]; });
  const loSet = new Set(vals.map(([, v]) => Number(v & 0xffffffffn)));
  const t0 = Date.now();
  const r = module.exports(vals, { loSet });
  const summary = {}; for (const [n, arr] of Object.entries(r.hits)) summary[n] = { n: arr.length, first: arr.slice(0, 5).map(x => '0x' + x.toString(16)) };
  console.log(JSON.stringify({ ms: Date.now() - t0, regions: r.regions, scannedMB: r.scannedMB, summary }, null, 1));
}
