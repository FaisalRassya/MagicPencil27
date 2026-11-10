// MagicPencil27 - native backend (no Frida, no injection).
//
// Reads/writes fm.exe memory from outside the process with the Win32 APIs
// OpenProcess / ReadProcessMemory / WriteProcessMemory (the same approach
// standalone editors like FMLE use). The editor logic in agent.js and
// agent_entities.js was written against Frida's NativePointer API; this file
// provides a small compatible shim (ptr(), .add(), .readU16(), ...) so that
// exact, already-verified logic runs unchanged in plain Node.
//
// Reads go through a block cache (1 KB blocks, cleared at the start of every
// API call and on every write) so scanning 70k players is a few hundred
// thousand cheap copies instead of millions of syscalls.

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const koffi = require('koffi');

const k32 = koffi.load('kernel32.dll');
const psapi = koffi.load('psapi.dll');

const OpenProcess = k32.func('void * __stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)');
const CloseHandle = k32.func('int __stdcall CloseHandle(void *h)');
const GetExitCodeProcess = k32.func('int __stdcall GetExitCodeProcess(void *h, _Out_ uint32_t *code)');
const ReadProcessMemory = k32.func('int __stdcall ReadProcessMemory(void *h, uint64_t addr, void *buf, uintptr_t size, void *outRead)');
const WriteProcessMemory = k32.func('int __stdcall WriteProcessMemory(void *h, uint64_t addr, void *buf, uintptr_t size, void *outWritten)');
const GetLastError = k32.func('uint32_t __stdcall GetLastError()');
const VirtualQueryEx = k32.func('uintptr_t __stdcall VirtualQueryEx(void *h, uint64_t addr, void *mbi, uintptr_t len)');
const EnumProcessModulesEx = psapi.func('int __stdcall EnumProcessModulesEx(void *h, void *mods, uint32_t cb, _Out_ uint32_t *needed, uint32_t filter)');
const GetModuleBaseNameW = psapi.func('uint32_t __stdcall GetModuleBaseNameW(void *h, uint64_t mod, void *buf, uint32_t size)');
const GetModuleInformation = psapi.func('int __stdcall GetModuleInformation(void *h, uint64_t mod, void *info, uint32_t cb)');

const PROCESS_VM_READ = 0x0010, PROCESS_VM_WRITE = 0x0020, PROCESS_VM_OPERATION = 0x0008;
const PROCESS_QUERY_INFORMATION = 0x0400, STILL_ACTIVE = 259;
const MASK64 = (1n << 64n) - 1n;
const BLOCK = 1024n;
const MAX_CACHED_BLOCKS = 60000; // ~60 MB

