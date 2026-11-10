// =====================================================================
// Medical: injuries and absences (bans/suspensions) - FMRTE-style
// "instant fixes". Layout: memory-layout facts, see PROVENANCE.md
// ("Player status, medical, ties and clauses"), live-verified there:
//   player+0xF8 -> medical object
//   medical+0x00 vector<Injury*>   Injury (0x38): type ptr +0x08 (name FmString
//       ptr at type+0x20), start DateDayYear +0x20, full-training days u16
//       +0x28, light-training days u16 +0x2A (both counted from start).
//   medical+0x18 vector<Absence*>  Absence (0x20): kind u8 +0x05 (0x19 ban,
//       0x1F holiday), start DateDayYear +0x10, days u16 +0x16.
// Heal = set the durations to "elapsed until today" (FM clears the injury on
// the next day; the entry stays, so Undo can restore it). Lift ban = same for
// the absence days (FM deletes the entry next day -> not undoable after that).
// (Appended to agent.js by the loaders.)
// =====================================================================
var MED_PTR = 0xF8;
var ABS_BAN = 0x19, ABS_HOLIDAY = 0x1F;

function dayNumber(year, doy) {
  var y = year - 1;
  return y * 365 + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + doy;
}
function todayNumber() {
  var d = rva('date');
  var doy = d.readU16() & 0x1FF, year = d.add(2).readU16();
  if (year < 1990 || year > 2200 || doy < 1) throw new Error('game date not available');
  return dayNumber(year, doy);
}
function dateFromNumber(n) {
  // inverse of dayNumber -> ISO string
  var year = Math.floor(n / 365.2425) + 1;
  while (dayNumber(year, 1) > n) year--;
  while (dayNumber(year + 1, 1) <= n) year++;
  var doy = n - dayNumber(year, 1) + 1;
  var md = dayOfYearToDate(doy, year);
  return year + '-' + pad2(md.month) + '-' + pad2(md.day);
}
function readDateNumber(addr) {
  var doy = addr.readU16() & 0x1FF, year = addr.add(2).readU16();
  if (year < 1900 || year > 2200 || doy < 1 || doy > 366) return null;
  return dayNumber(year, doy);
}
function smallPtrVector(addr, max) {
  var b = addr.readPointer(), e = addr.add(8).readPointer();
  if (b.isNull() || e.compare(b) < 0) return [];
  var n = e.sub(b).toInt32() / 8;
  if (n !== Math.floor(n) || n > (max || 16)) return [];
  var out = [];
  for (var i = 0; i < n; i++) out.push(b.add(i * 8).readPointer());
  return out;
}
function medicalOf(player) {
  var m = player.add(MED_PTR).readPointer();
  return m.isNull() ? null : m;
}
function readInjuries(player, today) {
  var med = medicalOf(player); if (!med) return [];
  var out = [];
  smallPtrVector(med, 16).forEach(function (rec, idx) {
    try {
      if (rec.isNull()) return;
      var start = readDateNumber(rec.add(0x20)); if (start === null) return;
      var full = rec.add(0x28).readU16(), light = rec.add(0x2A).readU16();
      if (light > full || full > 3000) return;
      var name = '';
      try { name = readFmString(rec.add(0x08).readPointer().add(0x20)); } catch (e) {}
      var elapsed = today - start;
      out.push({
        idx: idx, name: name || 'Injury', start: dateFromNumber(start), startNum: start,
        fullDays: full, lightDays: light,
        returnLight: dateFromNumber(start + light), returnFull: dateFromNumber(start + full),
        daysLeft: Math.max(0, full - elapsed), active: elapsed < full,
      });
    } catch (e) {}
  });
  return out;
}
function readAbsences(player, today) {
  var med = medicalOf(player); if (!med) return [];
  var out = [];
  smallPtrVector(med.add(0x18), 16).forEach(function (rec, idx) {
    try {
      if (rec.isNull()) return;
      var kind = rec.add(0x05).readU8();
      var start = readDateNumber(rec.add(0x10)); if (start === null) return;
      var days = rec.add(0x16).readU16();
      var elapsed = today - start;
      out.push({
        idx: idx, kind: kind, isBan: kind === ABS_BAN,
        label: kind === ABS_BAN ? 'Suspension / ban' : kind === ABS_HOLIDAY ? 'Holiday' : 'Absence (code ' + kind + ')',
        start: dateFromNumber(start), startNum: start, days: days, end: dateFromNumber(start + days),
        daysLeft: Math.max(0, days - elapsed), active: elapsed < days,
      });
    } catch (e) {}
  });
  return out;
}
function playerStatus(player, today) {
  var inj = 0, ban = 0;
  try { readInjuries(player, today).forEach(function (x) { if (x.active) inj++; }); } catch (e) {}
  try { readAbsences(player, today).forEach(function (x) { if (x.active && x.isBan) ban++; }); } catch (e) {}
  return { injured: inj > 0, banned: ban > 0 };
}
function injuryRec(player, idx) {
  var med = medicalOf(player); if (!med) throw new Error('player has no medical record');
  var v = smallPtrVector(med, 16); if (!v[idx]) throw new Error('injury not found');
  return v[idx];
}
function absenceRec(player, idx) {
  var med = medicalOf(player); if (!med) throw new Error('player has no medical record');
  var v = smallPtrVector(med.add(0x18), 16); if (!v[idx]) throw new Error('absence not found');
  return v[idx];
}
// Heal one player's active injuries (idx = number or 'all'). Returns undo info.
function healPlayer(player, idx, today) {
  var done = [];
  readInjuries(player, today).forEach(function (inj) {
    if (!inj.active || (idx !== 'all' && idx !== inj.idx)) return;
    var rec = injuryRec(player, inj.idx);
    var elapsed = Math.max(0, today - inj.startNum);
    rec.add(0x28).writeU16(elapsed);
    rec.add(0x2A).writeU16(Math.min(inj.lightDays, elapsed));
    done.push({ idx: inj.idx, name: inj.name, startNum: inj.startNum, oldFull: inj.fullDays, oldLight: inj.lightDays });
  });
  return done;
}
function liftPlayerBans(player, idx, today) {
  var done = [];
  readAbsences(player, today).forEach(function (ab) {
    if (!ab.active || !ab.isBan || (idx !== 'all' && idx !== ab.idx)) return;
    absenceRec(player, ab.idx).add(0x16).writeU16(Math.max(0, today - ab.startNum));
    done.push({ idx: ab.idx, startNum: ab.startNum, oldDays: ab.days });
  });
  return done;
}
function clubPlayers(clubAddr) {
  var club = ptr(clubAddr), b = playerArrayBounds(), out = [];
  for (var i = 0; i < b.count; i++) {
    var p = b.dataPtr.add(i * 8).readPointer(); if (p.isNull()) continue;
    try { var t = p.add(P.teamPtr).readPointer(); if (!t.isNull() && t.add(0x30).readPointer().equals(club)) out.push(p); } catch (e) {}
  }
  return out;
}

