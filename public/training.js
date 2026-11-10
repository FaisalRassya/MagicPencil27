// =====================================================================
// Training planner: builds a week-by-week FM27 training schedule (3 sessions
// per day) from the fixtures the user marks, the squad profile and the
// suggested tactic (tactics.js). Read-only: the user copies it into FM's
// Training > Overview screen. Session names/categories come from the user's
// FM27 screenshots (Game Pass, March 2027).
// =====================================================================

const TR_CATS = {
  TU: { name: 'Tactical Understanding', cls: 'tr-tu' },
  MP: { name: 'Match Preparation', cls: 'tr-mp' },
  PD: { name: 'Playing Development', cls: 'tr-pd' },
  PH: { name: 'Physical and Recovery', cls: 'tr-ph' },
  XC: { name: 'Extra-Curricular', cls: 'tr-xc' },
};
// load = rough share of a day's intensity; trains = Team Instructions the session drills
const SESSIONS = {
  'Passing Style': { cat: 'TU', load: 1.5, trains: ['Passing Directness', 'Tempo'], about: 'Tempo dan gaya umpan sesuai taktik.' },
  'Build Up': { cat: 'TU', load: 1.5, trains: ['Build-Up Strategy', 'Goal Kicks', 'GK Distribution (Speed)', 'GK Distribution'], about: 'Cara membangun serangan dari belakang.' },
  'Chance Creation': { cat: 'TU', load: 1.5, trains: ['Patience', 'Shots from Distance', 'Crossing Style', 'Dribbling'], about: 'Cara menciptakan peluang di sepertiga akhir.' },
  'In Possession Shape': { cat: 'TU', load: 1.5, trains: ['Attacking Width', 'Supporting Runs', 'Progress Through', 'Pass Reception', 'Attacking Transition'], about: 'Bentuk tim saat menguasai bola.' },
  'Line of Engagement': { cat: 'TU', load: 1.5, trains: ['Line of Engagement', 'Defensive Line'], about: 'Di mana tim mulai menekan dan tinggi garis bek.' },
  'Pressing Intensity': { cat: 'TU', load: 1.8, trains: ['Trigger Press', 'Defensive Transition'], about: 'Seberapa sering dan cepat tim menekan.' },
  'Pressing Trap': { cat: 'TU', load: 1.5, trains: ['Pressing Trap', 'Short Goalkeeper Distribution'], about: 'Menggiring lawan ke area jebakan.' },
  'Out Of Possession Shape': { cat: 'TU', load: 1.5, trains: ['Defensive Line Behaviour', 'Tackling', 'Cross Engagement'], about: 'Bentuk tim saat tidak menguasai bola.' },
  'Press Avoidance': { cat: 'MP', load: 1.2, about: 'Organisasi di belakang bola saat menguasai bola, khusus untuk laga berikutnya.' },
  'Ball Progression': { cat: 'MP', load: 1.2, about: 'Membawa bola melewati lini tengah lawan berikutnya.' },
  'Final Third': { cat: 'MP', load: 1.2, about: 'Pola serangan di sepertiga akhir melawan lawan berikutnya.' },
  'Defensive Engagement': { cat: 'MP', load: 1.2, about: 'Menekan lawan berikutnya di area yang tepat.' },
  'Defensive Block': { cat: 'MP', load: 1.2, about: 'Blok bertahan rapat melawan lawan berikutnya.' },
  'Defensive Positioning': { cat: 'MP', load: 1.2, about: 'Posisi bertahan melawan pola serangan lawan berikutnya.' },
  'Corners': { cat: 'MP', load: .8, about: 'Bola mati: tendangan sudut.' },
  'Free Kicks': { cat: 'MP', load: .8, about: 'Bola mati: tendangan bebas.' },
  'Penalties': { cat: 'MP', load: .6, about: 'Penalti, penting sebelum laga gugur.' },
  'Individual Development': { cat: 'PD', load: 1.5, about: 'Fokus latihan individu tiap pemain (atur di Individual Training).' },
  'Rest': { cat: 'PH', load: 0, about: 'Istirahat.' },
  'Recovery': { cat: 'PH', load: .4, about: 'Pemulihan bersama tim medis dan sports science: kondisi & kelelahan membaik, sharpness turun sedikit.' },
  'Light Conditioning': { cat: 'PH', load: 1, about: 'Kebugaran ringan.' },
  'Conditioning': { cat: 'PH', load: 2, about: 'Kebugaran: stamina dan kondisi fisik.' },
  'Heavy Conditioning': { cat: 'PH', load: 3, about: 'Kebugaran berat: risiko cedera dan kelelahan tinggi.' },
};
const TU_LIST = Object.keys(SESSIONS).filter(k => SESSIONS[k].cat === 'TU');
const OBJECTIVES = {
  auto: 'Rekomendasi', balanced: 'Seimbang', tactical: 'Taktik', match: 'Persiapan laga', physical: 'Fisik', dev: 'Pengembangan pemain',
};
// free-day templates (alternate A/B within a week)
const FREE_DAY = {
  balanced: [['TU', 'TU', 'COND'], ['PD', 'PD', 'Rest']],
  tactical: [['TU', 'TU', 'MP'], ['TU', 'TU', 'Rest']],
  match: [['MP', 'MP', 'TU'], ['TU', 'MP', 'Rest']],
  physical: [['HEAVY', 'TU', 'COND'], ['PD', 'COND', 'Rest']],
  dev: [['PD', 'PD', 'PD'], ['PD', 'TU', 'Rest']],
  preseason: [['COND', 'TU', 'HEAVY'], ['TU', 'COND', 'Rest']],
};
const DAYS_ID = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const FOCUS_SEEN = new Set(['Tactical & Match Focus Mix', 'Match Focus']);

