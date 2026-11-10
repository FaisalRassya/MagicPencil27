// =====================================================================
// FMRTE-style extras (UI): Quick search, presets, compare, freeze, club
// facilities. Loaded after app.js.
// =====================================================================

// ---------------- Quick search: sentence -> filter chips ----------------
const QS_POS = [
  [/\b(left wingers?|sayap kiri|winger kiri)\b/, ['AML', 'ML'], 'Sayap kiri'],
  [/\b(right wingers?|sayap kanan|winger kanan)\b/, ['AMR', 'MR'], 'Sayap kanan'],
  [/\b(wingers?|pemain sayap|sayap|wide players?)\b/, ['AML', 'AMR', 'ML', 'MR'], 'Winger'],
  [/\b(goal ?keepers?|keepers?|kiper|penjaga gawang|gk)\b/, ['GK'], 'Kiper'],
  [/\b(cent(?:re|er) ?backs?|bek tengah|stoppers?|cb|dc)\b/, ['DC'], 'Bek tengah'],
  [/\b(left ?backs?|bek kiri)\b/, ['DL', 'WBL'], 'Bek kiri'],
  [/\b(right ?backs?|bek kanan)\b/, ['DR', 'WBR'], 'Bek kanan'],
  [/\b(full ?backs?|wing ?backs?|bek sayap)\b/, ['DL', 'DR', 'WBL', 'WBR'], 'Bek sayap'],
  [/\b(defensive midfielders?|gelandang bertahan|holding midfielders?|dm|dmc)\b/, ['DM'], 'Gelandang bertahan'],
  [/\b(attacking midfielders?|gelandang serang|playmakers?|number 10|no ?10|amc)\b/, ['AMC'], 'Gelandang serang'],
  [/\b(cent(?:re|ral|er) midfielders?|midfielders?|gelandang|mc)\b/, ['MC', 'DM', 'AMC'], 'Gelandang'],
  [/\b(strikers?|forwards?|penyerang|striker|target man|poachers?|st)\b/, ['ST'], 'Striker'],
  [/\b(defenders?|bek|pemain belakang)\b/, ['DC', 'DL', 'DR'], 'Bek'],
];
const QS_ATTR = {
  dribbling: /dribbling|dribble|dribel|giringan/, pace: /pace|speed|kecepatan|lari/, acceleration: /acceleration|akselerasi/,
  finishing: /finishing|penyelesaian akhir|penyelesaian/, passing: /passing|umpan pendek|umpan/, vision: /vision|visi/,
  tackling: /tackling|tekel/, heading: /heading|sundulan/, crossing: /crossing|umpan silang/, technique: /technique|teknik/,
  strength: /strength|kekuatan/, stamina: /stamina/, jumping_reach: /jumping|lompatan/, composure: /composure|ketenangan/,
  decisions: /decisions|keputusan/, positioning: /positioning|penempatan posisi/, marking: /marking|penjagaan/,
  long_shots: /long shots?|tendangan jarak jauh/, free_kicks: /free ?kicks?|tendangan bebas/, penalty_taking: /penalt(?:y|ies)|penalti/,
  reflexes: /reflexes|refleks/, handling: /handling|tangkapan/, leadership: /leadership|kepemimpinan/,
  work_rate: /work ?rate|kerja keras/, determination: /determination|determinasi/, flair: /flair|kreativitas/,
  anticipation: /anticipation|antisipasi/, agility: /agility|kelincahan/, balance: /balance|keseimbangan/,
  bravery: /bravery|keberanian/, aggression: /aggression|agresivitas/, teamwork: /teamwork|kerja sama/,
  off_the_ball: /off the ball|pergerakan tanpa bola/, first_touch: /first touch|sentuhan pertama/,
};
const QS_LEVEL = [[/\b(excellent|elite|world ?class|superb|luar biasa|kelas dunia)\b/, 18], [/\b(great|very good|hebat|sangat bagus|top)\b/, 16], [/\b(good|decent|bagus|baik|tinggi)\b/, 14]];
const QS_NATION = { english: 'inggris', brazilian: 'brasil', spanish: 'spanyol', french: 'prancis', german: 'jerman', italian: 'italia',
  dutch: 'belanda', portuguese: 'portugal', argentine: 'argentina', argentinian: 'argentina', indonesian: 'indonesia', japanese: 'jepang',
  korean: 'korea', belgian: 'belgia', croatian: 'kroasia', norwegian: 'norwegia', danish: 'denmark', swedish: 'swedia', scottish: 'skotlandia',
  welsh: 'wales', irish: 'irlandia', american: 'amerika', mexican: 'meksiko', colombian: 'kolombia', uruguayan: 'uruguay', moroccan: 'maroko',
  nigerian: 'nigeria', senegalese: 'senegal', turkish: 'turki', polish: 'polandia', serbian: 'serbia', swiss: 'swiss', austrian: 'austria',
  ukrainian: 'ukraina', ghanaian: 'ghana', egyptian: 'mesir', australian: 'australia', canadian: 'kanada', chinese: 'tiongkok' };
