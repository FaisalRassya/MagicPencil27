// =====================================================================
// Tactic advisor: formation, style, team instructions (in possession /
// in transition / out of possession) and per-player roles, derived from
// the squad's attributes. Read-only: nothing is written to FM — the user
// applies the suggestion in FM's Tactics screen.
// Uses FORMATIONS, POS_WEIGHTS, posRating, famFactor, bestAssignment,
// POS_SHORT, esc from extras2.js.
// =====================================================================

Object.assign(FORMATIONS, {
  '4-3-1-2': [['pos_gk', 50, 92], ['pos_dl', 12, 72], ['pos_dc', 37, 76], ['pos_dc', 63, 76], ['pos_dr', 88, 72], ['pos_dm', 50, 58], ['pos_mc', 28, 46], ['pos_mc', 72, 46], ['pos_amc', 50, 30], ['pos_st', 37, 12], ['pos_st', 63, 12]],
  '3-4-2-1': [['pos_gk', 50, 92], ['pos_dc', 25, 76], ['pos_dc', 50, 78], ['pos_dc', 75, 76], ['pos_wbl', 10, 52], ['pos_mc', 37, 54], ['pos_mc', 63, 54], ['pos_wbr', 90, 52], ['pos_amc', 32, 28], ['pos_amc', 68, 28], ['pos_st', 50, 10]],
});

const TAC_STYLES = {
  gegen: { name: 'Gegenpress', fm: 'Gegenpress', desc: 'Rebut bola secepatnya setelah kehilangan, menekan tinggi, menyerang cepat.', forms: ['4-3-3', '4-2-3-1', '4-4-2', '4-3-1-2'] },
  possession: { name: 'Penguasaan bola', fm: 'Tiki-Taka / Possession', desc: 'Sabar membangun serangan lewat umpan pendek, menguasai tempo pertandingan.', forms: ['4-3-3', '4-2-3-1', '3-4-2-1', '4-1-4-1'] },
  counter: { name: 'Serangan balik', fm: 'Counter-Attack', desc: 'Bertahan rapat di tengah, lalu menyerang ruang kosong dengan cepat saat merebut bola.', forms: ['4-4-2', '4-2-3-1', '5-3-2', '4-2-4'] },
  wing: { name: 'Permainan sayap', fm: 'Wing Play', desc: 'Lebarkan permainan, kirim umpan silang ke penyerang yang kuat di udara.', forms: ['4-4-2', '4-1-4-1', '3-5-2', '5-3-2'] },
  lowblock: { name: 'Blok rendah', fm: 'Low Block', desc: 'Garis pertahanan rendah dan rapat, sulit ditembus, mencuri gol dari transisi dan bola mati.', forms: ['5-3-2', '4-1-4-1', '4-4-2', '3-5-2'] },
};

function tAvg(players, keys) {
  let s = 0, n = 0;
  for (const p of players) for (const k of keys) { const v = p.attrs?.[k]; if (v) { s += v; n++; } }
  return n ? s / n : 0;
}
const isPos = (p, keys, min = 15) => keys.some(k => (p.positions?.[k] || 1) >= min);
const DEF_K = ['pos_dc', 'pos_sw'], FB_K = ['pos_dl', 'pos_dr', 'pos_wbl', 'pos_wbr'], WIDE_K = ['pos_dl', 'pos_dr', 'pos_wbl', 'pos_wbr', 'pos_ml', 'pos_mr', 'pos_aml', 'pos_amr'];
const MID_K = ['pos_dm', 'pos_mc', 'pos_amc', 'pos_ml', 'pos_mr'], ATT_K = ['pos_aml', 'pos_amr', 'pos_amc', 'pos_st'];

