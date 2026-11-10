const CATEGORIES = {
  Technical: ['crossing','dribbling','finishing','first_touch','heading','long_shots','marking','passing','tackling','technique'],
  'Set Pieces': ['corners','free_kicks','long_throws','penalty_taking'],
  Mental: ['aggression','anticipation','bravery','composure','concentration','decisions','determination','flair','leadership','off_the_ball','positioning','teamwork','vision','work_rate'],
  Physical: ['acceleration','agility','balance','jumping_reach','natural_fitness','pace','stamina','strength'],
  Goalkeeping: ['handling','aerial_reach','command_of_area','communication','kicking','throwing','one_on_ones','reflexes','eccentricity','rushing_out','punching'],
  Footedness: ['left_foot','right_foot'],
  Hidden: ['consistency','injury_proneness','important_matches','dirtiness','versatility'],
};
const POSITION_LABELS = { pos_gk:'GK', pos_sw:'SW', pos_dl:'DL', pos_dc:'DC', pos_dr:'DR', pos_dm:'DM',
  pos_ml:'ML', pos_mc:'MC', pos_mr:'MR', pos_aml:'AML', pos_amc:'AMC', pos_amr:'AMR', pos_st:'ST', pos_wbl:'WBL', pos_wbr:'WBR' };
const PERSONALITY_LABELS = { p_adaptability:'Adaptability', p_ambition:'Ambition', p_loyalty:'Loyalty',
  p_pressure:'Pressure', p_professionalism:'Professionalism', p_sportsmanship:'Sportsmanship',
  p_temperament:'Temperament', p_controversy:'Controversy' };
const ALL_ATTR_FIELDS = Object.values(CATEGORIES).flat();
function labelize(key) {
  return key.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}
// Attributes where HIGH is BAD: templates set these to (21 - value), so "max" = 1.
const NEGATIVE_KEYS = new Set(['injury_proneness', 'dirtiness', 'p_controversy', 'controversy']);
// Generic groups that are preferences, not quality -> excluded from templates.
const TEMPLATE_SKIP_GROUPS = ['Tactical Style', 'Board Relations'];

function templateBarHtml(isPlayer) {
  return `<div class="template-bar">
    <span class="tpl-title">Template</span>
    <button class="tpl-btn primary" data-tpl="max">Max semua atribut (20)</button>
    <span class="tpl-set"><input type="number" class="tpl-val" min="1" max="20" placeholder="1-20"><button class="tpl-btn" data-tpl="set">Set semua</button></span>
    ${isPlayer ? `<button class="tpl-btn" data-tpl="capa">CA/PA 200</button><button class="tpl-btn" data-tpl="pos">Semua posisi 20</button>` : ''}
  </div>`;
}

// Set inputs to v (negative attributes get 21 - v) and fire 'change' so they get staged.
function templateSet(inputs, v) {
  let n = 0;
  inputs.forEach(inp => {
    if (inp.disabled) return;
    const target = NEGATIVE_KEYS.has(inp.dataset.field) ? 21 - v : v;
    if (String(inp.value) === String(target)) return;
    inp.value = target;
    inp.dispatchEvent(new Event('change'));
    n++;
  });
  return n;
}

function wireTemplates(container) {
  const attrInputs = () => container.querySelectorAll('.category.tpl .attr-row input[data-field]');
  container.querySelectorAll('.tpl-btn').forEach(btn => btn.addEventListener('click', () => {
    let n = 0;
    const t = btn.dataset.tpl;
    if (t === 'max') n = templateSet(attrInputs(), 20);
    else if (t === 'set') {
      const v = Number(container.querySelector('.tpl-val').value);
      if (!v || v < 1 || v > 20) { toast('Isi angka 1-20 dulu', true); return; }
      n = templateSet(attrInputs(), v);
    } else if (t === 'capa') {
      container.querySelectorAll('input[data-field="ca"], input[data-field="pa"]').forEach(inp => {
        if (inp.value !== '200') { inp.value = 200; inp.dispatchEvent(new Event('change')); n++; }
      });
    } else if (t === 'pos') n = templateSet(container.querySelectorAll('.category.pos .attr-row input[data-field]'), 20);
    toast(n ? `${n} field di-stage → klik Save Changes` : 'Semua sudah di nilai itu');
  }));
  container.querySelectorAll('.cat-max').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const n = templateSet(btn.closest('.category').querySelectorAll('.attr-row input[data-field]'), 20);
    toast(n ? `${n} field di-stage → klik Save Changes` : 'Semua sudah 20');
  }));
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
function money(n) {
  if (n === undefined || n === null) return '—';
  return '£' + Number(n).toLocaleString();
}

let mode = 'players';
let selectedAddress = null;
let selectedEntity = null; // 'player' | 'club'
let dataLoaded = false;
let editHistory = [];      // committed edits (for the History tab + Undo Last)
let pendingEdits = new Map(); // key -> { input, address, entity, field, value, oldValue, label }
let selectedPlayers = new Map(); // address -> name (bulk-edit selection)

const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const searchBox = document.getElementById('search-box');
const resultsEl = document.getElementById('results');
const detailEmpty = document.getElementById('detail-empty');
const playerDetail = document.getElementById('player-detail');
const clubDetail = document.getElementById('club-detail');
const toastWrap = document.getElementById('toast-wrap');
const loadDataBtn = document.getElementById('load-data-btn');
const saveChangesBtn = document.getElementById('save-changes-btn');
const undoLastBtn = document.getElementById('undo-last-btn');
const saveInfoEl = document.getElementById('save-info');
const historyPanel = document.getElementById('history-panel');
const soonPanel = document.getElementById('soon-panel');
const searchWrap = document.getElementById('search-wrap');
const filterWrap = document.getElementById('filter-wrap');
const filterCa = document.getElementById('filter-ca');
const filterPa = document.getElementById('filter-pa');
const filterAgeMin = document.getElementById('filter-age-min');
const filterAgeMax = document.getElementById('filter-age-max');
const bulkBar = document.getElementById('bulk-bar');
const bulkCount = document.getElementById('bulk-count');
const bulkField = document.getElementById('bulk-field');
const bulkValue = document.getElementById('bulk-value');
const bulkApplyBtn = document.getElementById('bulk-apply-btn');
const entityDetail = document.getElementById('entity-detail');

