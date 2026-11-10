// =====================================================================
// Transfer advisor ("Saran transfer"): finds the weakest slots of the
// user's team for the tactic in use, then scans the database for players
// who would improve those slots, fit the tactic style, and are affordable /
// realistic. Read-only: the user makes the bids in FM.
// Uses FORMATIONS, slotScore, bestAssignment, POS_SHORT (extras2.js),
// TAC_STYLES, FM_STYLE_KEY (tactics.js / training.js), esc, toast.
// =====================================================================

// attributes a style needs per slot (on top of the position weights)
const SC_NEEDS = {
  gegen: { all: ['work_rate', 'stamina', 'aggression', 'teamwork'], pos_dc: ['pace', 'acceleration', 'anticipation'], pos_st: ['work_rate', 'acceleration'], pos_aml: ['work_rate', 'acceleration'], pos_amr: ['work_rate', 'acceleration'], pos_gk: ['rushing_out', 'one_on_ones'] },
  possession: { all: ['passing', 'first_touch', 'composure', 'decisions'], pos_dc: ['passing', 'composure'], pos_gk: ['passing', 'kicking'], pos_dm: ['vision', 'passing'] },
  counter: { all: ['pace', 'acceleration', 'off_the_ball'], pos_st: ['finishing', 'pace'], pos_dc: ['positioning', 'concentration'] },
  wing: { all: ['crossing', 'pace'], pos_st: ['heading', 'jumping_reach', 'strength'] },
  lowblock: { all: ['positioning', 'concentration', 'teamwork'], pos_dc: ['heading', 'jumping_reach', 'strength', 'marking'] },
};
const SC_MODES = {
  now: { name: 'Langsung main', age: [21, 30], desc: 'Siap jadi starter sekarang.' },
  young: { name: 'Investasi muda', age: [16, 22], desc: 'Potensi tinggi, bisa dijual mahal nanti.' },
  cheap: { name: 'Murah / gratis', age: [18, 33], desc: 'Free agent atau kontrak hampir habis.' },
};
const scMoney = (v) => v == null ? '—' : v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.', ',') + ' jt' : v >= 1e3 ? Math.round(v / 1e3) + ' rb' : String(v);
const scAvg = (p, keys) => { let s = 0, n = 0; for (const k of keys) { const v = p.attrs?.[k]; if (v) { s += v; n++; } } return n ? s / n : 10; };
const scSide = { pos_dl: 'kiri', pos_wbl: 'kiri', pos_ml: 'kiri', pos_aml: 'kiri', pos_dr: 'kanan', pos_wbr: 'kanan', pos_mr: 'kanan', pos_amr: 'kanan' };

function scNeedsFor(styleKey, slot) { const n = SC_NEEDS[styleKey] || {}; return [...(n.all || []), ...(n[slot] || [])]; }
// fit 0-100 for a slot under the tactic: position rating (75%) + style attributes (25%)
function scFit(p, slot, styleKey) { return slotScore(p, slot) * 0.75 + scAvg(p, scNeedsFor(styleKey, slot)) * 5 * 0.25; }

function scFormation(fm) {
  const name = (fm && (fm.formation || fm.name)) || '';
  const key = Object.keys(FORMATIONS).find(k => name.startsWith(k));
  return key || '4-3-3';
}

