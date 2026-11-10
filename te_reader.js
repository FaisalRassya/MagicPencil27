// te_reader.js — read FM27 Training > Tactical Effectiveness through the in-game hook.
// FM sends a tree of nodes {"100 ": factor id, ix34: {MinV, MaxV}, Rzva/NmgP: children}; values 0-100.
// Factor ids mapped against the user's screen (Game Pass 0.9.2409, Wycombe save, 21 Mar 2027).
const fs = require('fs'), path = require('path'), os = require('os');
const hookctl = require('./hookctl');
const t = require('./hook/tvdecode.js');
const DATA = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'MagicPencil27');
const OUT = path.join(DATA, 'tactical_effectiveness.json');

const AREAS = { 16: 'In Possession Shape', 13: 'Passing Style', 14: 'Build Up', 15: 'Chance Creation', 20: 'Out Of Possession Shape', 17: 'Line of Engagement', 18: 'Pressing Intensity', 19: 'Pressing Trap' };
const FACTORS = {
  1: 'Player Capability', 2: 'Player Role Suitability',
  3: 'Coaching Support', 7: 'Teammates and Staff Relationships', 10: 'Head Coach Tendencies',
  11: 'Quality of Next Opposition Report', 12: 'Opposition Player Knowledge',
  21: 'Training Contribution', 22: 'Match Exposure', 23: 'Player Tactical Ability', 24: 'Tactical Complexity',
};

function collect(node, out) {
  if (!node) return;
  if (node.t === 11) { for (const e of node.v) collect(e, out); return; }
  if (node.t !== 10) return;
  const v = node.v;
  if (v['100 '] && v.ix34) {
    const id = v['100 '].v, val = v.ix34.v.MinV.v, kids = {};
    for (const k of ['Rzva', 'NmgP']) if (v[k] && v[k].t === 11) for (const c of v[k].v) if (c.t === 10 && c.v['100 '] && c.v.ix34) kids[c.v['100 '].v] = c.v.ix34.v.MinV.v;
    out.push({ id, val, kids });
  }
  for (const k in v) if (v[k] && (v[k].t === 10 || v[k].t === 11)) collect(v[k], out);
}
function parse(lines) {
  let areas = null; const fac = {}; const feedback = [];
  for (const l of lines) {
    const m = l.match(/ (?:UPDATE|RESP) .*=(\w+)$/); if (!m) continue;
    const hex = m[1].replace(/\.+$/, '');
    if (hex.includes('7400650078007400') || /74786574/.test(hex)) { // "text" key
      const d = t.decodeData(hex); const tx = d && d.v && d.v.text && d.v.text.v;
      if (typeof tx === 'string' && /training|tactic|players|pressing|opposition/i.test(tx) && !feedback.includes(tx)) feedback.push(tx);
    }
    if (!hex.includes('34337869')) continue; // "ix34"
    const d = t.decodeData(hex); if (!d || d.error || d.partial) continue;
    const nodes = []; collect(d, nodes);
    const a = nodes.filter(n => AREAS[n.id]);
    if (a.length >= 8) { // full tactical-areas block: keep the latest (= tactic currently shown)
      feedback.length = 0; areas = {}; for (const n of a) areas[AREAS[n.id]] = { value: n.val, training: n.kids[21], matches: n.kids[22], ability: n.kids[23], complexity: n.kids[24] };
    }
    for (const n of nodes) if (FACTORS[n.id] && ![21, 22, 23, 24].includes(n.id)) fac[FACTORS[n.id]] = n.val;
  }
  if (!areas) return null;
  const vals = Object.values(areas).map(x => x.value);
  return { areas, factors: fac, understanding: Math.round(vals.reduce((s, x) => s + x, 0) / vals.length), feedback: feedback.slice(-6), readAt: new Date().toISOString() };
}

let cap = null;
async function start() {
  const st = await hookctl.ensure();
  await hookctl.run(['resp all']);
  cap = { dir: st.dir, from: fs.statSync(path.join(st.dir, 'fmhook.log')).size, t0: Date.now(), seen: 0 };
  return { ok: true };
}
async function stop() { cap = null; try { await hookctl.run(['resp off']); } catch (e) {} }
async function poll() {
  if (!cap) return { capturing: false, data: current() };
  const p = path.join(cap.dir, 'fmhook.log'); const fd = fs.openSync(p, 'r'); const size = fs.fstatSync(fd).size;
  const b = Buffer.alloc(size - cap.from); fs.readSync(fd, b, 0, b.length, cap.from); fs.closeSync(fd);
  const r = parse(b.toString('latin1').split('\n'));
  if (r) { // wait ~2 s after the first full block so a tactic-tab click can still land
    if (!cap.seen) cap.seen = Date.now();
    if (Date.now() - cap.seen > 2000) { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(r, null, 1)); await stop(); return { capturing: false, done: true, data: r }; }
  }
  if (Date.now() - cap.t0 > 120000) { await stop(); return { capturing: false, timeout: true }; }
  return { capturing: true };
}
function current() { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return null; } }
module.exports = { start, stop, poll, current, parse, AREAS, FACTORS };
if (require.main === module) console.log(JSON.stringify(parse(fs.readFileSync(process.argv[2], 'latin1').split('\n')), null, 1));
