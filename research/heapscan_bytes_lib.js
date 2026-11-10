const koffi = require('koffi');
const native = require(require('path').join(__dirname, '..', 'native.js'));
const k32 = koffi.load('kernel32.dll');
const OpenProcess = k32.func('void* __stdcall OpenProcess(uint32, int, uint32)');
const CloseHandle = k32.func('int __stdcall CloseHandle(void*)');
const VirtualQueryEx = k32.func('size_t __stdcall VirtualQueryEx(void*, uint64, _Out_ uint8_t*, size_t)');
const RPM = k32.func('int __stdcall ReadProcessMemory(void*, uint64, _Out_ uint8_t*, size_t, _Out_ size_t*)');
module.exports = function scan(pat, stride, max) {
  const h = OpenProcess(0x0410, 0, native.findFmPid());
  const out = []; let a = 0n; const mbi = Buffer.alloc(48); const CH = 0x400000; const buf = Buffer.alloc(CH + 4096); const got = [0];
  const span = (pat.length - 1) * stride + 1;
  while (a < 0x7fffffff0000n && out.length < max) {
    if (!VirtualQueryEx(h, a, mbi, 48)) break;
    const base = mbi.readBigUInt64LE(0), size = mbi.readBigUInt64LE(24), state = mbi.readUInt32LE(32), prot = mbi.readUInt32LE(36), type = mbi.readUInt32LE(40);
    if (state === 0x1000 && type === 0x20000 && (prot === 0x04 || prot === 0x40)) {
      for (let off = 0n; off < size; off += BigInt(CH)) {
        const len = Number(size - off < BigInt(CH + 4096) ? size - off : BigInt(CH + 4096));
        if (!RPM(h, base + off, buf, len, got)) continue;
        const lim = Math.min(len, CH) ;
        for (let i = 0; i < lim && i + span <= len; i++) {
          if (buf[i] !== pat[0]) continue;
          let ok = true; for (let k = 1; k < pat.length; k++) if (buf[i + k * stride] !== pat[k]) { ok = false; break; }
          if (ok) { out.push(base + off + BigInt(i)); if (out.length >= max) break; }
        }
      }
    }
    a = base + size;
  }
  CloseHandle(h); return out;
};
