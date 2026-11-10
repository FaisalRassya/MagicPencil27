const scan = require('./heapscan.js');
const native = require(require('path').join(__dirname, '..', 'native.js'));
const run = require('./probe.js');
const names = process.argv.slice(2);
const info = run("rpc.exports.getSaveInfo(); var o={}; " + JSON.stringify(names) + ".forEach(function(n){ var h=rpc.exports.findPlayersByName(n,1)[0]; var p=ptr(h.address); o[n]={addr:h.address, uid:h.uid, pid:p.add(0x290).readU32(), id2:p.add(0x288).readU32(), id3:p.add(0x28C).readU32()}; }); return o;");
console.log(JSON.stringify(info));
const vals = [], lo = new Set();
for (const [n, i] of Object.entries(info)) {
  vals.push([n + ':ptr', BigInt(i.addr)], [n + ':uid', BigInt(i.uid)]);
  lo.add(Number(BigInt(i.addr) & 0xffffffffn)); lo.add(i.uid);
}
const r = scan(vals, { loSet: lo, max: 50 });
const t = new native.Target(native.findFmPid());
const dump = (a) => { try { const b = t.read(a - 0x40n, 0xA0); return b.toString('hex').replace(/(.{32})/g, '$1 '); } catch (e) { return 'unreadable'; } };
for (const [k, arr] of Object.entries(r.hits)) { console.log(k, arr.length); for (const a of arr) console.log('  0x' + a.toString(16), dump(a)); }
t.close();
