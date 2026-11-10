// Add players to the user's FM shortlist through the in-game hook.
// Replays FM's own "Add to Shortlist" action (ActionID PersonAddPlayersToShortlist,
// interop event 44). Player reference = 0x01000000 | database id (u32 at player+0x290).
//
// The payload also carries save-specific references (manager, panel GUID), so it is
// learned once per save: the user adds any player to a shortlist by hand in FM while
// the editor's hook is loaded, and the recorded event becomes the template.
const fs = require('fs');
const path = require('path');
const hookctl = require('./hookctl');

const ACID_ADD = '6469636165586a41'; // 'acid' + 1097488485 (LE) at the end of the event ref
const TPL_FILE = path.join(process.env.LOCALAPPDATA || '.', 'MagicPencil27', 'shortlist_template.json');
const EV_RE = /EVENT id=44 to\[\d+\]=([0-9a-f]+) data\[\d+\]=([0-9a-f]+)/g;

// The player reference appears twice ('dref' and 'dreL' records): "66657264 01 01 <u32 LE>".
function makeTemplate(ref, data) {
  const counts = new Map();
  const re = /666572640101([0-9a-f]{8})/g; let m;
  while ((m = re.exec(data))) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  const player = [...counts.entries()].find(([v, n]) => n === 2 && v.endsWith('01'));
  if (!player) return null;
  return { ref, data: data.split('666572640101' + player[0]).join('666572640101{P}'), learnedAt: new Date().toISOString() };
}

function findInText(text) {
  let m, last = null;
  EV_RE.lastIndex = 0;
  while ((m = EV_RE.exec(text))) if (m[1].endsWith(ACID_ADD)) last = m;
  return last ? makeTemplate(last[1], last[2]) : null;
}

function learn() {
  // 1) live hook log  2) saved recordings
  let t = null;
  try { t = findInText(hookctl.tail(5000, / EVENT id=44 /).join('\n')); } catch (e) {}
  if (!t) {
    try {
      const dir = path.join(path.dirname(TPL_FILE), 'recordings');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      for (const f of files) { t = findInText(fs.readFileSync(f, 'utf8')); if (t) break; }
    } catch (e) {}
  }
  if (t) { fs.mkdirSync(path.dirname(TPL_FILE), { recursive: true }); fs.writeFileSync(TPL_FILE, JSON.stringify(t, null, 2)); }
  return t;
}

function template() {
  const fresh = learn();
  if (fresh) return fresh;
  try { return JSON.parse(fs.readFileSync(TPL_FILE, 'utf8')); } catch (e) { return null; }
}

async function add(dbIds) {
  await hookctl.ensure();
  const t = template();
  if (!t) {
    try { await hookctl.run(['log on'], 5000); } catch (e) {}
    throw new Error('Editor belum kenal shortlist di save ini. Di FM, klik "Add to Shortlist" pada satu pemain secara manual (editor tetap terbuka), lalu coba lagi.');
  }
  const cmds = dbIds.map(id => {
    const b = Buffer.alloc(4); b.writeUInt32LE((0x01000000 | id) >>> 0);
    return `send 44 ${t.ref} ${t.data.split('{P}').join(b.toString('hex'))}`;
  });
  const r = await hookctl.run(cmds, 20000);
  return { ok: true, sent: cmds.length, log: r.log };
}

module.exports = { add, learn };