const QS_STOP = new Set(['with', 'and', 'or', 'a', 'an', 'the', 'who', 'is', 'are', 'has', 'have', 'player', 'players', 'pemain', 'yang',
  'dengan', 'dan', 'punya', 'memiliki', 'cari', 'find', 'show', 'me', 'all', 'semua', 'some', 'of', 'for', 'in', 'to', 'at', 'tahun', 'years', 'old', 'umur', 'usia']);

function parseQuickSearch(text) {
  let s = ' ' + text.toLowerCase().replace(/[,;]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const chips = [];
  const take = (re) => { const m = s.match(re); if (m) s = s.replace(m[0], ' '); return m; };
  let m;
  // explicit CA / PA / age numbers
  while ((m = take(/\b(ca|current ability)\s*(?:>=|>|=|:)?\s*(\d{2,3})\s*\+?/))) chips.push({ label: `CA ≥ ${m[2]}`, patch: { caMin: +m[2] } });
  while ((m = take(/\b(pa|potential(?: ability)?|potensi)\s*(?:>=|>|=|:)?\s*(\d{2,3})\s*\+?/))) chips.push({ label: `PA ≥ ${m[2]}`, patch: { paMin: +m[2] } });
  if ((m = take(/\b(?:under|u|below|di ?bawah|<=?)\s*-?\s*(\d{2})\b(?:\s*(?:tahun|years?))?/))) chips.push({ label: `Umur ≤ ${m[1]}`, patch: { ageMax: +m[1] } });
  if ((m = take(/\b(?:over|above|di ?atas|>=?)\s*(\d{2})\b(?:\s*(?:tahun|years?))?/))) chips.push({ label: `Umur ≥ ${m[1]}`, patch: { ageMin: +m[1] } });
  if ((m = take(/\b(?:aged?|umur|usia)\s*(\d{2})\s*(?:-|to|sampai|sd)\s*(\d{2})\b/))) chips.push({ label: `Umur ${m[1]}–${m[2]}`, patch: { ageMin: +m[1], ageMax: +m[2] } });
  if (take(/\b(wonder ?kids?|wonderkid)\b/)) chips.push({ label: 'Wonderkid (≤21, PA ≥ 150)', patch: { ageMax: 21, paMin: 150 } });
  if (take(/\b(high potential|potensi tinggi|big potential)\b/)) chips.push({ label: 'PA ≥ 150', patch: { paMin: 150 } });
  if (take(/\b(teen(?:ager)?s?|remaja)\b/)) chips.push({ label: 'Umur ≤ 19', patch: { ageMax: 19 } });
  if (take(/\b(young(?:sters?)?|muda|youth)\b/)) chips.push({ label: 'Umur ≤ 23', patch: { ageMax: 23 } });
  if (take(/\b(old|veterans?|tua|senior|experienced|berpengalaman)\b/)) chips.push({ label: 'Umur ≥ 30', patch: { ageMin: 30 } });
  // feet
  if (take(/\b(two[- ]footed|both feet|dua kaki|kaki dua)\b/)) chips.push({ label: 'Dua kaki', patch: { foot: 'both' } });
  else if (take(/\b(left[- ]?foot(?:ed)?|kaki kiri|kidal|lefty)\b/)) chips.push({ label: 'Kaki kiri', patch: { foot: 'left' } });
  else if (take(/\b(right[- ]?foot(?:ed)?|kaki kanan)\b/)) chips.push({ label: 'Kaki kanan', patch: { foot: 'right' } });
  // status
  if (take(/\b(injured|cedera)\b/)) chips.push({ label: 'Cedera', patch: { injured: true } });
  if (take(/\b(banned|suspended|skorsing|larangan(?: main)?)\b/)) chips.push({ label: 'Dilarang main', patch: { banned: true } });
  if (take(/\b(free agents?|without (?:a )?club|tanpa klub|bebas transfer|free transfer)\b/)) chips.push({ label: 'Tanpa klub', patch: { freeAgent: true } });
  // "<level> <attr>" and "<attr> <level>"
  for (const [key, re] of Object.entries(QS_ATTR)) {
    for (const [lre, lv] of QS_LEVEL) {
      const a = new RegExp('\\b(?:' + lre.source.replace(/^\\b\(|\)\\b$/g, '') + ')\\s+(?:at\\s+)?(?:' + re.source + ')\\b');
      const b = new RegExp('\\b(?:' + re.source + ')\\s+(?:yang\\s+)?(?:' + lre.source.replace(/^\\b\(|\)\\b$/g, '') + ')\\b');
      if ((m = take(a)) || (m = take(b))) { chips.push({ label: `${labelize(key)} ≥ ${lv}`, patch: { attrs: { [key]: lv } } }); break; }
    }
    if ((m = take(new RegExp('\\b(?:' + re.source + ')\\s*(?:>=|>|=|:)?\\s*(\\d{1,2})\\s*\\+?')))) {
      const v = +m[m.length - 1]; if (v >= 1 && v <= 20) chips.push({ label: `${labelize(key)} ≥ ${v}`, patch: { attrs: { [key]: v } } });
    }
  }
  if (take(/\b(fast|quick|pacy|cepat|kencang)\b/)) chips.push({ label: 'Pace ≥ 14', patch: { attrs: { pace: 14 } } });
  if (take(/\b(strong|physical|kuat|fisik)\b/)) chips.push({ label: 'Strength ≥ 14', patch: { attrs: { strength: 14 } } });
  if (take(/\b(creative|kreatif)\b/)) chips.push({ label: 'Vision ≥ 14', patch: { attrs: { vision: 14 } } });
  if (take(/\b(technical|teknikal)\b/)) chips.push({ label: 'Technique ≥ 14', patch: { attrs: { technique: 14 } } });
  // positions (longest phrases first, one group each)
  for (const [re, pos, label] of QS_POS) if (take(re)) chips.push({ label, patch: { positions: pos } });
  // nationality adjectives
  for (const [adj, nat] of Object.entries(QS_NATION)) if (take(new RegExp('\\b' + adj + 's?\\b'))) chips.push({ label: `Negara: ${nat}`, patch: { nation: nat } });
  // "from X" / "dari X" (club or nation), "at X club"
  if ((m = take(/\b(?:from|dari|at|plays? for|main di|klub)\s+([^\d]+?)\s*$/))) {
    const what = m[1].trim().split(' ').filter(w => !QS_STOP.has(w)).join(' ');
    if (what) chips.push({ label: `Dari "${what}"`, patch: { from: what } });
  }
  if (take(/\b(best|terbaik|strongest|highest ca)\b/)) chips.push({ label: 'Urut: CA', patch: { sort: 'ca' } });
  const leftover = s.trim().split(' ').filter(w => w && !QS_STOP.has(w) && !/^\d+$/.test(w));
  return { chips, leftover };
}

function mergeCriteria(chips) {
  const c = {};
  for (const ch of chips) {
    for (const [k, v] of Object.entries(ch.patch)) {
      if (k === 'attrs') c.attrs = { ...(c.attrs || {}), ...v };
      else if (k === 'positions') c.positions = [...new Set([...(c.positions || []), ...v])];
      else if (k === 'ageMax') c.ageMax = c.ageMax == null ? v : Math.min(c.ageMax, v);
      else if (k === 'ageMin' || k === 'caMin' || k === 'paMin') c[k] = c[k] == null ? v : Math.max(c[k], v);
      else c[k] = v;
    }
  }
  return c;
}

let qsChips = [];        // chips of the current quick search
let qsLeftover = [];

async function runQuickSearch(chips, leftover) {
  qsChips = chips; qsLeftover = leftover || [];
  const crit = mergeCriteria(chips);
  if (filterCa.value) crit.caMin = Math.max(crit.caMin || 0, +filterCa.value);
  if (filterPa.value) crit.paMin = Math.max(crit.paMin || 0, +filterPa.value);
  if (filterAgeMin.value) crit.ageMin = +filterAgeMin.value;
  if (filterAgeMax.value) crit.ageMax = Math.min(crit.ageMax ?? 99, +filterAgeMax.value);
  const st = document.getElementById('filter-status').value;
  if (st === 'injured') crit.injured = true; if (st === 'banned') crit.banned = true;
  renderChips();
  if (!chips.length && !Object.keys(crit).length) { resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = '<div class="empty-hint">Mencari…</div>';
  let r;
  try { r = await postJson('/api/search', { criteria: crit, limit: 150 }); } catch (e) { resultsEl.innerHTML = `<div class="empty-hint">${e.message}</div>`; return; }
  if (mode !== 'players') return;
  if (r.total === 0 && qsLeftover.length) { qsChips = []; qsLeftover = []; renderChips(); return _origDoSearch(); } // probably a name
  resultsEl.innerHTML = `<div class="qs-count">${r.total.toLocaleString()} pemain cocok${r.total > r.players.length ? ` · menampilkan ${r.players.length} teratas` : ''}</div>`;
  for (const item of r.players) {
    const row = document.createElement('div');
    row.className = 'result-row';
    const sub = [item.pos, item.age != null ? item.age + 'th' : '', item.club || 'Tanpa klub', `CA ${item.ca}/PA ${item.pa}`].filter(Boolean).join(' · ');
    row.innerHTML = `<input type="checkbox" class="select-chk" ${selectedPlayers.has(item.address) ? 'checked' : ''}><div class="avatar">${initials(item.name)}</div><div class="info"><div class="name">${item.name}</div><div class="sub">${sub}</div></div>`;
    const chk = row.querySelector('.select-chk');
    chk.addEventListener('click', (e) => { e.stopPropagation(); if (chk.checked) selectedPlayers.set(item.address, item.name); else selectedPlayers.delete(item.address); updateBulkBar(); });
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('select-chk')) return;
      resultsEl.querySelectorAll('.result-row').forEach(r2 => r2.classList.remove('selected'));
      row.classList.add('selected'); returnToClub = null; openPlayer(item.address);
    });
    resultsEl.appendChild(row);
  }
  const all = document.createElement('button');
  all.className = 'tpl-btn'; all.style.margin = '8px 16px'; all.textContent = 'Pilih semua hasil (Bulk Edit)';
  all.addEventListener('click', () => { r.players.forEach(p => selectedPlayers.set(p.address, p.name)); resultsEl.querySelectorAll('.select-chk').forEach(c => c.checked = true); updateBulkBar(); });
  resultsEl.appendChild(all);
}

