// FM27 Memory Editor - Frida Agent
// Memory layout facts (field offsets) cross-checked against the public notes of
// barak14/fm-editor and verified live; no code from that project is used (see PROVENANCE.md).

function getModule() {
  var mod = Process.getModuleByName('game_plugin.dll');
  if (!mod) throw new Error('game_plugin.dll not found - is FM27 running?');
  return mod;
}

// ---- Address resolver --------------------------------------------------
// FM patches shift every global. Instead of hard-coding, find the player
// vector by RTTI near its last known RVA, take that shift as the data
// delta, then verify every other global by RTTI class name (falling back to
// a local scan). Code-side vtables are found from live objects.
// Baseline RVAs = FM27 Steam build of 2026-11-01 (pre 3 Nov patch).
var BASE_RVA = {
  players: 0x57037D0, staff: 0x5703818, officials: 0x5703848, clubs: 0x5703988,
  comps: 0x57013b0, awards: 0x5702370, nations: 0x5702848, stadiums: 0x5703688,
  date: 0x56AD378,
};
var R = null;
function modRange() { var m = getModule(); return { lo: m.base, hi: m.base.add(m.size), m: m }; }
function inModule(p) { var r = modRange(); return p.compare(r.lo) >= 0 && p.compare(r.hi) < 0; }
function rttiName(obj) {
  try {
    var lo = getModule().base;
    var vt = obj.readPointer(); if (!inModule(vt)) return null;
    var col = vt.sub(8).readPointer(); if (!inModule(col)) return null;
    return lo.add(col.add(12).readU32()).add(16).readCString();
  } catch (e) { return null; }
}
function vecInfo(rva) {
  try {
    var lo = getModule().base;
    var b = lo.add(rva).readPointer(), e = lo.add(rva + 8).readPointer();
    if (b.isNull() || inModule(b) || e.compare(b) <= 0) return null;
    var bytes = e.sub(b).toInt32(); if (bytes % 8 || bytes > 80000000) return null;
    return { n: bytes / 8, cls: rttiName(b.readPointer()) };
  } catch (x) { return null; }
}
function poolInfo(rva) {
  try {
    var h = getModule().base.add(rva);
    var b = h.readPointer(), e = h.add(8).readPointer();
    if (b.isNull() || e.sub(b).toInt32() !== 8) return null;
    return { n: h.add(0x24).readU32(), size: h.add(0x28).readU32(), cls: rttiName(b.readPointer()) };
  } catch (x) { return null; }
}
function findNear(rva, test, radius) {
  if (test(rva)) return rva;
  for (var d = 8; d <= radius; d += 8) { if (test(rva + d)) return rva + d; if (test(rva - d)) return rva - d; }
  return null;
}

