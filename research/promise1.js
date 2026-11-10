const scan = require('./heapscan.js');
const native = require(require('path').join(__dirname, '..', 'native.js'));
const run = require('./probe.js');
const names = ['wildsmith', 'prempeh-murray', 'quinlan'];
const info = run("rpc.exports.getSaveInfo(); var o={}; " + JSON.stringify(names) + ".forEach(function(n){ var h=rpc.exports.findPlayersByName(n,1)[0]; o[n]={addr:h.address, uid:h.uid, name:h.name}; }); return o;");
console.log(JSON.stringify(info));
const vals = [], lo = new Set();
for (const [n, i] of Object.entries(info)) { vals.push([n, BigInt(i.addr)]); lo.add(Number(BigInt(i.addr) & 0xffffffffn)); vals.push([n + ':uid', BigInt(i.uid)]); lo.add(i.uid); }
const r = scan(vals, { loSet: lo, max: 60 });
const t = new native.Target(native.findFmPid());
// look for dates in 2027 (year 0x07EB) within +-0x80 of each hit
for (const [k, arr] of Object.entries(r.hits)) {
  console.log(k, arr.length);
  for (const a of arr) {
    let b; try { b = t.read(a - 0x80n, 0x100); } catch (e) { continue; }
    const dates = [];
    for (let i = 0; i + 4 <= b.length; i += 2) { if (b.readUInt16LE(i + 2) === 2027) { const d = b.readUInt16LE(i) & 0x1FF; if (d >= 1 && d <= 366) dates.push((i - 0x80) + ':' + d + (b.readUInt16LE(i) >> 9 ? '/f' + (b.readUInt16LE(i) >> 9) : '')); } }
    console.log('  0x' + a.toString(16), dates.join(' '));
  }
}
t.close();