const GENERIC_KINDS = {
  staff:        { icon: '', placeholder: 'Search staff by name...' },
  manager:      { icon: '', placeholder: 'Filter human managers (list loads automatically)...' },
  officials:    { icon: '', placeholder: 'Search referees by name...' },
  competitions: { icon: '', placeholder: 'Search competitions (e.g. Premier League)...' },
  nations:      { icon: '', placeholder: 'Search nations (names follow your FM language)...' },
  stadiums:     { icon: '', placeholder: 'Search stadiums by name...' },
};
function isGeneric(m) { return Object.prototype.hasOwnProperty.call(GENERIC_KINDS, m); }
function endpointFor(entity, address) {
  if (entity === 'player') return `/api/players/${address}`;
  if (entity === 'club') return `/api/clubs/${address}`;
  return `/api/ent/${entity.slice(4)}/${address}`; // 'ent:<kind>'
}

bulkField.innerHTML = `<option value="__max_all__">Max semua atribut (20)</option>` +
  ['morale', ...ALL_ATTR_FIELDS].map(k => `<option value="${k}">${labelize(k)}</option>`).join('');

function toast(message, isError) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  toastWrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

function switchMode(m) {
  mode = m;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.mode === m));

  searchWrap.classList.add('hidden');
  filterWrap.classList.add('hidden');
  bulkBar.classList.add('hidden');
  resultsEl.classList.add('hidden');
  historyPanel.classList.add('hidden');
  soonPanel.classList.add('hidden');

  if (m === 'history') {
    historyPanel.classList.remove('hidden');
    renderHistory();
    return;
  }
  if (m !== 'players' && m !== 'clubs' && !isGeneric(m)) {
    soonPanel.classList.remove('hidden');
    return;
  }
  searchWrap.classList.remove('hidden');
  resultsEl.classList.remove('hidden');
  if (m === 'players') filterWrap.classList.remove('hidden');
  resultsEl.innerHTML = '';
  searchBox.value = '';
  searchBox.placeholder = dataLoaded
    ? (m === 'players' ? 'Nama, UID, atau kalimat: "young left footed winger"…' : m === 'clubs' ? 'Search club by name...' : GENERIC_KINDS[m].placeholder)
    : 'Click Load Data first...';
  if (dataLoaded) searchBox.focus();
  if (dataLoaded && m === 'manager') doSearch();
}

loadDataBtn.addEventListener('click', loadData);

async function loadData() {
  loadDataBtn.disabled = true;
  loadDataBtn.textContent = 'Loading…';
  try {
    const r = await fetch('/api/load', { method: 'POST' });
    const info = await r.json();
    if (!r.ok || info.error) throw new Error(info.error || 'Load failed');
    dataLoaded = true;
    loadDataBtn.textContent = 'Reload Data';
    loadDataBtn.classList.add('loaded');
    const dateStr = info.date ? new Date(info.date.iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown';
    saveInfoEl.innerHTML = `In-game date: <b>${dateStr}</b><br>${info.playerCount.toLocaleString()} players · ${info.clubCount.toLocaleString()} clubs`;
    saveInfoEl.classList.remove('hidden');
    searchBox.disabled = false;
    searchBox.placeholder = mode === 'players' ? 'Search by name or UID...' : 'Search club by name...';
    toast('Save data loaded');
    if (window.onDataLoaded) window.onDataLoaded(info);
  } catch (e) {
    dataLoaded = false;
    loadDataBtn.textContent = 'Load Data';
    loadDataBtn.classList.remove('loaded');
    searchBox.disabled = true;
    saveInfoEl.classList.add('hidden');
    toast(e.message, true);
  } finally {
    loadDataBtn.disabled = false;
  }
}

async function refreshStatus() {
  try {
    const r = await fetch('/api/status');
    const s = await r.json();
    if (s.connected) {
      statusText.textContent = `FM27 process connected (PID ${s.pid})`;
      statusBar.className = 'ok';
    } else {
      statusText.textContent = s.error || 'Not connected';
      statusBar.className = 'err';
    }
  } catch (e) {
    statusText.textContent = 'Server unreachable';
    statusBar.className = 'err';
  }
}
refreshStatus();
setInterval(refreshStatus, 5000);

let searchTimer = null;
searchBox.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(doSearch, 300);
});
[filterCa, filterPa, filterAgeMin, filterAgeMax].forEach(el => {
  el.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 400);
  });
});

