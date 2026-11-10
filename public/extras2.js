// =====================================================================
// Round 3 (UI): names, caps, appearance, clauses, position
// ratings, PA projection, Clone Center, Best XI, CSV export, club extras.
// Loaded after extras.js.
// =====================================================================

function shortName(n) { const p = String(n || '').split(' ').filter(Boolean); while (p.length > 1 && /^(jr\.?|sr\.?|junior|ii|iii)$/i.test(p[p.length - 1])) p.pop(); return p[p.length - 1] || n; }

// ---------------- Position ratings (own model) ----------------
// Each position lists its key attributes (weight 5), important ones (3) and
// useful ones (1). Rating = weighted average of the 1-20 attributes, scaled
// to 0-100. Written for this editor; not derived from other tools.
const POS_PROFILE = {
  pos_gk: [['reflexes', 'one_on_ones', 'handling', 'positioning'], ['aerial_reach', 'command_of_area', 'concentration', 'agility'], ['kicking', 'communication', 'rushing_out', 'composure', 'decisions']],
  pos_sw: [['positioning', 'anticipation', 'passing'], ['composure', 'marking', 'tackling', 'decisions', 'concentration'], ['pace', 'vision', 'first_touch', 'heading']],
  pos_dc: [['marking', 'positioning', 'tackling', 'heading'], ['jumping_reach', 'strength', 'concentration', 'anticipation'], ['bravery', 'pace', 'composure', 'decisions', 'passing']],
  pos_dl: [['tackling', 'positioning', 'pace'], ['marking', 'stamina', 'crossing', 'acceleration', 'concentration'], ['work_rate', 'teamwork', 'anticipation', 'dribbling', 'passing']],
  pos_wbl: [['stamina', 'crossing', 'pace'], ['work_rate', 'acceleration', 'dribbling', 'tackling'], ['off_the_ball', 'passing', 'positioning', 'teamwork', 'first_touch']],
  pos_dm: [['positioning', 'tackling', 'anticipation'], ['concentration', 'passing', 'decisions', 'teamwork', 'marking'], ['stamina', 'work_rate', 'composure', 'strength', 'first_touch']],
  pos_mc: [['passing', 'decisions', 'first_touch'], ['vision', 'technique', 'composure', 'teamwork', 'stamina'], ['work_rate', 'anticipation', 'off_the_ball', 'tackling', 'long_shots']],
  pos_ml: [['crossing', 'stamina', 'passing'], ['dribbling', 'pace', 'work_rate', 'technique'], ['acceleration', 'off_the_ball', 'first_touch', 'teamwork', 'decisions']],
  pos_amc: [['vision', 'passing', 'technique'], ['first_touch', 'decisions', 'off_the_ball', 'composure', 'dribbling'], ['flair', 'long_shots', 'finishing', 'agility', 'anticipation']],
  pos_aml: [['dribbling', 'acceleration', 'technique'], ['pace', 'crossing', 'off_the_ball', 'first_touch', 'flair'], ['finishing', 'agility', 'passing', 'work_rate', 'composure']],
  pos_st: [['finishing', 'off_the_ball', 'composure'], ['first_touch', 'anticipation', 'acceleration', 'heading'], ['pace', 'strength', 'dribbling', 'technique', 'jumping_reach', 'decisions']],
};
for (const [a2, b2] of [['pos_dr', 'pos_dl'], ['pos_wbr', 'pos_wbl'], ['pos_mr', 'pos_ml'], ['pos_amr', 'pos_aml']]) POS_PROFILE[a2] = POS_PROFILE[b2];
const POS_WEIGHTS = {};
for (const [k, [key, imp, use]] of Object.entries(POS_PROFILE)) POS_WEIGHTS[k] = [...key.map(x => [x, 5]), ...imp.map(x => [x, 3]), ...use.map(x => [x, 1])];
function posRating(attrs, posKey) {
  const w = POS_WEIGHTS[posKey]; if (!w || !attrs) return 0;
  let sum = 0, tot = 0;
  for (const [k, wt] of w) { sum += (attrs[k] || 1) * wt; tot += wt; }
  return Math.round(sum / tot * 5);
}
function famFactor(f) { return f >= 18 ? 1 : f >= 15 ? 0.95 : f >= 12 ? 0.85 : f >= 9 ? 0.7 : f >= 5 ? 0.5 : 0.35; }