function dateKey(a) {
  var dw = a.readU16(), y = a.add(2).readU16(), d = dw & 0x1FF;
  if (y < 1990 || y > 2200 || d < 1 || d > 366) return 0;
  return y * 1000 + d;
}
function findDateByData(playersRva) {
  var base = getModule().base, size = getModule().size;
  var vb = base.add(playersRva).readPointer(), n = base.add(playersRva + 8).readPointer().sub(vb).toInt32() / 8;
  var newest = 0;
  for (var i = 0; i < n; i++) {
    try {
      var p = vb.add(i * 8).readPointer(); if (p.isNull()) continue;
      var c = p.add(0x330).readPointer(); if (c.isNull()) continue;
      var k = dateKey(c.add(0x44)); if (k > newest) newest = k;
    } catch (e) {}
  }
  if (!newest) return null;
  var nyear = Math.floor(newest / 1000);
  var best = null;
  var lo = Math.max(0x1000, playersRva - 0x300000), hi = Math.min(size - 8, playersRva + 0x100000);
  for (var a = lo; a < hi; a += 2) {
    try {
      var y = base.add(a + 2).readU16();
      if (y !== nyear && y !== nyear + 1) continue;
      var k2 = dateKey(base.add(a)); if (!k2) continue;
      var diff = (Math.floor(k2 / 1000) - nyear) * 366 + (k2 % 1000) - (newest % 1000);
      if (diff < 0 || diff > 30) continue;
      if (!best || diff < best.diff) best = { rva: a, diff: diff };
    } catch (e) { a = (a | 0xFFF) - 1; }
  }
  return best ? best.rva : null;
}
// Fallback after an FM patch: scan the whole module image for player vectors.
// The real list is the one whose club vector sits at the same relative slot as in the baseline.
function scanForPlayers(isPc) {
  var mod = getModule(), size = mod.size, CH = 0x100000, cands = [];
  var lo = mod.base, hiA = mod.base.add(size);
  for (var off = 0; off < size; off += CH) {
    var buf; try { buf = mod.base.add(off).readByteArray(Math.min(CH + 16, size - off)); } catch (e) { continue; }
    for (var i = 0; i + 16 <= buf.length && i < CH; i += 8) {
      var b = buf.readBigUInt64LE(i), e = buf.readBigUInt64LE(i + 8);
      if (b < 0x10000000n || b > 0x7fffffffffffn || e <= b) continue;
      var bytes = e - b; if (bytes % 8n || bytes < 8000n || bytes > 80000000n) continue;
      if (ptr(b).compare(lo) >= 0 && ptr(b).compare(hiA) < 0) continue;
      var v = vecInfo(off + i);
      if (v && isPc(v.cls) && v.n > 1000) cands.push({ rva: off + i, n: v.n });
    }
  }
  var dc = BASE_RVA.clubs - BASE_RVA.players;
  var good = cands.filter(function (c) { var cv = vecInfo(c.rva + dc); return cv && cv.cls === '.?AVCLUB@db@@'; });
  var pick = (good.length ? good : cands).sort(function (a, b) { return b.n - a.n; })[0];
  return pick || null;
}
function resolveRvas() {
  if (R) return R;
  var P = '.?AVACTUAL_PLAYER@db@@';
  // 1) players: biggest ACTUAL_PLAYER vector within +-1 MB of the baseline
  // search outward from the baseline; once a hit is found, take the biggest
  // ACTUAL_PLAYER vector in a small window around it (the full list).
  var P2 = '.?AVACTUAL_PLAYER_AND_NON_PLAYER@db@@';
  var isPc = function (c) { return c === P || c === P2; };
  var isP = function (a) { var v = vecInfo(a); return v && isPc(v.cls) && v.n > 1000; };
  var hit = findNear(BASE_RVA.players, isP, 0x100000);
  var best = null;
  if (hit !== null) {
    for (var w = hit - 0x80; w <= hit + 0x80; w += 8) {
      var v = vecInfo(w);
      if (v && isPc(v.cls) && v.n > 1000 && (!best || v.n > best.n)) best = { rva: w, n: v.n };
    }
  }
  if (!best) best = scanForPlayers(isPc);
  if (!best) throw new Error('Player list not found. Is a save loaded in FM27? (If FM was just patched, the editor needs updating.)');
  var delta = best.rva - BASE_RVA.players;
  var out = { delta: delta, players: best.rva, playerCount: best.n, warnings: [] };
  function vec(name, cls) {
    var r = findNear(BASE_RVA[name] + delta, function (a) { var v = vecInfo(a); return v && v.n > 10 && (!cls || v.cls === cls); }, 0x400);
    if (r === null) out.warnings.push(name + ' not found');
    out[name] = r;
  }
  function pool(name, cls) {
    var r = findNear(BASE_RVA[name] + delta, function (a) { var p = poolInfo(a); return p && p.cls === cls && p.n > 0; }, 0x4000);
    if (r === null) out.warnings.push(name + ' not found');
    out[name] = r;
  }
  // staff objects have no usable RTTI; same relative slot as players, checked by count
  out.staff = BASE_RVA.staff + delta;
  var sv = vecInfo(out.staff); if (!sv || sv.n < 100) { out.warnings.push('staff not found'); out.staff = null; }
  vec('officials', '.?AVOFFICIAL@db@@');
  vec('clubs', '.?AVCLUB@db@@');
  pool('comps', '.?AVCOMP@db@@');
  pool('awards', '.?AVAWARD@db@@');
  pool('nations', '.?AVNATION@db@@');
  pool('stadiums', '.?AVSTADIUM@db@@');
  // 2) current date: same delta, sanity-checked
  out.date = null;
  try {
    var da = getModule().base.add(BASE_RVA.date + delta), y = da.add(2).readU16(), dd = da.readU16() & 0x1FF;
    if (y >= 1990 && y <= 2200 && dd >= 1 && dd <= 366) out.date = BASE_RVA.date + delta;
  } catch (e) {}
  if (out.date === null) {
    // Other builds (e.g. PC Game Pass) lay the globals out differently: find the
    // game date near the player list, anchored on the newest contract-signed
    // date in the save (FM signs contracts every day, so it is ~today).
    try { out.date = findDateByData(best.rva); out.dateSource = 'data'; } catch (e) {}
    if (out.date === null) out.warnings.push('game date not found');
  }
  R = out;
  // 3) vtables from live objects (code section may shift differently)
  R.financeVtable = null;
  try {
    var lo = getModule().base, cv = R.clubs;
    var cb = lo.add(cv).readPointer(), cn = lo.add(cv + 8).readPointer().sub(cb).toInt32() / 8;
    for (var i = 0; i < cn && !R.financeVtable; i++) {
      var c = cb.add(i * 8).readPointer(); if (c.isNull()) continue;
      var f = c.add(0x150).readPointer(); if (f.isNull()) continue;
      if (rttiName(f) === '.?AVCLUB_FINANCE@db@@') R.financeVtable = f.readPointer();
    }
  } catch (e) {}
  if (!R.financeVtable) R.warnings.push('club finance class not found (club finance editing disabled)');
  R.hmVtable = null;
  try {
    var lo2 = getModule().base;
    var sb = lo2.add(R.staff).readPointer(), sn = lo2.add(R.staff + 8).readPointer().sub(sb).toInt32() / 8;
    var groups = {};
    for (var j = 0; j < sn; j++) {
      var o = sb.add(j * 8).readPointer(); if (o.isNull()) continue;
      var k = o.readPointer().toString();
      if (!groups[k]) groups[k] = { n: 0, o: o, vt: o.readPointer() };
      groups[k].n++;
    }
    for (var key in groups) {
      var g = groups[key];
      // human-manager objects keep their name records at +0x150 + 0x340
      if (g.n <= 50 && (readNameSub(g.o.add(0x490)) || readNameSub(g.o.add(0x498)) || readNameSub(g.o.add(0x4A0)))) { R.hmVtable = g.vt; break; }
    }
  } catch (e) {}
  return R;
}
function rva(name) {
  var r = resolveRvas();
  if (r[name] === null || r[name] === undefined) throw new Error(name + ' could not be located in this FM build');
  return getModule().base.add(r[name]);
}