async function doSearch() {
  if (!dataLoaded) return;
  const q = searchBox.value.trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (mode === 'players') {
    if (filterCa.value) params.set('caMin', filterCa.value);
    if (filterPa.value) params.set('paMin', filterPa.value);
    if (filterAgeMin.value) params.set('ageMin', filterAgeMin.value);
    if (filterAgeMax.value) params.set('ageMax', filterAgeMax.value);
  }
  const statusFilter = mode === 'players' ? document.getElementById('filter-status').value : '';
  if (statusFilter) { await searchUnavailable(statusFilter, q); return; }
  const hasFilters = mode === 'players' && (filterCa.value || filterPa.value || filterAgeMin.value || filterAgeMax.value);
  if (!q && !hasFilters && mode !== 'manager') { resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = '<div class="empty-hint">Searching…</div>';
  const searchMode = mode;
  const url = mode === 'players' ? `/api/players?${params}`
    : mode === 'clubs' ? `/api/clubs?${params}`
    : `/api/ent/${mode}?${params}`;
  const r = await fetch(url);
  const items = await r.json();
  if (searchMode !== mode) return; // user switched section meanwhile
  if (items.error) { resultsEl.innerHTML = `<div class="empty-hint">${items.error}</div>`; return; }
  if (!Array.isArray(items) || items.length === 0) {
    resultsEl.innerHTML = '<div class="empty-hint">No results.</div>';
    return;
  }
  resultsEl.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'result-row';
    if (mode === 'players') {
      const sub = `UID ${item.uid}${item.ca ? ` · CA ${item.ca}/PA ${item.pa}` : ''}${item.age != null ? ` · ${item.age}y` : ''}`;
      row.innerHTML = `<input type="checkbox" class="select-chk" ${selectedPlayers.has(item.address) ? 'checked' : ''}><div class="avatar">${initials(item.name)}</div><div class="info"><div class="name">${item.name}</div><div class="sub">${sub}</div></div>`;
      const chk = row.querySelector('.select-chk');
      chk.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chk.checked) selectedPlayers.set(item.address, item.name);
        else selectedPlayers.delete(item.address);
        updateBulkBar();
      });
    } else if (isGeneric(mode)) {
      row.innerHTML = `<div class="avatar">${initials(item.name)}</div><div class="info"><div class="name">${item.name}</div><div class="sub">${item.sub || ''}</div></div>`;
    } else {
      row.innerHTML = `<div class="avatar">${initials(item.name)}</div><div class="info"><div class="name">${item.name}</div></div>`;
    }
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('select-chk')) return;
      resultsEl.querySelectorAll('.result-row').forEach(r2 => r2.classList.remove('selected'));
      row.classList.add('selected');
      returnToClub = null;
      if (mode === 'players') openPlayer(item.address);
      else if (mode === 'clubs') openClub(item.address);
      else openEntity(mode, item.address);
    });
    resultsEl.appendChild(row);
  }
}

function updateBulkBar() {
  const n = selectedPlayers.size;
  if (n === 0) { bulkBar.classList.add('hidden'); return; }
  bulkBar.classList.remove('hidden');
  bulkCount.textContent = `${n} player${n === 1 ? '' : 's'} selected`;
}

bulkApplyBtn.addEventListener('click', () => {
  const field = bulkField.value;
  if (field === '__max_all__') {
    const keys = [...ALL_ATTR_FIELDS, ...Object.keys(PERSONALITY_LABELS)];
    for (const [address, name] of selectedPlayers.entries()) {
      for (const k of keys) {
        pendingEdits.set(keyFor(address, k), {
          entity: 'player', address, input: null, field: k, value: NEGATIVE_KEYS.has(k) ? 1 : 20, oldValue: null,
          label: `${name} · ${labelize(k)}`,
        });
      }
    }
    updateSaveButton();
    toast(`Max semua atribut di-stage untuk ${selectedPlayers.size} pemain → klik Save Changes`);
    return;
  }
  const value = bulkValue.value === '' ? null : Number(bulkValue.value);
  if (value === null) { toast('Enter a value first', true); return; }
  for (const [address, name] of selectedPlayers.entries()) {
    const key = keyFor(address, field);
    pendingEdits.set(key, {
      entity: 'player', address, input: null, field, value, oldValue: null,
      label: `${name} · ${labelize(field)}`,
    });
  }
  updateSaveButton();
  toast(`Staged "${labelize(field)} = ${value}" for ${selectedPlayers.size} players`);
});

// ---------------------------------------------------------------------
// Pending/Apply system: edits are staged locally until "Save Changes".
// ---------------------------------------------------------------------
function keyFor(address, field) { return address + '|' + field; }

function stageEdit(entity, address, input, field, value, oldValue, label) {
  const key = keyFor(address, field);
  input.classList.remove('applied');
  input.classList.add('pending');
  pendingEdits.set(key, { entity, address, input, field, value, oldValue, label });
  updateSaveButton();
}

function updateSaveButton() {
  const n = pendingEdits.size;
  saveChangesBtn.disabled = n === 0;
  saveChangesBtn.textContent = n > 0 ? `Save Changes (${n})` : 'Save Changes';
}

saveChangesBtn.addEventListener('click', commitPendingEdits);

async function commitPendingEdits() {
  const all = Array.from(pendingEdits.values());
  if (all.length === 0) return;
  saveChangesBtn.disabled = true;
  let okCount = 0;
  // Bulk-staged player edits (no input element, no old value) go in batches per field+value.
  const bulk = all.filter(e => e.entity === 'player' && !e.input && e.oldValue === null);
  const edits = all.filter(e => !bulk.includes(e));
  const groups = new Map();
  for (const e of bulk) {
    const g = e.field + '|' + JSON.stringify(e.value);
    if (!groups.has(g)) groups.set(g, { field: e.field, value: e.value, addresses: [], names: new Set() });
    groups.get(g).addresses.push(e.address);
    groups.get(g).names.add(e.label.split(' · ')[0]);
  }
  for (const g of groups.values()) {
    try {
      const r = await fetch('/api/players-bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: g.addresses, field: g.field, value: g.value }),
      });
      const result = await r.json();
      if (result.error) { toast(`${g.field}: ${result.error}`, true); continue; }
      okCount += result.results.filter(x => x.ok).length;
      editHistory.unshift({
        entity: 'player-bulk', address: '', name: `${g.names.size} pemain (bulk)`, field: g.field,
        oldValue: null, newValue: g.value, time: Date.now(), undone: false, noUndo: true,
      });
    } catch (err) { toast(`${g.field}: ${err.message}`, true); }
  }
  for (const e of edits) {
    try {
      const endpoint = endpointFor(e.entity, e.address);
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: e.field, value: e.value }),
      });
      const result = await r.json();
      if (result.error) { toast(`${e.label}: ${result.error}`, true); continue; }
      if (e.input) {
        e.input.classList.remove('pending');
        e.input.classList.add('applied');
        setTimeout(() => e.input.classList.remove('applied'), 1500);
      }
      editHistory.unshift({
        entity: e.entity, address: e.address, name: e.label.split(' · ')[0],
        field: e.field, oldValue: e.oldValue, newValue: e.value, time: Date.now(), undone: false,
      });
      okCount++;
    } catch (err) {
      toast(`${e.label}: ${err.message}`, true);
    }
  }
  pendingEdits.clear();
  updateSaveButton();
  undoLastBtn.disabled = !editHistory.some(x => !x.undone && !x.noUndo);
  toast(`Saved ${okCount} change${okCount === 1 ? '' : 's'}`);
}

