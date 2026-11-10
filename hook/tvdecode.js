// tvdecode.js — decode/encode FM27 interop payloads (SI RecordSerialisation, little endian)
// TypedValue: [u8 flag][u8 type][payload]; Record (type 10): u32 count, count x (u32 key, TypedValue)
// types: 0 null, 1 i32, 2 u32, 3 bool, 5 f64, 10 record, 11 list, 13 u32 packed, 14/26 string, 15 i64,
//        17 i8, 18 i16, 19 i8->long, 20 i16->long, 21 i32->long, 24 u64, 25 f32
const fourcc = (k) => { const s = Buffer.alloc(4); s.writeUInt32BE(k >>> 0); const t = s.toString('latin1'); return /^[\x20-\x7e]{4}$/.test(t) ? t : '0x' + (k >>> 0).toString(16); };
function decodeTV(b, o) {
  const flag = b[o], type = b[o + 1]; o += 2;
  let v;
  switch (type) {
    case 0: v = null; break;
    case 1: v = b.readInt32LE(o); o += 4; break;
    case 2: case 13: v = b.readUInt32LE(o); o += 4; break;
    case 3: v = !!b[o]; o += 1; break;
    case 5: v = b.readDoubleLE(o); o += 8; break;
    case 10: { const r = decodeRecord(b, o); v = r.v; o = r.o; break; }
    case 11: { const n = b.readUInt32LE(o); o += 4; v = []; for (let i = 0; i < n; i++) { const r = decodeTV(b, o); v.push(r.v); o = r.o; } break; }
    case 14: case 26: { const n = b.readUInt32LE(o); o += 4; v = b.toString('utf8', o, o + n); o += n; break; }
    case 15: case 24: v = b.readBigUInt64LE(o).toString(); o += 8; break;
    case 17: case 19: v = b.readInt8(o); o += 1; break;
    case 18: case 20: v = b.readInt16LE(o); o += 2; break;
    case 21: v = b.readInt32LE(o); o += 4; break;
    case 25: v = b.readFloatLE(o); o += 4; break;
    case 32: { const p = b.readUInt32LE(o); o += 4; v = { packed: p, year: p >>> 17, doy: (p >>> 8) & 0x1ff, slot: p & 0xff }; break; } // GameDate
    case 34: { let n = 0, sh = 0; for (;;) { const x = b[o++]; n |= (x & 0x7f) << sh; sh += 7; if (!(x & 0x80)) break; } v = []; for (let i = 0; i < n; i++, o += 8) v.push([fourcc(b.readUInt32LE(o)), b.readInt32LE(o + 4)]); break; } // InteropReference
    default: throw new Error(`unknown type ${type} at ${o - 2}`);
  }
  return { v: { t: type, f: flag, v }, o };
}
function decodeRecord(b, o) {
  const n = b.readUInt32LE(o); o += 4; const v = {};
  for (let i = 0; i < n; i++) { const k = b.readUInt32LE(o); o += 4; const r = decodeTV(b, o); v[fourcc(k)] = r.v; o = r.o; }
  return { v, o };
}
function decodeData(hex) {
  const b = Buffer.from(hex, 'hex'); if (!b.length) return null;
  try { const r = decodeTV(b, 0); return r.o === b.length ? r.v : { partial: r.v, rest: b.slice(r.o).toString('hex') }; }
  catch (e) { return { error: e.message, hex }; }
}
function decodeRef(hex) { // InteropReference.Pack: 7-bit varint count + (u32 id, i32 value)*
  const b = Buffer.from(hex, 'hex'); if (!b.length) return null;
  let n = 0, sh = 0, o = 0; for (;;) { const x = b[o++]; n |= (x & 0x7f) << sh; sh += 7; if (!(x & 0x80)) break; }
  const out = [];
  for (let i = 0; i < n && o + 8 <= b.length; i++, o += 8) out.push([fourcc(b.readUInt32LE(o)), b.readInt32LE(o + 4)]);
  return o === b.length ? out : { pairs: out, raw: hex };
}
// ---- encoder (inverse) ----
function encTV(x) {
  const parts = [Buffer.from([x.f ?? 1, x.t])];
  const p = (n, w) => { const b = Buffer.alloc(n); w(b); parts.push(b); };
  switch (x.t) {
    case 0: break;
    case 1: case 21: p(4, b => b.writeInt32LE(x.v)); break;
    case 2: case 13: p(4, b => b.writeUInt32LE(x.v >>> 0)); break;
    case 3: p(1, b => { b[0] = x.v ? 1 : 0; }); break;
    case 5: p(8, b => b.writeDoubleLE(x.v)); break;
    case 10: parts.push(encRecord(x.v)); break;
    case 11: p(4, b => b.writeUInt32LE(x.v.length)); for (const e of x.v) parts.push(encTV(e)); break;
    case 14: case 26: { const s = Buffer.from(x.v, 'utf8'); p(4, b => b.writeUInt32LE(s.length)); parts.push(s); break; }
    case 15: case 24: p(8, b => b.writeBigUInt64LE(BigInt(x.v))); break;
    case 17: case 19: p(1, b => b.writeInt8(x.v)); break;
    case 18: case 20: p(2, b => b.writeInt16LE(x.v)); break;
    case 25: p(4, b => b.writeFloatLE(x.v)); break;
    case 32: p(4, b => b.writeUInt32LE(typeof x.v === 'object' ? (((x.v.year << 17) | (x.v.doy << 8) | (x.v.slot || 0)) >>> 0) : x.v >>> 0)); break;
    case 34: parts.push(encRef(x.v)); break;
    default: throw new Error('cannot encode type ' + x.t);
  }
  return Buffer.concat(parts);
}
function encRecord(obj) {
  const keys = Object.keys(obj); const parts = [Buffer.alloc(4)]; parts[0].writeUInt32LE(keys.length);
  for (const k of keys) { const kb = Buffer.alloc(4); kb.writeUInt32LE(k.startsWith('0x') ? parseInt(k, 16) : Buffer.from(k, 'latin1').readUInt32BE(0)); parts.push(kb, encTV(obj[k])); }
  return Buffer.concat(parts);
}
function encRef(pairs) {
  const head = []; let n = pairs.length; do { let x = n & 0x7f; n >>>= 7; if (n) x |= 0x80; head.push(x); } while (n);
  const b = Buffer.alloc(pairs.length * 8);
  pairs.forEach(([k, v], i) => { b.writeUInt32LE(typeof k === 'string' && !k.startsWith('0x') ? Buffer.from(k, 'latin1').readUInt32BE(0) : Number(k) >>> 0, i * 8); b.writeInt32LE(v, 4 + i * 8); });
  return Buffer.concat([Buffer.from(head), b]);
}
function gameDate(iso) { const [y, m, d] = iso.split('-').map(Number); const doy = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1; return { year: y, doy, slot: 0 }; }
module.exports = { gameDate, decodeData, decodeRef, encTV, encRecord, encRef, fourcc };
if (require.main === module) {
  // decode fmhook.log EVENT lines: node tvdecode.js <log> [n]
  const fs = require('fs');
  const lines = fs.readFileSync(process.argv[2], 'latin1').split('\n').filter(l => / EVENT /.test(l)).slice(-(+process.argv[3] || 50));
  for (const l of lines) {
    const m = l.match(/^(\S+) EVENT id=(\d+) to\[\d+\]=(\w*) data\[\d+\]=(\w*)/); if (!m) continue;
    console.log(m[1], 'id', m[2], fourcc(+m[2]), 'to', JSON.stringify(decodeRef(m[3])), 'data', JSON.stringify(decodeData(m[4])));
  }
}