// ---- attribute (1-20 scale) encoding ----
function decodeAttr(raw) { return Math.floor((raw + 2) / 5); }
function encodeAttr(displayed) {
  if (displayed < 1) displayed = 1;
  if (displayed > 20) displayed = 20;
  return displayed * 5 - 2;
}

// ---- date (DateDayYear: u16 day-of-year w/ flag bits above bit 8, u16 year) ----
function isLeap(year) { return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0; }
function monthLengths(year) {
  var l = isLeap(year);
  return [31, l ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
}
function dayOfYearToDate(doy, year) {
  var lens = monthLengths(year);
  var remaining = doy;
  for (var m = 0; m < 12; m++) {
    if (remaining <= lens[m]) return { day: remaining, month: m + 1 };
    remaining -= lens[m];
  }
  return { day: Math.max(remaining, 1), month: 12 };
}
function dateToDayOfYear(day, month, year) {
  var lens = monthLengths(year);
  var doy = day;
  for (var m = 0; m < month - 1; m++) doy += lens[m];
  return doy;
}
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function readDate(addr) {
  var dayWord = addr.readU16();
  var year = addr.add(2).readU16();
  var day = dayWord & 0x1FF;
  var md = dayOfYearToDate(day || 1, year || 1900);
  var notSet = (dayWord & 0x1FF) <= 1 && year <= 1900;
  return { iso: year + '-' + pad2(md.month) + '-' + pad2(md.day), notSet: notSet, rawDay: dayWord, year: year };
}
function writeDate(addr, iso) {
  var parts = iso.split('-');
  var year = parseInt(parts[0], 10), month = parseInt(parts[1], 10), day = parseInt(parts[2], 10);
  var doy = dateToDayOfYear(day, month, year);
  var existing = addr.readU16();
  var flags = existing & ~0x1FF;
  addr.writeU16((doy & 0x1FF) | flags);
  addr.add(2).writeU16(year);
}

function readFmString(fieldPtrAddr) {
  // fieldPtrAddr holds a pointer to [u32 len][utf8 bytes]
  try {
    var strPtr = fieldPtrAddr.readPointer();
    if (strPtr.isNull()) return '';
    var len = strPtr.readU32();
    if (len <= 0 || len > 400) return '';
    return strPtr.add(4).readUtf8String(len) || '';
  } catch (e) { return ''; }
}

// 16-byte shared name record: [FmString ptr][u32 id][u16 group][u16 count]
function readNameSub(ptrFieldAddr) {
  try {
    var recPtr = ptrFieldAddr.readPointer();
    if (recPtr.isNull()) return '';
    return readFmString(recPtr); // recPtr+0x00 is the FmString pointer field
  } catch (e) { return ''; }
}

// ---- player struct layout (relative to canonical player base pointer) ----
var P = {
  uid: 0x294, ca: 0x264, pa: 0x266, morale: 0x26C,
  homeRep: 0x25E, currentRep: 0x260, dob: 0x310, height: 0x22E,
  nameFirst: 0x2D8, nameLast: 0x2E0, nameCommon: 0x2E8,
  teamPtr: 0x130, contractPtr: 0x330, nationPtr: 0x2F0,
  askingPrice: 0x238, transferValue: 0x234,
  // Positions (15 x u8, direct 1-20)
  pos_gk: 0x150, pos_sw: 0x151, pos_dl: 0x152, pos_dc: 0x153, pos_dr: 0x154,
  pos_dm: 0x155, pos_ml: 0x156, pos_mc: 0x157, pos_mr: 0x158, pos_aml: 0x159,
  pos_amc: 0x15A, pos_amr: 0x15B, pos_st: 0x15C, pos_wbl: 0x15D, pos_wbr: 0x15E,
  // Personality (direct 1-20)
  p_adaptability: 0x2F8, p_ambition: 0x2F9, p_loyalty: 0x2FA, p_pressure: 0x2FB,
  p_professionalism: 0x2FC, p_sportsmanship: 0x2FD, p_temperament: 0x2FE, p_controversy: 0x2FF,
  // Technical
  crossing: 0x15F, dribbling: 0x160, finishing: 0x161, heading: 0x162,
  long_shots: 0x163, marking: 0x164, passing: 0x166, tackling: 0x168,
  technique: 0x176, first_touch: 0x175,
  // Set pieces
  corners: 0x17A, free_kicks: 0x182, long_throws: 0x17D, penalty_taking: 0x167,
  // Mental
  aggression: 0x18C, anticipation: 0x170, bravery: 0x18A, composure: 0x193,
  concentration: 0x194, decisions: 0x171, flair: 0x179, leadership: 0x187,
  off_the_ball: 0x165, positioning: 0x173, teamwork: 0x17B, vision: 0x169,
  work_rate: 0x17C, determination: 0x192,
  // Physical
  acceleration: 0x181, agility: 0x18D, balance: 0x189, jumping_reach: 0x186,
  natural_fitness: 0x191, pace: 0x185, stamina: 0x184, strength: 0x183,
  // Goalkeeping
  handling: 0x16A, aerial_reach: 0x16B, command_of_area: 0x16C,
  communication: 0x16D, kicking: 0x16E, throwing: 0x16F, one_on_ones: 0x172,
  reflexes: 0x174, eccentricity: 0x17E, rushing_out: 0x17F, punching: 0x180,
  // Footedness
  left_foot: 0x177, right_foot: 0x178,
  // Hidden
  consistency: 0x18B, injury_proneness: 0x18F, important_matches: 0x18E,
  dirtiness: 0x188, versatility: 0x190,
};
var ENCODED_FIELDS = ['crossing','dribbling','finishing','heading','long_shots','marking',
  'passing','tackling','technique','first_touch','corners','free_kicks','long_throws',
  'penalty_taking','aggression','anticipation','bravery','composure','concentration',
  'decisions','flair','leadership','off_the_ball','positioning','teamwork','vision',
  'work_rate','determination','acceleration','agility','balance','jumping_reach',
  'natural_fitness','pace','stamina','strength','handling','aerial_reach',
  'command_of_area','communication','kicking','throwing','one_on_ones','reflexes',
  'eccentricity','rushing_out','punching','left_foot','right_foot','consistency',
  'injury_proneness','important_matches','dirtiness','versatility'];
var RAW_U16_FIELDS = ['ca', 'pa', 'homeRep', 'currentRep'];
var DIRECT_FIELDS = ['morale',
  'pos_gk','pos_sw','pos_dl','pos_dc','pos_dr','pos_dm','pos_ml','pos_mc','pos_mr',
  'pos_aml','pos_amc','pos_amr','pos_st','pos_wbl','pos_wbr',
  'p_adaptability','p_ambition','p_loyalty','p_pressure','p_professionalism',
  'p_sportsmanship','p_temperament','p_controversy'];
var POSITION_KEYS = ['pos_gk','pos_sw','pos_dl','pos_dc','pos_dr','pos_dm','pos_ml','pos_mc','pos_mr','pos_aml','pos_amc','pos_amr','pos_st','pos_wbl','pos_wbr'];
var PERSONALITY_KEYS = ['p_adaptability','p_ambition','p_loyalty','p_pressure','p_professionalism','p_sportsmanship','p_temperament','p_controversy'];

// Contract sub-record offsets (relative to contract pointer at player+0x330)
var C = {
  wage: 0x20, signed: 0x44, expiry: 0x48, squadStatus: 0x54,
  squadNumber: 0x5D, listFlags: 0x57, listDate: 0x50, listCode: 0x58,
};
var SQUAD_STATUS_LABELS = {
  1: 'Star Player', 2: 'Important Player', 4: 'Squad Player', 5: 'Impact Sub',
};

function playerArrayBounds() {
  var mod = getModule();
  var a = rva('players');
  var dataPtr = a.readPointer();
  var endPtr = a.add(8).readPointer();
  var count = endPtr.sub(dataPtr).toInt32() / 8;
  return { dataPtr: dataPtr, count: count };
}

function clubArrayBounds() {
  var mod = getModule();
  var a = rva('clubs');
  var dataPtr = a.readPointer();
  var endPtr = a.add(8).readPointer();
  var count = endPtr.sub(dataPtr).toInt32() / 8;
  return { dataPtr: dataPtr, count: count };
}

function playerName(base) {
  var common = readNameSub(base.add(P.nameCommon));
  if (common) return common;
  var first = readNameSub(base.add(P.nameFirst));
  var last = readNameSub(base.add(P.nameLast));
  return (first + ' ' + last).trim();
}

rpc.exports = {
  ping: function () {
    var mod = getModule();
    return { ok: true, moduleBase: mod.base.toString(), moduleSize: mod.size };
  },

  getSaveInfo: function () {
    var mod = getModule();
    R = null; // re-resolve on every Load Data (new save / new patch)
    var res = resolveRvas();
    var pb = playerArrayBounds();
    var cb = clubArrayBounds();
    var info = { playerCount: pb.count, clubCount: cb.count, date: null,
      rvaDelta: '0x' + res.delta.toString(16), warnings: res.warnings };
    try {
      var dateAddr = rva('date');
      var dayWord = dateAddr.readU16();
      var year = dateAddr.add(2).readU16();
      var day = dayWord & 0x1FF;
      var md = dayOfYearToDate(day || 1, year || 1900);
      info.date = { iso: year + '-' + pad2(md.month) + '-' + pad2(md.day), year: year };
    } catch (e) {}
    return info;
  },

  playerCount: function () {
    return playerArrayBounds().count;
  },

  findPlayerByUid: function (uid) {
    var b = playerArrayBounds();
    for (var i = 0; i < b.count; i++) {
      var ptr_ = b.dataPtr.add(i * 8).readPointer();
      if (ptr_.isNull()) continue;
      var u;
      try { u = ptr_.add(P.uid).readU32(); } catch (e) { continue; }
      if (u === uid) {
        return { address: ptr_.toString(), name: playerName(ptr_), uid: u };
      }
    }
    return null;
  },

  findPlayersByName: function (needle, limit, filters) {
    limit = limit || 25;
    needle = (needle || '').toLowerCase();
    filters = filters || {};
    var b = playerArrayBounds();
    var results = [];
    var currentYear = null;
    if (filters.ageMin != null || filters.ageMax != null) {
      try {
        var mod = getModule();
        currentYear = rva('date').add(2).readU16();
      } catch (e) {}
    }
    for (var i = 0; i < b.count && results.length < limit; i++) {
      var ptr_ = b.dataPtr.add(i * 8).readPointer();
      if (ptr_.isNull()) continue;
      var nm;
      try { nm = playerName(ptr_); } catch (e) { continue; }
      if (needle && (!nm || nm.toLowerCase().indexOf(needle) === -1)) continue;
      var uid = 0, ca = 0, pa = 0, age = null;
      try { uid = ptr_.add(P.uid).readU32(); } catch (e) {}
      try { ca = ptr_.add(P.ca).readU16(); } catch (e) {}
      try { pa = ptr_.add(P.pa).readU16(); } catch (e) {}
      if (filters.caMin != null && ca < filters.caMin) continue;
      if (filters.paMin != null && pa < filters.paMin) continue;
      if (currentYear != null) {
        try {
          var birthYear = ptr_.add(P.dob).add(2).readU16();
          age = currentYear - birthYear;
        } catch (e) {}
        if (filters.ageMin != null && (age == null || age < filters.ageMin)) continue;
        if (filters.ageMax != null && (age == null || age > filters.ageMax)) continue;
      }
      results.push({ address: ptr_.toString(), name: nm, uid: uid, ca: ca, pa: pa, age: age });
    }
    return results;
  },

  // Apply the same field+value to many players in one call (Bulk Edit).
  bulkSetPlayerAttribute: function (addresses, key, value) {
    var results = [];
    for (var i = 0; i < addresses.length; i++) {
      try {
        var r = this.setPlayerAttribute(addresses[i], key, value);
        results.push({ address: addresses[i], ok: true, value: r.value !== undefined ? r.value : r.decoded });
      } catch (e) {
        results.push({ address: addresses[i], ok: false, error: e.toString() });
      }
    }
    return results;
  },

  readPlayer: function (addrStr) {
    var base = ptr(addrStr);
    var out = { address: addrStr };
    out.name = playerName(base);
    out.uid = base.add(P.uid).readU32();
    out.ca = base.add(P.ca).readU16();
    out.pa = base.add(P.pa).readU16();
    out.morale = base.add(P.morale).readU8();
    out.homeRep = base.add(P.homeRep).readU16();
    out.currentRep = base.add(P.currentRep).readU16();
    out.height = base.add(P.height).readU16();
    try { out.dob = readDate(base.add(P.dob)); } catch (e) { out.dob = null; }
    out.attributes = {};
    for (var i = 0; i < ENCODED_FIELDS.length; i++) {
      var key = ENCODED_FIELDS[i];
      var raw = base.add(P[key]).readU8();
      out.attributes[key] = decodeAttr(raw);
    }
    out.positions = {};
    for (var pi = 0; pi < POSITION_KEYS.length; pi++) {
      out.positions[POSITION_KEYS[pi]] = base.add(P[POSITION_KEYS[pi]]).readU8();
    }
    out.personality = {};
    for (var qi = 0; qi < PERSONALITY_KEYS.length; qi++) {
      out.personality[PERSONALITY_KEYS[qi]] = base.add(P[PERSONALITY_KEYS[qi]]).readU8();
    }
    // Club via team pointer
    try {
      var teamPtr = base.add(P.teamPtr).readPointer();
      if (!teamPtr.isNull()) {
        var clubPtr = teamPtr.add(0x30).readPointer();
        if (!clubPtr.isNull()) out.club = readFmString(clubPtr.add(0xC8));
      }
    } catch (e) {}
    // Nationality
    try {
      var nationPtr = base.add(P.nationPtr).readPointer();
      if (!nationPtr.isNull()) out.nationality = readFmString(nationPtr.add(0x18));
    } catch (e) {}
    // Transfer market
    try {
      out.askingPrice = base.add(P.askingPrice).readS32();
      out.transferValue = base.add(P.transferValue).readS32();
    } catch (e) {}
    // Contract sub-record
    out.contract = null;
    try {
      var contractPtr = base.add(P.contractPtr).readPointer();
      if (!contractPtr.isNull()) {
        var squadStatus = contractPtr.add(C.squadStatus).readU8();
        var squadNumber = contractPtr.add(C.squadNumber).readU8();
        var listFlags = contractPtr.add(C.listFlags).readU8();
        out.contract = {
          wage: contractPtr.add(C.wage).readU32(),
          squadStatus: squadStatus,
          squadStatusLabel: SQUAD_STATUS_LABELS[squadStatus] || ('Level ' + squadStatus),
          squadNumber: squadNumber === 255 ? null : squadNumber,
          signed: readDate(contractPtr.add(C.signed)),
          expiry: readDate(contractPtr.add(C.expiry)),
          transferListed: (listFlags & 0x01) !== 0,
          loanListed: (listFlags & 0x02) !== 0,
          listFlagsRaw: listFlags,
        };
      }
    } catch (e) { out.contractError = e.toString(); }
    return out;
  },

  setPlayerAttribute: function (addrStr, key, value) {
    var base = ptr(addrStr);

    if (RAW_U16_FIELDS.indexOf(key) !== -1) {
      if (!(key in P)) throw new Error('unknown field: ' + key);
      base.add(P[key]).writeU16(value);
      return { ok: true, field: key, value: value };
    }
    if (DIRECT_FIELDS.indexOf(key) !== -1) {
      var dv = value;
      if (dv < 0) dv = 0;
      if (dv > 20) dv = 20;
      base.add(P[key]).writeU8(dv);
      var dback = base.add(P[key]).readU8();
      return { ok: true, field: key, value: dback };
    }
    if (key === 'askingPrice' || key === 'transferValue') {
      base.add(P[key]).writeS32(value);
      return { ok: true, field: key, value: value };
    }
    if (key === 'contract.wage') {
      var contractPtr = base.add(P.contractPtr).readPointer();
      if (contractPtr.isNull()) throw new Error('no contract');
      contractPtr.add(C.wage).writeU32(value);
      return { ok: true, field: key, value: value };
    }
    if (key === 'contract.squadNumber') {
      var contractPtr2 = base.add(P.contractPtr).readPointer();
      if (contractPtr2.isNull()) throw new Error('no contract');
      var v = (value === null || value === '' || value < 0 || value > 99) ? 255 : value;
      contractPtr2.add(C.squadNumber).writeU8(v);
      return { ok: true, field: key, value: v === 255 ? null : v };
    }
    if (key === 'contract.squadStatus') {
      var contractPtr3 = base.add(P.contractPtr).readPointer();
      if (contractPtr3.isNull()) throw new Error('no contract');
      contractPtr3.add(C.squadStatus).writeU8(value);
      return { ok: true, field: key, value: value };
    }
    if (key === 'contract.expiry') {
      var contractPtr4 = base.add(P.contractPtr).readPointer();
      if (contractPtr4.isNull()) throw new Error('no contract');
      writeDate(contractPtr4.add(C.expiry), value);
      return { ok: true, field: key, value: value };
    }
    if (key === 'contract.transferListed' || key === 'contract.loanListed') {
      var contractPtr5 = base.add(P.contractPtr).readPointer();
      if (contractPtr5.isNull()) throw new Error('no contract');
      var flags = contractPtr5.add(C.listFlags).readU8();
      var bit = key === 'contract.transferListed' ? 0x01 : 0x02;
      flags = value ? (flags | bit) : (flags & ~bit);
      contractPtr5.add(C.listFlags).writeU8(flags);
      return { ok: true, field: key, value: !!value };
    }

    if (ENCODED_FIELDS.indexOf(key) === -1) throw new Error('unknown or unsupported field: ' + key);
    var raw = encodeAttr(value);
    base.add(P[key]).writeU8(raw);
    var readback = base.add(P[key]).readU8();
    return { ok: true, field: key, wroteRaw: raw, decoded: decodeAttr(readback) };
  },

  // ---- clubs ----
  findClubsByName: function (needle, limit) {
    limit = limit || 25;
    needle = needle.toLowerCase();
    var b = clubArrayBounds();
    var results = [];
    for (var i = 0; i < b.count && results.length < limit; i++) {
      var ptr_ = b.dataPtr.add(i * 8).readPointer();
      if (ptr_.isNull()) continue;
      var nm;
      try { nm = readFmString(ptr_.add(0xC8)); } catch (e) { continue; }
      if (nm && nm.toLowerCase().indexOf(needle) !== -1) {
        results.push({ address: ptr_.toString(), name: nm });
      }
    }
    return results;
  },

  // All players whose current team belongs to this club, grouped by team
  // (first team / reserves / youth), strongest team first.
  clubSquad: function (addrStr) {
    var club = ptr(addrStr);
    var b = playerArrayBounds();
    var year = null;
    try { year = rva('date').add(2).readU16(); } catch (e) {}
    var POS_LABEL = { pos_gk: 'GK', pos_sw: 'SW', pos_dl: 'DL', pos_dc: 'DC', pos_dr: 'DR', pos_dm: 'DM', pos_ml: 'ML',
      pos_mc: 'MC', pos_mr: 'MR', pos_aml: 'AML', pos_amc: 'AMC', pos_amr: 'AMR', pos_st: 'ST', pos_wbl: 'WBL', pos_wbr: 'WBR' };
    var teams = {};
    for (var i = 0; i < b.count; i++) {
      var p = b.dataPtr.add(i * 8).readPointer();
      if (p.isNull()) continue;
      var t;
      try {
        t = p.add(P.teamPtr).readPointer();
        if (t.isNull() || !t.add(0x30).readPointer().equals(club)) continue;
      } catch (e) { continue; }
      var row = { address: p.toString() };
      try { row.name = playerName(p); } catch (e) { row.name = '?'; }
      try { row.uid = p.add(P.uid).readU32(); row.ca = p.add(P.ca).readU16(); row.pa = p.add(P.pa).readU16(); } catch (e) {}
      try { if (year) row.age = year - p.add(P.dob).add(2).readU16(); } catch (e) {}
      try {
        var best = 0, list = [];
        POSITION_KEYS.forEach(function (k) { var v = p.add(P[k]).readU8(); if (v > best) best = v; });
        POSITION_KEYS.forEach(function (k) { var v = p.add(P[k]).readU8(); if (v >= 15 && v >= best - 2) list.push(POS_LABEL[k]); });
        row.pos = list.join(', ');
      } catch (e) { row.pos = ''; }
      var key = t.toString();
      if (!teams[key]) teams[key] = { team: key, players: [] };
      teams[key].players.push(row);
    }
    var arr = Object.keys(teams).map(function (k) {
      var T = teams[k];
      T.players.sort(function (a, c) { return (c.ca || 0) - (a.ca || 0); });
      var sum = 0; T.players.forEach(function (x) { sum += x.ca || 0; });
      T.avgCa = T.players.length ? Math.round(sum / T.players.length) : 0;
      return T;
    });
    arr.sort(function (a, c) { return c.avgCa - a.avgCa; });
    return { teams: arr };
  },

  readClub: function (addrStr) {
    var mod = getModule();
    var fullFinanceVtable = resolveRvas().financeVtable;
    var base = ptr(addrStr);
    var out = { address: addrStr };
    out.name = readFmString(base.add(0xC8));
    out.fullName = readFmString(base.add(0xC0));
    try {
      var financePtr = base.add(0x150).readPointer();
      if (!financePtr.isNull()) {
        var financeVtable = financePtr.readPointer();
        out.hasFullFinance = !!fullFinanceVtable && financeVtable.equals(fullFinanceVtable);
        if (out.hasFullFinance) {
          out.balance = financePtr.add(0x0C).readS32();
          out.transferBudget = financePtr.add(0x7C4).readS32();
          out.wageBudget = financePtr.add(0x808).readS32();
          out.currentWageSpend = financePtr.add(0x814).readS32();
          out.youthGrant = financePtr.add(0x7DC).readS32();
        } else {
          out.note = 'This club uses the minor finance class (most clubs below the top ~885). Balance/budget fields are not reliably mapped for it.';
        }
      }
    } catch (e) { out.financeError = e.toString(); }
    return out;
  },

  setClubFinance: function (addrStr, field, value) {
    var mod = getModule();
    var fullFinanceVtable = resolveRvas().financeVtable;
    var base = ptr(addrStr);
    var financePtr = base.add(0x150).readPointer();
    if (financePtr.isNull()) throw new Error('club has no finance object');
    var financeVtable = financePtr.readPointer();
    if (!fullFinanceVtable || !financeVtable.equals(fullFinanceVtable)) {
      throw new Error('this club uses the minor finance class - balance/budget offsets are not reliable for it (only the top ~885 clubs have the full finance object)');
    }
    var offsets = { balance: 0x0C, transferBudget: 0x7C4, wageBudget: 0x808, youthGrant: 0x7DC };
    if (!(field in offsets)) throw new Error('unknown finance field: ' + field);
    financePtr.add(offsets[field]).writeS32(value);
    var readback = financePtr.add(offsets[field]).readS32();
    return { ok: true, field: field, value: readback };
  },
};