// ---------------- PA projection (own model) ----------------
// Rough "what could this player look like at full potential": the CA headroom
// (PA - CA) is spread over the attributes that matter for his best position,
// more on attributes with room to grow; physical growth shrinks with age.
const PHYSICAL = ['acceleration', 'agility', 'balance', 'jumping_reach', 'natural_fitness', 'pace', 'stamina', 'strength'];
function projectAttrs(p) {
  const out = {};
  if (!(p.pa > p.ca && p.ca > 0) || !p.attributes) return out;
  let best = 'pos_mc', bf = 0;
  for (const k of Object.keys(POS_PROFILE)) { const v = p.positions?.[k] || 0; if (v > bf) { bf = v; best = k; } }
  const w = Object.fromEntries(POS_WEIGHTS[best]);
  const age = p.age || 22, physAge = age <= 21 ? 1 : age <= 24 ? 0.6 : 0.25;
  const budget = (p.pa - p.ca) / 200 * 60; // attribute points to hand out
  const room = {};
  let total = 0;
  for (const [k, cur] of Object.entries(p.attributes)) {
    if (cur < 1 || cur > 19 || k.endsWith('_foot') || ['consistency', 'injury_proneness', 'important_matches', 'dirtiness', 'versatility', 'determination', 'flair', 'eccentricity'].includes(k)) continue;
    const rel = (w[k] || 0.5) * (PHYSICAL.includes(k) ? physAge : 1);
    room[k] = (20 - cur) * rel; total += room[k];
  }
  if (!total) return out;
  for (const [k, r] of Object.entries(room)) {
    const cur = p.attributes[k], v = Math.min(20, Math.round(cur + budget * r / total));
    if (v > cur) out[k] = v;
  }
  return out;
}

// ---------------- helpers ----------------
function wireStage(container, address) {
  container.querySelectorAll('input[data-field], select[data-field]').forEach(input => {
    if (input.dataset.wired) return;
    input.dataset.wired = '1';
    input.dataset.prevValue = JSON.stringify(input.value === '' ? null : Number(input.value));
    input.addEventListener('change', () => stagePlayerInput(address, input));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  });
}
const ETHNICITY = ['Northern European', 'Mediterranean/Hispanic', 'North African/Middle Eastern', 'African/Caribbean', '', '', '', '', '', 'Mixed Race', 'East Asian'];
async function playerPicker(input, resultsBox, exclude, onPick) {
  let tmr = null;
  input.addEventListener('input', () => {
    clearTimeout(tmr);
    tmr = setTimeout(async () => {
      const v = input.value.trim();
      if (v.length < 2) { resultsBox.innerHTML = ''; return; }
      let list = [];
      try { list = await (await fetch(`/api/players?q=${encodeURIComponent(v)}&limit=8`)).json(); } catch (e) {}
      if (!Array.isArray(list)) list = [];
      resultsBox.innerHTML = list.filter(x => x.address !== exclude).slice(0, 8)
        .map(x => `<div class="pp-cmp-item" data-a="${x.address}">${esc(x.name)} <span class="cmp-sub">CA ${x.ca ?? '?'} · PA ${x.pa ?? '?'}</span></div>`).join('');
      resultsBox.querySelectorAll('.pp-cmp-item').forEach(it => it.addEventListener('click', () => {
        resultsBox.innerHTML = ''; input.value = it.textContent.replace(/CA.*$/, '').trim(); onPick(it.dataset.a);
      }));
    }, 250);
  });
}

// ---------------- Player page additions ----------------
PP_TABS.splice(PP_TABS.findIndex(t => t[0] === 'comparison') + 1, 0, ['clone', '', 'Clone Center']);
let showProjection = false;

