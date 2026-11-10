// For each hit of session-id pattern, look nearby for a date of 20 Mar 2027 in either encoding.
const scan = require('./heapscan_bytes_lib.js');
const native = require(require('path').join(__dirname, '..', 'native.js'));
const t = new native.Target(native.findFmPid());
const res = [];
for (const stride of [1, 2, 4, 8]) {
  const hits = scan([0x69, 0x6a, 0x65], stride, 3000);
  for (const h of hits) {
    let b; try { b = t.read(h - 64n, 160); } catch (e) { continue; }
    const notes = [];
    for (let i = 0; i + 4 <= b.length; i++) {
      if (b[i] === 0x4f && (b[i + 1] & 0x01) === 0 && b[i + 2] === 0xeb && b[i + 3] === 0x07) notes.push('ddy@' + (i - 64));
      if (b[i] === 0x00 && b[i + 1] === 0x4f && b[i + 2] === 0xd6 && b[i + 3] === 0x0f) notes.push('packed@' + (i - 64));
    }
    if (notes.length) res.push({ h: '0x' + h.toString(16), stride, notes: notes.join(','), hex: b.slice(32, 112).toString('hex') });
  }
}
console.log(JSON.stringify(res.slice(0, 40), null, 1), res.length);
t.close();
