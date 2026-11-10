// Scan heap for f32 values in [lo,hi]; report neighborhoods (u8/u16 dump) for manual matching.
const koffi = require(require('path').join(__dirname, '..', 'node_modules/koffi'));
const native = require(require('path').join(__dirname, '..', 'native.js'));
const k32 = koffi.load('kernel32.dll');
const OpenProcess = k32.func('void* __stdcall OpenProcess(uint32, int, uint32)');
const VirtualQueryEx = k32.func('size_t __stdcall VirtualQueryEx(void*, uint64, _Out_ uint8_t*, size_t)');
const RPM = k32.func('int __stdcall ReadProcessMemory(void*, uint64, _Out_ uint8_t*, size_t, _Out_ size_t*)');
const h = OpenProcess(0x0410, 0, native.findFmPid());
const f2u = (f) => { const b = Buffer.alloc(4); b.writeFloatLE(f); return b.readUInt32LE(0); };
// targets: [name, xgLo, xgHi, mustHaveSmallInts]
const T = JSON.parse(process.argv[2]);
const ranges = T.map(t => [t[0], f2u(t[1]), f2u(t[2]), t[3]]);
let a = 0n; const mbi = Buffer.alloc(48); const regs = [];
while (a < 0x7fffffff0000n) { if (!VirtualQueryEx(h, a, mbi, 48)) break; const b = mbi.readBigUInt64LE(0), s = mbi.readBigUInt64LE(24); if (mbi.readUInt32LE(32) === 0x1000 && mbi.readUInt32LE(40) === 0x20000 && (mbi.readUInt32LE(36) === 4)) regs.push([b, s]); a = b + s; }
const CH = 0x400000, buf = Buffer.alloc(CH), got = [0]; const res = {};
for (const [b, s] of regs) for (let off = 0n; off < s; off += BigInt(CH)) {
  const len = Number(s - off < BigInt(CH) ? s - off : BigInt(CH));
  if (!RPM(h, b + off, buf, len, got)) continue;
  for (let i = 0; i + 4 <= len; i += 4) {
    const u = buf.readUInt32LE(i);
    for (const [n, lo, hi, ints] of ranges) {
      if (u < lo || u > hi) continue;
      const w0 = Math.max(0, i - 96), w1 = Math.min(len, i + 96);
      const win = buf.subarray(w0, w1);
      // all required small ints must appear as a byte value somewhere in the window
      if (!ints.every(v => win.indexOf(v) >= 0)) continue;
      (res[n] = res[n] || []).push({ addr: '0x' + (b + off + BigInt(i)).toString(16), f: buf.readFloatLE(i), hex: Buffer.from(win).toString('hex') , rel: i - w0 });
    }
  }
}
for (const [n, arr] of Object.entries(res)) { console.log(n, arr.length); for (const r of arr.slice(0, 12)) console.log(' ', r.addr, r.f.toFixed(4), 'rel', r.rel, r.hex); }