// FM_PROCESS_NAME lets tests point the editor at a dummy process name.
function findFmPid() {
  const name = process.env.FM_PROCESS_NAME || 'fm.exe';
  let out = '';
  try {
    out = execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq ' + name, '/FO', 'CSV', '/NH'],
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { return null; }
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = out.match(new RegExp('^"' + esc + '","(\\d+)"', 'im'));
  return m ? Number(m[1]) : null;
}

class Target {
  constructor(pid) {
    this.pid = pid;
    this.h = OpenProcess(PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_VM_OPERATION | PROCESS_QUERY_INFORMATION, 0, pid);
    if (!this.h) {
      const err = GetLastError();
      throw new Error(err === 5
        ? 'Access denied opening fm.exe. If FM runs as Administrator, run the editor as Administrator too.'
        : 'OpenProcess failed (error ' + err + ')');
    }
    this.cache = new Map();
    this.modules = null;
  }
  close() { if (this.h) { CloseHandle(this.h); this.h = null; } }
  // Find every 8-byte-aligned occurrence of `value` in committed private RW memory
  // (used to find objects by vtable, e.g. youth candidates outside the player list).
  scanQword(value, max) {
    max = max || 200000;
    const want = BigInt.asUintN(64, value), lo = Number(want & 0xffffffffn);
    const out = [], mbi = Buffer.alloc(48), CH = 0x400000, buf = Buffer.alloc(CH), got = Buffer.alloc(8);
    let a = 0n;
    while (a < 0x7fffffff0000n && out.length < max) {
      if (!VirtualQueryEx(this.h, a, mbi, 48)) break;
      const base = mbi.readBigUInt64LE(0), size = mbi.readBigUInt64LE(24);
      const ok = mbi.readUInt32LE(32) === 0x1000 && mbi.readUInt32LE(40) === 0x20000 && mbi.readUInt32LE(36) === 0x04;
      if (ok) {
        for (let off = 0n; off < size && out.length < max; off += BigInt(CH)) {
          const len = Number(size - off < BigInt(CH) ? size - off : BigInt(CH));
          if (!ReadProcessMemory(this.h, base + off, buf, len, got)) continue;
          for (let i = 0; i + 8 <= len; i += 8) {
            if (buf.readUInt32LE(i) !== lo) continue;
            if (buf.readBigUInt64LE(i) === want) out.push(base + off + BigInt(i));
          }
        }
      }
      a = base + size;
    }
    return out;
  }
  alive() {
    if (!this.h) return false;
    const code = [0];
    return GetExitCodeProcess(this.h, code) !== 0 && code[0] === STILL_ACTIVE;
  }
  clearCache() { this.cache.clear(); }

  block(b) {
    let buf = this.cache.get(b);
    if (buf === undefined) {
      buf = Buffer.alloc(Number(BLOCK));
      if (!ReadProcessMemory(this.h, b, buf, buf.length, null)) buf = null;
      if (this.cache.size >= MAX_CACHED_BLOCKS) this.cache.clear();
      this.cache.set(b, buf);
    }
    if (buf === null) throw new Error('access violation reading 0x' + b.toString(16));
    return buf;
  }
  read(addr, size) {
    const out = Buffer.alloc(size);
    let a = addr, done = 0;
    while (done < size) {
      const b = a - (a % BLOCK);
      const off = Number(a - b);
      const n = Math.min(size - done, Number(BLOCK) - off);
      this.block(b).copy(out, done, off, off + n);
      done += n; a += BigInt(n);
    }
    return out;
  }
  write(addr, buf) {
    if (!WriteProcessMemory(this.h, addr, buf, buf.length, null)) {
      throw new Error('WriteProcessMemory failed at 0x' + addr.toString(16) + ' (error ' + GetLastError() + ')');
    }
    this.cache.clear();
  }
  module(name) {
    if (!this.modules) {
      const mods = Buffer.alloc(8 * 2048), needed = [0];
      if (!EnumProcessModulesEx(this.h, mods, mods.length, needed, 3)) throw new Error('EnumProcessModulesEx failed (' + GetLastError() + ')');
      const n = Math.min(needed[0], mods.length) / 8;
      this.modules = [];
      for (let i = 0; i < n; i++) {
        const hm = mods.readBigUInt64LE(i * 8);
        const nameBuf = Buffer.alloc(520);
        const len = GetModuleBaseNameW(this.h, hm, nameBuf, 260);
        const info = Buffer.alloc(24);
        if (!GetModuleInformation(this.h, hm, info, 24)) continue;
        this.modules.push({ name: nameBuf.toString('utf16le', 0, len * 2), base: info.readBigUInt64LE(0), size: info.readUInt32LE(8) });
      }
    }
    const m = this.modules.find(x => x.name.toLowerCase() === name.toLowerCase());
    return m || null;
  }
}

// ---- Frida-compatible NativePointer shim ---------------------------------
function makeRuntime(target) {
  const toBig = (x) => {
    if (x instanceof NP) return x.a;
    if (typeof x === 'bigint') return x;
    if (typeof x === 'string') return BigInt(x);
    return BigInt(Math.trunc(x));
  };
  class NP {
    constructor(a) { this.a = BigInt.asUintN(64, a); }
    add(x) { return new NP((this.a + toBig(x)) & MASK64); }
    sub(x) { return new NP((this.a - toBig(x)) & MASK64); }
    isNull() { return this.a === 0n; }
    equals(o) { return o != null && this.a === toBig(o); }
    compare(o) { const b = toBig(o); return this.a < b ? -1 : this.a > b ? 1 : 0; }
    toInt32() { return Number(BigInt.asIntN(32, this.a)); }
    toNumber() { return Number(this.a); }
    toString() { return '0x' + this.a.toString(16); }
    toJSON() { return this.toString(); }
    readPointer() { return new NP(target.read(this.a, 8).readBigUInt64LE(0)); }
    readU8() { return target.read(this.a, 1)[0]; }
    readU16() { return target.read(this.a, 2).readUInt16LE(0); }
    readS16() { return target.read(this.a, 2).readInt16LE(0); }
    readU32() { return target.read(this.a, 4).readUInt32LE(0); }
    readS32() { return target.read(this.a, 4).readInt32LE(0); }
    readU64() { return target.read(this.a, 8).readBigUInt64LE(0); }
    readUtf8String(len) {
      if (len === undefined || len < 0) return this.readCString(1024, 'utf8');
      return target.read(this.a, len).toString('utf8');
    }
    readCString(max, enc) {
      max = max || 512;
      const parts = [];
      for (let i = 0; i < max; i += 64) {
        let chunk;
        try { chunk = target.read(this.a + BigInt(i), 64); } catch (e) { if (!parts.length) throw e; break; }
        const z = chunk.indexOf(0);
        if (z >= 0) { parts.push(chunk.subarray(0, z)); break; }
        parts.push(chunk);
      }
      return Buffer.concat(parts).toString(enc || 'latin1');
    }
    writeU8(v) { const b = Buffer.alloc(1); b.writeUInt8(v & 0xFF); target.write(this.a, b); return this; }
    writeU16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v & 0xFFFF); target.write(this.a, b); return this; }
    writeU32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); target.write(this.a, b); return this; }
    writeS32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v | 0); target.write(this.a, b); return this; }
    writePointer(p) { const b = Buffer.alloc(8); b.writeBigUInt64LE(toBig(p)); target.write(this.a, b); return this; }
  }
  const ptr = (x) => new NP(toBig(x));
  const Process = {
    scanHeapQword(value, max) { return target.scanQword(toBig(value), max).map(x => new NP(x)); },
    getModuleByName(name) {
      const m = target.module(name);
      if (!m) throw new Error(name + ' is not loaded in fm.exe yet');
      return { name: m.name, base: new NP(m.base), size: m.size };
    },
  };
  return { NP, ptr, Process };
}

// Load agent.js + agent_entities.js against the shim and return an API whose
// methods behave like Frida's script.exports (they return Promises).
function attach(pid) {
  const target = new Target(pid);
  const rt = makeRuntime(target);
  const src = ['agent.js', 'agent_entities.js', 'agent_medical.js', 'agent_extra.js', 'agent_extra2.js', 'agent_scout.js']
    .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
  const rpc = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('ptr', 'Process', 'rpc', 'NativePointer', src)(rt.ptr, rt.Process, rpc, rt.NP);
  const api = {};
  for (const name of Object.keys(rpc.exports)) {
    api[name] = async (...args) => {
      if (!target.alive()) throw new Error('fm.exe has exited');
      target.clearCache();
      return JSON.parse(JSON.stringify(rpc.exports[name].apply(rpc.exports, args)));
    };
  }
  api.__close = () => target.close();
  api.__backend = 'native';
  return api;
}

module.exports = { findFmPid, attach, makeRuntime, Target };
