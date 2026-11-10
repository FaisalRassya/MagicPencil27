// memdiff.js — find memory that follows a change made in the FM UI.
//   node memdiff.js snap <label>     first call defines the address layout (chunk list); later snaps read the same addresses
//   node memdiff.js cmp <l1> <l2> ... compare snapshots: label letter = expected-value class (a1 == a2, a != b)
//   node memdiff.js show [n]         print last cmp result with RTTI owner context
const fs = require('fs'), path = require('path');
const koffi = require(require('path').join(__dirname, '..', 'node_modules/koffi'));
const native = require(require('path').join(__dirname, '..', 'native.js'));
const DIR = require('path').join(__dirname, '..', 'research/memdiff_data');
fs.mkdirSync(DIR, { recursive: true });
const k32 = koffi.load('kernel32.dll');
const OpenProcess = k32.func('void* __stdcall OpenProcess(uint32, int, uint32)');
const CloseHandle = k32.func('int __stdcall CloseHandle(void*)');
const VirtualQueryEx = k32.func('size_t __stdcall VirtualQueryEx(void*, uint64, _Out_ uint8_t*, size_t)');
const RPM = k32.func('int __stdcall ReadProcessMemory(void*, uint64, _Out_ uint8_t*, size_t, _Out_ size_t*)');
function regions(h) {
  const out = []; let a = 0n; const mbi = Buffer.alloc(48);
  while (a < 0x7fffffff0000n) {
    if (!VirtualQueryEx(h, a, mbi, 48)) break;
    const base = mbi.readBigUInt64LE(0), size = mbi.readBigUInt64LE(24), state = mbi.readUInt32LE(32), prot = mbi.readUInt32LE(36), type = mbi.readUInt32LE(40);
    if (state === 0x1000 && type === 0x20000 && (prot === 0x04 || prot === 0x40)) out.push([base, size]);
    a = base + size;
  }
  return out;
}
const cmd = process.argv[2];
const CH = 0x400000;
const t0 = Date.now();
const idxFile = path.join(DIR, 'layout.json');

if (cmd === 'snap') {
  const label = process.argv[3];
  const h = OpenProcess(0x0410, 0, native.findFmPid());
  let idx;
  if (fs.existsSync(idxFile)) idx = JSON.parse(fs.readFileSync(idxFile));
  else {
    idx = []; let pos = 0;
    for (const [base, size] of regions(h)) for (let off = 0n; off < size; off += BigInt(CH)) {
      const len = Number(size - off < BigInt(CH) ? size - off : BigInt(CH)); idx.push([(base + off).toString(), pos, len]); pos += len;
    }
    fs.writeFileSync(idxFile, JSON.stringify(idx));
  }
  const fd = fs.openSync(path.join(DIR, label + '.bin'), 'w');
  const buf = Buffer.alloc(CH), got = [0]; let bad = 0;
  for (const [b, pos, len] of idx) {
    if (!RPM(h, BigInt(b), buf, len, got)) { buf.fill(0xCD, 0, len); bad++; }
    fs.writeSync(fd, buf, 0, len, pos);
  }
  fs.closeSync(fd); CloseHandle(h);
  console.log(`snap ${label}: ${idx.length} chunks, ${bad} unreadable, ${Date.now() - t0} ms`);
} else if (cmd === 'cmp') {
  const labels = process.argv.slice(3);
  const cls = labels.map(l => l.replace(/\d+$/, ''));
  const idx = JSON.parse(fs.readFileSync(idxFile));
  const fds = labels.map(l => fs.openSync(path.join(DIR, l + '.bin'), 'r'));
  const bufs = labels.map(() => Buffer.alloc(CH));
  const out = []; let changedChunks = 0;
  for (const [b, pos, len] of idx) {
    labels.forEach((l, i) => fs.readSync(fds[i], bufs[i], 0, len, pos));
    if (bufs.every((x, i) => i === 0 || bufs[0].compare(x, 0, len, 0, len) === 0)) continue;
    changedChunks++;
    for (let o = 0; o < len; o++) {
      const v0 = bufs[0][o];
      let diff = false; for (let i = 1; i < bufs.length; i++) if (bufs[i][o] !== v0) { diff = true; break; }
      if (!diff) continue;
      let ok = true; const vals = {};
      for (let i = 0; i < bufs.length && ok; i++) {
        const v = bufs[i][o], c = cls[i];
        if (v === 0xCD) { ok = false; break; }
        if (c in vals) { if (vals[c] !== v) ok = false; }
        else { for (const k in vals) if (vals[k] === v) { ok = false; break; } vals[c] = v; }
      }
      if (ok) out.push([(BigInt(b) + BigInt(o)).toString(16), labels.map((l, i) => bufs[i][o])]);
    }
    if (out.length > 200000) break;
  }
  fds.forEach(fs.closeSync);
  fs.writeFileSync(path.join(DIR, 'result.json'), JSON.stringify({ labels, out }));
  console.log(`cmp ${labels.join(' ')}: ${out.length} candidates (changed chunks ${changedChunks}), ${Date.now() - t0} ms`);
} else if (cmd === 'show') {
  const { t, describe } = require('./peek.js');
  const st = JSON.parse(fs.readFileSync(path.join(DIR, 'result.json')));
  const n = +(process.argv[3] || 60);
  console.log('labels', st.labels.join(' '), 'count', st.out.length);
  for (const [a, vals] of st.out.slice(0, n)) {
    const A = BigInt('0x' + a);
    let owner = '';
    try {
      const back = t.read((A & ~7n) - 0x800n, 0x808);
      for (let o = 0x800; o >= 0; o -= 8) { const d = describe(back.readBigUInt64LE(o)); if (d.startsWith('VT ')) { owner = `${d.slice(3)} +0x${(0x800 - o + Number(A & 7n)).toString(16)}`; break; } }
    } catch (e) {}
    console.log('0x' + a, vals.join(','), owner);
  }
  t.close();
}
