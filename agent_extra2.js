// =====================================================================
// Round 3 (built offline from verified FM27 memory-layout facts,
// layout in docs/fm27-memory-layout.md). Loaded after agent_extra.js.
//  - player-coaches: person block (every player field >= +0x288) sits 0xF8
//    later; names/UID/DOB/personality/contract are read/written there.
//  - international caps/goals u16 +0x3BC/+0x3BE, U21 caps/goals u8 +0x3C0/+0x3C1
//  - birthplace city +0x308 -> +0x18; appearance bytes +0x315..+0x318
//    (ethnicity 0-10, hair colour 0-18, hair length 0-6, skin tone 0-19;
//    edits not confirmed in a match upstream -> marked experimental)
//  - contract clauses: vector at contract+0x68 (8-byte entries: amount u32
//    +0x00, value u16 +0x04, type u8 +0x06); amount write verified upstream
//  - names: re-point a name slot to an existing shared name record (live
//    verified upstream incl. save/reload); never edits record text
//  - club: social media u32 info+0xF8, supporter mix 6 x u8 info+0x106,
//    nation club+0xE8 -> +0x18
//  - staff: coaching licence u8 +0x23C (HM shifted), role ratings ptr +0x1D0
// =====================================================================

var PC_SHIFT = 0xF8;
var _pc = { R: null, plain: null, vt: {} };
function plainPlayerVt() {
  var r = resolveRvas();
  if (_pc.R !== r) _pc = { R: r, plain: null, vt: {} };
  if (_pc.plain) return _pc.plain;
  var b = playerArrayBounds(), counts = {}, best = null;
  for (var i = 0; i < Math.min(b.count, 4000); i++) {
    var p = b.dataPtr.add(i * 8).readPointer(); if (p.isNull()) continue;
    var k = p.readPointer().toString();
    counts[k] = (counts[k] || 0) + 1;
    if (!best || counts[k] > counts[best]) best = k;
  }
  _pc.plain = best;
  return best;
}
function pcShift(p) {
  try {
    var vt = p.readPointer().toString();
    if (vt === plainPlayerVt()) return 0;
    if (vt in _pc.vt) return _pc.vt[vt];
    var s = (!readNameSub(p.add(0x2E0)) && !readNameSub(p.add(0x2E8)) &&
             (readNameSub(p.add(0x2E0 + PC_SHIFT)) || readNameSub(p.add(0x2E8 + PC_SHIFT)))) ? PC_SHIFT : 0;
    _pc.vt[vt] = s;
    return s;
  } catch (e) { return 0; }
}

// extra player offsets (added to P so the shift logic covers them)
P.intCaps = 0x3BC; P.intGoals = 0x3BE; P.u21Caps = 0x3C0; P.u21Goals = 0x3C1;
P.birthCity = 0x308;
P.ethnicity = 0x315; P.hairColour = 0x316; P.hairLength = 0x317; P.skinTone = 0x318;

function shiftedKeys() { var o = []; for (var k in P) if (P[k] >= 0x288) o.push(k); return o; }
var _inShift = false; // P offsets are already shifted for the current player
function withPlayerShift(addrStr, fn) {
  var s = 0;
  try { s = pcShift(ptr(addrStr)); } catch (e) {}
  if (!s || _inShift) return fn();
  var ks = shiftedKeys();
  ks.forEach(function (k) { P[k] += s; });
  _inShift = true;
  try { return fn(); } finally { _inShift = false; ks.forEach(function (k) { P[k] -= s; }); }
}

var _basePlayerName = playerName;
playerName = function (base) {
  if (_inShift) return _basePlayerName(base);
  var s = pcShift(base);
  if (!s) return _basePlayerName(base);
  var c = readNameSub(base.add(P.nameCommon + s)); if (c) return c;
  return (readNameSub(base.add(P.nameFirst + s)) + ' ' + readNameSub(base.add(P.nameLast + s))).trim();
};

