// =====================================================================
// FMRTE-style extras: advanced/quick search, attribute freeze, club
// facilities/reputation/ticket price. (Appended after agent_medical.js.)
// Club offsets (memory-layout facts, see PROVENANCE.md):
//   club+0x100 info: training +0x120, youth facilities +0x12B, academy
//     coaching +0x12C, youth recruitment +0x12D, season tickets u32 +0xC0,
//     year founded u16 +0xD8
//   club+0x150 full finance: academy coaching copy +0x8A6, recruitment copy
//     +0x8A7 (FM's facilities screen reads these), corporate +0x8A9,
//     avg ticket price f32 +0x864
//   club+0x18 -> teams[0] (senior team) +0xA8 reputation u16 0-10000
// =====================================================================

var POS_LABEL2 = { pos_gk: 'GK', pos_sw: 'SW', pos_dl: 'DL', pos_dc: 'DC', pos_dr: 'DR', pos_dm: 'DM', pos_ml: 'ML',
  pos_mc: 'MC', pos_mr: 'MR', pos_aml: 'AML', pos_amc: 'AMC', pos_amr: 'AMR', pos_st: 'ST', pos_wbl: 'WBL', pos_wbr: 'WBR' };
function playerPosText(p) {
  var best = 0, list = [];
  POSITION_KEYS.forEach(function (k) { var v = p.add(P[k]).readU8(); if (v > best) best = v; });
  POSITION_KEYS.forEach(function (k) { var v = p.add(P[k]).readU8(); if (v >= 15 && v >= best - 2) list.push(POS_LABEL2[k]); });
  return list.join(', ');
}
function playerClubName(p) {
  try { var t = p.add(P.teamPtr).readPointer(); if (t.isNull()) return ''; var c = t.add(0x30).readPointer(); return c.isNull() ? '' : readFmString(c.add(0xC8)); } catch (e) { return ''; }
}
function playerClubFull(p) {
  try { var t = p.add(P.teamPtr).readPointer(); if (t.isNull()) return ''; var c = t.add(0x30).readPointer(); return c.isNull() ? '' : readFmString(c.add(0xC0)); } catch (e) { return ''; }
}
function playerNation(p) {
  try { var n = p.add(P.nationPtr).readPointer(); return n.isNull() ? '' : readFmString(n.add(0x18)); } catch (e) { return ''; }
}

// criteria: { q, ageMin, ageMax, caMin, caMax, paMin, paMax, positions:[..'ST'], foot:'left'|'right'|'both',
//   attrs:{key:min}, from, club, nation, freeAgent, injured, banned, sort:'pa'|'ca'|'age'|'ageAsc' }
rpc.exports.searchPlayers = function (c, limit) {
  c = c || {}; limit = Math.min(limit || 100, 300);
  var b = playerArrayBounds(), year = null, today = null;
  try { year = rva('date').add(2).readU16(); } catch (e) {}
  if (c.injured || c.banned) today = todayNumber();
  var posKeys = (c.positions && c.positions.length) ? c.positions.map(function (x) { return 'pos_' + String(x).toLowerCase(); }).filter(function (k) { return k in P; }) : null;
  var attrKeys = c.attrs ? Object.keys(c.attrs).filter(function (k) { return ENCODED_FIELDS.indexOf(k) !== -1; }) : [];
  var q = (c.q || '').toLowerCase(), from = (c.from || '').toLowerCase(), clubQ = (c.club || '').toLowerCase(), natQ = (c.nation || '').toLowerCase();
  var hits = [];
  for (var i = 0; i < b.count; i++) {
    var p = b.dataPtr.add(i * 8).readPointer(); if (p.isNull()) continue;
    try {
      var ca = p.add(P.ca).readU16(), pa = p.add(P.pa).readU16();
      if (c.caMin != null && ca < c.caMin) continue; if (c.caMax != null && ca > c.caMax) continue;
      if (c.paMin != null && pa < c.paMin) continue; if (c.paMax != null && pa > c.paMax) continue;
      var age = null;
      if (year) age = year - p.add(P.dob).add(2).readU16();
      if (c.ageMin != null && (age === null || age < c.ageMin)) continue;
      if (c.ageMax != null && (age === null || age > c.ageMax)) continue;
      if (posKeys) { var okPos = false; for (var j = 0; j < posKeys.length; j++) if (p.add(P[posKeys[j]]).readU8() >= 15) { okPos = true; break; } if (!okPos) continue; }
      if (c.foot) {
        var lf = decodeAttr(p.add(P.left_foot).readU8()), rf = decodeAttr(p.add(P.right_foot).readU8());
        if (c.foot === 'left' && !(lf >= 15 && lf >= rf)) continue;
        if (c.foot === 'right' && !(rf >= 15 && rf >= lf)) continue;
        if (c.foot === 'both' && !(lf >= 15 && rf >= 15)) continue;
      }
      var okA = true;
      for (var a = 0; a < attrKeys.length; a++) if (decodeAttr(p.add(P[attrKeys[a]]).readU8()) < c.attrs[attrKeys[a]]) { okA = false; break; }
      if (!okA) continue;
      if (c.freeAgent) { var tm = p.add(P.teamPtr).readPointer(); if (!tm.isNull()) continue; }
      if (q) { var nm = (playerName(p) || '').toLowerCase(); if (nm.indexOf(q) === -1) continue; }
      if (clubQ) { var cn = (playerClubName(p) + ' | ' + playerClubFull(p)).toLowerCase(); if (cn.indexOf(clubQ) === -1) continue; }
      if (natQ) { if (playerNation(p).toLowerCase().indexOf(natQ) === -1) continue; }
      if (from) {
        var hay = (playerClubName(p) + ' | ' + playerClubFull(p) + ' | ' + playerNation(p)).toLowerCase();
        if (hay.indexOf(from) === -1) continue;
      }
      if (c.injured || c.banned) {
        var st = playerStatus(p, today);
        if (c.injured && !st.injured) continue;
        if (c.banned && !st.banned) continue;
      }
      hits.push({ p: p, ca: ca, pa: pa, age: age });
    } catch (e) {}
  }
  var key = c.sort || 'pa';
  hits.sort(function (x, y) {
    if (key === 'ca') return y.ca - x.ca || y.pa - x.pa;
    if (key === 'age') return (y.age || 0) - (x.age || 0);
    if (key === 'ageAsc') return (x.age || 99) - (y.age || 99) || y.pa - x.pa;
    return y.pa - x.pa || y.ca - x.ca;
  });
  var out = hits.slice(0, limit).map(function (h) {
    var r = { address: h.p.toString(), ca: h.ca, pa: h.pa, age: h.age };
    try { r.name = playerName(h.p); } catch (e) { r.name = '?'; }
    try { r.uid = h.p.add(P.uid).readU32(); } catch (e) {}
    r.club = playerClubName(h.p); r.nation = playerNation(h.p);
    try { r.pos = playerPosText(h.p); } catch (e) { r.pos = ''; }
    return r;
  });
  return { total: hits.length, players: out };
};