let trainGameDate = null;
const trKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const trDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const fmtD = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
const lsGet = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } };
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ---- tactic link: which tactical sessions matter most for the tactic (read from FM when available) ----
const FM_STYLE_KEY = { 'Gegenpress': 'gegen', 'Control Possession': 'possession', 'Tiki-Taka': 'possession', 'Vertical Tiki-Taka': 'possession', 'Wing Play': 'wing', 'Route One': 'wing', 'Fluid Counter-Attack': 'counter', 'Direct Counter-Attack': 'counter', 'Catenaccio': 'lowblock', 'Park The Bus': 'lowblock' };
function trTacticContext(pool, fm) {
  const pr = teamProfile(pool);
  let val, styleKey, form, source;
  if (fm && fm.inPossession && fm.outOfPossession) {
    val = { ...fm.inPossession, ...fm.outOfPossession };
    const loe = val['Line of Engagement'];
    styleKey = FM_STYLE_KEY[fm.style] || (loe === 'High Press' ? 'gegen' : loe === 'Low Block' ? 'lowblock' : 'counter');
    form = fm.formation || fm.name || 'Taktik FM'; source = 'fm';
  } else {
    const st = chooseStyle(pr, 'mid');
    const F = rankFormations(pool, st.key)[0];
    const slots = F.form.map(([k, x, y], i) => ({ k, x, y, pl: pool[F.pick[i]] }));
    const ins = instructions(pr, st.key, 'mid', F.form, slots);
    const all = [...ins['In Possession'], ...ins['Out of Possession']];
    val = Object.fromEntries(all.map(r => [r.label, r.value])); styleKey = st.key; form = F.name; source = 'saran';
  }
  const prio = TU_LIST.map(s => {
    const hits = SESSIONS[s].trains.filter(t => val[t] && val[t] !== 'Standard' && val[t] !== 'Balanced');
    return { s, w: 1 + hits.length, hits: hits.map(h => `${h}: ${val[h]}`) };
  }).sort((a, b) => b.w - a.w);
  return { pr, styleKey, form, val, prio, source };
}

// ---- Tactical Effectiveness panel + advice ----
const TE_CORE = { gegen: ['Line of Engagement', 'Trigger Press', 'Defensive Transition'], possession: ['Passing Directness', 'Tempo', 'Build-Up Strategy'], counter: ['Attacking Transition', 'Line of Engagement'], wing: ['Attacking Width', 'Crossing Style'], lowblock: ['Line of Engagement', 'Defensive Line'] };
const TE_DEFAULT = { 'Passing Directness': 'Standard', 'Tempo': 'Standard', 'Attacking Width': 'Standard', 'Patience': 'Standard', 'Short Goalkeeper Distribution': 'No', 'Defensive Line': 'Standard', 'Trigger Press': 'Standard', 'Tackling': 'Standard', 'Goal Kicks': 'Mixed', 'Time Wasting': 'Standard', 'Play for Set Pieces': 'Keep Ball in Play' };
const teCol = (v) => v >= 70 ? 'var(--ok)' : v >= 55 ? '#c9c23b' : v >= 45 ? '#e39a3b' : 'var(--bad)';
function teAdvice(te, ctx) {
  const out = []; const core = new Set(TE_CORE[ctx.styleKey] || []);
  const areas = Object.entries(te.areas).sort((a, b) => a[1].value - b[1].value);
  for (const [name, a] of areas.filter(([, a]) => a.value < 50)) {
    const simp = (SESSIONS[name]?.trains || []).filter(k => ctx.val[k] && !['Standard', 'Balanced', 'Mixed'].includes(ctx.val[k]) && !core.has(k));
    out.push({ k: name, txt: `${name} ${a.value}/100: kontribusi latihan ${a.training}, pengalaman laga ${a.matches}. Planner menambah sesi ${name}.` + (simp.length && ctx.source === 'fm' ? ` Kalau ingin cepat naik, sederhanakan: ${simp.map(k => k + ' (' + ctx.val[k] + ' → ' + (TE_DEFAULT[k] || 'Balanced') + ')').join(', ')}.` : '') });
  }
  const f = te.factors || {};
  if (f['Quality of Next Opposition Report'] != null && f['Quality of Next Opposition Report'] < 55) out.push({ k: 'report', txt: `Laporan lawan ${f['Quality of Next Opposition Report']}/100: minta scout membuat Opposition Report sebelum laga (Tactics > Opposition).` });
  if (f['Teammates and Staff Relationships'] != null && f['Teammates and Staff Relationships'] < 58) out.push({ k: 'rel', txt: `Hubungan pemain dan staf ${f['Teammates and Staff Relationships']}/100: planner memasang Team Bonding seminggu sekali.` });
  if (f['Player Role Suitability'] != null && f['Player Role Suitability'] >= 85 && f['Head Coach Tendencies'] >= 85) out.push({ k: 'keep', txt: `Kecocokan peran ${f['Player Role Suitability']} dan dukungan gaya pelatih ${f['Head Coach Tendencies']}: pertahankan gaya ini, jangan ganti taktik. Masalahnya pemahaman, bukan taktiknya.` });
  const cx = Object.values(te.areas)[0]?.complexity;
  if (cx != null && cx < 50) out.push({ k: 'cx', txt: `Tactical Complexity ${cx}/100 (makin rendah makin sulit dipahami): kurangi instruksi non-standar yang bukan inti gaya ${TAC_STYLES[ctx.styleKey].name}.` });
  return out;
}
function teHtml(te, ctx) {
  if (!te) return `<div class="tr-te"><div class="tac-k">Tactical Effectiveness</div><div class="tac-iw">Belum dibaca dari FM. Area yang lemah akan ditandai otomatis dan diberi sesi lebih banyak.</div><button class="tpl-btn" id="tr-readte">Baca Tactical Effectiveness dari FM</button></div>`;
  const f = te.factors || {};
  return `<div class="tr-te"><div class="tr-te-head"><div class="tac-k">Tactical Effectiveness · dari FM</div><span class="tac-iw">dibaca ${new Date(te.readAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><button class="tpl-btn" id="tr-readte">Baca ulang</button></div>
    <div class="tr-te-grid">${Object.entries(te.areas).map(([k, a]) => `<div class="tr-te-a" title="Latihan ${a.training} · Laga ${a.matches} · Kemampuan taktik ${a.ability} · Kompleksitas ${a.complexity}"><span>${esc(k)}</span><b style="color:${teCol(a.value)}">${a.value}</b><i><s style="width:${a.value}%;background:${teCol(a.value)}"></s></i></div>`).join('')}</div>
    <div class="tr-te-f">${Object.entries(f).map(([k, v]) => `<span>${esc(k)} <b style="color:${teCol(v)}">${v}</b></span>`).join('')}</div>
    <ul class="tr-te-adv">${teAdvice(te, ctx).map(a => `<li>${esc(a.txt)}</li>`).join('')}</ul>
    ${(te.feedback || []).length ? `<div class="tac-iw">Kata staf FM: ${te.feedback.map(esc).join(' · ')}</div>` : ''}</div>`;
}