const _r3RenderPlayer = renderPlayer;
renderPlayer = function (address, p) {
  _r3RenderPlayer(address, p);
  const pan = (k) => playerDetail.querySelector(`.pp-panel[data-tab="${k}"]`);
  const info = pan('info');

  // header: birthplace / player-coach
  const sub = playerDetail.querySelector('.pp-sub');
  if (sub && p.playerCoach) sub.insertAdjacentHTML('beforeend', `<span class="pp-slash">/</span><span>Player-Coach</span>`);

  // Information: extra rows
  const grid = info && info.querySelector('.pp-grid');
  if (grid) {
    grid.insertAdjacentHTML('beforeend', `<div class="pp-k">Tempat lahir</div><div class="pp-v">${esc(p.birthplace || '—')}</div>`);
  }
  if (info && p.extra) {
    const e = p.extra;
    const num = (k, label, min, max) => e[k] === undefined ? '' : `<div class="card"><label>${label}</label><input type="number" min="${min}" max="${max}" value="${e[k]}" data-field="${k}"></div>`;
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="pp-sec">Karier Internasional</div>
      <div class="finance-grid">${num('intCaps', 'Caps Internasional', 0, 999)}${num('intGoals', 'Gol Internasional', 0, 999)}${num('u21Caps', 'Caps U21', 0, 255)}${num('u21Goals', 'Gol U21', 0, 255)}</div>
      <div class="pp-sec">Nama <span class="cmp-sub">— pilih nama yang sudah ada di save (seperti FM, nama baru tidak bisa dibuat)</span></div>
      <div class="pp-names">${['first', 'last', 'common'].map(w => `
        <div class="pp-name-row"><span class="pp-k">${{ first: 'Nama depan', last: 'Nama belakang', common: 'Nama populer' }[w]}</span>
          <span class="pp-v pp-name-cur" data-w="${w}">${esc(p.names?.[w] || '—')}</span>
          <div class="pp-cmp-search pp-name-search"><input type="text" placeholder="Cari nama…" data-w="${w}"><div class="pp-name-res"></div></div></div>`).join('')}</div>
      <div class="pp-sec">Penampilan <span class="cmp-sub">— eksperimental: belum dipastikan terlihat di match engine</span></div>
      <div class="finance-grid">
        <div class="card"><label>Etnis</label><select data-field="ethnicity">${ETHNICITY.map((l, i) => `<option value="${i}" ${i === e.ethnicity ? 'selected' : ''}>${i}${l ? " - " + l : ""}</option>`).join('')}${e.ethnicity > 10 ? `<option value="${e.ethnicity}" selected>${e.ethnicity} - not set</option>` : ''}</select></div>
        ${num('skinTone', 'Warna Kulit (0-19)', 0, 19)}${num('hairColour', 'Warna Rambut (0-18)', 0, 18)}${num('hairLength', 'Panjang Rambut (0-6)', 0, 6)}
      </div>`;
    info.appendChild(box);
    wireStage(box, address);
    // name search
    box.querySelectorAll('.pp-name-search input').forEach(inp => {
      const res = inp.nextElementSibling;
      let tmr = null;
      inp.addEventListener('input', () => {
        clearTimeout(tmr);
        tmr = setTimeout(async () => {
          const q = inp.value.trim();
          if (q.length < 2) { res.innerHTML = ''; return; }
          res.innerHTML = '<div class="pp-cmp-item cmp-sub">Mencari… (pertama kali agak lama)</div>';
          let list = [];
          try { list = await (await fetch(`/api/names?q=${encodeURIComponent(q)}&limit=12`)).json(); } catch (err) {}
          if (!Array.isArray(list)) { res.innerHTML = `<div class="pp-cmp-item cmp-sub">${esc(list.error || 'error')}</div>`; return; }
          res.innerHTML = list.length ? list.map(n => `<div class="pp-cmp-item" data-rec="${n.rec}">${esc(n.text)} <span class="cmp-sub">dipakai ${n.uses} orang</span></div>`).join('')
            : '<div class="pp-cmp-item cmp-sub">Nama ini tidak ada di save.</div>';
          res.querySelectorAll('[data-rec]').forEach(it => it.addEventListener('click', async () => {
            res.innerHTML = '';
            try {
              const w = inp.dataset.w;
              const r = await postJson(`/api/players/${address}/name`, { which: w, rec: it.dataset.rec });
              editHistory.unshift({ entity: 'player', address, name: r.name, field: `Ganti ${w} name → ${it.textContent.replace(/dipakai.*$/, '').trim()}`,
                time: Date.now(), undone: false, noUndo: !r.oldRec, custom: r.oldRec ? { type: 'name', refresh: address, items: [{ address, nameRestore: { which: w, oldRec: r.oldRec } }] } : undefined });
              renderHistory(); undoLastBtn.disabled = !editHistory.some(x => !x.undone && !x.noUndo);
              toast(`Nama diganti: ${r.name} (FM menampilkan setelah 1 hari / profil belum pernah dibuka)`);
              openPlayer(address);
            } catch (err) { toast(err.message, true); }
          }));
        }, 300);
      });
    });
  }

  // Contract: clauses
  const ct = pan('contract');
  if (ct && p.clauses && p.clauses.length) {
    const box = document.createElement('div');
    box.innerHTML = `<div class="pp-sec">Klausul Kontrak</div><div class="finance-grid">${p.clauses.map(c => c.editable
      ? `<div class="card"><label>${c.label} (£)</label><input type="number" min="0" value="${c.amount}" data-field="clause:${c.idx}:${c.type}"></div>`
      : `<div class="card"><label>${c.label}</label><input type="text" disabled value="${c.unit === '%' ? (c.amount || c.value) + '%' : c.unit === 'thn' ? (c.amount || c.value) + ' tahun' : c.amount + ' / ' + c.value}"></div>`).join('')}</div>`;
    ct.appendChild(box);
    wireStage(box, address);
  }

  // Positions: rating per position
  const ps = pan('positions');
  if (ps) {
    ps.querySelectorAll('.attr-row input[data-field^="pos_"]').forEach(inp => {
      const r = posRating(p.attributes, inp.dataset.field);
      inp.parentElement.insertAdjacentHTML('beforeend', `<span class="pos-rate" title="Rating atribut untuk posisi ini (0-100)" style="--r:${r}">${r}</span>`);
    });
    ps.insertAdjacentHTML('beforeend', `<div class="save-hint">Angka kanan = kecocokan atribut untuk posisi itu (0-100), dihitung dari bobot atribut kunci. Angka kiri = familiarity posisi di FM (1-20).</div>`);
  }

  // Attributes: PA projection toggle
  const at = pan('attributes');
  if (at) {
    const proj = projectAttrs(p);
    const btn = document.createElement('button');
    btn.className = 'tpl-btn'; btn.style.marginBottom = '10px';
    const paint = () => {
      at.querySelectorAll('.proj').forEach(x => x.remove());
      btn.textContent = showProjection ? 'Sembunyikan proyeksi PA' : `Tampilkan proyeksi PA (${Object.keys(proj).length} atribut naik)`;
      if (!showProjection) return;
      at.querySelectorAll('.attr-row input[data-field]').forEach(inp => {
        const v = proj[inp.dataset.field];
        if (v) inp.parentElement.insertAdjacentHTML('beforeend', `<span class="proj" title="Perkiraan saat mencapai PA">→ ${v}</span>`);
      });
    };
    btn.addEventListener('click', () => { showProjection = !showProjection; paint(); });
    at.insertBefore(btn, at.children[1]);
    const apply = document.createElement('button');
    apply.className = 'tpl-btn'; apply.style.margin = '0 0 10px 8px'; apply.textContent = 'Stage proyeksi (jadikan pemain "sudah berkembang")';
    apply.addEventListener('click', () => {
      let n = 0;
      for (const [k, v] of Object.entries(proj)) n += stageField(k, v);
      n += stageField('ca', p.pa);
      toast(n ? `${n} field di-stage → klik Save Changes` : 'Tidak ada yang berubah');
    });
    at.insertBefore(apply, btn.nextSibling);
    paint();
  }

  // Clone Center
  const cl = pan('clone');
  if (cl) {
    const groups = [['__capa', 'CA & PA'], ...Object.keys(CATEGORIES).map(c => [c, c]), ['__pos', 'Positions'], ['__pers', 'Personality']];
    cl.insertAdjacentHTML('beforeend', `<div class="pp-box">
      <div class="save-hint" style="margin-top:0">Salin atribut dari pemain lain ke <b>${esc(p.name)}</b>. Semua nilai masuk Pending dulu → klik Save Changes.</div>
      <div class="pp-cmp-search"><input type="text" id="cl-q" placeholder="Pemain sumber…"><div id="cl-res"></div></div>
      <div id="cl-src" class="cmp-sub" style="margin:6px 0 10px">Belum ada pemain sumber.</div>
      <div class="cl-groups">${groups.map(([k, l]) => `<label class="checkbox-row"><input type="checkbox" data-g="${k}" checked> ${l}</label>`).join('')}</div>
      <button class="tpl-btn primary" id="cl-go" disabled>Salin ke ${esc(p.name)}</button></div>`);
    let src = null;
    playerPicker(document.getElementById('cl-q'), document.getElementById('cl-res'), address, async (a) => {
      src = await (await fetch(`/api/players/${a}`)).json();
      if (src.error) { toast(src.error, true); src = null; return; }
      document.getElementById('cl-src').textContent = `Sumber: ${src.name} · CA ${src.ca} / PA ${src.pa}`;
      document.getElementById('cl-go').disabled = false;
    });
    document.getElementById('cl-go').addEventListener('click', () => {
      if (!src) return;
      const on = new Set([...cl.querySelectorAll('[data-g]:checked')].map(x => x.dataset.g));
      let n = 0;
      if (on.has('__capa')) { n += stageField('ca', src.ca); n += stageField('pa', src.pa); }
      for (const [cat, keys] of Object.entries(CATEGORIES)) if (on.has(cat)) for (const k of keys) if (src.attributes[k] !== undefined) n += stageField(k, src.attributes[k]);
      if (on.has('__pos')) for (const [k, v] of Object.entries(src.positions || {})) n += stageField(k, v);
      if (on.has('__pers')) for (const [k, v] of Object.entries(src.personality || {})) n += stageField(k, v);
      toast(n ? `${n} field disalin dari ${src.name} → klik Save Changes` : 'Semua nilai sudah sama');
    });
  }
};

// ---------------- CSV export for search results ----------------
let lastSearchPlayers = null;
const _r3RunQuick = runQuickSearch;
runQuickSearch = async function (chips, leftover) {
  const origPost = postJson;
  postJson = async (url, body) => { const r = await origPost(url, body); if (url === '/api/search') lastSearchPlayers = r.players; return r; };
  try { await _r3RunQuick(chips, leftover); } finally { postJson = origPost; }
  if (!lastSearchPlayers || !lastSearchPlayers.length || mode !== 'players') return;
  const btn = document.createElement('button');
  btn.className = 'tpl-btn'; btn.style.margin = '0 16px 10px'; btn.textContent = 'Export CSV';
  btn.addEventListener('click', () => {
    const cols = ['name', 'age', 'pos', 'club', 'nation', 'ca', 'pa', 'uid'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...lastSearchPlayers.map(r => cols.map(c => q(r[c])).join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    a.download = `fm27-search-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  });
  resultsEl.appendChild(btn);
};

