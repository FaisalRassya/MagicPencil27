// peek.js <addr> [size] — dump qwords with RTTI class names for pointers to polymorphic objects.
const native = require(require('path').join(__dirname, '..', 'native.js'));
const t = new native.Target(native.findFmPid());
const m = t.module('game_plugin.dll');
const end = m.base + BigInt(m.size);
const inMod = (q) => q >= m.base && q < end;
const cache = new Map();
function clsOfVt(vt) {
  if (cache.has(vt)) return cache.get(vt);
  let name = null;
  try {
    const col = t.read(vt - 8n, 8).readBigUInt64LE(0);
    if (inMod(col)) { const c = t.read(col, 24); if (c.readUInt32LE(0) === 1) { const td = m.base + BigInt(c.readUInt32LE(12)); name = t.read(td + 16n, 120).toString('latin1').split('\0')[0]; } }
  } catch (e) {}
  cache.set(vt, name); return name;
}
function describe(q) {
  if (inMod(q)) { const c = clsOfVt(q); return c ? 'VT ' + c : 'mod+0x' + (q - m.base).toString(16); }
  if (q < 0x10000000n || q > 0x7fffffffffffn) return '';
  try { const v = t.read(q, 8).readBigUInt64LE(0); if (inMod(v)) { const c = clsOfVt(v); if (c) return '-> ' + c; } return '-> heap'; } catch (e) { return ''; }
}
module.exports = { t, m, describe, clsOfVt };
if (require.main === module) {
  const a = BigInt(process.argv[2]), n = parseInt(process.argv[3] || '0x100');
  const b = t.read(a, n);
  for (let o = 0; o < n; o += 8) {
    const q = b.readBigUInt64LE(o);
    const d = describe(q);
    console.log('+' + o.toString(16).padStart(3, '0'), q.toString(16).padStart(16, '0'), b.readInt32LE(o), b.readInt32LE(o + 4), d);
  }
  t.close();
}
