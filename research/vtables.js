// Resolve vtables for RTTI class names, then find module globals pointing at instances.
const native = require(require('path').join(__dirname, '..', 'native.js'));
const fs = require('fs');
const t = new native.Target(native.findFmPid());
const m = t.module('game_plugin.dll');
const want = process.argv.slice(2);
const CH = 0x100000;
function scanModule(cb) {
  for (let off = 0; off < m.size; off += CH) {
    let buf; try { buf = t.read(m.base + BigInt(off), Math.min(CH, m.size - off)); } catch (e) { continue; }
    cb(buf, off);
  }
}
// 1) type descriptor rvas
const td = {};
scanModule((buf, off) => {
  const s = buf.toString('latin1');
  for (const w of want) { let i = -1; while ((i = s.indexOf(w + '\0', i + 1)) >= 0) if (s[i + w.length] === '\0') td[w] = off + i - 0x10; }
});
// 2) COLs: sig=1 and +12 == td rva
const col = {};
const tdr = new Map(Object.entries(td).map(([k, v]) => [v, k]));
scanModule((buf, off) => {
  for (let i = 0; i + 24 <= buf.length; i += 4) {
    if (buf.readUInt32LE(i) !== 1) continue;
    const r = buf.readUInt32LE(i + 12);
    if (tdr.has(r) && buf.readUInt32LE(i + 20) === off + i) (col[tdr.get(r)] = col[tdr.get(r)] || []).push(off + i);
  }
});
// 3) vtables: qword == base+col; vtable = that + 8
const colAbs = new Map();
for (const [k, arr] of Object.entries(col)) for (const c of arr) colAbs.set(m.base + BigInt(c), k);
const vt = {};
scanModule((buf, off) => {
  for (let i = 0; i + 8 <= buf.length; i += 8) {
    const q = buf.readBigUInt64LE(i);
    if (colAbs.has(q)) (vt[colAbs.get(q)] = vt[colAbs.get(q)] || []).push('0x' + (off + i + 8).toString(16));
  }
});
console.log(JSON.stringify({ td: Object.fromEntries(Object.entries(td).map(([k, v]) => [k, '0x' + v.toString(16)])), vt }, null, 1));
t.close();
