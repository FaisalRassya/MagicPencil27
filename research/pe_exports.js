// pe_exports.js <dll> — list exported names
const fs = require('fs');
const b = fs.readFileSync(process.argv[2]);
const pe = b.readUInt32LE(0x3c);
const nsec = b.readUInt16LE(pe + 6), optSz = b.readUInt16LE(pe + 20), opt = pe + 24;
const expRva = b.readUInt32LE(opt + 112);
const secs = []; for (let i = 0; i < nsec; i++) { const s = opt + optSz + i * 40; secs.push({ va: b.readUInt32LE(s + 12), vs: b.readUInt32LE(s + 8), raw: b.readUInt32LE(s + 20) }); }
const off = (rva) => { for (const s of secs) if (rva >= s.va && rva < s.va + Math.max(s.vs, 1)) return rva - s.va + s.raw; return -1; };
const e = off(expRva);
const nNames = b.readUInt32LE(e + 24), namesRva = b.readUInt32LE(e + 32), ordRva = b.readUInt32LE(e + 36), funcRva = b.readUInt32LE(e + 28);
const out = [];
for (let i = 0; i < nNames; i++) {
  const nr = b.readUInt32LE(off(namesRva) + i * 4); let p = off(nr), s = ''; while (b[p]) s += String.fromCharCode(b[p++]);
  const ord = b.readUInt16LE(off(ordRva) + i * 2); const f = b.readUInt32LE(off(funcRva) + ord * 4);
  out.push(s + ' 0x' + f.toString(16));
}
console.log(out.length); console.log(out.join('\n'));
