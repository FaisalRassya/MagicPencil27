// FM27 Memory Editor - local web server
// Default backend: native (ReadProcessMemory/WriteProcessMemory, no injection).
// Set FM_BACKEND=frida to use the old Frida-injected agent instead.

const path = require('path');
const fs = require('fs');
const express = require('express');

const BACKEND = (process.env.FM_BACKEND || 'native').toLowerCase();
const AGENT_PATH = path.join(__dirname, 'agent.js');
const PORT = Number(process.env.FM_EDITOR_PORT || 4727);

let api = null;
let session = null;
let attachedPid = null;
let dataLoaded = false;
let lastSaveInfo = null;

function resetState() {
  if (api && api.__close) { try { api.__close(); } catch (e) {} }
  api = null; session = null; attachedPid = null; dataLoaded = false; lastSaveInfo = null;
}

async function ensureAttachedNative() {
  const native = require('./native');
  const pid = native.findFmPid();
  if (!pid) { resetState(); throw new Error('fm.exe is not running. Start Football Manager 27 and load a save.'); }
  if (api && attachedPid === pid) {
    try { await api.ping(); return api; } catch (e) { /* re-open below */ }
  }
  resetState();
  api = native.attach(pid);
  attachedPid = pid;
  await api.ping();
  return api;
}

async function ensureAttachedFrida() {
  const frida = require('frida');
  const device = await frida.getLocalDevice();
  const processes = await device.enumerateProcesses();
  const p = processes.find(p => p.name.toLowerCase() === 'fm.exe');
  const pid = p ? p.pid : null;
  if (!pid) { resetState(); throw new Error('fm.exe is not running. Start Football Manager 27 and load a save.'); }
  if (api && attachedPid === pid) {
    try { await api.ping(); return api; } catch (e) { /* stale session, reattach below */ }
  }
  if (session) { try { await session.detach(); } catch (e) {} }
  session = await device.attach(pid);
  const source = ['agent.js', 'agent_entities.js', 'agent_medical.js', 'agent_extra.js', 'agent_extra2.js', 'agent_scout.js']
    .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
  const script = await session.createScript(source);
  await script.load();
  api = script.exports;
  attachedPid = pid;
  dataLoaded = false;
  lastSaveInfo = null;
  await api.ping();
  return api;
}

function ensureAttached() {
  return BACKEND === 'frida' ? ensureAttachedFrida() : ensureAttachedNative();
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', async (req, res) => {
  try {
    const a = await ensureAttached();
    const info = await a.ping();
    res.json({ connected: true, pid: attachedPid, backend: BACKEND, moduleBase: info.moduleBase, dataLoaded, saveInfo: lastSaveInfo });
  } catch (e) {
    res.json({ connected: false, error: e.message, dataLoaded: false });
  }
});