function teamProfile(pool) {
  const out = pool.filter(p => !isPos(p, ['pos_gk']));
  const gks = pool.filter(p => isPos(p, ['pos_gk']));
  const core = [...out].sort((a, b) => (b.ca || 0) - (a.ca || 0)).slice(0, 15);
  const pick = (keys) => { const r = core.filter(p => isPos(p, keys)); return r.length ? r : core; };
  const dcs = pick(DEF_K), wides = pick(WIDE_K), mids = pick(MID_K), atts = pick(ATT_K), sts = pick(['pos_st']);
  const gk = [...gks].sort((a, b) => (b.ca || 0) - (a.ca || 0)).slice(0, 1);
  return {
    pace: tAvg(core, ['pace', 'acceleration']),
    engine: tAvg(core, ['stamina', 'work_rate', 'natural_fitness']),
    press: tAvg(core, ['work_rate', 'aggression', 'teamwork', 'anticipation']),
    technique: tAvg(core, ['passing', 'first_touch', 'technique', 'composure', 'decisions']),
    creativity: tAvg(mids.concat(atts), ['vision', 'flair', 'passing', 'technique']),
    physical: tAvg(core, ['strength', 'jumping_reach', 'bravery']),
    discipline: tAvg(core, ['teamwork', 'decisions', 'concentration', 'positioning']),
    defSolid: tAvg(dcs, ['marking', 'tackling', 'positioning', 'concentration', 'heading']),
    lineSpeed: tAvg(dcs, ['pace', 'acceleration', 'anticipation']),
    bpd: tAvg(dcs, ['passing', 'composure', 'first_touch', 'vision']),
    dcAerial: tAvg(dcs, ['heading', 'jumping_reach', 'strength']),
    dcTackle: tAvg(dcs.concat(pick(FB_K)), ['tackling', 'aggression']),
    crossing: tAvg(wides, ['crossing']),
    finishing: tAvg(atts, ['finishing', 'composure', 'off_the_ball']),
    longShots: tAvg(mids.concat(atts), ['long_shots']),
    dribbling: tAvg(atts, ['dribbling', 'flair']),
    stAerial: tAvg(sts, ['heading', 'jumping_reach', 'strength']),
    flair: tAvg(core, ['flair', 'decisions']),
    gkDist: gk.length ? tAvg(gk, ['kicking', 'passing', 'composure', 'first_touch']) : 10,
    gkSweep: gk.length ? tAvg(gk, ['rushing_out', 'one_on_ones', 'acceleration']) : 10,
  };
}
const PROFILE_LABELS = [
  ['pace', 'Kecepatan'], ['engine', 'Stamina & kerja keras'], ['press', 'Kemampuan menekan'], ['technique', 'Teknik & umpan'],
  ['creativity', 'Kreativitas'], ['physical', 'Fisik'], ['defSolid', 'Pertahanan (bek)'], ['lineSpeed', 'Kecepatan bek tengah'],
  ['crossing', 'Umpan silang (sayap)'], ['finishing', 'Penyelesaian akhir'], ['stAerial', 'Duel udara striker'], ['gkDist', 'Distribusi kiper'],
];

function chooseStyle(pr, ctx) {
  const ctxB = { fav: { gegen: 1, possession: 1, lowblock: -1.5, counter: -.5 }, mid: {}, dog: { gegen: -1, possession: -1.2, counter: 1.2, lowblock: 1.2 } }[ctx] || {};
  const sc = {
    gegen: pr.press * .4 + pr.engine * .35 + pr.pace * .25,
    possession: pr.technique * .6 + pr.creativity * .25 + pr.bpd * .15,
    counter: pr.pace * .5 + pr.finishing * .2 + pr.engine * .1 + pr.defSolid * .2,
    wing: pr.crossing * .45 + pr.stAerial * .35 + pr.pace * .2,
    lowblock: pr.defSolid * .5 + pr.physical * .3 + pr.discipline * .2,
  };
  for (const k in sc) sc[k] += ctxB[k] || 0;
  const ranked = Object.entries(sc).sort((a, b) => b[1] - a[1]);
  return { key: ranked[0][0], ranked };
}

function rankFormations(pool, styleKey) {
  const res = [];
  for (const [name, form] of Object.entries(FORMATIONS)) {
    if (pool.length < 11) continue;
    const score = form.map(([k]) => pool.map(pl => slotScore(pl, k)));
    const pick = bestAssignment(score);
    let total = 0, weak = 0;
    form.forEach(([k], i) => { total += score[i][pick[i]]; if ((pool[pick[i]].positions?.[k] || 1) < 12) weak++; });
    const avg = total / 11, bonus = TAC_STYLES[styleKey].forms.includes(name) ? 3 : 0;
    res.push({ name, form, pick, avg, weak, fit: avg + bonus - weak * 1.5 });
  }
  return res.sort((a, b) => b.fit - a.fit);
}