// ---------------- Club page: social media, supporters, Best XI ----------------
const FORMATIONS = {
  '4-3-3': [['pos_gk', 50, 90], ['pos_dl', 9, 73], ['pos_dc', 35, 76], ['pos_dc', 65, 76], ['pos_dr', 91, 73], ['pos_dm', 50, 61], ['pos_mc', 31, 45], ['pos_mc', 69, 45], ['pos_aml', 15, 24], ['pos_amr', 85, 24], ['pos_st', 50, 9]],
  '4-4-2': [['pos_gk', 50, 90], ['pos_dl', 9, 73], ['pos_dc', 35, 76], ['pos_dc', 65, 76], ['pos_dr', 91, 73], ['pos_ml', 9, 42], ['pos_mc', 37, 47], ['pos_mc', 63, 47], ['pos_mr', 91, 42], ['pos_st', 39, 11], ['pos_st', 61, 11]],
  '4-2-3-1': [['pos_gk', 50, 90], ['pos_dl', 9, 73], ['pos_dc', 35, 76], ['pos_dc', 65, 76], ['pos_dr', 91, 73], ['pos_dm', 37, 61], ['pos_dm', 63, 61], ['pos_aml', 15, 27], ['pos_amc', 50, 29], ['pos_amr', 85, 27], ['pos_st', 50, 9]],
  '4-1-4-1': [['pos_gk', 50, 90], ['pos_dl', 9, 73], ['pos_dc', 35, 76], ['pos_dc', 65, 76], ['pos_dr', 91, 73], ['pos_dm', 50, 62], ['pos_ml', 9, 40], ['pos_mc', 37, 44], ['pos_mc', 63, 44], ['pos_mr', 91, 40], ['pos_st', 50, 9]],
  '3-5-2': [['pos_gk', 50, 90], ['pos_dc', 25, 75], ['pos_dc', 50, 77], ['pos_dc', 75, 75], ['pos_wbl', 9, 52], ['pos_dm', 50, 61], ['pos_mc', 31, 42], ['pos_mc', 69, 42], ['pos_wbr', 91, 52], ['pos_st', 39, 11], ['pos_st', 61, 11]],
  '5-3-2': [['pos_gk', 50, 90], ['pos_wbl', 9, 61], ['pos_dc', 27, 75], ['pos_dc', 50, 77], ['pos_dc', 73, 75], ['pos_wbr', 91, 61], ['pos_mc', 27, 44], ['pos_mc', 50, 48], ['pos_mc', 73, 44], ['pos_st', 39, 11], ['pos_st', 61, 11]],
  '4-2-4': [['pos_gk', 50, 90], ['pos_dl', 9, 73], ['pos_dc', 35, 76], ['pos_dc', 65, 76], ['pos_dr', 91, 73], ['pos_mc', 37, 49], ['pos_mc', 63, 49], ['pos_aml', 11, 22], ['pos_amr', 89, 22], ['pos_st', 39, 9], ['pos_st', 61, 9]],
};
const POS_SHORT = { pos_gk: 'GK', pos_sw: 'SW', pos_dl: 'DL', pos_dc: 'DC', pos_dr: 'DR', pos_dm: 'DM', pos_ml: 'ML', pos_mc: 'MC', pos_mr: 'MR', pos_aml: 'AML', pos_amc: 'AMC', pos_amr: 'AMR', pos_st: 'ST', pos_wbl: 'WBL', pos_wbr: 'WBR' };