var EXTRA_PLAYER = {
  intCaps: { t: 'u16', min: 0, max: 999 }, intGoals: { t: 'u16', min: 0, max: 999 },
  u21Caps: { t: 'u8', min: 0, max: 255 }, u21Goals: { t: 'u8', min: 0, max: 255 },
  ethnicity: { t: 'u8', min: 0, max: 10 }, hairColour: { t: 'u8', min: 0, max: 18 },
  hairLength: { t: 'u8', min: 0, max: 6 }, skinTone: { t: 'u8', min: 0, max: 19 },
};
var CLAUSE_TYPES = {
  0x20: { label: 'Appearance Fee', unit: '£' }, 0x21: { label: 'Goal Bonus', unit: '£' },
  0x22: { label: 'Clean Sheet Bonus', unit: '£' }, 0x26: { label: 'Unused Substitute Fee', unit: '£' },
  0x27: { label: 'Assist Bonus', unit: '£' }, 0x05: { label: 'Relegation Wage Drop', unit: '%' },
  0x16: { label: 'Club Extension Option', unit: 'thn' },
};
var POUND_CLAUSES = [0x20, 0x21, 0x22, 0x26, 0x27];
function clauseVector(contract) {
  var b = contract.add(0x68).readPointer(), e = contract.add(0x70).readPointer();
  if (b.isNull() || e.isNull()) return null;
  var bytes = e.sub(b).toInt32();
  if (bytes < 0 || bytes > 0x400 || bytes % 8) return null;
  return { b: b, n: bytes / 8 };
}
function readClauses(contract) {
  var v = clauseVector(contract); if (!v) return [];
  var out = [];
  for (var i = 0; i < v.n; i++) {
    var a = v.b.add(i * 8), type = a.add(6).readU8(), meta = CLAUSE_TYPES[type];
    out.push({ idx: i, type: type, label: meta ? meta.label : ('Clause 0x' + type.toString(16)), unit: meta ? meta.unit : '',
      amount: a.readU32(), value: a.add(4).readU16(), editable: POUND_CLAUSES.indexOf(type) !== -1 });
  }
  return out;
}

(function () {
  var origRead = rpc.exports.readPlayer, origSet = rpc.exports.setPlayerAttribute;
  rpc.exports.readPlayer = function (addrStr) {
    return withPlayerShift(addrStr, function () {
      var r = origRead.call(rpc.exports, addrStr), p = ptr(addrStr);
      r.playerCoach = pcShift(p) !== 0;
      r.extra = {};
      for (var k in EXTRA_PLAYER) {
        try { r.extra[k] = EXTRA_PLAYER[k].t === 'u16' ? p.add(P[k]).readU16() : p.add(P[k]).readU8(); } catch (e) {}
      }
      try { var city = p.add(P.birthCity).readPointer(); if (!city.isNull()) r.birthplace = readFmString(city.add(0x18)); } catch (e) {}
      try {
        var c = p.add(P.contractPtr).readPointer();
        if (!c.isNull()) r.clauses = readClauses(c);
      } catch (e) {}
      try {
        r.names = {
          first: readNameSub(p.add(P.nameFirst)), last: readNameSub(p.add(P.nameLast)), common: readNameSub(p.add(P.nameCommon)),
        };
      } catch (e) {}
      return r;
    });
  };
  rpc.exports.setPlayerAttribute = function (addrStr, key, value) {
    return withPlayerShift(addrStr, function () {
      var p = ptr(addrStr);
      if (EXTRA_PLAYER[key]) {
        var m = EXTRA_PLAYER[key], v = Math.max(m.min, Math.min(m.max, Math.round(Number(value))));
        if (isNaN(v)) throw new Error('not a number');
        if (m.t === 'u16') p.add(P[key]).writeU16(v); else p.add(P[key]).writeU8(v);
        return { ok: true, field: key, value: v };
      }
      var cm = /^clause:(\d+):(\d+)$/.exec(key);
      if (cm) {
        var c = p.add(P.contractPtr).readPointer(); if (c.isNull()) throw new Error('no contract');
        var vec = clauseVector(c), idx = +cm[1], type = +cm[2];
        if (!vec || idx >= vec.n) throw new Error('clause not found (contract changed?)');
        var a = vec.b.add(idx * 8);
        if (a.add(6).readU8() !== type) throw new Error('clause changed in game, reload the player');
        if (POUND_CLAUSES.indexOf(type) === -1) throw new Error('only money clauses can be edited');
        var amt = Math.max(0, Math.min(100000000, Math.round(Number(value))));
        a.writeU32(amt);
        return { ok: true, field: key, value: amt };
      }
      return origSet.call(rpc.exports, addrStr, key, value);
    });
  };
  var origSnap = rpc.exports.freezeSnapshot;
  rpc.exports.freezeSnapshot = function (addrStr) { return withPlayerShift(addrStr, function () { return origSnap.call(rpc.exports, addrStr); }); };
})();

