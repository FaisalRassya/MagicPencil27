const native = require(require('path').join(__dirname, '..', 'native.js'));
const fs = require('fs');
const t = new native.Target(native.findFmPid());
const m = t.module('game_plugin.dll');
const names = new Map();
const CH = 0x100000;
for (let off = 0; off < m.size; off += CH) {
  let buf;
  try { buf = t.read(m.base + BigInt(off), Math.min(CH + 256, m.size - off)); } catch (e) { continue; }
  const s = buf.toString('latin1');
  const re = /\.\?AV[A-Za-z0-9_@?$]{3,200}?@@/g;
  let r;
  while ((r = re.exec(s))) if (!names.has(r[0])) names.set(r[0], off + r.index);
  t.clearCache && t.clearCache();
}
t.close();
const all = [...names.keys()].sort();
fs.writeFileSync(process.argv[2], all.map(n => n + ' 0x' + names.get(n).toString(16)).join('\n'));
console.log('classes', all.length);
const kw = /PROMISE|PERMIT|STAT|YOUTH|INTAKE|CAREER|PLAN|NEWGEN|REGEN|CANDIDATE|HISTORY|SEASON|INTEREST|SHORTLIST|TRANSFER|LOAN/i;
console.log(all.filter(n => kw.test(n)).filter(n => /@db@@$|@sicomps@@$|@sitransfer|@sifm/i.test(n) || true).slice(0, 400).join('\n'));
