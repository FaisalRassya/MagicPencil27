const koffi = require(require('path').join(__dirname, '..', 'node_modules/koffi'));
const native = require(require('path').join(__dirname, '..', 'native.js'));
const run = require('./probe.js');
const k32 = koffi.load('kernel32.dll');
const OpenProcess = k32.func('void* __stdcall OpenProcess(uint32, int, uint32)');
const VirtualQueryEx = k32.func('size_t __stdcall VirtualQueryEx(void*, uint64, _Out_ uint8_t*, size_t)');
const RPM = k32.func('int __stdcall ReadProcessMemory(void*, uint64, _Out_ uint8_t*, size_t, _Out_ size_t*)');
const names = ['wildsmith', 'prempeh-murray', 'quinlan'];
const info = run("rpc.exports.getSaveInfo(); var o=[]; " + JSON.stringify(names) + ".forEach(function(n){ var h=rpc.exports.findPlayersByName(n,1)[0]; o.push({n:n, addr:h.address, uid:h.uid}); }); return o;");
const ptrs = new Map(info.map(i => [BigInt(i.addr), i.n])), uids = new Map(info.map(i => [i.uid, i.n]));
const h = OpenProcess(0x0410, 0, native.findFmPid());
let a = 0n; const mbi = Buffer.alloc(48); const regs = [];
while (a < 0x7fffffff0000n) { if (!VirtualQueryEx(h, a, mbi, 48)) break; const b = mbi.readBigUInt64LE(0), s = mbi.readBigUInt64LE(24); if (mbi.readUInt32LE(32) === 0x1000 && mbi.readUInt32LE(40) === 0x20000 && mbi.readUInt32LE(36) === 4) regs.push([b, s]); a = b + s; }
const CH = 0x400000, buf = Buffer.alloc(CH), got = [0]; const hits = [];
const DAYS = new Set([33, 34, 35, 36]);
for (const [b, s] of regs) for (let off = 0n; off < s; off += BigInt(CH)) {
  const len = Number(s - off < BigInt(CH) ? s - off : BigInt(CH));
  if (!RPM(h, b + off, buf, len, got)) continue;
  for (let i = 0; i + 4 <= len; i += 2) {
    if (buf.readUInt16LE(i + 2) !== 2027) continue;
    const d = buf.readUInt16LE(i) & 0x1FF; if (!DAYS.has(d)) continue;
    const w0 = Math.max(0, i - 0x60) & ~7, w1 = Math.min(len - 8, i + 0x60);
    for (let j = w0; j <= w1; j += 4) {
      const q = j % 8 === 0 ? buf.readBigUInt64LE(j) : null;
      const u = buf.readUInt32LE(j);
      const who = (q !== null && ptrs.get(q)) || uids.get(u);
      if (who) hits.push({ date: '0x' + (b + off + BigInt(i)).toString(16), day: d, flags: buf.readUInt16LE(i) >> 9, who, rel: j - i, kind: (q !== null && ptrs.get(q)) ? 'ptr' : 'uid' });
    }
  }
}
console.log(hits.length); hits.slice(0, 40).forEach(x => console.log(JSON.stringify(x)));