// Best XI assignment: exact optimum by dynamic programming over the set of
// slots already filled (2^slots states, slots <= 12), one player at a time.
// score[slot][player] -> returns res[slot] = player index (or -1).
function bestAssignment(score) {
  const S = score.length, N = S ? score[0].length : 0, FULL = 1 << S;
  let best = new Float64Array(FULL).fill(-Infinity); best[0] = 0;
  const choice = []; // choice[i][mask] = slot player i took to reach mask (-1 = skipped)
  for (let i = 0; i < N; i++) {
    const next = Float64Array.from(best), ch = new Int8Array(FULL).fill(-1);
    for (let m = 0; m < FULL; m++) {
      if (best[m] === -Infinity) continue;
      for (let sl = 0; sl < S; sl++) {
        if (m & (1 << sl)) continue;
        const nm = m | (1 << sl), v = best[m] + score[sl][i];
        if (v > next[nm]) { next[nm] = v; ch[nm] = sl; }
      }
    }
    choice.push(ch); best = next;
  }
  // most slots filled first, then highest score
  let bm = 0;
  const pc = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
  for (let m = 0; m < FULL; m++) if (best[m] > -Infinity && (pc(m) > pc(bm) || (pc(m) === pc(bm) && best[m] > best[bm]))) bm = m;
  const res = new Array(S).fill(-1);
  for (let i = N - 1, m = bm; i >= 0 && m; i--) { const sl = choice[i][m]; if (sl >= 0) { res[sl] = i; m &= ~(1 << sl); } }
  return res;
}
function slotScore(pl, posKey) { return posRating(pl.attrs, posKey) * famFactor(pl.positions?.[posKey] || 1); }