rpc.exports.readMedical = function (addrStr) {
  var p = ptr(addrStr), today = todayNumber();
  return { today: dateFromNumber(today), injuries: readInjuries(p, today), absences: readAbsences(p, today) };
};
rpc.exports.healInjury = function (addrStr, idx) {
  var p = ptr(addrStr), today = todayNumber();
  return { healed: healPlayer(p, idx === 'all' ? 'all' : Number(idx), today) };
};
rpc.exports.liftBan = function (addrStr, idx) {
  var p = ptr(addrStr), today = todayNumber();
  return { lifted: liftPlayerBans(p, idx === 'all' ? 'all' : Number(idx), today) };
};
// Undo a heal: only if the same injury (same start date) is still in that slot.
rpc.exports.restoreInjury = function (addrStr, idx, startNum, full, light) {
  var rec = injuryRec(ptr(addrStr), Number(idx));
  if (readDateNumber(rec.add(0x20)) !== Number(startNum)) throw new Error('injury record changed (FM already processed it) - cannot undo');
  rec.add(0x28).writeU16(full); rec.add(0x2A).writeU16(light);
  return { ok: true };
};
rpc.exports.restoreBan = function (addrStr, idx, startNum, days) {
  var rec = absenceRec(ptr(addrStr), Number(idx));
  if (readDateNumber(rec.add(0x10)) !== Number(startNum)) throw new Error('ban already removed by FM - cannot undo');
  rec.add(0x16).writeU16(days);
  return { ok: true };
};
// Club instant fixes: heal all injuries / lift all bans / set morale.
rpc.exports.clubFix = function (clubAddr, what, value) {
  var today = todayNumber(), players = clubPlayers(clubAddr), res = { players: players.length, changed: 0, details: [] };
  players.forEach(function (p) {
    var name = ''; try { name = playerName(p); } catch (e) {}
    if (what === 'heal') {
      var h = healPlayer(p, 'all', today);
      if (h.length) { res.changed++; res.details.push({ address: p.toString(), name: name, healed: h }); }
    } else if (what === 'lift') {
      var l = liftPlayerBans(p, 'all', today);
      if (l.length) { res.changed++; res.details.push({ address: p.toString(), name: name, lifted: l }); }
    } else if (what === 'morale') {
      var v = Math.max(1, Math.min(20, Number(value) || 20));
      var old = p.add(P.morale).readU8();
      if (old !== v) { p.add(P.morale).writeU8(v); res.changed++; res.details.push({ address: p.toString(), name: name, oldMorale: old }); }
    } else throw new Error('unknown fix ' + what);
  });
  return res;
};
// Squad status flags for a list of player addresses.
rpc.exports.playersStatus = function (addrs) {
  var today = todayNumber(), out = {};
  addrs.forEach(function (a) { try { out[a] = playerStatus(ptr(a), today); } catch (e) {} });
  return out;
};
// All currently injured (or banned) players in the database.
rpc.exports.findUnavailable = function (what, limit) {
  limit = limit || 60;
  var today = todayNumber(), b = playerArrayBounds(), out = [];
  for (var i = 0; i < b.count && out.length < limit; i++) {
    var p = b.dataPtr.add(i * 8).readPointer(); if (p.isNull()) continue;
    try {
      var med = p.add(MED_PTR).readPointer(); if (med.isNull()) continue;
      var list = what === 'banned'
        ? readAbsences(p, today).filter(function (x) { return x.active && x.isBan; })
        : readInjuries(p, today).filter(function (x) { return x.active; });
      if (!list.length) continue;
      var club = '';
      try { var t = p.add(P.teamPtr).readPointer(); if (!t.isNull()) club = readFmString(t.add(0x30).readPointer().add(0xC8)); } catch (e) {}
      out.push({ address: p.toString(), name: playerName(p), uid: p.add(P.uid).readU32(), ca: p.add(P.ca).readU16(), pa: p.add(P.pa).readU16(),
        club: club, info: what === 'banned' ? (list[0].daysLeft + ' days left') : (list[0].name + ' · ' + list[0].daysLeft + ' days') });
    } catch (e) {}
  }
  return out;
};