// team analysis: starter + backup per slot, need score
function scAnalyse(players, formKey, styleKey) {
  const form = FORMATIONS[formKey];
  const pool = players.filter(p => p.attrs);
  const score = form.map(([k]) => pool.map(p => scFit(p, k, styleKey)));
  const pick = bestAssignment(score);
  const starters = new Set(pick);
  const slots = form.map(([k, x, y], i) => {
    const st = pool[pick[i]], fit = score[i][pick[i]];
    const backups = pool.map((p, j) => ({ p, f: score[i][j] })).filter((b, j) => !starters.has(j) && (b.p.positions?.[k] || 1) >= 12).sort((a, b) => b.f - a.f);
    return { k, x, y, i, starter: st, fit, backup: backups[0] || null };
  });
  const avg = slots.reduce((t, s) => t + s.fit, 0) / slots.length;
  for (const s of slots) {
    const why = []; let need = 0;
    const gap = avg - s.fit; if (gap > 2) { need += gap; why.push(`starter ${s.fit.toFixed(0)} di bawah rata-rata XI (${avg.toFixed(0)})`); }
    if (!s.backup) { need += 8; why.push('tidak ada pelapis'); }
    else if (s.backup.f < s.fit - 10) { need += 4; why.push(`pelapis lemah (${shortName(s.backup.p.name)} ${s.backup.f.toFixed(0)})`); }
    if ((s.starter.age || 0) >= 32) { need += 4; why.push(`starter berusia ${s.starter.age}`); }
    const na = scNeedsFor(styleKey, s.k), sa = scAvg(s.starter, na);
    if (sa < 11) { need += (11 - sa) * 2; why.push(`atribut gaya ${TAC_STYLES[styleKey].name.toLowerCase()} rendah (${sa.toFixed(1)})`); }
    s.need = need; s.why = why;
  }
  // de-duplicate symmetric slots (two DC): keep the needier one, mark the other as same group
  return { slots, avg };
}

function scScore(c, need, styleKey, ctx) {
  const fit = scFit(c, need.k, styleKey), gain = fit - need.fit;
  const reasons = [];
  reasons.push(`${POS_SHORT[need.k]} ${fit.toFixed(0)} vs starter ${need.fit.toFixed(0)} (${gain >= 0 ? '+' : ''}${gain.toFixed(0)})`);
  const na = scNeedsFor(styleKey, need.k).filter(k => (c.attrs[k] || 0) >= 14).slice(0, 3);
  if (na.length) reasons.push('cocok ' + TAC_STYLES[styleKey].name + ': ' + na.map(k => k.replace(/_/g, ' ') + ' ' + c.attrs[k]).join(', '));
  let s = gain * 2;
  // affordability / realism
  const cost = c.freeAgent ? 0 : Math.max(c.value || 0, c.askingPrice > 0 ? c.askingPrice : 0);
  if (ctx.budget && cost > ctx.budget) s -= 30;
  else if (ctx.budget) s += (1 - cost / ctx.budget) * 6;
  if (c.freeAgent) { s += 6; reasons.push('free agent'); }
  const exp = c.expiry ? new Date(c.expiry) : null;
  if (exp && ctx.today && (exp - ctx.today) / 864e5 < 200 && !c.freeAgent) { s += 4; reasons.push('kontrak habis ' + exp.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })); }
  if (c.transferListed) { s += 3; reasons.push('transfer listed'); }
  let realism = 'Realistis';
  if (ctx.rep && c.clubRep > ctx.rep * 1.6) { s -= 8; realism = 'Sulit'; }
  else if (ctx.rep && c.clubRep > ctx.rep * 1.25) { s -= 3; realism = 'Mungkin'; }
  if (ctx.mode === 'young') { const g = (c.pa || c.ca) - c.ca; s += g / 6; if (g > 20) reasons.push(`potensi +${g} CA`); }
  if (ctx.mode === 'now' && (c.age || 0) >= 31) s -= 4;
  if (c.injured) { s -= 5; reasons.push('sedang cedera'); }
  if (c.positions[need.k] < 15) { s -= 3; reasons.push(`posisi ${POS_SHORT[need.k]} belum natural (${c.positions[need.k]}/20)`); }
  return { s, fit, gain, cost, realism, reasons };
}