// ---- roles ----
function A(p, ...keys) { let s = 0, n = 0; for (const k of keys) { const v = p.attrs?.[k]; if (v) { s += v; n++; } } return n ? s / n : 0; }
function roleFor(posKey, p, used, styleKey, pr) {
  const take = (r) => { used[r] = (used[r] || 0) + 1; return r; };
  const has = (r) => used[r] > 0;
  const f = (x) => x.toFixed(0);
  switch (posKey) {
    case 'pos_gk': {
      const sweep = A(p, 'rushing_out', 'one_on_ones', 'acceleration'), dist = A(p, 'kicking', 'passing', 'composure', 'first_touch');
      return { ip: sweep >= 12.5 && dist >= 12 ? 'Sweeper Keeper' : 'Goalkeeper', oop: sweep >= 13 ? 'Keluar menyapu bola di belakang garis' : 'Tetap dekat garis gawang',
        why: `Rushing out/1v1 ${f(sweep)}, distribusi ${f(dist)}` };
    }
    case 'pos_dc': case 'pos_sw': {
      const bp = A(p, 'passing', 'composure', 'first_touch', 'vision'), agg = A(p, 'aggression', 'bravery', 'tackling'), sp = A(p, 'pace', 'acceleration');
      const ip = bp >= 12.5 && !has('Ball-Playing Defender') ? take('Ball-Playing Defender') : take('Central Defender');
      const oop = agg >= 13.5 && sp >= 11 && !has('stopper') ? (take('stopper'), 'Stopper: naik menekan penyerang') : 'Cover: jaga ruang di belakang';
      return { ip, oop, why: `Umpan/ketenangan ${f(bp)}, agresi/tekel ${f(agg)}, kecepatan ${f(sp)}` };
    }
    case 'pos_dl': case 'pos_dr': {
      const att = A(p, 'crossing', 'dribbling', 'stamina', 'pace'), inv = A(p, 'passing', 'decisions', 'technique', 'composure'), def = A(p, 'marking', 'tackling', 'positioning');
      const ip = att >= 13 ? 'Wing-Back (Attack): overlap' : inv >= 13 && styleKey === 'possession' ? 'Inverted Full-Back' : 'Full-Back (Support)';
      return { ip, oop: def >= 12.5 ? 'Tempel ketat winger lawan' : 'Jaga posisi, lindungi bek tengah', why: `Serang ${f(att)}, olah bola ${f(inv)}, bertahan ${f(def)}` };
    }
    case 'pos_wbl': case 'pos_wbr': {
      const att = A(p, 'crossing', 'stamina', 'dribbling', 'pace'), wr = A(p, 'work_rate', 'stamina');
      return { ip: att >= 13 ? 'Wing-Back (Attack)' : 'Wing-Back (Support)', oop: wr >= 13 ? 'Pressing wing-back: tekan fullback lawan' : 'Turun jadi bek lima', why: `Serang ${f(att)}, stamina/kerja ${f(wr)}` };
    }
    case 'pos_dm': {
      const pm = A(p, 'passing', 'vision', 'composure', 'technique'), bw = A(p, 'tackling', 'aggression', 'work_rate'), sc = A(p, 'positioning', 'anticipation', 'concentration');
      const ip = pm >= 13.5 && !has('DLP') ? (take('DLP'), 'Deep-Lying Playmaker') : bw >= 13.5 ? 'Ball-Winning Midfielder' : 'Defensive Midfielder (Anchor)';
      return { ip, oop: sc >= 13 ? 'Screening: jaga ruang di depan bek' : 'Tekan gelandang lawan', why: `Playmaking ${f(pm)}, merebut bola ${f(bw)}, posisi ${f(sc)}` };
    }
    case 'pos_mc': {
      const pm = A(p, 'passing', 'vision', 'decisions', 'technique'), b2b = A(p, 'stamina', 'work_rate', 'off_the_ball', 'long_shots'), bw = A(p, 'tackling', 'aggression', 'work_rate'), ap = A(p, 'vision', 'technique', 'off_the_ball', 'flair');
      let ip;
      if (pm >= 13.5 && !has('DLP') && !has('AP')) ip = ap >= 13.5 ? (take('AP'), 'Advanced Playmaker') : (take('DLP'), 'Deep-Lying Playmaker');
      else if (b2b >= 13) ip = 'Box-to-Box Midfielder';
      else if (bw >= 13.5) ip = 'Ball-Winning Midfielder';
      else ip = 'Central Midfielder (Support)';
      return { ip, oop: bw >= 13 || styleKey === 'gegen' ? 'Tekan gelandang lawan' : 'Jaga zona tengah', why: `Umpan/visi ${f(pm)}, box-to-box ${f(b2b)}, merebut bola ${f(bw)}` };
    }
    case 'pos_ml': case 'pos_mr': {
      const w = A(p, 'crossing', 'dribbling', 'pace'), wr = A(p, 'work_rate', 'stamina');
      return { ip: w >= 13 ? 'Winger' : 'Wide Midfielder', oop: wr >= 12 ? 'Turun membantu fullback' : 'Tetap di depan untuk serangan balik', why: `Sayap ${f(w)}, kerja keras ${f(wr)}` };
    }
    case 'pos_aml': case 'pos_amr': {
      const left = posKey === 'pos_aml';
      const strong = left ? (p.attrs.right_foot || 0) - (p.attrs.left_foot || 0) : (p.attrs.left_foot || 0) - (p.attrs.right_foot || 0);
      const fin = A(p, 'finishing', 'off_the_ball', 'composure'), w = A(p, 'crossing', 'dribbling', 'pace'), wr = A(p, 'work_rate', 'stamina');
      let ip = strong >= 3 ? (fin >= 12.5 ? 'Inside Forward' : 'Inverted Winger') : w >= 12.5 ? 'Winger' : 'Wide Playmaker';
      return { ip, oop: wr >= 12.5 ? 'Tracking: turun menutup fullback lawan' : 'Tetap tinggi untuk serangan balik',
        why: `${strong >= 3 ? 'Kaki dominan berlawanan sisi' : 'Kaki dominan sesuai sisi'}, finishing ${f(fin)}, sayap ${f(w)}` };
    }
    case 'pos_amc': {
      const pm = A(p, 'passing', 'vision', 'technique', 'decisions'), ss = A(p, 'finishing', 'off_the_ball', 'anticipation'), wr = A(p, 'work_rate', 'stamina');
      const ip = pm >= 13.5 && !has('AP') ? (take('AP'), 'Advanced Playmaker') : ss >= 13 ? 'Shadow Striker' : 'Attacking Midfielder';
      return { ip, oop: wr >= 12 ? 'Tekan gelandang bertahan lawan' : 'Bayangi gelandang lawan', why: `Kreasi ${f(pm)}, ancaman gol ${f(ss)}` };
    }
    case 'pos_st': {
      const c = {
        'Target Forward': A(p, 'heading', 'jumping_reach', 'strength'), 'Advanced Forward': A(p, 'pace', 'acceleration', 'finishing', 'off_the_ball'),
        'Pressing Forward': A(p, 'work_rate', 'aggression', 'stamina') + .3, 'False Nine': A(p, 'passing', 'vision', 'technique', 'first_touch') - .3,
        'Poacher': A(p, 'finishing', 'anticipation', 'composure') - .2,
      };
      const ranked = Object.entries(c).sort((a, b) => b[1] - a[1]);
      const r = ranked.find(([n]) => !has('ST:' + n)) || ranked[0];
      take('ST:' + r[0]);
      const press = A(p, 'work_rate', 'aggression', 'stamina');
      return { ip: r[0], oop: press >= 13 || styleKey === 'gegen' ? 'Pressing: tekan bek & kiper lawan' : 'Tetap di depan sebagai outlet', why: `Terbaik di profil ${r[0]} (${f(r[1])})` };
    }
  }
  return { ip: '—', oop: '—', why: '' };
}
// FM27 role abbreviations confirmed from the user's Tactics screen (BGK, BCB, CB, WB, IWB, DM, CM, W, PW, CFD)
const FM27_ROLE = {
  'Sweeper Keeper': 'BGK · Ball-Playing Goalkeeper', 'Goalkeeper': 'GK · Goalkeeper',
  'Ball-Playing Defender': 'BCB · Ball-Playing Centre-Back', 'Central Defender': 'CB · Centre-Back',
  'Wing-Back (Attack): overlap': 'WB · Wing-Back (overlap)', 'Wing-Back (Attack)': 'WB · Wing-Back', 'Wing-Back (Support)': 'WB · Wing-Back',
  'Inverted Full-Back': 'IWB · Inverted Wing-Back', 'Defensive Midfielder (Anchor)': 'DM · Defensive Midfielder',
  'Central Midfielder (Support)': 'CM · Central Midfielder', 'Winger': 'W · Winger', 'Wide Playmaker': 'PW · Playmaking Winger',
  'Target Forward': 'CFD · Target / Centre Forward',
};
function fm27Role(r) { return FM27_ROLE[r] || r; }