app.post('/api/load', async (req, res) => {
  try {
    // Force a fresh (re)attach so "Load Data" always reflects the currently running game/save.
    resetState();
    const a = await ensureAttached();
    const info = await a.getSaveInfo();
    dataLoaded = true;
    if (freezes.length) await relinkFreezes(a);
    lastSaveInfo = info;
    res.json({ ok: true, ...info });
  } catch (e) {
    dataLoaded = false;
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/players', async (req, res) => {
  try {
    if (!dataLoaded) return res.status(409).json({ error: 'Click "Load Data" first.' });
    const a = await ensureAttached();
    const q = (req.query.q || '').trim();
    const filters = {};
    if (req.query.caMin) filters.caMin = Number(req.query.caMin);
    if (req.query.paMin) filters.paMin = Number(req.query.paMin);
    if (req.query.ageMin) filters.ageMin = Number(req.query.ageMin);
    if (req.query.ageMax) filters.ageMax = Number(req.query.ageMax);
    const hasFilters = Object.keys(filters).length > 0;
    if (!q && !hasFilters) return res.json([]);
    let results;
    if (/^\d+$/.test(q) && !hasFilters) {
      const byUid = await a.findPlayerByUid(parseInt(q, 10));
      results = byUid ? [byUid] : [];
      if (results.length === 0) results = await a.findPlayersByName(q, 30, filters);
    } else {
      results = await a.findPlayersByName(q, 30, filters);
    }
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/players/:addr', async (req, res) => {
  try {
    const a = await ensureAttached();
    const p = await a.readPlayer(req.params.addr);
    res.json(p);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const DATE_FIELDS = ['contract.expiry', 'contract.signed'];
const BOOL_FIELDS = ['contract.transferListed', 'contract.loanListed'];
const NULLABLE_FIELDS = ['contract.squadNumber'];

function coerceValue(field, value) {
  if (DATE_FIELDS.indexOf(field) !== -1) return String(value);
  if (BOOL_FIELDS.indexOf(field) !== -1) return !!value;
  if (NULLABLE_FIELDS.indexOf(field) !== -1 && (value === '' || value === null)) return null;
  return Number(value);
}

app.post('/api/players/:addr', async (req, res) => {
  try {
    const a = await ensureAttached();
    const { field, value } = req.body;
    const result = await a.setPlayerAttribute(req.params.addr, field, coerceValue(field, value));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Names (re-point to existing name records), Best XI data ----
app.get('/api/names', async (req, res) => {
  try {
    if (!dataLoaded) return res.status(409).json({ error: 'Click "Load Data" first.' });
    const a = await ensureAttached();
    res.json(await a.searchNames(String(req.query.q || ''), Number(req.query.limit) || 30));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/players/:addr/name', async (req, res) => {
  try {
    const a = await ensureAttached();
    res.json(await a.setPlayerName(req.params.addr, req.body.which, req.body.rec));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/scout/club/:addr', async (req, res) => {
  try { const a = await ensureAttached(); res.json(await a.scoutClubInfo(req.params.addr)); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/scout/players', async (req, res) => {
  try {
    if (!dataLoaded) return res.status(409).json({ error: 'Klik "Load Data" dulu.' });
    const a = await ensureAttached(); res.json(await a.scoutPlayers(req.body || {}));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/clubs/:addr/contracts', async (req, res) => {
  try { const a = await ensureAttached(); res.json(await a.clubContracts(req.params.addr)); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/clubs/:addr/squad-detail', async (req, res) => {
  try {
    const a = await ensureAttached();
    res.json(await a.squadDetail(req.params.addr));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/youth-candidates', async (req, res) => {
  try {
    if (!dataLoaded) return res.status(409).json({ error: 'Click "Load Data" first.' });
    const a = await ensureAttached();
    res.json(await a.youthCandidates(String(req.query.club || '')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/my-clubs', async (req, res) => {
  try {
    if (!dataLoaded) return res.status(409).json({ error: 'Click "Load Data" first.' });
    const a = await ensureAttached();
    res.json(await a.myClubs());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Advanced / quick search ----
app.post('/api/search', async (req, res) => {
  try {
    if (!dataLoaded) return res.status(409).json({ error: 'Click "Load Data" first.' });
    const a = await ensureAttached();
    res.json(await a.searchPlayers(req.body.criteria || {}, req.body.limit || 100));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Attribute freeze: kept in memory + freeze.json, enforced every 3 s ----
const os = require('os');
// migrate old data folders (FM27 Live Editor -> MagicPencil27) once
try { const L = process.env.LOCALAPPDATA, A = process.env.APPDATA;
  if (L && fs.existsSync(path.join(L, 'FM27LiveEditor')) && !fs.existsSync(path.join(L, 'MagicPencil27'))) fs.cpSync(path.join(L, 'FM27LiveEditor'), path.join(L, 'MagicPencil27'), { recursive: true, filter: (p) => !/fmhookd*.dll$/i.test(p) });
  if (A && fs.existsSync(path.join(A, 'FM27 Live Editor', 'freeze.json')) && !fs.existsSync(path.join(A, 'MagicPencil27', 'freeze.json'))) { fs.mkdirSync(path.join(A, 'MagicPencil27'), { recursive: true }); fs.copyFileSync(path.join(A, 'FM27 Live Editor', 'freeze.json'), path.join(A, 'MagicPencil27', 'freeze.json')); }
} catch (e) {}
const FREEZE_FILE = path.join(process.env.APPDATA || os.homedir(), 'MagicPencil27', 'freeze.json');
let freezes = []; // [{address, uid, name, mode, values}]
try { freezes = JSON.parse(fs.readFileSync(FREEZE_FILE, 'utf8')); } catch (e) { freezes = []; }
function saveFreezes() {
  try { fs.mkdirSync(path.dirname(FREEZE_FILE), { recursive: true }); fs.writeFileSync(FREEZE_FILE, JSON.stringify(freezes, null, 1)); } catch (e) {}
}
let freezeStats = { fixed: 0, lastRun: null, lastError: null };
let freezeBusy = false;
async function relinkFreezes(a) {
  // after a save (re)load player addresses change: re-find each frozen player by UID
  for (const f of freezes) {
    try { const addr = await a.findPlayerAddrByUid(f.uid); f.address = addr || f.address; f.missing = !addr; } catch (e) {}
  }
  saveFreezes();
}
setInterval(async () => {
  if (freezeBusy || !freezes.length || !dataLoaded || !api) return;
  freezeBusy = true;
  try {
    const active = freezes.filter(f => !f.missing);
    if (active.length) {
      const r = await api.enforceFreeze(active);
      freezeStats.fixed += r.fixed;
      for (const up of r.raised) { const f = freezes.find(x => x.address === up.address); if (f) f.values[up.key] = up.value; }
      for (const m of r.missing) { const f = freezes.find(x => x.address === m); if (f) f.missing = true; }
      if (r.raised.length || r.missing.length) saveFreezes();
    }
    freezeStats.lastRun = Date.now(); freezeStats.lastError = null;
  } catch (e) { freezeStats.lastError = e.message; }
  freezeBusy = false;
}, 3000);
app.get('/api/freeze', (req, res) => res.json({ freezes: freezes.map(f => ({ address: f.address, uid: f.uid, name: f.name, mode: f.mode, missing: !!f.missing })), stats: freezeStats }));
app.post('/api/freeze', async (req, res) => {
  try {
    const a = await ensureAttached();
    const snap = await a.freezeSnapshot(req.body.address);
    freezes = freezes.filter(f => f.uid !== snap.uid);
    freezes.push({ ...snap, mode: req.body.mode === 'up' ? 'up' : 'lock' });
    saveFreezes();
    res.json({ ok: true, count: freezes.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/freeze/remove', (req, res) => {
  freezes = freezes.filter(f => f.address !== req.body.address && f.uid !== req.body.uid);
  saveFreezes();
  res.json({ ok: true, count: freezes.length });
});

// ---- Medical / instant fixes (FMRTE-style) ----
const wrap = (fn) => async (req, res) => {
  try { const a = await ensureAttached(); res.json(await fn(a, req)); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
app.get('/api/players/:addr/medical', wrap((a, req) => a.readMedical(req.params.addr)));
app.post('/api/players/:addr/heal', wrap((a, req) => a.healInjury(req.params.addr, req.body.idx ?? 'all')));
app.post('/api/players/:addr/liftban', wrap((a, req) => a.liftBan(req.params.addr, req.body.idx ?? 'all')));
app.post('/api/players/:addr/restore-injury', wrap((a, req) =>
  a.restoreInjury(req.params.addr, req.body.idx, req.body.startNum, req.body.full, req.body.light)));
app.post('/api/players/:addr/restore-ban', wrap((a, req) =>
  a.restoreBan(req.params.addr, req.body.idx, req.body.startNum, req.body.days)));
app.post('/api/clubs/:addr/fix', wrap((a, req) => a.clubFix(req.params.addr, req.body.what, req.body.value)));
app.post('/api/players-status', wrap((a, req) => a.playersStatus(req.body.addresses || [])));
app.get('/api/unavailable', wrap((a, req) => a.findUnavailable(req.query.what === 'banned' ? 'banned' : 'injured', 80)));

app.get('/api/clubs/:addr/squad', async (req, res) => {
  try {
    const a = await ensureAttached();
    res.json(await a.clubSquad(req.params.addr));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Generic entities: staff, manager, officials, competitions, nations, stadiums ----
const ENT_KINDS = ['staff', 'manager', 'officials', 'competitions', 'nations', 'stadiums'];
function checkKind(req, res) {
  if (!ENT_KINDS.includes(req.params.kind)) { res.status(404).json({ error: 'unknown kind' }); return false; }
  return true;
}
app.get('/api/ent/:kind', async (req, res) => {
  try {
    if (!checkKind(req, res)) return;
    if (!dataLoaded) return res.status(409).json({ error: 'Click "Load Data" first.' });
    const a = await ensureAttached();
    res.json(await a.listEntities(req.params.kind, (req.query.q || '').trim(), 40));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/ent/:kind/:addr', async (req, res) => {
  try {
    if (!checkKind(req, res)) return;
    const a = await ensureAttached();
    res.json(await a.readEntity(req.params.kind, req.params.addr));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/ent/:kind/:addr', async (req, res) => {
  try {
    if (!checkKind(req, res)) return;
    const a = await ensureAttached();
    const { field, value } = req.body;
    res.json(await a.setEntityField(req.params.kind, req.params.addr, field, value));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/players-bulk', async (req, res) => {
  try {
    const a = await ensureAttached();
    const { addresses, field, value } = req.body;
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({ error: 'No players selected.' });
    }
    const results = await a.bulkSetPlayerAttribute(addresses, field, coerceValue(field, value));
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/clubs', async (req, res) => {
  try {
    if (!dataLoaded) return res.status(409).json({ error: 'Click "Load Data" first.' });
    const a = await ensureAttached();
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const results = await a.findClubsByName(q, 30);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/clubs/:addr', async (req, res) => {
  try {
    const a = await ensureAttached();
    const c = await a.readClub(req.params.addr);
    res.json(c);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/clubs/:addr', async (req, res) => {
  try {
    const a = await ensureAttached();
    const { field, value } = req.body;
    const result = await a.setClubFinance(req.params.addr, field, Number(value));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------- in-game hook (training schedule import) ----------------
const hookctl = require('./hookctl');
const training = require('./training_apply');
let hookRecord = null; // { dir, from }
app.get('/api/hook/status', (req, res) => { try { res.json({ ...hookctl.status(), recording: !!hookRecord, templates: training.templateInfo() }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/hook/ensure', async (req, res) => { try { res.json(await hookctl.ensure()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/hook/record/start', async (req, res) => {
  try { const st = await hookctl.ensure(); await hookctl.run(['log on', 'resp grep Conditioning']); hookRecord = { dir: st.dir, from: fs.statSync(path.join(st.dir, 'fmhook.log')).size, t: Date.now() }; res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/hook/record/stop', async (req, res) => {
  try {
    try { await hookctl.run(['log off', 'resp off']); } catch (e) {}
    if (!hookRecord) throw new Error('Tidak sedang merekam');
    const p = path.join(hookRecord.dir, 'fmhook.log');
    const fd = fs.openSync(p, 'r'); const size = fs.fstatSync(fd).size; const b = Buffer.alloc(size - hookRecord.from);
    fs.readSync(fd, b, 0, b.length, hookRecord.from); fs.closeSync(fd);
    const lines = b.toString('latin1').split('\n').filter(l => / (EVENT|OPEN|ACTIONS|NEVENT|RESP) /.test(l));
    const saved = training.saveRecording({ label: req.body?.label || '', lines });
    hookRecord = null;
    res.json({ ok: true, events: lines.filter(l => / EVENT /.test(l)).length, file: saved });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
const tacticReader = require('./tactic_reader');
app.get('/api/tactic/current', (req, res) => res.json({ tactic: tacticReader.current() }));
app.post('/api/tactic/capture/start', async (req, res) => { try { res.json(await tacticReader.start()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/tactic/capture/poll', async (req, res) => { try { res.json(await tacticReader.poll()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/tactic/capture/stop', async (req, res) => { await tacticReader.stop(); res.json({ ok: true }); });
const teReader = require('./te_reader');
app.get('/api/te/current', (req, res) => res.json({ te: teReader.current() }));
app.post('/api/te/capture/start', async (req, res) => { try { res.json(await teReader.start()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/te/capture/poll', async (req, res) => { try { res.json(await teReader.poll()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/training/apply', async (req, res) => {
  try { res.json(await training.apply(req.body || {})); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/shortlist/add', async (req, res) => {
  try { const a = await ensureAttached(); const ids = (await a.playerDbIds(req.body.addresses || [])).filter(x => x > 0);
    if (!ids.length) throw new Error('Pemain tidak ditemukan'); res.json(await require('./shortlist').add(ids)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// Start the HTTP server. Returns the actual port (pass 0 for a random free port).
function start(port = PORT, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const srv = app.listen(port, host, () => resolve(srv.address().port));
    srv.on('error', reject);
  });
}

if (require.main === module) {
  start().then((port) => {
    console.log(`FM27 Memory Editor running at http://localhost:${port}`);
    console.log('Open that URL in your browser. Keep this window open while using it.');
  }).catch((e) => { console.error('Failed to start:', e.message); process.exit(1); });
}

module.exports = { start };
