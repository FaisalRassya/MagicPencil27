// Find module globals (and 1-level heap) pointing at objects with given vtable rvas.
const native = require(require('path').join(__dirname, '..', 'native.js'));
const t = new native.Target(native.findFmPid());
const m = t.module('game_plugin.dll');
const vts = new Map(process.argv.slice(2).map(a => { const [n, r] = a.split('='); return [m.base + BigInt(r), n]; }));
const lo = 0x5400000, hi = Math.min(m.size, 0x6400000);
const end = m.base + BigInt(m.size);
const hits = [];
let reads = 0;
for (let off = lo; off < hi; off += 0x100000) {
  let buf; try { buf = t.read(m.base + BigInt(off), Math.min(0x100000, hi - off)); } catch (e) { continue; }
  for (let i = 0; i + 8 <= buf.length; i += 8) {
    const q = buf.readBigUInt64LE(i);
    if (q < 0x10000000n || q > 0x7fffffffffffn || (q >= m.base && q < end) || (q & 7n)) continue;
    let v; try { v = t.read(q, 8).readBigUInt64LE(0); reads++; } catch (e) { continue; }
    if (vts.has(v)) hits.push({ global: '0x' + (off + i).toString(16), obj: '0x' + q.toString(16), cls: vts.get(v) });
  }
  t.clearCache && t.clearCache();
}
console.log(JSON.stringify({ reads, hits }, null, 1));
t.close();
