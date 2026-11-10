// schedsearch.js <snapshot-label> — search a snapshot for the March 2027 week pattern from the user's screenshot.
// Days (3..8 Mar): d3=(Rec,Rest,Rest) d4=(PS,BU,CC) d5=(PA,FT,DE) d6=(Rest,MATCH,Rest) d7=(Rec,Rest,Rest) d8=(PS,CC,BU)
// Unknown encoding: element size e, slot stride s, day stride D. Checks equality relations only.
const fs = require('fs');
const DIR = require('path').join(__dirname, '..', 'research/memdiff_data');
const label = process.argv[2] || 'a1';
const idx = JSON.parse(fs.readFileSync(DIR + '/layout.json'));
const fd = fs.openSync(`${DIR}/${label}.bin`, 'r');
const ES = (process.argv[3] || '1,2,4,8').split(',').map(Number);
const MAXD = +(process.env.MAXD || 256);
const hits = [];
const t0 = Date.now();
// read whole regions contiguous by address: group chunks that are address-contiguous
const groups = []; let cur = null;
for (const [b, pos, len] of idx) {
  const B = BigInt(b);
  if (cur && cur.end === B && cur.pos + cur.len === pos) { cur.len += len; cur.end = B + BigInt(len); }
  else { cur = { base: B, pos, len, end: B + BigInt(len) }; groups.push(cur); }
}
for (const g of groups) {
  const buf = Buffer.alloc(g.len); fs.readSync(fd, buf, 0, g.len, g.pos);
  for (const e of ES) {
    const n = Math.floor(g.len / e);
    const rd = e === 1 ? (i) => buf[i] : e === 2 ? (i) => buf.readUInt16LE(i) : e === 4 ? (i) => buf.readUInt32LE(i) : (i) => buf.readUInt32LE(i) * 4294967296 + buf.readUInt32LE(i + 4);
    const SS = (process.env.SS ? process.env.SS.split(",").map(Number) : [e, 2 * e, 4 * e, 8 * e]).filter(s => s >= e && s % e === 0);
    for (let p = 0; p + e <= g.len; p += e) {
      const R = rd(p);
      for (const s of SS) {
        if (p + 2 * s + e > g.len) break;
        const y = rd(p + s); if (y === R || rd(p + 2 * s) !== y) continue;
        for (let D = 3 * s; D <= MAXD; D += e) {
          const q = p + 4 * D; if (q + 2 * s + e > g.len) break;
          if (rd(q) !== R || rd(q + s) !== y || rd(q + 2 * s) !== y) continue;
          // d6 = (y, M, y)
          const d6 = p + 3 * D; if (rd(d6) !== y || rd(d6 + 2 * s) !== y) continue;
          const M = rd(d6 + s); if (M === y || M === R) continue;
          // d4 three distinct, none of R,y,M
          const d4 = p + D, a = rd(d4), b = rd(d4 + s), c = rd(d4 + 2 * s);
          if (a === b || b === c || a === c || [a, b, c].some(v => v === R || v === y || v === M)) continue;
          // d8 = (a, c, b)
          const d8 = p + 5 * D; if (d8 + 2 * s + e > g.len) continue;
          const ok8 = rd(d8) === a && rd(d8 + s) === c && rd(d8 + 2 * s) === b;
          const d5 = p + 2 * D, x = rd(d5), yy = rd(d5 + s), z = rd(d5 + 2 * s);
          const ok5 = new Set([x, yy, z, a, b, c, R, y, M]).size === 9;
          if (!ok8 && !ok5) continue;
          hits.push({ addr: '0x' + (g.base + BigInt(p)).toString(16), e, s, D, R, y, M, d4: [a, b, c], d5: [x, yy, z], ok8, ok5 });
          if (hits.length > 50) break;
        }
      }
    }
  }
}
console.log(JSON.stringify({ ms: Date.now() - t0, n: hits.length, hits: hits.slice(0, 30) }, null, 1));
