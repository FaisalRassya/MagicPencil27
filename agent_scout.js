// =====================================================================
// Transfer scout: scan the whole player database for candidates that fit
// given position slots, with attributes/positions decoded so the UI can
// rate them with the same position weights as Best XI. Read-only.
// =====================================================================
function scoutClubRep(p) {
  try { var t = p.add(P.teamPtr).readPointer(); if (t.isNull()) return 0; var c = t.add(0x30).readPointer(); if (c.isNull()) return 0; var st = clubSeniorTeam(c); return st ? st.add(0xA8).readU16() : 0; } catch (e) { return 0; }
}
function scoutClubAddr(p) {
  try { var t = p.add(P.teamPtr).readPointer(); if (t.isNull()) return null; var c = t.add(0x30).readPointer(); return c.isNull() ? null : c.toString(); } catch (e) { return null; }
}
// club info for the scout: budgets + reputation (works for minor finance clubs too: budgets null)
rpc.exports.scoutClubInfo = function (clubAddr) {
  var r = rpc.exports.readClub(clubAddr), c = ptr(clubAddr), out = { name: r.name, fullName: r.fullName, transferBudget: null, wageBudget: null, wageSpend: null, reputation: null };
  if (r.hasFullFinance) { out.transferBudget = r.transferBudget; out.wageBudget = r.wageBudget; out.wageSpend = r.currentWageSpend; out.balance = r.balance; }
  try { var t = clubSeniorTeam(c); if (t) out.reputation = t.add(0xA8).readU16(); } catch (e) {}
  return out;
};
// q: { slots: [{key:'pos_dc', minCa}], ageMin, ageMax, maxValue, excludeClub, perSlot, freeOnly, expiringBefore (date number) }
rpc.exports.scoutPlayers = function (q) {
  q = q || {};
  var b = playerArrayBounds(), year = null, today = null;
  try { year = rva('date').add(2).readU16(); } catch (e) {}
  try { today = todayNumber(); } catch (e) {}
  var slots = (q.slots || []).filter(function (s) { return s.key in P; });
  var per = Math.min(q.perSlot || 60, 150);
  var buckets = slots.map(function () { return []; });
  var exclude = q.excludeClub || null;
  for (var i = 0; i < b.count; i++) {
    var p = b.dataPtr.add(i * 8).readPointer(); if (p.isNull()) continue;
    try {
      var ca = p.add(P.ca).readU16();
      var age = year ? year - p.add(P.dob).add(2).readU16() : null;
      if (q.ageMin != null && (age == null || age < q.ageMin)) continue;
      if (q.ageMax != null && (age == null || age > q.ageMax)) continue;
      var match = -1;
      for (var s = 0; s < slots.length; s++) {
        if (ca < (slots[s].minCa || 0) || ca > (slots[s].maxCa || 200)) continue;
        if (p.add(P[slots[s].key]).readU8() < 14) continue;
        match = s; break;
      }
      if (match < 0) continue;
      var club = scoutClubAddr(p);
      if (exclude && club === exclude) continue;
      if (q.freeOnly && club) continue;
      var value = 0; try { value = p.add(P.transferValue).readS32(); } catch (e) {}
      if (q.maxValue != null && club && value > q.maxValue) continue;
      for (var s2 = match; s2 < slots.length; s2++) {
        if (ca < (slots[s2].minCa || 0) || ca > (slots[s2].maxCa || 200) || p.add(P[slots[s2].key]).readU8() < 14) continue;
        buckets[s2].push({ p: p, ca: ca, age: age, value: value, club: club });
      }
    } catch (e) {}
  }
  var out = {};
  slots.forEach(function (sl, s) {
    var arr = buckets[s].sort(function (x, y) { return y.ca - x.ca; }).slice(0, per);
    out[sl.key] = arr.map(function (h) {
      var r = { address: h.p.toString(), ca: h.ca, age: h.age, value: h.value, freeAgent: !h.club };
      try { r.pa = h.p.add(P.pa).readU16(); } catch (e) {}
      try { r.name = playerName(h.p); } catch (e) { r.name = '?'; }
      r.club = playerClubName(h.p); r.nation = playerNation(h.p); r.clubRep = scoutClubRep(h.p);
      try { r.pos = playerPosText(h.p); } catch (e) {}
      try { r.askingPrice = h.p.add(P.askingPrice).readS32(); } catch (e) {}
      r.attrs = {}; ENCODED_FIELDS.forEach(function (k) { try { r.attrs[k] = decodeAttr(h.p.add(P[k]).readU8()); } catch (e) {} });
      r.positions = {}; POSITION_KEYS.forEach(function (k) { try { r.positions[k] = h.p.add(P[k]).readU8(); } catch (e) {} });
      try {
        var cp = h.p.add(P.contractPtr).readPointer();
        if (!cp.isNull()) {
          r.wage = cp.add(C.wage).readU32();
          r.expiry = readDate(cp.add(C.expiry)).iso;
          var lf = cp.add(C.listFlags).readU8(); r.transferListed = (lf & 1) !== 0; r.loanListed = (lf & 2) !== 0;
        }
      } catch (e) {}
      try { if (today != null) { var st = playerStatus(h.p, today); r.injured = st.injured; } } catch (e) {}
      return r;
    });
  });
  return { slots: out };
};

// ---- contracts of a club (for the contract renewal page) ----
rpc.exports.clubContracts = function (clubAddr) {
  var sq = rpc.exports.squadDetail(clubAddr);
  sq.teams.forEach(function (t) {
    t.players.forEach(function (row) {
      try {
        var p = ptr(row.address);
        try { row.value = p.add(P.transferValue).readS32(); } catch (e) {}
        var cp = p.add(P.contractPtr).readPointer();
        if (cp.isNull()) { row.contract = null; return; }
        row.contract = {
          wage: cp.add(C.wage).readU32(), signed: readDate(cp.add(C.signed)).iso, expiry: readDate(cp.add(C.expiry)).iso,
          squadStatus: cp.add(C.squadStatus).readU8(), squadNumber: cp.add(C.squadNumber).readU8(),
        };
        var lf = cp.add(C.listFlags).readU8(); row.contract.transferListed = (lf & 1) !== 0; row.contract.loanListed = (lf & 2) !== 0;
      } catch (e) {}
    });
  });
  try { var d = readDate(rva('date')); sq.today = d.iso; } catch (e) {}
  return sq;
};
rpc.exports.playerDbIds = function (addrs) { return addrs.map(function (a) { try { return ptr(a).add(0x290).readU32(); } catch (e) { return 0; } }); };
