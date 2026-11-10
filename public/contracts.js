// =====================================================================
// Contract renewal helper ("Kontrak"): lists every contract of the user's
// club sorted by expiry, recommends renew / let go per player, and extends
// contracts (expiry date, optional wage) directly in one click or in bulk.
// Every change goes into Edit History with a single Undo item.
// =====================================================================
const KT_STATUS = { 1: 'Star', 2: 'Penting', 3: 'Reguler', 4: 'Skuad', 5: 'Impact Sub', 6: 'Fringe', 7: 'Muda', 8: 'Pemain muda' };
const ktDays = (a, b) => Math.round((new Date(a) - new Date(b)) / 864e5);
const ktAddYears = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const mm = m, dd = (mm === 2 && d === 29) ? 28 : d; return `${y + n}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`; };
const ktSeasonEnd = (todayIso, years) => { const [y, m] = todayIso.split('-').map(Number); const base = m >= 7 ? y + 1 : y; return `${base + years - 1}-06-30`; };

// recommendation: { act: 'renew'|'short'|'let'|'ok', years, why, prio }
function ktAdvise(r, rank, n, today) {
  const c = r.contract; if (!c) return { act: 'none', why: 'Tidak punya kontrak' };
  const left = ktDays(c.expiry, today), age = r.age || 25, grow = (r.pa || r.ca) - r.ca;
  const core = rank < Math.min(14, Math.ceil(n * 0.5)), fringe = rank >= Math.max(20, Math.ceil(n * 0.75));
  const urgent = left <= 183, soon = left <= 365;
  const why = [];
  why.push(`CA ${r.ca} peringkat ${rank + 1}/${n} di skuad`);
  if (left < 0) why.push('kontrak sudah lewat'); else why.push(`sisa ${left} hari`);
  let act = 'ok', years = 0, prio = 0;
  if (age <= 23 && grow >= 15) { act = 'renew'; years = 4; prio = 3; why.push(`muda, potensi +${grow}`); }
  else if (core && age <= 29) { act = 'renew'; years = 3; prio = 3; why.push('pemain inti'); }
  else if (core && age <= 32) { act = 'short'; years = age >= 31 ? 1 : 2; prio = 2; why.push(`inti, umur ${age}: kontrak pendek`); }
  else if (core) { act = 'short'; years = 1; prio = 1; why.push(`umur ${age}: 1 musim`); }
  else if (fringe && age >= 24 && grow < 10) { act = 'let'; prio = 0; why.push('jarang dibutuhkan: biarkan habis / jual'); }
  else if (age <= 21) { act = 'renew'; years = 3; prio = 1; why.push('pemain muda'); }
  else { act = 'short'; years = 2; prio = 1; why.push('pelapis'); }
  if (!soon && act !== 'let') { why.push('belum mendesak'); }
  return { act, years, why: why.join(' · '), prio: prio + (urgent ? 3 : soon ? 1 : -2), urgent, soon, left };
}