function renderChips() {
  const el = document.getElementById('qs-chips');
  if (!el) return;
  if (!qsChips.length && !qsLeftover.length) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = qsChips.map((c, i) => `<span class="qs-chip">${c.label}<button data-i="${i}" title="Hapus filter">×</button></span>`).join('') +
    (qsLeftover.length ? `<span class="qs-unknown" title="Kata yang tidak dikenali">? ${qsLeftover.join(' ')}</span>` : '');
  el.querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => {
    const chips = qsChips.filter((_, i) => i !== Number(b.dataset.i));
    runQuickSearch(chips, []);
  }));
}

// Hook into the existing search: sentences with recognised keywords become a quick search.
const _origDoSearch = doSearch;
doSearch = async function () {
  if (mode === 'players' && dataLoaded) {
    const q = searchBox.value.trim();
    if (/^["'].*["']$/.test(q)) { qsChips = []; qsLeftover = []; renderChips(); searchBox.value = q.slice(1, -1); const r = await _origDoSearch(); searchBox.value = q; return r; }
    if (q) {
      const parsed = parseQuickSearch(q);
      if (parsed.chips.length) return runQuickSearch(parsed.chips, parsed.leftover);
    }
    qsChips = []; qsLeftover = []; renderChips();
  }
  return _origDoSearch();
};

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    if (mode !== 'players') switchMode('players');
    searchBox.focus(); searchBox.select();
  }
});
searchBox.title = 'Ketik nama, atau kalimat seperti "young left footed winger with good dribbling" / "pemain muda sayap kaki kiri dribbling bagus dari barcelona" (Ctrl+F)';