// ---- names: shared name records ----
var _names = { R: null, map: null };
function nameIndex() {
  var r = resolveRvas();
  if (_names.R === r && _names.map) return _names.map;
  var map = {}; // recPtr -> {text, uses}
  function add(slotAddr) {
    try {
      var rec = slotAddr.readPointer(); if (rec.isNull()) return;
      var k = rec.toString(), e = map[k];
      if (e) { e.uses++; return; }
      var t = readFmString(rec); if (!t) return;
      map[k] = { text: t, uses: 1 };
    } catch (e) {}
  }
  var b = playerArrayBounds();
  for (var i = 0; i < b.count; i++) {
    var p = b.dataPtr.add(i * 8).readPointer(); if (p.isNull()) continue;
    var s = pcShift(p);
    add(p.add(P.nameFirst + s)); add(p.add(P.nameLast + s)); add(p.add(P.nameCommon + s));
  }
  try {
    eachPtr('staff', function (o) {
      if (isHumanManager(o)) return;
      add(o.add(0x150)); add(o.add(0x158)); add(o.add(0x160));
    });
  } catch (e) {}
  _names.R = r; _names.map = map;
  return map;
}
rpc.exports.searchNames = function (q, limit) {
  q = String(q || '').trim().toLowerCase(); limit = limit || 30;
  if (!q) return [];
  var map = nameIndex(), exact = [], starts = [], has = [];
  for (var k in map) {
    var t = map[k].text, tl = t.toLowerCase();
    var row = { rec: k, text: t, uses: map[k].uses };
    if (tl === q) exact.push(row); else if (tl.indexOf(q) === 0) starts.push(row); else if (tl.indexOf(q) !== -1) has.push(row);
  }
  var byUse = function (a, b) { return b.uses - a.uses; };
  return exact.sort(byUse).concat(starts.sort(byUse), has.sort(byUse)).slice(0, limit);
};
var NAME_SLOT = { first: 'nameFirst', last: 'nameLast', common: 'nameCommon' };
rpc.exports.setPlayerName = function (addrStr, which, recStr) {
  if (!NAME_SLOT[which]) throw new Error('bad name slot');
  var map = nameIndex();
  if (!map[recStr]) throw new Error('name record not found in this save');
  return withPlayerShift(addrStr, function () {
    var slot = ptr(addrStr).add(P[NAME_SLOT[which]]);
    var old = slot.readPointer();
    if (!old.isNull() && !map[old.toString()]) map[old.toString()] = { text: readFmString(old), uses: 1 };
    slot.writePointer(ptr(recStr));
    return { ok: true, which: which, oldRec: old.isNull() ? null : old.toString(), name: playerName(ptr(addrStr)) };
  });
};

// ---- squad detail for Best XI ----
rpc.exports.squadDetail = function (clubAddr) {
  var sq = rpc.exports.clubSquad(clubAddr);
  sq.teams.forEach(function (t) {
    t.players.forEach(function (row) {
      try {
        var p = ptr(row.address);
        row.attrs = {}; ENCODED_FIELDS.forEach(function (k) { row.attrs[k] = decodeAttr(p.add(P[k]).readU8()); });
        row.positions = {}; POSITION_KEYS.forEach(function (k) { row.positions[k] = p.add(P[k]).readU8(); });
        row.name = playerName(p);
      } catch (e) {}
    });
  });
  try {
    var today = todayNumber();
    sq.teams.forEach(function (t) { t.players.forEach(function (row) { try { var st = playerStatus(ptr(row.address), today); row.injured = st.injured; row.banned = st.banned; } catch (e) {} }); });
  } catch (e) {}
  return sq;
};

// ---- club: social media, supporters, nation ----
CLUB_EXTRA.socialMedia = { label: 'Social Media Followers', min: 0, max: 2000000000 };
(function () {
  var origRead = rpc.exports.readClub, origSet = rpc.exports.setClubFinance;
  rpc.exports.readClub = function (addrStr) {
    var r = origRead.call(rpc.exports, addrStr), c = ptr(addrStr);
    try {
      var i = clubInfo(c);
      if (i) {
        r.extra = r.extra || {};
        r.extra.socialMedia = i.add(0xF8).readU32();
        var sup = []; for (var k = 0; k < 6; k++) sup.push(i.add(0x106 + k).readU8());
        var sum = sup.reduce(function (a, b) { return a + b; }, 0);
        if (sum >= 95 && sum <= 105) r.supporters = sup;
      }
      var n = c.add(0xE8).readPointer(); if (!n.isNull()) r.nation = readFmString(n.add(0x18));
    } catch (e) {}
    r.extraMeta = CLUB_EXTRA;
    return r;
  };
  rpc.exports.setClubFinance = function (addrStr, field, value) {
    if (field === 'socialMedia') {
      var i = clubInfo(ptr(addrStr)); if (!i) throw new Error('club has no info record');
      var v = Math.max(0, Math.min(2000000000, Math.round(Number(value))));
      i.add(0xF8).writeU32(v);
      return { ok: true, field: field, value: v };
    }
    return origSet.call(rpc.exports, addrStr, field, value);
  };
})();