// ---- plan generation ----
function buildPlan(o) {
  // o: { start(Date, monday), weeks, fixtures{iso:'H'|'A'|'N'}, objective, ctx, injured, youth, weak:Set }
  const fx = o.fixtures;
  const matchDays = Object.keys(fx).filter(k => fx[k]).sort();
  const nextMatch = (d) => { const k = trKey(d); const m = matchDays.find(x => x > k); return m ? Math.round((trDay(m) - d) / 864e5) : 99; };
  const prevMatch = (d) => { const k = trKey(d); const m = [...matchDays].reverse().find(x => x < k); return m ? Math.round((d - trDay(m)) / 864e5) : 99; };
  const nextMatchType = (d) => { const k = trKey(d); const m = matchDays.find(x => x > k); return m ? fx[m] : null; };

  // tactical rotation, weighted by the tactic's non-standard instructions and the user's "weak" picks
  const cyc = [];
  for (const p of o.ctx.prio) { const tv = o.te && o.te.areas[p.s] ? o.te.areas[p.s].value : null; const w = Math.min(6, p.w + (o.weak.has(p.s) ? 3 : 0) + (tv != null ? Math.max(0, Math.round((58 - tv) / 6)) : 0)); for (let i = 0; i < w; i++) cyc.push(p.s); }
  const spread = []; const pools = {}; cyc.forEach(s => (pools[s] = (pools[s] || 0) + 1));
  while (Object.values(pools).some(n => n > 0)) for (const s of Object.keys(pools)) if (pools[s] > 0) { spread.push(s); pools[s]--; }
  let tuI = 0, pdI = 0, spI = 0;
  const nextTU = (avoid) => { for (let t = 0; t < spread.length; t++) { const s = spread[(tuI + t) % spread.length]; if (!avoid.includes(s)) { tuI += t + 1; return s; } } return spread[tuI++ % spread.length]; };
  const v = o.ctx.val;
  const atkPrep = v['Build-Up Strategy'] === 'Play Through Press' ? ['Press Avoidance', 'Final Third'] : ['Ball Progression', 'Final Third'];
  const defPrep = v['Line of Engagement'] === 'High Press' ? 'Defensive Engagement' : v['Line of Engagement'] === 'Low Block' ? 'Defensive Block' : 'Defensive Positioning';
  const setPieces = ['Corners', 'Free Kicks'];
  let objective = o.objective;
  let autoWhy = '';
  if (objective === 'auto') {
    if (o.youth) { objective = 'dev'; autoWhy = 'tim muda/cadangan: utamakan perkembangan pemain'; }
    else if (o.ctx.pr.engine < 11.5) { objective = 'physical'; autoWhy = `stamina skuad rendah (${o.ctx.pr.engine.toFixed(1)})`; }
    else if (o.ctx.prio.filter(p => p.w >= 3).length >= 3 || o.weak.size >= 2) { objective = 'tactical'; autoWhy = 'taktik punya banyak instruksi non-standar yang perlu dipahami pemain'; }
    else { objective = 'balanced'; autoWhy = 'skuad cukup bugar dan taktik tidak terlalu rumit'; }
  }
  const heavyOK = o.injured < 3;
  const resolve = (tok, used, why) => {
    if (tok === 'TU') { const s = nextTU(used); const p = o.ctx.prio.find(x => x.s === s); const tv = o.te && o.te.areas[s]; return [s, tv && tv.value < 50 ? `Tactical Effectiveness ${s} ${tv.value}/100 (latihan ${tv.training}, laga ${tv.matches})` : o.weak.has(s) ? 'Kamu tandai area ini lemah di Tactical Effectiveness' : p && p.hits.length ? 'Melatih ' + p.hits.join(', ') : 'Rotasi pemahaman taktik']; }
    if (tok === 'MP') { const s = [...atkPrep, defPrep][spI++ % 3]; return [s, 'Pola permainan untuk laga berikutnya']; }
    if (tok === 'PD') { pdI++; return ['Individual Development', 'Perkembangan atribut lewat fokus individu']; }
    if (tok === 'COND') return ['Conditioning', `Jaga kebugaran (stamina skuad ${o.ctx.pr.engine.toFixed(1)})`];
    if (tok === 'HEAVY') return heavyOK ? ['Heavy Conditioning', 'Hari tanpa laga dekat: aman untuk beban berat'] : ['Conditioning', `${o.injured} pemain cedera: beban berat dihindari`];
    return [tok, why || ''];
  };

  const weeks = [];
  for (let w = 0; w < o.weeks; w++) {
    const mon = addDays(o.start, w * 7);
    const days = []; let freeIdx = 0; let bonded = false;
    const rel = o.te && o.te.factors['Teammates and Staff Relationships'];
    const wkMatches = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i), k = trKey(d), m = fx[k];
      const dn = nextMatch(d), ds = prevMatch(d), nt = nextMatchType(d);
      const pre = (d.getMonth() === 6 || (d.getMonth() === 5 && d.getDate() > 20)) && dn > 3;
      let s;
      if (m) {
        wkMatches.push({ k, m, d });
        s = m === 'A' || m === 'N' ? [['Travel', 'Perjalanan ke laga tandang/netral'], ['MATCH', ''], ['Travel', 'Pulang']] : [['Rest', 'Istirahat sebelum kick-off'], ['MATCH', ''], ['Rest', 'Istirahat setelah laga']];
      } else if (ds === 1) {
        s = [['Recovery', 'Sehari setelah laga: pulihkan kondisi'], ['Rest', 'Pemulihan'], ['Rest', 'Pemulihan']];
      } else if (dn === 1) {
        const sp = nt === 'N' ? 'Penalties' : setPieces[spI % 2];
        if (ds === 2) s = [[defPrep, 'Laga beruntun: cukup persiapan bertahan'], [sp, nt === 'N' ? 'Laga netral/final: siapkan adu penalti' : 'Bola mati sebelum laga'], ['Rest', 'Jadwal padat: hemat tenaga']];
        else s = [[atkPrep[spI % 2], 'H-1: pola serangan untuk lawan'], [defPrep, 'H-1: pola bertahan untuk lawan'], [sp, nt === 'N' ? 'Laga netral/final: siapkan adu penalti' : 'Bola mati sebelum laga']];
        spI++;
      } else if (ds === 2 && dn <= 3) {
        s = [['Light Conditioning', 'Jadwal padat: kebugaran ringan saja'], resolve('MP', [], ''), ['Rest', 'Jadwal padat: hemat tenaga']];
      } else {
        const tpl = FREE_DAY[pre ? 'preseason' : objective][freeIdx++ % 2];
        const used = [];
        s = tpl.map(t => { const r = resolve(t, used); used.push(r[0]); return r; });
        if (dn === 2) s[2] = resolve('MP', used); // H-2: start opposition prep
        if (pre) s = s.map(r => [r[0], 'Pramusim: bangun kebugaran dan pemahaman taktik. ' + r[1]]);
        if (rel != null && rel < 58 && !bonded && s[2][0] === 'Rest' && dn > 1) { s[2] = ['Team Bonding', `Hubungan pemain dan staf ${rel}/100 (Player Buy-In)`]; bonded = true; }
      }
      const load = s.reduce((t, [n]) => t + (n === 'MATCH' ? 4 : SESSIONS[n]?.load || 0), 0);
      days.push({ d, k, m, slots: s.map(([n, why]) => ({ n, why })), load, pre });
    }
    const nM = wkMatches.length, big = wkMatches.some(x => x.m === 'N'), pre = days.every(x => x.pre || x.m);
    const type = nM >= 2 ? 'Padat' : big ? 'Laga besar' : nM === 1 ? 'Normal' : pre ? 'Pramusim' : 'Tanpa laga';
    const focus = nM >= 2 || big ? 'Match Focus' : pre ? 'Pre-Season' : 'Tactical & Match Focus Mix';
    const mList = wkMatches.map(x => `${DAYS_ID[(x.d.getDay() + 6) % 7]} ${x.m === 'H' ? 'kandang' : x.m === 'A' ? 'tandang' : 'netral/final'}`).join(', ');
    const why = {
      'Padat': `${nM} laga (${mList}): sesi berat dihindari, fokus pemulihan dan persiapan lawan.`,
      'Laga besar': `Laga netral/final (${mList}): persiapan lawan dan penalti, beban dijaga rendah.`,
      'Normal': `1 laga (${mList}): hari bebas dipakai untuk ${{ balanced: 'campuran taktik, fisik dan perkembangan', tactical: 'pemahaman taktik', match: 'persiapan laga', physical: 'kebugaran', dev: 'perkembangan pemain' }[objective]}.`,
      'Pramusim': 'Pramusim: bangun stamina dan pemahaman taktik sebelum musim dimulai.',
      'Tanpa laga': 'Tidak ada laga (jeda internasional?): waktu terbaik untuk taktik baru dan kebugaran.',
    }[type];
    weeks.push({ mon, days, type, focus, why, avg: days.reduce((t, d) => t + d.load, 0) / 7 });
  }
  return { weeks, objective, autoWhy };
}