// ---------------- Presets (Make Wonderkid / Inspire / Destroy) ----------------
function stageField(field, value) {
  const inp = playerDetail.querySelector(`input[data-field="${field}"]`);
  if (!inp || inp.disabled || String(inp.value) === String(value)) return 0;
  inp.value = value; inp.dispatchEvent(new Event('change')); return 1;
}
const PRESETS = {
  wonderkid: {
    label: 'Make Wonderkid',
    run: () => {
      let n = stageField('pa', 200);
      for (const [k, v] of Object.entries({ consistency: 20, important_matches: 20, injury_proneness: 1, natural_fitness: 20, determination: 20, versatility: 16,
        p_ambition: 20, p_professionalism: 20, p_pressure: 20, p_temperament: 20, p_controversy: 1, p_adaptability: 18 })) n += stageField(k, v);
      return n;
    },
  },
  inspire: { label: 'Inspire', run: () => stageField('morale', 20) + stageField('p_pressure', 20) },
  destroy: {
    label: 'Destroy',
    run: () => {
      if (!confirm('Destroy: semua atribut jadi 1, morale 1, PA diturunkan ke CA. Lanjut? (masih bisa dibatalkan sebelum Save Changes)')) return 0;
      let n = templateSet(playerDetail.querySelectorAll('.category.tpl .attr-row input[data-field]'), 1);
      n += stageField('morale', 1);
      const ca = playerDetail.querySelector('input[data-field="ca"]'); if (ca) n += stageField('pa', ca.value);
      return n;
    },
  },
};