// ---------------- UI ----------------
const scNav = (() => {
  const b = document.createElement('button');
  b.className = 'nav-item scout-nav hidden'; b.dataset.mode = 'scout'; b.textContent = 'Saran transfer';
  (document.querySelector('.training-nav') || document.querySelector('.my-club-nav')).after(b);
  b.addEventListener('click', () => switchMode('scout'));
  return b;
})();
const scPanel = (() => { const d = document.createElement('div'); d.id = 'scout-detail'; d.className = 'hidden'; document.getElementById('detail').appendChild(d); return d; })();
const _scRefresh = refreshMyClubs;
refreshMyClubs = async function (a) { await _scRefresh(a); scNav.classList.toggle('hidden', !myClubs.length); };
const _scOpenPlayer = openPlayer; openPlayer = function (...a) { scPanel.classList.add('hidden'); return _scOpenPlayer(...a); };
const _scOpenClub = openClub; openClub = function (...a) { scPanel.classList.add('hidden'); return _scOpenClub(...a); };
const _scSwitch = switchMode;
switchMode = function (m) {
  if (m !== 'scout') { scPanel.classList.add('hidden'); return _scSwitch(m); }
  mode = m;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  [searchWrap, filterWrap, bulkBar, historyPanel, soonPanel, resultsEl].forEach(el => el.classList.add('hidden'));
  ['detail-empty', 'player-detail', 'club-detail', 'entity-detail', 'compare-detail', 'training-detail'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
  scPanel.classList.remove('hidden');
  renderScout();
};

let SC = null;
async function renderScout() {
  const club = myClubs[0];
  if (!club) { scPanel.innerHTML = '<div class="empty-hint">Load Data dulu: saran transfer butuh klub yang kamu latih.</div>'; return; }
  scPanel.innerHTML = '<div class="empty-hint">Menganalisis skuad…</div>';
  const getJ = async (u, body) => { const r = await fetch(u, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || r.statusText); return j; };
  try {
    if (!SC || SC.club.address !== club.address) {
      const [sq, info] = await Promise.all([getJ(`/api/clubs/${club.address}/squad-detail`), getJ(`/api/scout/club/${club.address}`).catch(() => ({}))]);
      SC = { club, sq, info, results: null };
    }
    try { SC.fm = (await getJ('/api/tactic/current')).tactic || null; } catch (e) { SC.fm = null; }
  } catch (e) { scPanel.innerHTML = `<div class="warning">${esc(e.message)}</div>`; return; }
  const cfgKey = 'fm27-scout-cfg-' + club.address;
  const cfg = Object.assign({ mode: 'now', budget: SC.info.transferBudget > 0 ? SC.info.transferBudget : 1000000, wage: 0, picks: null }, lsGet(cfgKey, {}));
  const team = SC.sq.teams[0];
  const styleKey = SC.fm ? (FM_STYLE_KEY[SC.fm.style] || 'gegen') : chooseStyle(teamProfile(team.players.filter(p => p.attrs)), 'mid').key;
  const formKey = scFormation(SC.fm);
  const an = scAnalyse(team.players, formKey, styleKey);
  const needs = [...an.slots].sort((a, b) => b.need - a.need);
  if (!cfg.picks) cfg.picks = needs.filter(n => n.need > 3).slice(0, 3).map(n => n.i);
  const save = () => lsSet(cfgKey, cfg);
  const tierC = (v) => v >= 75 ? 'var(--ok)' : v >= 65 ? '#c9c23b' : v >= 55 ? '#e39a3b' : 'var(--bad)';

  scPanel.innerHTML = `
    <div class="tr-head"><div><div class="tac-k">${esc(club.fullName || club.name)}</div><h1>Saran transfer</h1>
      <p class="tac-desc">Editor membaca kelemahan skuad untuk ${SC.fm ? `taktik yang kamu pakai (<b>${esc(SC.fm.name)}</b>)` : `taktik yang disarankan (<b>${formKey} ${TAC_STYLES[styleKey].name}</b>)`}, lalu mencari pemain di seluruh database yang memperbaiki posisi itu, cocok dengan gaya main, dan masuk budget. Tawaran tetap kamu ajukan sendiri di FM.</p></div></div>
    <div class="tr-summary sc-sum">
      <div><span class="tac-k">Transfer budget</span><b>${SC.info.transferBudget != null ? scMoney(SC.info.transferBudget) : 'tidak terbaca'}</b><span class="tac-iw">${SC.info.wageBudget != null ? 'Budget gaji ' + scMoney(SC.info.wageBudget) + '/minggu' + (SC.info.wageSpend != null ? ' · terpakai ' + scMoney(SC.info.wageSpend) : '') : 'Isi batas harga di bawah'}</span></div>
      <div><span class="tac-k">Reputasi klub</span><b>${SC.info.reputation ?? '—'}</b><span class="tac-iw">Pemain dari klub jauh lebih besar ditandai "Sulit"</span></div>
      <div><span class="tac-k">Rata-rata XI</span><b>${an.avg.toFixed(0)}</b><span class="tac-iw">Kecocokan posisi + gaya, skala 0–100</span></div>
    </div>
    <div class="section-title">Kebutuhan skuad (${formKey}, ${TAC_STYLES[styleKey].name})</div>
    <div class="sc-needs">${needs.map(n => `<label class="sc-need${cfg.picks.includes(n.i) ? ' on' : ''}" data-i="${n.i}">
        <input type="checkbox" ${cfg.picks.includes(n.i) ? 'checked' : ''}>
        <span class="sc-pos">${POS_SHORT[n.k]}</span>
        <span class="sc-st">${esc(n.starter.name)} <b style="color:${tierC(n.fit)}">${n.fit.toFixed(0)}</b>${n.backup ? ` <i>· pelapis ${esc(shortName(n.backup.p.name))} ${n.backup.f.toFixed(0)}</i>` : ' <i>· tanpa pelapis</i>'}</span>
        <span class="sc-why">${n.why.length ? esc(n.why.join('; ')) : 'aman'}</span>
        <span class="sc-bar"><s style="width:${Math.min(100, n.need * 5)}%"></s></span></label>`).join('')}</div>
    <div class="tac-controls">
      <label>Tipe <select id="sc-mode">${Object.entries(SC_MODES).map(([k, m]) => `<option value="${k}" ${k === cfg.mode ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>
      <label>Harga maks <input type="number" id="sc-budget" value="${cfg.budget}" step="100000" style="width:130px"></label>
      <button class="tpl-btn primary" id="sc-go">Cari pemain untuk posisi yang dicentang</button>
      <span class="tac-iw">${esc(SC_MODES[cfg.mode].desc)}</span>
    </div>
    <div id="sc-out">${SC.results ? '' : '<div class="empty-hint">Centang posisi yang mau diperkuat, lalu klik Cari.</div>'}</div>
    <div class="save-hint">Skor = kecocokan posisi (bobot atribut seperti Best XI) + atribut yang dibutuhkan gaya ${TAC_STYLES[styleKey].name}. Nilai transfer dari database FM (harga asli bisa lebih mahal, terutama kontrak panjang). "Sulit" = klubnya jauh lebih besar dari klubmu. Pakai fitur Scouting di FM untuk konfirmasi sebelum menawar.</div>`;

  scPanel.querySelectorAll('.sc-need').forEach(el => el.addEventListener('click', (e) => {
    e.preventDefault(); const i = +el.dataset.i;
    cfg.picks = cfg.picks.includes(i) ? cfg.picks.filter(x => x !== i) : [...cfg.picks, i]; save(); renderScout();
  }));
  document.getElementById('sc-mode').onchange = (e) => { cfg.mode = e.target.value; save(); renderScout(); };
  document.getElementById('sc-budget').onchange = (e) => { cfg.budget = Math.max(0, +e.target.value || 0); save(); };
  const draw = () => {
    const out = document.getElementById('sc-out'); const R = SC.results; if (!R) return;
    out.innerHTML = R.map(g => `<div class="section-title">${POS_SHORT[g.need.k]} · ganti/lapis ${esc(g.need.starter.name)} (${g.need.fit.toFixed(0)})</div>
      ${g.list.length ? `<table class="squad-table sc-table"><thead><tr><th>Pemain</th><th>Umur</th><th>CA/PA</th><th>Klub</th><th>Skor posisi</th><th>Harga</th><th>Gaji</th><th>Peluang</th><th>Alasan</th><th></th></tr></thead><tbody>
        ${g.list.map(c => `<tr data-a="${c.address}"><td class="nm">${esc(c.name)}<div class="sc-sub">${esc(c.pos || '')} · ${esc(c.nation || '')}</div></td><td>${c.age ?? ''}</td><td>${c.ca}/${c.pa ?? ''}</td>
          <td>${c.freeAgent ? '<i>Free agent</i>' : esc(c.club)}</td><td><b style="color:${tierC(c.sc.fit)}">${c.sc.fit.toFixed(0)}</b> <span class="sc-gain">${c.sc.gain >= 0 ? '+' : ''}${c.sc.gain.toFixed(0)}</span></td>
          <td>${c.freeAgent ? '0' : scMoney(c.sc.cost)}</td><td>${scMoney(c.wage)}</td><td class="sc-r sc-r-${c.sc.realism}">${c.sc.realism}</td><td class="sc-why">${esc(c.sc.reasons.join(' · '))}</td><td><button class="tpl-btn sc-sl">+ Shortlist</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="empty-hint">Tidak ada pemain yang lebih baik dalam batas harga ini. Naikkan harga maks atau ganti tipe.</div>'}`).join('');
    out.querySelectorAll('tr[data-a]').forEach(tr => tr.addEventListener('click', (e) => { if (e.target.closest('.sc-sl')) return; returnToClub = null; openPlayer(tr.dataset.a); }));
    out.querySelectorAll('.sc-sl').forEach(b => b.addEventListener('click', () => scShortlist([b.closest('tr').dataset.a], b)));
    const bar = document.createElement('div'); bar.className = 'tac-controls'; bar.innerHTML = '<button class="tpl-btn primary" id="sc-slall">Masukin semua kandidat ke shortlist FM</button>'; out.prepend(bar);
    bar.querySelector('button').addEventListener('click', (e) => scShortlist([...out.querySelectorAll('tr[data-a]')].map(t => t.dataset.a), e.target));
  };
  document.getElementById('sc-go').onclick = async (e) => {
    const btn = e.target; btn.disabled = true; btn.textContent = 'Memindai database…';
    try {
      const picks = cfg.picks.map(i => an.slots[i]);
      if (!picks.length) throw new Error('Centang minimal satu posisi');
      const m = SC_MODES[cfg.mode];
      const uniq = []; for (const p of picks) if (!uniq.find(u => u.k === p.k)) uniq.push(p);
      const q = {
        slots: uniq.map(p => ({ key: p.k, minCa: cfg.mode === 'young' ? 60 : Math.max(60, Math.min(170, (p.starter.ca || 100) - 8)), maxCa: cfg.mode === 'young' ? 170 : 200 })),
        ageMin: m.age[0], ageMax: m.age[1], maxValue: cfg.mode === 'cheap' ? Math.min(cfg.budget, 300000) : cfg.budget,
        excludeClub: club.address, perSlot: 120,
      };
      const r = await getJ('/api/scout/players', q);
      const ctx = { budget: cfg.budget, rep: SC.info.reputation, mode: cfg.mode, today: trainGameDate ? new Date(trainGameDate) : new Date() };
      SC.results = picks.map(need => {
        let list = (r.slots[need.k] || []).filter(c => c.attrs);
        if (cfg.mode === 'cheap') list = list.filter(c => c.freeAgent || (c.expiry && (new Date(c.expiry) - ctx.today) / 864e5 < 200) || (c.value || 0) <= 300000);
        list.forEach(c => c.sc = scScore(c, need, styleKey, ctx));
        list = list.filter(c => c.sc.gain > (cfg.mode === 'young' ? -15 : 1)).sort((a, b) => b.sc.s - a.sc.s).slice(0, 8);
        return { need, list };
      });
      draw();
    } catch (err) { toast(err.message); }
    btn.disabled = false; btn.textContent = 'Cari pemain untuk posisi yang dicentang';
  };
  draw();
}

async function scShortlist(addrs, btn) {
  if (!addrs.length) return;
  if (addrs.length > 1 && !confirm('Masukin ' + addrs.length + ' pemain ke shortlist (Default) di FM?')) return;
  btn.disabled = true;
  try { const r = await postJson('/api/shortlist/add', { addresses: addrs }); btn.textContent = 'Masuk shortlist'; toast(r.sent + ' pemain dikirim ke shortlist FM'); }
  catch (e) { btn.disabled = false; toast(e.message, true); }
}
