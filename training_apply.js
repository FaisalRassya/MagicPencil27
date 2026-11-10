// training_apply.js — import a planned training schedule into FM27 through the in-game hook.
// The only per-save value is the "objTo" reference of the team-training handler (Team id, human manager id,
// game guid). It is learned from any training-card click the user makes in FM while the hook is loaded
// (EVENT lines are always logged), or from a saved recording.
const fs = require('fs'), path = require('path'), os = require('os');
const hookctl = require('./hookctl');
const build = require('./hook/training_builder.js');
const DATA = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'MagicPencil27');
const REC = path.join(DATA, 'recordings');
const TPL = path.join(DATA, 'training_template.json');
const TRAIN_EVENTS = new Set([build.EV.begin, build.EV.select, build.EV.confirm, 4108082471, build.EV.commit].map(String));

function saveRecording(r) {
  fs.mkdirSync(REC, { recursive: true });
  const f = path.join(REC, `rec_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(f, JSON.stringify({ ...r, at: new Date().toISOString() }, null, 1));
  learnFromLines(r.lines || []);
  return f;
}
function refFromLines(lines) {
  let ref = null;
  for (const l of lines) { const m = l.match(/ EVENT id=(\d+) to\[\d+\]=(\w+) /); if (m && TRAIN_EVENTS.has(m[1]) && /6d616554/i.test(m[2])) ref = m[2]; } // must contain the "Team" pair (LE)
  return ref;
}
function learnFromLines(lines) {
  const ref = refFromLines(lines);
  if (!ref) return null;
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(TPL, JSON.stringify({ version: 1, ref, learnedAt: new Date().toISOString() }, null, 1));
  return ref;
}
function loadTemplate() {
  // refresh from the live hook log first (user may have loaded another save)
  try { learnFromLines(hookctl.tail(4000, / EVENT /)); } catch (e) {}
  try { return JSON.parse(fs.readFileSync(TPL, 'utf8')); } catch (e) { return null; }
}
function templateInfo() { const t = loadTemplate(); return t ? { ready: true, version: t.version, sessions: Object.keys(build.SESSION_IDS).length, learnedAt: t.learnedAt } : { ready: false }; }

// plan: { days: [{ date: 'YYYY-MM-DD', slots: ['Passing Style', 'Rest', 'Corners'] }] }
async function apply(plan) {
  const t = loadTemplate();
  if (!t) throw new Error('Editor belum kenal tim kamu di FM. Di FM buka Training > Overview, klik satu sesi lalu Cancel, kemudian coba lagi.');
  const { cmds, skipped } = build(t, plan);
  if (!cmds.length) throw new Error('Tidak ada sesi yang bisa dipasang' + (skipped.length ? ` (tidak dikenal: ${skipped.join(', ')})` : ''));
  const out = [];
  for (let i = 0; i < cmds.length; i += 48) out.push(await hookctl.run(cmds.slice(i, i + 48), 30000));
  return { ok: true, slots: cmds.length / 4, sent: cmds.length, skipped, log: out.flatMap(o => o.log).slice(-3) };
}
module.exports = { saveRecording, templateInfo, apply, REC, TPL };