// ---- Attribute freeze ("lock" = keep exact values, "up" = never decrease) ----
var FREEZE_KEYS = ENCODED_FIELDS.concat(['ca', 'pa']);
function freezeValues(p) {
  var v = {};
  ENCODED_FIELDS.forEach(function (k) { v[k] = p.add(P[k]).readU8(); });
  v.ca = p.add(P.ca).readU16(); v.pa = p.add(P.pa).readU16();
  return v;
}
rpc.exports.freezeSnapshot = function (addrStr) {
  var p = ptr(addrStr);
  return { address: addrStr, uid: p.add(P.uid).readU32(), name: playerName(p), values: freezeValues(p) };
};
// entries: [{address, uid, mode, values}] -> rewrites drifted values; for 'up'
// returns raised values so the caller can store the new floor.
rpc.exports.enforceFreeze = function (entries) {
  var res = { fixed: 0, raised: [], missing: [] };
  entries.forEach(function (e) {
    var p = ptr(e.address);
    try { if (p.add(P.uid).readU32() !== e.uid) { res.missing.push(e.address); return; } } catch (x) { res.missing.push(e.address); return; }
    FREEZE_KEYS.forEach(function (k) {
      if (!(k in e.values)) return;
      var wide = (k === 'ca' || k === 'pa');
      var cur = wide ? p.add(P[k]).readU16() : p.add(P[k]).readU8();
      var want = e.values[k];
      if (cur === want) return;
      if (e.mode === 'up' && cur > want) { res.raised.push({ address: e.address, key: k, value: cur }); return; }
      if (wide) p.add(P[k]).writeU16(want); else p.add(P[k]).writeU8(want);
      res.fixed++;
    });
  });
  return res;
};
rpc.exports.findPlayerAddrByUid = function (uid) {
  var b = playerArrayBounds();
  for (var i = 0; i < b.count; i++) {
    var p = b.dataPtr.add(i * 8).readPointer(); if (p.isNull()) continue;
    try { if (p.add(P.uid).readU32() === uid) return p.toString(); } catch (e) {}
  }
  return null;
};

