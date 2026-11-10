// qcand.js — group memdiff byte candidates into qwords, read full qword values from each snapshot
const fs = require('fs');
const DIR = require('path').join(__dirname, '..', 'research/memdiff_data');
const st = require(DIR + '/result.json');
const idx = JSON.parse(fs.readFileSync(DIR + '/layout.json'));
const fds = st.labels.map(l => fs.openSync(`${DIR}/${l}.bin`, 'r'));
function fileOff(addr) {
  let lo = 0, hi = idx.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; const b = BigInt(idx[m][0]); if (addr < b) hi = m - 1; else if (addr >= b + BigInt(idx[m][2])) lo = m + 1; else return idx[m][1] + Number(addr - b); }
  return -1;
}
const qs = [...new Set(st.out.map(([a]) => (BigInt('0x' + a) & ~7n).toString(16)))];
const rows = [];
const b = Buffer.alloc(8);
for (const q of qs) {
  const A = BigInt('0x' + q), off = fileOff(A); if (off < 0) continue;
  const vals = fds.map(fd => { fs.readSync(fd, b, 0, 8, off); return b.readBigUInt64LE(0); });
  rows.push([A, vals]);
}
const mode = process.argv[2] || 'ptr';
let n = 0;
for (const [A, v] of rows) {
  const isPtr = v.every(x => x > 0x10000000000n && x < 0x7fffffffffffn);
  const isSmall32 = v.every(x => (x & 0xffffffffn) < 5000n);
  if (mode === 'ptr' && !isPtr) continue;
  if (A < 0x10000000000n) continue;
  console.log('0x' + A.toString(16), v.map(x => x.toString(16)).join(' '));
  if (++n > (+process.argv[3] || 80)) break;
}
console.log('qwords', rows.length);
if (mode === 'cons') {
  const ok = rows.filter(([A, v]) => A > 0x10000000000n && v[0] === v[3] && v[1] === v[4] && v[0] !== v[1] && v[0] !== v[2] && v[1] !== v[2]);
  console.log('consistent qwords', ok.length);
  const hist = {};
  for (const [A, v] of ok) { const k = v.slice(0, 3).map(x => x.toString(16)).join(' '); (hist[k] = hist[k] || []).push('0x' + A.toString(16)); }
  for (const [k, l] of Object.entries(hist).sort((a, b) => b[1].length - a[1].length)) console.log(l.length, k, l.slice(0, 6).join(' '));
}