// ---- staff: coaching licence + role ratings (read-only) ----
(function () {
  var contractGroup = STAFF_GROUPS.filter(function (g) { return g.title === 'Contract & Personal'; })[0];
  if (contractGroup) contractGroup.fields.push(F('licence', 'Coaching Licence (0 None · 1 Pro · 2 A · 3 B · 4 C · 5-7 National A/B/C)', 'u8', 0x23C, 0, 8, { sh: true }));
  var ROLES = ['Manager', 'Assistant Manager', 'Coach', 'Physio', 'Scout', 'GK Coach', 'Fitness Coach', 'Set Piece Coach',
    'Chairperson (?)', 'Director of Football', 'Head of Youth Dev.', 'Loan Manager', 'Data Analyst', 'Sports Scientist', 'Technical Director'];
  STAFF_GROUPS.push({ title: 'Role Ratings (read-only, from FM)', fields: ROLES.map(function (l, i) { return F('role_' + i, l, 'u8', i, 1, 20, { p: 0x1D0, ro: true }); }) });
})();

// ---- hide platform-account placeholders "(name)" from Human Manager (empty DOB) ----
(function () {
  var origEach = KINDS.manager.each;
  KINDS.manager.each = function (cb) {
    return origEach(function (o) {
      try { if (o.add(0x188 + HM_SHIFT + 2).readU16() <= 1900) return; } catch (e) {}
      return cb(o);
    });
  };
})();

// ---- Youth candidates: ACTUAL_PLAYER objects outside the player list with UID 0xFFFFFFFF.
// Live-checked on Game Pass (17 Jan 2027): 962 such players, born ~2010, no team (+0x130 null),
// candidate club at +0x390 (Colombian/Uruguayan/Spanish clubs whose intake already happened).
// Native backend only (needs a heap scan).
rpc.exports.youthCandidates = function (clubQuery) {
  if (!Process.scanHeapQword) throw new Error('Youth candidates need the native backend');
  var b = playerArrayBounds(), main = {};
  for (var i = 0; i < b.count; i++) { var p0 = b.dataPtr.add(i * 8).readPointer(); if (!p0.isNull()) main[p0.toString()] = 1; }
  var vt = ptr(plainPlayerVt());
  var hits = Process.scanHeapQword(vt, 300000);
  var q = String(clubQuery || '').toLowerCase(), out = [], year = null;
  try { year = rva('date').add(2).readU16(); } catch (e) {}
  hits.forEach(function (p) {
    if (main[p.toString()]) return;
    try {
      if (p.add(P.uid).readU32() !== 0xFFFFFFFF) return;
      var c = p.add(0x390).readPointer(); if (c.isNull()) return;
      if (rttiName(c) !== '.?AVCLUB@db@@') return;
      var club = readFmString(c.add(0xC8)), clubFull = readFmString(c.add(0xC0));
      if (q && (club + ' ' + clubFull).toLowerCase().indexOf(q) === -1) return;
      var nm = playerName(p); if (!nm) return;
      var by = p.add(P.dob).add(2).readU16();
      out.push({ address: p.toString(), name: nm, club: club, clubAddress: c.toString(), ca: p.add(P.ca).readU16(), pa: p.add(P.pa).readU16(),
        age: year ? year - by : null, nation: playerNation(p), pos: playerPosText(p), height: p.add(P.height).readU16() });
    } catch (e) {}
  });
  out.sort(function (x, y) { return x.club < y.club ? -1 : x.club > y.club ? 1 : y.pa - x.pa; });
  return out;
};

// ---- "My club": the club(s) the human manager(s) work for.
// manager (human-manager class, identity shifted +0x340) -> contract ptr +0x1A8+0x340 -> +0x10 team -> +0x30 club
rpc.exports.myClubs = function () {
  var out = [], seen = {};
  KINDS.manager.each(function (o) {
    try {
      var c = o.add(0x1A8 + HM_SHIFT).readPointer(); if (c.isNull()) return;
      var team = c.add(0x10).readPointer(); if (team.isNull()) return;
      var club = team.add(0x30).readPointer(); if (club.isNull()) return;
      if (rttiName(club) !== '.?AVCLUB@db@@') return;
      var k = club.toString(); if (seen[k]) return; seen[k] = 1;
      out.push({ address: k, name: readFmString(club.add(0xC8)), fullName: readFmString(club.add(0xC0)), manager: staffName(o) });
    } catch (e) {}
  });
  return out;
};