// ---- UI ----
const trNav = (() => {
  const nav = document.querySelector('.nav-list');
  const b = document.createElement('button');
  b.className = 'nav-item training-nav hidden'; b.dataset.mode = 'training';
  b.textContent = 'Training planner';
  nav.querySelector('.my-club-nav').after(b);
  b.addEventListener('click', () => switchMode('training'));
  return b;
})();
const trPanel = (() => { const d = document.createElement('div'); d.id = 'training-detail'; d.className = 'hidden'; document.getElementById('detail').appendChild(d); return d; })();
const _trRefresh = refreshMyClubs;
refreshMyClubs = async function (a) { await _trRefresh(a); trNav.classList.toggle('hidden', !myClubs.length); };
const _trLoaded = window.onDataLoaded;
window.onDataLoaded = (info) => { trainGameDate = info?.date?.iso || null; return _trLoaded && _trLoaded(info); };
const hideTraining = () => trPanel.classList.add('hidden');
const _trOpenPlayer = openPlayer; openPlayer = function (...a) { hideTraining(); return _trOpenPlayer(...a); };
const _trOpenClub = openClub; openClub = function (...a) { hideTraining(); return _trOpenClub(...a); };
const _trSwitch = switchMode;
switchMode = function (m) {
  if (m !== 'training') { hideTraining(); return _trSwitch(m); }
  mode = m;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  [searchWrap, filterWrap, bulkBar, historyPanel, soonPanel, resultsEl].forEach(el => el.classList.add('hidden'));
  ['detail-empty', 'player-detail', 'club-detail', 'entity-detail', 'compare-detail'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
  trPanel.classList.remove('hidden');
  renderTraining();
};

let TR = null; // { club, teams, ctx..., plan }
async function renderTraining() {
  const club = myClubs[0];
  if (!club) { trPanel.innerHTML = '<div class="empty-hint">Load Data dulu: planner butuh klub yang kamu latih.</div>'; return; }
  if (!TR || TR.club.address !== club.address) {
    trPanel.innerHTML = '<div class="empty-hint">Membaca skuad…</div>';
    let sq; try { sq = await (await fetch(`/api/clubs/${club.address}/squad-detail`)).json(); } catch (e) { sq = { error: e.message }; }
    if (sq.error || !sq.teams?.length) { trPanel.innerHTML = `<div class="warning">${esc(sq.error || 'Skuad kosong')}</div>`; return; }
    TR = { club, teams: sq.teams };
  }
  const fxKey = 'fm27-train-fx-' + club.address, ovKey = 'fm27-train-ov-' + club.address, cfgKey = 'fm27-train-cfg-' + club.address;
  const cfg = Object.assign({ team: 0, objective: 'auto', weeks: 8, weak: [], start: null }, lsGet(cfgKey, {}));
  const today = trainGameDate ? new Date(trainGameDate) : new Date();
  const start = mondayOf(cfg.start ? trDay(cfg.start) : new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  let fixtures = lsGet(fxKey, null);
  const firstRun = !fixtures;
  if (!fixtures) { // placeholder: Saturday league games, alternating home/away, until the user marks the real fixtures
    fixtures = {}; for (let w = 0; w < 40; w++) fixtures[trKey(addDays(start, w * 7 + 5))] = w % 2 ? 'A' : 'H';
    lsSet(fxKey, fixtures);
  }
  const overrides = lsGet(ovKey, {});
  const team = TR.teams[cfg.team] || TR.teams[0];
  const pool = team.players.filter(p => p.attrs && !p.injured && !p.banned);
  if (pool.length < 11) { trPanel.innerHTML = '<div class="warning">Pemain fit kurang dari 11.</div>'; return; }
  try { TR.fm = (await (await fetch('/api/tactic/current')).json()).tactic || null; } catch (e) { TR.fm = null; }
  try { TR.te = (await (await fetch('/api/te/current')).json()).te || null; } catch (e) { TR.te = null; }
  const ctx = trTacticContext(pool, TR.fm);
  const teWeak = TR.te ? Object.entries(TR.te.areas).filter(([, a]) => a.value < 50).map(([k]) => k) : [];
  const injured = team.players.filter(p => p.injured).length;
  const plan = buildPlan({ start, weeks: cfg.weeks, fixtures, objective: cfg.objective, ctx, injured, youth: cfg.team > 0, weak: new Set([...cfg.weak, ...teWeak]), te: TR.te });
  const save = () => lsSet(cfgKey, cfg);

  const cell = (day, i) => {
    const sl = day.slots[i], ok = `${day.k}|${i}`, n = overrides[ok] || sl.n;
    if (n === 'MATCH') { const m = day.m; return `<div class="tr-s tr-match">${m === 'H' ? 'Laga kandang' : m === 'A' ? 'Laga tandang' : 'Final / netral'}<span>${m}</span></div>`; }
    if (n === 'Travel') return `<div class="tr-s tr-travel">Travel</div>`;
    const S = SESSIONS[n] || { cat: 'PH' };
    const cls = n === 'Rest' ? 'tr-rest' : TR_CATS[S.cat].cls;
    return `<div class="tr-s ${cls}${overrides[ok] ? ' tr-ov' : ''}" draggable="true" data-ok="${ok}" title="${esc(n + ' — ' + (overrides[ok] ? 'diubah manual' : sl.why))}"><b>S${i + 1}</b>${esc(n)}</div>`;
  };
  const loadOf = (day) => day.slots.reduce((t, sl, i) => { const n = overrides[`${day.k}|${i}`] || sl.n; return t + (n === 'MATCH' ? 4 : SESSIONS[n]?.load || 0); }, 0);

  trPanel.innerHTML = `
    <div class="tr-head">
      <div><div class="tac-k">${esc(club.fullName || club.name)}</div><h1>Training planner</h1>
        <p class="tac-desc">Jadwal ${cfg.weeks} minggu, 3 sesi per hari, disusun dari jadwal laga, kondisi skuad dan ${ctx.source === 'fm' ? 'taktik yang kamu pakai di FM' : 'taktik yang disarankan editor'}
        (<b>${esc(ctx.source === 'fm' ? (TR.fm.name || ctx.form) : ctx.form + ' ' + TAC_STYLES[ctx.styleKey].name)}</b>). Masukkan ke FM di Training &gt; Overview, per minggu.</p></div>
    </div>
    <div class="tac-controls">
      <label>Tim <select id="tr-team">${TR.teams.map((t, i) => `<option value="${i}" ${i === cfg.team ? 'selected' : ''}>${i === 0 ? 'Tim Utama' : 'Tim Cadangan/Muda ' + i}</option>`).join('')}</select></label>
      <label>Tujuan <select id="tr-obj">${Object.entries(OBJECTIVES).map(([k, n]) => `<option value="${k}" ${k === cfg.objective ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Mulai <input type="date" id="tr-start" value="${trKey(start)}"></label>
      <label>Durasi <select id="tr-weeks">${[2, 4, 8, 12, 16, 24, 40].map(n => `<option ${n === cfg.weeks ? 'selected' : ''}>${n}</option>`).join('')}</select> minggu</label>
      <button class="tpl-btn" id="tr-copy">Salin sebagai teks</button>
      <button class="tpl-btn" id="tr-reset">Hapus ubahan manual</button>
    </div>
    <div class="tr-summary">
      <div><span class="tac-k">Tujuan dipakai</span><b>${OBJECTIVES[plan.objective]}</b><span class="tac-iw">${cfg.objective === 'auto' ? esc(plan.autoWhy) : 'Pilihan manual'}</span></div>
      <div class="tr-tac"><span class="tac-k">Taktik</span><b>${ctx.source === 'fm' ? 'Dari FM' : 'Saran editor'}</b>
        <span class="tac-iw">${ctx.source === 'fm' ? esc(TR.fm.name || '') + ' · dibaca ' + new Date(TR.fm.readAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Belum dibaca dari FM'}</span>
        <button class="tpl-btn" id="tr-readtac">${ctx.source === 'fm' ? 'Baca ulang dari FM' : 'Baca taktik dari FM'}</button></div>
      <div><span class="tac-k">Stamina skuad</span><b>${ctx.pr.engine.toFixed(1)}</b><span class="tac-iw">${injured} cedera${injured >= 3 ? ', Heavy Conditioning dihindari' : ''}</span></div>
      <div class="tr-weak"><span class="tac-k">Prioritas taktik (klik yang LEMAH di FM: Training &gt; Tactical Effectiveness)</span>
        <div>${ctx.prio.map(p => `<button class="tr-chip${cfg.weak.includes(p.s) || teWeak.includes(p.s) ? ' on' : ''}" data-weak="${esc(p.s)}" title="${esc(p.hits.join(', ') || 'Instruksi standar')}">${esc(p.s)}${TR.te && TR.te.areas[p.s] ? ` <b class="tr-tev" style="color:${teCol(TR.te.areas[p.s].value)}">${TR.te.areas[p.s].value}</b>` : ''}<i>${'·'.repeat(Math.min(4, p.w))}</i></button>`).join('')}</div></div>
    </div>
    ${teHtml(TR.te, ctx)}
    <div class="tr-fm" id="tr-fm"><div class="tac-k">Pasang ke FM</div><div id="tr-fm-body" class="tac-iw">Memeriksa koneksi ke FM…</div></div>
    <div class="save-hint tr-fxhint">Klik <b>tanggal</b> untuk mengatur laga sesuai Fixture Schedule di FM: kosong → <b>H</b> kandang → <b>A</b> tandang → <b>N</b> final/netral → kosong. ${firstRun ? '<b>Jadwal laga awal masih contoh (tiap Sabtu), sesuaikan dulu.</b>' : ''} Klik sesi untuk ganti, atau seret ke sesi lain untuk menukar.</div>
    <div class="tr-cal">
      ${plan.weeks.map((wk, wi) => `<div class="tr-week">
        <div class="tr-wl">
          <div class="tac-k">Minggu ${wi + 1} · ${fmtD(wk.mon)}–${fmtD(addDays(wk.mon, 6))}</div>
          <div class="tr-type tr-type-${wk.type.replace(/\s/g, '')}">${wk.type}</div>
          <div class="tr-focus"><span>Schedule Focus</span>${esc(wk.focus)}${FOCUS_SEEN.has(wk.focus) ? '' : '<sup title="Nama opsi belum terlihat di FM27">*</sup>'}</div>
          <div class="tr-why">${esc(wk.why)}</div>
          <button class="tpl-btn tr-wcopy" data-w="${wi}">Salin minggu</button>
        </div>
        ${wk.days.map(day => `<div class="tr-day${day.k === trKey(today) ? ' tr-today' : ''}">
          <div class="tr-dh" data-fx="${day.k}"><span>${DAYS_ID[(day.d.getDay() + 6) % 7]} ${day.d.getDate()}${day.d.getDate() === 1 || (wi === 0 && day === wk.days[0]) ? ' ' + day.d.toLocaleDateString('id-ID', { month: 'short' }) : ''}</span>${day.m ? `<em>${day.m}</em>` : ''}</div>
          ${[0, 1, 2].map(i => cell(day, i)).join('')}
          <div class="tr-int" title="Perkiraan intensitas hari ini"><i style="width:${Math.min(100, loadOf(day) / 5 * 100)}%" class="${loadOf(day) >= 4 ? 'hi' : loadOf(day) >= 2.5 ? 'mid' : ''}"></i></div>
        </div>`).join('')}
      </div>`).join('')}
    </div>
    <div class="save-hint">Editor tidak menulis jadwal ke FM: isi manual di layar Training (Copy/Paste per minggu di FM membantu). Nama sesi sama dengan FM27; kategori Playing Development dan Extra-Curricular baru berisi Individual Development karena isi lainnya belum terlihat. Hubungan sesi taktik dengan instruksi (selain Passing Style → Passing Directness, Tempo) adalah perkiraan.</div>
    <div id="tr-pop" class="tr-pop hidden"></div>`;

  const rerender = () => renderTraining();
  const on = (id, ev, f) => document.getElementById(id).addEventListener(ev, f);
  on('tr-team', 'change', e => { cfg.team = +e.target.value; save(); rerender(); });
  on('tr-obj', 'change', e => { cfg.objective = e.target.value; save(); rerender(); });
  on('tr-weeks', 'change', e => { cfg.weeks = +e.target.value; save(); rerender(); });
  on('tr-start', 'change', e => { cfg.start = e.target.value || null; save(); rerender(); });
  on('tr-reset', 'click', () => { lsSet(ovKey, {}); rerender(); });
  trPanel.querySelectorAll('[data-weak]').forEach(b => b.addEventListener('click', () => {
    const s = b.dataset.weak; cfg.weak = cfg.weak.includes(s) ? cfg.weak.filter(x => x !== s) : [...cfg.weak, s]; save(); rerender();
  }));
  trPanel.querySelectorAll('[data-fx]').forEach(h => h.addEventListener('click', () => {
    const k = h.dataset.fx, cyc = ['', 'H', 'A', 'N'];
    fixtures[k] = cyc[(cyc.indexOf(fixtures[k] || '') + 1) % 4]; if (!fixtures[k]) delete fixtures[k];
    lsSet(fxKey, fixtures); rerender();
  }));
  const weekText = (wk, wi) => `Minggu ${wi + 1} (${fmtD(wk.mon)}–${fmtD(addDays(wk.mon, 6))}) · ${wk.type} · Schedule Focus: ${wk.focus}\n` +
    wk.days.map(day => `  ${DAYS_ID[(day.d.getDay() + 6) % 7]} ${fmtD(day.d)}: ` + day.slots.map((sl, i) => { const n = overrides[`${day.k}|${i}`] || sl.n; return n === 'MATCH' ? `LAGA (${day.m})` : n; }).join(' · ')).join('\n');
  const copy = (t) => { navigator.clipboard?.writeText(t).then(() => toast('Disalin ke clipboard'), () => toast('Gagal menyalin')); };
  on('tr-copy', 'click', () => copy(plan.weeks.map(weekText).join('\n\n')));
  trPanel.querySelectorAll('.tr-wcopy').forEach(b => b.addEventListener('click', () => copy(weekText(plan.weeks[+b.dataset.w], +b.dataset.w))));

  // change a session
  const pop = document.getElementById('tr-pop');
  const slotOf = (ok) => { const [k, i] = ok.split('|'); for (const wk of plan.weeks) for (const d of wk.days) if (d.k === k) return d.slots[+i]; };
  trPanel.querySelectorAll('.tr-s[data-ok]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const ok = el.dataset.ok, sl = slotOf(ok), cur = overrides[ok] || sl.n, S = SESSIONS[cur] || {};
      pop.innerHTML = `<div class="tr-pt">${esc(cur)}</div><div class="tac-iw">${esc(S.about || '')}</div>
        ${S.trains ? `<div class="tac-iw">Melatih instruksi: ${esc(S.trains.join(', '))}</div>` : ''}
        <div class="tr-pw">${esc(overrides[ok] ? 'Diubah manual. Saran awal: ' + sl.n : sl.why)}</div>
        ${Object.entries(TR_CATS).filter(([c]) => c !== 'XC').map(([c, C]) => `<div class="tr-pc">${C.name}</div><div class="tr-pl">${Object.keys(SESSIONS).filter(n => SESSIONS[n].cat === c).map(n => `<button class="tr-s ${n === 'Rest' ? 'tr-rest' : C.cls}${n === cur ? ' sel' : ''}" data-pick="${esc(n)}">${esc(n)}</button>`).join('')}</div>`).join('')}
        ${overrides[ok] ? '<button class="tpl-btn" data-undo>Kembalikan ke saran</button>' : ''}`;
      const r = el.getBoundingClientRect(), host = document.getElementById('detail').getBoundingClientRect();
      pop.classList.remove('hidden');
      const left = Math.min(r.left - host.left, host.width - 440);
      pop.style.left = Math.max(8, left) + 'px';
      pop.style.top = (r.bottom - host.top + document.getElementById('detail').scrollTop + 4) + 'px';
      pop.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { const n = b.dataset.pick; if (n === sl.n) delete overrides[ok]; else overrides[ok] = n; lsSet(ovKey, overrides); rerender(); }));
      pop.querySelector('[data-undo]')?.addEventListener('click', () => { delete overrides[ok]; lsSet(ovKey, overrides); rerender(); });
    });
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', el.dataset.ok); });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('tr-drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('tr-drop'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); const a = e.dataTransfer.getData('text/plain'), b = el.dataset.ok; if (!a || a === b) return;
      const na = overrides[a] || slotOf(a).n, nb = overrides[b] || slotOf(b).n;
      overrides[a] = nb; overrides[b] = na;
      if (slotOf(a).n === nb) delete overrides[a]; if (slotOf(b).n === na) delete overrides[b];
      lsSet(ovKey, overrides); rerender();
    });
  });
  document.getElementById('tr-readte').onclick = async (e) => {
    const btn = e.target; btn.disabled = true;
    try {
      const r = await fetch('/api/te/capture/start', { method: 'POST' }); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || 'gagal');
      btn.textContent = 'Buka Training > Tactical Effectiveness di FM (pilih tab taktik yang kamu pakai)…';
      for (;;) {
        await new Promise(res => setTimeout(res, 1000));
        const p = await (await fetch('/api/te/capture/poll')).json();
        if (p.done) { toast('Tactical Effectiveness terbaca'); break; }
        if (p.timeout || p.capturing === false) { toast('Waktu habis: buka layar Tactical Effectiveness di FM lalu coba lagi'); break; }
      }
    } catch (err) { toast(err.message); }
    renderTraining();
  };
  // ---- read the active tactic from FM ----
  document.getElementById('tr-readtac').onclick = async (e) => {
    const btn = e.target; btn.disabled = true;
    try {
      const r = await fetch('/api/tactic/capture/start', { method: 'POST' }); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || 'gagal');
      btn.textContent = 'Buka Tactics > Team Instructions di FM (tab In Possession lalu Out of Possession)…';
      for (;;) {
        await new Promise(res => setTimeout(res, 1000));
        const p = await (await fetch('/api/tactic/capture/poll')).json();
        if (p.done) { toast('Taktik terbaca: ' + (p.tactic.name || '')); break; }
        if (p.timeout || p.capturing === false) { toast('Waktu habis: buka layar Team Instructions di FM lalu coba lagi'); break; }
      }
    } catch (err) { toast(err.message); }
    renderTraining();
  };
  // ---- import into FM (in-game hook) ----
  const fmBody = document.getElementById('tr-fm-body');
  const planPayload = (weeksIdx) => ({ days: plan.weeks.filter((w, i) => weeksIdx == null || weeksIdx.includes(i)).flatMap(wk => wk.days.filter(d => !d.m).map(d => ({ date: d.k, slots: d.slots.map((sl, i) => overrides[`${d.k}|${i}`] || sl.n) }))) });
  const api = async (url, body) => { const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || r.statusText); return j; };
  const drawFm = async () => {
    let st; try { st = await api('/api/hook/status'); } catch (e) { fmBody.textContent = 'Status tidak tersedia: ' + e.message; return; }
    if (!st.running) { fmBody.innerHTML = 'FM27 tidak berjalan.'; return; }
    const tpl = st.templates || {};
    fmBody.innerHTML = `<div class="tr-fm-row"><span class="tr-dot ${st.loaded ? 'on' : ''}"></span>${st.loaded ? 'Terhubung ke FM (hook aktif)' : 'Belum terhubung'}
        · Format sesi: <b>${tpl.ready ? 'siap' : 'belum direkam'}</b></div>
      <div class="tr-fm-row">
        <button class="tpl-btn primary" id="tr-apply" ${tpl.ready ? '' : 'disabled'}>Pasang minggu 1 ke FM</button>
        <button class="tpl-btn" id="tr-apply-all" ${tpl.ready ? '' : 'disabled'}>Pasang semua (${cfg.weeks} minggu)</button>
        <button class="tpl-btn" id="tr-rec">${st.recording ? 'Selesai rekam' : 'Rekam dari FM'}</button>
      </div>
      ${st.recording ? '<div class="tr-pw">Sedang merekam. Di FM: Training &gt; Overview, klik satu sesi (hari yang belum lewat), pilih sesi lain di daftar, Confirm. Lalu klik <b>Selesai rekam</b>.</div>' : ''}
      ${!tpl.ready && !st.recording ? '<div class="tac-iw">Sekali saja: rekam 1 perubahan sesi di FM supaya editor tahu format perintah FM27 versi kamu.</div>' : ''}`;
    const run = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { toast(e.message); } btn.disabled = false; drawFm(); };
    document.getElementById('tr-rec').onclick = (e) => run(e.target, async () => {
      if (st.recording) { const r = await api('/api/hook/record/stop', { label: 'training' }); toast(`Rekaman disimpan: ${r.events} event`); }
      else { await api('/api/hook/record/start', {}); toast('Merekam… ganti 1 sesi di FM'); }
    });
    const apply = (idx) => async (e) => {
      if (!confirm('Pasang jadwal ke FM sekarang? Simpan save FM dulu sebagai cadangan. FM harus terbuka di Training > Overview.')) return;
      run(e.target, async () => { const r = await api('/api/training/apply', planPayload(idx)); toast(`Terpasang: ${r.sent} perintah`); });
    };
    document.getElementById('tr-apply').onclick = apply([0]);
    document.getElementById('tr-apply-all').onclick = apply(null);
  };
  drawFm();
  if (!trPanel._popClose) { trPanel._popClose = true; document.addEventListener('click', (e) => { const p = document.getElementById('tr-pop'); if (p && !p.contains(e.target)) p.classList.add('hidden'); }); }
}
