// find tactic option ids in captured native->UI responses
const fs = require('fs');
const opts = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'hook/tactic_options.json'), 'utf8'));
const lines = fs.readFileSync(process.argv[2], 'latin1').split('\n');
const found = {}; const ctx = {};
let li = 0;
for (const l of lines) {
  li++;
  const m = l.match(/^(\S+) (RESP keys\[(\d+)\]=(\w*) items\[(\d+)\]=|NEVENT id=\d+ data\[\d+\]=|UPDATE .*data\[\d+\]=)(\w+)/);
  if (!m) continue;
  const b = Buffer.from(m[6].replace(/\.+$/, ''), 'hex');
  for (let i = 0; i + 4 <= b.length; i++) {
    const v = b.readUInt32LE(i);
    if (opts[v] && v > 1000) {
      const pre = b.slice(Math.max(0, i - 2), i).toString('hex');
      const k = opts[v];
      (found[k] = found[k] || []).push(`${m[1]}#${li}@${i} pre=${pre}`);
    }
  }
}
const names = Object.keys(found).sort();
for (const n of names) console.log(n.padEnd(40), found[n].length, found[n].slice(0, 3).join(' '));
console.log('distinct', names.length);