undoLastBtn.addEventListener('click', undoLastEdit);

async function undoLastEdit() {
  const h = editHistory.find(x => !x.undone && !x.noUndo);
  if (!h) return;
  await undoHistoryItem(editHistory.indexOf(h));
}

async function openPlayer(address) {
  selectedAddress = address;
  selectedEntity = 'player';
  const r = await fetch(`/api/players/${address}`);
  const p = await r.json();
  if (p.error) { toast(p.error, true); return; }
  detailEmpty.classList.add('hidden');
  clubDetail.classList.add('hidden');
  entityDetail.classList.add('hidden');
  document.getElementById('compare-detail').classList.add('hidden');
  playerDetail.classList.remove('hidden');
  renderPlayer(address, p);
}

function dateInputValue(dateObj) {
  return dateObj && !dateObj.notSet ? dateObj.iso : '';
}

let currentPlayerName = null;
let returnToClub = null; // { address, name } when a player was opened from a club squad

function renderPlayer(address, p) {
  currentPlayerName = p.name;
  const c = p.contract;
  let html = `
    <div class="header-bar">
      <div>
        ${returnToClub ? `<button class="back-btn" id="back-to-club">← Kembali ke ${returnToClub.name}</button>` : ''}
        <h1>${p.name}</h1>
        <div class="meta">
          <span>ID ${p.uid}</span>
          ${p.nationality ? `<span>${p.nationality}</span>` : ''}
          ${p.club ? `<span>${p.club}</span>` : ''}
          ${c ? `<span>${money(c.wage)}/wk</span>` : ''}
        </div>
      </div>
    </div>

    <div class="quick-row">
      <div class="quick-box"><label>Current Ability</label><input type="number" min="1" max="200" value="${p.ca}" data-field="ca"></div>
      <div class="quick-box"><label>Potential Ability</label><input type="number" min="1" max="200" value="${p.pa}" data-field="pa"></div>
      <div class="quick-box"><label>Morale</label><input type="number" min="1" max="20" value="${p.morale}" data-field="morale"></div>
      <div class="quick-box"><label>Home Rep</label><input type="number" value="${p.homeRep}" data-field="homeRep"></div>
      <div class="quick-box"><label>Current Rep</label><input type="number" value="${p.currentRep}" data-field="currentRep"></div>
    </div>
  ` + templateBarHtml(true) + `<div class="section-title">Medis & Status</div><div id="medical-wrap"><div class="empty-hint">Memeriksa status medis…</div></div>`;

  html += `<div class="section-title">Positions</div><div class="category pos" style="margin-bottom:8px"><h3>Positions <button class="cat-max" title="Set semua ke 20">20</button></h3>`;
  for (const key of Object.keys(POSITION_LABELS)) {
    const val = p.positions[key];
    html += `<div class="attr-row"><input type="number" min="1" max="20" value="${val}" data-field="${key}"><span class="label">${POSITION_LABELS[key]}</span></div>`;
  }
  html += `</div>`;

  html += `<div class="section-title">Personality</div><div class="category tpl" style="margin-bottom:8px"><h3>Personality <button class="cat-max" title="Set semua ke 20">20</button></h3>`;
  for (const key of Object.keys(PERSONALITY_LABELS)) {
    const val = p.personality[key];
    html += `<div class="attr-row"><input type="number" min="1" max="20" value="${val}" data-field="${key}"><span class="label">${PERSONALITY_LABELS[key]}</span></div>`;
  }
  html += `</div>`;

  html += `<div class="section-title">Contract</div>`;
  if (c) {
    html += `<div class="contract-grid">
      <div class="card"><label>Wage (£ / week)</label><input type="number" value="${c.wage}" data-field="contract.wage"></div>
      <div class="card"><label>Squad Status</label>
        <select data-field="contract.squadStatus">
          ${[1,2,3,4,5,6].map(v => `<option value="${v}" ${v === c.squadStatus ? 'selected' : ''}>${v} - ${SQUAD_LABELS[v] || 'Level ' + v}</option>`).join('')}
        </select>
      </div>
      <div class="card"><label>Squad Number</label><input type="number" min="1" max="99" placeholder="none" value="${c.squadNumber ?? ''}" data-field="contract.squadNumber"></div>
      <div class="card"><label>Contract Expiry</label><input type="date" value="${dateInputValue(c.expiry)}" data-field="contract.expiry"></div>
      <div class="card"><label>Contract Signed (read-only)</label><input type="date" value="${dateInputValue(c.signed)}" disabled></div>
      <div class="card">
        <label>Listing</label>
        <div class="checkbox-row"><input type="checkbox" id="chk-listed" ${c.transferListed ? 'checked' : ''} data-field="contract.transferListed"><label for="chk-listed">Transfer Listed</label></div>
        <div class="checkbox-row" style="margin-top:6px"><input type="checkbox" id="chk-loan" ${c.loanListed ? 'checked' : ''} data-field="contract.loanListed"><label for="chk-loan">Loan Listed</label></div>
      </div>
      <div class="card"><label>Asking Price (£, -1 = unspecified)</label><input type="number" value="${p.askingPrice}" data-field="askingPrice"></div>
      <div class="card"><label>Transfer Value (£)</label><input type="number" value="${p.transferValue}" data-field="transferValue"></div>
    </div>`;
  } else {
    html += `<div class="warning">This player has no readable contract (free agent, or the pointer is unmapped for this record).</div>`;
  }

  html += `<div class="section-title">Attributes</div><div class="categories">`;
  for (const [cat, keys] of Object.entries(CATEGORIES)) {
    html += `<div class="category tpl"><h3>${cat} <button class="cat-max" title="Set semua ke 20">20</button></h3>`;
    for (const key of keys) {
      const val = p.attributes[key];
      if (val === undefined) continue;
      html += `<div class="attr-row">
        <input type="number" min="1" max="20" value="${val}" data-field="${key}">
        <span class="label">${labelize(key)}</span>
      </div>`;
    }
    html += `</div>`;
  }
  html += `</div><div class="save-hint">Edit a field, then click <b>Save Changes</b> in the left sidebar to apply it (like FMLE's pending/applied system). Use <b>Undo</b> to revert the last saved change. FM may show the old value until you advance a day if it has already shown this profile.</div>`;
  playerDetail.innerHTML = html;

  playerDetail.querySelectorAll('input[data-field], select[data-field]').forEach(input => {
    input.dataset.prevValue = input.type === 'checkbox'
      ? JSON.stringify(input.checked)
      : JSON.stringify(input.value === '' ? null : (input.type === 'date' ? input.value : Number(input.value)));
    input.addEventListener('change', () => stagePlayerInput(address, input));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  });
  wireTemplates(playerDetail);
  loadMedical(address, p.name);
  const back = document.getElementById('back-to-club');
  if (back) back.addEventListener('click', () => openClub(returnToClub.address));
}