// ---- Club: facilities, reputation, tickets ----
function clubInfo(c) { var i = c.add(0x100).readPointer(); return i.isNull() ? null : i; }
function clubFullFinance(c) {
  var f = c.add(0x150).readPointer(); if (f.isNull()) return null;
  var vt = resolveRvas().financeVtable;
  return (vt && f.readPointer().equals(vt)) ? f : null;
}
function clubSeniorTeam(c) {
  var teams = c.add(0x18).readPointer(); if (teams.isNull()) return null;
  var t = teams.readPointer(); return t.isNull() ? null : t;
}
var CLUB_EXTRA = {
  reputation: { label: 'Reputation (0-10000)', min: 0, max: 10000 },
  training: { label: 'Training Facilities', min: 1, max: 20 },
  youthFacilities: { label: 'Youth Facilities', min: 1, max: 20 },
  academyCoaching: { label: 'Academy Coaching', min: 1, max: 20 },
  youthRecruitment: { label: 'Youth Recruitment', min: 1, max: 20 },
  corporate: { label: 'Corporate Facilities', min: 1, max: 20, full: true },
  ticketPrice: { label: 'Avg Ticket Price (£)', min: 0, max: 1000, full: true },
  seasonTickets: { label: 'Season Tickets', min: 0, max: 1000000 },
};
function readClubExtra(c) {
  var out = {};
  try { var t = clubSeniorTeam(c); if (t) out.reputation = t.add(0xA8).readU16(); } catch (e) {}
  try {
    var i = clubInfo(c);
    if (i) {
      out.training = i.add(0x120).readU8(); out.youthFacilities = i.add(0x12B).readU8();
      out.academyCoaching = i.add(0x12C).readU8(); out.youthRecruitment = i.add(0x12D).readU8();
      out.seasonTickets = i.add(0xC0).readU32(); out.yearFounded = i.add(0xD8).readU16();
    }
  } catch (e) {}
  try {
    var f = clubFullFinance(c);
    if (f) {
      out.corporate = f.add(0x8A9).readU8();
      out.ticketPrice = Math.round(readF32(f.add(0x864)) * 100) / 100;
    }
  } catch (e) {}
  return out;
}
function readF32(a) { var u = a.readU32(); var buf = new ArrayBuffer(4); new DataView(buf).setUint32(0, u, true); return new DataView(buf).getFloat32(0, true); }
function writeF32(a, v) { var buf = new ArrayBuffer(4); new DataView(buf).setFloat32(0, v, true); a.writeU32(new DataView(buf).getUint32(0, true)); }
function setClubExtra(addrStr, field, value) {
  var c = ptr(addrStr), meta = CLUB_EXTRA[field];
  if (!meta) throw new Error('unknown club field ' + field);
  var v = Number(value); if (isNaN(v)) throw new Error('not a number');
  v = Math.max(meta.min, Math.min(meta.max, v));
  if (field !== 'ticketPrice') v = Math.round(v);
  var f = clubFullFinance(c);
  if (meta.full && !f) throw new Error(meta.label + ' is only stored for clubs with the full finance object');
  var i = clubInfo(c);
  switch (field) {
    case 'reputation': var t = clubSeniorTeam(c); if (!t) throw new Error('club has no senior team'); t.add(0xA8).writeU16(v); break;
    case 'training': i.add(0x120).writeU8(v); break;
    case 'youthFacilities': i.add(0x12B).writeU8(v); break;
    case 'academyCoaching': i.add(0x12C).writeU8(v); if (f) f.add(0x8A6).writeU8(v); break;
    case 'youthRecruitment': i.add(0x12D).writeU8(v); if (f) f.add(0x8A7).writeU8(v); break;
    case 'corporate': f.add(0x8A9).writeU8(v); break;
    case 'ticketPrice': writeF32(f.add(0x864), v); break;
    case 'seasonTickets': i.add(0xC0).writeU32(v); break;
  }
  return { ok: true, field: field, value: readClubExtra(c)[field] };
}
(function () {
  var origRead = rpc.exports.readClub, origSet = rpc.exports.setClubFinance;
  rpc.exports.readClub = function (addrStr) {
    var r = origRead.call(rpc.exports, addrStr);
    try { r.extra = readClubExtra(ptr(addrStr)); r.extraMeta = CLUB_EXTRA; } catch (e) { r.extraError = String(e); }
    return r;
  };
  rpc.exports.setClubFinance = function (addrStr, field, value) {
    if (CLUB_EXTRA[field]) return setClubExtra(addrStr, field, value);
    return origSet.call(rpc.exports, addrStr, field, value);
  };
})();

// ---- richer player header (age, full club name, positions, squad number) ----
(function () {
  var orig = rpc.exports.readPlayer;
  rpc.exports.readPlayer = function (addrStr) {
    var r = orig.call(rpc.exports, addrStr);
    try {
      var p = ptr(addrStr);
      var d = rva('date'), gy = d.add(2).readU16(), gday = d.readU16() & 0x1FF;
      var by = p.add(P.dob).add(2).readU16(), bday = p.add(P.dob).readU16() & 0x1FF;
      if (by > 1900 && gy > 1900) r.age = gy - by - (gday < bday ? 1 : 0);
      r.gameDate = readDate(d).iso;
    } catch (e) {}
    try { r.clubFull = playerClubFull(ptr(addrStr)); } catch (e) {}
    try { r.posText = playerPosText(ptr(addrStr)); } catch (e) {}
    return r;
  };
})();