// ---------------- Compare two players ----------------
let compareA = null;
async function startOrFinishCompare(address, name) {
  if (!compareA || compareA.address === address) {
    compareA = { address, name };
    toast(`${name} dipilih. Buka pemain kedua lalu klik "Bandingkan" lagi.`);
    return;
  }
  const a = compareA, b = { address, name };
  compareA = null;
  const [pa, pb] = await Promise.all([a, b].map(x => fetch(`/api/players/${x.address}`).then(r => r.json())));
  if (pa.error || pb.error) { toast(pa.error || pb.error, true); return; }
  showCompare(pa, pb, a.address, b.address);
}
function compareTableHtml(A, B, addrA, addrB) {
  const cls = (a, b, neg) => (a == null || b == null || a === b) ? '' : ((neg ? a < b : a > b) ? 'cmp-win' : 'cmp-lose');
  const fmt = (v) => v == null ? '—' : (typeof v === 'number' && Math.abs(v) >= 10000 ? v.toLocaleString() : v);
  const row = (label, x, y, neg) => `<tr><th>${label}</th><td class="${cls(x, y, neg)}">${fmt(x)}</td><td class="${cls(y, x, neg)}">${fmt(y)}</td></tr>`;
  let html = `<table class="cmp-table"><thead><tr><th></th>
      <th><a href="#" data-open="${addrA}">${esc(A.name)}</a><div class="cmp-sub">${esc(A.clubFull || A.club || '')}</div></th>
      <th><a href="#" data-open="${addrB}">${esc(B.name)}</a><div class="cmp-sub">${esc(B.clubFull || B.club || '')}</div></th></tr></thead><tbody>
    ${row('Umur', A.age, B.age, true)}${row('Current Ability', A.ca, B.ca)}${row('Potential Ability', A.pa, B.pa)}${row('Morale', A.morale, B.morale)}
    ${row('Transfer Value', A.transferValue, B.transferValue)}${row('Wage', A.contract?.wage, B.contract?.wage, true)}`;
  for (const [cat, keys] of Object.entries(CATEGORIES)) {
    html += `<tr class="cmp-cat"><th colspan="3">${cat}</th></tr>`;
    for (const k of keys) html += row(labelize(k), A.attributes[k], B.attributes[k], NEGATIVE_KEYS.has(k));
  }
  html += `<tr class="cmp-cat"><th colspan="3">Personality</th></tr>`;
  for (const [k, l] of Object.entries(PERSONALITY_LABELS)) html += row(l, A.personality[k], B.personality[k], NEGATIVE_KEYS.has(k));
  return html + `</tbody></table><div class="save-hint">Hijau = lebih baik. Klik nama untuk membuka profilnya.</div>`;
}
function showCompare(A, B, addrA, addrB) {
  const panel = document.getElementById('compare-detail');
  [detailEmpty, playerDetail, clubDetail, entityDetail].forEach(el => el.classList.add('hidden'));
  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="header-bar"><div><h1>Perbandingan</h1></div></div>` + compareTableHtml(A, B, addrA, addrB);
  panel.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); panel.classList.add('hidden'); openPlayer(a.dataset.open); }));
}

// ---------------- Freeze attributes ----------------
async function freezeList() { try { return (await (await fetch('/api/freeze')).json()).freezes || []; } catch (e) { return []; } }
async function renderFreezeBox(address, uid, name) {
  const box = document.getElementById('freeze-box'); if (!box) return;
  const list = await freezeList();
  if (selectedAddress !== address) return;
  const f = list.find(x => x.uid === uid);
  const status = !f ? '<span class="frz-off">Tidak dikunci</span>'
    : f.mode === 'up' ? '<span class="frz-on">Hanya boleh naik</span>' : '<span class="frz-on">Atribut dikunci</span>';
  box.innerHTML = `${status}
    <button class="tpl-btn" data-frz="lock" title="Atribut, CA & PA dikembalikan ke nilai sekarang setiap kali berubah">Kunci</button>
    <button class="tpl-btn" data-frz="up" title="Atribut boleh naik (latihan), tapi kalau turun dikembalikan">Hanya naik</button>
    ${f ? '<button class="tpl-btn" data-frz="off">Lepas</button>' : ''}`;
  box.querySelectorAll('[data-frz]').forEach(b => b.addEventListener('click', async () => {
    try {
      if (pendingEdits.size) { toast('Save Changes dulu, supaya nilai yang dikunci adalah nilai terbaru', true); return; }
      if (b.dataset.frz === 'off') await postJson('/api/freeze/remove', { address, uid });
      else await postJson('/api/freeze', { address, mode: b.dataset.frz });
      toast(b.dataset.frz === 'off' ? `${name}: kunci dilepas` : `${name}: ${b.dataset.frz === 'up' ? 'hanya boleh naik' : 'atribut dikunci'} `);
      renderFreezeBox(address, uid, name);
    } catch (e) { toast(e.message, true); }
  }));
}
async function renderFrozenNav() {
  const list = await freezeList();
  if (mode !== 'frozen') return;
  resultsEl.innerHTML = list.length ? '' : '<div class="empty-hint">Belum ada pemain yang dikunci. Buka pemain → Kunci.</div>';
  for (const f of list) {
    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `<div class="avatar">${initials(f.name)}</div><div class="info"><div class="name">${f.name}</div><div class="sub">${f.mode === 'up' ? 'Hanya naik' : 'Dikunci'}${f.missing ? ' · tidak ada di save ini' : ''}</div></div>`;
    if (!f.missing) row.addEventListener('click', () => { returnToClub = null; openPlayer(f.address); });
    resultsEl.appendChild(row);
  }
}
const _origSwitchMode = switchMode;
switchMode = function (m) {
  if (m === 'frozen') {
    mode = m;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    [searchWrap, filterWrap, bulkBar, historyPanel, soonPanel].forEach(el => el.classList.add('hidden'));
    const chips = document.getElementById('qs-chips'); if (chips) chips.classList.add('hidden');
    resultsEl.classList.remove('hidden');
    renderFrozenNav();
    return;
  }
  const chips = document.getElementById('qs-chips');
  if (chips) chips.classList.toggle('hidden', m !== 'players' || (!qsChips.length && !qsLeftover.length));
  return _origSwitchMode(m);
};

// ---------------- Player page: FMRTE-style layout (blue header + left tabs) ----------------
const PP_TABS = [
  ['info', '', 'Information'],
  ['attributes', '', 'Attributes'],
  ['positions', '', 'Positions'],
  ['personality', '', 'Personality'],
  ['contract', '', 'Contract'],
  ['comparison', '', 'Comparison'],
  ['injury', '', 'Injury & Bans'],
  ['freeze', '', 'Kunci Atribut'],
];
let ppTab = 'info';
const POS_ORDER = ['GK', 'DC', 'DL', 'DR', 'WBL', 'WBR', 'SW', 'DM', 'MC', 'ML', 'MR', 'AMC', 'AML', 'AMR', 'ST'];
function bestPositions(p) {
  const map = { pos_gk: 'GK', pos_sw: 'SW', pos_dl: 'DL', pos_dc: 'DC', pos_dr: 'DR', pos_dm: 'DM', pos_ml: 'ML', pos_mc: 'MC', pos_mr: 'MR',
    pos_aml: 'AML', pos_amc: 'AMC', pos_amr: 'AMR', pos_st: 'ST', pos_wbl: 'WBL', pos_wbr: 'WBR' };
  const vals = Object.entries(p.positions || {}).map(([k, v]) => [map[k], v]).filter(x => x[0]);
  const top = Math.max(0, ...vals.map(x => x[1]));
  return vals.filter(x => x[1] >= 15 && x[1] >= top - 2).map(x => x[0]).sort((a, b) => POS_ORDER.indexOf(a) - POS_ORDER.indexOf(b));
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

const _origRenderPlayer = renderPlayer;
renderPlayer = function (address, p) {
  _origRenderPlayer(address, p);
  document.getElementById('compare-detail').classList.add('hidden');

  // 1) split the flat page into sections
  const kids = [...playerDetail.children];
  const oldHeader = kids.find(k => k.classList.contains('header-bar'));
  const hint = kids.find(k => k.classList.contains('save-hint'));
  const sec = { info: [] };
  let cur = 'info';
  const titleMap = { 'Positions': 'positions', 'Personality': 'personality', 'Contract': 'contract', 'Attributes': 'attributes' };
  for (const k of kids) {
    if (k === oldHeader || k === hint) continue;
    if (k.classList.contains('section-title')) {
      const t = k.textContent.trim();
      cur = titleMap[t] || (t.includes('Medis') ? 'injury' : cur);
      sec[cur] = sec[cur] || [];
      continue;
    }
    (sec[cur] = sec[cur] || []).push(k);
  }

  // 2) header like FMRTE
  const pos = bestPositions(p);
  const mainPos = pos[0] || '—';
  const num = p.contract && p.contract.squadNumber ? p.contract.squadNumber : null;
  const back = oldHeader && oldHeader.querySelector('#back-to-club');
  const head = document.createElement('div');
  head.className = 'pp-head';
  head.innerHTML = `
    <div class="pp-badge">${mainPos}</div>
    <div class="pp-title">
      <div class="pp-name">${num ? num + '. ' : ''}${esc(p.name)} <span class="pp-age">${p.age != null ? p.age + ' Years - ' : ''}${pos.join('/') || mainPos} </span></div>
      <div class="pp-sub"><span>${esc(p.nationality || '—')}</span><span class="pp-slash">/</span><span>${esc(p.clubFull || p.club || 'Tanpa klub')}</span></div>
    </div>
    <div class="pp-headstats">
      <div><b>${p.ca}</b><span>CA</span></div><div><b>${p.pa}</b><span>PA</span></div>
      <div><b>${p.morale}</b><span>Morale</span></div>
    </div>`;
  if (back) { back.classList.add('pp-back'); head.prepend(back); }

  // 3) body: left tabs + content
  const body = document.createElement('div');
  body.className = 'pp-body';
  const nav = document.createElement('nav');
  nav.className = 'pp-tabs';
  nav.innerHTML = PP_TABS.map(([k, ic, l]) => `<button class="pp-tab" data-tab="${k}">${l}<span class="pp-dot hidden"></span></button>`).join('');
  const content = document.createElement('div');
  content.className = 'pp-content';
  const panels = {};
  for (const [k, , l] of PP_TABS) {
    const pan = document.createElement('div');
    pan.className = 'pp-panel hidden';
    pan.dataset.tab = k;
    pan.innerHTML = `<div class="pp-card-title">${l}</div>`;
    (sec[k] || []).forEach(n => pan.appendChild(n));
    panels[k] = pan;
    content.appendChild(pan);
  }

  // Information: personal details card + quick edits + presets
  const det = document.createElement('div');
  det.className = 'pp-box';
  const rows = [
    ['Nama', esc(p.name)], ['Unique ID', p.uid], ['Tanggal lahir', p.dob && !p.dob.notSet ? p.dob.iso : '—'],
    ['Umur', p.age ?? '—'], ['Tinggi', p.height ? p.height + ' cm' : '—'], ['Negara', esc(p.nationality || '—')],
    ['Klub', esc(p.clubFull || p.club || 'Tanpa klub')], ['Posisi', pos.join(', ') || '—'],
    ['Gaji', p.contract ? money(p.contract.wage) + '/minggu' : '—'], ['Kontrak sampai', p.contract && p.contract.expiry && !p.contract.expiry.notSet ? p.contract.expiry.iso : '—'],
  ];
  det.innerHTML = `<div class="pp-grid">${rows.map(([a, b]) => `<div class="pp-k">${a}</div><div class="pp-v">${b}</div>`).join('')}</div>`;
  panels.info.insertBefore(det, panels.info.children[1]);
  // presets on the template bar
  const bar = panels.info.querySelector('.template-bar');
  if (bar) {
    bar.insertAdjacentHTML('beforeend', `<span class="tpl-sep"></span>` +
      Object.entries(PRESETS).map(([k, v]) => `<button class="tpl-btn preset" data-preset="${k}">${v.label}</button>`).join(''));
    bar.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
      const n = PRESETS[b.dataset.preset].run();
      if (n) toast(`${PRESETS[b.dataset.preset].label}: ${n} field di-stage → klik Save Changes`);
    }));
  }
  // Freeze tab
  panels.freeze.insertAdjacentHTML('beforeend', `<div class="pp-box"><div class="freeze-box" id="freeze-box"></div>
    <div class="save-hint"><b>Kunci</b>: atribut, CA & PA dikembalikan ke nilai sekarang tiap kali berubah. <b>Hanya naik</b>: boleh naik (latihan), tapi kalau turun (umur/cedera) dikembalikan. Jalan otomatis selama editor terbuka.</div></div>`);
  // Comparison tab: pick another player inline
  panels.comparison.insertAdjacentHTML('beforeend', `<div class="pp-box">
      <div class="pp-cmp-search"><input type="text" id="pp-cmp-q" placeholder="Ketik nama pemain pembanding…"><div id="pp-cmp-res"></div></div>
      <div id="pp-cmp-out"><div class="empty-hint" style="padding:16px 0">Bandingkan ${esc(p.name)} dengan pemain lain.</div></div></div>`);
  if (hint) content.appendChild(hint);
  body.appendChild(nav); body.appendChild(content);
  playerDetail.innerHTML = '';
  playerDetail.classList.add('pp');
  playerDetail.appendChild(head);
  playerDetail.appendChild(body);

  const show = (k) => {
    ppTab = k;
    nav.querySelectorAll('.pp-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === k));
    Object.entries(panels).forEach(([kk, pan]) => pan.classList.toggle('hidden', kk !== k));
  };
  nav.querySelectorAll('.pp-tab').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  show(panels[ppTab] ? ppTab : 'info');

  // pending dot per tab
  const markDots = () => {
    for (const [k, pan] of Object.entries(panels)) {
      const dirty = pan.querySelector('.pending');
      nav.querySelector(`.pp-tab[data-tab="${k}"] .pp-dot`).classList.toggle('hidden', !dirty);
    }
  };
  content.addEventListener('change', () => setTimeout(markDots, 0));
  content.addEventListener('click', () => setTimeout(markDots, 0));

  renderFreezeBox(address, p.uid, p.name);
  // medical status -> red dot / count on Injury tab
  fetch(`/api/players/${address}/medical`).then(r => r.json()).then(m => {
    if (m.error || selectedAddress !== address) return;
    const n = (m.injuries || []).filter(x => x.active).length + (m.absences || []).filter(x => x.active && x.isBan).length;
    if (n) nav.querySelector('.pp-tab[data-tab="injury"]').insertAdjacentHTML('beforeend', `<span class="pp-count">${n}</span>`);
  }).catch(() => {});

  // inline comparison
  const q = document.getElementById('pp-cmp-q'), res = document.getElementById('pp-cmp-res');
  let tmr = null;
  q.addEventListener('input', () => {
    clearTimeout(tmr);
    tmr = setTimeout(async () => {
      const v = q.value.trim();
      if (v.length < 2) { res.innerHTML = ''; return; }
      let list = [];
      try { list = await (await fetch(`/api/players?q=${encodeURIComponent(v)}&limit=8`)).json(); } catch (e) {}
      if (!Array.isArray(list)) list = [];
      res.innerHTML = list.filter(x => x.address !== address).slice(0, 8)
        .map(x => `<div class="pp-cmp-item" data-a="${x.address}">${esc(x.name)} <span class="cmp-sub">CA ${x.ca ?? '?'} · PA ${x.pa ?? '?'}</span></div>`).join('');
      res.querySelectorAll('.pp-cmp-item').forEach(it => it.addEventListener('click', async () => {
        res.innerHTML = ''; q.value = it.textContent.replace(/CA.*$/, '').trim();
        const B = await (await fetch(`/api/players/${it.dataset.a}`)).json();
        if (B.error) { toast(B.error, true); return; }
        document.getElementById('pp-cmp-out').innerHTML = compareTableHtml(p, B, address, it.dataset.a);
        document.querySelectorAll('#pp-cmp-out [data-open]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); openPlayer(a.dataset.open); }));
      }));
    }, 250);
  });
};
// ---------------- Club page: facilities, reputation, tickets ----------------
const _origRenderClub = renderClub;
renderClub = function (address, c) {
  _origRenderClub(address, c);
  if (!c.extra || !c.extraMeta) return;
  const order = ['reputation', 'training', 'youthFacilities', 'academyCoaching', 'youthRecruitment', 'corporate', 'ticketPrice', 'seasonTickets'];
  const cards = order.filter(k => c.extra[k] !== undefined).map(k => {
    const m = c.extraMeta[k];
    return `<div class="card"><label>${m.label}</label><input type="number" ${k === 'ticketPrice' ? 'step="0.01"' : ''} min="${m.min}" max="${m.max}" value="${c.extra[k]}" data-field="${k}"></div>`;
  }).join('');
  if (!cards) return;
  const html = `<div class="section-title">Fasilitas & Reputasi${c.extra.yearFounded ? ` <span class="cmp-sub">· berdiri ${c.extra.yearFounded}</span>` : ''}</div>
    <div class="template-bar"><span class="tpl-title">Template</span><button class="tpl-btn primary" id="fac-max">Semua fasilitas 20</button></div>
    <div class="finance-grid" id="club-extra">${cards}</div>`;
  const squad = clubDetail.querySelector('#squad-wrap');
  const title = squad ? squad.previousElementSibling : null;
  (title || clubDetail.lastElementChild).insertAdjacentHTML(title ? 'beforebegin' : 'afterend', html);
  clubDetail.querySelectorAll('#club-extra input[data-field]').forEach(input => {
    input.dataset.prevValue = JSON.stringify(Number(input.value));
    input.addEventListener('change', () => stageClubInput(address, input));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  });
  document.getElementById('fac-max').addEventListener('click', () => {
    let n = 0;
    ['training', 'youthFacilities', 'academyCoaching', 'youthRecruitment', 'corporate'].forEach(k => {
      const inp = clubDetail.querySelector(`#club-extra input[data-field="${k}"]`);
      if (inp && inp.value !== '20') { inp.value = 20; inp.dispatchEvent(new Event('change')); n++; }
    });
    toast(n ? `${n} fasilitas di-stage → klik Save Changes` : 'Semua fasilitas sudah 20');
  });
};