const SQUAD_LABELS = { 1: 'Star Player', 2: 'Important Player', 3: 'Regular Starter', 4: 'Squad Player', 5: 'Impact Sub', 6: 'Fringe Player' };

function stagePlayerInput(address, input) {
  const field = input.dataset.field;
  let value;
  if (input.type === 'checkbox') value = input.checked;
  else if (input.type === 'date') value = input.value;
  else value = input.value === '' ? null : Number(input.value);
  const oldValue = input.dataset.prevValue !== undefined ? JSON.parse(input.dataset.prevValue) : null;
  stageEdit('player', address, input, field, value, oldValue, `${currentPlayerName} · ${labelize(field.replace('contract.', ''))}`);
}

async function openClub(address) {
  selectedAddress = address;
  selectedEntity = 'club';
  const r = await fetch(`/api/clubs/${address}`);
  const c = await r.json();
  if (c.error) { toast(c.error, true); return; }
  detailEmpty.classList.add('hidden');
  playerDetail.classList.add('hidden');
  entityDetail.classList.add('hidden');
  document.getElementById('compare-detail').classList.add('hidden');
  clubDetail.classList.remove('hidden');
  renderClub(address, c);
}

let currentClubName = null;

function renderClub(address, c) {
  currentClubName = c.name;
  let html = `
    <div class="header-bar">
      <div>
        <h1>${c.name}</h1>
        <div class="meta">${c.fullName && c.fullName !== c.name ? `<span>${c.fullName}</span>` : ''}</div>
      </div>
    </div>
  `;
  if (!c.hasFullFinance) {
    html += `<div class="warning">${c.note || 'This club does not have editable finance data.'}</div>`;
  } else {
    html += `<div class="section-title">Finances</div><div class="finance-grid">
      <div class="card"><label>Balance (£)</label><input type="number" value="${c.balance}" data-field="balance"></div>
      <div class="card"><label>Transfer Budget (£)</label><input type="number" value="${c.transferBudget}" data-field="transferBudget"></div>
      <div class="card"><label>Wage Budget (£/wk)</label><input type="number" value="${c.wageBudget}" data-field="wageBudget"></div>
      <div class="card"><label>Youth Grant Income (£)</label><input type="number" value="${c.youthGrant}" data-field="youthGrant"></div>
      <div class="card"><label>Current Wage Spend (£/wk, read-only)</label><input type="number" value="${c.currentWageSpend}" disabled></div>
    </div>
    <div class="save-hint">Edit a field, then click <b>Save Changes</b> in the left sidebar to apply it.</div>`;
  }
  html += `<div class="section-title">Skuad</div><div id="squad-wrap"><div class="empty-hint">Memuat pemain…</div></div>`;
  clubDetail.innerHTML = html;
  loadSquad(address, c.name);

  clubDetail.querySelectorAll('input[data-field]').forEach(input => {
    input.dataset.prevValue = JSON.stringify(Number(input.value));
    input.addEventListener('change', () => stageClubInput(address, input));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  });
}

function stageClubInput(address, input) {
  const field = input.dataset.field;
  const value = Number(input.value);
  const oldValue = input.dataset.prevValue !== undefined ? JSON.parse(input.dataset.prevValue) : null;
  stageEdit('club', address, input, field, value, oldValue, `${currentClubName} · ${labelize(field)}`);
}

function renderHistory() {
  if (editHistory.length === 0) {
    historyPanel.innerHTML = '<div class="empty-hint">No edits saved yet this session.</div>';
    return;
  }
  historyPanel.innerHTML = editHistory.map((h, idx) => {
    const fieldLabel = h.custom ? h.field : labelize(h.field.replace('contract.', ''));
    const when = new Date(h.time).toLocaleTimeString();
    return `<div class="history-item">
      <div class="htop"><span class="hname">${h.name || h.address}</span><span>${when}</span></div>
      <div class="hfield">${h.custom ? `<span class="hchange">${fieldLabel}</span>` : `${fieldLabel}: ${JSON.stringify(h.oldValue)} → <span class="hchange">${JSON.stringify(h.newValue)}</span>`}</div>
      <div style="margin-top:6px;text-align:right">
        <button class="undo-btn" data-idx="${idx}" ${h.undone || h.noUndo ? 'disabled' : ''}>${h.undone ? 'Undone' : h.noUndo ? 'Bulk (no undo)' : 'Undo'}</button>
      </div>
    </div>`;
  }).join('');
  historyPanel.querySelectorAll('.undo-btn').forEach(btn => {
    btn.addEventListener('click', () => undoHistoryItem(Number(btn.dataset.idx)));
  });
}