async function renderBestXI(clubAddress, box) {
  box.innerHTML = '<div class="empty-hint">Menghitung…</div>';
  let sq;
  try { sq = await (await fetch(`/api/clubs/${clubAddress}/squad-detail`)).json(); } catch (e) { sq = { error: e.message }; }
  if (sq.error) { box.innerHTML = `<div class="warning">${esc(sq.error)}</div>`; return; }
  const teams = sq.teams || [];
  box.innerHTML = `<div class="xi-controls">
      <select id="xi-form">${Object.keys(FORMATIONS).map(f => `<option>${f}</option>`).join('')}</select>
      <select id="xi-team"><option value="all">Semua tim klub</option>${teams.map((t, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>${i === 0 ? 'Tim Utama' : 'Tim Cadangan/Muda ' + i} (${t.players.length})</option>`).join('')}</select>
      <label class="checkbox-row"><input type="checkbox" id="xi-fit" checked> Tanpa pemain cedera/larangan</label>
    </div><div class="xi-wrap"><div class="xi-pitch" id="xi-pitch"></div><div class="xi-side" id="xi-side"></div></div>
    <div class="save-hint">Saran MagicPencil27 berdasarkan atribut + familiarity posisi. Taktik di FM tidak diubah. Klik pemain untuk membuka profilnya.</div>`;
  const draw = () => {
    const form = FORMATIONS[document.getElementById('xi-form').value];
    const tsel = document.getElementById('xi-team').value;
    let pool = (tsel === 'all' ? teams.flatMap(t => t.players) : teams[+tsel].players).filter(x => x.attrs);
    const seen = new Set(); pool = pool.filter(x => !seen.has(x.address) && seen.add(x.address));
    if (document.getElementById('xi-fit').checked) pool = pool.filter(x => !x.injured && !x.banned);
    const pitch = document.getElementById('xi-pitch'), side = document.getElementById('xi-side');
    if (pool.length < 11) { pitch.innerHTML = `<div class="empty-hint" style="color:#fff">Pemain kurang dari 11 (${pool.length}).</div>`; side.innerHTML = ''; return; }
    const score = form.map(([k]) => pool.map(pl => slotScore(pl, k)));
    const pick = bestAssignment(score);
    let total = 0;
    pitch.innerHTML = form.map(([k, x, y], i) => {
      const pl = pool[pick[i]], s = score[i][pick[i]]; total += s;
      const fam = pl.positions?.[k] || 1;
      return `<div class="xi-card ${fam < 12 ? 'xi-weak' : ''}" style="left:${x}%;top:${y}%" data-a="${pl.address}" title="${esc(pl.name)} · ${POS_SHORT[k]} familiarity ${fam}/20">
        <div class="xi-rt">${Math.round(s)}</div><div class="xi-nm">${esc(shortName(pl.name))}</div><div class="xi-ps">${POS_SHORT[k]}</div></div>`;
    }).join('');
    const used = new Set(pick);
    const bench = pool.map((pl, j) => ({ pl, j, best: Math.max(...Object.keys(POS_WEIGHTS).map(k => slotScore(pl, k))), bk: Object.keys(POS_WEIGHTS).reduce((a, k) => slotScore(pl, k) > slotScore(pl, a) ? k : a, 'pos_gk') }))
      .filter(x => !used.has(x.j)).sort((a, b) => b.best - a.best).slice(0, 9);
    side.innerHTML = `<div class="xi-total">Rating formasi <b>${(total / 11).toFixed(1)}</b></div><div class="pp-sec" style="margin-top:6px">Cadangan terbaik</div>` +
      bench.map(b => `<div class="xi-bench" data-a="${b.pl.address}"><span>${esc(b.pl.name)}</span><span class="cmp-sub">${POS_SHORT[b.bk]} ${Math.round(b.best)}</span></div>`).join('');
    box.querySelectorAll('[data-a]').forEach(el => el.addEventListener('click', () => { returnToClub = { address: clubAddress, name: document.querySelector('#club-detail h1')?.textContent || 'klub' }; openPlayer(el.dataset.a); }));
  };
  ['xi-form', 'xi-team', 'xi-fit'].forEach(id => document.getElementById(id).addEventListener('change', draw));
  draw();
}

const _r3RenderClub = renderClub;
renderClub = function (address, c) {
  _r3RenderClub(address, c);
  // social media input next to facilities
  const grid = clubDetail.querySelector('#club-extra');
  if (grid && c.extra && c.extra.socialMedia !== undefined) {
    grid.insertAdjacentHTML('beforeend', `<div class="card"><label>Social Media Followers</label><input type="number" min="0" value="${c.extra.socialMedia}" data-field="socialMedia"></div>`);
    const inp = grid.querySelector('input[data-field="socialMedia"]');
    inp.dataset.prevValue = JSON.stringify(Number(inp.value));
    inp.addEventListener('change', () => stageClubInput(address, inp));
  }
  const meta = clubDetail.querySelector('.header-bar .meta');
  if (meta && c.nation) meta.insertAdjacentHTML('beforeend', `<span>${esc(c.nation)}</span>`);
  if (c.supporters && grid) {
    const L = ['Core', 'Family', 'Fair-weather', 'Casual', 'Corporate', 'Hardcore'];
    grid.insertAdjacentHTML('afterend', `<div class="pp-box" style="margin-top:10px"><div class="pp-sec" style="margin-top:0">Komposisi suporter (read-only, label belum pasti)</div>
      <div class="sup-bar">${c.supporters.map((v, i) => `<span style="flex:${v || 0.01}" title="Grup ${i + 1}: ${v}%">${v}%</span>`).join('')}</div></div>`);
  }
  // Best XI section before the squad
  const squadWrap = clubDetail.querySelector('#squad-wrap');
  if (squadWrap) {
    const title = squadWrap.previousElementSibling;
    const sec = document.createElement('div');
    sec.innerHTML = `<div class="section-title">Best XI (Team Selection)</div><div id="xi-box"><button class="tpl-btn primary" id="xi-go">Hitung Best XI</button></div>`;
    title.parentElement.insertBefore(sec, title);
    document.getElementById('xi-go').addEventListener('click', () => renderBestXI(address, document.getElementById('xi-box')));
  }
};

// ---------------- Klub Saya (club of the human manager) ----------------
let myClubs = [];
async function refreshMyClubs(autoOpen) {
  const nav = document.querySelector('.my-club-nav');
  try { myClubs = await (await fetch('/api/my-clubs')).json(); } catch (e) { myClubs = []; }
  if (!Array.isArray(myClubs) || !myClubs.length) { myClubs = []; nav.classList.add('hidden'); return; }
  nav.classList.remove('hidden');
  nav.querySelector('.my-club-label').textContent = myClubs.length === 1 ? myClubs[0].name : 'Klub Saya';
  if (autoOpen) switchMode('myclub');
}
function renderMyClubList() {
  resultsEl.innerHTML = '';
  for (const c of myClubs) {
    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `<div class="avatar">${initials(c.name)}</div><div class="info"><div class="name">${esc(c.fullName || c.name)}</div><div class="sub">Manager: ${esc(c.manager || '—')}</div></div>`;
    row.addEventListener('click', () => {
      resultsEl.querySelectorAll('.result-row').forEach(r2 => r2.classList.remove('selected'));
      row.classList.add('selected'); returnToClub = null; openClub(c.address);
    });
    resultsEl.appendChild(row);
  }
  const first = resultsEl.querySelector('.result-row');
  if (first && myClubs.length === 1) first.click();
}
const _myClubSwitch = switchMode;
switchMode = function (m) {
  if (m === 'myclub') {
    mode = m;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    [searchWrap, filterWrap, bulkBar, historyPanel, soonPanel].forEach(el => el.classList.add('hidden'));
    const chips = document.getElementById('qs-chips'); if (chips) chips.classList.add('hidden');
    resultsEl.classList.remove('hidden');
    renderMyClubList();
    return;
  }
  return _myClubSwitch(m);
};
document.querySelector('.my-club-nav').addEventListener('click', () => switchMode('myclub'));
window.onDataLoaded = () => refreshMyClubs(true);

// ---------------- visual helpers: FM-style value tiers + readable money ----------------
function tierOf(v) { v = Number(v); if (!v) return ''; return v <= 5 ? 1 : v <= 10 ? 2 : v <= 14 ? 3 : v <= 17 ? 4 : 5; }
function paintTier(inp) {
  if (!inp.closest('.attr-row') || inp.dataset.field?.startsWith('pos_')) return;
  const t = String(tierOf(inp.value));
  if (t && inp.dataset.tier !== t) inp.dataset.tier = t; else if (!t && inp.dataset.tier) delete inp.dataset.tier;
}
const MONEY_RX = /£|\$|balance|budget|wage|value|price|income|spend|tickets|followers/i;
function paintMoney(inp) {
  const card = inp.closest('.card'); if (!card || inp.type !== 'number') return;
  const label = card.querySelector('label'); if (!label) return;
  const v = Number(inp.value);
  let fmt = label.querySelector('.fmt');
  const labelText = (label.firstChild && label.firstChild.nodeType === 3) ? label.firstChild.textContent : label.textContent;
  if (!MONEY_RX.test(labelText) || !isFinite(v) || Math.abs(v) < 10000) { if (fmt && fmt.textContent) fmt.textContent = ''; return; }
  if (!fmt) { fmt = document.createElement('span'); fmt.className = 'fmt'; label.appendChild(fmt); }
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  const txt = a >= 1e9 ? s + (a / 1e9).toFixed(2).replace('.', ',') + ' M' : a >= 1e6 ? s + (a / 1e6).toFixed(1).replace('.', ',') + ' jt' : s + Math.round(a / 1e3) + ' rb';
  if (fmt.textContent !== txt) fmt.textContent = txt;
}
function paintAll(root) {
  root.querySelectorAll('.attr-row input[data-field]').forEach(paintTier);
  root.querySelectorAll('.card input[type="number"]').forEach(paintMoney);
}
const detailRoot = document.getElementById('detail');
let paintQueued = false;
new MutationObserver(() => { if (paintQueued) return; paintQueued = true; (window.requestAnimationFrame || setTimeout)(() => { paintQueued = false; paintAll(detailRoot); }); }).observe(detailRoot, { childList: true, subtree: true });
detailRoot.addEventListener('input', (e) => { if (e.target.matches('input')) { paintTier(e.target); paintMoney(e.target); } });
detailRoot.addEventListener('change', (e) => { if (e.target.matches('input')) { paintTier(e.target); paintMoney(e.target); } });
