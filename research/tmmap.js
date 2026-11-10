// tmmap.js — walk TRAINING_MANAGER unordered_map (+0x98 list head, +0xa0 size) and find entries for a team.
const { t, describe } = require('./peek.js');
const TM = BigInt(process.argv[2]), team = BigInt(process.argv[3] || 0);
const head = t.read(TM + 0x98n, 8).readBigUInt64LE(0);
const size = Number(t.read(TM + 0xa0n, 8).readBigUInt64LE(0));
console.log('head', head.toString(16), 'size', size);
let node = t.read(head, 8).readBigUInt64LE(0); let i = 0; const keys = {};
let shown = 0;
while (node !== head && i < size + 5) {
  const b = t.read(node, 0x40);
  const k = b.readBigUInt64LE(0x10), v = b.readBigUInt64LE(0x18);
  if (i < 3 || k === team || v === team) {
    console.log(i, 'node', node.toString(16), 'k', k.toString(16), describe(k), 'v', v.toString(16), describe(v), [...b.slice(0x10, 0x40)].map(x => x.toString(16).padStart(2, '0')).join(''));
  }
  node = b.readBigUInt64LE(0); i++;
}
console.log('walked', i);
t.close();