async function undoHistoryItem(idx) {
  const h = editHistory[idx];
  if (!h || h.undone || h.noUndo) return;
  if (h.custom) {
    try {
      await customUndo(h.custom);
      h.undone = true;
      toast(`Undone: ${h.field}`);
      renderHistory();
      undoLastBtn.disabled = !editHistory.some(x => !x.undone && !x.noUndo);
      if (selectedEntity === 'player' && h.custom.refresh === selectedAddress) openPlayer(selectedAddress);
      if (selectedEntity === 'club' && h.custom.club === selectedAddress) openClub(selectedAddress);
    } catch (e) { toast('Undo gagal: ' + e.message, true); }
    return;
  }
  try {
    const endpoint = endpointFor(h.entity, h.address);
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: h.field, value: h.oldValue }),
    });
    const result = await r.json();
    if (result.error) { toast(result.error, true); return; }
    h.undone = true;
    toast(`Undone: ${labelize(h.field.replace('contract.', ''))}`);
    renderHistory();
    undoLastBtn.disabled = !editHistory.some(x => !x.undone && !x.noUndo);
    // Refresh the open detail panel if it's the same record
    if (selectedAddress === h.address) {
      if (h.entity === 'player') openPlayer(h.address);
      else if (h.entity === 'club') openClub(h.address);
      else openEntity(h.entity.slice(4), h.address);
    }
  } catch (e) {
    toast('Undo failed: ' + e.message, true);
  }
}


// ---------------------------------------------------------------------
// Generic entity panels: Staff, Human Manager, Officials, Competitions,
// Nations, Stadiums. Field layout comes from the agent (readEntity).
// ---------------------------------------------------------------------
let currentEntityName = null;

async function openEntity(kind, address) {
  selectedAddress = address;
  selectedEntity = 'ent:' + kind;
  const r = await fetch(`/api/ent/${kind}/${address}`);
  const d = await r.json();
  if (d.error) { toast(d.error, true); return; }
  detailEmpty.classList.add('hidden');
  playerDetail.classList.add('hidden');
  clubDetail.classList.add('hidden');
  document.getElementById('compare-detail').classList.add('hidden');
  entityDetail.classList.remove('hidden');
  renderEntity(kind, address, d);
}

function fieldInput(f) {
  const dis = f.ro ? 'disabled' : '';
  if (f.type === 'date') return `<input type="date" value="${f.value || ''}" data-field="${f.key}" data-type="date" ${dis}>`;
  const mm = `${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''}`;
  return `<input type="number" ${mm} value="${f.value ?? ''}" data-field="${f.key}" ${dis}>`;
}