// ---- team instructions (FM27 layout: Style + Mentality on top, then the In Possession grid) ----
function sideStrength(slots) {
  const wide = (s) => ['pos_dl', 'pos_dr', 'pos_wbl', 'pos_wbr', 'pos_ml', 'pos_mr', 'pos_aml', 'pos_amr'].includes(s.k);
  const val = (s) => A(s.pl, 'crossing', 'dribbling', 'pace', 'acceleration', 'technique');
  const side = (f) => { const r = slots.filter(s => wide(s) && f(s.x)); return r.length ? r.reduce((t, s) => t + val(s), 0) / r.length : 0; };
  const L = side(x => x < 40), R = side(x => x > 60);
  const C = (() => { const r = slots.filter(s => ['pos_mc', 'pos_amc', 'pos_dm'].includes(s.k)); return r.length ? r.reduce((t, s) => t + A(s.pl, 'passing', 'vision', 'technique', 'first_touch', 'dribbling'), 0) / r.length : 0; })();
  return { L, R, C };
}
function instructions(pr, styleKey, ctx, form, slots) {
  // Names/order from the user's FM27 Team Instructions screens (Game Pass, 28 Feb 2027).
  const out = { top: [], 'In Possession': [], 'Out of Possession': [] };
  const SEEN = new Set(['Gegenpress', 'Balanced', 'Positive', 'Cautious', 'Standard',
    'Much Shorter', 'Shorter', 'More Direct', 'Much More Direct', 'Much Lower', 'Lower', 'Higher', 'Much Higher',
    'Narrower', 'Counter-Attack', 'Keep Ball in Play', 'Mixed', 'Center-Backs', 'Play Through Press',
    'Low Block', 'Mid Block', 'High Press', 'Step Up More', 'Much More Often', 'Counter-Press', 'Yes']);
  const add = (ph, group, label, value, why) => out[ph].push({ group, label, value, why, sure: SEEN.has(value) });
  const n = (x) => x.toFixed(1);
  const wideForm = form.some(([k]) => ['pos_ml', 'pos_mr', 'pos_aml', 'pos_amr', 'pos_wbl', 'pos_wbr'].includes(k));
  const sd = sideStrength(slots || []);

  add('top', '', 'Style', TAC_STYLES[styleKey].fm, TAC_STYLES[styleKey].desc);
  const ment = ctx === 'fav' && (styleKey === 'possession' || styleKey === 'gegen') ? 'Positive'
    : ctx === 'dog' && (styleKey === 'lowblock' || styleKey === 'counter') ? 'Cautious'
    : styleKey === 'lowblock' ? 'Cautious' : 'Balanced';
  add('top', '', 'Mentality', ment, { fav: 'Tim diunggulkan', mid: 'Kekuatan seimbang', dog: 'Tim tidak diunggulkan' }[ctx] + ', gaya ' + TAC_STYLES[styleKey].name.toLowerCase());

  const ip = 'In Possession';
  // Overview
  add(ip, 'Overview', 'Passing Directness', styleKey === 'possession' ? (pr.technique >= 14 ? 'Much Shorter' : 'Shorter') : styleKey === 'wing' ? 'More Direct' : styleKey === 'counter' ? (pr.technique < 11 ? 'Much More Direct' : 'More Direct') : pr.technique >= 14 ? 'Shorter' : 'Standard', `Teknik & umpan tim ${n(pr.technique)}`);
  const fast = pr.pace >= 14 && pr.engine >= 14;
  add(ip, 'Overview', 'Tempo', styleKey === 'possession' ? 'Lower' : (styleKey === 'gegen' || styleKey === 'counter') ? (fast ? 'Much Higher' : 'Higher') : styleKey === 'lowblock' ? 'Standard' : 'Standard', `Kecepatan ${n(pr.pace)}, stamina ${n(pr.engine)}`);
  add(ip, 'Overview', 'Attacking Width', !wideForm ? 'Narrower' : (styleKey === 'wing' || pr.crossing >= 13.5) ? 'Wider' : 'Standard', wideForm ? `Umpan silang pemain sayap ${n(pr.crossing)}` : 'Formasi tanpa pemain sayap murni');
  const ctr = styleKey === 'counter' || (pr.pace >= 13.5 && styleKey !== 'possession');
  add(ip, 'Overview', 'Attacking Transition', ctr ? 'Counter-Attack' : styleKey === 'possession' ? 'Hold Shape' : 'Balanced', ctr ? `Kecepatan ${n(pr.pace)}: serang ruang kosong begitu bola direbut` : 'Tim tidak cukup cepat untuk serangan balik');
  add(ip, 'Overview', 'Creative Freedom', pr.flair >= 13.5 ? 'More Expressive' : pr.flair < 10.5 ? 'More Disciplined' : 'Balanced', `Flair & keputusan ${n(pr.flair)}`);
  add(ip, 'Overview', 'Time Wasting', ctx === 'dog' && styleKey === 'lowblock' ? 'More Often' : 'Standard', ctx === 'dog' ? 'Underdog: main aman saat unggul' : 'Naikkan sendiri di menit akhir kalau unggul');
  const sp = pr.stAerial >= 14 && pr.dcAerial >= 13.5;
  add(ip, 'Overview', 'Play for Set Pieces', sp ? 'Play for Set Pieces' : 'Keep Ball in Play', sp ? `Kuat di udara (striker ${n(pr.stAerial)}, bek ${n(pr.dcAerial)})` : 'Duel udara bukan senjata utama');
  // Final Third
  add(ip, 'Final Third', 'Patience', styleKey === 'possession' ? 'More Patient' : (styleKey === 'counter' || styleKey === 'gegen') && pr.finishing < 13 ? 'Less Patient' : 'Standard', styleKey === 'possession' ? 'Putar bola sampai ada celah' : `Finishing ${n(pr.finishing)}`);
  add(ip, 'Final Third', 'Shots from Distance', pr.longShots >= 13.5 ? 'Encourage' : pr.longShots < 10.5 ? 'Discourage' : 'Balanced', `Tendangan jarak jauh ${n(pr.longShots)}`);
  add(ip, 'Final Third', 'Crossing Style', !wideForm || pr.crossing < 11.5 ? 'Balanced' : pr.stAerial >= 14 ? 'Whipped' : 'Low', pr.stAerial >= 14 ? `Striker unggul duel udara (${n(pr.stAerial)})` : `Duel udara striker ${n(pr.stAerial)}: umpan datar lebih efektif`);
  add(ip, 'Final Third', 'Dribbling', pr.dribbling >= 13.5 ? 'Encourage' : pr.dribbling < 10.5 ? 'Discourage' : 'Balanced', `Dribbling & flair penyerang ${n(pr.dribbling)}`);
  // Progression
  const diff = sd.L - sd.R;
  const flank = Math.abs(diff) >= 1 ? (diff > 0 ? 'Left' : 'Right') : 'Balanced';
  add(ip, 'Progression', 'Supporting Runs', flank, flank === 'Balanced' ? `Sayap kiri ${n(sd.L)} & kanan ${n(sd.R)} seimbang` : `Sayap ${flank === 'Left' ? 'kiri' : 'kanan'} lebih kuat (${n(sd.L)} vs ${n(sd.R)})`);
  const prog = sd.C >= Math.max(sd.L, sd.R) + .8 ? 'Central' : flank;
  add(ip, 'Progression', 'Progress Through', prog, `Tengah ${n(sd.C)}, kiri ${n(sd.L)}, kanan ${n(sd.R)}`);
  add(ip, 'Progression', 'Pass Reception', pr.pace >= 13.5 && styleKey !== 'possession' ? 'Into Space' : pr.technique >= 13.5 ? 'To Feet' : 'Balanced', `Kecepatan ${n(pr.pace)}, teknik ${n(pr.technique)}`);
  // Buildup
  const through = pr.bpd >= 12.5 && pr.gkDist >= 12 && pr.technique >= 12.5;
  add(ip, 'Buildup', 'Build-Up Strategy', through ? 'Play Through Press' : pr.stAerial >= 14 ? 'Bypass Press' : 'Balanced', through ? `Bek (${n(pr.bpd)}) & kiper (${n(pr.gkDist)}) nyaman pegang bola` : 'Bek/kiper kurang nyaman ditekan');
  add(ip, 'Buildup', 'Goal Kicks', through ? 'Short' : pr.stAerial >= 14 ? 'Long' : 'Mixed', `Kiper ${n(pr.gkDist)}, striker udara ${n(pr.stAerial)}`);
  add(ip, 'Buildup', 'GK Distribution (Speed)', (styleKey === 'counter' || styleKey === 'gegen') && pr.pace >= 13 ? 'Quicker' : styleKey === 'possession' ? 'Slower' : 'Balanced', 'Ikuti tempo gaya bermain');
  add(ip, 'Buildup', 'GK Distribution', through ? 'Center-Backs' : pr.stAerial >= 14 ? 'Target Forward' : pr.pace >= 13.5 ? 'Flanks' : 'Center-Backs', through ? 'Bangun dari bek tengah' : 'Langsung ke area yang kuat');

  const oo = 'Out of Possession';
  const loe = styleKey === 'gegen' ? 'High Press' : styleKey === 'lowblock' ? 'Low Block' : 'Mid Block';
  add(oo, 'Overview', 'Line of Engagement', loe, loe === 'High Press' ? 'Tekan sejak fase build-up lawan' : loe === 'Low Block' ? 'Mulai menekan di sepertiga akhir sendiri' : 'Mulai menekan di fase progresi lawan');
  let line = pr.lineSpeed >= 13.5 ? 'Higher' : pr.lineSpeed < 11 ? 'Lower' : 'Standard';
  if (styleKey === 'lowblock' && line === 'Higher') line = 'Standard';
  if (loe === 'High Press' && line === 'Lower') line = 'Standard';
  add(oo, 'Overview', 'Defensive Line', line, `Kecepatan & antisipasi bek tengah ${n(pr.lineSpeed)}${loe === 'High Press' && pr.lineSpeed < 12 ? ' (pressing tinggi + bek lambat = rawan bola terobosan)' : ''}`);
  const step = line === 'Higher' && pr.discipline >= 12.5;
  add(oo, 'Overview', 'Defensive Line Behaviour', step ? 'Step Up More' : line === 'Lower' ? 'Drop Off More' : 'Balanced', step ? `Garis tinggi + konsentrasi/posisi ${n(pr.discipline)}` : `Konsentrasi/posisi bek ${n(pr.discipline)}`);
  add(oo, 'Overview', 'Trigger Press', styleKey === 'gegen' && pr.press >= 13.5 && pr.engine >= 13.5 ? 'Much More Often' : pr.press >= 13 || styleKey === 'gegen' ? 'More Often' : pr.press < 10.5 ? 'Less Often' : 'Standard', `Pressing ${n(pr.press)}, stamina ${n(pr.engine)}`);
  const cp = (pr.press >= 13 && pr.engine >= 13) || styleKey === 'gegen';
  add(oo, 'Overview', 'Defensive Transition', cp ? 'Counter-Press' : 'Regroup', cp ? `Pressing ${n(pr.press)}, stamina ${n(pr.engine)}` : `Pressing/stamina ${n(pr.press)}/${n(pr.engine)}: kembali ke bentuk`);
  add(oo, 'Overview', 'Tackling', pr.dcTackle >= 13.5 ? 'Get Stuck In' : pr.dcTackle < 10.5 ? 'Stay On Feet' : 'Standard', `Tekel & agresi lini belakang ${n(pr.dcTackle)}`);
  if (loe === 'High Press') add(oo, 'High Press', 'Short Goalkeeper Distribution', cp ? 'Yes' : 'No', cp ? 'Paksa kiper lawan menendang jauh' : 'Tidak cukup kuat menekan sampai kiper');
  if (loe !== 'Low Block') add(oo, loe, 'Pressing Trap', pr.dcAerial >= 13.5 ? 'Outside' : pr.press >= 13 ? 'Inside' : 'Balanced', pr.dcAerial >= 13.5 ? `Bek kuat di udara (${n(pr.dcAerial)}): giring lawan ke sayap` : `Bek lemah di udara (${n(pr.dcAerial)}): jebak lawan di tengah`);
  if (loe === 'Low Block') add(oo, 'Low Block', 'Cross Engagement', pr.dcAerial < 12.5 ? 'Stop Crosses' : 'Balanced', pr.dcAerial < 12.5 ? `Bek lemah di udara (${n(pr.dcAerial)})` : `Bek cukup kuat di udara (${n(pr.dcAerial)})`);
  return out;
}

