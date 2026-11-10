// Scan the whole game_plugin.dll image for the ACTUAL_PLAYER vector (used after FM patches).
const native = require('../native.js');
const t = new native.Target(native.findFmPid());
const m = t.module('game_plugin.dll');
const base = m.base, size = m.size, end = base + BigInt(size);
const inMod = (q) => q >= base && q < end;
const cache = new Map();
function cls(vt) {
  if (cache.has(vt)) return cache.get(vt);
  let name = null;
  try {
    const col = t.read(vt - 8n, 8).readBigUInt64LE(0);
    if (inMod(col)) { const c = t.read(col, 24); if (c.readUInt32LE(0) === 1) { const td = base + BigInt(c.readUInt32LE(12)); name = t.read(td + 16n, 64).toString('latin1').split('\0')[0]; } }
  } catch (e) {}
  cache.set(vt, name); return name;
}
const want = process.argv.slice(2);
const hits = [];
const CH = 0x100000;
for (let off = 0; off < size; off += CH) {
  let buf; try { buf = t.read(base + BigInt(off), Math.min(CH + 16, size - off)); } catch (e) { continue; }
  for (let i = 0; i + 16 <= buf.length && i < CH; i += 8) {
    const b = buf.readBigUInt64LE(i), e = buf.readBigUInt64LE(i + 8);
    if (b < 0x10000000n || b > 0x7fffffffffffn || inMod(b) || e <= b) continue;
    const bytes = e - b; if (bytes % 8n || bytes > 80000000n || bytes < 8000n) continue;
    let vt; try { const p = t.read(b, 8).readBigUInt64LE(0); vt = t.read(p, 8).readBigUInt64LE(0); } catch (x) { continue; }
    if (!inMod(vt)) continue;
    const n = cls(vt);
    if (n && (!want.length || want.some(w => n.includes(w)))) hits.push({ rva: '0x' + (off + i).toString(16), n: Number(bytes / 8n), cls: n });
  }
}
console.log(JSON.stringify(hits.sort((a, b) => b.n - a.n).slice(0, 40), null, 1));