const ktNav = (() => {
  const b = document.createElement('button');
  b.className = 'nav-item contract-nav hidden'; b.dataset.mode = 'contracts'; b.textContent = 'Kontrak';
  (document.querySelector('.scout-nav') || document.querySelector('.my-club-nav')).after(b);
  b.addEventListener('click', () => switchMode('contracts'));
  return b;
})();
const ktPanel = (() => { const d = document.createElement('div'); d.id = 'contract-detail'; d.className = 'hidden'; document.getElementById('detail').appendChild(d); return d; })();
const _ktRefresh = refreshMyClubs;
refreshMyClubs = async function (a) { await _ktRefresh(a); ktNav.classList.toggle('hidden', !myClubs.length); };
const _ktOpenPlayer = openPlayer; openPlayer = function (...a) { ktPanel.classList.add('hidden'); return _ktOpenPlayer(...a); };
const _ktOpenClub = openClub; openClub = function (...a) { ktPanel.classList.add('hidden'); return _ktOpenClub(...a); };
const _ktSwitch = switchMode;
switchMode = function (m) {
  if (m !== 'contracts') { ktPanel.classList.add('hidden'); return _ktSwitch(m); }
  mode = m;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  [searchWrap, filterWrap, bulkBar, historyPanel, soonPanel, resultsEl].forEach(el => el.classList.add('hidden'));
  ['detail-empty', 'player-detail', 'club-detail', 'entity-detail', 'compare-detail', 'training-detail', 'scout-detail'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
  ktPanel.classList.remove('hidden');
  renderContracts();
};

async function renderContracts() {
  const club = myClubs[0];
  if (!club) { ktPanel.innerHTML = '<div class="empty-hint">Load Data dulu.</div>'; return; }
  ktPanel.innerHTML = '<div class="empty-hint">Membaca kontrak…</div>';
  let sq, info = {};
  try {
    const r = await fetch(`/api/clubs/${club.address}/contracts`); sq = await r.json(); if (!r.ok || sq.error) throw new Error(sq.error || r.statusText);
    try { info = await (await fetch(`/api/scout/club/${club.address}`)).json(); } catch (e) {}
  } catch (e) { ktPanel.innerHTML = `<div class="warning">${esc(e.message)}</div>`; return; }
  const today = sq.today || (trainGameDate || new Date().toISOString()).slice(0, 10);
  const cfgKey = 'fm27-contract-cfg-' + club.address;
  const cfg = Object.assign({ team: 'all', window: 365, wageMode: 'keep', lenMode: 'advice', fixedYears: 2 }, lsGet(cfgKey, {}));
  const save = () => lsSet(cfgKey, cfg);
  const all = sq.teams.flatMap((t, ti) => t.players.map(p => Object.assign(p, { teamIdx: ti })));
  const ranked = [...all].sort((a, b) => (b.ca || 0) - (a.ca || 0));
  all.forEach(p => { p.adv = ktAdvise(p, ranked.indexOf(p), ranked.length, today); });
  let rows = all.filter(p => p.contract && (cfg.team === 'all' || String(p.teamIdx) === cfg.team));
  if (cfg.window > 0) rows = rows.filter(p => p.adv.left <= cfg.window);
  rows.sort((a, b) => a.adv.left - b.adv.left);
  const wageSum = all.reduce((t, p) => t + (p.contract?.wage || 0), 0);
  const counts = { u: all.filter(p => p.adv.urgent).length, s: all.filter(p => p.adv.soon && !p.adv.urgent).length };
  const newExpiry = (p) => {
    const yrs = cfg.lenMode === 'fixed' ? cfg.fixedYears : (p.adv.years || 2);
    return ktSeasonEnd(today, yrs) > p.contract.expiry ? ktSeasonEnd(today, yrs) : ktAddYears(p.contract.expiry, yrs);
  };
  const newWage = (p) => { const w = p.contract.wage; return cfg.wageMode === 'keep' ? w : cfg.wageMode === 'p10' ? Math.round(w * 1.1 / 10) * 10 : Math.round(w * 1.2 / 10) * 10; };
  const ACT = { renew: ['Perpanjang', 'ok'], short: ['Pendek', 'mid'], let: ['Biarkan', 'bad'], ok: ['Aman', ''], none: ['—', ''] };

  ktPanel.innerHTML = `
    <div class="tr-head"><div><div class="tac-k">${esc(club.fullName || club.name)}</div><h1>Kontrak</h1>
      <p class="tac-desc">Semua kontrak pemain diurutkan dari yang paling cepat habis, dengan saran perpanjang atau biarkan. Perpanjangan langsung ditulis ke FM tanpa negosiasi, dan bisa di-Undo dari Edit History.</p></div></div>
    <div class="tr-summary kt-sum">
      <div><span class="tac-k">Habis &lt; 6 bulan</span><b style="color:var(--bad)">${counts.u}</b><span class="tac-iw">harus segera diputuskan</span></div>
      <div><span class="tac-k">Habis 6–12 bulan</span><b style="color:#c9c23b">${counts.s}</b><span class="tac-iw">bisa diperpanjang sekarang</span></div>
      <div><span class="tac-k">Total gaji / minggu</span><b>${scMoney(wageSum)}</b><span class="tac-iw">${info.wageBudget != null ? 'budget ' + scMoney(info.wageBudget) : ''}</span></div>
      <div><span class="tac-k">Tanggal game</span><b>${new Date(today).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</b><span class="tac-iw"></span></div>
    </div>
    <div class="tac-controls">
      <label>Tim <select id="kt-team"><option value="all">Semua</option>${sq.teams.map((t, i) => `<option value="${i}" ${String(i) === cfg.team ? 'selected' : ''}>${i === 0 ? 'Tim Utama' : 'Cadangan/Muda ' + i}</option>`).join('')}</select></label>
      <label>Tampilkan <select id="kt-win">${[[183, 'Habis < 6 bulan'], [365, 'Habis < 12 bulan'], [730, 'Habis < 2 tahun'], [0, 'Semua']].map(([v, n]) => `<option value="${v}" ${v === cfg.window ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Durasi <select id="kt-len"><option value="advice" ${cfg.lenMode === 'advice' ? 'selected' : ''}>Sesuai saran</option>${[1, 2, 3, 4, 5].map(n => `<option value="f${n}" ${cfg.lenMode === 'fixed' && cfg.fixedYears === n ? 'selected' : ''}>${n} musim</option>`).join('')}</select></label>
      <label>Gaji <select id="kt-wage"><option value="keep" ${cfg.wageMode === 'keep' ? 'selected' : ''}>Tetap</option><option value="p10" ${cfg.wageMode === 'p10' ? 'selected' : ''}>+10%</option><option value="p20" ${cfg.wageMode === 'p20' ? 'selected' : ''}>+20%</option></select></label>
      <button class="tpl-btn" id="kt-pick">Centang semua yang disarankan</button>
      <button class="tpl-btn primary" id="kt-apply">Perpanjang yang dicentang</button>
    </div>
    ${rows.length ? `<table class="squad-table kt-table"><thead><tr><th></th><th>Pemain</th><th>Umur</th><th>Pos</th><th>CA/PA</th><th>Status</th><th>Gaji</th><th>Habis</th><th>Saran</th><th>Jadi</th><th></th></tr></thead><tbody>
      ${rows.map(p => { const a = p.adv, [lbl, cls] = ACT[a.act]; const ne = newExpiry(p), nw = newWage(p);
        return `<tr data-a="${p.address}" class="${a.urgent ? 'kt-urgent' : ''}">
        <td><input type="checkbox" class="kt-chk" ${a.act === 'let' ? '' : ''}></td>
        <td class="nm kt-nm">${esc(p.name)}</td><td>${p.age ?? ''}</td><td>${esc(p.pos || '')}</td><td>${p.ca}/${p.pa}</td>
        <td>${esc(KT_STATUS[p.contract.squadStatus] || '')}</td><td>${scMoney(p.contract.wage)}</td>
        <td class="kt-exp"><b class="${a.urgent ? 'bad' : a.soon ? 'mid' : ''}">${new Date(p.contract.expiry).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</b><div class="sc-sub">${a.left < 0 ? 'lewat' : a.left + ' hari'}</div></td>
        <td><span class="kt-act kt-${cls}">${lbl}${a.years ? ' ' + a.years + ' th' : ''}</span><div class="sc-sub">${esc(a.why)}</div></td>
        <td class="kt-new">${new Date(ne).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })}<div class="sc-sub">${nw !== p.contract.wage ? scMoney(nw) + '/mgg' : 'gaji tetap'}</div></td>
        <td><button class="tpl-btn kt-one">Perpanjang</button></td></tr>`; }).join('')}</tbody></table>`
      : '<div class="empty-hint">Tidak ada kontrak yang habis dalam rentang ini.</div>'}
    <div class="save-hint">Perpanjangan mengubah tanggal habis kontrak (dan gaji kalau dipilih) langsung di FM, seperti FMLE: tanpa negosiasi, agen, atau klausul baru. Kalau pemain sedang dalam negosiasi kontrak di FM, batalkan dulu negosiasinya. Saran memakai peringkat CA di skuad, umur dan potensi; tetap putuskan sendiri untuk pemain kunci. Simpan save FM dulu.</div>`;

  const on = (id, ev, f) => document.getElementById(id)?.addEventListener(ev, f);
  on('kt-team', 'change', e => { cfg.team = e.target.value; save(); renderContracts(); });
  on('kt-win', 'change', e => { cfg.window = +e.target.value; save(); renderContracts(); });
  on('kt-len', 'change', e => { const v = e.target.value; if (v === 'advice') cfg.lenMode = 'advice'; else { cfg.lenMode = 'fixed'; cfg.fixedYears = +v.slice(1); } save(); renderContracts(); });
  on('kt-wage', 'change', e => { cfg.wageMode = e.target.value; save(); renderContracts(); });
  on('kt-pick', 'click', () => ktPanel.querySelectorAll('tr[data-a]').forEach(tr => { const p = rows.find(x => x.address === tr.dataset.a); tr.querySelector('.kt-chk').checked = p && (p.adv.act === 'renew' || p.adv.act === 'short') && p.adv.soon; }));
  ktPanel.querySelectorAll('.kt-nm').forEach(td => td.addEventListener('click', () => { returnToClub = null; openPlayer(td.closest('tr').dataset.a); }));

  const extend = async (list) => {
    if (!list.length) { toast('Centang pemain dulu'); return; }
    if (!confirm(`Perpanjang ${list.length} kontrak langsung di FM? Simpan save FM dulu sebagai cadangan.`)) return;
    const items = [], fail = [];
    for (const p of list) {
      const ne = newExpiry(p), nw = newWage(p), it = { address: p.address };
      try {
        await postJson(`/api/players/${p.address}`, { field: 'contract.expiry', value: ne }); it.oldExpiry = p.contract.expiry;
        if (nw !== p.contract.wage) { await postJson(`/api/players/${p.address}`, { field: 'contract.wage', value: nw }); it.oldWage = p.contract.wage; }
        items.push(it);
      } catch (e) { fail.push(p.name + ': ' + e.message); }
    }
    if (items.length) {
      editHistory.unshift({ entity: 'player', address: items[0].address, name: club.name, field: `Perpanjang kontrak (${items.length} pemain)`, oldValue: null, newValue: null, time: Date.now(), undone: false, custom: { items } });
      undoLastBtn.disabled = false; if (mode === 'history') renderHistory();
    }
    toast(fail.length ? `Gagal: ${fail[0]}` : `${items.length} kontrak diperpanjang`, !!fail.length);
    renderContracts();
  };
  on('kt-apply', 'click', () => extend(rows.filter(p => ktPanel.querySelector(`tr[data-a="${p.address}"] .kt-chk`)?.checked)));
  ktPanel.querySelectorAll('.kt-one').forEach(b => b.addEventListener('click', () => extend([rows.find(x => x.address === b.closest('tr').dataset.a)])));
}