// ---- UI ----
async function renderTactics(clubAddress, box) {
  box.innerHTML = '<div class="empty-hint">Menganalisis skuad…</div>';
  let sq;
  try { sq = await (await fetch(`/api/clubs/${clubAddress}/squad-detail`)).json(); } catch (e) { sq = { error: e.message }; }
  if (sq.error) { box.innerHTML = `<div class="warning">${esc(sq.error)}</div>`; return; }
  const teams = sq.teams || [];
  if (!teams.length) { box.innerHTML = '<div class="empty-hint">Klub ini tidak punya pemain.</div>'; return; }
  box.innerHTML = `<div class="tac-controls">
      <label>Tim <select id="tac-team">${teams.map((t, i) => `<option value="${i}">${i === 0 ? 'Tim Utama' : 'Tim Cadangan/Muda ' + i} (${t.players.length})</option>`).join('')}</select></label>
      <label>Posisi di liga <select id="tac-ctx"><option value="mid">Seimbang</option><option value="fav">Unggulan</option><option value="dog">Tidak diunggulkan</option></select></label>
      <label>Gaya <select id="tac-style"><option value="auto">Otomatis (rekomendasi)</option>${Object.entries(TAC_STYLES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('')}</select></label>
      <label>Formasi <select id="tac-form"><option value="auto">Otomatis (rekomendasi)</option>${Object.keys(FORMATIONS).map(f => `<option>${f}</option>`).join('')}</select></label>
      <label class="checkbox-row"><input type="checkbox" id="tac-fit" checked> Tanpa pemain cedera/skors</label>
    </div><div id="tac-out"></div>`;
  const draw = () => {
    let pool = teams[+document.getElementById('tac-team').value].players.filter(x => x.attrs);
    if (document.getElementById('tac-fit').checked) pool = pool.filter(x => !x.injured && !x.banned);
    const outEl = document.getElementById('tac-out');
    if (pool.length < 11) { outEl.innerHTML = `<div class="warning">Pemain kurang dari 11 (${pool.length}).</div>`; return; }
    const ctx = document.getElementById('tac-ctx').value;
    const pr = teamProfile(pool);
    const st = chooseStyle(pr, ctx);
    const styleSel = document.getElementById('tac-style').value;
    const styleKey = styleSel === 'auto' ? st.key : styleSel;
    const forms = rankFormations(pool, styleKey);
    const formSel = document.getElementById('tac-form').value;
    const F = formSel === 'auto' ? forms[0] : forms.find(f => f.name === formSel);
    const used = {};
    const slots = F.form.map(([k, x, y], i) => ({ k, x, y, pl: pool[F.pick[i]] }));
    // assign roles back-to-front so playmaker/stopper uniqueness favours the better player
    const order = [...slots].sort((a, b) => (b.pl.ca || 0) - (a.pl.ca || 0));
    for (const s of order) s.role = roleFor(s.k, s.pl, used, styleKey, pr);
    const ins = instructions(pr, styleKey, ctx, F.form, slots);
    const bar = (v) => `<span class="tac-bar"><i style="width:${Math.max(0, Math.min(100, (v - 1) / 19 * 100))}%"></i></span>`;
    const strengths = PROFILE_LABELS.map(([k, l]) => [l, pr[k]]).sort((a, b) => b[1] - a[1]);
    outEl.innerHTML = `
      <div class="tac-top">
        <div class="tac-verdict">
          <div class="tac-k">Rekomendasi</div>
          <div class="tac-form">${F.name}</div>
          <div class="tac-style">${TAC_STYLES[styleKey].name}${styleSel === 'auto' ? '' : ' <span class="cmp-sub">(pilihan manual)</span>'}</div>
          <p class="tac-desc">${TAC_STYLES[styleKey].desc}</p>
          <div class="tac-why">Kekuatan utama: <b>${strengths.slice(0, 3).map(x => x[0].toLowerCase()).join(', ')}</b>. Kelemahan: <b>${strengths.slice(-2).map(x => x[0].toLowerCase()).join(', ')}</b>.</div>
          <div class="tac-alt"><span class="tac-k">Alternatif formasi</span>${forms.slice(0, 5).map(f => `<button class="tpl-btn ${f.name === F.name ? 'primary' : ''}" data-form="${f.name}">${f.name} <span class="tac-n">${f.avg.toFixed(1)}</span></button>`).join('')}</div>
          <div class="tac-alt"><span class="tac-k">Kecocokan gaya</span>${st.ranked.map(([k, v]) => `<button class="tpl-btn ${k === styleKey ? 'primary' : ''}" data-style="${k}">${TAC_STYLES[k].name} <span class="tac-n">${v.toFixed(1)}</span></button>`).join('')}</div>
        </div>
        <div class="tac-profile"><div class="tac-k">Profil skuad (rata-rata 1–20)</div>
          ${PROFILE_LABELS.map(([k, l]) => `<div class="tac-row"><span>${l}</span>${bar(pr[k])}<b>${pr[k].toFixed(1)}</b></div>`).join('')}
        </div>
      </div>
      <div class="section-title">Formasi & peran pemain</div>
      <div class="xi-wrap">
        <div class="xi-pitch tac-pitch">${slots.map(s => `<div class="xi-card tac-card" style="left:${s.x}%;top:${s.y}%" data-a="${s.pl.address}" title="${esc(s.role.why)}">
            <div class="xi-nm">${esc(shortName(s.pl.name))}</div><div class="xi-ps">${POS_SHORT[s.k]}</div>
            <div class="tac-ip">${esc(fm27Role(s.role.ip).split(' · ')[0])}</div></div>`).join('')}</div>
        <div class="tac-roles"><table class="squad-table"><thead><tr><th>Pos</th><th>Pemain</th><th>Dengan bola</th><th>Tanpa bola</th></tr></thead><tbody>
          ${slots.map(s => `<tr data-a="${s.pl.address}" title="${esc(s.role.why)}"><td class="pos">${POS_SHORT[s.k]}</td><td class="nm">${esc(s.pl.name)}</td><td>${esc(fm27Role(s.role.ip))}</td><td class="tac-oop">${esc(s.role.oop)}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="section-title">Team Instructions</div>
      <div class="tac-topbar">${ins.top.map(r => `<div class="tac-tb"><span class="tac-k">${r.label}</span><b>${esc(r.value)}${r.sure ? '' : '<sup title="Nama opsi belum dicocokkan dengan FM27">*</sup>'}</b><span class="tac-iw">${esc(r.why)}</span></div>`).join('')}</div>
      ${['In Possession', 'Out of Possession'].map(phase => `<div class="tac-ph">${phase}</div>
        <div class="tac-grid">${ins[phase].map((r, i, arr) => `${i === 0 || arr[i - 1].group !== r.group ? `<div class="tac-group">${r.group}</div>` : ''}<div class="tac-tile${r.value === 'Standard' || r.value === 'Balanced' ? ' tac-neutral' : ''}"><div class="tac-il">${r.label}</div><div class="tac-iv">${esc(r.value)}${r.sure ? '' : '<sup title="Nama opsi ditebak, belum terlihat di layar FM27">*</sup>'}</div><div class="tac-iw">${esc(r.why)}</div></div>`).join('')}</div>`).join('')}
      <div class="save-hint">Nama dan kelompok instruksi sama dengan panel Overview di Team Instructions FM27. Nilai bertanda * belum terlihat di layar FM27, pilih opsi yang paling mirip. Short Goalkeeper Distribution dan Pressing Trap hanya muncul di High Press / Mid Block, Cross Engagement hanya di Low Block, persis seperti di FM.</div>
      <div class="save-hint">Saran ini dihitung dari atribut skuad (rata-rata 15 pemain terbaik, dan pemain per posisi untuk peran). Editor <b>tidak mengubah taktik di FM</b>: terapkan sendiri di layar Tactics. Nama role/instruksi di FM27 bisa sedikit berbeda, pilih yang paling mirip. Arahkan kursor ke pemain untuk melihat alasannya.</div>`;
    outEl.querySelectorAll('[data-form]').forEach(b => b.addEventListener('click', () => { document.getElementById('tac-form').value = b.dataset.form; draw(); }));
    outEl.querySelectorAll('[data-style]').forEach(b => b.addEventListener('click', () => { document.getElementById('tac-style').value = b.dataset.style; document.getElementById('tac-form').value = 'auto'; draw(); }));
    outEl.querySelectorAll('[data-a]').forEach(el => el.addEventListener('click', () => { returnToClub = { address: clubAddress, name: document.querySelector('#club-detail h1')?.textContent || 'klub' }; openPlayer(el.dataset.a); }));
  };
  ['tac-team', 'tac-ctx', 'tac-style', 'tac-form', 'tac-fit'].forEach(id => document.getElementById(id).addEventListener('change', draw));
  draw();
}

const _tacRenderClub = renderClub;
renderClub = function (address, c) {
  _tacRenderClub(address, c);
  const xi = clubDetail.querySelector('#xi-box');
  const anchor = xi ? xi.previousElementSibling : clubDetail.querySelector('#squad-wrap')?.previousElementSibling;
  if (!anchor) return;
  const sec = document.createElement('div');
  sec.innerHTML = `<div class="section-title">Taktik yang disarankan</div><div id="tac-box"><button class="tpl-btn primary" id="tac-go">Analisis taktik</button>
    <span class="cmp-sub" style="margin-left:10px">Formasi, gaya, instruksi tim (in/out of possession) dan peran tiap pemain.</span></div>`;
  anchor.parentElement.insertBefore(sec, anchor);
  document.getElementById('tac-go').addEventListener('click', () => renderTactics(address, document.getElementById('tac-box')));
};