function renderEntity(kind, address, d) {
  currentEntityName = d.name;
  const icon = GENERIC_KINDS[kind].icon;
  let html = `
    <div class="header-bar">
      <div>
        <h1>${icon} ${d.name}</h1>
        <div class="meta">${(d.chips || []).map(c => `<span>${c}</span>`).join('')}</div>
      </div>
    </div>`;
  const hasTemplatable = d.groups.some(g => !g.box && !TEMPLATE_SKIP_GROUPS.includes(g.title) && g.fields.some(f => !f.ro));
  if (hasTemplatable) html += templateBarHtml(false);
  const boxGroups = d.groups.filter(g => g.box);
  const attrGroups = d.groups.filter(g => !g.box);
  for (const g of boxGroups) {
    html += `<div class="section-title">${g.title}</div><div class="contract-grid">`;
    for (const f of g.fields) {
      const extra = f.missing ? ' <span style="opacity:.6">(none)</span>' : '';
      html += `<div class="card"><label>${f.label}${extra}</label>${fieldInput(f)}</div>`;
    }
    html += `</div>`;
  }
  if (attrGroups.length) {
    html += `<div class="section-title">Attributes</div><div class="categories">`;
    for (const g of attrGroups) {
      const tpl = !TEMPLATE_SKIP_GROUPS.includes(g.title);
      html += `<div class="category${tpl ? ' tpl' : ''}"><h3>${g.title}${tpl ? ' <button class="cat-max" title="Set semua ke 20">20</button>' : ''}</h3>`;
      for (const f of g.fields) {
        html += `<div class="attr-row">${fieldInput(f)}<span class="label">${f.label}</span></div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  html += `<div class="save-hint">Edit a field, then click <b>Save Changes</b> in the left sidebar to apply it. Use <b>Undo</b> to revert. FM may keep showing the old value on an already-open screen until you leave it or advance a day.</div>`;
  entityDetail.innerHTML = html;

  entityDetail.querySelectorAll('input[data-field]').forEach(input => {
    if (input.disabled) return;
    input.dataset.prevValue = JSON.stringify(input.value === '' ? null : (input.dataset.type === 'date' ? input.value : Number(input.value)));
    input.addEventListener('change', () => {
      const field = input.dataset.field;
      const value = input.dataset.type === 'date' ? input.value : (input.value === '' ? null : Number(input.value));
      if (value === null || value === '') { toast('Value required', true); return; }
      const oldValue = JSON.parse(input.dataset.prevValue);
      const label = input.closest('.card')?.querySelector('label')?.textContent
        || input.parentElement.querySelector('.label')?.textContent || field;
      stageEdit('ent:' + kind, address, input, field, value, oldValue, `${currentEntityName} · ${label}`);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  });
  wireTemplates(entityDetail);
}


// ---------------------------------------------------------------------
// Club squad: every player whose current team belongs to the club.
// Click a row -> player editor (with "back to club"); checkboxes feed Bulk Edit.
// ---------------------------------------------------------------------
async function loadSquad(clubAddress, clubName) {
  const wrap = document.getElementById('squad-wrap');
  let data;
  try {
    data = await (await fetch(`/api/clubs/${clubAddress}/squad`)).json();
  } catch (e) { data = { error: e.message }; }
  if (selectedAddress !== clubAddress || !document.getElementById('squad-wrap')) return; // user moved on
  if (data.error) { wrap.innerHTML = `<div class="warning">${data.error}</div>`; return; }
  if (!data.teams.length) { wrap.innerHTML = '<div class="empty-hint">Klub ini tidak punya pemain.</div>'; return; }
  const teamTitle = (i, t) => i === 0 ? 'Tim Utama' : `Tim Cadangan / Muda ${data.teams.length > 2 ? i : ''}`.trim();
  let html = '';
  data.teams.forEach((t, i) => {
    html += `<div class="squad-team">
      <div class="squad-head">
        <span class="squad-title">${teamTitle(i, t)}</span>
        <span class="squad-meta">${t.players.length} pemain · rata-rata CA ${t.avgCa}</span>
        <button class="tpl-btn squad-select-all" data-team="${i}">Pilih semua (Bulk Edit)</button>
      </div>
      <table class="squad-table">
        <thead><tr><th></th><th>Pos</th><th>Nama</th><th>Umur</th><th>CA</th><th>PA</th></tr></thead>
        <tbody>
        ${t.players.map(pl => `<tr data-addr="${pl.address}" data-name="${pl.name.replace(/"/g, '&quot;')}">
          <td><input type="checkbox" class="squad-chk" ${selectedPlayers.has(pl.address) ? 'checked' : ''}></td>
          <td class="pos">${pl.pos || '—'}</td>
          <td class="nm">${pl.name}</td>
          <td>${pl.age ?? '—'}</td>
          <td><span class="ca-pill">${pl.ca ?? '—'}</span></td>
          <td><span class="pa-pill">${pl.pa ?? '—'}</span></td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  });
  html = `<div class="fix-bar">
      <span class="tpl-title">Instant Fix (seluruh klub)</span>
      <button class="tpl-btn primary" data-fix="heal">Sembuhkan semua cedera</button>
      <button class="tpl-btn" data-fix="lift">Cabut semua larangan main</button>
      <button class="tpl-btn" data-fix="morale">Morale semua 20</button>
    </div>` + html;
  wrap.innerHTML = html;
  wrap.querySelectorAll('.fix-bar [data-fix]').forEach(btn => btn.addEventListener('click', () => runClubFix(clubAddress, clubName, btn.dataset.fix)));
  // status icons (injured / banned)
  const addrs = data.teams.flatMap(t => t.players.map(p => p.address));
  fetch('/api/players-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addresses: addrs }) })
    .then(r => r.json()).then(st => {
      if (st.error || !document.getElementById('squad-wrap')) return;
      wrap.querySelectorAll('tbody tr').forEach(tr => {
        const s2 = st[tr.dataset.addr]; if (!s2) return;
        const nm = tr.querySelector('td.nm');
        if (s2.injured) nm.insertAdjacentHTML('beforeend', ' <span class="st-badge inj" title="Cedera">Cedera</span>');
        if (s2.banned) nm.insertAdjacentHTML('beforeend', ' <span class="st-badge ban" title="Dilarang main">Skors</span>');
      });
    }).catch(() => {});

  wrap.querySelectorAll('tbody tr').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.classList.contains('squad-chk')) return;
      returnToClub = { address: clubAddress, name: clubName };
      openPlayer(tr.dataset.addr);
      document.getElementById('detail').scrollTo(0, 0);
    });
    tr.querySelector('.squad-chk').addEventListener('change', (e) => {
      if (e.target.checked) selectedPlayers.set(tr.dataset.addr, tr.dataset.name);
      else selectedPlayers.delete(tr.dataset.addr);
      updateBulkBar();
    });
  });
  wrap.querySelectorAll('.squad-select-all').forEach(btn => btn.addEventListener('click', () => {
    const rows = btn.closest('.squad-team').querySelectorAll('tbody tr');
    rows.forEach(tr => { tr.querySelector('.squad-chk').checked = true; selectedPlayers.set(tr.dataset.addr, tr.dataset.name); });
    updateBulkBar();
    toast(`${rows.length} pemain dipilih → atur di bar Bulk Edit di kiri`);
  }));
}


// ---------------------------------------------------------------------
// Medical & status (FMRTE-style instant fixes)
// ---------------------------------------------------------------------
async function postJson(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
}

async function loadMedical(address, name) {
  const wrap = document.getElementById('medical-wrap');
  if (!wrap) return;
  let m;
  try { m = await (await fetch(`/api/players/${address}/medical`)).json(); } catch (e) { m = { error: e.message }; }
  if (selectedAddress !== address || !document.getElementById('medical-wrap')) return;
  if (m.error) { wrap.innerHTML = `<div class="warning">${m.error}</div>`; return; }
  const inj = (m.injuries || []).filter(x => x.active);
  const bans = (m.absences || []).filter(x => x.active && x.isBan);
  const other = (m.absences || []).filter(x => x.active && !x.isBan);
  let html = '';
  if (!inj.length && !bans.length) {
    html += `<div class="med-ok">Fit: tidak cedera dan tidak sedang dilarang main.</div>`;
  }
  if (inj.length) {
    html += `<div class="med-card inj"><div class="med-head"><b>Cedera (${inj.length})</b>
      <button class="tpl-btn primary" data-heal="all">Sembuhkan semua</button></div>`;
    for (const x of inj) {
      html += `<div class="med-row"><div><div class="med-name">${x.name}</div>
        <div class="med-sub">Sejak ${x.start} · latihan ringan ${x.returnLight} · latihan penuh ${x.returnFull} · <b>${x.daysLeft} hari lagi</b></div></div>
        <button class="tpl-btn" data-heal="${x.idx}">Sembuhkan</button></div>`;
    }
    html += `</div>`;
  }
  if (bans.length) {
    html += `<div class="med-card ban"><div class="med-head"><b>Larangan main (${bans.length})</b>
      <button class="tpl-btn primary" data-lift="all">Cabut semua</button></div>`;
    for (const x of bans) {
      html += `<div class="med-row"><div><div class="med-name">${x.label}</div>
        <div class="med-sub">Sejak ${x.start} · sampai ${x.end} · <b>${x.daysLeft} hari lagi</b></div></div>
        <button class="tpl-btn" data-lift="${x.idx}">Cabut</button></div>`;
    }
    html += `</div>`;
  }
  for (const x of other) html += `<div class="med-sub" style="margin:6px 2px">${x.label}: ${x.start} → ${x.end}</div>`;
  html += `<div class="save-hint">Langsung diterapkan (tanpa Save Changes). FM menampilkan perubahannya setelah <b>1 hari berlalu</b> di game. Sembuhkan bisa di-Undo selama FM belum memproses harinya; cabut larangan tidak bisa di-Undo setelah hari berganti.</div>`;
  wrap.innerHTML = html;

  wrap.querySelectorAll('[data-heal]').forEach(b => b.addEventListener('click', async () => {
    try {
      const idx = b.dataset.heal === 'all' ? 'all' : Number(b.dataset.heal);
      const r = await postJson(`/api/players/${address}/heal`, { idx });
      if (!r.healed.length) { toast('Tidak ada cedera aktif'); return; }
      editHistory.unshift({ entity: 'player', address, name, field: `Sembuhkan: ${r.healed.map(h => h.name).join(', ')}`,
        time: Date.now(), undone: false, custom: { type: 'heal', refresh: address, items: [{ address, healed: r.healed }] } });
      undoLastBtn.disabled = false;
      toast(`${name}: ${r.healed.length} cedera disembuhkan (lewati 1 hari di FM)`);
      loadMedical(address, name);
    } catch (e) { toast(e.message, true); }
  }));
  wrap.querySelectorAll('[data-lift]').forEach(b => b.addEventListener('click', async () => {
    try {
      const idx = b.dataset.lift === 'all' ? 'all' : Number(b.dataset.lift);
      const r = await postJson(`/api/players/${address}/liftban`, { idx });
      if (!r.lifted.length) { toast('Tidak ada larangan aktif'); return; }
      editHistory.unshift({ entity: 'player', address, name, field: 'Cabut larangan main',
        time: Date.now(), undone: false, custom: { type: 'lift', refresh: address, items: [{ address, lifted: r.lifted }] } });
      undoLastBtn.disabled = false;
      toast(`${name}: larangan main dicabut (lewati 1 hari di FM)`);
      loadMedical(address, name);
    } catch (e) { toast(e.message, true); }
  }));
}

async function runClubFix(clubAddress, clubName, what) {
  try {
    const r = await postJson(`/api/clubs/${clubAddress}/fix`, { what, value: 20 });
    const label = { heal: 'Sembuhkan semua cedera', lift: 'Cabut semua larangan', morale: 'Morale semua 20' }[what];
    if (!r.changed) { toast(`${label}: tidak ada yang perlu diubah`); return; }
    const items = r.details.map(d => ({ address: d.address, healed: d.healed, lifted: d.lifted, oldMorale: d.oldMorale }));
    editHistory.unshift({ entity: 'club', address: clubAddress, name: clubName, field: `${label} (${r.changed} pemain)`,
      time: Date.now(), undone: false, custom: { type: what, club: clubAddress, items } });
    undoLastBtn.disabled = false;
    toast(`${clubName}: ${label} → ${r.changed} pemain (lewati 1 hari di FM)`);
    loadSquad(clubAddress, clubName);
  } catch (e) { toast(e.message, true); }
}

async function customUndo(c) {
  const errors = [];
  for (const it of c.items) {
    try {
      if (it.healed) for (const h of it.healed)
        await postJson(`/api/players/${it.address}/restore-injury`, { idx: h.idx, startNum: h.startNum, full: h.oldFull, light: h.oldLight });
      if (it.lifted) for (const l of it.lifted)
        await postJson(`/api/players/${it.address}/restore-ban`, { idx: l.idx, startNum: l.startNum, days: l.oldDays });
      if (it.nameRestore)
        await postJson(`/api/players/${it.address}/name`, { which: it.nameRestore.which, rec: it.nameRestore.oldRec });
      if (it.oldExpiry !== undefined)
        await postJson(`/api/players/${it.address}`, { field: 'contract.expiry', value: it.oldExpiry });
      if (it.oldWage !== undefined)
        await postJson(`/api/players/${it.address}`, { field: 'contract.wage', value: it.oldWage });
      if (it.oldMorale !== undefined)
        await postJson(`/api/players/${it.address}`, { field: 'morale', value: it.oldMorale });
    } catch (e) { errors.push(e.message); }
  }
  if (errors.length) throw new Error(errors[0] + (errors.length > 1 ? ` (+${errors.length - 1} lagi)` : ''));
}

async function searchUnavailable(what, q) {
  resultsEl.innerHTML = '<div class="empty-hint">Mencari pemain…</div>';
  let items;
  try { items = await (await fetch(`/api/unavailable?what=${what}`)).json(); } catch (e) { items = { error: e.message }; }
  if (items.error) { resultsEl.innerHTML = `<div class="empty-hint">${items.error}</div>`; return; }
  if (q) items = items.filter(x => x.name.toLowerCase().includes(q.toLowerCase()) || (x.club || '').toLowerCase().includes(q.toLowerCase()));
  if (!items.length) { resultsEl.innerHTML = '<div class="empty-hint">Tidak ada.</div>'; return; }
  resultsEl.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `<div class="avatar ${what === 'banned' ? 'av-ban' : 'av-inj'}">${initials(item.name)}</div><div class="info"><div class="name">${item.name}</div><div class="sub">${item.club || '—'} · CA ${item.ca} · ${item.info}</div></div>`;
    row.addEventListener('click', () => {
      resultsEl.querySelectorAll('.result-row').forEach(r2 => r2.classList.remove('selected'));
      row.classList.add('selected');
      returnToClub = null;
      openPlayer(item.address);
    });
    resultsEl.appendChild(row);
  }
}
document.getElementById('filter-status').addEventListener('change', () => doSearch());
